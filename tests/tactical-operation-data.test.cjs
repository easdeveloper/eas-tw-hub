const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture() {
    const state = { now: 1000, calls: [], active: 0, maxActive: 0, fail: null, troops: { '1': { ownHome: { spear: 0, snob: 0 } }, '2': { ownHome: { spear: 20, snob: 1 } } }, info: { available: true, complete: true, stale: false, unitOrder: ['spear', 'snob'], source: 'remote_units_overview', updatedAtLocal: 1000 } };
    const villages = [{ id: 1, coordinate: '500|500', name: 'One' }, { id: 2, coordinate: '501|501', name: 'Two' }];
    const target = { id: 9, coordinate: '484|527', name: 'FANTASMA', playerId: 3 };
    const forbidden = new Proxy({}, { get() { throw Error('Forbidden execution access'); } });
    const EAS = { Utils: { parseCoordinate: value => /^\d{3}\|\d{3}$/.test(value) ? { coordinate: value } : null },
        MissionScheduler: forbidden, FakesExecution: forbidden, ScheduledMissionExecution: forbidden,
        PublicMap: { getVillages: async () => [target], findPlayerVillages: async () => ({ player: { id: 3, name: 'chargboy' }, villages: [target], updatedAt: 1000 }) },
        Troops: { getSourceInfo: () => state.info },
        Data: { Villages: { ensureFresh: async () => {}, getAll: () => villages }, Troops: { ensureFresh: async () => {}, getAll: () => state.troops, getMetadata: () => { const ageMs=state.now-state.info.updatedAtLocal,ttlMs=300000,stale=state.info.stale||ageMs>ttlMs;return {stale,confidence:stale?'stale':'high',ageMs,ttlMs}; }, getUnits: () => ['spear', 'snob'] } },
        ArrivalPlanner: { mapInfo: async (source, destination, signal) => {
            state.calls.push({ source, destination }); state.active++; state.maxActive = Math.max(state.maxActive, state.active);
            await Promise.resolve(); state.active--;
            if (state.fail) await state.fail(source, signal);
            return { spear: Number(source) * 1000, snob: Number(source) * 2000 };
        } } };
    const context = vm.createContext({ EAS, window: {}, DOMException, Date: { now: () => state.now }, setTimeout: fn => setTimeout(fn, 0), clearTimeout });
    for (const file of ['services/tactical-operation-planner.js', 'services/tactical-operation-data.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    return { api: EAS.TacticalOperationData, state, EAS, options: { target: { coord: '484|527', playerName: 'chargboy' } } };
}
test('loading service starts no collection; explicit analysis resolves target with owner evidence', async () => {
    const { api, state, options } = fixture(); assert.equal(state.calls.length, 0);
    const r = await api.analyzeTarget(options); assert.equal(r.target.villageId, '9'); assert.equal(r.target.playerName, 'chargboy'); assert.equal(r.status, 'complete');
});
test('conflicting target identity blocks before travel or troops', async () => {
    const { api, state, options } = fixture(); options.target.villageId = '10';
    const r = await api.analyzeTarget(options); assert.equal(r.reason, 'TARGET_IDENTITY_CONFLICT'); assert.equal(state.calls.length, 0);
});
test('complete ownHome data is usable and zero is not unknown', async () => {
    const { api, options } = fixture(); const r = await api.analyzeTarget(options);
    assert.equal(r.candidates[0].evidence.trusted, true); assert.equal(r.candidates[0].snob, 0); assert.equal(r.candidates[0].ownHome.spear, 0);
    assert.equal(r.candidates[1].snob, 1); assert.equal(r.candidates[1].eligibility, 'eligible');
});
test('incomplete, stale or missing ownHome remains blocked, never replaced by inVillage', async () => {
    for (const change of [s => { s.info.complete = false; }, s => { s.info.stale = true; }, s => { s.troops['1'] = { inVillage: { spear: 999, snob: 9 } }; }]) {
        const { api, state, options } = fixture(); change(state); const r = await api.analyzeTarget(options);
        assert.equal(r.candidates[0].evidence.trusted, false); assert.equal(r.candidates[0].snob, null); assert.equal(r.candidates[0].eligibility, 'blocked');
    }
});
test('troop trust is captured fresh before long map collection and is not retroactively aged', async () => {
    const { api, state, options } = fixture();
    state.fail = async () => { state.now += 331664; };
    const r = await api.analyzeTarget(options);
    assert.equal(r.candidates[0].evidence.trusted, true);
    assert.equal(r.candidates[0].evidence.fresh, true);
    assert.equal(r.candidates[0].evidence.metadata.ageMs, 0);
    assert.equal(r.candidates[0].travelDurations.spear.evidence.observedAt > r.candidates[0].evidence.metadata.ttlMs + 1000, true);
});
test('troop snapshot stale at acquisition remains untrusted despite later map data', async () => {
    const { api, state, options } = fixture(); state.now += 331664;
    const r = await api.analyzeTarget(options);
    assert.equal(r.candidates[0].evidence.trusted, false);
    assert.equal(r.candidates[0].evidence.fresh, false);
    assert.equal(r.candidates[0].evidence.metadata.stale, true);
    assert.equal(r.candidates[0].eligibility, 'blocked');
});
test('a required unit column missing from the acquired overview keeps troop evidence incomplete', async () => {
    const { api, state, options } = fixture(); state.info.unitOrder = ['spear'];
    const r = await api.analyzeTarget(options);
    assert.equal(r.candidates[0].evidence.complete, false);
    assert.equal(r.candidates[0].evidence.trusted, false);
    assert.equal(r.candidates[0].eligibility, 'blocked');
});
test('durations attach to correct source; origin limitation explicit, no universal duration', async () => {
    const { api, options } = fixture(); const r = await api.analyzeTarget(options);
    assert.equal(r.candidates[0].travelDurations.spear.durationMs, 1000); assert.equal(r.candidates[1].travelDurations.spear.durationMs, 2000);
    assert.equal(r.candidates[0].mapInfo.originProven, false); assert.equal(r.candidates[0].travelTimeMs, undefined);
});
test('source map failure leaves other source usable and marks partial', async () => {
    const { api, state, options } = fixture(); state.fail = source => { if (source === '1') throw Error('bad payload'); };
    const r = await api.analyzeTarget(options); assert.equal(r.partial, true); assert.equal(r.summary.mapInfoFailed, 1); assert.equal(r.summary.mapInfoSuccess, 1);
});
test('sequential queue and progress callback failure do not duplicate requests', async () => {
    const { api, state, options } = fixture(); options.onProgress = () => { throw Error('consumer'); };
    const r = await api.analyzeTarget(options); assert.equal(state.maxActive, 1); assert.equal(state.calls.length, 2); assert.equal(r.partial, false);
});
test('abort after first candidate stops further collection with explicit pending count', async () => {
    const { api, state, options } = fixture(); const controller = new AbortController();
    options.signal = controller.signal; options.onProgress = () => controller.abort();
    const r = await api.analyzeTarget(options); assert.equal(r.status, 'aborted'); assert.equal(r.partial, true); assert.equal(state.calls.length, 1); assert.equal(r.summary.mapInfoPending, 1);
});
test('429 stops safely without retries', async () => {
    const { api, state, options } = fixture(); state.fail = () => { throw Error('RATE_LIMITED'); };
    const r = await api.analyzeTarget(options); assert.equal(r.status, 'rate_limited'); assert.equal(state.calls.length, 1); assert.equal(r.partial, true);
});
test('pre-abort makes no travel request', async () => {
    const { api, state, options } = fixture(); const c = new AbortController(); c.abort(); options.signal = c.signal;
    const r = await api.analyzeTarget(options); assert.equal(r.status, 'aborted'); assert.equal(state.calls.length, 0);
});
test('source filter restricts owned villages and rejects foreign IDs', async () => {
    const { api, state, options } = fixture(); options.sourceVillageIds = ['2'];
    assert.equal((await api.analyzeTarget(options)).sourcesDiscovered, 1); assert.equal(state.calls[0].source, '2');
    options.sourceVillageIds = ['999']; assert.equal((await api.analyzeTarget(options)).reason, 'SOURCE_NOT_OWNED');
});
test('concurrent analysis cannot create concurrent queues; no execution APIs called', async () => {
    const { api, options } = fixture(); const first = api.analyzeTarget(options);
    await assert.rejects(api.analyzeTarget(options), /ANALYSIS_ALREADY_RUNNING/); assert.equal((await first).status, 'complete');
});
test('compact diagnostic contains evidence, not raw responses or execution tokens', async () => {
    const { api, options } = fixture(); const r = await api.diagnoseTarget(options);
    assert.equal(r.sources.length, 2); assert.equal(r.mapInfoSuccess, 2); assert.equal(r.sources[0].troopEvidence.trusted, true);
    assert.equal(JSON.stringify(r).includes('attemptId'), false);
});
test('group filtering uses existing membership API and rejects unknown groups', async () => {
    const { api, EAS, options } = fixture(); let requested = 0;
    EAS.Data.Groups = { ensureFresh: async () => {}, getById: id => id === '7' ? { id } : null, ensureMembership: async () => { requested++; return ['2']; } };
    options.groupId = '7'; const r = await api.analyzeTarget(options);
    assert.equal(requested, 1); assert.equal(r.sourcesDiscovered, 1); assert.equal(r.candidates[0].source.id, '2');
    options.groupId = '8'; assert.equal((await api.analyzeTarget(options)).reason, 'GROUP_UNAVAILABLE');
});
test('target conflicts report expected and observed identity; missing owner stays unknown', async () => {
    const { api, EAS, options } = fixture(); options.target.villageId = '10';
    const conflict = await api.diagnoseTarget(options); assert.equal(conflict.conflictEvidence.expected.villageId, '10'); assert.equal(conflict.conflictEvidence.observed.villageId, 9);
    EAS.PublicMap.getVillages = async () => [{ id: 9, coordinate: '484|527', name: 'FANTASMA' }];
    const r = await api.analyzeTarget({ target: '484|527' }); assert.equal(r.target.playerId, null); assert.equal(r.target.playerName, null);
});
test('abort during non-cancellable shared refresh prevents later stages', async () => {
    const { api, EAS, state, options } = fixture(); const controller = new AbortController(); options.signal = controller.signal;
    EAS.Data.Villages.ensureFresh = async () => controller.abort();
    EAS.Data.Troops.ensureFresh = async () => { throw Error('Must not refresh troops'); };
    const r = await api.analyzeTarget(options); assert.equal(r.status, 'aborted'); assert.equal(state.calls.length, 0);
});
test('real BR143 target survives unresolved optional player name', async () => {
    const { api, EAS, options } = fixture();
    EAS.PublicMap.getVillages = async () => [{ id: 308, name: 'FANTASMA', coordinate: '484|527', playerId: 6225864, points: 6530, continent: 'K54', x: 484, y: 527 }];
    EAS.PublicMap.findPlayerVillages = async () => { throw Error('Jogador não encontrado. Confira o nome e tente novamente.'); };
    const r = await api.diagnoseTarget(options);
    assert.equal(r.status, 'complete'); assert.equal(r.target.villageId, '308'); assert.equal(r.target.playerId, '6225864');
    assert.equal(r.target.playerName, null); assert.equal(r.target.ownerNameValidation.status, 'unresolved');
    assert.equal(r.target.ownerNameValidation.suppliedName, 'chargboy'); assert.equal(r.target.points, 6530);
    assert.ok(r.sources[0].warnings.includes('OWNER_NAME_UNRESOLVED'));
});
test('matching owner name validated; proven different ID blocks', async () => {
    const { api, EAS, options } = fixture();
    assert.equal((await api.analyzeTarget(options)).target.ownerNameValidation.status, 'validated');
    EAS.PublicMap.findPlayerVillages = async () => ({ player: { id: 44, name: 'chargboy' }, villages: [] });
    const r = await api.diagnoseTarget(options);
    assert.equal(r.status, 'blocked'); assert.equal(r.errorCode, 'TARGET_OWNER_CONFLICT'); assert.equal(r.failureStage, 'TARGET_RESOLUTION');
});
test('zero owner ID is explicitly unowned; absent name does not invent owner identity', async () => {
    const { api, EAS } = fixture();
    EAS.PublicMap.getVillages = async () => [{ id: 308, coordinate: '484|527', playerId: 0 }];
    const r = await api.analyzeTarget({ target: '484|527' });
    assert.equal(r.target.ownership, 'unowned'); assert.equal(r.target.playerId, '0'); assert.equal(r.target.playerName, null);
    assert.equal(r.target.ownerNameValidation.status, 'not-supplied');
});
test('diagnostics distinguish refresh, getter and target failures without raw secrets', async () => {
    for (const stage of ['TARGET_RESOLUTION', 'OWN_VILLAGES_REFRESH', 'OWN_VILLAGES_READ', 'TROOPS_REFRESH']) {
        const { api, EAS, options } = fixture();
        const fail = () => { throw Error('secret-token <html> raw response'); };
        if (stage === 'TARGET_RESOLUTION') EAS.PublicMap.getVillages = fail;
        if (stage === 'OWN_VILLAGES_REFRESH') EAS.Data.Villages.ensureFresh = fail;
        if (stage === 'OWN_VILLAGES_READ') EAS.Data.Villages.getAll = () => ({});
        if (stage === 'TROOPS_REFRESH') EAS.Data.Troops.ensureFresh = fail;
        const r = await api.diagnoseTarget(options);
        assert.equal(r.failureStage, stage); assert.equal(r.errorCode, `${stage}_FAILED`); assert.ok(r.errorMessage);
        assert.equal(JSON.stringify(r).includes('secret-token'), false);
    }
});
test('owner lookup abort and rate limit remain terminal, never unresolved warnings', async () => {
    for (const error of [new DOMException('cancel', 'AbortError'), Error('RATE_LIMITED')]) {
        const { api, EAS, options, state } = fixture(); EAS.PublicMap.findPlayerVillages = async () => { throw error; };
        const r = await api.analyzeTarget(options); assert.ok(['aborted', 'rate_limited'].includes(r.status)); assert.equal(state.calls.length, 0);
    }
});
test('real PublicMap parser fixture: coordinate succeeds while absent player name fails', async () => {
    const context = vm.createContext({ EAS: { Utils: {} }, window: {}, URL, location: { origin: 'https://example.test' },
        fetch: async url => ({ ok: true, status: 200, text: async () => url.pathname.endsWith('player.txt') ? '6225864,CurrentName,0,1,6530,1' : '308,FANTASMA,484,527,6225864,6530,1' }) });
    vm.runInContext(fs.readFileSync('services/public-map.js', 'utf8'), context);
    const villages = await context.EAS.PublicMap.getVillages();
    assert.equal(villages[0].id, 308); assert.equal(villages[0].playerId, 6225864); assert.equal(villages[0].coordinate, '484|527');
    await assert.rejects(context.EAS.PublicMap.findPlayerVillages('chargboy'), /Jogador/);
    assert.equal((await context.EAS.PublicMap.findPlayerVillages('CurrentName')).player.id, 6225864);
});
