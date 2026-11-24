import type { Rarity } from '../types/game';

/** GDD 3.1 trang 8. */

/** Trọng số chọn nhóm hiếm của con (60/30/9/1), bỏ nhóm rỗng rồi chuẩn hóa. */
export const OFFSPRING_RARITY_WEIGHTS: Readonly<Record<Rarity, number>> = {
  common: 60,
  rare: 30,
  epic: 9,
  legendary: 1,
};

/** Phí lai theo độ hiếm cao nhất (G). */
export const BREED_FEE_G: Readonly<Record<Rarity, number>> = {
  common: 80,
  rare: 350,
  epic: 1500,
  legendary: 5000,
};

/** Thời gian ấp cơ bản theo độ hiếm của kết quả (giây). */
export const BASE_HATCH_SEC: Readonly<Record<Rarity, number>> = {
  common: 5 * 60,
  rare: 15 * 60,
  epic: 60 * 60,
  legendary: 180 * 60,
};

export const PARENT_COOLDOWN_MS = 10 * 60 * 1000;
