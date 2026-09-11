const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../services/minting.js'), 'utf8');
const context = vm.createContext({ EAS: {} }); // No window or timer APIs: bootstrap must be inert.
vm.runInContext(source, context);
const service = context.EAS.Minting;
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
function fixture(overrides = {}, saved = null) {
    let stored = saved, calls = [], checks = [], locked = false;
    const villages = ['AVAILABLE', 'ACTIVE', 'UNAVAILABLE'].map((state, i) => ({ villageId: String(i + 1), villageName: 'V' + i, state }));
    const deps = {
        read: () => clone(stored), write: value => { stored = clone(value); return true; }, now: () => 1000,
        available: () => true, lock: async fn => { if (locked) return false; locked = true; try { return await fn(); } finally { locked = false; } },
        discover: async id => { checks.push(id); return { villages }; }, contains: async () => true,
        activateVillage: async (row, { beforePost }) => { assert.equal(beforePost(), true); calls.push(row.villageId); return { state: 'ACTIVE', outcome: 'ACTIVATED' }; }, ...overrides
    };
    const c = service.createController(deps);
    return { c, deps, calls, checks, villages, stored: () => stored, reload: () => service.createController(deps) };
}
async function preview(f) { f.c.configure({ groupId: '12' }); await f.c.verify(); }
test('loading and legacy reload never schedule, discover or activate', () => {
    const f = fixture({}, { version: 1, config: { groupId: '12', intervalHours: 0.1 }, automation: true, status: 'WAITING', nextRunAt: 1 });
    const c = f.reload();
    assert.equal(c.read().config.groupId, '12');
    assert.equal(c.read().previewReady, false);
    assert.deepEqual(f.calls, []); assert.deepEqual(f.checks, []);
    for (const obsolete of ['start', 'stop', 'run', 'restore', 'intervalMs']) assert.equal(c[obsolete], undefined);
    assert.equal(/setTimeout|setInterval|addEventListener/.test(source), false);
});
test('preview is read-only and preserves explicit states', async () => {
    const f = fixture(); await preview(f);
    assert.deepEqual(f.calls, []); assert.deepEqual(f.checks, ['12']);
    assert.deepEqual(clone(f.c.read().results.map(row => row.state)), ['AVAILABLE', 'ACTIVE', 'UNAVAILABLE']);
});
test('explicit activation selects only AVAILABLE and consumes preview', async () => {
    const f = fixture(); await preview(f); assert.equal(await f.c.activate(), true);
    assert.deepEqual(f.calls, ['1']); assert.equal(f.c.read().results[0].outcome, 'ACTIVATED');
    assert.equal(f.c.read().previewReady, false); await f.c.activate(); assert.deepEqual(f.calls, ['1']);
});
test('activation without preview is blocked', async () => { const f = fixture(); f.c.configure({ groupId: '12' }); await f.c.activate(); assert.deepEqual(f.calls, []); });
test('new controller requires new preview even when persisted results are AVAILABLE', async () => {
    const f = fixture(); await preview(f); await f.reload().activate(); assert.deepEqual(f.calls, []);
});
test('group change invalidates preview', async () => { const f = fixture(); await preview(f); f.c.configure({ groupId: '13' }); await f.c.activate(); assert.deepEqual(f.calls, []); });
test('removed group member is skipped', async () => { const f = fixture({ contains: async () => false }); await preview(f); await f.c.activate(); assert.deepEqual(f.calls, []); assert.equal(f.c.read().results[0].reason, 'REMOVED_FROM_GROUP'); });
test('UNCERTAIN stops sequence and is never automatically retried', async () => {
    let attempts = 0;
    const f = fixture({ activateVillage: async (row, { beforePost }) => { beforePost(); attempts++; return { state: 'UNCERTAIN', outcome: 'UNCERTAIN' }; } });
    f.villages[1].state = 'AVAILABLE'; await preview(f); await f.c.activate(); await f.c.activate();
    assert.equal(attempts, 1); assert.equal(f.c.read().results[0].state, 'UNCERTAIN');
});
test('session invalid preview blocks entire activation', async () => { const f = fixture(); f.villages[1].state = 'SESSION_INVALID'; await preview(f); await f.c.activate(); assert.deepEqual(f.calls, []); });
test('session invalid fresh check stops sequence', async () => {
    let checks = 0;
    const f = fixture({ activateVillage: async () => { checks++; return { state: 'SESSION_INVALID', outcome: 'SKIPPED' }; } });
    f.villages[1].state = 'AVAILABLE'; await preview(f); await f.c.activate(); assert.equal(checks, 1);
});
test('persistent claim must succeed before POST', async () => {
    const f = fixture(); await preview(f);
    f.deps.write = state => !state.results.some(row => row.outcome === 'ATTEMPTED');
    await f.c.activate(); assert.deepEqual(f.calls, []);
});
test('claim may be used only once', async () => {
    const f = fixture({ activateVillage: async (row, { beforePost }) => { assert.equal(beforePost(), true); assert.equal(beforePost(), false); return { state: 'ACTIVE', outcome: 'ACTIVATED' }; } });
    await preview(f); await f.c.activate();
});
test('unclaimed success is not accepted', async () => { const f = fixture({ activateVillage: async () => ({ state: 'ACTIVE', outcome: 'ACTIVATED' }) }); await preview(f); await f.c.activate(); assert.equal(f.c.read().results[0].state, 'UNCERTAIN'); });
test('double click is rejected while activation is pending', async () => {
    let release;
    const f = fixture({ contains: () => new Promise(resolve => { release = resolve; }) }); await preview(f);
    const first = f.c.activate(); assert.equal(await f.c.activate(), false); release(true); await first; assert.deepEqual(f.calls, ['1']);
});
test('exclusive lock failure prevents all activation', async () => { const f = fixture({ lock: async () => false }); await preview(f); await f.c.activate(); assert.deepEqual(f.calls, []); });
test('duplicate discovery rows are activated once', async () => { const f = fixture(); f.villages.push(f.villages[0]); await preview(f); await f.c.activate(); assert.deepEqual(f.calls, ['1']); });
test('discovery does not persist ephemeral token/action/HTML', async () => {
    const f = fixture(); Object.assign(f.villages[0], { h: 'synthetic-secret', actionUrl: 'secret', html: 'secret' }); await preview(f);
    assert.equal(JSON.stringify(f.stored()).includes('secret'), false);
});
test('activation is sequential', async () => {
    let running = 0, max = 0;
    const f = fixture({ activateVillage: async (row, { beforePost }) => { beforePost(); running++; max = Math.max(max, running); await Promise.resolve(); running--; return { state: 'ACTIVE', outcome: 'ACTIVATED' }; } });
    f.villages[1].state = 'AVAILABLE'; await preview(f); await f.c.activate(); assert.equal(max, 1);
});
test('empty group and invalid configuration never activate', async () => {
    const f = fixture(); assert.throws(() => f.c.configure({ groupId: '' })); f.villages.length = 0; await preview(f); await f.c.activate(); assert.deepEqual(f.calls, []);
});
