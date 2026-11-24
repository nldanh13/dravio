import type { HabitatId } from '../data/g0Biology';
import { HABITAT_OFFSET_X, ORIGIN_HABITATS, PROPS, SCENE, type OriginHabitatId, type Polygon, pointInPolygon } from '../assets/habitats/origin/manifest';

/**
 * Bố cục mặt đất Khởi Nguyên cho renderer và Living World (ADR 0012; không lưu vào save).
 *
 * Toạ độ thế giới = toạ độ cảnh của tài nguyên sinh cảnh (ADR 0103): ba microhabitat xếp
 * Tây → Đông, mỗi cảnh rộng 960 px: bờ hồ (0–960) · đồng cỏ (960–1920) · đá ấm (1920–2880).
 * `x` = toạ độ ngang toàn cục, `y` = toạ độ dọc của điểm chạm đất trong cảnh (xa ↔ gần),
 * `z` = độ cao so với mặt đất (px cảnh). Mọi vùng/vật cản dẫn xuất từ
 * `src/assets/habitats/origin/geometry.json` và vị trí vật thể, nên luật va chạm khớp hình vẽ.
 *
 * Vật cản: `solid` (gốc cây, tảng đá, bụi…) là elip dẹt quanh chân vật thể (`r` ngang, `ry` dọc);
 * mặt hồ là polygon `water`: chỉ rồng biết bơi được vào. Rồng bay vượt qua vật cản khi đang bay.
 */

export interface Vec {
  x: number;
  y: number;
}

export interface Obstacle {
  x: number;
  y: number;
  /** Bán trục ngang. */
  r: number;
  /** Bán trục dọc (mặt đất nhìn nghiêng nên dẹt); mặc định = r. */
  ry?: number;
  kind: 'solid' | 'water';
}

export interface HabitatRegion {
  habitatId: HabitatId;
  /** Biên đi lại được (toạ độ thế giới). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Vật cản rắn (elip quanh chân vật thể). */
  obstacles: Obstacle[];
  /** Mặt nước (polygon, toạ độ thế giới) — null nếu không có. */
  water: Polygon | null;
  /** Gốc x của cảnh trong toạ độ thế giới. */
  sceneX: number;
}

export const SCENE_WIDTH = SCENE.width;
export const SCENE_HEIGHT = SCENE.height;
export const WORLD_WIDTH = SCENE.width * 3;
/** Khoảng cách tối thiểu tới mép vùng đi (px cảnh). */
export const EDGE_MARGIN = 14;

/**
 * Chân vật cản rắn theo vật thể (px vật thể ở tỉ lệ 1): bán trục ngang và lệch tâm so với điểm neo.
 * Vật thể phẳng (thảm, lá súng, bãi bùn, phiến đá nằm) không chặn đường.
 */
const FOOTPRINT: Partial<Record<keyof typeof PROPS, { r: number; ry: number; dx?: number }>> = {
  tree_round: { r: 18, ry: 8 },
  bush_berry: { r: 44, ry: 14 },
  stump: { r: 26, ry: 10 },
  boulder_small: { r: 28, ry: 10 },
  reeds_cluster: { r: 20, ry: 8 },
  log_old: { r: 76, ry: 14, dx: 0 },
  drinking_stone: { r: 36, ry: 10 },
  rock_spire: { r: 38, ry: 12 },
  boulder_large: { r: 66, ry: 18 },
  dry_grass: { r: 16, ry: 6 },
};

function buildRegion(id: OriginHabitatId): HabitatRegion {
  const art = ORIGIN_HABITATS[id];
  const off = HABITAT_OFFSET_X[id];
  const ys = art.walkArea.map(([, y]) => y);
  // Mép trên vùng đi thay đổi vài px theo x: lấy mép trên thấp nhất để vùng chữ nhật luôn nằm trong walkArea.
  const top = Math.max(...art.walkArea.filter(([, y]) => y < SCENE.height / 2 + 120).map(([, y]) => y));
  const obstacles: Obstacle[] = [];
  for (const p of art.props) {
    const fp = FOOTPRINT[p.prop];
    if (!fp) continue;
    obstacles.push({ x: off + p.x + (fp.dx ?? 0) * p.scale, y: p.y - 2, r: fp.r * p.scale, ry: fp.ry * p.scale, kind: 'solid' });
  }
  return {
    habitatId: id,
    x0: off,
    y0: top,
    x1: off + SCENE.width,
    y1: Math.max(...ys),
    obstacles,
    water: art.water ? art.water.map(([x, y]) => [off + x, y] as const) : null,
    sceneX: off,
  };
}

/** Thứ tự Tây → Đông. */
export const ORIGIN_LAYOUT: readonly HabitatRegion[] = (['origin_pondbank', 'origin_meadow', 'origin_warm_rocks'] as const).map(buildRegion);

export function regionOf(habitatId: string): HabitatRegion | undefined {
  return ORIGIN_LAYOUT.find((r) => r.habitatId === habitatId);
}

export function regionAt(p: Vec): HabitatRegion | undefined {
  return ORIGIN_LAYOUT.find((r) => p.x >= r.x0 && p.x < r.x1 && p.y >= r.y0 && p.y <= r.y1);
}

/** Region có cảnh chứa toạ độ x (kể cả ngoài vùng đi). */
export function sceneAtX(x: number): HabitatRegion | undefined {
  return ORIGIN_LAYOUT.find((r) => x >= r.sceneX && x < r.sceneX + SCENE.width);
}

export function inWater(region: HabitatRegion, p: Vec): boolean {
  return !!region.water && pointInPolygon([p.x, p.y], region.water);
}

/** Khoảng cách chuẩn hóa tới tâm elip vật cản (< 1 là bên trong, đã cộng bán kính thân). */
export function obstacleDistance(o: Obstacle, p: Vec, pad = 0): number {
  const rx = o.r + pad;
  const ry = (o.ry ?? o.r) + pad * ((o.ry ?? o.r) / o.r);
  return Math.hypot((p.x - o.x) / rx, (p.y - o.y) / ry);
}

/** Điểm gần nhất trên biên polygon. */
export function closestOnPolygon(poly: Polygon, p: Vec): Vec {
  let best: Vec = { x: p.x, y: p.y };
  let bestD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i] ?? [0, 0];
    const [bx, by] = poly[(i + 1) % poly.length] ?? [0, 0];
    const dx = bx - ax;
    const dy = by - ay;
    const u = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy || 1)));
    const q = { x: ax + u * dx, y: ay + u * dy };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = q;
    }
  }
  return best;
}
