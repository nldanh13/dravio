import { useMemo, useState, useSyncExternalStore } from 'react';
import { DRAGON_SPECIES, getSpecies } from './data/dragons';
import { MICRO_PER_G } from './data/economy';
import { pairKey } from './engine/genetics/alleles';
import { queryBreedPreview } from './engine/genetics/breeding';
import { SPRITES } from './assets/manifest';
import { LanguageContext, useTranslation } from './i18n';
import type { GameSession } from './platform/gameSession';
import { SavePanel } from './ui/SavePanel';
import { WorldView } from './ui/WorldView';
import { ZonePanel } from './ui/ZonePanel';
import type { DragonInstance, LanguageCode } from './types/game';

/** Rồng mẫu Adult dị hợp mọi locus, chỉ để minh họa preview. */
function demoAdult(uid: string, speciesId: string): DragonInstance {
  const s = getSpecies(speciesId);
  return {
    uid,
    speciesId,
    genotype: { pigment: ['R', 'r'], pattern: ['P', 'p'], eye: ['B', 'b'] },
    mutation: 'normal',
    xpSec: s.growthTimeSec,
    locked: false,
    location: { kind: 'storage' },
    hatchedAtMs: 0,
    personality: 'calm',
    bond: 0,
    parentIds: null,
    generation: 1,
    ancestry: 'unknown',
    origin: 'pack',
    activity: 'idle',
    breedCooldownUntilMs: 0,
  };
}

