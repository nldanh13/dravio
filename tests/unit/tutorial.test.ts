import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_IDS } from '../../src/data/achievements';
import { TUTORIAL_STEP_IDS } from '../../src/data/tutorial';
import { fixedClock } from '../../src/engine/core/clock';
import { dispatch, type Command } from '../../src/engine/core/commands';
import type { DomainEvent } from '../../src/engine/core/events';
import { createInitialState } from '../../src/engine/core/initialState';
import { createRng } from '../../src/engine/core/rng';
import { validateGameState } from '../../src/engine/core/validation';
import { packPlacementOptions } from '../../src/engine/inventory/packs';
import { implementedAchievements } from '../../src/engine/progression/achievements';
import { currentStep } from '../../src/engine/progression/tutorial';
import { en } from '../../src/i18n/en';
import { vi } from '../../src/i18n/vi';
import { parseSaveText } from '../../src/persistence/saveFile';
import { SaveManager } from '../../src/persistence/saveManager';
import { MemorySaveStore } from '../../src/persistence/store';
import type { GameState } from '../../src/types/state';

const T0 = Date.UTC(2026, 10, 25, 9, 0, 0);
let seq = 0;
const rid = () => `t-${++seq}`;
type CommandInput = Command extends infer C ? (C extends Command ? Omit<C, 'requestId'> : never) : never;
type Clock = ReturnType<typeof fixedClock>;

function game(saveId = 'tut') {
  const clock = fixedClock(T0);
  return { clock, state: createInitialState({ saveId, nowMs: T0, rng: createRng(8) }) };
}
function run(state: GameState, cmd: CommandInput, clock: Clock, requestId = rid()) {
  return dispatch(state, { requestId, ...cmd }, { clock });
}
function ok(state: GameState, cmd: CommandInput, clock: Clock, requestId?: string) {
  const r = run(state, cmd, clock, requestId);
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  const v = validateGameState(r.state);
  if (!v.ok) throw new Error(v.errors.join('; '));
  return r;
}
function fail(state: GameState, cmd: CommandInput, clock: Clock, code: string) {
  const r = run(state, cmd, clock);
  if (!r.ok && r.error.code !== code) throw new Error(`expected ${code}, got ${r.error.code}`);
  expect(r).toMatchObject({ ok: false, error: { code } });
  expect(r.state).toBe(state);
}
const steps = (events: DomainEvent[]) => events.flatMap((e) => (e.type === 'tutorialStepCompleted' ? [e.stepId] : []));
const ember = (s: GameState) => s.dragons.find((d) => d.speciesId === 'emberling')!;
const G = 1_000_000;

/** Thả quả vào đồng cỏ và để Emberling ăn (lệnh `consumeFood` do mô phỏng phát). */
function feedEmber(s: GameState, clock: Clock): GameState {
  const fed = ok(s, { type: 'feed', dietId: 'fruit', zoneId: 'origin', habitatId: 'origin_meadow' }, clock);
  const food = fed.state.food.drops.at(-1)!;
  return ok(fed.state, { type: 'consumeFood', foodId: food.id, dragonUid: ember(fed.state).uid }, clock).state;
}

