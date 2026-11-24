import type { Anatomy, BodyStyle, BreedingGroup, DragonSpecies, ElementType, Rarity, Realm } from '../types/game';

import { getBiology } from './g0Biology';

/**
 * Catalog 16 loài (GDD 3.1 trang 6). Giữ ID và chỉ số kinh tế baseline v2.
 * Anatomy, sinh cảnh, palette lấy từ dữ liệu G0 canonical (`g0Biology.ts`, ADR 0003);
 * không suy ra từ nguyên tố. Nhóm sinh sản được đối chiếu với G0 khi nạp catalog.
 */

const P0_LOCI = ['pigment', 'pattern', 'eye'] as const;

function biologyFor(id: string, group: BreedingGroup) {
  const { group: g0Group, habitatRules, palette, silhouetteVi, ...anatomy } = getBiology(id);
  if (g0Group !== group) {
    throw new Error(`Species ${id}: group ${group} in catalog disagrees with G0 biology ${g0Group}`);
  }
  const fullAnatomy: Anatomy = anatomy;
  return { anatomy: fullAnatomy, habitatRules, palette, silhouetteVi };
}

interface Row {
  id: string;
  elements: readonly [ElementType] | readonly [ElementType, ElementType];
  rarity: Rarity;
  group: BreedingGroup;
  realms: readonly Realm[];
  habitatTags?: readonly string[];
  /** G/s */
  rate: number;
  /** phút */
  growthMin: number;
  sell: number;
  body: BodyStyle;
  packEligible?: boolean;
}

const ROWS: readonly Row[] = [
  { id: 'emberling', elements: ['fire'], rarity: 'common', group: 'T', realms: ['land'], rate: 0.025, growthMin: 5, sell: 75, body: 'round' },
  { id: 'droplet', elements: ['water'], rarity: 'common', group: 'A', realms: ['ocean', 'land'], habitatTags: ['humid'], rate: 0.025, growthMin: 6, sell: 75, body: 'round' },
  { id: 'sprout', elements: ['nature'], rarity: 'common', group: 'T', realms: ['land'], rate: 0.027, growthMin: 8, sell: 80, body: 'round' },
  { id: 'zephyr', elements: ['sky'], rarity: 'common', group: 'V', realms: ['land', 'sky'], rate: 0.028, growthMin: 8, sell: 85, body: 'winged' },
  { id: 'steamdrake', elements: ['fire', 'water'], rarity: 'rare', group: 'A', realms: ['ocean', 'land'], habitatTags: ['humid'], rate: 0.07, growthMin: 25, sell: 350, body: 'serpent' },
  { id: 'magma', elements: ['fire', 'nature'], rarity: 'rare', group: 'T', realms: ['land'], habitatTags: ['hot'], rate: 0.075, growthMin: 30, sell: 380, body: 'horned' },
  { id: 'sparkwing', elements: ['fire', 'sky'], rarity: 'rare', group: 'V', realms: ['land', 'sky'], rate: 0.08, growthMin: 35, sell: 400, body: 'winged' },
  { id: 'frostfin', elements: ['water', 'sky'], rarity: 'rare', group: 'A', realms: ['ocean'], habitatTags: ['cold-water'], rate: 0.075, growthMin: 30, sell: 380, body: 'winged' },
  { id: 'mossback', elements: ['water', 'nature'], rarity: 'rare', group: 'A', realms: ['ocean', 'land'], habitatTags: ['humid'], rate: 0.072, growthMin: 25, sell: 360, body: 'round' },
  { id: 'blossom', elements: ['nature', 'sky'], rarity: 'rare', group: 'V', realms: ['land', 'sky'], rate: 0.08, growthMin: 35, sell: 400, body: 'winged' },
  { id: 'solaris', elements: ['fire', 'sky'], rarity: 'epic', group: 'V', realms: ['land', 'sky'], rate: 0.18, growthMin: 120, sell: 1800, body: 'winged' },
  { id: 'leviathan', elements: ['water', 'nature'], rarity: 'epic', group: 'A', realms: ['ocean'], habitatTags: ['sea'], rate: 0.2, growthMin: 150, sell: 2000, body: 'serpent' },
  { id: 'amberhorn', elements: ['fire', 'nature'], rarity: 'epic', group: 'T', realms: ['land'], rate: 0.2, growthMin: 150, sell: 2000, body: 'horned', packEligible: false },
  { id: 'aurorawing', elements: ['water', 'sky'], rarity: 'epic', group: 'V', realms: ['land', 'sky'], rate: 0.22, growthMin: 180, sell: 2200, body: 'winged', packEligible: false },
  { id: 'celestia', elements: ['fire', 'sky'], rarity: 'legendary', group: 'V', realms: ['land', 'sky'], rate: 0.5, growthMin: 360, sell: 10000, body: 'winged' },
  { id: 'gaia', elements: ['water', 'nature'], rarity: 'legendary', group: 'A', realms: ['ocean', 'land'], habitatTags: ['humid'], rate: 0.55, growthMin: 480, sell: 11000, body: 'horned' },
];

export const DRAGON_SPECIES: readonly DragonSpecies[] = ROWS.map((r) => ({
  id: r.id,
  elements: r.elements,
  rarity: r.rarity,
  group: r.group,
  realms: r.realms,
  habitatTags: r.habitatTags ?? [],
  ...biologyFor(r.id, r.group),
  loci: P0_LOCI,
  packEligible: r.packEligible ?? true,
  baseRateMicroG: Math.round(r.rate * 1_000_000),
  growthTimeSec: r.growthMin * 60,
  baseSellG: r.sell,
  bodyStyle: r.body,
  assetId: `dragon.${r.id}`,
}));

const BY_ID = new Map(DRAGON_SPECIES.map((s) => [s.id, s]));

export function getSpecies(id: string): DragonSpecies {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`Unknown species id: ${id}`);
  return s;
}
