import type { GrowthStage, MutationType } from '../../types/game';
import metrics from './common/sprite-metrics.json';

/**
 * Manifest sprite rồng Common (G1) — bổ sung, độc lập với `src/assets/manifest.ts` (G0).
 * Không di chuyển asset Emberling: 12 sprite Emberling được tham chiếu tại chỗ
 * (`src/assets/g0/emberling/`), 36 sprite mới nằm ở `src/assets/dragons/common/`.
 * Tài liệu: `docs/art/COMMON_DRAGONS.md`. Chỉ dùng asset đóng gói cục bộ.
 */

export type AssetTier = 'prototype' | 'production';
export type AssetReview = 'approved-prototype' | 'pending-author-review' | 'approved';

export interface DragonAssetSource {
  /** Nguồn gốc. */
  origin: string;
  /** Quyền sử dụng. */
  license: string;
  /** prototype ≠ art thương mại cuối cùng (G3). */
  tier: AssetTier;
  review: AssetReview;
}

export interface SpriteAnchor {
  /** Điểm neo chân trong viewBox 240×200 (đơn vị px của viewBox). */
  x: number;
  y: number;
}

export interface SpriteBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DragonSpriteAsset {
  /** ID ổn định: `dragon.<speciesId>.<stage>.<mutation>`. */
  assetId: string;
  speciesId: 'emberling' | 'droplet' | 'sprout' | 'zephyr';
  stage: GrowthStage;
  /** Biến thể Aether — KHÔNG phải kiểu hình di truyền. */
  mutation: MutationType;
  url: string;
  /** Kích thước gốc của SVG (px) = viewBox. */
  width: number;
  height: number;
  anchor: SpriteAnchor;
  /** Hệ số tỉ lệ stage đã nướng sẵn trong SVG (Baby 0.68, Juvenile 0.85, Adult 1). */
  stageScale: number;
  /** Hướng nhìn mặc định; renderer lật ngang quanh anchor.x khi di chuyển sang trái. */
  facing: 'right';
  /** Hộp va chạm minh họa (đo từ biến thể Normal), không dùng cho logic domain. */
  hitbox: SpriteBox;
  /**
   * Lớp SVG tách được. Emberling G0 là bản vẽ phẳng (biến thể đổi palette toàn thân),
   * nên chỉ có `flat`; ba loài mới có lớp phenotype tách khỏi lớp Aether.
   */
  layers: readonly SpriteLayer[];
  source: DragonAssetSource;
}

export type SpriteLayer = 'flat' | 'shadow' | 'body' | 'pattern' | 'aether-tint' | 'eye' | 'aether-fx' | 'badge';

export const COMMON_SPECIES = ['emberling', 'droplet', 'sprout', 'zephyr'] as const;
export const SPRITE_STAGES: readonly GrowthStage[] = ['baby', 'juvenile', 'adult'];
export const SPRITE_MUTATIONS: readonly MutationType[] = ['normal', 'crystal', 'golden', 'prismatic'];
export const STAGE_SCALE: Readonly<Record<GrowthStage, number>> = { baby: 0.68, juvenile: 0.85, adult: 1 };
export const SPRITE_ANCHOR: SpriteAnchor = { x: 120, y: 170 };

const EMBERLING_G0: DragonAssetSource = {
  origin: 'Dravio G0 Decision Pack 1.0 — vector tự tạo cho dự án, không dùng tài nguyên bên thứ ba',
  license: 'Thuộc dự án Dravio',
  tier: 'prototype',
  review: 'approved-prototype',
};

const COMMON_G1: DragonAssetSource = {
  origin: 'Dravio G1 — vector tự tạo, sinh tất định bởi scripts/art/generate-common-dragons.mjs; không dùng tài nguyên bên thứ ba',
  license: 'Thuộc dự án Dravio',
  tier: 'prototype',
  review: 'approved-prototype',
};

const emberlingFiles = import.meta.glob<string>('../g0/emberling/{baby,juvenile,adult}_*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});
const commonFiles = import.meta.glob<string>('./common/*/{baby,juvenile,adult}_*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

const NEW_LAYERS_NORMAL: readonly SpriteLayer[] = ['shadow', 'body', 'pattern', 'eye'];
const NEW_LAYERS_AETHER: readonly SpriteLayer[] = ['shadow', 'body', 'pattern', 'aether-tint', 'eye', 'aether-fx', 'badge'];

function build(): DragonSpriteAsset[] {
  const out: DragonSpriteAsset[] = [];
  for (const speciesId of COMMON_SPECIES) {
    for (const stage of SPRITE_STAGES) {
      for (const mutation of SPRITE_MUTATIONS) {
        const isEmber = speciesId === 'emberling';
        const key = isEmber ? `../g0/emberling/${stage}_${mutation}.svg` : `./common/${speciesId}/${stage}_${mutation}.svg`;
        const url = (isEmber ? emberlingFiles : commonFiles)[key];
        if (!url) throw new Error(`Missing sprite ${key}`);
        const hitbox = metrics.hitbox[speciesId][stage];
        out.push({
          assetId: `dragon.${speciesId}.${stage}.${mutation}`,
          speciesId,
          stage,
          mutation,
          url,
          width: 240,
          height: 200,
          anchor: SPRITE_ANCHOR,
          stageScale: STAGE_SCALE[stage],
          facing: 'right',
          hitbox,
          layers: isEmber ? ['flat'] : mutation === 'normal' ? NEW_LAYERS_NORMAL : NEW_LAYERS_AETHER,
          source: isEmber ? EMBERLING_G0 : COMMON_G1,
        });
      }
    }
  }
  return out;
}

/** 48 sprite Common = 4 loài × 3 stage × 4 biến thể Aether. */
export const COMMON_DRAGON_SPRITES: readonly DragonSpriteAsset[] = build();

export function getCommonDragonSprite(speciesId: string, stage: GrowthStage, mutation: MutationType): DragonSpriteAsset | null {
  return COMMON_DRAGON_SPRITES.find((s) => s.speciesId === speciesId && s.stage === stage && s.mutation === mutation) ?? null;
}
