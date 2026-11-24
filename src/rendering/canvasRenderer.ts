import type { Clock } from '../engine/core/clock';
import { createRng, hashSeed, type Rng } from '../engine/core/rng';
import { getDragonEffect, type DragonEffectId } from '../assets/effects/manifest';
import {
  DRAGON_SCENE_SCALE,
  ENV_FX,
  LIGHTING,
  ORIGIN_HABITATS,
  PROPS,
  SCENE,
  type EnvEmitter,
  type OriginHabitatArt,
  type OriginHabitatId,
  type TimeOfDay,
} from '../assets/habitats/origin/manifest';
import { FOOD_ICONS } from '../assets/icons/food/manifest';
import { FRAME_POSES, getDragonFrame } from '../assets/animations/manifest';
import type { CommonSpeciesId } from '../assets/animations/dragonAnimations';
import type { DietId } from '../data/care';
import type { ImageCache } from './assetAdapter';
import { STAGE_SCALE, cuesCrossed, dragonVisual } from './dragonVisual';
import type { Agent, LivingWorld } from './livingWorld';
import { ORIGIN_LAYOUT, inWater, regionOf, type HabitatRegion, type Vec } from './originLayout';
import { fitView, inSceneBox, toGround, toScreen, type View } from './projection';
import { OVERVIEW, ZOOM_MAX, ZOOM_MIN, clampCamera, focusOn, follow, panBy, screenToLocal, zoomAround, type CameraState } from './camera';

/**
 * Canvas 2D renderer cho Khởi Nguyên (G1 PR4 + tích hợp asset ADR 0012; GDD 3.1 trang 16–17, Phụ lục G).
 * - requestAnimationFrame, giới hạn 30/60 FPS theo cài đặt, dt chặn 100 ms; dừng hẳn khi tab ẩn.
 * - Tách khỏi tick kinh tế 1 Hz: renderer chỉ đọc LivingWorld, không gửi lệnh mỗi frame.
 * - High-DPI: backing store = CSS × min(devicePixelRatio, 2).
 * - Một microhabitat mỗi lần (khung 960×540 px cảnh, 16:9); chuyển cảnh trượt ngang có parallax.
 * - Lớp: sky/far/mid → ánh sáng nền → ground → vật thể phẳng → (vật thể đứng + rồng + thức ăn, y-sort)
 *   → hiệu ứng → foreground → ánh sáng cảnh → trạng thái chưa khám phá.
 * - Rồng: clip + khung SVG (`dragonVisual`), bóng là hiệu ứng `shadow` trên đất.
 * - Ảnh tải theo nhu cầu qua `ImageCache`, giải phóng ảnh không dùng.
 * - Reduced motion: dừng flipbook/track, tắt hạt trang trí và parallax; giữ hiệu ứng mang thông tin.
 */

export interface RenderView {
  unlockedHabitats: readonly string[];
  fpsLimit: 30 | 60;
  reducedMotionSetting: boolean;
  selectedUid: string | null;
  /** Microhabitat đang xem (điều hướng). */
  habitatId: OriginHabitatId;
  timeOfDay: TimeOfDay;
  lockedLabel: string;
  /** Gợi ý điều kiện mở (đã dịch) theo microhabitat; null nếu không có. */
  lockedHint: (habitatId: string) => string | null;
}

export interface RendererEnv {
  win: Pick<Window, 'devicePixelRatio' | 'requestAnimationFrame' | 'cancelAnimationFrame' | 'addEventListener' | 'removeEventListener' | 'matchMedia'>;
  doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  ResizeObserver?: typeof ResizeObserver;
}

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  world: LivingWorld;
  images: ImageCache;
  clock: Clock;
  getView: () => RenderView;
  onSelect: (uid: string | null) => void;
  onGroundTap: (habitatId: string, pos: Vec) => void;
  /** Camera đổi chế độ/zoom (không gọi mỗi frame khi chỉ bám theo rồng). */
  onCamera?: (c: { mode: CameraState['mode']; zoom: number }) => void;
  env?: RendererEnv;
  /** Seed cho hạt môi trường (cosmetic). */
  seed?: string;
}

export interface RenderStats {
  fps: number;
  p95FrameMs: number;
  avgDrawMs: number;
  frames: number;
  longFrames: number;
  running: boolean;
  reducedMotion: boolean;
  dpr: number;
  backingWidth: number;
  backingHeight: number;
  particles: number;
  images: ReturnType<ImageCache['stats']>;
  /** Đang trượt chuyển cảnh. */
  transitioning: boolean;
  camera: { mode: CameraState['mode']; zoom: number };
}

const DT_CLAMP_MS = 100;
const WINDOW = 240;
const TAP_MOVE_PX = 10;
const TAP_MS = 600;
export const TRANSITION_MS = 520;
const SWEEP_EVERY_MS = 5000;
/** Giới hạn hạt (GDD: "giới hạn particle"). */
export const MAX_PARTICLES = 80;
const FOOD_SIZE = 30;
/** Ô huy hiệu biến thể trong khung 240×200 (huy hiệu tâm (26,26) r 20 + viền). */
export const BADGE_BOX = 50;

const COLORS = {
  letterbox: '#e9e4d6',
  fallback: { origin_meadow: '#b9cf95', origin_warm_rocks: '#d9c3a1', origin_pondbank: '#a9c9b3' } as Record<string, string>,
  select: '#c2572b',
  ink: '#2b2b3a',
  lockedVeil: '#c9c6bf',
};

