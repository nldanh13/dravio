import { describe, expect, it } from 'vitest';
import { SPRITES, getSprite } from '../../src/assets/manifest';

const SVG_SOURCES = import.meta.glob<string>('../../src/assets/g0/emberling/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
});

describe('Emberling G0 sprites', () => {
  it('has all 3 stages × 4 variants', () => {
    expect(SPRITES).toHaveLength(12);
    for (const stage of ['baby', 'juvenile', 'adult'] as const) {
      for (const mutation of ['normal', 'crystal', 'golden', 'prismatic'] as const) {
        const s = getSprite('emberling', stage, mutation);
        expect(s?.url).toBeTruthy();
        expect(SVG_SOURCES[`../../src/assets/g0/emberling/${stage}_${mutation}.svg`]).toMatch(/^<svg[\s>]/);
      }
    }
  });

  it('SVGs are self-contained (no scripts or external references)', () => {
    for (const src of Object.values(SVG_SOURCES)) {
      expect(src).not.toMatch(/<script|foreignObject|href="https?:|url\(https?:/i);
    }
  });

  it('records provenance and review status for every sprite', () => {
    for (const s of SPRITES) {
      expect(s.source.origin).toBeTruthy();
      expect(s.source.review).toBe('prototype-pending-review');
    }
  });

  it('returns null for species without art yet', () => {
    expect(getSprite('gaia', 'adult', 'normal')).toBeNull();
  });
});
