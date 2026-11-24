import { BASE_HATCH_SEC, BREED_FEE_G, OFFSPRING_RARITY_WEIGHTS } from '../../data/breeding';
import { DRAGON_SPECIES, getSpecies } from '../../data/dragons';
import {
  RARITY_ORDER,
  rarityRank,
  type DragonInstance,
  type DragonSpecies,
  type Genotype,
  type Rarity,
} from '../../types/game';
import { pickUniform, pickWeighted, type Rng } from '../core/rng';
import { growthStage } from '../economy/rates';
import { locusDistribution, rollOffspringGenotype } from './alleles';

export type BreedRejection =
  | 'same-dragon'
  | 'not-adult'
  | 'busy'
  | 'cooldown'
  | 'different-group'
  | 'related'
  | 'no-candidates';

export type BreedCheck = { ok: true } | { ok: false; reason: BreedRejection };

function knownRelatives(d: DragonInstance): Set<string> {
  return new Set([...(d.parentIds ?? []), ...(d.grandparentIds ?? [])]);
}

/**
 * Cấm bố mẹ–con, anh chị em và chung ông bà ĐÃ BIẾT.
 * Ancestry thiếu không được tự suy diễn: chỉ so trên dữ liệu có thật.
 */
export function areRelated(a: DragonInstance, b: DragonInstance): boolean {
  if (a.parentIds?.includes(b.uid) || b.parentIds?.includes(a.uid)) return true;
  const pa = new Set(a.parentIds ?? []);
  if ((b.parentIds ?? []).some((id) => pa.has(id))) return true;
  const ga = new Set(a.grandparentIds ?? []);
  if ((b.grandparentIds ?? []).some((id) => ga.has(id))) return true;
  // Ông bà–cháu
  if (knownRelatives(a).has(b.uid) || knownRelatives(b).has(a.uid)) return true;
  return false;
}

/**
 * Ứng viên loài con: cùng nhóm, tập nguyên tố ⊆ hợp nguyên tố bố mẹ;
 * Epic cần ít nhất một bố mẹ Rare+; Legendary cần cả hai Epic+.
 */
export function candidateSpecies(a: DragonSpecies, b: DragonSpecies): DragonSpecies[] {
  if (a.group !== b.group) return [];
  const union = new Set([...a.elements, ...b.elements]);
  const maxRank = Math.max(rarityRank(a.rarity), rarityRank(b.rarity));
  const minRank = Math.min(rarityRank(a.rarity), rarityRank(b.rarity));
  return DRAGON_SPECIES.filter((s) => {
    if (s.group !== a.group) return false;
    if (!s.elements.every((e) => union.has(e))) return false;
    if (s.rarity === 'epic' && maxRank < rarityRank('rare')) return false;
    if (s.rarity === 'legendary' && minRank < rarityRank('epic')) return false;
    return true;
  });
}

export function checkBreed(
  a: DragonInstance,
  b: DragonInstance,
  nowMs: number,
): BreedCheck {
  if (a.uid === b.uid) return { ok: false, reason: 'same-dragon' };
  const sa = getSpecies(a.speciesId);
  const sb = getSpecies(b.speciesId);
  if (growthStage(a.xpSec, sa) !== 'adult' || growthStage(b.xpSec, sb) !== 'adult') {
    return { ok: false, reason: 'not-adult' };
  }
  if (a.activity !== 'idle' || b.activity !== 'idle') return { ok: false, reason: 'busy' };
  if (a.location.kind === 'care' || b.location.kind === 'care') return { ok: false, reason: 'busy' };
  if (a.breedCooldownUntilMs > nowMs || b.breedCooldownUntilMs > nowMs) {
    return { ok: false, reason: 'cooldown' };
  }
  if (sa.group !== sb.group) return { ok: false, reason: 'different-group' };
  if (areRelated(a, b)) return { ok: false, reason: 'related' };
  if (candidateSpecies(sa, sb).length === 0) return { ok: false, reason: 'no-candidates' };
  return { ok: true };
}

