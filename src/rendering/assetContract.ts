import type { AssetSource } from '../assets/manifest';
import { COMMON_DRAGON_SPRITES, SPRITE_ANCHOR } from '../assets/dragons/manifest';
import type { GrowthStage, MutationType } from '../types/game';

/**
 * Hợp đồng tài nguyên cho renderer (G1 PR4; ADR 0011; `docs/rendering/ASSET_CONTRACT.md`).
 *
 * Đồ họa (sprite, animation, nền sinh cảnh) thuộc AI 2. Renderer chỉ đọc manifest này,
 * không tự vẽ đồ họa thay thế: thiếu asset → vẽ **dấu hiệu thiếu asset** trung tính
 * (`placeholder: true`) để dễ phát hiện, không bao giờ coi là art.
 */

export const RENDER_MANIFEST_VERSION = 1;
export const STAGES: readonly GrowthStage[] = ['baby', 'juvenile', 'adult'];
export const MUTATIONS: readonly MutationType[] = ['normal', 'crystal', 'golden', 'prismatic'];
export const ANIMATION_IDS = ['idle', 'walk', 'swim', 'fly', 'eat', 'rest', 'sleep', 'pet'] as const;
export type AnimationId = (typeof ANIMATION_IDS)[number];

/** Dải khung hình nằm ngang trong một ảnh (tùy chọn). Không có → renderer dùng biến đổi thủ tục trên ảnh tĩnh. */
export interface FrameStrip {
  url: string;
  frames: number;
  /** Thời gian một vòng, ms. */
  durationMs: number;
  loop: boolean;
}

export interface SpriteAsset {
  /** Ảnh tĩnh (SVG/PNG/WebP đóng gói cục bộ). */
  url: string;
  /** Kích thước khung, px nguồn. */
  width: number;
  height: number;
  /** Điểm neo dưới chân, px nguồn (ART_DIRECTION: "Anchor dưới chân"). */
  anchorX: number;
  anchorY: number;
  /** true nếu tỉ lệ stage (0,68/0,85/1,0) đã nằm trong ảnh; false → renderer nhân tỉ lệ. */
  stageScaled: boolean;
  /** Hướng nhìn của ảnh gốc; renderer lật ngang theo vận tốc. */
  facing: 'left' | 'right';
  animations?: Partial<Record<AnimationId, FrameStrip>>;
  source: AssetSource;
}

export interface HabitatAsset {
  /** Lớp nền mặt đất của microhabitat. */
  groundUrl?: string;
  /** Vật cản/trang trí, toạ độ theo đơn vị thế giới của bố cục. */
  props?: { url: string; x: number; y: number; width: number; height: number }[];
  source: AssetSource;
}

export interface RenderManifest {
  version: number;
  /** speciesId → stage → mutation → sprite. */
  dragons: Record<string, Partial<Record<GrowthStage, Partial<Record<MutationType, SpriteAsset>>>>>;
  /** habitatId → nền. Chưa có asset nào ở G1 (AI 2). */
  habitats: Record<string, HabitatAsset>;
}

const LOCAL_URL = /^(\/|\.\/|data:image\/|blob:)/;

/** Kiểm manifest trước khi dùng: phiên bản, URL cục bộ, kích thước, neo, animation. */
export function validateRenderManifest(m: unknown): string[] {
  const errors: string[] = [];
  if (typeof m !== 'object' || m === null) return ['manifest: not an object'];
  const man = m as Partial<RenderManifest>;
  if (man.version !== RENDER_MANIFEST_VERSION) errors.push(`version: expected ${RENDER_MANIFEST_VERSION}`);
  const urlOk = (u: unknown) => typeof u === 'string' && LOCAL_URL.test(u);
  for (const [species, stages] of Object.entries(man.dragons ?? {})) {
    for (const [stage, variants] of Object.entries(stages ?? {})) {
      if (!(STAGES as readonly string[]).includes(stage)) errors.push(`dragons.${species}.${stage}: unknown stage`);
      for (const [mutation, s] of Object.entries(variants ?? {})) {
        const p = `dragons.${species}.${stage}.${mutation}`;
        if (!(MUTATIONS as readonly string[]).includes(mutation)) errors.push(`${p}: unknown mutation`);
        if (!s) continue;
        if (!urlOk(s.url)) errors.push(`${p}.url: must be a bundled local asset`);
        if (!(s.width > 0 && s.height > 0)) errors.push(`${p}: invalid size`);
        if (!(s.anchorX >= 0 && s.anchorX <= s.width && s.anchorY >= 0 && s.anchorY <= s.height)) errors.push(`${p}: anchor outside frame`);
        if (!s.source?.origin || !s.source.license) errors.push(`${p}.source: provenance required`);
        for (const [anim, strip] of Object.entries(s.animations ?? {})) {
          if (!(ANIMATION_IDS as readonly string[]).includes(anim)) errors.push(`${p}.animations.${anim}: unknown animation`);
          if (strip && (!urlOk(strip.url) || !Number.isInteger(strip.frames) || strip.frames < 1 || !(strip.durationMs > 0))) errors.push(`${p}.animations.${anim}: invalid strip`);
        }
      }
    }
  }
  for (const [h, a] of Object.entries(man.habitats ?? {})) {
    if (a.groundUrl !== undefined && !urlOk(a.groundUrl)) errors.push(`habitats.${h}.groundUrl: must be a bundled local asset`);
    if (!a.source?.origin) errors.push(`habitats.${h}.source: provenance required`);
  }
  return errors;
}

/**
 * Manifest sprite tĩnh mặc định: 48 sprite Common (4 loài × 3 stage × 4 biến thể, ADR 0101).
 * Neo chân (120, 170) — đúng điểm chạm đất trong SVG (bóng elip có tâm 175 nằm dưới chân);
 * PR4 dùng 175 (tâm bóng), đã sửa ở ADR 0012 để khớp khung hoạt ảnh.
 * Cảnh hoạt ảnh dùng khung + clip (`src/assets/animations`), không dùng manifest này.
 */
export function defaultRenderManifest(): RenderManifest {
  const dragons: RenderManifest['dragons'] = {};
  for (const s of COMMON_DRAGON_SPRITES) {
    const bySpecies = (dragons[s.speciesId] ??= {});
    const byStage = (bySpecies[s.stage] ??= {});
    byStage[s.mutation] = {
      url: s.url,
      width: s.width,
      height: s.height,
      anchorX: SPRITE_ANCHOR.x,
      anchorY: SPRITE_ANCHOR.y,
      stageScaled: true,
      facing: 'right',
      source: { origin: s.source.origin, license: s.source.license, review: s.source.review },
    };
  }
  return { version: RENDER_MANIFEST_VERSION, dragons, habitats: {} };
}
