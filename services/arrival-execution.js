(() => {
    'use strict';
    if (EAS.ArrivalExecution) return;
    const planner = EAS.ArrivalPlanner;
    const isArrival = mission => mission?.sourceModule === 'arrival-planner';
    const fresh = mission => EAS.MissionScheduler.load().missions.find(item => item.id === mission.id);
    // Immutable attempt lock: unrelated scheduler-context writes in another tab
    // must never erase the fact that this attempt reached the final submit.
    const consumedKey = mission => `eas_tw_arrival_consumed:${mission.world}:${mission.playerId}:${mission.id}:${mission.attemptId}`;
    const consumed = mission => {
        if (!mission) return true;
        try { return localStorage.getItem(consumedKey(mission)) !== null; } catch { return true; }
    };
    const log = (event, mission, detail = {}) => planner.log(event, { missionId: mission.id, attemptId: mission.attemptId, sourceVillageId: mission.villageId, targetCoords: mission.targetCoord, ...detail });
    const allowed = mission => Boolean(isArrival(mission) && mission.arrivalAuthorized === true && mission.attemptId &&
        !mission.finalClickConsumed && !mission.submitAttemptId && !consumed(mission) && ['waiting', 'upcoming', 'opening', 'preparing', 'prepared', 'opening-confirmation', 'confirmation-ready', 'ready'].includes(mission.status));
    const fail = (mission, reason) => {
        EAS.MissionScheduler.updateMission(mission.id, { status: 'verification-required', lastError: reason, arrivalAuthorized: false });
        log('MISSION_UNCERTAIN', mission, { reason }); return false;
    };
    const readOutgoing = (targetWindow, options) => EAS.FakesExecution?.readOutgoingCommands?.(targetWindow, options) ||
        { available: false, reason: 'OUTGOING_READER_UNAVAILABLE', commands: [] };
    const baselineMatches = mission => {
        const baseline = mission?.outgoingBaseline;
        return Boolean(baseline && baseline.missionId === mission.id && baseline.attemptId === mission.attemptId &&
            baseline.sourceVillageId === String(mission.villageId) && baseline.targetCoord === mission.targetCoord &&
            baseline.commandType === mission.commandType && Array.isArray(baseline.commandIds) && Number.isFinite(baseline.capturedAt));
    };
    const captureBaseline = (mission, targetWindow) => {
        const current = fresh(mission);
        if (!current || current.attemptId !== mission.attemptId || !allowed(current)) return false;
        if (baselineMatches(current)) return true;
        const observed = readOutgoing(targetWindow);
        if (!observed.available) return false;
        const source = String(targetWindow.game_data?.village?.id || new URL(targetWindow.location.href).searchParams.get('village') || '');
        if (source !== String(mission.villageId)) return false;
        const baseline = { missionId: mission.id, attemptId: mission.attemptId, sourceVillageId: source,
            targetCoord: mission.targetCoord, commandType: mission.commandType, capturedAt: Date.now(),
            commandIds: observed.commands.map(command => command.id), source: observed.source };
        EAS.MissionScheduler.updateMission(mission.id, { outgoingBaseline: baseline });
        return JSON.stringify(fresh(mission)?.outgoingBaseline) === JSON.stringify(baseline);
    };
    const context = (mission, targetWindow = window, { consumed = false } = {}) => {
        const doc = targetWindow.document, executor = EAS.ScheduledMissionExecution;
        // Read the scheduler's existing binding without its verbose bootstrap
        // logging/storage writes inside the millisecond-sensitive send window.
        const state = EAS.MissionScheduler.load(), current = state.missions.find(item => item.id === mission.id);
        const url = new URL(targetWindow.location.href), storedTab = executor.readTabContext(targetWindow);
        const executionId = url.searchParams.get('eas_scheduled_execution') || storedTab?.tabExecutionId;
        const binding = state.tabExecutions?.[executionId];
        const urlMissionId = url.searchParams.get('eas_mission');
        if (!current || current.attemptId !== mission.attemptId || !binding || binding.missionId !== mission.id ||
            binding.tabExecutionId !== current.tabExecutionId || (urlMissionId && urlMissionId !== mission.id) ||
            !executor.contextMatchesPage(current, binding, targetWindow).valid) return { valid: false, reason: 'MISSION_CONTEXT_MISMATCH' };
        if (!consumed && !allowed(current)) return { valid: false, reason: 'AUTHORIZATION_CONSUMED_OR_REVOKED' };
        if (window.EASRateLimit?.check()) return { valid: false, reason: 'RATE_LIMITED' };
        const form = doc.querySelector('#command-data-form, #command-confirm-form');
        const read = name => form?.querySelector(`input[name="${name}"]`)?.value;
        const type = read('support') === 'true' || read('support') === '1' ? 'support' : (read('attack') === 'true' || read('attack') === '1' ? 'attack' : null);
        const destination = /^\d+$/.test(read('x') || '') && /^\d+$/.test(read('y') || '') ? `${Number(read('x'))}|${Number(read('y'))}` : null;
        const sources = [read('source_village'), read('village')].filter(value => value != null);
        const units = EAS.Data.Troops.getUnits();
        const expected = current.expectedTroopsSnapshot || current.troops;
        const troopUnits = [...new Set([...units, ...Object.keys(expected)])];
        const troopsMatch = troopUnits.length > 0 && troopUnits.every(unit => {
            const value = read(unit); return value == null ? !Number(expected[unit]) : /^\d+$/.test(value) && Number(value) === Number(expected[unit] || 0);
        });
        const authorization = current.submitAuthorization;
        const valid = executor.isAttackConfirmationPage(targetWindow) && Boolean(form?.querySelector('#troop_confirm_submit')) &&
            destination === current.targetCoord && sources.length > 0 && sources.every(value => value === String(current.villageId)) &&
            type === current.commandType && type === current.type && (current.mode !== 'snipe_support' || type === 'support') && troopsMatch &&
            authorization?.missionId === current.id && authorization?.attemptId === current.attemptId &&
            authorization?.allowedStage === 'attack-confirmation' && (consumed || authorization.used === false);
        return { valid, reason: valid ? null : 'CONFIRMATION_FIELDS_MISMATCH', destination, type, troopsMatch };
    };
    const beforePrepare = async (mission, targetWindow) => {
        if (!allowed(fresh(mission))) throw new Error('Missão não autorizada ou tentativa consumida.');
        // Reuse Place's canonical target detector; do not modify Fake's detector.
        const runtime = EAS.ScheduledMissionExecution.runtimeFor(targetWindow);
        await new Promise((resolve, reject) => {
            const deadline = performance.now() + 8000;
            const check = () => { try {
                if (!allowed(fresh(mission))) { reject(new Error('Missão cancelada.')); return; }
                const targetReady = EAS.Place.readTargetReadiness(mission.targetCoord, targetWindow, mission.targetVillageId).targetReady;
                if (targetReady && captureBaseline(mission, targetWindow)) { resolve(); return; }
                if (performance.now() >= deadline) { reject(new Error(targetReady ? 'Baseline de comandos enviados indisponível. Nenhum comando foi enviado.' : 'Destino não resolvido pelo jogo.')); return; }
                const timer = targetWindow.setTimeout(() => { runtime.timers.delete(timer); check(); }, 100); runtime.timers.add(timer);
            } catch (error) { reject(error); } }; check();
        });
        if (planner.clock() >= mission.sendAtMs) throw new Error('Horário de envio já passou.');
    };
    const beforeAttack = (mission, targetWindow) => {
        if (!allowed(fresh(mission)) || window.EASRateLimit?.check()) return false;
        if (!EAS.Place.readTargetReadiness(mission.targetCoord, targetWindow, mission.targetVillageId).targetReady) return false;
        if (planner.clock() >= mission.sendAtMs) return fail(mission, 'SEND_TIME_PASSED');
        log('MISSION_PREPARED', mission); return true;
    };
    const submit = (mission, targetWindow) => {
        if (!targetWindow.navigator?.locks?.request) return fail(mission, 'EXCLUSIVE_LOCK_UNAVAILABLE');
        return targetWindow.navigator.locks.request(`eas-arrival-submit:${mission.id}`, { ifAvailable: true }, lock => {
            if (!lock || !allowed(fresh(mission))) return false;
            const sent = EAS.ScheduledMissionExecution.executeScheduledAttackSend(mission, targetWindow, { arrivalLock: true });
            if (sent) log('MISSION_SUBMITTED', mission);
            return sent;
        }).catch(error => { const current = fresh(mission); if (current && !['sent', 'completed', 'cancelled'].includes(current.status)) fail(current, error.message); return false; });
    };
    const beforeSubmit = (mission, targetWindow) => {
        const validation = context(mission, targetWindow);
        if (!validation.valid) return fail(mission, validation.reason);
        if (!baselineMatches(mission) || !Number.isSafeInteger(mission.travelTimeMs) || mission.travelTimeMs <= 0) return fail(mission, 'RECONCILIATION_BASELINE_OR_TRAVEL_MISSING');
        if (planner.clock() < mission.sendAtMs || planner.clock() - mission.sendAtMs > 1000) return fail(mission, 'SEND_WINDOW_MISSED');
        log('MISSION_CONTEXT_VALIDATED', mission, validation); return true;
    };
    const readBack = (mission, targetWindow) => {
        const restored = fresh(mission);
        const valid = restored?.attemptId === mission.attemptId && restored.submitAttemptId === mission.attemptId &&
            restored.finalClickConsumed === true && restored.status === 'submitting' && restored.submitAuthorization?.used === true &&
            context(restored, targetWindow, { consumed: true }).valid;
        if (!valid || consumed(restored)) return false;
        const verification = { missionId: restored.id, attemptId: restored.attemptId, submitAttemptId: restored.submitAttemptId,
            sourceVillageId: String(restored.villageId), sourceCoord: restored.villageCoord || null,
            targetVillageId: restored.targetVillageId || null, targetCoord: restored.targetCoord, commandType: restored.commandType,
            troops: { ...(restored.expectedTroopsSnapshot || restored.troops) }, travelTimeMs: restored.travelTimeMs,
            desiredArrivalMs: restored.desiredArrivalMs || null, submitStartedAt: restored.submitStartedAt,
            submitWallTimeMs: planner.clock(), submitServerTimeMs: targetWindow.Timing?.getCurrentServerTime?.() ?? null,
            tabExecutionId: restored.tabExecutionId, baseline: restored.outgoingBaseline,
            deadline: restored.submitStartedAt + 15000, attempts: 0, status: 'pending' };
        EAS.MissionScheduler.updateMission(restored.id, { verification });
        if (JSON.stringify(fresh(restored)?.verification) !== JSON.stringify(verification)) return false;
        const lock = JSON.stringify({ missionId: restored.id, attemptId: restored.attemptId, consumedAt: verification.submitWallTimeMs });
        localStorage.setItem(consumedKey(restored), lock);
        if (localStorage.getItem(consumedKey(restored)) !== lock) return false;
        log('MISSION_SUBMIT_STARTED', restored);
        return true;
    };
    const arm = (mission, targetWindow = window) => {
        const runtime = EAS.ScheduledMissionExecution.runtimeFor(targetWindow);
        if (runtime.arrivalTimer || !allowed(fresh(mission))) return false;
        const validation = context(mission, targetWindow);
        if (!validation.valid) return fail(mission, validation.reason);
        if (!Number.isFinite(targetWindow.Timing?.getCurrentServerTime?.())) return fail(mission, 'SYNCHRONIZED_CLOCK_UNAVAILABLE');
        if (planner.clock() >= mission.sendAtMs) return fail(mission, 'SEND_TIME_PASSED');
        // Use the existing precise scheduler; no separate timing implementation.
        const timer = EAS.MassSnipePrecise.createScheduler({ targetLaunchTime: mission.sendAtMs, latencyCompensation: 0,
            explicitlyEnabled: true, serverNow: planner.clock, monotonicNow: () => targetWindow.performance.now(),
            schedule: (fn, delay) => targetWindow.setTimeout(fn, delay), unschedule: token => targetWindow.clearTimeout(token),
            canFire: () => allowed(fresh(mission)), claim: () => context(mission, targetWindow).valid,
            button: { click: () => EAS.ScheduledMissionExecution.executeScheduledAttackSend(mission, targetWindow) },
            onResult: result => { log('MISSION_TIMING_FIRED', mission, { schedulerErrorMs: result.schedulerErrorMs }); },
            onCancel: reason => { if (allowed(fresh(mission))) fail(mission, reason); }
        });
        runtime.arrivalTimer = timer;
        try { timer.start(); } catch (error) { runtime.arrivalTimer = null; return fail(mission, error.message); }
        return true;
    };
    const cancelTimer = targetWindow => {
        const runtime = EAS.ScheduledMissionExecution.runtimeFor(targetWindow);
        // Detach first to make cancellation/reentrancy idempotent.
        const timer = runtime.arrivalTimer; runtime.arrivalTimer = null; timer?.cancel('Agendamento interrompido.');
        stopReconciliation(targetWindow);
    };
    const RETRY_DELAYS = [250, 500, 1000, 1500, 2000, 3000, 4000];
    const safePage = targetWindow => {
        const page = new URL(targetWindow.location.href), safe = new URL(page.pathname, page.origin);
        for (const key of ['screen', 'village', 'try']) if (page.searchParams.has(key)) safe.searchParams.set(key, page.searchParams.get(key));
        return safe.href;
    };
    const readArrivalEvidence = row => {
        // This enriches the existing outgoing parser with timing only. Never
        // re-parse command identity/type/ownership in a parallel parser.
        for (const cell of Array.from(row.cells || [])) {
            if (cell.querySelector('.quickedit-out')) continue;
            const text = cell.textContent.replace(/\s+/g, ' ').replace(/(\d{1,2}:\d{2}:\d{2})[:.]\s*(\d{3})/, '$1:$2');
            if (!/\d{1,2}:\d{2}:\d{2}/.test(text)) continue;
            try {
                const parsed = EAS.MassSnipeExecution.parseArrival(text);
                return { arrivalMs: +EAS.MassSnipeExecution.getLandingTime(parsed), clock: 'server-wall', precisionMs: /\d{2}:\d{2}[:.]\d{3}/.test(text) ? 1 : 1000 };
            } catch { /* A countdown is not an arrival date. */ }
        }
        const endtimes = [...new Set(Array.from(row.querySelectorAll('[data-endtime]')).map(node => Number(node.dataset.endtime)).filter(value => Number.isSafeInteger(value) && value > 0))];
        return endtimes.length === 1 ? { arrivalMs: endtimes[0] * 1000, clock: 'unix', precisionMs: 1000 } : null;
    };
    const verificationMatches = mission => {
        const v = mission.verification;
        return Boolean(v && v.missionId === mission.id && v.attemptId === mission.attemptId && v.submitAttemptId === mission.submitAttemptId &&
            v.tabExecutionId === mission.tabExecutionId && v.sourceVillageId === String(mission.villageId) && v.targetCoord === mission.targetCoord &&
            v.commandType === mission.commandType && v.travelTimeMs === mission.travelTimeMs && v.submitStartedAt === mission.submitStartedAt &&
            Number.isFinite(v.deadline) && v.deadline === v.submitStartedAt + 15000 && Number.isFinite(v.submitWallTimeMs) &&
            Number.isSafeInteger(v.attempts) && v.attempts >= 0 && v.attempts <= 8 &&
            mission.submitAuthorization?.used === true && baselineMatches({ ...mission, outgoingBaseline: v.baseline }) &&
            v.baseline.capturedAt <= v.submitStartedAt && JSON.stringify(v.troops) === JSON.stringify(mission.expectedTroopsSnapshot || mission.troops));
    };
    const matchOutgoing = (verification, observed) => {
        if (!observed.available) return { reason: observed.reason || 'DOM_UNAVAILABLE', candidates: [] };
        const added = observed.commands.filter(command => !verification.baseline.commandIds.includes(command.id));
        const candidates = added.filter(command => (!command.sourceVillageId || command.sourceVillageId === verification.sourceVillageId) &&
            command.type === verification.commandType && command.target === verification.targetCoord);
        const unknown = added.some(command => !command.type || !command.target);
        if (unknown || candidates.length > 1) return { reason: 'AMBIGUOUS_NEW_COMMANDS', candidates };
        if (!candidates.length) return { reason: added.length ? 'NO_COMPATIBLE_NEW_COMMAND' : 'NO_NEW_COMMAND', candidates };
        const candidate = candidates[0], timing = candidate.evidence;
        if (timing) {
            const submitted = timing.clock === 'unix' ? verification.submitServerTimeMs : verification.submitWallTimeMs;
            if (!Number.isFinite(submitted) || timing.arrivalMs + timing.precisionMs <= submitted + verification.travelTimeMs ||
                timing.arrivalMs > submitted + verification.travelTimeMs + 5000) return { reason: 'ARRIVAL_WINDOW_MISMATCH', candidates };
        } else if (verification.submitStartedAt - verification.baseline.capturedAt > 5000) {
            // An early preparation baseline cannot distinguish an intervening
            // same-target send without timing. Do not invent missing evidence.
            return { reason: 'TIMING_UNAVAILABLE_FOR_EARLY_BASELINE', candidates };
        }
        return { reason: null, candidates, match: candidate, evidence: { strategy: 'new-outgoing-id',
            beforeCommandIds: verification.baseline.commandIds, commandType: candidate.type, targetCoord: candidate.target,
            sourceVillageId: candidate.sourceVillageId || verification.sourceVillageId, arrival: timing || null } };
    };
    const stopReconciliation = targetWindow => {
        const runtime = EAS.ScheduledMissionExecution.runtimeFor(targetWindow), job = runtime.arrivalReconciliation;
        if (!job) return;
        runtime.arrivalReconciliation = null; job.cancelled = true;
        if (job.timer != null) { targetWindow.clearTimeout(job.timer); runtime.timers.delete(job.timer); }
        targetWindow.removeEventListener?.('pagehide', job.onHide);
    };
    const outcome = (mission, targetWindow) => {
        if (!mission.finalClickConsumed) return null;
        if (!['submitting', 'sending'].includes(mission.status)) return false;
        const runtime = EAS.ScheduledMissionExecution.runtimeFor(targetWindow);
        if (runtime.arrivalReconciliation) return true;
        const job = { missionId: mission.id, attemptId: mission.attemptId, timer: null, cancelled: false };
        runtime.arrivalReconciliation = job;
        job.onHide = () => stopReconciliation(targetWindow);
        targetWindow.addEventListener?.('pagehide', job.onHide, { once: true });
        const show = current => { try {
            EAS.ScheduledMissionExecution.renderConfirmationPanel(current, { targetWindow, message: current.lastError || 'Comando submetido. Verificando comandos enviados; não haverá reenvio.' });
            const panel = targetWindow.document.getElementById(EAS.ScheduledMissionExecution.PANEL_ID);
            const heading = panel?.querySelector('.fake-execution-header strong'); if (heading) heading.textContent = 'Missão agendada — Verificação do envio';
            const countdown = panel?.querySelector('.scheduled-mission-countdown'); if (countdown) countdown.textContent = 'Aguardando comprovação do resultado';
        } catch { /* Optional UI cannot interrupt verification or enable resend. */ } };
        const finishUncertain = (current, reason) => {
            stopReconciliation(targetWindow);
            if (current.verification) EAS.MissionScheduler.updateMission(current.id, { verification: { ...current.verification, status: 'unproven', reason } });
            log('MISSION_RECONCILIATION_FAILED', current, { reason });
            fail(current, `Resultado não comprovado (${reason}). Verifique o jogo; não haverá reenvio.`);
            show(fresh(current));
        };
        const inspect = () => {
            job.timer = null;
            const current = fresh(mission);
            if (job.cancelled || !current || current.attemptId !== job.attemptId || !['submitting', 'sending'].includes(current.status)) { stopReconciliation(targetWindow); return; }
            if (!verificationMatches(current)) { finishUncertain(current, 'VERIFICATION_CONTEXT_MISSING_OR_CHANGED'); return; }
            const v = current.verification, executor = EAS.ScheduledMissionExecution, state = EAS.MissionScheduler.load();
            const tab = executor.readTabContext(targetWindow), url = new URL(targetWindow.location.href);
            const tabId = url.searchParams.get('eas_scheduled_execution') || tab?.tabExecutionId, binding = state.tabExecutions?.[tabId];
            if (!binding || binding.missionId !== current.id || binding.tabExecutionId !== v.tabExecutionId ||
                !executor.contextMatchesPage(current, binding, targetWindow).valid) { finishUncertain(current, 'RECONCILIATION_PAGE_CONTEXT_MISMATCH'); return; }
            const error = targetWindow.document.querySelector('.error_box, .error');
            if (error) { finishUncertain(current, 'GAME_ERROR'); return; }
            if (Date.now() > v.deadline || v.attempts >= 8) { finishUncertain(current, v.lastReason || 'VERIFICATION_TIMEOUT'); return; }
            const returned = url.searchParams.get('screen') === 'place' && !url.searchParams.get('try');
            const observed = returned ? readOutgoing(targetWindow, { readRowEvidence: readArrivalEvidence }) : { available: false, commands: [], reason: 'AWAITING_RALLY_RETURN' };
            const result = matchOutgoing(v, observed);
            const verification = { ...v, attempts: v.attempts + 1, lastReason: result.reason,
                afterCommandIds: observed.available ? observed.commands.map(command => command.id) : null };
            EAS.MissionScheduler.updateMission(current.id, { verification });
            log('MISSION_RECONCILIATION_ATTEMPT', current, { reconciliationAttempt: verification.attempts, currentUrl: safePage(targetWindow),
                targetCoord: v.targetCoord, commandType: v.commandType, candidatesFound: result.candidates.length,
                candidateIds: result.candidates.map(command => command.id), source: observed.source || null,
                beforeCommandIds: v.baseline.commandIds, afterCommandIds: verification.afterCommandIds, reason: result.reason });
            if (result.match) {
                EAS.MissionScheduler.updateMission(current.id, { outgoingCommandId: result.match.id,
                    verification: { ...verification, status: 'proven', matchedCommandId: result.match.id, evidence: result.evidence } });
                const proven = fresh(current);
                if (proven?.verification?.matchedCommandId !== result.match.id || proven.attemptId !== job.attemptId) { finishUncertain(current, 'PROOF_READBACK_FAILED'); return; }
                stopReconciliation(targetWindow);
                log('MISSION_RECONCILIATION_MATCH', proven, { commandId: result.match.id, evidence: result.evidence });
                EAS.ScheduledMissionExecution.finalizeScheduledAttackSuccess(proven, targetWindow);
                log('MISSION_COMPLETED', proven, { commandId: result.match.id }); return;
            }
            if (verification.attempts >= 8) { finishUncertain(fresh(current), result.reason); return; }
            const delay = Math.max(0, Math.min(RETRY_DELAYS[verification.attempts - 1], v.deadline - Date.now()));
            log('MISSION_RECONCILIATION_RETRY', current, { reconciliationAttempt: verification.attempts, delayMs: delay, reason: result.reason });
            show(fresh(current));
            const timer = targetWindow.setTimeout(() => { runtime.timers.delete(timer); check(); }, delay);
            job.timer = timer; runtime.timers.add(timer);
        };
        const check = () => {
            try { inspect(); } catch {
                stopReconciliation(targetWindow);
                // Storage/DOM failure must never leave a live retry or restore
                // send authorization. The consumed attempt remains immutable.
                try {
                    const current = fresh(mission);
                    if (current && ['submitting', 'sending'].includes(current.status)) finishUncertain(current, 'VERIFICATION_READ_OR_PERSIST_FAILED');
                } catch { log('MISSION_RECONCILIATION_FAILED', mission, { reason: 'VERIFICATION_READ_OR_PERSIST_FAILED' }); }
            }
        };
        log('MISSION_RECONCILIATION_STARTED', mission, { currentUrl: safePage(targetWindow), deadline: mission.verification?.deadline });
        check(); return true;
    };
    EAS.ArrivalExecution = { isArrival, allowed, context, beforePrepare, beforeAttack, beforeSubmit, submit, readBack, arm, cancelTimer,
        captureBaseline, matchOutgoing, readArrivalEvidence, verificationMatches, stopReconciliation, outcome };
})();
