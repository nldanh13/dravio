import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/engine/core/clock';
import { dispatch, type Command } from '../../src/engine/core/commands';
import { createInitialState } from '../../src/engine/core/initialState';
import { createRng } from '../../src/engine/core/rng';
import { validateGameState } from '../../src/engine/core/validation';
import { SUITABILITY_ALLOWED, SUITABILITY_GOOD, speciesSuitability, suitabilityTier } from '../../src/engine/world/habitat';
import { isProducing } from '../../src/engine/world/placement';
import { currentProductionBudget, habitatsOfZone, habitatUnlockStatus, placementOptions, recordDiscovery, unlockHabitat, zoneOccupancy } from '../../src/engine/world/zones';
import { HABITAT_UNLOCK_RULES, type DiscoveryId } from '../../src/data/habitatUnlocks';
import { createEnvelope } from '../../src/persistence/schema';
import { parseSaveText } from '../../src/persistence/saveFile';
import { en } from '../../src/i18n/en';
import { vi } from '../../src/i18n/vi';
import type { DragonInstance } from '../../src/types/game';
import type { GameState } from '../../src/types/state';
import { adult } from './fixtures';

const T0 = Date.UTC(2026, 10, 25, 9, 0, 0);
let seq = 0;
const rid = () => `z-${++seq}`;
type CommandInput = Command extends infer C ? (C extends Command ? Omit<C, 'requestId'> : never) : never;

function game() {
  const clock = fixedClock(T0);
  const state = createInitialState({ saveId: 'zones', nowMs: T0, rng: createRng(8) });
  return { clock, state };
}

function run(state: GameState, cmd: CommandInput, clock: { nowMs(): number }) {
  return dispatch(state, { requestId: rid(), ...cmd }, { clock });
}

function ok(state: GameState, cmd: CommandInput, clock: { nowMs(): number }) {
  const r = run(state, cmd, clock);
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  const v = validateGameState(r.state);
  if (!v.ok) throw new Error(v.errors.join('; '));
  return r;
}

const NEEDS: Record<string, DiscoveryId> = { origin_warm_rocks: 'DISC_EMBERLING_THERMAL', origin_pondbank: 'DISC_AQUATIC_HABITAT' };

/** Fixture kiểm thử: ghi nhận khám phá như hệ nhiệm vụ PR5 sẽ làm, rồi mở bằng hàm engine. */
function discover(state: GameState, id: DiscoveryId): GameState {
  const r = recordDiscovery(state, id);
  if (!r.ok) throw new Error(r.code);
  return r.state;
}

function unlock(state: GameState, ...habitats: string[]): GameState {
  return habitats.reduce((s, h) => {
    const need = NEEDS[h];
    const withDisc = need && !s.discoveries.includes(need) ? discover(s, need) : s;
    const r = unlockHabitat(withDisc, h);
    if (!r.ok) throw new Error(r.code);
    return r.state;
  }, state);
}

function withDragons(state: GameState, ...dragons: DragonInstance[]): GameState {
  return { ...state, dragons: [...state.dragons, ...dragons] };
}

const firstUid = (s: GameState) => s.dragons[0]?.uid ?? '';
const meadow = { kind: 'zone', zoneId: 'origin', habitatId: 'origin_meadow' } as const;

describe('Origin zone layout (ADR 0003, PACK_README)', () => {
  it('has 3 microhabitats, 5 physical slots, only the meadow open; ocean and sky locked', () => {
    const { state } = game();
    expect(habitatsOfZone('origin')).toEqual(['origin_meadow', 'origin_pondbank', 'origin_warm_rocks']);
    const origin = state.zones.find((z) => z.id === 'origin');
    expect(origin).toMatchObject({ unlocked: true, capacity: 5, unlockedHabitatIds: ['origin_meadow'] });
    expect(state.zones.filter((z) => z.id !== 'origin').every((z) => !z.unlocked)).toBe(true);
    expect(zoneOccupancy(state, 'origin')).toBe(1);
    expect(currentProductionBudget(state)).toBe(5);
  });

  it('microhabitats do not add capacity: unlocking keeps capacity 5', () => {
    const s = unlock(game().state, 'origin_pondbank', 'origin_warm_rocks');
    expect(s.zones.find((z) => z.id === 'origin')).toMatchObject({ capacity: 5, unlockedHabitatIds: ['origin_meadow', 'origin_pondbank', 'origin_warm_rocks'] });
  });

});

