(() => {
    'use strict';

    window.__EASFakeBootstrapMark?.('fakeModuleReached');

    EAS.FakesExecution = EAS.FakesExecution || {};

    const diagnosticLog = (event, context, data = {}) => {
        try {
            const entry = context?.queue?.[context.currentIndex];
            EAS.Logger?.[event === 'ERROR' ? 'error' : event === 'RECONCILE_UNCERTAIN' ? 'warn' : 'info']?.('FAKE', event, { executionId: context?.executionTab,
                commandId: entry ? getCommandKey(entry, context.currentIndex) : null,
                attemptId: entry?.confirmationAttempt?.attemptId, sourceVillageId: entry?.villageId,
                target: entry?.target, expectedTarget: entry?.target, actualTarget: entry?.preparationWait?.actualTarget ?? null,
                state: entry?.status, phase: entry?.preparationWait?.phase || null, timestamp: Date.now(), now: Date.now(),
                deadline: entry?.preparationWait?.deadlineAt ?? null, remainingMs: entry?.preparationWait ? Math.max(0, entry.preparationWait.deadlineAt - Date.now()) : null,
                documentUrl: window.location.href, screen: new URL(window.location.href).searchParams.get('screen'), ...data });
        } catch { /* Logging is never an execution guard. */ }
    };

    const EXECUTION_STORAGE_KEY = 'eas_tw_fakes_execution';
    const PANEL_ID = 'eas-fake-execution-panel';
    const POLL_INTERVAL_MS = 200;
    const OPEN_TIMEOUT_MS = 10000;
    const COMMAND_TYPES = ['attack', 'support'];
    const UNITS = [
        'spear',
        'sword',
        'axe',
        'archer',
        'spy',
        'light',
        'marcher',
        'heavy',
        'ram',
        'catapult',
        'knight',
        'snob'
    ];
    const UNIT_NAMES = {
        spear: 'Lanceiros',
        sword: 'Espadachins',
        axe: 'Bárbaros',
        archer: 'Arqueiros',
        spy: 'Exploradores',
        light: 'Cavalarias leves',
        marcher: 'Arqueiros montados',
        heavy: 'Cavalarias pesadas',
        ram: 'Aríetes',
        catapult: 'Catapultas',
        knight: 'Paladinos',
        snob: 'Nobres'
    };
    const PRESET_NAMES = {
        simple: 'Fake simples',
        nt: 'Fake NT',
        fake_nt: 'Fake NT',
        antiSnipe: 'Fake Anti-Snipe',
        anti_snipe: 'Fake Anti-Snipe',
        custom: 'Fake personalizado'
    };

    const readContext = () => {
        try {
            const value = localStorage.getItem(EXECUTION_STORAGE_KEY);
            return value ? JSON.parse(value) : null;
        } catch {
            return null;
        }
    };

    const saveContext = (context) => {
        try {
            localStorage.setItem(EXECUTION_STORAGE_KEY, JSON.stringify(context));
            if (context?.preset === 'fake_nt') {
                localStorage.setItem('eas_tw_fake_nt_execution', JSON.stringify(context));
            }
            if (context?.preset === 'anti_snipe') {
                localStorage.setItem('eas_tw_fake_anti_snipe_execution', JSON.stringify(context));
            }
            return true;
        } catch {
            return false;
        }
    };

    const removeContext = () => {
        try {
            localStorage.removeItem(EXECUTION_STORAGE_KEY);
            localStorage.removeItem('eas_tw_fake_nt_execution');
            localStorage.removeItem('eas_tw_fake_anti_snipe_execution');
        } catch {
            // The panel can still be closed when browser storage is unavailable.
        }
    };

    const readLocalValue = (key, fallback = null) => {
        try {
            const value = localStorage.getItem(key);
            return value === null ? fallback : JSON.parse(value);
        } catch {
            return fallback;
        }
    };

    const getScreen = (targetWindow = window) => {
        try {
            const url = new URL(targetWindow.location.href);

            return {
                screen: url.searchParams.get('screen'),
                villageId: Number(
                    url.searchParams.get('village') ||
                    targetWindow.game_data?.village?.id ||
                    0
                )
            };
        } catch {
            return { screen: null, villageId: 0 };
        }
    };

    const isMatchingPlace = (context, targetWindow = window) => {
        const screen = getScreen(targetWindow);
        const queue = Array.isArray(context?.queue) ? context.queue : [];
        const allowedVillageIds = queue.length
            ? queue.map((entry) => Number(entry.villageId))
            : [Number(context?.villageId || 0)];

        return screen.screen === 'place' &&
            allowedVillageIds.includes(Number(screen.villageId));
    };

    const normalizeContext = (context) => {
        const preset = context?.preset === 'nt' ? 'fake_nt' : context?.preset === 'antiSnipe' ? 'anti_snipe' : context?.preset;
        const isFakeNt = preset === 'fake_nt';
        const isAttackOnlyPreset = isFakeNt || preset === 'anti_snipe';
        const legacyTargets = Array.isArray(context?.targets)
            ? context.targets
            : [];
        const queue = Array.isArray(context?.queue) && context.queue.length
            ? context.queue.map((entry) => ({
                ...entry,
                villageId: Number(entry.villageId || 0),
                status: entry.status || 'pending'
            }))
            : legacyTargets.map((target) => ({
                villageId: Number(context?.villageId || 0),
                villageName: context?.villageName || '',
                villageCoord: context?.villageCoord || '',
                target,
                status: 'pending'
            }));
        const analysisCommandType = readLocalValue(
            'eas_tw_fakes_analysis',
            {}
        )?.commandType;
        const resolvedCommandType = COMMAND_TYPES.includes(context?.commandType)
            ? context.commandType
            : COMMAND_TYPES.includes(analysisCommandType)
                ? analysisCommandType
                : 'attack';
        const commandType = isAttackOnlyPreset ? 'attack' : resolvedCommandType;
        const commandTypeFallbackUsed = !COMMAND_TYPES.includes(
            context?.commandType
        );
        const allowCommandSwitch = isAttackOnlyPreset ? false : typeof context?.allowCommandSwitch === 'boolean'
            ? context.allowCommandSwitch
            : Boolean(readLocalValue(
                'eas_tw_fakes_allow_command_switch',
                false
            ));
        const forwardingCommandType = COMMAND_TYPES.includes(
            context?.forwardingCommandType
        )
            ? context.forwardingCommandType
            : Number.isInteger(context?.forwardingIndex)
                ? commandType
                : null;

        return {
            ...context,
            preset,
            queue,
            targets: legacyTargets,
            commandType,
            commandTypeFallbackUsed: commandTypeFallbackUsed || (isAttackOnlyPreset && context?.commandType === 'support'),
            allowCommandSwitch,
            forwardingCommandType,
            troopsPerTarget: {
                ...(context?.troopsPerTarget || {}),
                ...(isFakeNt ? { snob: 0 } : {})
            },
            currentIndex: Math.max(0, Number(context?.currentIndex || 0)),
            prepared: Array.isArray(context?.prepared)
                ? [...context.prepared]
                : Array.isArray(context?.preparedTargets)
                    ? [...context.preparedTargets]
                    : [],
            skipped: Array.isArray(context?.skipped)
                ? [...context.skipped]
                : Array.isArray(context?.skippedTargets)
                    ? [...context.skippedTargets]
                    : [],
            completed: Array.isArray(context?.completed)
                ? [...context.completed]
                : Array.isArray(context?.completedTargets)
                    ? [...context.completedTargets]
                    : [],
            errors: Array.isArray(context?.errors)
                ? [...context.errors]
                : Array.isArray(context?.errorTargets)
                    ? [...context.errorTargets]
                    : []
        };
    };

    const getCurrentEntry = (context) => {
        return context.queue[context.currentIndex] || null;
    };

    const getCommandKey = (entry, index) => {
        return `${index}:${entry?.villageId || 0}:${entry?.target || ''}`;
    };

    const readOutgoingCommands = (targetWindow) => {
        const doc = targetWindow.document;
        const container = doc.querySelector('#commands_outgoings');
        const globalRows = Array.from(doc.querySelectorAll?.('.command-row') || []);
        const rows = [...new Set([...globalRows.filter(row => row.querySelector?.('.quickedit-out[data-id]')),
            ...Array.from(container?.querySelectorAll('tr.command-row') || [])])];
        const source = 'place-command-rows';
        const url = new URL(targetWindow.location.href);
        const placeStructureReady = doc.readyState === 'complete' && url.searchParams.get('screen') === 'place' &&
            !url.searchParams.get('try') && Boolean(doc.querySelector('#command-data-form')) &&
            Boolean(doc.querySelector('#command_target')) && Boolean(doc.querySelector('#command_actions')) &&
            !doc.querySelector('[aria-busy="true"], .error_box, .error');
        const pageReady = placeStructureReady || Boolean(container && doc.readyState !== 'loading');
        const result = (available, commands, reason = null) => ({ available, commands,
            reason: available && !commands.length ? 'EMPTY_OUTGOING_COMMANDS' : reason, source,
            sourceState: !available ? 'UNAVAILABLE' : commands.length ? 'ROWS_PRESENT' : 'EMPTY_CONFIRMED',
            pageReady, commandRowCount: globalRows.length || rows.length, commandIds: available ? commands.map(command => command.id) : null,
            outgoingContainerFound: Boolean(container), outgoingRowsFound: rows.length });
        if (doc.readyState === 'loading') return result(false, [], 'DOM_LOADING');
        // The real empty layout omits the outgoing table. Its native command
        // structures must be ready before absence can mean an empty collection.
        if (!pageReady) return result(false, [], 'PLACE_NOT_READY');
        if (!container && !rows.length && (globalRows.length || doc.querySelector('.quickedit-out[data-id], a[href*="info_command"], [data-command-id]'))) return result(false, [], 'UNCLASSIFIED_COMMAND_MARKERS');
        if ((container || doc).querySelector?.('a[href*="page="], .paged-nav')) return result(false, [], 'PAGINATED');
        const normalizeId = value => {
            const id = String(value ?? '').trim();
            return /^\d+$/.test(id) ? id.replace(/^0+(?=\d)/, '') : null;
        };
        const commands = new Map();
        for (const row of rows) {
            const quick = row.querySelector('.quickedit-out[data-id]');
            const cancel = row.querySelector('.command-cancel[data-id][data-home]');
            const icon = row.querySelector('.command_hover_details[data-command-id]') ||
                row.querySelector('.command_hover_details[data-command-id][data-command-type]');
            const link = row.querySelector('a[href*="screen=info_command"]');
            let url;
            try { url = link ? new URL(link.href, targetWindow.location.href) : null; } catch { return result(false, [], 'INVALID_ROW'); }
            if (url && (url.origin !== new URL(targetWindow.location.href).origin || url.searchParams.get('screen') !== 'info_command' ||
                (url.searchParams.has('type') && url.searchParams.get('type') !== 'own'))) return result(false, [], 'INVALID_ROW');
            const ids = [quick?.dataset.id, ...(cancel ? [cancel.dataset.id] : []), ...(icon ? [icon.dataset.commandId] : []),
                ...(url ? [url.searchParams.get('id')] : [])].map(normalizeId);
            if (!quick || ids.some(id => !id || id !== ids[0])) return result(false, [], 'INVALID_ROW');
            const home = cancel ? normalizeId(cancel.dataset.home) : null;
            const village = url?.searchParams.get('type') === 'own' ? normalizeId(url.searchParams.get('village')) : null;
            if (home && village && home !== village) return result(false, [], 'INVALID_ROW');
            const label = row.querySelector('.quickedit-label');
            const coordinates = [...String(label?.textContent || '').matchAll(/\((\d{1,3}\|\d{1,3})\)/g)].map(match => match[1]);
            const command = { id: ids[0], sourceVillageId: home || village, type: icon?.dataset.commandType || null,
                target: coordinates.length === 1 ? coordinates[0] : null };
            const previous = commands.get(command.id);
            if (previous && JSON.stringify(previous) !== JSON.stringify(command)) return result(false, [], 'CONFLICTING_DUPLICATE');
            commands.set(command.id, command);
        }
        return result(true, [...commands.values()]);
    };

    // Evidence inventory only: no requests, getters on game_data, tokens or form values.
    // Counts/field names are not an outgoing baseline and never authorize submission.
    const snapshotSourceEvidence = targetWindow => {
        try {
            const doc = targetWindow.document;
            const all = selector => Array.from(doc.querySelectorAll?.(selector) || []);
            const shape = value => value && typeof value === 'object' ? Object.keys(value).slice(0, 80) : [];
            const gameData = Object.getOwnPropertyDescriptor(targetWindow, 'game_data')?.value;
            const village = gameData && Object.getOwnPropertyDescriptor(gameData, 'village')?.value;
            const safeUrl = value => {
                const url = new URL(value, targetWindow.location.href);
                return { path: url.pathname, screen: url.searchParams.get('screen'), mode: url.searchParams.get('mode'),
                    action: url.searchParams.get('action'), parameterNames: [...new Set(url.searchParams.keys())] };
            };
            const observed = readOutgoingCommands(targetWindow);
            return { strategy: 'place-command-rows', authoritativeSourceAvailable: observed.available, sourceReason: observed.reason, sourceState: observed.sourceState, source: observed.source,
                pageReady: observed.pageReady, commandRowCount: observed.commandRowCount, commandIds: observed.commandIds,
                emptyEvidence: { explicitOutgoingContainer: observed.outgoingContainerFound,
                    commandFormFound: Boolean(doc.querySelector('#command-data-form')),
                    targetContainerFound: Boolean(doc.getElementById?.('place_target')),
                    commandHeaderFound: Boolean(doc.getElementById?.('header_commands')),
                    commandTargetFound: Boolean(doc.querySelector('#command_target')), commandActionsFound: Boolean(doc.querySelector('#command_actions')),
                    pageReady: observed.pageReady, note: 'Empty requires the complete native place structure and no command markers.' },
                documentReadyState: doc.readyState, page: safeUrl(targetWindow.location.href),
                commandRelatedElementIds: all('[id]').map(node => node.id).filter(id => /command|outgoing/i.test(id)).slice(0, 40),
                identityMarkers: { infoCommandLinks: all('a[href*="info_command"]').length,
                    commandIdAttributes: all('[data-command-id]').length, genericIdAttributes: all('[data-id]').length },
                forms: all('form').slice(0, 8).map(form => ({ id: form.id || null, method: form.method || null,
                    destination: safeUrl(form.action || targetWindow.location.href),
                    fieldNames: [...new Set(Array.from(form.elements || []).map(field => field.name).filter(Boolean))].slice(0, 80) })),
                gameDataKeys: shape(gameData), villageDataKeys: shape(village),
                interpretation: 'Inventory only; missing DOM is unavailable, never an empty baseline. Response bodies and redirects are not captured.' };
        } catch { return { diagnosticUnavailable: true }; }
    };
    const sourceEvidenceLogged = new WeakMap();
    const logSnapshotSourceEvidence = (context, targetWindow, observed) => {
        try {
            const key = `${getCurrentEntry(context)?.confirmationAttempt?.attemptId}:${observed.sourceState}:${observed.reason}`;
            if (sourceEvidenceLogged.get(targetWindow.document) !== key) {
                sourceEvidenceLogged.set(targetWindow.document, key);
                diagnosticLog('SNAPSHOT_SOURCE_EVIDENCE', context, snapshotSourceEvidence(targetWindow));
            }
        } catch { /* Optional diagnostics never change the execution. */ }
    };

    const snapshotMatches = (context, entry, attempt) => {
        const snapshot = attempt?.outgoingSnapshot;
        return Boolean(snapshot && Array.isArray(snapshot.beforeCommandIds) &&
            attempt.commandId === getCommandKey(entry, context.currentIndex) &&
            snapshot.commandId === attempt.commandId && snapshot.attemptId === attempt.attemptId &&
            snapshot.executionId === context.executionTab && snapshot.target === entry.target &&
            snapshot.sourceVillageId === String(entry.sourceVillageId || entry.villageId) && Number.isFinite(snapshot.capturedAt));
    };

    const persistOutgoingSnapshot = (context, targetWindow) => {
        const entry = getCurrentEntry(context), commandId = getCommandKey(entry, context.currentIndex);
        let attempt = entry.confirmationAttempt;
        const restored = snapshotMatches(context, entry, attempt);
        if (!attempt) attempt = entry.confirmationAttempt = { commandId,
            attemptId: `${context.executionTab}:${commandId}:${Date.now()}:${Math.random()}`, state: 'snapshot-ready' };
        let reason = null;
        if (!restored && !attempt.outgoingSnapshot && attempt.commandId === commandId) {
            const observed = readOutgoingCommands(targetWindow);
            if (observed.available && String(getScreen(targetWindow).villageId) === String(entry.sourceVillageId || entry.villageId)) {
                attempt.outgoingSnapshot = { executionId: context.executionTab, commandId, attemptId: attempt.attemptId,
                    sourceVillageId: String(entry.sourceVillageId || entry.villageId), target: entry.target,
                    capturedAt: Date.now(), beforeCommandIds: observed.commands.map(command => command.id) };
            } else reason = observed.reason || 'SOURCE_MISMATCH';
        }
        const valid = snapshotMatches(context, entry, attempt);
        diagnosticLog('SNAPSHOT_PERSIST_START', context, { snapshotAvailable: valid, outgoingCommandIds: attempt.outgoingSnapshot?.beforeCommandIds ?? null });
        const saved = Boolean(valid && saveContext(context));
        diagnosticLog('SNAPSHOT_PERSIST_RESULT', context, { persisted: saved, snapshotAvailable: valid });
        const stored = saved ? readContext() : null;
        const persisted = Boolean(stored && snapshotMatches(stored, getCurrentEntry(stored), getCurrentEntry(stored)?.confirmationAttempt) &&
            JSON.stringify(getCurrentEntry(stored).confirmationAttempt.outgoingSnapshot) === JSON.stringify(attempt.outgoingSnapshot));
        diagnosticLog('SNAPSHOT_READBACK_RESULT', context, { persisted: saved, readBackValid: persisted });
        if (persisted) diagnosticLog(restored ? 'SNAPSHOT_RESTORED' : 'SNAPSHOT_PERSISTED', context, { source: 'place-command-rows', persisted: true, readBackValid: true, outgoingCommandIds: attempt.outgoingSnapshot.beforeCommandIds, beforeCommandIds: attempt.outgoingSnapshot.beforeCommandIds, sourceState: attempt.outgoingSnapshot.beforeCommandIds.length ? 'ROWS_PRESENT' : 'EMPTY_CONFIRMED' });
        diagnosticLog(persisted ? 'SNAPSHOT_CAPTURED' : 'SNAPSHOT_UNAVAILABLE', context, { source: 'place-command-rows', persisted, restoredAfterNavigation: restored, reason, beforeCommandIds: attempt.outgoingSnapshot?.beforeCommandIds ?? null });
        console.log?.('[EAS][FAKE][SNAPSHOT]', { executionId: context.executionTab, commandId, attemptId: attempt.attemptId,
            sourceVillageId: String(entry.sourceVillageId || entry.villageId), target: entry.target,
            capturedCommandIds: attempt.outgoingSnapshot?.beforeCommandIds ?? null,
            capturedAt: attempt.outgoingSnapshot?.capturedAt ?? null, persisted, restoredAfterNavigation: restored,
            reason: reason || (valid ? (persisted ? null : 'PERSISTENCE_FAILED') : 'SNAPSHOT_INVALID') });
        return persisted;
    };

    const reconcileOutgoing = (context, targetWindow, overrideResult = null) => {
        const entry = getCurrentEntry(context), attempt = entry?.confirmationAttempt, baseline = attempt?.outgoingSnapshot;
        diagnosticLog('RECONCILE_START', context);
        const observed = readOutgoingCommands(targetWindow);
        diagnosticLog('SNAPSHOT_AFTER_CAPTURED', context, { source: observed.source, sourceState: observed.sourceState, pageReady: observed.pageReady, commandRowCount: observed.commandRowCount, commandIds: observed.commandIds, snapshotAvailable: observed.available, snapshotReason: observed.reason, outgoingCommandIds: observed.available ? observed.commands.map(command => command.id) : null });
        const detail = { executionId: context.executionTab, commandId: getCommandKey(entry, context.currentIndex),
            attemptId: attempt?.attemptId || null, sourceVillageId: String(entry?.sourceVillageId || entry?.villageId || ''),
            expectedTarget: entry?.target, beforeCommandIds: baseline?.beforeCommandIds || null,
            afterCommandIds: observed.commands.map(command => command.id), newCommandIds: [], candidateCommandIds: [], matchedOutgoingCommandId: null };
        let result;
        if (attempt?.state === 'completed' && attempt.commandId === detail.commandId && attempt.outgoingCommandId) result = 'ALREADY_RECONCILED';
        else if (!baseline || !Array.isArray(baseline.beforeCommandIds)) result = 'SNAPSHOT_MISSING';
        else if (attempt.commandId !== detail.commandId || baseline.commandId !== detail.commandId || baseline.attemptId !== attempt.attemptId ||
            baseline.executionId !== context.executionTab || baseline.target !== entry.target || !Number.isFinite(baseline.capturedAt) || !Number.isFinite(attempt.startedAt) || baseline.capturedAt > attempt.startedAt) result = 'ATTEMPT_MISMATCH';
        else if (baseline.sourceVillageId !== detail.sourceVillageId || String(getScreen(targetWindow).villageId) !== detail.sourceVillageId) result = 'SOURCE_MISMATCH';
        else if (!observed.available) result = 'DOM_UNAVAILABLE';
        else {
            const fresh = observed.commands.filter(command => !baseline.beforeCommandIds.includes(command.id));
            detail.newCommandIds = fresh.map(command => command.id);
            const own = fresh.filter(command => command.sourceVillageId === detail.sourceVillageId && command.type === context.forwardingCommandType);
            const candidates = own.filter(command => command.target === detail.expectedTarget);
            detail.candidateCommandIds = [...new Set(candidates.map(command => command.id))];
            // Unknown target/type/source rows cannot disambiguate a concurrent send.
            const unknown = fresh.some(command => !command.sourceVillageId || !command.type || !command.target);
            result = !fresh.length ? 'NO_NEW_COMMAND' : unknown || fresh.length > 1 ? 'AMBIGUOUS'
                : !own.length ? 'SOURCE_OR_TYPE_MISMATCH' : !candidates.length ? 'TARGET_MISMATCH' : 'SUCCESS';
            if (result === 'SUCCESS') detail.matchedOutgoingCommandId = detail.candidateCommandIds[0];
        }
        detail.result = overrideResult || result;
        diagnosticLog('RECONCILE', context, { ...detail, source: observed.source, sourceState: observed.sourceState, pageReady: observed.pageReady, commandRowCount: observed.commandRowCount, commandIds: observed.commandIds });
        if (detail.result === 'SUCCESS') diagnosticLog('RECONCILE_NEW_COMMAND', context, { source: observed.source, outgoingCommandId: detail.matchedOutgoingCommandId, newCommandIds: detail.newCommandIds });
        diagnosticLog(detail.result === 'SUCCESS' ? 'RECONCILE_SUCCESS' : 'RECONCILE_UNCERTAIN', context, { result: detail.result, outgoingCommandId: detail.matchedOutgoingCommandId });
        console.log?.('[EAS][FAKE][RECONCILE]', detail);
        return detail;
    };

    const uniquePush = (items, value) => {
        if (!items.includes(value)) {
            items.push(value);
        }
    };

    const removeValue = (items, value) => {
        const index = items.indexOf(value);

        if (index >= 0) {
            items.splice(index, 1);
        }
    };

    const clearOtherTargetStatuses = (context, target, keptStatus) => {
        if (keptStatus !== 'completed') {
            removeValue(context.completed, target);
        }

        if (keptStatus !== 'skipped') {
            removeValue(context.skipped, target);
        }

        if (keptStatus !== 'error') {
            context.errors = context.errors.filter(
                (item) => item.commandKey !== target
            );
        }
    };

    const setInputValue = (input, value, targetWindow) => {
        const descriptor = Object.getOwnPropertyDescriptor(
            targetWindow.HTMLInputElement.prototype,
            'value'
        );

        if (descriptor?.set) {
            descriptor.set.call(input, String(value));
        } else {
            input.value = String(value);
        }

        input.dispatchEvent(new targetWindow.Event('input', { bubbles: true }));
        input.dispatchEvent(new targetWindow.Event('change', { bubbles: true }));
    };

    const findUnitInput = (form, unit) => {
        const selectors = [
            `input[name="${unit}"]`,
            `input[name="unit_${unit}"]`,
            `#unit_input_${unit}`,
            `[data-unit="${unit}"] input`
        ];

        return selectors
            .map((selector) => form.querySelector(selector))
            .find(Boolean) || null;
    };

    const getCachedTroops = (villageId) => {
        if (!EAS.Troops?.hasVillageData?.(villageId)) {
            return null;
        }

        return { ...EAS.Troops.getVillageTroops(villageId) };
    };

    const readAvailableFromPage = (targetDocument, input, unit) => {
        const values = [
            input.dataset?.allCount,
            input.dataset?.available,
            targetDocument.querySelector(`#units_entry_all_${unit}`)?.textContent
        ];
        const parsed = values
            .map((value) => String(value ?? '').replace(/\D/g, ''))
            .filter((value) => value !== '')
            .map(Number)
            .find((value) => Number.isFinite(value));

        return parsed ?? null;
    };

    const validateCurrent = (
        context,
        targetWindow,
        { commandType = null } = {}
    ) => {
        const entry = getCurrentEntry(context);
        const parsedTarget = EAS.Utils.parseCoordinate(entry?.target);
        const form = EAS.Place.getCommandForm(targetWindow.document);
        const requiredTroops = Object.entries(context.troopsPerTarget)
            .filter(([, quantity]) => Number(quantity) > 0);

        if (!parsedTarget) {
            return { valid: false, message: 'Alvo inválido.' };
        }

        if (
            Number(getScreen(targetWindow).villageId) !==
            Number(entry.villageId)
        ) {
            return {
                valid: false,
                wrongVillage: true,
                message: `Abra a aldeia ${entry.villageName} (${entry.villageCoord}) para continuar.`
            };
        }

        if (commandType !== null && !COMMAND_TYPES.includes(commandType)) {
            return { valid: false, message: 'Tipo de comando inválido.' };
        }

        if (!form) {
            return {
                valid: false,
                message: 'Formulário de comando não encontrado.'
            };
        }

        if (!requiredTroops.length) {
            return {
                valid: false,
                message: 'Nenhuma tropa configurada para este alvo.'
            };
        }

        if (context.preset === 'fake_nt') {
            if (commandType === 'support') return { valid: false, message: 'Fake NT é exclusivo para ataques.' };
            if (!(Number(context.troopsPerTarget.ram) > 0 || Number(context.troopsPerTarget.catapult) > 0)) {
                return { valid: false, message: 'Fake NT exige Aríete ou Catapulta.' };
            }
            if (Number(context.troopsPerTarget.snob) > 0) return { valid: false, message: 'Fake NT não pode utilizar Nobre.' };
        }
        if (context.preset === 'anti_snipe' && commandType === 'support') {
            return { valid: false, message: 'Fake Anti-Snipe é exclusivo para ataques.' };
        }

        const composition = EAS.CommandRules.validateCommandComposition({
            world: EAS.CommandRules.getWorld(), villageId: entry.villageId,
            villageCoord: entry.villageCoord,
            commandType: commandType || context.commandType,
            troops: context.troopsPerTarget
        });

        if (!composition.valid) {
            const populationReason = composition.reasons.find((reason) => reason.type === 'minimum-attack-population');
            const unitReason = composition.reasons.find((reason) => reason.type === 'minimum-unit-quantity');
            return {
                valid: false,
                populationInvalid: Boolean(populationReason),
                commandPopulation: composition.commandPopulation,
                minimumPopulation: composition.minimumAttackPopulation,
                unitViolations: composition.unitViolations,
                message: populationReason
                    ? `Composição inválida para esta aldeia. População atual: ${composition.commandPopulation}. Mínima: ${composition.minimumAttackPopulation}. Faltam: ${composition.missingPopulation}.`
                    : `Quantidade mínima de ${unitReason.unit}: ${unitReason.required}; atual: ${unitReason.current}.`
            };
        }

        const inputs = requiredTroops.reduce((result, [unit]) => {
            result[unit] = findUnitInput(form, unit);
            return result;
        }, {});
        const missingInputs = requiredTroops
            .filter(([unit]) => !inputs[unit])
            .map(([unit]) => unit);

        if (missingInputs.length) {
            return {
                valid: false,
                waitingForFields: true,
                message: `Campos de tropas indisponíveis: ${missingInputs.join(', ')}.`
            };
        }

        const cachedTroops = getCachedTroops(entry.villageId);
        const insufficient = requiredTroops.filter(([unit, quantity]) => {
            const available = cachedTroops
                ? Number(cachedTroops[unit] || 0)
                : readAvailableFromPage(
                    targetWindow.document,
                    inputs[unit],
                    unit
                );

            return available !== null && available < Number(quantity);
        });

        if (insufficient.length) {
            return {
                valid: false,
                message: 'Tropas insuficientes para este alvo.'
            };
        }

        return {
            valid: true,
            target: parsedTarget.coordinate,
            entry,
            commandKey: getCommandKey(entry, context.currentIndex),
            form,
            inputs,
            requiredTroops
        };
    };

    const startSnapshotPhase = context => {
        const entry = getCurrentEntry(context), wait = entry.preparationWait;
        if (!wait || wait.attemptId !== entry.confirmationAttempt?.attemptId ||
            entry.confirmationAttempt?.commandId !== getCommandKey(entry, context.currentIndex)) return false;
        if (wait.snapshotDeadlineAt == null) {
            wait.targetPreparationDeadline = wait.deadlineAt;
            wait.snapshotStartedAt = Date.now();
            wait.snapshotDeadlineAt = wait.snapshotStartedAt + OPEN_TIMEOUT_MS;
            wait.deadlineAt = wait.snapshotDeadlineAt;
            wait.phase = 'WAIT_SNAPSHOT'; wait.waiting = false;
            if (!saveContext(context)) return false;
            diagnosticLog('PREPARATION_PHASE_START', context, { targetReady: true });
        } else {
            if (!Number.isFinite(wait.snapshotDeadlineAt)) return false;
            wait.deadlineAt = wait.snapshotDeadlineAt;
            wait.phase = 'WAIT_SNAPSHOT';
        }
        return true;
    };

    const waitBeforeAttack = (context, phase, reason) => {
        const entry = getCurrentEntry(context), attempt = entry.confirmationAttempt;
        const previous = entry.preparationWait;
        if (!previous || previous.attemptId !== attempt?.attemptId || attempt?.commandId !== getCommandKey(entry, context.currentIndex) || !Number.isFinite(previous.deadlineAt)) return { valid: false, code: 'PREPARATION_SCOPE_INVALID', message: 'Identidade da preparacao invalida.' };
        const changed = !previous.waiting || previous.phase !== phase;
        previous.waiting = true;
        if (previous.phase !== phase) {
            previous.phase = phase; previous.startedAt = Date.now();
            diagnosticLog(phase === 'WAIT_PLACE' ? 'PLACE_WAIT_START' : phase === 'WAIT_TARGET' ? 'TARGET_WAIT_START' : 'SNAPSHOT_UNAVAILABLE', context, { reason });
        }
        if (changed && !saveContext(context)) return { valid: false, message: 'Falha ao persistir espera.' };
        if (phase === 'WAIT_SNAPSHOT') diagnosticLog('SNAPSHOT_WAIT', context, { snapshotAvailable: false, snapshotReason: reason });
        if (Date.now() >= previous.deadlineAt) {
            diagnosticLog('PREPARATION_DEADLINE_EXPIRED', context, { reason });
            return { valid: false, code: `${phase}_TIMEOUT`, message: `${phase}: tempo limite (${reason}). Nenhum ataque foi enviado.` };
        }
        return { valid: false, waiting: true, code: reason };
    };

    const targetReadinessDiagnostics = new WeakMap();
    const checkResolvedTarget = (context, targetWindow) => {
        const entry = getCurrentEntry(context);
        const state = EAS.Place.readTargetReadiness?.(entry.target, targetWindow, entry.targetVillageId ?? null);
        if (entry.preparationWait) entry.preparationWait.actualTarget = state?.actualTarget ?? null;
        // Diagnostic-only deduplication; never participates in readiness decisions.
        try {
            const detail = { expectedTarget: entry.target, actualTarget: state?.actualTarget ?? null,
                resolvedCoordinate: state?.resolvedCoordinate ?? null, placeTargetFound: Boolean(state?.placeTargetFound),
                villageItemFound: Boolean(state?.villageItemFound), villageNameFound: Boolean(state?.villageNameFound), inputVisible: Boolean(state?.inputVisible),
                candidateSelectors: state?.candidateSelectors || [], candidateCoordinates: state?.candidateCoordinates || [],
                selectorMatches: state?.selectorMatches || [], reason: state?.reason || 'TARGET_RESOLUTION_MISSING' };
            const signature = JSON.stringify({ attemptId: entry.confirmationAttempt?.attemptId, ready: Boolean(state?.targetReady), ...detail });
            if (!state?.targetReady && targetReadinessDiagnostics.get(targetWindow) !== signature) diagnosticLog('TARGET_NOT_READY', context, detail);
            targetReadinessDiagnostics.set(targetWindow, signature);
        } catch { /* Diagnostics cannot interrupt preparation. */ }
        return state;
    };

    const prepareCurrent = (
        context,
        targetWindow,
        commandType = null
    ) => {
        const entry = getCurrentEntry(context);
        if (context.autoMode) {
            if (!entry.confirmationAttempt) entry.confirmationAttempt = { commandId: getCommandKey(entry, context.currentIndex),
                attemptId: `${context.executionTab}:${getCommandKey(entry, context.currentIndex)}:${Date.now()}:${Math.random()}`, state: 'preparing' };
            if (entry.confirmationAttempt.commandId !== getCommandKey(entry, context.currentIndex) || !['preparing', 'snapshot-ready'].includes(entry.confirmationAttempt.state)) return { valid: false, message: 'Tentativa de preparacao ja consumida ou invalida.' };
            if (entry.preparationWait && entry.preparationWait.attemptId !== entry.confirmationAttempt.attemptId) return { valid: false, code: 'PREPARATION_SCOPE_INVALID', message: 'Espera pertence a outra tentativa.' };
            if (!entry.preparationWait) {
                entry.preparationWait = { attemptId: entry.confirmationAttempt.attemptId, phase: 'WAIT_PLACE', startedAt: Date.now(), deadlineAt: Date.now() + OPEN_TIMEOUT_MS, applied: false };
                diagnosticLog('PREPARATION_PHASE_START', context);
                diagnosticLog('PLACE_WAIT_START', context);
                if (!saveContext(context)) return { valid: false, message: 'Falha ao persistir preparacao.' };
            }
            if (entry.preparationWait.waiting && Date.now() >= entry.preparationWait.deadlineAt) return waitBeforeAttack(context, entry.preparationWait.phase, 'PREPARATION_DEADLINE');
            const form = EAS.Place.getCommandForm(targetWindow.document);
            const sourceReady = targetWindow.game_data?.village?.id == null || Number(targetWindow.game_data.village.id) === Number(entry.villageId);
            if (targetWindow.document.readyState === 'loading' || !form || !sourceReady) return waitBeforeAttack(context, 'WAIT_PLACE', 'PLACE_LOADING');
            if (!entry.preparationWait.applied) diagnosticLog('PLACE_READY', context);
        }
        const validation = validateCurrent(
            context,
            targetWindow,
            { commandType }
        );

        if (!validation.valid) {
            if (context.autoMode && validation.waitingForFields) return waitBeforeAttack(context, 'WAIT_PLACE', 'TROOP_FIELDS_LOADING');
            return validation;
        }

        if (!context.autoMode || !entry.preparationWait.applied) {
            diagnosticLog('TARGET_APPLY_START', context);
            if (!EAS.Place.fillCommandTarget(validation.target, targetWindow)) return { valid: false, code: 'TARGET_NOT_APPLIED', message: 'Nao foi possivel preparar o alvo.' };
            if (context.autoMode) {
                entry.preparationWait.applied = true;
                // Preserve the native payload application; do not repeat it while waiting.
                const applied = EAS.Place.ensureCommandTarget?.(entry.target, targetWindow, entry.targetVillageId ?? null);
                entry.preparationWait.actualTarget = applied?.actualTarget ?? null;
                if (!applied?.targetValidated && applied?.inputTarget !== entry.target) return { valid: false, code: 'TARGET_NOT_APPLIED', message: 'Destino nativo nao validado.' };
                if (!saveContext(context)) return { valid: false, message: 'Falha ao persistir destino aplicado.' };
            }
            diagnosticLog('TARGET_APPLIED', context);
        }
        if (context.autoMode) {
            if (entry.preparationWait.phase !== 'WAIT_TARGET') diagnosticLog('TARGET_WAIT_START', context);
            const ready = checkResolvedTarget(context, targetWindow);
            if (!ready?.targetReady) return waitBeforeAttack(context, 'WAIT_TARGET', ready?.reason || 'TARGET_RESOLUTION_MISSING');
            entry.preparationWait.waiting = false;
            entry.preparationWait.phase = 'TARGET_READY';
            diagnosticLog('TARGET_READY', context, { actualTarget: ready.actualTarget, resolutionEvidence: ready.resolutionEvidence, resolutionSource: ready.resolutionSource, resolvedCoordinate: ready.resolvedCoordinate, matchedSelector: ready.matchedSelector, inputVisible: ready.inputVisible, villageItemVisible: ready.villageItemVisible });
            diagnosticLog('TARGET_VALIDATED', context, { actualTarget: ready.actualTarget });
        }
        UNITS.forEach((unit) => {
            const input = findUnitInput(validation.form, unit);
            if (input) setInputValue(input, 0, targetWindow);
        });
        validation.requiredTroops.forEach(([unit, quantity]) => setInputValue(validation.inputs[unit], Number(quantity), targetWindow));
        diagnosticLog('TROOPS_FILLED', context);
        if (validation.requiredTroops.some(([unit, quantity]) => Number(validation.inputs[unit].value) !== Number(quantity))) return { valid: false, message: 'Campos de tropas nao validados.' };
        diagnosticLog('TROOPS_VALIDATED', context);
        if (context.autoMode) {
            const latest = readContext();
            if (!latest || latest.executionTab !== context.executionTab ||
                latest.currentIndex !== context.currentIndex || latest.queue[context.currentIndex]?.status !== 'preparing') {
                return { valid: false, message: 'Execução interrompida durante a preparação.' };
            }
        }
        uniquePush(context.prepared, validation.commandKey);
        validation.entry.status = 'prepared';
        if (!saveContext(context)) return { valid: false, message: 'Falha ao persistir a prepara\u00e7\u00e3o.' };

        return validation;
    };

    const findCommandButton = (form, commandType) => {
        const selectors = commandType === 'attack'
            ? [
                'button[name="attack"]',
                'input[name="attack"]',
                '#target_attack',
                '[data-command="attack"]'
            ]
            : [
                'button[name="support"]',
                'input[name="support"]',
                '#target_support',
                '[data-command="support"]'
            ];
        const known = selectors
            .map((selector) => form.querySelector(selector))
            .find(Boolean) || null;

        if (known) {
            return known;
        }

        const labels = commandType === 'attack'
            ? ['ataque', 'atacar']
            : ['apoio', 'apoiar'];

        return Array.from(form.querySelectorAll(
            'button, input[type="submit"], input[type="button"]'
        )).find((element) => {
            const text = normalizeMessageText(
                element.textContent || element.value
            ).toLowerCase();

            return labels.includes(text);
        }) || null;
    };

    const attackCurrent = (context, targetWindow, commandType, beforeClick = () => {}) => {
        const current = readContext();
        const entry = getCurrentEntry(context);
        if (!current || current.currentIndex !== context.currentIndex ||
            current.createdAt !== context.createdAt || current.queue?.[context.currentIndex]?.status !== entry?.status ||
            !['pending', 'prepared'].includes(entry?.status)) {
            return { valid: false, message: 'Contexto do comando alterado.' };
        }
        if (context.autoMode && entry.preparationWait) {
            if (entry.preparationWait.attemptId !== entry.confirmationAttempt?.attemptId || entry.confirmationAttempt?.commandId !== getCommandKey(entry, context.currentIndex)) return { valid: false, code: 'PREPARATION_SCOPE_INVALID', message: 'Espera pertence a outro comando/tentativa.' };
            if (entry.preparationWait.waiting && Date.now() >= entry.preparationWait.deadlineAt) return waitBeforeAttack(context, entry.preparationWait.phase, 'PREPARATION_DEADLINE');
            if (targetWindow.document.readyState === 'loading' || (targetWindow.game_data?.village?.id != null && Number(targetWindow.game_data.village.id) !== Number(entry.villageId))) return waitBeforeAttack(context, 'WAIT_PLACE', 'SOURCE_OR_PLACE_LOADING');
        }
        const result = entry.status === 'prepared'
            ? validateCurrent(context, targetWindow, { commandType })
            : prepareCurrent(context, targetWindow, commandType);
        const button = result.valid ? findCommandButton(result.form, commandType) : null;
        if (!result.valid || !button || button.disabled) {
            return { valid: false, message: result.message || 'Botão de comando indisponível.' };
        }
        if (context.autoMode && result.requiredTroops.some(([unit, quantity]) => Number(result.inputs[unit].value) !== Number(quantity))) {
            return { valid: false, message: 'Campos preparados foram alterados. Verifique tropas e alvo.' };
        }
        const target = EAS.Place.ensureCommandTarget?.(entry.target, targetWindow, entry.targetVillageId ?? null);
        console.log?.('[EAS][FAKE][TARGET]', { commandId: getCommandKey(entry, context.currentIndex),
            expectedTarget: entry.target, targetVillageId: entry.targetVillageId ?? null, ...target });
        if (!target?.targetValidated) {
            if (context.autoMode && target?.inputTarget === entry.target) return waitBeforeAttack(context, 'WAIT_TARGET', 'NATIVE_TARGET_PENDING');
            return { valid: false, code: 'TARGET_NOT_APPLIED', message: 'TARGET_NOT_APPLIED: destino nativo não validado. Nenhum ataque foi submetido.' };
        }
        if (context.autoMode) {
            const ready = checkResolvedTarget(context, targetWindow);
            if (!ready?.targetReady) return waitBeforeAttack(context, 'WAIT_TARGET', ready?.reason || 'TARGET_RESOLUTION_MISSING');
        }
        bindExecutionTab(context, targetWindow);
        if (context.autoMode && !startSnapshotPhase(context)) return { valid: false, code: 'PREPARATION_SCOPE_INVALID', message: 'Falha ao persistir fase de snapshot.' };
        diagnosticLog('SNAPSHOT_CAPTURE_START', context, { targetReady: true });
        const observed = readOutgoingCommands(targetWindow);
        const snapshotDetail = { source: observed.source, sourceState: observed.sourceState, pageReady: observed.pageReady, commandRowCount: observed.commandRowCount, commandIds: observed.commandIds, targetReady: true, snapshotAvailable: observed.available, snapshotReason: observed.reason,
            outgoingContainerFound: observed.outgoingContainerFound, outgoingRowsFound: observed.outgoingRowsFound,
            outgoingCommandIds: observed.available ? observed.commands.map(command => command.id) : null, documentUrl: targetWindow.location.href };
        if (observed.available) {
            diagnosticLog('SNAPSHOT_SOURCE_FOUND', context, snapshotDetail);
            if (!observed.commands.length) diagnosticLog('SNAPSHOT_EMPTY_VALID', context, snapshotDetail);
        }
        diagnosticLog('SNAPSHOT_SOURCE_CHECK', context, snapshotDetail);
        logSnapshotSourceEvidence(context, targetWindow, observed);
        diagnosticLog('SNAPSHOT_CAPTURE_RESULT', context, snapshotDetail);
        if (context.autoMode && !observed.available && ['CONTAINER_MISSING', 'DOM_LOADING', 'PLACE_NOT_READY'].includes(observed.reason)) return waitBeforeAttack(context, 'WAIT_SNAPSHOT', observed.reason);
        if (!persistOutgoingSnapshot(context, targetWindow)) return { valid: false, code: 'SNAPSHOT_UNAVAILABLE', message: 'Snapshot indisponivel. Nenhum ataque foi enviado.' };
        if (entry.preparationWait) { entry.preparationWait.waiting = false; entry.preparationWait.phase = 'SNAPSHOT_READY'; }
        diagnosticLog('SNAPSHOT_READY', context);
        context.forwardingIndex = context.currentIndex;
        context.forwardingCommandType = commandType;
        context.forwardingStartedAt = Date.now();
        diagnosticLog('COMMAND_START', context);
        result.entry.status = context.autoMode ? 'attacking' : 'forwarding';
        if (!saveContext(context)) return { valid: false, message: 'Falha ao persistir ataque.' };
        beforeClick();
        if (targetWindow.EASRateLimit?.check()) return { valid: false, code: 'RATE_LIMITED', message: 'RATE_LIMITED' };
        diagnosticLog('ATTACK_SUBMIT', context);
        console.log?.('[EAS][FAKE][ATTACK]', { commandId: getCommandKey(entry, context.currentIndex), targetValidated: true, submitting: true });
        button.click();
        return result;
    };

    const normalizeMessageText = (value) => {
        return String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const parseMinimumPopulationError = (value) => {
        const parsed = EAS.CommandRules.parseCommandRuleError(value);
        return parsed?.type === 'minimum-attack-population' ? parsed : null;
    };

    const detectMinimumPopulationError = (targetDocument) => {
        return EAS.CommandRules.scanCommandRuleErrors(targetDocument)
            .find((rule) => rule.type === 'minimum-attack-population') || null;
    };

    const detectConfirmationCommandType = (targetDocument) => {
        const confirmation = targetDocument.querySelector(
            '#command-confirm-form, form[action*="action=command"]'
        );
        const main = confirmation || targetDocument.querySelector(
            '#content_value, #contentContainer, main'
        ) || targetDocument.body;
        const text = normalizeMessageText(main?.textContent).toLowerCase();

        if (
            main?.querySelector?.(
                '[name="support"], [data-command="support"]'
            ) ||
            /confirmar apoio|enviar apoio/.test(text)
        ) {
            return 'support';
        }

        if (
            main?.querySelector?.(
                '[name="attack"], [data-command="attack"]'
            ) ||
            /confirmar ataque|enviar ataque/.test(text)
        ) {
            return 'attack';
        }

        return null;
    };

    const isConfirmationScreen = (
        targetDocument,
        expectedCommandType = null
    ) => {
        const hasConfirmationStructure = Boolean(targetDocument.querySelector(
            '#command-confirm-form, form[action*="action=command"] input[name="h"]'
        ));

        if (!hasConfirmationStructure) {
            return false;
        }

        const detectedCommandType = detectConfirmationCommandType(
            targetDocument
        );

        return !expectedCommandType ||
            !detectedCommandType ||
            detectedCommandType === expectedCommandType;
    };

    const rejectForCommandRule = (context, entryIndex, detected) => {
        const entry = context.queue[entryIndex];
        const commandKey = getCommandKey(entry, entryIndex);
        clearOtherTargetStatuses(context, commandKey, 'error');
        context.errors.push({
            commandKey,
            target: entry?.target,
            villageId: entry?.villageId,
            reason: detected.type,
            ...detected
        });
        if (entry) {
            entry.status = 'rejected-command-rule';
        }
        context.forwardingIndex = null;
        context.forwardingCommandType = null;
        context.lastPopulationRejection = {
            target: entry?.target,
            ...detected,
            detectedAt: Date.now()
        };
        EAS.CommandRules.saveDetectedRule(detected, {
            villageId: entry?.villageId, villageName: entry?.villageName,
            villageCoord: entry?.villageCoord
        });
        saveContext(context);
    };

    const completeForwardedTarget = (
        context,
        entryIndex,
        executedCommandType
    ) => {
        const entry = context.queue[entryIndex];
        const commandKey = getCommandKey(entry, entryIndex);
        clearOtherTargetStatuses(context, commandKey, 'completed');
        uniquePush(context.completed, commandKey);

        if (entry) {
            entry.status = 'completed';
            entry.executedCommandType = executedCommandType;
            if (entry.confirmationAttempt?.commandId === commandKey) {
                entry.confirmationAttempt.state = 'completed';
                entry.confirmationAttempt.completedAt = Date.now();
                // The baseline is needed only until reconciliation. Keep attempt identity
                // and matched ID for auditing without storing every old ID for every fake.
                if (entry.confirmationAttempt.outgoingSnapshot) delete entry.confirmationAttempt.outgoingSnapshot.beforeCommandIds;
                delete entry.outgoingBefore;
            }
            diagnosticLog('COMMAND_COMPLETE', context, { outgoingCommandId: entry.confirmationAttempt?.outgoingCommandId });
            console.log?.('[EAS][FAKE][QUEUE] command completed', { oldCommandId: commandKey, confirmationAttempt: JSON.parse(JSON.stringify(entry.confirmationAttempt || null)) });
            confirmationTrace(context, entryIndex, 'completed');
        }

        if (context.currentIndex === entryIndex) {
            context.currentIndex += 1;
        }

        context.forwardingIndex = null;
        context.forwardingCommandType = null;
        context.lastPopulationRejection = null;
        const persisted = saveContext(context);
        console.log?.('[EAS][FAKE][QUEUE] advancing', { oldCommandId: commandKey, newCommandId: getCurrentEntry(context) ? getCommandKey(getCurrentEntry(context), context.currentIndex) : null });
        console.log?.('[EAS][FAKE][QUEUE] confirmation state after advance', JSON.parse(JSON.stringify({ currentIndex: context.currentIndex, forwardingIndex: context.forwardingIndex, currentCommand: getCurrentEntry(context), previousAttempt: entry?.confirmationAttempt || null })));
        confirmationTrace(context, context.currentIndex, `advancing to=${getCurrentEntry(context) ? getCommandKey(getCurrentEntry(context), context.currentIndex) : 'finished'}`);
        return persisted;
    };

    const confirmLog = (message) => console.debug(`[fake.exec.confirm] ${message}`);
    const confirmationTrace = (context, index, event) => {
        const entry = context?.queue?.[index];
        const attempt = entry?.confirmationAttempt;
        console.debug(`[fake.confirm] executionId=${context?.executionTab || 'none'} currentCommandId=${entry ? getCommandKey(entry, index) : 'none'} attemptId=${attempt?.attemptId || 'none'} previousCommandId=${index > 0 ? getCommandKey(context.queue[index - 1], index - 1) : 'none'} lock=${JSON.stringify(attempt || null)} ${event}`);
    };


    // Temporary DEV diagnostics. Read existing state only; never used to authorize actions.
    const confirmationDiagnostic = (targetWindow = window, event = 'MANUAL', guardReason = null) => {
        try {
            const raw = readContext();
            const context = raw ? normalizeContext(raw) : null;
            const entry = context?.queue?.[context.currentIndex];
            const id = entry ? getCommandKey(entry, context.currentIndex) : null;
            const attempt = entry?.confirmationAttempt || null;
            const url = new URL(targetWindow.location.href);
            const form = targetWindow.document.querySelector('#command-data-form');
            const button = form?.querySelector('#troop_confirm_submit');
            const confirmPageDetected = url.searchParams.get('screen') === 'place' && url.searchParams.get('try') === 'confirm';
            const tabAuthorized = Boolean(context?.executionTab && context.executionTab === targetWindow.name);
            let blockedReason = !context ? 'NO_ACTIVE_EXECUTION'
                : !context.executionTab ? 'NO_EXECUTION_TAB'
                : !tabAuthorized ? 'TAB_NOT_AUTHORIZED'
                : context.endedAt || context.finishedAt ? 'EXECUTION_ENDED'
                : !isMatchingPlace(context, targetWindow) ? 'PLACE_OR_VILLAGE_MISMATCH'
                : !entry ? 'NO_CURRENT_COMMAND'
                : !Number.isInteger(context.forwardingIndex) ? 'NO_FORWARDING_COMMAND'
                : context.forwardingIndex !== context.currentIndex ? 'FORWARDING_INDEX_MISMATCH'
                : Number(entry.villageId) !== getScreen(targetWindow).villageId ? 'CURRENT_VILLAGE_MISMATCH'
                : !confirmPageDetected ? 'NOT_CONFIRM_PAGE'
                : ['confirming', 'submitted', 'completed'].includes(entry.status) ? 'COMMAND_ALREADY_SUBMITTED'
                : attempt?.commandId === id && ['confirming', 'submitted', 'completed'].includes(attempt.state) ? 'CONFIRMATION_LOCK'
                : !['forwarding', 'prepared', 'confirm-page'].includes(entry.status) ? 'COMMAND_STATE_NOT_CONFIRMABLE'
                : !form ? 'FORM_NOT_FOUND'
                : !button ? 'BUTTON_NOT_FOUND'
                : button.disabled ? 'BUTTON_DISABLED'
                : button.matches?.(':disabled') ? 'BUTTON_EFFECTIVELY_DISABLED'
                : context.completed.includes(id) ? 'COMMAND_ALREADY_COMPLETED' : null;
            const runtime = targetWindow.__easFakesAuto;
            const snapshot = {
                event, url: url.href, executionFound: Boolean(raw), executionId: context?.executionTab || null,
                tabAuthorized, tabId: targetWindow.name, currentCommand: entry || null,
                currentCommandId: id, commandState: entry?.status || null,
                currentIndex: context?.currentIndex, forwardingIndex: context?.forwardingIndex,
                forwardingStartedAt: context?.forwardingStartedAt,
                autoMode: context?.autoMode, paused: context?.paused,
                endedAt: context?.endedAt || null, finishedAt: context?.finishedAt || null,
                snapshotSourceEvidence: snapshotSourceEvidence(targetWindow),
                executionErrors: context?.errors || [], documentReadyState: targetWindow.document.readyState,
                pageVillageId: getScreen(targetWindow).villageId,
                elapsedSinceForwardingMs: context?.forwardingStartedAt ? Date.now() - context.forwardingStartedAt : null,
                attemptId: attempt?.attemptId || null, confirmationLock: attempt,
                lastConfirmation: context?.lastConfirmation || context?.queue?.slice(0, context.currentIndex).reverse().find(item => item.confirmationAttempt)?.confirmationAttempt || null,
                confirmPageDetected, formFound: Boolean(form), buttonFound: Boolean(button),
                buttonDisabled: button?.disabled ?? null, buttonEffectivelyDisabled: button?.matches?.(':disabled') ?? null,
                buttonValue: button?.value ?? null,
                bootstrapExecuted: Boolean(targetWindow.__EAS_TW_BOOTSTRAPPED__ || targetWindow.__EAS_TW_RUNTIME_RESUMED__),
                bootstrapState: targetWindow.__EAS_TW_RUNTIME_RESUMED__ || null,
                bootstrapInitializing: targetWindow.__EAS_TW_INITIALIZING__ ?? null,
                bootstrapSilent: targetWindow.__EAS_TW_SILENT_BOOTSTRAP__ ?? null,
                runtime: runtime ? { commandId: runtime.commandId, attemptId: runtime.attemptId,
                    executionTab: runtime.executionTab, stopped: runtime.stopped,
                    sameDocument: runtime.document === targetWindow.document,
                    confirmationPage: runtime.confirmationPage, timerPresent: runtime.timer != null } : null,
                canConfirm: !blockedReason && !guardReason,
                blockedReason: guardReason || blockedReason,
                confirmationGuardReason: blockedReason
            };
            // Detach every returned object from live runtime/bootstrap references.
            const detached = JSON.parse(JSON.stringify(snapshot));
            if (confirmPageDetected || event === 'MANUAL') {
                console.group?.('[EAS][FAKE][CONFIRM DIAGNOSTIC]');
                for (const [key, value] of Object.entries(detached)) console.log?.(key, value);
                console.groupEnd?.();
            } else {
                console.log?.('[EAS][FAKE][CONFIRM]', { event, blockedReason: detached.blockedReason, url: url.href });
            }
            return detached;
        } catch (error) {
            // Logging must never interrupt the executor, even with incomplete DOM/storage.
            console.log?.('[EAS][FAKE][CONFIRM DIAGNOSTIC]', { event, diagnosticError: String(error) });
            return { event, canConfirm: false, blockedReason: 'DIAGNOSTIC_READ_ERROR', diagnosticError: String(error) };
        }
    };

    // window.name survives same-origin navigation and is not shared by manual tabs.
    const bindExecutionTab = (context, targetWindow) => {
        context.executionTab = context.executionTab || `eas-fakes:${Date.now()}:${Math.random()}`;
        targetWindow.name = context.executionTab;
    };

    const resumeConfirmation = (targetWindow = window) => {
        if (targetWindow.EASRateLimit?.check()) return false;
        targetWindow.__EASFakeBootstrapMark?.('confirmationHandlerEntered');
        confirmationDiagnostic(targetWindow, 'CONFIRM_HANDLER_ENTER');
        const stored = readContext();
        diagnosticLog('RESUME', stored, { confirmationPage: String(targetWindow.location.href).includes('try=confirm') });
        if (!stored || !stored.executionTab || targetWindow.name !== stored.executionTab ||
            stored.endedAt || stored.finishedAt || !isMatchingPlace(stored, targetWindow)) {
            confirmationDiagnostic(targetWindow, 'CONFIRM_GUARD');
            confirmLog('invalid context');
            confirmationTrace(stored, stored?.currentIndex, 'allowed=false blocked reason=inactive-or-wrong-tab/page');
            return false;
        }
        const context = normalizeContext(stored);
        const index = context.forwardingIndex;
        const entry = context.queue[index];
        if (!Number.isInteger(index) || index !== context.currentIndex || !entry ||
            Number(entry.villageId) !== getScreen(targetWindow).villageId) {
            confirmationDiagnostic(targetWindow, 'CONFIRM_GUARD');
            confirmationTrace(context, context.currentIndex, 'allowed=false blocked reason=current-command-mismatch');
            return false;
        }
        const doc = targetWindow.document;
        const url = new URL(targetWindow.location.href);
        const form = doc.querySelector('#command-data-form');
        const submit = form?.querySelector('#troop_confirm_submit');
        const confirmation = url.searchParams.get('try') === 'confirm';
        if (confirmation) {
            confirmLog('page detected');
            confirmLog(`command=${getCommandKey(entry, index)}`);
            if (form) confirmLog('form found');
            if (submit) confirmLog('button found');
            confirmLog('validating');
            const commandId = getCommandKey(entry, index);
            const attempt = entry.confirmationAttempt;
            if (['confirming', 'submitted', 'completed'].includes(entry.status) ||
                (attempt?.commandId === commandId && ['confirming', 'submitted', 'completed'].includes(attempt.state))) {
                confirmationDiagnostic(targetWindow, 'CONFIRM_GUARD');
                confirmLog('duplicate blocked');
                confirmationTrace(context, index, 'allowed=false blocked reason=command-attempt-already-consumed');
                return true;
            }
            if (!['forwarding', 'prepared', 'confirm-page'].includes(entry.status) ||
                !form || !submit || submit.disabled || submit.matches?.(':disabled') ||
                context.completed.includes(getCommandKey(entry, index))) {
                confirmationDiagnostic(targetWindow, 'CONFIRM_GUARD');
                confirmLog('invalid context');
                confirmationTrace(context, index, `allowed=false blocked reason=${!form ? 'missing-form' : !submit ? 'missing-button' : submit.disabled || submit.matches?.(':disabled') ? 'disabled-button' : 'command-state:' + entry.status}`);
                return true;
            }
            diagnosticLog('CONFIRM_PAGE', context);
            // The attempt belongs to this queue entry, including repeated targets/origins.
            // Never borrow a consumed attempt from the previous command.
            if (!persistOutgoingSnapshot(context, targetWindow)) {
                confirmationDiagnostic(targetWindow, 'CONFIRM_GUARD', 'SNAPSHOT_UNAVAILABLE');
                confirmationTrace(context, index, 'allowed=false blocked reason=snapshot-unavailable');
                return true;
            }
            entry.confirmationAttempt.state = 'confirming';
            entry.confirmationAttempt.startedAt = Date.now();
            entry.status = 'confirming';
            entry.confirmationUrl = targetWindow.location.href;
            if (!saveContext(context)) {
                confirmationDiagnostic(targetWindow, 'CONFIRM_GUARD', 'PERSISTENCE_FAILED');
                confirmationTrace(context, index, 'allowed=false blocked reason=persistence-failed');
                return true;
            }
            console.log?.('[EAS][FAKE][CONFIRM] ALLOWED', { commandId, attemptId: entry.confirmationAttempt.attemptId });
            confirmationTrace(context, index, 'allowed=true submit');
            confirmLog('submitting');
            if (targetWindow.EASRateLimit?.check()) return false;
            diagnosticLog('CONFIRM_SUBMIT', context);
            console.log?.('[EAS][FAKE][CONFIRM] CLICKING', { commandId, attemptId: entry.confirmationAttempt.attemptId });
            submit.click();
            console.log?.('[EAS][FAKE][CONFIRM] CLICK_DISPATCHED', { commandId, attemptId: entry.confirmationAttempt.attemptId });
            return true;
        }
        // A return to place is not evidence of sending. Compare this attempt's
        // persisted baseline with the server-rendered outgoing command identities.
        if (['confirming', 'submitted'].includes(entry.status) && !doc.querySelector('.error_box, .error')) {
            if (entry.confirmationAttempt && !entry.confirmationAttempt.reconcileStartedAt) {
                entry.confirmationAttempt.reconcileStartedAt = Date.now();
                if (!saveContext(context)) return true;
            }
            const reconciliation = reconcileOutgoing(context, targetWindow);
            if (reconciliation.result !== 'SUCCESS') return true;
            entry.confirmationAttempt.outgoingCommandId = reconciliation.matchedOutgoingCommandId;
            context.lastConfirmation = { commandId: getCommandKey(entry, index),
                attemptId: entry.confirmationAttempt.attemptId, outgoingCommandId: reconciliation.matchedOutgoingCommandId,
                sourceVillageId: entry.sourceVillageId || entry.villageId, target: entry.target, completedAt: Date.now() };
            entry.status = 'submitted';
            confirmLog('submitted');
            if (!completeForwardedTarget(context, index, context.forwardingCommandType)) return true;
            if (!getCurrentEntry(context)) {
                finishExecution(context, targetWindow);
                return true;
            }
            context.continueQueue = true;
            if (!saveContext(context)) return true;
            targetWindow.location.href = String(EAS.Place.buildPlaceUrl(getCurrentEntry(context).villageId));
            return true;
        }
        confirmationDiagnostic(targetWindow, 'CONFIRM_RETURN', 'NOT_CONFIRM_PAGE');
        return ['confirming', 'submitted'].includes(entry.status);
    };

    const AUTO_STEP_MS = 400;
    const TERMINAL_STATES = ['completed', 'skipped', 'error'];
    const executionCounts = (context) => {
        const queue = context.queue || [];
        const count = (status) => queue.filter((entry) => entry.status === status).length;
        return { total: queue.length, completed: count('completed'), skipped: count('skipped'),
            errors: count('error'), remaining: queue.filter((entry) => !TERMINAL_STATES.includes(entry.status)).length };
    };

    const finishExecution = (context, targetWindow, stopped = false) => {
        targetWindow.__easFakesAuto?.stop();
        const summary = { ...context, counts: executionCounts(context), finishedAt: Date.now(), stopped };
        // Persist the terminal state first, so a stopped run cannot resume on reload.
        if (!saveContext(summary)) return false;
        summary.elapsedMs = Math.max(0, summary.finishedAt - (context.createdAt || summary.finishedAt));
        // Keep the full authorized queue and command errors for local auditing.
        try { localStorage.setItem('eas_tw_fakes_execution_summary', JSON.stringify(summary)); }
        catch { return false; }
        targetWindow.__easFakesAuto?.stop();
        removeContext();
        diagnosticLog('EXECUTION_COMPLETE', context, { stopped });
        const doc = targetWindow.document;
        const panel = doc.createElement('aside');
        panel.id = PANEL_ID;
        panel.className = 'fake-execution-panel';
        panel.textContent = `${stopped ? 'Execução parada' : 'Execução concluída'}. Planejados: ${summary.counts.total}. Enviados: ${summary.counts.completed}. Pulados: ${summary.counts.skipped}. Erros: ${summary.counts.errors}. Tempo total: ${Math.round(summary.elapsedMs / 1000)}s.`;
        doc.getElementById(PANEL_ID)?.remove();
        doc.body.appendChild(panel);
        return true;
    };

    const failAutomatic = (context, error) => {
        if (window.EASRateLimit?.check()) return;
        diagnosticLog('ERROR', context, { message: error?.message });
        const entry = getCurrentEntry(context);
        if (!entry) return;
        const detail = { commandKey: getCommandKey(entry, context.currentIndex),
            villageId: entry.villageId, target: entry.target, state: entry.status,
            reason: String(error?.message || error), code: error?.code || null, detectedAt: Date.now() };
        entry.status = 'error';
        context.paused = true;
        context.errors = context.errors.filter((item) => item.commandKey !== detail.commandKey);
        context.errors.push(detail);
        saveContext(context);
        console.error('[fake.exec] paused', detail);
    };

    const automaticControl = (targetWindow, action) => {
        if (action === 'resume-rate-limit') {
            if (!targetWindow.EASRateLimit?.resumeUnsent()) return false;
            return resumeAutomatic(targetWindow);
        }
        if (action !== 'stop' && targetWindow.EASRateLimit?.check()) return false;
        const stored = readContext();
        if (!stored?.autoMode || stored.executionTab !== targetWindow.name) return false;
        const context = normalizeContext(stored);
        if (action === 'stop') return finishExecution(context, targetWindow, true);
        const entry = getCurrentEntry(context);
        // Recovery never resends an uncertain command. Skip must be an explicit choice.
        if (!entry || (!context.paused && !['pending', 'prepared'].includes(entry.status))) return false;
        const key = getCommandKey(entry, context.currentIndex);
        if (!['skip', 'error'].includes(action)) return false;
        if (action === 'error') {
            failAutomatic(context, 'Erro marcado pelo usuário.');
        } else if (entry.status !== 'error') {
            entry.status = 'skipped';
            uniquePush(context.skipped, key);
        }
        context.currentIndex++;
        context.forwardingIndex = null;
        context.forwardingCommandType = null;
        context.paused = false;
        context.continueQueue = true;
        if (!saveContext(context)) return false;
        targetWindow.__easFakesAuto?.stop();
        if (!getCurrentEntry(context)) return finishExecution(context, targetWindow);
        targetWindow.location.href = String(EAS.Place.buildPlaceUrl(getCurrentEntry(context).villageId));
        return true;
    };

    const renderAutomatic = (context, targetWindow) => {
        const doc = targetWindow.document;
        let panel = doc.getElementById(PANEL_ID);
        if (!panel) {
            panel = doc.createElement('aside');
            panel.id = PANEL_ID;
            panel.className = 'fake-execution-panel';
            doc.body.appendChild(panel);
        }
        const entry = getCurrentEntry(context);
        const counts = executionCounts(context);
        const labels = { pending: 'Aguardando', preparing: 'Preparando...', prepared: 'Preparado',
            attacking: 'Atacando...', 'confirm-page': 'Confirmando...', confirming: 'Confirmando...',
            submitted: 'Enviado', error: 'Pausado por erro' };
        const text = `Execução automática | Atual: ${entry?.villageName || entry?.villageId || '-'} \u2192 ${entry?.target || '-'} | Estado: ${labels[entry?.status] || entry?.status || 'Concluído'} | Total: ${counts.total} | Concluídos: ${counts.completed} | Restantes: ${counts.remaining} | Erros: ${counts.errors} | Pulados: ${counts.skipped}${context.paused ? ' | ' + (context.rateLimit?.state === 'RATE_LIMITED' ? 'RATE_LIMITED: recuperacao manual necessaria.' : context.errors.at(-1)?.reason || '') : ''}`;
        if (panel.dataset.autoText === text) return;
        panel.dataset.autoText = text;
        panel.textContent = '';
        for (const line of text.split(' | ')) {
            const row = doc.createElement('div');
            row.textContent = line;
            panel.appendChild(row);
        }
        for (const [action, label] of [['stop', 'Parar'], ['skip', 'Pular alvo'], ['error', 'Marcar erro e pular']]) {
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = 'eas-button eas-button--secondary';
            button.textContent = label;
            button.disabled = action !== 'stop' && !context.paused && !['pending', 'prepared'].includes(entry?.status);
            button.addEventListener('click', () => automaticControl(targetWindow, action));
            panel.appendChild(button);
        }
    };

    const resumeAutomatic = (targetWindow = window) => {
        if (targetWindow.EASRateLimit?.check()) return false;
        targetWindow.__EASFakeBootstrapMark?.('resumeEntered');
        confirmationDiagnostic(targetWindow, 'AUTO_RESUME_ENTER');
        const stored = readContext();
        if (!stored?.autoMode || !stored.executionTab || stored.executionTab !== targetWindow.name ||
            stored.finishedAt || stored.endedAt || getScreen(targetWindow).screen !== 'place') {
            confirmationDiagnostic(targetWindow, 'AUTO_RESUME_GUARD', !stored?.autoMode ? 'AUTO_MODE_INACTIVE' : !stored.executionTab ? 'NO_EXECUTION_TAB' : stored.executionTab !== targetWindow.name ? 'TAB_NOT_AUTHORIZED' : stored.finishedAt || stored.endedAt ? 'EXECUTION_ENDED' : 'NOT_PLACE_PAGE');
            return false;
        }
        const commandId = getCommandKey(stored.queue?.[stored.currentIndex], stored.currentIndex);
        const attemptId = stored.queue?.[stored.currentIndex]?.confirmationAttempt?.attemptId || null;
        const confirmationPage = new URL(targetWindow.location.href).searchParams.get('try') === 'confirm';
        const previous = targetWindow.__easFakesAuto;
        if (previous?.document === targetWindow.document && previous.executionTab === stored.executionTab &&
            previous.commandId === commandId && previous.attemptId === attemptId &&
            previous.confirmationPage === confirmationPage && !previous.stopped) {
            confirmationDiagnostic(targetWindow, 'AUTO_RESUME_GUARD', 'RUNTIME_REUSED_NO_NEW_HANDLER');
            return true;
        }
        previous?.stop();
        const runtime = { document: targetWindow.document, executionTab: stored.executionTab,
            commandId, attemptId, confirmationPage,
            timer: null, stopped: false, preparedKey: stored.queue?.[stored.currentIndex]?.status === 'prepared' && stored.queue?.[stored.currentIndex]?.preparationWait?.waiting === true && ['WAIT_SNAPSHOT', 'WAIT_TARGET', 'WAIT_PLACE'].includes(stored.queue?.[stored.currentIndex]?.preparationWait?.phase) ? commandId : null,
            stop() { this.stopped = true; clearTimeout(this.timer); } };
        targetWindow.__easFakesAuto = runtime;
        const schedule = (delay) => { if (!runtime.stopped) runtime.timer = setTimeout(tick, delay); };
        const tick = () => {
            if (targetWindow.EASRateLimit?.check()) return runtime.stop();
            if (runtime.stopped || runtime.document !== targetWindow.document) {
                confirmationDiagnostic(targetWindow, 'AUTO_TICK_GUARD', runtime.stopped ? 'RUNTIME_STOPPED' : 'RUNTIME_DOCUMENT_CHANGED');
                return runtime.stop();
            }
            const saved = readContext();
            if (!saved?.autoMode || saved.executionTab !== runtime.executionTab || targetWindow.name !== saved.executionTab) {
                confirmationDiagnostic(targetWindow, 'AUTO_TICK_GUARD', !saved?.autoMode ? 'AUTO_MODE_INACTIVE' : saved.executionTab !== runtime.executionTab ? 'RUNTIME_EXECUTION_CHANGED' : 'TAB_NOT_AUTHORIZED');
                return runtime.stop();
            }
            if (getCommandKey(saved.queue?.[saved.currentIndex], saved.currentIndex) !== runtime.commandId) {
                confirmationDiagnostic(targetWindow, 'AUTO_TICK_GUARD', 'RUNTIME_COMMAND_CHANGED');
                runtime.stop();
                resumeAutomatic(targetWindow);
                return;
            }
            const context = normalizeContext(saved);
            let entry = getCurrentEntry(context);
            renderAutomatic(context, targetWindow);
            if (context.paused) {
                confirmationDiagnostic(targetWindow, 'AUTO_TICK_GUARD', 'EXECUTION_PAUSED');
                if (executionCounts(context).remaining === 0) finishExecution(context, targetWindow);
                return runtime.stop();
            }
            if (!entry) { finishExecution(context, targetWindow); return; }
            if (TERMINAL_STATES.includes(entry.status)) {
                context.currentIndex++;
                if (!saveContext(context)) return runtime.stop();
                runtime.stop();
                resumeAutomatic(targetWindow);
                return;
            }
            if (getScreen(targetWindow).villageId !== Number(entry.villageId)) {
                confirmationDiagnostic(targetWindow, 'AUTO_TICK_GUARD', 'CURRENT_VILLAGE_MISMATCH');
                return runtime.stop();
            }
            try {
                const confirmationPage = new URL(targetWindow.location.href).searchParams.get('try') === 'confirm';
                if (confirmationPage) confirmationDiagnostic(targetWindow, 'AUTO_TICK_CONFIRM_PAGE');
                if (entry.status === 'attacking' && confirmationPage) {
                    entry.status = 'confirm-page';
                    if (!saveContext(context)) {
                        confirmationDiagnostic(targetWindow, 'AUTO_TICK_GUARD', 'CONFIRM_PAGE_PERSISTENCE_FAILED');
                        return runtime.stop();
                    }
                }
                if (['attacking', 'forwarding', 'confirm-page', 'confirming', 'submitted'].includes(entry.status)) {
                    const beforeUrl = targetWindow.location.href;
                    resumeConfirmation(targetWindow);
                    const after = readContext();
                    runtime.attemptId = after?.queue?.[context.currentIndex]?.confirmationAttempt?.attemptId || null;
                    runtime.confirmationPage = confirmationPage;
                    if (!after || after.currentIndex !== context.currentIndex || beforeUrl !== targetWindow.location.href) {
                        confirmationDiagnostic(targetWindow, 'AUTO_TICK_RETURN', !after ? 'EXECUTION_CLEARED' : after.currentIndex !== context.currentIndex ? 'QUEUE_ADVANCED' : 'NAVIGATION_STARTED');
                        return runtime.stop();
                    }
                    const rejected = EAS.CommandRules.scanCommandRuleErrors(targetWindow.document)[0];
                    const genericError = targetWindow.document.querySelector('.error_box, .error');
                    if (rejected || genericError || Date.now() - (readContext()?.queue?.[context.currentIndex]?.confirmationAttempt?.reconcileStartedAt || context.forwardingStartedAt || 0) >= OPEN_TIMEOUT_MS) {
                        confirmationDiagnostic(targetWindow, 'AUTO_TICK_GUARD', rejected ? 'COMMAND_RULE_REJECTED' : genericError ? 'GAME_ERROR' : 'RESULT_TIMEOUT');
                        if (rejected) rejectForCommandRule(context, context.currentIndex, rejected);
                        if (!rejected && !genericError) reconcileOutgoing(normalizeContext(readContext()), targetWindow, 'TIMEOUT');
                        const targetFailure = /selecione uma aldeia alvo/i.test(genericError?.textContent || '');
                        failAutomatic(normalizeContext(readContext()), targetFailure ? Object.assign(new Error(genericError.textContent), { code: 'TARGET_NOT_APPLIED' }) : rejected?.message || genericError?.textContent || 'Resposta incerta. Verifique o jogo antes de pular; o comando não será reenviado.');
                        const failed = normalizeContext(readContext());
                        renderAutomatic(failed, targetWindow);
                        if (executionCounts(failed).remaining === 0) finishExecution(failed, targetWindow);
                        return runtime.stop();
                    }
                    schedule(POLL_INTERVAL_MS);
                    return;
                }
                if (confirmationPage) throw new Error('Página inesperada para preparar o comando.');
                if (entry.status === 'preparing' && (!entry.preparationWait || entry.preparationWait.attemptId !== entry.confirmationAttempt?.attemptId)) throw new Error('Preparação interrompida por reload. Verifique o comando; não será repetido.');
                if (['pending', 'preparing'].includes(entry.status)) {
                    if (Number(entry.recommendedActionTime) > Date.now()) { schedule(AUTO_STEP_MS); return; }
                    if (entry.status === 'pending') {
                        entry.status = 'preparing';
                        if (!saveContext(context)) return runtime.stop();
                    }
                    renderAutomatic(context, targetWindow);
                    const result = prepareCurrent(context, targetWindow, context.commandType);
                    runtime.attemptId = entry.confirmationAttempt?.attemptId || null;
                    if (result.waiting) { schedule(POLL_INTERVAL_MS); return; }
                    if (!result.valid) throw Object.assign(new Error(result.message), { code: result.code });
                    runtime.preparedKey = getCommandKey(entry, context.currentIndex);
                    renderAutomatic(context, targetWindow);
                    schedule(AUTO_STEP_MS);
                    return;
                }
                if (entry.status === 'prepared') {
                    if (runtime.preparedKey !== getCommandKey(entry, context.currentIndex)) throw new Error('Preparação não verificada nesta pagina. O comando não será reenviado.');
                    const result = attackCurrent(context, targetWindow, context.commandType);
                    runtime.attemptId = entry.confirmationAttempt?.attemptId || null;
                    if (result.waiting) { schedule(POLL_INTERVAL_MS); return; }
                    if (!result.valid) throw Object.assign(new Error(result.message), { code: result.code });
                    renderAutomatic(context, targetWindow);
                    schedule(POLL_INTERVAL_MS);
                    return;
                }
                throw new Error(`Estado inesperado: ${entry.status}`);
            } catch (error) {
                confirmationDiagnostic(targetWindow, 'AUTO_TICK_EXCEPTION', String(error?.message || error));
                const latest = readContext();
                if (latest?.executionTab === runtime.executionTab) {
                    failAutomatic(normalizeContext(latest), error);
                    const failed = normalizeContext(readContext());
                    renderAutomatic(failed, targetWindow);
                    if (executionCounts(failed).remaining === 0) finishExecution(failed, targetWindow);
                }
                runtime.stop();
            }
        };
        renderAutomatic(normalizeContext(stored), targetWindow);
        schedule(Math.max(AUTO_STEP_MS, Number(stored.intervalMs) || 0));
        return true;
    };

    const watchCommandResult = ({
        context,
        entryIndex,
        targetWindow,
        onRejected,
        onConfirmed,
        onTimeout
    }) => {
        const startedAt = Date.now();
        let observedDocument = targetWindow.document;
        let observer = null;
        let timer = null;

        const stop = () => {
            observer?.disconnect();
            clearInterval(timer);
        };
        const inspect = () => {
            let currentDocument;

            try {
                currentDocument = targetWindow.document;
            } catch {
                return;
            }

            if (currentDocument !== observedDocument) {
                observer?.disconnect();
                observedDocument = currentDocument;
                observeMain();
            }

            const detected = EAS.CommandRules.scanCommandRuleErrors(currentDocument)[0] || null;

            if (detected) {
                stop();
                rejectForCommandRule(context, entryIndex, detected);
                onRejected(detected);
                return;
            }

            if (resumeConfirmation(targetWindow)) {
                stop();
                return;
            }

            if (Date.now() - startedAt >= OPEN_TIMEOUT_MS) {
                stop();
                context.forwardingIndex = null;
                context.forwardingCommandType = null;
                saveContext(context);
                onTimeout();
            }
        };
        const observeMain = () => {
            const main = observedDocument.querySelector(
                '#content_value, #contentContainer, main'
            ) || observedDocument.body;

            if (!main) {
                return;
            }

            observer = new targetWindow.MutationObserver(inspect);
            observer.observe(main, { childList: true, subtree: true });
        };

        observeMain();
        timer = setInterval(inspect, POLL_INTERVAL_MS);
        inspect();

        return stop;
    };

    const copyStyles = (targetWindow) => {
        if (targetWindow.document.querySelector('[data-eas-fakes-style]')) {
            return;
        }

        const source = document.querySelector('link[data-eas-style="css/eas.css"]');

        if (!source?.href || targetWindow.document === document) {
            return;
        }

        const link = targetWindow.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = source.href;
        link.dataset.easFakesStyle = 'true';
        targetWindow.document.head.appendChild(link);
    };

    const getTargetStatus = (context, entry, index) => {
        const commandKey = getCommandKey(entry, index);

        if (context.forwardingIndex === index) {
            return 'Encaminhando';
        }

        if (context.errors.some(
            (item) => item.commandKey === commandKey &&
                item.reason === 'minimum-attack-population'
        )) {
            return 'Rejeitado por população mínima';
        }

        if (context.errors.some((item) => item.commandKey === commandKey)) {
            return 'Erro';
        }

        if (context.skipped.includes(commandKey)) {
            return 'Pulado';
        }

        if (context.completed.includes(commandKey)) {
            return 'Enviado';
        }

        if (context.prepared.includes(commandKey)) {
            return 'Preparado';
        }

        return index === context.currentIndex ? 'Atual' : 'Pendente';
    };

    const mountPanel = (targetWindow = window) => {
        if (readContext()?.autoMode) return resumeAutomatic(targetWindow);
        const stored = readContext();

        if (!stored || !isMatchingPlace(stored, targetWindow)) {
            return false;
        }

        const context = normalizeContext(stored);
        const doc = targetWindow.document;
        const initialCommandRule = EAS.CommandRules.scanCommandRuleErrors(doc)[0] || null;
        const hasForwardingEntry = Number.isInteger(context.forwardingIndex);

        if (
            hasForwardingEntry &&
            initialCommandRule
        ) {
            rejectForCommandRule(
                context,
                context.forwardingIndex,
                initialCommandRule
            );
        }
        if (resumeConfirmation(targetWindow)) return true;
        if (hasForwardingEntry) return false;

        copyStyles(targetWindow);
        doc.getElementById(PANEL_ID)?.remove();
        let stopResultWatcher = null;
        let countdownTimer = null;

        const panel = doc.createElement('aside');
        panel.id = PANEL_ID;
        panel.className = 'fake-execution-panel';
        const header = doc.createElement('div');
        header.className = 'fake-execution-header';
        const title = doc.createElement('strong');
        title.textContent = context.preset === 'anti_snipe' ? '🎯 Execução Anti-Snipe' : '🎭 Execução de Fake';
        const closeButton = doc.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'fake-execution-close';
        closeButton.textContent = '×';
        closeButton.title = 'Fechar painel';
        closeButton.addEventListener('click', () => {
            stopResultWatcher?.();
            clearInterval(countdownTimer);
            panel.remove();
        });
        header.appendChild(title);
        header.appendChild(closeButton);

        const content = doc.createElement('div');
        content.className = 'fake-execution-content';
        panel.appendChild(header);
        panel.appendChild(content);
        doc.body.appendChild(panel);

        const render = (message = '', messageType = 'info') => {
            const currentEntry = getCurrentEntry(context);
            const currentTarget = currentEntry?.target || null;
            const currentCommandKey = currentEntry
                ? getCommandKey(currentEntry, context.currentIndex)
                : null;
            const validation = currentEntry
                ? validateCurrent(context, targetWindow)
                : { valid: false, message: 'Todos os alvos foram processados.' };
            const attackValidation = validation.valid
                ? validateCurrent(context, targetWindow, {
                    commandType: 'attack'
                })
                : validation;
            const supportValidation = validation.valid
                ? validateCurrent(context, targetWindow, {
                    commandType: 'support'
                })
                : validation;
            const attackTypeEnabled = context.commandType === 'attack' ||
                context.allowCommandSwitch;
            const supportTypeEnabled = context.commandType === 'support' ||
                context.allowCommandSwitch;
            const isForwarding = Number.isInteger(context.forwardingIndex);
            const attackAllowed = attackTypeEnabled &&
                attackValidation.valid && !isForwarding;
            const supportAllowed = supportTypeEnabled &&
                supportValidation.valid && !isForwarding;
            const completed = new Set(context.completed).size;
            const skipped = new Set(context.skipped).size;
            const errors = new Set(
                context.errors.map((item) => item.commandKey)
            ).size;
            const processedTargets = new Set([
                ...context.completed,
                ...context.skipped,
                ...context.errors
                    .filter((item) =>
                        !['minimum-attack-population', 'minimum-unit-quantity'].includes(item.reason)
                    )
                    .map((item) => item.commandKey)
            ]);
            const remaining = Math.max(
                0,
                context.queue.length - processedTargets.size
            );
            const troopLines = Object.entries(context.troopsPerTarget)
                .filter(([, quantity]) => Number(quantity) > 0)
                .map(([unit, quantity]) =>
                    `${Number(quantity)} ${UNIT_NAMES[unit] || unit}`
                );

            content.innerHTML = '';
            const summary = doc.createElement('div');
            summary.className = 'fake-execution-summary';
            summary.innerHTML = `
                <div><strong>Aldeia necessária</strong><span>${EAS.Utils.escapeHtml(currentEntry?.villageName || '-')}<br>${EAS.Utils.escapeHtml(currentEntry?.villageCoord || '-')}</span></div>
                <div><strong>Preset</strong><span>${EAS.Utils.escapeHtml(PRESET_NAMES[context.preset] || context.preset || '-')}</span></div>
                <div><strong>Comando</strong><span>${context.commandType === 'support' ? 'Apoio' : 'Ataque'}</span></div>
                <div><strong>Alvo</strong><span>${EAS.Utils.escapeHtml(currentTarget || 'Concluído')}</span></div>
                <div><strong>Progresso</strong><span>${Math.min(context.currentIndex + 1, context.queue.length)} de ${context.queue.length}</span></div>
                <div><strong>Restantes</strong><span>${remaining}</span></div>
                ${context.preset === 'fake_nt' && currentEntry ? `<div><strong>Envio planejado</strong><span>${EAS.Utils.escapeHtml(EAS.Utils.formatDateTime(currentEntry.sendTime))}</span></div><div><strong>Chegada planejada</strong><span>${EAS.Utils.escapeHtml(EAS.Utils.formatDateTime(currentEntry.arrivalTime))}</span></div><div><strong>Unidade lenta</strong><span>${currentEntry.slowUnit === 'ram' ? 'Aríete' : 'Catapulta'}</span></div>` : ''}
                ${context.preset === 'anti_snipe' && currentEntry ? `<div><strong>Offset</strong><span>${Number(currentEntry.offsetMs) >= 0 ? '+' : ''}${currentEntry.offsetMs} ms</span></div><div><strong>Chegada planejada</strong><span>${EAS.Utils.escapeHtml(EAS.Utils.formatDateTime(currentEntry.arrivalTime, true))}</span></div><div><strong>Envio calculado</strong><span>${EAS.Utils.escapeHtml(EAS.Utils.formatDateTime(currentEntry.sendTime, true))}</span></div><div><strong>Horário recomendado</strong><span>${EAS.Utils.escapeHtml(EAS.Utils.formatDateTime(currentEntry.recommendedActionTime, true))}</span></div><div><strong>Faltam</strong><span data-anti-countdown>--:--:--.---</span></div>` : ''}
            `;

            const troops = doc.createElement('div');
            troops.className = 'fake-execution-troops';
            troops.innerHTML = `<strong>Tropas por alvo</strong><ul>${troopLines.map((line) => `<li>${EAS.Utils.escapeHtml(line)}</li>`).join('')}</ul>`;

            const executionStatus = doc.createElement('div');
            executionStatus.className = 'fake-execution-status-grid';
            executionStatus.innerHTML = `
                <span>Total: ${context.queue.length}</span>
                <span>Concluídos: ${completed}</span>
                <span>Pulados: ${skipped}</span>
                <span>Erros: ${errors}</span>
                <span>Restantes: ${remaining}</span>
            `;

            const targetList = doc.createElement('ol');
            targetList.className = 'fake-execution-targets fake-execution-queue';
            context.queue.forEach((entry, index) => {
                const item = doc.createElement('li');
                const status = getTargetStatus(context, entry, index);
                item.className = `fake-execution-${status
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')}`;
                item.textContent = `${entry.villageName} → ${entry.target} — ${status}`;
                targetList.appendChild(item);
            });

            const notice = doc.createElement('div');
            notice.className = `eas-status eas-status--${message
                ? messageType
                : validation.valid ? 'success' : 'error'}`;
            notice.textContent = message || (
                validation.valid
                    ? 'Alvo pronto para preparação.'
                    : validation.message
            );

            const actions = doc.createElement('div');
            actions.className = 'fake-execution-actions';
            const addButton = ({
                text,
                className = '',
                disabled = false,
                title = '',
                onClick
            }) => {
                const button = doc.createElement('button');
                button.type = 'button';
                button.className = `eas-button ${className}`.trim();
                button.textContent = text;
                button.disabled = disabled;
                button.title = title;
                button.addEventListener('click', onClick);
                actions.appendChild(button);
            };

            if (validation.wrongVillage && currentEntry) {
                addButton({
                    text: 'Abrir aldeia e Praça',
                    onClick: () => {
                        EAS.FakesExecution.openCurrentVillage(context);
                    }
                });
            }

            addButton({
                text: 'Preparar',
                disabled: !validation.valid,
                onClick: () => {
                    const result = prepareCurrent(context, targetWindow);
                    render(
                        result.valid
                            ? 'Alvo preparado. Nenhum comando foi enviado.'
                            : result.message,
                        result.valid ? 'success' : 'error'
                    );
                }
            });
            addButton({
                text: 'Atacar',
                disabled: !attackAllowed,
                title: attackAllowed
                    ? 'Ataque disponível'
                    : attackValidation.message ||
                        'O tipo padrão da operação é Apoio.',
                onClick: () => {
                    const result = attackCurrent(context, targetWindow, 'attack', () => {
                        stopResultWatcher = watchCommandResult({
                            context,
                            entryIndex: context.currentIndex,
                            targetWindow,
                            onRejected: (detected) => render(
                                detected.type === 'minimum-attack-population'
                                    ? `Regra desta aldeia detectada: mínimo ${detected.minimumPopulation} de população; tentativa ${detected.attemptedPopulation}. Reanalise ou ajuste as tropas.`
                                    : `Regra de unidade detectada: mínimo ${detected.minimumQuantity} de ${detected.unit}. Reanalise ou ajuste as tropas.`,
                                'error'
                            ),
                            onConfirmed: () => render(
                                'Ataque encaminhado para confirmação. O próximo alvo não foi preparado.',
                                'success'
                            ),
                            onTimeout: () => render(
                                'Não foi possível confirmar o avanço. O alvo atual foi mantido.',
                                'error'
                            )
                        });
                    });
                    render(result.valid ? 'Aguardando resposta do jogo...' : result.message,
                        result.valid ? 'info' : 'error');
                }
            });
            if (!['fake_nt', 'anti_snipe'].includes(context.preset)) addButton({
                text: 'Apoiar',
                disabled: !supportAllowed,
                title: supportAllowed
                    ? 'Apoio disponível'
                    : supportValidation.message ||
                        'O tipo padrão da operação é Ataque.',
                onClick: () => {
                    const result = attackCurrent(context, targetWindow, 'support', () => {
                        stopResultWatcher = watchCommandResult({
                            context,
                            entryIndex: context.currentIndex,
                            targetWindow,
                            onRejected: () => render(
                                'O apoio foi rejeitado pelo jogo. O alvo atual foi mantido.',
                                'error'
                            ),
                            onConfirmed: () => render(
                                'Apoio encaminhado para confirmação. O próximo alvo não foi preparado.',
                                'success'
                            ),
                            onTimeout: () => render(
                                'Não foi possível confirmar o avanço. O alvo atual foi mantido.',
                                'error'
                            )
                        });
                    });
                    render(result.valid ? 'Aguardando resposta do jogo...' : result.message,
                        result.valid ? 'info' : 'error');
                }
            });
            if (context.lastPopulationRejection) {
                addButton({
                    text: 'Reanalisar operação',
                    onClick: () => {
                        const saved = [
                            ['eas_tw_fakes_selected_preset', context.preset],
                            ['eas_tw_fakes_command_type', context.commandType],
                            ['eas_tw_fakes_troops', context.troopsPerTarget],
                            ['eas_tw_fakes_coordinates', [...new Set(
                                context.queue.map((entry) => entry.target)
                            )].join('\n')],
                            ['eas_tw_fakes_per_target', context.fakesPerTarget || 1],
                            ['eas_tw_fakes_selected_villages', context.selectedVillageIds || []],
                            ['eas_tw_fakes_allow_command_switch', context.allowCommandSwitch]
                        ];

                        saved.forEach(([key, value]) => {
                            localStorage.setItem(key, JSON.stringify(value));
                        });
                        EAS.UI.loadModule('fakes').then((module) => {
                            module.open({ autoAnalyze: true });
                            panel.remove();
                        });
                    }
                });
            }
            addButton({
                text: 'Pular alvo',
                disabled: !currentEntry || Number.isInteger(context.forwardingIndex),
                className: 'eas-button--secondary',
                onClick: () => {
                    clearOtherTargetStatuses(context, currentCommandKey, 'skipped');
                    uniquePush(context.skipped, currentCommandKey);
                    currentEntry.status = 'skipped';
                    context.currentIndex += 1;
                    saveContext(context);
                    render('Alvo pulado.', 'info');
                }
            });
            addButton({
                text: 'Marcar erro e pular',
                disabled: !currentEntry || Number.isInteger(context.forwardingIndex),
                className: 'eas-button--secondary',
                onClick: () => {
                    clearOtherTargetStatuses(context, currentCommandKey, 'error');
                    if (!context.errors.some(
                        (item) => item.commandKey === currentCommandKey
                    )) {
                        context.errors.push({
                            commandKey: currentCommandKey,
                            target: currentTarget,
                            villageId: currentEntry.villageId,
                            reason: validation.valid
                                ? 'manual-error'
                                : 'invalid-target'
                        });
                    }
                    currentEntry.status = 'error';
                    context.currentIndex += 1;
                    saveContext(context);
                    render('Alvo marcado como erro.', 'error');
                }
            });
            addButton({
                text: 'Voltar um alvo',
                disabled: context.currentIndex <= 0,
                className: 'eas-button--secondary',
                onClick: () => {
                    context.currentIndex = Math.max(0, context.currentIndex - 1);
                    saveContext(context);
                    render();
                }
            });
            addButton({
                text: 'Encerrar execução',
                className: 'eas-button--secondary',
                onClick: () => {
                    stopResultWatcher?.();
                    clearInterval(countdownTimer);
                    removeContext();
                    panel.remove();
                }
            });

            const actionAvailability = doc.createElement('div');
            actionAvailability.className = 'fake-action-status';
            const attackReason = attackAllowed
                ? 'Disponível'
                : !attackTypeEnabled
                    ? 'Bloqueado — tipo padrão Apoio'
                    : attackValidation.populationInvalid
                        ? `Bloqueado — população ${attackValidation.commandPopulation}/${attackValidation.minimumPopulation}${context.allowCommandSwitch && supportAllowed ? '. Você ainda pode enviar como apoio.' : ''}`
                        : `Bloqueado — ${attackValidation.message}`;
            const supportReason = supportAllowed
                ? 'Disponível'
                : !supportTypeEnabled
                    ? 'Bloqueado — tipo padrão Ataque'
                    : `Bloqueado — ${supportValidation.message}`;
            actionAvailability.innerHTML = `
                <div class="${attackAllowed ? 'fake-action-available' : 'fake-action-disabled-reason'}"><strong>Ataque:</strong> ${EAS.Utils.escapeHtml(attackReason)}</div>
                ${['fake_nt', 'anti_snipe'].includes(context.preset) ? '' : `<div class="${supportAllowed ? 'fake-action-available' : 'fake-action-disabled-reason'}"><strong>Apoio:</strong> ${EAS.Utils.escapeHtml(supportReason)}</div>`}
                ${context.commandTypeFallbackUsed
                    ? '<div class="fake-action-disabled-reason">Tipo de comando ausente ou inválido no contexto antigo; Ataque foi usado como fallback.</div>'
                    : ''}
            `;

            content.appendChild(summary);
            content.appendChild(troops);
            content.appendChild(executionStatus);
            content.appendChild(targetList);
            content.appendChild(notice);
            content.appendChild(actions);
            content.appendChild(actionAvailability);
            clearInterval(countdownTimer);
            if (context.preset === 'anti_snipe' && currentEntry?.recommendedActionTime) {
                const updateCountdown = () => {
                    const output = content.querySelector('[data-anti-countdown]');
                    if (!output) return;
                    const difference = currentEntry.recommendedActionTime - Date.now();
                    const absolute = Math.abs(difference);
                    const hours = Math.floor(absolute / 3600000);
                    const minutes = Math.floor(absolute % 3600000 / 60000);
                    const seconds = Math.floor(absolute % 60000 / 1000);
                    const milliseconds = Math.floor(absolute % 1000);
                    const pad = (value, size = 2) => String(value).padStart(size, '0');
                    output.textContent = `${difference < 0 ? 'Atrasado ' : ''}${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(milliseconds, 3)}`;
                };
                updateCountdown();
                countdownTimer = setInterval(updateCountdown, 100);
            }
        };

        render();
        return true;
    };

    const openCurrentVillage = (providedContext = null) => {
        const execution = normalizeContext(providedContext || readContext());
        const entry = getCurrentEntry(execution);
        if (!entry) return Promise.resolve(finishExecution(execution, window));
        const childWindow = EAS.Place.openVillagePlace(entry?.villageId);

        if (!childWindow) {
            return Promise.resolve(false);
        }

        if (execution.autoMode) {
            bindExecutionTab(execution, childWindow);
            if (!saveContext(execution)) return Promise.resolve(false);
        }

        return new Promise((resolve) => {
            const startedAt = Date.now();
            const timer = setInterval(() => {
                if (childWindow.closed) {
                    clearInterval(timer);
                    resolve(false);
                    return;
                }

                try {
                    if (
                        childWindow.document.readyState !== 'loading' &&
                        isMatchingPlace(execution, childWindow)
                    ) {
                        clearInterval(timer);
                        resolve(mountPanel(childWindow));
                        return;
                    }
                } catch {
                    // Same-origin access can fail briefly while navigating.
                }

                if (Date.now() - startedAt >= OPEN_TIMEOUT_MS) {
                    clearInterval(timer);
                    resolve(false);
                }
            }, POLL_INTERVAL_MS);
        });
    };

    EAS.FakesExecution.start = (context) => {
        const execution = normalizeContext({
            ...context,
            autoMode: true,
            executionTab: null,
            forwardingIndex: null,
            forwardingCommandType: null,
            paused: false,
            currentIndex: 0,
            prepared: [],
            skipped: [],
            completed: [],
            errors: [],
            createdAt: Date.now()
        });

        if (!saveContext(execution)) {
            return Promise.resolve(false);
        }

        diagnosticLog('EXECUTION_START', execution);
        return openCurrentVillage(execution);
    };

    EAS.FakesExecution.openCurrentVillage = openCurrentVillage;

    EAS.FakesExecution.initialize = () => {
        const context = readContext();

        if (context?.autoMode) return resumeAutomatic(window);
        return context && isMatchingPlace(context, window)
            ? mountPanel(window)
            : false;
    };

    EAS.FakesExecution.resume = (targetWindow = window) => {
        targetWindow.__EASFakeBootstrapMark?.('resumeEntered');
        return readContext()?.autoMode ? resumeAutomatic(targetWindow) : resumeConfirmation(targetWindow);
    };
    EAS.FakesExecution.automaticControl = automaticControl;
    EAS.FakesExecution.executionCounts = executionCounts;
    EAS.FakesExecution.resumeConfirmation = resumeConfirmation;
    EAS.FakesExecution.readOutgoingCommands = readOutgoingCommands;
    EAS.FakesExecution.snapshotSourceEvidence = snapshotSourceEvidence;
    EAS.FakesExecution.reconcileOutgoing = reconcileOutgoing;
    // Temporary DEV helper, intentionally available without changing persisted settings.
    // Read-only image audit: no fetches, image creation, observers or refreshes.
    window.EASFakeImageDebug = () => {
        const cleanUrl = value => { try { const url = new URL(value, window.location.href); return url.origin + url.pathname; } catch { return String(value || ''); } };
        const images = Array.from(document.querySelectorAll('img')).filter(img => /\.gif(?:[?#]|$)/i.test(img.currentSrc || img.src) || (img.complete && img.naturalWidth === 0)).map(img => ({
            src: cleanUrl(img.currentSrc || img.src), broken: img.complete && img.naturalWidth === 0,
            id: img.id, className: img.className, parentId: img.parentElement?.id || null,
            easOwner: img.closest('[id^="eas-"], [data-eas-tw-hub]')?.id || null
        }));
        const resources = (window.performance?.getEntriesByType('resource') || []).filter(item => /\.gif(?:[?#]|$)/i.test(item.name)).slice(-50).map(item => ({
            url: cleanUrl(item.name), initiatorType: item.initiatorType, responseStatus: item.responseStatus ?? null,
            startTime: item.startTime, duration: item.duration
        }));
        const snapshot = { images, resources };
        console.log?.('[EAS][IMAGE AUDIT]', snapshot);
        return snapshot;
    };
    window.EASFakeDebug = () => ({ ...confirmationDiagnostic(window),
        bootstrap: JSON.parse(JSON.stringify(window.EASFakeBootstrapDebug || null)) });
    window.__EASFakeBootstrapMark?.('fakeModuleInitialized', { message: 'fake module initialized' });
    confirmationDiagnostic(window, 'SERVICE_LOADED');
    EAS.FakesExecution.mountPanel = mountPanel;
    EAS.FakesExecution.readContext = readContext;
    EAS.FakesExecution.parseMinimumPopulationError = parseMinimumPopulationError;
    EAS.FakesExecution.detectMinimumPopulationError = detectMinimumPopulationError;
    EAS.FakesExecution.findPlaceCommandButton = findCommandButton;
    EAS.FakesExecution.detectConfirmationCommandType =
        detectConfirmationCommandType;
})();
