import { describe, expect, it } from 'vitest';
import { getSpecies } from '../../src/data/dragons';
import { MICRO_PER_G, PACKS, UPGRADES } from '../../src/data/economy';
import { createRng } from '../../src/engine/core/rng';
import { mutationDistribution, rollMutation } from '../../src/engine/economy/mutation';
import { rollPackSpecies } from '../../src/engine/economy/packs';
import {
  growthStage,
  offlineGoldMicro,
  productionBudget,
  rateMicroGPerSec,
  sellPriceG,
  upgradeCostG,
} from '../../src/engine/economy/rates';

const ember = getSpecies('emberling');

describe('growth and rates', () => {
  it('derives stage from xpSec', () => {
    expect(growthStage(0, ember)).toBe('baby');
    expect(growthStage(104, ember)).toBe('baby');
    expect(growthStage(105, ember)).toBe('juvenile');
    expect(growthStage(299, ember)).toBe('juvenile');
    expect(growthStage(300, ember)).toBe('adult');
  });

  it('GDD example: 5 Emberling Adult offline 8h → 2.700 G', () => {
    const rate = 5 * rateMicroGPerSec(ember, 'adult', 'normal');
    const { goldMicro } = offlineGoldMicro(rate, 8 * 3600 * 1000);
    expect(goldMicro / MICRO_PER_G).toBe(2700);
  });

  it('keeps the fractional remainder', () => {
    const one = offlineGoldMicro(1, 1);
    expect(one.goldMicro).toBe(0);
    const two = offlineGoldMicro(1, 1_333, one.remainder);
    expect(two.goldMicro).toBe(1);
  });

  it('sell price follows stage and mutation multipliers', () => {
    expect(sellPriceG(ember, 'adult', 'normal')).toBe(75);
    expect(sellPriceG(ember, 'baby', 'normal')).toBe(26);
    expect(sellPriceG(ember, 'adult', 'prismatic')).toBe(750);
  });

  it('production budget is 5 + 2 × level, max 25', () => {
    expect(productionBudget(0)).toBe(5);
    expect(productionBudget(10)).toBe(25);
    expect(productionBudget(99)).toBe(25);
  });

  it('upgrade cost = floor(base × scale^level), null at max', () => {
    const cap = UPGRADES.find((u) => u.id === 'islandCapacityLevel');
    if (!cap) throw new Error('missing upgrade');
    expect(upgradeCostG(cap, 0)).toBe(500);
    expect(upgradeCostG(cap, 1)).toBe(925);
    expect(upgradeCostG(cap, 10)).toBeNull();
  });
});

describe('mutation', () => {
  it('base odds are 85 / 11 / 3,5 / 0,5', () => {
    const d = mutationDistribution(0, 0);
    expect(d.normal).toBeCloseTo(0.85, 10);
    expect(d.crystal).toBeCloseTo(0.11, 10);
    expect(d.golden).toBeCloseTo(0.035, 10);
    expect(d.prismatic).toBeCloseTo(0.005, 10);
  });

  it('caps q at 60% and always sums to 1', () => {
    for (let L = 0; L <= 8; L++) {
      for (const b of [0, 1, 2] as const) {
        const d = mutationDistribution(L, b);
        expect(d.normal + d.crystal + d.golden + d.prismatic).toBeCloseTo(1, 12);
        expect(1 - d.normal).toBeLessThanOrEqual(0.6 + 1e-12);
      }
    }
  });

  it('guarantees prismatic on the 200th roll and resets pity', () => {
    const rng = createRng(1);
    expect(rollMutation(rng, 0, 0, 199)).toEqual({ mutation: 'prismatic', pityCount: 0 });
    const r = rollMutation(rng, 0, 0, 0);
    expect(r.pityCount === 1 || r.mutation === 'prismatic').toBe(true);
  });
});

describe('packs', () => {
  it('pack odds sum to 100%', () => {
    for (const p of PACKS) expect(Object.values(p.odds).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('never yields pack-ineligible species or 0% rarities', () => {
    const rng = createRng(99);
    const astral = PACKS.find((p) => p.id === 'astral');
    if (!astral) throw new Error('missing pack');
    for (let i = 0; i < 5_000; i++) {
      const s = getSpecies(rollPackSpecies(rng, astral));
      expect(s.packEligible).toBe(true);
      expect(s.rarity).not.toBe('common');
    }
  });
});
