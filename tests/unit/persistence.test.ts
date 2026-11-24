import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/engine/core/clock';
import { dispatch } from '../../src/engine/core/commands';
import { createInitialState } from '../../src/engine/core/initialState';
import { createRng } from '../../src/engine/core/rng';
import { validateGameState } from '../../src/engine/core/validation';
import { AUTOSAVE_INTERVAL_MS, createAutosave, type Timer } from '../../src/persistence/autosave';
import { migrateLegacy, migrateV1toV2, type LegacySaveV1 } from '../../src/persistence/migrations';
import { MAX_SAVE_BYTES, parseSaveText } from '../../src/persistence/saveFile';
import { SaveManager } from '../../src/persistence/saveManager';
import { canonicalJson, createEnvelope, serializeSave, sha256Hex } from '../../src/persistence/schema';
import { MemorySaveStore } from '../../src/persistence/store';
import { acquireWriterLock } from '../../src/platform/writerLock';
import type { GameState } from '../../src/types/state';

const T0 = Date.UTC(2026, 10, 1, 8, 0, 0);

function freshState(seed = 7): GameState {
  return createInitialState({ saveId: `save-${seed}`, nowMs: T0, rng: createRng(seed) });
}

function advanced(state: GameState, ms: number, requestId: string): GameState {
  const clock = fixedClock(state.clock.lastProcessedAtMs + ms);
  const r = dispatch(state, { type: 'advanceTime', requestId, mode: 'online' }, { clock });
  if (!r.ok) throw new Error(r.error.code);
  return r.state;
}

function manager(store = new MemorySaveStore(), readLegacy?: () => string | null) {
  const clock = fixedClock(T0);
  return { store, clock, mgr: new SaveManager({ store, nowMs: clock.nowMs, ...(readLegacy ? { readLegacy } : {}) }) };
}

const legacyV1: LegacySaveV1 = {
  version: 1,
  gold: 1234.5678919,
  lastSavedAt: T0 - 3_600_000,
  pityCount: 17,
  upgrades: { islandCapacityLevel: 1, foodQualityLevel: 12 },
  dragons: [
    { uid: 'old-ember', speciesId: 'emberling', mutation: 'golden', xp: 30, location: 'island', nickname: '  Lửa  ', locked: true },
    { uid: 'old-drop', speciesId: 'droplet', mutation: 'normal', xp: 5000, location: 'island' },
    { uid: 'old-sprout', speciesId: 'sprout', mutation: 'crystal', xp: 12.5, location: 'storage' },
  ],
};

