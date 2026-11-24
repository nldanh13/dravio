import { useState, useSyncExternalStore } from 'react';
import { ACHIEVEMENT_REWARD_G, type AchievementId } from '../data/achievements';
import { MICRO_PER_G } from '../data/economy';
import { TUTORIAL_PACK, TUTORIAL_STEP_IDS } from '../data/tutorial';
import type { CommandError } from '../engine/core/errors';
import { getPack } from '../engine/economy/packs';
import { packPlacementOptions } from '../engine/inventory/packs';
import { implementedAchievements } from '../engine/progression/achievements';
import { currentStep } from '../engine/progression/tutorial';
import { useTranslation } from '../i18n';
import type { GameSession } from '../platform/gameSession';

/**
 * Bảng hướng dẫn TUT_01–TUT_08, gói Starter hướng dẫn và thành tựu (ADR 0013).
 * UI chỉ hiển thị và gửi lệnh; bước nào xong do engine tự đánh giá từ GameState.
 */
export function TutorialPanel({ session }: { session: GameSession }) {
  const { t, n } = useTranslation();
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [error, setError] = useState<CommandError | null>(null);
  const [target, setTarget] = useState('');
  const state = snap.state;
  if (!state) return null;
  const canAct = snap.status === 'ready';
  const send = (cmd: Parameters<GameSession['send']>[0]) => setError(session.send(cmd));
  const tut = state.tutorial;
  const step = currentStep(tut);
  const price = getPack(TUTORIAL_PACK.packId).priceG;
  const pending = state.pendingPack;
  const options = packPlacementOptions(state).filter((o) => o.blocked === null);
  const chosen = options.some((o) => o.habitatId === target) || target === 'storage' ? target : (options[0]?.habitatId ?? 'storage');

  return (
    <section aria-labelledby="tutorial-heading" className="tutorial">
      <h2 id="tutorial-heading">{t('tutorial.heading')}</h2>
      {error && (
        <p className="notice" role="alert">
          {t(error.messageKey)}
        </p>
      )}
      {tut.status === 'active' && step && (
        <div className="tutorial-current" aria-live="polite">
          <p>
            <strong>
              {t('tutorial.progress', { n: tut.completed.length + 1, total: TUTORIAL_STEP_IDS.length })}: {t(`tutorial.step.${step}`)}
            </strong>
          </p>
          <p className="muted">{t(`tutorial.hint.${step}`)}</p>
        </div>
      )}
      {tut.status === 'skipped' && <p className="muted">{t('tutorial.skipped')}</p>}
      {tut.status === 'completed' && <p>{t('tutorial.completed')}</p>}
      {tut.status !== 'skipped' && (
        <ol className="tutorial-steps">
          {TUTORIAL_STEP_IDS.map((id) => {
            const done = tut.completed.includes(id);
            return (
              <li key={id} className={done ? 'done' : id === step ? 'current' : undefined} data-step={id} data-done={done}>
                {done ? '✓ ' : ''}
                {t(`tutorial.step.${id}`)}
              </li>
            );
          })}
        </ol>
      )}
      <div className="row compact">
        {tut.status === 'active' ? (
          <button type="button" disabled={!canAct} onClick={() => send({ type: 'setTutorialStatus', status: 'skipped' })}>
            {t('tutorial.skip')}
          </button>
        ) : (
          <button type="button" disabled={!canAct} onClick={() => send({ type: 'setTutorialStatus', status: 'active' })}>
            {t('tutorial.resume')}
          </button>
        )}
      </div>

      <h3>{t('tutorial.pack.heading')}</h3>
      {pending ? (
        <div className="row compact">
          <label>
            {t('tutorial.pack.pending', { species: t(`species.${pending.speciesId}`) })}{' '}
            <select value={chosen} disabled={!canAct} onChange={(e) => setTarget(e.target.value)}>
              {options.map((o) => (
                <option key={o.habitatId} value={o.habitatId}>
                  {t(`habitat.${o.habitatId}`)} ({t(`zone.tier.${o.tier}`)})
                </option>
              ))}
              <option value="storage">{t('tutorial.pack.toStorage')}</option>
            </select>
          </label>
          <button
            type="button"
            disabled={!canAct}
            onClick={() =>
              send({ type: 'claimPack', target: chosen === 'storage' ? { kind: 'storage' } : { kind: 'zone', zoneId: 'origin', habitatId: chosen } })
            }
          >
            {t('tutorial.pack.claim')}
          </button>
        </div>
      ) : tut.starterPackUsed ? (
        <p className="muted">{t('tutorial.pack.used')}</p>
      ) : (
        <>
          <p className="muted">{t('tutorial.pack.desc', { price: n(price) })}</p>
          <button type="button" disabled={!canAct || state.goldMicro < price * MICRO_PER_G} onClick={() => send({ type: 'buyTutorialPack' })}>
            {t('tutorial.pack.buy', { price: n(price) })}
          </button>
        </>
      )}

      <h3>{t('tutorial.achievements')}</h3>
      <ul className="achievements">
        {implementedAchievements().map((id: AchievementId) => {
          const got = state.unlockedAchievements.includes(id);
          return (
            <li key={id} data-achievement={id} data-unlocked={got} className={got ? 'done' : 'muted'}>
              {got ? '✓ ' : ''}
              {t(`achievement.${id}` as `achievement.${'ACH_FIRST_HATCH' | 'ACH_FIRST_ADULT'}`)} · {t('tutorial.achievementReward', { g: n(ACHIEVEMENT_REWARD_G[id]) })}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
