import type { G0Anatomy } from '../types/biology';
import type { HabitatId } from './g0Biology';

/**
 * Bản đồ thế giới dạng graph (GDD 3.1 trang 5 "Quy tắc di chuyển và bố trí"; ADR 0010).
 * node = zone; edge = đường đi có điều kiện di chuyển + microhabitat cửa ngõ ở hai đầu.
 *
 * MVP: Khởi Nguyên là trung tâm. Thủy Vực nối đất liền qua cửa sông (GDD: "cửa sông nối vùng đất")
 * và cần bơi. Thiên Giới nối qua đảo thấp — nơi đậu (perch) — và cần bay ("rồng bay cần nơi đậu").
 * GDD chưa nêu cạnh Thủy Vực ↔ Thiên Giới: không có cạnh trực tiếp, đi qua Khởi Nguyên.
 * Vận chuyển bằng phương tiện cứu hộ (ngoại lệ trong GDD) thuộc G2+, chưa mô hình ở đây.
 */

export const WORLD_ZONE_IDS = ['origin', 'ocean', 'sky'] as const;
export type WorldZoneId = (typeof WORLD_ZONE_IDS)[number];

/** Sức chứa vật lý mỗi zone ở P0 (GDD: "MVP bắt đầu 5 chỗ đất, mở 5 chỗ nước và 5 chỗ không"). */
export const P0_ZONE_CAPACITY = 5;

export type Locomotion = G0Anatomy['locomotion'][number];

export interface WorldEdge {
  /** ID ổn định. */
  id: string;
  a: WorldZoneId;
  b: WorldZoneId;
  /** Rồng cần ít nhất một kiểu di chuyển trong danh sách. */
  requires: readonly Locomotion[];
  /** Microhabitat cửa ngõ ở mỗi đầu cạnh. */
  gateways: Readonly<Partial<Record<WorldZoneId, HabitatId>>>;
}

export const WORLD_EDGES: readonly WorldEdge[] = [
  { id: 'origin_ocean_estuary', a: 'origin', b: 'ocean', requires: ['swim'], gateways: { origin: 'origin_pondbank', ocean: 'ocean_estuary' } },
  { id: 'origin_sky_low_island', a: 'origin', b: 'sky', requires: ['fly'], gateways: { origin: 'origin_meadow', sky: 'sky_low_island' } },
];

export function edgesOf(zone: WorldZoneId): WorldEdge[] {
  return WORLD_EDGES.filter((e) => e.a === zone || e.b === zone);
}

/**
 * Có đường đi từ `from` tới `to` với các kiểu di chuyển cho trước không (BFS, cùng zone luôn đúng).
 * Hàm thuần, chưa nối vào `moveDragon`: ở G1 Thủy Vực/Thiên Giới còn khóa nên mọi lần chuyển đều trong Khởi Nguyên.
 */
export function canTravel(from: WorldZoneId, to: WorldZoneId, locomotion: readonly Locomotion[]): boolean {
  if (from === to) return true;
  const seen = new Set<WorldZoneId>([from]);
  const queue: WorldZoneId[] = [from];
  while (queue.length > 0) {
    const z = queue.shift() as WorldZoneId;
    for (const e of edgesOf(z)) {
      if (!e.requires.some((m) => locomotion.includes(m))) continue;
      const next = e.a === z ? e.b : e.a;
      if (next === to) return true;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}
