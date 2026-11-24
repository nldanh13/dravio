import { describe, expect, it } from 'vitest';
import {
  COMMON_DRAGON_SPRITES,
  COMMON_SPECIES,
  SPRITE_MUTATIONS,
  SPRITE_STAGES,
  getCommonDragonSprite,
} from '../../src/assets/dragons/manifest';
import { SPRITES as G0_SPRITES } from '../../src/assets/manifest';
import { SPECIES_BIOLOGY } from '../../src/data/g0Biology';
import { getSpecies } from '../../src/data/dragons';

const NEW_SOURCES = import.meta.glob<string>('../../src/assets/dragons/common/*/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const NEW_SPECIES = ['droplet', 'sprout', 'zephyr'] as const;
const src = (sp: string, st: string, mu: string): string => {
  const s = NEW_SOURCES[`../../src/assets/dragons/common/${sp}/${st}_${mu}.svg`];
  if (!s) throw new Error(`missing ${sp}/${st}_${mu}`);
  return s;
};
/** Nội dung một lớp phẳng `<g data-layer="…">…</g>` (lớp không lồng <g>). */
const layer = (svg: string, name: string): string | null => {
  const m = new RegExp(`<g data-layer="${name}"[^>]*>([\\s\\S]*?)</g>`).exec(svg);
  return m ? (m[1] ?? '') : null;
};
/** Kiểm tra cân bằng thẻ XML đơn giản (không có parser trong môi trường node). */
const wellFormed = (svg: string): boolean => {
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g)) {
    const [, close, name, self] = m;
    if (self) continue;
    if (close) {
      if (stack.pop() !== name) return false;
    } else stack.push(name ?? '');
  }
  return stack.length === 0;
};

