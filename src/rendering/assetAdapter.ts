import type { GrowthStage, MutationType } from '../types/game';
import type { RenderManifest, SpriteAsset } from './assetContract';

/**
 * Adapter giữa manifest và renderer: preload ảnh cục bộ một lần, tra sprite theo loài/stage/biến thể,
 * báo thiếu asset. Không tải Internet (manifest chỉ nhận URL đóng gói — `validateRenderManifest`).
 */

export type ImageLoader = (url: string) => Promise<CanvasImageSource>;

export interface ResolvedSprite {
  asset: SpriteAsset;
  image: CanvasImageSource;
}

export interface AssetAdapter {
  /** Tải mọi ảnh trong manifest. Ảnh lỗi được ghi vào `failed`, không làm hỏng phần còn lại. */
  preload(): Promise<void>;
  /** null = loài/stage/biến thể chưa có asset hoặc chưa tải xong → renderer vẽ dấu hiệu thiếu asset. */
  dragon(speciesId: string, stage: GrowthStage, mutation: MutationType): ResolvedSprite | null;
  readonly failed: readonly string[];
  readonly loadedCount: number;
  dispose(): void;
}

export function createAssetAdapter(manifest: RenderManifest, load: ImageLoader): AssetAdapter {
  const images = new Map<string, CanvasImageSource>();
  const failed: string[] = [];
  let disposed = false;
  const urls = new Set<string>();
  for (const stages of Object.values(manifest.dragons)) {
    for (const variants of Object.values(stages ?? {})) for (const s of Object.values(variants ?? {})) if (s) urls.add(s.url);
  }
  return {
    async preload() {
      await Promise.all(
        [...urls].map(async (u) => {
          try {
            const img = await load(u);
            if (!disposed) images.set(u, img);
          } catch {
            failed.push(u);
          }
        }),
      );
    },
    dragon(speciesId, stage, mutation) {
      const asset = manifest.dragons[speciesId]?.[stage]?.[mutation];
      if (!asset) return null;
      const image = images.get(asset.url);
      return image ? { asset, image } : null;
    },
    get failed() {
      return failed;
    },
    get loadedCount() {
      return images.size;
    },
    dispose() {
      disposed = true;
      images.clear();
    },
  };
}

/** Loader trình duyệt: `HTMLImageElement` + `decode()` để không giật khi vẽ khung đầu. */
export const browserImageLoader: ImageLoader = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      img.decode().then(() => resolve(img), () => resolve(img));
    };
    img.onerror = () => reject(new Error(`image failed: ${url}`));
    img.src = url;
  });

/**
 * Cache ảnh theo nhu cầu (ADR 0012): `get(url)` trả ảnh nếu đã tải, nếu chưa thì bắt đầu tải và trả null
 * (renderer bỏ qua phần đó trong khung hiện tại). Mỗi lần `get` đánh dấu "vừa dùng"; `sweep(now)` giải
 * phóng ảnh không dùng quá `idleMs` để không giữ cả 444 khung trong bộ nhớ. Không tải Internet:
 * URL đến từ manifest đóng gói (`?url&no-inline`).
 */
export interface ImageCacheStats {
  loaded: number;
  loading: number;
  failed: number;
  released: number;
  requested: number;
}

export interface ImageCache {
  get(url: string, nowMs: number): CanvasImageSource | null;
  /** Tải trước (không đánh dấu dùng). */
  prefetch(urls: Iterable<string>, nowMs: number): void;
  /** Giải phóng ảnh không dùng quá `idleMs`; trả số ảnh đã giải phóng. */
  sweep(nowMs: number): number;
  has(url: string): boolean;
  stats(): ImageCacheStats;
  /** Chờ mọi ảnh đang tải (test/ảnh chụp). */
  settle(): Promise<void>;
  dispose(): void;
}

export function createImageCache(load: ImageLoader, opts: { idleMs?: number; maxFailures?: number } = {}): ImageCache {
  const idleMs = opts.idleMs ?? 30_000;
  const images = new Map<string, { img: CanvasImageSource; lastUsed: number }>();
  const pending = new Map<string, Promise<void>>();
  const failed = new Set<string>();
  let released = 0;
  let requested = 0;
  let disposed = false;
  const start = (url: string, nowMs: number) => {
    if (images.has(url) || pending.has(url) || failed.has(url) || disposed) return;
    requested++;
    const p = load(url).then(
      (img) => {
        pending.delete(url);
        if (!disposed) images.set(url, { img, lastUsed: nowMs });
      },
      () => {
        pending.delete(url);
        failed.add(url);
      },
    );
    pending.set(url, p);
  };
  return {
    get(url, nowMs) {
      const e = images.get(url);
      if (e) {
        e.lastUsed = nowMs;
        return e.img;
      }
      start(url, nowMs);
      return null;
    },
    prefetch(urls, nowMs) {
      for (const u of urls) start(u, nowMs);
    },
    sweep(nowMs) {
      let n = 0;
      for (const [u, e] of images) {
        if (nowMs - e.lastUsed > idleMs) {
          images.delete(u);
          n++;
        }
      }
      released += n;
      return n;
    },
    has: (url) => images.has(url),
    stats: () => ({ loaded: images.size, loading: pending.size, failed: failed.size, released, requested }),
    async settle() {
      while (pending.size > 0) await Promise.all([...pending.values()]);
    },
    dispose() {
      disposed = true;
      images.clear();
      pending.clear();
    },
  };
}
