/**
 * Hằng số cho ăn và gắn bó (GDD 3.1 trang 7, Phụ lục F/G; ADR 0003; AI_HANDOFF G1 PR1).
 */

/** Khoảng cách tối thiểu giữa hai lần thả thức ăn. */
export const FOOD_SPAWN_INTERVAL_MS = 800;
/** Thời gian tồn tại của viên thức ăn. */
export const FOOD_TTL_MS = 12_000;
/** Mỗi rồng nhận XP từ ăn tối đa một lần mỗi 8 s. */
export const FEED_XP_COOLDOWN_MS = 8_000;
/** Số viên đồng thời tối đa = 5 + cấp foodCooldownLevel. */
export const FOOD_MAX_BASE = 5;

/** XP ăn = 8 + 6 × cấp foodQualityLevel (giây). */
export function feedXpSec(foodQualityLevel: number): number {
  return 8 + 6 * foodQualityLevel;
}

export const DIET_IDS = ['fruit', 'leaf', 'aquatic', 'aether'] as const;
export type DietId = (typeof DIET_IDS)[number];

export const PET_COOLDOWN_MS = 30_000;
export const BOND_MAX = 100;
/** Vuốt ve +1, ăn hợp lệ +1, tối đa +10/ngày UTC/rồng. */
export const BOND_DAILY_CAP = 10;

/** Tên rồng: 1–24 grapheme sau khi trim (đề xuất AI_HANDOFF, ghi trong ADR 0004). */
export const NICKNAME_MAX_GRAPHEMES = 24;

/** Số requestId gần nhất được nhớ để chống xử lý trùng. */
export const PROCESSED_REQUEST_LIMIT = 200;

/** Offline > 60 s mới tạo receipt/modal (GDD Phụ lục G). */
export const OFFLINE_RECEIPT_MIN_MS = 60_000;
