import type { HabitatId } from '../data/g0Biology';

/**
 * Bố cục mặt đất Khởi Nguyên cho renderer (đơn vị thế giới; không lưu vào save).
 * Ba microhabitat cạnh nhau: đồng cỏ · đá ấm · bờ hồ. Vật cản là hình tròn:
 * `solid` (bụi, đá) chặn mọi rồng đi/bơi; `water` (mặt hồ) chỉ rồng biết bơi vào được.
 * Rồng bay vượt qua vật cản khi đang bay, nhưng phải hạ xuống đất để nghỉ/ngủ/ăn (GDD: "rồng bay cần nơi đậu").
 */

export interface Vec {
  x: number;
  y: number;
}

export interface Obstacle {
  x: number;
  y: number;
  r: number;
  kind: 'solid' | 'water';
}

export interface HabitatRegion {
  habitatId: HabitatId;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  obstacles: Obstacle[];
}

export const WORLD_WIDTH = 1200;
export const WORLD_DEPTH = 520;
/** Khoảng cách tối thiểu tới mép microhabitat. */
export const EDGE_MARGIN = 28;

export const ORIGIN_LAYOUT: readonly HabitatRegion[] = [
  { habitatId: 'origin_meadow', x0: 0, y0: 0, x1: 480, y1: WORLD_DEPTH, obstacles: [{ x: 230, y: 190, r: 42, kind: 'solid' }, { x: 120, y: 400, r: 30, kind: 'solid' }] },
  { habitatId: 'origin_warm_rocks', x0: 480, y0: 0, x1: 840, y1: WORLD_DEPTH, obstacles: [{ x: 600, y: 160, r: 48, kind: 'solid' }, { x: 735, y: 360, r: 44, kind: 'solid' }] },
  { habitatId: 'origin_pondbank', x0: 840, y0: 0, x1: WORLD_WIDTH, y1: WORLD_DEPTH, obstacles: [{ x: 1030, y: 290, r: 115, kind: 'water' }] },
];

export function regionOf(habitatId: string): HabitatRegion | undefined {
  return ORIGIN_LAYOUT.find((r) => r.habitatId === habitatId);
}

export function regionAt(p: Vec): HabitatRegion | undefined {
  return ORIGIN_LAYOUT.find((r) => p.x >= r.x0 && p.x < r.x1 && p.y >= r.y0 && p.y <= r.y1);
}

export function inWater(region: HabitatRegion, p: Vec): boolean {
  return region.obstacles.some((o) => o.kind === 'water' && Math.hypot(p.x - o.x, p.y - o.y) < o.r);
}
