/**
 * Một người ghi cho mỗi save (AI_HANDOFF PR2): Web Locks API, khóa giữ suốt vòng đời tab.
 * Tab thứ hai không lấy được khóa → chỉ đọc. Trình duyệt không có Web Locks → coi là người ghi
 * duy nhất (ghi nhận ở ADR 0006; Chromium/Edge/Firefox/Safari hiện đại đều có).
 */

export const WRITER_LOCK_NAME = 'dravio-save-writer';

export interface WriterLock {
  acquired: boolean;
  /** true khi trình duyệt không hỗ trợ Web Locks nên không thể đảm bảo. */
  unsupported: boolean;
  release(): void;
}

interface LockManagerLike {
  request(name: string, options: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<void>): Promise<void>;
}

export function acquireWriterLock(locks: LockManagerLike | undefined = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks, name = WRITER_LOCK_NAME): Promise<WriterLock> {
  if (!locks) return Promise.resolve({ acquired: true, unsupported: true, release: () => undefined });
  return new Promise((resolve) => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((r) => (release = r));
    locks
      .request(name, { ifAvailable: true }, (lock) => {
        if (lock === null) {
          resolve({ acquired: false, unsupported: false, release: () => undefined });
          return Promise.resolve();
        }
        resolve({ acquired: true, unsupported: false, release });
        return held;
      })
      .catch(() => resolve({ acquired: false, unsupported: false, release: () => undefined }));
  });
}
