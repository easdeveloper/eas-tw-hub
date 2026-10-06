const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({ EAS: {} });
for (const file of ['planner', 'controller']) vm.runInContext(fs.readFileSync(`services/tactical-operation-${file}.js`, 'utf8'), context);
const P = context.EAS.TacticalOperationPlanner, C = context.EAS.TacticalOperationController;
const plain = v => JSON.parse(JSON.stringify(v));
function candidate(troops = {}) {
    return { source: { id: '1', coord: '509|493' }, ownHome: { axe: 6424, light: 3119, ram: 120, catapult: 50, knight: 1, snob: 5, spear: 2000, ...troops },
        evidence: { trusted: true, complete: true, fresh: true },
        travelDurations: Object.fromEntries(Object.entries({ axe: 1000, light: 900, ram: 7000, catapult: 8000, knight: 800, snob: 5000, spear: 1000 }).map(([unit, durationMs]) => [unit, { trusted: true, durationMs }])) };
}
const slot = (n = 4, offset = 0) => ({ id: 'train', role: `nt${n}`, source: { id: '1', coord: '509|493' }, arrivalOffsetMs: offset });
function plan(n = 4, c = candidate(), offset = 0, extra = []) {
    return P.validatePlan({ operation: { id: 'op', revision: 1, target: { coord: '484|527' }, centralArrivalMs: 100000, slots: [slot(n, offset), ...extra] }, candidates: [c], serverNowMs: 1000 });
}
for (const n of [2, 3, 4, 5]) test(`NT(${n}) conserves escorts, sequence and nobles with one generic policy`, () => {
    const c = candidate(), before = JSON.stringify(c), r = plan(n, c, -500);
    assert.equal(r.valid, true); assert.equal(r.missions.length, n);
    const commands = r.missions.slice().sort((a, b) => a.trainIndex - b.trainIndex);
    for (const [i, m] of commands.entries()) {
        assert.equal(m.composition.quantities.snob, 1); assert.equal(m.commandType, 'attack');
        assert.equal(m.desiredArrivalMs, 99500 + i * 100);
        for (const unit of ['axe', 'light']) assert.equal(m.composition.quantities[unit], Math.floor(c.ownHome[unit] / n) + (i < c.ownHome[unit] % n ? 1 : 0));
        for (const unit of ['ram', 'catapult', 'knight']) assert.equal(m.composition.quantities[unit] || 0, i === 0 ? c.ownHome[unit] : 0);
        assert.equal(m.composition.quantities.spear, undefined);
    }
    assert.equal(r.balances[0].allocated.axe, 6424); assert.equal(r.balances[0].allocated.light, 3119);
    assert.equal(r.balances[0].remaining.snob, 5 - n); assert.equal(r.balances[0].allocated.spear, undefined);
    assert.equal(r.balances[0].remaining.spear, 2000); assert.equal(JSON.stringify(c), before);
});
test('exact BR143-style NT4 composition and timing per command', () => {
    const r = plan();
    assert.deepEqual(plain(r.missions.map(m => m.composition.quantities)), [
        { snob: 1, axe: 1606, light: 780, ram: 120, catapult: 50, knight: 1 },
        { snob: 1, axe: 1606, light: 780 }, { snob: 1, axe: 1606, light: 780 }, { snob: 1, axe: 1606, light: 779 }
    ]);
    assert.deepEqual(plain(r.missions.map(m => m.travelTimeMs)), [8000, 5000, 5000, 5000]);
    assert.deepEqual(plain(r.missions[0].limitingUnits), ['catapult']);
    assert.deepEqual(plain(r.missions[1].limitingUnits), ['snob']);
});
test('optional siege and knight missing or zero do not require timing or block', () => {
    for (const value of [undefined, 0]) {
        const c = candidate({ ram: value, catapult: value, knight: value });
        if (value === undefined) for (const u of ['ram', 'catapult', 'knight']) delete c.ownHome[u];
        for (const u of ['ram', 'catapult', 'knight']) delete c.travelDurations[u];
        assert.equal(plan(4, c).valid, true);
    }
});
for (const n of [2, 3, 4, 5]) test(`NT${n} exact minimum passes, one below each minimum blocks without downgrade`, () => {
    assert.equal(plan(n, candidate({ axe: 150 * n, light: 150 * n, snob: n })).valid, true);
    for (const [unit, code] of [['axe', 'INSUFFICIENT_AXE_ESCORT'], ['light', 'INSUFFICIENT_LIGHT_ESCORT'], ['snob', 'INSUFFICIENT_NOBLES']]) {
        const c = candidate({ axe: 150 * n, light: 150 * n, snob: n }); c.ownHome[unit]--;
        const r = plan(n, c); assert.equal(r.valid, false); assert.equal(r.missions.length, n); assert.ok(r.blockers.includes(code));
        assert.ok(r.missions.every(m => m.validationStatus === 'blocked'));
    }
});
test('untrusted troops, unknown escorts, missing timing and offsets stay blocked', () => {
    const c = candidate(); c.evidence.trusted = false; assert.equal(plan(4, c).valid, false);
    assert.equal(plan(4, candidate({ axe: undefined })).valid, false);
    const missing = candidate(); delete missing.travelDurations.snob; assert.equal(plan(4, missing).valid, false);
    assert.equal(plan(4, candidate(), null).valid, false);
    assert.equal(P.buildNobleTrain({ slot: slot(1), candidate: candidate(), count: 1 }).valid, false);
    assert.equal(plan(1).valid, false);
});
test('aggregate conflict with another selected command remains fail-closed; send ordering independent of role', () => {
    const attack = { id: 'attack', role: 'support', source: slot().source, arrivalOffsetMs: -200, composition: { requestedMode: 'custom', quantities: { axe: 1 }, confirmed: true } };
    const r = plan(4, candidate(), 0, [attack]); assert.ok(r.blockers.includes('OVER_ALLOCATION'));
    assert.equal(r.balances[0].allocated.axe, 6425);
    assert.ok(r.missions.every((m, i, all) => !i || all[i - 1].sendAtMs <= m.sendAtMs));
});
test('controller auto-generates train, prevents edits, filters by parent and resets custom on role switch', () => {
    let d = C.createDraft({ id: 'op', revision: 1, candidates: [candidate()], centralArrivalMs: 100000, serverNowMs: 0, target: { coord: '484|527' } });
    const id = d.operation.slots[0].id; d = C.setRole(d, id, 'nt4');
    assert.equal(C.validateDraft(d).missions.length, 4); assert.equal(C.validateDraft(d).valid, true);
    const before = JSON.stringify(C.validateDraft(d).missions);
    for (const edit of [x => C.setCustomQuantity(x, id, 'snob', 99), x => C.materializeFull(x, id, { snob: 99 }), x => C.useCustomComposition(x, id), x => C.confirmComposition(x, id)]) {
        assert.equal(JSON.stringify(C.validateDraft(edit(d)).missions), before);
    }
    assert.equal(C.validateDraft(C.setFilter(d, 'SELECTED')).missions.length, 4);
    assert.equal(C.validateDraft(C.setRole(d, id, 'unused')).missions.length, 0);
    const attack = C.setRole(d, id, 'attack'); assert.equal(attack.operation.slots[0].composition.confirmed, false);
    assert.equal(C.validateDraft(attack).valid, false);
    assert.equal(C.setRole(d, id, 'noble_train_manual'), d); assert.equal(C.addManualNobleSlot, undefined);
});
