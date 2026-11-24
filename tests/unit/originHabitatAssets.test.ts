import { describe, expect, it } from 'vitest';
import {
  DRAGON_SCENE_SCALE,
  ENV_FX,
  HABITAT_OFFSET_X,
  LIGHTING,
  ORIGIN_HABITATS,
  ORIGIN_HABITAT_IDS,
  PROPS,
  SCENE,
  pointInPolygon,
  type Point,
  type Polygon,
} from '../../src/assets/habitats/origin/manifest';
import { HABITAT_PROFILES } from '../../src/data/g0Biology';
import { HABITAT_UNLOCK_RULES } from '../../src/data/habitatUnlocks';
import { vi } from '../../src/i18n/vi';
import { en } from '../../src/i18n/en';

const SRC = import.meta.glob<string>('../../src/assets/habitats/origin/**/*.svg', { eager: true, query: '?raw', import: 'default' });
const src = (rel: string): string => {
  const s = SRC[`../../src/assets/habitats/origin/${rel}`];
  if (!s) throw new Error(`missing ${rel}`);
  return s;
};
const distToPoly = ([x, y]: Point, poly: Polygon): number => {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i] ?? [0, 0];
    const [bx, by] = poly[(i + 1) % poly.length] ?? [0, 0];
    const dx = bx - ax;
    const dy = by - ay;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + u * dx - x, ay + u * dy - y));
  }
  return best;
};