describe('unlockHabitat (ADR 0009): free, condition-checked, no capacity change', () => {
  it('rules: meadow by default, warm rocks needs the Emberling thermal discovery, pondbank the aquatic one', () => {
    expect(HABITAT_UNLOCK_RULES).toEqual({
      origin_meadow: { default: true, requires: null },
      origin_warm_rocks: { default: false, requires: 'DISC_EMBERLING_THERMAL' },
      origin_pondbank: { default: false, requires: 'DISC_AQUATIC_HABITAT' },
    });
    expect(game().state.discoveries).toEqual([]);
  });

  it('rejects unknown IDs, already-open habitats, missing discoveries and locked zones — without touching state', () => {
    const { clock, state } = game();
    const cases: [string, string][] = [
      ['nowhere', 'unknown-habitat'],
      ['ocean_estuary', 'unknown-habitat'],
      ['origin_meadow', 'habitat-already-unlocked'],
      ['origin_warm_rocks', 'unlock-requirement-missing'],
      ['origin_pondbank', 'unlock-requirement-missing'],
    ];
    for (const [habitatId, code] of cases) {
      const r = run(state, { type: 'unlockHabitat', habitatId }, clock);
      expect(r).toMatchObject({ ok: false, error: { code } });
      expect(r.state).toBe(state);
    }
    // Đúng khám phá nhưng sai sinh cảnh vẫn bị chặn.
    const s = discover(state, 'DISC_EMBERLING_THERMAL');
    expect(run(s, { type: 'unlockHabitat', habitatId: 'origin_pondbank' }, clock)).toMatchObject({ ok: false, error: { code: 'unlock-requirement-missing' } });
    const originLocked = { ...s, zones: s.zones.map((z) => (z.id === 'origin' ? { ...z, unlocked: false } : z)) };
    expect(unlockHabitat(originLocked, 'origin_warm_rocks')).toEqual({ ok: false, code: 'zone-locked' });
  });

  it('opens warm rocks for free after the discovery; gold, capacity and budget do not change; duplicate is rejected', () => {
    const { clock, state } = game();
    const s = discover(state, 'DISC_EMBERLING_THERMAL');
    clock.advance(30_000);
    const r = ok(s, { type: 'unlockHabitat', habitatId: 'origin_warm_rocks' }, clock);
    expect(r.events).toEqual([{ type: 'habitatUnlocked', zoneId: 'origin', habitatId: 'origin_warm_rocks' }]);
    expect(r.state.goldMicro).toBe(s.goldMicro);
    expect(r.state.zones.find((z) => z.id === 'origin')).toMatchObject({ capacity: 5, unlockedHabitatIds: ['origin_meadow', 'origin_warm_rocks'] });
    expect(currentProductionBudget(r.state)).toBe(currentProductionBudget(s));
    expect(run(r.state, { type: 'unlockHabitat', habitatId: 'origin_warm_rocks' }, clock)).toMatchObject({ ok: false, error: { code: 'habitat-already-unlocked' } });
  });

  it('pondbank does not require owning a Droplet', () => {
    const { clock, state } = game();
    expect(state.dragons.some((d) => d.speciesId === 'droplet')).toBe(false);
    const r = ok(discover(state, 'DISC_AQUATIC_HABITAT'), { type: 'unlockHabitat', habitatId: 'origin_pondbank' }, clock);
    expect(r.state.zones.find((z) => z.id === 'origin')?.unlockedHabitatIds).toEqual(['origin_meadow', 'origin_pondbank']);
  });

  it('unlock order does not matter; the stored list follows the zone order', () => {
    const a = unlock(game().state, 'origin_pondbank', 'origin_warm_rocks');
    const b = unlock(game().state, 'origin_warm_rocks', 'origin_pondbank');
    expect(a.zones).toEqual(b.zones);
    expect(a.discoveries).toEqual(['DISC_AQUATIC_HABITAT', 'DISC_EMBERLING_THERMAL']);
  });

  it('recordDiscovery is idempotent-safe and is not exposed as a command', () => {
    const { clock, state } = game();
    const s = discover(state, 'DISC_AQUATIC_HABITAT');
    expect(recordDiscovery(s, 'DISC_AQUATIC_HABITAT')).toEqual({ ok: false, code: 'already-there' });
    for (const type of ['recordDiscovery', 'completeTutorial', 'grantHabitatUnlock']) {
      expect(dispatch(state, { type, requestId: rid(), discoveryId: 'DISC_AQUATIC_HABITAT', habitatId: 'origin_pondbank' }, { clock })).toMatchObject({ ok: false, error: { code: 'invalid-command' } });
    }
  });

  it('habitatUnlockStatus reports eligibility for the UI', () => {
    const s = discover(game().state, 'DISC_EMBERLING_THERMAL');
    expect(habitatUnlockStatus(s)).toEqual([
      { habitatId: 'origin_meadow', unlocked: true, requires: null, eligible: false },
      { habitatId: 'origin_pondbank', unlocked: false, requires: 'DISC_AQUATIC_HABITAT', eligible: false },
      { habitatId: 'origin_warm_rocks', unlocked: false, requires: 'DISC_EMBERLING_THERMAL', eligible: true },
    ]);
  });

  it('discoveries and unlocked habitats survive save → load; an unknown discovery ID is rejected on load', async () => {
    const s = unlock(game().state, 'origin_warm_rocks');
    const r = await parseSaveText(JSON.stringify(await createEnvelope(s, T0)));
    expect(r.ok && r.save.state.discoveries).toEqual(['DISC_EMBERLING_THERMAL']);
    expect(r.ok && r.save.state.zones).toEqual(s.zones);
    expect(validateGameState({ ...s, discoveries: ['DISC_FAKE'] }).ok).toBe(false);
    expect(validateGameState({ ...s, discoveries: ['DISC_EMBERLING_THERMAL', 'DISC_EMBERLING_THERMAL'] }).ok).toBe(false);
  });

  it('after unlocking, Emberling can move to warm rocks keeping gold accrual; Droplet fits pondbank but not meadow', () => {
    const { clock, state } = game();
    const s = withDragons(unlock(state, 'origin_warm_rocks', 'origin_pondbank'), adult('drop', 'droplet'));
    clock.advance(100_000);
    const moved = ok(s, { type: 'moveDragon', dragonUid: firstUid(s), target: { kind: 'zone', zoneId: 'origin', habitatId: 'origin_warm_rocks' } }, clock);
    expect(moved.state.goldMicro - s.goldMicro).toBe(1_000_000);
    expect(isProducing(moved.state, moved.state.dragons[0] as DragonInstance)).toBe(true);
    expect(run(moved.state, { type: 'moveDragon', dragonUid: 'drop', target: meadow }, clock)).toMatchObject({ ok: false, error: { code: 'habitat-unsuitable' } });
    const placed = ok(moved.state, { type: 'moveDragon', dragonUid: 'drop', target: { kind: 'zone', zoneId: 'origin', habitatId: 'origin_pondbank' } }, clock);
    expect(zoneOccupancy(placed.state, 'origin')).toBe(2);
  });
});

