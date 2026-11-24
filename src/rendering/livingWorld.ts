import { FEED_XP_COOLDOWN_MS } from '../data/care';
import { getSpecies } from '../data/dragons';
import { createRng, hashSeed, type Rng } from '../engine/core/rng';
import { growthStage } from '../engine/economy/rates';
import type { DragonInstance, GrowthStage, MutationType, Personality } from '../types/game';
import type { GameState } from '../types/state';
import { regionOf, inWater, type HabitatRegion, type Obstacle, type Vec } from './originLayout';
import { add, arrive, avoid, contain, len, limit, resolve, scale, separate, sub } from './steering';

/**
 * Thế giới sống của Khởi Nguyên (G1 PR4; ADR 0011). Mô phỏng hiển thị thuần TypeScript, không DOM:
 * - FSM hành vi: idle · wander · seekFood · eat · rest · sleep · pet. Quyết định ~1 Hz có jitter (GDD trang 7).
 * - Steering bước cố định 20 Hz (GDD: 10–30 Hz), độc lập với tần số khung hình.
 * - Di chuyển theo giải phẫu: chỉ loài có `fly` mới bay, `swim` mới xuống nước, còn lại đi bộ.
 * Toạ độ, vận tốc, năng lượng là trạng thái hiển thị **chỉ trong bộ nhớ**, không vào GameState/save.
 * Mọi thay đổi gameplay đi qua lệnh (`consumeFood`) do callback gửi — renderer không tự cộng XP/vàng.
 * RNG riêng (cosmetic) có seed theo rồng, không dùng RNG domain, không `Math.random`.
 */

export type BehaviorState = 'idle' | 'wander' | 'seekFood' | 'eat' | 'rest' | 'sleep' | 'pet';

export const STEER_STEP_MS = 50;
export const DECISION_BASE_MS = 1000;
export const DECISION_JITTER_MS = 300;
export const EAT_MS = 600;
export const PET_MS = 1000;
/** Bán kính "chạm" thức ăn, đơn vị thế giới. */
export const REACH = 22;
export const BODY_RADIUS = 18;
const FLY_ALTITUDE = 70;
const FOOD_RETRY_MS = 8000;

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
}

function speedOf(a: Agent): number {
  const base = a.airborne ? 95 : a.mobility.swim && inWaterAgent(a) ? 70 : 58;
  const stage = a.stage === 'baby' ? 0.75 : a.stage === 'juvenile' ? 0.9 : 1;
  return base * stage;
}

function inWaterAgent(a: Agent): boolean {
  const r = regionOf(a.habitatId);
  return !!r && !a.airborne && inWater(r, a.pos);
}

/** Vật cản chặn rồng này lúc này: bay thì không gì; bơi thì chỉ `solid`; đi bộ thì cả mặt nước. */
export function blockingObstacles(a: Pick<Agent, 'airborne' | 'mobility'>, region: HabitatRegion): Obstacle[] {
  if (a.airborne) return [];
  return region.obstacles.filter((o) => o.kind === 'solid' || (o.kind === 'water' && !a.mobility.swim));
}

/** Điểm có thể đứng được cho rồng (đi bộ: không trong nước/vật cản). */
export function reachable(a: Pick<Agent, 'mobility'>, region: HabitatRegion, p: Vec): boolean {
  if (p.x < region.x0 || p.x > region.x1 || p.y < region.y0 || p.y > region.y1) return false;
  const blocked = blockingObstacles({ airborne: false, mobility: a.mobility }, region);
  return blocked.every((o) => Math.hypot(p.x - o.x, p.y - o.y) >= o.r + BODY_RADIUS * 0.5);
}

function randomPoint(rng: Rng, region: HabitatRegion, ok: (p: Vec) => boolean): Vec {
  const m = 40;
  for (let i = 0; i < 24; i++) {
    const p = { x: region.x0 + m + rng.next() * (region.x1 - region.x0 - 2 * m), y: region.y0 + m + rng.next() * (region.y1 - region.y0 - 2 * m) };
    if (ok(p)) return p;
  }
  return { x: (region.x0 + region.x1) / 2, y: region.y0 + m };
}

const WANDER_CHANCE: Record<Personality, number> = { playful: 0.7, curious: 0.6, calm: 0.35, shy: 0.3 };

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
    };
    a.pos = randomPoint(rng, region, (p) => reachable(a, region, p));
    return a;
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
    a.airborne = false;
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
    }
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
      const d = len(sub(f.pos, a.pos));
      if (d < bestD) {
        best = f;
        bestD = d;
      }
    }
    return best;
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
      const fly = a.mobility.fly && a.rng.next() < 0.4;
      a.target = randomPoint(a.rng, region, (p) => fly || reachable(a, region, p));
      a.airborne = fly;
    } else {
      a.state = 'idle';
      a.target = null;
    }
  }

  private move(a: Agent, region: HabitatRegion, dt: number, all: readonly Agent[], nowMs: number): void {
    const moving = (a.state === 'wander' || a.state === 'seekFood') && a.target;
    // Hạ cánh: chỉ bay khi đang đi tới đích; nghỉ/ngủ/ăn phải ở trên đất (nơi đậu).
    if (a.state === 'seekFood' && a.target && len(sub(a.target, a.pos)) < 60) a.airborne = false;
    if (!moving) a.airborne = false;
    if (a.airborne && !a.mobility.fly) a.airborne = false;
    const targetZ = a.airborne ? FLY_ALTITUDE : 0;
    a.z += (targetZ - a.z) * Math.min(1, dt * 3);
    if (a.z < 0.5 && !a.airborne) a.z = 0;

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
    a.pos = resolve(add(a.pos, scale(a.vel, dt)), region, blocked, BODY_RADIUS * 0.5);
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
      if (len(sub(f.pos, a.pos)) <= REACH && !a.airborne && a.z < 4) {
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
        if (len(sub(f.pos, a.pos)) < 60) {
          a.ignoredFood.set(f.id, this.simMs + FOOD_RETRY_MS);
          a.state = 'idle';
          a.foodId = null;
          a.target = null;
        } else a.airborne = true;
      }
    }
    if ((a.state === 'eat' || a.state === 'pet') && this.simMs >= a.stateUntil) a.state = 'idle';
  }

  private energy(a: Agent, dt: number): void {
    const rate = a.state === 'sleep' ? 0.06 : a.state === 'rest' ? 0.04 : a.state === 'wander' || a.state === 'seekFood' ? (a.airborne ? -0.025 : -0.012) : -0.003;
    a.energy = Math.min(1, Math.max(0, a.energy + rate * dt));
  }
}
