import { HABITAT_PROFILES, type HabitatId } from '../../data/g0Biology';
import { HABITAT_UNLOCK_RULES, type DiscoveryId } from '../../data/habitatUnlocks';
import type { DragonInstance, Location } from '../../types/game';
import type { GameState } from '../../types/state';
import type { CommandErrorCode } from '../core/errors';
import type { DomainEvent } from '../core/events';
import { productionBudget } from '../economy/rates';
import { speciesSuitability, suitabilityTier, type HabitatResult, type SuitabilityTier } from './habitat';
import { findZone, habitatZone, isPlacedInValidHabitat } from './placement';

/**
 * Zone Khởi Nguyên và luật bố trí (GDD 3.1 trang 5; ADR 0003; PACK_README G0; ADR 0008, 0009).
 * Zone là chỗ vật lý (P0: 5 chỗ/zone); microhabitat là cấu hình trong zone, không thêm chỗ.
 * Ngân sách sản xuất toàn cục = 5 + 2 × cấp, tối đa 25; rồng ngoài ngân sách vẫn sống và lớn.
 */

export type ZoneId = 'origin' | 'ocean' | 'sky';

/** Microhabitat của một zone theo HABITAT_PROFILES (thứ tự ổn định). */
export function habitatsOfZone(zoneId: ZoneId): HabitatId[] {
  return (Object.keys(HABITAT_PROFILES) as HabitatId[]).filter((h) => HABITAT_PROFILES[h].zoneId === zoneId);
}

/** Số rồng đang chiếm chỗ vật lý trong zone (mọi microhabitat cộng lại). */
export function zoneOccupancy(state: GameState, zoneId: string): number {
  return state.dragons.filter((d) => d.location.kind === 'zone' && d.location.zoneId === zoneId).length;
}

export function currentProductionBudget(state: GameState): number {
  return productionBudget(state.upgrades.islandCapacityLevel);
}

export interface PlacementCheck {
  zoneId: ZoneId;
  habitatId: HabitatId;
  result: HabitatResult;
  tier: SuitabilityTier;
  freeSlots: number;
  /** null = được phép chuyển tới. */
  blocked: CommandErrorCode | null;
}

function busyReason(dragon: DragonInstance): CommandErrorCode | null {
  const k = dragon.location.kind;
  if (k === 'released' || k === 'care' || k === 'shelter') return 'dragon-unavailable';
  if (dragon.activity !== 'idle') return 'dragon-unavailable';
  return null;
}

/** Kiểm một đích cụ thể. Dùng chung cho lệnh `moveDragon` và màn hình chọn chỗ. */
export function checkPlacement(state: GameState, dragon: DragonInstance, zoneId: string, habitatId: string): PlacementCheck | { blocked: CommandErrorCode } {
  if (habitatZone(habitatId) !== zoneId) return { blocked: 'habitat-locked' };
  const h = habitatId as HabitatId;
  const z = zoneId as ZoneId;
  const zone = findZone(state, zoneId);
  const result = speciesSuitability(dragon.speciesId, h);
  const sameZone = dragon.location.kind === 'zone' && dragon.location.zoneId === zoneId;
  const freeSlots = zone ? zone.capacity - zoneOccupancy(state, zoneId) + (sameZone ? 1 : 0) : 0;
  const base = { zoneId: z, habitatId: h, result, tier: suitabilityTier(result), freeSlots };
  let blocked: CommandErrorCode | null = busyReason(dragon);
  if (!blocked && !zone?.unlocked) blocked = 'zone-locked';
  else if (!blocked && !zone?.unlockedHabitatIds.includes(habitatId)) blocked = 'habitat-locked';
  else if (!blocked && !result.allowed) blocked = 'habitat-unsuitable';
  else if (!blocked && dragon.location.kind === 'zone' && dragon.location.zoneId === zoneId && dragon.location.habitatId === habitatId) blocked = 'already-there';
  else if (!blocked && freeSlots <= 0) blocked = 'zone-full';
  return { ...base, blocked };
}

/** Mọi microhabitat của các zone, kèm suitability và lý do chặn — cho UI và test. */
export function placementOptions(state: GameState, dragon: DragonInstance): PlacementCheck[] {
  const out: PlacementCheck[] = [];
  for (const z of ['origin', 'ocean', 'sky'] as const) {
    for (const h of habitatsOfZone(z)) {
      const c = checkPlacement(state, dragon, z, h);
      if ('zoneId' in c) out.push(c);
    }
  }
  return out;
}

export type MoveTarget = { kind: 'zone'; zoneId: string; habitatId: string } | { kind: 'storage' };

export type WorldResult = { ok: true; state: GameState; events: DomainEvent[] } | { ok: false; code: CommandErrorCode };

/**
 * Chuyển rồng giữa microhabitat hoặc vào kho an toàn (không sản xuất).
 * Vào kho thì rời ngân sách sản xuất. Gọi sau khi đã quyết toán thời gian.
 */
