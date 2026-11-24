import { describe, expect, it } from 'vitest';
import {
  DRAGON_ANIM_STATES,
  availableStates,
  clipPhase,
  poseAt,
  resolveDragonClip,
  resolvePose,
  sampleTrack,
  type CommonSpeciesId,
  type DragonAnimState,
} from '../../src/assets/animations/dragonAnimations';
import { DRAGON_FRAMES, FRAME_POSES, getDragonFrame } from '../../src/assets/animations/manifest';
import { DRAGON_EFFECTS, DRAGON_EFFECT_IDS } from '../../src/assets/effects/manifest';
import { SPECIES_BIOLOGY } from '../../src/data/g0Biology';

const FRAME_SRC = import.meta.glob<string>('../../src/assets/animations/frames/*/*.svg', { eager: true, query: '?raw', import: 'default' });
const FX_SRC = import.meta.glob<string>('../../src/assets/effects/dragon/*.svg', { eager: true, query: '?raw', import: 'default' });
const MODULE_SRC = import.meta.glob<string>('../../src/assets/animations/dragonAnimations.ts', { eager: true, query: '?raw', import: 'default' });

const SPECIES: readonly CommonSpeciesId[] = ['emberling', 'droplet', 'sprout', 'zephyr'];
const STAGES = ['baby', 'juvenile', 'adult'] as const;
const MUTATIONS = ['normal', 'crystal', 'golden', 'prismatic'] as const;
const frameSrc = (sp: string, st: string, mu: string, pose: string): string => {
  const s = FRAME_SRC[`../../src/assets/animations/frames/${sp}/${st}_${mu}_${pose}.svg`];
  if (!s) throw new Error(`missing ${sp}/${st}_${mu}_${pose}`);
  return s;
};
const layer = (svg: string, name: string): string | null => {
  const m = new RegExp(`<g data-layer="${name}"[^>]*>([\\s\\S]*?)</g>`).exec(svg);
  return m ? (m[1] ?? '') : null;
};