describe('suitability tiers', () => {
  it('uses the GDD thresholds 50 / 80', () => {
    expect([SUITABILITY_ALLOWED, SUITABILITY_GOOD]).toEqual([50, 80]);
    expect(suitabilityTier({ allowed: true, score: 80, reason: 'ok' })).toBe('good');
    expect(suitabilityTier({ allowed: true, score: 79, reason: 'ok' })).toBe('needs-improvement');
    expect(suitabilityTier({ allowed: false, score: 49, reason: 'low-suitability' })).toBe('unsuitable');
  });

  it('the four G1 Commons have a good home in Origin; land dragons never fly', () => {
    expect(speciesSuitability('emberling', 'origin_meadow').score).toBeGreaterThanOrEqual(80);
    expect(speciesSuitability('sprout', 'origin_meadow').score).toBeGreaterThanOrEqual(80);
    expect(speciesSuitability('droplet', 'origin_pondbank').score).toBeGreaterThanOrEqual(80);
    expect(speciesSuitability('zephyr', 'origin_meadow').score).toBeGreaterThanOrEqual(80);
    expect(speciesSuitability('droplet', 'origin_meadow').allowed).toBe(false);
    expect(speciesSuitability('emberling', 'sky_low_island').allowed).toBe(false);
  });
});

