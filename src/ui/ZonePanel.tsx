import { useState, useSyncExternalStore } from 'react';
import { getSpecies } from '../data/dragons';
import type { CommandError } from '../engine/core/errors';
import { growthStage } from '../engine/economy/rates';
import { speciesSuitability, suitabilityTier } from '../engine/world/habitat';
import { currentProductionBudget, habitatsOfZone, placementOptions, zoneOccupancy } from '../engine/world/zones';
import { useTranslation } from '../i18n';
import type { GameSession } from '../platform/gameSession';
import type { DragonInstance } from '../types/game';

/** Danh sách zone Khởi Nguyên tối thiểu cho G1 PR3 (renderer 2.5D ở PR4). Mọi thay đổi đi qua lệnh. */
export function ZonePanel({ session }: { session: GameSession }) {
  const { t } = useTranslation();
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [error, setError] = useState<CommandError | null>(null);
  const state = snap.state;
  if (!state) return null;
  const origin = state.zones.find((z) => z.id === 'origin');
  if (!origin) return null;
  const canAct = snap.status === 'ready';
  const send = (cmd: Parameters<GameSession['send']>[0]) => setError(session.send(cmd));
  const alive = state.dragons.filter((d) => d.location.kind !== 'released');
  const at = (habitatId: string) => alive.filter((d) => d.location.kind === 'zone' && d.location.habitatId === habitatId);
  const stored = alive.filter((d) => d.location.kind === 'storage');

  const row = (d: DragonInstance) => {
    const producing = state.productionDragonIds.includes(d.uid);
    const name = d.nickname ?? t(`species.${d.speciesId}`);
    const stage = t(`stage.${growthStage(d.xpSec, getSpecies(d.speciesId))}`);
    const here = d.location.kind === 'zone' && d.location.habitatId !== undefined ? speciesSuitability(d.speciesId, d.location.habitatId as Parameters<typeof speciesSuitability>[1]) : null;
    const targets = placementOptions(state, d).filter((o) => o.blocked === null);
    return (
      <li key={d.uid}>
        <strong>{name}</strong> ({stage})
        {here && (
          <span className={`tier tier-${suitabilityTier(here)}`}>
            {' '}
            · {t('zone.suitability', { score: here.score })} · {t(`zone.tier.${suitabilityTier(here)}`)}
          </span>
        )}{' '}
        · {producing ? t('zone.producing') : t('zone.notProducing')}
        <div className="row compact">
          {d.location.kind === 'zone' && (
            <button type="button" disabled={!canAct} onClick={() => send({ type: 'setProductionSlot', dragonUid: d.uid, enabled: !producing })}>
              {producing ? t('zone.produceOff') : t('zone.produceOn')}
            </button>
          )}
          <label>
            {t('zone.moveTo')}{' '}
            <select
              disabled={!canAct}
              value=""
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'storage') send({ type: 'moveDragon', dragonUid: d.uid, target: { kind: 'storage' } });
                else if (v) send({ type: 'moveDragon', dragonUid: d.uid, target: { kind: 'zone', zoneId: 'origin', habitatId: v } });
              }}
            >
              <option value="">—</option>
              {targets.map((o) => (
                <option key={o.habitatId} value={o.habitatId}>
                  {t(`habitat.${o.habitatId}`)} ({t(`zone.tier.${o.tier}`)})
                </option>
              ))}
              {d.location.kind !== 'storage' && <option value="storage">{t('zone.storage')}</option>}
            </select>
          </label>
        </div>
      </li>
    );
  };

  return (
    <section aria-labelledby="zone-heading">
      <h2 id="zone-heading">{t('zone.heading')}</h2>
      <p className="muted">
        {t('zone.occupancy', { n: zoneOccupancy(state, 'origin'), cap: origin.capacity })} ·{' '}
        {t('zone.budget', { n: state.productionDragonIds.length, cap: currentProductionBudget(state) })}
      </p>
      {error && (
        <p className="notice" role="alert">
          {t(error.messageKey)}
        </p>
      )}
      <div className="habitats">
        {habitatsOfZone('origin').map((h) => {
          const open = origin.unlockedHabitatIds.includes(h);
          const list = at(h);
          return (
            <div key={h} className={open ? 'habitat' : 'habitat locked'}>
              <h3>{t(`habitat.${h}`)}</h3>
              {!open ? <p className="muted">{t('zone.locked')} · {t('zone.lockedHint')}</p> : list.length === 0 ? <p className="muted">{t('zone.empty')}</p> : <ul>{list.map(row)}</ul>}
            </div>
          );
        })}
        <div className="habitat">
          <h3>{t('zone.storage')}</h3>
          <p className="muted">{t('zone.storageHint')}</p>
          {stored.length === 0 ? <p className="muted">{t('zone.empty')}</p> : <ul>{stored.map(row)}</ul>}
        </div>
      </div>
    </section>
  );
}
