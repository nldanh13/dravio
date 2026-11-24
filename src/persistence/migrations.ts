import { SCHEMA_VERSION } from '../types/state';

/**
 * Migration save Dravio theo `schemaVersion` (GDD 3.1 trang 18; ADR 0006, 0007).
 *
 * Dravio Save Schema v1 là định dạng chính thức đầu tiên; v1 → v2 thêm `discoveries` (ADR 0009).
 * Khi schema đổi, thêm một bước `{ from, to, run }` + fixture save của bản trước + test;
 * save gốc luôn được lưu riêng trước khi ghi bản đã migrate (SaveManager).
 */

export type RawState = Record<string, unknown>;

export interface MigrationStep {
  from: number;
  to: number;
  /** Hàm thuần: nhận state của schema `from`, trả state của schema `to`. Ném lỗi nếu dữ liệu không chuyển được. */
  run(state: RawState): RawState;
}

/** Chuỗi bước chính thức. Mỗi bước có fixture save thật của bản trước trong `tests/fixtures/`. */
export const MIGRATION_STEPS: readonly MigrationStep[] = [
  /** v1 → v2 (ADR 0009): thêm `discoveries` rỗng. Microhabitat đã mở được giữ nguyên. */
  {
    from: 1,
    to: 2,
    run(state) {
      if ('discoveries' in state) throw new Error('v1 state already has discoveries');
      return { ...state, discoveries: [] };
    },
  },
];

/**
 * Bản phát triển chưa phát hành (G1 PR2, commit 3f466a6) ghi `schemaVersion: 3` với state giống hệt v1.
 * Số 3 vì thế được dành riêng: schema Dravio tương lai đi 1 → 2 → 4…, không bao giờ dùng lại 3.
 */
export const PRE_RELEASE_SCHEMA_ALIASES: Readonly<Record<number, number>> = { 3: 1 };

export type MigrateResult =
  | { ok: true; state: RawState; fromVersion: number; preRelease: boolean }
  | { ok: false; code: 'newer-version' | 'unsupported-version' | 'migration-failed'; details: string[] };

export function migrateState(
  fromVersion: number,
  input: RawState,
  steps: readonly MigrationStep[] = MIGRATION_STEPS,
  target: number = SCHEMA_VERSION,
): MigrateResult {
  const alias = PRE_RELEASE_SCHEMA_ALIASES[fromVersion];
  const preRelease = alias !== undefined;
  let version = alias ?? fromVersion;
  let state: RawState = preRelease ? { ...input, schemaVersion: version } : input;
  if (!Number.isInteger(version) || version < 1) return { ok: false, code: 'unsupported-version', details: [`schemaVersion ${fromVersion}`] };
  if (version > target) return { ok: false, code: 'newer-version', details: [`schemaVersion ${fromVersion}`] };
  while (version < target) {
    const step = steps.find((s) => s.from === version);
    if (!step || step.to <= version || step.to > target) {
      return { ok: false, code: 'unsupported-version', details: [`no migration from schemaVersion ${version}`] };
    }
    try {
      state = { ...step.run(state), schemaVersion: step.to };
    } catch (e) {
      return { ok: false, code: 'migration-failed', details: [`${version} → ${step.to}: ${e instanceof Error ? e.message : String(e)}`] };
    }
    version = step.to;
  }
  return { ok: true, state, fromVersion, preRelease };
}
