import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ORIGIN_HABITAT_IDS, type OriginHabitatId } from '../assets/habitats/origin/manifest';
import { FOOD_ICONS } from '../assets/icons/food/manifest';
import { DIET_IDS, type DietId } from '../data/care';
import { getSpecies } from '../data/dragons';
import { HABITAT_UNLOCK_RULES } from '../data/habitatUnlocks';
import { systemClock } from '../engine/core/clock';
import type { CommandError } from '../engine/core/errors';
import { growthStage } from '../engine/economy/rates';
import { useTranslation } from '../i18n';
import type { GameSession } from '../platform/gameSession';
import { browserImageLoader, createImageCache } from '../rendering/assetAdapter';
import { CanvasRenderer, type RenderView } from '../rendering/canvasRenderer';
import { LivingWorld } from '../rendering/livingWorld';
import type { DragonInstance } from '../types/game';
import type { GameSettings } from '../types/state';
import { shouldFeedOnSpace, timeOfDayFor } from './sceneInput';
import { FOCUS_ZOOM, ZOOM_MAX, ZOOM_MIN, type CameraMode } from '../rendering/camera';

/**
 * Cảnh Khu Khởi Nguyên + bảng thông tin rồng (G1 PR4; tích hợp asset ADR 0012).
 * Hiển thị từng microhabitat (Tây → Đông: bờ hồ · đồng cỏ · đá ấm) với điều hướng, không cuộn ngang.
 * React không render theo frame: chỉ đổi khi snapshot phiên đổi (~1 Hz) hoặc người chơi thao tác.
 * Renderer đọc cài đặt qua ref, nên vòng lặp không phụ thuộc vào chu kỳ render của React.
 */

const TIME_MODES: readonly GameSettings['timeMode'][] = ['auto', 'day', 'sunset', 'night'];

