/**
 * Hướng dẫn 0–15 phút (GDD 3.1 trang 4; ADR 0009 mục 4; ADR 0013).
 * Chuỗi TUT_01–TUT_08 do tác giả quyết định 25/11/2026. Mỗi bước hoàn thành khi **engine** thấy điều kiện
 * trong GameState — UI không có lệnh tự khai báo hoàn thành. Bỏ qua được và xem lại được (GDD trang 4).
 */

export const TUTORIAL_STEP_IDS = ['TUT_01', 'TUT_02', 'TUT_03', 'TUT_04', 'TUT_05', 'TUT_06', 'TUT_07', 'TUT_08'] as const;
export type TutorialStepId = (typeof TUTORIAL_STEP_IDS)[number];

export function isTutorialStepId(v: unknown): v is TutorialStepId {
  return typeof v === 'string' && (TUTORIAL_STEP_IDS as readonly string[]).includes(v);
}

/** TUT_01 "quan sát Emberling": thời gian chơi tối thiểu kể từ khi bắt đầu hướng dẫn (đề xuất, ADR 0013). */
export const TUTORIAL_OBSERVE_MS = 15_000;

/**
 * Gói Starter hướng dẫn (GDD trang 4, 15; S01): giá Starter 100 G, kết quả cố định Sproutling (`sprout`, nhóm T),
 * Normal, không tính pity. Mỗi save một lần; dùng được cả khi bỏ qua hướng dẫn ("Starter tutorial ngoại lệ công khai").
 */
export const TUTORIAL_PACK = { packId: 'starter', speciesId: 'sprout', mutation: 'normal' } as const;
