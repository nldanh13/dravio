import type { HabitatId } from '../../../data/g0Biology';
import geometry from './geometry.json';

/**
 * Tài nguyên môi trường Khởi Nguyên (G1 Art PR3, ADR 0103) — chỉ dữ liệu hiển thị.
 * Không chứa luật domain: mở khóa, sức chứa, suitability, bố trí rồng thuộc Game Engine
 * (`src/data/habitatUnlocks.ts`, `src/engine/world/*`). Toạ độ theo px cảnh 960×540,
 * gốc trên trái; vật thể neo đáy giữa. Sinh bởi `scripts/art/generate-origin-habitats.mjs`.
 */

export type OriginHabitatId = Extract<HabitatId, 'origin_meadow' | 'origin_pondbank' | 'origin_warm_rocks'>;
export const ORIGIN_HABITAT_IDS: readonly OriginHabitatId[] = ['origin_pondbank', 'origin_meadow', 'origin_warm_rocks'];

export type Point = readonly [number, number];
export type Polygon = readonly Point[];

export const SCENE = { width: 960, height: 540 } as const;
/**
 * Tỉ lệ rồng trong cảnh: px cảnh trên mỗi đơn vị viewBox sprite rồng (240×200).
 * Adult ≈ 132 px cảnh; vật thể được vẽ theo tỉ lệ này (cây ≈ 2 lần rồng Adult).
 */
export const DRAGON_SCENE_SCALE = 0.55;

/** Tây → Đông; offset để ghép liền ba cảnh (bản đồ tổng quan, chuyển cảnh trượt ngang). */
export const HABITAT_OFFSET_X: Readonly<Record<OriginHabitatId, number>> = geometry.habitatOffsetX;

// ---------------------------------------------------------------- layers
export type LayerId = 'sky' | 'far' | 'mid' | 'ground' | 'foreground';
export interface HabitatLayer {
  id: LayerId;
  url: string;
  width: number;
  height: number;
  /** Hệ số parallax theo camera ngang (0 = đứng yên, 1 = theo mặt đất). */
  parallax: number;
  /** Thứ tự vẽ; rồng + vật thể y-sort nằm giữa `ground` (z 40) và `foreground` (z 90). */
  z: number;
}
const LAYER_SPEC: Readonly<Record<LayerId, Omit<HabitatLayer, 'id' | 'url'>>> = {
  sky: { width: 960, height: 330, parallax: 0.05, z: 0 },
  far: { width: 960, height: 330, parallax: 0.15, z: 10 },
  mid: { width: 960, height: 330, parallax: 0.35, z: 20 },
  ground: { width: 960, height: 540, parallax: 1, z: 40 },
  foreground: { width: 960, height: 540, parallax: 1.15, z: 90 },
};
/** z của lớp đối tượng động (rồng, vật thể, hiệu ứng) — y-sort theo điểm neo. */
export const ACTOR_LAYER_Z = 50;

const files = import.meta.glob<string>('./**/*.svg', { eager: true, query: '?url&no-inline', import: 'default' });
const url = (rel: string): string => {
  const u = files[`./${rel}`];
  if (!u) throw new Error(`Missing habitat asset ${rel}`);
  return u;
};

// ---------------------------------------------------------------- props
export type PropId =
  | 'tree_round'
  | 'bush_berry'
  | 'flower_patch'
  | 'moss_bed'
  | 'stump'
  | 'boulder_small'
  | 'reeds_cluster'
  | 'lily_pads'
  | 'log_old'
  | 'mud_wallow'
  | 'drinking_stone'
  | 'flat_warm_stone'
  | 'rock_spire'
  | 'boulder_large'
  | 'dry_grass'
  | 'warm_vent';

