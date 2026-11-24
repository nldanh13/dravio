import { SCENE_HEIGHT, SCENE_WIDTH, type Vec } from './originLayout';

/**
 * Camera cảnh (ADR 0012): mỗi lần hiển thị một khung 960×540 px cảnh, đặt theo `camX`
 * (toạ độ thế giới của mép trái). Mặt đất nhìn nghiêng đã vẽ sẵn trong tài nguyên nên phép chiếu
 * chỉ là tỉ lệ + dời: y thế giới = y màn hình của điểm chạm đất, z nâng lên trên màn hình.
 * Sắp xếp vẽ theo y (xa → gần). Hàm thuần để test nghịch đảo khi chạm/bấm.
 */

export interface View {
  /** px CSS mỗi px cảnh. */
  k: number;
  /** Lề trái/trên khi giữ tỉ lệ 16:9 (letterbox). */
  ox: number;
  oy: number;
  /** Toạ độ thế giới của mép trái khung nhìn. */
  camX: number;
  cssWidth: number;
  cssHeight: number;
}

/** Chiều cao CSS đề xuất cho chiều rộng cho trước (giữ tỉ lệ cảnh 16:9). */
export function sceneHeightFor(cssWidth: number): number {
  return Math.round((cssWidth * SCENE_HEIGHT) / SCENE_WIDTH);
}

export function fitView(cssWidth: number, cssHeight: number, camX = 0): View {
  const k = Math.max(0.05, Math.min(cssWidth / SCENE_WIDTH, cssHeight / SCENE_HEIGHT));
  return { k, ox: (cssWidth - SCENE_WIDTH * k) / 2, oy: (cssHeight - SCENE_HEIGHT * k) / 2, camX, cssWidth, cssHeight };
}

export function toScreen(v: View, p: Vec, z = 0): Vec {
  return { x: v.ox + (p.x - v.camX) * v.k, y: v.oy + (p.y - z) * v.k };
}

/** Điểm trên mặt đất (z = 0) dưới vị trí màn hình. */
export function toGround(v: View, s: Vec): Vec {
  return { x: (s.x - v.ox) / v.k + v.camX, y: (s.y - v.oy) / v.k };
}
