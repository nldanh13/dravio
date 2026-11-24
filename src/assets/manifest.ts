import type { GrowthStage, MutationType } from '../types/game';

/**
 * Manifest tài nguyên đồ họa (GDD 3.1 trang 16: "Asset có manifest nguồn/quyền sử dụng").
 * Chỉ dùng asset đóng gói cục bộ, không tải từ Internet.
 */

export interface AssetSource {
  /** Nguồn gốc asset. */
  origin: string;
  /** Quyền sử dụng. */
  license: string;
  /** Trạng thái duyệt mỹ thuật. */
  /** 'approved-prototype': tác giả duyệt làm prototype (ADR 0005/0101), chưa phải art thương mại. */
  review: 'prototype-pending-review' | 'approved-prototype' | 'pending-author-review' | 'approved';
}

const G0_PROTOTYPE: AssetSource = {
  origin: 'Dravio G0 Decision Pack 1.0 — vector tự tạo cho dự án, không dùng tài nguyên bên thứ ba',
  license: 'Thuộc dự án Dravio',
  review: 'prototype-pending-review',
};

const emberlingFiles = import.meta.glob<string>('./g0/emberling/{baby,juvenile,adult}_*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});

export interface SpriteEntry {
  speciesId: string;
  stage: GrowthStage;
  mutation: MutationType;
  url: string;
  source: AssetSource;
}

const STAGES: readonly GrowthStage[] = ['baby', 'juvenile', 'adult'];
const MUTATIONS: readonly MutationType[] = ['normal', 'crystal', 'golden', 'prismatic'];

function buildEmberling(): SpriteEntry[] {
  const out: SpriteEntry[] = [];
  for (const stage of STAGES) {
    for (const mutation of MUTATIONS) {
      const url = emberlingFiles[`./g0/emberling/${stage}_${mutation}.svg`];
      if (!url) throw new Error(`Missing Emberling sprite ${stage}_${mutation}.svg`);
      out.push({ speciesId: 'emberling', stage, mutation, url, source: G0_PROTOTYPE });
    }
  }
  return out;
}

export const SPRITES: readonly SpriteEntry[] = buildEmberling();

/** Sprite cho loài/stage/biến thể; null khi loài chưa có asset (mới có Emberling ở G0). */
export function getSprite(speciesId: string, stage: GrowthStage, mutation: MutationType): SpriteEntry | null {
  return SPRITES.find((s) => s.speciesId === speciesId && s.stage === stage && s.mutation === mutation) ?? null;
}
