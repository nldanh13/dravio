import { getLocus, type LocusDef } from '../../data/genetics';
import type { Genotype } from '../../types/game';
import { hashSeed, createRng, type Rng } from '../core/rng';

/** Chuẩn hóa cặp allele: allele trội đứng trước (Rr, không phải rR). */
export function normalizePair(locus: LocusDef, a: string, b: string): readonly [string, string] {
  const [dom] = locus.alleles;
  if (b === dom && a !== dom) return [b, a];
  return [a, b];
}

export function pairKey(pair: readonly [string, string]): string {
  return `${pair[0]}${pair[1]}`;
}

/** Số allele trội (0, 1, 2) tại một locus. */
export function dominantCount(locus: LocusDef, pair: readonly [string, string]): 0 | 1 | 2 {
  const [dom] = locus.alleles;
  return ((pair[0] === dom ? 1 : 0) + (pair[1] === dom ? 1 : 0)) as 0 | 1 | 2;
}

/** Khóa i18n kiểu hình của một locus, dẫn xuất từ genotype. */
export function phenotypeKey(locusId: string, pair: readonly [string, string]): string {
  const locus = getLocus(locusId);
  const n = dominantCount(locus, pair);
  return locus.phenotypeKeys[n];
}

/** Kiểu hình toàn bộ theo danh sách locus của loài; locus thiếu → "không biểu hiện". */
export function derivePhenotype(genotype: Genotype, loci: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of loci) {
    const pair = genotype[id];
    out[id] = pair ? phenotypeKey(id, pair) : 'phenotype.notExpressed';
  }
  return out;
}

/**
 * Phân phối genotype của con tại một locus: mỗi bố mẹ góp một allele với xác suất 1/2.
 * Trả về map pairKey → xác suất; tổng luôn bằng 1.
 */
export function locusDistribution(
  locusId: string,
  a: readonly [string, string],
  b: readonly [string, string],
): Map<string, { pair: readonly [string, string]; p: number }> {
  const locus = getLocus(locusId);
  const out = new Map<string, { pair: readonly [string, string]; p: number }>();
  for (const x of a) {
    for (const y of b) {
      const pair = normalizePair(locus, x, y);
      const key = pairKey(pair);
      const prev = out.get(key);
      out.set(key, { pair, p: (prev?.p ?? 0) + 0.25 });
    }
  }
  return out;
}

/** Roll genotype con theo phân ly độc lập. Dùng đúng RNG đã chốt khi bắt đầu lai. */
export function rollOffspringGenotype(
  rng: Rng,
  a: Genotype,
  b: Genotype,
  loci: readonly string[],
): Genotype {
  const out: Record<string, readonly [string, string]> = {};
  for (const id of loci) {
    const pa = a[id];
    const pb = b[id];
    if (!pa || !pb) continue; // không áp dụng: không tự tạo gene
    const locus = getLocus(id);
    const fromA = pa[rng.next() < 0.5 ? 0 : 1];
    const fromB = pb[rng.next() < 0.5 ? 0 : 1];
    out[id] = normalizePair(locus, fromA, fromB);
  }
  return out;
}

/** Genotype founder ổn định từ UID + contentVersion (dùng cho pack và migration save cũ). */
export function founderGenotype(uid: string, contentVersion: string, loci: readonly string[]): Genotype {
  const rng = createRng(hashSeed('founder', uid, contentVersion));
  const out: Record<string, readonly [string, string]> = {};
  for (const id of loci) {
    const locus = getLocus(id);
    const [dom, rec] = locus.alleles;
    const pick = () => (rng.next() < locus.founderDominantFreq ? dom : rec);
    out[id] = normalizePair(locus, pick(), pick());
  }
  return out;
}
