/**
 * Kho save dạng key–value với 3 slot (GDD 3.1 trang 18: autosave + 2 backup; ADR 0006).
 * `rotate` ghi save mới và đẩy main → backup1 → backup2 trong MỘT transaction,
 * nên không có trạng thái nửa vời khi tab bị đóng giữa chừng.
 */

export const SLOTS = ['main', 'backup1', 'backup2'] as const;
export type SlotId = (typeof SLOTS)[number];

/** Bản gốc được giữ vĩnh viễn trước khi ghi save đã migrate, ví dụ `archive:schema-3`. */
export type ArchiveKey = `archive:${string}`;

export interface ArchiveWrite {
  key: ArchiveKey;
  text: string;
}

export interface RotateOptions {
  archive?: ArchiveWrite;
  /**
   * Compare-and-swap (ADR 0010): nếu đặt, chỉ ghi khi `main` hiện tại đúng bằng giá trị này
   * (`null` = chưa có main). Khác → không ghi gì và trả `SaveConflictError`.
   * Chặn hai tab ghi đè nhau kể cả khi không có Web Locks.
   */
  expectMain?: string | null;
}

/** `main` đã bị nơi khác (tab khác) ghi kể từ lần đọc/ghi gần nhất của phiên này. */
export class SaveConflictError extends Error {
  constructor() {
    super('save main slot was changed by another writer');
    this.name = 'SaveConflictError';
  }
}

export interface SaveStore {
  get(slot: SlotId | ArchiveKey): Promise<string | null>;
  /**
   * Ghi `text` vào main; main cũ → backup1; backup1 cũ → backup2. Nguyên tử.
   * `archive` (nếu có) được ghi trong cùng transaction và chỉ khi khóa đó chưa tồn tại.
   */
  rotate(text: string, opts?: RotateOptions): Promise<void>;
}

/** Kho trong bộ nhớ cho test và khi trình duyệt không có IndexedDB (không bền). */
export class MemorySaveStore implements SaveStore {
  readonly slots = new Map<SlotId | ArchiveKey, string>();
  /** Đếm số lần ghi để test kiểm “không ghi”. */
  writes = 0;
  failNextWrite = false;

  get(slot: SlotId | ArchiveKey): Promise<string | null> {
    return Promise.resolve(this.slots.get(slot) ?? null);
  }

  rotate(text: string, opts: RotateOptions = {}): Promise<void> {
    const { archive } = opts;
    if (opts.expectMain !== undefined && (this.slots.get('main') ?? null) !== opts.expectMain) {
      return Promise.reject(new SaveConflictError());
    }
    if (this.failNextWrite) {
      this.failNextWrite = false;
      return Promise.reject(new Error('simulated write failure'));
    }
    const main = this.slots.get('main');
    const b1 = this.slots.get('backup1');
    if (b1 !== undefined) this.slots.set('backup2', b1);
    if (main !== undefined) this.slots.set('backup1', main);
    this.slots.set('main', text);
    if (archive && !this.slots.has(archive.key)) this.slots.set(archive.key, archive.text);
    this.writes++;
    return Promise.resolve();
  }
}

export const IDB_NAME = 'dravio';
export const IDB_STORE = 'saves';
const IDB_VERSION = 1;

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/** Adapter IndexedDB: database `dravio`, object store `saves`, khóa = tên slot, giá trị = chuỗi JSON. */
export class IndexedDbSaveStore implements SaveStore {
  private constructor(private readonly db: IDBDatabase) {}

  static open(factory: IDBFactory = globalThis.indexedDB, name = IDB_NAME): Promise<IndexedDbSaveStore> {
    return new Promise((resolve, reject) => {
      const req = factory.open(name, IDB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(new IndexedDbSaveStore(req.result));
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    });
  }

  async get(slot: SlotId | ArchiveKey): Promise<string | null> {
    const tx = this.db.transaction(IDB_STORE, 'readonly');
    const value: unknown = await promisify(tx.objectStore(IDB_STORE).get(slot));
    return typeof value === 'string' ? value : null;
  }

  rotate(text: string, opts: RotateOptions = {}): Promise<void> {
    const { archive } = opts;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(IDB_STORE, 'readwrite', { durability: 'strict' });
      const os = tx.objectStore(IDB_STORE);
      let conflict = false;
      const getMain = os.get('main');
      const getB1 = os.get('backup1');
      const existing = archive ? os.getKey(archive.key) : null;
      // Các request trong một transaction hoàn tất theo thứ tự gửi: khi request cuối xong, mọi kết quả đã có.
      const last = existing ?? getB1;
      last.onsuccess = () => {
        const main: unknown = getMain.result;
        const current = typeof main === 'string' ? main : null;
        if (opts.expectMain !== undefined && current !== opts.expectMain) {
          conflict = true;
          tx.abort();
          return;
        }
        const b1: unknown = getB1.result;
        if (typeof b1 === 'string') os.put(b1, 'backup2');
        if (current !== null) os.put(current, 'backup1');
        os.put(text, 'main');
        if (archive && existing?.result === undefined) os.put(archive.text, archive.key);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(conflict ? new SaveConflictError() : (tx.error ?? new Error('IndexedDB transaction aborted')));
    });
  }

  close(): void {
    this.db.close();
  }
}