export interface PropAsset {
  /** `habitat.origin.prop.<id>` */
  assetId: string;
  id: PropId;
  url: string;
  width: number;
  height: number;
  /** Điểm neo (đáy giữa) trong viewBox của vật thể. */
  anchor: Point;
  /** Vật thể nằm phẳng trên đất (vẽ dưới rồng, không y-sort) hay đứng (y-sort cùng rồng). */
  flat: boolean;
}
const PROP_SIZE: Readonly<Record<PropId, readonly [number, number, boolean]>> = {
  tree_round: [200, 260, false],
  bush_berry: [120, 90, false],
  flower_patch: [110, 50, true],
  moss_bed: [130, 44, true],
  stump: [90, 70, false],
  boulder_small: [70, 50, false],
  reeds_cluster: [90, 120, false],
  lily_pads: [140, 40, true],
  log_old: [180, 70, false],
  mud_wallow: [150, 40, true],
  drinking_stone: [90, 50, false],
  flat_warm_stone: [180, 60, true],
  rock_spire: [110, 200, false],
  boulder_large: [160, 120, false],
  dry_grass: [80, 50, false],
  warm_vent: [90, 60, true],
};
export const PROPS: Readonly<Record<PropId, PropAsset>> = Object.fromEntries(
  (Object.keys(PROP_SIZE) as PropId[]).map((id) => {
    const [width, height, flat] = PROP_SIZE[id];
    return [id, { assetId: `habitat.origin.prop.${id}`, id, url: url(`props/${id}.svg`), width, height, anchor: [width / 2, height - 4], flat }];
  }),
) as unknown as Record<PropId, PropAsset>;

export interface PropPlacement {
  prop: PropId;
  /** Vị trí điểm neo trong cảnh. */
  x: number;
  y: number;
  scale: number;
  flip: boolean;
}

// ---------------------------------------------------------------- spots
/**
 * Vị trí nghỉ/tương tác minh họa. `requires` là khả năng vận động cần có (đối chiếu
 * SPECIES_BIOLOGY.locomotion). Chọn rồng nào dùng spot nào là việc của Behavior Engine.
 */
export type SpotKind = 'rest' | 'perch' | 'feed' | 'drink' | 'bask' | 'warm' | 'swim_entry' | 'play';
export interface HabitatSpot {
  id: string;
  kind: SpotKind;
  /** Điểm neo chân rồng khi dùng spot (px cảnh). Perch có thể cao hơn mặt đất. */
  x: number;
  y: number;
  /** Bán kính vùng chấp nhận (px cảnh). */
  r: number;
  requires: 'walk' | 'swim' | 'fly' | null;
  /** Vật thể gắn với spot (nếu có). */
  prop: PropId | null;
  /** Spot ở trên cao (cành, đỉnh đá): rồng đứng trên đó không vẽ bóng mặt đất. */
  elevated: boolean;
  /**
   * y dùng để sắp chiều sâu (y-sort) cho rồng tại spot. Mặt đất: = y. Trên cao: = y của vật thể
   * + 1 để rồng luôn vẽ SAU (trên) vật thể nó đứng lên (cành cây, khúc gỗ, đỉnh đá).
   */
  sortY: number;
}

// ---------------------------------------------------------------- environment FX
export type EnvFxId =
  | 'pollen'
  | 'petal'
  | 'butterfly_a'
  | 'butterfly_b'
  | 'dragonfly'
  | 'water_glint'
  | 'firefly'
  | 'heat_haze'
  | 'dust_mote'
  | 'steam_puff';
export type TimeOfDay = 'day' | 'dusk' | 'night';
export type EnvMotion = 'drift' | 'flutter' | 'dart' | 'twinkle' | 'shimmer' | 'rise';

export interface EnvFxAsset {
  assetId: string;
  id: EnvFxId;
  url: string;
  width: number;
  height: number;
}
const FX_SIZE: Readonly<Record<EnvFxId, readonly [number, number]>> = {
  pollen: [24, 24],
  petal: [20, 20],
  butterfly_a: [32, 24],
  butterfly_b: [32, 24],
  dragonfly: [40, 24],
  water_glint: [32, 16],
  firefly: [16, 16],
  heat_haze: [64, 48],
  dust_mote: [12, 12],
  steam_puff: [40, 40],
};
export const ENV_FX: Readonly<Record<EnvFxId, EnvFxAsset>> = Object.fromEntries(
  (Object.keys(FX_SIZE) as EnvFxId[]).map((id) => [id, { assetId: `habitat.origin.fx.${id}`, id, url: url(`fx/${id}.svg`), width: FX_SIZE[id][0], height: FX_SIZE[id][1] }]),
) as unknown as Record<EnvFxId, EnvFxAsset>;