describe('Dragon animation clips (spec)', () => {
  it('covers all 11 required states', () => {
    expect([...DRAGON_ANIM_STATES].sort()).toEqual(
      ['eat', 'fly', 'happy', 'idle', 'injured', 'landing', 'pet', 'recovery', 'sleep', 'swim', 'walk'].sort(),
    );
  });

  it('only enables locomotion clips the biology catalog allows', () => {
    for (const sp of SPECIES) {
      const loco = SPECIES_BIOLOGY[sp].locomotion as readonly string[];
      const states = availableStates(sp);
      expect(states.includes('walk')).toBe(loco.includes('walk'));
      expect(states.includes('swim')).toBe(loco.includes('swim'));
      expect(states.includes('fly')).toBe(loco.includes('fly'));
      expect(states.includes('landing')).toBe(loco.includes('fly'));
    }
    expect(resolveDragonClip('emberling', 'fly')).toBeNull();
    expect(resolveDragonClip('sprout', 'swim')).toBeNull();
    expect(resolveDragonClip('droplet', 'swim')).not.toBeNull();
    expect(resolveDragonClip('zephyr', 'fly')).not.toBeNull();
  });

  it('clips are well-formed: sorted keys in [0,1], seamless loops, sensible durations', () => {
    for (const sp of SPECIES) {
      for (const state of availableStates(sp)) {
        const c = resolveDragonClip(sp, state);
        if (!c) throw new Error('unreachable');
        expect(c.durationMs).toBeGreaterThan(0);
        expect(c.frames[0]?.t).toBe(0);
        expect(c.track[0]?.t).toBe(0);
        expect(c.track[c.track.length - 1]?.t).toBe(1);
        for (const list of [c.frames, c.track, c.fx]) {
          const ts = list.map((x) => x.t);
          expect([...ts].sort((a, b) => a - b)).toEqual(ts);
          for (const t of ts) expect(t >= 0 && t <= 1).toBe(true);
        }
        if (c.loop) {
          const a = c.track[0];
          const b = c.track[c.track.length - 1];
          expect({ ...a, t: 0 }).toEqual({ ...b, t: 0 });
        } else {
          expect(c.returnsTo).toBeDefined();
          expect(c.track[c.track.length - 1]).toMatchObject({ dx: 0, dy: 0, sx: 1, sy: 1, rot: 0 });
        }
        if (c.shadow === 'altitude' && state === 'fly') expect(c.altitude?.adult).toBeGreaterThan(0);
      }
    }
  });

  it('timings follow ART_DIRECTION (idle 2–3s, walk 0.8–1.2s, eat 0.6s, pet 1s, blink 3–5s)', () => {
    for (const sp of SPECIES) {
      const idle = resolveDragonClip(sp, 'idle');
      expect(idle?.durationMs).toBeGreaterThanOrEqual(2000);
      expect(idle?.durationMs).toBeLessThanOrEqual(3000);
      expect(idle?.blink?.intervalMs).toEqual([3000, 5000]);
      const walk = resolveDragonClip(sp, 'walk');
      expect(walk?.durationMs).toBeGreaterThanOrEqual(800);
      expect(walk?.durationMs).toBeLessThanOrEqual(1200);
      expect(resolveDragonClip(sp, 'eat')?.durationMs).toBe(600);
      expect(resolveDragonClip(sp, 'pet')?.durationMs).toBe(1000);
    }
  });

  it('every pose used by an available clip has a frame for all stages and Aether variants', () => {
    for (const sp of SPECIES) {
      for (const state of availableStates(sp)) {
        const c = resolveDragonClip(sp, state);
        const poses = new Set([...(c?.frames.map((f) => f.pose) ?? []), ...(c?.blink ? [c.blink.pose] : [])]);
        for (const pose of poses) {
          for (const st of STAGES) {
            for (const mu of MUTATIONS) {
              expect(getDragonFrame(sp, st, mu, pose), `${sp}/${state}/${pose}/${st}/${mu}`).not.toBeNull();
            }
          }
        }
      }
    }
  });

  it('FX cues reference known effects and attach points available on the frame', () => {
    for (const sp of SPECIES) {
      for (const state of availableStates(sp)) {
        const c = resolveDragonClip(sp, state);
        for (const cue of c?.fx ?? []) {
          expect(DRAGON_EFFECT_IDS).toContain(cue.fx);
          const f = getDragonFrame(sp, 'adult', 'normal', poseAt(c!, cue.t));
          expect(f?.attach[cue.at], `${sp}/${state}/${cue.fx}@${cue.at}`).toBeDefined();
        }
      }
    }
  });

  it('sampling is pure and deterministic', () => {
    const c = resolveDragonClip('sprout', 'happy');
    if (!c) throw new Error('missing');
    expect(sampleTrack(c, 0)).toMatchObject({ sx: c.track[0]?.sx });
    expect(sampleTrack(c, 1)).toMatchObject({ dx: 0, dy: 0, sx: 1, sy: 1, rot: 0 });
    expect(sampleTrack(c, 0.4).dy).toBeCloseTo(-14);
    expect(sampleTrack(c, 0.3)).toEqual(sampleTrack(c, 0.3));
    expect(clipPhase(c, 450)).toBeCloseTo(0.5);
    expect(clipPhase(c, 5000)).toBe(1);
    const idle = resolveDragonClip('sprout', 'idle');
    if (!idle) throw new Error('missing');
    expect(clipPhase(idle, idle.durationMs * 2 + 600)).toBeCloseTo(0.25);
    expect(clipPhase(idle, Number.NaN)).toBe(0);
    expect(poseAt(resolveDragonClip('droplet', 'walk')!, 0.6)).toBe('walk_b');
    const src = Object.values(MODULE_SRC)[0] ?? '';
    expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now/);
  });

  it('Emberling uses fallbacks instead of modified G0 art', () => {
    expect(resolvePose('emberling', 'walk_a')).toBe('idle');
    expect(resolvePose('emberling', 'sleep')).toBe('blink');
    expect(resolvePose('droplet', 'sleep')).toBe('sleep');
    for (const f of DRAGON_FRAMES.filter((x) => x.speciesId === 'emberling')) {
      expect(frameSrc('emberling', f.stage, f.mutation, f.pose)).toContain(`data-derived-from="src/assets/g0/emberling/${f.stage}_${f.mutation}.svg"`);
    }
  });
});

