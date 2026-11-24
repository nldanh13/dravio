import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../src/engine/core/clock';
import { dispatch } from '../../src/engine/core/commands';
import { createInitialState } from '../../src/engine/core/initialState';
import { createRng } from '../../src/engine/core/rng';
import { AUTOSAVE_INTERVAL_MS, createAutosave, type Timer } from '../../src/persistence/autosave';
import { MIGRATION_STEPS, migrateState, type MigrationStep } from '../../src/persistence/migrations';
import { MAX_SAVE_BYTES, parseSaveText } from '../../src/persistence/saveFile';
import { SaveManager } from '../../src/persistence/saveManager';
import { canonicalJson, createEnvelope, serializeSave, sha256Hex } from '../../src/persistence/schema';
import { MemorySaveStore } from '../../src/persistence/store';
import { acquireWriterLock } from '../../src/platform/writerLock';
import { SCHEMA_VERSION, type GameState } from '../../src/types/state';

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

function manager(store = new MemorySaveStore()) {
  const clock = fixedClock(T0);
  return { store, clock, mgr: new SaveManager({ store, nowMs: clock.nowMs }) };
}

/** Envelope của một schemaVersion bất kỳ, checksum hợp lệ (giả lập save do bản khác ghi). */
async function envelopeAt(version: number, state: GameState = freshState()): Promise<string> {
  const env = await createEnvelope(state, T0);
  // v2 chưa có các khóa của v4; v1 và bí danh 3 còn chưa có `discoveries` (thêm ở v2).
  const { tutorial, pendingPack, unlockedAchievements, claimedAchievements, ...v2 } = env.state;
  void [tutorial, pendingPack, unlockedAchievements, claimedAchievements];
  const { discoveries, ...v1 } = v2;
  void discoveries;
  const s =
    version === 1 || version === 3 ? { ...v1, schemaVersion: version } : version === 2 ? { ...v2, schemaVersion: 2 } : { ...env.state, schemaVersion: version };
  return JSON.stringify({ ...env, schemaVersion: version, state: s, checksum: await sha256Hex(canonicalJson(s)) });
}

describe('Dravio Save Schema v1 + checksum', () => {
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
    expect(await parseSaveText(await envelopeAt(5))).toMatchObject({ code: 'newer-version' });
    expect(await parseSaveText(await envelopeAt(6))).toMatchObject({ code: 'newer-version' });
    expect(await parseSaveText(await envelopeAt(0))).toMatchObject({ code: 'unsupported-version' });
    // Envelope và state phải cùng schemaVersion.
    expect(await parseSaveText(JSON.stringify({ ...env, schemaVersion: 5 }))).toMatchObject({ code: 'bad-format' });
    // Object không có envelope Dravio (kể cả dạng { version: 2, ... }) không được đoán.
    expect(await parseSaveText(JSON.stringify({ version: 2, gold: 10, dragons: [] }))).toMatchObject({ code: 'bad-format' });
    expect(await parseSaveText('"' + 'x'.repeat(MAX_SAVE_BYTES) + '"')).toMatchObject({ code: 'too-large' });
  });
});

describe('migration framework (schemaVersion)', () => {
  it('Dravio Save Schema v4 is the current schema and new saves use it (3 is a reserved pre-release alias)', () => {
    expect(SCHEMA_VERSION).toBe(4);
    expect(freshState().schemaVersion).toBe(4);
    expect(freshState().discoveries).toEqual([]);
    expect(freshState().tutorial).toEqual({ status: 'active', completed: [], startedAtMs: T0, profilesViewed: [], starterPackUsed: false });
    expect(freshState().pendingPack).toBeNull();
    expect(freshState().unlockedAchievements).toEqual([]);
    expect(MIGRATION_STEPS.map((m) => [m.from, m.to])).toEqual([[1, 2], [2, 4]]);
  });

  it('current version passes through unchanged', () => {
    const s = freshState() as unknown as Record<string, unknown>;
    const r = migrateState(4, s);
    expect(r).toEqual({ ok: true, state: s, fromVersion: 4, preRelease: false });
  });

  it('runs future steps in order and stamps schemaVersion', () => {
    const steps: MigrationStep[] = [
      { from: 1, to: 2, run: (st) => ({ ...st, a: 1 }) },
      { from: 2, to: 4, run: (st) => ({ ...st, b: (st.a as number) + 1 }) },
    ];
    const r = migrateState(1, { schemaVersion: 1 }, steps, 4);
    expect(r).toEqual({ ok: true, state: { schemaVersion: 4, a: 1, b: 2 }, fromVersion: 1, preRelease: false });
  });

  it('reports a missing step, a throwing step and a newer version', () => {
    expect(migrateState(1, { schemaVersion: 1 }, [], 2)).toMatchObject({ ok: false, code: 'unsupported-version' });
    const boom: MigrationStep[] = [{ from: 1, to: 2, run: () => { throw new Error('bad data'); } }];
    expect(migrateState(1, { schemaVersion: 1 }, boom, 2)).toMatchObject({ ok: false, code: 'migration-failed', details: ['1 → 2: bad data'] });
    expect(migrateState(5, { schemaVersion: 5 })).toMatchObject({ ok: false, code: 'newer-version' });
  });

  it('pre-release dev saves (schemaVersion 3, v1 shape) are read as v1 then migrated to v4', async () => {
    const s = advanced(freshState(), 5000, 'dev');
    const r = await parseSaveText(await envelopeAt(3, s));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.migratedFrom).toBe(3);
    const tutorial = { status: 'active', completed: [], startedAtMs: s.clock.lastProcessedAtMs, profilesViewed: [], starterPackUsed: false };
    expect(r.save.state).toEqual({ ...s, food: { lastSpawnAtMs: null, drops: [] }, schemaVersion: 4, discoveries: [], tutorial });
    expect(migrateState(3, { schemaVersion: 3, clock: { lastProcessedAtMs: 7 } })).toMatchObject({
      ok: true,
      preRelease: true,
      state: { schemaVersion: 4, discoveries: [], pendingPack: null, unlockedAchievements: [], claimedAchievements: [] },
    });
  });
});

