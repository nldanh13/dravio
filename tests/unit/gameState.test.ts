import { describe, expect, it } from 'vitest';
import { fixedClock, OFFLINE_CAP_MS } from '../../src/engine/core/clock';
import { dispatch, type Command } from '../../src/engine/core/commands';
import type { DomainEvent } from '../../src/engine/core/events';
import { createInitialState, STARTING_GOLD_MICRO } from '../../src/engine/core/initialState';
import { createRng } from '../../src/engine/core/rng';
import { validateGameState } from '../../src/engine/core/validation';
import { growthStage } from '../../src/engine/economy/rates';
import { getSpecies } from '../../src/data/dragons';
import { en } from '../../src/i18n/en';
import { vi } from '../../src/i18n/vi';
import type { GameState } from '../../src/types/state';

const T0 = Date.UTC(2026, 10, 24, 10, 0, 0);

function newGame(seed = 101) {
  const clock = fixedClock(T0);
  const state = createInitialState({ saveId: 'save-1', nowMs: T0, rng: createRng(seed) });
  return { clock, state };
}

let seq = 0;
const rid = () => `req-${++seq}`;

/** Gửi lệnh, bắt buộc thành công và state kết quả hợp lệ. */
type CommandInput = Command extends infer C ? (C extends Command ? Omit<C, 'requestId'> : never) : never;