describe('Dragon animation frames (assets)', () => {
  it('has one frame per species × stage × variant × pose with unique IDs', () => {
    const expected = SPECIES.reduce((n, sp) => n + FRAME_POSES[sp].length * 12, 0);
    expect(DRAGON_FRAMES).toHaveLength(expected);
    expect(Object.keys(FRAME_SRC)).toHaveLength(expected);
    expect(new Set(DRAGON_FRAMES.map((f) => f.assetId)).size).toBe(expected);
  });

  it('frames are self-contained, shadowless, in the 240×200 frame, with unique internal ids', () => {
    const ids: string[] = [];
    for (const [file, svg] of Object.entries(FRAME_SRC)) {
      expect(svg, file).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="240" height="200" viewBox="0 0 240 200"/);
      expect(svg).not.toMatch(/<script|foreignObject|<image|\shref=|url\((?!#)|on\w+=/i);
      expect(svg).not.toContain('data-layer="shadow"');
      expect(svg).not.toContain('cy="175"');
      const pose = /(?:normal|crystal|golden|prismatic)_(\w+)\.svg$/.exec(file)?.[1];
      expect(svg).toContain(`data-pose="${pose}"`);
      ids.push(...[...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1] ?? ''));
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('Aether variants keep phenotype layers identical in every pose', () => {
    for (const sp of ['droplet', 'sprout', 'zephyr'] as const) {
      for (const pose of FRAME_POSES[sp]) {
        for (const st of STAGES) {
          const base = frameSrc(sp, st, 'normal', pose);
          for (const name of ['body', 'pattern', 'eye']) {
            for (const mu of ['crystal', 'golden', 'prismatic']) {
              expect(layer(frameSrc(sp, st, mu, pose), name), `${sp}/${st}/${mu}/${pose}/${name}`).toBe(layer(base, name));
            }
          }
          for (const mu of ['crystal', 'golden', 'prismatic']) expect(frameSrc(sp, st, mu, pose)).toContain(`data-variant-badge="${mu}"`);
        }
      }
    }
  });

  it('pose geometry matches biology (wings only on flyers, flight tucks legs)', () => {
    for (const sp of ['droplet', 'sprout', 'zephyr'] as const) {
      const flies = (SPECIES_BIOLOGY[sp].locomotion as readonly string[]).includes('fly');
      for (const pose of FRAME_POSES[sp]) {
        expect(frameSrc(sp, 'adult', 'normal', pose).includes('data-part="wing"')).toBe(flies);
      }
    }
    expect(FRAME_POSES.sprout).not.toContain('swim_a');
    expect(FRAME_POSES.emberling).not.toContain('fly_up');
    expect(FRAME_POSES.droplet).not.toContain('fly_up');
    // Khung đi: chân thay đổi so với idle.
    expect(layer(frameSrc('sprout', 'adult', 'normal', 'walk_a'), 'body')).not.toBe(layer(frameSrc('sprout', 'adult', 'normal', 'idle'), 'body'));
    // Ngủ: mắt nhắm (không còn elip mắt).
    expect(layer(frameSrc('zephyr', 'baby', 'normal', 'sleep'), 'eye')).not.toContain('<ellipse');
  });

  it('idle frame equals the base sprite minus its shadow (same anatomy)', async () => {
    const base = import.meta.glob<string>('../../src/assets/dragons/common/*/*.svg', { eager: true, query: '?raw', import: 'default' });
    for (const sp of ['droplet', 'sprout', 'zephyr']) {
      const b = base[`../../src/assets/dragons/common/${sp}/adult_golden.svg`] ?? '';
      expect(layer(frameSrc(sp, 'adult', 'golden', 'idle'), 'body')).toBe(layer(b, 'body'));
    }
  });

  it('every frame has attach points and an illustrative hitbox', () => {
    for (const f of DRAGON_FRAMES) {
      expect(f.attach.head && f.attach.mouth && f.attach.body && f.attach.ground).toBeTruthy();
      expect(f.hitbox.w).toBeGreaterThan(20);
      expect(f.hitbox.h).toBeGreaterThan(20);
    }
    expect(getDragonFrame('droplet', 'adult', 'normal', 'swim_a')?.attach.waterline).toBeDefined();
  });
});

describe('Dragon animation effects', () => {
  it('every effect exists, is self-contained and matches its declared size', () => {
    expect(DRAGON_EFFECTS).toHaveLength(DRAGON_EFFECT_IDS.length);
    for (const fx of DRAGON_EFFECTS) {
      const svg = FX_SRC[`../../src/assets/effects/dragon/${fx.id}.svg`] ?? '';
      expect(svg).toContain(`viewBox="0 0 ${fx.width} ${fx.height}"`);
      expect(svg).not.toMatch(/<script|foreignObject|<image|<text|\shref=|url\(/i);
      expect(fx.anchor.x).toBeGreaterThanOrEqual(0);
      expect(fx.anchor.x).toBeLessThanOrEqual(fx.width);
      expect(fx.anchor.y).toBeLessThanOrEqual(fx.height);
    }
  });

  it('care information stays visible under reduced motion; no gore', () => {
    const info = DRAGON_EFFECTS.filter((f) => f.informational).map((f) => f.id);
    expect(info).toEqual(expect.arrayContaining(['bandage', 'care_leaf']));
    const injured: DragonAnimState = 'injured';
    const cues = resolveDragonClip('emberling', injured)?.fx.map((c) => c.fx);
    expect(cues).toEqual(expect.arrayContaining(['bandage', 'care_leaf']));
    for (const svg of Object.values(FX_SRC)) expect(svg).not.toMatch(/#(B00000|C00000|FF0000|8B0000)/i);
  });
});
