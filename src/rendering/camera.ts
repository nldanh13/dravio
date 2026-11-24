import { SCENE_HEIGHT, SCENE_WIDTH, type Vec } from './originLayout';

/**
 * Camera trong một microhabitat (ADR 0012 mục camera điện thoại) — thuần, không DOM.
 * - Overview: zoom 1×, toàn cảnh.
 * - Focus: zoom 2× mặc định, bám theo rồng được chọn (chỉ khi người chơi bật, không tự bật khi chọn rồng).
 * - Free: người chơi tự zoom 1–2,5× / kéo.
 * Camera chỉ đổi cách nhìn: không đổi vị trí, sinh học, hành vi, sản xuất của rồng, không vào GameState/save.
 * Toạ độ tiêu điểm (fx, fy) là px cảnh cục bộ của microhabitat (0..960, 0..540) tại tâm khung nhìn.
 */

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 2.5;
export const FOCUS_ZOOM = 2;
/** Tiêu điểm Focus đặt cao hơn chân rồng một chút để thấy cả thân. */
export const FOCUS_LIFT = 45;

export type CameraMode = 'overview' | 'focus' | 'free';

export interface CameraState {
  mode: CameraMode;
  zoom: number;
  fx: number;
  fy: number;
  /** Rồng được bám theo khi mode = focus. */
  followUid: string | null;
}

export const OVERVIEW: CameraState = { mode: 'overview', zoom: 1, fx: SCENE_WIDTH / 2, fy: SCENE_HEIGHT / 2, followUid: null };

/** Giữ zoom trong [1, 2,5] và khung nhìn không vượt biên cảnh. */
export function clampCamera(c: CameraState): CameraState {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(c.zoom) ? c.zoom : 1));
  const hw = SCENE_WIDTH / (2 * zoom);
  const hh = SCENE_HEIGHT / (2 * zoom);
  const fx = Math.min(SCENE_WIDTH - hw, Math.max(hw, Number.isFinite(c.fx) ? c.fx : SCENE_WIDTH / 2));
  const fy = Math.min(SCENE_HEIGHT - hh, Math.max(hh, Number.isFinite(c.fy) ? c.fy : SCENE_HEIGHT / 2));
  return { ...c, zoom, fx, fy };
}

/** Khung cảnh cơ sở (letterbox 16:9) trong px CSS. */
export interface SceneBox {
  x: number;
  y: number;
  /** px CSS mỗi px cảnh ở zoom 1. */
  k0: number;
}

export function sceneBox(cssWidth: number, cssHeight: number): SceneBox {
  const k0 = Math.max(0.05, Math.min(cssWidth / SCENE_WIDTH, cssHeight / SCENE_HEIGHT));
  return { x: (cssWidth - SCENE_WIDTH * k0) / 2, y: (cssHeight - SCENE_HEIGHT * k0) / 2, k0 };
}

/** Gốc toạ độ màn hình (ox, oy) và tỉ lệ k cho camera: điểm cục bộ (fx, fy) nằm ở tâm khung. */
export function cameraTransform(box: SceneBox, c: CameraState): { k: number; ox: number; oy: number } {
  const k = box.k0 * c.zoom;
  return { k, ox: box.x + (SCENE_WIDTH / 2) * box.k0 - c.fx * k, oy: box.y + (SCENE_HEIGHT / 2) * box.k0 - c.fy * k };
}

/** Điểm cục bộ của cảnh dưới vị trí màn hình (px CSS). */
export function screenToLocal(box: SceneBox, c: CameraState, s: Vec): Vec {
  const { k, ox, oy } = cameraTransform(box, c);
  return { x: (s.x - ox) / k, y: (s.y - oy) / k };
}

/** Zoom quanh một điểm màn hình: điểm cảnh dưới ngón tay/chuột đứng yên. */
export function zoomAround(box: SceneBox, c: CameraState, zoom: number, s: Vec): CameraState {
  const local = screenToLocal(box, c, s);
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  const k = box.k0 * z;
  const fx = (box.x + (SCENE_WIDTH / 2) * box.k0 - s.x) / k + local.x;
  const fy = (box.y + (SCENE_HEIGHT / 2) * box.k0 - s.y) / k + local.y;
  const next = clampCamera({ ...c, zoom: z, fx, fy, mode: z <= ZOOM_MIN + 1e-6 ? 'overview' : c.mode === 'focus' ? 'focus' : 'free' });
  return next.mode === 'overview' ? { ...OVERVIEW } : next;
}

/** Kéo camera theo độ dời màn hình (px CSS). Kéo khi đang Focus chuyển sang Free. */
export function panBy(box: SceneBox, c: CameraState, dx: number, dy: number): CameraState {
  if (c.zoom <= ZOOM_MIN + 1e-6) return c;
  const k = box.k0 * c.zoom;
  return clampCamera({ ...c, mode: 'free', followUid: null, fx: c.fx - dx / k, fy: c.fy - dy / k });
}

/** Bật Focus vào rồng tại điểm cục bộ (chỉ khi người chơi yêu cầu). */
export function focusOn(c: CameraState, uid: string, local: Vec, zoom = FOCUS_ZOOM): CameraState {
  return clampCamera({ mode: 'focus', zoom: Math.max(zoom, c.mode === 'free' ? c.zoom : zoom), fx: local.x, fy: local.y - FOCUS_LIFT, followUid: uid });
}

/** Cập nhật Focus theo vị trí mới của rồng. */
export function follow(c: CameraState, local: Vec): CameraState {
  if (c.mode !== 'focus') return c;
  return clampCamera({ ...c, fx: local.x, fy: local.y - FOCUS_LIFT });
}
