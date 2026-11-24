import type { Clock } from '../engine/core/clock';
import type { GrowthStage } from '../types/game';
import type { AssetAdapter } from './assetAdapter';
import type { Agent, LivingWorld } from './livingWorld';
import { BODY_RADIUS } from './livingWorld';
import { ORIGIN_LAYOUT, inWater, regionAt, regionOf, type HabitatRegion, type Vec } from './originLayout';
import { fitView, toGround, toScreen, type View } from './projection';

/**
 * Canvas 2D renderer cho Khởi Nguyên (G1 PR4; GDD 3.1 trang 16–17; ART_DIRECTION G0).
 * - requestAnimationFrame, giới hạn 30/60 FPS theo cài đặt, dt chặn 100 ms; dừng hẳn khi tab ẩn.
 * - Tách khỏi tick kinh tế 1 Hz của GameSession: renderer chỉ đọc LivingWorld, không gửi lệnh mỗi frame.
 * - High-DPI: backing store = CSS × min(devicePixelRatio, 2).
 * - Không vẽ đồ họa thay thế cho phần thuộc AI 2: mặt đất/vật cản/thức ăn là **khối phẳng đánh dấu**
 *   (placeholder) để thấy luật va chạm; rồng thiếu sprite vẽ dấu "?" trung tính.
 * - Hoạt ảnh là biến đổi thủ tục trên sprite tĩnh (thở, bước, cúi ăn, nằm, nảy khi được vuốt ve);
 *   reduced motion tắt các chuyển động trang trí, giữ thông tin (trạng thái vẫn hiện bằng ký hiệu).
 */

export interface RenderView {
  unlockedHabitats: readonly string[];
  fpsLimit: 30 | 60;
  reducedMotionSetting: boolean;
  selectedUid: string | null;
  habitatLabel: (habitatId: string) => string;
  lockedLabel: string;
  /** Ghi chú nhỏ trên cảnh: nền sinh cảnh là placeholder chờ asset AI 2. */
  placeholderNote: string;
}

export interface RendererEnv {
  win: Pick<Window, 'devicePixelRatio' | 'requestAnimationFrame' | 'cancelAnimationFrame' | 'addEventListener' | 'removeEventListener' | 'matchMedia'>;
  doc: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  ResizeObserver?: typeof ResizeObserver;
}

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  world: LivingWorld;
  assets: AssetAdapter;
  clock: Clock;
  getView: () => RenderView;
  onSelect: (uid: string | null) => void;
  onGroundTap: (habitatId: string, pos: Vec) => void;
  env?: RendererEnv;
}

export interface RenderStats {
  /** Khung hình vẽ trong giây gần nhất. */
  fps: number;
  /** p95 khoảng cách giữa hai khung đã vẽ trong cửa sổ gần nhất, ms. */
  p95FrameMs: number;
  /** Thời gian vẽ trung bình (CPU, ms) của cửa sổ gần nhất. */
  avgDrawMs: number;
  frames: number;
  longFrames: number;
  running: boolean;
  reducedMotion: boolean;
  dpr: number;
  backingWidth: number;
  backingHeight: number;
}

const DT_CLAMP_MS = 100;
const WINDOW = 240;
const TAP_MOVE_PX = 10;
const TAP_MS = 600;