/** Xác suất từng loài con: chọn nhóm hiếm 60/30/9/1 sau khi bỏ nhóm rỗng, rồi chia đều trong nhóm. */
export function speciesDistribution(a: DragonSpecies, b: DragonSpecies): Map<string, number> {
  const cands = candidateSpecies(a, b);
  const byRarity = new Map<Rarity, DragonSpecies[]>();
  for (const s of cands) byRarity.set(s.rarity, [...(byRarity.get(s.rarity) ?? []), s]);
  const total = RARITY_ORDER.reduce(
    (sum, r) => sum + (byRarity.has(r) ? OFFSPRING_RARITY_WEIGHTS[r] : 0),
    0,
  );
  const out = new Map<string, number>();
  for (const r of RARITY_ORDER) {
    const group = byRarity.get(r);
    if (!group) continue;
    const pRarity = OFFSPRING_RARITY_WEIGHTS[r] / total;
    for (const s of group) out.set(s.id, pRarity / group.length);
  }
  return out;
}

export interface BreedPreview {
  species: Map<string, number>;
  loci: Record<string, Map<string, { pair: readonly [string, string]; p: number }>>;
  feeG: number;
}

/** Preview là query thuần, KHÔNG tiêu RNG. UI và engine dùng chung hàm này. */
export function previewBreed(a: DragonInstance, b: DragonInstance): BreedPreview {
  const sa = getSpecies(a.speciesId);
  const sb = getSpecies(b.speciesId);
  const loci: BreedPreview['loci'] = {};
  for (const id of sa.loci) {
    const pa = a.genotype[id];
    const pb = b.genotype[id];
    if (pa && pb) loci[id] = locusDistribution(id, pa, pb);
  }
  return { species: speciesDistribution(sa, sb), loci, feeG: breedFeeG(sa, sb) };
}

/**
 * Phí theo độ hiếm cao nhất của bố mẹ.
 * Ghi chú: GDD chưa nói rõ "cao nhất" là của bố mẹ hay của ứng viên — xem docs/adr/0002.
 */
export function breedFeeG(a: DragonSpecies, b: DragonSpecies): number {
  const top = RARITY_ORDER[Math.max(rarityRank(a.rarity), rarityRank(b.rarity))] ?? 'common';
  return BREED_FEE_G[top];
}

/** hatchSeconds = ceil(baseHatchSeconds × (1 − 0,1 × level)). */
export function hatchSeconds(rarity: Rarity, hatchSpeedLevel: number): number {
  return Math.ceil(BASE_HATCH_SEC[rarity] * (1 - 0.1 * hatchSpeedLevel));
}

export interface BreedOutcome {
  speciesId: string;
  genotype: Genotype;
}

/** Roll kết quả một lần khi bắt đầu lai; kết quả được lưu ngay, không reroll. */
export function rollBreed(rng: Rng, a: DragonInstance, b: DragonInstance): BreedOutcome {
  const sa = getSpecies(a.speciesId);
  const sb = getSpecies(b.speciesId);
  const dist = speciesDistribution(sa, sb);
  if (dist.size === 0) throw new Error('rollBreed called without candidates');
  const byRarity = new Map<Rarity, string[]>();
  for (const id of dist.keys()) {
    const r = getSpecies(id).rarity;
    byRarity.set(r, [...(byRarity.get(r) ?? []), id]);
  }
  const rarity = pickWeighted(
    rng,
    RARITY_ORDER.filter((r) => byRarity.has(r)).map((r) => [r, OFFSPRING_RARITY_WEIGHTS[r]] as const),
  );
  const speciesId = pickUniform(rng, byRarity.get(rarity) ?? []);
  const child = getSpecies(speciesId);
  return { speciesId, genotype: rollOffspringGenotype(rng, a.genotype, b.genotype, child.loci) };
}
