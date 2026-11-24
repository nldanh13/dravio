import { DIET_IDS } from '../../data/care';
import { isDiscoveryId } from '../../data/habitatUnlocks';
import { DRAGON_SPECIES } from '../../data/dragons';
import { UPGRADES } from '../../data/economy';
import { HABITAT_PROFILES } from '../../data/g0Biology';
import { LOCI } from '../../data/genetics';
import type { GameState } from '../../types/state';
import { productionBudget } from '../economy/rates';
import { isValidGenotype } from '../genetics/alleles';

/**
 * Kiểm tra runtime GameState (GDD Phụ lục C.2): enum, số hữu hạn, giới hạn, UID duy nhất,
 * tham chiếu, quyền sở hữu vị trí. Dùng ở mọi ranh giới tin cậy (load/import ở PR2, test).
 */

export type ValidationResult = { ok: true; state: GameState } | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const oneOf = <T extends string>(v: unknown, values: readonly T[]): v is T => isStr(v) && (values as readonly string[]).includes(v);

const SPECIES = new Map(DRAGON_SPECIES.map((s) => [s.id, s]));
const LOCUS_IDS = LOCI.map((l) => l.id);
const ZONE_IDS = ['origin', 'ocean', 'sky'] as const;
const HABITAT_IDS = Object.keys(HABITAT_PROFILES);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function validateDragon(d: unknown, path: string, errors: string[]): void {
  if (!isObj(d)) {
    errors.push(`${path}: not an object`);
    return;
  }
  if (!isStr(d.uid) || d.uid.length === 0 || d.uid.length > 64) errors.push(`${path}.uid: invalid`);
  const species = isStr(d.speciesId) ? SPECIES.get(d.speciesId) : undefined;
  if (!species) errors.push(`${path}.speciesId: unknown`);
  if (species && !isValidGenotype(d.genotype, species.loci)) errors.push(`${path}.genotype: invalid alleles or loci`);
  if (!species && !isValidGenotype(d.genotype, LOCUS_IDS)) errors.push(`${path}.genotype: invalid`);
  if (!oneOf(d.mutation, ['normal', 'crystal', 'golden', 'prismatic'] as const)) errors.push(`${path}.mutation: invalid`);
  if (!isFiniteNum(d.xpSec) || d.xpSec < 0 || (species && d.xpSec > species.growthTimeSec)) errors.push(`${path}.xpSec: out of range`);
  if (typeof d.locked !== 'boolean') errors.push(`${path}.locked: not boolean`);
  if (!isInt(d.hatchedAtMs) || d.hatchedAtMs < 0) errors.push(`${path}.hatchedAtMs: invalid`);
  if (!oneOf(d.personality, ['playful', 'calm', 'curious', 'shy'] as const)) errors.push(`${path}.personality: invalid`);
  if (!isInt(d.bond) || d.bond < 0 || d.bond > 100) errors.push(`${path}.bond: out of range`);
  if (d.bondDay !== undefined && !(isStr(d.bondDay) && DAY.test(d.bondDay))) errors.push(`${path}.bondDay: invalid`);
  if (d.bondDaily !== undefined && !(isInt(d.bondDaily) && d.bondDaily >= 0 && d.bondDaily <= 10)) errors.push(`${path}.bondDaily: out of range`);
  for (const k of ['lastFeedXpAtMs', 'lastPetAtMs', 'breedCooldownUntilMs'] as const) {
    if (d[k] !== undefined && !(isInt(d[k]) && (d[k] as number) >= 0)) errors.push(`${path}.${k}: invalid`);
  }
  if (d.parentIds !== null && !(Array.isArray(d.parentIds) && d.parentIds.length === 2 && d.parentIds.every(isStr))) {
    errors.push(`${path}.parentIds: invalid`);
  }
  if (!isInt(d.generation) || d.generation < 1) errors.push(`${path}.generation: invalid`);
  if (!oneOf(d.ancestry, ['known', 'unknown'] as const)) errors.push(`${path}.ancestry: invalid`);
  if (!oneOf(d.origin, ['pack', 'breed', 'rescue', 'gift'] as const)) errors.push(`${path}.origin: invalid`);
  if (!oneOf(d.activity, ['idle', 'breeding', 'expedition', 'care'] as const)) errors.push(`${path}.activity: invalid`);
  if (d.nickname !== undefined && !isStr(d.nickname)) errors.push(`${path}.nickname: invalid`);
  const loc = d.location;
  if (!isObj(loc) || !oneOf(loc.kind, ['zone', 'storage', 'shelter', 'care', 'released'] as const)) {
    errors.push(`${path}.location: invalid`);
  } else if (loc.kind === 'zone') {
    if (!oneOf(loc.zoneId, ZONE_IDS)) errors.push(`${path}.location.zoneId: unknown`);
    if (!oneOf(loc.habitatId, HABITAT_IDS)) errors.push(`${path}.location.habitatId: unknown`);
    else if (HABITAT_PROFILES[loc.habitatId as keyof typeof HABITAT_PROFILES].zoneId !== loc.zoneId) {
      errors.push(`${path}.location: habitat not in zone`);
    }
  } else if (loc.kind === 'shelter' && !oneOf(loc.zoneId, ZONE_IDS)) {
    errors.push(`${path}.location.zoneId: unknown`);
  } else if (loc.kind === 'care' && !(isStr(loc.caseId) && loc.caseId.length > 0)) {
    errors.push(`${path}.location.caseId: invalid`);
  }
}