describe('migration v1 → v2 on a real Schema v1 save (tests/fixtures/save-schema-v1.json)', () => {
  // File được ghi bởi code main@34d42ec (Schema v1), giữ nguyên văn.
  const fixture = import.meta.glob('../fixtures/save-schema-v1.json', { query: '?raw', import: 'default', eager: true });
  const text = Object.values(fixture)[0] as string;

  it('loads, keeps every v1 field and adds empty discoveries', async () => {
    const original = JSON.parse(text) as { schemaVersion: number; state: Record<string, unknown> };
    expect(original.schemaVersion).toBe(1);
    expect('discoveries' in original.state).toBe(false);
    const r = await parseSaveText(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.migratedFrom).toBe(1);
    expect(r.save.state.schemaVersion).toBe(4);
    expect(r.save.state.discoveries).toEqual([]);
    const { schemaVersion: _a, discoveries: _b, tutorial: _t, pendingPack: _p, unlockedAchievements: _u, claimedAchievements: _c2, ...rest } = r.save.state;
    void [_a, _b, _t, _p, _u, _c2];
    const { schemaVersion: _c, ...origRest } = original.state;
    void _c;
    expect(rest).toEqual(origRest);
  });

  it('a v1 save is archived verbatim and the gold, dragons and habitats are preserved after saving as v2', async () => {
    const store = new MemorySaveStore();
    store.slots.set('main', text);
    const mgr = new SaveManager({ store, nowMs: () => T0 });
    const r = await mgr.load();
    if (r.kind !== 'loaded') throw new Error(r.kind);
    await mgr.save(r.save.state);
    expect(store.slots.get('archive:schema-1')).toBe(text);
    const again = await parseSaveText((await store.get('main')) ?? '');
    expect(again.ok && again.save.migratedFrom).toBeNull();
    const orig = (JSON.parse(text) as { state: GameState }).state;
    expect(again.ok && again.save.state.goldMicro).toBe(orig.goldMicro);
    expect(again.ok && again.save.state.dragons).toEqual(orig.dragons);
    expect(again.ok && again.save.state.zones).toEqual(orig.zones);
  });

  it('refuses a v1 state that already has discoveries (would hide a shape mismatch)', () => {
    expect(migrateState(1, { schemaVersion: 1, discoveries: [] })).toMatchObject({ ok: false, code: 'migration-failed' });
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
    const newer = await envelopeAt(5);
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

  it('a migrated save keeps its original text in a permanent archive slot', async () => {
    const { store } = manager();
    const original = await envelopeAt(3, freshState());
    store.slots.set('main', original);
    const mgr = new SaveManager({ store, nowMs: () => T0 });
    const r = await mgr.load();
    expect(r.kind === 'loaded' && r.save.migratedFrom).toBe(3);
    if (r.kind !== 'loaded') return;
    // Chưa ghi gì khi chỉ đọc.
    expect(store.writes).toBe(0);
    let s = r.save.state;
    expect(await mgr.save(s)).toBe(true);
    for (let i = 0; i < 3; i++) {
      s = advanced(s, 1000, `m${i}`);
      await mgr.save(s);
    }
    // Sau nhiều lần xoay, bản gốc vẫn còn nguyên trong archive; main đã là schema v1.
    expect(store.slots.get('archive:schema-3')).toBe(original);
    const main = await parseSaveText((await store.get('main')) ?? '');
    expect(main.ok && main.save.state.schemaVersion).toBe(4);
    expect(main.ok && main.save.migratedFrom).toBeNull();
  });

  it('archive is never overwritten by a later migration of the same version', async () => {
    const { store } = manager();
    store.slots.set('archive:schema-3', 'first');
    store.slots.set('main', await envelopeAt(3));
    const mgr = new SaveManager({ store, nowMs: () => T0 });
    const r = await mgr.load();
    if (r.kind === 'loaded') await mgr.save(r.save.state);
    expect(store.slots.get('archive:schema-3')).toBe('first');
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

  it('without Web Locks or localStorage the tab is the writer and flags unsupported', async () => {
    expect(await acquireWriterLock(undefined, undefined, () => null)).toMatchObject({ acquired: true, unsupported: true, via: 'none' });
  });
});
