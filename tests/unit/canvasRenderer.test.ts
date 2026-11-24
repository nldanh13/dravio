import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/engine/core/initialState';
import { createRng } from '../../src/engine/core/rng';
import { createAssetAdapter } from '../../src/rendering/assetAdapter';
import { defaultRenderManifest } from '../../src/rendering/assetContract';
import { CanvasRenderer, poseOf, type RenderView, type RendererEnv } from '../../src/rendering/canvasRenderer';
import { LivingWorld } from '../../src/rendering/livingWorld';
import { fitView, toGround, toScreen } from '../../src/rendering/projection';
import type { Vec } from '../../src/rendering/originLayout';
import { adult } from './fixtures';

const T0 = Date.UTC(2026, 10, 25, 9, 0, 0);

class Target extends EventTarget {
  adds = 0;
  removes = 0;
  override addEventListener(...a: Parameters<EventTarget['addEventListener']>) {
    this.adds++;
    super.addEventListener(...a);
  }
  override removeEventListener(...a: Parameters<EventTarget['removeEventListener']>) {
    this.removes++;
    super.removeEventListener(...a);
  }
}

function fakeCtx(): CanvasRenderingContext2D {
  const calls: string[] = [];
  return new Proxy({ calls } as object, {
    get: (t, k) => (k === 'calls' ? calls : (k in t ? (t as Record<string | symbol, unknown>)[k] : () => void calls.push(String(k)))),
    set: (t, k, v) => (((t as Record<string | symbol, unknown>)[k] = v), true),
  }) as CanvasRenderingContext2D;
}

function harness(opts: { dpr?: number; fps?: 30 | 60; unlocked?: string[]; reduced?: boolean } = {}) {
  const canvas = Object.assign(new Target(), { clientWidth: 900, clientHeight: 360, width: 0, height: 0, dataset: {} as Record<string, string>, getContext: () => fakeCtx() });
  const doc = Object.assign(new Target(), { visibilityState: 'visible' as DocumentVisibilityState });
  const queue = new Map<number, FrameRequestCallback>();
  let id = 0;
  const mqlListeners = new Set<unknown>();
  const win = Object.assign(new Target(), {
    devicePixelRatio: opts.dpr ?? 1,
    requestAnimationFrame: (cb: FrameRequestCallback) => (queue.set(++id, cb), id),
    cancelAnimationFrame: (h: number) => void queue.delete(h),
    matchMedia: () => ({ matches: opts.reduced ?? false, addEventListener: (_: string, l: unknown) => mqlListeners.add(l), removeEventListener: (_: string, l: unknown) => mqlListeners.delete(l) }),
  });
  let disconnected = 0;
  class RO {
    constructor(public cb: () => void) {}
    observe() {}
    disconnect() {
      disconnected++;
    }
  }
  const steps: number[] = [];
  const world = new LivingWorld({ consume: () => 'ok', seed: 'r' });
  const step = world.step.bind(world);
  world.step = (dt, now) => {
    steps.push(dt);
    step(dt, now);
  };
  const s = createInitialState({ saveId: 'r', nowMs: T0, rng: createRng(1) });
  world.sync({ ...s, dragons: [adult('e1', 'emberling', { location: { kind: 'zone', zoneId: 'origin', habitatId: 'origin_meadow' } })] });
  const selects: (string | null)[] = [];
  const taps: { h: string; p: Vec }[] = [];
  const view: RenderView = {
    unlockedHabitats: opts.unlocked ?? ['origin_meadow'],
    fpsLimit: opts.fps ?? 60,
    reducedMotionSetting: false,
    selectedUid: null,
    habitatLabel: (h) => h,
    lockedLabel: 'locked',
    placeholderNote: 'note',
  };
  const env = { win, doc, ResizeObserver: RO } as unknown as RendererEnv;
  const r = new CanvasRenderer({
    canvas: canvas as unknown as HTMLCanvasElement,
    world,
    assets: createAssetAdapter(defaultRenderManifest(), async () => ({}) as CanvasImageSource),
    clock: { nowMs: () => T0 },
    getView: () => view,
    onSelect: (u) => selects.push(u),
    onGroundTap: (h, p) => taps.push({ h, p }),
    env,
  });
  const runFrames = (from: number, n: number, every: number) => {
    let ts = from;
    for (let i = 0; i < n; i++) {
      const [k, cb] = [...queue.entries()][0] ?? [];
      if (!cb) break;
      queue.delete(k!);
      cb(ts);
      ts += every;
    }
    return ts;
  };
  const pointer = (type: string, x: number, y: number) => {
    const e = new Event(type) as Event & { offsetX: number; offsetY: number; pointerId: number };
    Object.assign(e, { offsetX: x, offsetY: y, pointerId: 1 });
    canvas.dispatchEvent(e);
  };
  return { r, canvas, doc, win, queue, steps, world, selects, taps, runFrames, pointer, mqlListeners, disconnected: () => disconnected };
}

