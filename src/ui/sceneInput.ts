import type { TimeOfDay } from '../assets/habitats/origin/manifest';
import type { GameSettings } from '../types/state';

/**
 * Quy tắc nhập liệu và thời điểm của cảnh (thuần, có test).
 */

/** GDD Phụ lục G: "Space: cho ăn … Không bắt phím khi nhập". Chỉ khi đang ở cảnh và được phép ghi. */
export function shouldFeedOnSpace(e: {
  key: string;
  repeat: boolean;
  /** Thẻ HTML đang nhận phím. */
  targetTag: string | undefined;
  targetEditable: boolean;
  /** Tiêu điểm đang nằm trong khung cảnh (canvas/khung bao). */
  inScene: boolean;
  /** Trạng thái phiên ('ready' mới được ghi; 'read-only', 'conflict'… thì không). */
  status: string;
  modifier: boolean;
}): boolean {
  if (e.key !== ' ' && e.key !== 'Spacebar') return false;
  if (e.repeat || e.modifier) return false;
  if (e.targetEditable) return false;
  const tag = (e.targetTag ?? '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return false;
  return e.inScene && e.status === 'ready';
}

/** Đêm mặc định 20:00–06:00 giờ địa phương; chế độ thủ công day/sunset/night (GDD GameSettings.timeMode). */
export function timeOfDayFor(mode: GameSettings['timeMode'], localHour: number): TimeOfDay {
  if (mode === 'day') return 'day';
  if (mode === 'sunset') return 'dusk';
  if (mode === 'night') return 'night';
  return localHour >= 20 || localHour < 6 ? 'night' : 'day';
}
