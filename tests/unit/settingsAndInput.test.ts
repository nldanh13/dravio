import { describe, expect, it } from 'vitest';
import { dispatch } from '../../src/engine/core/commands';
import { createInitialState } from '../../src/engine/core/initialState';
import { createRng } from '../../src/engine/core/rng';
import { validateGameState } from '../../src/engine/core/validation';
import { shouldFeedOnSpace, timeOfDayFor } from '../../src/ui/sceneInput';

const T0 = Date.UTC(2026, 10, 25, 9, 0, 0);
const ctx = { clock: { nowMs: () => T0 } };
const fresh = () => createInitialState({ saveId: 'settings', nowMs: T0, rng: createRng(5) });

describe('updateSettings command (display settings, GDD GameSettings)', () => {
  it('changes timeMode / fpsLimit / reducedMotion only; gold, dragons and clock untouched; emits settingsChanged', () => {
    const s = fresh();
    const r = dispatch(s, { type: 'updateSettings', requestId: 'r1', patch: { timeMode: 'sunset', fpsLimit: 30, reducedMotion: true } }, ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.settings).toEqual({ ...s.settings, timeMode: 'sunset', fpsLimit: 30, reducedMotion: true });
    expect(r.state.goldMicro).toBe(s.goldMicro);
    expect(r.state.dragons).toEqual(s.dragons);
    expect(r.state.clock).toEqual(s.clock);
    expect(r.events).toEqual([{ type: 'settingsChanged', patch: { timeMode: 'sunset', fpsLimit: 30, reducedMotion: true } }]);
    expect(validateGameState(r.state).ok).toBe(true);
    // Idempotent theo requestId.
    const again = dispatch(r.state, { type: 'updateSettings', requestId: 'r1', patch: { timeMode: 'night' } }, ctx);
    expect(again.ok && again.duplicate).toBe(true);
    expect(again.state.settings.timeMode).toBe('sunset');
  });

  it('rejects unknown keys, bad values and empty patches without changing state', () => {
    const s = fresh();
    for (const patch of [{}, { timeMode: 'dusk' }, { fpsLimit: 120 }, { reducedMotion: 'yes' }, { language: 'en' }, null, [1]]) {
      const r = dispatch(s, { type: 'updateSettings', requestId: `bad-${JSON.stringify(patch)}`, patch }, ctx);
      expect(r.ok).toBe(false);
      expect(r.state).toBe(s);
    }
  });
});

describe('scene input rules', () => {
  const base = { key: ' ', repeat: false, targetTag: 'CANVAS', targetEditable: false, inScene: true, status: 'ready', modifier: false };
  it('Space feeds only inside the scene, when writable, not while typing', () => {
    expect(shouldFeedOnSpace(base)).toBe(true);
    expect(shouldFeedOnSpace({ ...base, inScene: false })).toBe(false);
    expect(shouldFeedOnSpace({ ...base, status: 'read-only' })).toBe(false);
    expect(shouldFeedOnSpace({ ...base, status: 'conflict' })).toBe(false);
    expect(shouldFeedOnSpace({ ...base, status: 'loading' })).toBe(false);
    for (const targetTag of ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']) expect(shouldFeedOnSpace({ ...base, targetTag })).toBe(false);
    expect(shouldFeedOnSpace({ ...base, targetEditable: true })).toBe(false);
    expect(shouldFeedOnSpace({ ...base, repeat: true })).toBe(false);
    expect(shouldFeedOnSpace({ ...base, modifier: true })).toBe(false);
    expect(shouldFeedOnSpace({ ...base, key: 'Enter' })).toBe(false);
  });

  it('auto time of day is night 20:00–06:00 local; manual modes override', () => {
    expect([19, 20, 23, 0, 5, 6, 12].map((h) => timeOfDayFor('auto', h))).toEqual(['day', 'night', 'night', 'night', 'night', 'day', 'day']);
    expect(timeOfDayFor('day', 23)).toBe('day');
    expect(timeOfDayFor('sunset', 9)).toBe('dusk');
    expect(timeOfDayFor('night', 12)).toBe('night');
  });
});
