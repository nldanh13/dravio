import {
  DIET_IDS,
  FEED_XP_COOLDOWN_MS,
  FOOD_MAX_BASE,
  FOOD_SPAWN_INTERVAL_MS,
  FOOD_TTL_MS,
  OFFLINE_RECEIPT_MIN_MS,
  PET_COOLDOWN_MS,
  PROCESSED_REQUEST_LIMIT,
  feedXpSec,
  type DietId,
} from '../../data/care';
import { getSpecies } from '../../data/dragons';
import type { DragonInstance } from '../../types/game';
import type { GameState } from '../../types/state';
import { gainBond } from '../biology/bond';
import { normalizeNickname } from '../inventory/nickname';
import { addXp, advanceDragon } from '../progression/growth';
import { findZone, habitatZone, isProducing } from '../world/placement';
import { computeElapsed, type Clock } from './clock';
import { commandError, type CommandError } from './errors';
import type { DomainEvent } from './events';

/**
 * Command bus thuần (GDD Phụ lục C.3). UI chỉ gửi lệnh; mọi thay đổi state, thời gian,
 * vàng và XP đi qua `dispatch`. Lệnh không hợp lệ không đổi state.
 */

export type Command =
  | { type: 'advanceTime'; requestId: string; mode: 'online' | 'offline' }
  /** Người chơi thả một viên thức ăn vào microhabitat. */
  | { type: 'feed'; requestId: string; dietId: DietId; zoneId: string; habitatId: string }
  /**
   * Engine xác nhận một rồng ăn viên thức ăn (do mô phỏng/va chạm phát lệnh, không phải UI tự báo XP).
   * Ở PR1 chưa có renderer: test phát lệnh này như fixture engine.
   */
  | { type: 'consumeFood'; requestId: string; foodId: string; dragonUid: string }
  | { type: 'pet'; requestId: string; dragonUid: string }
  | { type: 'renameDragon'; requestId: string; dragonUid: string; nickname: string | null };

export interface CommandContext {
  clock: Clock;
}

export type DispatchResult =
  | { ok: true; state: GameState; events: DomainEvent[]; duplicate: boolean }
  | { ok: false; state: GameState; error: CommandError };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;

/** Kiểm tra hình dạng lệnh ở ranh giới (enum, ID, kiểu). */
export function parseCommand(input: unknown): Command | null {
  if (!isObj(input) || !isId(input.requestId) || typeof input.type !== 'string') return null;
  const { requestId } = input;
  switch (input.type) {
    case 'advanceTime':
      return input.mode === 'online' || input.mode === 'offline' ? { type: 'advanceTime', requestId, mode: input.mode } : null;
    case 'feed':
      return (DIET_IDS as readonly unknown[]).includes(input.dietId) && isId(input.zoneId) && isId(input.habitatId)
        ? { type: 'feed', requestId, dietId: input.dietId as DietId, zoneId: input.zoneId, habitatId: input.habitatId }
        : null;
    case 'consumeFood':
      return isId(input.foodId) && isId(input.dragonUid) ? { type: 'consumeFood', requestId, foodId: input.foodId, dragonUid: input.dragonUid } : null;
    case 'pet':
      return isId(input.dragonUid) ? { type: 'pet', requestId, dragonUid: input.dragonUid } : null;
    case 'renameDragon':
      return isId(input.dragonUid) && (input.nickname === null || typeof input.nickname === 'string') && (input.nickname?.length ?? 0) <= 1024
        ? { type: 'renameDragon', requestId, dragonUid: input.dragonUid, nickname: input.nickname as string | null }
        : null;
    default:
      return null;
  }
}

type Handled = { ok: true; state: GameState; events: DomainEvent[] } | { ok: false; error: CommandError };

function replaceDragon(state: GameState, dragon: DragonInstance): GameState {
  return { ...state, dragons: state.dragons.map((d) => (d.uid === dragon.uid ? dragon : d)) };
}

function findDragon(state: GameState, uid: string): DragonInstance | undefined {
  return state.dragons.find((d) => d.uid === uid);
}

/** Xóa thức ăn đã hết hạn tại thời điểm nowMs. */
function expireFood(state: GameState, nowMs: number): { state: GameState; events: DomainEvent[] } {
  const expired = state.food.drops.filter((f) => f.expiresAtMs <= nowMs);
  if (expired.length === 0) return { state, events: [] };
  return {
    state: { ...state, food: { ...state.food, drops: state.food.drops.filter((f) => f.expiresAtMs > nowMs) } },
    events: expired.map((f) => ({ type: 'foodExpired', foodId: f.id })),
  };
}