interface Particle {
  img: string;
  frames?: readonly string[] | undefined;
  frameMs?: number | undefined;
  x: number;
  y: number;
  born: number;
  life: number;
  motion: 'rise-fade' | 'pop-fade' | 'expand-fade' | 'drift-back' | 'bob' | 'pulse' | 'drift' | 'flutter' | 'dart' | 'twinkle' | 'shimmer' | 'rise' | 'static';
  travel: Vec;
  w: number;
  h: number;
  anchor: Vec;
  flip: 1 | -1;
  seed: number;
  habitatId: string;
}

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private raf: number | null = null;
  private lastTs: number | null = null;
  private lastDrawTs: number | null = null;
  private view: View = fitView(1, 1);
  private dpr = 1;
  private intervals: number[] = [];
  private drawTimes: number[] = [];
  private frames = 0;
  private longFrames = 0;
  private secondStart = 0;
  private framesThisSecond = 0;
  private fps = 0;
  private prefersReduced = false;
  private disposed = false;
  private cleanups: (() => void)[] = [];
  /** Con trỏ đang chạm (chuột/bút/ngón tay) để phân biệt chạm · kéo · chụm. */
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private gesture: 'idle' | 'tap' | 'pan' | 'pinch' | 'consumed' = 'idle';
  private pinch: { d0: number; cam0: CameraState; local0: Vec } | null = null;
  private cam: CameraState = { ...OVERVIEW };
  private readonly env: RendererEnv;
  /** Camera: microhabitat đích và chuyển cảnh đang chạy. */
  private home: OriginHabitatId;
  private transition: { from: OriginHabitatId; to: OriginHabitatId; start: number } | null = null;
  private wallMs = 0;
  private lastSweep = 0;
  private particles: Particle[] = [];
  private prevPhase = new Map<string, { state: string; t: number }>();
  private emitterAcc = new Map<string, number>();
  private readonly fxRng: Rng;
  private prefetched = new Set<string>();

  constructor(private readonly opts: RendererOptions) {
    const ctx = opts.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not available');
    this.ctx = ctx;
    this.env = opts.env ?? { win: window, doc: document, ResizeObserver: globalThis.ResizeObserver };
    this.home = opts.getView().habitatId;
    this.fxRng = createRng(hashSeed(opts.seed ?? 'origin-fx', 'particles'));
    this.bind();
    // 1×: trang vẫn cuộn dọc qua canvas; chụm hai ngón thuộc về camera (không phóng to cả trang).
    const style = (opts.canvas as Partial<HTMLCanvasElement>).style;
    if (style) style.touchAction = 'pan-y';
    this.resize();
  }

  private listen<T extends EventTarget>(target: T, type: string, fn: EventListener): void {
    target.addEventListener(type, fn);
    this.cleanups.push(() => target.removeEventListener(type, fn));
  }

  private bind(): void {
    const { win, doc } = this.env;
    const c = this.opts.canvas;
    this.listen(doc as unknown as EventTarget, 'visibilitychange', () => (doc.visibilityState === 'hidden' ? this.pause() : this.start()));
    this.listen(win as unknown as EventTarget, 'resize', () => this.resize());
    if (this.env.ResizeObserver) {
      const ro = new this.env.ResizeObserver(() => this.resize());
      ro.observe(c);
      this.cleanups.push(() => ro.disconnect());
    }
    const mql = win.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mql) {
      this.prefersReduced = mql.matches;
      const onChange = (e: MediaQueryListEvent) => (this.prefersReduced = e.matches);
      mql.addEventListener('change', onChange);
      this.cleanups.push(() => mql.removeEventListener('change', onChange));
    }
    this.listen(c, 'pointerdown', (e) => this.onPointerDown(e as PointerEvent));
    this.listen(c, 'pointermove', (e) => this.onPointerMove(e as PointerEvent));
    this.listen(c, 'pointerup', (e) => this.onPointerUp(e as PointerEvent, false));
    this.listen(c, 'pointercancel', (e) => this.onPointerUp(e as PointerEvent, true));
    this.listen(c, 'wheel', (e) => {
      const w = e as WheelEvent;
      // Chụm trên touchpad/ctrl + lăn chuột: zoom quanh con trỏ. Lăn thường để trang cuộn.
      if (!w.ctrlKey) return;
      w.preventDefault?.();
      this.zoomAt({ x: w.offsetX, y: w.offsetY }, this.cam.zoom * Math.exp(-w.deltaY * 0.01));
    });
  }

  // ------------------------------------------------------------ gestures
  private onPointerDown(p: PointerEvent): void {
    this.pointers.set(p.pointerId, { x: p.offsetX, y: p.offsetY, sx: p.offsetX, sy: p.offsetY, t: performanceNow() });
    if (this.pointers.size === 1) {
      this.gesture = 'tap';
    } else if (this.pointers.size === 2) {
      // Ngón thứ hai: chụm để zoom, huỷ chạm (không thả thức ăn).
      const [a, b] = this.twoPointers();
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.pinch = { d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), cam0: this.cam, local0: screenToLocal(this.view.box, this.cam, mid) };
      this.gesture = 'pinch';
    } else this.gesture = 'consumed';
  }

  private twoPointers(): [Vec, Vec] {
    const [a, b] = [...this.pointers.values()];
    return [a ?? { x: 0, y: 0 }, b ?? a ?? { x: 0, y: 0 }];
  }

  private onPointerMove(p: PointerEvent): void {
    const ptr = this.pointers.get(p.pointerId);
    if (!ptr) return;
    const dx = p.offsetX - ptr.x;
    const dy = p.offsetY - ptr.y;
    ptr.x = p.offsetX;
    ptr.y = p.offsetY;
    if (this.gesture === 'pinch' && this.pinch && this.pointers.size >= 2) {
      const [a, b] = this.twoPointers();
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoom = this.pinch.cam0.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.d0);
      this.setCamera(pinchTo(this.view.box, this.pinch.cam0, this.pinch.local0, mid, zoom));
      return;
    }
    if (this.gesture === 'tap' && Math.hypot(p.offsetX - ptr.sx, p.offsetY - ptr.sy) > TAP_MOVE_PX) {
      // Kéo: chỉ dời camera khi đang zoom; ở 1× kéo không làm gì (không thả thức ăn).
      this.gesture = this.cam.zoom > ZOOM_MIN + 1e-6 ? 'pan' : 'consumed';
    }
    if (this.gesture === 'pan') this.setCamera(panBy(this.view.box, this.cam, dx, dy));
  }

  private onPointerUp(p: PointerEvent, cancelled: boolean): void {
    const ptr = this.pointers.get(p.pointerId);
    this.pointers.delete(p.pointerId);
    if (!ptr) return;
    if (!cancelled && this.gesture === 'tap' && this.pointers.size === 0) {
      const moved = Math.hypot(p.offsetX - ptr.sx, p.offsetY - ptr.sy);
      if (moved <= TAP_MOVE_PX && performanceNow() - ptr.t <= TAP_MS) this.tap({ x: p.offsetX, y: p.offsetY });
    }
    if (this.pointers.size === 0) {
      this.gesture = 'idle';
      this.pinch = null;
    } else if (this.gesture === 'pinch' || this.gesture === 'tap') this.gesture = 'consumed';
  }

  // ------------------------------------------------------------ camera API
  get camera(): CameraState {
    return this.cam;
  }

  private setCamera(next: CameraState): void {
    const prev = this.cam;
    this.cam = clampCamera(next);
    this.view = fitView(this.view.cssWidth, this.view.cssHeight, this.camX(), this.cam);
    // Đang zoom: kéo một ngón là dời camera → chặn cuộn trang trên canvas; 1×: cho trang cuộn dọc.
    const style = (this.opts.canvas as Partial<HTMLCanvasElement>).style;
    if (style) style.touchAction = this.cam.zoom > ZOOM_MIN + 1e-6 ? 'none' : 'pan-y';
    if (prev.mode !== this.cam.mode || Math.abs(prev.zoom - this.cam.zoom) > 1e-3) this.opts.onCamera?.({ mode: this.cam.mode, zoom: this.cam.zoom });
    if (this.raf === null && !this.disposed) this.draw();
  }

  /** Về tổng quan (1×). */
  overview(): void {
    this.setCamera({ ...OVERVIEW });
  }

  /** Bật Focus vào rồng (chỉ khi người chơi bấm; chọn rồng không tự zoom). */
  focus(uid: string): boolean {
    const a = this.opts.world.agents.get(uid);
    const region = a ? regionOf(a.habitatId) : undefined;
    if (!a || !region || a.habitatId !== this.home) return false;
    this.setCamera(focusOn(this.cam, uid, { x: a.pos.x - region.sceneX, y: a.pos.y - a.z }));
    return true;
  }

  /** Zoom quanh một điểm màn hình (mặc định tâm khung). */
  zoomAt(s: Vec | null, zoom: number): void {
    const b = this.view.box;
    const at = s ?? { x: b.x + (SCENE.width * b.k0) / 2, y: b.y + (SCENE.height * b.k0) / 2 };
    this.setCamera(zoomAround(b, this.cam, Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)), at));
  }

  get reducedMotion(): boolean {
    return this.prefersReduced || this.opts.getView().reducedMotionSetting;
  }

  /** Microhabitat đang hiển thị (đích của camera). */
  get habitat(): OriginHabitatId {
    return this.home;
  }

  resize(): void {
    const c = this.opts.canvas;
    const w = Math.max(1, c.clientWidth);
    const h = Math.max(1, c.clientHeight);
    this.dpr = Math.min(2, Math.max(1, this.env.win.devicePixelRatio || 1));
    const bw = Math.round(w * this.dpr);
    const bh = Math.round(h * this.dpr);
    if (c.width !== bw) c.width = bw;
    if (c.height !== bh) c.height = bh;
    this.view = fitView(w, h, this.camX(), this.cam);
    if (this.raf === null && !this.disposed) this.draw();
  }

  start(): void {
    if (this.disposed || this.raf !== null || this.env.doc.visibilityState === 'hidden') return;
    this.lastTs = null;
    this.lastDrawTs = null;
    this.raf = this.env.win.requestAnimationFrame(this.frame);
  }

  pause(): void {
    if (this.raf !== null) this.env.win.cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  dispose(): void {
    this.pause();
    this.disposed = true;
    this.particles = [];
    for (const c of this.cleanups.splice(0)) c();
  }

  stats(): RenderStats {
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]! : 0;
    const avgDraw = this.drawTimes.length ? this.drawTimes.reduce((a, b) => a + b, 0) / this.drawTimes.length : 0;
    return {
      fps: this.fps,
      p95FrameMs: p95,
      avgDrawMs: avgDraw,
      frames: this.frames,
      longFrames: this.longFrames,
      running: this.raf !== null,
      reducedMotion: this.reducedMotion,
      dpr: this.dpr,
      backingWidth: this.opts.canvas.width,
      backingHeight: this.opts.canvas.height,
      particles: this.particles.length,
      images: this.opts.images.stats(),
      transitioning: this.transition !== null,
      camera: { mode: this.cam.mode, zoom: this.cam.zoom },
    };
  }

  private frame = (ts: number): void => {
    this.raf = null;
    if (this.disposed) return;
    const limit = this.opts.getView().fpsLimit;
    const minInterval = 1000 / limit;
    if (this.lastDrawTs !== null && ts - this.lastDrawTs < minInterval - 2) {
      this.raf = this.env.win.requestAnimationFrame(this.frame);
      return;
    }
    const dt = this.lastTs === null ? 0 : Math.min(DT_CLAMP_MS, ts - this.lastTs);
    this.lastTs = ts;
    this.wallMs += dt;
    this.opts.world.step(dt, this.opts.clock.nowMs());
    this.update(dt);
    const t0 = performanceNow();
    this.draw();
    const drawMs = performanceNow() - t0;
    if (this.lastDrawTs !== null) {
      const iv = ts - this.lastDrawTs;
      this.intervals.push(iv);
      if (this.intervals.length > WINDOW) this.intervals.shift();
      if (iv > 50) this.longFrames++;
    }
    this.drawTimes.push(drawMs);
    if (this.drawTimes.length > WINDOW) this.drawTimes.shift();
    this.lastDrawTs = ts;
    this.frames++;
    this.framesThisSecond++;
    if (ts - this.secondStart >= 1000) {
      this.fps = Math.round((this.framesThisSecond * 1000) / (ts - this.secondStart));
      this.secondStart = ts;
      this.framesThisSecond = 0;
      const c = this.opts.canvas;
      c.dataset.fps = String(this.fps);
      c.dataset.p95 = this.stats().p95FrameMs.toFixed(1);
    }
    this.raf = this.env.win.requestAnimationFrame(this.frame);
  };

  // ------------------------------------------------------------ camera
  private camX(): number {
    const base = regionOf(this.home)?.sceneX ?? 0;
    const tr = this.transition;
    if (!tr) return base;
    const from = regionOf(tr.from)?.sceneX ?? base;
    return from + (base - from) * this.transitionU();
  }

  private transitionU(): number {
    const tr = this.transition;
    if (!tr) return 1;
    const u = Math.min(1, (this.wallMs - tr.start) / TRANSITION_MS);
    return u * u * (3 - 2 * u);
  }

  /** Cập nhật mỗi frame: điều hướng, hạt hiệu ứng, giải phóng ảnh. */
  private update(dt: number): void {
    const target = this.opts.getView().habitatId;
    if (target !== this.home) {
      this.transition = this.reducedMotion ? null : { from: this.home, to: target, start: this.wallMs };
      this.home = target;
      // Đổi sinh cảnh: giữ Focus nếu rồng đang theo dõi ở sinh cảnh mới, nếu không về tổng quan.
      const followed = this.cam.followUid ? this.opts.world.agents.get(this.cam.followUid) : undefined;
      if (!followed || followed.habitatId !== target) this.setCamera({ ...OVERVIEW });
    }
    if (this.transition && this.wallMs - this.transition.start >= TRANSITION_MS) this.transition = null;
    if (this.cam.mode === 'focus' && this.cam.followUid) {
      const a = this.opts.world.agents.get(this.cam.followUid);
      const region = a ? regionOf(a.habitatId) : undefined;
      if (!a || !region || a.habitatId !== this.home) this.setCamera({ ...OVERVIEW });
      else this.cam = follow(this.cam, { x: a.pos.x - region.sceneX, y: a.pos.y - a.z });
    }
    this.view = fitView(this.view.cssWidth, this.view.cssHeight, this.camX(), this.cam);
    this.prefetch();
    this.spawnDragonFx();
    this.spawnEnvFx(dt);
    const now = this.wallMs;
    this.particles = this.particles.filter((p) => now - p.born < p.life);
    if (now - this.lastSweep > SWEEP_EVERY_MS) {
      this.lastSweep = now;
      // Ảnh bị giải phóng sẽ được tải lại khi cần: cho phép tải trước lại.
      if (this.opts.images.sweep(now) > 0) this.prefetched.clear();
    }
  }

  /** Tải trước: tài nguyên sinh cảnh đang xem/sắp xem và mọi khung của rồng đang có (theo loài/stage/biến thể). */
  private prefetch(): void {
    const want: string[] = [];
    const ids = this.visibleHabitats();
    for (const id of ids) {
      const key = `hab:${id}`;
      if (!this.prefetched.has(key)) {
        this.prefetched.add(key);
        want.push(...habitatUrls(id));
      }
    }
    for (const a of this.opts.world.agents.values()) {
      if (!ids.includes(a.habitatId as OriginHabitatId)) continue;
      const key = `dragon:${a.speciesId}:${a.stage}:${a.mutation}`;
      if (!this.prefetched.has(key)) {
        this.prefetched.add(key);
        want.push(...frameUrlsFor(a.speciesId, a.stage, a.mutation));
      }
    }
    if (want.length) this.opts.images.prefetch(want, this.wallMs);
  }

  private visibleHabitats(): OriginHabitatId[] {
    return this.transition ? [this.transition.from, this.transition.to] : [this.home];
  }

  // ------------------------------------------------------------ input
  tap(s: Vec): void {
    if (!inSceneBox(this.view, s)) return;
    const hit = this.pick(s);
    if (hit) {
      this.opts.onSelect(hit.uid);
      return;
    }
    const g = toGround(this.view, s);
    const region = regionOf(this.home);
    const inside = region && g.x >= region.x0 && g.x <= region.x1 && g.y >= region.y0 && g.y <= region.y1;
    if (region && inside && this.opts.getView().unlockedHabitats.includes(region.habitatId)) this.opts.onGroundTap(region.habitatId, g);
    else this.opts.onSelect(null);
  }

  pick(s: Vec): Agent | null {
    const agents = this.sortedAgents().reverse();
    for (const a of agents) {
      if (!this.visibleHabitats().includes(a.habitatId as OriginHabitatId)) continue;
      const b = this.bounds(a);
      if (s.x >= b.x && s.x <= b.x + b.w && s.y >= b.y && s.y <= b.y + b.h) return a;
    }
    return null;
  }

  private sortedAgents(): Agent[] {
    return [...this.opts.world.agents.values()].sort((a, b) => a.pos.y - b.pos.y || (a.uid < b.uid ? -1 : 1));
  }

  /** Khung chạm: hitbox của khung hoạt ảnh hiện tại quanh điểm neo (có độ cao bay). */
  bounds(a: Agent): { x: number; y: number; w: number; h: number } {
    const frame = getDragonFrame(a.speciesId as CommonSpeciesId, a.stage, a.mutation, 'idle');
    const hb = frame?.hitbox ?? { x: 60, y: 60, w: 120, h: 110 };
    const S = DRAGON_SCENE_SCALE * this.view.k;
    const p = toScreen(this.view, a.pos, a.z);
    const pad = 6;
    return { x: p.x + (hb.x - 120) * S - pad, y: p.y + (hb.y - 170) * S - pad, w: hb.w * S + 2 * pad, h: hb.h * S + 2 * pad };
  }

  // ------------------------------------------------------------ effects
  private addParticle(p: Omit<Particle, 'seed'>): void {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({ ...p, seed: this.fxRng.next() });
  }

  private spawnDragonFx(): void {
    const reduced = this.reducedMotion;
    const sim = this.opts.world.timeMs;
    for (const a of this.opts.world.agents.values()) {
      const vis = dragonVisual(a, sim, reduced);
      if (!vis) continue;
      const prev = this.prevPhase.get(a.uid);
      const prevT = prev && prev.state === vis.clip.state ? prev.t : null;
      this.prevPhase.set(a.uid, { state: vis.clip.state, t: vis.t });
      if (reduced) continue;
      for (const cue of cuesCrossed(vis.clip, prevT, vis.t)) {
        const fx = getDragonEffect(cue.fx);
        if (fx.informational) continue; // vẽ liên tục trong drawAgent
        if (cue.fx === 'zzz' && a.state === 'rest') continue; // nghỉ (thức) không có zzz
        const at = this.attachPoint(a, cue.at, vis.frame?.attach);
        const s = STAGE_SCALE[a.stage] * DRAGON_SCENE_SCALE;
        this.addParticle({
          img: fx.url,
          x: at.x + (cue.dx ?? 0) * s * (fx.flipWithFacing ? a.facing : 1),
          y: at.y + (cue.dy ?? 0) * s,
          born: this.wallMs,
          life: cue.durMs,
          motion: fx.motion,
          travel: { x: fx.travel.dx * (fx.flipWithFacing ? a.facing : 1), y: fx.travel.dy },
          w: fx.width * 0.8,
          h: fx.height * 0.8,
          anchor: { x: fx.anchor.x * 0.8, y: fx.anchor.y * 0.8 },
          flip: fx.flipWithFacing ? a.facing : 1,
          habitatId: a.habitatId,
        });
      }
    }
    for (const uid of [...this.prevPhase.keys()]) if (!this.opts.world.agents.has(uid)) this.prevPhase.delete(uid);
  }

  /** Điểm gắn (toạ độ thế giới, y đã trừ độ cao) từ attach của khung. */
  private attachPoint(a: Agent, at: string, attach?: Readonly<Partial<Record<string, readonly [number, number]>>>): Vec {
    if (at === 'ground') return { x: a.pos.x, y: a.pos.y };
    const p = attach?.[at] ?? attach?.body ?? [120, 120];
    const S = DRAGON_SCENE_SCALE;
    return { x: a.pos.x + (p[0] - 120) * S * a.facing, y: a.pos.y + (p[1] - 170) * S - a.z };
  }

  private spawnEnvFx(dt: number): void {
    if (this.reducedMotion) {
      this.particles = this.particles.filter((p) => !p.habitatId.startsWith('env:'));
      return;
    }
    const tod = this.opts.getView().timeOfDay;
    const unlocked = this.opts.getView().unlockedHabitats;
    for (const id of this.visibleHabitats()) {
      if (!unlocked.includes(id)) continue;
      const art = ORIGIN_HABITATS[id];
      art.emitters.forEach((em, i) => {
        if (!em.times.includes(tod)) return;
        const key = `${id}:${i}`;
        const active = this.particles.filter((p) => p.habitatId === `env:${key}`).length;
        let acc = (this.emitterAcc.get(key) ?? 0) + (dt / 60000) * em.perMinute;
        while (acc >= 1) {
          acc -= 1;
          if (active < em.maxActive) this.spawnEnv(id, key, em);
        }
        this.emitterAcc.set(key, acc);
      });
    }
  }

  private spawnEnv(id: OriginHabitatId, key: string, em: EnvEmitter): void {
    const xs = em.area.map(([x]) => x);
    const ys = em.area.map(([, y]) => y);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const x = x0 + this.fxRng.next() * (Math.max(...xs) - x0);
    const y = y0 + this.fxRng.next() * (Math.max(...ys) - y0);
    const first = ENV_FX[em.frames[0]!];
    const off = regionOf(id)?.sceneX ?? 0;
    this.addParticle({
      img: first.url,
      frames: em.frames.length > 1 ? em.frames.map((f) => ENV_FX[f].url) : undefined,
      frameMs: em.frameMs,
      x: off + x,
      y,
      born: this.wallMs,
      life: em.lifeMs,
      motion: em.motion,
      travel: { x: (this.fxRng.next() - 0.5) * 80, y: -10 - this.fxRng.next() * 30 },
      w: first.width,
      h: first.height,
      anchor: { x: first.width / 2, y: first.height / 2 },
      flip: this.fxRng.next() < 0.5 ? 1 : -1,
      habitatId: `env:${key}`,
    });
  }

  // ------------------------------------------------------------ drawing
  private img(url: string): CanvasImageSource | null {
    return this.opts.images.get(url, this.wallMs);
  }

  /** Vẽ ảnh tại toạ độ màn hình CSS (nếu đã tải). */
  private blit(url: string, x: number, y: number, w: number, h: number): boolean {
    const im = this.img(url);
    if (!im) return false;
    this.ctx.drawImage(im, x, y, w, h);
    return true;
  }

  draw(): void {
    const ctx = this.ctx;
    const v = this.view;
    const view = this.opts.getView();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = COLORS.letterbox;
    ctx.fillRect(0, 0, v.cssWidth, v.cssHeight);
    ctx.save();
    ctx.beginPath();
    ctx.rect(v.box.x, v.box.y, SCENE.width * v.box.k0, SCENE.height * v.box.k0);
    ctx.clip();
    const reduced = this.reducedMotion;
    const u = this.transitionU();
    const tr = this.transition;
    const light = LIGHTING[view.timeOfDay];
    // 1. Nền xa có parallax: khi chuyển cảnh, cảnh cũ trượt ra và cảnh mới trượt vào với tốc độ theo lớp.
    for (const layerId of ['sky', 'far', 'mid'] as const) {
      const tiles: { id: OriginHabitatId; dx: number; alpha: number }[] = [];
      if (tr) {
        const dir = (regionOf(tr.to)?.sceneX ?? 0) > (regionOf(tr.from)?.sceneX ?? 0) ? 1 : -1;
        const p = ORIGIN_HABITATS[tr.from].layers.find((l) => l.id === layerId)?.parallax ?? 1;
        tiles.push({ id: tr.from, dx: -dir * u * SCENE.width * p, alpha: 1 });
        tiles.push({ id: tr.to, dx: dir * (1 - u) * SCENE.width * p, alpha: u });
      } else tiles.push({ id: this.home, dx: 0, alpha: 1 });
      for (const tile of tiles) {
        const art = ORIGIN_HABITATS[tile.id];
        const layer = art.layers.find((l) => l.id === layerId);
        if (!layer) continue;
        ctx.globalAlpha = tile.alpha;
        // Parallax theo camera trong cảnh: lớp xa dời theo camera một phần (1 − parallax).
        const px = (this.cam.fx - SCENE.width / 2) * (1 - layer.parallax);
        const py = (this.cam.fy - SCENE.height / 2) * (1 - layer.parallax);
        const ok = this.blit(layer.url, v.ox + (tile.dx + px) * v.k, v.oy + py * v.k, layer.width * v.k, layer.height * v.k);
        if (!ok && layerId === 'sky') {
          ctx.fillStyle = '#cfe6ef';
          ctx.fillRect(v.ox + (tile.dx + px) * v.k, v.oy + py * v.k, SCENE.width * v.k, 330 * v.k);
        }
      }
      ctx.globalAlpha = 1;
    }
    if (light.backdrop) this.tint(light.backdrop.color, light.backdrop.opacity, 0, 330);
    // 2. Từng cảnh nhìn thấy (mặt đất trở lên trượt cùng camera).
    const visible = this.visibleHabitats();
    for (const id of visible) this.drawGround(id, view);
    // 3. Lớp đối tượng y-sort: vật thể đứng + rồng + thức ăn.
    type Item = { y: number; draw: () => void };
    const items: Item[] = [];
    for (const id of visible) {
      if (!view.unlockedHabitats.includes(id)) continue;
      const off = regionOf(id)?.sceneX ?? 0;
      for (const p of ORIGIN_HABITATS[id].props) {
        const prop = PROPS[p.prop];
        if (prop.flat) continue;
        items.push({ y: p.y, draw: () => this.drawProp(off, p.prop, p.x, p.y, p.scale, p.flip) });
      }
    }
    const now = this.opts.clock.nowMs();
    for (const f of this.opts.world.food.values()) {
      if (f.expiresAtMs <= now || !visible.includes(f.habitatId as OriginHabitatId)) continue;
      items.push({ y: f.pos.y, draw: () => this.drawFood(f.dietId as DietId, f.pos) });
    }
    for (const a of this.sortedAgents()) {
      if (!visible.includes(a.habitatId as OriginHabitatId)) continue;
      items.push({ y: a.pos.y + 0.01, draw: () => this.drawAgent(a, view.selectedUid === a.uid, reduced) });
    }
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();
    // 4. Hạt hiệu ứng.
    this.drawParticles(visible);
    // 5. Tiền cảnh.
    for (const id of visible) {
      const fg = ORIGIN_HABITATS[id].layers.find((l) => l.id === 'foreground');
      if (!fg) continue;
      const x = toScreen(v, { x: regionOf(id)?.sceneX ?? 0, y: 0 }).x;
      this.blit(fg.url, x, v.oy, fg.width * v.k, fg.height * v.k);
      if (!view.unlockedHabitats.includes(id)) this.drawLocked(id, view);
    }
    // 6. Ánh sáng cảnh.
    if (light.scene) this.tint(light.scene.color, light.scene.opacity, 0, SCENE.height);
    ctx.restore();
  }

  private tint(color: string, opacity: number, y0: number, y1: number): void {
    const ctx = this.ctx;
    const v = this.view;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    // Cả khung: lớp nền phủ theo dải y của cảnh; lớp cảnh phủ toàn khung nhìn.
    if (y0 === 0 && y1 === SCENE.height) ctx.fillRect(v.box.x, v.box.y, SCENE.width * v.box.k0, SCENE.height * v.box.k0);
    else ctx.fillRect(v.box.x, v.oy + y0 * v.k, SCENE.width * v.box.k0, (y1 - y0) * v.k);
    ctx.restore();
  }

  private drawGround(id: OriginHabitatId, view: RenderView): void {
    const v = this.view;
    const art: OriginHabitatArt = ORIGIN_HABITATS[id];
    const off = regionOf(id)?.sceneX ?? 0;
    const x = toScreen(v, { x: off, y: 0 }).x;
    const ground = art.layers.find((l) => l.id === 'ground');
    if (!ground || !this.blit(ground.url, x, v.oy, ground.width * v.k, ground.height * v.k)) {
      this.ctx.fillStyle = COLORS.fallback[id] ?? COLORS.lockedVeil;
      this.ctx.fillRect(x, v.oy + 300 * v.k, SCENE.width * v.k, 240 * v.k);
    }
    if (!view.unlockedHabitats.includes(id)) return;
    for (const p of art.props) if (PROPS[p.prop].flat) this.drawProp(off, p.prop, p.x, p.y, p.scale, p.flip);
  }

  private drawProp(off: number, propId: keyof typeof PROPS, px: number, py: number, scale: number, flip: boolean): void {
    const prop = PROPS[propId];
    const v = this.view;
    const p = toScreen(v, { x: off + px, y: py });
    const w = prop.width * scale * v.k;
    const h = prop.height * scale * v.k;
    const im = this.img(prop.url);
    if (!im) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(im, -prop.anchor[0] * scale * v.k, -prop.anchor[1] * scale * v.k, w, h);
    ctx.restore();
  }

  private drawFood(dietId: DietId, pos: Vec): void {
    const icon = FOOD_ICONS[dietId];
    if (!icon) return;
    const v = this.view;
    const p = toScreen(v, pos);
    const s = (FOOD_SIZE / icon.size) * v.k;
    this.blit(icon.url, p.x - icon.anchor[0] * s, p.y - icon.anchor[1] * s, icon.size * s, icon.size * s);
  }

  private drawLocked(id: OriginHabitatId, view: RenderView): void {
    const ctx = this.ctx;
    const v = this.view;
    const art = ORIGIN_HABITATS[id];
    const x = toScreen(v, { x: regionOf(id)?.sceneX ?? 0, y: 0 }).x;
    // Khử bão hòa phần đất/tiền cảnh (composite 'saturation' — có trên Chromium/Firefox/Safari).
    ctx.save();
    ctx.globalCompositeOperation = 'saturation';
    ctx.globalAlpha = art.undiscovered.desaturate;
    ctx.fillStyle = '#808080';
    ctx.fillRect(x, v.oy + 290 * v.k, SCENE.width * v.k, 250 * v.k);
    ctx.restore();
    this.blit(art.undiscovered.mistUrl, x, v.oy, SCENE.width * v.k, SCENE.height * v.k);
    const [mx, my] = art.undiscovered.markerAt;
    this.blit(art.undiscovered.markerUrl, x + (mx - 48) * v.k, v.oy + (my - 124) * v.k, 96 * v.k, 128 * v.k);
    ctx.fillStyle = COLORS.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `700 ${Math.max(14, Math.round(30 * v.k))}px system-ui, sans-serif`;
    ctx.fillText(view.lockedLabel, x + 480 * v.k, v.oy + 160 * v.k);
    const hint = view.lockedHint(id);
    if (hint) {
      ctx.font = `${Math.max(12, Math.round(20 * v.k))}px system-ui, sans-serif`;
      ctx.fillText(hint, x + 480 * v.k, v.oy + 200 * v.k, SCENE.width * v.k * 0.9);
    }
  }

  private drawParticles(visible: readonly OriginHabitatId[]): void {
    const ctx = this.ctx;
    const v = this.view;
    const visibleIds = new Set(visible.map((id) => id as string));
    for (const p of this.particles) {
      const hab = p.habitatId.startsWith('env:') ? p.habitatId.slice(4).split(':')[0]! : p.habitatId;
      if (!visibleIds.has(hab)) continue;
      const age = (this.wallMs - p.born) / p.life;
      const m = particleMotion(p, age);
      if (m.alpha <= 0) continue;
      const url = p.frames && p.frameMs ? p.frames[Math.floor((this.wallMs - p.born) / p.frameMs) % p.frames.length]! : p.img;
      const im = this.img(url);
      if (!im) continue;
      const s = toScreen(v, { x: p.x + m.dx, y: p.y + m.dy });
      ctx.save();
      ctx.globalAlpha = m.alpha;
      ctx.translate(s.x, s.y);
      ctx.scale(p.flip * m.scale * v.k, m.scaleY * m.scale * v.k);
      ctx.drawImage(im, -p.anchor.x, -p.anchor.y, p.w, p.h);
      ctx.restore();
    }
  }

  private drawAgent(a: Agent, selected: boolean, reduced: boolean): void {
    const ctx = this.ctx;
    const v = this.view;
    const vis = dragonVisual(a, this.opts.world.timeMs, reduced);
    const region = regionOf(a.habitatId);
    const wet = !!region && a.z === 0 && a.mobility.swim && inWater(region, a.pos);
    const ground = toScreen(v, a.pos);
    const S = DRAGON_SCENE_SCALE * v.k;
    const st = STAGE_SCALE[a.stage];
    // Bóng: hiệu ứng `shadow` trên đất, co lại theo độ cao; dưới nước không có bóng.
    if (!wet) {
      const shadow = getDragonEffect('shadow');
      const cruise = 56 * DRAGON_SCENE_SCALE;
      const k = 1 - 0.4 * Math.min(1, a.z / cruise);
      const w = 124 * DRAGON_SCENE_SCALE * st * k * v.k;
      const h = 18 * DRAGON_SCENE_SCALE * st * k * v.k;
      this.blit(shadow.url, ground.x - w / 2, ground.y - h / 2 + 3 * v.k, w, h);
    }
    if (selected) {
      ctx.strokeStyle = COLORS.select;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y + 2 * v.k, 70 * S * st, 14 * S * st, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (!vis || !vis.frame) return;
    const im = this.img(vis.frame.url);
    if (!im) return;
    // Bơi: phần dưới mực nước bị che, đường nước của khung trùng mặt hồ.
    const wl = vis.frame.attach.waterline;
    const sink = wet && wl ? (170 - wl[1]) * S : 0;
    const top = toScreen(v, a.pos, a.z);
    ctx.save();
    if (wet) {
      ctx.beginPath();
      ctx.rect(ground.x - 200 * S, ground.y - 400 * S, 400 * S, 400 * S + 1.5 * v.k);
      ctx.clip();
    }
    ctx.translate(top.x + vis.dx * v.k * a.facing, top.y + sink + vis.dy * v.k);
    ctx.rotate(((vis.rot * Math.PI) / 180) * a.facing);
    ctx.scale(a.facing * vis.sx, vis.sy);
    if (a.mutation !== 'normal') {
      // Huy hiệu biến thể (góc trên trái khung, dùng cho UI) không vẽ trong cảnh: biến thể vẫn nhận ra
      // bằng lớp phủ + motif (thoi/vòng/sao). Cắt góc BADGE_BOX theo hệ toạ độ khung.
      ctx.beginPath();
      ctx.rect(-120 * S, -170 * S, 240 * S, 200 * S);
      ctx.rect(-120 * S, -170 * S, BADGE_BOX * S, BADGE_BOX * S);
      ctx.clip('evenodd');
    }
    ctx.drawImage(im, -120 * S, -170 * S, 240 * S, 200 * S);
    ctx.restore();
    if (wet) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y, 52 * S * st, 9 * S * st, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Hiệu ứng mang thông tin (chăm sóc): vẽ liên tục, kể cả khi reduced motion.
    for (const cue of vis.clip.fx) {
      const fx = getDragonEffect(cue.fx as DragonEffectId);
      if (!fx.informational) continue;
      const at = this.attachPoint(a, cue.at, vis.frame.attach);
      const s = toScreen(v, { x: at.x + (cue.dx ?? 0) * st * DRAGON_SCENE_SCALE, y: at.y + (cue.dy ?? 0) * st * DRAGON_SCENE_SCALE });
      const k = 0.8 * v.k;
      this.blit(fx.url, s.x - fx.anchor.x * k, s.y - fx.anchor.y * k, fx.width * k, fx.height * k);
    }
  }
}

