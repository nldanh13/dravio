import { describe, expect, it } from 'vitest';
import { getSpecies } from '../../src/data/dragons';
import { createRng } from '../../src/engine/core/rng';
import { derivePhenotype, isValidGenotype } from '../../src/engine/genetics/alleles';
import { breedFeeG, checkBreed, previewBreed, queryBreedPreview } from '../../src/engine/genetics/breeding';
import { mutationDistribution, rollMutation } from '../../src/engine/economy/mutation';
import { en } from '../../src/i18n/en';
import { vi } from '../../src/i18n/vi';
import { adult } from './fixtures';

/** ADR 0003 — câu trả lời cho 6 điểm của ADR 0002, và kịch bản S03 (preview G1). */

describe('ADR 0003 answers', () => {
  it('#1 fee = highest parent rarity (Common + Rare same group = 350 G), known before rolling', () => {
    expect(breedFeeG(getSpecies('emberling'), getSpecies('magma'))).toBe(350);
    expect(breedFeeG(getSpecies('emberling'), getSpecies('sprout'))).toBe(80);
    expect(breedFeeG(getSpecies('solaris'), getSpecies('celestia'))).toBe(5000);
  });

  it('#2 Emberling × Sprout → Emberling, Sprout, Magma 1/3 each; no Epic', () => {
    const p = previewBreed(adult('a', 'emberling'), adult('b', 'sprout')).species;
    expect([...p.keys()].sort()).toEqual(['emberling', 'magma', 'sprout']);
    for (const v of p.values()) expect(v).toBeCloseTo(1 / 3, 12);
  });

  it('#3 anatomy comes from G0 data per id, not from element or group', () => {
    expect(getSpecies('frostfin').anatomy.locomotion).toEqual(['swim']);
    expect(getSpecies('frostfin').anatomy.respiration).toBe('gill');
    expect(getSpecies('emberling').anatomy.locomotion).toEqual(['walk']);
    expect(getSpecies('leviathan').anatomy.locomotion).not.toContain('walk');
  });

  it('#4 related pairs are blocked only on known ancestry; unknown ancestry is not inferred', () => {
    const now = 0;
    expect(checkBreed(adult('a', 'emberling', { parentIds: ['p1', 'p2'] }), adult('b', 'sprout', { parentIds: ['p2', 'p3'] }), now).ok).toBe(false);
    expect(checkBreed(adult('a', 'emberling', { grandparentIds: ['g1'] }), adult('b', 'sprout', { grandparentIds: ['g1'] }), now).ok).toBe(false);
    expect(checkBreed(adult('a', 'emberling', { grandparentIds: ['b'] }), adult('b', 'sprout'), now).ok).toBe(false);
    expect(checkBreed(adult('a', 'emberling', { ancestry: 'unknown' }), adult('b', 'sprout', { ancestry: 'unknown' }), now).ok).toBe(true);
  });

  it('#5 id stays "sprout"; VI "Mộc Long Mầm", EN "Sproutling"', () => {
    expect(getSpecies('sprout').id).toBe('sprout');
    expect(vi['species.sprout']).toBe('Mộc Long Mầm');
    expect(en['species.sprout']).toBe('Sproutling');
  });

  it('#6 mutation baseline 85/11/3.5/0.5 and pity 199 → Prismatic, reset to 0', () => {
    const d = mutationDistribution(0, 0);
    expect([d.normal, d.crystal, d.golden, d.prismatic].map((x) => Math.round(x * 1000) / 10)).toEqual([85, 11, 3.5, 0.5]);
    expect(rollMutation(createRng(1), 0, 0, 199)).toEqual({ mutation: 'prismatic', pityCount: 0 });
  });
});