/**
 * Tiến thời gian tới nowMs: XP 100% cho mọi rồng chưa thả, vàng theo mốc stage cho rồng sản xuất
 * (online 100%, offline 75%), elapsed chặn 24h, đồng hồ lùi giữ high-water mark. Không sinh thiên tai.
 */
function settleTime(state: GameState, nowMs: number, mode: 'online' | 'offline'): { state: GameState; events: DomainEvent[] } {
  const { elapsedMs, next } = computeElapsed(state.clock, nowMs);
  const events: DomainEvent[] = [];
  let remainder = state.goldRemainder;
  let gold = 0;
  const matured: string[] = [];
  const dragons = state.dragons.map((d) => {
    if (d.location.kind === 'released' || elapsedMs === 0) return d;
    const r = advanceDragon(d, elapsedMs, isProducing(state, d), mode, remainder);
    remainder = r.remainder;
    gold += r.goldMicro;
    for (const c of r.stageChanges) {
      events.push({ type: 'stageChanged', dragonUid: d.uid, from: c.from, to: c.to });
      if (c.to === 'adult') matured.push(d.uid);
    }
    return { ...d, xpSec: r.xpMs / 1000 };
  });
  let out: GameState = {
    ...state,
    dragons,
    goldMicro: state.goldMicro + gold,
    goldRemainder: remainder,
    totalGoldEarnedMicro: state.totalGoldEarnedMicro + gold,
    clock: next,
  };
  events.unshift({ type: 'timeAdvanced', fromMs: state.clock.lastProcessedAtMs, toMs: next.lastProcessedAtMs, elapsedMs, mode, goldMicro: gold });
  if (mode === 'offline' && elapsedMs > OFFLINE_RECEIPT_MIN_MS) {
    const receipt = {
      id: `offline-${next.lastProcessedAtMs}`,
      fromMs: next.lastProcessedAtMs - elapsedMs,
      toMs: next.lastProcessedAtMs,
      goldMicro: gold,
      maturedIds: matured,
      bonusClaimed: false,
      createdAtMs: next.lastProcessedAtMs,
    };
    out = { ...out, offlineReceipt: receipt };
    events.push({ type: 'offlineReceiptCreated', receiptId: receipt.id, goldMicro: gold, elapsedMs });
  }
  const exp = expireFood(out, next.lastProcessedAtMs);
  return { state: exp.state, events: [...events, ...exp.events] };
}

