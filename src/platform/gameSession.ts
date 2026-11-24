import { systemClock, type Clock } from '../engine/core/clock';
import { dispatch, type Command } from '../engine/core/commands';
import type { CommandError } from '../engine/core/errors';
import { createInitialState } from '../engine/core/initialState';
import { createRng, hashSeed } from '../engine/core/rng';
import { recordDiscovery } from '../engine/world/zones';
import type { DiscoveryId } from '../data/habitatUnlocks';
import { createAutosave } from '../persistence/autosave';
import type { ImportPreview, SaveErrorCode } from '../persistence/saveFile';
import { SaveManager, type SlotFailure } from '../persistence/saveManager';
import { IndexedDbSaveStore, MemorySaveStore, type SaveStore } from '../persistence/store';
import type { GameState } from '../types/state';
import { isPageVisible, onPageLifecycle } from './lifecycle';
import { TICK_MS, advanceModeFor } from './timePolicy';
import { acquireWriterLock, type WriterLock } from './writerLock';

/**
 * Nối engine + persistence cho trình duyệt (lớp platform, được phép đọc đồng hồ hệ thống và crypto).
 * Một phiên duy nhất cho mỗi tab; tab không giữ khóa người ghi chỉ đọc và không chạy thời gian.
 */

/** Lệnh từ UI, requestId do phiên tự gán. */
export type CommandInput = Command extends infer C ? (C extends Command ? Omit<C, 'requestId'> : never) : never;

/** `conflict`: tab khác đã ghi save sau khi tab này mở (ADR 0010) — tab này dừng và chỉ xem. */
export type SessionStatus = 'loading' | 'ready' | 'read-only' | 'newer-version' | 'unrecoverable' | 'conflict';

export interface SessionSnapshot {
  status: SessionStatus;
  state: GameState | null;
  /** false khi IndexedDB không mở được (chế độ riêng tư…): dữ liệu mất khi đóng tab. */
  persistent: boolean;
  lockUnsupported: boolean;
  lastSavedAtMs: number | null;
  loadedFrom: 'main' | 'backup1' | 'backup2' | 'new' | null;
  /** `schemaVersion` gốc nếu save vừa được migrate (bản gốc đã được giữ trong `archive:schema-N`). */
  migratedFrom: number | null;
  failures: SlotFailure[];
  saveError: boolean;
  importPreview: ImportPreview | null;
  importError: SaveErrorCode | null;
}


const IMMEDIATE_SAVE: ReadonlySet<string> = new Set(['buyTutorialPack', 'claimPack']);

function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}

export class GameSession {
  private snap: SessionSnapshot = {
    status: 'loading',
    state: null,
    persistent: true,
    lockUnsupported: false,
    lastSavedAtMs: null,
    loadedFrom: null,
    migratedFrom: null,
    failures: [],
    saveError: false,
    importPreview: null,
    importError: null,
  };
  private listeners = new Set<() => void>();
  private manager: SaveManager | null = null;
  private lock: WriterLock | null = null;
  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private autosave: ReturnType<typeof createAutosave> | null = null;
  private unbindHide: (() => void) | null = null;
  /** Đang thay save bằng file import: dừng tick và autosave để không ghi đè save mới. */
  private swapping = false;
  /** Trang đang ẩn: không tick online; phần thời gian này quyết toán offline khi hiện lại. */
  private hidden = false;