describe('Origin habitat art', () => {
  it('covers exactly the three Origin microhabitats of the biology catalog', () => {
    const origin = Object.entries(HABITAT_PROFILES).filter(([, p]) => p.zoneId === 'origin').map(([id]) => id).sort();
    expect([...ORIGIN_HABITAT_IDS].sort()).toEqual(origin);
    for (const id of ORIGIN_HABITAT_IDS) {
      const key = ORIGIN_HABITATS[id].nameKey;
      expect((vi as Record<string, string>)[key]).toBeTruthy();
      expect((en as Record<string, string>)[key]).toBeTruthy();
    }
  });

  it('every habitat has 5 separable parallax layers, ordered back to front', () => {
    for (const id of ORIGIN_HABITAT_IDS) {
      const layers = ORIGIN_HABITATS[id].layers;
      expect(layers.map((l) => l.id)).toEqual(['sky', 'far', 'mid', 'ground', 'foreground']);
      const z = layers.map((l) => l.z);
      expect([...z].sort((a, b) => a - b)).toEqual(z);
      const par = layers.map((l) => l.parallax);
      expect([...par].sort((a, b) => a - b)).toEqual(par);
      for (const l of layers) {
        const svg = src(`${id}/${l.id}.svg`);
        expect(svg).toContain(`viewBox="0 0 ${l.width} ${l.height}"`);
        expect(svg).toContain(`data-layer="${l.id}"`);
        expect(l.url.startsWith('data:')).toBe(false);
      }
    }
  });

  it('all habitat SVGs are self-contained, text-free and marked prototype', () => {
    expect(Object.keys(SRC).length).toBeGreaterThanOrEqual(45);
    const ids: string[] = [];
    for (const [file, svg] of Object.entries(SRC)) {
      expect(svg, file).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
      expect(svg, file).not.toMatch(/<script|foreignObject|<image|<text|\shref=|url\((?!#)|on\w+=/i);
      expect(svg, file).toContain('data-asset-status="prototype"');
      ids.push(...[...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1] ?? ''));
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the three scenes form one continuous region west → east (edges match)', () => {
    const order = [...ORIGIN_HABITAT_IDS].sort((a, b) => HABITAT_OFFSET_X[a] - HABITAT_OFFSET_X[b]);
    expect(order).toEqual(['origin_pondbank', 'origin_meadow', 'origin_warm_rocks']);
    for (let i = 0; i + 1 < order.length; i++) {
      const a = ORIGIN_HABITATS[order[i]!];
      const b = ORIGIN_HABITATS[order[i + 1]!];
      expect(HABITAT_OFFSET_X[b.id] - HABITAT_OFFSET_X[a.id]).toBe(SCENE.width);
      const aRight = a.walkArea.find(([x, y]) => x === SCENE.width && y < 400);
      const bLeft = b.walkArea.find(([x, y]) => x === 0 && y < 400);
      expect(aRight?.[1]).toBeDefined();
      expect(Math.abs((aRight?.[1] ?? 0) - (bLeft?.[1] ?? 99))).toBeLessThanOrEqual(1);
      expect(Math.abs((a.trail.at(-1)?.[1] ?? 0) - (b.trail[0]?.[1] ?? 99))).toBeLessThanOrEqual(1);
    }
  });

  it('only the pond bank has water, with a swim entry on its shore', () => {
    for (const id of ORIGIN_HABITAT_IDS) {
      const h = ORIGIN_HABITATS[id];
      expect(h.water !== null).toBe(id === 'origin_pondbank');
      expect(h.spots.some((s) => s.kind === 'swim_entry')).toBe(id === 'origin_pondbank');
    }
    const pond = ORIGIN_HABITATS.origin_pondbank;
    const entry = pond.spots.find((s) => s.kind === 'swim_entry');
    expect(entry?.requires).toBe('swim');
    expect(distToPoly([entry!.x, entry!.y], pond.water!)).toBeLessThanOrEqual(entry!.r);
    expect(src('origin_pondbank/ground.svg')).toContain('data-part="water"');
  });

  it('spots are well-formed: ground spots on walkable land, perches elevated and fly-only', () => {
    for (const id of ORIGIN_HABITAT_IDS) {
      const h = ORIGIN_HABITATS[id];
      expect(new Set(h.spots.map((s) => s.id)).size).toBe(h.spots.length);
      expect(h.spots.some((s) => s.kind === 'rest')).toBe(true);
      expect(h.spots.some((s) => !['rest', 'perch'].includes(s.kind))).toBe(true);
      // HABITAT_PROFILES.perch = true → phải có điểm đậu.
      expect(h.spots.some((s) => s.kind === 'perch')).toBe(HABITAT_PROFILES[id].perch);
      for (const s of h.spots) {
        if (s.prop) expect(h.props.some((p) => p.prop === s.prop), `${s.id} prop placed`).toBe(true);
        if (s.kind === 'perch') {
          expect(s.requires).toBe('fly');
          expect(s.elevated).toBe(true);
          expect(s.sortY).toBeGreaterThan(s.y);
        } else {
          expect(s.elevated).toBe(false);
          expect(s.sortY).toBe(s.y);
          expect(pointInPolygon([s.x, s.y], h.walkArea), `${s.id} on walk area`).toBe(true);
          if (h.water && s.kind !== 'swim_entry') expect(pointInPolygon([s.x, s.y], h.water), `${s.id} not in water`).toBe(false);
        }
      }
    }
  });

  it('props exist, sit inside the scene and standing props stay out of the water', () => {
    for (const p of Object.values(PROPS)) {
      const svg = src(`props/${p.id}.svg`);
      expect(svg).toContain(`viewBox="0 0 ${p.width} ${p.height}"`);
      expect(p.anchor[0]).toBe(p.width / 2);
    }
    for (const id of ORIGIN_HABITAT_IDS) {
      const h = ORIGIN_HABITATS[id];
      for (const pl of h.props) {
        expect(PROPS[pl.prop]).toBeDefined();
        expect(pl.x >= 0 && pl.x <= SCENE.width && pl.y > 300 && pl.y <= SCENE.height).toBe(true);
        if (h.water && pl.prop !== 'lily_pads') expect(pointInPolygon([pl.x, pl.y], h.water), `${id}/${pl.prop}`).toBe(false);
      }
    }
    expect(ORIGIN_HABITATS.origin_pondbank.props.some((p) => p.prop === 'lily_pads' && pointInPolygon([p.x, p.y], ORIGIN_HABITATS.origin_pondbank.water!))).toBe(true);
  });

  it('scale contract: an Adult dragon is smaller than the meadow tree and larger than a pebble', () => {
    const adultW = 240 * DRAGON_SCENE_SCALE;
    expect(adultW).toBeGreaterThan(100);
    expect(adultW).toBeLessThan(160);
    expect(PROPS.tree_round.height).toBeGreaterThan(200 * DRAGON_SCENE_SCALE * 1.8);
    expect(PROPS.boulder_small.width).toBeLessThan(adultW);
  });

  it('environment emitters reference existing FX, are decorative and stay in the scene', () => {
    for (const fx of Object.values(ENV_FX)) expect(src(`fx/${fx.id}.svg`)).toContain(`viewBox="0 0 ${fx.width} ${fx.height}"`);
    for (const id of ORIGIN_HABITAT_IDS) {
      const ems = ORIGIN_HABITATS[id].emitters;
      expect(ems.length).toBeGreaterThan(0);
      for (const em of ems) {
        for (const f of em.frames) expect(ENV_FX[f]).toBeDefined();
        expect(em.decorative).toBe(true);
        expect(em.times.length).toBeGreaterThan(0);
        expect(em.maxActive).toBeGreaterThan(0);
        for (const [x, y] of em.area) expect(x >= 0 && x <= SCENE.width && y >= 0 && y <= SCENE.height).toBe(true);
        if (em.frames.length > 1) expect(em.frameMs).toBeGreaterThan(0);
      }
    }
  });

  it('lighting keeps dragons readable at night (scene tint lighter than backdrop)', () => {
    expect(LIGHTING.day).toEqual({ backdrop: null, scene: null });
    for (const t of ['dusk', 'night'] as const) {
      const l = LIGHTING[t];
      expect(l.scene!.opacity).toBeLessThan(l.backdrop!.opacity);
      expect(l.scene!.opacity).toBeLessThanOrEqual(0.4);
    }
  });

  it('undiscovered state matches the unlock rules (thermal / aquatic / default-open)', () => {
    const icon = { DISC_EMBERLING_THERMAL: 'thermal', DISC_AQUATIC_HABITAT: 'aquatic' } as const;
    for (const id of ORIGIN_HABITAT_IDS) {
      const rule = HABITAT_UNLOCK_RULES[id];
      const u = ORIGIN_HABITATS[id].undiscovered;
      expect(u.marker).toBe(rule.requires ? icon[rule.requires] : 'generic');
      expect(src(`undiscovered/marker_${u.marker}.svg`)).toContain(`data-icon="${u.marker}"`);
      expect(u.hideProps && u.hideEmitters).toBe(true);
      expect(u.desaturate).toBeGreaterThan(0);
      expect(u.desaturate).toBeLessThanOrEqual(1);
    }
    expect(src('undiscovered/mist.svg')).toContain('viewBox="0 0 960 540"');
  });

  it('gateway hints are visual only and present in the art', () => {
    expect(ORIGIN_HABITATS.origin_pondbank.gatewayHint?.edgeId).toBe('origin_ocean_estuary');
    expect(src('origin_pondbank/ground.svg')).toContain('data-part="stream"');
    expect(src('origin_pondbank/mid.svg')).toContain('data-part="estuary-hint"');
    expect(ORIGIN_HABITATS.origin_meadow.gatewayHint?.edgeId).toBe('origin_sky_low_island');
    expect(src('origin_meadow/sky.svg')).toContain('data-part="sky-island"');
    expect(ORIGIN_HABITATS.origin_warm_rocks.gatewayHint).toBeNull();
  });
});
