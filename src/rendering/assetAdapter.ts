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
