import { DIET_IDS, type DietId } from '../../../data/care';

/** Icon thức ăn theo nhóm diet (renderer + UI). ID ổn định `icon.food.<dietId>`. */
export interface FoodIcon {
  assetId: string;
  dietId: DietId;
  url: string;
  size: 48;
  /** Điểm neo (đáy giữa) khi đặt trên mặt đất. */
  anchor: readonly [number, number];
}

const files = import.meta.glob<string>('./*.svg', { eager: true, query: '?url&no-inline', import: 'default' });

export const FOOD_ICONS: Readonly<Record<DietId, FoodIcon>> = Object.fromEntries(
  DIET_IDS.map((dietId) => {
    const url = files[`./${dietId}.svg`];
    if (!url) throw new Error(`Missing food icon ${dietId}`);
    return [dietId, { assetId: `icon.food.${dietId}`, dietId, url, size: 48, anchor: [24, 43] as const }];
  }),
) as unknown as Record<DietId, FoodIcon>;
