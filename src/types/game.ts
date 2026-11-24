/**
 * Hợp đồng kiểu dữ liệu lõi của Dravio (GDD 3.1, Phụ lục C).
 * Giá trị suy ra (stage, kiểu hình, vàng/s) KHÔNG được lưu trong save.
 */

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
 * Anatomy giả tưởng. Ngưỡng chi tiết (nhiệt, độ mặn, độ sâu, độ cao) là đầu việc G0
 * và KHÔNG được tự suy ra từ nguyên tố.
 */
export interface Anatomy {
  respiration: 'lung' | 'gill' | 'dual';
  locomotion: readonly ('walk' | 'swim' | 'fly' | 'burrow')[];
  protection: 'scale' | 'armor' | 'fur';
  activity: 'day' | 'night' | 'both';
  /** true khi cấu hình anatomy còn là bản nháp chờ chốt ở G0. */
  draft: boolean;
}

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
  | { kind: 'zone'; zoneId: string }
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
  bond: number;
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