export function moveDragon(state: GameState, dragon: DragonInstance, target: MoveTarget): WorldResult {
  let to: Location;
  if (target.kind === 'storage') {
    const busy = busyReason(dragon);
    if (busy) return { ok: false, code: busy };
    if (dragon.location.kind === 'storage') return { ok: false, code: 'already-there' };
    to = { kind: 'storage' };
  } else {
    const c = checkPlacement(state, dragon, target.zoneId, target.habitatId);
    if (c.blocked) return { ok: false, code: c.blocked };
    to = { kind: 'zone', zoneId: target.zoneId, habitatId: target.habitatId };
  }
  const moved: DragonInstance = { ...dragon, location: to };
  const leavesProduction = to.kind !== 'zone' && state.productionDragonIds.includes(dragon.uid);
  const events: DomainEvent[] = [{ type: 'dragonMoved', dragonUid: dragon.uid, from: dragon.location, to }];
  if (leavesProduction) events.push({ type: 'productionChanged', dragonUid: dragon.uid, enabled: false });
  return {
    ok: true,
    state: {
      ...state,
      dragons: state.dragons.map((d) => (d.uid === dragon.uid ? moved : d)),
      productionDragonIds: leavesProduction ? state.productionDragonIds.filter((id) => id !== dragon.uid) : state.productionDragonIds,
    },
    events,
  };
}

/** Chọn/bỏ rồng khỏi ngân sách sản xuất. Chọn chỉ khi rồng ở sinh cảnh đã mở và hợp lệ. */
export function setProduction(state: GameState, dragon: DragonInstance, enabled: boolean): WorldResult {
  const inList = state.productionDragonIds.includes(dragon.uid);
  if (!enabled) {
    if (!inList) return { ok: false, code: 'already-there' };
    return {
      ok: true,
      state: { ...state, productionDragonIds: state.productionDragonIds.filter((id) => id !== dragon.uid) },
      events: [{ type: 'productionChanged', dragonUid: dragon.uid, enabled: false }],
    };
  }
  if (inList) return { ok: false, code: 'already-there' };
  if (dragon.location.kind === 'released') return { ok: false, code: 'dragon-unavailable' };
  if (!isPlacedInValidHabitat(state, dragon)) return { ok: false, code: 'not-placed' };
  if (state.productionDragonIds.length >= currentProductionBudget(state)) return { ok: false, code: 'production-budget-full' };
  return {
    ok: true,
    state: { ...state, productionDragonIds: [...state.productionDragonIds, dragon.uid] },
    events: [{ type: 'productionChanged', dragonUid: dragon.uid, enabled: true }],
  };
}

/**
 * Mở một microhabitat (lệnh người chơi `unlockHabitat`, ADR 0009). Miễn phí; không đổi sức chứa
 * hay ngân sách. Chỉ chấp nhận khi khám phá điều kiện đã được engine ghi nhận.
 */
export function unlockHabitat(state: GameState, habitatId: string): WorldResult {
  if (!isRuledHabitat(habitatId)) return { ok: false, code: 'unknown-habitat' };
  const zoneId = habitatZone(habitatId);
  const zone = zoneId === null ? undefined : findZone(state, zoneId);
  if (!zone?.unlocked) return { ok: false, code: 'zone-locked' };
  if (zone.unlockedHabitatIds.includes(habitatId)) return { ok: false, code: 'habitat-already-unlocked' };
  const rule = HABITAT_UNLOCK_RULES[habitatId];
  if (rule.requires !== null && !state.discoveries.includes(rule.requires)) return { ok: false, code: 'unlock-requirement-missing' };
  const unlocked = habitatsOfZone(zone.id).filter((h) => h === habitatId || zone.unlockedHabitatIds.includes(h));
  return {
    ok: true,
    state: { ...state, zones: state.zones.map((z) => (z.id === zone.id ? { ...z, unlockedHabitatIds: unlocked } : z)) },
    events: [{ type: 'habitatUnlocked', zoneId: zone.id, habitatId }],
  };
}

function isRuledHabitat(id: string): id is keyof typeof HABITAT_UNLOCK_RULES {
  return Object.prototype.hasOwnProperty.call(HABITAT_UNLOCK_RULES, id);
}

/** Trạng thái mở khóa từng microhabitat có luật, cho UI. */
export function habitatUnlockStatus(state: GameState): { habitatId: string; unlocked: boolean; requires: DiscoveryId | null; eligible: boolean }[] {
  return habitatsOfZone('origin').filter(isRuledHabitat).map((habitatId) => {
    const rule = HABITAT_UNLOCK_RULES[habitatId];
    const zone = findZone(state, HABITAT_PROFILES[habitatId].zoneId);
    const unlocked = zone?.unlockedHabitatIds.includes(habitatId) ?? false;
    return { habitatId, unlocked, requires: rule.requires, eligible: !unlocked && unlockHabitat(state, habitatId).ok };
  });
}

/**
 * Ghi nhận một khám phá. KHÔNG phải lệnh người chơi: chỉ engine gọi — lệnh `surveyHabitat`
 * (ADR 0013) sau khi tự kiểm điều kiện khảo sát; UI production không có đường nào gọi hàm này trực tiếp.
 */
export function recordDiscovery(state: GameState, id: DiscoveryId): WorldResult {
  if (state.discoveries.includes(id)) return { ok: false, code: 'already-there' };
  return {
    ok: true,
    state: { ...state, discoveries: [...state.discoveries, id].sort() },
    events: [{ type: 'discoveryRecorded', discoveryId: id }],
  };
}
