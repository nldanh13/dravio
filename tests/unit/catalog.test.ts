import { describe, expect, it } from 'vitest';
import { DRAGON_SPECIES } from '../../src/data/dragons';
import { en } from '../../src/i18n/en';
import { vi } from '../../src/i18n/vi';

describe('species catalog', () => {
  it('has exactly the 16 v2 species ids, all unique', () => {
    const ids = DRAGON_SPECIES.map((s) => s.id);
    expect(ids).toHaveLength(16);
    expect(new Set(ids).size).toBe(16);
  });

  it('excludes amberhorn and aurorawing from packs only', () => {
    const excluded = DRAGON_SPECIES.filter((s) => !s.packEligible).map((s) => s.id);
    expect(excluded.sort()).toEqual(['amberhorn', 'aurorawing']);
  });

  it('gives every species at least one realm and a valid group', () => {
    for (const s of DRAGON_SPECIES) {
      expect(s.realms.length).toBeGreaterThan(0);
      expect(['T', 'A', 'V']).toContain(s.group);
    }
  });

  it('keeps baseline v2 economy values (spot check)', () => {
    const ember = DRAGON_SPECIES.find((s) => s.id === 'emberling');
    expect(ember?.baseRateMicroG).toBe(25_000);
    expect(ember?.growthTimeSec).toBe(300);
    const gaia = DRAGON_SPECIES.find((s) => s.id === 'gaia');
    expect(gaia?.baseSellG).toBe(11_000);
  });

  it('has VI and EN names for every species', () => {
    for (const s of DRAGON_SPECIES) {
      expect(vi).toHaveProperty(`species.${s.id}`);
      expect(en).toHaveProperty(`species.${s.id}`);
    }
  });

  it('VI and EN share the same key set', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(vi).sort());
  });
});
