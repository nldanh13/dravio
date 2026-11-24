import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/engine/core/initialState';
import { createRng } from '../../src/engine/core/rng';
import { createImageCache } from '../../src/rendering/assetAdapter';
import { CanvasRenderer, MAX_PARTICLES, TRANSITION_MS, particleMotion, type RenderView, type RendererEnv } from '../../src/rendering/canvasRenderer';
import { cuesCrossed, dragonVisual, phaseOf, strideScene } from '../../src/rendering/dragonVisual';
import { LivingWorld } from '../../src/rendering/livingWorld';
import { fitView, inSceneBox, toGround, toScreen } from '../../src/rendering/projection';
import { FOCUS_ZOOM, OVERVIEW, ZOOM_MAX, ZOOM_MIN, clampCamera, focusOn, panBy, sceneBox, screenToLocal, zoomAround } from '../../src/rendering/camera';
import { regionOf, type Vec } from '../../src/rendering/originLayout';
import { resolveDragonClip } from '../../src/assets/animations/dragonAnimations';
import { DRAGON_SCENE_SCALE } from '../../src/assets/habitats/origin/manifest';
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

function harness(opts: { dpr?: number; fps?: 30 | 60; unlocked?: string[]; reduced?: boolean; reducedSetting?: boolean } = {}) {
  const canvas = Object.assign(new Target(), { clientWidth: 960, clientHeight: 540, width: 0, height: 0, dataset: {} as Record<string, string>, getContext: () => fakeCtx() });
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
    reducedMotionSetting: opts.reducedSetting ?? false,
    selectedUid: null,
    habitatId: 'origin_meadow',
    timeOfDay: 'day',
    lockedLabel: 'locked',
    lockedHint: () => null,
  };
  const loads: string[] = [];
  const images = createImageCache(async (u) => (loads.push(u), {} as CanvasImageSource), { idleMs: 1000 });
  const env = { win, doc, ResizeObserver: RO } as unknown as RendererEnv;
  const r = new CanvasRenderer({
    canvas: canvas as unknown as HTMLCanvasElement,
    world,
    images,
    clock: { nowMs: () => T0 },
    getView: () => view,
    onSelect: (u) => selects.push(u),
    onGroundTap: (h, p) => taps.push({ h, p }),
    onCamera: (c) => cams.push(c),
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
  const pointer = (type: string, x: number, y: number, pointerId = 1) => {
    const e = new Event(type) as Event & { offsetX: number; offsetY: number; pointerId: number };
    Object.assign(e, { offsetX: x, offsetY: y, pointerId });
    canvas.dispatchEvent(e);
  };
  const wheel = (x: number, y: number, deltaY: number, ctrlKey: boolean) => {
    const e = new Event('wheel') as Event & { offsetX: number; offsetY: number; deltaY: number; ctrlKey: boolean };
    Object.assign(e, { offsetX: x, offsetY: y, deltaY, ctrlKey });
    canvas.dispatchEvent(e);
  };
  const cams: { mode: string; zoom: number }[] = [];
  return { r, canvas, doc, win, queue, steps, world, selects, taps, runFrames, pointer, wheel, cams, mqlListeners, view, images, loads, disconnected: () => disconnected };
}

describe('projection', () => {
  it('toGround inverts toScreen on the ground plane; z lifts on screen; 16:9 letterbox', () => {
    const v = fitView(900, 360, 960);
    expect(v.k).toBeCloseTo(360 / 540, 9);
    expect(v.ox).toBeGreaterThan(0);
    for (const p of [{ x: 960, y: 330 }, { x: 1500, y: 450 }, { x: 1919, y: 539 }]) {
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
    expect([h.canvas.width, h.canvas.height]).toEqual([1920, 1080]);
    expect(h.r.stats().dpr).toBe(2);
    const h1 = harness({ dpr: 1.5 });
    expect(h1.canvas.width).toBe(1440);
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

  it('tap selects the dragon under the pointer; tap on open ground of the shown habitat drops food; locked ground and drags do nothing', () => {
    const h = harness();
    const a = h.world.agents.get('e1')!;
    const b = h.r.bounds(a);
    h.pointer('pointerdown', b.x + b.w / 2, b.y + b.h / 2);
    h.pointer('pointerup', b.x + b.w / 2, b.y + b.h / 2);
    expect(h.selects).toEqual(['e1']);

    const v = fitView(960, 540, regionOf('origin_meadow')!.sceneX);
    // Chỗ trống trên mặt đất (xa rồng).
    const groundPt = { x: a.pos.x > 1440 ? 1000 : 1880, y: 520 };
    const s = toScreen(v, groundPt);
    h.pointer('pointerdown', s.x, s.y);
    h.pointer('pointerup', s.x, s.y);
    expect(h.taps).toHaveLength(1);
    expect(h.taps[0]!.h).toBe('origin_meadow');
    expect(h.taps[0]!.p.x).toBeCloseTo(groundPt.x, 3);
    expect(h.taps[0]!.p.y).toBeCloseTo(groundPt.y, 3);

    // Trời (trên vùng đi) không thả thức ăn.
    const sky = toScreen(v, { x: 1400, y: 100 });
    h.pointer('pointerdown', sky.x, sky.y);
    h.pointer('pointerup', sky.x, sky.y);
    expect(h.taps).toHaveLength(1);
    expect(h.selects.at(-1)).toBeNull();

    // Kéo không phải chạm.
    h.pointer('pointerdown', s.x, s.y);
    h.pointer('pointerup', s.x + 40, s.y);
    expect(h.taps).toHaveLength(1);

    // Chuyển sang đá ấm (chưa mở): chạm mặt đất không thả thức ăn.
    h.view.habitatId = 'origin_warm_rocks';
    h.r.start();
    h.runFrames(0, 2, 16);
    const rv = fitView(960, 540, regionOf('origin_warm_rocks')!.sceneX);
    const rocks = toScreen(rv, { x: 1920 + 600, y: 500 });
    h.pointer('pointerdown', rocks.x, rocks.y);
    h.pointer('pointerup', rocks.x, rocks.y);
    expect(h.taps).toHaveLength(1);
  });

  it('navigation slides the camera between habitats in TRANSITION_MS; reduced motion switches instantly', () => {
    const h = harness();
    h.r.start();
    let ts = h.runFrames(0, 2, 16);
    const a = h.world.agents.get('e1')!;
    const b = h.r.bounds(a);
    const center = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    expect(h.r.pick(center)?.uid).toBe('e1');
    h.view.habitatId = 'origin_pondbank';
    ts = h.runFrames(ts, 3, 16);
    expect(h.r.habitat).toBe('origin_pondbank');
    h.runFrames(ts, Math.ceil(TRANSITION_MS / 16) + 3, 16);
    // Rồng ở đồng cỏ không còn được chọn khi đang xem bờ hồ; khung chạm đã trượt khỏi chỗ cũ.
    expect(h.r.pick(center)).toBeNull();
    expect(h.r.bounds(a).x).toBeGreaterThan(b.x + 900);
    const r2 = harness({ reducedSetting: true });
    r2.r.start();
    r2.runFrames(0, 2, 16);
    r2.view.habitatId = 'origin_warm_rocks';
    r2.runFrames(100, 1, 16);
    expect(r2.r.habitat).toBe('origin_warm_rocks');
  });

  it('loads images on demand (habitat + dragon frames of what is on screen) and releases idle ones', async () => {
    const h = harness({ unlocked: ['origin_meadow', 'origin_pondbank', 'origin_warm_rocks'] });
    h.r.start();
    h.runFrames(0, 3, 16);
    await h.images.settle();
    const firstLoads = h.loads.length;
    expect(h.loads.some((u) => u.includes('origin_meadow/ground'))).toBe(true);
    expect(h.loads.some((u) => u.includes('frames/emberling/adult_normal_idle'))).toBe(true);
    // Không tải cảnh chưa xem, không tải khung loài không có mặt.
    expect(h.loads.some((u) => u.includes('origin_warm_rocks/'))).toBe(false);
    expect(h.loads.some((u) => u.includes('frames/zephyr/'))).toBe(false);
    expect(h.loads.length).toBeLessThan(80);
    expect(new Set(h.loads).size).toBe(h.loads.length);
    // Rời đồng cỏ: sau idleMs + chu kỳ quét, ảnh đồng cỏ được giải phóng.
    h.view.habitatId = 'origin_warm_rocks';
    h.runFrames(100, 400, 33);
    await h.images.settle();
    const st = h.r.stats().images;
    expect(st.released).toBeGreaterThan(0);
    expect(h.loads.length).toBeGreaterThan(firstLoads);
    expect(h.images.has(h.loads.find((u) => u.includes('origin_meadow/ground'))!)).toBe(false);
  });

  it('particles are capped and disabled under reduced motion', () => {
    const h = harness({ unlocked: ['origin_meadow'] });
    h.r.start();
    h.runFrames(0, 1500, 33);
    expect(h.r.stats().particles).toBeLessThanOrEqual(MAX_PARTICLES);
    expect(h.r.stats().particles).toBeGreaterThan(0);
    const q = harness({ reduced: true });
    q.r.start();
    q.runFrames(0, 600, 33);
    expect(q.r.stats().particles).toBe(0);
  });

  it('reduced motion freezes flipbook and track but keeps the state pose', () => {
    const h = harness();
    const a = h.world.agents.get('e1')!;
    a.anim = { state: 'walk', since: 0, dist: 7 };
    const moving = dragonVisual(a, 500, false)!;
    const still = dragonVisual(a, 500, true)!;
    expect(still.t).toBe(0);
    expect([still.dx, still.dy, still.sx, still.sy, still.rot]).toEqual([0, 0, 1, 1, 0]);
    expect(moving.t).toBeGreaterThan(0);
    a.anim = { state: 'sleep', since: 0, dist: 0 };
    expect(dragonVisual(a, 900, true)!.pose).toBe('blink'); // Emberling: sleep → blink (fallback)
    const r = harness({ reduced: true });
    expect(r.r.reducedMotion).toBe(true);
  });
});

describe('dragon visual (clip → frame → transform)', () => {
  it('stage scale is applied once: frames are pre-scaled, track dx/dy × stageScale × scene scale', () => {
    const h = harness();
    const a = h.world.agents.get('e1')!;
    a.anim = { state: 'happy', since: 0, dist: 0 };
    const clip = resolveDragonClip('emberling', 'happy')!;
    const t = 0.4;
    const v = dragonVisual(a, t * clip.durationMs, false)!;
    expect(v.dy).toBeCloseTo(-14 * 1 * DRAGON_SCENE_SCALE, 6);
    a.stage = 'baby';
    const vb = dragonVisual(a, t * clip.durationMs, false)!;
    expect(vb.dy).toBeCloseTo(-14 * 0.68 * DRAGON_SCENE_SCALE, 6);
    expect(vb.frame?.url).toContain('baby_normal_happy');
  });

  it('walk/swim phase follows distance (no foot sliding); idle blinks on schedule', () => {
    const h = harness();
    const a = h.world.agents.get('e1')!;
    const walk = resolveDragonClip('emberling', 'walk')!;
    const stride = strideScene(walk, a.stage);
    a.anim = { state: 'walk', since: 0, dist: stride * 0.5 };
    expect(phaseOf(a, walk, 99999)).toBeCloseTo(0.5, 9);
    a.anim = { state: 'idle', since: 0, dist: 0 };
    a.blinkUntil = 1000;
    expect(dragonVisual(a, 900, false)!.pose).toBe('blink');
    expect(dragonVisual(a, 1100, false)!.pose).toBe('idle');
  });

  it('FX cues fire once per crossing, including across loop wrap', () => {
    const sleep = resolveDragonClip('droplet', 'sleep')!;
    expect(cuesCrossed(sleep, null, 0).map((c) => c.fx)).toEqual(['zzz']);
    const walk = resolveDragonClip('droplet', 'walk')!;
    expect(cuesCrossed(walk, 0.4, 0.6).map((c) => c.fx)).toEqual(['dust']);
    expect(cuesCrossed(walk, 0.6, 0.9)).toEqual([]);
    expect(cuesCrossed(walk, 0.9, 0.55).map((c) => c.fx)).toEqual(['dust']);
    expect(particleMotion({ motion: 'rise-fade', travel: { x: 0, y: -20 }, seed: 0 }, 1).alpha).toBe(0);
    expect(particleMotion({ motion: 'static', travel: { x: 0, y: 0 }, seed: 0 }, 0.5)).toEqual({ dx: 0, dy: 0, alpha: 1, scale: 1, scaleY: 1 });
  });
});

describe('camera: overview / focus / zoom / pinch / pan (ADR 0012)', () => {
  const box = sceneBox(960, 540);
  it('camera never leaves the habitat and zoom stays within 1–2.5×', () => {
    for (const c of [
      { ...OVERVIEW, zoom: 9, fx: -500, fy: 9999 },
      { ...OVERVIEW, zoom: 0.2, fx: 480, fy: 270 },
      { ...OVERVIEW, mode: 'free' as const, zoom: 2, fx: 0, fy: 0 },
      { ...OVERVIEW, zoom: Number.NaN, fx: Number.NaN, fy: 10 },
    ]) {
      const k = clampCamera(c);
      expect(k.zoom).toBeGreaterThanOrEqual(ZOOM_MIN);
      expect(k.zoom).toBeLessThanOrEqual(ZOOM_MAX);
      expect(k.fx - 480 / k.zoom).toBeGreaterThanOrEqual(-1e-9);
      expect(k.fx + 480 / k.zoom).toBeLessThanOrEqual(960 + 1e-9);
      expect(k.fy - 270 / k.zoom).toBeGreaterThanOrEqual(-1e-9);
      expect(k.fy + 270 / k.zoom).toBeLessThanOrEqual(540 + 1e-9);
    }
  });

  it('screen ↔ world mapping is exact at any zoom; zooming keeps the point under the cursor', () => {
    const cam = clampCamera({ mode: 'free', zoom: 2.2, fx: 700, fy: 400, followUid: null });
    const v = fitView(960, 540, 960, cam);
    for (const p of [{ x: 1600, y: 380 }, { x: 1500, y: 500 }]) {
      const g = toGround(v, toScreen(v, p));
      expect(g.x).toBeCloseTo(p.x, 9);
      expect(g.y).toBeCloseTo(p.y, 9);
    }
    const s = { x: 300, y: 350 };
    const before = screenToLocal(box, OVERVIEW, s);
    const z = zoomAround(box, OVERVIEW, 2, s);
    const after = screenToLocal(box, z, s);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(zoomAround(box, z, 1, s)).toEqual(OVERVIEW);
  });

  it('pan does nothing at 1×; panning while following switches to free', () => {
    expect(panBy(box, OVERVIEW, 100, 50)).toBe(OVERVIEW);
    const f = focusOn(OVERVIEW, 'e1', { x: 500, y: 450 });
    expect(f.mode).toBe('focus');
    expect(f.zoom).toBe(FOCUS_ZOOM);
    const p = panBy(box, f, 40, 0);
    expect(p.mode).toBe('free');
    expect(p.followUid).toBeNull();
    expect(p.fx).toBeLessThan(f.fx);
  });

  it('pinch zooms around the fingers and never drops food; selecting a dragon never auto-zooms', () => {
    const h = harness();
    const a = h.world.agents.get('e1')!;
    const b = h.r.bounds(a);
    h.pointer('pointerdown', b.x + b.w / 2, b.y + b.h / 2);
    h.pointer('pointerup', b.x + b.w / 2, b.y + b.h / 2);
    expect(h.selects).toEqual(['e1']);
    expect(h.r.camera.zoom).toBe(1);
    expect(h.cams).toEqual([]);
    // Chụm: 2 ngón quanh (400, 420), giãn khoảng cách 100 → 200.
    const local0 = screenToLocal(box, h.r.camera, { x: 400, y: 420 });
    h.pointer('pointerdown', 350, 420, 1);
    h.pointer('pointerdown', 450, 420, 2);
    h.pointer('pointermove', 300, 420, 1);
    h.pointer('pointermove', 500, 420, 2);
    h.pointer('pointerup', 300, 420, 1);
    h.pointer('pointerup', 500, 420, 2);
    expect(h.r.camera.zoom).toBeCloseTo(2, 6);
    expect(h.r.camera.mode).toBe('free');
    const after = screenToLocal(box, h.r.camera, { x: 400, y: 420 });
    expect(after.x).toBeCloseTo(local0.x, 6);
    expect(after.y).toBeCloseTo(local0.y, 6);
    expect(h.taps).toEqual([]);
    expect(h.cams.at(-1)).toEqual({ mode: 'free', zoom: h.r.camera.zoom });
  });

  it('drag pans only when zoomed and never drops food; a tap while zoomed drops at the exact world point', () => {
    const h = harness();
    // Kéo ở 1×: không gì xảy ra.
    h.pointer('pointerdown', 100, 500);
    h.pointer('pointermove', 180, 500);
    h.pointer('pointerup', 180, 500);
    expect(h.taps).toEqual([]);
    expect(h.r.camera.zoom).toBe(1);
    h.r.zoomAt({ x: 800, y: 500 }, 2.5);
    const fx0 = h.r.camera.fx;
    h.pointer('pointerdown', 400, 400);
    h.pointer('pointermove', 360, 400);
    h.pointer('pointermove', 300, 400);
    h.pointer('pointerup', 300, 400);
    expect(h.taps).toEqual([]);
    expect(h.r.camera.fx).toBeGreaterThan(fx0);
    // Chạm khi zoom: toạ độ thế giới đúng dưới ngón tay.
    const meadow = regionOf('origin_meadow')!;
    const v = fitView(960, 540, meadow.sceneX, h.r.camera);
    const a = h.world.agents.get('e1')!;
    // Điểm thế giới trong vùng đi và đang hiển thị (góc dưới của khung zoom), xa rồng.
    const visLeft = toGround(v, { x: 40, y: 0 }).x;
    const visRight = toGround(v, { x: 920, y: 0 }).x;
    const target = { x: Math.abs(a.pos.x - visLeft - 40) > 90 ? visLeft + 40 : visRight - 40, y: Math.min(meadow.y1 - 10, toGround(v, { x: 0, y: 520 }).y) };
    expect(target.y).toBeGreaterThanOrEqual(meadow.y0);
    const pt = toScreen(v, target);
    h.pointer('pointerdown', pt.x, pt.y);
    h.pointer('pointerup', pt.x, pt.y);
    expect(h.taps).toHaveLength(1);
    expect(h.taps[0]!.p.x).toBeCloseTo(target.x, 6);
    expect(h.taps[0]!.p.y).toBeCloseTo(target.y, 6);
    // Hitbox khi zoom: chạm tâm rồng vẫn chọn đúng.
    h.r.focus('e1');
    const bb = h.r.bounds(a);
    expect(bb.w).toBeGreaterThan(100);
    h.pointer('pointerdown', bb.x + bb.w / 2, bb.y + bb.h / 2);
    h.pointer('pointerup', bb.x + bb.w / 2, bb.y + bb.h / 2);
    expect(h.selects.at(-1)).toBe('e1');
    // Ctrl + lăn chuột zoom; lăn thường không.
    h.r.overview();
    h.wheel(400, 300, 100, false);
    expect(h.r.camera.zoom).toBe(1);
    h.wheel(400, 300, -100, true);
    expect(h.r.camera.zoom).toBeGreaterThan(1);
  });

  it('focus follows the selected dragon, stays inside the habitat and returns to overview when leaving it', () => {
    const h = harness({ unlocked: ['origin_meadow', 'origin_pondbank'] });
    h.r.start();
    let ts = h.runFrames(0, 2, 16);
    expect(h.r.focus('e1')).toBe(true);
    expect(h.r.camera).toMatchObject({ mode: 'focus', zoom: FOCUS_ZOOM, followUid: 'e1' });
    const a = h.world.agents.get('e1')!;
    for (let i = 0; i < 50; i++) {
      ts = h.runFrames(ts, 20, 50);
      const c = h.r.camera;
      const local = { x: a.pos.x - regionOf('origin_meadow')!.sceneX, y: a.pos.y };
      const clamped = clampCamera({ ...c, fx: local.x, fy: local.y - 45 });
      expect(c.fx).toBeCloseTo(clamped.fx, 1);
      expect(c.fx - 480 / c.zoom).toBeGreaterThanOrEqual(-1e-9);
    }
    // Camera chỉ đổi cách nhìn: không đổi vị trí rồng.
    const posBefore = { ...a.pos };
    h.r.zoomAt(null, 2.5);
    expect(a.pos).toEqual(posBefore);
    h.view.habitatId = 'origin_pondbank';
    h.runFrames(ts, 3, 16);
    expect(h.r.camera).toEqual(OVERVIEW);
    expect(h.r.focus('e1')).toBe(false);
  });

  it('taps in the letterbox outside the scene do nothing', () => {
    const h = harness();
    const v = fitView(960, 540);
    expect(inSceneBox(v, { x: 10, y: 10 })).toBe(true);
    h.canvas.clientWidth = 1200;
    h.r.resize();
    h.pointer('pointerdown', 20, 300);
    h.pointer('pointerup', 20, 300);
    expect(h.taps).toEqual([]);
    expect(h.selects).toEqual([]);
  });
});
