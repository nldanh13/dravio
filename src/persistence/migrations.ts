import { CONTENT_VERSION } from '../data/content';
import { DRAGON_SPECIES } from '../data/dragons';
import { UPGRADES } from '../data/economy';
import { HABITAT_PROFILES, type HabitatId } from '../data/g0Biology';
import { createInitialState } from '../engine/core/initialState';
import { createRng, hashSeed, pickUniform } from '../engine/core/rng';
import { productionBudget } from '../engine/economy/rates';
import { founderGenotype } from '../engine/genetics/alleles';
import { normalizeNickname } from '../engine/inventory/nickname';
import type { DragonInstance, MutationType, Personality } from '../types/game';
import type { GameState, UpgradesState } from '../types/state';

/**
 * Migration save cũ (Tendorya, GDD 2.0) → v3 (GDD 3.1 trang 18, 32; ADR 0006).
 *
 * Repo chưa có file save v1/v2 thật. Hình dạng dưới đây được dựng từ mô tả GDD trang 32
 * ("location island/storage; xp/xpMs; save key v2") và Phụ lục C.1 — là GIẢ ĐỊNH cần
 * đối chiếu với save thật trước khi phát hành. Dữ liệu không khớp bị từ chối, không đoán.
 */

export const LEGACY_V2_STORAGE_KEY = 'tendorya_save_v2';

const MUTATIONS: readonly MutationType[] = ['normal', 'crystal', 'golden', 'prismatic'];
const PERSONALITIES: readonly Personality[] = ['playful', 'calm', 'curious', 'shy'];
const SPECIES = new Map(DRAGON_SPECIES.map((s) => [s.id, s]));

export interface LegacyDragonV1 {
  uid: string;
  speciesId: string;
  nickname?: string;
  mutation: MutationType;
  /** v1: XP tính bằng giây. */
  xp: number;
  locked?: boolean;
  location: 'island' | 'storage';
  hatchedAt?: number;
}

export interface LegacyDragonV2 extends Omit<LegacyDragonV1, 'xp'> {
  /** v2: XP tính bằng mili-giây. */
  xpMs: number;
}

interface LegacyCommon {
  /** Vàng dạng G (có thể lẻ). */
  gold: number;
  upgrades?: Partial<Record<keyof UpgradesState, number>>;
  pityCount?: number;
  lastSavedAt: number;
  totalGoldEarned?: number;
  settings?: { language?: 'vi' | 'en' };
}

export interface LegacySaveV1 extends LegacyCommon {
  version: 1;
  dragons: LegacyDragonV1[];
}

export interface LegacySaveV2 extends LegacyCommon {
  version: 2;
  dragons: LegacyDragonV2[];
}