describe('Common dragon sprite set (48)', () => {
  it('covers 4 species × 3 stages × 4 Aether variants with unique stable asset IDs', () => {
    expect(COMMON_DRAGON_SPRITES).toHaveLength(48);
    expect(new Set(COMMON_DRAGON_SPRITES.map((s) => s.assetId)).size).toBe(48);
    for (const sp of COMMON_SPECIES) {
      expect(getSpecies(sp).rarity).toBe('common');
      for (const st of SPRITE_STAGES) {
        for (const mu of SPRITE_MUTATIONS) {
          const a = getCommonDragonSprite(sp, st, mu);
          expect(a?.assetId).toBe(`dragon.${sp}.${st}.${mu}`);
          expect(a?.url).toBeTruthy();
          expect(a?.anchor).toEqual({ x: 120, y: 170 });
          expect(a?.width).toBe(240);
          expect(a?.height).toBe(200);
          expect(a?.hitbox.w).toBeGreaterThan(0);
          expect(a?.source.tier).toBe('prototype');
        }
      }
    }
  });

  it('reuses the 12 existing Emberling files in place (not moved)', () => {
    const ember = COMMON_DRAGON_SPRITES.filter((s) => s.speciesId === 'emberling');
    expect(ember).toHaveLength(12);
    for (const e of ember) {
      expect(G0_SPRITES.find((g) => g.stage === e.stage && g.mutation === e.mutation)?.url).toBe(e.url);
      expect(e.source.review).toBe('approved-prototype');
    }
    expect(COMMON_DRAGON_SPRITES.filter((s) => s.source.review === 'pending-author-review')).toHaveLength(36);
  });

  it('new SVGs are well-formed, self-contained and in the shared 240×200 frame', () => {
    expect(Object.keys(NEW_SOURCES)).toHaveLength(36);
    for (const svg of Object.values(NEW_SOURCES)) {
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="240" height="200" viewBox="0 0 240 200"/);
      expect(svg).not.toMatch(/<script|foreignObject|<image|href=|url\((?!#)|@import|on\w+=/i);
      expect(svg).toContain('data-asset-status="prototype"');
      expect(wellFormed(svg)).toBe(true);
      expect(svg.length).toBeLessThan(12_000);
    }
  });

  it('internal IDs are unique per file so sprites can be inlined together', () => {
    const all = Object.values(NEW_SOURCES).flatMap((s) => [...s.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    expect(new Set(all).size).toBe(all.length);
  });

  it('variants carry a non-colour badge and motif; Normal has neither', () => {
    for (const sp of NEW_SPECIES) {
      for (const st of SPRITE_STAGES) {
        const n = src(sp, st, 'normal');
        expect(n).not.toContain('data-variant-badge');
        expect(n).not.toContain('data-aether');
        for (const mu of ['crystal', 'golden', 'prismatic']) {
          const v = src(sp, st, mu);
          expect(v).toContain(`data-variant-badge="${mu}"`);
          expect(layer(v, 'aether-fx')).toBeTruthy();
        }
      }
    }
  });

  it('Aether variant never alters anatomy, phenotype pattern or eyes (separate systems)', () => {
    for (const sp of NEW_SPECIES) {
      for (const st of SPRITE_STAGES) {
        const base = src(sp, st, 'normal');
        for (const name of ['body', 'pattern', 'eye']) {
          const ref = layer(base, name);
          expect(ref, `${sp}/${st} ${name}`).toBeTruthy();
          for (const mu of ['crystal', 'golden', 'prismatic']) {
            expect(layer(src(sp, st, mu), name), `${sp}/${st}/${mu} ${name}`).toBe(ref);
          }
        }
      }
    }
  });

  it('stages are distinct drawings, not one rescaled shape', () => {
    for (const sp of NEW_SPECIES) {
      const strip = (s: string) => (layer(s, 'body') ?? '').replace(/transform="[^"]*"/g, '');
      const bodies = SPRITE_STAGES.map((st) => strip(src(sp, st, 'normal')));
      expect(new Set(bodies).size).toBe(3);
      // Số chi tiết giải phẫu tăng theo tuổi (vây/lá/lông).
      const parts = bodies.map((b) => (b.match(/<(path|ellipse|circle)/g) ?? []).length);
      expect(parts[0]).toBeLessThan(parts[2] ?? 0);
    }
  });

  it('species silhouettes differ and match biology (palette, wings only for flyers)', () => {
    const adultBodies = NEW_SPECIES.map((sp) => layer(src(sp, 'adult', 'normal'), 'body'));
    expect(new Set(adultBodies).size).toBe(3);
    for (const sp of NEW_SPECIES) {
      const bio = SPECIES_BIOLOGY[sp];
      const body = layer(src(sp, 'adult', 'normal'), 'body') ?? '';
      for (const colour of [bio.palette.primary, bio.palette.secondary]) expect(body).toContain(colour);
      const loco = bio.locomotion as readonly string[];
      // Mọi stage: có cánh ⇔ loài bay được; vây/màng chân ⇔ bơi được; móng đào ⇔ burrow.
      for (const st of SPRITE_STAGES) {
        const b = layer(src(sp, st, 'normal'), 'body') ?? '';
        expect(b.includes('data-part="wing"'), `${sp}/${st} wing`).toBe(loco.includes('fly'));
        expect(b.includes('data-part="webbed-foot"'), `${sp}/${st} web`).toBe(loco.includes('swim'));
      }
      expect(body.includes('data-part="digging-claw"')).toBe(loco.includes('burrow'));
    }
    expect(layer(src('zephyr', 'adult', 'normal'), 'body')).toContain('data-part="perching-foot"');
    expect(layer(src('zephyr', 'adult', 'normal'), 'body')).toContain('data-part="cloud-tail"');
    expect(layer(src('droplet', 'adult', 'normal'), 'body')).toContain('data-part="ear-fin"');
    expect(layer(src('droplet', 'adult', 'normal'), 'body')).toContain('data-part="paddle-tail"');
    expect(layer(src('sprout', 'adult', 'normal'), 'body')).toContain('data-part="head-sprout"');
    expect(layer(src('sprout', 'adult', 'normal'), 'body')).toContain('data-part="leaf-tail"');
    expect((SPECIES_BIOLOGY.droplet.locomotion as readonly string[]).includes('swim')).toBe(true);
    expect((SPECIES_BIOLOGY.emberling.locomotion as readonly string[]).includes('fly')).toBe(false);
  });
});