function handle(state: GameState, cmd: Command, nowMs: number): Handled {
  switch (cmd.type) {
    case 'advanceTime':
      return { ok: true, ...settleTime(state, nowMs, cmd.mode) };

    case 'feed': {
      const zone = findZone(state, cmd.zoneId);
      if (!zone?.unlocked) return { ok: false, error: commandError('zone-locked') };
      if (habitatZone(cmd.habitatId) !== cmd.zoneId || !zone.unlockedHabitatIds.includes(cmd.habitatId)) {
        return { ok: false, error: commandError('habitat-locked') };
      }
      const { state: s1, events } = expireFood(state, nowMs);
      const last = s1.food.lastSpawnAtMs;
      if (last !== null && nowMs - last < FOOD_SPAWN_INTERVAL_MS) {
        return { ok: false, error: commandError('food-too-fast') };
      }
      if (s1.food.drops.length >= FOOD_MAX_BASE + s1.upgrades.foodCooldownLevel) {
        return { ok: false, error: commandError('food-limit') };
      }
      const id = `food-${cmd.requestId}`;
      const drop = { id, dietId: cmd.dietId, zoneId: cmd.zoneId, habitatId: cmd.habitatId, spawnedAtMs: nowMs, expiresAtMs: nowMs + FOOD_TTL_MS };
      return {
        ok: true,
        state: {
          ...s1,
          food: { lastSpawnAtMs: nowMs, drops: [...s1.food.drops, drop] },
          stats: { ...s1.stats, totalFeedClicks: s1.stats.totalFeedClicks + 1 },
        },
        events: [...events, { type: 'foodSpawned', foodId: id, dietId: drop.dietId, zoneId: drop.zoneId, habitatId: drop.habitatId, expiresAtMs: drop.expiresAtMs }],
      };
    }

    case 'consumeFood': {
      const dragon = findDragon(state, cmd.dragonUid);
      if (!dragon) return { ok: false, error: commandError('unknown-dragon') };
      const drop = state.food.drops.find((f) => f.id === cmd.foodId);
      if (!drop) return { ok: false, error: commandError('unknown-food') };
      if (drop.expiresAtMs <= nowMs) return { ok: false, error: commandError('food-expired') };
      if (dragon.location.kind !== 'zone' || dragon.activity !== 'idle') return { ok: false, error: commandError('dragon-unavailable') };
      if (dragon.location.zoneId !== drop.zoneId || dragon.location.habitatId !== drop.habitatId) {
        return { ok: false, error: commandError('wrong-place') };
      }
      if (!getSpecies(dragon.speciesId).anatomy.dietIds.includes(drop.dietId)) return { ok: false, error: commandError('wrong-diet') };
      if (dragon.lastFeedXpAtMs !== undefined && nowMs - dragon.lastFeedXpAtMs < FEED_XP_COOLDOWN_MS) {
        return { ok: false, error: commandError('feed-cooldown') };
      }
      // Quyết toán thời gian trước để vàng tới lúc ăn tính theo stage cũ.
      const settled = settleTime(state, nowMs, 'online');
      const d0 = findDragon(settled.state, dragon.uid) ?? dragon;
      const xpSec = feedXpSec(settled.state.upgrades.foodQualityLevel);
      const grown = addXp(d0, xpSec);
      const fed: DragonInstance = { ...d0, xpSec: grown.xpMs / 1000, lastFeedXpAtMs: nowMs };
      const bonded = gainBond(fed, nowMs);
      const events: DomainEvent[] = [...settled.events, { type: 'foodConsumed', foodId: drop.id, dragonUid: dragon.uid, xpGainedSec: xpSec }];
      for (const c of grown.stageChanges) events.push({ type: 'stageChanged', dragonUid: dragon.uid, from: c.from, to: c.to });
      if (bonded.gained) events.push({ type: 'bondChanged', dragonUid: dragon.uid, from: d0.bond, to: bonded.dragon.bond, source: 'feed' });
      const s2 = replaceDragon(settled.state, bonded.dragon);
      return { ok: true, state: { ...s2, food: { ...s2.food, drops: s2.food.drops.filter((f) => f.id !== drop.id) } }, events };
    }

    case 'pet': {
      const dragon = findDragon(state, cmd.dragonUid);
      if (!dragon) return { ok: false, error: commandError('unknown-dragon') };
      if (dragon.location.kind === 'released') return { ok: false, error: commandError('dragon-unavailable') };
      if (dragon.lastPetAtMs !== undefined && nowMs - dragon.lastPetAtMs < PET_COOLDOWN_MS) {
        return { ok: false, error: commandError('pet-cooldown') };
      }
      const bonded = gainBond({ ...dragon, lastPetAtMs: nowMs }, nowMs);
      const events: DomainEvent[] = [{ type: 'dragonPetted', dragonUid: dragon.uid }];
      if (bonded.gained) events.push({ type: 'bondChanged', dragonUid: dragon.uid, from: dragon.bond, to: bonded.dragon.bond, source: 'pet' });
      return { ok: true, state: replaceDragon(state, bonded.dragon), events };
    }

    case 'renameDragon': {
      const dragon = findDragon(state, cmd.dragonUid);
      if (!dragon) return { ok: false, error: commandError('unknown-dragon') };
      if (cmd.nickname === null) {
        const { nickname: _removed, ...rest } = dragon;
        void _removed;
        return { ok: true, state: replaceDragon(state, rest), events: [{ type: 'dragonRenamed', dragonUid: dragon.uid, nickname: null }] };
      }
      const n = normalizeNickname(cmd.nickname);
      if (!n.ok) return { ok: false, error: commandError(n.code) };
      return {
        ok: true,
        state: replaceDragon(state, { ...dragon, nickname: n.value }),
        events: [{ type: 'dragonRenamed', dragonUid: dragon.uid, nickname: n.value }],
      };
    }
  }
}

/**
 * Điểm vào duy nhất để đổi GameState.
 * - Lệnh sai hình dạng → `invalid-command`, state giữ nguyên.
 * - requestId đã xử lý → trả lại state hiện tại, `duplicate: true`, không có event.
 * - Thành công → revision + 1, ghi requestId (giữ 200 gần nhất).
 */
export function dispatch(state: GameState, input: unknown, ctx: CommandContext): DispatchResult {
  const cmd = parseCommand(input);
  if (!cmd) return { ok: false, state, error: commandError('invalid-command') };
  if (state.processedRequestIds.includes(cmd.requestId)) return { ok: true, state, events: [], duplicate: true };
  // Đồng hồ lùi không được dùng để né cooldown: thời điểm hiệu lực không nhỏ hơn high-water mark.
  const nowMs = Math.max(ctx.clock.nowMs(), state.clock.highWaterAtMs);
  const result = handle(state, cmd, nowMs);
  if (!result.ok) return { ok: false, state, error: result.error };
  const processed = [...result.state.processedRequestIds, cmd.requestId].slice(-PROCESSED_REQUEST_LIMIT);
  return {
    ok: true,
    state: { ...result.state, revision: state.revision + 1, processedRequestIds: processed },
    events: result.events,
    duplicate: false,
  };
}

