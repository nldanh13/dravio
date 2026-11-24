import { HABITAT_PROFILES, suitability, type HabitatId } from '../../data/g0Biology';
import type { DragonInstance } from '../../types/game';
import type { GameState, ZoneState } from '../../types/state';

/** Microhabitat thuộc zone nào (theo HABITAT_PROFILES). */
export function habitatZone(habitatId: string): string | null {
  return Object.prototype.hasOwnProperty.call(HABITAT_PROFILES, habitatId)
    ? HABITAT_PROFILES[habitatId as HabitatId].zoneId
    : null;
}

export function findZone(state: GameState, zoneId: string): ZoneState | undefined {
  return state.zones.find((z) => z.id === zoneId);
}

/** Rồng đang ở một microhabitat đã mở và hợp sinh học (suitability ≥ 50). */
export function isPlacedInValidHabitat(state: GameState, dragon: DragonInstance): boolean {
  const loc = dragon.location;
  if (loc.kind !== 'zone' || loc.habitatId === undefined) return false;
  const zone = findZone(state, loc.zoneId);
  if (!zone?.unlocked || !zone.unlockedHabitatIds.includes(loc.habitatId)) return false;
  if (habitatZone(loc.habitatId) !== loc.zoneId) return false;
  const habitatId = loc.habitatId as HabitatId;
  return suitability(dragon.speciesId, habitatId, HABITAT_PROFILES[habitatId]).allowed;
}

/**
 * Rồng sinh vàng khi: nằm trong ngân sách sản xuất, ở sinh cảnh hợp lệ và không bận
 * (care/expedition/breeding tạm dừng sản xuất — GDD trang 15).
 */
export function isProducing(state: GameState, dragon: DragonInstance): boolean {
  return (
    state.productionDragonIds.includes(dragon.uid) &&
    dragon.activity === 'idle' &&
    isPlacedInValidHabitat(state, dragon)
  );
}
