import { WORLD_DEPTH, WORLD_WIDTH, type Vec } from './originLayout';

/**
 * Chiếu 2.5D xiên (oblique): mặt đất nghiêng, chiều sâu y nén 0,5 và lệch ngang 0,35; z là độ cao.
 * Sắp xếp vẽ theo y (xa → gần). Hàm thuần để test nghịch đảo khi chạm/bấm.
 */

export const SKEW = 0.35;
export const SQUASH = 0.5;
/** Khoảng trống phía trên (đơn vị thế giới) cho rồng bay và sprite cao. */
export const TOP_PAD = 95;
const SIDE_PAD = 12;

export interface View {
  k: number;
  ox: number;
  oy: number;
  cssWidth: number;
  cssHeight: number;
}

/** Chiều cao CSS đề xuất cho chiều rộng cho trước (giữ tỉ lệ cảnh). */
export function sceneHeightFor(cssWidth: number): number {
  const k = (cssWidth - 2 * SIDE_PAD) / (WORLD_WIDTH + WORLD_DEPTH * SKEW);
  return Math.round((WORLD_DEPTH * SQUASH + TOP_PAD) * k + 2 * SIDE_PAD);
}

export function fitView(cssWidth: number, cssHeight: number): View {
  const kx = (cssWidth - 2 * SIDE_PAD) / (WORLD_WIDTH + WORLD_DEPTH * SKEW);
  const ky = (cssHeight - 2 * SIDE_PAD) / (WORLD_DEPTH * SQUASH + TOP_PAD);
  const k = Math.max(0.05, Math.min(kx, ky));
  const w = (WORLD_WIDTH + WORLD_DEPTH * SKEW) * k;
  const h = (WORLD_DEPTH * SQUASH + TOP_PAD) * k;
  return { k, ox: (cssWidth - w) / 2, oy: (cssHeight - h) / 2 + TOP_PAD * k, cssWidth, cssHeight };
}

export function toScreen(v: View, p: Vec, z = 0): Vec {
  return { x: v.ox + (p.x + p.y * SKEW) * v.k, y: v.oy + (p.y * SQUASH - z) * v.k };
}

/** Điểm trên mặt đất (z = 0) dưới vị trí màn hình. */
export function toGround(v: View, s: Vec): Vec {
  const y = (s.y - v.oy) / (SQUASH * v.k);
  return { x: (s.x - v.ox) / v.k - y * SKEW, y };
}
