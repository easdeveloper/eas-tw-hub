// Phase 3 review-only controller. It owns draft state only; the planner remains authoritative.
(() => {
    'use strict';
    if (EAS.TacticalOperationController) return;

    const copy = value => Array.isArray(value) ? value.map(copy) : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) : value;
    const integer = Number.isSafeInteger;
    const identity = value => typeof value === 'string' && value.trim() ? value.trim() : integer(value) && value > 0 ? String(value) : null;
    const activeRoles = new Set(['attack', 'support', 'nt2', 'nt3', 'nt4', 'nt5']);
    const isTrain = role => EAS.TacticalOperationPlanner.nobleTrainSize(role) !== null;
    const candidateMatchesFilter = (candidate, filter) => {
        if (!candidate?.evidence?.trusted || !candidate?.evidence?.complete || !candidate?.evidence?.fresh) return filter === 'ALL' || filter === 'SELECTED';
        const troops = candidate?.ownHome || {};
        if (filter === 'OFFENSIVE') return ['axe', 'light', 'marcher', 'ram', 'catapult'].some(unit => integer(troops[unit]) && troops[unit] > 0);
        if (filter === 'DEFENSIVE') return ['spear', 'sword', 'archer', 'heavy'].some(unit => integer(troops[unit]) && troops[unit] > 0);
        if (filter === 'HAS_NOBLE') return integer(troops.snob) && troops.snob > 0;
        return true;
    };
    const cloneDraft = value => copy(value);
    const makeSlot = (candidate, index, role = 'unused') => {
        const source = candidate?.source || {};
        return {
            id: `${identity(source.id) || 'source'}-${index + 1}`,
            role,
            groupIndex: index + 1,
            arrivalOffsetMs: 0,
            source: { id: identity(source.id), coord: source.coord || null, name: source.name || null },
            compositionRef: null,
            composition: {
                requestedMode: 'custom',
                quantities: {},
                confirmed: false,
                evidence: { mode: 'draft', materializedBy: 'review-user' },
                limitingUnits: []
            },
            status: 'draft',
            validation: null
        };
    };
    const createDraft = (input = {}) => {
        const candidates = Array.isArray(input.candidates) ? input.candidates : [];
        const slots = candidates.map((candidate, index) => makeSlot(candidate, index, 'unused'));
        const operation = {
            id: identity(input.id) || `operation-${Date.now()}`,
            revision: integer(input.revision) && input.revision >= 0 ? input.revision : 0,
            world: input.world || null,
            playerId: identity(input.playerId),
            target: copy(input.target || {}),
            nightBonus: copy(input.nightBonus || null),
            centralArrivalMs: input.centralArrivalMs,
            candidates: copy(candidates),
            ntTemplate: input.ntTemplate || null,
            slotPolicy: copy(input.slotPolicy || {}),
            reviewState: 'unreviewed',
            slots,
            serverNowMs: input.serverNowMs,
            analysisId: input.analysisId || null
        };
        return { operation, revision: operation.revision, filter: 'ALL', reviewState: 'unreviewed', executionArtifact: null, draft: true };
    };
    const updateSlot = (draft, slotId, updater) => {
        const operation = cloneDraft(draft.operation);
        const slot = operation.slots.find(item => item.id === slotId);
        if (!slot) return draft;
        if (updater(slot) === false) return draft;
        operation.revision += 1;
        operation.reviewState = 'unreviewed';
        return { ...cloneDraft(draft), operation, revision: operation.revision, reviewState: 'unreviewed', approvedAt: null };
    };
    const materializeFull = (draft, slotId, quantities) => updateSlot(draft, slotId, slot => {
        if (isTrain(slot.role)) return false;
        slot.composition = {
            requestedMode: 'full', quantities: copy(quantities || {}), confirmed: false,
            evidence: { mode: 'full', materializedBy: 'review-user', materializedAt: Date.now() },
            limitingUnits: []
        };
        slot.status = 'materialized';
    });
    const useCustomComposition = (draft, slotId) => updateSlot(draft, slotId, slot => {
        if (isTrain(slot.role)) return false;
        const candidate = draft.operation.candidates.find(item => identity(item.source?.id) === identity(slot.source?.id));
        const known = candidate?.evidence?.trusted === true && candidate.evidence.complete === true && candidate.evidence.fresh === true;
        const quantities = known && !Object.keys(slot.composition?.quantities || {}).length
            ? Object.fromEntries(Object.keys(candidate.ownHome || {}).map(unit => [unit, 0])) : copy(slot.composition?.quantities || {});
        slot.composition = {
            requestedMode: 'custom', quantities, confirmed: false,
            evidence: { mode: 'custom', materializedBy: 'review-user' }, limitingUnits: []
        };
        slot.status = 'customized';
    });
    const setCustomQuantity = (draft, slotId, unit, quantity) => updateSlot(draft, slotId, slot => {
        if (isTrain(slot.role)) return false;
        if (!slot.composition || slot.composition.requestedMode !== 'custom') slot.composition = { requestedMode: 'custom', quantities: {}, confirmed: false, evidence: { mode: 'custom', materializedBy: 'review-user' }, limitingUnits: [] };
        slot.composition.quantities = { ...slot.composition.quantities, [unit]: quantity };
        slot.composition.confirmed = false;
        slot.composition.evidence = { ...slot.composition.evidence, mode: 'custom', materializedBy: 'review-user' };
        slot.status = 'customized';
    });
    const setRole = (draft, slotId, role) => {
        if (!['unused', ...activeRoles].includes(role)) return draft;
        const updated = updateSlot(draft, slotId, slot => {
            if (isTrain(role) || isTrain(slot.role)) slot.composition = { requestedMode: 'custom', quantities: {}, confirmed: false, evidence: null, limitingUnits: [] };
            slot.role = role;
            slot.status = role === 'unused' ? 'unused' : 'edited';
        });
        if (updated === draft) return draft;
        return updated;
    };
    const setArrivalOffset = (draft, slotId, arrivalOffsetMs) => updateSlot(draft, slotId, slot => { slot.arrivalOffsetMs = arrivalOffsetMs; slot.status = 'edited'; });
    const setFilter = (draft, filter) => ({ ...cloneDraft(draft), filter });
    const confirmComposition = (draft, slotId) => updateSlot(draft, slotId, slot => {
        if (isTrain(slot.role)) return false;
        slot.composition.confirmed = true;
        slot.status = 'confirmed';
    });
    const approveReview = draft => {
        if (!validateDraft(draft).valid) return draft;
        return { ...cloneDraft(draft), reviewState: 'approved', executionArtifact: null, approvedAt: Date.now() };
    };
    const addSlot = (draft, slot) => {
        const operation = cloneDraft(draft.operation);
        operation.slots.push(copy(slot));
        operation.revision += 1;
        operation.reviewState = 'unreviewed';
        return { ...cloneDraft(draft), operation, revision: operation.revision, reviewState: 'unreviewed', approvedAt: null };
    };
    const validateDraft = draft => {
        const operation = cloneDraft(draft.operation);
        const planner = EAS.TacticalOperationPlanner;
        if (!planner?.validatePlan) throw new Error('TacticalOperationPlanner unavailable');
        const candidates = operation.candidates || [];
        const selectedSlots = operation.slots.filter(slot => slot.role !== 'unused');
        const planningOperation = { ...operation, ntTemplate: null, slotPolicy: {}, slots: selectedSlots };
        let result;
        if (selectedSlots.length) {
            result = planner.validatePlan({ operation: planningOperation, candidates, serverNowMs: operation.serverNowMs });
        } else {
            const normalizedOperation = planner.normalizeOperation({ ...operation, slots: [] });
            result = { operation: normalizedOperation, balances: [], missions: [], blockers: [], valid: true };
        }
        const allocatedBySource = new Map(result.balances.map(balance => [String(balance.sourceId), balance]));
        const balances = candidates.map(candidate => {
            const sourceId = identity(candidate.source?.id);
            const allocated = allocatedBySource.get(String(sourceId));
            if (allocated) return allocated;
            const trusted = candidate.evidence?.trusted === true && candidate.evidence?.complete === true && candidate.evidence?.fresh === true;
            const available = {}, remaining = {}, overAllocated = {}, units = new Set(Object.keys(candidate.ownHome || {}));
            for (const unit of units) {
                const count = candidate.ownHome[unit];
                const known = trusted && integer(count) && count >= 0;
                Object.defineProperty(available, unit, { value: known ? count : null, enumerable: true });
                Object.defineProperty(remaining, unit, { value: known ? count : null, enumerable: true });
                Object.defineProperty(overAllocated, unit, { value: known ? 0 : null, enumerable: true });
            }
            return { sourceId, available, allocated: {}, remaining, overAllocated, unknown: !trusted || Object.values(available).some(value => value === null) };
        });
        const visibleSlots = draft.filter === 'SELECTED'
            ? operation.slots.filter(slot => slot.role !== 'unused')
            : operation.slots.filter(slot => {
                const candidate = candidates.find(item => identity(item.source?.id) === identity(slot.source?.id));
                return candidateMatchesFilter(candidate, draft.filter);
            });
        const visibleIds = new Set(visibleSlots.map(slot => slot.id));
        const blockedCount = new Set(result.missions.filter(mission => mission.validationStatus === 'blocked').map(mission => mission.parentSlotId || mission.slotId)).size;
        return {
            ...result,
            operation,
            balances,
            missions: result.missions.filter(mission => visibleIds.has(mission.parentSlotId || mission.slotId)),
            visibleSlotIds: [...visibleIds],
            analyzedCount: candidates.length,
            selectedCount: selectedSlots.length,
            blockedCount,
            reviewState: draft.reviewState || 'unreviewed',
            executionArtifact: null,
            revision: draft.revision,
            filter: draft.filter
        };
    };
    const api = Object.freeze({ createDraft, materializeFull, useCustomComposition, setCustomQuantity, setRole, setArrivalOffset, setFilter, confirmComposition, approveReview, addSlot, validateDraft, cloneDraft });
    EAS.TacticalOperationController = api;
})();
