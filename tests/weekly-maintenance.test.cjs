const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const load = (file, context) => vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
function fakeWindow() {
 let next = 0; const pending = new Map(), cleared = [];
 return { pending, cleared, setTimeout(fn) { const id = ++next; pending.set(id, fn); return id; }, clearTimeout(id) { cleared.push(id); pending.delete(id); }, fire(id) { const fn = pending.get(id); pending.delete(id); fn?.(); } };
}
test('runtime disposes timeouts in their owner windows, including equal IDs', () => {
 const parent = fakeWindow(), child = fakeWindow(), context = { EAS: {}, window: parent, clearTimeout: id => parent.clearTimeout(id) }; load('core/runtime.js', context);
 const runtime = context.EAS.Runtime.create({ id: 'test' }); let fired = 0;
 const a = runtime.setTimeout(() => fired++, 10, parent), b = runtime.setTimeout(() => fired++, 10, child);
 assert.equal(a, b); const queued = child.pending.get(b);
 context.EAS.Runtime.dispose('test'); queued();
 assert.equal(parent.pending.size, 0); assert.equal(child.pending.size, 0); assert.equal(fired, 0);
 assert.equal(runtime.resources.timers.size, 0);
});
test('runtime firing one equal-ID timer keeps the other available for cleanup', () => {
 const parent = fakeWindow(), child = fakeWindow(), context = { EAS: {}, window: parent, clearTimeout: id => parent.clearTimeout(id) }; load('core/runtime.js', context);
 const runtime = context.EAS.Runtime.create({ id: 'test' }); let fired = 0;
 runtime.setTimeout(() => fired++, 10, parent); runtime.setTimeout(() => fired++, 10, child);
 parent.fire(1); assert.equal(fired, 1); assert.equal(runtime.resources.timers.size, 1);
 runtime.dispose(); assert.equal(child.pending.size, 0);
});
test('group listing reads owned villages once and direct lookup avoids unrelated groups', () => {
 let reads = 0, storageReads = 0;
 const state = { schemaVersion: 1, world: 'test', playerId: '1', groups: {}, memberships: {} };
 for (let id = 1; id <= 100; id++) { state.groups[id] = { id: String(id), name: 'G' + id }; state.memberships[id] = { villageIds: ['1','2'] }; }
 const context = { EAS: { World: { getInfo: () => ({ world: 'test', player: { id: 1 } }) }, Storage: { get: () => { storageReads++; return state; } }, Villages: { getAll: () => { reads++; return [{ id: 1 }]; } } }, window: { addEventListener() {} }, location: { hostname: 'test' } };
 load('core/groups.js', context);
 const groups = context.EAS.Groups.getAll(); assert.equal(groups.length, 100); assert.equal(reads, 1); assert.equal(storageReads, 1);
 reads = 0; const group = context.EAS.Groups.getById('50'); assert.equal(group.id, '50'); assert.equal(group.villageCount, 1); assert.equal(reads, 1);
 reads = 0; assert.equal(context.EAS.Groups.getById('missing'), null); assert.equal(reads, 0);
});
test('observability excludes query tokens and fragments from persisted page URL', () => {
 let saved; const location = { href: 'https://example.test/game.php?village=7&screen=snob&h=synthetic-secret&token=synthetic-secret#synthetic-secret' };
 const context = { EAS: { Storage: { get: () => [], set: (key, data) => { saved = data; } } }, window: { game_data: {} }, location, URL, console: { info() {} } };
 load('core/observability.js', context); const entry = context.EAS.Log.info('test', 'event');
 assert.equal(entry.page.url, 'https://example.test/game.php?screen=snob&village=7'); assert.equal(JSON.stringify(saved).includes('synthetic-secret'), false);
});
test('explicit cancellation releases owner metadata and preserves other windows', () => {
 const parent = fakeWindow(), child = fakeWindow(), context = { EAS: {}, window: parent, clearTimeout: id => parent.clearTimeout(id) }; load('core/runtime.js', context);
 const runtime = context.EAS.Runtime.create({ id: 'cancel' });
 runtime.setTimeout(() => {}, 10, parent); runtime.setTimeout(() => {}, 10, child);
 runtime.clearTimeout(1, child); assert.equal(child.pending.size, 0); assert.equal(parent.pending.size, 1);
 runtime.dispose(); assert.deepEqual(child.cleared, [1]); assert.deepEqual(parent.cleared, [1]);
});