describe('ADR 0003 breeding eligibility additions', () => {
  it('rejects released dragons and dragons in emergency shelter; allows storage and locked', () => {
    const b = adult('b', 'sprout');
    expect(checkBreed(adult('a', 'emberling', { location: { kind: 'released' } }), b, 0)).toEqual({ ok: false, reason: 'released' });
    expect(checkBreed(adult('a', 'emberling', { location: { kind: 'shelter', zoneId: 'origin' } }), b, 0)).toEqual({
      ok: false,
      reason: 'emergency-shelter',
    });
    expect(checkBreed(adult('a', 'emberling', { location: { kind: 'storage' }, locked: true }), b, 0)).toEqual({ ok: true });
  });

  it('rejects invalid alleles before any preview or roll', () => {
    const bad = adult('a', 'emberling', { genotype: { pigment: ['X', 'r'], pattern: ['P', 'p'], eye: ['B', 'b'] } });
    expect(queryBreedPreview(bad, adult('b', 'sprout'), 0)).toEqual({ ok: false, reason: 'invalid-genotype' });
    expect(isValidGenotype({ pigment: ['r', 'R'], pattern: ['P', 'p'], eye: ['B', 'b'] }, ['pigment', 'pattern', 'eye'])).toBe(false);
  });

  it('query preview is disabled for invalid pairs', () => {
    expect(queryBreedPreview(adult('a', 'emberling'), adult('b', 'droplet'), 0)).toEqual({ ok: false, reason: 'different-group' });
  });
});

describe('S03 — genetics preview fixture (G1 scope)', () => {
  const a = adult('ember-A', 'emberling', {
    genotype: { pigment: ['R', 'r'], pattern: ['P', 'p'], eye: ['B', 'b'] },
    parentIds: ['pa1', 'pa2'],
    grandparentIds: ['ga1', 'ga2'],
  });
  const b = adult('sprout-B', 'sprout', {
    genotype: { pigment: ['r', 'r'], pattern: ['p', 'p'], eye: ['b', 'b'] },
    parentIds: ['pb1', 'pb2'],
    grandparentIds: ['gb1', 'gb2'],
  });

  it('pair is valid and fee is 80 G', () => {
    const q = queryBreedPreview(a, b, 0);
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.preview.feeG).toBe(80);
  });

  it('each locus is 50/50 and phenotypes are derived', () => {
    const { loci } = previewBreed(a, b);
    expect(loci.pigment?.get('Rr')?.p).toBe(0.5);
    expect(loci.pigment?.get('rr')?.p).toBe(0.5);
    expect(loci.pattern?.get('Pp')?.p).toBe(0.5);
    expect(loci.pattern?.get('pp')?.p).toBe(0.5);
    expect(loci.eye?.get('Bb')?.p).toBe(0.5);
    expect(loci.eye?.get('bb')?.p).toBe(0.5);
    expect(derivePhenotype({ pigment: ['R', 'r'], pattern: ['P', 'p'], eye: ['b', 'b'] }, ['pigment', 'pattern', 'eye'])).toEqual({
      pigment: 'phenotype.pigment.warm',
      pattern: 'phenotype.pattern.medium',
      eye: 'phenotype.eye.blue',
    });
  });

  it('8 genotype combinations, each 1/8', () => {
    const { loci } = previewBreed(a, b);
    const combos: number[] = [];
    for (const x of loci.pigment?.values() ?? []) for (const y of loci.pattern?.values() ?? []) for (const z of loci.eye?.values() ?? []) combos.push(x.p * y.p * z.p);
    expect(combos).toHaveLength(8);
    for (const c of combos) expect(c).toBe(1 / 8);
  });

  it('preview does not consume RNG', () => {
    const r1 = createRng(303);
    const r2 = createRng(303);
    previewBreed(a, b);
    expect(r1.next()).toBe(r2.next());
  });

  it.each([
    ['T × A', adult('x', 'droplet'), 'different-group'],
    ['same UID', a, 'same-dragon'],
    ['shared parent', adult('y', 'sprout', { parentIds: ['pa1', 'zz'] }), 'related'],
    ['shared grandparent', adult('y', 'sprout', { grandparentIds: ['ga2'] }), 'related'],
    ['direct ancestor', adult('pa1', 'sprout'), 'related'],
    ['released', adult('y', 'sprout', { location: { kind: 'released' } }), 'released'],
    ['in care', adult('y', 'sprout', { location: { kind: 'care', caseId: 'c1' } }), 'busy'],
  ] as const)('negative: %s', (_, other, reason) => {
    expect(checkBreed(a, other, 0)).toEqual({ ok: false, reason });
  });
});
