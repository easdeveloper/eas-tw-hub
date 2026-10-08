const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const values = new Map();
const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
let world = 'br-test', playerId = 7;
const context = vm.createContext({ EAS: { World: { getWorldName: () => world, getPlayer: () => ({ id: playerId }) } },
    localStorage: storage, window: { game_data: { world: 'br-test', player: { id: 7 } } }, location: { hostname: 'br-test.tribalwars.net' },
    Date, Object, Array, Map, Set, JSON, Number, String, Math, Infinity, Error, RegExp });
for (const file of ['services/tactical-operation-planner.js', 'services/tactical-operation-controller.js', 'services/tactical-operation-drafts.js'])
    vm.runInContext(fs.readFileSync(file, 'utf8'), context);
const C = context.EAS.TacticalOperationController, Store = context.EAS.TacticalOperationDrafts;
const candidate = { source: { id: '1', coord: '500|500', name: 'Home' }, ownHome: { spear: 80, axe: 40 },
    evidence: { trusted: true, complete: true, fresh: true }, travelDurations: { spear: { trusted: true, durationMs: 1000 }, axe: { trusted: true, durationMs: 2000 } } };
const createConfiguredDraft = () => {
    let draft = C.createDraft({ id: 'operation-1', revision: 1, world, playerId: String(playerId),
        target: { coord: '484|527', playerName: 'Owner' }, centralArrivalMs: 9000, serverNowMs: 0, candidates: [candidate] });
    const slotId = draft.operation.slots[0].id;
    draft = C.setRole(draft, slotId, 'support');
    draft = C.setArrivalOffset(draft, slotId, 500);
    draft = C.useCustomComposition(draft, slotId);
    draft = C.setCustomQuantity(draft, slotId, 'spear', 30);
    return draft;
};

test('draft save/load/delete round-trips only editable operation intent', () => {
    values.clear();
    const draft = createConfiguredDraft();
    const result = Store.save(draft, { name: 'FANTASMA manhã', savedAt: 100 });
    assert.equal(result.saved, true);
    assert.equal(Store.list().length, 1);
    const record = Store.list()[0];
    assert.equal(record.schemaVersion, 1);
    assert.equal(record.name, 'FANTASMA manhã');
    assert.equal(record.target.coord, '484|527');
    assert.equal(record.target.playerName, 'Owner');
    assert.equal(record.centralArrivalMs, 9000);
    assert.deepEqual(JSON.parse(JSON.stringify(record.slots[0])), {
        sourceId: '1', sourceCoord: '500|500', sourceName: 'Home', role: 'support', arrivalOffsetMs: 500,
        compositionMode: 'custom', customQuantities: { spear: 30, axe: 0 }
    });
    for (const field of ['candidates', 'ownHome', 'evidence', 'travelDurations', 'approvedSnapshot', 'validation'])
        assert.equal(Object.hasOwn(record, field), false);
    assert.equal(Store.remove(record.draftId), true);
    assert.equal(Store.list().length, 0);
});

test('draft store is scoped by world/player and bounded by version, count, and record size', () => {
    values.clear();
    const draft = createConfiguredDraft();
    for (let index = 0; index < Store.MAX_DRAFTS + 3; index += 1)
        assert.equal(Store.save(draft, { name: `Draft ${index}`, draftId: `id-${index}`, savedAt: index + 1 }).saved, true);
    assert.equal(Store.list().length, Store.MAX_DRAFTS);
    playerId = 8;
    assert.equal(Store.list().length, 0);
    playerId = 7; world = 'br-other';
    assert.equal(Store.list().length, 0);
    world = 'br-test';
    const oversized = { ...draft, operation: { ...draft.operation, slots: Array.from({ length: Store.MAX_SLOTS }, (_, index) => ({
        ...draft.operation.slots[0], id: `huge-${index}`, source: { id: String(index + 1), coord: '500|500', name: 'x'.repeat(1000) }
    })) } };
    assert.equal(Store.save(oversized, { name: 'too big', savedAt: 500 }).reason, 'DRAFT_SIZE_LIMIT');
    const invalid = C.setCustomQuantity(draft, draft.operation.slots[0].id, 'spear', NaN);
    assert.equal(Store.save(invalid, { name: 'invalid custom', savedAt: 501 }).reason, 'DRAFT_INVALID_OR_TOO_LARGE',
        'invalid CUSTOM input is rejected rather than silently omitted from saved intent');
    assert.equal(Store.MAX_RECORD_CHARS <= 65536, true);
});

test('restoring a draft uses fresh candidates, keeps edits unconfirmed, and recomputes timing from current arrival', () => {
    const saved = Store.serialize(createConfiguredDraft(), { name: 'saved', savedAt: 100 });
    saved.centralArrivalMs = 20000;
    const freshCandidate = { ...candidate, ownHome: { spear: 50, axe: 20 },
        travelDurations: { spear: { trusted: true, durationMs: 1500 } } };
    let fresh = C.createDraft({ id: 'new-analysis', revision: 1, world, playerId: String(playerId),
        target: { coord: saved.target.coord, playerName: 'Current Owner' }, centralArrivalMs: 10000, serverNowMs: 0,
        candidates: [freshCandidate] });
    const restored = C.restoreEditableConfiguration(fresh, saved);
    assert.equal(restored.restored, true);
    assert.equal(restored.name, 'saved');
    fresh = restored.draft;
    const slot = fresh.operation.slots[0];
    assert.equal(slot.role, 'support');
    assert.equal(slot.arrivalOffsetMs, 500);
    assert.equal(slot.composition.requestedMode, 'custom');
    assert.equal(slot.composition.quantities.spear, 30);
    assert.equal(slot.composition.confirmed, false);
    assert.equal(slot.composition.evidence.materializedBy, 'review-user');
    assert.equal(fresh.operation.candidates[0].ownHome.spear, 50);
    assert.equal(fresh.operation.target.playerName, 'Current Owner');
    assert.equal(fresh.operation.centralArrivalMs, 10000, 'loaded prior time does not override current form time');
    assert.equal(fresh.reviewState, 'unreviewed');
    assert.equal(fresh.executionArtifact, null);
    assert.equal(Object.hasOwn(restored, 'approvedSnapshot'), false);
    const confirmed = C.confirmComposition(fresh, slot.id);
    const validated = C.validateDraft(confirmed);
    assert.equal(validated.missions[0].desiredArrivalMs, 10500);
    assert.equal(validated.missions[0].travelTimeMs, 1500);
    assert.equal(validated.missions[0].sendAtMs, 9000);
});

test('FULL restore preserves intent but rebuilds quantities from fresh trusted availability', () => {
    let draft = createConfiguredDraft();
    const slotId = draft.operation.slots[0].id;
    draft = C.materializeFull(C.setRole(draft, slotId, 'attack'), slotId, { spear: 80 });
    const saved = Store.serialize(draft, { name: 'full', savedAt: 100 });
    assert.equal(saved.slots[0].compositionMode, 'full');
    assert.equal(saved.slots[0].customQuantities, null);
    const changedCandidate = { ...candidate, ownHome: { spear: 12, axe: 8 } };
    const fresh = C.createDraft({ id: 'fresh', revision: 1, world, playerId: '7', target: { coord: saved.target.coord },
        centralArrivalMs: 10000, serverNowMs: 0, candidates: [changedCandidate] });
    const restored = C.restoreEditableConfiguration(fresh, saved).draft;
    assert.deepEqual(JSON.parse(JSON.stringify(restored.operation.slots[0].composition.quantities)), { spear: 12, axe: 8 });
    assert.equal(restored.operation.slots[0].composition.confirmed, false);
});