export interface EnvEmitter {
  /** Khung flipbook (butterfly dùng 2 khung). */
  frames: readonly EnvFxId[];
  frameMs: number;
  /** Vùng sinh (px cảnh) — chữ nhật hoặc polygon. */
  area: Polygon;
  /** Số hạt tối đa cùng lúc. */
  maxActive: number;
  /** Hạt sinh mỗi phút (khi chưa đủ maxActive). */
  perMinute: number;
  lifeMs: number;
  motion: EnvMotion;
  times: readonly TimeOfDay[];
  /** Trang trí: tắt khi reduced motion. Hiệu ứng môi trường ở G1 đều là trang trí. */
  decorative: true;
}

// ---------------------------------------------------------------- lighting
/**
 * Ánh sáng theo thời điểm, vẽ bằng `globalCompositeOperation = 'multiply'`:
 * 1. `backdrop` phủ riêng sky/far/mid (trước khi vẽ ground);
 * 2. `scene` phủ TOÀN khung sau cùng (trên rồng, vật thể, foreground; dưới UI).
 * `scene` nhẹ hơn để rồng vẫn nhận diện được ban đêm.
 */
export interface LightingSpec {
  backdrop: { color: string; opacity: number } | null;
  scene: { color: string; opacity: number } | null;
}
export const LIGHTING: Readonly<Record<TimeOfDay, LightingSpec>> = {
  day: { backdrop: null, scene: null },
  dusk: { backdrop: { color: '#F2A66B', opacity: 0.35 }, scene: { color: '#F2A66B', opacity: 0.2 } },
  night: { backdrop: { color: '#2E3A66', opacity: 0.6 }, scene: { color: '#3B4A7A', opacity: 0.35 } },
};

// ---------------------------------------------------------------- undiscovered
export type MarkerIcon = 'thermal' | 'aquatic' | 'generic';
export interface UndiscoveredSpec {
  /** Sương phủ toàn cảnh (960×540). */
  mistUrl: string;
  /** Biển báo khám phá (96×128, neo đáy giữa) — không chữ; UI hiển thị điều kiện bằng t(). */
  markerUrl: string;
  marker: MarkerIcon;
  markerAt: Point;
  /** Mức khử bão hòa cho lớp đất khi chưa khám phá (0–1). */
  desaturate: number;
  /** Ẩn vật thể, spot và hiệu ứng môi trường khi chưa khám phá. */
  hideProps: true;
  hideEmitters: true;
}

// ---------------------------------------------------------------- habitat
export interface OriginHabitatArt {
  id: OriginHabitatId;
  /** Khoá i18n tên sinh cảnh (đã có trong vi.ts/en.ts). */
  nameKey: `habitat.${OriginHabitatId}`;
  layers: readonly HabitatLayer[];
  /** Vùng đi bộ (polygon) — trừ `water` nếu có. */
  walkArea: Polygon;
  /** Mặt nước (bơi) — chỉ bờ hồ. */
  water: Polygon | null;
  trail: readonly Point[];
  props: readonly PropPlacement[];
  spots: readonly HabitatSpot[];
  emitters: readonly EnvEmitter[];
  undiscovered: UndiscoveredSpec;
  /** Gợi ý thị giác về cửa ngõ world graph (chỉ hiển thị, không phải luật di chuyển). */
  gatewayHint: { edgeId: string; part: string } | null;
}

