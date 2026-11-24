import { HABITAT_UNLOCK_RULES, type DiscoveryId } from '../../data/habitatUnlocks';
import type { GameState } from '../../types/state';
import type { CommandErrorCode } from '../core/errors';
import type { DomainEvent } from '../core/events';
import { findZone, habitatZone } from './placement';
import { recordDiscovery } from './zones';

/**
 * Khảo sát microhabitat chưa mở để ghi nhận khám phá (ADR 0009, 0013). Đây là **thao tác người chơi**
 * (bấm biển khám phá), engine kiểm điều kiện rồi mới ghi; cùng một đường cho người theo hướng dẫn
 * (TUT_04, TUT_06) và người bỏ qua hướng dẫn — "đường khám phá tương đương".
 *
 * - Đá ấm (`DISC_EMBERLING_THERMAL`): đang nuôi Emberling và đã xem hồ sơ sinh học của nó (biết dải nhiệt).
 * - Bờ hồ (`DISC_AQUATIC_HABITAT`): không cần sở hữu Droplet (quyết định tác giả).
 */

export type SurveyResult = { ok: true; state: GameState; events: DomainEvent[] } | { ok: false; code: CommandErrorCode };

const PREREQ: Readonly<Record<DiscoveryId, (s: GameState) => boolean>> = {
  DISC_EMBERLING_THERMAL: (s) =>
    s.dragons.some((d) => d.speciesId === 'emberling' && d.location.kind !== 'released') && s.tutorial.profilesViewed.includes('emberling'),
  DISC_AQUATIC_HABITAT: () => true,
};

export function surveyRequirementMet(state: GameState, discovery: DiscoveryId): boolean {
  return PREREQ[discovery](state);
}

export function surveyHabitat(state: GameState, habitatId: string): SurveyResult {
  const rule = (HABITAT_UNLOCK_RULES as Record<string, { requires: DiscoveryId | null } | undefined>)[habitatId];
  if (!rule?.requires) return { ok: false, code: 'unknown-habitat' };
  const zoneId = habitatZone(habitatId);
  if (!zoneId || !findZone(state, zoneId)?.unlocked) return { ok: false, code: 'zone-locked' };
  if (state.discoveries.includes(rule.requires)) return { ok: false, code: 'discovery-already-known' };
  if (!PREREQ[rule.requires](state)) return { ok: false, code: 'survey-requirement-missing' };
  const r = recordDiscovery(state, rule.requires);
  if (!r.ok) return { ok: false, code: 'discovery-already-known' };
  return { ok: true, state: r.state, events: [{ type: 'habitatSurveyed', habitatId }, ...r.events] };
}
