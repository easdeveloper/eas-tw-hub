// Pure planning domain. No reads from game state and no execution authority.
(() => {
    'use strict';
    if (EAS.TacticalOperationPlanner) return;
    const DAY = 86400000;
    const copy = value => Array.isArray(value) ? value.map(copy) : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) : value;
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const integer = Number.isSafeInteger;
    const identity = value => typeof value === 'string' && value.trim() ? value.trim() : integer(value) && value > 0 ? String(value) : null;
    const coord = value => {
        const match = /^(\d{1,3})\|(\d{1,3})$/.exec(String(value ?? '').trim());
        return match ? `${Number(match[1])}|${Number(match[2])}` : null;
    };
    const normalizeSource = (value = {}) => ({ id: identity(value?.id ?? value?.villageId),
        coord: coord(value?.coord ?? value?.coordinate), name: value?.name ?? null });
    const normalizeComposition = (value = {}) => ({ requestedMode: value?.requestedMode ?? null,
        quantities: object(value?.quantities) ? copy(value.quantities) : null,
        confirmed: value?.confirmed === true, evidence: copy(value?.evidence ?? null),
        limitingUnits: Array.isArray(value?.limitingUnits) ? copy(value.limitingUnits) : [] });
    const normalizeCandidate = (value = {}) => ({ source: normalizeSource(value?.source),
        ownHome: object(value?.ownHome) ? copy(value.ownHome) : null, evidence: copy(value?.evidence ?? null),
        travelDurations: object(value?.travelDurations) ? copy(value.travelDurations) : null,
        eligibility: value?.eligibility ?? 'unknown', blockingReasons: Array.isArray(value?.blockingReasons) ? copy(value.blockingReasons) : [],
        warnings: Array.isArray(value?.warnings) ? copy(value.warnings) : [], conflicts: Array.isArray(value?.conflicts) ? copy(value.conflicts) : [] });
    const normalizeSlot = (value = {}) => ({ id: identity(value?.id), role: value?.role ?? null,
        groupIndex: value?.groupIndex ?? null, arrivalOffsetMs: value?.arrivalOffsetMs ?? null,
        source: normalizeSource(value?.source), compositionRef: value?.compositionRef ?? null,
        composition: normalizeComposition(value?.composition), status: value?.status ?? 'pending',
        validation: copy(value?.validation ?? null) });
    const normalizeOperation = (value = {}) => ({ id: identity(value?.id), revision: value?.revision ?? null,
        world: value?.world ?? null, playerId: identity(value?.playerId),
        target: { villageId: identity(value?.target?.villageId), coord: coord(value?.target?.coord),
            name: value?.target?.name ?? null, playerName: value?.target?.playerName ?? null,
            evidence: copy(value?.target?.evidence ?? null) },
        nightBonus: { known: value?.nightBonus?.known === true, start: value?.nightBonus?.start ?? null,
            end: value?.nightBonus?.end ?? null, source: value?.nightBonus?.source ?? null,
            evidence: copy(value?.nightBonus?.evidence ?? null), boundary: copy(value?.nightBonus?.boundary ?? null) },
        centralArrivalMs: value?.centralArrivalMs ?? null, ntTemplate: value?.ntTemplate ?? null,
        slotPolicy: copy(value?.slotPolicy ?? null), reviewState: value?.reviewState ?? 'unreviewed',
        slots: Array.isArray(value?.slots) ? value.slots.map(normalizeSlot) : [] });
    const quantitiesCheck = quantities => {
        const blockers = [];
        if (!object(quantities)) return ['COMPOSITION_NOT_CONCRETE'];
        if (Object.values(quantities).some(n => !integer(n) || n < 0)) blockers.push('INVALID_QUANTITY');
        if (!Object.values(quantities).some(n => integer(n) && n > 0)) blockers.push('EMPTY_COMPOSITION');
        return blockers;
    };
    const trustedAvailability = candidate => object(candidate?.ownHome) && candidate?.evidence?.trusted === true &&
        candidate.evidence.complete === true && candidate.evidence.fresh === true;
    const validateComposition = (composition, candidate) => {
        const blockers = quantitiesCheck(composition?.quantities);
        if (!['full', 'custom'].includes(composition?.requestedMode)) blockers.push('UNKNOWN_COMPOSITION_MODE');
        if (composition?.confirmed !== true) blockers.push('COMPOSITION_UNCONFIRMED');
        if (!trustedAvailability(candidate)) blockers.push('AVAILABILITY_UNTRUSTED_OR_INCOMPLETE');
        for (const [unit, count] of Object.entries(composition?.quantities || {})) {
            if (!integer(count) || count <= 0) continue;
            const available = candidate?.ownHome?.[unit];
            if (!integer(available) || available < 0) blockers.push(`AVAILABILITY_UNKNOWN:${unit}`);
            else if (count > available) blockers.push(`INSUFFICIENT_TROOPS:${unit}`);
        }
        return { valid: blockers.length === 0, blockers };
    };
    const resolveTravelDuration = (composition, durations) => {
        const blockers = quantitiesCheck(composition?.quantities), selected = [];
        for (const [unit, count] of Object.entries(composition?.quantities || {})) {
            if (!integer(count) || count <= 0) continue;
            const entry = durations?.[unit];
            if (entry?.trusted !== true || !integer(entry.durationMs) || entry.durationMs <= 0)
                blockers.push(`TRAVEL_DURATION_UNAVAILABLE:${unit}`);
            else selected.push({ ...copy(entry), unit });
        }
        if (blockers.length) return { available: false, travelTimeMs: null, limitingUnits: [], evidence: selected, blockers };
        const travelTimeMs = Math.max(...selected.map(entry => entry.durationMs));
        return { available: true, travelTimeMs, limitingUnits: selected.filter(entry => entry.durationMs === travelTimeMs).map(entry => entry.unit), evidence: selected, blockers: [] };
    };
    const calculateTiming = ({ centralArrivalMs, arrivalOffsetMs, travelTimeMs }) => {
        const valid = integer(centralArrivalMs) && integer(arrivalOffsetMs) && integer(travelTimeMs) && travelTimeMs > 0;
        const desiredArrivalMs = valid ? centralArrivalMs + arrivalOffsetMs : null;
        const sendAtMs = valid ? desiredArrivalMs - travelTimeMs : null;
        return valid && integer(desiredArrivalMs) && integer(sendAtMs)
            ? { available: true, desiredArrivalMs, sendAtMs }
            : { available: false, desiredArrivalMs: null, sendAtMs: null };
    };
    // Clock values are integer milliseconds since server-calendar midnight, not Dates.
    const evaluateNightBonus = (clockMs, window) => {
        const unknown = { state: 'unknown', inside: null };
        if (window?.known !== true || ![clockMs, window.start, window.end].every(n => integer(n) && n >= 0 && n < DAY)) return unknown;
        if (window.start === window.end) return { state: 'ambiguous', inside: null };
        if (clockMs === window.start || clockMs === window.end) {
            const inclusion = window.boundary?.[clockMs === window.start ? 'includeStart' : 'includeEnd'];
            return { state: 'boundary', inside: typeof inclusion === 'boolean' ? inclusion : null };
        }
        const inside = window.start < window.end ? clockMs > window.start && clockMs < window.end : clockMs > window.start || clockMs < window.end;
        return { state: inside ? 'inside' : 'outside', inside };
    };
    const aggregateTroops = (slots, candidates) => {
        const groups = new Map();
        for (const slot of slots) {
            const id = identity(slot.source?.id);
            if (!id) continue;
            if (!groups.has(id)) groups.set(id, { sourceId: id, allocated: Object.create(null), invalid: false });
            const group = groups.get(id), quantities = slot.composition?.quantities;
            if (quantitiesCheck(quantities).length) group.invalid = true;
            for (const [unit, count] of Object.entries(quantities || {})) {
                if (!integer(count) || count <= 0) continue;
                const total = (group.allocated[unit] || 0) + count;
                if (!integer(total)) group.invalid = true;
                else Object.defineProperty(group.allocated, unit, { value: total, enumerable: true, writable: true, configurable: true });
            }
        }
        return [...groups.values()].map(group => {
            const matches = candidates.filter(candidate => identity(candidate.source?.id) === group.sourceId);
            const candidate = matches.length === 1 ? matches[0] : null;
            const trusted = trustedAvailability(candidate), units = new Set([...Object.keys(candidate?.ownHome || {}), ...Object.keys(group.allocated)]);
            const available = {}, remaining = {}, overAllocated = {};
            let unknown = !trusted || group.invalid;
            for (const unit of units) {
                const known = trusted && integer(candidate.ownHome[unit]) && candidate.ownHome[unit] >= 0;
                const amount = known ? candidate.ownHome[unit] : null, allocated = group.allocated[unit] || 0;
                Object.defineProperty(available, unit, { value: amount, enumerable: true });
                Object.defineProperty(remaining, unit, { value: known && !group.invalid ? amount - allocated : null, enumerable: true });
                Object.defineProperty(overAllocated, unit, { value: known && !group.invalid ? Math.max(0, allocated - amount) : null, enumerable: true });
                if (!known) unknown = true;
            }
            return { sourceId: group.sourceId, available, allocated: group.allocated, remaining, overAllocated, unknown };
        });
    };
    const nobleTrainSize = role => /^nt[2-5]$/.test(role) ? Number(role.slice(2)) : null;
    const buildNobleTrain = ({ slot: input, candidate, count = nobleTrainSize(input?.role) }) => {
        const slot = normalizeSlot(input), blockers = [];
        if (![2, 3, 4, 5].includes(count)) return { valid: false, blockers: ['INVALID_NOBLE_TRAIN_SIZE'], slots: [] };
        if (!trustedAvailability(candidate)) blockers.push('AVAILABILITY_UNTRUSTED_OR_INCOMPLETE');
        const troops = candidate?.ownHome || {};
        for (const unit of ['axe', 'light', 'snob']) if (!integer(troops[unit]) || troops[unit] < 0) blockers.push(`AVAILABILITY_UNKNOWN:${unit}`);
        for (const unit of ['ram', 'catapult', 'knight']) if (troops[unit] != null && (!integer(troops[unit]) || troops[unit] < 0)) blockers.push(`INVALID_QUANTITY:${unit}`);
        if (integer(troops.snob) && troops.snob < count) blockers.push('INSUFFICIENT_NOBLES');
        const slots = Array.from({ length: count }, (_, index) => {
            const quantities = { snob: 1 };
            for (const unit of ['axe', 'light']) {
                const total = troops[unit];
                if (integer(total) && total >= 0) quantities[unit] = Math.floor(total / count) + (index < total % count ? 1 : 0);
                if (quantities[unit] < 150) blockers.push(unit === 'axe' ? 'INSUFFICIENT_AXE_ESCORT' : 'INSUFFICIENT_LIGHT_ESCORT');
            }
            if (index === 0) for (const unit of ['ram', 'catapult', 'knight']) if (integer(troops[unit]) && troops[unit] > 0) quantities[unit] = unit === 'knight' ? 1 : troops[unit];
            const offset = integer(slot.arrivalOffsetMs) ? slot.arrivalOffsetMs + index * 100 : null;
            return { ...slot, id: `${slot.id}:nt:${index + 1}`, role: 'attack', parentSlotId: slot.id, trainIndex: index + 1, trainSize: count,
                arrivalOffsetMs: integer(offset) ? offset : null,
                composition: { requestedMode: 'custom', quantities, confirmed: true, evidence: { policy: 'noble-train-v1', snapshot: copy(candidate?.evidence ?? null) }, limitingUnits: [] } };
        });
        return { valid: blockers.length === 0, blockers: [...new Set(blockers)], slots };
    };
    const validatePlan = ({ operation: input, candidates: supplied = [], serverNowMs, externalConflicts = [] }) => {
        const operation = normalizeOperation(input), candidates = supplied.map(normalizeCandidate), blockers = [];
        if (!operation.id || !integer(operation.revision) || operation.revision < 0) blockers.push('OPERATION_IDENTITY_MISSING');
        if (!operation.target.coord) blockers.push('TARGET_MISSING');
        if (!integer(serverNowMs)) blockers.push('SERVER_NOW_UNAVAILABLE');
        if (!integer(operation.centralArrivalMs)) blockers.push('CENTRAL_ARRIVAL_UNAVAILABLE');
        if (!operation.slots.length) blockers.push('NO_SLOTS');
        if (new Set(operation.slots.map(slot => slot.id)).size !== operation.slots.length) blockers.push('DUPLICATE_SLOT_ID');
        const expanded = operation.slots.flatMap(slot => {
            const count = nobleTrainSize(slot.role);
            if (!count) return [{ ...slot, parentSlotId: slot.id, trainBlockers: [] }];
            const matches = candidates.filter(c => c.source.id === slot.source.id);
            const train = buildNobleTrain({ slot, candidate: matches.length === 1 ? matches[0] : null, count });
            return train.slots.map(command => ({ ...command, trainBlockers: train.blockers }));
        });
        if (new Set(expanded.map(slot => slot.id)).size !== expanded.length) blockers.push('DUPLICATE_SLOT_ID');
        const balances = aggregateTroops(expanded, candidates);
        const missions = expanded.map(slot => {
            const issues = [...blockers, ...slot.trainBlockers], warnings = [];
            if (!slot.id || !slot.parentSlotId) issues.push('SLOT_ID_MISSING');
            if (!['attack', 'support'].includes(slot.role)) issues.push('INVALID_ROLE');
            if (!slot.source.id || !slot.source.coord) issues.push('SOURCE_MISSING');
            const matches = candidates.filter(candidate => candidate.source.id === slot.source.id);
            const candidate = matches.length === 1 ? matches[0] : null;
            if (candidate && candidate.source.coord !== slot.source.coord) issues.push('SOURCE_COORDINATE_MISMATCH');
            issues.push(...validateComposition(slot.composition, candidate).blockers);
            if (Array.isArray(candidate?.blockingReasons)) issues.push(...candidate.blockingReasons);
            if (candidate?.eligibility === 'blocked') issues.push('CANDIDATE_BLOCKED');
            const balance = balances.find(entry => entry.sourceId === slot.source.id);
            if (balance?.unknown) issues.push('ALLOCATION_UNKNOWN');
            if (balance && Object.values(balance.overAllocated).some(n => n > 0)) issues.push('OVER_ALLOCATION');
            const travel = resolveTravelDuration(slot.composition, candidate?.travelDurations);
            issues.push(...travel.blockers);
            if (!integer(slot.arrivalOffsetMs)) issues.push('ARRIVAL_OFFSET_UNDEFINED');
            const timing = calculateTiming({ centralArrivalMs: operation.centralArrivalMs, arrivalOffsetMs: slot.arrivalOffsetMs, travelTimeMs: travel.travelTimeMs });
            if (!timing.available) issues.push('TIMING_UNAVAILABLE');
            else if (integer(serverNowMs) && timing.sendAtMs <= serverNowMs) issues.push('SEND_TIME_NOT_FUTURE');
            const night = evaluateNightBonus(timing.available ? ((timing.desiredArrivalMs % DAY) + DAY) % DAY : null, operation.nightBonus);
            if (night.state !== 'outside') warnings.push({ code: 'NIGHT_BONUS_' + night.state.toUpperCase(), ...night });
            for (const conflict of externalConflicts) if (conflict && (conflict.slotId === slot.id || conflict.slotId === slot.parentSlotId || conflict.sourceId === slot.source.id)) warnings.push({ code: 'EXTERNAL_CONFLICT', evidence: copy(conflict) });
            warnings.push(...copy(candidate?.warnings || []), ...copy(candidate?.conflicts || []).map(evidence => ({ code: 'EXTERNAL_CONFLICT', evidence })));
            return { operationId: operation.id, revision: operation.revision, slotId: slot.id, parentSlotId: slot.parentSlotId, trainIndex: slot.trainIndex ?? null, trainSize: slot.trainSize ?? null, role: slot.role,
                commandType: slot.role === 'support' ? 'support' : slot.role === 'attack' ? 'attack' : null,
                source: copy(slot.source), target: copy(operation.target), composition: copy(slot.composition),
                limitingUnits: travel.limitingUnits, travelEvidence: travel.evidence, travelTimeMs: travel.travelTimeMs,
                ...timing, validationStatus: issues.length ? 'blocked' : 'ready', blockers: [...new Set(issues)], warnings };
        });
        missions.sort((a, b) => (a.sendAtMs ?? Infinity) - (b.sendAtMs ?? Infinity) || String(a.slotId).localeCompare(String(b.slotId)));
        return { operation, balances, missions, valid: blockers.length === 0 && missions.every(mission => mission.validationStatus === 'ready'), blockers: [...new Set([...blockers, ...missions.flatMap(mission => mission.blockers)])] };
    };
    EAS.TacticalOperationPlanner = Object.freeze({ normalizeOperation, normalizeSlot, normalizeComposition, normalizeCandidate,
        nobleTrainSize, buildNobleTrain, validateComposition, resolveTravelDuration, calculateTiming, evaluateNightBonus, aggregateTroops, validatePlan });
})();