describe('tutorial TUT_01–TUT_08 (ADR 0009 item 4, ADR 0013)', () => {
  it('new saves start the tutorial at TUT_01 with no pack and no achievements', () => {
    const { state } = game();
    expect(state.tutorial).toEqual({ status: 'active', completed: [], startedAtMs: T0, profilesViewed: [], starterPackUsed: false });
    expect(currentStep(state.tutorial)).toBe('TUT_01');
    expect(state.pendingPack).toBeNull();
    expect(state.unlockedAchievements).toEqual([]);
  });

  it('a full playthrough completes the eight steps in order, only through player commands', () => {
    const { clock, state } = game();
    const log: string[] = [];
    let s = state;
    const step = (r: { state: GameState; events: DomainEvent[] }) => {
      log.push(...steps(r.events));
      s = r.state;
      return r;
    };

    // TUT_01: 15 s quan sát. 14,999 s chưa đủ.
    clock.advance(14_999);
    step(ok(s, { type: 'advanceTime', mode: 'online' }, clock));
    expect(log).toEqual([]);
    clock.advance(1);
    step(ok(s, { type: 'advanceTime', mode: 'online' }, clock));
    expect(log).toEqual(['TUT_01']);

    // TUT_02: thả sai thức ăn không tính; ăn đúng mới tính.
    clock.advance(2000);
    const leaf = ok(s, { type: 'feed', dietId: 'leaf', zoneId: 'origin', habitatId: 'origin_meadow' }, clock);
    expect(steps(leaf.events)).toEqual([]);
    expect(run(leaf.state, { type: 'consumeFood', foodId: leaf.state.food.drops[0]!.id, dragonUid: ember(s).uid }, clock)).toMatchObject({ ok: false, error: { code: 'wrong-diet' } });
    clock.advance(2000);
    s = feedEmber(leaf.state, clock);
    expect(s.tutorial.completed).toEqual(['TUT_01', 'TUT_02']);

    // TUT_03 rồi TUT_04 (khảo sát + mở miễn phí).
    step(ok(s, { type: 'viewBiologyProfile', speciesId: 'emberling' }, clock));
    expect(s.tutorial.completed.at(-1)).toBe('TUT_03');
    const gold = s.goldMicro;
    const earned0 = s.totalGoldEarnedMicro;
    step(ok(s, { type: 'surveyHabitat', habitatId: 'origin_warm_rocks' }, clock));
    expect(s.discoveries).toEqual(['DISC_EMBERLING_THERMAL']);
    expect(s.tutorial.completed.at(-1)).toBe('TUT_03');
    step(ok(s, { type: 'unlockHabitat', habitatId: 'origin_warm_rocks' }, clock));
    expect(s.tutorial.completed.at(-1)).toBe('TUT_04');
    expect(s.goldMicro).toBe(gold); // mở miễn phí

    // TUT_05: mua gói (100 G) rồi nhận trứng Sproutling; thành tựu nở đầu tiên +50 G.
    const bought = step(ok(s, { type: 'buyTutorialPack' }, clock));
    expect(s.goldMicro).toBe(gold - 100 * G + (s.totalGoldEarnedMicro - earned0));
    expect(s.pendingPack).toMatchObject({ speciesId: 'sprout', mutation: 'normal', packId: 'starter', tutorial: true });
    expect(bought.events).toContainEqual({ type: 'packBought', packId: 'starter', speciesId: 'sprout', priceGoldMicro: 100 * G, tutorial: true });
    expect(s.tutorial.completed.at(-1)).toBe('TUT_04');
    const claimed = step(ok(s, { type: 'claimPack', target: { kind: 'zone', zoneId: 'origin', habitatId: 'origin_meadow' } }, clock));
    const sprout = s.dragons.find((d) => d.speciesId === 'sprout')!;
    expect(sprout).toMatchObject({ mutation: 'normal', xpSec: 0, origin: 'pack', generation: 1, location: { kind: 'zone', habitatId: 'origin_meadow' } });
    expect(s.stats.totalHatched).toBe(1);
    expect(claimed.events).toContainEqual({ type: 'achievementUnlocked', achievementId: 'ACH_FIRST_HATCH', rewardGoldMicro: 50 * G });
    expect(s.goldMicro).toBe(gold - 100 * G + 50 * G + (s.totalGoldEarnedMicro - earned0));
    expect(s.tutorial.completed.at(-1)).toBe('TUT_05');

    // TUT_06: bờ hồ không cần Droplet.
    step(ok(s, { type: 'surveyHabitat', habitatId: 'origin_pondbank' }, clock));
    step(ok(s, { type: 'unlockHabitat', habitatId: 'origin_pondbank' }, clock));
    expect(s.tutorial.completed.at(-1)).toBe('TUT_06');

    // TUT_07 + TUT_08: Emberling trưởng thành; ba sinh cảnh đã mở → hoàn tất.
    const earned = s.totalGoldEarnedMicro;
    clock.advance(300_000);
    const grown = step(ok(s, { type: 'advanceTime', mode: 'online' }, clock));
    expect(log).toEqual(TUTORIAL_STEP_IDS.filter((id) => id !== 'TUT_02')); // TUT_02 đã ghi trong feedEmber
    expect(s.tutorial.completed).toEqual([...TUTORIAL_STEP_IDS]);
    expect(s.tutorial.status).toBe('completed');
    expect(grown.events).toContainEqual({ type: 'tutorialStatusChanged', status: 'completed' });
    expect(grown.events).toContainEqual({ type: 'achievementUnlocked', achievementId: 'ACH_FIRST_ADULT', rewardGoldMicro: 100 * G });
    expect(s.unlockedAchievements).toEqual(['ACH_FIRST_HATCH', 'ACH_FIRST_ADULT']);
    expect(s.claimedAchievements).toEqual(['ACH_FIRST_HATCH', 'ACH_FIRST_ADULT']);
    // Thưởng thành tựu không tính vào vàng sản xuất; hướng dẫn không thêm vàng ngoài GDD.
    expect(s.goldMicro - gold).toBe(-100 * G + 50 * G + 100 * G + (s.totalGoldEarnedMicro - earned0));
    expect(s.totalGoldEarnedMicro).toBeGreaterThan(earned);

    // Hoàn tất rồi thì không đánh giá thêm; achievement không lặp.
    clock.advance(1000);
    const after = ok(s, { type: 'advanceTime', mode: 'online' }, clock);
    expect(after.events.filter((e) => e.type === 'tutorialStepCompleted' || e.type === 'achievementUnlocked')).toEqual([]);
  });

  it('steps only complete in order: later conditions met early cascade once the earlier step is done', () => {
    const { clock, state } = game();
    clock.advance(1000);
    let s = ok(state, { type: 'viewBiologyProfile', speciesId: 'emberling' }, clock).state;
    s = ok(s, { type: 'surveyHabitat', habitatId: 'origin_warm_rocks' }, clock).state;
    s = ok(s, { type: 'unlockHabitat', habitatId: 'origin_warm_rocks' }, clock).state;
    expect(s.tutorial.completed).toEqual([]);
    clock.advance(15_000);
    s = ok(s, { type: 'advanceTime', mode: 'online' }, clock).state;
    expect(s.tutorial.completed).toEqual(['TUT_01']); // TUT_02 (ăn) chưa có nên dừng
    clock.advance(1000);
    s = feedEmber(s, clock);
    expect(s.tutorial.completed).toEqual(['TUT_01', 'TUT_02', 'TUT_03', 'TUT_04']);
  });

  it('TUT_01 needs a dragon in the zone, not only elapsed time', () => {
    const { clock, state } = game();
    clock.advance(1000);
    let s = ok(state, { type: 'moveDragon', dragonUid: ember(state).uid, target: { kind: 'storage' } }, clock).state;
    clock.advance(20_000);
    s = ok(s, { type: 'advanceTime', mode: 'online' }, clock).state;
    expect(s.tutorial.completed).toEqual([]);
    s = ok(s, { type: 'moveDragon', dragonUid: ember(s).uid, target: { kind: 'zone', zoneId: 'origin', habitatId: 'origin_meadow' } }, clock).state;
    expect(s.tutorial.completed).toEqual(['TUT_01']);
  });
});

