import { HABITAT_PROFILES, type HabitatId } from '../../data/g0Biology';
import type { DragonInstance, Location } from '../../types/game';
import type { GameState } from '../../types/state';
import type { CommandErrorCode } from '../core/errors';
import type { DomainEvent } from '../core/events';
import { productionBudget } from '../economy/rates';
import { speciesSuitability, suitabilityTier, type HabitatResult, type SuitabilityTier } from './habitat';
import { findZone, habitatZone, isPlacedInValidHabitat } from './placement';

/**
 * Zone Khởi Nguyên và luật bố trí (GDD 3.1 trang 5; ADR 0003; PACK_README G0; ADR 0008).
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
 * Mở một microhabitat trong zone đã mở. Không phải lệnh người chơi: là phần thưởng của
 * hướng dẫn/khám phá (PACK_README: pondbank, warm_rocks mở qua hướng dẫn/khám phá — nối ở PR5).
 * Không có giá vàng vì GDD chưa định giá.
 */
export function grantHabitatUnlock(state: GameState, habitatId: string): WorldResult {
  const zoneId = habitatZone(habitatId);
  if (zoneId === null) return { ok: false, code: 'habitat-locked' };
  const zone = findZone(state, zoneId);
  if (!zone?.unlocked) return { ok: false, code: 'zone-locked' };
  if (zone.unlockedHabitatIds.includes(habitatId)) return { ok: false, code: 'already-there' };
  const order = habitatsOfZone(zone.id);
  const unlocked = order.filter((h) => h === habitatId || zone.unlockedHabitatIds.includes(h));
  return {
    ok: true,
    state: { ...state, zones: state.zones.map((z) => (z.id === zone.id ? { ...z, unlockedHabitatIds: unlocked } : z)) },
    events: [{ type: 'habitatUnlocked', zoneId: zone.id, habitatId }],
  };
}
