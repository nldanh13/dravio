import type { GrowthStage } from '../../types/game';
import { SPECIES_BIOLOGY } from '../../data/g0Biology';
import type { DragonEffectId } from '../effects/manifest';

/**
 * Đặc tả hoạt ảnh rồng (G1 PR2) — CHỈ là dữ liệu tài nguyên + hàm lấy mẫu thuần.
 * Không phải FSM/Behavior Engine: việc chọn trạng thái, chuyển trạng thái và thời điểm
 * nhấp nháy thuộc renderer/behavior (dùng RNG cosmetic riêng, không đụng RNG domain).
 * Module không gọi hàm ngẫu nhiên hay đồng hồ hệ thống; thời gian luôn do người gọi truyền vào.
 *
 * Quy ước chung (docs/art/DRAGON_ANIMATION.md):
 * - Khung 240×200, mặt hướng phải, điểm neo chân (120,170) — trùng sprite gốc.
 * - Transform quay/co giãn quanh điểm neo; dx/dy theo px viewBox, đã là kích thước Adult
 *   và renderer nhân thêm `stageScale` (Baby 0.68, Juvenile 0.85).
 * - Khung hoạt ảnh không chứa bóng; renderer vẽ hiệu ứng `shadow` ở mặt đất.
 */

export const DRAGON_ANIM_STATES = [
  'idle',
  'walk',
  'swim',
  'fly',
  'eat',
  'sleep',
  'pet',
  'happy',
  'landing',
  'injured',
  'recovery',
] as const;
export type DragonAnimState = (typeof DRAGON_ANIM_STATES)[number];

export type PoseId =
  | 'idle'
  | 'blink'
  | 'happy'
  | 'eat_a'
  | 'eat_b'
  | 'walk_a'
  | 'walk_b'
  | 'sleep'
  | 'injured'
  | 'swim_a'
  | 'swim_b'
  | 'fly_up'
  | 'fly_down'
  | 'land';

export type Locomotion = 'walk' | 'swim' | 'fly' | 'burrow';
export type AttachPoint = 'head' | 'mouth' | 'body' | 'tail' | 'ground' | 'waterline';

export interface TransformKey {
  /** Thời điểm chuẩn hóa 0..1 trong clip. */
  t: number;
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  /** Độ, dương = cúi đầu về phía trước (chiều kim đồng hồ khi nhìn phải). */
  rot: number;
}

export interface FrameKey {
  t: number;
  pose: PoseId;
}

export interface FxCue {
  t: number;
  fx: DragonEffectId;
  at: AttachPoint;
  durMs: number;
  /** Lệch thêm (px viewBox, trước khi nhân stageScale). */
  dx?: number;
  dy?: number;
}

export interface BlinkSpec {
  pose: PoseId;
  durMs: number;
  /** Khoảng chờ giữa hai lần nhấp nháy; renderer chọn bằng RNG cosmetic. */
  intervalMs: readonly [number, number];
}

export interface DragonClip {
  state: DragonAnimState;
  durationMs: number;
  loop: boolean;
  /** Khả năng vận động bắt buộc trong SPECIES_BIOLOGY; null = mọi loài. */
  requires: Locomotion | null;
  frames: readonly FrameKey[];
  track: readonly TransformKey[];
  fx: readonly FxCue[];
  /** ground: bóng tại chân; altitude: bóng co theo độ cao bay; water: không bóng, vẽ mặt nước. */
  shadow: 'ground' | 'altitude' | 'water';
  /** Độ cao bay theo stage (px viewBox, đã theo tỉ lệ stage). */
  altitude?: Readonly<Record<GrowthStage, number>>;
  /** Quãng đường một chu kỳ (px viewBox Adult) để khớp tốc độ, tránh trượt chân. */
  stridePx?: number;
  blink?: BlinkSpec;
  /** Có thể ngắt giữa chừng không (ví dụ pet/happy chạy hết rồi mới trả lại). */
  interruptible: boolean;
  /** Gợi ý trạng thái sau khi clip `loop:false` kết thúc. FSM có quyền quyết định khác. */
  returnsTo?: DragonAnimState;
}