export function WorldView({ session }: { session: GameSession }) {
  const { t } = useTranslation();
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [diet, setDiet] = useState<DietId>('fruit');
  const [habitat, setHabitat] = useState<OriginHabitatId>('origin_meadow');
  const [error, setError] = useState<CommandError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hour, setHour] = useState(() => new Date(systemClock.nowMs()).getHours());
  const worldRef = useRef<LivingWorld | null>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const [cam, setCam] = useState<{ mode: CameraMode; zoom: number }>({ mode: 'overview', zoom: 1 });

  const viewRef = useRef<RenderView | null>(null);
  const actRef = useRef({ diet, canAct: false, habitat });
  const state = snap.state;
  const origin = state?.zones.find((z) => z.id === 'origin');
  const unlocked = origin?.unlockedHabitatIds;
  const fpsLimit = state?.settings.fpsLimit ?? 60;
  const reducedSetting = state?.settings.reducedMotion ?? false;
  const timeMode = state?.settings.timeMode ?? 'auto';
  const ready = snap.status === 'ready';
  const timeOfDay = timeOfDayFor(timeMode, hour);

  // Giờ địa phương cho chế độ auto (đổi theo phút, không theo frame).
  useEffect(() => {
    const id = window.setInterval(() => setHour(new Date(systemClock.nowMs()).getHours()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useLayoutEffect(() => {
    viewRef.current = {
      unlockedHabitats: unlocked ?? [],
      fpsLimit,
      reducedMotionSetting: reducedSetting,
      selectedUid: selected,
      habitatId: habitat,
      timeOfDay,
      lockedLabel: t('world.locked'),
      lockedHint: (h) => {
        const rule = HABITAT_UNLOCK_RULES[h as OriginHabitatId];
        return rule?.requires ? t(`zone.requires.${rule.requires}`) : null;
      },
    };
    actRef.current = { diet, canAct: ready, habitat };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = new LivingWorld({
      seed: 'origin-view',
      isNight: () => {
        const s = session.getSnapshot().state;
        return timeOfDayFor(s?.settings.timeMode ?? 'auto', new Date(systemClock.nowMs()).getHours()) === 'night';
      },
      consume: (foodId, dragonUid) => (session.send({ type: 'consumeFood', foodId, dragonUid }) ? 'rejected' : 'ok'),
    });
    worldRef.current = world;
    const images = createImageCache(browserImageLoader, { idleMs: 30_000 });
    let alive = true;
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
      images,
      clock: systemClock,
      getView: () => viewRef.current as RenderView,
      onSelect: (uid) => setSelected(uid),
      onCamera: (c) => setCam(c),
      onGroundTap: (habitatId, pos) => {
        if (!actRef.current.canAct) return;
        world.noteDrop(habitatId, pos);
        const err = session.send({ type: 'feed', dietId: actRef.current.diet, zoneId: 'origin', habitatId });
        if (err) world.cancelDrop(habitatId);
        setError(err);
        setNotice(null);
      },
    });
    rendererRef.current = renderer;
    renderer.start();
    // Số đo hiệu năng chỉ đọc (dùng để đo FPS/bộ nhớ trên bản build thật). Vị trí rồng chỉ lộ ở bản dev cho test e2e.
    const probe = canvas as HTMLCanvasElement & { dravioStats?: () => unknown; dravioAgents?: () => unknown };
    probe.dravioStats = () => renderer.stats();
    if (import.meta.env.DEV) {
      probe.dravioAgents = () =>
        [...world.agents.values()].map((a) => ({ uid: a.uid, habitatId: a.habitatId, state: a.state, anim: a.anim.state, pos: a.pos, z: a.z, stage: a.stage, mutation: a.mutation, box: renderer.bounds(a) }));
      (probe as typeof probe & { dravioFood?: () => unknown; dravioCamera?: () => unknown }).dravioFood = () => [...world.food.values()].map((f) => ({ id: f.id, habitatId: f.habitatId, pos: f.pos }));
      (probe as typeof probe & { dravioCamera?: () => unknown }).dravioCamera = () => renderer.camera;
    }
    return () => {
      alive = false;
      unsubscribe();
      renderer.dispose();
      images.dispose();
      worldRef.current = null;
      rendererRef.current = null;
      delete probe.dravioStats;
      delete probe.dravioAgents;
    };
  }, [session]);

  const placed = useMemo(
    () => (state ? state.dragons.filter((d) => d.location.kind === 'zone' && d.location.zoneId === 'origin') : []),
    [state],
  );
  const dragon = placed.find((d) => d.uid === selected) ?? null;

  const dropFood = () => {
    const { canAct, habitat: h, diet: d } = actRef.current;
    if (!canAct) return;
    // Ưu tiên chỗ gần rồng phù hợp (ăn được nhóm này, hết cooldown); không có thì engine thả ngẫu nhiên.
    const world = worldRef.current;
    const pos = world?.suggestDrop(h, d, systemClock.nowMs()) ?? null;
    if (world && pos) world.noteDrop(h, pos);
    const err = session.send({ type: 'feed', dietId: d, zoneId: 'origin', habitatId: h });
    if (err && world && pos) world.cancelDrop(h);
    setError(err);
    setNotice(null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (e.key === 'Escape' && tag !== 'INPUT') setSelected(null);
      const feed = shouldFeedOnSpace({
        key: e.key,
        repeat: e.repeat,
        targetTag: tag,
        targetEditable: !!el?.isContentEditable,
        inScene: !!(el && sceneRef.current?.contains(el)),
        status: session.getSnapshot().status,
        modifier: e.ctrlKey || e.metaKey || e.altKey,
      });
      if (feed) {
        e.preventDefault();
        dropFood();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

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
  const rename = (d: DragonInstance, nickname: string | null) => {
    setError(session.send({ type: 'renameDragon', dragonUid: d.uid, nickname }));
    setNotice(null);
  };
  const idx = ORIGIN_HABITAT_IDS.indexOf(habitat);
  const countAt = (h: OriginHabitatId) => placed.filter((d) => d.location.kind === 'zone' && d.location.habitatId === h).length;
  const selectedHere = dragon && dragon.location.kind === 'zone' && dragon.location.habitatId === habitat;
  const go = (i: number) => {
    const next = ORIGIN_HABITAT_IDS[Math.max(0, Math.min(ORIGIN_HABITAT_IDS.length - 1, i))];
    if (next) setHabitat(next);
  };
  const selectDragon = (d: DragonInstance) => {
    const next = selected === d.uid ? null : d.uid;
    setSelected(next);
    // Chọn rồng ở sinh cảnh khác: camera chuyển tới đó.
    if (next && d.location.kind === 'zone' && d.location.habitatId && (ORIGIN_HABITAT_IDS as readonly string[]).includes(d.location.habitatId)) {
      setHabitat(d.location.habitatId as OriginHabitatId);
    }
  };

  return (
    <section aria-labelledby="world-heading">
      <h2 id="world-heading">{t('world.heading')}</h2>
      <p className="muted">{t('world.hint')}</p>
      <nav className="habitat-nav" aria-label={t('world.nav')}>
        <button type="button" onClick={() => go(idx - 1)} disabled={idx <= 0} aria-label={t('world.prev')}>
          ◀
        </button>
        {ORIGIN_HABITAT_IDS.map((h) => (
          <button key={h} type="button" aria-pressed={habitat === h} onClick={() => setHabitat(h)}>
            {t(`habitat.${h}`)} {unlocked?.includes(h) ? t('world.dragonCount', { n: countAt(h) }) : t('world.lockedTag')}
          </button>
        ))}
        <button type="button" onClick={() => go(idx + 1)} disabled={idx >= ORIGIN_HABITAT_IDS.length - 1} aria-label={t('world.next')}>
          ▶
        </button>
      </nav>
      <div className="row compact camera-controls" role="group" aria-label={t('world.camera')}>
        <button type="button" aria-pressed={cam.mode === 'overview'} onClick={() => rendererRef.current?.overview()}>
          {t('world.overview')}
        </button>
        <button type="button" aria-pressed={cam.mode === 'focus'} disabled={!selectedHere} onClick={() => selected && rendererRef.current?.focus(selected)}>
          {t('world.focus', { x: FOCUS_ZOOM })}
        </button>
        <button type="button" aria-label={t('world.zoomOut')} disabled={cam.zoom <= ZOOM_MIN + 1e-6} onClick={() => rendererRef.current?.zoomAt(null, cam.zoom - 0.5)}>
          −
        </button>
        <span className="muted" aria-live="polite">
          {t('world.zoomLevel', { x: cam.zoom.toFixed(1) })}
        </span>
        <button type="button" aria-label={t('world.zoomIn')} disabled={cam.zoom >= ZOOM_MAX - 1e-6} onClick={() => rendererRef.current?.zoomAt(null, cam.zoom + 0.5)}>
          +
        </button>
      </div>
      <div className="world-frame" ref={sceneRef}>
        <canvas
          ref={canvasRef}
          className="world-canvas"
          role="img"
          tabIndex={0}
          aria-label={t('world.canvasLabel', { habitat: t(`habitat.${habitat}`) })}
          data-testid="world-canvas"
          data-habitat={habitat}
        />
      </div>
      <div className="row compact world-controls">
        <fieldset className="row compact diet-picker">
          <legend>{t('world.food')}</legend>
          {DIET_IDS.map((d) => (
            <label key={d} className="inline diet-option">
              <input type="radio" name="diet" value={d} checked={diet === d} onChange={() => setDiet(d)} />
              <img src={FOOD_ICONS[d].url} alt="" width={24} height={24} />
              {t(`diet.${d}`)}
            </label>
          ))}
        </fieldset>
        <label>
          {t('world.timeMode')}{' '}
          <select
            value={timeMode}
            disabled={!canAct}
            onChange={(e) => setError(session.send({ type: 'updateSettings', patch: { timeMode: e.target.value as GameSettings['timeMode'] } }))}
          >
            {TIME_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`timeMode.${m}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
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
            <button key={d.uid} type="button" aria-pressed={selected === d.uid} onClick={() => selectDragon(d)}>
              {nameOf(d.uid)}
            </button>
          ))}
        </div>
      )}
      {dragon && (
        <Inspector key={dragon.uid} dragon={dragon} name={nameOf(dragon.uid)} canAct={canAct} onPet={() => pet(dragon)} onRename={(n) => rename(dragon, n)} onClose={() => setSelected(null)} />
      )}
    </section>
  );
}

function Inspector(props: { dragon: DragonInstance; name: string; canAct: boolean; onPet: () => void; onRename: (n: string | null) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const { dragon, canAct } = props;
  const [nameDraft, setNameDraft] = useState(dragon.nickname ?? '');
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
        <button type="button" onClick={props.onClose}>
          {t('world.deselect')}
        </button>
      </div>
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
