import type { HabitatRegion, Obstacle, Vec } from './originLayout';
import { EDGE_MARGIN, closestOnPolygon, inWater, obstacleDistance } from './originLayout';

/** Steering thuần (Reynolds): seek/arrive, tránh vật cản, giữ trong biên, tách nhau. Không đọc đồng hồ, không RNG. */

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export function limit(a: Vec, max: number): Vec {
  const l = len(a);
  return l > max && l > 0 ? scale(a, max / l) : a;
}

/** Vận tốc mong muốn tới đích, giảm dần trong bán kính `slow`. */
export function arrive(pos: Vec, target: Vec, maxSpeed: number, slow: number): Vec {
  const d = sub(target, pos);
  const dist = len(d);
  if (dist < 1e-6) return { x: 0, y: 0 };
  const speed = dist < slow ? (maxSpeed * dist) / slow : maxSpeed;
  return scale(d, speed / dist);
}

/** Tỉ lệ nén trục dọc của elip (r / ry); làm việc trong không gian đã "làm tròn" elip. */
const squash = (o: Obstacle): number => o.r / (o.ry ?? o.r);

/** Lực né vật cản (elip) phía trước trong tầm `lookahead`. */
export function avoid(pos: Vec, vel: Vec, obstacles: readonly Obstacle[], radius: number, lookahead: number): Vec {
  const speed = len(vel);
  if (speed < 1e-6) return { x: 0, y: 0 };
  let best: { o: Obstacle; t: number; side: number; k: number } | null = null;
  for (const o of obstacles) {
    if (o.kind !== 'solid') continue;
    const k = squash(o);
    // Không gian chuẩn hóa: y nhân k để elip thành tròn bán kính r.
    const v = { x: vel.x, y: vel.y * k };
    const vl = len(v);
    if (vl < 1e-6) continue;
    const dir = scale(v, 1 / vl);
    const rel = { x: o.x - pos.x, y: (o.y - pos.y) * k };
    const t = rel.x * dir.x + rel.y * dir.y;
    if (t < 0 || t > lookahead + o.r) continue;
    const lateral = rel.x * -dir.y + rel.y * dir.x;
    if (Math.abs(lateral) > o.r + radius) continue;
    if (!best || t < best.t) best = { o, t, side: lateral >= 0 ? -1 : 1, k };
  }
  if (!best) return { x: 0, y: 0 };
  const dir = scale(vel, 1 / speed);
  const strength = (1 - best.t / (lookahead + best.o.r)) * speed * 2;
  return scale({ x: -dir.y * best.side, y: dir.x * best.side }, strength);
}

/** Lực đẩy vào trong khi gần mép vùng đi. */
export function contain(pos: Vec, region: HabitatRegion, strength: number): Vec {
  const m = EDGE_MARGIN * 3;
  let x = 0;
  let y = 0;
  if (pos.x < region.x0 + m) x += (region.x0 + m - pos.x) / m;
  if (pos.x > region.x1 - m) x -= (pos.x - (region.x1 - m)) / m;
  if (pos.y < region.y0 + m) y += (region.y0 + m - pos.y) / m;
  if (pos.y > region.y1 - m) y -= (pos.y - (region.y1 - m)) / m;
  return { x: x * strength, y: y * strength };
}

/** Tách khỏi các rồng quá gần. */
export function separate(pos: Vec, others: readonly Vec[], radius: number, strength: number): Vec {
  let f = { x: 0, y: 0 };
  for (const o of others) {
    const d = sub(pos, o);
    const dist = len(d);
    if (dist > 1e-6 && dist < radius) f = add(f, scale(d, ((radius - dist) / radius / dist) * strength));
  }
  return f;
}

function clampRect(p: Vec, region: HabitatRegion): Vec {
  return {
    x: Math.min(region.x1 - EDGE_MARGIN, Math.max(region.x0 + EDGE_MARGIN, p.x)),
    y: Math.min(region.y1 - EDGE_MARGIN, Math.max(region.y0 + EDGE_MARGIN, p.y)),
  };
}

/**
 * Ràng buộc cứng sau khi tích phân: trong biên, ngoài vật cản rắn, và (nếu `blockWater`) ngoài mặt nước.
 */
export function resolve(pos: Vec, region: HabitatRegion, blocked: readonly Obstacle[], radius: number, blockWater = false): Vec {
  let p = clampRect(pos, region);
  for (let pass = 0; pass < 2; pass++) {
    for (const o of blocked) {
      if (o.kind !== 'solid') continue;
      const nd = obstacleDistance(o, p, radius);
      if (nd < 1) {
        const k = squash(o);
        const d = { x: p.x - o.x, y: (p.y - o.y) * k };
        const dist = len(d);
        const min = o.r + radius;
        const out = dist > 1e-6 ? scale(d, min / dist) : { x: min, y: 0 };
        p = { x: o.x + out.x, y: o.y + out.y / k };
      }
    }
    if (blockWater && region.water && inWater(region, p)) {
      const edge = closestOnPolygon(region.water, p);
      const away = sub(edge, p);
      const l = len(away) || 1;
      p = add(edge, scale(away, radius / l));
    }
    p = clampRect(p, region);
  }
  return p;
}
