import { ACHIEVEMENT_IDS, ACHIEVEMENT_REWARD_G, type AchievementId } from '../../data/achievements';
import { getSpecies } from '../../data/dragons';
import { MICRO_PER_G } from '../../data/economy';
import type { GameState } from '../../types/state';
import type { DomainEvent } from '../core/events';
import { growthStage } from '../economy/rates';

/**
 * Điều kiện thành tựu đã cài (GDD Phụ lục F; S01). Chỉ hai mốc của vertical slice:
 * - ACH_FIRST_HATCH: nở trứng đầu tiên, gồm trứng hướng dẫn. Rồng có sẵn lúc tạo save không tính.
 * - ACH_FIRST_ADULT: rồng đầu tiên đạt Adult (kể cả rồng có sẵn).
 */
const RULES: Partial<Record<AchievementId, (s: GameState) => boolean>> = {
  ACH_FIRST_HATCH: (s) => s.stats.totalHatched >= 1,
  ACH_FIRST_ADULT: (s) => s.dragons.some((d) => d.location.kind !== 'released' && growthStage(d.xpSec, getSpecies(d.speciesId)) === 'adult'),
};

export function implementedAchievements(): AchievementId[] {
  return ACHIEVEMENT_IDS.filter((id) => RULES[id] !== undefined);
}

/** Mở và tự nhận (một lần) các thành tựu vừa đạt. Thưởng cộng vào vàng, không vào totalGoldEarned. */
export function evaluateAchievements(state: GameState): { state: GameState; events: DomainEvent[] } {
  const fresh = ACHIEVEMENT_IDS.filter((id) => !state.unlockedAchievements.includes(id) && RULES[id]?.(state) === true);
  if (fresh.length === 0) return { state, events: [] };
  const order = (ids: AchievementId[]) => ACHIEVEMENT_IDS.filter((id) => ids.includes(id));
  let gold = state.goldMicro;
  const events: DomainEvent[] = [];
  const claimed = [...state.claimedAchievements];
  for (const id of fresh) {
    const reward = ACHIEVEMENT_REWARD_G[id] * MICRO_PER_G;
    gold += reward;
    claimed.push(id);
    events.push({ type: 'achievementUnlocked', achievementId: id, rewardGoldMicro: reward });
  }
  return {
    state: { ...state, goldMicro: gold, unlockedAchievements: order([...state.unlockedAchievements, ...fresh]), claimedAchievements: order(claimed) },
    events,
  };
}
