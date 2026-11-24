import type { GameState } from '../types/state';

/** Chu kỳ autosave (GDD 3.1 trang 18). */
export const AUTOSAVE_INTERVAL_MS = 30_000;

export interface Timer {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface AutosaveOptions {
  save: (state: GameState) => Promise<boolean>;
  getState: () => GameState | null;
  timer: Timer;
  intervalMs?: number;
  onError?: (error: unknown) => void;
  onSaved?: (state: GameState) => void;
}

/**
 * Autosave 30 s + `flush()` cho sự kiện vòng đời (ẩn tab, đóng trang, trước import).
 * Không tự đọc đồng hồ: timer được tiêm để test tất định.
 */
export function createAutosave(opts: AutosaveOptions): { start(): void; stop(): void; flush(): Promise<boolean> } {
  let handle: unknown = null;
  const flush = async (): Promise<boolean> => {
    const state = opts.getState();
    if (!state) return false;
    try {
      const saved = await opts.save(state);
      if (saved) opts.onSaved?.(state);
      return saved;
    } catch (e) {
      opts.onError?.(e);
      return false;
    }
  };
  return {
    start() {
      if (handle !== null) return;
      handle = opts.timer.setInterval(() => void flush(), opts.intervalMs ?? AUTOSAVE_INTERVAL_MS);
    },
    stop() {
      if (handle === null) return;
      opts.timer.clearInterval(handle);
      handle = null;
    },
    flush,
  };
}