describe('surveyHabitat: equivalent discovery path (ADR 0009 item 6)', () => {
  it('thermal survey needs an owned Emberling and its viewed profile; a rejected survey changes nothing', () => {
    const { clock, state } = game();
    fail(state, { type: 'surveyHabitat', habitatId: 'origin_warm_rocks' }, clock, 'survey-requirement-missing');
    fail(state, { type: 'unlockHabitat', habitatId: 'origin_warm_rocks' }, clock, 'unlock-requirement-missing');
    const viewed = ok(state, { type: 'viewBiologyProfile', speciesId: 'emberling' }, clock).state;
    const r = ok(viewed, { type: 'surveyHabitat', habitatId: 'origin_warm_rocks' }, clock);
    expect(r.events).toEqual(expect.arrayContaining([{ type: 'habitatSurveyed', habitatId: 'origin_warm_rocks' }, { type: 'discoveryRecorded', discoveryId: 'DISC_EMBERLING_THERMAL' }]));
    fail(r.state, { type: 'surveyHabitat', habitatId: 'origin_warm_rocks' }, clock, 'discovery-already-known');
  });

  it('pondbank survey needs no Droplet; meadow, unknown and locked-zone habitats cannot be surveyed', () => {
    const { clock, state } = game();
    expect(state.dragons.some((d) => d.speciesId === 'droplet')).toBe(false);
    expect(ok(state, { type: 'surveyHabitat', habitatId: 'origin_pondbank' }, clock).state.discoveries).toEqual(['DISC_AQUATIC_HABITAT']);
    fail(state, { type: 'surveyHabitat', habitatId: 'origin_meadow' }, clock, 'unknown-habitat');
    fail(state, { type: 'surveyHabitat', habitatId: 'ocean_reef' }, clock, 'unknown-habitat');
    fail(state, { type: 'surveyHabitat', habitatId: 'nope' }, clock, 'unknown-habitat');
  });

  it('skipping the tutorial keeps every unlock path; resuming credits what was already done', () => {
    const { clock, state } = game();
    let s = ok(state, { type: 'setTutorialStatus', status: 'skipped' }, clock).state;
    fail(s, { type: 'setTutorialStatus', status: 'skipped' }, clock, 'already-there');
    clock.advance(20_000);
    s = ok(s, { type: 'advanceTime', mode: 'online' }, clock).state;
    s = ok(s, { type: 'viewBiologyProfile', speciesId: 'emberling' }, clock).state;
    s = ok(s, { type: 'surveyHabitat', habitatId: 'origin_warm_rocks' }, clock).state;
    s = ok(s, { type: 'unlockHabitat', habitatId: 'origin_warm_rocks' }, clock).state;
    s = ok(s, { type: 'surveyHabitat', habitatId: 'origin_pondbank' }, clock).state;
    s = ok(s, { type: 'unlockHabitat', habitatId: 'origin_pondbank' }, clock).state;
    s = ok(s, { type: 'buyTutorialPack' }, clock).state;
    s = ok(s, { type: 'claimPack', target: { kind: 'storage' } }, clock).state;
    expect(s.tutorial).toMatchObject({ status: 'skipped', completed: [] });
    expect([...s.zones.find((z) => z.id === 'origin')!.unlockedHabitatIds].sort()).toEqual(['origin_meadow', 'origin_pondbank', 'origin_warm_rocks']);
    // Thành tựu vẫn chạy khi bỏ qua hướng dẫn.
    expect(s.unlockedAchievements).toEqual(['ACH_FIRST_HATCH']);

    // Xem lại: mốc quan sát đặt lại; các bước đã thỏa được ghi nhận theo thứ tự.
    clock.advance(1000);
    const resumed = ok(s, { type: 'setTutorialStatus', status: 'active' }, clock).state;
    expect(resumed.tutorial).toMatchObject({ status: 'active', completed: [], startedAtMs: clock.nowMs() });
    clock.advance(15_000);
    s = ok(resumed, { type: 'advanceTime', mode: 'online' }, clock).state;
    expect(s.tutorial.completed).toEqual(['TUT_01']); // chưa cho ăn lần nào
    clock.advance(1000);
    s = feedEmber(s, clock);
    expect(s.tutorial.completed).toEqual(['TUT_01', 'TUT_02', 'TUT_03', 'TUT_04', 'TUT_05', 'TUT_06']);
  });
});

