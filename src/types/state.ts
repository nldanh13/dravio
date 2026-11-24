import type { DiscoveryId } from '../data/habitatUnlocks';
import type { DragonInstance, GrowthStage, LanguageCode, MutationType, Realm } from './game';

/**
 * GameState (GDD 3.1 Phụ lục C.2–C.3), phạm vi G1 PR1.
 * Các phần thuộc PR sau (jobs, healthCases, disasters, research, journal, codex,
 * achievements, pendingPack, breedingNest) sẽ được thêm cùng lệnh xử lý chúng,
 * không để field rỗng không có logic.
 */

/**
 * Dravio Save Schema hiện tại. v1 = định dạng chính thức đầu tiên (ADR 0007); v2 thêm `discoveries` (ADR 0009).
 * Số 3 được dành riêng cho bản phát triển trước v1, không dùng lại.
 */
export const SCHEMA_VERSION = 2;

export interface UpgradesState {
  islandCapacityLevel: number;
  foodQualityLevel: number;
  foodCooldownLevel: number;
  mutationLuckLevel: number;
  hatchSpeedLevel: number;
}

export interface GameStats {
  totalHatched: number;
  totalSold: number;
  totalBred: number;
  totalFeedClicks: number;
  dailyFreePacksClaimed: number;
  /** UTC YYYY-MM-DD */
  lastDailyResetDate: string;
}

export interface GameSettings {
  language: LanguageCode;
  sfxVolume: number;
  bgmVolume: number;
  hapticsEnabled: boolean;
  fpsLimit: 30 | 60;
  timeMode: 'auto' | 'day' | 'sunset' | 'night';
  compactMode: boolean;
  reducedMotion: boolean;
  alwaysOnTop: boolean;
  mode: 'world' | 'companion' | 'zen';
  difficulty: 'cozy' | 'ecosystem';
}

/** Zone vật lý (ADR 0003): 3 zone, mỗi zone 5 chỗ P0; microhabitat là cấu hình trong zone. */
export interface ZoneState {
  id: 'origin' | 'ocean' | 'sky';
  realm: Realm;
  unlocked: boolean;
  capacity: number;
  unlockedHabitatIds: string[];
  decorationIds: string[];
  activeDecorationIds: string[];
  /** Độ phục hồi 0–100. */
  recovery: number;
}

/** Viên thức ăn đang tồn tại (thời gian sống 12 s). Không lưu tọa độ frame. */
export interface FoodDrop {
  id: string;
  dietId: string;
  zoneId: string;
  habitatId: string;
  spawnedAtMs: number;
  expiresAtMs: number;
}

export interface OfflineReceipt {
  id: string;
  fromMs: number;
  toMs: number;
  goldMicro: number;
  maturedIds: string[];
  bonusClaimed: boolean;
  createdAtMs: number;
}

export interface GameState {
  schemaVersion: number;
  contentVersion: string;
  saveId: string;
  revision: number;
  goldMicro: number;
  /** Phần lẻ dưới 1 microG, đơn vị microG × 1000 (microG·ms/s). */
  goldRemainder: number;
  totalGoldEarnedMicro: number;
  dragons: DragonInstance[];
  zones: ZoneState[];
  productionDragonIds: string[];
  inventory: Record<string, number>;
  upgrades: UpgradesState;
  food: { lastSpawnAtMs: number | null; drops: FoodDrop[] };
  /** requestId đã xử lý gần đây (idempotency), mới nhất ở cuối. */
  processedRequestIds: string[];
  pityCount: number;
  stats: GameStats;
  settings: GameSettings;
  clock: { lastProcessedAtMs: number; highWaterAtMs: number };
  offlineReceipt: OfflineReceipt | null;
  /** Khám phá đã ghi nhận (ADR 0009), sắp xếp, không trùng. Điều kiện mở microhabitat. Schema v2. */
  discoveries: DiscoveryId[];
}

/** Giá trị dẫn xuất cho UI — không lưu. */
export interface DragonView {
  uid: string;
  stage: GrowthStage;
  mutation: MutationType;
  rateMicroGPerSec: number;
}
