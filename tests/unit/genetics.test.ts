import { describe, expect, it } from 'vitest';
import { getSpecies } from '../../src/data/dragons';
import { createRng } from '../../src/engine/core/rng';
import { derivePhenotype, founderGenotype, locusDistribution } from '../../src/engine/genetics/alleles';
import {
  candidateSpecies,
  checkBreed,
  hatchSeconds,
  previewBreed,
  rollBreed,
  speciesDistribution,
} from '../../src/engine/genetics/breeding';
import { adult } from './fixtures';

const sum = (xs: Iterable<number>) => [...xs].reduce((a, b) => a + b, 0);

describe('alleles', () => {
  it('Rr × rr → 50% Rr, 50% rr', () => {
    const d = locusDistribution('pigment', ['R', 'r'], ['r', 'r']);
    expect(d.get('Rr')?.p).toBe(0.5);
    expect(d.get('rr')?.p).toBe(0.5);
  });

  it('Pp × Pp → 1:2:1 (incomplete dominance)', () => {
    const d = locusDistribution('pattern', ['P', 'p'], ['P', 'p']);
    expect(d.get('PP')?.p).toBe(0.25);
    expect(d.get('Pp')?.p).toBe(0.5);
    expect(d.get('pp')?.p).toBe(0.25);
  });

  it('derives phenotype from genotype', () => {
    const ph = derivePhenotype({ pigment: ['r', 'r'], pattern: ['P', 'p'], eye: ['B', 'b'] }, ['pigment', 'pattern', 'eye', 'horn']);
    expect(ph).toEqual({
      pigment: 'phenotype.pigment.cool',
      pattern: 'phenotype.pattern.medium',
      eye: 'phenotype.eye.amber',
      horn: 'phenotype.notExpressed',
    });
  });

  it('founder genotype is stable per uid + content version', () => {
    const loci = ['pigment', 'pattern', 'eye'];
    expect(founderGenotype('u1', 'c1', loci)).toEqual(founderGenotype('u1', 'c1', loci));
  });
});

describe('breeding rules', () => {
  it('only allows same-group pairs', () => {
    expect(candidateSpecies(getSpecies('emberling'), getSpecies('droplet'))).toEqual([]);
    expect(checkBreed(adult('a', 'emberling'), adult('b', 'droplet'), 0)).toEqual({ ok: false, reason: 'different-group' });
  });

  it('T × T commons give only commons whose elements are a subset', () => {
    const ids = candidateSpecies(getSpecies('emberling'), getSpecies('sprout')).map((s) => s.id).sort();
    // magma (F+N, Rare) hợp lệ; amberhorn (Epic) cần ít nhất một bố mẹ Rare.
    expect(ids).toEqual(['emberling', 'magma', 'sprout']);
  });

  it('epic needs a rare parent, legendary needs two epic parents', () => {
    const tr = candidateSpecies(getSpecies('magma'), getSpecies('sprout')).map((s) => s.id);
    expect(tr).toContain('amberhorn');
    const vEpic = candidateSpecies(getSpecies('solaris'), getSpecies('sparkwing')).map((s) => s.id);
    expect(vEpic).not.toContain('celestia');
    const vLeg = candidateSpecies(getSpecies('solaris'), getSpecies('aurorawing')).map((s) => s.id);
    expect(vLeg).toContain('celestia');
  });

  it('species distribution sums to 100%', () => {
    const pairs: [string, string][] = [
      ['emberling', 'sprout'],
      ['magma', 'sprout'],
      ['solaris', 'aurorawing'],
      ['droplet', 'mossback'],
      ['leviathan', 'gaia'],
    ];
    for (const [a, b] of pairs) {
      expect(sum(speciesDistribution(getSpecies(a), getSpecies(b)).values())).toBeCloseTo(1, 12);
    }
  });

  it('rejects self, non-adult, busy, cooldown and related pairs', () => {
    const a = adult('a', 'emberling');
    expect(checkBreed(a, a, 0)).toEqual({ ok: false, reason: 'same-dragon' });
    expect(checkBreed(a, adult('b', 'sprout', { xpSec: 0 }), 0)).toEqual({ ok: false, reason: 'not-adult' });
    expect(checkBreed(a, adult('b', 'sprout', { activity: 'expedition' }), 0)).toEqual({ ok: false, reason: 'busy' });
    expect(checkBreed(a, adult('b', 'sprout', { breedCooldownUntilMs: 10 }), 5)).toEqual({ ok: false, reason: 'cooldown' });
    expect(checkBreed(a, adult('b', 'sprout', { parentIds: ['a', 'x'] }), 0)).toEqual({ ok: false, reason: 'related' });
    expect(
      checkBreed(adult('c', 'emberling', { parentIds: ['p', 'q'] }), adult('d', 'sprout', { parentIds: ['q', 'r'] }), 0),
    ).toEqual({ ok: false, reason: 'related' });
    expect(
      checkBreed(
        adult('c', 'emberling', { grandparentIds: ['g1'] }),
        adult('d', 'sprout', { grandparentIds: ['g1', 'g2'] }),
        0,
      ),
    ).toEqual({ ok: false, reason: 'related' });
    expect(checkBreed(a, adult('b', 'sprout'), 0)).toEqual({ ok: true });
  });

  it('preview matches the engine roll distribution (Monte Carlo)', () => {
    const a = adult('a', 'magma', { genotype: { pigment: ['R', 'r'], pattern: ['P', 'p'], eye: ['b', 'b'] } });
    const b = adult('b', 'sprout', { genotype: { pigment: ['r', 'r'], pattern: ['P', 'p'], eye: ['B', 'b'] } });
    const preview = previewBreed(a, b);
    const rng = createRng(123);
    const N = 40_000;
    const species = new Map<string, number>();
    const pigment = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const out = rollBreed(rng, a, b);
      species.set(out.speciesId, (species.get(out.speciesId) ?? 0) + 1);
      const pg = out.genotype.pigment;
      if (pg) pigment.set(pg.join(''), (pigment.get(pg.join('')) ?? 0) + 1);
      // Không bao giờ xuất hiện allele ngoài bố mẹ.
      expect(['R', 'r']).toContain(pg?.[0]);
    }
    for (const [id, p] of preview.species) expect((species.get(id) ?? 0) / N).toBeCloseTo(p, 1);
    expect([...species.keys()].every((id) => preview.species.has(id))).toBe(true);
    for (const [key, d] of preview.loci.pigment ?? new Map()) expect((pigment.get(key) ?? 0) / N).toBeCloseTo(d.p, 1);
  });

  it('preview does not consume RNG and is pure', () => {
    const a = adult('a', 'emberling');
    const b = adult('b', 'sprout');
    expect(previewBreed(a, b)).toEqual(previewBreed(a, b));
  });

  it('hatch time scales with hatch speed upgrade', () => {
    expect(hatchSeconds('common', 0)).toBe(300);
    expect(hatchSeconds('legendary', 6)).toBe(Math.ceil(10_800 * 0.4));
  });
});
