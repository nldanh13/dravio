import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/engine/core/initialState';
import { createRng } from '../../src/engine/core/rng';
import { createAssetAdapter } from '../../src/rendering/assetAdapter';
import { defaultRenderManifest, validateRenderManifest } from '../../src/rendering/assetContract';
import {
  BODY_RADIUS,
  EAT_MS,
  LivingWorld,
  PET_MS,
  PRACTICE_FLIGHT_COOLDOWN_MS,
  STEER_STEP_MS,
  blockingObstacles,
  blocksWater,
  clipSpeed,
  flightAltitude,
  type Agent,
} from '../../src/rendering/livingWorld';
import { EDGE_MARGIN, ORIGIN_LAYOUT, inWater, obstacleDistance, regionOf } from '../../src/rendering/originLayout';
import { DRAGON_SCENE_SCALE, HABITAT_OFFSET_X, ORIGIN_HABITATS } from '../../src/assets/habitats/origin/manifest';
import { resolveDragonClip } from '../../src/assets/animations/dragonAnimations';
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
  it('default manifest has the 48 Common sprites: 4 species × 3 stages × 4 variants, bundled URLs, feet anchor (120, 170)', () => {
    const m = defaultRenderManifest();
    expect(validateRenderManifest(m)).toEqual([]);
    expect(Object.keys(m.dragons).sort()).toEqual(['droplet', 'emberling', 'sprout', 'zephyr']);
    for (const sp of Object.values(m.dragons)) {
      expect(Object.keys(sp).sort()).toEqual(['adult', 'baby', 'juvenile']);
      for (const st of Object.values(sp)) {
        expect(Object.keys(st!).sort()).toEqual(['crystal', 'golden', 'normal', 'prismatic']);
        for (const a of Object.values(st!)) expect([a!.anchorX, a!.anchorY, a!.stageScaled]).toEqual([120, 170, true]);
      }
    }
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
    expect(adapter.loadedCount).toBe(47);
    expect(adapter.failed).toEqual([bad]);
    expect(adapter.dragon('emberling', 'adult', 'crystal')?.asset.url).toBe(m.dragons.emberling!.adult!.crystal!.url);
    expect(adapter.dragon('emberling', 'baby', 'golden')).toBeNull();
    expect(adapter.dragon('sprout', 'adult', 'normal')).not.toBeNull();
    expect(adapter.dragon('gaia', 'adult', 'normal')).toBeNull();
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
    world.sync(
      stateWith([
        adult('e1', 'emberling', { location: at('origin_warm_rocks'), personality: 'playful' }),
        adult('m1', 'emberling', { location: at('origin_meadow'), personality: 'curious' }),
        adult('s1', 'sprout', { location: at('origin_pondbank'), personality: 'playful' }),
      ]),
    );
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
        for (const o of r.obstacles) expect(obstacleDistance(o, a.pos, BODY_RADIUS * 0.5)).toBeGreaterThanOrEqual(1 - 1e-6);
      }
    });
    // Rồng không biết bơi ở bờ hồ không bao giờ xuống nước.
    const pond = regionOf('origin_pondbank')!;
    expect(inWater(pond, world.agents.get('s1')!.pos)).toBe(false);
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
    expect(blocksWater(walker)).toBe(true);
    expect(blocksWater({ ...walker, mobility: { walk: true, swim: true, fly: false } })).toBe(false);
    expect(blocksWater({ ...walker, airborne: true })).toBe(false);
    expect(blockingObstacles(walker, pond).length).toBeGreaterThan(0);
    expect(blockingObstacles({ ...walker, airborne: true }, pond)).toEqual([]);
  });

  it('food drop → move to food → consumeFood exactly once with the right ids → eat animation; no direct XP', () => {
    const calls: [string, string][] = [];
    const world = new LivingWorld({ consume: (f, d) => (calls.push([f, d]), 'ok'), seed: 'food' });
    const ember = adult('e1', 'emberling', { location: at('origin_meadow') });
    world.sync(stateWith([ember]));
    const M = HABITAT_OFFSET_X.origin_meadow;
    void M;
    const e = world.agents.get('e1')!.pos;
    const dropAt = { x: e.x + (e.x > M + 480 ? -260 : 260), y: 470 };
    world.noteDrop('origin_meadow', dropAt);
    const drop = { id: 'food-1', dietId: 'fruit' as const, zoneId: 'origin', habitatId: 'origin_meadow', spawnedAtMs: T0, expiresAtMs: T0 + 12_000 };
    const s = deepFreeze(stateWith([ember], [drop]));
    world.sync(s);
    expect(world.food.get('food-1')?.pos).toEqual(dropAt);
    let sawEat = false;
    run(world, 12_000, T0 + 100, 16, (w) => {
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

  it('layout matches the habitat art: west → east, water = pond art, solid props block, flat props do not (ADR 0012)', () => {
    expect(ORIGIN_LAYOUT.map((r) => r.habitatId)).toEqual(['origin_pondbank', 'origin_meadow', 'origin_warm_rocks']);
    for (const r of ORIGIN_LAYOUT) {
      const art = ORIGIN_HABITATS[r.habitatId as keyof typeof ORIGIN_HABITATS];
      expect(r.x0).toBe(HABITAT_OFFSET_X[art.id]);
      expect(r.x1 - r.x0).toBe(960);
      expect(r.y0).toBeGreaterThan(300);
      expect(r.y1).toBeLessThanOrEqual(540);
      // Vật cản rắn đặt đúng chân vật thể; vật thể phẳng (thảm, lá súng, phiến đá) không chặn.
      const standing = art.props.filter((p) => !['flower_patch', 'moss_bed', 'lily_pads', 'mud_wallow', 'flat_warm_stone', 'warm_vent'].includes(p.prop));
      expect(r.obstacles).toHaveLength(standing.length);
      for (const p of standing) expect(r.obstacles.some((o) => Math.abs(o.x - (r.x0 + p.x)) < 1 && Math.abs(o.y - p.y) < 3)).toBe(true);
      // Spot mặt đất (rest/feed/drink…) đứng được cho loài phù hợp; spot nằm trong region.
      for (const sp of art.spots.filter((x) => !x.elevated)) {
        expect(sp.x + r.x0).toBeGreaterThanOrEqual(r.x0);
        expect(sp.y).toBeLessThanOrEqual(r.y1);
      }
    }
    const pond = regionOf('origin_pondbank')!;
    expect(pond.water).toEqual(ORIGIN_HABITATS.origin_pondbank.water!.map(([x, y]) => [x + pond.x0, y]));
    expect(regionOf('origin_meadow')!.water).toBeNull();
    expect(inWater(pond, { x: pond.x0 + 470, y: 400 })).toBe(true);
    expect(inWater(pond, { x: pond.x0 + 470, y: 500 })).toBe(false);
  });

  it('movement speed matches clip stride (no foot sliding) and scales with stage', () => {
    for (const sp of ['emberling', 'droplet', 'sprout', 'zephyr'] as const) {
      const walk = resolveDragonClip(sp, 'walk')!;
      const v = clipSpeed(sp, 'adult', 'walk');
      const cycleMs = ((walk.stridePx! * DRAGON_SCENE_SCALE) / v) * 1000;
      expect(cycleMs).toBeGreaterThanOrEqual(0.8 * walk.durationMs * 0.99);
      expect(cycleMs).toBeLessThanOrEqual(1200);
      expect(clipSpeed(sp, 'baby', 'walk')).toBeCloseTo(v * 0.68, 6);
    }
  });

  it('flight altitude is 18/40/56 viewBox px × scene scale, never multiplied by stageScale again', () => {
    expect(flightAltitude('zephyr', 'baby')).toBeCloseTo(18 * DRAGON_SCENE_SCALE, 9);
    expect(flightAltitude('zephyr', 'juvenile')).toBeCloseTo(40 * DRAGON_SCENE_SCALE, 9);
    expect(flightAltitude('zephyr', 'adult')).toBeCloseTo(56 * DRAGON_SCENE_SCALE, 9);
    expect(flightAltitude('emberling', 'adult')).toBe(0);
    const world = new LivingWorld({ consume: () => 'ok', seed: 'alt' });
    world.sync(stateWith([adult('z1', 'zephyr', { location: at('origin_meadow'), personality: 'playful' })]));
    let maxZ = 0;
    run(world, 300_000, T0, 33, (w) => (maxZ = Math.max(maxZ, w.agents.get('z1')!.z)));
    expect(maxZ).toBeGreaterThan(flightAltitude('zephyr', 'adult') * 0.95);
    expect(maxZ).toBeLessThanOrEqual(flightAltitude('zephyr', 'adult') + 1e-9);
  });

  it('Zephyr Baby only practises 1–2 s flights in its habitat, then lands; never flies when health-restricted', () => {
    let restricted = false;
    const world = new LivingWorld({ consume: () => 'ok', seed: 'baby', healthRestricted: () => restricted });
    const baby = adult('zb', 'zephyr', { location: at('origin_meadow'), personality: 'playful', xpSec: 0 });
    world.sync(stateWith([baby]));
    const a = world.agents.get('zb')!;
    expect(a.stage).toBe('baby');
    const flights: { start: number; end: number }[] = [];
    let flying: number | null = null;
    run(world, 600_000, T0, 20, (w) => {
      const z = w.agents.get('zb')!;
      expect(z.habitatId).toBe('origin_meadow');
      if (z.airborne && flying === null) flying = w.timeMs;
      if (!z.airborne && flying !== null) {
        flights.push({ start: flying, end: w.timeMs });
        flying = null;
      }
      expect(z.z).toBeLessThanOrEqual(flightAltitude('zephyr', 'baby') + 1e-9);
    });
    expect(flights.length).toBeGreaterThan(2);
    for (const f of flights) expect(f.end - f.start).toBeLessThanOrEqual(2000 + STEER_STEP_MS);
    for (let i = 1; i < flights.length; i++) expect(flights[i]!.start - flights[i - 1]!.end).toBeGreaterThanOrEqual(PRACTICE_FLIGHT_COOLDOWN_MS - 2000);
    // Hạn chế sức khỏe: không cất cánh.
    restricted = true;
    const r2 = new LivingWorld({ consume: () => 'ok', seed: 'baby', healthRestricted: () => restricted });
    r2.sync(stateWith([baby]));
    run(r2, 300_000, T0, 33, (w) => expect(w.agents.get('zb')!.airborne).toBe(false));
  });

  it('landing descends continuously from the current altitude to the ground', () => {
    const world = new LivingWorld({ consume: () => 'ok', seed: 'land' });
    world.sync(stateWith([adult('z1', 'zephyr', { location: at('origin_meadow'), personality: 'playful' })]));
    let prevZ = 0;
    let landings = 0;
    let wasLanding = false;
    run(world, 300_000, T0, 16, (w) => {
      const z = w.agents.get('z1')!;
      if (z.landing) {
        if (!wasLanding) landings++;
        else {
          expect(z.z).toBeLessThanOrEqual(prevZ + 1e-9);
          expect(prevZ - z.z).toBeLessThan(flightAltitude('zephyr', 'adult') * 0.35);
        }
        expect(z.anim.state).toBe('landing');
      }
      wasLanding = !!z.landing;
      prevZ = z.z;
    });
    expect(landings).toBeGreaterThan(0);
  });

  it('animation state follows behaviour and anatomy: walk / swim / fly / eat / sleep / pet; walkers never get swim or fly', () => {
    const world = new LivingWorld({ consume: () => 'ok', seed: 'anim' });
    world.sync(
      stateWith([
        adult('e1', 'emberling', { location: at('origin_meadow'), personality: 'playful' }),
        adult('d1', 'droplet', { location: at('origin_pondbank'), personality: 'playful' }),
        adult('z1', 'zephyr', { location: at('origin_meadow'), personality: 'playful' }),
      ]),
    );
    const seen: Record<string, Set<string>> = { e1: new Set(), d1: new Set(), z1: new Set() };
    run(world, 600_000, T0, 33, (w) => {
      for (const a of w.agents.values()) seen[a.uid]!.add(a.anim.state);
    });
    expect([...seen.e1!]).not.toContain('fly');
    expect([...seen.e1!]).not.toContain('swim');
    expect(seen.e1!.has('walk')).toBe(true);
    expect(seen.d1!.has('swim')).toBe(true);
    expect(seen.d1!.has('fly')).toBe(false);
    expect(seen.z1!.has('fly')).toBe(true);
    expect(seen.z1!.has('landing')).toBe(true);
    world.petReact('e1');
    run(world, 100);
    expect(world.agents.get('e1')!.anim.state).toBe('pet');
    world.setCare('e1', 'injured');
    run(world, 100);
    expect(world.agents.get('e1')!.anim.state).toBe('injured');
    world.setCare('e1', 'recovery');
    run(world, 100);
    expect(world.agents.get('e1')!.anim.state).toBe('recovery');
    run(world, 2000);
    expect(world.agents.get('e1')!.care).toBeNull();
  });
});
