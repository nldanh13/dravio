import { FEED_XP_COOLDOWN_MS } from '../data/care';
import { getSpecies } from '../data/dragons';
import { createRng, hashSeed, type Rng } from '../engine/core/rng';
import { growthStage } from '../engine/economy/rates';
import type { DragonInstance, GrowthStage, MutationType, Personality } from '../types/game';
import type { GameState } from '../types/state';
import { DRAGON_SCENE_SCALE } from '../assets/habitats/origin/manifest';
import { altitudeAt, flightRuleFor, resolveDragonClip, type CommonSpeciesId, type DragonAnimState } from '../assets/animations/dragonAnimations';
import { regionOf, inWater, obstacleDistance, type HabitatRegion, type Obstacle, type Vec } from './originLayout';
import { add, arrive, avoid, contain, len, limit, resolve, scale, separate, sub } from './steering';

/**
 * Thế giới sống của Khởi Nguyên (G1 PR4; ADR 0011). Mô phỏng hiển thị thuần TypeScript, không DOM:
 * - FSM hành vi: idle · wander · seekFood · eat · rest · sleep · pet. Quyết định ~1 Hz có jitter (GDD trang 7).
 * - Steering bước cố định 20 Hz (GDD: 10–30 Hz), độc lập với tần số khung hình.
 * - Di chuyển theo giải phẫu: chỉ loài có `fly` mới bay, `swim` mới xuống nước, còn lại đi bộ.
 * Toạ độ, vận tốc, năng lượng là trạng thái hiển thị **chỉ trong bộ nhớ**, không vào GameState/save.
 * Mọi thay đổi gameplay đi qua lệnh (`consumeFood`) do callback gửi — renderer không tự cộng XP/vàng.
 * RNG riêng (cosmetic) có seed theo rồng, không dùng RNG domain, không `Math.random`.
 *
 * ADR 0012 (tích hợp asset): toạ độ = px cảnh sinh cảnh; tốc độ khớp sải bước của clip
 * (`stridePx`) để chân không trượt; mỗi agent mang trạng thái hoạt ảnh (`anim`) chọn từ clip
 * `dragonAnimations`; độ cao bay theo clip `fly` (18/40/56 px viewBox × DRAGON_SCENE_SCALE,
 * không nhân stageScale); hạ cánh liên tục bằng clip `landing` (`altitudeAt`); luật tập bay
 * Zephyr Baby (`flightRuleFor`, ADR 0102 mục 2) được thực thi tại đây.
 */

export type BehaviorState = 'idle' | 'wander' | 'seekFood' | 'eat' | 'rest' | 'sleep' | 'pet';

export const STEER_STEP_MS = 50;
export const DECISION_BASE_MS = 1000;
export const DECISION_JITTER_MS = 300;
export const EAT_MS = 600;
export const PET_MS = 1000;
/** Bán kính "chạm" thức ăn, đơn vị thế giới. */
export const REACH = 20;
export const BODY_RADIUS = 14;
const FOOD_RETRY_MS = 8000;
/** Thời gian cất cánh lên độ cao bay (ms). */
export const TAKEOFF_MS = 300;
/** Nghỉ tối thiểu giữa hai lần tập bay của rồng có luật bay (Zephyr Baby). */
export const PRACTICE_FLIGHT_COOLDOWN_MS = 4000;
const STAGE_SCALE: Record<GrowthStage, number> = { baby: 0.68, juvenile: 0.85, adult: 1 };

/** Độ cao bay (px cảnh) của loài/stage; 0 nếu loài không bay. Không nhân stageScale (ADR 0102 mục 3). */
export function flightAltitude(speciesId: string, stage: GrowthStage): number {
  const clip = resolveDragonClip(speciesId as CommonSpeciesId, 'fly');
  return (clip?.altitude?.[stage] ?? 0) * DRAGON_SCENE_SCALE;
}

/** Tốc độ (px cảnh/s) khớp sải bước của clip: một chu kỳ ≈ 0,85 × thời lượng clip (0,8–1,2 s cho walk). */
export function clipSpeed(speciesId: string, stage: GrowthStage, state: 'walk' | 'swim' | 'fly'): number {
  const clip = resolveDragonClip(speciesId as CommonSpeciesId, state) ?? resolveDragonClip('emberling', 'walk');
  const stride = (clip?.stridePx ?? 36) * DRAGON_SCENE_SCALE * STAGE_SCALE[stage];
  return stride / (((clip?.durationMs ?? 1000) * 0.85) / 1000);
}

