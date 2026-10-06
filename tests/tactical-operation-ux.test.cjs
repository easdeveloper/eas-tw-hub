const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
for (const role of ['attack', 'support']) test(`${role}: direct CUSTOM uses candidate availability without FULL or data access`, () => {
    const context = vm.createContext({ EAS: {} });
    for (const file of ['planner', 'controller']) vm.runInContext(fs.readFileSync(`services/tactical-operation-${file}.js`, 'utf8'), context);
    const C = context.EAS.TacticalOperationController;
    const candidate = { source: { id: '1', coord: '500|500' }, ownHome: { axe: 5815, light: 3111, snob: 1 }, evidence: { trusted: true, complete: true, fresh: true }, travelDurations: { axe: { trusted: true, durationMs: 1000 } } };
    let d = C.createDraft({ id: 'op', revision: 0, target: { coord: '484|527' }, centralArrivalMs: 10000, serverNowMs: 0, candidates: [candidate] });
    const id = d.operation.slots[0].id; d = C.useCustomComposition(C.setRole(d, id, role), id);
    assert.equal(Object.keys(d.operation.slots[0].composition.quantities).length, 3);
    assert.ok(Object.values(d.operation.slots[0].composition.quantities).every(n => n === 0));
    assert.equal(C.validateDraft(d).valid, false);
    d = C.confirmComposition(C.setCustomQuantity(d, id, 'axe', 150), id);
    const r = C.validateDraft(d); assert.equal(r.valid, true); assert.equal(r.balances[0].allocated.axe, 150); assert.equal(r.missions[0].sendAtMs, 9000);
    assert.equal(candidate.ownHome.axe, 5815);
});