/** Chụm hai ngón: điểm cảnh dưới tâm chụm ban đầu đi theo tâm chụm hiện tại, zoom theo tỉ lệ khoảng cách. */
export function pinchTo(box: View['box'], cam0: CameraState, local0: Vec, mid: Vec, zoom: number): CameraState {
  const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  if (z <= ZOOM_MIN + 1e-6) return { ...OVERVIEW };
  const k = box.k0 * z;
  return clampCamera({
    ...cam0,
    mode: cam0.mode === 'focus' ? 'focus' : 'free',
    zoom: z,
    fx: (box.x + (SCENE.width / 2) * box.k0 - mid.x) / k + local0.x,
    fy: (box.y + (SCENE.height / 2) * box.k0 - mid.y) / k + local0.y,
  });
}

/** Chuyển động của hạt theo tuổi 0..1 (thuần, tất định theo seed của hạt). */
export function particleMotion(p: Pick<Particle, 'motion' | 'travel' | 'seed'>, age: number): { dx: number; dy: number; alpha: number; scale: number; scaleY: number } {
  const a = Math.max(0, Math.min(1, age));
  const fadeIn = Math.min(1, a / 0.15);
  const fadeOut = Math.min(1, (1 - a) / 0.3);
  const fade = Math.min(fadeIn, fadeOut);
  switch (p.motion) {
    case 'static':
      return { dx: 0, dy: 0, alpha: 1, scale: 1, scaleY: 1 };
    case 'bob':
      return { dx: 0, dy: Math.sin(a * Math.PI * 2) * p.travel.y, alpha: 1, scale: 1, scaleY: 1 };
    case 'pulse':
      return { dx: 0, dy: 0, alpha: fade, scale: 0.8 + 0.3 * a, scaleY: 1 };
    case 'expand-fade':
      return { dx: p.travel.x * a, dy: p.travel.y * a, alpha: 1 - a, scale: 0.7 + 0.6 * a, scaleY: 1 };
    case 'pop-fade':
      return { dx: p.travel.x * a, dy: p.travel.y * a, alpha: fadeOut, scale: a < 0.2 ? 0.6 + 2 * a : 1, scaleY: 1 };
    case 'twinkle':
      return { dx: Math.sin(a * 6 + p.seed * 10) * 6, dy: Math.cos(a * 5 + p.seed * 7) * 4, alpha: 0.2 + 0.8 * Math.abs(Math.sin(a * Math.PI * 3)), scale: 1, scaleY: 1 };
    case 'shimmer':
      return { dx: 0, dy: 0, alpha: Math.sin(a * Math.PI), scale: 1, scaleY: 1 };
    case 'flutter':
      return { dx: p.travel.x * a * 2, dy: Math.sin(a * Math.PI * 4) * 10 + p.travel.y * a, alpha: fade, scale: 1, scaleY: 1 };
    case 'dart':
      return { dx: p.travel.x * 2 * Math.sin(a * Math.PI * 1.5), dy: Math.sin(a * Math.PI * 3) * 8, alpha: fade, scale: 1, scaleY: 1 };
    case 'drift-back':
    case 'rise-fade':
    case 'rise':
    case 'drift':
    default:
      return { dx: p.travel.x * a, dy: p.travel.y * a, alpha: fade, scale: 1, scaleY: 1 };
  }
}

/** Mọi URL khung mà một rồng có thể cần (để tải trước khi rồng xuất hiện). */
export function frameUrlsFor(speciesId: string, stage: Agent['stage'], mutation: Agent['mutation']): string[] {
  const poses = FRAME_POSES[speciesId as CommonSpeciesId] ?? [];
  const out: string[] = [];
  for (const pose of poses) {
    const f = getDragonFrame(speciesId as CommonSpeciesId, stage, mutation, pose);
    if (f) out.push(f.url);
  }
  return out;
}

/** URL của một microhabitat (lớp, vật thể, chưa khám phá) để tải trước. */
export function habitatUrls(id: OriginHabitatId): string[] {
  const art = ORIGIN_HABITATS[id];
  return [...art.layers.map((l) => l.url), ...art.props.map((p) => PROPS[p.prop].url), art.undiscovered.mistUrl, art.undiscovered.markerUrl];
}

export { ORIGIN_LAYOUT };
export type { HabitatRegion };

function performanceNow(): number {
  return globalThis.performance?.now() ?? 0;
}