describe('save format v3 + checksum', () => {
  it('canonical JSON is independent of key order and skips undefined', () => {
    expect(canonicalJson({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe(canonicalJson({ a: [1, { d: 2 }], b: 1 }));
  });

  it('round-trips and does not persist transient food drops', async () => {
    let s = freshState();
    const fed = dispatch(s, { type: 'feed', requestId: 'f1', dietId: 'ember_seed', zoneId: 'origin', habitatId: 'origin_meadow' }, { clock: fixedClock(T0 + 1000) });
    if (fed.ok) s = fed.state;
    const text = await serializeSave(s, T0 + 2000);
    const r = await parseSaveText(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.state.food.drops).toEqual([]);
    expect(r.save.state.goldMicro).toBe(s.goldMicro);
    expect(r.save.state.dragons).toEqual(s.dragons);
    expect(r.save.savedAtMs).toBe(T0 + 2000);
  });

  it('rejects a tampered state via checksum', async () => {
    const env = await createEnvelope(freshState(), T0);
    const tampered = { ...env, state: { ...env.state, goldMicro: 999_000_000_000 } };
    const r = await parseSaveText(JSON.stringify(tampered));
    expect(r).toMatchObject({ ok: false, code: 'bad-checksum' });
  });

  it('rejects a self-consistent but invalid state', async () => {
    const env = await createEnvelope(freshState(), T0);
    const state = { ...env.state, goldMicro: 1.5 };
    const r = await parseSaveText(JSON.stringify({ ...env, state, checksum: await sha256Hex(canonicalJson(state)) }));
    expect(r).toMatchObject({ ok: false, code: 'invalid-state' });
  });

  it('classifies corrupt, foreign, newer and oversize files', async () => {
    expect(await parseSaveText('{"format":"dravio-save",')).toMatchObject({ code: 'corrupt-json' });
    expect(await parseSaveText('[1,2]')).toMatchObject({ code: 'bad-format' });
    expect(await parseSaveText('{"hello":1}')).toMatchObject({ code: 'bad-format' });
    const env = await createEnvelope(freshState(), T0);
    expect(await parseSaveText(JSON.stringify({ ...env, schemaVersion: 4 }))).toMatchObject({ code: 'newer-version' });
    expect(await parseSaveText(JSON.stringify({ ...env, schemaVersion: 2 }))).toMatchObject({ code: 'unsupported-version' });
    expect(await parseSaveText('"' + 'x'.repeat(MAX_SAVE_BYTES) + '"')).toMatchObject({ code: 'too-large' });
  });
});

describe('migration v1 → v2 → v3', () => {
  it('v1 → v2 converts XP seconds to milliseconds and keeps identity', () => {
    const v2 = migrateV1toV2(legacyV1);
    expect(v2.version).toBe(2);
    expect(v2.dragons.map((d) => [d.uid, d.xpMs])).toEqual([['old-ember', 30_000], ['old-drop', 5_000_000], ['old-sprout', 12_500]]);
  });

  it('v1 → v3 produces a valid state, preserving UIDs, species, mutation and safe locations', () => {
    const m = migrateLegacy(legacyV1);
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    const s = m.value;
    expect(validateGameState(s).ok).toBe(true);
    expect(m.fromVersion).toBe(1);
    expect(s.schemaVersion).toBe(3);
    expect(s.dragons.map((d) => [d.uid, d.speciesId, d.mutation])).toEqual([
      ['old-ember', 'emberling', 'golden'],
      ['old-drop', 'droplet', 'normal'],
      ['old-sprout', 'sprout', 'crystal'],
    ]);
    const [ember, drop, sprout] = s.dragons;
    expect(ember?.location).toEqual({ kind: 'zone', zoneId: 'origin', habitatId: 'origin_meadow' });
    // Droplet sống ở bờ ao/cửa sông — chưa mở ở G1 → kho an toàn, không sản xuất.
    expect(drop?.location).toEqual({ kind: 'storage' });
    expect(sprout?.location).toEqual({ kind: 'storage' });
    expect(s.productionDragonIds).toEqual(['old-ember']);
    expect(ember?.nickname).toBe('Lửa');
    expect(ember?.locked).toBe(true);
    expect(ember?.xpSec).toBe(30);
    // XP vượt mức trưởng thành bị chặn.
    expect(drop?.xpSec).toBeLessThanOrEqual(5000);
    expect(s.dragons.every((d) => d.ancestry === 'unknown' && d.generation === 1 && d.registryRef === undefined)).toBe(true);
    expect(s.goldMicro).toBe(1_234_567_891);
    expect(Number.isSafeInteger(s.goldMicro)).toBe(true);
    expect(s.pityCount).toBe(17);
    expect(s.upgrades.islandCapacityLevel).toBe(1);
    expect(s.upgrades.foodQualityLevel).toBe(10);
    expect(m.warnings.some((w) => w.includes('foodQualityLevel'))).toBe(true);
    expect(m.warnings.some((w) => w.includes('old-drop'))).toBe(true);
    expect(s.clock.lastProcessedAtMs).toBe(legacyV1.lastSavedAt);
  });

  it('is deterministic (same legacy input → same v3 state)', () => {
    expect(migrateLegacy(legacyV1)).toEqual(migrateLegacy(structuredClone(legacyV1)));
  });

  it('rejects unknown species, duplicate UIDs and malformed data instead of guessing', () => {
    const bad = (patch: object) => migrateLegacy({ ...legacyV1, ...patch });
    expect(bad({ dragons: [{ ...legacyV1.dragons[0], speciesId: 'tendoryon' }] }).ok).toBe(false);
    expect(bad({ dragons: [legacyV1.dragons[0], legacyV1.dragons[0]] }).ok).toBe(false);
    expect(bad({ gold: -1 }).ok).toBe(false);
    expect(bad({ dragons: [{ ...legacyV1.dragons[0], xp: 'lots' }] }).ok).toBe(false);
    expect(migrateLegacy({ ...legacyV1, version: 2, dragons: [{ ...legacyV1.dragons[0] }] }).ok).toBe(false);
  });

  it('overflow beyond Origin capacity goes to safe storage', () => {
    const dragons = Array.from({ length: 7 }, (_, i) => ({ uid: `e${i}`, speciesId: 'emberling', mutation: 'normal', xpMs: 0, location: 'island' }));
    const m = migrateLegacy({ version: 2, gold: 0, lastSavedAt: T0, dragons });
    expect(m.ok).toBe(true);
    if (!m.ok) return;
    expect(m.value.dragons.filter((d) => d.location.kind === 'zone')).toHaveLength(5);
    expect(m.value.dragons.filter((d) => d.location.kind === 'storage')).toHaveLength(2);
    expect(validateGameState(m.value).ok).toBe(true);
  });

  it('parseSaveText accepts a raw legacy JSON and reports migratedFrom', async () => {
    const r = await parseSaveText(JSON.stringify(legacyV1));
    expect(r.ok && r.save.migratedFrom).toBe(1);
  });
});

describe('SaveManager: load, backups, one writer', () => {
  it('first run is empty; save then load returns the same state', async () => {
    const { mgr, store } = manager();
    expect(await mgr.load()).toEqual({ kind: 'empty' });
    const s = freshState();
    expect(await mgr.save(s)).toBe(true);
    const again = await new SaveManager({ store, nowMs: () => T0 }).load();
    expect(again.kind).toBe('loaded');
    if (again.kind === 'loaded') expect(again.save.state).toEqual(s);
  });

  it('skips writes when the revision did not change', async () => {
    const { mgr, store } = manager();
    const s = freshState();
    await mgr.save(s);
    expect(await mgr.save(s)).toBe(false);
    expect(store.writes).toBe(1);
    expect(await mgr.save(advanced(s, 1000, 'a1'))).toBe(true);
    expect(store.writes).toBe(2);
  });

  it('keeps two rotating backups', async () => {
    const { mgr, store } = manager();
    let s = freshState();
    const revisions: number[] = [];
    for (let i = 0; i < 4; i++) {
      s = advanced(s, 1000, `r${i}`);
      revisions.push(s.revision);
      await mgr.save(s);
    }
    const rev = async (slot: 'main' | 'backup1' | 'backup2') => {
      const r = await parseSaveText((await store.get(slot)) ?? '');
      return r.ok ? r.save.state.revision : null;
    };
    expect([await rev('main'), await rev('backup1'), await rev('backup2')]).toEqual([revisions[3], revisions[2], revisions[1]]);
  });

  it('falls back to backup1 when main is corrupt, then backup2', async () => {
    const { mgr, store } = manager();
    let s = freshState();
    for (let i = 0; i < 3; i++) {
      s = advanced(s, 1000, `b${i}`);
      await mgr.save(s);
    }
    store.slots.set('main', '{"truncated');
    const r1 = await new SaveManager({ store, nowMs: () => T0 }).load();
    expect(r1.kind === 'loaded' && r1.slot).toBe('backup1');
    if (r1.kind === 'loaded') expect(r1.failures).toEqual([{ slot: 'main', code: 'corrupt-json', details: [] }]);
    store.slots.set('backup1', (store.slots.get('backup1') ?? '').replace('"goldMicro":', '"goldMicro":9'));
    const r2 = await new SaveManager({ store, nowMs: () => T0 }).load();
    expect(r2.kind === 'loaded' && r2.slot).toBe('backup2');
  });

  it('all slots broken → unrecoverable, no automatic overwrite until forced', async () => {
    const { store } = manager();
    store.slots.set('main', 'garbage');
    const mgr = new SaveManager({ store, nowMs: () => T0 });
    expect((await mgr.load()).kind).toBe('unrecoverable');
    expect(await mgr.save(freshState())).toBe(false);
    expect(store.slots.get('main')).toBe('garbage');
    expect(await mgr.save(freshState(), { force: true })).toBe(true);
    expect(store.slots.get('backup1')).toBe('garbage');
  });

  it('a save written by a newer version blocks writes and is never overwritten', async () => {
    const { store } = manager();
    const env = await createEnvelope(freshState(), T0);
    const newer = JSON.stringify({ ...env, schemaVersion: 4 });
    store.slots.set('main', newer);
    const mgr = new SaveManager({ store, nowMs: () => T0 });
    expect((await mgr.load()).kind).toBe('newer-version');
    expect(mgr.writeBlock).toBe('newer-version');
    expect(await mgr.save(freshState(), { force: true })).toBe(false);
    expect(store.slots.get('main')).toBe(newer);
  });

  it('read-only tab never writes', async () => {
    const { mgr, store } = manager();
    mgr.setReadOnly(true);
    expect(await mgr.save(freshState())).toBe(false);
    expect(store.writes).toBe(0);
    mgr.setReadOnly(false);
    expect(await mgr.save(freshState())).toBe(true);
  });

  it('migrates a legacy localStorage save when IndexedDB is empty', async () => {
    const { mgr } = manager(new MemorySaveStore(), () => JSON.stringify(legacyV1));
    const r = await mgr.load();
    expect(r.kind === 'loaded' && r.slot).toBe('legacy');
    if (r.kind === 'loaded') expect(r.save.migratedFrom).toBe(1);
  });

  it('serialises concurrent saves (no interleaving)', async () => {
    const { mgr, store } = manager();
    const a = freshState();
    const b = advanced(a, 1000, 'c1');
    await Promise.all([mgr.save(a), mgr.save(b)]);
    const main = await parseSaveText((await store.get('main')) ?? '');
    expect(main.ok && main.save.state.revision).toBe(b.revision);
  });

  it('a failed write is reported and the next save retries', async () => {
    const { mgr, store } = manager();
    store.failNextWrite = true;
    await expect(mgr.save(freshState())).rejects.toThrow();
    expect(await mgr.save(freshState())).toBe(true);
  });
});

describe('export / import', () => {
  it('export → import preview → confirm; current save becomes a backup', async () => {
    const { mgr, store } = manager();
    const current = advanced(freshState(1), 5000, 'x');
    await mgr.save(current);
    const other = advanced(freshState(2), 60_000, 'y');
    const file = await new SaveManager({ store: new MemorySaveStore(), nowMs: () => T0 + 9 }).exportText(other);
    const prep = await mgr.prepareImport(file);
    expect(prep.ok).toBe(true);
    if (!prep.ok) return;
    expect(prep.preview).toMatchObject({ saveId: 'save-2', dragonCount: 1, speciesCount: 1, goldMicro: other.goldMicro, savedAtMs: T0 + 9, migratedFrom: null });
    // Chưa xác nhận → kho không đổi.
    expect(store.writes).toBe(1);
    const imported = await mgr.confirmImport(current);
    expect(imported?.saveId).toBe('save-2');
    const main = await parseSaveText((await store.get('main')) ?? '');
    const b1 = await parseSaveText((await store.get('backup1')) ?? '');
    expect(main.ok && main.save.state.saveId).toBe('save-2');
    expect(b1.ok && b1.save.state.saveId).toBe('save-1');
  });

  it('confirm without prepare does nothing; cancel clears the pending import', async () => {
    const { mgr, store } = manager();
    expect(await mgr.confirmImport(null)).toBeNull();
    const prep = await mgr.prepareImport(await mgr.exportText(freshState()));
    expect(prep.ok).toBe(true);
    mgr.cancelImport();
    expect(await mgr.confirmImport(null)).toBeNull();
    expect(store.writes).toBe(0);
  });

  it('strips entitlements, Verified status and unknown keys even with a valid checksum', async () => {
    const { mgr } = manager();
    const base = freshState();
    const forged = {
      ...base,
      entitlements: { supporterPack: true, removeAds: true },
      purchases: ['astral'],
      dragons: base.dragons.map((d) => ({ ...d, registryRef: 'reg-123', verified: true, entitlement: 'gift' })),
    } as unknown as GameState;
    const prep = await mgr.prepareImport(JSON.stringify({ ...(await createEnvelope(base, T0)), state: forged, checksum: await sha256Hex(canonicalJson(forged)) }));
    expect(prep.ok).toBe(true);
    if (!prep.ok) return;
    expect(prep.preview.warnings.join(' ')).toMatch(/entitlements.*purchases/);
    const state = await mgr.confirmImport(null);
    expect(state).not.toBeNull();
    expect(state && 'entitlements' in state).toBe(false);
    expect(state && 'purchases' in state).toBe(false);
    expect(state?.dragons.every((d) => !('registryRef' in d) && !('verified' in d) && !('entitlement' in d))).toBe(true);
  });

  it('rejects a broken import without touching the store', async () => {
    const { mgr, store } = manager();
    await mgr.save(freshState());
    expect(await mgr.prepareImport('not json')).toMatchObject({ ok: false, code: 'corrupt-json' });
    expect(await mgr.confirmImport(null)).toBeNull();
    expect(store.writes).toBe(1);
  });
});

describe('autosave controller', () => {
  function fakeTimer() {
    const fns: (() => void)[] = [];
    let intervalMs = 0;
    const timer: Timer = {
      setInterval: (fn, ms) => {
        fns.push(fn);
        intervalMs = ms;
        return fns.length;
      },
      clearInterval: () => fns.splice(0),
    };
    return { timer, tick: () => fns.forEach((f) => f()), interval: () => intervalMs, active: () => fns.length };
  }

  it('saves every 30 s and on flush, only when state changed', async () => {
    const { mgr, store } = manager();
    let state = freshState();
    const t = fakeTimer();
    const auto = createAutosave({ save: (s) => mgr.save(s), getState: () => state, timer: t.timer });
    auto.start();
    auto.start();
    expect(t.active()).toBe(1);
    expect(t.interval()).toBe(AUTOSAVE_INTERVAL_MS);
    t.tick();
    await mgr.save(state); // chờ hàng đợi
    expect(store.writes).toBe(1);
    t.tick();
    expect(await auto.flush()).toBe(false);
    state = advanced(state, 30_000, 'auto1');
    expect(await auto.flush()).toBe(true);
    expect(store.writes).toBe(2);
    auto.stop();
    expect(t.active()).toBe(0);
  });

  it('reports write errors instead of throwing', async () => {
    const { mgr, store } = manager();
    const errors: unknown[] = [];
    store.failNextWrite = true;
    const auto = createAutosave({ save: (s) => mgr.save(s), getState: freshState, timer: fakeTimer().timer, onError: (e) => errors.push(e) });
    expect(await auto.flush()).toBe(false);
    expect(errors).toHaveLength(1);
  });
});

describe('writer lock', () => {
  it('second holder is read-only while the first holds the lock', async () => {
    const held = new Set<string>();
    const locks = {
      request(name: string, _o: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<void>) {
        if (held.has(name)) return cb(null);
        held.add(name);
        return cb({ name }).finally(() => held.delete(name));
      },
    };
    const a = await acquireWriterLock(locks);
    const b = await acquireWriterLock(locks);
    expect([a.acquired, b.acquired]).toEqual([true, false]);
    a.release();
    await Promise.resolve();
    await Promise.resolve();
    const c = await acquireWriterLock(locks);
    expect(c.acquired).toBe(true);
  });

  it('without Web Locks the tab is the writer and flags unsupported', async () => {
    expect(await acquireWriterLock(undefined)).toMatchObject({ acquired: true, unsupported: true });
  });
});