  constructor(private readonly clock: Clock = systemClock) {}

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): SessionSnapshot => this.snap;

  private set(patch: Partial<SessionSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  async start(): Promise<void> {
    let store: SaveStore;
    let persistent = true;
    try {
      store = await IndexedDbSaveStore.open();
    } catch {
      store = new MemorySaveStore();
      persistent = false;
    }
    this.lock = await acquireWriterLock();
    const manager = new SaveManager({ store, nowMs: () => this.clock.nowMs() });
    this.manager = manager;
    manager.setReadOnly(!this.lock.acquired);
    const outcome = await manager.load();
    this.set({ persistent, lockUnsupported: this.lock.unsupported, failures: 'failures' in outcome ? outcome.failures : [] });

    if (outcome.kind === 'newer-version' || outcome.kind === 'unrecoverable') {
      this.set({ status: outcome.kind });
      return;
    }
    let state: GameState;
    if (outcome.kind === 'loaded') {
      state = outcome.save.state;
      this.set({ loadedFrom: outcome.slot, migratedFrom: outcome.save.migratedFrom, lastSavedAtMs: outcome.save.savedAtMs });
    } else {
      state = this.newGame();
      this.set({ loadedFrom: 'new' });
    }
    if (!this.lock.acquired) {
      this.set({ status: 'read-only', state });
      return;
    }
    // Thời gian vắng mặt tính offline (75 %, chặn 24 h) trước khi chạy online.
    state = this.apply(state, 'offline');
    this.hidden = !isPageVisible();
    this.set({ status: 'ready', state });
    await this.saveNow();
    this.run();
  }

  private newGame(): GameState {
    const saveId = newRequestId();
    return createInitialState({ saveId, nowMs: this.clock.nowMs(), rng: createRng(hashSeed('new-save', saveId)) });
  }

  private apply(state: GameState, mode: 'online' | 'offline'): GameState {
    const r = dispatch(state, { type: 'advanceTime', requestId: newRequestId(), mode }, { clock: this.clock });
    return r.ok ? r.state : state;
  }

  private run(): void {
    const manager = this.manager;
    if (!manager) return;
    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
    this.autosave = createAutosave({
      save: async (s) => {
        const ok = await manager.save(s);
        this.checkConflict();
        return ok;
      },
      getState: () => (this.snap.status === 'ready' && !this.swapping ? this.snap.state : null),
      timer: { setInterval: (fn, ms) => setInterval(fn, ms), clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>) },
      onSaved: () => this.set({ lastSavedAtMs: this.clock.nowMs(), saveError: false }),
      onError: () => this.set({ saveError: true }),
    });
    this.autosave.start();
    this.unbindHide = onPageLifecycle({ onHide: () => this.onHide(), onShow: () => this.onShow() });
  }

  /** Tick 1 Hz: online nếu trang hiện và không có khoảng trống lớn (máy ngủ, tab treo) — ADR 0010. */
  private tick(): void {
    const s = this.snap.state;
    if (!s || this.snap.status !== 'ready' || this.swapping || this.hidden) return;
    const mode = advanceModeFor(s.clock.lastProcessedAtMs, this.clock.nowMs(), true);
    this.set({ state: this.apply(s, mode) });
  }

  /** Ẩn/thu nhỏ/đóng băng/đóng: quyết toán phần online tới lúc này rồi lưu ngay. */
  private onHide(): void {
    if (this.hidden) {
      void this.autosave?.flush();
      return;
    }
    const s = this.snap.state;
    if (s && this.snap.status === 'ready' && !this.swapping) {
      const mode = advanceModeFor(s.clock.lastProcessedAtMs, this.clock.nowMs(), true);
      this.set({ state: this.apply(s, mode) });
    }
    this.hidden = true;
    void this.autosave?.flush();
  }

  /** Hiện lại: phần thời gian ẩn tính offline (75 %, receipt nếu > 60 s), rồi tiếp tục tick online. */
  private onShow(): void {
    if (!this.hidden) return;
    this.hidden = false;
    const s = this.snap.state;
    if (s && this.snap.status === 'ready' && !this.swapping) this.set({ state: this.apply(s, 'offline') });
  }

  async saveNow(): Promise<void> {
    const s = this.snap.state;
    if (!this.manager || !s || this.snap.status !== 'ready') return;
    try {
      if (await this.manager.save(s)) this.set({ lastSavedAtMs: this.clock.nowMs(), saveError: false });
      this.checkConflict();
    } catch {
      this.set({ saveError: true });
    }
  }

  /** Save bị tab khác ghi (CAS thất bại): dừng thời gian và autosave, chuyển sang chỉ xem. Không ghi đè. */
  private checkConflict(): void {
    if (this.manager?.writeBlock !== 'conflict' || this.snap.status === 'conflict') return;
    this.stopLoops();
    this.set({ status: 'conflict' });
  }

  private stopLoops(): void {
    if (this.tickHandle !== null) clearInterval(this.tickHandle);
    this.tickHandle = null;
    this.autosave?.stop();
    this.unbindHide?.();
    this.unbindHide = null;
  }

  /** Bắt đầu lại khi mọi slot hỏng (người chơi đã xác nhận). Dữ liệu hỏng được đẩy xuống backup1. */
  async startFresh(): Promise<void> {
    if (!this.manager || this.snap.status !== 'unrecoverable' || !this.lock?.acquired) return;
    const state = this.newGame();
    await this.manager.save(state, { force: true });
    this.set({ status: 'ready', state, loadedFrom: 'new', lastSavedAtMs: this.clock.nowMs() });
    this.run();
  }

  /** Gửi một lệnh người chơi qua command bus. Tab chỉ xem hoặc đang thay save thì không làm gì. */
  send(cmd: CommandInput): CommandError | null {
    const s = this.snap.state;
    if (!s || this.snap.status !== 'ready' || this.swapping) return null;
    const r = dispatch(s, { ...cmd, requestId: newRequestId() }, { clock: this.clock });
    if (!r.ok) return r.error;
    this.set({ state: r.state });
    // Mua/nhận trứng: lưu ngay để kết quả đã roll không thể bị làm lại bằng cách đóng tab (CLAUDE.md).
    if (IMMEDIATE_SAVE.has(cmd.type)) void this.saveNow();
    return null;
  }

  /**
   * CHỈ DÙNG KHI PHÁT TRIỂN (ADR 0009): ghi nhận khám phá thay cho hệ nhiệm vụ PR5 để thử mở sinh cảnh.
   * Trong bản build production `import.meta.env.DEV` là false: hàm không làm gì và mã bên dưới bị loại bỏ.
   */
  devRecordDiscovery(id: DiscoveryId): void {
    if (!import.meta.env.DEV) return;
    const s = this.snap.state;
    if (!s || this.snap.status !== 'ready' || this.swapping) return;
    const r = recordDiscovery(s, id);
    if (r.ok) this.set({ state: { ...r.state, revision: s.revision + 1 } });
  }

  exportText(): Promise<string> | null {
    const s = this.snap.state;
    return this.manager && s ? this.manager.exportText(s) : null;
  }

  async prepareImport(text: string): Promise<void> {
    if (!this.manager) return;
    const r = await this.manager.prepareImport(text);
    this.set(r.ok ? { importPreview: r.preview, importError: null } : { importPreview: null, importError: r.code });
  }

  cancelImport(): void {
    this.manager?.cancelImport();
    this.set({ importPreview: null, importError: null });
  }

  async confirmImport(): Promise<void> {
    if (!this.manager) return;
    const wasRunning = this.tickHandle !== null;
    this.swapping = true;
    let imported: GameState | null;
    try {
      imported = await this.manager.confirmImport(this.snap.status === 'ready' ? this.snap.state : null);
    } catch {
      imported = null;
    }
    if (!imported) {
      this.swapping = false;
      this.set({ importPreview: null, importError: 'invalid-state' });
      return;
    }
    const state = this.apply(imported, 'offline');
    this.swapping = false;
    this.set({ status: 'ready', state, importPreview: null, importError: null, loadedFrom: 'main', lastSavedAtMs: this.clock.nowMs() });
    if (!wasRunning) this.run();
  }

  dispose(): void {
    this.stopLoops();
    this.lock?.release();
  }
}