describe('placementOptions', () => {
  it('explains every target for Emberling at the start', () => {
    const { state } = game();
    const opts = placementOptions(state, state.dragons[0] as DragonInstance);
    const by = Object.fromEntries(opts.map((o) => [o.habitatId, o.blocked]));
    expect(by).toEqual({
      origin_meadow: 'already-there',
      origin_pondbank: 'habitat-locked',
      origin_warm_rocks: 'habitat-locked',
      ocean_estuary: 'zone-locked',
      ocean_reef: 'zone-locked',
      ocean_cool_pool: 'zone-locked',
      sky_low_island: 'zone-locked',
    });
    expect(opts.find((o) => o.habitatId === 'origin_meadow')).toMatchObject({ tier: 'good', freeSlots: 5 });
  });

  it('suitability check runs before capacity, and is the same rule the command uses', () => {
    const { state } = game();
    const s = unlock(state, 'origin_pondbank', 'origin_warm_rocks');
    const drop = adult('drop', 'droplet');
    const opts = placementOptions(withDragons(s, drop), drop);
    expect(opts.find((o) => o.habitatId === 'origin_meadow')?.blocked).toBe('habitat-unsuitable');
    expect(opts.find((o) => o.habitatId === 'origin_pondbank')?.blocked).toBeNull();
  });
});

