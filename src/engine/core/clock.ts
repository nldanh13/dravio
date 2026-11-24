/**
 * Đồng hồ có thể tiêm và quy tắc thời gian offline (GDD 3.1 trang 18).
 */
export interface Clock {
  nowMs(): number;
}

export const systemClock: Clock = { nowMs: () => Date.now() };

export function fixedClock(ms: number): Clock & { set(ms: number): void; advance(ms: number): void } {
  let t = ms;
  return {
    nowMs: () => t,
    set: (v) => {
      t = v;
    },
    advance: (d) => {
      t += d;
    },
  };
}

export const OFFLINE_CAP_MS = 24 * 60 * 60 * 1000;

export interface ClockState {
  lastProcessedAtMs: number;
  highWaterAtMs: number;
}

export interface ElapsedResult {
  /** Thời gian được xử lý, đã chặn 0..24h. */
  elapsedMs: number;
  next: ClockState;
}

/**
 * elapsed = clamp(now − lastProcessedAt, 0, 24h).
 * Đồng hồ lùi: giữ high-water mark, không tính thời gian cho tới khi vượt lại mốc cũ.
 */
export function computeElapsed(state: ClockState, nowMs: number): ElapsedResult {
  const effectiveNow = Math.max(nowMs, state.highWaterAtMs);
  const raw = effectiveNow - state.lastProcessedAtMs;
  const elapsedMs = Math.min(Math.max(raw, 0), OFFLINE_CAP_MS);
  return {
    elapsedMs,
    next: { lastProcessedAtMs: effectiveNow, highWaterAtMs: effectiveNow },
  };
}
