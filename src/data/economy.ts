import type { GrowthStage, MutationType, Rarity } from '../types/game';

/** GDD 3.1 trang 15 — baseline v2, là giả thuyết để mô phỏng, chưa phải cân bằng cuối. */

export const MICRO_PER_G = 1_000_000;

export const STAGE_RATE_MULT: Readonly<Record<GrowthStage, number>> = {
  baby: 0.4,
  juvenile: 0.75,
  adult: 1,
};

export const STAGE_SELL_MULT: Readonly<Record<GrowthStage, number>> = {
  baby: 0.35,
  juvenile: 0.65,
  adult: 1,
};

export const MUTATION_RATE_MULT: Readonly<Record<MutationType, number>> = {
  normal: 1,
  crystal: 1.6,
  golden: 2.8,
  prismatic: 5,
};

export const MUTATION_SELL_MULT: Readonly<Record<MutationType, number>> = {
  normal: 1,
  crystal: 2.2,
  golden: 4.5,
  prismatic: 10,
};

/** Tỷ trọng gốc trong nhóm biến thể (trên 15%): Crystal 11, Golden 3,5, Prismatic 0,5. */
export const MUTATION_SHARE = { crystal: 11 / 15, golden: 3.5 / 15, prismatic: 0.5 / 15 } as const;

export const PRISMATIC_PITY = 200;
export const OFFLINE_GOLD_FACTOR = 0.75;

export interface PackDef {
  id: string;
  priceG: number;
  /** Tỷ lệ phần trăm theo độ hiếm. */
  odds: Readonly<Record<Rarity, number>>;
}

export const PACKS: readonly PackDef[] = [
  { id: 'starter', priceG: 100, odds: { common: 90, rare: 10, epic: 0, legendary: 0 } },
  { id: 'elemental', priceG: 900, odds: { common: 48, rare: 45, epic: 7, legendary: 0 } },
  { id: 'mystic', priceG: 6000, odds: { common: 15, rare: 50, epic: 32, legendary: 3 } },
  { id: 'astral', priceG: 30000, odds: { common: 0, rare: 28, epic: 55, legendary: 17 } },
];

export interface UpgradeDef {
  id: 'islandCapacityLevel' | 'foodQualityLevel' | 'foodCooldownLevel' | 'mutationLuckLevel' | 'hatchSpeedLevel';
  base: number;
  scale: number;
  max: number;
}

/** Phụ lục E. */
export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'islandCapacityLevel', base: 500, scale: 1.85, max: 10 },
  { id: 'foodQualityLevel', base: 200, scale: 1.75, max: 10 },
  { id: 'foodCooldownLevel', base: 250, scale: 1.8, max: 8 },
  { id: 'mutationLuckLevel', base: 1500, scale: 2.2, max: 8 },
  { id: 'hatchSpeedLevel', base: 600, scale: 1.9, max: 6 },
];