describe('projection', () => {
  it('toGround inverts toScreen on the ground plane; z lifts on screen', () => {
    const v = fitView(900, 360);
    for (const p of [{ x: 0, y: 0 }, { x: 600, y: 260 }, { x: 1199, y: 519 }]) {
      const g = toGround(v, toScreen(v, p));
      expect(g.x).toBeCloseTo(p.x, 6);
      expect(g.y).toBeCloseTo(p.y, 6);
    }
    expect(toScreen(v, { x: 10, y: 10 }, 50).y).toBeLessThan(toScreen(v, { x: 10, y: 10 }).y);
  });
});

describe('CanvasRenderer', () => {
  it('backing store = CSS size × DPR capped at 2', () => {
    const h = harness({ dpr: 3 });
    expect([h.canvas.width, h.canvas.height]).toEqual([1800, 720]);
    expect(h.r.stats().dpr).toBe(2);
    const h1 = harness({ dpr: 1.5 });
    expect(h1.canvas.width).toBe(1350);
  });

  it('render loop steps the world with dt clamped to 100 ms, separate from any economy tick', () => {
    const h = harness();
    h.r.start();
    const ts = h.runFrames(1000, 10, 1000 / 60);
    h.runFrames(ts + 5000, 2, 16); // khung bị trễ 5 s (GC, debugger) → dt chặn 100 ms
    expect(h.steps[0]).toBe(0);
    expect(Math.max(...h.steps)).toBe(100);
    expect(h.steps.slice(1, 10).every((d) => Math.abs(d - 1000 / 60) < 0.01)).toBe(true);
    expect(h.r.stats().frames).toBe(12);
  });

  it('fpsLimit 30 draws about half of 60 Hz animation frames', () => {
    const h = harness({ fps: 30 });
    h.r.start();
    h.runFrames(0, 120, 1000 / 60);
    expect(h.r.stats().frames).toBeGreaterThanOrEqual(58);
    expect(h.r.stats().frames).toBeLessThanOrEqual(62);
  });

  it('stops when the tab is hidden and resumes without catching up', () => {
    const h = harness();
    h.r.start();
    h.runFrames(0, 5, 16);
    h.doc.visibilityState = 'hidden';
    h.doc.dispatchEvent(new Event('visibilitychange'));
    expect(h.queue.size).toBe(0);
    expect(h.r.stats().running).toBe(false);
    const before = h.steps.length;
    h.doc.visibilityState = 'visible';
    h.doc.dispatchEvent(new Event('visibilitychange'));
    h.runFrames(60_000, 2, 16);
    expect(h.steps.slice(before)).toEqual([0, 16]);
  });

  it('dispose removes every listener, observer and pending frame', () => {
    const h = harness();
    h.r.start();
    h.runFrames(0, 3, 16);
    h.r.dispose();
    expect(h.queue.size).toBe(0);
    expect(h.doc.removes).toBe(h.doc.adds);
    expect(h.win.removes).toBe(h.win.adds);
    expect(h.canvas.removes).toBe(h.canvas.adds);
    expect(h.mqlListeners.size).toBe(0);
    expect(h.disconnected()).toBe(1);
    h.r.start();
    expect(h.queue.size).toBe(0);
  });

  it('tap selects the dragon under the pointer; tap on open ground drops food; locked ground and drags do nothing', () => {
    const h = harness();
    const a = h.world.agents.get('e1')!;
    const b = h.r.bounds(a);
    h.pointer('pointerdown', b.x + b.w / 2, b.y + b.h / 2);
    h.pointer('pointerup', b.x + b.w / 2, b.y + b.h / 2);
    expect(h.selects).toEqual(['e1']);

    const v = fitView(900, 360);
    const meadow = toScreen(v, { x: 100, y: 480 });
    h.pointer('pointerdown', meadow.x, meadow.y);
    h.pointer('pointerup', meadow.x, meadow.y);
    expect(h.taps).toHaveLength(1);
    expect(h.taps[0]!.h).toBe('origin_meadow');
    expect(h.taps[0]!.p.x).toBeCloseTo(100, 3);

    const rocks = toScreen(v, { x: 660, y: 480 });
    h.pointer('pointerdown', rocks.x, rocks.y);
    h.pointer('pointerup', rocks.x, rocks.y);
    expect(h.taps).toHaveLength(1);
    expect(h.selects.at(-1)).toBeNull();

    h.pointer('pointerdown', meadow.x, meadow.y);
    h.pointer('pointerup', meadow.x + 40, meadow.y);
    expect(h.taps).toHaveLength(1);
  });

  it('reduced motion removes decorative motion but keeps state poses', () => {
    const walking = { state: 'wander' as const, phase: 0.5, vel: { x: 50, y: 0 }, airborne: false, stateUntil: 0 };
    expect(poseOf(walking, false).lift).toBeGreaterThan(0);
    expect(poseOf(walking, true)).toEqual({ sx: 1, sy: 1, lift: 0, tilt: 0 });
    expect(poseOf({ ...walking, state: 'sleep' }, true).sy).toBeLessThan(1);
    expect(poseOf({ ...walking, state: 'pet', phase: 0.3 }, true).lift).toBe(0);
    const h = harness({ reduced: true });
    expect(h.r.reducedMotion).toBe(true);
  });
});
