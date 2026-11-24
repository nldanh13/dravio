import type { GameState } from '../types/state';
import { parseSaveText, previewOf, sanitizeImportedState, type ImportPreview, type ParsedSave, type SaveErrorCode } from './saveFile';
import { serializeSave } from './schema';
import { SLOTS, type ArchiveWrite, type SaveStore, type SlotId } from './store';

/**
 * Người ghi duy nhất của save (GDD 3.1 trang 18; AI_HANDOFF PR2 “one writer”).
 * - load: main → backup1 → backup2, kiểm checksum + migrate + validate từng slot.
 * - Save do bản mới hơn ghi → khóa chế độ chỉ đọc, không fallback, không ghi đè.
 * - save: bỏ qua nếu revision không đổi; mỗi lần ghi xoay 2 backup trong một transaction.
 */

export interface SlotFailure {
  slot: SlotId;
  code: SaveErrorCode;
  details: string[];
}

export type LoadOutcome =
  | { kind: 'loaded'; save: ParsedSave; slot: SlotId; failures: SlotFailure[] }
  | { kind: 'empty' }
  /** Có dữ liệu nhưng không slot nào đọc được: không tự ghi đè, chờ người chơi quyết định. */
  | { kind: 'unrecoverable'; failures: SlotFailure[] }
  | { kind: 'newer-version'; failures: SlotFailure[] };

export type WriteBlock = 'read-only' | 'newer-version' | 'unrecoverable' | null;

export interface SaveManagerOptions {
  store: SaveStore;
  nowMs: () => number;
}

export class SaveManager {
  private lastSaved: { saveId: string; revision: number } | null = null;
  private block: WriteBlock = null;
  private pendingImport: { save: ParsedSave; preview: ImportPreview } | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  /** Save gốc trước migration: ghi kèm lần lưu đầu tiên của người ghi, không bao giờ bị xoay mất. */
  private pendingArchive: ArchiveWrite | null = null;

  constructor(private readonly opts: SaveManagerOptions) {}

  get writeBlock(): WriteBlock {
    return this.block;
  }

  /** Tab không giữ khóa người ghi: chỉ đọc. */
  setReadOnly(readOnly: boolean): void {
    if (readOnly) this.block = this.block ?? 'read-only';
    else if (this.block === 'read-only') this.block = null;
  }

  async load(): Promise<LoadOutcome> {
    const failures: SlotFailure[] = [];
    let anyData = false;
    for (const slot of SLOTS) {
      const text = await this.opts.store.get(slot);
      if (text === null) continue;
      anyData = true;
      const r = await parseSaveText(text);
      if (r.ok) {
        this.lastSaved = slot === 'main' ? { saveId: r.save.state.saveId, revision: r.save.state.revision } : null;
        if (r.save.migratedFrom !== null) {
          this.pendingArchive = { key: `archive:schema-${r.save.migratedFrom}`, text };
          this.lastSaved = null;
        }
        return { kind: 'loaded', save: r.save, slot, failures };
      }
      failures.push({ slot, code: r.code, details: r.details });
      if (r.code === 'newer-version') {
        this.block = 'newer-version';
        return { kind: 'newer-version', failures };
      }
    }
    if (anyData) {
      this.block = 'unrecoverable';
      return { kind: 'unrecoverable', failures };
    }
    return { kind: 'empty' };
  }

  /**
   * Ghi save. Trả `false` nếu bị chặn hoặc revision không đổi.
   * Các lần gọi được xếp hàng tuần tự để không có hai transaction xen kẽ.
   */
  save(state: GameState, opts: { force?: boolean } = {}): Promise<boolean> {
    const run = async (): Promise<boolean> => {
      if (this.block !== null && !(opts.force === true && this.block === 'unrecoverable')) return false;
      if (!opts.force && this.lastSaved?.saveId === state.saveId && this.lastSaved.revision === state.revision) return false;
      const text = await serializeSave(state, this.opts.nowMs());
      const archive = this.pendingArchive;
      await this.opts.store.rotate(text, archive ?? undefined);
      this.pendingArchive = null;
      this.lastSaved = { saveId: state.saveId, revision: state.revision };
      if (this.block === 'unrecoverable') this.block = null;
      return true;
    };
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /**
   * Bước 1 của import: đọc + kiểm file, bỏ entitlement/Verified, trả bản xem trước.
   * Chưa đổi gì trong kho cho tới `confirmImport`.
   */
  async prepareImport(text: string): Promise<{ ok: true; preview: ImportPreview } | { ok: false; code: SaveErrorCode; details: string[] }> {
    this.pendingImport = null;
    const r = await parseSaveText(text);
    if (!r.ok) return r;
    const { state, report } = sanitizeImportedState(r.save.state);
    const warnings = [...r.save.warnings];
    if (report.droppedStateKeys.length > 0) warnings.push(`dropped state keys: ${report.droppedStateKeys.join(', ')}`);
    if (report.droppedDragonKeys.length > 0) warnings.push(`dropped dragon keys: ${report.droppedDragonKeys.join(', ')}`);
    const save: ParsedSave = { ...r.save, state, warnings };
    const preview = previewOf(save);
    this.pendingImport = { save, preview };
    return { ok: true, preview };
  }

  cancelImport(): void {
    this.pendingImport = null;
  }

  /**
   * Bước 2: người chơi xác nhận. Save hiện tại được ghi lại trước (trở thành backup1 sau khi xoay),
   * rồi save import thành main. Trả state để UI dùng làm state mới.
   */
  async confirmImport(current: GameState | null): Promise<GameState | null> {
    const pending = this.pendingImport;
    if (!pending || (this.block !== null && this.block !== 'unrecoverable')) return null;
    if (current) await this.save(current, { force: true });
    // Tăng revision để chắc chắn khác lần ghi trước.
    const state: GameState = { ...pending.save.state, revision: pending.save.state.revision + 1 };
    const ok = await this.save(state, { force: true });
    this.pendingImport = null;
    return ok ? state : null;
  }

  /** Xuất file JSON có checksum (Dravio Save Schema v1). Không cần khóa người ghi. */
  exportText(state: GameState): Promise<string> {
    return serializeSave(state, this.opts.nowMs());
  }
}
