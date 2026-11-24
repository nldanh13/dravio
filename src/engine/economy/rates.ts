import {
  MICRO_PER_G,
  MUTATION_RATE_MULT,
  MUTATION_SELL_MULT,
  OFFLINE_GOLD_FACTOR,
  STAGE_RATE_MULT,
  STAGE_SELL_MULT,
  type UpgradeDef,
} from '../../data/economy';
import type { DragonSpecies, GrowthStage, MutationType } from '../../types/game';

/** Baby < 35%, Juvenile < 100%, Adult = 100% thời gian trưởng thành. Stage là giá trị dẫn xuất. */
export function growthStage(xpSec: number, species: DragonSpecies): GrowthStage {
  const ratio = xpSec / species.growthTimeSec;
  if (ratio < 0.35) return 'baby';
  if (ratio < 1) return 'juvenile';
  return 'adult';
}

/** rate = baseG/s × stageMult × mutationMult, làm tròn xuống microG nguyên. */
export function rateMicroGPerSec(species: DragonSpecies, stage: GrowthStage, mutation: MutationType): number {
  return Math.floor(species.baseRateMicroG * STAGE_RATE_MULT[stage] * MUTATION_RATE_MULT[mutation]);
}

/** sell = floor(baseSell × stageSell × mutationSell). */
export function sellPriceG(species: DragonSpecies, stage: GrowthStage, mutation: MutationType): number {
  return Math.floor(species.baseSellG * STAGE_SELL_MULT[stage] * MUTATION_SELL_MULT[mutation]);
}

/** Ngân sách sản xuất toàn cục: 5 + 2 × cấp, tối đa 25. */
export function productionBudget(capacityLevel: number): number {
  return Math.min(25, 5 + 2 * capacityLevel);
}

/** upgradeCost = floor(base × scale^level); null khi đã tối đa. */
export function upgradeCostG(def: UpgradeDef, level: number): number | null {
  if (level >= def.max) return null;
  return Math.floor(def.base * def.scale ** level);
}

/**
 * Vàng offline (microG) cho tổng rate đã tính, theo elapsedMs đã chặn 24h.
 * Giữ phần lẻ: trả cả phần nguyên và phần dư để cộng dồn lần sau.
 */
export function offlineGoldMicro(
  totalRateMicroGPerSec: number,
  elapsedMs: number,
  remainder = 0,
): { goldMicro: number; remainder: number } {
  // Tính theo mili-giây để không mất phần lẻ: rate × ms × 0,75 / 1000
  const scaled = totalRateMicroGPerSec * elapsedMs * OFFLINE_GOLD_FACTOR + remainder;
  const goldMicro = Math.floor(scaled / 1000);
  return { goldMicro, remainder: scaled - goldMicro * 1000 };
}

export function microToG(micro: number): number {
  return Math.floor(micro / MICRO_PER_G);
}
