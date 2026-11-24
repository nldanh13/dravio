import type { GrowthStage } from '../../types/game';

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
  | { type: 'dragonRenamed'; dragonUid: string; nickname: string | null };
