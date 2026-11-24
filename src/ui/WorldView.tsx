import { DragonInspection } from './DragonInspection';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DIET_IDS, type DietId } from '../data/care';
import { getSpecies } from '../data/dragons';
import { getBiology } from '../data/g0Biology';
import { systemClock } from '../engine/core/clock';
import type { CommandError } from '../engine/core/errors';
import { growthStage } from '../engine/economy/rates';
import { useTranslation } from '../i18n';
import type { GameSession } from '../platform/gameSession';
import { browserImageLoader, createAssetAdapter } from '../rendering/assetAdapter';
import { defaultRenderManifest } from '../rendering/assetContract';
import { CanvasRenderer, type RenderView } from '../rendering/canvasRenderer';
import { LivingWorld } from '../rendering/livingWorld';
import type { DragonInstance } from '../types/game';
import type { GameState } from '../types/state';

/**
 * Cảnh 2.5D Khu Khởi Nguyên + bảng thông tin rồng (G1 PR4).
 * React không render theo frame: chỉ đổi khi snapshot phiên đổi (~1 Hz) hoặc người chơi thao tác.
 * Renderer đọc cài đặt qua ref, nên vòng lặp không phụ thuộc vào chu kỳ render của React.
 */

function isNight(state: GameState | null): boolean {
  const mode = state?.settings.timeMode ?? 'auto';
  if (mode === 'night') return true;
  if (mode !== 'auto') return false;
  const h = new Date(systemClock.nowMs()).getHours();
  return h >= 20 || h < 6;
}