const K = (t: number, k: Partial<Omit<TransformKey, 't'>> = {}): TransformKey => ({ t, dx: 0, dy: 0, sx: 1, sy: 1, rot: 0, ...k });
const BLINK: BlinkSpec = { pose: 'blink', durMs: 140, intervalMs: [3000, 5000] };

/** Clip chung — thời lượng theo docs/g0/ART_DIRECTION.md (idle 2–3s, walk 0.8–1.2s, eat 0.6s, pet 1s). */
const BASE_CLIPS: Readonly<Record<DragonAnimState, DragonClip>> = {
  idle: {
    state: 'idle',
    durationMs: 2400,
    loop: true,
    requires: null,
    frames: [{ t: 0, pose: 'idle' }],
    track: [K(0), K(0.5, { sx: 0.99, sy: 1.025, dy: -0.5 }), K(1)],
    fx: [],
    shadow: 'ground',
    blink: BLINK,
    interruptible: true,
  },
  walk: {
    state: 'walk',
    durationMs: 1000,
    loop: true,
    requires: 'walk',
    frames: [
      { t: 0, pose: 'walk_a' },
      { t: 0.25, pose: 'idle' },
      { t: 0.5, pose: 'walk_b' },
      { t: 0.75, pose: 'idle' },
    ],
    track: [K(0), K(0.25, { dy: -2.5 }), K(0.5), K(0.75, { dy: -2.5 }), K(1)],
    fx: [{ t: 0.5, fx: 'dust', at: 'ground', durMs: 400, dx: -30 }],
    shadow: 'ground',
    stridePx: 36,
    blink: BLINK,
    interruptible: true,
  },
  swim: {
    state: 'swim',
    durationMs: 1200,
    loop: true,
    requires: 'swim',
    frames: [
      { t: 0, pose: 'swim_a' },
      { t: 0.5, pose: 'swim_b' },
    ],
    track: [K(0, { rot: -1.5 }), K(0.25, { dy: -2 }), K(0.5, { rot: 1.5 }), K(0.75, { dy: 2 }), K(1, { rot: -1.5 })],
    fx: [
      { t: 0, fx: 'ripple', at: 'waterline', durMs: 1200 },
      { t: 0.35, fx: 'bubbles', at: 'mouth', durMs: 700 },
    ],
    shadow: 'water',
    stridePx: 44,
    interruptible: true,
  },
  fly: {
    state: 'fly',
    durationMs: 600,
    loop: true,
    requires: 'fly',
    frames: [
      { t: 0, pose: 'fly_up' },
      { t: 0.5, pose: 'fly_down' },
    ],
    // Đập cánh xuống thì thân nhích lên.
    track: [K(0, { dy: 2 }), K(0.5, { dy: -3 }), K(1, { dy: 2 })],
    fx: [{ t: 0.5, fx: 'wind', at: 'body', durMs: 500, dx: -50 }],
    shadow: 'altitude',
    altitude: { baby: 18, juvenile: 40, adult: 56 },
    stridePx: 60,
    interruptible: true,
  },
  eat: {
    state: 'eat',
    durationMs: 600,
    loop: true,
    requires: null,
    frames: [
      { t: 0, pose: 'eat_a' },
      { t: 0.5, pose: 'eat_b' },
    ],
    track: [K(0, { rot: 3 }), K(0.5, { rot: 1, dy: 1 }), K(1, { rot: 3 })],
    fx: [{ t: 0.5, fx: 'crumbs', at: 'mouth', durMs: 400 }],
    shadow: 'ground',
    interruptible: true,
  },
  sleep: {
    state: 'sleep',
    durationMs: 3200,
    loop: true,
    requires: null,
    frames: [{ t: 0, pose: 'sleep' }],
    track: [K(0), K(0.5, { sx: 1.01, sy: 1.03 }), K(1)],
    fx: [{ t: 0, fx: 'zzz', at: 'head', durMs: 3200, dx: 10 }],
    shadow: 'ground',
    interruptible: true,
  },
  pet: {
    state: 'pet',
    durationMs: 1000,
    loop: false,
    requires: null,
    frames: [
      { t: 0, pose: 'blink' },
      { t: 0.2, pose: 'happy' },
      { t: 0.9, pose: 'idle' },
    ],
    track: [K(0), K(0.15, { sx: 1.05, sy: 0.94 }), K(0.45, { sx: 0.98, sy: 1.03, dy: -2 }), K(0.75, { sx: 1.01, sy: 0.99 }), K(1)],
    fx: [{ t: 0.2, fx: 'heart', at: 'head', durMs: 800, dy: -6 }],
    shadow: 'ground',
    interruptible: false,
    returnsTo: 'idle',
  },
  happy: {
    state: 'happy',
    durationMs: 900,
    loop: false,
    requires: null,
    frames: [
      { t: 0, pose: 'happy' },
      { t: 0.85, pose: 'idle' },
    ],
    track: [K(0, { sx: 1.04, sy: 0.95 }), K(0.15), K(0.4, { dy: -14, sx: 0.97, sy: 1.04 }), K(0.7, { dy: 0 }), K(0.8, { sx: 1.05, sy: 0.94 }), K(1)],
    fx: [{ t: 0.3, fx: 'happy_burst', at: 'head', durMs: 600, dy: -8 }],
    shadow: 'ground',
    interruptible: false,
    returnsTo: 'idle',
  },
  landing: {
    state: 'landing',
    durationMs: 500,
    loop: false,
    requires: 'fly',
    frames: [
      { t: 0, pose: 'land' },
      { t: 0.7, pose: 'idle' },
    ],
    // dy âm = còn trên không; renderer cộng thêm độ cao hiện tại lúc bắt đầu hạ cánh.
    track: [K(0, { dy: -20 }), K(0.5, { dy: 0 }), K(0.6, { sx: 1.08, sy: 0.9 }), K(1)],
    fx: [{ t: 0.5, fx: 'dust', at: 'ground', durMs: 400 }],
    shadow: 'altitude',
    interruptible: false,
    returnsTo: 'idle',
  },
  injured: {
    state: 'injured',
    durationMs: 3000,
    loop: true,
    requires: null,
    frames: [{ t: 0, pose: 'injured' }],
    track: [K(0), K(0.5, { sy: 1.012, dy: 0.5 }), K(1)],
    // Thông tin chăm sóc: băng giả tưởng + biểu tượng lá chăm sóc. Không máu me (ART_DIRECTION).
    fx: [
      { t: 0, fx: 'bandage', at: 'body', durMs: 3000, dy: -4 },
      { t: 0, fx: 'care_leaf', at: 'head', durMs: 3000, dy: -6 },
    ],
    shadow: 'ground',
    interruptible: true,
  },
  recovery: {
    state: 'recovery',
    durationMs: 1500,
    loop: false,
    requires: null,
    frames: [
      { t: 0, pose: 'injured' },
      { t: 0.4, pose: 'blink' },
      { t: 0.55, pose: 'idle' },
      { t: 0.75, pose: 'happy' },
    ],
    track: [K(0, { dy: 2 }), K(0.5, { dy: 0 }), K(0.75, { dy: -8 }), K(0.9, { sx: 1.04, sy: 0.95 }), K(1)],
    fx: [
      { t: 0, fx: 'recovery_glow', at: 'body', durMs: 1200 },
      { t: 0.75, fx: 'happy_burst', at: 'head', durMs: 500 },
    ],
    shadow: 'ground',
    interruptible: false,
    returnsTo: 'idle',
  },
};

