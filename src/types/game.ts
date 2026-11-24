/**
 * Hợp đồng kiểu dữ liệu lõi của Dravio (GDD 3.1, Phụ lục C).
 * Giá trị suy ra (stage, kiểu hình, vàng/s) KHÔNG được lưu trong save.
 */

import type { G0Anatomy } from './biology';

export type ElementType = 'fire' | 'water' | 'nature' | 'sky';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type MutationType = 'normal' | 'crystal' | 'golden' | 'prismatic';
export type GrowthStage = 'baby' | 'juvenile' | 'adult';
export type LanguageCode = 'vi' | 'en';
export type Realm = 'land' | 'ocean' | 'sky';
/** Nhóm sinh sản: T = đất, A = thủy-lưỡng cư, V = bay. Khác với Realm. */
export type BreedingGroup = 'T' | 'A' | 'V';
export type Personality = 'playful' | 'calm' | 'curious' | 'shy';
export type BodyStyle = 'round' | 'serpent' | 'winged' | 'horned';

/** Mỗi locus giữ hai allele, một từ mỗi bố mẹ. */
export type Genotype = Readonly<Record<string, readonly [string, string]>>;

export const RARITY_ORDER: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export function rarityRank(r: Rarity): number {
  return RARITY_ORDER.indexOf(r);
}

/**
 * Anatomy giả tưởng của loài (G0 Decision Pack, ADR 0003): hô hấp, vận động, thức ăn,
 * dải nhiệt/độ mặn/độ sâu/độ cao, ngưỡng thoải mái và sức chống chịu.
 * Nguồn duy nhất: `src/data/g0Biology.ts`. KHÔNG suy ra từ nguyên tố hay nhóm.
 */
export type Anatomy = Omit<G0Anatomy, 'group' | 'habitatRules' | 'palette' | 'silhouetteVi' | 'draft'> & {
  /** false khi số liệu đã được chốt ở G0 (ADR 0003). */
  draft: boolean;
};

export interface DragonSpecies {
  id: string;
  elements: readonly [ElementType] | readonly [ElementType, ElementType];
  rarity: Rarity;
  group: BreedingGroup;
  /** Các realm mà loài có thể sống (theo cột "sinh cảnh" trang 6). */
  realms: readonly Realm[];
  /** Ghi chú sinh cảnh đặc thù: 'humid' (đất ẩm), 'hot' (đất nóng), 'cold-water', 'sea'. */
  habitatTags: readonly string[];
  anatomy: Anatomy;
  /** Microhabitat hợp lệ (ID trong HABITAT_PROFILES). */
  habitatRules: readonly string[];
  palette: Readonly<Record<'primary' | 'secondary' | 'belly' | 'accent', string>>;
  /** Mô tả silhouette (VI) cho art bible. */
  silhouetteVi: string;
  loci: readonly string[];
  packEligible: boolean;
  /** Vàng/giây cơ bản tính bằng microG (1 G = 1_000_000 microG). */
  baseRateMicroG: number;
  growthTimeSec: number;
  baseSellG: number;
  bodyStyle: BodyStyle;
  assetId: string;
}

export type Location =
  | { kind: 'zone'; zoneId: string; habitatId?: string }
  | { kind: 'storage' }
  | { kind: 'shelter'; zoneId: string }
  | { kind: 'care'; caseId: string }
  | { kind: 'released' };

export interface DragonInstance {
  uid: string;
  speciesId: string;
  nickname?: string;
  genotype: Genotype;
  mutation: MutationType;
  xpSec: number;
  locked: boolean;
  location: Location;
  hatchedAtMs: number;
  personality: Personality;
  /** Gắn bó 0–100, số nguyên; không giảm khi offline. */
  bond: number;
  /** Ngày UTC (YYYY-MM-DD) của bộ đếm bondDaily. */
  bondDay?: string;
  /** Bond đã nhận trong bondDay (tối đa 10/ngày UTC/rồng). */
  bondDaily?: number;
  /** Lần cuối nhận XP từ thức ăn (ms). */
  lastFeedXpAtMs?: number;
  /** Lần cuối được vuốt ve (ms). */
  lastPetAtMs?: number;
  parentIds: readonly [string, string] | null;
  /** Ông bà đã biết (nếu có), dùng để kiểm tra huyết thống. */
  grandparentIds?: readonly string[];
  generation: number;
  ancestry: 'known' | 'unknown';
  origin: 'pack' | 'breed' | 'rescue' | 'gift';
  activity: 'idle' | 'breeding' | 'expedition' | 'care';
  breedCooldownUntilMs: number;
  registryRef?: string;
}
