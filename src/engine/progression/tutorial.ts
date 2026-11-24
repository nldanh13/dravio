import { getSpecies } from '../../data/dragons';
import { TUTORIAL_OBSERVE_MS, TUTORIAL_STEP_IDS, type TutorialStepId } from '../../data/tutorial';
import type { GameState, TutorialState } from '../../types/state';
import type { DomainEvent } from '../core/events';
import { growthStage } from '../economy/rates';

/**
 * Chuỗi hướng dẫn TUT_01–TUT_08 (ADR 0009 mục 4; ADR 0013). Mỗi điều kiện đọc **GameState**, không đọc
 * thao tác UI, nên bỏ qua rồi xem lại vẫn tính đúng những gì người chơi đã làm. Bước chỉ hoàn thành theo thứ tự.
 */

const unlocked = (s: GameState, h: string) => s.zones.some((z) => z.id === 'origin' && z.unlockedHabitatIds.includes(h));
const alive = (s: GameState) => s.dragons.filter((d) => d.location.kind !== 'released');

export const STEP_DONE: Readonly<Record<TutorialStepId, (s: GameState) => boolean>> = {
  /** Quan sát Emberling: đã chơi ≥ 15 s kể từ khi bắt đầu hướng dẫn và có rồng trong Khu Khởi Nguyên. */
  TUT_01: (s) => s.clock.lastProcessedAtMs - s.tutorial.startedAtMs >= TUTORIAL_OBSERVE_MS && alive(s).some((d) => d.location.kind === 'zone'),
  /** Cho ăn đúng thức ăn: engine đã chấp nhận ít nhất một lần `consumeFood` (đúng chế độ ăn, đúng chỗ). */
  TUT_02: (s) => alive(s).some((d) => d.lastFeedXpAtMs !== undefined),
  /** Xem hồ sơ sinh học của Emberling. */
  TUT_03: (s) => s.tutorial.profilesViewed.includes('emberling'),
  /** Khám phá đá ấm và mở `origin_warm_rocks`. */
  TUT_04: (s) => unlocked(s, 'origin_warm_rocks'),
  /** Mở gói Starter có Sproutling: đã mua và đã nhận trứng. */
  TUT_05: (s) => s.tutorial.starterPackUsed && s.pendingPack === null,
  /** Khảo sát bờ hồ và mở `origin_pondbank`. */
  TUT_06: (s) => unlocked(s, 'origin_pondbank'),
  /** Rồng đầu tiên trưởng thành. */
  TUT_07: (s) => alive(s).some((d) => growthStage(d.xpSec, getSpecies(d.speciesId)) === 'adult'),
  /** Hoàn thành hướng dẫn ba sinh cảnh. */
  TUT_08: (s) => ['origin_meadow', 'origin_warm_rocks', 'origin_pondbank'].every((h) => unlocked(s, h)),
};

export function currentStep(t: TutorialState): TutorialStepId | null {
  return TUTORIAL_STEP_IDS.find((id) => !t.completed.includes(id)) ?? null;
}

/** Đánh dấu các bước liên tiếp đã thỏa (chỉ khi hướng dẫn đang chạy). */
export function evaluateTutorial(state: GameState): { state: GameState; events: DomainEvent[] } {
  if (state.tutorial.status !== 'active') return { state, events: [] };
  const completed = [...state.tutorial.completed];
  const events: DomainEvent[] = [];
  let s = state;
  for (;;) {
    const step = TUTORIAL_STEP_IDS.find((id) => !completed.includes(id));
    if (!step || !STEP_DONE[step](s)) break;
    completed.push(step);
    events.push({ type: 'tutorialStepCompleted', stepId: step });
    s = { ...s, tutorial: { ...s.tutorial, completed: [...completed] } };
  }
  if (completed.length === TUTORIAL_STEP_IDS.length) {
    s = { ...s, tutorial: { ...s.tutorial, status: 'completed' } };
    events.push({ type: 'tutorialStatusChanged', status: 'completed' });
  }
  return { state: s, events };
}

/** Bỏ qua hoặc xem lại. Xem lại giữ các bước đã xong, đặt lại mốc quan sát nếu TUT_01 chưa xong. */
export function setTutorialStatus(state: GameState, status: 'active' | 'skipped', nowMs: number): { ok: true; state: GameState; events: DomainEvent[] } | { ok: false; code: 'already-there' } {
  const cur = state.tutorial.status;
  if (cur === status || (status === 'skipped' && cur === 'completed')) return { ok: false, code: 'already-there' };
  const t: TutorialState =
    status === 'active'
      ? { ...state.tutorial, status, completed: cur === 'completed' ? [] : state.tutorial.completed, startedAtMs: nowMs }
      : { ...state.tutorial, status };
  return { ok: true, state: { ...state, tutorial: t }, events: [{ type: 'tutorialStatusChanged', status }] };
}

/** Mở hồ sơ sinh học của một loài người chơi đang nuôi (TUT_03; điều kiện khảo sát nhiệt độ). */
export function viewBiologyProfile(state: GameState, speciesId: string): { ok: true; state: GameState; events: DomainEvent[] } | { ok: false; code: 'unknown-dragon' } {
  if (!alive(state).some((d) => d.speciesId === speciesId)) return { ok: false, code: 'unknown-dragon' };
  if (state.tutorial.profilesViewed.includes(speciesId)) return { ok: true, state, events: [] };
  return {
    ok: true,
    state: { ...state, tutorial: { ...state.tutorial, profilesViewed: [...state.tutorial.profilesViewed, speciesId].sort() } },
    events: [{ type: 'biologyProfileViewed', speciesId }],
  };
}
