const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = vm.createContext({ EAS: {}, Date, Object, Array, Map, Set, JSON, Number, String, Math, Infinity, Error });
vm.runInContext(fs.readFileSync('services/tactical-operation-planner.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('services/tactical-operation-controller.js', 'utf8'), context);
const api = context.EAS.TacticalOperationController;
const activeDraft = (draft, role = 'attack') => api.setRole(draft, draft.operation.slots[0].id, role);
const source = { id: '1', coord: '500|500', name: 'A' };
const target = { villageId: '9', coord: '501|501', name: 'T' };
const units = ['spear', 'ram', 'snob'];
const candidate = {
    source,
    ownHome: { spear: 100, ram: 20, snob: 4 },
    evidence: { trusted: true, complete: true, fresh: true },
    travelDurations: {
        spear: { durationMs: 1000, trusted: true },
        ram: { durationMs: 3000, trusted: true },
        snob: { durationMs: 4000, trusted: true }
    },
    eligibility: 'eligible',
    blockingReasons: []
};
const base = {
    target,
    serverNowMs: 10_000,
    centralArrivalMs: 20_000,
    nightBonus: { known: true, start: 0, end: 8 * 60 * 60 * 1000, boundary: { includeStart: true, includeEnd: false } },
    candidates: [candidate],
    unitOrder: units
};

test('FULL materializes a frozen explicit composition and requires confirmation', () => {
    const isolatedCandidate = { ...candidate, ownHome: { ...candidate.ownHome }, travelDurations: { ...candidate.travelDurations } };
    const draft = activeDraft(api.createDraft({ ...base, candidates: [isolatedCandidate] }));
    const slotId = draft.operation.slots[0].id;
    const materialized = api.materializeFull(draft, slotId, { spear: 40, ram: 5 });
    assert.notEqual(materialized, draft);
    assert.notEqual(materialized.operation, draft.operation);
    assert.equal(materialized.operation.revision, draft.operation.revision + 1);
    assert.equal(materialized.operation.slots[0].composition.requestedMode, 'full');
    assert.equal(materialized.operation.slots[0].composition.confirmed, false);
    assert.deepEqual(materialized.operation.slots[0].composition.quantities, { spear: 40, ram: 5 });
    isolatedCandidate.ownHome.spear = 1;
    assert.equal(materialized.operation.slots[0].composition.quantities.spear, 40);
    const confirmed = api.confirmComposition(materialized, slotId);
    assert.equal(confirmed.operation.slots[0].composition.confirmed, true);
    assert.equal(api.validateDraft(confirmed).valid, true);
});

test('CUSTOM validates integer, nonnegative, available, and duration requirements', () => {
    const draft = activeDraft(api.createDraft({ ...base, candidates: [{ ...candidate, ownHome: { ...candidate.ownHome } }] }));
    const slotId = draft.operation.slots[0].id;
    const customEdit = api.setCustomQuantity(draft, slotId, 'spear', 10);
    assert.equal(api.validateDraft(customEdit).valid, false);
    const custom = api.confirmComposition(customEdit, slotId);
    assert.equal(api.validateDraft(custom).valid, true);
    for (const value of [-1, 1.5, '2', 101]) {
        const invalid = api.setCustomQuantity(draft, slotId, 'spear', value);
        assert.equal(api.validateDraft(invalid).valid, false);
    }
    const empty = api.setCustomQuantity(draft, slotId, 'spear', 0);
    assert.equal(api.validateDraft(empty).valid, false);
    const missingDuration = { ...candidate, travelDurations: { ...candidate.travelDurations, spear: { durationMs: 1000, trusted: false } } };
    const incomplete = activeDraft(api.createDraft({ ...base, candidates: [missingDuration] }));
    assert.equal(api.validateDraft(incomplete).valid, false);
});

test('real SUPPORT CUSTOM heavy-only composition accepts numeric zero for every unused unit', () => {
    const realUnits = ['spear', 'sword', 'axe', 'archer', 'spy', 'light', 'marcher', 'heavy', 'ram', 'catapult', 'knight', 'snob', 'militia'];
    const quantities = Object.fromEntries(realUnits.map(unit => [unit, unit === 'heavy' ? 159 : 0]));
    const realCandidate = {
        source: { id: '75186', coord: '510|491', name: 'Source' },
        ownHome: Object.fromEntries(realUnits.map(unit => [unit, unit === 'heavy' ? 200 : 0])),
        evidence: { trusted: true, complete: true, fresh: true },
        travelDurations: { heavy: { durationMs: 102_347_000, trusted: true } },
        eligibility: 'eligible', blockingReasons: []
    };
    const draft = api.createDraft({ ...base, candidates: [realCandidate] });
    const slotId = draft.operation.slots[0].id;
    let selected = api.setRole(draft, slotId, 'support');
    for (const unit of realUnits) selected = api.setCustomQuantity(selected, slotId, unit, quantities[unit]);
    const confirmed = api.confirmComposition(selected, slotId);
    const result = api.validateDraft(confirmed);
    const mission = result.missions[0];
    assert.equal(confirmed.operation.slots[0].composition.requestedMode, 'custom');
    assert.equal(confirmed.operation.slots[0].composition.confirmed, true);
    assert.deepEqual(confirmed.operation.slots[0].composition.quantities, quantities);
    assert.ok(Object.values(confirmed.operation.slots[0].composition.quantities).every(Number.isSafeInteger));
    assert.equal(mission.blockers.includes('INVALID_QUANTITY'), false);
    assert.equal(mission.blockers.includes('COMPOSITION_UNCONFIRMED'), false);
    assert.equal(mission.travelTimeMs, 102_347_000);
    assert.equal(mission.sendAtMs, 20_000 - 102_347_000);
});

test('blank editor value is stored as zero; invalid and cleared values preserve intended validation', () => {
    const draft = activeDraft(api.createDraft(base), 'support');
    const slotId = draft.operation.slots[0].id;
    const blankAsZero = api.setCustomQuantity(draft, slotId, 'spear', 0);
    assert.equal(blankAsZero.operation.slots[0].composition.quantities.spear, 0);
    const positive = api.setCustomQuantity(blankAsZero, slotId, 'heavy', 159);
    assert.equal(positive.operation.slots[0].composition.quantities.heavy, 159);
    for (const invalidValue of [-1, 1.5, NaN, '159', null]) {
        const invalid = api.setCustomQuantity(positive, slotId, 'heavy', invalidValue);
        assert.ok(api.validateDraft(invalid).missions[0].blockers.includes('INVALID_QUANTITY'));
    }
    const populated = api.setCustomQuantity(positive, slotId, 'heavy', 159);
    const clearedToBlank = api.setCustomQuantity(populated, slotId, 'heavy', 0);
    assert.equal(clearedToBlank.operation.slots[0].composition.quantities.heavy, 0);
    assert.ok(api.validateDraft(api.confirmComposition(clearedToBlank, slotId)).missions[0].blockers.includes('EMPTY_COMPOSITION'));
});

test('quantity syntax, positive-composition, availability and confirmation blockers stay distinct', () => {
    const zeroValues = { spear: 0, heavy: 159 };
    const selectedDraft = () => activeDraft(api.createDraft(base), 'support');
    const withQuantities = quantities => {
        let draft = selectedDraft();
        for (const [unit, value] of Object.entries(quantities)) draft = api.setCustomQuantity(draft, draft.operation.slots[0].id, unit, value);
        return draft;
    };
    const validUnconfirmed = withQuantities(zeroValues);
    assert.ok(api.validateDraft(validUnconfirmed).missions[0].blockers.includes('COMPOSITION_UNCONFIRMED'));
    for (const invalidValue of [-1, 1.5, 'invalid', null, NaN, Number.MAX_SAFE_INTEGER + 1]) {
        const invalid = api.validateDraft(withQuantities({ spear: 0, heavy: invalidValue }));
        assert.ok(invalid.missions[0].blockers.includes('INVALID_QUANTITY'));
    }
    const empty = api.validateDraft(withQuantities({ spear: 0, heavy: 0 }));
    assert.ok(empty.missions[0].blockers.includes('EMPTY_COMPOSITION'));
    const tooManyDraft = withQuantities({ spear: 101 });
    const tooMany = api.validateDraft(api.confirmComposition(tooManyDraft, tooManyDraft.operation.slots[0].id));
    assert.ok(tooMany.missions[0].blockers.includes('INSUFFICIENT_TROOPS:spear'));
    assert.equal(tooMany.missions[0].blockers.includes('INVALID_QUANTITY'), false);
});

test('switching from FULL to CUSTOM resets confirmation without changing source data', () => {
    const draft = activeDraft(api.createDraft(base));
    const slotId = draft.operation.slots[0].id;
    const full = api.confirmComposition(api.materializeFull(draft, slotId, { spear: 10 }), slotId);
    const custom = api.useCustomComposition(full, slotId);
    assert.equal(custom.operation.slots[0].composition.requestedMode, 'custom');
    assert.equal(custom.operation.slots[0].composition.confirmed, false);
    assert.deepEqual(custom.operation.slots[0].composition.quantities, { spear: 10 });
    assert.equal(full.operation.slots[0].composition.requestedMode, 'full');
});

test('slowest selected unit determines duration and send is arrival minus duration', () => {
    const draft = activeDraft(api.createDraft(base));
    const slotId = draft.operation.slots[0].id;
    const custom = api.setCustomQuantity(draft, slotId, 'spear', 10);
    const withRam = api.setCustomQuantity(custom, slotId, 'ram', 1);
    const validated = api.validateDraft(withRam);
    assert.equal(validated.missions[0].travelTimeMs, 3000);
    assert.equal(validated.missions[0].sendAtMs, 17_000);
    assert.equal(validated.missions[0].desiredArrivalMs, 20_000);
});

test('milliseconds are preserved through normalize and timing', () => {
    const draft = activeDraft(api.createDraft({ ...base, centralArrivalMs: 20_001, serverNowMs: 10_002 }));
    const custom = api.setCustomQuantity(draft, draft.operation.slots[0].id, 'spear', 1);
    const result = api.validateDraft(custom);
    assert.equal(result.missions[0].desiredArrivalMs, 20_001);
    assert.equal(result.missions[0].sendAtMs, 19_001);
});

test('aggregate same-source allocation and overcommit are derived and fail closed', () => {
    const draft = api.createDraft(base);
    const slotId = draft.operation.slots[0].id;
    const multiSlot = activeDraft(api.createDraft({ ...base, candidates: [{ ...candidate, ownHome: { ...candidate.ownHome }, travelDurations: { ...candidate.travelDurations } }] }));
    const firstSlotId = multiSlot.operation.slots[0].id;
    const second = api.addSlot(multiSlot, {
        id: '1-2', role: 'attack', groupIndex: 2, arrivalOffsetMs: 0,
        source: candidate.source, compositionRef: null,
        composition: { requestedMode: 'custom', quantities: { ram: 60 }, confirmed: true, evidence: {}, limitingUnits: [] },
        status: 'confirmed', validation: null
    });
    const first = api.setCustomQuantity(multiSlot, firstSlotId, 'spear', 60);
    const firstConfirmed = api.confirmComposition(first, firstSlotId);
    const secondConfirmed = api.confirmComposition(second, second.id);
    const aggregate = { ...firstConfirmed, operation: { ...firstConfirmed.operation, slots: [firstConfirmed.operation.slots[0], secondConfirmed.operation.slots[1]] } };
    const result = api.validateDraft(aggregate);
    assert.equal(result.balances[0].allocated.spear, 60);
    assert.equal(result.balances[0].remaining.spear, 40);
    assert.equal(result.balances[0].overAllocated.spear, 0);
    const over = api.setCustomQuantity(aggregate, firstSlotId, 'spear', 100);
    const blocked = api.validateDraft(over);
    assert.equal(blocked.balances[0].overAllocated.ram, 40);
    assert.ok(blocked.missions[0].blockers.includes('OVER_ALLOCATION'));
});

test('untrusted and partial candidates remain visible but cannot be review-ready', () => {
    const partial = { ...candidate, evidence: { ...candidate.evidence, trusted: false } };
    const draft = activeDraft(api.createDraft({ ...base, candidates: [partial] }));
    const result = api.validateDraft(draft);
    assert.equal(result.valid, false);
    assert.ok(result.missions[0].blockers.includes('AVAILABILITY_UNTRUSTED_OR_INCOMPLETE'));
    assert.equal(result.missions[0].validationStatus, 'blocked');
});

test('review sorting is by send timestamp and filters do not mutate roles', () => {
    const draft = activeDraft(api.createDraft({ ...base, candidates: [candidate] }));
    const slotId = draft.operation.slots[0].id;
    const first = api.setCustomQuantity(draft, slotId, 'spear', 1);
    const second = api.setRole(first, slotId, 'support');
    const third = second;
    const result = api.validateDraft(third);
    assert.equal(result.missions[0].role, 'support');
    assert.equal(result.missions[0].sendAtMs, 19_000);
    assert.equal(api.setFilter(draft, 'OFFENSIVE').operation.slots[0].role, 'attack');
});

test('approval is a review marker with zero side effects', () => {
    const draft = activeDraft(api.createDraft(base));
    const edited = api.setCustomQuantity(draft, draft.operation.slots[0].id, 'spear', 1);
    const confirmed = api.confirmComposition(edited, draft.operation.slots[0].id);
    const approved = api.approveReview(confirmed);
    assert.equal(approved.reviewState, 'approved');
    assert.equal(approved.executionArtifact, null);
    assert.equal(api.validateDraft(approved).valid, true);
    assert.equal(api.approveReview({ ...approved, reviewState: 'approved' }).reviewState, 'approved');
    assert.equal(api.approveReview(draft), draft);
});


test('fresh candidates are UNUSED and do not require composition, allocation, or timing', () => {
    const draft = api.createDraft(base);
    const result = api.validateDraft(draft);
    assert.equal(draft.operation.slots[0].role, 'unused');
    assert.equal(result.valid, true);
    assert.equal(result.analyzedCount, 1);
    assert.equal(result.selectedCount, 0);
    assert.equal(result.blockedCount, 0);
    assert.equal(result.missions.length, 0);
    assert.equal(Object.keys(result.balances[0].allocated).length, 0);
    assert.equal(result.balances[0].remaining.spear, 100);
});

test('ATTACK and SUPPORT activate validation; returning to UNUSED releases allocation', () => {
    const draft = api.createDraft(base);
    const slotId = draft.operation.slots[0].id;
    const attack = api.setRole(draft, slotId, 'attack');
    const attackResult = api.validateDraft(attack);
    assert.equal(attackResult.selectedCount, 1);
    assert.equal(attackResult.blockedCount, 1);
    assert.ok(attackResult.missions[0].blockers.includes('EMPTY_COMPOSITION'));
    const support = api.setRole(attack, slotId, 'support');
    assert.equal(api.validateDraft(support).missions[0].role, 'support');
    const composed = api.confirmComposition(api.setCustomQuantity(support, slotId, 'spear', 50), slotId);
    assert.equal(api.validateDraft(composed).balances[0].allocated.spear, 50);
    const unused = api.setRole(composed, slotId, 'unused');
    const unusedResult = api.validateDraft(unused);
    assert.equal(unusedResult.selectedCount, 0);
    assert.equal(unusedResult.blockedCount, 0);
    assert.equal(Object.keys(unusedResult.balances[0].allocated).length, 0);
    assert.equal(unusedResult.balances[0].remaining.spear, 100);
});


test('ATTACK and SUPPORT without a noble command ignore unresolved NT4 policy', () => {
    for (const role of ['attack', 'support']) {
        const draft = api.createDraft({ ...base, ntTemplate: 'NT4', slotPolicy: { nt4Confirmed: false } });
        const slotId = draft.operation.slots[0].id;
        const selected = api.setRole(draft, slotId, role);
        const composed = api.confirmComposition(api.setCustomQuantity(selected, slotId, 'spear', 10), slotId);
        const result = api.validateDraft(composed);
        assert.equal(result.valid, true);
        assert.equal(result.blockedCount, 0);
        assert.equal(result.blockers.includes('NT4_POLICY_PENDING'), false);
        assert.equal(result.missions[0].blockers.includes('NT4_POLICY_PENDING'), false);
    }
});



test('filters preserve role and composition; SELECTED contains only active slots', () => {
    const draft = api.createDraft({ ...base, candidates: [candidate, { ...candidate, source: { id: '2', coord: '499|499', name: 'B' } }] });
    const selected = api.setRole(draft, draft.operation.slots[0].id, 'attack');
    const custom = api.setCustomQuantity(selected, draft.operation.slots[0].id, 'spear', 10);
    const filtered = api.setFilter(custom, 'SELECTED');
    const result = api.validateDraft(filtered);
    assert.equal(result.analyzedCount, 2);
    assert.equal(result.selectedCount, 1);
    assert.equal(result.missions.length, 1);
    assert.equal(filtered.operation.slots[0].composition.quantities.spear, 10);
    assert.equal(filtered.operation.slots[1].role, 'unused');
});

test('evidence filters use trusted available troop metrics without mutating the draft', () => {
    const candidates = [
        { ...candidate, source: { id: '1', coord: '500|500', name: 'A' }, ownHome: { axe: 2 } },
        { ...candidate, source: { id: '2', coord: '499|499', name: 'B' }, ownHome: { spear: 3, sword: 4 } }
    ];
    const draft = api.createDraft({ ...base, candidates });
    const offensive = api.validateDraft(api.setFilter(draft, 'OFFENSIVE'));
    assert.deepEqual(Array.from(offensive.visibleSlotIds), ['1-1']);
    const defensive = api.validateDraft(api.setFilter(draft, 'DEFENSIVE'));
    assert.deepEqual(Array.from(defensive.visibleSlotIds), ['2-2']);
    assert.ok(draft.operation.slots.every(slot => slot.role === 'unused'));
});