type GeoHabitat = { walkArea: number[][]; trail: number[][]; water: number[][] | null };
const GEO = geometry.habitats as Record<OriginHabitatId, GeoHabitat>;
const asPoly = (pts: readonly (readonly number[])[]): Polygon => pts.map((p) => [p[0] ?? 0, p[1] ?? 0] as const);
const rectArea = (x0: number, y0: number, x1: number, y1: number): Polygon => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const P = (prop: PropId, x: number, y: number, scale = 1, flip = false): PropPlacement => ({ prop, x, y, scale, flip });
const S = (id: string, kind: SpotKind, x: number, y: number, r: number, prop: PropId | null = null, requires: HabitatSpot['requires'] = null, propY: number | null = null): HabitatSpot => ({
  id,
  kind,
  x,
  y,
  r,
  prop,
  requires,
  elevated: propY !== null,
  sortY: propY !== null ? propY + 1 : y,
});

function layersOf(id: OriginHabitatId): HabitatLayer[] {
  return (Object.keys(LAYER_SPEC) as LayerId[]).map((l) => ({ id: l, url: url(`${id}/${l}.svg`), ...LAYER_SPEC[l] }));
}
const undiscovered = (marker: MarkerIcon): UndiscoveredSpec => ({
  mistUrl: url('undiscovered/mist.svg'),
  markerUrl: url(`undiscovered/marker_${marker}.svg`),
  marker,
  markerAt: [480, 440],
  desaturate: 0.65,
  hideProps: true,
  hideEmitters: true,
});

