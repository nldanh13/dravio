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

describe('economy baseline is unchanged by the G0 integration', () => {
  it('matches the v2 table on GDD page 6 for all 16 species', () => {
    const table = DRAGON_SPECIES.map((s) => [s.id, s.rarity, s.group, s.baseRateMicroG, s.growthTimeSec / 60, s.baseSellG, s.packEligible]);
    expect(table).toEqual([
      ['emberling', 'common', 'T', 25_000, 5, 75, true],
      ['droplet', 'common', 'A', 25_000, 6, 75, true],
      ['sprout', 'common', 'T', 27_000, 8, 80, true],
      ['zephyr', 'common', 'V', 28_000, 8, 85, true],
      ['steamdrake', 'rare', 'A', 70_000, 25, 350, true],
      ['magma', 'rare', 'T', 75_000, 30, 380, true],
      ['sparkwing', 'rare', 'V', 80_000, 35, 400, true],
      ['frostfin', 'rare', 'A', 75_000, 30, 380, true],
      ['mossback', 'rare', 'A', 72_000, 25, 360, true],
      ['blossom', 'rare', 'V', 80_000, 35, 400, true],
      ['solaris', 'epic', 'V', 180_000, 120, 1800, true],
      ['leviathan', 'epic', 'A', 200_000, 150, 2000, true],
      ['amberhorn', 'epic', 'T', 200_000, 150, 2000, false],
      ['aurorawing', 'epic', 'V', 220_000, 180, 2200, false],
      ['celestia', 'legendary', 'V', 500_000, 360, 10_000, true],
      ['gaia', 'legendary', 'A', 550_000, 480, 11_000, true],
    ]);
  });
});