describe('tutorial Starter pack (GDD p.4/p.15, S01)', () => {
  it('costs 100 G once per save, is idempotent per requestId and blocks a second buy', () => {
    const { clock, state } = game();
    const a = ok(state, { type: 'buyTutorialPack' }, clock, 'buy-1');
    const dup = run(a.state, { type: 'buyTutorialPack' }, clock, 'buy-1');
    expect(dup).toMatchObject({ ok: true, duplicate: true });
    expect(dup.state.goldMicro).toBe(a.state.goldMicro);
    fail(a.state, { type: 'buyTutorialPack' }, clock, 'pack-pending');
    const claimed = ok(a.state, { type: 'claimPack', target: { kind: 'storage' } }, clock).state;
    fail(claimed, { type: 'buyTutorialPack' }, clock, 'tutorial-pack-used');
    fail(claimed, { type: 'claimPack', target: { kind: 'storage' } }, clock, 'no-pending-pack');
  });

  it('needs 100 G', () => {
    const { clock, state } = game();
    fail({ ...state, goldMicro: 100 * G - 1 }, { type: 'buyTutorialPack' }, clock, 'not-enough-gold');
    expect(ok({ ...state, goldMicro: 100 * G }, { type: 'buyTutorialPack' }, clock).state.goldMicro).toBe(0);
  });

  it('is fixed and reproducible: same save gives the same egg; the pity counter and domain RNG are untouched', () => {
    const one = game('same');
    const two = game('same');
    const a = ok(one.state, { type: 'buyTutorialPack' }, one.clock).state;
    const b = ok(two.state, { type: 'buyTutorialPack' }, two.clock).state;
    expect(a.pendingPack).toEqual(b.pendingPack);
    expect(a.pityCount).toBe(one.state.pityCount);
    const ha = ok(a, { type: 'claimPack', target: { kind: 'storage' } }, one.clock).state.dragons.at(-1);
    const hb = ok(b, { type: 'claimPack', target: { kind: 'storage' } }, two.clock).state.dragons.at(-1);
    expect(ha).toEqual(hb);
    expect(ha?.speciesId).toBe('sprout');
  });

  it('places the egg with the same biology and capacity rules as moveDragon', () => {
    const { clock, state } = game();
    const s = ok(state, { type: 'buyTutorialPack' }, clock).state;
    // Đá ấm chưa mở; Sproutling không hợp đá ấm.
    expect(packPlacementOptions(s).filter((o) => o.blocked === null).map((o) => o.habitatId)).toEqual(['origin_meadow']);
    fail(s, { type: 'claimPack', target: { kind: 'zone', zoneId: 'origin', habitatId: 'origin_warm_rocks' } }, clock, 'habitat-locked');
    fail(s, { type: 'claimPack', target: { kind: 'zone', zoneId: 'origin', habitatId: 'origin_pondbank' } }, clock, 'habitat-locked');
    fail(s, { type: 'claimPack', target: { kind: 'zone', zoneId: 'ocean', habitatId: 'origin_meadow' } }, clock, 'habitat-locked');
    const full = { ...s, zones: s.zones.map((z) => (z.id === 'origin' ? { ...z, capacity: 1 } : z)) };
    fail(full, { type: 'claimPack', target: { kind: 'zone', zoneId: 'origin', habitatId: 'origin_meadow' } }, clock, 'zone-full');
    expect(packPlacementOptions(state)).toEqual([]);
  });
});

