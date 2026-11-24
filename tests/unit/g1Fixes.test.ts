import { describe, expect, it } from 'vitest';
import { DRAGON_SPECIES } from '../../src/data/dragons';
import { HABITAT_PROFILES, SPECIES_BIOLOGY, type HabitatId } from '../../src/data/g0Biology';
import { P0_ZONE_CAPACITY, WORLD_EDGES, WORLD_ZONE_IDS, canTravel } from '../../src/data/worldGraph';
import { createInitialState } from '../../src/engine/core/initialState';
import { createRng } from '../../src/engine/core/rng';
import { validateGameState } from '../../src/engine/core/validation';
import { speciesSuitability } from '../../src/engine/world/habitat';
import { MIGRATION_STEPS } from '../../src/persistence/migrations';
import { SaveManager } from '../../src/persistence/saveManager';
import { MemorySaveStore, SaveConflictError } from '../../src/persistence/store';
import { isPageVisible, onPageLifecycle } from '../../src/platform/lifecycle';
import { ONLINE_GAP_LIMIT_MS, advanceModeFor } from '../../src/platform/timePolicy';
import { LEASE_KEY, LEASE_SETTLE_MS, LEASE_TTL_MS, acquireLease, acquireWriterLock, type LeaseEnv, type StorageLike } from '../../src/platform/writerLock';
import type { GameState } from '../../src/types/state';
import { adult } from './fixtures';

const T0 = Date.UTC(2026, 10, 25, 9, 0, 0);
const fresh = (saveId = 'fix'): GameState => createInitialState({ saveId, nowMs: T0, rng: createRng(4) });
const errorsOf = (s: unknown): string[] => {
  const r = validateGameState(s);
  return r.ok ? [] : r.errors;
};

describe('time policy (ADR 0010)', () => {
  it('hidden page always settles offline', () => {
    expect(advanceModeFor(T0, T0 + 1000, false)).toBe('offline');
  });
  it('visible page ticks online up to the gap limit, offline beyond (sleep, frozen tab)', () => {
    expect(advanceModeFor(T0, T0 + 1000, true)).toBe('online');
    expect(advanceModeFor(T0, T0 + ONLINE_GAP_LIMIT_MS, true)).toBe('online');
    expect(advanceModeFor(T0, T0 + ONLINE_GAP_LIMIT_MS + 1, true)).toBe('offline');
    expect(advanceModeFor(T0, T0 + 3_600_000, true)).toBe('offline');
  });
});

describe('page lifecycle events', () => {
  function fakePage() {
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
    const win = new EventTarget();
    return { doc, win, d: doc as unknown as Document, w: win as unknown as Window };
  }
  it('maps visibilitychange, freeze, resume, pagehide, pageshow to hide/show and unbinds', () => {
    const p = fakePage();
    const log: string[] = [];
    const off = onPageLifecycle({ onHide: () => log.push('hide'), onShow: () => log.push('show') }, p.d, p.w);
    p.doc.visibilityState = 'hidden';
    p.doc.dispatchEvent(new Event('visibilitychange'));
    expect(isPageVisible(p.d)).toBe(false);
    p.doc.dispatchEvent(new Event('freeze'));
    p.doc.dispatchEvent(new Event('resume')); // vẫn ẩn → không show
    p.doc.visibilityState = 'visible';
    p.doc.dispatchEvent(new Event('visibilitychange'));
    p.win.dispatchEvent(new Event('pagehide'));
    p.win.dispatchEvent(new Event('pageshow'));
    expect(log).toEqual(['hide', 'hide', 'show', 'hide', 'show']);
    off();
    p.win.dispatchEvent(new Event('pagehide'));
    expect(log).toHaveLength(5);
  });
});

