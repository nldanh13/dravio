import { getSpecies } from '../../data/dragons';
import type { DragonInstance, GrowthStage } from '../../types/game';
import { rateMicroGPerSec } from '../economy/rates';

/**
 * Tích phân sinh trưởng và sản xuất vàng theo mốc stage (GDD 3.1 trang 15, 18).
 * Làm việc hoàn toàn bằng số nguyên ms để không mất phần lẻ và tái lập chính xác.
 */

/** Hệ số vàng: online 100%, offline 75% (biểu diễn dạng phân số nguyên num/4). */
export const GOLD_FACTOR_NUM = { online: 4, offline: 3 } as const;
export const GOLD_FACTOR_DEN = 4;
/** goldRemainder có đơn vị microG / REMAINDER_SCALE. */
export const REMAINDER_SCALE = 1000 * GOLD_FACTOR_DEN;

export function xpMsOf(d: DragonInstance): number {
  return Math.round(d.xpSec * 1000);
}

/** Mốc stage tính bằng ms XP: juvenile ở 35%, adult ở 100%. */
export function stageBoundariesMs(growthTimeSec: number): { juvenileAt: number; adultAt: number } {
  return { juvenileAt: growthTimeSec * 350, adultAt: growthTimeSec * 1000 };
}

export function stageAtXpMs(xpMs: number, growthTimeSec: number): GrowthStage {
  const { juvenileAt, adultAt } = stageBoundariesMs(growthTimeSec);
  if (xpMs < juvenileAt) return 'baby';
  if (xpMs < adultAt) return 'juvenile';
  return 'adult';
}

export interface Segment {
  stage: GrowthStage;
  durationMs: number;
}

/** Chia khoảng dtMs thành các đoạn có stage không đổi, bắt đầu từ xpMs. XP tối đa = thời gian trưởng thành. */
export function growthSegments(xpMs: number, dtMs: number, growthTimeSec: number): Segment[] {
  const { juvenileAt, adultAt } = stageBoundariesMs(growthTimeSec);
  const segments: Segment[] = [];
  let xp = xpMs;
  let left = dtMs;
  while (left > 0) {
    const stage = stageAtXpMs(xp, growthTimeSec);
    const until = stage === 'baby' ? juvenileAt - xp : stage === 'juvenile' ? adultAt - xp : left;
    const dur = Math.min(left, until);
    segments.push({ stage, durationMs: dur });
    left -= dur;
    xp = Math.min(adultAt, xp + dur);
  }
  return segments;
}

export interface GrowthResult {
  xpMs: number;
  stageChanges: { from: GrowthStage; to: GrowthStage }[];
  /** Vàng đã cộng (microG nguyên) và phần lẻ mới. */
  goldMicro: number;
  remainder: number;
}

/**
 * Tiến hóa một rồng thêm dtMs.
 * `producing` = rồng đang ở slot sản xuất hợp lệ trong suốt khoảng thời gian.
 */
export function advanceDragon(
  dragon: DragonInstance,
  dtMs: number,
  producing: boolean,
  mode: 'online' | 'offline',
  remainder: number,
): GrowthResult {
  const species = getSpecies(dragon.speciesId);
  const startXp = xpMsOf(dragon);
  const segments = growthSegments(startXp, dtMs, species.growthTimeSec);
  let goldMicro = 0;
  let rem = remainder;
  if (producing) {
    for (const seg of segments) {
      const rate = rateMicroGPerSec(species, seg.stage, dragon.mutation);
      // rate (microG/s) × ms × num  → đơn vị microG / (1000 × DEN)
      const scaled = rate * seg.durationMs * GOLD_FACTOR_NUM[mode] + rem;
      const whole = Math.floor(scaled / REMAINDER_SCALE);
      goldMicro += whole;
      rem = scaled - whole * REMAINDER_SCALE;
    }
  }
  const { adultAt } = stageBoundariesMs(species.growthTimeSec);
  const endXp = Math.min(adultAt, startXp + dtMs);
  const stageChanges: GrowthResult['stageChanges'] = [];
  for (let i = 1; i < segments.length; i++) {
    const prev = segments[i - 1];
    const cur = segments[i];
    if (prev && cur && prev.stage !== cur.stage) stageChanges.push({ from: prev.stage, to: cur.stage });
  }
  // Trường hợp chạm đúng mốc ở cuối khoảng (đoạn kế tiếp có độ dài 0 không được tạo).
  const endStage = stageAtXpMs(endXp, species.growthTimeSec);
  const lastStage = segments.at(-1)?.stage ?? stageAtXpMs(startXp, species.growthTimeSec);
  if (endStage !== lastStage) stageChanges.push({ from: lastStage, to: endStage });
  return { xpMs: endXp, stageChanges, goldMicro, remainder: rem };
}

/** Thêm XP tức thời (ví dụ từ thức ăn), chặn ở mức trưởng thành; trả các lần đổi stage. */
export function addXp(dragon: DragonInstance, xpSec: number): { xpMs: number; stageChanges: { from: GrowthStage; to: GrowthStage }[] } {
  const species = getSpecies(dragon.speciesId);
  const { adultAt } = stageBoundariesMs(species.growthTimeSec);
  const before = xpMsOf(dragon);
  const after = Math.min(adultAt, before + Math.round(xpSec * 1000));
  const stages: GrowthStage[] = [];
  const s0 = stageAtXpMs(before, species.growthTimeSec);
  const s1 = stageAtXpMs(after, species.growthTimeSec);
  if (s0 !== s1) {
    stages.push(s0);
    if (s0 === 'baby' && s1 === 'adult') stages.push('juvenile');
    stages.push(s1);
  }
  const stageChanges = stages.slice(1).map((to, i) => ({ from: stages[i] as GrowthStage, to }));
  return { xpMs: after, stageChanges };
}