export type CommonSpeciesId = 'emberling' | 'droplet' | 'sprout' | 'zephyr';

/**
 * Emberling G0 là bản vẽ phẳng (giữ nguyên đến G3, ADR 0008): chỉ có khung thay mắt/miệng.
 * Tư thế thiếu được thay bằng tư thế gần nhất, track bù chuyển động.
 */
export const POSE_FALLBACK: Readonly<Partial<Record<CommonSpeciesId, Partial<Record<PoseId, PoseId>>>>> = {
  emberling: { walk_a: 'idle', walk_b: 'idle', eat_b: 'idle', sleep: 'blink' },
};

/** Điều chỉnh theo loài (ghi đè trường của clip chung). */
const OVERRIDES: Readonly<Partial<Record<CommonSpeciesId, Partial<Record<DragonAnimState, Partial<DragonClip>>>>>> = {
  emberling: {
    // Không có khung bước chân: lắc nhẹ thân thay cho chân.
    walk: { track: [K(0, { rot: -2 }), K(0.25, { dy: -3 }), K(0.5, { rot: 2 }), K(0.75, { dy: -3 }), K(1, { rot: -2 })] },
    // Không có tư thế nằm: hạ thấp + nén nhẹ.
    sleep: { track: [K(0, { sy: 0.92, sx: 1.04 }), K(0.5, { sy: 0.95, sx: 1.03 }), K(1, { sy: 0.92, sx: 1.04 })] },
    eat: { track: [K(0, { rot: 8, dy: 2 }), K(0.5, { rot: 5, dy: 1 }), K(1, { rot: 8, dy: 2 })] },
  },
  droplet: {
    // Lưỡng cư: bước lạch bạch chậm hơn trên cạn.
    walk: { durationMs: 1100, track: [K(0, { rot: -1.5 }), K(0.25, { dy: -1.5 }), K(0.5, { rot: 1.5 }), K(0.75, { dy: -1.5 }), K(1, { rot: -1.5 })], stridePx: 30 },
  },
  sprout: {
    walk: { durationMs: 1100, stridePx: 32 },
  },
  zephyr: {
    // Hai chân: bước nhún rõ hơn, nhanh hơn.
    walk: { durationMs: 800, track: [K(0), K(0.25, { dy: -4 }), K(0.5), K(0.75, { dy: -4 }), K(1)], stridePx: 34 },
    // Vui: vỗ cánh tại chỗ thay cho nhảy.
    happy: {
      frames: [
        { t: 0, pose: 'happy' },
        { t: 0.25, pose: 'fly_up' },
        { t: 0.45, pose: 'happy' },
        { t: 0.85, pose: 'idle' },
      ],
    },
  },
};