describe('save compare-and-swap: two tabs never overwrite each other', () => {
  it('MemorySaveStore rejects a rotate whose expected main is stale', async () => {
    const store = new MemorySaveStore();
    await store.rotate('a', { expectMain: null });
    await expect(store.rotate('b', { expectMain: null })).rejects.toBeInstanceOf(SaveConflictError);
    expect(await store.get('main')).toBe('a');
    await store.rotate('b', { expectMain: 'a' });
    expect([await store.get('main'), await store.get('backup1')]).toEqual(['b', 'a']);
  });

  it('second writer that loaded before the first wrote is blocked with "conflict" and nothing is overwritten', async () => {
    const store = new MemorySaveStore();
    const tabA = new SaveManager({ store, nowMs: () => T0 });
    const tabB = new SaveManager({ store, nowMs: () => T0 });
    await tabA.load();
    await tabB.load();
    const a = { ...fresh('tab-a'), revision: 1 };
    const b = { ...fresh('tab-b'), revision: 1 };
    expect(await tabA.save(a)).toBe(true);
    const mainAfterA = await store.get('main');
    expect(await tabB.save(b)).toBe(false);
    expect(tabB.writeBlock).toBe('conflict');
    expect(await store.get('main')).toBe(mainAfterA);
    // Tab A vẫn ghi tiếp bình thường; tab B không bao giờ ghi lại, kể cả force.
    expect(await tabA.save({ ...a, revision: 2 })).toBe(true);
    expect(await tabB.save({ ...b, revision: 3 }, { force: true })).toBe(false);
    expect(await store.get('main')).toContain('"saveId":"tab-a"');
  });
});

function leaseHarness() {
  const map = new Map<string, string>();
  const storage: StorageLike = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
  let now = T0;
  const timeouts: { at: number; fn: () => void }[] = [];
  const intervals = new Map<number, { every: number; next: number; fn: () => void }>();
  let id = 0;
  const env = (ownerId: string): LeaseEnv => ({
    storage,
    ownerId,
    nowMs: () => now,
    setTimeout: (fn, ms) => timeouts.push({ at: now + ms, fn }),
    setInterval: (fn, ms) => {
      intervals.set(++id, { every: ms, next: now + ms, fn });
      return id;
    },
    clearInterval: (h) => void intervals.delete(h as number),
  });
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const t = timeouts.sort((x, y) => x.at - y.at)[0];
      const iv = [...intervals.values()].sort((x, y) => x.next - y.next)[0];
      const nextAt = Math.min(t?.at ?? Infinity, iv?.next ?? Infinity);
      if (nextAt > end) break;
      now = nextAt;
      if (t && t.at === nextAt) {
        timeouts.shift();
        t.fn();
      } else if (iv) {
        iv.next += iv.every;
        iv.fn();
      }
    }
    now = end;
  };
  return { map, env, advance, intervals };
}

describe('localStorage lease fallback when Web Locks are missing', () => {
  it('first tab acquires, a second tab stays read-only while the lease is alive', async () => {
    const h = leaseHarness();
    const pa = acquireLease(h.env('A'));
    h.advance(LEASE_SETTLE_MS);
    const a = await pa;
    expect(a).toMatchObject({ acquired: true, via: 'lease', unsupported: true });
    h.advance(LEASE_TTL_MS * 3); // heartbeat giữ lease sống
    expect(await acquireLease(h.env('B'))).toMatchObject({ acquired: false, via: 'lease' });
    a.release();
    expect(h.map.has(LEASE_KEY)).toBe(false);
    expect(h.intervals.size).toBe(0);
    const pb = acquireLease(h.env('B'));
    h.advance(LEASE_SETTLE_MS);
    expect((await pb).acquired).toBe(true);
  });

  it('two tabs racing inside the settle window: the tab whose write was overwritten backs off', async () => {
    const h = leaseHarness();
    const pa = acquireLease(h.env('A'));
    // Tab B đọc trước khi A ghi (khác tiến trình) rồi ghi đè lease trong cửa sổ chờ.
    h.map.set(LEASE_KEY, JSON.stringify({ owner: 'B', expiresAtMs: T0 + LEASE_TTL_MS }));
    h.advance(LEASE_SETTLE_MS);
    expect((await pa).acquired).toBe(false);
  });

  it('an expired lease (crashed or frozen tab) is taken over', async () => {
    const h = leaseHarness();
    h.map.set(LEASE_KEY, JSON.stringify({ owner: 'dead', expiresAtMs: T0 - 1 }));
    const p = acquireLease(h.env('A'));
    h.advance(LEASE_SETTLE_MS);
    expect((await p).acquired).toBe(true);
  });

  it('acquireWriterLock falls back to the lease when navigator.locks is absent', async () => {
    const h = leaseHarness();
    const p = acquireWriterLock(undefined, undefined, () => h.env('A'));
    h.advance(LEASE_SETTLE_MS);
    expect(await p).toMatchObject({ acquired: true, via: 'lease' });
  });
});