/** Trạng thái chăm sóc hiển thị (PR6 nối với HealthCase). */
export type CareVisual = 'injured' | 'recovery' | null;

export interface AnimState {
  state: DragonAnimState;
  /** ms mô phỏng lúc bắt đầu clip. */
  since: number;
  /** Quãng đường (px cảnh) từ đầu clip — clip di chuyển lấy pha theo quãng đường. */
  dist: number;
}

export interface Mobility {
  walk: boolean;
  swim: boolean;
  fly: boolean;
}

export function mobilityOf(speciesId: string): Mobility {
  const l = getSpecies(speciesId).anatomy.locomotion;
  return { walk: l.includes('walk'), swim: l.includes('swim'), fly: l.includes('fly') };
}

export interface Agent {
  uid: string;
  speciesId: string;
  habitatId: string;
  stage: GrowthStage;
  mutation: MutationType;
  personality: Personality;
  mobility: Mobility;
  /** Ngày/đêm hoạt động của loài. */
  activity: 'day' | 'night' | 'both';
  pos: Vec;
  vel: Vec;
  /** Độ cao khi bay (0 = trên đất). */
  z: number;
  airborne: boolean;
  state: BehaviorState;
  /** Thời điểm (ms mô phỏng) kết thúc trạng thái có thời hạn. */
  stateUntil: number;
  target: Vec | null;
  foodId: string | null;
  energy: number;
  nextDecisionAt: number;
  facing: 1 | -1;
  /** Pha hoạt ảnh tích lũy theo quãng đường/thời gian. */
  phase: number;
  ignoredFood: Map<string, number>;
  /** Mốc ăn XP gần nhất theo save (để không đi tới thức ăn khi còn cooldown). */
  lastFeedXpAtMs: number | undefined;
  rng: Rng;
  /** Hoạt ảnh hiện tại (chỉ hiển thị). */
  anim: AnimState;
  /** Hạ cánh đang diễn ra: độ cao lúc bắt đầu (px cảnh). */
  landing: { since: number; startZ: number } | null;
  /** Cất cánh lúc (ms mô phỏng). */
  takeoffAt: number;
  /** Hết hạn chuyến tập bay (luật bay); null = bay tới khi tới đích. */
  flightEndsAt: number | null;
  /** Không được tập bay trước mốc này. */
  noFlightUntil: number;
  /** Nhấp nháy: lần kế tiếp và lúc kết thúc lần hiện tại (RNG cosmetic). */
  nextBlinkAt: number;
  blinkUntil: number;
  care: CareVisual;
  /** Clip một lần do bên ngoài kích hoạt (happy). */
  oneShot: { state: DragonAnimState; until: number } | null;
}

export interface FoodVisual {
  id: string;
  dietId: string;
  habitatId: string;
  pos: Vec;
  expiresAtMs: number;
}

export type ConsumeResult = 'ok' | 'rejected';

export interface LivingWorldOptions {
  /** Gửi lệnh `consumeFood` qua command bus; trả kết quả đồng bộ. */
  consume: (foodId: string, dragonUid: string) => ConsumeResult;
  /** Seed cosmetic cho phiên hiển thị. */
  seed?: string;
  /** Đêm theo giờ địa phương (lớp hiển thị); mặc định luôn ngày. */
  isNight?: () => boolean;
  /** Rồng đang có hạn chế sức khỏe (ca chăm sóc mở…): không cất cánh. Mặc định: không. */
  healthRestricted?: (uid: string) => boolean;
}

/**
 * Đi tới thức ăn nhanh hơn đi dạo (thức ăn chỉ tồn tại 12 s): nhịp bước tăng theo cùng tỉ lệ vì pha
 * clip tính theo quãng đường, nên chân vẫn không trượt.
 */
export const HURRY_FACTOR = 2.4;

