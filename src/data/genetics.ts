/**
 * Locus P0 (GDD 3.1 trang 8). Quy ước game, không phải sinh học thật.
 * Allele viết hoa là trội; thứ tự trong genotype được chuẩn hóa (trội trước).
 */
export interface LocusDef {
  id: string;
  alleles: readonly [dominant: string, recessive: string];
  /** complete: X_ biểu hiện trội; incomplete: XX / Xx / xx khác nhau. */
  dominance: 'complete' | 'incomplete';
  /** Khóa i18n của kiểu hình theo số allele trội (0, 1, 2). */
  phenotypeKeys: readonly [recessive: string, hetero: string, dominant: string];
  /** Tần số allele trội cho rồng founder (mặc định 50%). */
  founderDominantFreq: number;
}

export const LOCI: readonly LocusDef[] = [
  {
    id: 'pigment',
    alleles: ['R', 'r'],
    dominance: 'complete',
    phenotypeKeys: ['phenotype.pigment.cool', 'phenotype.pigment.warm', 'phenotype.pigment.warm'],
    founderDominantFreq: 0.5,
  },
  {
    id: 'pattern',
    alleles: ['P', 'p'],
    dominance: 'incomplete',
    phenotypeKeys: ['phenotype.pattern.plain', 'phenotype.pattern.medium', 'phenotype.pattern.bold'],
    founderDominantFreq: 0.5,
  },
  {
    id: 'eye',
    alleles: ['B', 'b'],
    dominance: 'complete',
    phenotypeKeys: ['phenotype.eye.blue', 'phenotype.eye.amber', 'phenotype.eye.amber'],
    founderDominantFreq: 0.5,
  },
];

const BY_ID = new Map(LOCI.map((l) => [l.id, l]));

export function getLocus(id: string): LocusDef {
  const l = BY_ID.get(id);
  if (!l) throw new Error(`Unknown locus id: ${id}`);
  return l;
}