export const ORIGIN_HABITATS: Readonly<Record<OriginHabitatId, OriginHabitatArt>> = {
  origin_pondbank: {
    id: 'origin_pondbank',
    nameKey: 'habitat.origin_pondbank',
    layers: layersOf('origin_pondbank'),
    walkArea: asPoly(GEO.origin_pondbank.walkArea),
    water: GEO.origin_pondbank.water ? asPoly(GEO.origin_pondbank.water) : null,
    trail: asPoly(GEO.origin_pondbank.trail),
    props: [
      P('reeds_cluster', 240, 350),
      P('reeds_cluster', 716, 356, 0.85, true),
      P('lily_pads', 520, 404),
      P('lily_pads', 380, 420, 0.7, true),
      P('mud_wallow', 150, 474),
      P('drinking_stone', 770, 424),
      P('log_old', 840, 482),
      P('boulder_small', 60, 400, 0.9),
    ],
    spots: [
      S('pond_swim_entry', 'swim_entry', 300, 440, 40, null, 'swim'),
      S('pond_drink', 'drink', 738, 420, 30, 'drinking_stone'),
      S('pond_mud_rest', 'rest', 150, 470, 50, 'mud_wallow'),
      S('pond_log_rest', 'rest', 760, 490, 40, 'log_old'),
      S('pond_log_perch', 'perch', 840, 440, 30, 'log_old', 'fly', 482),
    ],
    emitters: [
      { frames: ['water_glint'], frameMs: 0, area: rectArea(250, 350, 690, 450), maxActive: 6, perMinute: 40, lifeMs: 1200, motion: 'shimmer', times: ['day', 'dusk'], decorative: true },
      { frames: ['dragonfly'], frameMs: 0, area: rectArea(200, 320, 760, 420), maxActive: 2, perMinute: 6, lifeMs: 6000, motion: 'dart', times: ['day'], decorative: true },
      { frames: ['firefly'], frameMs: 0, area: rectArea(40, 330, 920, 500), maxActive: 10, perMinute: 30, lifeMs: 4000, motion: 'twinkle', times: ['dusk', 'night'], decorative: true },
    ],
    undiscovered: undiscovered('aquatic'),
    gatewayHint: { edgeId: 'origin_ocean_estuary', part: 'stream' },
  },
  origin_meadow: {
    id: 'origin_meadow',
    nameKey: 'habitat.origin_meadow',
    layers: layersOf('origin_meadow'),
    walkArea: asPoly(GEO.origin_meadow.walkArea),
    water: null,
    trail: asPoly(GEO.origin_meadow.trail),
    props: [
      P('stump', 110, 364),
      P('tree_round', 790, 366),
      P('bush_berry', 560, 374),
      P('flower_patch', 210, 424),
      P('flower_patch', 640, 470, 0.8, true),
      P('moss_bed', 330, 470),
      P('boulder_small', 470, 416, 0.8),
    ],
    spots: [
      S('meadow_moss_rest', 'rest', 330, 468, 55, 'moss_bed'),
      S('meadow_berry_feed', 'feed', 560, 392, 40, 'bush_berry'),
      S('meadow_flower_play', 'play', 210, 430, 50, 'flower_patch'),
      S('meadow_tree_perch', 'perch', 850, 274, 24, 'tree_round', 'fly', 366),
      S('meadow_stump_perch', 'perch', 110, 324, 20, 'stump', 'fly', 364),
    ],
    emitters: [
      { frames: ['pollen'], frameMs: 0, area: rectArea(0, 300, 960, 520), maxActive: 12, perMinute: 24, lifeMs: 5000, motion: 'drift', times: ['day'], decorative: true },
      { frames: ['petal'], frameMs: 0, area: rectArea(0, 280, 960, 480), maxActive: 5, perMinute: 8, lifeMs: 6000, motion: 'drift', times: ['day', 'dusk'], decorative: true },
      { frames: ['butterfly_a', 'butterfly_b'], frameMs: 160, area: rectArea(100, 320, 860, 470), maxActive: 2, perMinute: 4, lifeMs: 9000, motion: 'flutter', times: ['day'], decorative: true },
      { frames: ['firefly'], frameMs: 0, area: rectArea(0, 320, 960, 520), maxActive: 8, perMinute: 24, lifeMs: 4000, motion: 'twinkle', times: ['night'], decorative: true },
    ],
    undiscovered: undiscovered('generic'),
    gatewayHint: { edgeId: 'origin_sky_low_island', part: 'sky-island' },
  },
  origin_warm_rocks: {
    id: 'origin_warm_rocks',
    nameKey: 'habitat.origin_warm_rocks',
    layers: layersOf('origin_warm_rocks'),
    walkArea: asPoly(GEO.origin_warm_rocks.walkArea),
    water: null,
    trail: asPoly(GEO.origin_warm_rocks.trail),
    props: [
      P('boulder_large', 150, 404),
      P('flat_warm_stone', 370, 420),
      P('dry_grass', 560, 362),
      P('dry_grass', 700, 506, 0.9, true),
      P('warm_vent', 640, 474),
      P('rock_spire', 850, 386),
      P('boulder_small', 260, 500, 0.8, true),
    ],
    spots: [
      S('rocks_bask', 'bask', 370, 410, 60, 'flat_warm_stone'),
      S('rocks_vent_warm', 'warm', 640, 478, 40, 'warm_vent'),
      S('rocks_sand_rest', 'rest', 520, 486, 50),
      S('rocks_spire_perch', 'perch', 857, 206, 18, 'rock_spire', 'fly', 386),
    ],
    emitters: [
      { frames: ['heat_haze'], frameMs: 0, area: rectArea(220, 340, 780, 440), maxActive: 4, perMinute: 12, lifeMs: 2500, motion: 'shimmer', times: ['day'], decorative: true },
      { frames: ['dust_mote'], frameMs: 0, area: rectArea(0, 320, 960, 520), maxActive: 8, perMinute: 16, lifeMs: 4000, motion: 'drift', times: ['day', 'dusk'], decorative: true },
      { frames: ['steam_puff'], frameMs: 0, area: rectArea(626, 440, 654, 450), maxActive: 3, perMinute: 14, lifeMs: 1800, motion: 'rise', times: ['day', 'dusk', 'night'], decorative: true },
    ],
    undiscovered: undiscovered('thermal'),
    gatewayHint: null,
  },
};

/** Điểm có nằm trong polygon không (ray casting) — tiện ích hình học thuần cho renderer/test. */
export function pointInPolygon([x, y]: Point, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i] ?? [0, 0];
    const [xj, yj] = poly[j] ?? [0, 0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