describe('runtime validation: P0 world invariants', () => {
  const origin = (s: GameState) => s.zones.find((z) => z.id === 'origin')!;

  it('fresh state is valid', () => {
    expect(errorsOf(fresh())).toEqual([]);
  });

  it('zone capacity must be exactly 5 in P0', () => {
    const s = fresh();
    s.zones = s.zones.map((z) => (z.id === 'ocean' ? { ...z, capacity: 6 } : z));
    expect(errorsOf(s).some((e) => e.includes('capacity'))).toBe(true);
    expect(P0_ZONE_CAPACITY).toBe(5);
  });

  it('locked zone cannot have unlocked habitats; unlocked origin keeps the meadow; no duplicates', () => {
    const a = fresh();
    a.zones = a.zones.map((z) => (z.id === 'ocean' ? { ...z, unlockedHabitatIds: ['ocean_estuary'] } : z));
    expect(errorsOf(a).some((e) => e.includes('locked zone has unlocked habitats'))).toBe(true);
    const b = fresh();
    origin(b).unlockedHabitatIds = [];
    expect(errorsOf(b).some((e) => e.includes('origin_meadow must be unlocked'))).toBe(true);
    const c = fresh();
    origin(c).unlockedHabitatIds = ['origin_meadow', 'origin_meadow'];
    expect(errorsOf(c).some((e) => e.includes('duplicates'))).toBe(true);
  });

  it('non-default habitats need their discovery', () => {
    const s = fresh();
    origin(s).unlockedHabitatIds = ['origin_meadow', 'origin_warm_rocks'];
    expect(errorsOf(s).some((e) => e.includes('origin_warm_rocks requires DISC_EMBERLING_THERMAL'))).toBe(true);
    s.discoveries = ['DISC_EMBERLING_THERMAL'];
    expect(errorsOf(s)).toEqual([]);
  });

  it('placed dragon must be in an unlocked zone + habitat and biologically allowed', () => {
    const locked = fresh();
    locked.dragons = [...locked.dragons, adult('x1', 'emberling', { location: { kind: 'zone', zoneId: 'origin', habitatId: 'origin_warm_rocks' } })];
    expect(errorsOf(locked).some((e) => e.includes('habitat origin_warm_rocks is locked'))).toBe(true);

    const lockedZone = fresh();
    lockedZone.dragons = [...lockedZone.dragons, adult('x2', 'droplet', { location: { kind: 'zone', zoneId: 'ocean', habitatId: 'ocean_estuary' } })];
    expect(errorsOf(lockedZone).some((e) => e.includes('zone ocean is locked'))).toBe(true);

    const pair = DRAGON_SPECIES.flatMap((sp) => (['origin_meadow', 'origin_warm_rocks', 'origin_pondbank'] as HabitatId[]).map((h) => [sp.id, h] as const)).find(
      ([sp, h]) => !speciesSuitability(sp, h).allowed,
    );
    expect(pair).toBeDefined();
    const [sp, h] = pair!;
    const bad = fresh();
    bad.discoveries = ['DISC_EMBERLING_THERMAL', 'DISC_AQUATIC_HABITAT'];
    origin(bad).unlockedHabitatIds = ['origin_meadow', 'origin_warm_rocks', 'origin_pondbank'];
    bad.dragons = [...bad.dragons, adult('x3', sp, { location: { kind: 'zone', zoneId: 'origin', habitatId: h } })];
    expect(errorsOf(bad).some((e) => e.includes(`unsuitable for ${sp}`))).toBe(true);
  });

  it('production ids must reference dragons placed in a zone', () => {
    const s = fresh();
    s.dragons = [...s.dragons, adult('st', 'emberling')];
    s.productionDragonIds = [...s.productionDragonIds, 'st'];
    expect(errorsOf(s).some((e) => e.includes('dragon st is not placed in a zone'))).toBe(true);
  });

  it('food drop habitat must belong to its zone', () => {
    const s = fresh();
    s.food = { ...s.food, drops: [{ id: 'f1', dietId: 'fruit', zoneId: 'origin', habitatId: 'ocean_reef', spawnedAtMs: T0, expiresAtMs: T0 + 12_000 }] };
    expect(errorsOf(s).some((e) => e.includes('food.drops[0]: habitat not in zone'))).toBe(true);
  });
});

