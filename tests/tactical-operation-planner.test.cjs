const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ EAS: {}, Date: undefined });
vm.runInContext(fs.readFileSync('services/tactical-operation-planner.js', 'utf8'), context);
const api = context.EAS.TacticalOperationPlanner;
const plain = value => JSON.parse(JSON.stringify(value));
const H = 3600000, DAY = 24 * H, central = 10 * DAY + 10 * H;
const source = { id: '1', coord: '500|500' };
const composition = (quantities = { spear: 10 }, requestedMode = 'custom') => ({ requestedMode, quantities, confirmed: true, evidence: { snapshotId: 'troops-1' } });
const candidate = () => ({ source, ownHome: { spear: 100, ram: 10, snob: 4 }, evidence: { trusted: true, complete: true, fresh: true }, travelDurations: { spear: { durationMs: H, trusted: true }, ram: { durationMs: 3 * H, trusted: true }, snob: { durationMs: 4 * H, trusted: true } } });
const slot = (id = 'a', role = 'attack', offset = -1000, quantities) => ({ id, role, arrivalOffsetMs: offset, source, composition: composition(quantities) });
const operation = slots => ({ id: 'op-1', revision: 1, target: { coord: '501|501' }, centralArrivalMs: central, slots });
const plan = (slots = [slot()], candidates = [candidate()], extra = {}) => api.validatePlan({ operation: operation(slots), candidates, serverNowMs: central - 8 * H, ...extra });
test('normalization preserves unknowns and copies evidence without inventing identities', () => {
    const op = api.normalizeOperation({});
    assert.equal(op.id, null); assert.equal(op.centralArrivalMs, null); assert.equal(op.nightBonus.known, false);
    const c = composition(); const n = api.normalizeComposition(c); n.quantities.spear = 1;
    assert.equal(c.quantities.spear, 10);
});
test('attack arrives before central and support arrives after, exact arithmetic', () => {
    const result = plan([slot(), slot('b', 'support', 2000)]);
    assert.equal(result.valid, true);
    assert.equal(result.missions[0].desiredArrivalMs, central - 1000);
    assert.equal(result.missions[1].desiredArrivalMs, central + 2000);
    assert.equal(result.missions[0].sendAtMs, central - 1000 - H);
});
test('review orders by send time: slower support arriving later sends first', () => {
    const result = plan([slot(), slot('b', 'support', 2000, { ram: 1 }), slot('n', 'noble', 0, { snob: 1 })]);
    assert.equal(result.valid, true);
    assert.deepEqual(plain(result.missions.map(m => m.slotId)), ['n', 'b', 'a']);
    assert.equal(result.missions[0].commandType, 'attack');
    assert.equal(result.missions[1].commandType, 'support');
});
test('custom duration uses all selected units, reports limiting ties and evidence', () => {
    const result = api.resolveTravelDuration(composition({ spear: 1, ram: 1, catapult: 1 }), { ...candidate().travelDurations, catapult: { durationMs: 3 * H, trusted: true, evidence: 'synthetic' } });
    assert.equal(result.travelTimeMs, 3 * H);
    assert.deepEqual(plain(result.limitingUnits), ['ram', 'catapult']);
    assert.equal(result.evidence[2].evidence, 'synthetic');
});
test('missing or untrusted duration blocks instead of using a speed default', () => {
    for (const entry of [undefined, { durationMs: H, trusted: false }]) {
        const c = candidate(); c.travelDurations.spear = entry;
        assert.equal(plan([slot()], [c]).valid, false);
        assert.equal(plan([slot()], [c]).missions[0].travelTimeMs, null);
    }
});
test('unknown, stale, incomplete availability and unknown selected units block', () => {
    for (const flag of ['trusted', 'complete', 'fresh']) {
        const c = candidate(); c.evidence[flag] = false;
        assert.equal(plan([slot()], [c]).valid, false);
    }
    const c = candidate(); delete c.ownHome.spear;
    const result = plan([slot()], [c]);
    assert.equal(result.valid, false); assert.equal(result.balances[0].available.spear, null);
    assert.equal(result.balances[0].remaining.spear, null);
});
test('aggregate detects double allocation and never subtracts unknown as zero', () => {
    const result = plan([slot('a', 'attack', 0, { spear: 60 }), slot('b', 'support', 1, { spear: 60 })]);
    assert.equal(result.valid, false);
    assert.equal(result.balances[0].allocated.spear, 120);
    assert.equal(result.balances[0].remaining.spear, -20);
    assert.equal(result.balances[0].overAllocated.spear, 20);
    assert.ok(result.blockers.includes('OVER_ALLOCATION'));
});
test('FULL needs concrete confirmed composition; full does not resolve live troops', () => {
    const s = slot(); s.composition = { requestedMode: 'full', confirmed: false };
    assert.equal(plan([s]).valid, false);
    s.composition = composition({ spear: 5 }, 'full');
    assert.equal(plan([s]).valid, true);
});
test('invalid quantities and empty compositions are rejected without correction', () => {
    for (const quantities of [{ spear: -1 }, { spear: 1.5 }, { spear: '1' }, { spear: 0 }, {}]) {
        assert.equal(api.validateComposition(composition(quantities), candidate()).valid, false);
    }
    assert.equal(api.validateComposition(composition({ spear: 101 }), candidate()).valid, false);
    assert.equal(plan([slot('a', 'attack', 0, { spear: 1, unused: 0 })]).valid, true);
});
test('normal night window and explicit boundary semantics', () => {
    const window = { known: true, start: 0, end: 8 * H };
    assert.equal(api.evaluateNightBonus(H, window).inside, true);
    assert.equal(api.evaluateNightBonus(9 * H, window).inside, false);
    assert.equal(api.evaluateNightBonus(8 * H, window).state, 'boundary');
    assert.equal(api.evaluateNightBonus(8 * H, window).inside, null);
    assert.equal(api.evaluateNightBonus(8 * H, { ...window, boundary: { includeEnd: false } }).inside, false);
});
test('night window crossing midnight and unknown window remain distinct', () => {
    const window = { known: true, start: 22 * H, end: 6 * H };
    assert.equal(api.evaluateNightBonus(23 * H, window).inside, true);
    assert.equal(api.evaluateNightBonus(H, window).inside, true);
    assert.equal(api.evaluateNightBonus(12 * H, window).inside, false);
    assert.equal(api.evaluateNightBonus(H, { known: false }).state, 'unknown');
    assert.equal(api.evaluateNightBonus(H, { known: true, start: 0, end: 0 }).state, 'ambiguous');
});
test('NT4 remains blocked for undefined offsets/policy and never distributes troops', () => {
    const slots = Array.from({ length: 4 }, (_, i) => slot(String(i), 'noble', null, { snob: 1 }));
    const op = { ...operation(slots), ntTemplate: 'NT4' };
    const before = JSON.stringify(op);
    const result = plan(slots, [candidate()], { operation: op });
    assert.equal(result.valid, false); assert.ok(result.blockers.includes('NT4_POLICY_PENDING'));
    assert.ok(result.blockers.includes('ARRIVAL_OFFSET_UNDEFINED')); assert.equal(JSON.stringify(op), before);
    op.slotPolicy = { nt4Confirmed: true };
    assert.equal(plan(slots, [candidate()], { operation: op }).valid, false);
    slots.forEach((s, i) => { s.arrivalOffsetMs = i * 100; });
    assert.equal(plan(slots, [candidate()], { operation: op }).valid, true);
    op.ntTemplate = 'NT5'; assert.equal(plan(slots, [candidate()], { operation: op }).valid, false);
});
test('missing source, missing server now and past send block review', () => {
    const s = slot(); delete s.source;
    assert.equal(plan([s]).valid, false);
    assert.equal(plan(undefined, undefined, { serverNowMs: undefined }).valid, false);
    assert.equal(plan(undefined, undefined, { serverNowMs: central }).valid, false);
});
test('warnings carry supplied external conflict and never change desired arrival', () => {
    const op = operation([slot()]); op.nightBonus = { known: true, start: 9 * H, end: 11 * H };
    const result = plan(undefined, undefined, { operation: op, externalConflicts: [{ sourceId: '1', missionId: 'external' }] });
    assert.equal(result.valid, true);
    assert.equal(result.missions[0].desiredArrivalMs, central - 1000);
    assert.ok(result.missions[0].warnings.some(w => w.code === 'NIGHT_BONUS_INSIDE'));
    assert.ok(result.missions[0].warnings.some(w => w.code === 'EXTERNAL_CONFLICT'));
});
test('pure calls are deterministic and leave all inputs untouched; module is singleton', () => {
    const input = { operation: operation([slot()]), candidates: [candidate()], serverNowMs: central - 8 * H };
    const before = JSON.stringify(input);
    assert.deepEqual(plain(api.validatePlan(input)), plain(api.validatePlan(input)));
    assert.equal(JSON.stringify(input), before);
    vm.runInContext(fs.readFileSync('services/tactical-operation-planner.js', 'utf8'), context);
    assert.equal(context.EAS.TacticalOperationPlanner, api);
});
test('unsafe arithmetic, ambiguous candidates and conflicting coordinates block', () => {
    assert.equal(api.calculateTiming({ centralArrivalMs: Number.MAX_SAFE_INTEGER, arrivalOffsetMs: 1, travelTimeMs: 1 }).available, false);
    assert.equal(plan([slot()], [candidate(), candidate()]).valid, false);
    const c = candidate(); c.source = { ...source, coord: '502|502' };
    assert.equal(plan([slot()], [c]).valid, false);
});