/** Clip đã áp đè theo loài; null khi loài không có khả năng vận động tương ứng (catalog sinh học). */
export function resolveDragonClip(speciesId: CommonSpeciesId, state: DragonAnimState): DragonClip | null {
  const clip: DragonClip = { ...BASE_CLIPS[state], ...(OVERRIDES[speciesId]?.[state] ?? {}) };
  if (clip.requires) {
    const loco = SPECIES_BIOLOGY[speciesId].locomotion as readonly string[];
    if (!loco.includes(clip.requires)) return null;
  }
  return clip;
}

/** Danh sách trạng thái hợp lệ của một loài. */
export function availableStates(speciesId: CommonSpeciesId): DragonAnimState[] {
  return DRAGON_ANIM_STATES.filter((s) => resolveDragonClip(speciesId, s) !== null);
}

/** Tư thế thực tế (sau fallback) cho loài. */
export function resolvePose(speciesId: CommonSpeciesId, pose: PoseId): PoseId {
  return POSE_FALLBACK[speciesId]?.[pose] ?? pose;
}

/** Thời gian chuẩn hóa 0..1 từ thời gian đã trôi của clip (ms, do renderer truyền vào). */
export function clipPhase(clip: DragonClip, elapsedMs: number): number {
  if (!(elapsedMs > 0)) return 0;
  if (clip.loop) return (elapsedMs % clip.durationMs) / clip.durationMs;
  return Math.min(1, elapsedMs / clip.durationMs);
}

/** Tư thế tại pha t (khung flipbook giữ nguyên tới khóa kế tiếp). */
export function poseAt(clip: DragonClip, t: number): PoseId {
  let pose = clip.frames[0]?.pose ?? 'idle';
  for (const f of clip.frames) if (f.t <= t) pose = f.pose;
  return pose;
}

const smooth = (u: number): number => u * u * (3 - 2 * u);

/** Nội suy track (smoothstep giữa hai khóa). */
export function sampleTrack(clip: DragonClip, t: number): TransformKey {
  const keys = clip.track;
  const first = keys[0];
  if (!first) return K(t);
  if (t <= first.t) return { ...first, t };
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    const a = keys[i - 1];
    if (!a || !b) continue;
    if (t <= b.t) {
      const u = smooth(b.t === a.t ? 1 : (t - a.t) / (b.t - a.t));
      const mix = (x: number, y: number) => x + (y - x) * u;
      return { t, dx: mix(a.dx, b.dx), dy: mix(a.dy, b.dy), sx: mix(a.sx, b.sx), sy: mix(a.sy, b.sy), rot: mix(a.rot, b.rot) };
    }
  }
  const last = keys[keys.length - 1] ?? first;
  return { ...last, t };
}
