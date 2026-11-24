import { describe, expect, it } from 'vitest';
import { OFFLINE_CAP_MS, computeElapsed } from '../../src/engine/core/clock';
import { createRng, hashSeed, pickWeighted } from '../../src/engine/core/rng';

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('stays within [0, 1)', () => {
    const r = createRng(hashSeed('event-1', 'dragon-1'));
    for (let i = 0; i < 10_000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('never picks zero-weight entries', () => {
    const r = createRng(7);
    for (let i = 0; i < 2_000; i++) expect(pickWeighted(r, [['a', 0], ['b', 1], ['c', 0]])).toBe('b');
  });

  it('separates seed parts', () => {
    expect(hashSeed('ab', 'c')).not.toBe(hashSeed('a', 'bc'));
  });
});

describe('clock', () => {
  const base = { lastProcessedAtMs: 1_000, highWaterAtMs: 1_000 };

  it('handles 0, 60s and 61s', () => {
    expect(computeElapsed(base, 1_000).elapsedMs).toBe(0);
    expect(computeElapsed(base, 61_000).elapsedMs).toBe(60_000);
    expect(computeElapsed(base, 62_000).elapsedMs).toBe(61_000);
  });

  it('caps offline time at 24h', () => {
    expect(computeElapsed(base, 1_000 + 3 * OFFLINE_CAP_MS).elapsedMs).toBe(OFFLINE_CAP_MS);
  });

  it('gives no time when the clock goes backwards and keeps the high-water mark', () => {
    const r = computeElapsed({ lastProcessedAtMs: 10_000, highWaterAtMs: 10_000 }, 5_000);
    expect(r.elapsedMs).toBe(0);
    expect(r.next.highWaterAtMs).toBe(10_000);
    // Sau đó đồng hồ trở lại: chỉ tính phần vượt mốc cũ.
    expect(computeElapsed(r.next, 12_000).elapsedMs).toBe(2_000);
  });
});
