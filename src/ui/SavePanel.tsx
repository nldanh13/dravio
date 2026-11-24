import { useRef, useSyncExternalStore } from 'react';
import { getSpecies } from '../data/dragons';
import { MICRO_PER_G } from '../data/economy';
import { growthStage } from '../engine/economy/rates';
import { useTranslation } from '../i18n';
import type { GameSession } from '../platform/gameSession';
import { SCHEMA_VERSION } from '../types/state';

/** Bảng save tối thiểu của G1 PR2: trạng thái, autosave, export/import có xác nhận. */
export function SavePanel({ session }: { session: GameSession }) {
  const { t, n, lang } = useTranslation();
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const fileRef = useRef<HTMLInputElement>(null);
  const time = (ms: number) => new Date(ms).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US');
  const gold = (micro: number) => n(Math.floor(micro / 10_000) / 100);
  const state = snap.state;

  const doExport = async () => {
    const text = await session.exportText();
    if (text === null || !state) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `dravio-save-${new Date(state.clock.lastProcessedAtMs).toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    await session.prepareImport(await file.text());
    if (fileRef.current) fileRef.current.value = '';
  };

  const canWrite = snap.status === 'ready' || snap.status === 'unrecoverable';

  return (
    <section aria-labelledby="save-heading">
      <h2 id="save-heading">{t('save.heading')}</h2>
      <p role="status" className={snap.status === 'ready' ? 'muted' : 'notice'}>
        {t(`save.status.${snap.status}`)}
      </p>
      {!snap.persistent && <p className="notice">{t('save.notPersistent')}</p>}
      {snap.lockUnsupported && <p className="muted">{t('save.lockUnsupported')}</p>}
      {snap.saveError && <p className="notice">{t('save.writeFailed')}</p>}
      {snap.failures.length > 0 && (
        <ul className="muted">
          {snap.failures.map((f) => (
            <li key={f.slot}>{t('save.slotFailed', { slot: t(`save.slot.${f.slot}`), reason: t(`saveError.${f.code}`) })}</li>
          ))}
        </ul>
      )}
      {snap.loadedFrom && snap.loadedFrom !== 'main' && <p className="muted">{t(`save.loadedFrom.${snap.loadedFrom}`)}</p>}
      {snap.migratedFrom !== null && <p className="muted">{t('save.migrated', { from: snap.migratedFrom, to: SCHEMA_VERSION })}</p>}

      {state && (
        <dl className="stats">
          <dt>{t('save.gold')}</dt>
          <dd>{gold(state.goldMicro)} G</dd>
          <dt>{t('save.dragons')}</dt>
          <dd>
            {state.dragons
              .filter((d) => d.location.kind !== 'released')
              .map((d) => `${d.nickname ?? t(`species.${d.speciesId}`)} (${t(`stage.${growthStage(d.xpSec, getSpecies(d.speciesId))}`)})`)
              .join(', ')}
          </dd>
          {state.offlineReceipt && (
            <>
              <dt>{t('save.offline')}</dt>
              <dd>{t('save.offlineValue', { g: n(state.offlineReceipt.goldMicro / MICRO_PER_G), from: time(state.offlineReceipt.fromMs) })}</dd>
            </>
          )}
          <dt>{t('save.lastSaved')}</dt>
          <dd>{snap.lastSavedAtMs === null ? t('save.never') : time(snap.lastSavedAtMs)}</dd>
        </dl>
      )}

      <div className="row">
        <button type="button" disabled={snap.status !== 'ready'} onClick={() => void session.saveNow()}>
          {t('save.saveNow')}
        </button>
        <button type="button" disabled={!state} onClick={() => void doExport()}>
          {t('save.export')}
        </button>
        <label className={canWrite ? 'button' : 'button disabled'}>
          {t('save.import')}
          <input ref={fileRef} type="file" accept="application/json,.json" hidden disabled={!canWrite} onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {snap.status === 'unrecoverable' && (
          <button type="button" onClick={() => void session.startFresh()}>
            {t('save.startFresh')}
          </button>
        )}
      </div>

      {snap.importError && <p className="notice">{t('save.importFailed', { reason: t(`saveError.${snap.importError}`) })}</p>}
      {snap.importPreview && (
        <div className="confirm" role="dialog" aria-labelledby="import-heading">
          <h3 id="import-heading">{t('save.importConfirmHeading')}</h3>
          <ul>
            <li>{t('save.importSavedAt', { at: time(snap.importPreview.savedAtMs) })}</li>
            <li>{t('save.importGold', { g: gold(snap.importPreview.goldMicro) })}</li>
            <li>{t('save.importDragons', { n: snap.importPreview.dragonCount, species: snap.importPreview.speciesCount })}</li>
            {snap.importPreview.migratedFrom !== null && <li>{t('save.importMigrated', { from: snap.importPreview.migratedFrom, to: SCHEMA_VERSION })}</li>}
            {snap.importPreview.warnings.length > 0 && <li>{t('save.importWarnings', { n: snap.importPreview.warnings.length })}</li>}
          </ul>
          <p>{t('save.importReplaceNote')}</p>
          <div className="row">
            <button type="button" onClick={() => void session.confirmImport()}>
              {t('save.importConfirm')}
            </button>
            <button type="button" onClick={() => session.cancelImport()}>
              {t('save.importCancel')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
