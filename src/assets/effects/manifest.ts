/**
 * Hiệu ứng hoạt ảnh rồng (G1 PR2) — sinh bởi `scripts/art/generate-effects.mjs`.
 * Tọa độ neo theo px của viewBox từng hiệu ứng. Không tải Internet.
 */

export const DRAGON_EFFECT_IDS = [
  'shadow',
  'zzz',
  'heart',
  'happy_burst',
  'crumbs',
  'dust',
  'ripple',
  'water_surface',
  'bubbles',
  'wind',
  'bandage',
  'care_leaf',
  'recovery_glow',
] as const;
export type DragonEffectId = (typeof DRAGON_EFFECT_IDS)[number];

/** Chuyển động gợi ý cho renderer (không phải logic domain). */
export type EffectMotion = 'static' | 'rise-fade' | 'pop-fade' | 'expand-fade' | 'drift-back' | 'bob' | 'pulse';

export interface DragonEffectAsset {
  /** ID ổn định: `fx.dragon.<id>`. */
  assetId: string;
  id: DragonEffectId;
  url: string;
  width: number;
  height: number;
  /** Điểm neo (px viewBox của hiệu ứng) đặt trùng attach point của rồng. */
  anchor: { x: number; y: number };
  motion: EffectMotion;
  /** Quãng di chuyển gợi ý (px viewBox) trong suốt hiệu ứng, ví dụ bay lên của zzz. */
  travel: { dx: number; dy: number };
  /**
   * true = mang thông tin (chấn thương, chăm sóc): giữ hiển thị tĩnh khi reduced motion.
   * false = trang trí: có thể tắt khi reduced motion.
   */
  informational: boolean;
  /** Có lật theo hướng nhìn của rồng không. */
  flipWithFacing: boolean;
}

const files = import.meta.glob<string>('./dragon/*.svg', { eager: true, query: '?url', import: 'default' });

type Spec = Omit<DragonEffectAsset, 'assetId' | 'id' | 'url'>;
const SPECS: Readonly<Record<DragonEffectId, Spec>> = {
  shadow: { width: 128, height: 24, anchor: { x: 64, y: 12 }, motion: 'static', travel: { dx: 0, dy: 0 }, informational: false, flipWithFacing: false },
  zzz: { width: 64, height: 64, anchor: { x: 8, y: 56 }, motion: 'rise-fade', travel: { dx: 8, dy: -18 }, informational: false, flipWithFacing: true },
  heart: { width: 48, height: 48, anchor: { x: 24, y: 44 }, motion: 'rise-fade', travel: { dx: 0, dy: -20 }, informational: false, flipWithFacing: false },
  happy_burst: { width: 64, height: 64, anchor: { x: 32, y: 56 }, motion: 'pop-fade', travel: { dx: 0, dy: -10 }, informational: false, flipWithFacing: false },
  crumbs: { width: 48, height: 32, anchor: { x: 20, y: 6 }, motion: 'pop-fade', travel: { dx: 4, dy: 10 }, informational: false, flipWithFacing: true },
  dust: { width: 64, height: 32, anchor: { x: 32, y: 30 }, motion: 'expand-fade', travel: { dx: -6, dy: -4 }, informational: false, flipWithFacing: true },
  ripple: { width: 128, height: 32, anchor: { x: 64, y: 16 }, motion: 'expand-fade', travel: { dx: 0, dy: 0 }, informational: false, flipWithFacing: false },
  water_surface: { width: 256, height: 64, anchor: { x: 128, y: 8 }, motion: 'static', travel: { dx: 0, dy: 0 }, informational: true, flipWithFacing: false },
  bubbles: { width: 32, height: 48, anchor: { x: 12, y: 44 }, motion: 'rise-fade', travel: { dx: 2, dy: -16 }, informational: false, flipWithFacing: false },
  wind: { width: 64, height: 48, anchor: { x: 60, y: 26 }, motion: 'drift-back', travel: { dx: -24, dy: 0 }, informational: false, flipWithFacing: true },
  bandage: { width: 48, height: 32, anchor: { x: 24, y: 16 }, motion: 'static', travel: { dx: 0, dy: 0 }, informational: true, flipWithFacing: true },
  care_leaf: { width: 48, height: 48, anchor: { x: 24, y: 46 }, motion: 'bob', travel: { dx: 0, dy: -4 }, informational: true, flipWithFacing: false },
  recovery_glow: { width: 96, height: 96, anchor: { x: 48, y: 48 }, motion: 'pulse', travel: { dx: 0, dy: 0 }, informational: false, flipWithFacing: false },
};

export const DRAGON_EFFECTS: readonly DragonEffectAsset[] = DRAGON_EFFECT_IDS.map((id) => {
  const url = files[`./dragon/${id}.svg`];
  if (!url) throw new Error(`Missing effect ${id}.svg`);
  return { assetId: `fx.dragon.${id}`, id, url, ...SPECS[id] };
});

export function getDragonEffect(id: DragonEffectId): DragonEffectAsset {
  const fx = DRAGON_EFFECTS.find((e) => e.id === id);
  if (!fx) throw new Error(`Unknown effect ${id}`);
  return fx;
}
