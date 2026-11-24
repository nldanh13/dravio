import { MUTATION_SHARE, PRISMATIC_PITY } from '../../data/economy';
import type { MutationType } from '../../types/game';
import { pickWeighted, type Rng } from '../core/rng';

/**
 * Phân phối biến thể (GDD 3.1 trang 15).
 * L = cấp luck (0–8), b = số bố mẹ có biến thể (0–2).
 * w = 1 + 0,25L; q = min(0,60; 15w/(85+15w) + 0,08b).
 */
export function mutationDistribution(luckLevel: number, mutatedParents: 0 | 1 | 2): Record<MutationType, number> {
  const w = 1 + 0.25 * luckLevel;
  const q = Math.min(0.6, (15 * w) / (85 + 15 * w) + 0.08 * mutatedParents);
  return {
    normal: 1 - q,
    crystal: q * MUTATION_SHARE.crystal,
    golden: q * MUTATION_SHARE.golden,
    prismatic: q * MUTATION_SHARE.prismatic,
  };
}

export interface MutationRoll {
  mutation: MutationType;
  /** Bộ đếm pity mới. */
  pityCount: number;
}

/**
 * Lần thứ 200 liên tiếp không Prismatic bảo đảm Prismatic; reset khi ra.
 * Tutorial và lượt nghiên cứu định hướng KHÔNG gọi hàm này (không tính pity).
 */
export function rollMutation(
  rng: Rng,
  luckLevel: number,
  mutatedParents: 0 | 1 | 2,
  pityCount: number,
): MutationRoll {
  if (pityCount + 1 >= PRISMATIC_PITY) return { mutation: 'prismatic', pityCount: 0 };
  const d = mutationDistribution(luckLevel, mutatedParents);
  const mutation = pickWeighted<MutationType>(rng, [
    ['normal', d.normal],
    ['crystal', d.crystal],
    ['golden', d.golden],
    ['prismatic', d.prismatic],
  ]);
  return { mutation, pityCount: mutation === 'prismatic' ? 0 : pityCount + 1 };
}
