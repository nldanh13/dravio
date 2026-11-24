/**
 * Một người ghi cho mỗi save (AI_HANDOFF PR2, ADR 0010).
 *
 * 1. Web Locks API (`navigator.locks`): khóa giữ suốt vòng đời tab; tab thứ hai chỉ đọc.
 * 2. Không có Web Locks → lease trong `localStorage` (ghi, chờ, đọc lại; heartbeat; hết hạn sau TTL).
 * 3. Không có cả hai → coi là người ghi, `unsupported: true`.
 *
 * Lease chỉ là lớp ưu tiên: lớp đảm bảo cuối cùng là compare-and-swap trên slot `main`
 * (`SaveStore.rotate({ expectMain })`) — tab nào ghi sau khi tab khác đã ghi sẽ bị từ chối và chuyển sang chỉ xem.
 */

export const WRITER_LOCK_NAME = 'dravio-save-writer';
export const LEASE_KEY = 'dravio-save-writer-lease';
export const LEASE_TTL_MS = 6000;
export const LEASE_HEARTBEAT_MS = 2000;
/** Thời gian chờ trước khi đọc lại lease, để tab ghi đồng thời lộ ra. */
export const LEASE_SETTLE_MS = 150;

export interface WriterLock {
  acquired: boolean;
  /** true khi trình duyệt không có Web Locks (đang dùng lease `localStorage` hoặc không có khóa nào). */
  unsupported: boolean;
  /** Cơ chế đang dùng. */
  via: 'web-locks' | 'lease' | 'none';
  release(): void;
}

interface LockManagerLike {
  request(name: string, options: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<void>): Promise<void>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LeaseEnv {
  storage: StorageLike;
  nowMs: () => number;
  ownerId: string;
  setTimeout: (fn: () => void, ms: number) => unknown;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (h: unknown) => void;
}

interface Lease {
  owner: string;
  expiresAtMs: number;
}

function readLease(storage: StorageLike): Lease | null {
  try {
    const raw = storage.getItem(LEASE_KEY);
    if (raw === null) return null;
    const v = JSON.parse(raw) as Partial<Lease>;
    return typeof v.owner === 'string' && typeof v.expiresAtMs === 'number' ? { owner: v.owner, expiresAtMs: v.expiresAtMs } : null;
  } catch {
    return null;
  }
}

const notAcquired = (via: WriterLock['via'], unsupported: boolean): WriterLock => ({ acquired: false, unsupported, via, release: () => undefined });

/** Lease `localStorage` cho trình duyệt không có Web Locks. */
export function acquireLease(env: LeaseEnv): Promise<WriterLock> {
  const { storage } = env;
  const current = readLease(storage);
  if (current && current.owner !== env.ownerId && current.expiresAtMs > env.nowMs()) return Promise.resolve(notAcquired('lease', true));
  const write = (): boolean => {
    try {
      storage.setItem(LEASE_KEY, JSON.stringify({ owner: env.ownerId, expiresAtMs: env.nowMs() + LEASE_TTL_MS } satisfies Lease));
      return true;
    } catch {
      return false;
    }
  };
  if (!write()) return Promise.resolve({ acquired: true, unsupported: true, via: 'none', release: () => undefined });
  return new Promise((resolve) => {
    env.setTimeout(() => {
      if (readLease(storage)?.owner !== env.ownerId) {
        resolve(notAcquired('lease', true));
        return;
      }
      const beat = env.setInterval(() => {
        // Chỉ gia hạn khi lease còn của mình; mất lease thì CAS sẽ chặn lần ghi kế tiếp.
        if (readLease(storage)?.owner === env.ownerId) write();
      }, LEASE_HEARTBEAT_MS);
      let released = false;
      resolve({
        acquired: true,
        unsupported: true,
        via: 'lease',
        release: () => {
          if (released) return;
          released = true;
          env.clearInterval(beat);
          try {
            if (readLease(storage)?.owner === env.ownerId) storage.removeItem(LEASE_KEY);
          } catch {
            /* bỏ qua: lease tự hết hạn */
          }
        },
      });
    }, LEASE_SETTLE_MS);
  });
}

function browserLeaseEnv(): LeaseEnv | null {
  let storage: StorageLike | undefined;
  try {
    storage = (globalThis as { localStorage?: StorageLike }).localStorage;
  } catch {
    storage = undefined;
  }
  if (!storage) return null;
  return {
    storage,
    nowMs: () => Date.now(),
    ownerId: globalThis.crypto.randomUUID(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
  };
}

export function acquireWriterLock(
  locks: LockManagerLike | undefined = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks,
  name = WRITER_LOCK_NAME,
  leaseEnv: () => LeaseEnv | null = browserLeaseEnv,
): Promise<WriterLock> {
  if (!locks) {
    const env = leaseEnv();
    return env ? acquireLease(env) : Promise.resolve({ acquired: true, unsupported: true, via: 'none', release: () => undefined });
  }
  return new Promise((resolve) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => (release = r));
    locks
      .request(name, { ifAvailable: true }, (lock) => {
        if (lock === null) {
          resolve(notAcquired('web-locks', false));
          return Promise.resolve();
        }
        resolve({ acquired: true, unsupported: false, via: 'web-locks', release });
        return held;
      })
      .catch(() => resolve(notAcquired('web-locks', false)));
  });
}