const COLORS = {
  sky: '#dfe9e4',
  ground: { origin_meadow: '#b9cf95', origin_warm_rocks: '#d9c3a1', origin_pondbank: '#a9c9b3' } as Record<string, string>,
  locked: '#c9c6bf',
  edge: 'rgba(43,43,58,0.35)',
  solid: '#8d8a80',
  water: '#7fb2c9',
  shadow: 'rgba(41,63,69,0.22)',
  select: '#c2572b',
  ink: '#2b2b3a',
  diet: { fruit: '#d9534f', leaf: '#5e9c46', aquatic: '#3f86b8', aether: '#9b7fd6' } as Record<string, string>,
};

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
  private down: { x: number; y: number; t: number; id: number } | null = null;
  private readonly env: RendererEnv;

  constructor(private readonly opts: RendererOptions) {
    const ctx = opts.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not available');
    this.ctx = ctx;
    this.env = opts.env ?? { win: window, doc: document, ResizeObserver: globalThis.ResizeObserver };
    this.bind();
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
    this.listen(c, 'pointerdown', (e) => {
      const p = e as PointerEvent;
      this.down = { x: p.offsetX, y: p.offsetY, t: performanceNow(), id: p.pointerId };
    });
    this.listen(c, 'pointerup', (e) => {
      const p = e as PointerEvent;
      const d = this.down;
      this.down = null;
      if (!d || d.id !== p.pointerId) return;
      if (Math.hypot(p.offsetX - d.x, p.offsetY - d.y) > TAP_MOVE_PX || performanceNow() - d.t > TAP_MS) return;
      this.tap({ x: p.offsetX, y: p.offsetY });
    });
    this.listen(c, 'pointercancel', () => (this.down = null));
  }

  get reducedMotion(): boolean {
    return this.prefersReduced || this.opts.getView().reducedMotionSetting;
  }

  /** Cập nhật kích thước backing store theo kích thước CSS và DPR (tối đa 2). */
  resize(): void {
    const c = this.opts.canvas;
    const w = Math.max(1, c.clientWidth);
    const h = Math.max(1, c.clientHeight);
    this.dpr = Math.min(2, Math.max(1, this.env.win.devicePixelRatio || 1));
    const bw = Math.round(w * this.dpr);
    const bh = Math.round(h * this.dpr);
    if (c.width !== bw) c.width = bw;
    if (c.height !== bh) c.height = bh;
    this.view = fitView(w, h);
    if (this.raf === null && !this.disposed) this.draw();
  }

  start(): void {
    if (this.disposed || this.raf !== null || this.env.doc.visibilityState === 'hidden') return;
    this.lastTs = null;
    this.lastDrawTs = null;
    this.raf = this.env.win.requestAnimationFrame(this.frame);
  }

  /** Dừng vòng lặp (tab ẩn). Không tích lũy thời gian bị bỏ: khi chạy lại dt bắt đầu từ 0. */
  pause(): void {
    if (this.raf !== null) this.env.win.cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  dispose(): void {
    this.pause();
    this.disposed = true;
    for (const c of this.cleanups.splice(0)) c();
  }

  stats(): RenderStats {
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]! : 0;
    const avgDraw = this.drawTimes.length ? this.drawTimes.reduce((a, b) => a + b, 0) / this.drawTimes.length : 0;
    return { fps: this.fps, p95FrameMs: p95, avgDrawMs: avgDraw, frames: this.frames, longFrames: this.longFrames, running: this.raf !== null, reducedMotion: this.reducedMotion, dpr: this.dpr, backingWidth: this.opts.canvas.width, backingHeight: this.opts.canvas.height };
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
    this.opts.world.step(dt, this.opts.clock.nowMs());
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

  /** Chạm/bấm: chọn rồng trên cùng tại điểm đó; nếu không có thì thả thức ăn vào microhabitat đã mở. */
  tap(s: Vec): void {
    const hit = this.pick(s);
    if (hit) {
      this.opts.onSelect(hit.uid);
      return;
    }
    const g = toGround(this.view, s);
    const region = regionAt(g);
    if (region && this.opts.getView().unlockedHabitats.includes(region.habitatId)) this.opts.onGroundTap(region.habitatId, g);
    else this.opts.onSelect(null);
  }

  /** Rồng có khung sprite chứa điểm `s` (màn hình CSS px), ưu tiên rồng vẽ sau (gần hơn). */
  pick(s: Vec): Agent | null {
    const agents = this.sortedAgents().reverse();
    for (const a of agents) {
      const b = this.bounds(a);
      if (s.x >= b.x && s.x <= b.x + b.w && s.y >= b.y && s.y <= b.y + b.h) return a;
    }
    return null;
  }

  private sortedAgents(): Agent[] {
    return [...this.opts.world.agents.values()].sort((a, b) => a.pos.y - b.pos.y || (a.uid < b.uid ? -1 : 1));
  }

  /** Khung chạm của rồng: kích thước sprite (hoặc dấu thiếu asset) quanh điểm neo. */
  bounds(a: Agent): { x: number; y: number; w: number; h: number } {
    const { w, h, ax, ay } = this.spriteBox(a);
    const p = toScreen(this.view, a.pos, a.z);
    return { x: p.x - ax, y: p.y - ay, w, h };
  }

  private spriteBox(a: Agent): { w: number; h: number; ax: number; ay: number } {
    const sprite = this.opts.assets.dragon(a.speciesId, a.stage, a.mutation);
    // Sprite 240 px nguồn ≈ 150 đơn vị thế giới (rồng Adult dài ~100 đơn vị).
    const unit = this.view.k * 0.62;
    if (sprite) {
      const s = sprite.asset.stageScaled ? 1 : STAGE_SCALE[a.stage];
      return { w: sprite.asset.width * unit * s, h: sprite.asset.height * unit * s, ax: sprite.asset.anchorX * unit * s, ay: sprite.asset.anchorY * unit * s };
    }
    const size = 90 * this.view.k * STAGE_SCALE[a.stage];
    return { w: size, h: size, ax: size / 2, ay: size };
  }

  draw(): void {
    const ctx = this.ctx;
    const v = this.view;
    const view = this.opts.getView();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COLORS.sky;
    ctx.fillRect(0, 0, v.cssWidth, v.cssHeight);
    for (const r of ORIGIN_LAYOUT) this.drawRegion(r, view);
    const reduced = this.reducedMotion;
    const now = this.opts.clock.nowMs();
    for (const f of this.opts.world.food.values()) {
      if (f.expiresAtMs <= now) continue;
      const p = toScreen(v, f.pos);
      ctx.fillStyle = COLORS.diet[f.dietId] ?? COLORS.ink;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 7 * v.k * 1.4, 5 * v.k * 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (const a of this.sortedAgents()) this.drawAgent(a, view.selectedUid === a.uid, reduced);
    ctx.fillStyle = COLORS.ink;
    ctx.globalAlpha = 0.55;
    ctx.font = `${Math.max(10, 11)}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(view.placeholderNote, v.cssWidth - 8, v.cssHeight - 6);
    ctx.globalAlpha = 1;
  }

  private drawRegion(r: HabitatRegion, view: RenderView): void {
    const ctx = this.ctx;
    const v = this.view;
    const unlocked = view.unlockedHabitats.includes(r.habitatId);
    const corners = [toScreen(v, { x: r.x0, y: r.y0 }), toScreen(v, { x: r.x1, y: r.y0 }), toScreen(v, { x: r.x1, y: r.y1 }), toScreen(v, { x: r.x0, y: r.y1 })];
    ctx.beginPath();
    corners.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = unlocked ? (COLORS.ground[r.habitatId] ?? COLORS.locked) : COLORS.locked;
    ctx.fill();
    ctx.strokeStyle = COLORS.edge;
    ctx.lineWidth = 1;
    ctx.stroke();
    for (const o of r.obstacles) {
      const c = toScreen(v, o);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, o.r * v.k, o.r * v.k * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = o.kind === 'water' ? COLORS.water : COLORS.solid;
      ctx.globalAlpha = unlocked ? 1 : 0.5;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const label = toScreen(v, { x: (r.x0 + r.x1) / 2, y: r.y0 + 8 });
    ctx.fillStyle = COLORS.ink;
    ctx.font = `600 ${Math.max(11, Math.round(26 * v.k))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(view.habitatLabel(r.habitatId), label.x, label.y);
    if (!unlocked) {
      const mid = toScreen(v, { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
      ctx.font = `${Math.max(10, Math.round(20 * v.k))}px system-ui, sans-serif`;
      ctx.fillText(view.lockedLabel, mid.x, mid.y);
    }
  }

  private drawAgent(a: Agent, selected: boolean, reduced: boolean): void {
    const ctx = this.ctx;
    const v = this.view;
    const ground = toScreen(v, a.pos);
    // Bóng elip trên đất, nhỏ lại khi bay.
    const shadowScale = 1 - Math.min(0.5, a.z / 140);
    ctx.fillStyle = COLORS.shadow;
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, BODY_RADIUS * 1.6 * v.k * shadowScale, BODY_RADIUS * 0.6 * v.k * shadowScale, 0, 0, Math.PI * 2);
    ctx.fill();
    if (selected) {
      ctx.strokeStyle = COLORS.select;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y, BODY_RADIUS * 2.2 * v.k, BODY_RADIUS * 0.9 * v.k, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    const pose = poseOf(a, reduced);
    const { w, h, ax, ay } = this.spriteBox(a);
    // Bơi: thân chìm một phần dưới mặt nước (chỉ loài có `swim` mới vào được nước).
    const region = regionOf(a.habitatId);
    const wet = !!region && a.z === 0 && inWater(region, a.pos);
    const sink = wet ? h * 0.3 : 0;
    const p = toScreen(v, a.pos, a.z + pose.lift);
    const sprite = this.opts.assets.dragon(a.speciesId, a.stage, a.mutation);
    ctx.save();
    if (wet) {
      ctx.beginPath();
      ctx.rect(p.x - w, p.y - h * 2, w * 2, h * 2);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(ground.x, ground.y, BODY_RADIUS * 2 * v.k, BODY_RADIUS * 0.7 * v.k, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.translate(p.x, p.y + sink);
    const flip = sprite && sprite.asset.facing === 'left' ? -a.facing : a.facing;
    ctx.rotate(pose.tilt * a.facing);
    ctx.scale(flip * pose.sx, pose.sy);
    if (sprite) {
      ctx.drawImage(sprite.image, -ax, -ay, w, h);
    } else {
      // Dấu thiếu asset (không phải art): khung xám có "?".
      ctx.fillStyle = '#e7e4dc';
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(-ax, -ay, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.scale(flip, 1);
      ctx.fillStyle = COLORS.ink;
      ctx.font = `700 ${Math.round(h * 0.5)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', 0, -ay / 2);
    }
    ctx.restore();
    // Ký hiệu trạng thái (vẫn hiện khi reduced motion để không mất thông tin).
    const top = toScreen(v, a.pos, a.z + pose.lift);
    const icon = a.state === 'sleep' ? 'z' : a.state === 'pet' ? '♥' : a.state === 'eat' ? '•' : null;
    if (icon) {
      ctx.fillStyle = a.state === 'pet' ? COLORS.select : COLORS.ink;
      ctx.font = `700 ${Math.max(12, Math.round(30 * v.k))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const bob = reduced ? 0 : Math.sin(a.phase * 3) * 3;
      ctx.fillText(icon, top.x + w * 0.25, top.y - h * 0.75 + bob);
    }
  }
}

const STAGE_SCALE: Record<GrowthStage, number> = { baby: 0.68, juvenile: 0.85, adult: 1 };

interface Pose {
  sx: number;
  sy: number;
  lift: number;
  tilt: number;
}

/** Biến đổi thủ tục theo trạng thái (ART_DIRECTION: thở 2–3 s, bước 0,8–1,2 s, ăn 0,6 s, nghỉ, vuốt ve 1 s). */
export function poseOf(a: Pick<Agent, 'state' | 'phase' | 'vel' | 'airborne' | 'stateUntil'>, reduced: boolean): Pose {
  const speed = Math.hypot(a.vel.x, a.vel.y);
  if (a.state === 'sleep') return { sx: 1.04, sy: 0.9, lift: 0, tilt: 0 };
  if (a.state === 'rest') return { sx: 1.02, sy: 0.94, lift: 0, tilt: 0 };
  if (reduced) return { sx: 1, sy: 1, lift: 0, tilt: 0 };
  if (a.state === 'eat') return { sx: 1, sy: 0.96 + 0.04 * Math.cos(a.phase * 10), lift: 0, tilt: 0.12 };
  if (a.state === 'pet') return { sx: 1, sy: 1, lift: Math.abs(Math.sin(a.phase * 6)) * 14, tilt: 0 };
  if (a.airborne) return { sx: 1, sy: 1, lift: Math.sin(a.phase * 2) * 5, tilt: Math.min(0.15, speed / 600) };
  if (speed > 3) return { sx: 1, sy: 1, lift: Math.abs(Math.sin(a.phase * Math.PI)) * 4, tilt: Math.min(0.08, speed / 900) };
  // Thở nhẹ chu kỳ ~2,5 s.
  return { sx: 1, sy: 1 + 0.02 * Math.sin(a.phase * ((2 * Math.PI) / 2.5)), lift: 0, tilt: 0 };
}

function performanceNow(): number {
  return globalThis.performance?.now() ?? 0;
}
