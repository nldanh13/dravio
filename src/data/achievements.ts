/**
 * 12 achievement ID và mức thưởng v2 (GDD 3.1 Phụ lục F). ID ổn định, không đổi.
 * Mở một lần, nhận một lần; mặc định tự nhận trong cùng transaction (GDD Phụ lục F).
 * Thưởng không tính vào `totalGoldEarnedMicro` (GDD: chỉ vàng sản xuất và bonus offline).
 *
 * G1 PR5 chỉ cài điều kiện của ACH_FIRST_HATCH và ACH_FIRST_ADULT (kịch bản S01). Các điều kiện còn lại
 * cần hệ thống chưa có (lai, Codex, trang trí…) và thuộc G2; chúng không bao giờ được mở ở bản này.
 */

export const ACHIEVEMENT_IDS = [
  'ACH_FIRST_HATCH',
  'ACH_FIRST_ADULT',
  'ACH_FIRST_BREED',
  'ACH_MUTATION_CRYSTAL',
  'ACH_MUTATION_GOLDEN',
  'ACH_MUTATION_PRISMATIC',
  'ACH_LEGENDARY',
  'ACH_GOLD_10K',
  'ACH_GOLD_250K',
  'ACH_DECOR_ALL',
  'ACH_CODEX_16',
  'ACH_CODEX_MASTER',
] as const;
export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

export const ACHIEVEMENT_REWARD_G: Readonly<Record<AchievementId, number>> = {
  ACH_FIRST_HATCH: 50,
  ACH_FIRST_ADULT: 100,
  ACH_FIRST_BREED: 150,
  ACH_MUTATION_CRYSTAL: 100,
  ACH_MUTATION_GOLDEN: 300,
  ACH_MUTATION_PRISMATIC: 1000,
  ACH_LEGENDARY: 2000,
  ACH_GOLD_10K: 300,
  ACH_GOLD_250K: 2500,
  ACH_DECOR_ALL: 1000,
  ACH_CODEX_16: 2000,
  ACH_CODEX_MASTER: 3000,
};

export function isAchievementId(v: unknown): v is AchievementId {
  return typeof v === 'string' && (ACHIEVEMENT_IDS as readonly string[]).includes(v);
}
