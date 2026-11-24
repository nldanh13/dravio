/**
 * Điều kiện mở microhabitat Khởi Nguyên (quyết định tác giả 25/11/2026; ADR 0009).
 * Mở khóa miễn phí, không cộng chỗ, không cộng ngân sách sản xuất.
 * Điều kiện là một **khám phá** (discovery) chứ không phải bước tutorial, để bỏ qua
 * hướng dẫn không làm mất khả năng mở: PR5 ghi nhận khám phá qua TUT_04/TUT_06
 * hoặc qua nhiệm vụ khám phá tương đương khi người chơi bỏ hướng dẫn.
 */

export const DISCOVERY_IDS = ['DISC_EMBERLING_THERMAL', 'DISC_AQUATIC_HABITAT'] as const;
export type DiscoveryId = (typeof DISCOVERY_IDS)[number];

export interface HabitatUnlockRule {
  /** Mở sẵn trong save mới. */
  default: boolean;
  /** Khám phá cần có trước khi `unlockHabitat` được chấp nhận. */
  requires: DiscoveryId | null;
}

export const HABITAT_UNLOCK_RULES: Readonly<Record<'origin_meadow' | 'origin_pondbank' | 'origin_warm_rocks', HabitatUnlockRule>> = {
  origin_meadow: { default: true, requires: null },
  /** TUT_04 — khám phá nhu cầu nhiệt độ của Emberling. */
  origin_warm_rocks: { default: false, requires: 'DISC_EMBERLING_THERMAL' },
  /** TUT_06 — khảo sát môi trường thủy sinh. Không cần sở hữu Droplet. */
  origin_pondbank: { default: false, requires: 'DISC_AQUATIC_HABITAT' },
};

export function isDiscoveryId(v: unknown): v is DiscoveryId {
  return typeof v === 'string' && (DISCOVERY_IDS as readonly string[]).includes(v);
}