describe('viewBiologyProfile', () => {
  it('only for a species the player keeps; viewing twice is a no-op', () => {
    const { clock, state } = game();
    fail(state, { type: 'viewBiologyProfile', speciesId: 'droplet' }, clock, 'unknown-dragon');
    const a = ok(state, { type: 'viewBiologyProfile', speciesId: 'emberling' }, clock);
    expect(a.events).toContainEqual({ type: 'biologyProfileViewed', speciesId: 'emberling' });
    const b = ok(a.state, { type: 'viewBiologyProfile', speciesId: 'emberling' }, clock);
    expect(b.state.tutorial.profilesViewed).toEqual(['emberling']);
    expect(b.events.filter((e) => e.type === 'biologyProfileViewed')).toEqual([]);
  });
});

describe('schema v4 validation', () => {
  const { state } = game();
  const bad = (patch: Partial<GameState>) => validateGameState({ ...state, ...patch }).ok;
  it('rejects broken tutorial, pack and achievement fields', () => {
    expect(bad({})).toBe(true);
    expect(bad({ tutorial: { ...state.tutorial, completed: ['TUT_02'] } })).toBe(false);
    expect(bad({ tutorial: { ...state.tutorial, completed: ['TUT_01', 'TUT_01'] } })).toBe(false);
    expect(bad({ tutorial: { ...state.tutorial, status: 'completed' } })).toBe(false);
    expect(bad({ tutorial: { ...state.tutorial, status: 'done' as never } })).toBe(false);
    expect(bad({ tutorial: { ...state.tutorial, profilesViewed: ['nope'] } })).toBe(false);
    expect(bad({ unlockedAchievements: ['ACH_NOPE' as never] })).toBe(false);
    expect(bad({ claimedAchievements: ['ACH_FIRST_HATCH'] })).toBe(false);
    expect(bad({ unlockedAchievements: ['ACH_FIRST_HATCH', 'ACH_FIRST_HATCH'] })).toBe(false);
    const pack = { id: 'p', packId: 'starter', speciesId: 'sprout', genotype: { pigment: ['R', 'r'], pattern: ['P', 'p'], eye: ['B', 'b'] }, mutation: 'normal', createdAtMs: 0, tutorial: true } as const;
    expect(bad({ pendingPack: pack as never })).toBe(false); // starterPackUsed false
    expect(bad({ pendingPack: pack as never, tutorial: { ...state.tutorial, starterPackUsed: true } })).toBe(true);
    expect(bad({ pendingPack: { ...pack, speciesId: 'nope' } as never, tutorial: { ...state.tutorial, starterPackUsed: true } })).toBe(false);
  });
});

