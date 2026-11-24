import { CONTENT_VERSION } from '../../data/content';
import { getSpecies } from '../../data/dragons';
import type { DragonInstance, Personality } from '../../types/game';
import { SCHEMA_VERSION, type GameState } from '../../types/state';
import { founderGenotype } from '../genetics/alleles';
import { pickUniform, type Rng } from './rng';

const PERSONALITIES: readonly Personality[] = ['playful', 'calm', 'curious', 'shy'];

/** UID ngẫu nhiên cục bộ (GDD trang 13), tạo từ RNG đã tiêm để tái lập được trong test. */
export function newUid(rng: Rng, prefix = 'd'): string {
  let hex = '';
  for (let i = 0; i < 4; i++) hex += Math.floor(rng.next() * 0x10000).toString(16).padStart(4, '0');
  return `${prefix}_${hex}`;
}

export const STARTING_GOLD_MICRO = 150_000_000;

/**
 * Save mới (GDD trang 4, kịch bản S01): 150 G, một Emberling baby XP 0 ở origin_meadow,
 * đã chọn vào slot sản xuất, biến thể Normal. Origin mở (5 chỗ, chỉ đồng cỏ), Ocean/Sky khóa.
 * Trứng hướng dẫn Sprout thuộc G1 PR5 (tutorial).
 */
export function createInitialState(opts: { saveId: string; nowMs: number; rng: Rng }): GameState {
  const { saveId, nowMs, rng } = opts;
  const uid = newUid(rng);
  const species = getSpecies('emberling');
  const ember: DragonInstance = {
    uid,
    speciesId: species.id,
    genotype: founderGenotype(uid, CONTENT_VERSION, species.loci),
    mutation: 'normal',
    xpSec: 0,
    locked: false,
    location: { kind: 'zone', zoneId: 'origin', habitatId: 'origin_meadow' },
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
  return {
    schemaVersion: SCHEMA_VERSION,
    contentVersion: CONTENT_VERSION,
    saveId,
    revision: 0,
    goldMicro: STARTING_GOLD_MICRO,
    goldRemainder: 0,
    totalGoldEarnedMicro: 0,
    dragons: [ember],
    zones: [
      { id: 'origin', realm: 'land', unlocked: true, capacity: 5, unlockedHabitatIds: ['origin_meadow'], decorationIds: [], activeDecorationIds: [], recovery: 0 },
      { id: 'ocean', realm: 'ocean', unlocked: false, capacity: 5, unlockedHabitatIds: [], decorationIds: [], activeDecorationIds: [], recovery: 0 },
      { id: 'sky', realm: 'sky', unlocked: false, capacity: 5, unlockedHabitatIds: [], decorationIds: [], activeDecorationIds: [], recovery: 0 },
    ],
    productionDragonIds: [uid],
    inventory: {},
    upgrades: { islandCapacityLevel: 0, foodQualityLevel: 0, foodCooldownLevel: 0, mutationLuckLevel: 0, hatchSpeedLevel: 0 },
    food: { lastSpawnAtMs: null, drops: [] },
    discoveries: [],
    processedRequestIds: [],
    pityCount: 0,
    stats: {
      totalHatched: 0,
      totalSold: 0,
      totalBred: 0,
      totalFeedClicks: 0,
      dailyFreePacksClaimed: 0,
      lastDailyResetDate: new Date(nowMs).toISOString().slice(0, 10),
    },
    settings: {
      language: 'vi',
      sfxVolume: 0.8,
      bgmVolume: 0.6,
      hapticsEnabled: true,
      fpsLimit: 60,
      timeMode: 'auto',
      compactMode: false,
      reducedMotion: false,
      alwaysOnTop: false,
      mode: 'world',
      difficulty: 'ecosystem',
    },
    clock: { lastProcessedAtMs: nowMs, highWaterAtMs: nowMs },
    offlineReceipt: null,
  };
}
