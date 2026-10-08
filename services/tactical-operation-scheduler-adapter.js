// Tactical Scheduler boundary. Preparation authorization never authorizes a final submit.
(() => {
    'use strict';
    if (EAS.TacticalOperationSchedulerAdapter) return;

    const VERSION = 1;
    const STORAGE_KEY = 'eas_tw_tactical_scheduler_v1';
    const PREFLIGHT_DIAGNOSTICS_KEY = 'eas_tw_tactical_preflight_diagnostics_v1';
    const MAX_PREFLIGHT_DIAGNOSTICS = 100;
    const SINGLE = 'single-command';
    const NATIVE_TRAIN = 'native-noble-train';
    const integer = Number.isSafeInteger;
    const copy = value => Array.isArray(value) ? value.map(copy) : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) : value;
    const formatServerTimestamp = value => {
        if (!Number.isSafeInteger(value)) return '-';
        const date = new Date(value), pad = number => String(number).padStart(2, '0');
        return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${String(date.getUTCMilliseconds()).padStart(3, '0')}`;
    };
    const freeze = value => {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
            Object.values(value).forEach(freeze);
            Object.freeze(value);
        }
        return value;
    };
    const identity = value => value == null ? null : String(value).trim() || null;
    const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
        : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
            : JSON.stringify(value);
    const same = (left, right) => canonical(left) === canonical(right);
    const nonzeroComposition = composition => Object.fromEntries(Object.entries(composition || {}).filter(([, count]) => count !== 0));
    const commandId = command => String(command.slotId || '');
    const targetCoord = command => command.target?.coord || null;
    const sourceKey = command => `${identity(command.source?.id) || ''}|${command.source?.coord || ''}`;
    const unitId = (snapshot, suffix) => `${snapshot.operationId}:${snapshot.revision}:${suffix}`;
    const block = (unit, reason) => {
        unit.blockers = [...new Set([...(unit.blockers || []), reason])];
        unit.state = 'BLOCKED';
    };
    const readAuthoritativeNowMs = targetWindow => {
        let raw;
        try {
            const provider = targetWindow?.EAS?.MassSnipeExecution?.getCurrentServerTimeMs;
            if (typeof provider !== 'function') return { available: false, nowMs: null, reason: 'TIMING_PROVIDER_UNAVAILABLE' };
            raw = provider.call(targetWindow.EAS.MassSnipeExecution);
        } catch { return { available: false, nowMs: null, reason: 'TIMING_PROVIDER_ERROR' }; }
        if (typeof raw !== 'number') return { available: false, nowMs: null, reason: 'TIMING_VALUE_NOT_NUMERIC' };
        if (!Number.isFinite(raw)) return { available: false, nowMs: null, reason: 'TIMING_VALUE_NOT_FINITE' };
        const nowMs = Math.floor(raw);
        if (!Number.isSafeInteger(nowMs)) return { available: false, nowMs: null, reason: 'TIMING_VALUE_UNSAFE' };
        return { available: true, nowMs, reason: null };
    };
    const preflightDiagnosticStorageKey = options => `${PREFLIGHT_DIAGNOSTICS_KEY}:${options?.scope || contextKey()}`;
    const readPreflightDiagnostics = options => {
        const storage = options?.storage || (typeof localStorage === 'undefined' ? null : localStorage);
        try {
            const parsed = JSON.parse(storage?.getItem(preflightDiagnosticStorageKey(options)) || 'null');
            return parsed?.version === 1 && Array.isArray(parsed.entries) ? parsed.entries : [];
        } catch { return []; }
    };
    const recordPreflightDiagnostic = (entry, options = {}) => {
        const storage = options.storage || (typeof localStorage === 'undefined' ? null : localStorage);
        if (!storage) return false;
        try {
            const entries = [...readPreflightDiagnostics(options), copy(entry)].slice(-MAX_PREFLIGHT_DIAGNOSTICS);
            storage.setItem(preflightDiagnosticStorageKey(options), JSON.stringify({ version: 1, entries }));
            return true;
        } catch { return false; }
    };

    const mapTrainTiming = children => {
        const ordered = [...children].sort((left, right) => left.trainIndex - right.trainIndex);
        const first = ordered[0];
        if (!first || !ordered.every(child => integer(child.sendAtMs) && integer(child.desiredArrivalMs) &&
            integer(child.travelTimeMs) && child.travelTimeMs > 0 && child.sendAtMs === child.desiredArrivalMs - child.travelTimeMs))
            return { valid: false, executionSendAtMs: null, blocker: 'NATIVE_NT_TIMING_EVIDENCE_INVALID', approvedSendAtMs: ordered.map(child => child.sendAtMs) };
        if (!ordered.every((child, index) => child.desiredArrivalMs === first.desiredArrivalMs + index * 100))
            return { valid: false, executionSendAtMs: null, blocker: 'NATIVE_NT_ARRIVAL_SEQUENCE_INCONSISTENT', approvedSendAtMs: ordered.map(child => child.sendAtMs) };
        // Child times are arrival intentions, not N browser submit events. Even
        // equal child times do not prove native duration/spacing semantics.
        return { valid: false, executionSendAtMs: null, nativeSubmitAtMs: null,
            blocker: 'NATIVE_NT_NATIVE_TIMING_UNPROVEN', approvedSendAtMs: ordered.map(child => child.sendAtMs) };
    };

    const deriveExecutionUnits = snapshot => {
        const blockers = [];
        if (snapshot?.snapshotKind !== 'tactical-approved-operation' || snapshot.version !== 1 ||
            snapshot.validation?.valid !== true || !Array.isArray(snapshot.commands) || !snapshot.commands.length ||
            !snapshot.operationId || !integer(snapshot.revision)) return { valid: false, blockers: ['APPROVED_SNAPSHOT_INVALID'], units: [] };

        const commands = snapshot.commands.map(command => copy(command));
        const trains = new Map(), singles = [];
        for (const command of commands) {
            const parentSlotId = identity(command.parentSlotId);
            const hasTrainMetadata = command.trainIndex != null || command.trainSize != null ||
                parentSlotId !== null && parentSlotId !== identity(command.slotId);
            if (hasTrainMetadata) {
                const parent = parentSlotId || `invalid-parent:${commandId(command)}`;
                if (!trains.has(parent)) trains.set(parent, []);
                trains.get(parent).push(command);
            } else singles.push(command);
        }

        const units = singles.map(command => {
            const unit = {
                executionUnitId: unitId(snapshot, `command:${commandId(command)}`), kind: SINGLE,
                operationId: snapshot.operationId, revision: snapshot.revision, approvedCommand: command,
                source: copy(command.source), target: copy(command.target), commandType: command.commandType,
                expectedCommands: 1, executionSendAtMs: command.sendAtMs, state: 'SCHEDULED', nextCheckpoint: 'PRECHECK_10M', blockers: []
            };
            if (!['attack', 'support'].includes(command.commandType) || command.validationStatus !== 'ready' ||
                command.blockers?.length || !integer(command.sendAtMs) || !integer(command.desiredArrivalMs) ||
                !integer(command.travelTimeMs) || command.travelTimeMs <= 0 ||
                command.sendAtMs !== command.desiredArrivalMs - command.travelTimeMs || !unit.source?.id ||
                !unit.source?.coord || !unit.target?.coord || !Object.values(command.composition?.quantities || {}).some(value => integer(value) && value > 0))
                block(unit, 'APPROVED_COMMAND_NOT_READY');
            if (!trustedSource(unit)) block(unit, 'APPROVED_SOURCE_IDENTITY_UNPROVEN');
            return unit;
        });

        for (const [parentSlotId, rawChildren] of trains) {
            const children = rawChildren.sort((left, right) => Number(left.trainIndex) - Number(right.trainIndex));
            const candidateCount = children[0]?.trainSize;
            const count = integer(candidateCount) && candidateCount >= 2 && candidateCount <= 5 ? candidateCount : null;
            const unit = {
                executionUnitId: unitId(snapshot, `train:${parentSlotId}`), kind: NATIVE_TRAIN,
                operationId: snapshot.operationId, revision: snapshot.revision, trainId: children[0]?.parentSlotId || parentSlotId,
                count, expectedCommands: count ?? Math.max(1, children.length), approvedChildren: children,
                source: copy(children[0]?.source || {}), target: copy(children[0]?.target || {}), commandType: 'attack',
                executionSendAtMs: null, nativeSubmitAtMs: null, state: 'SCHEDULED', nextCheckpoint: 'PRECHECK_10M', blockers: []
            };
            if (!integer(count) || count < 2 || count > 5 || children.length !== count ||
                children.some((child, index) => child.trainSize !== count || child.trainIndex !== index + 1 ||
                    identity(child.parentSlotId) !== parentSlotId ||
                    child.validationStatus !== 'ready' || child.blockers?.length || child.commandType !== 'attack' ||
                    sourceKey(child) !== sourceKey(children[0]) || targetCoord(child) !== targetCoord(children[0]))) {
                block(unit, 'NATIVE_NT_CHILDREN_INCONSISTENT');
            }
            const timing = mapTrainTiming(children);
            unit.timingMapping = timing.valid ? 'shared-approved-sendAtMs-with-100ms-arrival-sequence-v1' : 'blocked-no-safe-single-native-submit-time-v1';
            unit.approvedChildTiming = children.map(child => ({ trainIndex: child.trainIndex, sendAtMs: child.sendAtMs,
                desiredArrivalMs: child.desiredArrivalMs, travelTimeMs: child.travelTimeMs }));
            if (!timing.valid) block(unit, timing.blocker);
            else unit.executionSendAtMs = timing.executionSendAtMs;
            units.push(unit);
        }
        units.sort((left, right) => (left.executionSendAtMs ?? Infinity) - (right.executionSendAtMs ?? Infinity) ||
            left.executionUnitId.localeCompare(right.executionUnitId));
        const valid = units.length > 0 && units.every(unit => unit.state !== 'BLOCKED');
        if (!units.length) blockers.push('EXECUTION_UNITS_EMPTY');
        return freeze({ valid, blockers: [...new Set(blockers)], snapshotIdentity: { operationId: snapshot.operationId, revision: snapshot.revision }, units });
    };

    const formatExecutionUnitLabel = unit => unit?.kind === NATIVE_TRAIN
        ? integer(unit.count) && unit.count >= 2 && unit.count <= 5 ? `NT(${unit.count}) · um envio nativo` : 'Trem nativo bloqueado'
        : unit?.commandType === 'support' ? 'SUPPORT · envio simples' : 'ATTACK · envio simples';
    const formatApprovedChildLabel = child => integer(child?.trainIndex) && integer(child?.trainSize) &&
        child.trainSize >= 2 && child.trainSize <= 5 && child.trainIndex >= 1 && child.trainIndex <= child.trainSize
        ? `NT${child.trainIndex}/${child.trainSize}` : 'Comando de trem inválido';

    const authorizePreparation = (unit, { authorizedAt = Date.now(), actor = 'user' } = {}) => {
        // This is audit metadata, not a scheduled send timestamp. Timing may
        // legitimately return fractional milliseconds; preserve the millisecond
        // calendar without rejecting the user's preparation-only permission.
        authorizedAt = Number.isFinite(authorizedAt) ? Math.trunc(authorizedAt) : null;
        if (!unit || unit.state === 'BLOCKED' || !integer(authorizedAt) || authorizedAt < 0 || actor !== 'user') return null;
        const next = copy(unit);
        next.preparationAuthorization = freeze({ authorizationKind: 'tactical-preflight-only', executionUnitId: unit.executionUnitId,
            operationId: unit.operationId, revision: unit.revision, executionId: unit.executionId ?? null, authorizedAt, actor });
        return freeze(next);
    };

    const dueState = (unit, now, startMs, endMs, missedReason) => {
        if (!integer(now) || !integer(unit?.executionSendAtMs)) return { valid: false, blocker: 'TIMING_EVIDENCE_UNAVAILABLE' };
        const remaining = unit.executionSendAtMs - now;
        if (remaining > startMs) return { valid: false, notDue: true, blocker: 'CHECKPOINT_NOT_DUE' };
        if (remaining <= endMs) return { valid: false, blocker: missedReason };
        return { valid: true, remainingMs: remaining };
    };

    const accountFromScope = scope => {
        const match = /^([^:]+):([1-9]\d*)$/.exec(String(scope || ''));
        return match ? { world: match[1], playerId: match[2] } : null;
    };
    const trustedSource = unit => {
        const commands = unit?.kind === NATIVE_TRAIN ? unit.approvedChildren : [unit?.approvedCommand];
        return /^[1-9]\d*$/.test(String(unit?.source?.id || '')) && /^\d{1,3}\|\d{1,3}$/.test(unit?.source?.coord || '') &&
            commands?.length > 0 && commands.every(command => String(command?.source?.id) === String(unit.source.id) && command.source.coord === unit.source.coord);
    };
    const advancePrecheck10m = (input, evidence) => {
        const unit = copy(input);
        const now = Number.isFinite(evidence?.now) && Number.isSafeInteger(Math.floor(evidence.now)) ? Math.floor(evidence.now) : null;
        const checkpointAtMs = integer(unit.executionSendAtMs) ? unit.executionSendAtMs - 600000 : null;
        const finish = (result, reason) => {
            unit.lastPreflight = { action: evidence?.action === 'scheduler' ? 'SCHEDULER_PRECHECK_10M' : 'MANUAL_PRECHECK_10M',
                result, reason, authoritativeNowMs: now, checkpointAtMs,
                deltaMs: now !== null && checkpointAtMs !== null ? now - checkpointAtMs : null,
                at: now, clockSource: 'MassSnipeExecution.getCurrentServerTimeMs' };
            return freeze(unit);
        };
        if (!preparationAuthorizationValid(unit)) block(unit, 'PREPARATION_AUTHORIZATION_MISSING');
        if (input.state !== 'SCHEDULED') block(unit, 'INVALID_LIFECYCLE_TRANSITION');
        if (unit.state === 'BLOCKED') return finish('REJECTED', unit.blockers.at(-1));
        const due = dueState(unit, now, 600000, 300000, 'PRECHECK_WINDOW_MISSED');
        if (!due.valid) {
            if (due.notDue) { unit.checkpointDue = false; unit.nextCheckpointAtMs = checkpointAtMs; }
            else block(unit, due.blocker);
            return finish('REJECTED', due.notDue ? 'PRECHECK_TOO_EARLY' : due.blocker);
        }
        unit.precheckEvidence = copy(evidence);
        if (evidence.sessionAvailable !== true || evidence.loggedIn !== true || evidence.antiBotPresent === true) block(unit, 'SESSION_UNAVAILABLE_OR_UNTRUSTED');
        if (evidence.accountValid !== true) block(unit, evidence.accountReason || 'ACCOUNT_IDENTITY_UNPROVEN');
        if (!trustedSource(unit)) block(unit, 'APPROVED_SOURCE_IDENTITY_UNPROVEN');
        if (evidence.target?.coord !== unit.target?.coord) block(unit, 'TARGET_IDENTITY_MISMATCH');
        if (evidence.cancelled === true || evidence.completed === true) block(unit, evidence.cancelled ? 'EXECUTION_CANCELLED' : 'EXECUTION_ALREADY_COMPLETED');
        if (unit.state !== 'BLOCKED') { unit.state = 'PRECHECK_10M'; unit.nextCheckpoint = 'PREPARE_5M'; unit.nextCheckpointAtMs = unit.executionSendAtMs - 300000; unit.checkpointDue = true; }
        return finish(unit.state === 'PRECHECK_10M' ? 'ACCEPTED' : 'REJECTED', unit.state === 'PRECHECK_10M' ? null : unit.blockers.at(-1));
    };

    const advancePrepare5m = (input, evidence) => {
        const unit = copy(input);
        if (unit.state !== 'PRECHECK_10M') block(unit, 'INVALID_LIFECYCLE_TRANSITION');
        if (unit.state === 'BLOCKED') return freeze(unit);
        const due = dueState(unit, evidence?.now, 300000, 120000, 'PREPARATION_WINDOW_MISSED');
        if (!due.valid) {
            if (due.notDue) { unit.checkpointDue = false; unit.nextCheckpointAtMs = unit.executionSendAtMs - 300000; }
            else block(unit, due.blocker);
            return freeze(unit);
        }
        if (evidence.sourceCorrect !== true) block(unit, 'SOURCE_IDENTITY_MISMATCH');
        if (evidence.targetCorrect !== true) block(unit, 'TARGET_IDENTITY_MISMATCH');
        if (evidence.confirmationContextValid !== true) block(unit, 'CONFIRMATION_CONTEXT_INVALID');
        if (unit.kind === NATIVE_TRAIN && evidence.nativeReconciliation?.valid !== true) {
            block(unit, evidence.nativeReconciliation?.blocker || 'NATIVE_NT_RECONCILIATION_REQUIRED');
        }
        if (unit.kind === SINGLE && evidence.compositionMatches !== true) block(unit, 'APPROVED_COMPOSITION_MISMATCH');
        if (unit.state !== 'BLOCKED') { unit.state = 'PREPARE_5M'; unit.nextCheckpoint = 'SYNC_2M'; unit.nextCheckpointAtMs = unit.executionSendAtMs - 120000; unit.checkpointDue = true; unit.preparationEvidence = copy(evidence); }
        return freeze(unit);
    };

    const evaluateClockSamples = (samples, now = Date.now(), { minimumSamples = 3, maximumSpreadMs = 500, maximumAgeMs = 120000, maximumAbsoluteOffsetMs = 86400000 } = {}) => {
        if (!Array.isArray(samples) || samples.length < minimumSamples || !integer(now) ||
            samples.some(sample => !integer(sample.serverNowMs) || !integer(sample.localNowMs) || !integer(sample.measuredAt)))
            return { valid: false, blocker: 'CLOCK_SAMPLES_INSUFFICIENT' };
        const offsets = samples.map(sample => sample.serverNowMs - sample.localNowMs).sort((left, right) => left - right);
        const spreadMs = offsets[offsets.length - 1] - offsets[0];
        const serverClockOffsetMs = offsets[Math.floor(offsets.length / 2)];
        const measuredAt = Math.max(...samples.map(sample => sample.measuredAt));
        if (spreadMs > maximumSpreadMs) return { valid: false, blocker: 'CLOCK_SAMPLE_OUTLIER', spreadMs };
        if (Math.abs(serverClockOffsetMs) > maximumAbsoluteOffsetMs) return { valid: false, blocker: 'CLOCK_OFFSET_IMPLAUSIBLE', serverClockOffsetMs };
        if (now - measuredAt < 0 || now - measuredAt > maximumAgeMs) return { valid: false, blocker: 'CLOCK_EVIDENCE_STALE', measuredAt };
        return { valid: true, serverClockOffsetMs, sampleCount: samples.length,
            measuredAt, spreadMs, quality: 'consistent-multiple-samples' };
    };

    // The authoritative clock is the server's wall clock parsed as UTC (see mass-snipe-execution getLandingTime), so
    // its offset to Date.now() is mostly the server timezone shift (BRT = -3h) plus real skew. Diagnostic only.
    const describeClockFrame = offsetMs => {
        if (!Number.isFinite(offsetMs)) return null;
        const timezoneShiftMs = Math.round(offsetMs / 900000) * 900000;
        return { offsetMs, serverWallClockShiftMs: timezoneShiftMs, residualSkewMs: offsetMs - timezoneShiftMs,
            frame: 'server-wall-clock-as-utc', note: 'residualSkewMs is local-clock/Timing skew; no millisecond precision is claimed' };
    };
    const FINAL_CHECK_START_MS = 60000, FINAL_CHECK_END_MS = 5000;
    const advanceSync2m = (input, evidence) => {
        const unit = copy(input);
        if (!['PREPARE_5M', 'PREPARED'].includes(unit.state)) block(unit, 'INVALID_LIFECYCLE_TRANSITION');
        if (unit.state === 'BLOCKED') return freeze(unit);
        const due = dueState(unit, evidence?.now, 120000, 0, 'CLOCK_SYNC_WINDOW_MISSED');
        if (!due.valid) {
            if (due.notDue) { unit.checkpointDue = false; unit.nextCheckpointAtMs = unit.executionSendAtMs - 120000; }
            else block(unit, due.blocker);
            return freeze(unit);
        }
        // A prepared unit has no confirmation page: the still-open Rally Point form is the evidence.
        if (unit.state === 'PREPARED' && evidence.preparedFormValid !== true) block(unit, evidence.preparedFormBlocker || 'PREPARED_FORM_UNVERIFIED');
        if (evidence.source !== 'Timing.getCurrentServerTime+World.getServerDateTime') block(unit, 'CLOCK_PRECISION_UNAVAILABLE');
        const clock = evaluateClockSamples(evidence.samples, evidence.now, evidence.clockPolicy);
        if (!clock.valid) block(unit, clock.blocker);
        if (unit.state !== 'BLOCKED') { unit.state = 'SYNC_2M'; unit.nextCheckpoint = 'FINAL_CHECK'; unit.nextCheckpointAtMs = evidence.preparedFormValid === true ? unit.executionSendAtMs - FINAL_CHECK_START_MS : unit.executionSendAtMs; unit.checkpointDue = true; unit.clockEvidence = { ...clock, source: evidence.source }; unit.syncEvidence = copy(evidence); }
        return freeze(unit);
    };

    const advanceFinalCheck = (input, evidence) => {
        const unit = copy(input);
        if (unit.state !== 'SYNC_2M') block(unit, 'INVALID_LIFECYCLE_TRANSITION');
        if (unit.state === 'BLOCKED') return freeze(unit);
        if (evidence?.fromPreparedForm === true) {
            const due = dueState(unit, evidence.now, FINAL_CHECK_START_MS, FINAL_CHECK_END_MS, 'FINAL_CHECK_WINDOW_MISSED');
            if (due.notDue) return freeze(unit);
            if (!due.valid) block(unit, due.blocker);
            if (evidence.clockConsistent !== true) block(unit, 'CLOCK_INCONSISTENT');
        }
        if (!integer(evidence?.now) || evidence.now > unit.executionSendAtMs) block(unit, 'FINAL_CHECK_TIMING_INVALID');
        if (evidence.authorizationValid !== true) block(unit, 'PREPARATION_AUTHORIZATION_REVOKED');
        if (evidence.sessionTrusted !== true) block(unit, 'SESSION_UNAVAILABLE_OR_UNTRUSTED');
        if (!integer(unit.clockEvidence?.measuredAt) || !integer(evidence.now) || evidence.now < unit.clockEvidence.measuredAt ||
            evidence.now - unit.clockEvidence.measuredAt > 120000) block(unit, 'CLOCK_EVIDENCE_STALE');
        if (evidence.sourceCorrect !== true) block(unit, 'SOURCE_IDENTITY_MISMATCH');
        if (evidence.targetCorrect !== true) block(unit, 'TARGET_IDENTITY_MISMATCH');
        if (evidence.commandTypeCorrect !== true) block(unit, 'COMMAND_TYPE_MISMATCH');
        if (evidence.compositionMatches !== true) block(unit, 'APPROVED_COMPOSITION_MISMATCH');
        if (evidence.confirmationContextValid !== true) block(unit, 'CONFIRMATION_CONTEXT_INVALID');
        if (evidence.clockEvidenceFresh !== true) block(unit, 'CLOCK_EVIDENCE_STALE');
        if (unit.kind === SINGLE && evidence.singleSubmitControlFound !== true) block(unit, 'SINGLE_SUBMIT_CONTROL_UNAVAILABLE');
        if (unit.kind === NATIVE_TRAIN && !integer(unit.nativeSubmitAtMs)) block(unit, 'NATIVE_NT_NATIVE_TIMING_UNPROVEN');
        if (unit.kind === NATIVE_TRAIN && (evidence.nativeReconciliation?.valid !== true || evidence.singleSubmitControlFound !== true))
            block(unit, evidence.nativeReconciliation?.blocker || 'NATIVE_NT_FINAL_CHECK_FAILED');
        if (unit.state !== 'BLOCKED') { unit.state = 'READY_TO_SEND'; unit.nextCheckpoint = null; unit.nextCheckpointAtMs = null; unit.checkpointDue = false; }
        unit.finalCheckEvidence = copy(evidence);
        return freeze(unit);
    };

    const advanceConfirmationReady = (input, evidence) => {
        const unit = copy(input);
        if (unit.state !== 'READY_TO_SEND' || unit.finalCheckEvidence?.fromPreparedForm !== true || unit.kind !== SINGLE ||
            unit.confirmationIntent?.status !== 'NAVIGATING' || unit.attemptId || unit.outgoingBaseline || unit.finalAuthorization) block(unit, 'CONFIRMATION_STATE_INELIGIBLE');
        if (unit.state === 'BLOCKED') return freeze(unit);
        if (evidence?.valid !== true || evidence.submitControlCount !== 1 || evidence.navigationId !== unit.confirmationIntent.navigationId) block(unit, 'CONFIRMATION_EVIDENCE_INVALID');
        if (unit.state !== 'BLOCKED') { unit.state = 'CONFIRMATION_READY'; unit.confirmationIntent = { ...unit.confirmationIntent, status: 'CONFIRMED' }; unit.confirmationEvidence = copy(evidence); }
        return freeze(unit);
    };

    const normalizeNativeRow = row => ({
        sourceId: identity(row.sourceId), sourceCoord: row.sourceCoord || null, targetCoord: row.targetCoord || null,
        commandType: row.commandType || null, composition: nonzeroComposition(row.composition || {})
    });
    const reconcileNativeNobleRows = (group, rows) => {
        if (group?.kind !== NATIVE_TRAIN || !Array.isArray(rows)) return { valid: false, blocker: 'NATIVE_NT_ROWS_UNAVAILABLE', rows: [] };
        const actual = rows.map(normalizeNativeRow);
        if (actual.length !== group.expectedCommands) return { valid: false, blocker: actual.length > group.expectedCommands ? 'NATIVE_NT_UNEXPECTED_EXTRA_ROW' : 'NATIVE_NT_ROW_COUNT_MISMATCH', rows: actual };
        const expected = [...group.approvedChildren].sort((left, right) => left.trainIndex - right.trainIndex);
        for (let index = 0; index < expected.length; index += 1) {
            const approved = expected[index], native = actual[index];
            if (native.sourceId !== String(approved.source?.id) || native.sourceCoord !== approved.source?.coord ||
                native.targetCoord !== approved.target?.coord || native.commandType !== 'attack' || native.composition.snob !== 1 ||
                !same(native.composition, nonzeroComposition(approved.composition?.quantities)))
                return { valid: false, blocker: 'NATIVE_NT_COMPOSITION_MISMATCH', rows: actual, mismatchIndex: index };
        }
        return { valid: true, blocker: null, rows: actual, matchedCommands: actual.length };
    };

    const readNativeRows = (doc, { sourceId, sourceCoord, targetCoord: expectedTarget } = {}) => {
        const form = doc?.querySelector?.('#command-confirm-form, form[action*="action=command"], form[action*="screen=place"]');
        if (!form) return { valid: false, blocker: 'NATIVE_NT_CONFIRMATION_FORM_MISSING', rows: [], addButtonCount: 0, submitButtonCount: 0 };
        const normalizeText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
        const buttons = [...doc.querySelectorAll('button, input[type="button"], input[type="submit"]')];
        const addButtons = buttons.filter(button => normalizeText(button.textContent || button.value) === 'adicionar ataque adicional' &&
            (button.tagName === 'BUTTON' ? button.type === 'button' : button.tagName === 'INPUT' && button.type === 'button'));
        const submits = buttons.filter(button => button.id === 'troop_confirm_submit' ||
            /enviar ataque/i.test(normalizeText(button.textContent || button.value)) && button.type === 'submit');
        const submitLabel = submits.length === 1 ? String(submits[0].textContent || submits[0].value || '').trim() : null;
        const visibleText = String(form.innerText || form.textContent || '');
        const hasCoordinate = coordinate => coordinate && new RegExp(`(^|\\D)${coordinate.replace('|', '\\|')}(?=$|\\D)`).test(visibleText);
        if (!hasCoordinate(sourceCoord)) return { valid: false, blocker: 'NATIVE_NT_SOURCE_IDENTITY_UNVERIFIED', rows: [], addButtonCount: addButtons.length, submitButtonCount: submits.length };
        if (!hasCoordinate(expectedTarget)) return { valid: false, blocker: 'NATIVE_NT_TARGET_IDENTITY_UNVERIFIED', rows: [], addButtonCount: addButtons.length, submitButtonCount: submits.length };
        let containers = [...form.querySelectorAll('[data-native-attack-row], [data-attack-row]')];
        if (!containers.length) {
            containers = [...form.querySelectorAll('tbody tr')].filter(row => row.querySelector('img[src*="/unit/"], [data-unit][data-count]'));
        }
        const rows = containers.map(container => {
            const composition = {};
            container.querySelectorAll('[data-unit]').forEach(node => {
                const unit = String(node.dataset.unit || '');
                const raw = node.dataset.count ?? node.textContent;
                const match = String(raw).replace(/\s/g, '').match(/^\d+$/);
                if (unit && match && Number(match[0]) > 0) composition[unit] = Number(match[0]);
            });
            container.querySelectorAll('input[name]').forEach(input => {
                const match = /^(spear|sword|axe|archer|spy|light|marcher|heavy|ram|catapult|knight|snob|militia)$/.exec(input.name);
                const amount = Number(String(input.value).replace(/\D/g, ''));
                if (match && Number.isSafeInteger(amount) && amount > 0) composition[match[1]] = amount;
            });
            container.querySelectorAll('img[src*="/unit/"]').forEach(image => {
                const unit = /\/unit\/([a-z]+)\./i.exec(image.getAttribute('src') || '')?.[1];
                const cell = image.closest('td');
                const values = [...(cell?.textContent || '').matchAll(/[\d.]+/g)].map(item => Number(item[0].replace(/\./g, ''))).filter(Number.isSafeInteger);
                if (unit && values.length) composition[unit] = values[values.length - 1];
            });
            return normalizeNativeRow({ sourceId: container.dataset.sourceId || sourceId,
                sourceCoord: container.dataset.sourceCoord || sourceCoord,
                targetCoord: container.dataset.targetCoord || expectedTarget,
                commandType: container.dataset.commandType || 'attack', composition });
        }).filter(row => Object.keys(row.composition).length > 0);
        if (!rows.length) return { valid: false, blocker: 'NATIVE_NT_ROWS_UNRECOGNIZED', rows, addButtonCount: addButtons.length, submitButtonCount: submits.length, submitLabel };
        return { valid: true, blocker: null, rows, addButtonCount: addButtons.length, submitButtonCount: submits.length,
            submitLabel, sourceId: String(sourceId || ''), sourceCoord: sourceCoord || null, targetCoord: expectedTarget || null };
    };

    const parseNativeConfirmation = (doc, group) => {
        const page = readNativeRows(doc, { sourceId: group.source?.id, sourceCoord: group.source?.coord, targetCoord: group.target?.coord });
        if (!page.valid) return { valid: false, blocker: page.blocker, page };
        if (page.submitButtonCount !== 1) return { valid: false, blocker: 'NATIVE_NT_SUBMIT_CONTROL_AMBIGUOUS', page };
        if (!/enviar ataque/i.test(String(page.submitLabel || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) return { valid: false, blocker: 'NATIVE_NT_COMMAND_TYPE_UNVERIFIED', page };
        const reconciled = reconcileNativeNobleRows(group, page.rows);
        return { ...reconciled, page };
    };

    const createNativeTrainRows = async (targetWindow, group, { timeoutMs = 5000, intervalMs = 50 } = {}) => {
        if (!targetWindow?.document || group?.kind !== NATIVE_TRAIN || !integer(timeoutMs) || timeoutMs <= 0 || !integer(intervalMs) || intervalMs <= 0)
            return { valid: false, blocker: 'NATIVE_NT_PREPARATION_INPUT_INVALID', clicks: 0 };
        const doc = targetWindow.document;
        const identity = { sourceId: group.source?.id, sourceCoord: group.source?.coord, targetCoord: group.target?.coord };
        const initial = readNativeRows(doc, identity);
        if (!initial.valid) return { valid: false, blocker: initial.blocker, clicks: 0 };
        if (initial.rows.length > group.expectedCommands) return { valid: false, blocker: 'NATIVE_NT_UNEXPECTED_EXTRA_ROW', clicks: 0 };
        if (initial.rows.length !== 1) return { valid: false, blocker: 'NATIVE_NT_INITIAL_ROW_COUNT_MISMATCH', clicks: 0 };
        if (initial.submitButtonCount !== 1) return { valid: false, blocker: 'NATIVE_NT_SUBMIT_CONTROL_AMBIGUOUS', clicks: 0 };
        const normalizeText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
        let clicks = 0;
        while (clicks < group.expectedCommands - 1) {
            const addButtons = [...doc.querySelectorAll('button, input[type="button"]')]
                .filter(button => normalizeText(button.textContent || button.value) === 'adicionar ataque adicional' &&
                    (button.tagName === 'BUTTON' ? button.type === 'button' : button.type === 'button'));
            if (addButtons.length !== 1 || addButtons[0].disabled) return { valid: false, blocker: 'NATIVE_NT_ADD_CONTROL_UNAVAILABLE', clicks };
            addButtons[0].click();
            clicks += 1;
            const deadline = Date.now() + timeoutMs;
            let current;
            do {
                await new Promise(resolve => targetWindow.setTimeout(resolve, intervalMs));
                current = readNativeRows(doc, identity);
                if (!current.valid) return { valid: false, blocker: current.blocker, clicks };
                if (current.rows.length > group.expectedCommands) return { valid: false, blocker: 'NATIVE_NT_UNEXPECTED_EXTRA_ROW', clicks };
                if (current.rows.length >= clicks + 1) break;
            } while (Date.now() < deadline);
            if (current.rows.length < clicks + 1) return { valid: false, blocker: 'NATIVE_NT_ROW_CREATION_TIMEOUT', clicks };
        }
        const result = parseNativeConfirmation(doc, group);
        return { ...result, clicks };
    };

    const readSessionEvidence = (targetWindow, unit) => {
        const doc = targetWindow?.document;
        let url = null;
        try { url = new URL(targetWindow.location.href); } catch {}
        const game = targetWindow?.game_data || {};
        const playerId = identity(game.player?.id);
        const village = game.village || {};
        const villageCoord = targetWindow.EAS?.Utils?.parseCoordinate?.(`${village.x ?? ''}|${village.y ?? ''}`)?.coordinate || null;
        const antiBotPresent = Boolean(doc?.querySelector?.('#bot_check, #captcha, [data-antibot], .captcha, iframe[src*="captcha"], form[action*="captcha"]'));
        const loginPresent = Boolean(doc?.querySelector?.('#login_form, form[action*="login"], input[type="password"]'));
        const loggedIn = Boolean(playerId && !loginPresent);
        const expectedAccount = unit?.account;
        const accountReason = !expectedAccount?.world || !expectedAccount?.playerId ? 'ACCOUNT_IDENTITY_UNPROVEN'
            : game.world !== expectedAccount.world ? 'WORLD_IDENTITY_MISMATCH'
            : playerId !== expectedAccount.playerId ? 'PLAYER_IDENTITY_MISMATCH' : null;
        let now = null;
        try { now = targetWindow?.EAS?.MassSnipeExecution?.getCurrentServerTimeMs?.() ?? null; } catch {}
        return { now, accountValid: accountReason === null, accountReason,
            expectedAccount: copy(expectedAccount || null), observedAccount: { world: game.world || null, playerId },
            sessionAvailable: Boolean(doc && ['interactive', 'complete'].includes(doc.readyState) && loggedIn && !antiBotPresent),
            loggedIn, antiBotPresent, source: { id: identity(village.id), coord: villageCoord },
            target: { coord: unit?.target?.coord || null }, cancelled: false, completed: false,
            page: { origin: url?.origin || null, screen: url?.searchParams.get('screen') || null, tryMode: url?.searchParams.get('try') || null } };
    };

    const rallyPageIdentity = (targetWindow, unit) => {
        const url = (() => { try { return new URL(targetWindow.location.href); } catch { return null; } })();
        const village = targetWindow.game_data?.village || {};
        const sourceId = identity(village.id || url?.searchParams.get('village'));
        const sourceCoord = targetWindow.EAS?.Utils?.parseCoordinate?.(`${village.x ?? ''}|${village.y ?? ''}`)?.coordinate || null;
        return { pageValid: url?.searchParams.get('screen') === 'place' && url.searchParams.get('try') !== 'confirm',
            sourceId, sourceCoord, sourceCorrect: sourceId === String(unit.source?.id) && sourceCoord === unit.source?.coord &&
                url?.searchParams.get('village') === String(unit.source?.id) };
    };

    const setInputValue = (input, value, targetWindow) => {
        const setter = Object.getOwnPropertyDescriptor(targetWindow.HTMLInputElement?.prototype || {}, 'value')?.set;
        if (setter) setter.call(input, String(value)); else input.value = String(value);
        input.dispatchEvent(new targetWindow.Event('input', { bubbles: true }));
        input.dispatchEvent(new targetWindow.Event('change', { bubbles: true }));
    };
    const troopInputFor = (form, unit) => form.querySelector(`input[name="${unit}"]`);
    const troopAmount = value => {
        const normalized = String(value ?? '').trim().replace(/[.\s]/g, '');
        return /^\d+$/.test(normalized) && Number.isSafeInteger(Number(normalized)) ? Number(normalized) : null;
    };
    // Per-document in-flight work only. Navigation and completion live in the stored unit.
    const autoPrepareRuns = new WeakMap();
    const verifyTargetIdentity = (unit, targetWindow) => {
        const place = targetWindow.EAS?.Place;
        const expectedTarget = unit.target?.coord || null;
        const state = place?.readCommandTarget?.(targetWindow) || {};
        let readiness = null;
        try { readiness = place?.readTargetReadiness?.(expectedTarget, targetWindow, null) || null; } catch {}
        const valid = Boolean(expectedTarget && readiness?.targetReady && readiness.expectedTarget === expectedTarget &&
            readiness.resolvedCoordinate === expectedTarget);
        const reason = valid ? null : readiness?.reason || 'TARGET_RESOLUTION_UNAVAILABLE';
        return { valid, conflict: !valid && ['TARGET_RESOLUTION_MISMATCH', 'TARGET_RESOLUTION_AMBIGUOUS',
            'TARGET_INPUT_CONFLICT', 'TARGET_CONTEXT_INVALID'].includes(reason), diagnostic: {
            expectedTarget, observedTarget: state.actualTarget ?? null, expectedTargetVillageId: null,
            observedTargetVillageId: state.nativeTargetId || null, inputFound: Boolean(state.inputFound), rawInputValue: state.inputValue ?? null,
            normalizedInputTarget: state.inputTarget ?? null, nativeX: state.nativeX ?? null, nativeY: state.nativeY ?? null,
            submittedInput: state.submittedInput ?? null, coordinateFieldsFound: Boolean(state.coordinateFieldsFound),
            resolvedContainerFound: Boolean(readiness?.placeTargetFound), villageItemFound: Boolean(readiness?.villageItemFound),
            villageItemVisible: Boolean(readiness?.villageItemVisible), resolvedCoordinate: readiness?.resolvedCoordinate ?? null,
            candidates: readiness?.candidates ?? [], candidateCoordinates: readiness?.candidateCoordinates ?? [], busy: Boolean(readiness?.busy),
            targetReady: valid, readinessReason: readiness?.reason ?? null,
            evidenceSource: valid ? readiness.resolutionSource : null, reason } };
    };
    // Bounded poll: native resolution is asynchronous. Conflicting evidence fails immediately; no evidence fails at the deadline.
    const waitForTargetIdentity = async (unit, targetWindow, { timeoutMs = 5000, intervalMs = 100 } = {}) => {
        const deadline = Date.now() + timeoutMs;
        let attempts = 0;
        for (;;) {
            const result = verifyTargetIdentity(unit, targetWindow);
            attempts += 1;
            if (result.valid || result.conflict) return { ...result, attempts, timedOut: false };
            if (Date.now() >= deadline) return { ...result, attempts, timedOut: true };
            await new Promise(resolve => targetWindow.setTimeout(resolve, intervalMs));
        }
    };
    const applyApprovedComposition = async (unit, targetWindow, waitOptions = {}) => {
        if (!preparationAuthorizationValid(unit) || unit.state !== 'PRECHECK_10M')
            return { valid: false, blocker: 'PREPARATION_AUTHORIZATION_MISSING' };
        const timing = readAuthoritativeNowMs(targetWindow);
        const due = dueState(unit, timing.available ? timing.nowMs : null, 300000, 120000, 'PREPARATION_WINDOW_MISSED');
        if (!due.valid) return { valid: false, blocker: due.blocker };
        const identityResult = rallyPageIdentity(targetWindow, unit);
        if (!identityResult.pageValid) return { valid: false, blocker: 'RALLY_POINT_CONTEXT_INVALID' };
        if (!identityResult.sourceCorrect) return { valid: false, blocker: 'SOURCE_IDENTITY_MISMATCH', identity: identityResult };
        const initialSession = readSessionEvidence(targetWindow, unit);
        if (!initialSession.sessionAvailable || !initialSession.accountValid) return { valid: false, blocker: initialSession.accountReason || (initialSession.antiBotPresent ? 'ANTI_BOT_PRESENT' : 'SESSION_UNAVAILABLE_OR_UNTRUSTED') };
        if (!trustedSource(unit)) return { valid: false, blocker: 'APPROVED_SOURCE_IDENTITY_UNPROVEN' };
        const form = targetWindow.EAS?.Place?.getCommandForm?.(targetWindow.document);
        if (!form) return { valid: false, blocker: 'RALLY_POINT_FORM_MISSING' };
        const expected = unit.kind === NATIVE_TRAIN ? unit.approvedChildren[0] : unit.approvedCommand;
        const units = new Set([...(targetWindow.game_data?.units || []), ...Object.keys(expected.composition.quantities || {})]);
        const composition = nonzeroComposition(expected.composition.quantities);
        for (const unitName of units) {
            if (form.querySelectorAll(`input[name="${unitName}"]`).length > 1) return { valid: false, blocker: `TROOP_INPUT_AMBIGUOUS:${unitName}` };
        }
        const place = targetWindow.EAS?.Place;
        const log = (event, data) => { try { targetWindow.EAS?.Logger?.info?.('tactical-execution', event, data); } catch {} };
        // The native widget clears/hides the typed input once it resolves the village card,
        // so an already-resolved card for this exact coordinate needs no refill.
        const alreadyResolved = verifyTargetIdentity(unit, targetWindow);
        if (!alreadyResolved.valid) {
            const inspection = place?.inspectTargetInputs?.(targetWindow.document);
            const targetDiagnostic = inspection ? { blocker: inspection.blocker, candidates: inspection.candidates } : null;
            if (targetDiagnostic) log('TACTICAL_TARGET_INPUT_DIAGNOSTIC', targetDiagnostic);
            if (!inspection?.input || !form.contains(inspection.input))
                return { valid: false, blocker: 'TARGET_INPUT_UNAVAILABLE', detail: inspection?.blocker || 'INSPECTOR_MISSING', targetInputDiagnostic: targetDiagnostic };
            // The native widget may clear the typed value while resolving, so the fill result alone is not evidence; identity is.
            const filled = place.ensureCommandTarget?.(unit.target.coord, targetWindow);
            const verified = await waitForTargetIdentity(unit, targetWindow, waitOptions);
            const identityDiagnostic = { ...verified.diagnostic, fillReported: Boolean(filled?.targetValidated), attempts: verified.attempts, timedOut: verified.timedOut };
            if (!verified.valid) { log('TACTICAL_TARGET_IDENTITY_DIAGNOSTIC', identityDiagnostic);
                return { valid: false, blocker: 'TARGET_IDENTITY_MISMATCH', targetIdentityDiagnostic: identityDiagnostic }; }
        }
        // Re-check after the async native resolver, before any troop write.
        const freshTiming = readAuthoritativeNowMs(targetWindow);
        const freshDue = dueState(unit, freshTiming.available ? freshTiming.nowMs : null, 300000, 120000, 'PREPARATION_WINDOW_MISSED');
        if (!freshDue.valid) return { valid: false, blocker: freshDue.blocker };
        const session = readSessionEvidence(targetWindow, unit);
        if (!session.sessionAvailable || !session.accountValid || !rallyPageIdentity(targetWindow, unit).sourceCorrect)
            return { valid: false, blocker: session.antiBotPresent ? 'ANTI_BOT_PRESENT' : 'SESSION_OR_SOURCE_CHANGED' };
        if (waitOptions.stillAuthorized && !waitOptions.stillAuthorized()) return { valid: false, blocker: 'PREPARATION_AUTHORIZATION_CHANGED' };
        const targetCheck = verifyTargetIdentity(unit, targetWindow);
        log('TACTICAL_TARGET_IDENTITY_DIAGNOSTIC', targetCheck.diagnostic);
        if (!targetCheck.valid) return { valid: false, blocker: 'TARGET_IDENTITY_MISMATCH', targetIdentityDiagnostic: targetCheck.diagnostic };
        const writes = [];
        for (const unitName of units) {
            const inputs = form.querySelectorAll(`input[name="${unitName}"]`);
            if (inputs.length > 1) return { valid: false, blocker: `TROOP_INPUT_AMBIGUOUS:${unitName}` };
            const input = inputs[0], amount = Number(composition[unitName]) || 0;
            if (!input) {
                if (amount > 0) return { valid: false, blocker: `TROOP_INPUT_MISSING:${unitName}` };
                continue;
            }
            const style = targetWindow.getComputedStyle(input);
            if (input.disabled || input.readOnly || input.type !== 'text' || !input.getClientRects().length ||
                style.display === 'none' || style.visibility === 'hidden') return { valid: false, blocker: `TROOP_INPUT_UNAVAILABLE:${unitName}` };
            if (amount > 0) {
                const available = troopAmount(input.dataset?.allCount ?? input.dataset?.available ?? input.max);
                if (available == null) return { valid: false, blocker: `TROOP_AVAILABILITY_UNPROVEN:${unitName}` };
                if (amount > available) return { valid: false, blocker: `INSUFFICIENT_TROOPS:${unitName}` };
            }
            writes.push({ input, amount });
        }
        for (const { input, amount } of writes) setInputValue(input, amount || '', targetWindow);
        const actual = Object.fromEntries([...units].map(unitName => [unitName, troopAmount(troopInputFor(form, unitName)?.value) ?? 0]).filter(([, amount]) => amount > 0));
        if (!same(actual, composition)) return { valid: false, blocker: 'APPROVED_COMPOSITION_MISMATCH', actual };
        if (!verifyTargetIdentity(unit, targetWindow).valid || !rallyPageIdentity(targetWindow, unit).sourceCorrect ||
            !readSessionEvidence(targetWindow, unit).sessionAvailable || !readSessionEvidence(targetWindow, unit).accountValid) return { valid: false, blocker: 'PREPARATION_CONTEXT_CHANGED' };
        return { valid: true, sourceCorrect: true, targetCorrect: true, compositionMatches: true, targetIdentityDiagnostic: targetCheck.diagnostic,
            source: { id: identityResult.sourceId, coord: identityResult.sourceCoord }, target: { coord: unit.target.coord }, composition: actual };
    };

    const openPreparedConfirmation = (unit, targetWindow) => {
        if (!unit?.preparationAuthorization || unit.preparationAuthorization.executionUnitId !== unit.executionUnitId || unit.state !== 'PRECHECK_10M')
            return { valid: false, blocker: 'PREPARATION_AUTHORIZATION_MISSING' };
        const timing = readAuthoritativeNowMs(targetWindow);
        const due = dueState(unit, timing.available ? timing.nowMs : null, 300000, 120000, 'PREPARATION_WINDOW_MISSED');
        if (!due.valid) return { valid: false, blocker: due.blocker };
        const identityResult = rallyPageIdentity(targetWindow, unit);
        if (!identityResult.pageValid || !identityResult.sourceCorrect) return { valid: false, blocker: 'RALLY_POINT_CONTEXT_INVALID' };
        const form = targetWindow.EAS?.Place?.getCommandForm?.(targetWindow.document);
        const expected = unit.kind === NATIVE_TRAIN ? unit.approvedChildren[0] : unit.approvedCommand;
        const quantities = nonzeroComposition(expected.composition.quantities);
        const actual = Object.fromEntries(Object.entries(quantities).map(([name]) => [name, troopAmount(troopInputFor(form, name)?.value)]));
        if (!same(actual, quantities)) return { valid: false, blocker: 'APPROVED_COMPOSITION_MISMATCH', actual };
        const targetCheck = verifyTargetIdentity(unit, targetWindow);
        if (!targetCheck.valid) { try { targetWindow.EAS?.Logger?.info?.('tactical-execution', 'TACTICAL_TARGET_IDENTITY_DIAGNOSTIC', targetCheck.diagnostic); } catch {}
            return { valid: false, blocker: 'TARGET_IDENTITY_MISMATCH', targetIdentityDiagnostic: targetCheck.diagnostic }; }
        const selector = unit.commandType === 'support' ? '#target_support, input[name="support"], button[name="support"]'
            : '#target_attack, input[name="attack"], button[name="attack"]';
        const button = form?.querySelector(selector);
        if (!button || button.disabled) return { valid: false, blocker: 'RALLY_POINT_COMMAND_CONTROL_UNAVAILABLE' };
        try { targetWindow.sessionStorage.setItem('eas_tactical_preparation_context', JSON.stringify({
            executionId: unit.executionId || null, executionUnitId: unit.executionUnitId, operationId: unit.operationId, revision: unit.revision
        })); } catch { return { valid: false, blocker: 'PREPARATION_CONTEXT_STORAGE_FAILED' }; }
        const baseline = captureExecutionBaseline(unit, targetWindow);
        if (!baseline.valid) return baseline;
        button.click();
        return { valid: true, opened: true, finalSubmitClicked: false };
    };

    const readSingleConfirmation = (doc, unit, targetWindow) => {
        const form = doc?.querySelector?.('#command-confirm-form, form[action*="action=command"], form[action*="screen=place"]');
        if (!form) return { valid: false, blocker: 'CONFIRMATION_FORM_MISSING' };
        const text = String(form.innerText || form.textContent || '');
        const contains = value => value && new RegExp(`(^|\\D)${value.replace('|', '\\|')}(?=$|\\D)`).test(text);
        if (!contains(unit.target?.coord)) return { valid: false, blocker: 'TARGET_IDENTITY_MISMATCH' };
        const buttons = [...form.querySelectorAll('button, input[type="submit"]')].filter(button =>
            button.id === 'troop_confirm_submit' || /enviar (ataque|apoio)/i.test(String(button.textContent || button.value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')));
        if (buttons.length !== 1) return { valid: false, blocker: 'CONFIRMATION_SUBMIT_CONTROL_AMBIGUOUS' };
        const submitLabel = String(buttons[0].textContent || buttons[0].value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (!buttons[0].form || buttons[0].form !== form) return { valid: false, blocker: 'CONFIRMATION_SUBMIT_FORM_MISMATCH' };
        const sourceInputs = [...form.querySelectorAll('input[name="source_village"]')];
        if (sourceInputs.length !== 1) return { valid: false, blocker: 'SOURCE_IDENTITY_UNVERIFIED' };
        const formSourceId = identity(sourceInputs[0].value);
        if (!/^[1-9]\d*$/.test(formSourceId) || formSourceId !== identity(unit.source?.id)) return { valid: false, blocker: 'SOURCE_IDENTITY_MISMATCH' };
        const game = targetWindow?.game_data?.village;
        if (game?.x != null && game?.y != null && `${game.x}|${game.y}` !== unit.source?.coord) return { valid: false, blocker: 'SOURCE_IDENTITY_MISMATCH' };
        const displayedType = /enviar apoio/i.test(submitLabel) ? 'support' : /enviar ataque/i.test(submitLabel) ? 'attack' : null;
        if (!displayedType) return { valid: false, blocker: 'COMMAND_TYPE_UNVERIFIED' };
        if (displayedType !== unit.commandType) return { valid: false, blocker: 'COMMAND_TYPE_MISMATCH' };
        const composition = {};
        form.querySelectorAll('[data-unit]').forEach(node => {
            const amount = troopAmount(node.dataset?.count ?? node.textContent);
            if (amount > 0) composition[node.dataset.unit] = amount;
        });
        form.querySelectorAll('input[name]').forEach(input => {
            if (!/^(spear|sword|axe|archer|spy|light|marcher|heavy|ram|catapult|knight|snob|militia)$/.test(input.name)) return;
            const amount = troopAmount(input.value);
            if (amount > 0) composition[input.name] = amount;
        });
        form.querySelectorAll('img[src*="/unit/"]').forEach(image => {
            const unitName = /\/unit\/([a-z]+)\./i.exec(image.getAttribute('src') || '')?.[1];
            const cell = image.closest('td');
            const values = [...(cell?.textContent || '').matchAll(/[\d.]+/g)].map(match => troopAmount(match[0])).filter(value => value > 0);
            if (unitName && values.length) composition[unitName] = values[values.length - 1];
        });
        const expected = nonzeroComposition(unit.approvedCommand?.composition?.quantities);
        if (!same(composition, expected)) return { valid: false, blocker: 'APPROVED_COMPOSITION_MISMATCH', composition };
        const currentVillageId = identity(targetWindow?.game_data?.village?.id);
        if (currentVillageId !== String(unit.source?.id)) return { valid: false, blocker: 'SOURCE_IDENTITY_MISMATCH', composition };
        return { valid: true, sourceCorrect: true, targetCorrect: true, commandTypeCorrect: true,
            compositionMatches: true, confirmationContextValid: true, submitControlFound: true, composition };
    };

    const buildRallyPointUrl = (unit, targetWindow = window) => {
        const url = targetWindow.EAS?.Place?.buildPlaceUrl?.(unit?.source?.id);
        if (!url || !unit.preparationAuthorization || unit.preparationAuthorization.executionUnitId !== unit.executionUnitId)
            return { valid: false, blocker: 'PREPARATION_AUTHORIZATION_MISSING', url: null };
        url.searchParams.set('eas_tactical_execution_id', unit.executionId || '');
        url.searchParams.set('eas_tactical_unit_id', unit.executionUnitId);
        return { valid: true, url };
    };

    const collectClockSamples = async (targetWindow = window, { count = 3, intervalMs = 250 } = {}) => {
        if (!integer(count) || count < 3 || !integer(intervalMs) || intervalMs < 1 ||
            typeof targetWindow.Timing?.getCurrentServerTime !== 'function' ||
            targetWindow.EAS?.World?.getServerDateTime?.()?.available !== true)
            return { valid: false, blocker: 'CLOCK_PRECISION_UNAVAILABLE', samples: [] };
        const samples = [];
        for (let index = 0; index < count; index += 1) {
            const localNowMs = Date.now();
            let serverNowMs, synchronizedNowMs;
            try {
                synchronizedNowMs = targetWindow.Timing.getCurrentServerTime();
            }
            catch { return { valid: false, blocker: 'CLOCK_SOURCE_UNAVAILABLE', samples }; }
            const timing = readAuthoritativeNowMs(targetWindow);
            if (!timing.available) return { valid: false, blocker: timing.reason, samples };
            serverNowMs = timing.nowMs;
            const measuredAt = serverNowMs;
            if (!integer(serverNowMs) || !Number.isFinite(synchronizedNowMs)) return { valid: false, blocker: 'CLOCK_SOURCE_UNAVAILABLE', samples };
            samples.push({ serverNowMs, localNowMs, measuredAt, timingSource: 'Timing.getCurrentServerTime' });
            if (index + 1 < count) await new Promise(resolve => targetWindow.setTimeout(resolve, intervalMs));
        }
        const evidence = evaluateClockSamples(samples, samples[samples.length - 1]?.serverNowMs);
        return { ...evidence, source: 'Timing.getCurrentServerTime+World.getServerDateTime', samples };
    };

    const advanceRallyPrepared = (unit, evidence) => {
        if (!preparationAuthorizationValid(unit) || unit.state !== 'PRECHECK_10M' || unit.attemptId || unit.finalAuthorization ||
            !evidence?.valid || !evidence.sourceCorrect || !evidence.targetCorrect || !evidence.compositionMatches ||
            !evidence.targetIdentityDiagnostic?.targetReady || evidence.targetIdentityDiagnostic.resolvedCoordinate !== unit.target.coord ||
            String(evidence.source?.id) !== String(unit.source.id) || evidence.source?.coord !== unit.source.coord ||
            evidence.target?.coord !== unit.target.coord || !same(evidence.composition,
                nonzeroComposition((unit.kind === NATIVE_TRAIN ? unit.approvedChildren[0] : unit.approvedCommand).composition.quantities)) ||
            !dueState(unit, evidence.preparedAtMs, 300000, 120000, 'PREPARATION_WINDOW_MISSED').valid) return null;
        return { ...copy(unit), state: 'PREPARED', nextCheckpoint: 'SYNC_2M', nextCheckpointAtMs: unit.executionSendAtMs - 120000,
            rallyPreparation: { ...copy(unit.rallyPreparation || {}), status: 'PREPARED', evidence: copy(evidence) } };
    };
    const prepareRallyPoint = (executionId, executionUnitId, targetWindow = window) => {
        const runs = autoPrepareRuns.get(targetWindow) || new Map();
        autoPrepareRuns.set(targetWindow, runs);
        const key = `${executionId}|${executionUnitId}`;
        if (runs.has(key)) return runs.get(key);
        const run = Promise.resolve().then(async () => {
            let unit = lookup(executionId, executionUnitId);
            if (!preparationAuthorizationValid(unit)) return { valid: false, blocker: 'PREPARATION_AUTHORIZATION_MISSING' };
            if (!navigationContextValid(unit, targetWindow)) return { valid: false, blocker: 'NAVIGATION_CONTEXT_MISMATCH' };
            if (unit.state === 'PREPARED') return { valid: true, alreadyPrepared: true, unit };
            if (unit.state !== 'PRECHECK_10M' || unit.attemptId || unit.finalAuthorization)
                return { valid: false, blocker: 'PREPARATION_STATE_INELIGIBLE' };
            const stillAuthorized = () => {
                const current = lookup(executionId, executionUnitId);
                return current?.state === 'PRECHECK_10M' && preparationAuthorizationValid(current) &&
                    same(current.preparationAuthorization, unit.preparationAuthorization) &&
                    current.rallyPreparation?.navigationId === unit.rallyPreparation?.navigationId &&
                    navigationContextValid(current, targetWindow) && !current.attemptId && !current.finalAuthorization;
            };
            const clock = readAuthoritativeNowMs(targetWindow);
            executionLog('TACTICAL_PREPARATION_BOOTSTRAP_RESUMED', unit, { serverNow: clock.nowMs,
                checkpointAtMs: unit.executionSendAtMs - 300000, deltaMs: clock.available ? clock.nowMs - (unit.executionSendAtMs - 300000) : null });
            if (unit.rallyPreparation) {
                const session = readSessionEvidence(targetWindow, unit);
                if (!session.accountValid || !session.sessionAvailable || !rallyPageIdentity(targetWindow, unit).sourceCorrect)
                    return { valid: false, blocker: session.accountReason || 'SOURCE_IDENTITY_MISMATCH' };
                if (!clock.available || clock.nowMs >= unit.rallyPreparation.deadlineAtMs) return navigationFailure(unit, 'NAVIGATION_ACK_TIMEOUT');
                const arrived = { ...copy(unit), rallyPreparation: { ...copy(unit.rallyPreparation), status: 'PREPARING', arrivedAtMs: clock.nowMs } };
                unit = updateStoredUnit(executionId, executionUnitId, arrived);
                if (!unit) return { valid: false, blocker: 'PREPARATION_CONTEXT_STORAGE_FAILED' };
            }
            const result = await applyApprovedComposition(unit, targetWindow, { stillAuthorized });
            if (!stillAuthorized()) return { valid: false, blocker: 'PREPARATION_AUTHORIZATION_CHANGED' };
            const current = lookup(executionId, executionUnitId);
            if (!result.valid) {
                const blocked = copy(current); block(blocked, result.blocker);
                blocked.rallyPreparation = { ...copy(current.rallyPreparation || {}), status: 'BLOCKED', blocker: result.blocker,
                    targetIdentityDiagnostic: result.targetIdentityDiagnostic || result.targetInputDiagnostic || null };
                updateStoredUnit(executionId, executionUnitId, blocked);
                executionLog('TACTICAL_PREPARATION_BLOCKED', blocked, result);
                return result;
            }
            const timing = readAuthoritativeNowMs(targetWindow);
            const next = advanceRallyPrepared(current, { ...result, preparedAtMs: timing.nowMs });
            const saved = next && updateStoredUnit(executionId, executionUnitId, next);
            if (!saved) return { valid: false, blocker: 'PREPARATION_PERSIST_READBACK_FAILED' };
            executionLog('TACTICAL_PREPARATION_COMPLETED', saved, { preparedAtMs: timing.nowMs, result: 'PREPARED',
                target: result.targetIdentityDiagnostic, composition: result.composition });
            return { ...result, unit: saved };
        }).finally(() => runs.delete(key));
        runs.set(key, run);
        return run;
    };
    // Read-only: nothing is written, clicked or submitted.
    const verifyPreparedForm = (unit, targetWindow) => {
        if (!navigationContextValid(unit, targetWindow) || !unit.rallyPreparation) return 'NAVIGATION_CONTEXT_MISMATCH';
        const session = readSessionEvidence(targetWindow, unit);
        if (!session.accountValid) return session.accountReason;
        if (!session.sessionAvailable) return session.antiBotPresent ? 'ANTI_BOT_PRESENT' : 'SESSION_UNAVAILABLE_OR_UNTRUSTED';
        if (!trustedSource(unit)) return 'APPROVED_SOURCE_IDENTITY_UNPROVEN';
        const page = rallyPageIdentity(targetWindow, unit);
        if (!page.pageValid) return 'RALLY_POINT_CONTEXT_INVALID';
        if (!page.sourceCorrect) return 'SOURCE_IDENTITY_MISMATCH';
        const form = targetWindow.EAS?.Place?.getCommandForm?.(targetWindow.document);
        if (!form) return 'RALLY_POINT_FORM_MISSING';
        if (!verifyTargetIdentity(unit, targetWindow).valid) return 'TARGET_IDENTITY_MISMATCH';
        const expected = unit.kind === NATIVE_TRAIN ? unit.approvedChildren[0] : unit.approvedCommand;
        const composition = nonzeroComposition(expected.composition.quantities);
        const names = new Set([...(targetWindow.game_data?.units || []), ...Object.keys(composition)]);
        const actual = {};
        for (const name of names) {
            const inputs = form.querySelectorAll(`input[name="${name}"]`);
            if (inputs.length > 1) return `TROOP_INPUT_AMBIGUOUS:${name}`;
            const amount = troopAmount(inputs[0]?.value) ?? 0;
            if (amount > 0) actual[name] = amount;
        }
        return same(actual, composition) ? null : 'APPROVED_COMPOSITION_MISMATCH';
    };
    const syncRuns = new WeakMap();
    const synchronizePrepared = (executionId, executionUnitId, targetWindow = window) => {
        const runs = syncRuns.get(targetWindow) || new Set();
        syncRuns.set(targetWindow, runs);
        const key = `${executionId}|${executionUnitId}`;
        if (runs.has(key)) return Promise.resolve({ valid: false, blocker: 'SYNC_ALREADY_RUNNING' });
        runs.add(key);
        return Promise.resolve().then(async () => {
            const unit = lookup(executionId, executionUnitId);
            if (!unit || unit.state !== 'PREPARED' || !preparationAuthorizationValid(unit) || unit.attemptId || unit.finalAuthorization)
                return { valid: false, blocker: 'SYNC_STATE_INELIGIBLE' };
            const fail = reason => {
                const current = lookup(executionId, executionUnitId);
                if (current?.state === 'PREPARED') { const blocked = copy(current); block(blocked, reason); updateStoredUnit(executionId, executionUnitId, blocked); }
                executionLog('TACTICAL_SYNC_2M_BLOCKED', unit, { reason });
                return { valid: false, blocker: reason };
            };
            const formBlocker = verifyPreparedForm(unit, targetWindow);
            if (formBlocker) return fail(formBlocker);
            const clock = await collectClockSamples(targetWindow);
            if (!clock.source) return fail(clock.blocker || 'CLOCK_PRECISION_UNAVAILABLE');
            const again = verifyPreparedForm(lookup(executionId, executionUnitId) || unit, targetWindow);
            if (again) return fail(again);
            const now = clock.samples[clock.samples.length - 1]?.serverNowMs;
            const next = advanceSync2m(unit, { now, samples: clock.samples, source: clock.source, preparedFormValid: true });
            if (next.state === 'PREPARED') return { valid: false, blocker: 'SYNC_NOT_DUE' };
            if (next.state !== 'SYNC_2M') return fail(next.blockers[next.blockers.length - 1]);
            const saved = updateStoredUnit(executionId, executionUnitId, next);
            if (!saved) return fail('PERSISTED_STATE_TRANSITION_REJECTED');
            executionLog('TACTICAL_SYNC_2M_COMPLETED', saved, { now, clockFrame: describeClockFrame(saved.clockEvidence?.serverClockOffsetMs), spreadMs: clock.spreadMs });
            return { valid: true, unit: saved };
        }).finally(() => runs.delete(key));
    };
    const finalRuns = new WeakMap();
    const finalizePrepared = (executionId, executionUnitId, targetWindow = window) => {
        const runs = finalRuns.get(targetWindow) || new Set();
        finalRuns.set(targetWindow, runs);
        const key = `${executionId}|${executionUnitId}`;
        if (runs.has(key)) return Promise.resolve({ valid: false, blocker: 'FINAL_CHECK_ALREADY_RUNNING' });
        runs.add(key);
        return Promise.resolve().then(async () => {
            const unit = lookup(executionId, executionUnitId);
            if (!unit || unit.state !== 'SYNC_2M' || unit.syncEvidence?.preparedFormValid !== true || unit.attemptId || unit.finalAuthorization || !preparationAuthorizationValid(unit))
                return { valid: false, blocker: 'FINAL_CHECK_STATE_INELIGIBLE' };
            const fail = (reason, evidenceUnit = null) => {
                const current = lookup(executionId, executionUnitId);
                if (current?.state === 'SYNC_2M') {
                    const blocked = evidenceUnit?.state === 'BLOCKED' ? copy(evidenceUnit) : copy(current);
                    block(blocked, reason);
                    updateStoredUnit(executionId, executionUnitId, blocked);
                }
                executionLog('TACTICAL_FINAL_CHECK_BLOCKED', unit, { reason });
                return { valid: false, blocker: reason };
            };
            const timing = readAuthoritativeNowMs(targetWindow);
            if (!timing.available) return fail(timing.reason);
            const due = dueState(unit, timing.nowMs, FINAL_CHECK_START_MS, FINAL_CHECK_END_MS, 'FINAL_CHECK_WINDOW_MISSED');
            if (due.notDue) return { valid: false, blocker: 'FINAL_CHECK_NOT_DUE' };
            if (!due.valid) return fail(due.blocker);
            if (wasConsumed(unit, targetWindow.localStorage)) return fail('PREVIOUS_ATTEMPT_OR_UNCERTAIN_SEND');
            const formBlocker = verifyPreparedForm(unit, targetWindow);
            if (formBlocker) return fail(formBlocker);
            const form = targetWindow.EAS.Place.getCommandForm(targetWindow.document);
            const controlSelector = unit.commandType === 'support' ? '#target_support, input[name="support"], button[name="support"]'
                : '#target_attack, input[name="attack"], button[name="attack"]';
            const controls = [...form.querySelectorAll(controlSelector)];
            if (controls.length !== 1 || controls[0].disabled) return fail('RALLY_POINT_COMMAND_CONTROL_UNAVAILABLE');
            const fresh = await collectClockSamples(targetWindow);
            if (!fresh.valid) return fail(fresh.blocker || 'CLOCK_PRECISION_UNAVAILABLE');
            const again = verifyPreparedForm(lookup(executionId, executionUnitId) || unit, targetWindow);
            if (again) return fail(again);
            const now = fresh.samples[fresh.samples.length - 1].serverNowMs;
            const expected = unit.kind === NATIVE_TRAIN ? unit.approvedChildren[0] : unit.approvedCommand;
            const offsetDriftMs = Math.abs(fresh.serverClockOffsetMs - unit.clockEvidence.serverClockOffsetMs);
            const evidence = { fromPreparedForm: true, now, authorizationValid: true, sessionTrusted: true, sourceCorrect: true, targetCorrect: true,
                commandTypeCorrect: true, compositionMatches: true, confirmationContextValid: true, singleSubmitControlFound: true,
                clockEvidenceFresh: now >= unit.clockEvidence.measuredAt && now - unit.clockEvidence.measuredAt <= 120000,
                clockConsistent: unit.clockEvidence.source === fresh.source && offsetDriftMs <= 500, offsetDriftMs,
                clockFrame: describeClockFrame(fresh.serverClockOffsetMs), clockSource: fresh.source, clockSpreadMs: fresh.spreadMs, sampleCount: fresh.sampleCount,
                commandType: unit.commandType, source: { id: String(unit.source.id), coord: unit.source.coord }, target: { coord: unit.target.coord },
                composition: nonzeroComposition(expected.composition.quantities) };
            const next = advanceFinalCheck(unit, evidence);
            if (next.state === 'SYNC_2M') return { valid: false, blocker: 'FINAL_CHECK_NOT_DUE' };
            if (next.state !== 'READY_TO_SEND') return fail(next.blockers[next.blockers.length - 1], next);
            const saved = updateStoredUnit(executionId, executionUnitId, next);
            if (!saved) return fail('PERSISTED_STATE_TRANSITION_REJECTED');
            executionLog('TACTICAL_FINAL_CHECK_COMPLETED', saved, { now, offsetDriftMs, clockFrame: describeClockFrame(fresh.serverClockOffsetMs) });
            return { valid: true, unit: saved };
        }).finally(() => runs.delete(key));
    };
    const CONFIRMATION_START_MS = 50000, CONFIRMATION_END_MS = 10000, CONFIRMATION_TOLERANCE_MS = 1000;
    const COMMAND_CONTROL = { support: '#target_support, input[name="support"], button[name="support"]', attack: '#target_attack, input[name="attack"], button[name="attack"]' };
    const parseNativeDuration = doc => {
        const values = new Set();
        for (const row of doc?.querySelectorAll?.('tr') || []) {
            const text = String(row.textContent || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
            const match = /^\s*duracao\s*:?\s*(\d+):(\d{2}):(\d{2})\s*$/i.exec(text);
            if (match) values.add((Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000);
        }
        return values.size === 1 ? { available: true, durationMs: [...values][0] } : { available: false, reason: values.size ? 'CONFIRMATION_DURATION_AMBIGUOUS' : 'CONFIRMATION_DURATION_UNAVAILABLE' };
    };
    const confirmationRuns = new WeakMap();
    const failConfirmation = (executionId, executionUnitId, unit, reason) => {
        const current = lookup(executionId, executionUnitId);
        if (current?.state === 'READY_TO_SEND') { const blocked = copy(current); block(blocked, reason); updateStoredUnit(executionId, executionUnitId, blocked); }
        executionLog('TACTICAL_CONFIRMATION_BLOCKED', unit, { reason });
        return { valid: false, blocker: reason };
    };
    // Rally Point -> native confirmation. Clicks only Ataque/Apoio (never the final submit); no attempt/baseline/authorization is created.
    const openConfirmationFromPrepared = (executionId, executionUnitId, targetWindow = window) => {
        const runs = confirmationRuns.get(targetWindow) || new Set();
        confirmationRuns.set(targetWindow, runs);
        const key = `open|${executionId}|${executionUnitId}`;
        if (runs.has(key)) return { valid: false, blocker: 'CONFIRMATION_OPEN_ALREADY_RUNNING' };
        runs.add(key);
        try {
            const unit = lookup(executionId, executionUnitId);
            if (!unit || unit.state !== 'READY_TO_SEND' || unit.finalCheckEvidence?.fromPreparedForm !== true || unit.kind !== SINGLE || unit.confirmationIntent ||
                unit.attemptId || unit.outgoingBaseline || unit.finalAuthorization || !preparationAuthorizationValid(unit)) return { valid: false, blocker: 'CONFIRMATION_STATE_INELIGIBLE' };
            const fail = reason => failConfirmation(executionId, executionUnitId, unit, reason);
            const timing = readAuthoritativeNowMs(targetWindow);
            if (!timing.available) return fail(timing.reason);
            const due = dueState(unit, timing.nowMs, CONFIRMATION_START_MS, CONFIRMATION_END_MS, 'CONFIRMATION_WINDOW_MISSED');
            if (due.notDue) return { valid: false, blocker: 'CONFIRMATION_NOT_DUE' };
            if (!due.valid) return fail(due.blocker);
            if (wasConsumed(unit, targetWindow.localStorage)) return fail('PREVIOUS_ATTEMPT_OR_UNCERTAIN_SEND');
            const formBlocker = verifyPreparedForm(unit, targetWindow);
            if (formBlocker) return fail(formBlocker);
            const form = targetWindow.EAS.Place.getCommandForm(targetWindow.document);
            const controls = [...form.querySelectorAll(COMMAND_CONTROL[unit.commandType] || '')];
            if (controls.length !== 1 || controls[0].disabled) return fail('RALLY_POINT_COMMAND_CONTROL_UNAVAILABLE');
            const navigationId = unit.rallyPreparation.navigationId;
            const intent = { status: 'NAVIGATING', navigationId, tabName: unit.rallyPreparation.tabName, startedAtMs: timing.nowMs,
                deadlineAtMs: Math.min(timing.nowMs + 20000, unit.executionSendAtMs - FINAL_CHECK_END_MS), commandType: unit.commandType,
                source: { id: String(unit.source.id), coord: unit.source.coord }, target: { coord: unit.target.coord },
                composition: nonzeroComposition(unit.approvedCommand.composition.quantities) };
            try { targetWindow.sessionStorage.setItem('eas_tactical_preparation_context', JSON.stringify({
                executionId, executionUnitId, operationId: unit.operationId, revision: unit.revision })); } catch { return fail('PREPARATION_CONTEXT_STORAGE_FAILED'); }
            if (!updateStoredUnit(executionId, executionUnitId, { ...copy(unit), confirmationIntent: intent })) return fail('PERSISTED_STATE_TRANSITION_REJECTED');
            executionLog('TACTICAL_CONFIRMATION_NAVIGATION_STARTED', unit, { navigationId, deadlineAtMs: intent.deadlineAtMs });
            try { controls[0].click(); } catch { return fail('CONFIRMATION_NAVIGATION_FAILED'); }
            return { valid: true, navigationStarted: true, finalSubmitClicked: false };
        } finally { runs.delete(key); }
    };
    // Runs on the native confirmation page. Read-only: never clicks the final submit.
    const captureConfirmation = (executionId, executionUnitId, targetWindow = window) => {
        const runs = confirmationRuns.get(targetWindow) || new Set();
        confirmationRuns.set(targetWindow, runs);
        const key = `capture|${executionId}|${executionUnitId}`;
        if (runs.has(key)) return { valid: false, blocker: 'CONFIRMATION_CAPTURE_ALREADY_RUNNING' };
        runs.add(key);
        try {
            const unit = lookup(executionId, executionUnitId);
            if (!unit || unit.state !== 'READY_TO_SEND' || unit.finalCheckEvidence?.fromPreparedForm !== true || unit.kind !== SINGLE || unit.confirmationIntent?.status !== 'NAVIGATING' ||
                unit.attemptId || unit.outgoingBaseline || unit.finalAuthorization || !preparationAuthorizationValid(unit)) return { valid: false, blocker: 'CONFIRMATION_STATE_INELIGIBLE' };
            const fail = reason => failConfirmation(executionId, executionUnitId, unit, reason);
            const intent = unit.confirmationIntent;
            const page = new URL(targetWindow.location.href);
            if (page.searchParams.get('screen') !== 'place' || page.searchParams.get('try') !== 'confirm') return { valid: false, blocker: 'NOT_CONFIRMATION_PAGE' };
            let context = null;
            try { context = JSON.parse(targetWindow.sessionStorage.getItem('eas_tactical_preparation_context') || 'null'); } catch {}
            if (targetWindow.name !== intent.tabName || context?.executionUnitId !== executionUnitId || context?.executionId !== executionId ||
                context?.operationId !== unit.operationId || context?.revision !== unit.revision) return fail('CONFIRMATION_CONTEXT_INVALID');
            const timing = readAuthoritativeNowMs(targetWindow);
            if (!timing.available) return fail(timing.reason);
            if (timing.nowMs > intent.deadlineAtMs) return fail(timing.nowMs > unit.executionSendAtMs - FINAL_CHECK_END_MS ? 'CONFIRMATION_WINDOW_MISSED' : 'CONFIRMATION_NAVIGATION_TIMEOUT');
            const session = readSessionEvidence(targetWindow, unit);
            if (!session.accountValid) return fail(session.accountReason);
            if (!session.sessionAvailable) return fail(session.antiBotPresent ? 'ANTI_BOT_PRESENT' : 'SESSION_UNAVAILABLE_OR_UNTRUSTED');
            if (!trustedSource(unit)) return fail('APPROVED_SOURCE_IDENTITY_UNPROVEN');
            if (wasConsumed(unit, targetWindow.localStorage)) return fail('PREVIOUS_ATTEMPT_OR_UNCERTAIN_SEND');
            const read = readSingleConfirmation(targetWindow.document, unit, targetWindow);
            if (!read.valid) return fail(read.blocker);
            const duration = parseNativeDuration(targetWindow.document);
            if (!duration.available) return fail(duration.reason);
            const command = unit.approvedCommand;
            const durationDeltaMs = duration.durationMs - command.travelTimeMs;
            if (Math.abs(durationDeltaMs) > CONFIRMATION_TOLERANCE_MS) return fail('CONFIRMATION_DURATION_MISMATCH');
            const predictedArrivalMs = unit.executionSendAtMs + duration.durationMs;
            if (Math.abs(predictedArrivalMs - command.desiredArrivalMs) > CONFIRMATION_TOLERANCE_MS) return fail('CONFIRMATION_ARRIVAL_MISMATCH');
            const evidence = { valid: true, capturedAtMs: timing.nowMs, navigationId: intent.navigationId, commandType: unit.commandType,
                source: { id: String(unit.source.id), coord: unit.source.coord }, target: { coord: unit.target.coord }, composition: read.composition,
                nativeDurationMs: duration.durationMs, expectedTravelTimeMs: command.travelTimeMs, durationDeltaMs, predictedArrivalMs,
                desiredArrivalMs: command.desiredArrivalMs, submitControlCount: 1 };
            const next = advanceConfirmationReady(unit, evidence);
            if (next.state !== 'CONFIRMATION_READY') return fail(next.blockers[next.blockers.length - 1]);
            const saved = updateStoredUnit(executionId, executionUnitId, next);
            if (!saved) return fail('PERSISTED_STATE_TRANSITION_REJECTED');
            executionLog('TACTICAL_CONFIRMATION_READY', saved, { nativeDurationMs: duration.durationMs, durationDeltaMs });
            return { valid: true, unit: saved, finalSubmitClicked: false };
        } finally { runs.delete(key); }
    };
    const navigationWindows = new WeakMap();
    const navigationFailure = (unit, reason, options = {}) => {
        const next = { ...copy(unit), rallyPreparation: { ...copy(unit.rallyPreparation || {}), status: 'FAILED', reason } };
        updateStoredUnit(unit.executionId, unit.executionUnitId, next, options);
        executionLog('TACTICAL_NAVIGATION_FAILED', next, { reason, manualRecoveryRequired: true });
        return { valid: false, blocker: reason };
    };
    const navigationContextValid = (unit, targetWindow) => {
        const intent = unit.rallyPreparation;
        if (!intent) return true; // previously authorized direct preparation URL
        if (!intent.navigationId || !['NAVIGATING', 'PREPARING', 'PREPARED'].includes(intent.status)) return false;
        const page = new URL(targetWindow.location.href);
        return page.searchParams.get('eas_tactical_navigation_id') === intent.navigationId && targetWindow.name === intent.tabName;
    };
    const openRallyPointLocked = (unit, targetWindow = window, options = {}) => {
        // Both the manual button and scheduler use this service. Re-read the persisted authorization.
        unit = lookup(unit?.executionId, unit?.executionUnitId, options) || unit;
        const timing = readAuthoritativeNowMs(targetWindow);
        const nowMs = timing.available ? timing.nowMs : null;
        const checkpointAtMs = integer(unit?.executionSendAtMs) ? unit.executionSendAtMs - 300000 : null;
        let expectedUrl = null;
        const finish = (result, reason, navigationStarted = false, outcome = null) => {
            const diagnostic = { action: options.automatic ? 'AUTOMATIC_PREPARE_5M_OPEN_RALLY_POINT' : 'MANUAL_PREPARE_5M_OPEN_RALLY_POINT',
                stage: 'PREPARE_5M', previousState: unit?.state, attemptedAtMs: nowMs, serverNow: nowMs, checkpointAtMs,
                result, outcome: outcome || (navigationStarted ? 'NAVIGATION_STARTED' : result === 'ACCEPTED' ? 'NAVIGATION_ALREADY_IN_PROGRESS' : 'NAVIGATION_BLOCKED'),
                navigationId: unit?.rallyPreparation?.navigationId ?? null, reason: result === 'REJECTED' ? reason : null, blocker: result === 'REJECTED' ? reason : null,
                timingProviderReason: timing.available ? null : timing.reason, navigationStarted, expectedUrl,
                deltaMs: nowMs !== null && checkpointAtMs !== null ? nowMs - checkpointAtMs : null,
                executionId: unit?.executionId ?? null, executionUnitId: unit?.executionUnitId ?? null,
                operationId: unit?.operationId ?? null, revision: unit?.revision ?? null };
            // Repeated observations of one in-flight navigation are coalesced so they cannot evict the bounded history.
            let diagnosticRecorded = false, coalesced = false;
            if (diagnostic.outcome === 'NAVIGATION_ALREADY_IN_PROGRESS') {
                const entries = readPreflightDiagnostics(options), last = entries[entries.length - 1];
                if (last && last.outcome === diagnostic.outcome && last.navigationId === diagnostic.navigationId && last.executionUnitId === diagnostic.executionUnitId) {
                    entries[entries.length - 1] = { ...last, observations: (last.observations || 1) + 1, lastObservedAtMs: nowMs, serverNow: nowMs, deltaMs: diagnostic.deltaMs };
                    const storage = options.storage || (typeof localStorage === 'undefined' ? null : localStorage);
                    try { storage.setItem(preflightDiagnosticStorageKey(options), JSON.stringify({ version: 1, entries })); diagnosticRecorded = coalesced = true; } catch {}
                }
            }
            if (!coalesced) diagnosticRecorded = recordPreflightDiagnostic(diagnostic, options);
            if (unit && !coalesced) executionLog('TACTICAL_PREPARATION_NAVIGATION', unit, diagnostic);
            return { valid: result === 'ACCEPTED', opened: navigationStarted, blocker: result === 'REJECTED' ? reason : null,
                diagnosticRecorded, attemptedAtMs: nowMs, url: expectedUrl };
        };
        if (['PREPARED', 'SYNC_2M', 'FINAL_CHECK', 'READY_TO_SEND'].includes(unit?.state) && unit.rallyPreparation?.status === 'PREPARED')
            return { ...finish('REJECTED', 'PREPARATION_ALREADY_PREPARED', false, 'NAVIGATION_ALREADY_PREPARED'), alreadyPrepared: true };
        if (unit?.state !== 'PRECHECK_10M' || !preparationAuthorizationValid(unit))
            return finish('REJECTED', 'PREPARATION_AUTHORIZATION_MISSING');
        if (unit.attemptId || unit.outgoingBaseline || unit.finalAuthorization) return finish('REJECTED', 'PREPARATION_STATE_INELIGIBLE');
        const due = dueState(unit, nowMs, 300000, 120000, 'PREPARATION_WINDOW_MISSED');
        if (!due.valid) return finish('REJECTED', due.blocker);
        const session = readSessionEvidence(targetWindow, unit);
        if (!session.sessionAvailable || !session.accountValid) return finish('REJECTED', session.accountReason || 'SESSION_UNAVAILABLE_OR_UNTRUSTED');
        if (!trustedSource(unit)) return finish('REJECTED', 'APPROVED_SOURCE_IDENTITY_UNPROVEN');
        const place = buildRallyPointUrl(unit, targetWindow);
        if (!place.valid) return finish('REJECTED', place.blocker);
        expectedUrl = place.url.toString();
        const previous = unit.rallyPreparation;
        if (previous?.expectedUrl) expectedUrl = previous.expectedUrl;
        const handles = navigationWindows.get(targetWindow) || new Map();
        navigationWindows.set(targetWindow, handles);
        if (previous && ['NAVIGATING', 'PREPARING'].includes(previous.status)) {
            const child = handles.get(previous.navigationId);
            const closed = child?.closed === true;
            if (closed || !integer(previous.deadlineAtMs) || nowMs >= previous.deadlineAtMs) {
                const failure = navigationFailure(unit, closed ? 'PREPARATION_TAB_CLOSED' : 'NAVIGATION_ACK_TIMEOUT', options);
                return finish('REJECTED', failure.blocker, false, 'NAVIGATION_FAILED');
            }
            return { ...finish('ACCEPTED', null, false, 'NAVIGATION_ALREADY_IN_PROGRESS'), alreadyStarted: true };
        }
        if (previous?.status === 'FAILED' && options.automatic) return { valid: false, blocker: previous.reason, manualRecoveryRequired: true };
        // An explicit manual recovery creates a NEW tab identity. A late old tab cannot resume it.
        const navigationId = targetWindow.crypto?.randomUUID?.();
        if (!navigationId) return finish('REJECTED', 'NAVIGATION_IDENTITY_UNAVAILABLE');
        const tabName = `eas-tactical-preparation-${navigationId}`;
        place.url.searchParams.set('eas_tactical_navigation_id', navigationId);
        expectedUrl = place.url.toString();
        const pending = { ...copy(unit), rallyPreparation: { status: 'NAVIGATING', navigationId, tabName,
            startedAtMs: nowMs, deadlineAtMs: Math.min(nowMs + 30000, unit.executionSendAtMs - 120000),
            expectedUrl, executionId: unit.executionId, executionUnitId: unit.executionUnitId } };
        if (!updateStoredUnit(unit.executionId, unit.executionUnitId, pending, options))
            return finish('REJECTED', 'PREPARATION_CONTEXT_STORAGE_FAILED');
        try {
            const child = targetWindow.open?.(expectedUrl, tabName);
            if (!child) {
                navigationFailure(pending, 'RALLY_POINT_POPUP_BLOCKED', options);
                return finish('REJECTED', 'RALLY_POINT_POPUP_BLOCKED', false, 'NAVIGATION_FAILED');
            }
            handles.set(navigationId, child);
        } catch {
            navigationFailure(pending, 'RALLY_POINT_NAVIGATION_FAILED', options);
            return finish('REJECTED', 'RALLY_POINT_NAVIGATION_FAILED', false, 'NAVIGATION_FAILED');
        }
        return finish('ACCEPTED', null, true);
    };

    const openRallyPoint = async (unit, targetWindow = window, options = {}) => {
        // Cross-tab serialization is needed: localStorage read/write alone is not a claim.
        if (!targetWindow.navigator?.locks?.request) {
            if (unit) executionLog('TACTICAL_NAVIGATION_FAILED', unit, { reason: 'NAVIGATION_LOCK_UNAVAILABLE' });
            return { valid: false, blocker: 'NAVIGATION_LOCK_UNAVAILABLE' };
        }
        try {
            return await targetWindow.navigator.locks.request(`eas-tactical-navigation:${unit?.executionId}:${unit?.executionUnitId}`,
                () => openRallyPointLocked(unit, targetWindow, options));
        } catch {
            return { valid: false, blocker: 'NAVIGATION_LOCK_FAILED' };
        }
    };

    const initializePreparationPage = targetWindow => {
        const doc = targetWindow?.document;
        if (!doc) return false;
        const url = (() => { try { return new URL(targetWindow.location.href); } catch { return null; } })();
        let storedContext = null;
        try { storedContext = JSON.parse(targetWindow.sessionStorage.getItem('eas_tactical_preparation_context') || 'null'); } catch {}
        const executionId = url?.searchParams.get('eas_tactical_execution_id') || storedContext?.executionId;
        const executionUnitId = url?.searchParams.get('eas_tactical_unit_id') || storedContext?.executionUnitId;
        if (url?.searchParams.get('try') !== 'confirm' &&
            (!url?.searchParams.get('eas_tactical_execution_id') || !url?.searchParams.get('eas_tactical_unit_id'))) return false;
        if (!executionId || !executionUnitId) return false;
        const execution = list().find(item => item.executionId === executionId);
        let unit = execution?.units.find(item => item.executionUnitId === executionUnitId);
        if (!unit || !preparationAuthorizationValid(unit) || !navigationContextValid(unit, targetWindow)) return false;
        unit = recoverFinalExecution(executionId, executionUnitId, targetWindow) || unit;
        const session = readSessionEvidence(targetWindow, unit);
        const panelId = 'eas-tactical-preparation-panel';
        doc.getElementById(panelId)?.remove();
        const panel = doc.createElement('aside');
        panel.id = panelId;
        panel.className = 'fake-execution-panel scheduled-mission-panel';
        panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;max-width:360px;padding:12px;background:#fff;border:1px solid #777;box-shadow:0 2px 8px #0004';
        const title = doc.createElement('strong');
        title.textContent = unit.kind === NATIVE_TRAIN ? `NT(${unit.count}) — preparação aprovada` : 'Comando aprovado — preparação';
        const summary = doc.createElement('p');
        summary.textContent = `${unit.source.name || unit.source.coord} ${unit.source.coord} → ${unit.target.coord} · ${formatServerTimestamp(unit.executionSendAtMs)}`;
        const status = doc.createElement('p');
        status.textContent = session.sessionAvailable ? `Sessão verificada · ${unit.state}` : `BLOCKED: ${session.antiBotPresent ? 'ANTI_BOT_PRESENT' : 'SESSION_UNAVAILABLE_OR_UNTRUSTED'}`;
        const actions = doc.createElement('div');
        const action = (label, handler) => {
            const button = doc.createElement('button'); button.type = 'button'; button.textContent = label;
            button.addEventListener('click', async () => { button.disabled = true; try { await handler(); } catch (error) { status.textContent = `BLOCKED: ${error?.message || 'PREPARATION_FAILED'}`; } finally { button.disabled = false; } });
            actions.append(button); return button;
        };
        const finalActions = () => {
            if (unit.state !== 'READY_TO_SEND' || unit.finalCheckEvidence?.fromPreparedForm === true || actions.querySelector('[data-final-execution]')) return;
            const arm = async dryRun => {
                const result = await armFinalExecution(executionId, executionUnitId, targetWindow, { dryRun, onStatus: message => { status.textContent = message; } });
                if (!result.armed) status.textContent = `BLOCKED: ${result.blocker}`;
            };
            const dry = action('DRY RUN - armar sem enviar', () => arm(true)); dry.dataset.finalExecution = 'dry';
            action('Autorizar envio real', async () => {
                const authorized = authorizeFinalSubmit(executionId, executionUnitId, targetWindow);
                if (!authorized) { status.textContent = 'BLOCKED: FINAL_AUTHORIZATION_REJECTED'; return; }
                unit = authorized; await arm(false);
            });
        };
        const refreshUnit = updated => { if (updated) unit = updated; };
        const saveUnit = updated => { const saved = updateStoredUnit(executionId, executionUnitId, updated); refreshUnit(saved); return saved; };
        const syncAndFinal = async () => {
                const clock = await collectClockSamples(targetWindow);
                const currentNow = targetWindow.EAS.MassSnipeExecution.getCurrentServerTimeMs();
                const synchronized = advanceSync2m(unit, { now: currentNow, samples: clock.samples || [], source: clock.source });
                if (synchronized.state !== 'SYNC_2M') { saveUnit(synchronized); status.textContent = `BLOCKED: ${synchronized.blockers.join(', ')}`; return; }
                const synchronizedSaved = saveUnit(synchronized);
                if (!synchronizedSaved) { status.textContent = 'BLOCKED: PERSISTED_STATE_TRANSITION_REJECTED'; return; }
                const live = unit.kind === NATIVE_TRAIN ? parseNativeConfirmation(doc, unit) : readSingleConfirmation(doc, unit, targetWindow);
                const freshClock = currentNow - synchronized.clockEvidence.measuredAt <= 120000 && currentNow >= synchronized.clockEvidence.measuredAt;
                const evidence = { now: currentNow, authorizationValid: unit.preparationAuthorization?.executionUnitId === unit.executionUnitId,
                    sessionTrusted: readSessionEvidence(targetWindow, unit).sessionAvailable,
                    sourceCorrect: String(targetWindow.game_data?.village?.id) === String(unit.source?.id), targetCorrect: live.valid,
                    commandTypeCorrect: live.valid, compositionMatches: live.valid, confirmationContextValid: live.valid,
                    clockEvidenceFresh: freshClock, ...(unit.kind === NATIVE_TRAIN
                        ? { nativeReconciliation: live, singleSubmitControlFound: live.page?.submitButtonCount === 1 }
                        : { singleSubmitControlFound: live.submitControlFound === true }) };
                const ready = advanceFinalCheck(synchronized, evidence);
                const readySaved = saveUnit(ready);
                status.textContent = !readySaved ? 'BLOCKED: PERSISTED_STATE_TRANSITION_REJECTED' : ready.state === 'READY_TO_SEND' ? 'READY_TO_SEND · escolha DRY RUN ou Autorizar envio real.' : `BLOCKED: ${ready.blockers.join(', ')}`;

                finalActions();
        };
        if (!session.sessionAvailable || !session.accountValid || String(session.source?.id) !== String(unit.source?.id) || session.source?.coord !== unit.source?.coord) {
            unit = copy(unit); block(unit, session.accountReason || (session.antiBotPresent ? 'ANTI_BOT_PRESENT' : !session.loggedIn ? 'SESSION_UNAVAILABLE_OR_UNTRUSTED' : 'SOURCE_IDENTITY_MISMATCH'));
            saveUnit(unit);
        } else if (url.searchParams.get('try') !== 'confirm' && unit.state === 'PRECHECK_10M') {
            const diagnosticBox = doc.createElement('pre');
            diagnosticBox.dataset.tacticalTargetDiagnostic = '';
            diagnosticBox.style.cssText = 'max-height:160px;overflow:auto;font-size:10px;white-space:pre-wrap;margin:4px 0';
            diagnosticBox.hidden = true;
            status.after(diagnosticBox);
            const applyPrepared = async () => {
                const prepared = await prepareRallyPoint(executionId, executionUnitId, targetWindow);
                const detail = prepared.targetIdentityDiagnostic || prepared.targetInputDiagnostic || null;
                if (!prepared.valid) {
                    status.textContent = `BLOCKED: ${prepared.blocker}${prepared.detail ? ` (${prepared.detail})` : ''}`;
                    if (detail) { diagnosticBox.textContent = JSON.stringify(detail, null, 1); diagnosticBox.hidden = false; }
                    return prepared;
                }
                diagnosticBox.hidden = true;
                status.textContent = 'Composição exata aplicada. Nenhum comando foi enviado.';
                refreshUnit(prepared.unit);
                return prepared;
            };
            action('Aplicar composição aprovada', applyPrepared);
            // Automatic preparation stops here. No confirmation/submit control is exposed.
            const timingNow = readAuthoritativeNowMs(targetWindow);
            const autoDue = dueState(unit, timingNow.available ? timingNow.nowMs : null, 300000, 120000, 'PREPARATION_WINDOW_MISSED');
            if (autoDue.notDue) status.textContent = 'Aguardando T-5 para preparar automaticamente.';
            else applyPrepared().catch(error => { status.textContent = `BLOCKED: ${error?.message || 'PREPARATION_FAILED'}`; });
        } else if (url.searchParams.get('try') === 'confirm' && unit.state === 'PRECHECK_10M') {
            action(unit.kind === NATIVE_TRAIN ? `Criar e validar ${unit.expectedCommands} ataques nativos` : 'Validar comando aprovado', async () => {
                let evidence;
                if (unit.kind === NATIVE_TRAIN) {
                    const native = await createNativeTrainRows(targetWindow, unit);
                    if (!native.valid) { const blocked = copy(unit); block(blocked, native.blocker); saveUnit(blocked); status.textContent = `BLOCKED: ${native.blocker}`; return; }
                    evidence = { now: targetWindow.EAS.MassSnipeExecution.getCurrentServerTimeMs(), sourceCorrect: true, targetCorrect: true,
                        confirmationContextValid: true, nativeReconciliation: { valid: true, rows: native.rows, matchedCommands: native.matchedCommands } };
                } else {
                    const single = readSingleConfirmation(doc, unit, targetWindow);
                    if (!single.valid) { const blocked = copy(unit); block(blocked, single.blocker); saveUnit(blocked); status.textContent = `BLOCKED: ${single.blocker}`; return; }
                    evidence = { now: targetWindow.EAS.MassSnipeExecution.getCurrentServerTimeMs(), sourceCorrect: true, targetCorrect: true,
                        confirmationContextValid: true, compositionMatches: true };
                }
                const next = advancePrepare5m(unit, evidence);
                const saved = saveUnit(next);
                status.textContent = !saved ? 'BLOCKED: PERSISTED_STATE_TRANSITION_REJECTED' : next.state === 'PREPARE_5M' ? 'Confirmação reconciliada. Aguardando sincronização T−2.' : `BLOCKED: ${next.blockers.join(', ')}`;
                syncButton.hidden = !saved || next.state !== 'PREPARE_5M';
            });
            const syncButton = action('Sincronizar relógio e validar final', syncAndFinal);
            syncButton.hidden = true;
        } else {
            status.textContent = `${unit.state}${unit.blockers?.length ? ` · ${unit.blockers.join(', ')}` : ''}${unit.state === 'READY_TO_SEND' ? (unit.finalCheckEvidence?.fromPreparedForm === true ? ` · RALLY_PREPARED · confirmação nativa pendente · PREPARADO, NÃO ENVIADO · ${unit.commandType} · ${Object.entries(unit.finalCheckEvidence.composition || {}).map(([name, count]) => `${name} ${count}`).join(', ')} · READY_TO_SEND não autoriza envio.` : ' · escolha DRY RUN ou Autorizar envio real.') : ''}`;
        }
        if (unit.state === 'PREPARE_5M' && url.searchParams.get('try') === 'confirm') action('Sincronizar relógio e validar final', syncAndFinal);
        finalActions();
        if (unit.state === 'UNCERTAIN') action('Reconciliar novamente, sem reenviar', () => {
            unit = recoverFinalExecution(executionId, executionUnitId, targetWindow) || unit;
            status.textContent = `${unit.state} - ${unit.completedCommandIds?.join(', ') || unit.executionReason || ''}`;
        });
        if (unit.completedCommandIds?.length) status.textContent = `COMPLETED - IDs: ${unit.completedCommandIds.join(', ')}`;
        const close = doc.createElement('button'); close.type = 'button'; close.textContent = 'Fechar painel'; close.onclick = () => panel.remove();
        panel.append(title, summary, status, actions, close);
        (doc.body || doc.documentElement).append(panel);
        return true;
    };

    const compareOutgoing = (unit, observations, { now, windowMs = 120000, absenceProven = false } = {}) => {
        if (!Array.isArray(observations) || !integer(now)) return { state: 'UNCERTAIN', blocker: 'OUTGOING_EVIDENCE_UNAVAILABLE', matches: [] };
        const expected = unit.kind === NATIVE_TRAIN ? unit.approvedChildren : [unit.approvedCommand];
        const unique = [...new Map(observations.map((match, index) => [String(match.commandId || `observation-${index}`), match])).values()];
        const used = new Set(), matches = [];
        for (const command of expected) {
            const index = unique.findIndex((observed, observationIndex) => !used.has(observationIndex) &&
                String(observed.sourceId) === String(command.source?.id) && observed.sourceCoord === command.source?.coord &&
                observed.targetCoord === command.target?.coord && observed.commandType === command.commandType &&
                integer(observed.sentAtMs) && Math.abs(observed.sentAtMs - command.sendAtMs) <= windowMs &&
                same(nonzeroComposition(observed.composition), nonzeroComposition(command.composition?.quantities)));
            if (index >= 0) { used.add(index); matches.push(unique[index]); }
        }
        if (matches.length === expected.length && unique.length === expected.length) return { state: 'SENT', blocker: null, matches };
        if (matches.length === 0 && unique.length === 0 && absenceProven === true) return { state: 'FAILED', blocker: 'OUTGOING_COMMANDS_ABSENT', matches: [] };
        return { state: 'UNCERTAIN', blocker: unit.kind === NATIVE_TRAIN ? 'NATIVE_NT_PARTIAL_OR_AMBIGUOUS' : 'SINGLE_COMMAND_OUTCOME_UNCERTAIN', matches };
    };

    const createStore = storage => {
        const read = () => { try { const value = JSON.parse(storage?.getItem(STORAGE_KEY) || 'null'); if (value?.version === VERSION && value.executions) { for (const [scope, executions] of Object.entries(value.executions)) for (const execution of executions) for (const unit of execution.units || []) { if (!Object.hasOwn(unit, 'account')) unit.account = accountFromScope(scope);
            if (unit.state === 'PREPARED' && unit.nextCheckpoint == null && integer(unit.executionSendAtMs)) { unit.nextCheckpoint = 'SYNC_2M'; unit.nextCheckpointAtMs = unit.executionSendAtMs - 120000; } } return value; } return { version: VERSION, executions: {} }; } catch { return { version: VERSION, executions: {} }; } };
        const write = value => { try { storage?.setItem(STORAGE_KEY, JSON.stringify(value)); return true; } catch { return false; } };
        return { read, write };
    };
    const contextKey = () => `${EAS.World?.getWorldName?.() || window.game_data?.world || location.hostname}:${String(EAS.World?.getPlayer?.()?.id || window.game_data?.player?.id || 0)}`;
    const schedulerHookWindows = new WeakSet();
    const TICK_DIAGNOSTICS_KEY = 'eas_tw_tactical_tick_diagnostic_v1';
    const controllerIds = new WeakMap();
    // Safe controller-liveness evidence: no tokens, only timing/identity of this document's scheduler hook.
    const recordTickDiagnostic = (targetWindow, unit, now, decision) => {
        try {
            const storage = targetWindow.localStorage, wallMs = Date.now();
            if (!controllerIds.has(targetWindow)) controllerIds.set(targetWindow, targetWindow.crypto?.randomUUID?.() || `controller-${wallMs}`);
            const all = JSON.parse(storage.getItem(TICK_DIAGNOSTICS_KEY) || '{}') || {};
            const previous = all[unit.executionUnitId] || {};
            const sameController = previous.controllerId === controllerIds.get(targetWindow);
            if (sameController && previous.decision === decision && wallMs - previous.lastTickWallMs < 5000) return;
            const gap = sameController && Number.isFinite(previous.lastTickWallMs) ? wallMs - previous.lastTickWallMs : null;
            const url = new URL(targetWindow.location.href);
            all[unit.executionUnitId] = { controllerId: controllerIds.get(targetWindow), buildId: targetWindow.EASLocalBuild?.id ?? null,
                village: url.searchParams.get('village'), screen: url.searchParams.get('screen'), visibility: targetWindow.document?.visibilityState ?? null,
                lastTickWallMs: wallMs, lastServerNow: Number.isFinite(now) ? now : null,
                remainingMs: Number.isFinite(now) ? unit.executionSendAtMs - now : null, state: unit.state, decision,
                maxTickGapMs: Math.max(sameController ? previous.maxTickGapMs || 0 : 0, gap || 0),
                firstTickAtRemainingMs: previous.firstTickAtRemainingMs ?? (Number.isFinite(now) ? unit.executionSendAtMs - now : null) };
            const keys = Object.keys(all);
            for (const key of keys.slice(0, Math.max(0, keys.length - 20))) delete all[key];
            storage.setItem(TICK_DIAGNOSTICS_KEY, JSON.stringify(all));
        } catch {}
    };
    const readTickDiagnostics = (storage = window.localStorage) => { try { return JSON.parse(storage.getItem(TICK_DIAGNOSTICS_KEY) || '{}') || {}; } catch { return {}; } };
    const initializeSchedulerHooks = (targetWindow = window) => {
        if (!targetWindow?.addEventListener || schedulerHookWindows.has(targetWindow)) return false;
        schedulerHookWindows.add(targetWindow);
        targetWindow.addEventListener('eas:scheduler-tick', async () => {
            let now = null;
            try { now = targetWindow.EAS?.MassSnipeExecution?.getCurrentServerTimeMs?.() ?? null; } catch {}
            for (const execution of list()) for (const unit of execution.units) {
                if (!preparationAuthorizationValid(unit)) continue;
                if (unit.state === 'SCHEDULED') {
                    const waiting = Number.isFinite(now) && unit.executionSendAtMs - now > 600000;
                    recordTickDiagnostic(targetWindow, unit, now, waiting ? 'WAIT_T10' : 'PRECHECK_10M_REQUESTED');
                    if (waiting) continue;
                    runStoredPrecheck(execution.executionId, unit.executionUnitId, targetWindow, { action: 'scheduler' });
                } else if (unit.state === 'PRECHECK_10M') {
                    const waiting = Number.isFinite(now) && unit.executionSendAtMs - now > 300000;
                    const expired = Number.isFinite(now) && unit.executionSendAtMs - now <= 120000;
                    recordTickDiagnostic(targetWindow, unit, now, waiting ? 'WAIT_T5' : expired ? 'T5_WINDOW_EXPIRED' : 'T5_DUE');
                    if (waiting) continue;
                    const page = new URL(targetWindow.location.href);
                    const contextMatches = page.searchParams.get('eas_tactical_execution_id') === execution.executionId &&
                        page.searchParams.get('eas_tactical_unit_id') === unit.executionUnitId;
                    if (contextMatches) {
                        if (!autoPrepareRuns.get(targetWindow)?.has(`${execution.executionId}|${unit.executionUnitId}`)) initializePreparationPage(targetWindow);
                    } else {
                        if (unit.rallyPreparation?.status === 'FAILED') continue;
                        const result = await openRallyPoint(unit, targetWindow, { automatic: true });
                        if (!result.valid) {
                            const current = lookup(execution.executionId, unit.executionUnitId);
                            if (current?.state === 'PRECHECK_10M' && current.rallyPreparation?.status !== 'FAILED') { const blocked = copy(current); block(blocked, result.blocker); updateStoredUnit(execution.executionId, unit.executionUnitId, blocked); }
                        }
                        if (result.opened) return; // one navigation per tick/document
                    }
                } else if (unit.state === 'PREPARED') {
                    const remaining = Number.isFinite(now) ? unit.executionSendAtMs - now : null;
                    const page = new URL(targetWindow.location.href);
                    const ownTab = page.searchParams.get('eas_tactical_execution_id') === execution.executionId &&
                        page.searchParams.get('eas_tactical_unit_id') === unit.executionUnitId;
                    const decision = remaining === null ? 'CLOCK_UNAVAILABLE' : remaining > 120000 ? 'WAIT_T2' : ownTab ? 'T2_DUE' : 'T2_NOT_PREPARED_TAB';
                    recordTickDiagnostic(targetWindow, unit, now, decision);
                    if (decision === 'T2_DUE') synchronizePrepared(execution.executionId, unit.executionUnitId, targetWindow);
                    else if (decision === 'T2_NOT_PREPARED_TAB') {
                        const handle = navigationWindows.get(targetWindow)?.get(unit.rallyPreparation?.navigationId);
                        const reason = handle?.closed === true ? 'PREPARATION_TAB_CLOSED' : remaining <= 0 ? 'CLOCK_SYNC_WINDOW_MISSED' : null;
                        if (reason) { const blocked = copy(unit); block(blocked, reason); updateStoredUnit(execution.executionId, unit.executionUnitId, blocked); }
                    }
                } else if (unit.state === 'SYNC_2M' && unit.syncEvidence?.preparedFormValid === true) {
                    const remaining = Number.isFinite(now) ? unit.executionSendAtMs - now : null;
                    const page = new URL(targetWindow.location.href);
                    const ownTab = page.searchParams.get('eas_tactical_execution_id') === execution.executionId &&
                        page.searchParams.get('eas_tactical_unit_id') === unit.executionUnitId;
                    const decision = remaining === null ? 'CLOCK_UNAVAILABLE' : remaining > FINAL_CHECK_START_MS ? 'WAIT_FINAL_CHECK' : ownTab ? 'FINAL_CHECK_DUE' : 'FINAL_CHECK_NOT_PREPARED_TAB';
                    recordTickDiagnostic(targetWindow, unit, now, decision);
                    if (decision === 'FINAL_CHECK_DUE') finalizePrepared(execution.executionId, unit.executionUnitId, targetWindow);
                    else if (decision === 'FINAL_CHECK_NOT_PREPARED_TAB') {
                        const handle = navigationWindows.get(targetWindow)?.get(unit.rallyPreparation?.navigationId);
                        const reason = handle?.closed === true ? 'PREPARATION_TAB_CLOSED' : remaining <= FINAL_CHECK_END_MS ? 'FINAL_CHECK_WINDOW_MISSED' : null;
                        if (reason) { const blocked = copy(unit); block(blocked, reason); updateStoredUnit(execution.executionId, unit.executionUnitId, blocked); }
                    }
                } else if (unit.state === 'READY_TO_SEND' && unit.finalCheckEvidence?.fromPreparedForm === true && unit.kind === SINGLE) {
                    const remaining = Number.isFinite(now) ? unit.executionSendAtMs - now : null;
                    const page = new URL(targetWindow.location.href);
                    const onConfirm = page.searchParams.get('screen') === 'place' && page.searchParams.get('try') === 'confirm';
                    const ownTab = page.searchParams.get('eas_tactical_execution_id') === execution.executionId &&
                        page.searchParams.get('eas_tactical_unit_id') === unit.executionUnitId && !onConfirm;
                    const intent = unit.confirmationIntent;
                    if (intent) {
                        const decision = remaining === null ? 'CLOCK_UNAVAILABLE' : onConfirm && targetWindow.name === intent.tabName ? 'CONFIRMATION_CAPTURE_DUE' : now > intent.deadlineAtMs ? 'CONFIRMATION_NAVIGATION_TIMEOUT' : 'CONFIRMATION_NAVIGATING';
                        recordTickDiagnostic(targetWindow, unit, now, decision);
                        if (decision === 'CONFIRMATION_CAPTURE_DUE') captureConfirmation(execution.executionId, unit.executionUnitId, targetWindow);
                        else if (decision === 'CONFIRMATION_NAVIGATION_TIMEOUT') { const blocked = copy(unit); block(blocked, decision); updateStoredUnit(execution.executionId, unit.executionUnitId, blocked); }
                    } else {
                        const decision = remaining === null ? 'CLOCK_UNAVAILABLE' : remaining > CONFIRMATION_START_MS ? 'WAIT_CONFIRMATION' : ownTab ? 'CONFIRMATION_DUE' : 'CONFIRMATION_NOT_PREPARED_TAB';
                        recordTickDiagnostic(targetWindow, unit, now, decision);
                        if (decision === 'CONFIRMATION_DUE') openConfirmationFromPrepared(execution.executionId, unit.executionUnitId, targetWindow);
                        else if (decision === 'CONFIRMATION_NOT_PREPARED_TAB') {
                            const handle = navigationWindows.get(targetWindow)?.get(unit.rallyPreparation?.navigationId);
                            const reason = handle?.closed === true ? 'PREPARATION_TAB_CLOSED' : remaining <= CONFIRMATION_END_MS ? 'CONFIRMATION_WINDOW_MISSED' : null;
                            if (reason) { const blocked = copy(unit); block(blocked, reason); updateStoredUnit(execution.executionId, unit.executionUnitId, blocked); }
                        }
                    }
                }
            }
        });
        return true;
    };
    // Read-only native timing inventory. No tokens, form actions or script bodies.
    const nativeTimingDiagnostic = (targetWindow = window) => {
        const doc = targetWindow.document;
        const form = doc.querySelector('#command-confirm-form, form[action*="action=command"], form[action*="screen=place"]');
        const timingName = /duration|arrival|arrive|travel|time|delay|offset|attack.*(index|order)/i;
        const nodes = form ? [...form.querySelectorAll('tr, [data-duration], [data-endtime], [data-arrival], input, time')] : [];
        const formRows = form ? [...form.querySelectorAll('tr')] : [];
        const fields = nodes.map(node => {
            const attributes = Object.fromEntries([...node.attributes].filter(a => timingName.test(a.name) && /^[-\d:. T|]+$/.test(a.value)).map(a => [a.name, a.value]));
            const times = (node.tagName === 'INPUT' ? '' : node.textContent || '').match(/\b\d{1,3}:\d{2}:\d{2}(?:[.:]\d{3})?\b/g) || [];
            const name = node.getAttribute('name') || '';
            const value = node.tagName === 'INPUT' && timingName.test(name) && /^[-\d:. T]+$/.test(node.value) ? node.value : null;
            return { tag: node.tagName, id: node.id || null, rowIndex: formRows.indexOf(node.closest('tr')), timingInputName: value !== null ? name : null, value, attributes, times };
        }).filter(x => x.times.length || x.value !== null || Object.keys(x.attributes).length).slice(0, 80);
        return { version: 1, readOnly: true, screen: new URL(targetWindow.location.href).searchParams.get('screen'),
            confirmation: new URL(targetWindow.location.href).searchParams.get('try') === 'confirm', formFound: Boolean(form), fields,
            troopInputs: form ? [...form.querySelectorAll('input[name]')].filter(node => /(?:^|\W|_)(?:snob|axe|light|ram|catapult|knight)(?:$|\W|_)/.test(node.name))
                .map(node => ({ name: node.name, value: /^\d+$/.test(node.value) ? node.value : null, rowIndex: formRows.indexOf(node.closest('tr')) })).slice(0, 100) : [],
            nativeSubmitAtMs: null, timingProven: false,
            missingProof: ['Native common duration from final submit to first arrival for the actual N compositions',
                'Per-row native arrival offset and its relationship to that common duration (not independent travel durations)',
                'Stable native row selectors and timing fields after adding all rows'],
            conclusion: 'Observed ~100ms spacing alone does not prove a submit timestamp. No submit is enabled by this diagnostic.' };
    };
    const executionIdentity = unit => ({ operationId: unit.operationId, revision: unit.revision, executionId: unit.executionId,
        executionUnitId: unit.executionUnitId, kind: unit.kind, source: unit.source, target: unit.target, commandType: unit.commandType,
        approved: unit.kind === NATIVE_TRAIN ? unit.approvedChildren : unit.approvedCommand,
        submitAtMs: unit.executionSendAtMs, nativeSubmitAtMs: unit.nativeSubmitAtMs ?? null });
    const lookup = (executionId, executionUnitId, options) => list(options).find(x => x.executionId === executionId)?.units.find(x => x.executionUnitId === executionUnitId);
    const consumedKey = unit => `eas_tw_tactical_consumed:${contextKey()}:${unit.executionId}:${unit.executionUnitId}`;
    const wasConsumed = (unit, storage) => { try { return storage.getItem(consumedKey(unit)) !== null; } catch { return true; } };
    const authorizationValid = unit => Boolean(unit?.finalAuthorization?.kind === 'tactical-final-submit' &&
        integer(unit.finalAuthorization.createdAt) && same(unit.finalAuthorization.identity, executionIdentity(unit)));
    const baselineValid = unit => Boolean(unit?.outgoingBaseline && unit.attemptId &&
        unit.outgoingBaseline.attemptId === unit.attemptId && same(unit.outgoingBaseline.identity, executionIdentity(unit)) &&
        Array.isArray(unit.outgoingBaseline.commandIds) && integer(unit.outgoingBaseline.capturedAt));
    const executionLog = (event, unit, details = {}) => { try { EAS.Logger?.info?.('tactical-execution', event, {
        executionId: unit.executionId, executionUnitId: unit.executionUnitId, attemptId: unit.attemptId, state: unit.state, ...details }); } catch {} };
    const captureExecutionBaseline = (unit, targetWindow = window) => {
        const stored = lookup(unit.executionId, unit.executionUnitId);
        if (!stored || stored.state !== 'PRECHECK_10M' || stored.attemptId || wasConsumed(stored, targetWindow.localStorage))
            return { valid: false, blocker: 'BASELINE_ATTEMPT_ALREADY_EXISTS_OR_INVALID' };
        const page = rallyPageIdentity(targetWindow, stored);
        if (!page.pageValid || !page.sourceCorrect) return { valid: false, blocker: 'BASELINE_SOURCE_MISMATCH' };
        const observed = EAS.FakesExecution?.readOutgoingCommands?.(targetWindow);
        if (!observed?.available || !Array.isArray(observed.commands) || observed.commands.some(c => !/^\d+$/.test(c.id)))
            return { valid: false, blocker: observed?.reason || 'OUTGOING_BASELINE_UNAVAILABLE' };
        const now = targetWindow.EAS?.MassSnipeExecution?.getCurrentServerTimeMs?.();
        if (!integer(now) || !targetWindow.crypto?.randomUUID) return { valid: false, blocker: 'BASELINE_IDENTITY_UNAVAILABLE' };
        const next = copy(stored); next.attemptId = targetWindow.crypto.randomUUID();
        next.outgoingBaseline = { attemptId: next.attemptId, identity: executionIdentity(next), capturedAt: now,
            commandIds: [...new Set(observed.commands.map(c => c.id))] };
        const saved = updateStoredUnit(unit.executionId, unit.executionUnitId, next);
        if (saved) executionLog('BASELINE_PERSISTED', saved, { commandIds: next.outgoingBaseline.commandIds });
        return saved && same(lookup(unit.executionId, unit.executionUnitId)?.outgoingBaseline, next.outgoingBaseline)
            ? { valid: true, unit: saved } : { valid: false, blocker: 'BASELINE_PERSIST_READBACK_FAILED' };
    };
    const authorizeFinalSubmit = (executionId, executionUnitId, targetWindow = window) => {
        const unit = lookup(executionId, executionUnitId), now = targetWindow.EAS?.MassSnipeExecution?.getCurrentServerTimeMs?.();
        if (!unit || unit.state !== 'READY_TO_SEND' || unit.kind !== SINGLE || unit.finalCheckEvidence?.fromPreparedForm === true || !baselineValid(unit) ||
            !integer(now) || now >= unit.executionSendAtMs || wasConsumed(unit, targetWindow.localStorage)) return null;
        const next = copy(unit); next.finalAuthorization = { kind: 'tactical-final-submit', createdAt: now, identity: executionIdentity(unit) };
        const saved = updateStoredUnit(executionId, executionUnitId, next);
        if (saved) executionLog('FINAL_AUTHORIZED', saved);
        return saved;
    };
    const liveExecutionCheck = (unit, targetWindow, { dryRun = false, atSubmit = false } = {}) => {
        if (!unit || unit.state !== 'READY_TO_SEND' || unit.kind !== SINGLE || unit.finalCheckEvidence?.fromPreparedForm === true) return { valid: false, blocker: 'EXECUTION_NOT_READY' };
        if (!dryRun && !authorizationValid(unit)) return { valid: false, blocker: 'FINAL_AUTHORIZATION_REQUIRED' };
        if (!baselineValid(unit) || wasConsumed(unit, targetWindow.localStorage)) return { valid: false, blocker: 'BASELINE_MISSING_OR_ATTEMPT_CONSUMED' };
        const session = readSessionEvidence(targetWindow, unit);
        const now = targetWindow.EAS?.MassSnipeExecution?.getCurrentServerTimeMs?.();
        if (!integer(now) || typeof targetWindow.Timing?.getCurrentServerTime !== 'function' ||
            !Number.isFinite(targetWindow.Timing.getCurrentServerTime()) || !unit.clockEvidence?.valid ||
            now < unit.clockEvidence.measuredAt || now - unit.clockEvidence.measuredAt > 120000)
            return { valid: false, blocker: 'CLOCK_EVIDENCE_STALE' };
        if (now > unit.executionSendAtMs + 1000 || atSubmit && now < unit.executionSendAtMs)
            return { valid: false, blocker: 'SUBMIT_OUTSIDE_ALLOWED_WINDOW' };
        if (!session.sessionAvailable || session.source?.id !== String(unit.source.id) || session.source?.coord !== unit.source.coord ||
            session.page?.screen !== 'place' || session.page?.tryMode !== 'confirm') return { valid: false, blocker: 'LIVE_CONFIRMATION_CONTEXT_INVALID' };
        const confirmation = readSingleConfirmation(targetWindow.document, unit, targetWindow);
        if (!confirmation.valid) return confirmation;
        const buttons = [...targetWindow.document.querySelectorAll('#troop_confirm_submit')];
        if (buttons.length !== 1 || buttons[0].disabled || !buttons[0].isConnected || buttons[0].getClientRects().length === 0 ||
            buttons[0].form !== targetWindow.document.querySelector('#command-confirm-form, form[action*="action=command"], form[action*="screen=place"]'))
            return { valid: false, blocker: 'FINAL_SUBMIT_CONTROL_UNAVAILABLE' };
        return { valid: true, button: buttons[0], now };
    };
    const activeArms = new Map();
    const armFinalExecution = async (executionId, executionUnitId, targetWindow = window, { dryRun = true, onStatus = () => {} } = {}) => {
        const key = `${executionId}:${executionUnitId}`;
        if (activeArms.has(key)) return { armed: false, blocker: 'ALREADY_ARMED' };
        const read = () => lookup(executionId, executionUnitId);
        const initial = liveExecutionCheck(read(), targetWindow, { dryRun });
        if (!initial.valid) return { armed: false, blocker: initial.blocker };
        if (!targetWindow.navigator?.locks?.request || !EAS.MassSnipePrecise?.createScheduler) return { armed: false, blocker: 'EXCLUSIVE_SCHEDULER_UNAVAILABLE' };
        activeArms.set(key, true);
        let resolved = false;
        return new Promise(resolve => {
            const respond = result => { if (!resolved) { resolved = true; resolve(result); } };
            targetWindow.navigator.locks.request(`eas-tactical-submit:${contextKey()}:${key}`, { ifAvailable: true }, async lock => {
                if (!lock) { respond({ armed: false, blocker: 'EXECUTION_LOCK_BUSY' }); return; }
                await new Promise(release => {
                    let scheduler, selfClick = false;
                    const notice = value => { try { onStatus(value); } catch {} };
                    const finish = () => { targetWindow.removeEventListener('pagehide', hide); initial.button.removeEventListener('click', manual, true); initial.button.form?.removeEventListener('submit', manual, true); release(); };
                    const uncertain = reason => { const unit = read(); if (!unit) return;
                        const next = copy(unit); next.state = 'UNCERTAIN'; next.executionReason = reason;
                        updateStoredUnit(executionId, executionUnitId, next); notice('UNCERTAIN · nenhum reenvio'); };
                    const manual = () => { if (selfClick) return;
                        const unit = read();
                        try { targetWindow.localStorage.setItem(consumedKey(unit), JSON.stringify({ attemptId: unit.attemptId, reason: 'MANUAL_SUBMIT' })); } catch {}
                        uncertain('MANUAL_SUBMISSION_DETECTED'); scheduler?.cancel('Envio manual detectado'); };
                    const hide = () => scheduler?.cancel('Documento encerrado; rearme somente manual');
                    const check = () => liveExecutionCheck(read(), targetWindow, { dryRun });
                    try {
                        scheduler = EAS.MassSnipePrecise.createScheduler({ targetLaunchTime: read().executionSendAtMs,
                            latencyCompensation: 0, explicitlyEnabled: true,
                            serverNow: () => targetWindow.EAS.MassSnipeExecution.getCurrentServerTimeMs(), monotonicNow: () => targetWindow.performance.now(),
                            schedule: (fn, delay) => targetWindow.setTimeout(fn, delay), unschedule: id => targetWindow.clearTimeout(id),
                            canFire: () => { const current = check(); return current.valid && current.button === initial.button; },
                            claim: () => {
                                const unit = read(), live = liveExecutionCheck(unit, targetWindow, { dryRun, atSubmit: true });
                                if (!live.valid || live.button !== initial.button) return false;
                                if (dryRun) return true;
                                const claim = { attemptId: unit.attemptId, identity: executionIdentity(unit), submittedAt: live.now };
                                try {
                                    const storage = targetWindow.localStorage;
                                    if (wasConsumed(unit, storage)) return false;
                                    storage.setItem(consumedKey(unit), JSON.stringify(claim));
                                    if (!same(JSON.parse(storage.getItem(consumedKey(unit))), claim)) return false;
                                    const next = copy(unit); next.state = 'SUBMITTING'; next.submitAttempt = claim;
                                    next.submitAttempt.serverEpochMs = targetWindow.Timing?.getCurrentServerTime?.() ?? null;
                                    const saved = updateStoredUnit(executionId, executionUnitId, next);
                                    if (saved) executionLog('SUBMIT_CLAIMED', saved);
                                    return Boolean(saved && same(read()?.submitAttempt, next.submitAttempt));
                                } catch { return false; }
                            },
                            button: { click: () => { if (dryRun) return; selfClick = true; try { initial.button.click(); } finally { selfClick = false; } } },
                            onCancel: reason => {
                                const current = read(), validation = check();
                                if (current?.state === 'READY_TO_SEND' && !validation.valid) {
                                    const blocked = copy(current); block(blocked, validation.blocker);
                                    updateStoredUnit(executionId, executionUnitId, blocked);
                                }
                                notice(`BLOCKED · ${reason}`); finish(); },
                            onResult: result => {
                                if (dryRun) { notice('DRY RUN concluído · nenhum envio'); executionLog('DRY_RUN_COMPLETED', read()); }
                                else {
                                    const next = copy(read()); next.state = 'RECONCILING';
                                    updateStoredUnit(executionId, executionUnitId, next);
                                    uncertain(result.clickError ? 'SUBMIT_EXCEPTION' : 'AWAITING_OUTGOING_RECONCILIATION');
                                }
                                finish();
                            }
                        });
                        initial.button.addEventListener('click', manual, true); initial.button.form?.addEventListener('submit', manual, true);
                        targetWindow.addEventListener('pagehide', hide, { once: true });
                        scheduler.start(); notice(dryRun ? 'DRY RUN armado · nenhum envio' : 'ENVIO REAL AUTORIZADO');
                        respond({ armed: true, dryRun });
                    } catch (error) { finish(); respond({ armed: false, blocker: error.message }); }
                });
            }).catch(error => respond({ armed: false, blocker: error.message })).finally(() => activeArms.delete(key));
        });
    };
    const recoverFinalExecution = (executionId, executionUnitId, targetWindow = window) => {
        let unit = lookup(executionId, executionUnitId);
        if (!unit || !['SUBMITTING', 'RECONCILING', 'UNCERTAIN'].includes(unit.state) && !wasConsumed(unit, targetWindow.localStorage)) return null;
        const next = copy(unit); next.state = 'UNCERTAIN'; next.executionReason = 'OUTGOING_EVIDENCE_UNAVAILABLE';
        const page = rallyPageIdentity(targetWindow, unit);
        if (unit.kind === SINGLE && baselineValid(unit) && authorizationValid(unit) &&
            same(unit.submitAttempt?.identity, executionIdentity(unit)) && unit.outgoingBaseline.capturedAt <= unit.submitAttempt?.submittedAt &&
            unit.submitAttempt?.attemptId === unit.attemptId && page.pageValid && page.sourceCorrect) {
            const observed = EAS.FakesExecution?.readOutgoingCommands?.(targetWindow, { readRowEvidence: EAS.ArrivalExecution?.readArrivalEvidence });
            const verification = { baseline: unit.outgoingBaseline, sourceVillageId: String(unit.source.id), commandType: unit.commandType,
                targetCoord: unit.target.coord, travelTimeMs: unit.approvedCommand.travelTimeMs,
                submitStartedAt: unit.submitAttempt.submittedAt, submitWallTimeMs: unit.submitAttempt.submittedAt,
                submitServerTimeMs: unit.submitAttempt.serverEpochMs };
            const result = EAS.ArrivalExecution?.matchOutgoing?.(verification, observed || { available: false, commands: [] });
            next.outgoingReconciliation = result ? copy(result) : null;
            if (result?.match) { next.state = 'COMPLETED'; next.executionReason = null; next.completedCommandIds = [result.match.id]; }
            else next.executionReason = result?.reason || next.executionReason;
        }
        const saved = updateStoredUnit(executionId, executionUnitId, next);
        if (saved) executionLog('RECONCILIATION', saved, { reason: next.executionReason, commandIds: next.completedCommandIds || [] });
        return saved;
    };

    const defaultStore = () => createStore(typeof localStorage === 'undefined' ? null : localStorage);
    const list = ({ storage = typeof localStorage === 'undefined' ? null : localStorage, scope = contextKey() } = {}) =>
        freeze(copy(createStore(storage).read().executions[scope] || []));
    const listActive = (options = {}) => list(options).map(execution => ({ ...execution,
        units: execution.units.filter(unit => !['CANCELLED', 'SENT', 'COMPLETED', 'FAILED', 'UNCERTAIN'].includes(unit.state))
    })).filter(execution => execution.units.length > 0);
    const enqueue = (snapshot, { storage = typeof localStorage === 'undefined' ? null : localStorage, scope = contextKey(), createdAt = Date.now() } = {}) => {
        const derived = deriveExecutionUnits(snapshot);
        if (!derived.units.length || !integer(createdAt)) return { created: false, blockers: derived.blockers.length ? derived.blockers : ['EXECUTION_UNITS_EMPTY'], execution: null };
        const executionId = unitId(snapshot, `schedule:${createdAt}`);
        const scheduledUnits = derived.units.map(unit => ({ ...copy(unit), executionId, account: accountFromScope(scope) }));
        const execution = freeze({ executionId, snapshotIdentity: derived.snapshotIdentity,
            approvedSnapshot: copy(snapshot), createdAt, state: 'SCHEDULED', units: scheduledUnits });
        const store = createStore(storage), root = store.read();
        const existing = (root.executions[scope] || []).find(item => item.executionId === execution.executionId);
        if (existing) return { created: false, duplicate: true, blockers: [], execution: freeze(copy(existing)) };
        root.executions[scope] = [...(root.executions[scope] || []), execution];
        return store.write(root) ? { created: true, blockers: derived.blockers, execution } : { created: false, blockers: ['TACTICAL_SCHEDULER_STORAGE_FAILED'], execution: null };
    };
    const updateStoredUnit = (executionId, executionUnitId, nextUnit, { storage = typeof localStorage === 'undefined' ? null : localStorage, scope = contextKey() } = {}) => {
        const store = createStore(storage), root = store.read(), executions = root.executions[scope] || [];
        const executionIndex = executions.findIndex(item => item.executionId === executionId);
        if (executionIndex < 0) return null;
        const execution = copy(executions[executionIndex]), unitIndex = execution.units.findIndex(item => item.executionUnitId === executionUnitId);
        if (unitIndex < 0) return null;
        const previous = execution.units[unitIndex];
        if (previous.attemptId && (previous.attemptId !== nextUnit?.attemptId || !same(previous.outgoingBaseline, nextUnit?.outgoingBaseline))) return null;
        const protectedKeys = ['account', 'executionId', 'executionUnitId', 'kind', 'operationId', 'revision', 'approvedCommand', 'approvedChildren', 'source', 'target',
            'commandType', 'expectedCommands', 'executionSendAtMs', 'nativeSubmitAtMs', 'timingMapping', 'trainId', 'count'];
        if (protectedKeys.some(key => !same(previous[key] ?? null, nextUnit?.[key] ?? null))) return null;
        const transitions = {
            BLOCKED: new Set(['BLOCKED', 'CANCELLED']),
            SCHEDULED: new Set(['SCHEDULED', 'PRECHECK_10M', 'BLOCKED', 'CANCELLED']),
            PRECHECK_10M: new Set(['PRECHECK_10M', 'PREPARED', 'PREPARE_5M', 'BLOCKED', 'CANCELLED']),
            PREPARED: new Set(['SYNC_2M', 'BLOCKED', 'CANCELLED']),
            PREPARE_5M: new Set(['PREPARE_5M', 'SYNC_2M', 'BLOCKED', 'CANCELLED']),
            SYNC_2M: new Set(['SYNC_2M', 'READY_TO_SEND', 'BLOCKED', 'CANCELLED']),
            READY_TO_SEND: new Set(['READY_TO_SEND', 'CONFIRMATION_READY', 'SUBMITTING', 'UNCERTAIN', 'BLOCKED', 'CANCELLED']),
            CONFIRMATION_READY: new Set(['BLOCKED', 'CANCELLED']),
            SUBMITTING: new Set(['SUBMITTING', 'RECONCILING', 'SENT', 'COMPLETED', 'FAILED', 'UNCERTAIN']),
            RECONCILING: new Set(['RECONCILING', 'SENT', 'COMPLETED', 'FAILED', 'UNCERTAIN']),
            UNCERTAIN: new Set(['UNCERTAIN', 'SENT', 'COMPLETED', 'FAILED'])
        };
        if (!transitions[previous.state]?.has(nextUnit?.state)) return null;
        if (previous.state === nextUnit.state && ['PRECHECK_10M', 'PREPARE_5M', 'SYNC_2M', 'READY_TO_SEND'].includes(previous.state)) {
            const strip = value => { const result = copy(value); for (const key of ['attemptId', 'outgoingBaseline', 'finalAuthorization', 'rallyPreparation', 'confirmationIntent']) delete result[key]; return result; };
            if (!same(strip(previous), strip(nextUnit))) return null;
            if (previous.attemptId && (previous.attemptId !== nextUnit.attemptId || !same(previous.outgoingBaseline, nextUnit.outgoingBaseline))) return null;
        }
        if (nextUnit?.state === 'PREPARED' && !same(advanceRallyPrepared(previous, nextUnit.rallyPreparation?.evidence), nextUnit)) return null;
        const derivations = { PRECHECK_10M: advancePrecheck10m, PREPARE_5M: advancePrepare5m, SYNC_2M: advanceSync2m };
        const derive = derivations[nextUnit?.state];
        const derivationEvidence = { PRECHECK_10M: nextUnit?.precheckEvidence, PREPARE_5M: nextUnit?.preparationEvidence, SYNC_2M: nextUnit?.syncEvidence }[nextUnit?.state];
        if (derive && previous.state !== nextUnit.state && !same(derive(previous, derivationEvidence), nextUnit)) return null;
        if (nextUnit?.state === 'READY_TO_SEND' && previous.state !== 'READY_TO_SEND' && !same(advanceFinalCheck(previous, nextUnit.finalCheckEvidence), nextUnit)) return null;
        if (nextUnit?.state === 'CONFIRMATION_READY' && !same(advanceConfirmationReady(previous, nextUnit.confirmationEvidence), nextUnit)) return null;
        execution.units[unitIndex] = copy(nextUnit);
        execution.state = execution.units.every(unit => unit.state === 'COMPLETED') ? 'COMPLETED' : execution.units.every(unit => ['PREPARED', 'READY_TO_SEND', 'CONFIRMATION_READY', 'SENT', 'COMPLETED', 'FAILED', 'UNCERTAIN', 'CANCELLED', 'BLOCKED'].includes(unit.state))
            ? 'REVIEW_REQUIRED' : 'PREFLIGHT';
        executions[executionIndex] = execution;
        root.executions[scope] = executions;
        if (!store.write(root) || !same(store.read(), root)) return null;
        const saved = freeze(copy(execution.units[unitIndex]));
        try { if (typeof window !== 'undefined') window.dispatchEvent(new window.CustomEvent('eas:tactical-preparation-updated', { detail: { executionId, executionUnitId, state: saved.state } })); } catch {}
        return saved;
    };
    const preparationAuthorizationValid = unit => {
        const auth = unit?.preparationAuthorization;
        return Boolean(auth?.authorizationKind === 'tactical-preflight-only' && auth.actor === 'user' &&
            integer(auth.authorizedAt) && auth.executionUnitId === unit.executionUnitId &&
            auth.operationId === unit.operationId && auth.revision === unit.revision &&
            (auth.executionId == null || auth.executionId === unit.executionId));
    };
    const runStoredPrecheck = (executionId, executionUnitId, targetWindow = window, options = {}) => {
        const unit = lookup(executionId, executionUnitId, options);
        if (!unit) return { accepted: false, reason: 'TACTICAL_UNIT_NOT_FOUND', persisted: false, unit: null };
        const evidence = { ...readSessionEvidence(targetWindow, unit), action: options.action === 'scheduler' ? 'scheduler' : 'manual' };
        executionLog('TACTICAL_PRECHECK_REQUESTED', unit, { action: evidence.action, authoritativeNowMs: Number.isFinite(evidence.now) ? evidence.now : null,
            checkpointAtMs: unit.executionSendAtMs - 600000, deltaMs: Number.isFinite(evidence.now) ? evidence.now - (unit.executionSendAtMs - 600000) : null });
        if (unit.state === 'PRECHECK_10M' && preparationAuthorizationValid(unit) && evidence.accountValid && evidence.sessionAvailable) {
            executionLog('TACTICAL_PRECHECK_ACCEPTED', unit, { reason: 'PRECHECK_ALREADY_COMPLETED', ...unit.lastPreflight });
            return { accepted: true, reason: 'PRECHECK_ALREADY_COMPLETED', persisted: true, unit };
        }
        if (unit.state !== 'SCHEDULED') {
            executionLog('TACTICAL_PRECHECK_REJECTED', unit, { reason: 'PRECHECK_STATE_INELIGIBLE' });
            return { accepted: false, reason: 'PRECHECK_STATE_INELIGIBLE', persisted: true, unit };
        }
        const next = advancePrecheck10m(unit, evidence);
        const saved = updateStoredUnit(executionId, executionUnitId, next, options);
        const accepted = Boolean(saved && saved.state === 'PRECHECK_10M');
        const reason = saved ? saved.lastPreflight.reason : 'PRECHECK_PERSIST_READBACK_FAILED';
        executionLog(accepted ? 'TACTICAL_PRECHECK_ACCEPTED' : 'TACTICAL_PRECHECK_REJECTED', saved || unit,
            { ...next.lastPreflight, reason, persisted: Boolean(saved) });
        return { accepted, reason, persisted: Boolean(saved), unit: saved || unit };
    };
    const preparationDiagnostic = (options = {}) => ({
        storageKey: STORAGE_KEY,
        preparationAttempts: readPreflightDiagnostics(options),
        executions: list(options).map(execution => ({ executionId: execution.executionId,
            units: execution.units.map(unit => ({ executionUnitId: unit.executionUnitId,
                operationId: unit.operationId, revision: unit.revision, state: unit.state, account: copy(unit.account), trustedSource: trustedSource(unit),
                nextStage: unit.nextCheckpoint ?? null,
                authoritativeNowMs: unit.lastPreflight?.authoritativeNowMs ?? null,
                checkpointAtMs: unit.lastPreflight?.checkpointAtMs ?? null, deltaMs: unit.lastPreflight?.deltaMs ?? null,
                lastPreflightAction: unit.lastPreflight?.action ?? null, lastPreflightResult: unit.lastPreflight?.result ?? null,
                lastPreflightReason: unit.lastPreflight?.reason ?? null, lastPreflightAt: unit.lastPreflight?.at ?? null,
                preflightAuthorization: { present: Boolean(unit.preparationAuthorization), valid: preparationAuthorizationValid(unit),
                    authorizedAt: unit.preparationAuthorization?.authorizedAt ?? null },
                finalSubmitAuthorization: { present: Boolean(unit.finalAuthorization), valid: authorizationValid(unit) },
                source: { id: unit.source?.id ?? null, coord: unit.source?.coord ?? null },
                target: { id: unit.target?.villageId ?? unit.target?.id ?? null, coord: unit.target?.coord ?? null },
                scheduledSubmitAtMs: unit.executionSendAtMs ?? null, nativeSubmitAtMs: unit.nativeSubmitAtMs ?? null,
                rallyPreparation: copy(unit.rallyPreparation || null),
                blockers: [...(unit.blockers || [])],
                attempt: { present: Boolean(unit.attemptId), started: Boolean(unit.submitAttempt),
                    state: unit.submitAttempt ? unit.state : unit.attemptId ? 'PREPARED' : null }
            })) }))
    });
    const authorizeStoredUnit = (executionId, executionUnitId, options = {}) => {
        const unit = list(options).find(execution => execution.executionId === executionId)?.units.find(item => item.executionUnitId === executionUnitId);
        if (preparationAuthorizationValid(unit)) return unit;
        const authorized = authorizePreparation(unit, options);
        const saved = authorized ? updateStoredUnit(executionId, executionUnitId, authorized, options) : null;
        if (unit) executionLog(saved ? 'PREPARATION_AUTHORIZED' : 'PREPARATION_AUTHORIZATION_REJECTED', unit, {
            persisted: Boolean(saved), operationId: unit.operationId, revision: unit.revision,
            reason: saved ? null : authorized ? 'PERSIST_OR_READBACK_FAILED' : 'INVALID_AUTHORIZATION_INPUT'
        });
        return saved;
    };
    const cancelStoredUnit = (executionId, executionUnitId, options = {}) => {
        const unit = list(options).find(execution => execution.executionId === executionId)?.units.find(item => item.executionUnitId === executionUnitId);
        if (!unit || ['SENT', 'FAILED', 'UNCERTAIN', 'CANCELLED'].includes(unit.state)) return null;
        const cancelled = copy(unit); cancelled.state = 'CANCELLED'; cancelled.cancelledAt = Date.now(); cancelled.preparationAuthorization = null;
        return updateStoredUnit(executionId, executionUnitId, cancelled, options);
    };
    const reconcileStoredOutcome = (executionId, executionUnitId, observations, options = {}) => {
        const unit = list(options).find(execution => execution.executionId === executionId)?.units.find(item => item.executionUnitId === executionUnitId);
        if (!unit || !['SUBMITTING', 'RECONCILING', 'UNCERTAIN'].includes(unit.state)) return null;
        const result = compareOutgoing(unit, observations, options);
        const reconciled = copy(unit); reconciled.state = result.state; reconciled.outgoingReconciliation = copy(result);
        return updateStoredUnit(executionId, executionUnitId, reconciled, options);
    };

    if (typeof window !== 'undefined') window.EASTacticalNativeTimingDebug = () => nativeTimingDiagnostic(window);
    Object.assign(EAS.TacticalOperationSchedulerAdapter = {}, {
        nativeTimingDiagnostic, authorizationValid, baselineValid, captureExecutionBaseline, authorizeFinalSubmit, liveExecutionCheck, armFinalExecution, recoverFinalExecution,
        VERSION, STORAGE_KEY, SINGLE, NATIVE_TRAIN, formatServerTimestamp, formatExecutionUnitLabel, formatApprovedChildLabel,
        deriveExecutionUnits, mapTrainTiming, authorizePreparation,
        advancePrecheck10m, advancePrepare5m, evaluateClockSamples, advanceSync2m, advanceFinalCheck,
        reconcileNativeNobleRows, readNativeRows, parseNativeConfirmation, createNativeTrainRows, compareOutgoing,
        readSessionEvidence, rallyPageIdentity, applyApprovedComposition, openPreparedConfirmation, readSingleConfirmation, openConfirmationFromPrepared, captureConfirmation, parseNativeDuration, advanceConfirmationReady,
        buildRallyPointUrl, describeClockFrame, openRallyPoint, prepareRallyPoint, synchronizePrepared, finalizePrepared, collectClockSamples, initializePreparationPage, initializeSchedulerHooks, readTickDiagnostics, TICK_DIAGNOSTICS_KEY,
        runStoredPrecheck, preparationAuthorizationValid, preparationDiagnostic, createStore, list, listActive, enqueue, updateStoredUnit, authorizeStoredUnit, cancelStoredUnit, reconcileStoredOutcome
    });
})();