describe('migration v2 → v4 on a real Schema v2 save (tests/fixtures/save-schema-v2.json)', () => {
  // File được ghi bởi code main@b5820f9 (Schema v2), giữ nguyên văn.
  const fixture = import.meta.glob('../fixtures/save-schema-v2.json', { query: '?raw', import: 'default', eager: true });
  const text = Object.values(fixture)[0] as string;

  it('keeps every v2 field and starts the tutorial without granting anything', async () => {
    const original = JSON.parse(text) as { schemaVersion: number; state: Record<string, unknown> & { clock: { lastProcessedAtMs: number } } };
    expect(original.schemaVersion).toBe(2);
    const r = await parseSaveText(text);
    if (!r.ok) throw new Error(r.code);
    expect(r.save.migratedFrom).toBe(2);
    const { schemaVersion, tutorial, pendingPack, unlockedAchievements, claimedAchievements, ...rest } = r.save.state;
    expect(schemaVersion).toBe(4);
    expect(tutorial).toEqual({ status: 'active', completed: [], startedAtMs: original.state.clock.lastProcessedAtMs, profilesViewed: [], starterPackUsed: false });
    expect([pendingPack, unlockedAchievements, claimedAchievements]).toEqual([null, [], []]);
    const { schemaVersion: _v, ...origRest } = original.state;
    void _v;
    expect(rest).toEqual(origRest);
  });

  it('after loading, progress already made counts towards the tutorial in order', async () => {
    const r = await parseSaveText(text);
    if (!r.ok) throw new Error(r.code);
    const clock = fixedClock(r.save.state.clock.lastProcessedAtMs);
    clock.advance(15_000);
    let s = ok(r.save.state, { type: 'advanceTime', mode: 'online' }, clock).state;
    // Đã cho ăn và đã mở đá ấm ở v2, nhưng chưa xem hồ sơ sinh học → dừng ở TUT_03.
    expect(s.tutorial.completed).toEqual(['TUT_01', 'TUT_02']);
    // Emberling của save đã Adult: thành tựu tương ứng được ghi nhận một lần.
    expect(s.unlockedAchievements).toEqual(['ACH_FIRST_ADULT']);
    s = ok(s, { type: 'viewBiologyProfile', speciesId: 'emberling' }, clock).state;
    expect(s.tutorial.completed).toEqual(['TUT_01', 'TUT_02', 'TUT_03', 'TUT_04']);
  });

  it('is archived verbatim and saved as v4 with gold, dragons and habitats intact', async () => {
    const store = new MemorySaveStore();
    store.slots.set('main', text);
    const mgr = new SaveManager({ store, nowMs: () => T0 });
    const r = await mgr.load();
    if (r.kind !== 'loaded') throw new Error(r.kind);
    await mgr.save(r.save.state);
    expect(store.slots.get('archive:schema-2')).toBe(text);
    const again = await parseSaveText((await store.get('main')) ?? '');
    if (!again.ok) throw new Error(again.code);
    expect(again.save.migratedFrom).toBeNull();
    const orig = (JSON.parse(text) as { state: GameState }).state;
    expect(again.save.state.goldMicro).toBe(orig.goldMicro);
    expect(again.save.state.dragons).toEqual(orig.dragons);
    expect(again.save.state.zones).toEqual(orig.zones);
    expect(again.save.state.discoveries).toEqual(orig.discoveries);
  });
});

describe('i18n for tutorial, achievements and new errors', () => {
  it('every step, implemented achievement and new error has vi and en text', () => {
    const keys = [
      ...TUTORIAL_STEP_IDS.flatMap((id) => [`tutorial.step.${id}`, `tutorial.hint.${id}`]),
      ...implementedAchievements().map((id) => `achievement.${id}`),
      ...['discovery-already-known', 'survey-requirement-missing', 'tutorial-pack-used', 'pack-pending', 'no-pending-pack', 'not-enough-gold'].map((c) => `commandError.${c}`),
    ];
    for (const k of keys) {
      expect(vi, k).toHaveProperty([k]);
      expect(en, k).toHaveProperty([k]);
    }
    expect(implementedAchievements()).toEqual(['ACH_FIRST_HATCH', 'ACH_FIRST_ADULT']);
    expect(ACHIEVEMENT_IDS).toHaveLength(12);
  });
});
