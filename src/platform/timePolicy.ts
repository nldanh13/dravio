/**
 * Quy tắc thời gian online/offline cho trình duyệt (GDD 3.1 trang 9, 18; ADR 0010).
 * - Online (100 %) chỉ khi World đang hiển thị và tick 1 Hz chạy đều.
 * - Ẩn tab / thu nhỏ cửa sổ / trang bị đóng băng: quyết toán online tới lúc ẩn, rồi khi hiện lại
 *   tính phần vắng mặt là offline (75 %, chặn 24 h, receipt nếu > 60 s).
 * - Máy ngủ hoặc tab bị treo mà không có sự kiện ẩn: tick kế tiếp thấy khoảng trống lớn hơn
 *   ONLINE_GAP_LIMIT_MS → cả khoảng trống tính offline.
 */

export const TICK_MS = 1000;
/** Khoảng trống tối đa giữa hai lần quyết toán vẫn được coi là online. */
export const ONLINE_GAP_LIMIT_MS = 5000;

export type AdvanceMode = 'online' | 'offline';

/** Chế độ cho một lần quyết toán, từ thời điểm quyết toán trước (`lastProcessedAtMs`). */
export function advanceModeFor(lastProcessedAtMs: number, nowMs: number, visible: boolean): AdvanceMode {
  if (!visible) return 'offline';
  return nowMs - lastProcessedAtMs > ONLINE_GAP_LIMIT_MS ? 'offline' : 'online';
}
