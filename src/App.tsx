import { useMemo, useState } from 'react';
import { DRAGON_SPECIES, getSpecies } from './data/dragons';
import { MICRO_PER_G } from './data/economy';
import { pairKey } from './engine/genetics/alleles';
import { previewBreed } from './engine/genetics/breeding';
import { LanguageContext, useTranslation } from './i18n';
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BreedingPreview() {
  const { t, n } = useTranslation();
  const [a, setA] = useState('emberling');
  const [b, setB] = useState('sprout');
  const preview = useMemo(() => previewBreed(demoAdult('demo-a', a), demoAdult('demo-b', b)), [a, b]);

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
      {preview.species.size === 0 ? (
        <p>{t('breeding.none')}</p>
      ) : (
        <>
          <p>{t('breeding.fee', { n: n(preview.feeG) })}</p>
          <ul>
            {[...preview.species].map(([id, p]) => (
              <li key={id}>
                {t(`species.${id}`)} — {n(p * 100)}%
              </li>
            ))}
          </ul>
          <ul>
            {Object.entries(preview.loci).map(([locus, dist]) => (
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

export function App() {
  const [lang, setLang] = useState<LanguageCode>('vi');
  return (
    <LanguageContext.Provider value={lang}>
      <Shell onToggle={() => setLang((l) => (l === 'vi' ? 'en' : 'vi'))} />
    </LanguageContext.Provider>
  );
}

function Shell({ onToggle }: { onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <main>
      <header>
        <div>
          <h1>{t('app.title')}</h1>
          <p className="muted">{t('app.tagline')}</p>
        </div>
        <button type="button" onClick={onToggle}>
          {t('lang.switch')}
        </button>
      </header>
      <p className="notice">{t('app.status')}</p>
      <Catalog />
      <BreedingPreview />
    </main>
  );
}
