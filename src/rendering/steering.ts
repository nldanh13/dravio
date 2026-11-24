import type { HabitatRegion, Obstacle, Vec } from './originLayout';
import { EDGE_MARGIN } from './originLayout';

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

/** Lực né vật cản phía trước trong tầm `lookahead`. */
export function avoid(pos: Vec, vel: Vec, obstacles: readonly Obstacle[], radius: number, lookahead: number): Vec {
  const speed = len(vel);
  if (speed < 1e-6) return { x: 0, y: 0 };
  const dir = scale(vel, 1 / speed);
  let best: { o: Obstacle; t: number } | null = null;
  for (const o of obstacles) {
    const rel = sub(o, pos);
    const t = rel.x * dir.x + rel.y * dir.y; // khoảng cách dọc hướng đi
    if (t < 0 || t > lookahead + o.r) continue;
    const lateral = Math.abs(rel.x * -dir.y + rel.y * dir.x);
    if (lateral > o.r + radius) continue;
    if (!best || t < best.t) best = { o, t };
  }
  if (!best) return { x: 0, y: 0 };
  const rel = sub(best.o, pos);
  const side = rel.x * -dir.y + rel.y * dir.x >= 0 ? -1 : 1; // rẽ về phía ngược với tâm vật cản
  const strength = (1 - best.t / (lookahead + best.o.r)) * speed * 2;
  return scale({ x: -dir.y * side, y: dir.x * side }, strength);
}

/** Lực đẩy vào trong khi gần mép microhabitat. */
export function contain(pos: Vec, region: HabitatRegion, strength: number): Vec {
  const m = EDGE_MARGIN * 2;
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

/** Ràng buộc cứng sau khi tích phân: trong biên, ngoài vật cản cấm. */
export function resolve(pos: Vec, region: HabitatRegion, blocked: readonly Obstacle[], radius: number): Vec {
  let p = {
    x: Math.min(region.x1 - EDGE_MARGIN, Math.max(region.x0 + EDGE_MARGIN, pos.x)),
    y: Math.min(region.y1 - EDGE_MARGIN, Math.max(region.y0 + EDGE_MARGIN, pos.y)),
  };
  for (const o of blocked) {
    const d = sub(p, o);
    const dist = len(d);
    const min = o.r + radius;
    if (dist < min) p = dist > 1e-6 ? add(o, scale(d, min / dist)) : { x: o.x + min, y: o.y };
  }
  return {
    x: Math.min(region.x1 - EDGE_MARGIN, Math.max(region.x0 + EDGE_MARGIN, p.x)),
    y: Math.min(region.y1 - EDGE_MARGIN, Math.max(region.y0 + EDGE_MARGIN, p.y)),
  };
}
