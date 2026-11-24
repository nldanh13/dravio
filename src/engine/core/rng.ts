/**
 * RNG có seed, có thể tiêm vào engine (GDD 3.1 trang 17).
 * Engine không bao giờ gọi Math.random trực tiếp.
 */
export interface Rng {
  /** Số thực trong [0, 1). */
  next(): number;
}

/** Hash chuỗi 32-bit (FNV-1a) để tạo seed ổn định, ví dụ từ eventId + dragonId. */
export function hashSeed(...parts: readonly string[]): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x1f; // phân tách giữa các phần
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: nhanh, đủ tốt cho gameplay, tái lập được theo seed. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export function randomInt(rng: Rng, maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`);
  }
  return Math.floor(rng.next() * maxExclusive);
}

export function pickUniform<T>(rng: Rng, items: readonly T[]): T {
  const item = items[randomInt(rng, items.length)];
  if (item === undefined) throw new RangeError('pickUniform on empty list');
  return item;
}

/** Chọn theo trọng số không âm. Trọng số 0 không bao giờ được chọn. */
export function pickWeighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  if (total <= 0) throw new RangeError('pickWeighted needs a positive total weight');
  let roll = rng.next() * total;
  for (const [value, w] of entries) {
    if (w <= 0) continue;
    if (roll < w) return value;
    roll -= w;
  }
  // Sai số dấu phẩy động: trả mục cuối có trọng số dương.
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e && e[1] > 0) return e[0];
  }
  throw new RangeError('unreachable');
}