export function WorldView({ session }: { session: GameSession }) {
  const { t } = useTranslation();
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [diet, setDiet] = useState<DietId>('fruit');
  const [error, setError] = useState<CommandError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [assetInfo, setAssetInfo] = useState<{ loading: boolean; failed: number }>({ loading: true, failed: 0 });
  const worldRef = useRef<LivingWorld | null>(null);

  // Giá trị renderer cần đọc mỗi frame, cập nhật qua ref (không gây render React).
  const viewRef = useRef<RenderView | null>(null);
  const actRef = useRef({ diet, canAct: false });
  const state = snap.state;
  const origin = state?.zones.find((z) => z.id === 'origin');
  const unlocked = origin?.unlockedHabitatIds;
  const fpsLimit = state?.settings.fpsLimit ?? 60;
  const reducedSetting = state?.settings.reducedMotion ?? false;
  const ready = snap.status === 'ready';
  useLayoutEffect(() => {
    viewRef.current = {
      unlockedHabitats: unlocked ?? [],
      fpsLimit,
      reducedMotionSetting: reducedSetting,
      selectedUid: selected,
      habitatLabel: (h) => t(`habitat.${h}`),
      lockedLabel: t('world.locked'),
      placeholderNote: t('world.placeholderNote'),
    };
    actRef.current = { diet, canAct: ready };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = new LivingWorld({
      seed: 'origin-view',
      isNight: () => isNight(session.getSnapshot().state),
      consume: (foodId, dragonUid) => (session.send({ type: 'consumeFood', foodId, dragonUid }) ? 'rejected' : 'ok'),
    });
    worldRef.current = world;
    const assets = createAssetAdapter(defaultRenderManifest(), browserImageLoader);
    let alive = true;
    // Đồng bộ ngoài khung đang chạy (microtask) để lệnh gửi từ trong mô phỏng không gây đồng bộ lồng nhau.
    let queued = false;
    const syncSoon = () => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        const s = session.getSnapshot().state;
        if (alive && s) world.sync(s);
      });
    };
    const unsubscribe = session.subscribe(syncSoon);
    syncSoon();
    const renderer = new CanvasRenderer({
      canvas,
      world,
      assets,
      clock: systemClock,
      getView: () => viewRef.current as RenderView,
      onSelect: (uid) => setSelected(uid),
      onGroundTap: (habitatId, pos) => {
        if (!actRef.current.canAct) return;
        world.noteDrop(habitatId, pos);
        const err = session.send({ type: 'feed', dietId: actRef.current.diet, zoneId: 'origin', habitatId });
        if (err) world.cancelDrop(habitatId);
        setError(err);
        setNotice(null);
      },
    });
    void assets.preload().then(() => {
      if (!alive) return;
      setAssetInfo({ loading: false, failed: assets.failed.length });
      renderer.draw();
    });
    renderer.start();
    // Số đo hiệu năng chỉ đọc (dùng để đo FPS trên bản build thật). Vị trí rồng chỉ lộ ở bản dev cho test e2e.
    const probe = canvas as HTMLCanvasElement & { dravioStats?: () => unknown; dravioAgents?: () => unknown };
    probe.dravioStats = () => renderer.stats();
    if (import.meta.env.DEV) {
      probe.dravioAgents = () => [...world.agents.values()].map((a) => ({ uid: a.uid, state: a.state, z: a.z, stage: a.stage, mutation: a.mutation, box: renderer.bounds(a) }));
    }
    return () => {
      alive = false;
      unsubscribe();
      renderer.dispose();
      assets.dispose();
      worldRef.current = null;
      delete probe.dravioStats;
      delete probe.dravioAgents;
    };
  }, [session]);

  const placed = useMemo(
    () => (state ? state.dragons.filter((d) => d.location.kind === 'zone' && d.location.zoneId === 'origin') : []),
    [state],
  );
  const dragon = placed.find((d) => d.uid === selected) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === 'Escape' && tag !== 'INPUT') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Canvas luôn được gắn (kể cả khi save đang mở) để renderer tạo một lần cho mỗi lần mount.
  const canAct = snap.status === 'ready' && state !== null;
  const nameOf = (uid: string) => {
    const d = placed.find((x) => x.uid === uid);
    return d ? (d.nickname ?? t(`species.${d.speciesId}`)) : uid;
  };

  const pet = (d: DragonInstance) => {
    const err = session.send({ type: 'pet', dragonUid: d.uid });
    setError(err);
    if (!err) {
      worldRef.current?.petReact(d.uid);
      setNotice(t('world.petted'));
    } else setNotice(null);
  };
  const viewProfile = (d: DragonInstance) => {
    setError(session.send({ type: 'viewBiologyProfile', speciesId: d.speciesId }));
  };
  const rename = (d: DragonInstance, nickname: string | null) => {
    setError(session.send({ type: 'renameDragon', dragonUid: d.uid, nickname }));
    setNotice(null);
  };

  return (
    <section aria-labelledby="world-heading">
      <h2 id="world-heading">{t('world.heading')}</h2>
      <p className="muted">{t('world.hint')}</p>
      <div className="world-frame">
        <canvas ref={canvasRef} className="world-canvas" role="img" aria-label={t('world.canvasLabel')} data-testid="world-canvas" />
      </div>
      {assetInfo.loading && <p className="muted">{t('world.loading')}</p>}
      {assetInfo.failed > 0 && <p className="notice">{t('world.assetMissing', { n: assetInfo.failed })}</p>}
      <fieldset className="row compact diet-picker">
        <legend>{t('world.food')}</legend>
        {DIET_IDS.map((d) => (
          <label key={d} className="inline">
            <input type="radio" name="diet" value={d} checked={diet === d} onChange={() => setDiet(d)} /> {t(`diet.${d}`)}
          </label>
        ))}
      </fieldset>
      {error && (
        <p className="notice" role="alert">
          {t(error.messageKey)}
        </p>
      )}
      {notice && !error && <p role="status">{notice}</p>}
      <h3>{t('world.dragons')}</h3>
      {placed.length === 0 ? (
        <p className="muted">{t('world.noDragons')}</p>
      ) : (
        <div className="row compact">
          {placed.map((d) => (
            <button key={d.uid} type="button" aria-pressed={selected === d.uid} onClick={() => setSelected(selected === d.uid ? null : d.uid)}>
              {nameOf(d.uid)}
            </button>
          ))}
        </div>
      )}
      {dragon && (
        <Inspector key={dragon.uid} dragon={dragon} name={nameOf(dragon.uid)} canAct={canAct} onPet={() => pet(dragon)} onRename={(n) => rename(dragon, n)} onProfile={() => viewProfile(dragon)} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}

function Inspector(props: {
  dragon: DragonInstance;
  name: string;
  canAct: boolean;
  onPet: () => void;
  onRename: (n: string | null) => void;
  onProfile: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { dragon, canAct } = props;
  const [nameDraft, setNameDraft] = useState(dragon.nickname ?? '');
  const [profileOpen, setProfileOpen] = useState(false);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  return (
    <div className="inspector" aria-live="polite">
      <h3>
        {t('world.selected')}: {props.name}
      </h3>
      <p className="muted">
        {t('world.info', {
          species: t(`species.${dragon.speciesId}`),
          stage: t(`stage.${growthStage(dragon.xpSec, getSpecies(dragon.speciesId))}`),
          mutation: t(`mutation.${dragon.mutation}`),
          habitat: dragon.location.kind === 'zone' && dragon.location.habitatId ? t(`habitat.${dragon.location.habitatId}`) : '',
        })}
      </p>
      <p className="muted">
        {t('world.bond', { n: dragon.bond })} · {t('world.eats', { diets: getSpecies(dragon.speciesId).anatomy.dietIds.map((x) => t(`diet.${x}`)).join(', ') })}
      </p>
      <div className="row compact">
        <button type="button" disabled={!canAct} onClick={props.onPet}>
          {t('world.pet')}
        </button>
        <button
          type="button"
          aria-expanded={profileOpen}
          disabled={!canAct && !profileOpen}
          onClick={() => {
            if (!profileOpen) props.onProfile();
            setProfileOpen(!profileOpen);
          }}
        >
          {profileOpen ? t('profile.close') : t('profile.open')}
        </button>
        <button type="button" onClick={props.onClose}>
          {t('world.deselect')}
        </button>
      </div>
      {profileOpen && <BiologyProfile speciesId={dragon.speciesId} />}
      {dragon.speciesId === 'emberling' && (
        <>
          <button type="button" aria-expanded={inspectionOpen} onClick={() => setInspectionOpen((v) => !v)}>
            {t(inspectionOpen ? 'inspect3d.close' : 'inspect3d.open')}
          </button>
          {inspectionOpen && <DragonInspection />}
        </>
      )}
      <form
        className="row compact"
        onSubmit={(e) => {
          e.preventDefault();
          props.onRename(nameDraft);
        }}
      >
        <label>
          {t('world.rename')}
          <input value={nameDraft} maxLength={64} onChange={(e) => setNameDraft(e.target.value)} disabled={!canAct} />
        </label>
        <button type="submit" disabled={!canAct}>
          {t('world.renameSave')}
        </button>
        {dragon.nickname !== undefined && (
          <button
            type="button"
            disabled={!canAct}
            onClick={() => {
              setNameDraft('');
              props.onRename(null);
            }}
          >
            {t('world.renameClear')}
          </button>
        )}
      </form>
    </div>
  );
}

/** Hồ sơ sinh học đọc từ dữ liệu canonical G0 (`g0Biology.ts`), không tự suy diễn. */
function BiologyProfile({ speciesId }: { speciesId: string }) {
  const { t } = useTranslation();
  const b = getBiology(speciesId);
  return (
    <div className="profile" role="region" aria-label={t('profile.heading', { species: t(`species.${speciesId}`) })}>
      <h4>{t('profile.heading', { species: t(`species.${speciesId}`) })}</h4>
      <p>{t('profile.thermal', { bands: b.thermalBands.map((x) => t(`thermal.${x}`)).join(', ') })}</p>
      <p>{t('profile.habitats', { habitats: b.habitatRules.map((h) => t(`habitat.${h}`)).join(', ') })}</p>
      <p>{t('profile.diet', { diets: b.dietIds.map((x) => t(`diet.${x}` as `diet.${DietId}`)).join(', ') })}</p>
      <p className="muted">
        {t('profile.body', {
          respiration: t(`respiration.${b.respiration}`),
          locomotion: b.locomotion.map((x) => t(`locomotion.${x}`)).join(', '),
          activity: t(`activity.${b.activity}`),
        })}
      </p>
    </div>
  );
}
