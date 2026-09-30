(() => {
    'use strict';
    if (EAS.IncomingMonitor) return;
    const store = EAS.IncomingStore, model = EAS.IncomingModel, transport = EAS.IncomingTransport;
    const log = (stage, detail = {}) => { try { EAS.Logger?.info?.('IncomingMonitor', stage, detail); } catch {} };
    const clock = () => EAS.MassSnipeExecution.getCurrentServerTimeMs();
    let runtime = null, controller = null, timer = null, timerDue = 0, hints = 0, pending = null, generation = 0, lockRetries = 0;
    const status = () => { const state = store.read(); return { ...state, socketStatus: EAS.IncomingSocket.status().state, active: Boolean(runtime), lastEventAt: store.events().at(-1)?.detectedAt || null, transportConfigured: Boolean(window.EASDiscordBridge?.configured?.()) }; };
    const schedule = (delay = 250) => {
        if (!runtime) { log('RECONCILE_SKIPPED', { reason: 'MONITOR_DISABLED' }); return; }
        const due = Date.now() + Math.max(250, delay);
        if (timer != null && timerDue <= due) { log('RECONCILE_SKIPPED', { reason: 'DEBOUNCED', dueAt: timerDue }); return; }
        if (timer != null) runtime.clearTimeout(timer);
        timerDue = due;
        timer = runtime.setTimeout(() => {
            timer = null; timerDue = 0;
            try { reconcile().catch(() => log('RECONCILE_FAILED', { reason: 'TIMER_CALLBACK_FAILED' })); }
            catch { log('RECONCILE_FAILED', { reason: 'TIMER_CALLBACK_FAILED' }); }
        }, Math.max(250, delay));
        log('RECONCILE_SCHEDULED', { dueAt: due, delayMs: Math.max(250, delay), generation });
    };
    const signal = (type, data = {}) => {
        if (!runtime || !store.read().config.enabled) { log('RECONCILE_SKIPPED', { reason: 'MONITOR_DISABLED' }); return; }
        let detectedAt; try { detectedAt = clock(); } catch { detectedAt = null; }
        const village = data.target_village;
        const target = EAS.IncomingParser.coordinate(data.target_village_name || '') ||
            (Number.isInteger(Number(village?.x)) && Number.isInteger(Number(village?.y)) && /^\d{1,3}$/.test(String(village.x)) && /^\d{1,3}$/.test(String(village.y)) ? `${+village.x}|${+village.y}` : null);
        const event = { id: `${Date.now()}:${Math.random()}`, type, detectedAt, receivedAt: detectedAt, target };
        log('SOCKET_EVENT', { type, detectedAt, target: event.target, commandType: type === 'command_count' ? data.command_type : null });
        // Capture time synchronously, before any lock, debounce or HTTP await.
        const epoch = generation;
        store.record(event).then(() => {
            if (epoch !== generation || !runtime) { log('RECONCILE_SKIPPED', { reason: 'LIFECYCLE_CHANGED' }); return; }
            hints++; lockRetries = 0; schedule();
        }).catch(() => log('RECONCILE_FAILED', { reason: 'EVENT_PERSIST_FAILED' }));
    };
    const process = async (state, entry, runSignal, alive) => {
        if (entry.baseline || entry.state === 'ENDED') return;
        if (!entry.classification && Number.isFinite(entry.firstDetectedAt)) {
            await transport.pace(runSignal);
            entry.classification = model.classify(entry.arrivalAt, entry.firstDetectedAt, await transport.travel(entry, runSignal));
            if (!alive()) return;
            entry.state = 'CLASSIFIED'; store.write(state); log('classify', { commandId: entry.commandId, classification: entry.classification });
        }
        if (['pending', 'uncertain'].includes(entry.label.status) && entry.name === entry.label.value) { entry.label.status = 'applied'; entry.state = 'LABEL_APPLIED'; store.write(state); }
        const label = model.label(entry);
        if (state.config.labels && label && label !== entry.name && label !== entry.label.value && entry.label.status !== 'pending' && entry.label.status !== 'uncertain') {
            if (!alive()) return;
            await transport.pace(runSignal);
            entry.label = { status: 'pending', value: label }; store.write(state);
            try { await transport.rename(entry, label, runSignal); log('label', { commandId: entry.commandId, status: 'awaiting-readback' }); }
            catch { entry.label.status = 'uncertain'; log('label', { commandId: entry.commandId, reason: 'LABEL_NOT_PROVEN_NO_RETRY' }); }
            if (!alive()) return; store.write(state); transport.check(runSignal);
        }
        if (!state.config.discord || !window.EASDiscordBridge?.configured?.()) return;
        const signature = JSON.stringify(model.message(entry));
        const discord = entry.discord;
        if (discord.status === 'pending' || discord.status === 'uncertain' || discord.signature === signature || discord.failedSignature === signature) return;
        if (!alive()) return;
        await transport.pace(runSignal);
        // At-most-once creation: persist intention before external POST. If a
        // response/navigation is lost, keep pending and never create a duplicate.
        entry.discord = { ...discord, status: 'pending', requestedSignature: signature }; store.write(state);
        try {
            const result = await transport.discord(entry, runSignal);
            if (!alive()) return;
            if (!/^\d+$/.test(String(result?.id || ''))) throw Error('DISCORD_MESSAGE_ID_MISSING');
            entry.discord = { status: 'sent', messageId: String(result.id), signature };
            entry.state = discord.messageId ? 'DISCORD_UPDATED' : 'DISCORD_CREATED';
            log('DISCORD_SENT', { commandId: entry.commandId, operation: discord.messageId ? 'updated' : 'created' });
        } catch {
            if (!alive()) return;
            entry.discord = { ...discord, status: discord.messageId ? 'edit-failed' : 'uncertain', failedSignature: signature };
            log('DISCORD_FAILED', { commandId: entry.commandId, reason: 'DISCORD_NOT_PROVEN_NO_RETRY' });
        }
        store.write(state);
    };
    const reconcile = () => {
        if (pending) { log('RECONCILE_SKIPPED', { reason: 'ALREADY_RUNNING' }); return pending; }
        if (!runtime || !navigator.locks?.request) { log('RECONCILE_SKIPPED', { reason: !runtime ? 'MONITOR_DISABLED' : 'WEB_LOCKS_REQUIRED' }); return Promise.resolve(false); }
        log('RECONCILE_START', { generation });
        const epoch = generation, seenHints = hints, runSignal = controller.signal;
        const alive = () => generation === epoch && !runSignal.aborted;
        pending = navigator.locks.request(store.key() + ':run', { ifAvailable: true }, async lock => {
            if (!alive()) { log('RECONCILE_SKIPPED', { reason: 'LIFECYCLE_CHANGED' }); return false; }
            if (!lock) {
                log('RECONCILE_SKIPPED', { reason: 'LOCK_BUSY', retry: lockRetries });
                if (lockRetries++ < 3) schedule(3000);
                else log('RECONCILE_FAILED', { reason: 'LOCK_RETRY_LIMIT' });
                return false;
            }
            lockRetries = 0;
            const state = store.read();
            if (!state.config.enabled || state.failures >= 3) {
                log('RECONCILE_SKIPPED', { reason: !state.config.enabled ? 'MONITOR_DISABLED' : 'FAILURE_LIMIT', failures: state.failures }); return false;
            }
            const events = store.events(), eventIds = events.map(event => event.id || `${event.type}:${event.target}:${event.receivedAt}`);
            const newHint = eventIds.some(id => !state.seenEvents?.includes(id));
            if (Date.now() < state.nextReadAt) { log('RECONCILE_SKIPPED', { reason: 'READ_BACKOFF', dueAt: state.nextReadAt }); schedule(state.nextReadAt - Date.now()); return false; }
            if (state.initialized && !newHint && Date.now() < (state.nextWatchAt || 0)) {
                log('RECONCILE_SKIPPED', { reason: 'NO_RELEVANT_CHANGE' });
                if (Object.values(state.attacks).some(entry => !entry.baseline && entry.state !== 'ENDED' && entry.watchtower.state !== 'detected' && entry.watchtower.state !== 'not-applicable')) schedule(state.nextWatchAt - Date.now());
                return false;
            }
            try {
                transport.check(runSignal);
                // Shared across tabs/documents: even socket floods cannot bypass
                // the minimum request interval or the persisted backoff.
                state.nextReadAt = Date.now() + 3000; store.write(state);
                const rows = await transport.overview(runSignal);
                if (!alive()) return false;
                const now = clock(), wasInitialized = state.initialized, previous = JSON.parse(JSON.stringify(state.attacks));
                model.merge(state, rows, events, now); store.prune(state, now); store.write(state);
                if (!wasInitialized && rows.length === 0) log('BASELINE_EMPTY', { count: 0, persisted: true });
                for (const entry of Object.values(state.attacks)) {
                    if (!previous[entry.commandId] && !entry.baseline) log('NEW_INCOMING', { commandId: entry.commandId, firstDetectedAt: entry.firstDetectedAt });
                    if (previous[entry.commandId] && JSON.stringify(previous[entry.commandId].watchtower) !== JSON.stringify(entry.watchtower)) log('watchtower', { commandId: entry.commandId, evidence: entry.watchtower });
                }
                let budget = 0, backlog = false;
                for (const entry of Object.values(state.attacks)) {
                    if (!alive()) return false;
                    if (entry.state === 'ENDED' || entry.baseline) continue;
                    const wanted = model.label(entry), ds = entry.discord;
                    const needsWork = (!entry.classification && Number.isFinite(entry.firstDetectedAt)) ||
                        (state.config.labels && wanted && ((['pending', 'uncertain'].includes(entry.label.status) && entry.name === entry.label.value) ||
                        (!['pending', 'uncertain'].includes(entry.label.status) && wanted !== entry.name && wanted !== entry.label.value))) ||
                        (state.config.discord && window.EASDiscordBridge?.configured?.() && !['pending', 'uncertain'].includes(ds.status) && ds.signature !== JSON.stringify(model.message(entry)) && ds.failedSignature !== JSON.stringify(model.message(entry)));
                    if (!needsWork) continue;
                    // A batch is capped; remaining entries resume on the next
                    // controlled reconciliation rather than a request burst.
                    if (++budget > 3) { backlog = true; break; }
                    await process(state, entry, runSignal, alive);
                }
                if (!alive()) return false;
                const used = new Set(Object.values(state.attacks).flatMap(entry => entry.detectionEventIds || []));
                const unmatched = events.filter((event, index) => event.type === 'attack' && now - event.receivedAt < 30000 && !used.has(eventIds[index]));
                const hintSignature = JSON.stringify(unmatched.map(event => event.id || `${event.type}:${event.target}:${event.receivedAt}`));
                state.hintPasses = state.hintSignature === hintSignature ? (state.hintPasses || 0) + 1 : 1;
                state.hintSignature = hintSignature;
                const retryHint = wasInitialized && unmatched.length > 0 && state.hintPasses < 3;
                state.failures = 0; state.lastError = null; state.seenEvents = eventIds; state.nextWatchAt = Date.now() + (backlog || retryHint ? 3000 : 60000); store.write(state);
                log('RECONCILE_RESULT', { count: rows.length, newCount: rows.filter(row => !previous[row.commandId] && wasInitialized).length, knownCount: rows.filter(row => Boolean(previous[row.commandId]) || !wasInitialized).length, lastReconciledAt: now });
                const tracked = Object.values(state.attacks).some(entry => entry.state !== 'ENDED' && !entry.baseline &&
                    (entry.label.status === 'pending' || entry.watchtower.state === 'pending' || entry.watchtower.state === 'watching' || entry.watchtower.state === 'unknown'));
                if (backlog || retryHint) schedule(3000); else if (tracked) schedule(60000);
                return true;
            } catch (error) {
                if (!alive()) return false;
                state.failures++; state.lastError = window.EASRateLimit?.check() ? 'RATE_LIMITED' : /^[A-Z_0-9]+$/.test(error?.message || '') ? error.message : 'RECONCILIATION_UNAVAILABLE';
                state.nextReadAt = Date.now() + [5000, 15000, 60000][Math.min(2, state.failures - 1)];
                if (state.lastError === 'RATE_LIMITED') state.failures = 3;
                store.write(state); log('RECONCILE_FAILED', { reason: state.lastError, reasonCode: ['LOGIN_PAGE', 'GAME_ERROR', 'PARTIAL_PAGE_SELECTED', 'INCOMING_PAGINATION', 'INCOMING_PAGINATION_CONTROL', 'COMMAND_TYPE_CONFLICT', 'ORPHAN_COMMAND_MARKERS', 'EMPTY_STRUCTURE_MISSING', 'COMMAND_ROW_INVALID'].includes(error?.reasonCode) ? error.reasonCode : null, failures: state.failures });
                if (state.failures < 3) schedule(state.nextReadAt - Date.now());
                return false;
            }
        }).catch(() => { log('RECONCILE_FAILED', { reason: 'STORAGE_OR_LOCK_UNAVAILABLE' }); return false; }).finally(() => {
            pending = null;
            if (runtime && (generation !== epoch || (alive() && hints !== seenHints))) schedule();
        });
        return pending;
    };
    const stop = () => {
        generation++; controller?.abort(); controller = null; EAS.IncomingSocket.stop();
        EAS.Runtime.dispose('incoming-monitor'); runtime = null; timer = null; timerDue = 0;
    };
    const start = () => {
        if (runtime) { EAS.IncomingSocket.refresh?.(); return true; }
        if (!store.read().config.enabled) return false;
        if (!navigator.locks?.request) { log('RECONCILE_FAILED', { reason: 'WEB_LOCKS_REQUIRED' }); return false; }
        controller = new AbortController(); runtime = EAS.Runtime.create({ id: 'incoming-monitor', type: 'incoming-monitor' }); runtime.start();
        runtime.listen(window, 'pagehide', stop);
        runtime.listen(window, 'storage', event => { if (event.key === store.key() && !store.read().config.enabled) stop(); if (event.key === store.key() + ':events') { hints++; schedule(); } });
        EAS.IncomingSocket.start(signal); schedule(); return true;
    };
    const configure = async config => {
        stop();
        await navigator.locks.request(store.key() + ':run', async () => {
            const state = store.read(); state.config = { enabled: Boolean(config.enabled), discord: Boolean(config.discord), labels: Boolean(config.labels) };
            state.failures = 0; store.write(state);
        });
        if (config.enabled) start();
    };
    EAS.IncomingMonitor = { start, stop, configure, status, signal, reconcile };
})();
