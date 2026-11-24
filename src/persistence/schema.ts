import { SCHEMA_VERSION, type GameState } from '../types/state';

/**
 * Định dạng file save v3 (GDD 3.1 trang 18; ADR 0006).
 * Envelope = metadata + checksum SHA-256 trên JSON chuẩn hóa của `state`.
 */

export const SAVE_FORMAT = 'dravio-save';

export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  schemaVersion: number;
  contentVersion: string;
  savedAtMs: number;
  revision: number;
  /** SHA-256 (hex) của canonicalJson(state). */
  checksum: string;
  state: GameState;
}

/** JSON với khóa object sắp xếp ổn định, để checksum không phụ thuộc thứ tự khóa. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Bỏ dữ liệu tạm không thuộc save: viên thức ăn đang rơi (sống ≤ 12 s, ADR 0004 #10).
 * Tọa độ frame, kiểu hình, stage, tốc độ vàng vốn không nằm trong GameState.
 */
export function toPersistedState(state: GameState): GameState {
  return { ...state, food: { lastSpawnAtMs: null, drops: [] } };
}

export async function createEnvelope(state: GameState, savedAtMs: number): Promise<SaveEnvelope> {
  const persisted = toPersistedState(state);
  return {
    format: SAVE_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    contentVersion: persisted.contentVersion,
    savedAtMs,
    revision: persisted.revision,
    checksum: await sha256Hex(canonicalJson(persisted)),
    state: persisted,
  };
}

export async function serializeSave(state: GameState, savedAtMs: number): Promise<string> {
  return JSON.stringify(await createEnvelope(state, savedAtMs));
}