export type MigrationResult<T> = { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function checkLegacyDragon(d: unknown, i: number, xpKey: 'xp' | 'xpMs', errors: string[]): void {
  if (!isObj(d)) {
    errors.push(`dragons[${i}]: not an object`);
    return;
  }
  if (typeof d.uid !== 'string' || d.uid.length === 0 || d.uid.length > 64) errors.push(`dragons[${i}].uid: invalid`);
  if (typeof d.speciesId !== 'string' || !SPECIES.has(d.speciesId)) errors.push(`dragons[${i}].speciesId: unknown ${String(d.speciesId)}`);
  if (!MUTATIONS.includes(d.mutation as MutationType)) errors.push(`dragons[${i}].mutation: invalid`);
  if (!isNum(d[xpKey]) || (d[xpKey] as number) < 0) errors.push(`dragons[${i}].${xpKey}: invalid`);
  if (d.location !== 'island' && d.location !== 'storage') errors.push(`dragons[${i}].location: invalid`);
  if (d.nickname !== undefined && typeof d.nickname !== 'string') errors.push(`dragons[${i}].nickname: invalid`);
}

function checkLegacy(input: Obj, version: 1 | 2): string[] {
  const errors: string[] = [];
  if (!isNum(input.gold) || input.gold < 0) errors.push('gold: invalid');
  if (!isNum(input.lastSavedAt) || input.lastSavedAt < 0) errors.push('lastSavedAt: invalid');
  if (!Array.isArray(input.dragons)) errors.push('dragons: not an array');
  else {
    input.dragons.forEach((d, i) => checkLegacyDragon(d, i, version === 1 ? 'xp' : 'xpMs', errors));
    const uids = input.dragons.map((d) => (isObj(d) ? d.uid : undefined));
    if (new Set(uids).size !== uids.length) errors.push('dragons: duplicate uid');
  }
  return errors;
}

/** v1 → v2: đổi XP từ giây sang mili-giây; giữ nguyên UID, loài, biến thể. */
export function migrateV1toV2(save: LegacySaveV1): LegacySaveV2 {
  return {
    ...save,
    version: 2,
    dragons: save.dragons.map(({ xp, ...rest }) => ({ ...rest, xpMs: Math.round(xp * 1000) })),
  };
}

/**
 * v2 → v3:
 * - Giữ UID, speciesId, biến thể, tên, khóa. Không cấp Verified/registryRef, không nhập entitlement.
 * - Genotype founder ổn định từ UID + contentVersion; ancestry unknown; thế hệ 1.
 * - "island" → Origin nếu loài sống được ở đồng cỏ (microhabitat mở sẵn ở G1) và còn chỗ;
 *   ngược lại vào kho an toàn (không sản xuất) — ADR 0003.
 * - Vàng G → microG làm tròn xuống (không tạo thêm vàng).
 */
export function migrateV2toV3(save: LegacySaveV2): MigrationResult<GameState> {
  const warnings: string[] = [];
  const nowMs = Math.floor(save.lastSavedAt);
  const base = createInitialState({ saveId: `legacy-${hashSeed('legacy', ...save.dragons.map((d) => d.uid)).toString(16)}`, nowMs, rng: createRng(1) });
  const upgrades = { ...base.upgrades };
  for (const def of UPGRADES) {
    const lvl = save.upgrades?.[def.id];
    if (lvl === undefined) continue;
    if (!Number.isInteger(lvl) || lvl < 0) {
      warnings.push(`upgrades.${def.id}: invalid value ${String(lvl)} reset to 0`);
      continue;
    }
    if (lvl > def.max) warnings.push(`upgrades.${def.id}: ${lvl} clamped to max ${def.max}`);
    upgrades[def.id] = Math.min(lvl, def.max);
  }

  const origin = base.zones.find((z) => z.id === 'origin');
  const capacity = origin?.capacity ?? 5;
  const openHabitats = new Set(origin?.unlockedHabitatIds ?? []);
  let inOrigin = 0;
  const dragons: DragonInstance[] = save.dragons.map((d) => {
    const species = SPECIES.get(d.speciesId);
    if (!species) throw new Error(`unreachable: species ${d.speciesId} validated earlier`);
    const habitat = species.habitatRules.find(
      (h) => HABITAT_PROFILES[h as HabitatId].zoneId === 'origin' && openHabitats.has(h),
    );
    let location: DragonInstance['location'] = { kind: 'storage' };
    if (d.location === 'island') {
      if (habitat && inOrigin < capacity) {
        location = { kind: 'zone', zoneId: 'origin', habitatId: habitat };
        inOrigin++;
      } else {
        warnings.push(`${d.uid}: moved to safe storage (${habitat ? 'origin full' : 'no open habitat for species'})`);
      }
    }
    const xpSec = Math.min(species.growthTimeSec, Math.max(0, d.xpMs) / 1000);
    const dragon: DragonInstance = {
      uid: d.uid,
      speciesId: species.id,
      genotype: founderGenotype(d.uid, CONTENT_VERSION, species.loci),
      mutation: d.mutation,
      xpSec,
      locked: d.locked === true,
      location,
      hatchedAtMs: isNum(d.hatchedAt) && d.hatchedAt >= 0 ? Math.floor(d.hatchedAt) : nowMs,
      personality: pickUniform(createRng(hashSeed('personality', d.uid)), PERSONALITIES),
      bond: 0,
      parentIds: null,
      generation: 1,
      ancestry: 'unknown',
      origin: 'pack',
      activity: 'idle',
      breedCooldownUntilMs: 0,
    };
    if (d.nickname !== undefined) {
      const name = normalizeNickname(d.nickname);
      if (name.ok) dragon.nickname = name.value;
      else warnings.push(`${d.uid}: nickname dropped (${name.code})`);
    }
    return dragon;
  });

  const budget = productionBudget(upgrades.islandCapacityLevel);
  const productionDragonIds = dragons.filter((d) => d.location.kind === 'zone').slice(0, budget).map((d) => d.uid);
  const goldMicro = Math.floor(save.gold * 1_000_000);
  const pity = Number.isInteger(save.pityCount) && (save.pityCount ?? 0) >= 0 && (save.pityCount ?? 0) < 200 ? (save.pityCount ?? 0) : 0;

  const state: GameState = {
    ...base,
    goldMicro,
    totalGoldEarnedMicro: isNum(save.totalGoldEarned) && save.totalGoldEarned >= 0 ? Math.floor(save.totalGoldEarned * 1_000_000) : 0,
    dragons,
    productionDragonIds,
    upgrades,
    pityCount: pity,
    settings: { ...base.settings, language: save.settings?.language === 'en' ? 'en' : 'vi' },
  };
  return { ok: true, value: state, warnings };
}

/** Nhận object save cũ (đã JSON.parse), kiểm hình dạng rồi chạy chuỗi v1 → v2 → v3. */
export function migrateLegacy(input: unknown): MigrationResult<GameState> & { fromVersion?: 1 | 2 } {
  if (!isObj(input) || (input.version !== 1 && input.version !== 2)) {
    return { ok: false, errors: ['not a recognised legacy save (version 1 or 2)'] };
  }
  const version = input.version;
  const errors = checkLegacy(input, version);
  if (errors.length > 0) return { ok: false, errors };
  const v2 = version === 1 ? migrateV1toV2(input as unknown as LegacySaveV1) : (input as unknown as LegacySaveV2);
  return { ...migrateV2toV3(v2), fromVersion: version };
}
