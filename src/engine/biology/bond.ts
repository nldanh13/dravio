import { BOND_DAILY_CAP, BOND_MAX } from '../../data/care';
import type { DragonInstance } from '../../types/game';

export function utcDay(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * +1 bond nếu chưa chạm trần ngày UTC (10) và trần tuyệt đối (100). Bond không bao giờ giảm.
 * Trả rồng mới và số bond thực nhận (0 hoặc 1).
 */
export function gainBond(dragon: DragonInstance, nowMs: number): { dragon: DragonInstance; gained: 0 | 1 } {
  const day = utcDay(nowMs);
  const daily = dragon.bondDay === day ? (dragon.bondDaily ?? 0) : 0;
  if (daily >= BOND_DAILY_CAP || dragon.bond >= BOND_MAX) {
    return { dragon: { ...dragon, bondDay: day, bondDaily: daily }, gained: 0 };
  }
  return { dragon: { ...dragon, bond: dragon.bond + 1, bondDay: day, bondDaily: daily + 1 }, gained: 1 };
}