function Catalog() {
  const { t, n } = useTranslation();
  return (
    <section>
      <h2>{t('catalog.heading')}</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('catalog.col.species')}</th>
              <th>{t('catalog.col.elements')}</th>
              <th>{t('catalog.col.rarity')}</th>
              <th>{t('catalog.col.group')}</th>
              <th className="num">{t('catalog.col.rate')}</th>
              <th className="num">{t('catalog.col.growth')}</th>
              <th className="num">{t('catalog.col.sell')}</th>
              <th>{t('catalog.col.habitat')}</th>
              <th>{t('catalog.col.diet')}</th>
            </tr>
          </thead>
          <tbody>
            {DRAGON_SPECIES.map((s) => (
              <tr key={s.id}>
                <td>{t(`species.${s.id}`)}</td>
                <td>{s.elements.map((e) => t(`element.${e}`)).join(' + ')}</td>
                <td>
                  <span className={`rarity rarity-${s.rarity}`}>{t(`rarity.${s.rarity}`)}</span>
                </td>
                <td>{s.group}</td>
                <td className="num">{n(s.baseRateMicroG / MICRO_PER_G)}</td>
                <td className="num">{t('catalog.minutes', { n: s.growthTimeSec / 60 })}</td>
                <td className="num">{n(s.baseSellG)}</td>
                <td>{s.habitatRules.map((h) => t(`habitat.${h}`)).join(', ')}</td>
                <td>{s.anatomy.dietIds.map((d) => t(`diet.${d}`)).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmberlingGallery() {
  const { t } = useTranslation();
  const stages = ['baby', 'juvenile', 'adult'] as const;
  return (
    <section>
      <h2>{t('gallery.heading')}</h2>
      <p className="muted">{t('gallery.note')}</p>
      <div className="gallery">
        {stages.map((stage) =>
          SPRITES.filter((sp) => sp.stage === stage).map((sp) => (
            <figure key={`${sp.stage}-${sp.mutation}`}>
              <img src={sp.url} alt={`${t('species.emberling')} — ${t(`stage.${sp.stage}`)} ${t(`mutation.${sp.mutation}`)}`} width={128} height={107} />
              <figcaption>
                {t(`stage.${sp.stage}`)} · {t(`mutation.${sp.mutation}`)}
              </figcaption>
            </figure>
          )),
        )}
      </div>
    </section>
  );
}

function BreedingPreview() {
  const { t, n } = useTranslation();
  const [a, setA] = useState('emberling');
  const [b, setB] = useState('sprout');
  const query = useMemo(() => queryBreedPreview(demoAdult('demo-a', a), demoAdult('demo-b', b), 0), [a, b]);

  const select = (value: string, onChange: (v: string) => void, label: string) => (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {DRAGON_SPECIES.map((s) => (
          <option key={s.id} value={s.id}>
            {t(`species.${s.id}`)} ({s.group})
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section>
      <h2>{t('breeding.heading')}</h2>
      <div className="row">
        {select(a, setA, t('breeding.parentA'))}
        {select(b, setB, t('breeding.parentB'))}
      </div>
      {!query.ok ? (
        <p>{t(`breedError.${query.reason}`)}</p>
      ) : (
        <>
          <p>{t('breeding.fee', { n: n(query.preview.feeG) })}</p>
          <ul>
            {[...query.preview.species].map(([id, p]) => (
              <li key={id}>
                {t(`species.${id}`)} — {n(p * 100)}%
              </li>
            ))}
          </ul>
          <ul>
            {Object.entries(query.preview.loci).map(([locus, dist]) => (
              <li key={locus}>
                <code>{locus}</code>:{' '}
                {[...dist.values()].map((d) => `${pairKey(d.pair)} ${n(d.p * 100)}%`).join(' · ')}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function App({ session }: { session: GameSession }) {
  const [lang, setLang] = useState<LanguageCode>('vi');
  return (
    <LanguageContext.Provider value={lang}>
      <Shell session={session} onToggle={() => setLang((l) => (l === 'vi' ? 'en' : 'vi'))} />
    </LanguageContext.Provider>
  );
}

function Shell({ session, onToggle }: { session: GameSession; onToggle: () => void }) {
  const { t, n } = useTranslation();
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const { state } = snap;
  const origin = state?.zones.find((z) => z.id === 'origin');
  const population = state?.dragons.filter((d) => d.location.kind === 'zone' && d.location.zoneId === 'origin').length ?? 0;
  return (
    <main className="sanctuary-shell">
      <header className="sanctuary-hud">
        <div className="sanctuary-brand">
          <span className="brand-crest" aria-hidden="true">✦</span>
          <div>
            <h1>{t('app.title')}</h1>
            <p className="brand-tagline">{t('app.tagline')}</p>
          </div>
        </div>
        <div className="sanctuary-resources">
          <div className="resource-medallion">
            <span className="resource-coin" aria-hidden="true">✦</span>
            <div><small>{t('save.gold')}</small><strong>{state ? n(Math.floor(state.goldMicro / 10_000) / 100) : '—'}</strong></div>
          </div>
          <div className="resource-medallion">
            <span className="resource-leaf" aria-hidden="true">❧</span>
            <div><small>{t('world.dragons')}</small><strong>{origin ? population + '/' + origin.capacity : '—'}</strong></div>
          </div>
          <button type="button" className="hud-language" onClick={onToggle}>{t('lang.switch')}</button>
        </div>
      </header>
      {snap.status !== 'ready' && <p className="notice" role="status">{t(`save.status.${snap.status}`)}</p>}
      {!snap.persistent && <p className="notice">{t('save.notPersistent')}</p>}
      {snap.saveError && <p className="notice" role="alert">{t('save.writeFailed')}</p>}
      <WorldView session={session} />
      <details className="sanctuary-drawer">
        <summary>{t('zone.heading')} · {t('zone.storage')}</summary>
        <ZonePanel session={session} />
      </details>
      <details className="sanctuary-drawer">
        <summary>{t('catalog.heading')}</summary>
        <Catalog />
      </details>
      <details className="sanctuary-drawer">
        <summary>{t('save.heading')}</summary>
        <SavePanel session={session} />
      </details>
      {import.meta.env.DEV && (
        <details className="sanctuary-drawer dev-tools">
          <summary>DEV</summary>
          <p className="notice">{t('app.status')}</p>
          <EmberlingGallery />
          <BreedingPreview />
        </details>
      )}
    </main>
  );
}