function ok(state: GameState, cmd: CommandInput, clock: { nowMs(): number }) {
  const r = dispatch(state, { requestId: rid(), ...cmd }, { clock });
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}`);
  const v = validateGameState(r.state);
  if (!v.ok) throw new Error(`invalid state after ${cmd.type}: ${v.errors.join('; ')}`);
  return r;
}

const ember = (s: GameState) => {
  const d = s.dragons[0];
  if (!d) throw new Error('no dragon');
  return d;
};

describe('initial state (S01 Given)', () => {
  it('is schema-valid: 150 G, one Emberling baby XP 0 in origin_meadow, in production, Normal', () => {
    const { state } = newGame();
    expect(validateGameState(state)).toEqual({ ok: true, state });
    expect(state.goldMicro).toBe(STARTING_GOLD_MICRO);
    expect(state.dragons).toHaveLength(1);
    const d = ember(state);
    expect(d.speciesId).toBe('emberling');
    expect(d.xpSec).toBe(0);
    expect(d.mutation).toBe('normal');
    expect(d.location).toEqual({ kind: 'zone', zoneId: 'origin', habitatId: 'origin_meadow' });
    expect(state.productionDragonIds).toEqual([d.uid]);
    expect(state.zones.map((z) => [z.id, z.unlocked, z.capacity])).toEqual([
      ['origin', true, 5],
      ['ocean', false, 5],
      ['sky', false, 5],
    ]);
  });

  it('is deterministic for the same seed (stable founder genotype)', () => {
    expect(newGame(101).state).toEqual(newGame(101).state);
    expect(newGame(101).state.dragons[0]?.uid).not.toBe(newGame(102).state.dragons[0]?.uid);
  });

  it('does not serialize frame data or derived values', () => {
    const json = JSON.stringify(newGame().state);
    for (const k of ['"x"', '"y"', '"vx"', '"vy"', '"stage"', '"phenotype"', '"rate']) expect(json).not.toContain(k);
  });
});

describe('runtime validation rejects bad saves', () => {
  const base = () => newGame().state;
  const bad = (mut: (s: GameState) => unknown) => {
    const s = structuredClone(base());
    const out = mut(s) ?? s;
    return validateGameState(out);
  };

  it.each([
    ['NaN gold', (s: GameState) => void (s.goldMicro = Number.NaN)],
    ['negative gold', (s: GameState) => void (s.goldMicro = -1)],
    ['fractional gold', (s: GameState) => void (s.goldMicro = 1.5)],
    ['NaN xp', (s: GameState) => void (ember(s).xpSec = Number.NaN)],
    ['xp above maturity', (s: GameState) => void (ember(s).xpSec = 301)],
    ['unknown species', (s: GameState) => void (ember(s).speciesId = 'dragonite')],
    ['invalid allele', (s: GameState) => void (ember(s).genotype = { pigment: ['Q', 'r'], pattern: ['P', 'p'], eye: ['B', 'b'] })],
    ['unnormalized allele order', (s: GameState) => void (ember(s).genotype = { pigment: ['r', 'R'], pattern: ['P', 'p'], eye: ['B', 'b'] })],
    ['duplicate UID', (s: GameState) => void s.dragons.push({ ...ember(s) })],
    ['unknown production UID', (s: GameState) => void s.productionDragonIds.push('ghost')],
    ['habitat not in zone', (s: GameState) => void (ember(s).location = { kind: 'zone', zoneId: 'origin', habitatId: 'ocean_reef' })],
    ['unknown habitat', (s: GameState) => void (ember(s).location = { kind: 'zone', zoneId: 'origin', habitatId: 'moon' })],
    ['bond out of range', (s: GameState) => void (ember(s).bond = 101)],
    ['unknown personality', (s: GameState) => void ((ember(s) as { personality: string }).personality = 'grumpy')],
    ['upgrade above max', (s: GameState) => void (s.upgrades.hatchSpeedLevel = 7)],
    ['clock high-water behind', (s: GameState) => void (s.clock.highWaterAtMs = s.clock.lastProcessedAtMs - 1)],
    ['not an object', () => 42],
  ])('%s', (_, mut) => {
    expect(bad(mut).ok).toBe(false);
  });
});

describe('command bus', () => {
  it('rejects malformed commands without changing state', () => {
    const { state, clock } = newGame();
    for (const c of [null, {}, { type: 'feed' }, { type: 'nope', requestId: 'r' }, { type: 'advanceTime', requestId: 'r', mode: 'warp' }, { type: 'pet', requestId: '', dragonUid: 'x' }]) {
      const r = dispatch(state, c, { clock });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe('invalid-command');
      expect(r.state).toBe(state);
    }
  });

  it('typed errors for unknown dragons; state unchanged', () => {
    const { state, clock } = newGame();
    const r = dispatch(state, { type: 'pet', requestId: 'r1', dragonUid: 'ghost' }, { clock });
    expect(r).toMatchObject({ ok: false, error: { code: 'unknown-dragon', messageKey: 'commandError.unknown-dragon' } });
    expect(r.state).toBe(state);
  });

  it('duplicate requestId is idempotent (no double gold, no revision bump)', () => {
    const { state, clock } = newGame();
    clock.advance(60_000);
    const first = dispatch(state, { type: 'advanceTime', requestId: 'same', mode: 'online' }, { clock });
    if (!first.ok) throw new Error('first failed');
    clock.advance(60_000);
    const again = dispatch(first.state, { type: 'advanceTime', requestId: 'same', mode: 'online' }, { clock });
    expect(again).toMatchObject({ ok: true, duplicate: true, events: [] });
    expect(again.state).toBe(first.state);
    expect(first.state.revision).toBe(1);
  });

  it('every error code has VI and EN text', () => {
    const codes = ['invalid-command', 'unknown-dragon', 'dragon-unavailable', 'zone-locked', 'habitat-locked', 'food-too-fast', 'food-limit', 'unknown-food', 'food-expired', 'wrong-diet', 'wrong-place', 'feed-cooldown', 'pet-cooldown', 'name-empty', 'name-too-long', 'name-invalid-chars'];
    for (const c of codes) {
      expect(vi).toHaveProperty(`commandError.${c}`);
      expect(en).toHaveProperty(`commandError.${c}`);
    }
  });
});

describe('advanceTime', () => {
  it('elapsed 0 / 60 s / 61 s', () => {
    for (const sec of [0, 60, 61]) {
      const { state, clock } = newGame();
      clock.advance(sec * 1000);
      const r = ok(state, { type: 'advanceTime', mode: 'online' }, clock);
      expect(r.events[0]).toMatchObject({ type: 'timeAdvanced', elapsedMs: sec * 1000 });
      expect(ember(r.state).xpSec).toBe(sec);
    }
  });

  it('S01: 300 s online from baby → adult; production split at 35%/100% = 4.70625 G', () => {
    const { state, clock } = newGame();
    clock.advance(300_000);
    const r = ok(state, { type: 'advanceTime', mode: 'online' }, clock);
    const gained = r.state.goldMicro - state.goldMicro;
    expect(gained).toBe(4_706_250); // 105×0.025×0.4 + 195×0.025×0.75 G
    expect(r.state.totalGoldEarnedMicro).toBe(gained);
    expect(growthStage(ember(r.state).xpSec, getSpecies('emberling'))).toBe('adult');
    const changes = r.events.filter((e): e is Extract<DomainEvent, { type: 'stageChanged' }> => e.type === 'stageChanged');
    expect(changes.map((e) => [e.from, e.to])).toEqual([
      ['baby', 'juvenile'],
      ['juvenile', 'adult'],
    ]);
  });

  it('stage boundary exactly at 35% (105 s) and 100% (300 s), in separate steps', () => {
    const { state, clock } = newGame();
    clock.advance(104_999);
    let s = ok(state, { type: 'advanceTime', mode: 'online' }, clock).state;
    expect(growthStage(ember(s).xpSec, getSpecies('emberling'))).toBe('baby');
    clock.advance(1);
    let r = ok(s, { type: 'advanceTime', mode: 'online' }, clock);
    expect(r.events.some((e) => e.type === 'stageChanged' && e.to === 'juvenile')).toBe(true);
    s = r.state;
    clock.advance(195_000);
    r = ok(s, { type: 'advanceTime', mode: 'online' }, clock);
    expect(r.events.some((e) => e.type === 'stageChanged' && e.to === 'adult')).toBe(true);
    // Chia nhỏ khoảng thời gian không làm lệch tổng vàng.
    expect(r.state.goldMicro - state.goldMicro).toBe(4_706_250);
  });

  it('S01: adult offline 8 h → 540 G (75%), XP capped, receipt created once', () => {
    const game = newGame();
    const { clock } = game;
    let { state } = game;
    clock.advance(300_000);
    state = ok(state, { type: 'advanceTime', mode: 'online' }, clock).state;
    const before = state.goldMicro;
    clock.advance(8 * 3600_000);
    const r = ok(state, { type: 'advanceTime', mode: 'offline' }, clock);
    expect(r.state.goldMicro - before).toBe(540_000_000);
    expect(ember(r.state).xpSec).toBe(300);
    expect(r.state.offlineReceipt).toMatchObject({ goldMicro: 540_000_000, bonusClaimed: false });
    expect(r.events.filter((e) => e.type === 'offlineReceiptCreated')).toHaveLength(1);
  });

  it('no receipt for offline ≤ 60 s', () => {
    const { state, clock } = newGame();
    clock.advance(60_000);
    expect(ok(state, { type: 'advanceTime', mode: 'offline' }, clock).state.offlineReceipt).toBeNull();
  });

  it('caps offline time at 24 h', () => {
    const { state, clock } = newGame();
    clock.advance(3 * OFFLINE_CAP_MS);
    const r = ok(state, { type: 'advanceTime', mode: 'offline' }, clock);
    expect(r.events[0]).toMatchObject({ elapsedMs: OFFLINE_CAP_MS });
  });

  it('clock going backwards grants nothing and keeps the high-water mark', () => {
    const game = newGame();
    const { clock } = game;
    let { state } = game;
    clock.advance(10_000);
    state = ok(state, { type: 'advanceTime', mode: 'online' }, clock).state;
    const gold = state.goldMicro;
    clock.set(T0 - 3_600_000);
    const r = ok(state, { type: 'advanceTime', mode: 'online' }, clock);
    expect(r.state.goldMicro).toBe(gold);
    expect(r.state.clock.highWaterAtMs).toBe(T0 + 10_000);
  });

  it('dragons outside the production budget or habitat still grow but earn nothing', () => {
    const game = newGame();
    const { clock } = game;
    let { state } = game;
    state = { ...state, productionDragonIds: [] };
    clock.advance(60_000);
    const r = ok(state, { type: 'advanceTime', mode: 'online' }, clock);
    expect(r.state.goldMicro).toBe(state.goldMicro);
    expect(ember(r.state).xpSec).toBe(60);
  });

  it('released dragons do not grow', () => {
    const game = newGame();
    const { clock } = game;
    let { state } = game;
    state = { ...state, productionDragonIds: [], dragons: [{ ...ember(state), location: { kind: 'released' } }] };
    clock.advance(60_000);
    expect(ember(ok(state, { type: 'advanceTime', mode: 'online' }, clock).state).xpSec).toBe(0);
  });
});

describe('feed + consumeFood', () => {
  const feed = { type: 'feed', dietId: 'fruit', zoneId: 'origin', habitatId: 'origin_meadow' } as const;

  it('spawns food with a 12 s TTL and no gold', () => {
    const { state, clock } = newGame();
    const r = ok(state, feed, clock);
    expect(r.state.food.drops).toHaveLength(1);
    expect(r.state.food.drops[0]?.expiresAtMs).toBe(T0 + 12_000);
    expect(r.state.goldMicro).toBe(state.goldMicro);
  });

  it('enforces 0.8 s between drops and the 5 + level concurrent limit', () => {
    const game = newGame();
    const { clock } = game;
    let { state } = game;
    state = ok(state, feed, clock).state;
    clock.advance(799);
    expect(dispatch(state, { requestId: rid(), ...feed }, { clock })).toMatchObject({ ok: false, error: { code: 'food-too-fast' } });
    clock.advance(1);
    state = ok(state, feed, clock).state;
    for (let i = 0; i < 3; i++) {
      clock.advance(800);
      state = ok(state, feed, clock).state;
    }
    clock.advance(800);
    expect(dispatch(state, { requestId: rid(), ...feed }, { clock })).toMatchObject({ ok: false, error: { code: 'food-limit' } });
  });

  it('rejects locked zones and habitats', () => {
    const { state, clock } = newGame();
    expect(dispatch(state, { requestId: rid(), ...feed, zoneId: 'ocean', habitatId: 'ocean_reef' }, { clock })).toMatchObject({ error: { code: 'zone-locked' } });
    expect(dispatch(state, { requestId: rid(), ...feed, habitatId: 'origin_pondbank' }, { clock })).toMatchObject({ error: { code: 'habitat-locked' } });
    expect(dispatch(state, { requestId: rid(), ...feed, habitatId: 'ocean_reef' }, { clock })).toMatchObject({ error: { code: 'habitat-locked' } });
  });

  it('food expires after 12 s', () => {
    const game = newGame();
    const { clock } = game;
    let { state } = game;
    const r = ok(state, feed, clock);
    state = r.state;
    clock.advance(12_000);
    const r2 = ok(state, { type: 'advanceTime', mode: 'online' }, clock);
    expect(r2.state.food.drops).toHaveLength(0);
    expect(r2.events).toContainEqual({ type: 'foodExpired', foodId: r.state.food.drops[0]?.id });
  });

  it('S01: first valid meal gives +8 s XP and +1 bond, no gold for eating; XP at most once per 8 s', () => {
    const game = newGame();
    const { clock } = game;
    let { state } = game;
    state = ok(state, feed, clock).state;
    const food1 = state.food.drops[0]?.id ?? '';
    const uid = ember(state).uid;
    let r = ok(state, { type: 'consumeFood', foodId: food1, dragonUid: uid }, clock);
    expect(ember(r.state).xpSec).toBe(8);
    expect(ember(r.state).bond).toBe(1);
    expect(r.state.goldMicro).toBe(state.goldMicro);
    expect(r.state.food.drops).toHaveLength(0);
    state = r.state;

    clock.advance(800);
    state = ok(state, feed, clock).state;
    const food2 = state.food.drops[0]?.id ?? '';
    clock.advance(1_000); // 1,8 s sau bữa đầu
    expect(dispatch(state, { requestId: rid(), type: 'consumeFood', foodId: food2, dragonUid: uid }, { clock })).toMatchObject({
      ok: false,
      error: { code: 'feed-cooldown' },
    });
    clock.advance(6_200); // đủ 8 s
    r = ok(state, { type: 'consumeFood', foodId: food2, dragonUid: uid }, clock);
    // 8 s XP thời gian trôi qua + 8 s mỗi bữa × 2
    expect(ember(r.state).xpSec).toBe(8 + 8 + 8);
  });

  it('rejects the wrong diet, expired food and unknown food', () => {
    const game = newGame();
    const { clock } = game;
    let { state } = game;
    state = ok(state, { ...feed, dietId: 'aquatic' }, clock).state;
    const uid = ember(state).uid;
    const fid = state.food.drops[0]?.id ?? '';
    expect(dispatch(state, { requestId: rid(), type: 'consumeFood', foodId: fid, dragonUid: uid }, { clock })).toMatchObject({ error: { code: 'wrong-diet' } });
    expect(dispatch(state, { requestId: rid(), type: 'consumeFood', foodId: 'nope', dragonUid: uid }, { clock })).toMatchObject({ error: { code: 'unknown-food' } });
    clock.advance(800);
    state = ok(state, feed, clock).state;
    const fruit = state.food.drops.find((f) => f.dietId === 'fruit')?.id ?? '';
    clock.advance(12_000);
    expect(dispatch(state, { requestId: rid(), type: 'consumeFood', foodId: fruit, dragonUid: uid }, { clock })).toMatchObject({ error: { code: 'food-expired' } });
  });

  it('feeding XP can cross a stage boundary and emits the change', () => {
    const game = newGame();
    const { clock } = game;
    let { state } = game;
    clock.advance(100_000);
    state = ok(state, { type: 'advanceTime', mode: 'online' }, clock).state;
    state = ok(state, feed, clock).state;
    const r = ok(state, { type: 'consumeFood', foodId: state.food.drops[0]?.id ?? '', dragonUid: ember(state).uid }, clock);
    expect(r.events).toContainEqual({ type: 'stageChanged', dragonUid: ember(state).uid, from: 'baby', to: 'juvenile' });
  });
});

describe('pet and bond', () => {
  it('+1 bond, 30 s cooldown', () => {
    const game = newGame();
    const { clock } = game;
    let { state } = game;
    const uid = ember(state).uid;
    state = ok(state, { type: 'pet', dragonUid: uid }, clock).state;
    expect(ember(state).bond).toBe(1);
    clock.advance(29_999);
    expect(dispatch(state, { requestId: rid(), type: 'pet', dragonUid: uid }, { clock })).toMatchObject({ error: { code: 'pet-cooldown' } });
    clock.advance(1);
    expect(ember(ok(state, { type: 'pet', dragonUid: uid }, clock).state).bond).toBe(2);
  });

  it('caps bond gains at 10 per UTC day per dragon, resets the next UTC day, never exceeds 100', () => {
    const game = newGame();
    const { clock } = game;
    let { state } = game;
    const uid = ember(state).uid;
    for (let i = 0; i < 12; i++) {
      state = ok(state, { type: 'pet', dragonUid: uid }, clock).state;
      clock.advance(30_000);
    }
    expect(ember(state).bond).toBe(10);
    clock.set(Date.UTC(2026, 10, 25, 0, 0, 1));
    state = ok(state, { type: 'pet', dragonUid: uid }, clock).state;
    expect(ember(state).bond).toBe(11);
    state = { ...state, dragons: [{ ...ember(state), bond: 100, bondDaily: 0 }] };
    clock.advance(30_000);
    expect(ember(ok(state, { type: 'pet', dragonUid: uid }, clock).state).bond).toBe(100);
  });

  it('clock rollback cannot bypass the pet cooldown', () => {
    const game = newGame();
    const { clock } = game;
    let { state } = game;
    const uid = ember(state).uid;
    clock.advance(60_000);
    state = ok(state, { type: 'advanceTime', mode: 'online' }, clock).state;
    state = ok(state, { type: 'pet', dragonUid: uid }, clock).state;
    clock.set(T0);
    expect(dispatch(state, { requestId: rid(), type: 'pet', dragonUid: uid }, { clock })).toMatchObject({ error: { code: 'pet-cooldown' } });
  });
});

describe('renameDragon', () => {
  const rename = (state: GameState, nickname: string | null, clock: { nowMs(): number }) =>
    dispatch(state, { requestId: rid(), type: 'renameDragon', dragonUid: ember(state).uid, nickname }, { clock });

  it('trims and stores the name verbatim (no HTML interpretation)', () => {
    const { state, clock } = newGame();
    const r = rename(state, '  Lửa Nhỏ <b>  ', clock);
    expect(r.ok && ember(r.state).nickname).toBe('Lửa Nhỏ <b>');
  });

  it('counts Unicode graphemes: 24 ok, 25 too long; emoji count as one', () => {
    const { state, clock } = newGame();
    expect(rename(state, 'a'.repeat(24), clock).ok).toBe(true);
    expect(rename(state, 'a'.repeat(25), clock)).toMatchObject({ error: { code: 'name-too-long' } });
    expect(rename(state, '👨‍👩‍👧‍👦'.repeat(24), clock).ok).toBe(true);
    expect(rename(state, 'Ê'.normalize('NFD').repeat(24), clock).ok).toBe(true);
  });

  it('rejects empty names and control/bidi characters', () => {
    const { state, clock } = newGame();
    expect(rename(state, '   ', clock)).toMatchObject({ error: { code: 'name-empty' } });
    expect(rename(state, 'a\u0000b', clock)).toMatchObject({ error: { code: 'name-invalid-chars' } });
    expect(rename(state, 'abc‮def', clock)).toMatchObject({ error: { code: 'name-invalid-chars' } });
    expect(rename(state, 'line\nbreak', clock)).toMatchObject({ error: { code: 'name-invalid-chars' } });
  });

  it('null clears the nickname', () => {
    const { state, clock } = newGame();
    const named = rename(state, 'Ember', clock);
    if (!named.ok) throw new Error('rename failed');
    const cleared = rename(named.state, null, clock);
    expect(cleared.ok && ember(cleared.state).nickname).toBeUndefined();
    expect(cleared.ok && validateGameState(cleared.state).ok).toBe(true);
  });
});
