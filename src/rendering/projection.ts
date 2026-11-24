import { OVERVIEW, cameraTransform, sceneBox, type CameraState, type SceneBox } from './camera';
import { SCENE_HEIGHT, SCENE_WIDTH, type Vec } from './originLayout';

/**
 * Chiếu cảnh (ADR 0012): mỗi lần hiển thị một khung 960×540 px cảnh đặt theo `camX`
 * (toạ độ thế giới của mép trái microhabitat) và camera zoom/kéo trong microhabitat đó.
 * Mặt đất nhìn nghiêng đã vẽ sẵn trong tài nguyên nên phép chiếu chỉ là tỉ lệ + dời:
 * y thế giới = y màn hình của điểm chạm đất, z nâng lên trên màn hình. Sắp xếp vẽ theo y.
 * Hàm thuần để test nghịch đảo khi chạm/bấm.
 */

export interface View {
  /** px CSS mỗi px cảnh (đã nhân zoom). */
  k: number;
  /** Gốc màn hình của toạ độ cảnh cục bộ (0,0). */
  ox: number;
  oy: number;
  /** Toạ độ thế giới của mép trái microhabitat đang xem. */
  camX: number;
  cssWidth: number;
  cssHeight: number;
  /** Khung cảnh 16:9 (letterbox) ở zoom 1 — vùng cắt khi vẽ. */
  box: SceneBox;
  camera: CameraState;
}

/** Chiều cao CSS đề xuất cho chiều rộng cho trước (giữ tỉ lệ cảnh 16:9). */
export function sceneHeightFor(cssWidth: number): number {
  return Math.round((cssWidth * SCENE_HEIGHT) / SCENE_WIDTH);
}

export function fitView(cssWidth: number, cssHeight: number, camX = 0, camera: CameraState = OVERVIEW): View {
  const box = sceneBox(cssWidth, cssHeight);
  const { k, ox, oy } = cameraTransform(box, camera);
  return { k, ox, oy, camX, cssWidth, cssHeight, box, camera };
}

export function toScreen(v: View, p: Vec, z = 0): Vec {
  return { x: v.ox + (p.x - v.camX) * v.k, y: v.oy + (p.y - z) * v.k };
}

/** Điểm trên mặt đất (z = 0) dưới vị trí màn hình. */
export function toGround(v: View, s: Vec): Vec {
  return { x: (s.x - v.ox) / v.k + v.camX, y: (s.y - v.oy) / v.k };
}

/** Điểm màn hình có nằm trong khung cảnh (không phải viền letterbox) không. */
export function inSceneBox(v: View, s: Vec): boolean {
  const b = v.box;
  return s.x >= b.x && s.x <= b.x + SCENE_WIDTH * b.k0 && s.y >= b.y && s.y <= b.y + SCENE_HEIGHT * b.k0;
}
