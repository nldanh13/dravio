import { CONTENT_VERSION } from '../../data/content';
import { getSpecies } from '../../data/dragons';
import { MICRO_PER_G } from '../../data/economy';
import { TUTORIAL_PACK } from '../../data/tutorial';
import type { DragonInstance, Personality } from '../../types/game';
import type { GameState, PendingPack } from '../../types/state';
import type { CommandErrorCode } from '../core/errors';
import type { DomainEvent } from '../core/events';
import { newUid } from '../core/initialState';
import { createRng, hashSeed, pickUniform } from '../core/rng';
import { getPack } from '../economy/packs';
import { founderGenotype } from '../genetics/alleles';
import { checkPlacement, placementOptions, type PlacementCheck } from '../world/zones';

/**
 * Gói Starter hướng dẫn và nhận trứng (GDD 3.1 trang 4, 15; S01; ADR 0013).
 * Kết quả cố định (Sproutling, Normal), không tiêu RNG domain, không tính pity; roll một lần lúc mua và lưu ngay
 * trong `pendingPack`. UID/tính cách lấy từ RNG có seed theo saveId để tái lập được.
 */

type Result = { ok: true; state: GameState; events: DomainEvent[] } | { ok: false; code: CommandErrorCode };

const PERSONALITIES: readonly Personality[] = ['playful', 'calm', 'curious', 'shy'];

export function buyTutorialPack(state: GameState, nowMs: number): Result {
  if (state.pendingPack) return { ok: false, code: 'pack-pending' };
  if (state.tutorial.starterPackUsed) return { ok: false, code: 'tutorial-pack-used' };
  const price = getPack(TUTORIAL_PACK.packId).priceG * MICRO_PER_G;
  if (state.goldMicro < price) return { ok: false, code: 'not-enough-gold' };
  const species = getSpecies(TUTORIAL_PACK.speciesId);
  const id = `pack_${state.saveId}_tutorial`.slice(0, 64);
  const uidRng = createRng(hashSeed('tutorial-pack', state.saveId));
  const eggUid = newUid(uidRng);
  const pack: PendingPack = {
    id,
    packId: TUTORIAL_PACK.packId,
    speciesId: species.id,
    genotype: founderGenotype(eggUid, CONTENT_VERSION, species.loci),
    mutation: TUTORIAL_PACK.mutation,
    createdAtMs: nowMs,
    tutorial: true,
  };
  return {
    ok: true,
    state: { ...state, goldMicro: state.goldMicro - price, pendingPack: pack, tutorial: { ...state.tutorial, starterPackUsed: true } },
    events: [{ type: 'packBought', packId: pack.packId, speciesId: pack.speciesId, priceGoldMicro: price, tutorial: true }],
  };
}

export type PackTarget = { kind: 'zone'; zoneId: string; habitatId: string } | { kind: 'storage' };

/** Nhận trứng: nở rồng Baby, đặt vào microhabitat hợp lệ (kiểm như `moveDragon`) hoặc kho. */
/** Rồng nở từ trứng đang chờ (xác định theo `pack.id`): cùng một trứng luôn nở cùng UID và tính cách. */
export function hatchFromPack(pack: PendingPack, nowMs: number): DragonInstance {
  const rng = createRng(hashSeed('hatch', pack.id));
  const uid = newUid(rng);
  return {
    uid,
    speciesId: pack.speciesId,
    genotype: pack.genotype,
    mutation: pack.mutation,
    xpSec: 0,
    locked: false,
    location: { kind: 'storage' },
    hatchedAtMs: nowMs,
    personality: pickUniform(rng, PERSONALITIES),
    bond: 0,
    parentIds: null,
    generation: 1,
    ancestry: 'unknown',
    origin: 'pack',
    activity: 'idle',
    breedCooldownUntilMs: 0,
  };
}

/** Các microhabitat có thể đặt trứng đang chờ (cùng luật với `moveDragon`), cho UI chọn chỗ. */
export function packPlacementOptions(state: GameState): PlacementCheck[] {
  return state.pendingPack ? placementOptions(state, hatchFromPack(state.pendingPack, 0)) : [];
}

export function claimPack(state: GameState, target: PackTarget, nowMs: number): Result {
  const pack = state.pendingPack;
  if (!pack) return { ok: false, code: 'no-pending-pack' };
  const dragon = hatchFromPack(pack, nowMs);
  const uid = dragon.uid;
  if (state.dragons.some((d) => d.uid === uid)) return { ok: false, code: 'invalid-command' };
  if (target.kind === 'zone') {
    const c = checkPlacement(state, dragon, target.zoneId, target.habitatId);
    if (c.blocked) return { ok: false, code: c.blocked };
    dragon.location = { kind: 'zone', zoneId: target.zoneId, habitatId: target.habitatId };
  }
  return {
    ok: true,
    state: {
      ...state,
      dragons: [...state.dragons, dragon],
      pendingPack: null,
      stats: { ...state.stats, totalHatched: state.stats.totalHatched + 1 },
    },
    events: [{ type: 'dragonHatched', dragonUid: uid, speciesId: dragon.speciesId, mutation: dragon.mutation, location: dragon.location, tutorial: pack.tutorial }],
  };
}
