import { describe, expect, it } from 'vitest';
import catalogJson from '../../docs/g0/BIOLOGY_CATALOG.json';
import { DRAGON_SPECIES, getSpecies } from '../../src/data/dragons';
import {
  HABITAT_PROFILES,
  SPECIES_BIOLOGY,
  getBiology,
  suitability,
  type HabitatId,
} from '../../src/data/g0Biology';

/** Chuyển từ tests/g0/biology.smoke.ts (G0 pack) sang Vitest và mở rộng theo AI_HANDOFF. */

const CANONICAL_IDS = [
  'emberling', 'droplet', 'sprout', 'zephyr', 'steamdrake', 'magma', 'sparkwing', 'frostfin',
  'mossback', 'blossom', 'solaris', 'leviathan', 'amberhorn', 'aurorawing', 'celestia', 'gaia',
];
const HABITAT_IDS = Object.keys(HABITAT_PROFILES) as HabitatId[];
const meadow = HABITAT_PROFILES.origin_meadow;

describe('G0 biology catalog', () => {
  it('covers exactly the 16 canonical species ids', () => {
    expect(Object.keys(SPECIES_BIOLOGY).sort()).toEqual([...CANONICAL_IDS].sort());
    expect(DRAGON_SPECIES.map((s) => s.id)).toEqual(CANONICAL_IDS);
  });

  it('has 7 microhabitats in 3 zones', () => {
    expect(HABITAT_IDS).toHaveLength(7);
    expect(new Set(HABITAT_IDS.map((h) => HABITAT_PROFILES[h].zoneId))).toEqual(new Set(['origin', 'ocean', 'sky']));
  });

  it.each(CANONICAL_IDS)('%s: final data, valid diet/resilience/palette', (id) => {
    const b = getBiology(id);
    expect(b.draft).toBe(false);
    expect(b.dietIds.length).toBeGreaterThan(0);
    for (const d of b.dietIds) expect(['fruit', 'leaf', 'aquatic', 'aether']).toContain(d);
    for (const n of Object.values(b.resiliencePct)) {
      expect(Number.isFinite(n) && n >= 0 && n <= 100).toBe(true);
    }
    for (const n of Object.values(b.comfortMin)) expect(n >= 0 && n <= 100).toBe(true);
    for (const c of Object.values(b.palette)) expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it.each(CANONICAL_IDS)('%s: group and realms agree with the GDD catalog', (id) => {
    const s = getSpecies(id);
    const b = getBiology(id);
    expect(b.group).toBe(s.group);
    const habitatRealms = new Set(b.habitatRules.map((h) => HABITAT_PROFILES[h as HabitatId].realm));
    expect(habitatRealms).toEqual(new Set(s.realms));
    expect(s.anatomy.draft).toBe(false);
    expect(s.habitatRules).toEqual(b.habitatRules);
  });

  it.each(CANONICAL_IDS)('%s: exact compatibility and baseline comfort ≥80 in every allowed habitat', (id) => {
    const b = getBiology(id);
    let best = 0;
    for (const h of HABITAT_IDS) {
      const r = suitability(id, h, HABITAT_PROFILES[h]);
      expect(r.allowed).toBe(b.habitatRules.includes(h));
      if (r.allowed) {
        expect(r.score).toBeGreaterThanOrEqual(80);
        best = Math.max(best, r.score);
      }
    }
    expect(best).toBeGreaterThanOrEqual(80);
  });

  it('JSON snapshot matches the TypeScript source (single runtime source)', () => {
    expect(catalogJson.species).toEqual(JSON.parse(JSON.stringify(SPECIES_BIOLOGY)));
    expect(catalogJson.habitatProfiles).toEqual(JSON.parse(JSON.stringify(HABITAT_PROFILES)));
  });
});

describe('hard gates', () => {
  it('frostfin cannot fly; leviathan cannot live on land', () => {
    expect(getBiology('frostfin').locomotion).not.toContain('fly');
    expect(suitability('leviathan', 'origin_meadow', meadow).allowed).toBe(false);
  });

  it('flyers need a perch in the sky', () => {
    const sky = HABITAT_PROFILES.sky_low_island;
    expect(suitability('zephyr', 'sky_low_island', sky).allowed).toBe(true);
    expect(suitability('zephyr', 'sky_low_island', { ...sky, perch: false }).allowed).toBe(false);
  });

  it('land-only dragons are never placed in the sky or ocean', () => {
    for (const h of ['sky_low_island', 'ocean_reef', 'ocean_estuary', 'ocean_cool_pool'] as const) {
      expect(suitability('emberling', h, HABITAT_PROFILES[h]).allowed).toBe(false);
    }
  });

  it('deep water, wrong salinity, wrong heat and wrong zone are rejected', () => {
    const reef = HABITAT_PROFILES.ocean_reef;
    expect(suitability('leviathan', 'ocean_reef', { ...reef, depthBand: 'deep' }).allowed).toBe(false);
    expect(suitability('leviathan', 'ocean_reef', { ...reef, salinityBand: 'fresh' }).allowed).toBe(false);
    const rocks = HABITAT_PROFILES.origin_warm_rocks;
    expect(suitability('magma', 'origin_warm_rocks', { ...rocks, temperatureBand: 'cold' }).allowed).toBe(false);
    expect(suitability('emberling', 'origin_meadow', { ...meadow, zoneId: 'sky' }).allowed).toBe(false);
  });

  it('incompatible placements always score 0', () => {
    expect(suitability('frostfin', 'origin_meadow', meadow)).toEqual({ allowed: false, score: 0, reason: 'incompatible' });
  });
});

describe('suitability score thresholds', () => {
  // Emberling: comfortMin airQuality 65 → mỗi điểm thiếu trừ 1.
  const at = (air: number) => suitability('emberling', 'origin_meadow', { ...meadow, airQuality: air });

  it('100 / 80 / 79 / 50 / 49 / 0 boundaries', () => {
    expect(at(90).score).toBe(100);
    expect(at(45)).toEqual({ allowed: true, score: 80, reason: 'ok' });
    expect(at(44)).toEqual({ allowed: true, score: 79, reason: 'ok' });
    expect(at(15)).toEqual({ allowed: true, score: 50, reason: 'ok' });
    expect(at(14)).toEqual({ allowed: false, score: 49, reason: 'low-suitability' });
    const worst = suitability('emberling', 'origin_meadow', { ...meadow, airQuality: 0, vegetation: 0, foodAvailability: 0 });
    expect(worst.score).toBe(0);
    expect(worst.allowed).toBe(false);
  });

  it('ignores factors irrelevant to the habitat', () => {
    expect(suitability('emberling', 'origin_meadow', { ...meadow, waterQuality: 0 }).score).toBe(100);
  });

  it('rejects NaN, out-of-range quality and unknown habitat ids', () => {
    expect(at(Number.NaN).reason).toBe('invalid-env');
    expect(at(101).reason).toBe('invalid-env');
    expect(at(-1).reason).toBe('invalid-env');
    expect(suitability('emberling', 'unknown' as HabitatId, meadow).reason).toBe('invalid-env');
  });

  it('rejects unknown species ids', () => {
    expect(() => suitability('nope', 'origin_meadow', meadow)).toThrow();
  });
});
