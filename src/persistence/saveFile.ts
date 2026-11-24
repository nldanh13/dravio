import { DRAGON_SPECIES } from '../data/dragons';
import { validateGameState } from '../engine/core/validation';
import type { DragonInstance } from '../types/game';
import { SCHEMA_VERSION, type GameState } from '../types/state';
import { migrateState } from './migrations';
import { SAVE_FORMAT, canonicalJson, sha256Hex } from './schema';

/**
 * Đọc một chuỗi save (từ IndexedDB hoặc file import) thành GameState đã kiểm (GDD 3.1 trang 18; ADR 0006).
 * Không bao giờ ném lỗi: trả mã lỗi có kiểu để UI hiển thị bằng i18n `saveError.*`.
 */

export type SaveErrorCode =
  | 'too-large'
  | 'corrupt-json'
  | 'bad-format'
  | 'bad-checksum'
  | 'newer-version'
  | 'unsupported-version'
  | 'migration-failed'
  | 'invalid-state';

export interface ParsedSave {
  state: GameState;
  savedAtMs: number;
  /** `schemaVersion` gốc nếu save đã được migrate lên SCHEMA_VERSION (ví dụ 3 = bản phát triển trước v1). */
  migratedFrom: number | null;
  warnings: string[];
}

export type ParseResult = { ok: true; save: ParsedSave } | { ok: false; code: SaveErrorCode; details: string[] };

/** Giới hạn kích thước file save (5 MB): save P0 thực tế < 200 KB. */
export const MAX_SAVE_BYTES = 5 * 1024 * 1024;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const fail = (code: SaveErrorCode, details: string[] = []): ParseResult => ({ ok: false, code, details });

export async function parseSaveText(text: string): Promise<ParseResult> {
  if (new TextEncoder().encode(text).length > MAX_SAVE_BYTES) return fail('too-large');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('corrupt-json');
  }
  if (!isObj(raw)) return fail('bad-format');

  if (raw.format !== SAVE_FORMAT) return fail('bad-format');
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version)) return fail('bad-format', ['schemaVersion']);
  if (typeof raw.checksum !== 'string' || !isObj(raw.state)) return fail('bad-format', ['checksum/state']);
  if (raw.state.schemaVersion !== version) return fail('bad-format', ['state.schemaVersion']);
  // Checksum kiểm trên state đúng như đã ghi, trước mọi migration.
  const actual = await sha256Hex(canonicalJson(raw.state));
  if (actual !== raw.checksum) return fail('bad-checksum');
  // Save do bản mới hơn ghi → 'newer-version': không đọc, không ghi đè.
  const m = migrateState(version, raw.state);
  if (!m.ok) return fail(m.code, m.details);
  const v = validateGameState(m.state);
  if (!v.ok) return fail(version === SCHEMA_VERSION ? 'invalid-state' : 'migration-failed', v.errors);
  const savedAtMs = typeof raw.savedAtMs === 'number' && Number.isSafeInteger(raw.savedAtMs) ? raw.savedAtMs : v.state.clock.lastProcessedAtMs;
  return { ok: true, save: { state: v.state, savedAtMs, migratedFrom: version === SCHEMA_VERSION ? null : version, warnings: [] } };
}

const STATE_KEYS: readonly (keyof GameState)[] = [
  'schemaVersion', 'contentVersion', 'saveId', 'revision', 'goldMicro', 'goldRemainder', 'totalGoldEarnedMicro',
  'dragons', 'zones', 'productionDragonIds', 'inventory', 'upgrades', 'food', 'processedRequestIds', 'pityCount',
  'stats', 'settings', 'clock', 'offlineReceipt', 'discoveries',
];

/** Khóa rồng được phép đi qua import. `registryRef` (Verified) và mọi khóa lạ bị bỏ. */
const DRAGON_KEYS: readonly (keyof DragonInstance)[] = [
  'uid', 'speciesId', 'nickname', 'genotype', 'mutation', 'xpSec', 'locked', 'location', 'hatchedAtMs', 'personality',
  'bond', 'bondDay', 'bondDaily', 'lastFeedXpAtMs', 'lastPetAtMs', 'parentIds', 'grandparentIds', 'generation',
  'ancestry', 'origin', 'activity', 'breedCooldownUntilMs',
];

function pick<T extends object>(obj: T, keys: readonly (keyof T)[]): T {
  const out: Partial<T> = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out as T;
}

export interface ImportSanitizeReport {
  droppedStateKeys: string[];
  droppedDragonKeys: string[];
}

/**
 * Import là dữ liệu do người chơi kiểm soát (checksum chỉ chống hỏng file, không phải chữ ký).
 * Bỏ mọi entitlement/quyền mua/trạng thái Verified (GDD trang 18, 32; AI_HANDOFF PR2):
 * chỉ giữ các khóa GameState đã biết; rồng mất `registryRef` và khóa lạ.
 */
export function sanitizeImportedState(state: GameState): { state: GameState; report: ImportSanitizeReport } {
  const droppedStateKeys = Object.keys(state).filter((k) => !(STATE_KEYS as readonly string[]).includes(k));
  const droppedDragonKeys = new Set<string>();
  const dragons = state.dragons.map((d) => {
    for (const k of Object.keys(d)) {
      if (!(DRAGON_KEYS as readonly string[]).includes(k)) droppedDragonKeys.add(k);
    }
    return pick(d, DRAGON_KEYS);
  });
  return {
    state: { ...pick(state, STATE_KEYS), dragons },
    report: { droppedStateKeys, droppedDragonKeys: [...droppedDragonKeys].sort() },
  };
}

/** Tóm tắt cho màn hình xác nhận import (không đổi state). */
export interface ImportPreview {
  saveId: string;
  savedAtMs: number;
  goldMicro: number;
  dragonCount: number;
  speciesCount: number;
  migratedFrom: number | null;
  warnings: string[];
}

export function previewOf(save: ParsedSave): ImportPreview {
  const species = new Set(save.state.dragons.filter((d) => d.location.kind !== 'released').map((d) => d.speciesId));
  return {
    saveId: save.state.saveId,
    savedAtMs: save.savedAtMs,
    goldMicro: save.state.goldMicro,
    dragonCount: save.state.dragons.filter((d) => d.location.kind !== 'released').length,
    speciesCount: [...species].filter((id) => DRAGON_SPECIES.some((s) => s.id === id)).length,
    migratedFrom: save.migratedFrom,
    warnings: save.warnings,
  };
}