function speedOf(a: Agent): number {
  const hurry = a.state === 'seekFood' ? HURRY_FACTOR : 1;
  if (a.airborne) return clipSpeed(a.speciesId, a.stage, 'fly') * (a.state === 'seekFood' ? 1.5 : 1);
  if (a.mobility.swim && inWaterAgent(a)) return clipSpeed(a.speciesId, a.stage, 'swim') * hurry;
  return clipSpeed(a.speciesId, a.stage, 'walk') * hurry;
}

function inWaterAgent(a: Agent): boolean {
  const r = regionOf(a.habitatId);
  return !!r && !a.airborne && inWater(r, a.pos);
}

/** Vật cản rắn chặn rồng này lúc này: bay thì không gì. Mặt nước xét riêng (`blocksWater`). */
export function blockingObstacles(a: Pick<Agent, 'airborne' | 'mobility'>, region: HabitatRegion): Obstacle[] {
  if (a.airborne) return [];
  return region.obstacles.filter((o) => o.kind === 'solid');
}

/** Mặt nước chặn rồng không biết bơi khi đang ở trên đất. */
export function blocksWater(a: Pick<Agent, 'airborne' | 'mobility'>): boolean {
  return !a.airborne && !a.mobility.swim;
}

/** Điểm có thể đứng được cho rồng (đi bộ: không trong nước/vật cản). */
export function reachable(a: Pick<Agent, 'mobility'>, region: HabitatRegion, p: Vec): boolean {
  if (p.x < region.x0 || p.x > region.x1 || p.y < region.y0 || p.y > region.y1) return false;
  const walker = { airborne: false, mobility: a.mobility };
  if (blocksWater(walker) && inWater(region, p)) return false;
  return blockingObstacles(walker, region).every((o) => obstacleDistance(o, p, BODY_RADIUS * 0.5) >= 1);
}

function randomPoint(rng: Rng, region: HabitatRegion, ok: (p: Vec) => boolean): Vec {
  const m = 30;
  for (let i = 0; i < 24; i++) {
    const p = { x: region.x0 + m + rng.next() * (region.x1 - region.x0 - 2 * m), y: region.y0 + m + rng.next() * (region.y1 - region.y0 - 2 * m) };
    if (ok(p)) return p;
  }
  return { x: (region.x0 + region.x1) / 2, y: region.y0 + m };
}

const WANDER_CHANCE: Record<Personality, number> = { playful: 0.7, curious: 0.6, calm: 0.35, shy: 0.3 };

/** Dự phòng thời gian phản ứng (quyết định ~1 Hz) khi ước lượng có kịp tới thức ăn không, giây. */
export const FOOD_REACT_MARGIN_S = 1;

