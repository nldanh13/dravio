import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/engine/core/initialState';
import { createRng } from '../../src/engine/core/rng';
import { createAssetAdapter } from '../../src/rendering/assetAdapter';
import { defaultRenderManifest, validateRenderManifest } from '../../src/rendering/assetContract';
import { BODY_RADIUS, EAT_MS, LivingWorld, PET_MS, STEER_STEP_MS, blockingObstacles, type Agent } from '../../src/rendering/livingWorld';
import { EDGE_MARGIN, ORIGIN_LAYOUT, inWater, regionOf } from '../../src/rendering/originLayout';
import type { DragonInstance } from '../../src/types/game';
import type { GameState } from '../../src/types/state';
import { adult } from './fixtures';

const T0 = Date.UTC(2026, 10, 25, 9, 0, 0);
const at = (habitatId: string) => ({ kind: 'zone' as const, zoneId: 'origin', habitatId });

function stateWith(dragons: DragonInstance[], drops: GameState['food']['drops'] = []): GameState {
  const s = createInitialState({ saveId: 'world', nowMs: T0, rng: createRng(3) });
  return {
    ...s,
    dragons,
    discoveries: ['DISC_EMBERLING_THERMAL', 'DISC_AQUATIC_HABITAT'],
    zones: s.zones.map((z) => (z.id === 'origin' ? { ...z, unlockedHabitatIds: ['origin_meadow', 'origin_warm_rocks', 'origin_pondbank'] } : z)),
    food: { lastSpawnAtMs: null, drops },
  };
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

function run(world: LivingWorld, ms: number, now = T0, frame = 16, each?: (w: LivingWorld) => void) {
  for (let t = 0; t < ms; t += frame) {
    world.step(frame, now);
    each?.(world);
  }
}

describe('asset contract + adapter (AI 2 owns art)', () => {
  it('default manifest from existing Emberling sprites is valid: 3 stages × 4 variants, bundled URLs, feet anchor', () => {
    const m = defaultRenderManifest();
    expect(validateRenderManifest(m)).toEqual([]);
    const e = m.dragons.emberling!;
    expect(Object.keys(e).sort()).toEqual(['adult', 'baby', 'juvenile']);
    for (const st of Object.values(e)) expect(Object.keys(st!).sort()).toEqual(['crystal', 'golden', 'normal', 'prismatic']);
    expect(m.habitats).toEqual({});
  });

  it('rejects remote URLs, bad anchors, unknown animation ids, missing provenance', () => {
    const m = defaultRenderManifest();
    const s = m.dragons.emberling!.adult!.normal!;
    m.dragons.emberling!.adult!.normal = { ...s, url: 'https://cdn.example/x.png', anchorY: 999, animations: { dance: { url: '/a.png', frames: 2, durationMs: 100, loop: true } } as never };
    m.habitats.origin_meadow = { groundUrl: 'http://x/y.png', source: { origin: '', license: '', review: 'approved' } };
    const errs = validateRenderManifest(m).join('\n');
    expect(errs).toContain('must be a bundled local asset');
    expect(errs).toContain('anchor outside frame');
    expect(errs).toContain('unknown animation');
    expect(errs).toContain('habitats.origin_meadow.source');
  });

  it('adapter preloads once, resolves by species/stage/mutation, null for missing species, records failures', async () => {
    const m = defaultRenderManifest();
    const bad = m.dragons.emberling!.baby!.golden!.url;
    const loaded: string[] = [];
    const adapter = createAssetAdapter(m, async (u) => {
      loaded.push(u);
      if (u === bad) throw new Error('x');
      return { u } as unknown as CanvasImageSource;
    });
    expect(adapter.dragon('emberling', 'adult', 'normal')).toBeNull();
    await adapter.preload();
    expect(new Set(loaded).size).toBe(loaded.length);
    expect(adapter.loadedCount).toBe(11);
    expect(adapter.failed).toEqual([bad]);
    expect(adapter.dragon('emberling', 'adult', 'crystal')?.asset.url).toBe(m.dragons.emberling!.adult!.crystal!.url);
    expect(adapter.dragon('emberling', 'baby', 'golden')).toBeNull();
    expect(adapter.dragon('sprout', 'adult', 'normal')).toBeNull();
    adapter.dispose();
    expect(adapter.dragon('emberling', 'adult', 'crystal')).toBeNull();
  });
});

describe('living world: FSM + steering by anatomy (display-only)', () => {
  it('spawns one agent per dragon placed in Origin, removes when moved to storage; never mutates GameState', () => {
    const world = new LivingWorld({ consume: () => 'ok' });
    const s = deepFreeze(stateWith([adult('e1', 'emberling', { location: at('origin_meadow') }), adult('e2', 'emberling')]));
    world.sync(s);
    expect([...world.agents.keys()]).toEqual(['e1']);
    run(world, 5000);
    const moved = stateWith([adult('e1', 'emberling')]);
    world.sync(moved);
    expect(world.agents.size).toBe(0);
  });

  it('walker stays in bounds, never enters water or solid obstacles, never flies (10 simulated minutes)', () => {
    const world = new LivingWorld({ consume: () => 'ok', seed: 'walk' });
    world.sync(stateWith([adult('e1', 'emberling', { location: at('origin_warm_rocks'), personality: 'playful' }), adult('m1', 'emberling', { location: at('origin_meadow'), personality: 'curious' })]));
    let maxZ = 0;
    const start = { ...world.agents.get('e1')!.pos };
    run(world, 600_000, T0, 33, (w) => {
      for (const a of w.agents.values()) {
        const r = regionOf(a.habitatId)!;
        maxZ = Math.max(maxZ, a.z);
        expect(a.pos.x).toBeGreaterThanOrEqual(r.x0 + EDGE_MARGIN - 1e-6);
        expect(a.pos.x).toBeLessThanOrEqual(r.x1 - EDGE_MARGIN + 1e-6);
        expect(a.pos.y).toBeGreaterThanOrEqual(r.y0 + EDGE_MARGIN - 1e-6);
        expect(a.pos.y).toBeLessThanOrEqual(r.y1 - EDGE_MARGIN + 1e-6);
        for (const o of r.obstacles) expect(Math.hypot(a.pos.x - o.x, a.pos.y - o.y)).toBeGreaterThanOrEqual(o.r + BODY_RADIUS * 0.5 - 1e-6);
      }
    });
    const a = world.agents.get('e1')!;
    const moved = Math.hypot(a.pos.x - start.x, a.pos.y - start.y);
    expect(maxZ).toBe(0);
    expect(moved).toBeGreaterThan(0);
  });

  it('only flying species fly; swimmers enter water; walkers are blocked by water', () => {
    const world = new LivingWorld({ consume: () => 'ok', seed: 'mob' });
    world.sync(stateWith([adult('z1', 'zephyr', { location: at('origin_meadow'), personality: 'playful' }), adult('d1', 'droplet', { location: at('origin_pondbank'), personality: 'playful' })]));
    let flew = false;
    let swam = false;
    run(world, 600_000, T0, 33, (w) => {
      const z = w.agents.get('z1')!;
      const d = w.agents.get('d1')!;
      if (z.z > 10) flew = true;
      if (inWater(regionOf('origin_pondbank')!, d.pos)) swam = true;
      expect(d.z).toBe(0);
    });
    expect(flew).toBe(true);
    expect(swam).toBe(true);
    const pond = regionOf('origin_pondbank')!;
    const walker = { airborne: false, mobility: { walk: true, swim: false, fly: false } };
    expect(blockingObstacles(walker, pond).some((o) => o.kind === 'water')).toBe(true);
    expect(blockingObstacles({ ...walker, mobility: { walk: true, swim: true, fly: false } }, pond)).toEqual([]);
    expect(blockingObstacles({ ...walker, airborne: true }, pond)).toEqual([]);
  });

  it('food drop → move to food → consumeFood exactly once with the right ids → eat animation; no direct XP', () => {
    const calls: [string, string][] = [];
    const world = new LivingWorld({ consume: (f, d) => (calls.push([f, d]), 'ok'), seed: 'food' });
    const ember = adult('e1', 'emberling', { location: at('origin_meadow') });
    world.sync(stateWith([ember]));
    world.noteDrop('origin_meadow', { x: 400, y: 450 });
    const drop = { id: 'food-1', dietId: 'fruit' as const, zoneId: 'origin', habitatId: 'origin_meadow', spawnedAtMs: T0, expiresAtMs: T0 + 12_000 };
    const s = deepFreeze(stateWith([ember], [drop]));
    world.sync(s);
    expect(world.food.get('food-1')?.pos).toEqual({ x: 400, y: 450 });
    let sawEat = false;
    run(world, 11_000, T0 + 100, 16, (w) => {
      if (w.agents.get('e1')!.state === 'eat') sawEat = true;
    });
    expect(calls).toEqual([['food-1', 'e1']]);
    expect(sawEat).toBe(true);
    expect(s.dragons[0]!.xpSec).toBe(ember.xpSec);
  });

  it('ignores food of the wrong diet, food during feed cooldown, and backs off after a rejected consume', () => {
    const calls: string[] = [];
    let answer: 'ok' | 'rejected' = 'rejected';
    const world = new LivingWorld({ consume: (f) => (calls.push(f), answer), seed: 'diet' });
    const leaf = { id: 'leaf-1', dietId: 'leaf' as const, zoneId: 'origin', habitatId: 'origin_meadow', spawnedAtMs: T0, expiresAtMs: T0 + 12_000 };
    world.sync(stateWith([adult('e1', 'emberling', { location: at('origin_meadow') })], [leaf]));
    run(world, 10_000, T0);
    expect(calls).toEqual([]);

    const fruit = { ...leaf, id: 'fruit-1', dietId: 'fruit' as const };
    const cooling = new LivingWorld({ consume: (f) => (calls.push(f), 'ok'), seed: 'cool' });
    cooling.sync(stateWith([adult('e1', 'emberling', { location: at('origin_meadow'), lastFeedXpAtMs: T0 })], [fruit]));
    run(cooling, 6000, T0 + 2000);
    expect(calls).toEqual([]);

    world.sync(stateWith([adult('e1', 'emberling', { location: at('origin_meadow') })], [fruit]));
    run(world, 11_000, T0);
    expect(calls).toEqual(['fruit-1']);
    answer = 'ok';
  });

  it('rest and sleep follow energy and day/night activity; pet reaction lasts 1 s', () => {
    let night = false;
    const world = new LivingWorld({ consume: () => 'ok', seed: 'sleep', isNight: () => night });
    world.sync(stateWith([adult('e1', 'emberling', { location: at('origin_meadow') })]));
    const a = world.agents.get('e1')!;
    a.energy = 0.3;
    run(world, 1500);
    expect(a.state).toBe('rest');
    a.energy = 0.1;
    a.state = 'idle';
    run(world, 1500);
    expect(a.state).toBe('sleep');
    a.energy = 0.5;
    a.state = 'idle';
    night = true; // Emberling hoạt động ban ngày
    run(world, 1500);
    expect(a.state).toBe('sleep');
    night = false;
    world.petReact('e1');
    expect(a.state).toBe('pet');
    run(world, PET_MS + STEER_STEP_MS);
    expect(['idle', 'wander', 'rest', 'sleep']).toContain(a.state);
    expect(EAT_MS).toBe(600);
  });

  it('deterministic for a seed and independent of frame rate (fixed 20 Hz steering)', () => {
    const make = () => {
      const w = new LivingWorld({ consume: () => 'ok', seed: 'det' });
      w.sync(stateWith([adult('e1', 'emberling', { location: at('origin_meadow'), personality: 'playful' })]));
      return w;
    };
    const a = make();
    const b = make();
    run(a, 60_000, T0, 10);
    run(b, 60_000, T0, 50);
    const pa: Agent = a.agents.get('e1')!;
    const pb: Agent = b.agents.get('e1')!;
    expect(pa.pos).toEqual(pb.pos);
    expect(pa.state).toBe(pb.state);
  });

  it('layout has the 3 Origin microhabitats side by side', () => {
    expect(ORIGIN_LAYOUT.map((r) => r.habitatId)).toEqual(['origin_meadow', 'origin_warm_rocks', 'origin_pondbank']);
  });
});