describe('moveDragon', () => {
  it('moves within Origin after a habitat opens, keeps production and validates', () => {
    const { clock, state } = game();
    const s = unlock(state, 'origin_warm_rocks');
    clock.advance(10_000);
    const r = ok(s, { type: 'moveDragon', dragonUid: firstUid(s), target: { kind: 'zone', zoneId: 'origin', habitatId: 'origin_warm_rocks' } }, clock);
    const d = r.state.dragons[0] as DragonInstance;
    expect(d.location).toEqual({ kind: 'zone', zoneId: 'origin', habitatId: 'origin_warm_rocks' });
    expect(r.state.productionDragonIds).toEqual([d.uid]);
    expect(isProducing(r.state, d)).toBe(true);
    expect(r.events.map((e) => e.type)).toEqual(['timeAdvanced', 'dragonMoved']);
  });

  it('rejects locked habitats, locked zones, unsuitable habitats and the same spot without changing state', () => {
    const { clock, state } = game();
    const drop = adult('drop', 'droplet');
    const s = withDragons(state, drop);
    clock.advance(5_000);
    const cases: [CommandInput, string][] = [
      [{ type: 'moveDragon', dragonUid: firstUid(s), target: { kind: 'zone', zoneId: 'origin', habitatId: 'origin_warm_rocks' } }, 'habitat-locked'],
      [{ type: 'moveDragon', dragonUid: firstUid(s), target: { kind: 'zone', zoneId: 'ocean', habitatId: 'ocean_estuary' } }, 'zone-locked'],
      [{ type: 'moveDragon', dragonUid: firstUid(s), target: { kind: 'zone', zoneId: 'origin', habitatId: 'ocean_estuary' } }, 'habitat-locked'],
      [{ type: 'moveDragon', dragonUid: 'drop', target: meadow }, 'habitat-unsuitable'],
      [{ type: 'moveDragon', dragonUid: firstUid(s), target: meadow }, 'already-there'],
      [{ type: 'moveDragon', dragonUid: 'drop', target: { kind: 'storage' } }, 'already-there'],
      [{ type: 'moveDragon', dragonUid: 'ghost', target: meadow }, 'unknown-dragon'],
    ];
    for (const [cmd, code] of cases) {
      const r = run(s, cmd, clock);
      expect(r).toMatchObject({ ok: false, error: { code } });
      expect(r.state).toBe(s);
    }
  });

  it('a full zone (5) blocks a sixth dragon but still allows moves inside the zone', () => {
    const { clock, state } = game();
    let s = unlock(state, 'origin_warm_rocks');
    const extras = ['a', 'b', 'c', 'd'].map((id) => adult(id, 'emberling', { location: meadow }));
    s = withDragons(s, ...extras, adult('sixth', 'sprout'));
    expect(zoneOccupancy(s, 'origin')).toBe(5);
    expect(run(s, { type: 'moveDragon', dragonUid: 'sixth', target: meadow }, clock)).toMatchObject({ ok: false, error: { code: 'zone-full' } });
    ok(s, { type: 'moveDragon', dragonUid: 'a', target: { kind: 'zone', zoneId: 'origin', habitatId: 'origin_warm_rocks' } }, clock);
    const freed = ok(s, { type: 'moveDragon', dragonUid: 'a', target: { kind: 'storage' } }, clock).state;
    ok(freed, { type: 'moveDragon', dragonUid: 'sixth', target: meadow }, clock);
  });

  it('busy, cared-for, sheltered and released dragons cannot be moved', () => {
    const { clock, state } = game();
    const s = withDragons(
      state,
      adult('busy', 'sprout', { activity: 'breeding' }),
      adult('care', 'sprout', { location: { kind: 'care', caseId: 'case-1' }, activity: 'care' }),
      adult('shelter', 'sprout', { location: { kind: 'shelter', zoneId: 'origin' } }),
      adult('gone', 'sprout', { location: { kind: 'released' } }),
    );
    for (const uid of ['busy', 'care', 'shelter', 'gone']) {
      expect(run(s, { type: 'moveDragon', dragonUid: uid, target: meadow }, clock)).toMatchObject({ ok: false, error: { code: 'dragon-unavailable' } });
      expect(run(s, { type: 'moveDragon', dragonUid: uid, target: { kind: 'storage' } }, clock)).toMatchObject({ ok: false, error: { code: 'dragon-unavailable' } });
    }
  });

  it('moving to safe storage leaves the production budget; gold up to the move is kept', () => {
    const { clock, state } = game();
    clock.advance(100_000);
    const r = ok(state, { type: 'moveDragon', dragonUid: firstUid(state), target: { kind: 'storage' } }, clock);
    // 100 s Baby Emberling: 0.025 G/s × 0.4 = 1 G = 1 000 000 microG.
    expect(r.state.goldMicro - state.goldMicro).toBe(1_000_000);
    expect(r.state.productionDragonIds).toEqual([]);
    expect(r.events.map((e) => e.type)).toEqual(['timeAdvanced', 'dragonMoved', 'productionChanged']);
    clock.advance(100_000);
    const later = ok(r.state, { type: 'advanceTime', mode: 'online' }, clock);
    expect(later.state.goldMicro).toBe(r.state.goldMicro);
    // Vẫn lớn khi ở kho.
    expect((later.state.dragons[0] as DragonInstance).xpSec).toBe(200);
  });

  it('is idempotent by requestId', () => {
    const { clock, state } = game();
    const cmd = { type: 'moveDragon', requestId: 'same-move', dragonUid: firstUid(state), target: { kind: 'storage' } } as const;
    const a = dispatch(state, cmd, { clock });
    const b = dispatch(a.state, cmd, { clock });
    expect(b).toMatchObject({ ok: true, duplicate: true });
    expect(b.state).toBe(a.state);
  });

  it('rejects malformed targets as invalid-command', () => {
    const { clock, state } = game();
    for (const target of [null, {}, { kind: 'zone' }, { kind: 'zone', zoneId: 'origin' }, { kind: 'shelter' }]) {
      expect(dispatch(state, { type: 'moveDragon', requestId: rid(), dragonUid: firstUid(state), target }, { clock })).toMatchObject({ ok: false, error: { code: 'invalid-command' } });
    }
  });
});