export function validateGameState(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(input)) return { ok: false, errors: ['state: not an object'] };
  const s = input;
  if (!isInt(s.schemaVersion) || s.schemaVersion < 1) errors.push('schemaVersion: invalid');
  if (!isStr(s.contentVersion)) errors.push('contentVersion: invalid');
  if (!isStr(s.saveId) || s.saveId.length === 0) errors.push('saveId: invalid');
  if (!isInt(s.revision) || s.revision < 0) errors.push('revision: invalid');
  if (!isInt(s.goldMicro) || s.goldMicro < 0) errors.push('goldMicro: must be a non-negative integer');
  if (!isInt(s.goldRemainder) || s.goldRemainder < 0 || s.goldRemainder >= 4000) errors.push('goldRemainder: out of range');
  if (!isInt(s.totalGoldEarnedMicro) || s.totalGoldEarnedMicro < 0) errors.push('totalGoldEarnedMicro: invalid');
  if (!isInt(s.pityCount) || s.pityCount < 0 || s.pityCount >= 200) errors.push('pityCount: out of range');

  const uids = new Set<string>();
  if (!Array.isArray(s.dragons)) errors.push('dragons: not an array');
  else {
    s.dragons.forEach((d, i) => {
      validateDragon(d, `dragons[${i}]`, errors);
      if (isObj(d) && isStr(d.uid)) {
        if (uids.has(d.uid)) errors.push(`dragons[${i}].uid: duplicate ${d.uid}`);
        uids.add(d.uid);
      }
    });
  }

  if (!Array.isArray(s.zones) || s.zones.length !== ZONE_IDS.length) errors.push('zones: must list origin, ocean, sky');
  else {
    const seen = new Set<string>();
    s.zones.forEach((z, i) => {
      if (!isObj(z) || !oneOf(z.id, ZONE_IDS)) {
        errors.push(`zones[${i}]: invalid`);
        return;
      }
      if (seen.has(z.id)) errors.push(`zones[${i}].id: duplicate`);
      seen.add(z.id);
      if (!oneOf(z.realm, ['land', 'ocean', 'sky'] as const)) errors.push(`zones[${i}].realm: invalid`);
      if (typeof z.unlocked !== 'boolean') errors.push(`zones[${i}].unlocked: invalid`);
      if (!isInt(z.capacity) || z.capacity < 0 || z.capacity > 25) errors.push(`zones[${i}].capacity: out of range`);
      if (!isInt(z.recovery) || z.recovery < 0 || z.recovery > 100) errors.push(`zones[${i}].recovery: out of range`);
      if (!Array.isArray(z.unlockedHabitatIds) || !z.unlockedHabitatIds.every((h) => oneOf(h, HABITAT_IDS) && HABITAT_PROFILES[h as keyof typeof HABITAT_PROFILES].zoneId === z.id)) {
        errors.push(`zones[${i}].unlockedHabitatIds: invalid`);
      }
      for (const k of ['decorationIds', 'activeDecorationIds'] as const) {
        if (!Array.isArray(z[k]) || !(z[k] as unknown[]).every(isStr)) errors.push(`zones[${i}].${k}: invalid`);
      }
    });
    // Sức chứa vật lý: số rồng trong zone không vượt capacity.
    if (Array.isArray(s.dragons)) {
      for (const z of s.zones) {
        if (!isObj(z) || !isInt(z.capacity)) continue;
        const count = s.dragons.filter((d) => isObj(d) && isObj(d.location) && d.location.kind === 'zone' && d.location.zoneId === z.id).length;
        if (count > z.capacity) errors.push(`zones.${String(z.id)}: ${count} dragons exceed capacity ${z.capacity}`);
      }
    }
  }

  const upgrades = s.upgrades;
  if (!isObj(upgrades)) errors.push('upgrades: invalid');
  else {
    for (const def of UPGRADES) {
      const lvl = upgrades[def.id];
      if (!isInt(lvl) || lvl < 0 || lvl > def.max) errors.push(`upgrades.${def.id}: out of range`);
    }
  }

  if (!Array.isArray(s.productionDragonIds) || !s.productionDragonIds.every(isStr)) errors.push('productionDragonIds: invalid');
  else {
    if (new Set(s.productionDragonIds).size !== s.productionDragonIds.length) errors.push('productionDragonIds: duplicates');
    for (const id of s.productionDragonIds) if (!uids.has(id)) errors.push(`productionDragonIds: unknown dragon ${id}`);
    const level = isObj(upgrades) && isInt(upgrades.islandCapacityLevel) ? upgrades.islandCapacityLevel : 0;
    if (s.productionDragonIds.length > productionBudget(level)) errors.push('productionDragonIds: exceeds production budget');
  }

  if (!isObj(s.inventory) || !Object.values(s.inventory).every((n) => isInt(n) && n >= 0)) errors.push('inventory: invalid');

  const food = s.food;
  if (!isObj(food) || !(food.lastSpawnAtMs === null || isInt(food.lastSpawnAtMs)) || !Array.isArray(food.drops)) errors.push('food: invalid');
  else {
    const ids = new Set<string>();
    food.drops.forEach((f, i) => {
      if (!isObj(f) || !isStr(f.id) || !oneOf(f.dietId, DIET_IDS) || !oneOf(f.zoneId, ZONE_IDS) || !oneOf(f.habitatId, HABITAT_IDS) || !isInt(f.spawnedAtMs) || !isInt(f.expiresAtMs) || f.expiresAtMs <= f.spawnedAtMs) {
        errors.push(`food.drops[${i}]: invalid`);
        return;
      }
      if (ids.has(f.id)) errors.push(`food.drops[${i}].id: duplicate`);
      ids.add(f.id);
    });
  }

  if (!Array.isArray(s.processedRequestIds) || !s.processedRequestIds.every(isStr)) errors.push('processedRequestIds: invalid');

  const stats = s.stats;
  if (!isObj(stats)) errors.push('stats: invalid');
  else {
    for (const k of ['totalHatched', 'totalSold', 'totalBred', 'totalFeedClicks', 'dailyFreePacksClaimed']) {
      if (!isInt(stats[k]) || (stats[k] as number) < 0) errors.push(`stats.${k}: invalid`);
    }
    if (!isStr(stats.lastDailyResetDate) || !DAY.test(stats.lastDailyResetDate)) errors.push('stats.lastDailyResetDate: invalid');
  }

  const st = s.settings;
  if (!isObj(st)) errors.push('settings: invalid');
  else {
    if (!oneOf(st.language, ['vi', 'en'] as const)) errors.push('settings.language: invalid');
    for (const k of ['sfxVolume', 'bgmVolume']) if (!isFiniteNum(st[k]) || (st[k] as number) < 0 || (st[k] as number) > 1) errors.push(`settings.${k}: out of range`);
    for (const k of ['hapticsEnabled', 'compactMode', 'reducedMotion', 'alwaysOnTop']) if (typeof st[k] !== 'boolean') errors.push(`settings.${k}: invalid`);
    if (st.fpsLimit !== 30 && st.fpsLimit !== 60) errors.push('settings.fpsLimit: invalid');
    if (!oneOf(st.timeMode, ['auto', 'day', 'sunset', 'night'] as const)) errors.push('settings.timeMode: invalid');
    if (!oneOf(st.mode, ['world', 'companion', 'zen'] as const)) errors.push('settings.mode: invalid');
    if (!oneOf(st.difficulty, ['cozy', 'ecosystem'] as const)) errors.push('settings.difficulty: invalid');
  }

  const clock = s.clock;
  if (!isObj(clock) || !isInt(clock.lastProcessedAtMs) || !isInt(clock.highWaterAtMs) || clock.lastProcessedAtMs > clock.highWaterAtMs) {
    errors.push('clock: invalid');
  }

  if (!Array.isArray(s.discoveries) || !s.discoveries.every(isDiscoveryId) || new Set(s.discoveries).size !== s.discoveries.length) {
    errors.push('discoveries: invalid');
  }

  const r = s.offlineReceipt;
  if (r !== null && !(isObj(r) && isStr(r.id) && isInt(r.fromMs) && isInt(r.toMs) && r.toMs >= r.fromMs && isInt(r.goldMicro) && r.goldMicro >= 0 && Array.isArray(r.maturedIds) && typeof r.bonusClaimed === 'boolean' && isInt(r.createdAtMs))) {
    errors.push('offlineReceipt: invalid');
  }

  return errors.length === 0 ? { ok: true, state: input as unknown as GameState } : { ok: false, errors };
}

/** Kiểm nhanh một rồng (dùng trong test và lệnh tạo rồng sau này). */
export function validateDragonInstance(d: unknown): string[] {
  const errors: string[] = [];
  validateDragon(d, 'dragon', errors);
  return errors;
}
