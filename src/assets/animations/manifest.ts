import type { GrowthStage, MutationType } from '../../types/game';
import type { AttachPoint, CommonSpeciesId, PoseId } from './dragonAnimations';
import { resolvePose } from './dragonAnimations';
import frameData from './frame-data.json';
import frameMetrics from './frame-metrics.json';

/**
 * Manifest khung hoạt ảnh rồng (G1 PR2). Khung = sprite 240×200 không bóng, cùng điểm neo
 * (120,170) với sprite gốc. Droplet/Sproutling/Zephyr sinh bởi
 * `scripts/art/generate-common-dragons.mjs`; khung Emberling dẫn xuất từ file G0 (không sửa file gốc).
 */

export interface DragonFrameAsset {
  /** `dragon.<speciesId>.<stage>.<mutation>.<pose>` */
  assetId: string;
  speciesId: CommonSpeciesId;
  stage: GrowthStage;
  mutation: MutationType;
  pose: PoseId;
  url: string;
  /** Điểm gắn hiệu ứng (px viewBox), đã theo tỉ lệ stage. `ground` = điểm neo. */
  attach: Readonly<Partial<Record<AttachPoint, readonly [number, number]>>>;
  /** Hộp va chạm minh họa đo trên biến thể Normal; không dùng cho logic domain. */
  hitbox: { x: number; y: number; w: number; h: number };
  tier: 'prototype';
}

const files = import.meta.glob<string>('./frames/*/*.svg', { eager: true, query: '?url&no-inline', import: 'default' });

type AttachTable = Record<string, Record<string, Record<string, Record<string, [number, number]>>>>;
type HitboxTable = Record<string, Record<string, Record<string, { x: number; y: number; w: number; h: number }>>>;
const ATTACH = frameData.attach as unknown as AttachTable;
const HITBOX = frameMetrics.hitbox as unknown as HitboxTable;
export const FRAME_POSES = frameData.poses as unknown as Readonly<Record<CommonSpeciesId, readonly PoseId[]>>;

const SPECIES: readonly CommonSpeciesId[] = ['emberling', 'droplet', 'sprout', 'zephyr'];
const STAGES: readonly GrowthStage[] = ['baby', 'juvenile', 'adult'];
const MUTATIONS: readonly MutationType[] = ['normal', 'crystal', 'golden', 'prismatic'];

function build(): DragonFrameAsset[] {
  const out: DragonFrameAsset[] = [];
  for (const speciesId of SPECIES) {
    for (const stage of STAGES) {
      for (const mutation of MUTATIONS) {
        for (const pose of FRAME_POSES[speciesId]) {
          const url = files[`./frames/${speciesId}/${stage}_${mutation}_${pose}.svg`];
          const attach = ATTACH[speciesId]?.[stage]?.[pose];
          const hitbox = HITBOX[speciesId]?.[stage]?.[pose];
          if (!url || !attach || !hitbox) throw new Error(`Incomplete frame ${speciesId}/${stage}_${mutation}_${pose}`);
          out.push({
            assetId: `dragon.${speciesId}.${stage}.${mutation}.${pose}`,
            speciesId,
            stage,
            mutation,
            pose,
            url,
            attach: { ...attach, ground: [120, 170] },
            hitbox,
            tier: 'prototype',
          });
        }
      }
    }
  }
  return out;
}

export const DRAGON_FRAMES: readonly DragonFrameAsset[] = build();

/** Khung cho tư thế (đã áp POSE_FALLBACK); null nếu loài không có tư thế đó (ví dụ Sproutling bơi). */
export function getDragonFrame(speciesId: CommonSpeciesId, stage: GrowthStage, mutation: MutationType, pose: PoseId): DragonFrameAsset | null {
  const p = resolvePose(speciesId, pose);
  return DRAGON_FRAMES.find((f) => f.speciesId === speciesId && f.stage === stage && f.mutation === mutation && f.pose === p) ?? null;
}
