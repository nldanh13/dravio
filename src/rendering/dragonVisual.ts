import {
  clipPhase,
  poseAt,
  resolveDragonClip,
  resolvePose,
  sampleTrack,
  type CommonSpeciesId,
  type DragonClip,
  type FxCue,
  type PoseId,
  type TransformKey,
} from '../assets/animations/dragonAnimations';
import { getDragonFrame, type DragonFrameAsset } from '../assets/animations/manifest';
import { DRAGON_SCENE_SCALE } from '../assets/habitats/origin/manifest';
import type { GrowthStage } from '../types/game';
import type { Agent } from './livingWorld';

/**
 * Hình ảnh của một rồng tại một thời điểm (ADR 0012) — hàm thuần, không DOM:
 * clip theo `agent.anim`, pha theo quãng đường (walk/swim/fly, khớp sải bước) hoặc thời gian,
 * khung theo flipbook + nhấp nháy, transform theo track. Thay cho biến đổi thủ tục của PR4.
 *
 * Quy ước tỉ lệ (không áp stageScale hai lần):
 * - khung SVG đã nướng tỉ lệ stage → vẽ khung 240×200 với hệ số `DRAGON_SCENE_SCALE`;
 * - dx/dy của track là px viewBox Adult → nhân `stageScale × DRAGON_SCENE_SCALE`;
 * - độ cao bay (`agent.z`) đã là px cảnh, KHÔNG nhân stageScale.
 */

export const STAGE_SCALE: Readonly<Record<GrowthStage, number>> = { baby: 0.68, juvenile: 0.85, adult: 1 };
const IDENTITY: TransformKey = { t: 0, dx: 0, dy: 0, sx: 1, sy: 1, rot: 0 };

export interface DragonVisual {
  clip: DragonClip;
  /** Pha 0..1 trong clip. */
  t: number;
  pose: PoseId;
  frame: DragonFrameAsset | null;
  /** Transform tính theo px cảnh (đã nhân tỉ lệ). */
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  rot: number;
}

export function strideScene(clip: DragonClip, stage: GrowthStage): number {
  return (clip.stridePx ?? 36) * DRAGON_SCENE_SCALE * STAGE_SCALE[stage];
}

/** Pha clip: clip di chuyển theo quãng đường (chân không trượt), còn lại theo thời gian. */
export function phaseOf(a: Pick<Agent, 'anim' | 'stage'>, clip: DragonClip, simMs: number): number {
  if (clip.stridePx && (clip.state === 'walk' || clip.state === 'swim' || clip.state === 'fly')) {
    if (clip.state === 'fly') return clipPhase(clip, simMs - a.anim.since);
    const s = strideScene(clip, a.stage);
    return s > 0 ? (a.anim.dist / s) % 1 : 0;
  }
  return clipPhase(clip, simMs - a.anim.since);
}

export function dragonVisual(a: Agent, simMs: number, reduced: boolean): DragonVisual | null {
  const species = a.speciesId as CommonSpeciesId;
  const clip = resolveDragonClip(species, a.anim.state) ?? resolveDragonClip(species, 'idle');
  if (!clip) return null;
  const t = reduced ? 0 : phaseOf(a, clip, simMs);
  let pose = poseAt(clip, t);
  // Nhấp nháy 140 ms (lịch từ RNG cosmetic của agent); vẫn giữ khi reduced motion vì không phải chuyển động mạnh.
  if (clip.blink && simMs < a.blinkUntil && pose === clip.frames[0]?.pose) pose = clip.blink.pose;
  // Tư thế thực tế sau fallback (Emberling G0 thiếu một số tư thế, ADR 0102).
  pose = resolvePose(species, pose);
  const frame = getDragonFrame(species, a.stage, a.mutation, pose);
  const k = reduced ? IDENTITY : sampleTrack(clip, t);
  const unit = STAGE_SCALE[a.stage] * DRAGON_SCENE_SCALE;
  return { clip, t, pose, frame, dx: k.dx * unit, dy: k.dy * unit, sx: k.sx, sy: k.sy, rot: k.rot };
}

/**
 * Cue hiệu ứng có mốc `t` nằm trong (prevT, t] — kể cả khi clip lặp vòng (t < prevT).
 * Lần đầu (prevT = null) chỉ lấy cue tại đúng 0.
 */
export function cuesCrossed(clip: DragonClip, prevT: number | null, t: number): FxCue[] {
  if (prevT === null) return clip.fx.filter((c) => c.t === 0);
  if (t === prevT) return [];
  if (t > prevT) return clip.fx.filter((c) => c.t > prevT && c.t <= t);
  // Lặp vòng: (prevT, 1] ∪ [0, t].
  return clip.fx.filter((c) => c.t > prevT || c.t <= t);
}