function segmentsCross(a: Vec, b: Vec, c: Vec, d: Vec): boolean {
  const o = (p: Vec, q: Vec, r: Vec) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

/** Đoạn thẳng a→b có cắt mặt nước không. */
export function crossesWater(region: HabitatRegion, a: Vec, b: Vec): boolean {
  const w = region.water;
  if (!w) return false;
  if (inWater(region, a) || inWater(region, b)) return true;
  for (let i = 0; i < w.length; i++) {
    const [x1, y1] = w[i] ?? [0, 0];
    const [x2, y2] = w[(i + 1) % w.length] ?? [0, 0];
    if (segmentsCross(a, b, { x: x1, y: y1 }, { x: x2, y: y2 })) return true;
  }
  return false;
}

/**
 * Quãng đường ước lượng (px cảnh) để đi bộ từ a tới b: thẳng nếu không cắt mặt nước (hoặc rồng bơi được),
 * nếu cắt thì vòng qua mép trên/dưới hồ (chọn đường ngắn hơn nằm trong vùng đi); Infinity nếu không có đường.
 */
export function walkPathLength(a: Pick<Agent, 'mobility'>, region: HabitatRegion, from: Vec, to: Vec): number {
  const direct = len(sub(to, from));
  if (a.mobility.swim || !region.water || !crossesWater(region, from, to)) return direct;
  const xs = region.water.map(([x]) => x);
  const ys = region.water.map(([, y]) => y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const m = BODY_RADIUS;
  let best = Infinity;
  for (const yy of [minY - m, maxY + m]) {
    if (yy < region.y0 || yy > region.y1) continue;
    const p1 = { x: Math.min(maxX, Math.max(minX, from.x)), y: yy };
    const p2 = { x: Math.min(maxX, Math.max(minX, to.x)), y: yy };
    const l = len(sub(p1, from)) + len(sub(p2, p1)) + len(sub(to, p2));
    if (l < best) best = l;
  }
  return best;
}

export class LivingWorld {
  readonly agents = new Map<string, Agent>();
  readonly food = new Map<string, FoodVisual>();
  /** Thời gian mô phỏng hiển thị (ms), chỉ tăng khi `step` được gọi. */
  private simMs = 0;
  private acc = 0;
  private pendingDrops: { habitatId: string; pos: Vec }[] = [];
  private readonly seed: string;

  constructor(private readonly opts: LivingWorldOptions) {
    this.seed = opts.seed ?? 'dravio-world';
  }

  get timeMs(): number {
    return this.simMs;
  }

  /** Ghi nhớ vị trí người chơi bấm thả thức ăn; gán cho viên thức ăn mới xuất hiện trong state. */
  noteDrop(habitatId: string, pos: Vec): void {
    this.pendingDrops.push({ habitatId, pos });
  }

  /** Lệnh `feed` bị từ chối: bỏ vị trí vừa ghi nhớ. */
  cancelDrop(habitatId: string): void {
    for (let i = this.pendingDrops.length - 1; i >= 0; i--) {
      if (this.pendingDrops[i]?.habitatId === habitatId) {
        this.pendingDrops.splice(i, 1);
        return;
      }
    }
  }

  /** Đồng bộ với GameState (gọi khi state đổi, ~1 Hz). Không sửa state. */
  sync(state: GameState): void {
    const present = new Set<string>();
    for (const d of state.dragons) {
      if (d.location.kind !== 'zone' || d.location.zoneId !== 'origin' || !d.location.habitatId) continue;
      const region = regionOf(d.location.habitatId);
      if (!region) continue;
      present.add(d.uid);
      const existing = this.agents.get(d.uid);
      if (existing && existing.habitatId === d.location.habitatId) {
        this.refresh(existing, d);
      } else {
        this.agents.set(d.uid, this.spawn(d, region));
      }
    }
    for (const uid of [...this.agents.keys()]) if (!present.has(uid)) this.agents.delete(uid);

    const foodIds = new Set(state.food.drops.map((f) => f.id));
    for (const id of [...this.food.keys()]) if (!foodIds.has(id)) this.food.delete(id);
    for (const f of state.food.drops) {
      if (this.food.has(f.id) || f.zoneId !== 'origin') continue;
      const region = regionOf(f.habitatId);
      if (!region) continue;
      const idx = this.pendingDrops.findIndex((p) => p.habitatId === f.habitatId);
      let pos: Vec;
      const pending = idx >= 0 ? this.pendingDrops.splice(idx, 1)[0] : undefined;
      if (pending) {
        pos = pending.pos;
      } else {
        const r = createRng(hashSeed(this.seed, 'food', f.id));
        pos = randomPoint(r, region, (p) => reachable({ mobility: { walk: true, swim: false, fly: false } }, region, p));
      }
      this.food.set(f.id, { id: f.id, dietId: f.dietId, habitatId: f.habitatId, pos, expiresAtMs: f.expiresAtMs });
    }
  }

  private refresh(a: Agent, d: DragonInstance): void {
    const sp = getSpecies(d.speciesId);
    a.stage = growthStage(d.xpSec, sp);
    a.mutation = d.mutation;
    a.personality = d.personality;
    a.lastFeedXpAtMs = d.lastFeedXpAtMs;
  }

  private spawn(d: DragonInstance, region: HabitatRegion): Agent {
    const sp = getSpecies(d.speciesId);
    const rng = createRng(hashSeed(this.seed, 'agent', d.uid, region.habitatId));
    const mobility = mobilityOf(d.speciesId);
    const a: Agent = {
      uid: d.uid,
      speciesId: d.speciesId,
      habitatId: region.habitatId,
      stage: growthStage(d.xpSec, sp),
      mutation: d.mutation,
      personality: d.personality,
      mobility,
      activity: sp.anatomy.activity,
      pos: { x: 0, y: 0 },
      vel: { x: 0, y: 0 },
      z: 0,
      airborne: false,
      state: 'idle',
      stateUntil: 0,
      target: null,
      foodId: null,
      energy: 0.6 + rng.next() * 0.4,
      nextDecisionAt: this.simMs + rng.next() * DECISION_BASE_MS,
      facing: rng.next() < 0.5 ? 1 : -1,
      phase: rng.next() * 10,
      ignoredFood: new Map(),
      lastFeedXpAtMs: d.lastFeedXpAtMs,
      rng,
      anim: { state: 'idle', since: this.simMs, dist: 0 },
      landing: null,
      takeoffAt: 0,
      flightEndsAt: null,
      noFlightUntil: 0,
      nextBlinkAt: this.simMs + 3000 + rng.next() * 2000,
      blinkUntil: 0,
      care: null,
      oneShot: null,
    };
    a.pos = randomPoint(rng, region, (p) => reachable(a, region, p));
    return a;
  }

  /** Hiển thị chăm sóc (PR6 nối với HealthCase): injured giữ rồng nghỉ tại chỗ; recovery chạy một lần. */
  setCare(uid: string, care: CareVisual): void {
    const a = this.agents.get(uid);
    if (!a || a.care === care) return;
    a.care = care;
    if (care) {
      a.state = 'rest';
      a.target = null;
      a.foodId = null;
      if (a.airborne) this.land(a);
    }
    if (care === 'recovery') {
      const clip = resolveDragonClip(a.speciesId as CommonSpeciesId, 'recovery');
      a.oneShot = { state: 'recovery', until: this.simMs + (clip?.durationMs ?? 1500) };
    }
  }

  /** Clip vui một lần (ví dụ thành tựu, PR5). Không đổi GameState. */
  celebrate(uid: string): void {
    const a = this.agents.get(uid);
    if (!a || a.care === 'injured') return;
    const clip = resolveDragonClip(a.speciesId as CommonSpeciesId, 'happy');
    a.oneShot = { state: 'happy', until: this.simMs + (clip?.durationMs ?? 900) };
  }

  private land(a: Agent): void {
    if (a.airborne || a.z > 0.5) a.landing = { since: this.simMs, startZ: a.z };
    a.airborne = false;
    a.flightEndsAt = null;
  }

  private takeOff(a: Agent): boolean {
    if (!a.mobility.fly || a.airborne) return a.airborne;
    if (a.care || this.opts.healthRestricted?.(a.uid)) return false;
    const rule = flightRuleFor(a.speciesId as CommonSpeciesId, a.stage);
    if (rule) {
      if (this.simMs < a.noFlightUntil) return false;
      a.flightEndsAt = this.simMs + rule.minFlightMs + a.rng.next() * (rule.maxFlightMs - rule.minFlightMs);
      a.noFlightUntil = a.flightEndsAt + PRACTICE_FLIGHT_COOLDOWN_MS;
    } else a.flightEndsAt = null;
    a.airborne = true;
    a.landing = null;
    a.takeoffAt = this.simMs;
    return true;
  }

  /** Phản ứng khi người chơi vuốt ve thành công (lệnh `pet` đã được chấp nhận). */
  petReact(uid: string): void {
    const a = this.agents.get(uid);
    if (!a) return;
    a.state = 'pet';
    a.stateUntil = this.simMs + PET_MS;
    a.target = null;
    a.foodId = null;
    a.vel = { x: 0, y: 0 };
    if (a.airborne) this.land(a);
  }

  /**
   * Tiến mô phỏng hiển thị `dtMs` (đã chặn ≤ 100 ms bởi renderer). `nowMs` là giờ thật (Clock tiêm vào)
   * để so cooldown ăn và hạn thức ăn với save. Steering chạy bước cố định 50 ms.
   */
  step(dtMs: number, nowMs: number): void {
    this.acc += Math.max(0, dtMs);
    while (this.acc >= STEER_STEP_MS) {
      this.acc -= STEER_STEP_MS;
      this.simMs += STEER_STEP_MS;
      this.tick(STEER_STEP_MS / 1000, nowMs);
    }
  }

  private tick(dt: number, nowMs: number): void {
    const night = this.opts.isNight?.() ?? false;
    const positions = [...this.agents.values()];
    for (const a of positions) {
      const region = regionOf(a.habitatId);
      if (!region) continue;
      if (this.simMs >= a.nextDecisionAt) {
        this.decide(a, region, nowMs, night);
        a.nextDecisionAt = this.simMs + DECISION_BASE_MS + (a.rng.next() * 2 - 1) * DECISION_JITTER_MS;
      }
      this.move(a, region, dt, positions, nowMs);
      this.energy(a, dt);
      this.animate(a, region, dt);
    }
  }

  /** Chọn clip hiển thị từ trạng thái hành vi + vận động (ADR 0012). */
  private animate(a: Agent, region: HabitatRegion, dt: number): void {
    if (this.simMs >= a.nextBlinkAt) {
      a.blinkUntil = this.simMs + 140;
      a.nextBlinkAt = this.simMs + 3000 + a.rng.next() * 2000;
    }
    if (a.oneShot && this.simMs >= a.oneShot.until) {
      if (a.oneShot.state === 'recovery' && a.care === 'recovery') a.care = null;
      a.oneShot = null;
    }
    const speed = len(a.vel);
    let next: DragonAnimState;
    if (a.landing) next = 'landing';
    else if (a.oneShot) next = a.oneShot.state;
    else if (a.care === 'injured') next = 'injured';
    else if (a.state === 'pet') next = 'pet';
    else if (a.state === 'eat') next = 'eat';
    else if (a.state === 'sleep' || a.state === 'rest') next = 'sleep';
    else if (a.airborne) next = 'fly';
    else if (a.mobility.swim && inWater(region, a.pos)) next = 'swim';
    else if (speed > 3) next = 'walk';
    else next = 'idle';
    if (!resolveDragonClip(a.speciesId as CommonSpeciesId, next)) next = 'idle';
    if (next !== a.anim.state) a.anim = { state: next, since: this.simMs, dist: 0 };
    else a.anim.dist += speed * dt;
  }

  private wantsSleep(a: Agent, night: boolean): boolean {
    const offHours = (a.activity === 'day' && night) || (a.activity === 'night' && !night);
    return a.energy < 0.15 || (offHours && a.energy < 0.6);
  }

  private findFood(a: Agent, region: HabitatRegion, nowMs: number): FoodVisual | null {
    if (a.lastFeedXpAtMs !== undefined && nowMs - a.lastFeedXpAtMs < FEED_XP_COOLDOWN_MS) return null;
    const diets = getSpecies(a.speciesId).anatomy.dietIds;
    let best: FoodVisual | null = null;
    let bestD = Infinity;
    for (const f of this.food.values()) {
      if (f.habitatId !== a.habitatId || f.expiresAtMs <= nowMs || !diets.includes(f.dietId)) continue;
      if ((a.ignoredFood.get(f.id) ?? 0) > this.simMs) continue;
      // Bay được thì tới mọi chỗ (hạ xuống ăn trên đất cạnh đó); không thì phải đứng được ở chỗ thức ăn.
      if (!a.mobility.fly && !reachable(a, region, f.pos)) continue;
      // Có kịp tới trước khi thức ăn hết hạn không (TTL 12 s không đổi): quãng đường thật / tốc độ vội.
      if (this.etaSeconds(a, region, f.pos) > (f.expiresAtMs - nowMs) / 1000 - FOOD_REACT_MARGIN_S) continue;
      const d = len(sub(f.pos, a.pos));
      if (d < bestD) {
        best = f;
        bestD = d;
      }
    }
    return best;
  }

  /** Thời gian ước lượng (giây) để rồng tới vị trí: đi bộ/bơi theo đường thật, hoặc bay nếu đi bộ không tới được. */
  etaSeconds(a: Agent, region: HabitatRegion, to: Vec): number {
    const walk = walkPathLength(a, region, a.pos, to);
    const walkV = clipSpeed(a.speciesId, a.stage, 'walk') * HURRY_FACTOR;
    let eta = walk / walkV;
    if (a.mobility.fly && !a.care && !this.opts.healthRestricted?.(a.uid)) {
      const rule = flightRuleFor(a.speciesId as CommonSpeciesId, a.stage);
      if (!rule) eta = Math.min(eta, len(sub(to, a.pos)) / (clipSpeed(a.speciesId, a.stage, 'fly') * 1.5) + TAKEOFF_MS / 1000);
    }
    return eta;
  }

  /**
   * Vị trí thả thức ăn gợi ý cho phím Space: gần rồng phù hợp nhất (ăn được nhóm này, không ngủ/chăm sóc,
   * hết cooldown ăn), chỗ rồng đó đứng tới được. null nếu không có rồng phù hợp (lệnh feed vẫn thả ngẫu nhiên).
   * Không đổi TTL, cooldown, XP hay kinh tế — chỉ chọn chỗ hiển thị của viên thức ăn.
   */
  suggestDrop(habitatId: string, dietId: string, nowMs: number): Vec | null {
    const region = regionOf(habitatId);
    if (!region) return null;
    const eligible = [...this.agents.values()]
      .filter((a) => a.habitatId === habitatId && a.state !== 'sleep' && !a.care)
      .filter((a) => getSpecies(a.speciesId).anatomy.dietIds.includes(dietId as never))
      .filter((a) => a.lastFeedXpAtMs === undefined || nowMs - a.lastFeedXpAtMs >= FEED_XP_COOLDOWN_MS)
      .sort((x, y) => (x.uid < y.uid ? -1 : 1));
    for (const a of eligible) {
      for (const r of [60, 90, 40, 120]) {
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2 + (a.facing === 1 ? 0 : Math.PI);
          const p = { x: a.pos.x + Math.cos(ang) * r, y: a.pos.y + Math.sin(ang) * r * 0.35 };
          if (reachable(a, region, p) && this.etaSeconds(a, region, p) < 6) return p;
        }
      }
    }
    return null;
  }

  /** FSM: chọn trạng thái tiếp theo. Trạng thái có thời hạn (eat, pet) không bị ngắt. */
  private decide(a: Agent, region: HabitatRegion, nowMs: number, night: boolean): void {
    if ((a.state === 'eat' || a.state === 'pet') && this.simMs < a.stateUntil) return;
    for (const [id, until] of a.ignoredFood) if (until <= this.simMs || !this.food.has(id)) a.ignoredFood.delete(id);
    const food = this.findFood(a, region, nowMs);
    if (food && a.state !== 'sleep') {
      a.state = 'seekFood';
      a.foodId = food.id;
      a.target = food.pos;
      return;
    }
    if (a.state === 'seekFood' && a.foodId && this.food.has(a.foodId)) return;
    if (a.state === 'sleep') {
      if (a.energy > 0.95 && !this.wantsSleep(a, night)) a.state = 'idle';
      return;
    }
    if (this.wantsSleep(a, night)) {
      a.state = 'sleep';
      a.target = null;
      return;
    }
    if (a.state === 'rest') {
      if (a.energy > 0.7) a.state = 'idle';
      return;
    }
    if (a.energy < 0.35) {
      a.state = 'rest';
      a.target = null;
      return;
    }
    if (a.state === 'wander' && a.target) return;
    if (a.rng.next() < WANDER_CHANCE[a.personality]) {
      a.state = 'wander';
      const fly = a.mobility.fly && a.rng.next() < 0.4 && this.takeOff(a);
      const rule = fly ? flightRuleFor(a.speciesId as CommonSpeciesId, a.stage) : null;
      // Tập bay (Baby): chuyến ngắn quanh chỗ đang đứng, trong sinh cảnh hiện tại.
      const near = (p: Vec) => !rule || len(sub(p, a.pos)) < 140;
      a.target = randomPoint(a.rng, region, (p) => near(p) && reachable(a, region, p));
    } else {
      a.state = 'idle';
      a.target = null;
    }
  }

  private move(a: Agent, region: HabitatRegion, dt: number, all: readonly Agent[], nowMs: number): void {
    const moving = (a.state === 'wander' || a.state === 'seekFood') && a.target;
    // Hạ cánh: chỉ bay khi đang đi tới đích; nghỉ/ngủ/ăn phải ở trên đất (nơi đậu).
    if (a.airborne && a.state === 'seekFood' && a.target && len(sub(a.target, a.pos)) < 40) this.land(a);
    if (a.airborne && !moving) this.land(a);
    if (a.airborne && !a.mobility.fly) this.land(a);
    // Luật tập bay (Zephyr Baby): hết giờ thì bắt buộc hạ cánh, kể cả chưa tới đích.
    if (a.airborne && a.flightEndsAt !== null && this.simMs >= a.flightEndsAt) {
      this.land(a);
      if (a.state === 'wander') {
        a.state = 'idle';
        a.target = null;
      }
    }
    const cruise = flightAltitude(a.speciesId, a.stage);
    if (a.airborne) {
      const u = Math.min(1, (this.simMs - a.takeoffAt) / TAKEOFF_MS);
      a.z = Math.max(a.z, cruise * u * u * (3 - 2 * u));
    } else if (a.landing) {
      const clip = resolveDragonClip(a.speciesId as CommonSpeciesId, 'landing');
      if (clip) {
        const t = Math.min(1, (this.simMs - a.landing.since) / clip.durationMs);
        a.z = altitudeAt(a.speciesId as CommonSpeciesId, clip, a.stage, t, a.landing.startZ / DRAGON_SCENE_SCALE) * DRAGON_SCENE_SCALE;
        if (t >= 1) a.landing = null;
      } else {
        a.z = 0;
        a.landing = null;
      }
    } else a.z = 0;

    let desired = { x: 0, y: 0 };
    const maxSpeed = speedOf(a);
    if (moving && a.target) desired = arrive(a.pos, a.target, maxSpeed, 50);
    const blocked = blockingObstacles(a, region);
    let steer = sub(desired, a.vel);
    steer = add(steer, avoid(a.pos, a.vel, blocked, BODY_RADIUS, 70));
    steer = add(steer, contain(a.pos, region, maxSpeed));
    steer = add(steer, separate(a.pos, all.filter((o) => o !== a && o.habitatId === a.habitatId).map((o) => o.pos), BODY_RADIUS * 2.2, maxSpeed * 0.8));
    a.vel = limit(add(a.vel, scale(limit(steer, maxSpeed * 4), dt)), maxSpeed);
    if (!moving) a.vel = scale(a.vel, Math.max(0, 1 - dt * 6));
    a.pos = resolve(add(a.pos, scale(a.vel, dt)), region, blocked, BODY_RADIUS * 0.5, blocksWater(a));
    const speed = len(a.vel);
    if (Math.abs(a.vel.x) > 4) a.facing = a.vel.x > 0 ? 1 : -1;
    a.phase += dt * (speed > 3 ? speed / 25 : 1);

    if (a.state === 'wander' && a.target && len(sub(a.target, a.pos)) < 12) {
      a.state = 'idle';
      a.target = null;
    }
    if (a.state === 'seekFood') {
      const f = a.foodId ? this.food.get(a.foodId) : undefined;
      if (!f || f.expiresAtMs <= nowMs) {
        a.state = 'idle';
        a.foodId = null;
        a.target = null;
        return;
      }
      if (len(sub(f.pos, a.pos)) <= REACH && !a.airborne && a.z < 1) {
        const r = this.opts.consume(f.id, a.uid);
        a.foodId = null;
        a.target = null;
        if (r === 'ok') {
          this.food.delete(f.id);
          a.state = 'eat';
          a.stateUntil = this.simMs + EAT_MS;
          a.lastFeedXpAtMs = nowMs;
        } else {
          a.ignoredFood.set(f.id, this.simMs + FOOD_RETRY_MS);
          a.state = 'idle';
        }
        a.vel = { x: 0, y: 0 };
      } else if (a.mobility.fly && !reachable(a, region, f.pos)) {
        // Thức ăn ở chỗ không đứng được (ví dụ giữa hồ) và rồng không bơi: bay tới rồi bỏ qua.
        if (len(sub(f.pos, a.pos)) < 40) {
          a.ignoredFood.set(f.id, this.simMs + FOOD_RETRY_MS);
          a.state = 'idle';
          a.foodId = null;
          a.target = null;
        } else this.takeOff(a);
      }
    }
    if ((a.state === 'eat' || a.state === 'pet') && this.simMs >= a.stateUntil) a.state = 'idle';
  }

  private energy(a: Agent, dt: number): void {
    const rate = a.state === 'sleep' ? 0.06 : a.state === 'rest' ? 0.04 : a.state === 'wander' || a.state === 'seekFood' ? (a.airborne ? -0.025 : -0.012) : -0.003;
    a.energy = Math.min(1, Math.max(0, a.energy + rate * dt));
  }
}
