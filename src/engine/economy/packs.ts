import { DRAGON_SPECIES } from '../../data/dragons';
import { PACKS, type PackDef } from '../../data/economy';
import { RARITY_ORDER, type Rarity } from '../../types/game';
import { pickUniform, pickWeighted, type Rng } from '../core/rng';

export function getPack(id: string): PackDef {
  const p = PACKS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown pack id: ${id}`);
  return p;
}

/** Một gói một trứng: chọn rarity theo bảng, rồi chọn đều loài đủ điều kiện (loại Amberhorn/Aurorawing). */
export function rollPackSpecies(rng: Rng, pack: PackDef): string {
  const rarity = pickWeighted<Rarity>(
    rng,
    RARITY_ORDER.map((r) => [r, pack.odds[r]] as const),
  );
  const pool = DRAGON_SPECIES.filter((s) => s.packEligible && s.rarity === rarity);
  return pickUniform(rng, pool).id;
}