describe('migration v1 → v2 back-fills discoveries for already-open habitats', () => {
  const step = MIGRATION_STEPS.find((m) => m.from === 1)!;
  it('adds the matching discovery only for open gated habitats', () => {
    const out = step.run({ zones: [{ id: 'origin', unlockedHabitatIds: ['origin_meadow', 'origin_pondbank'] }] });
    expect(out.discoveries).toEqual(['DISC_AQUATIC_HABITAT']);
    expect(step.run({ zones: [{ id: 'origin', unlockedHabitatIds: ['origin_meadow'] }] }).discoveries).toEqual([]);
  });
});

describe('world graph (GDD 3.1 p.5: node = zone, edge = route with movement condition)', () => {
  it('edges connect known zones through gateway habitats that belong to those zones', () => {
    for (const e of WORLD_EDGES) {
      expect(WORLD_ZONE_IDS).toContain(e.a);
      expect(WORLD_ZONE_IDS).toContain(e.b);
      for (const [zone, h] of Object.entries(e.gateways)) expect(HABITAT_PROFILES[h].zoneId).toBe(zone);
    }
    expect(new Set(WORLD_EDGES.map((e) => e.id)).size).toBe(WORLD_EDGES.length);
  });

  it('sky gateway is a perch; ocean is reached through the estuary', () => {
    const sky = WORLD_EDGES.find((e) => e.b === 'sky')!;
    expect(HABITAT_PROFILES[sky.gateways.sky!].perch).toBe(true);
    expect(sky.requires).toEqual(['fly']);
    const ocean = WORLD_EDGES.find((e) => e.b === 'ocean')!;
    expect(ocean.gateways.ocean).toBe('ocean_estuary');
    expect(ocean.requires).toEqual(['swim']);
  });

  it('movement follows locomotion', () => {
    expect(canTravel('origin', 'origin', ['walk'])).toBe(true);
    expect(canTravel('origin', 'ocean', ['walk'])).toBe(false);
    expect(canTravel('origin', 'ocean', ['walk', 'swim'])).toBe(true);
    expect(canTravel('origin', 'sky', ['walk', 'fly'])).toBe(true);
    expect(canTravel('ocean', 'sky', ['swim'])).toBe(false);
    expect(canTravel('ocean', 'sky', ['swim', 'fly'])).toBe(true);
  });

  it('every species can reach every zone that holds one of its allowed habitats', () => {
    for (const [id, bio] of Object.entries(SPECIES_BIOLOGY)) {
      for (const h of Object.keys(HABITAT_PROFILES) as HabitatId[]) {
        if (!speciesSuitability(id, h).allowed) continue;
        expect(canTravel('origin', HABITAT_PROFILES[h].zoneId as 'origin', bio.locomotion), `${id} → ${h}`).toBe(true);
      }
    }
  });
});
