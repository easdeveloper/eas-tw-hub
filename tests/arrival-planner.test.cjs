const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const load = (context, file) => vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
function fixture(fetchImpl) {
    const storage = new Map(); let now = Date.UTC(2026, 8, 25, 0);
    const villages = Array.from({ length: 120 }, (_, n) => ({ id: String(n + 1), name: `Village ${n}`, coordinate: '500|500' }));
    const troops = Object.fromEntries(villages.map(v => [v.id, { ownHome: { spy: 100, spear: 20, ram: 1, catapult: 1, snob: 1 } }]));
    const context = vm.createContext({ console: { debug() {} }, URL, DOMException, AbortController, crypto: require('node:crypto').webcrypto,
        setTimeout: fn => setTimeout(fn, 0), clearTimeout,
        location: { host: 'test', hostname: 'test', href: 'https://test/game.php?screen=info_village&id=9113' },
        localStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }, fetch: fetchImpl,
        window: { game_data: { player: { id: 7 } } }, EAS: { Logger: { info() { throw Error('logger failure'); } },
            World: { getWorldName: () => 'test', getPlayer: () => ({ id: 7 }), getServerNowTimestamp: () => now },
            MassSnipeExecution: { getCurrentServerTimeMs: () => now },
            Data: { Villages: { getAll: () => villages }, Troops: { getAll: () => troops, getById: id => troops[id], getUnits: () => ['spy', 'spear', 'ram', 'catapult', 'snob'] } } } });
    load(context, 'core/utils.js'); load(context, 'services/mission-scheduler.js'); load(context, 'services/arrival-planner.js');
    return { api: context.EAS.ArrivalPlanner, context, troops, villages, setNow: n => { now = n; }, now, storage };
}
const target = { id: '9113', coords: '524|438' };
const response = { id: '9113', xy: 524438, units: { axe: { time: '8:49:42' }, sword: { time: '10:47:25' }, light: { time: '4:54:17' }, heavy: { time: '5:23:42' }, knight: { time: '4:54:17' }, spy: { id: 'spy', time: '4:24:51' }, spear: { time: '24:43:33' }, ram: { time: '41:12:35' }, catapult: { time: '41:12:35' }, snob: { time: '48:04:41' } } };
const ok = () => ({ ok: true, status: 200, json: async () => response });
test('info_village URL target mounts without synthetic village_info and rejects conflicting evidence', () => {
    const { api } = fixture();
    const doc = { querySelector: () => null };
    const href = 'https://br143.tribalwars.com.br/game.php?village=481&screen=info_village&id=9113#524;438';
    const target = api.resolveTarget(doc, href);
    assert.equal(target.id, '9113'); assert.equal(target.coords, '524|438');
    assert.equal(api.resolveTarget(doc, href.replace('info_village', 'place')), null);
    assert.equal(api.resolveTarget(doc, href.replace('&id=9113', '')), null);
    assert.equal(api.resolveTarget(doc, href.replace('#524;438', '')), null);
    const table = { querySelectorAll: () => [{ textContent: '525|438' }], querySelector: () => null };
    assert.equal(api.resolveTarget({ querySelector: selector => selector === '#village_info' ? table : null }, href), null);
});
test('map_info exact target, all units and >24h; malformed evidence rejected', () => {
    const { api } = fixture(); const parsed = api.parseMapInfo(response, target);
    assert.equal(parsed.spy, (4 * 3600 + 24 * 60 + 51) * 1000);
    assert.equal(parsed.snob, (48 * 3600 + 4 * 60 + 41) * 1000);
    assert.equal(Object.keys(parsed).length, 10);
    assert.throws(() => api.duration('24:99:00'));
    assert.throws(() => api.parseMapInfo({ ...response, id: '99' }, target));
    assert.throws(() => api.parseMapInfo({ ...response, xy: 999999 }, target));
});
test('volume sequential, sources, session cache and no fetch until explicit search', async () => {
    let calls = 0, active = 0, peak = 0; const sources = [];
    const f = fixture(async url => { calls++; active++; peak = Math.max(peak, active); sources.push(url.searchParams.get('source')); await Promise.resolve(); active--; return ok(); });
    assert.equal(calls, 0);
    const args = { mode: 'arrival_support', target, arrival: f.now + 3 * 86400000 };
    assert.equal((await f.api.search(args)).length, 120);
    assert.equal(calls, 120); assert.equal(peak, 1); assert.equal(new Set(sources).size, 120);
    await f.api.search(args); assert.equal(calls, 120);
});
test('429 stops finite queue immediately, no retry; abort stops later villages', async () => {
    let calls = 0; const f = fixture(async () => { calls++; return { status: 429, ok: false }; });
    await assert.rejects(f.api.search({ mode: 'snipe_support', target, arrival: f.now + 86400000 }), /RATE_LIMITED/);
    assert.equal(calls, 1);
    const controller = new AbortController(); calls = 0;
    const g = fixture(async () => { calls++; controller.abort(); return ok(); });
    await assert.rejects(g.api.search({ mode: 'arrival_attack', target, arrival: g.now + 86400000, signal: controller.signal }), { name: 'AbortError' });
    assert.equal(calls, 1);
});
test('candidate availability, past/future and exclusions only in SNIP', () => {
    const { api } = fixture(); const args = { available: { spy: 1, spear: 0, ram: 1, catapult: 1, snob: 1 }, times: { spy: 10, spear: 10, ram: 20, catapult: 30, snob: 40 }, units: ['spy', 'spear', 'ram', 'catapult', 'snob'], arrival: 100, now: 50 };
    assert.deepEqual(Object.keys(api.candidateUnits({ ...args, mode: 'snipe_support' })), ['spy']);
    assert.equal(Object.keys(api.candidateUnits({ ...args, mode: 'arrival_attack' })).length, 4);
    assert.equal(Object.keys(api.candidateUnits({ ...args, mode: 'arrival_support', now: 99 })).length, 0);
});
test('composition slowest unit, count constraints, expired timing and support-only SNIP', () => {
    const { api } = fixture(); const args = { mode: 'snipe_support', troops: { spy: 5, spear: 1 }, available: { spy: 10, spear: 3 }, times: { spy: 10, spear: 80 }, units: ['spy', 'spear'], arrival: 100, now: 0 };
    const result = api.composition(args); assert.equal(result.travelTimeMs, 80); assert.equal(result.sendAtMs, 20); assert.equal(result.commandType, 'support');
    assert.throws(() => api.composition({ ...args, now: 21 }), /horário/);
    assert.throws(() => api.composition({ ...args, troops: { spy: 11 } }), /inválida/);
    assert.throws(() => api.composition({ ...args, troops: { ram: 1 } }), /inválida/);
});
test('mission persists identity, arrival+offset, duplicate protection and independent attempts', () => {
    const f = fixture(); const candidate = { village: f.villages[0], times: { spy: 1000 } };
    const incoming = { enemyCommandId: '1050744433', enemyArrivalMs: f.now + 100000 };
    const options = { mode: 'snipe_support', target, candidate, troops: { spy: 5 }, incoming, offset: 200, arrival: incoming.enemyArrivalMs + 200 };
    const mission = f.api.createMission(options); assert.equal(mission.type, 'support'); assert.equal(mission.sendAtMs, options.arrival - 1000);
    assert.throws(() => f.api.createMission(options), /equivalente/);
    load(f.context, 'services/mission-scheduler.js');
    const restored = f.context.EAS.MissionScheduler.load().missions.find(m => m.id === mission.id);
    assert.equal(restored.attemptId, mission.attemptId); assert.equal(restored.arrivalAuthorized, true);
    const second = f.api.createMission({ ...options, offset: 300, arrival: incoming.enemyArrivalMs + 300 });
    assert.notEqual(second.attemptId, mission.attemptId); assert.equal(second.sendAtMs - mission.sendAtMs, 100);
    assert.throws(() => f.api.createMission({ ...options, offset: 500 }), /divergente/);
});