describe('setProductionSlot (budget 5 + 2 × level, max 25)', () => {
  it('toggles off and on; only placed dragons can be selected', () => {
    const { clock, state } = game();
    const off = ok(state, { type: 'setProductionSlot', dragonUid: firstUid(state), enabled: false }, clock);
    expect(off.state.productionDragonIds).toEqual([]);
    expect(run(off.state, { type: 'setProductionSlot', dragonUid: firstUid(state), enabled: false }, clock)).toMatchObject({ ok: false, error: { code: 'already-there' } });
    const on = ok(off.state, { type: 'setProductionSlot', dragonUid: firstUid(state), enabled: true }, clock);
    expect(on.state.productionDragonIds).toEqual([firstUid(state)]);
    const stored = withDragons(state, adult('st', 'sprout'));
    expect(run(stored, { type: 'setProductionSlot', dragonUid: 'st', enabled: true }, clock)).toMatchObject({ ok: false, error: { code: 'not-placed' } });
  });

  it('gold stops at the moment production is turned off', () => {
    const { clock, state } = game();
    clock.advance(50_000);
    const off = ok(state, { type: 'setProductionSlot', dragonUid: firstUid(state), enabled: false }, clock);
    expect(off.state.goldMicro - state.goldMicro).toBe(500_000);
    clock.advance(50_000);
    expect(ok(off.state, { type: 'advanceTime', mode: 'online' }, clock).state.goldMicro).toBe(off.state.goldMicro);
  });

  it('enforces the global budget across zones; a capacity upgrade level raises it by 2', () => {
    const { clock, state } = game();
    // Mở Ocean bằng fixture (G2 mới mở thật) để có hơn 5 chỗ vật lý.
    let s: GameState = { ...state, zones: state.zones.map((z) => (z.id === 'ocean' ? { ...z, unlocked: true, unlockedHabitatIds: ['ocean_estuary'] } : z)) };
    const inMeadow = ['m1', 'm2', 'm3', 'm4'].map((id) => adult(id, 'emberling', { location: meadow }));
    const inEstuary = ['e1', 'e2'].map((id) => adult(id, 'droplet', { location: { kind: 'zone', zoneId: 'ocean', habitatId: 'ocean_estuary' } }));
    s = withDragons(s, ...inMeadow, ...inEstuary);
    for (const id of ['m1', 'm2', 'm3', 'm4']) s = ok(s, { type: 'setProductionSlot', dragonUid: id, enabled: true }, clock).state;
    expect(s.productionDragonIds).toHaveLength(5);
    expect(run(s, { type: 'setProductionSlot', dragonUid: 'e1', enabled: true }, clock)).toMatchObject({ ok: false, error: { code: 'production-budget-full' } });
    const upgraded = { ...s, upgrades: { ...s.upgrades, islandCapacityLevel: 1 } };
    expect(currentProductionBudget(upgraded)).toBe(7);
    const more = ok(ok(upgraded, { type: 'setProductionSlot', dragonUid: 'e1', enabled: true }, clock).state, { type: 'setProductionSlot', dragonUid: 'e2', enabled: true }, clock).state;
    expect(more.productionDragonIds).toHaveLength(7);
    expect(currentProductionBudget({ ...s, upgrades: { ...s.upgrades, islandCapacityLevel: 10 } })).toBe(25);
    // Dragons outside the budget still grow.
    const outside = withDragons(s, adult('young', 'sprout', { xpSec: 0, location: { kind: 'storage' } }));
    clock.advance(10_000);
    const grown = ok(outside, { type: 'advanceTime', mode: 'online' }, clock).state;
    expect(grown.dragons.find((d) => d.uid === 'young')?.xpSec).toBe(10);
  });

  it('released dragons cannot join production', () => {
    const { clock, state } = game();
    const s = withDragons(state, adult('gone', 'sprout', { location: { kind: 'released' } }));
    expect(run(s, { type: 'setProductionSlot', dragonUid: 'gone', enabled: true }, clock)).toMatchObject({ ok: false, error: { code: 'dragon-unavailable' } });
  });
});

describe('i18n for the new errors', () => {
  it('every new error code has VI and EN text', () => {
    for (const c of ['zone-full', 'habitat-unsuitable', 'already-there', 'not-placed', 'production-budget-full', 'unknown-habitat', 'habitat-already-unlocked', 'unlock-requirement-missing']) {
      expect(vi).toHaveProperty(`commandError.${c}`);
      expect(en).toHaveProperty(`commandError.${c}`);
    }
  });

});
