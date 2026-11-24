import type { GrowthStage, Location } from '../../types/game';

/** Domain events do engine phát ra sau mỗi lệnh thành công. UI chỉ đọc, không suy diễn lại. */
export type DomainEvent =
  | { type: 'timeAdvanced'; fromMs: number; toMs: number; elapsedMs: number; mode: 'online' | 'offline'; goldMicro: number }
  | { type: 'stageChanged'; dragonUid: string; from: GrowthStage; to: GrowthStage }
  | { type: 'offlineReceiptCreated'; receiptId: string; goldMicro: number; elapsedMs: number }
  | { type: 'foodSpawned'; foodId: string; dietId: string; zoneId: string; habitatId: string; expiresAtMs: number }
  | { type: 'foodExpired'; foodId: string }
  | { type: 'foodConsumed'; foodId: string; dragonUid: string; xpGainedSec: number }
  | { type: 'bondChanged'; dragonUid: string; from: number; to: number; source: 'feed' | 'pet' }
  | { type: 'dragonPetted'; dragonUid: string }
  | { type: 'dragonRenamed'; dragonUid: string; nickname: string | null }
  | { type: 'dragonMoved'; dragonUid: string; from: Location; to: Location }
  | { type: 'productionChanged'; dragonUid: string; enabled: boolean }
  | { type: 'habitatUnlocked'; zoneId: string; habitatId: string }
  | { type: 'discoveryRecorded'; discoveryId: string }
  | { type: 'habitatSurveyed'; habitatId: string }
  | { type: 'biologyProfileViewed'; speciesId: string }
  | { type: 'tutorialStepCompleted'; stepId: string }
  | { type: 'tutorialStatusChanged'; status: 'active' | 'skipped' | 'completed' }
  | { type: 'packBought'; packId: string; speciesId: string; priceGoldMicro: number; tutorial: boolean }
  | { type: 'dragonHatched'; dragonUid: string; speciesId: string; mutation: string; location: Location; tutorial: boolean }
  | { type: 'achievementUnlocked'; achievementId: string; rewardGoldMicro: number };
