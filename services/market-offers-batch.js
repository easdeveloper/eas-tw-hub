// Persistent orchestration only. Business rules and DOM parsing live in MarketOffersExecution.
(() => {
    'use strict';
    if (EAS.MarketOffersBatch) return;
    const api = EAS.MarketOffersExecution, w = window;
    const rt = w.__EASMarketBatch ||= { busy: null, timer: null, observer: null, generation: 0 };
    const DELAY = 700, VERIFY_MS = 10000;
    const fields = item => [item.id, String(item.villageId), item.offerResource, item.requestResource,
        item.offerAmount, item.requestAmount, item.repeatCount, item.maxTravelHours];
    const plan = context => JSON.stringify(context.queue.map(fields));
    const owned = context => context?.batchAuthorization && context.executionTab === w.name;
    const active = context => api.canResumeBatch(context);
    const log = (event, context, item, extra = {}) => {
        try { EAS.Logger?.info?.('MARKET', event, { executionId: context?.executionId,
            itemId: item?.id, attemptId: item?.attempt?.attemptId, sourceVillageId: item?.villageId,
            offerResource: item?.offerResource, requestResource: item?.requestResource,
            offerAmount: item?.offerAmount, requestAmount: item?.requestAmount, repetitions: item?.repeatCount,
            currentIndex: context?.currentIndex, queueLength: context?.queue?.length, ...extra }); } catch {}
    };
    const stopLocal = () => {
        if (rt.timer !== null) w.clearTimeout(rt.timer);
        if (rt.deferredTimer != null) w.clearTimeout(rt.deferredTimer);
        rt.deferredTimer = null;
        rt.preparationAbort?.abort(); rt.preparationAbort = null;
        rt.timer = null; rt.observer?.disconnect(); rt.observer = null; rt.generation++;
    };
    const detach = () => {
        if (rt.storageListener) w.removeEventListener?.('storage', rt.storageListener);
        if (rt.pagehideListener) w.removeEventListener?.('pagehide', rt.pagehideListener);
        rt.storageListener = null; rt.pagehideListener = null;
    };
    const close = context => { stopLocal(); detach(); api.disposeBatch?.(context, w); };
    const listen = () => {
        if (rt.storageListener) return;
        const context = api.read();
        rt.storageListener = event => { if (event.key === api.STORAGE_KEY) { const c = api.read(); if (!active(c) || c.executionId !== context.executionId) close(context); } };
        rt.pagehideListener = () => { stopLocal(); detach(); };
        w.addEventListener?.('storage', rt.storageListener);
        w.addEventListener?.('pagehide', rt.pagehideListener);
    };
    rt.stopLocal = stopLocal;
    const persist = context => {
        if (!api.save(context)) throw Error('STORAGE_WRITE_FAILED');
        const restored = api.read();
        if (JSON.stringify(restored) !== JSON.stringify(context)) throw Error('STORAGE_READBACK_FAILED');
        return restored;
    };
    const current = context => context.queue[context.currentIndex];
    const validAttempt = (context, item) => !item.attempt || (item.attempt.executionId === context.executionId &&
        item.attempt.itemId === item.id && item.attempt.sourceVillageId === String(item.villageId) &&
        item.attempt.itemIdentity === JSON.stringify(fields(item)));
    const unchanged = context => {
        const latest = api.read();
        return latest?.executionId === context.executionId && latest.revision === context.revision &&
            latest.state === 'running' && !latest.paused && active(latest) && owned(latest);
    };
    const render = context => api.renderBatch?.(context, { stop, resume: continueUnsent, skip, markErrorAndSkip }, w);
    const preserveFailureEvidence = (item, reason) => {
        if (!item?.attempt?.submitAt || item.attempt.failureEvidence) return;
        // Diagnostic capture only: no change to error detection or reconciliation decisions.
        let afterSnapshot = null, gameError = null;
        try { afterSnapshot = api.captureBatchSnapshot(w.document, item, w); } catch {}
        try { gameError = api.errorMessage(w.document); } catch {}
        item.attempt.failureEvidence = { recordedAt: Date.now(), reason, gameError, afterSnapshot };
    };
    const pause = (context, state, reason) => {
        stopLocal(); context.paused = true; context.state = state; context.pauseReason = reason;
        const item = current(context);
        if (['uncertain', 'error'].includes(state)) preserveFailureEvidence(item, reason);
        if (item) { item.error = reason; item.retrySafe = false; if (state === 'uncertain') item.status = 'verification-required'; else if (state === 'error') item.status = 'error'; }
        try { persist(context); } catch { /* No action follows failed persistence. */ }
        log(state === 'rate_limited' ? 'MARKET_RATE_LIMITED' : state === 'uncertain' ? 'MARKET_UNCERTAIN' : 'MARKET_ERROR', context, item, { result: reason });
        render(api.read() || context); return false;
    };
    const rateLimited = context => {
        if (!w.EASRateLimit?.check()) return false;
        const latest = api.read();
        if (latest?.executionId === context.executionId) pause(latest, 'rate_limited', 'RATE_LIMITED');
        return true;
    };
    const schedule = milliseconds => {
        stopLocal(); rt.timer = w.setTimeout(() => { rt.timer = null; resume(); }, Math.max(0, milliseconds));
    };
    const waitResult = (context, item) => {
        if (!unchanged(context)) return false;
        stopLocal();
        const deadline = item.attempt.deadlineAt;
        if (Date.now() >= deadline) return pause(context, 'uncertain', 'Resultado nao comprovado. Nao reenviar.');
        if (w.MutationObserver) {
            rt.observer = new w.MutationObserver(() => resume());
            rt.observer.observe(w.document.body, { childList: true, subtree: true, characterData: true });
        }
        rt.timer = w.setTimeout(() => { rt.timer = null; resume(); }, deadline - Date.now());
        return true;
    };
    const finish = (context, item, result) => {
        stopLocal(); item.status = 'created'; item.createdAt = Date.now(); item.offerId = result.offerId || null;
        item.confirmation = result; item.attempt.state = 'completed';
        context.currentIndex++; context.nextAt = Date.now() + DELAY;
        if (context.currentIndex === context.queue.length) { context.endedAt = Date.now(); context.finishedAt = context.endedAt; context.state = 'completed'; }
        else context.state = 'running';
        persist(context); // Commit before cache/history/UI: none can authorize a second submission.
        log('MARKET_ITEM_COMPLETED', context, item, { result: result.evidence });
        try { api.commitBatchResult?.(context, item, result, w); } catch { if (!context.endedAt) return pause(context, 'error', 'CACHE_PROMOTION_FAILED'); }
        log(context.endedAt ? 'MARKET_QUEUE_COMPLETED' : 'MARKET_QUEUE_ADVANCE', context, current(context));
        render(context);
        if (!context.endedAt && unchanged(context)) schedule(DELAY);
        else detach();
        return true;
    };
    const step = async () => {
        let context = api.read();
        if (!active(context)) { close(context); return false; }
        if (!owned(context)) return false;
        if (context.state !== 'running' || context.paused) { stopLocal(); render(context); return false; }
        if (rateLimited(context)) return false;
        if (plan(context) !== context.batchAuthorization.plan) return pause(context, 'error', 'AUTHORIZED_QUEUE_CHANGED');
        const item = current(context);
        if (!item) return pause(context, 'error', 'CURRENT_ITEM_MISSING');
        if (item.manualResolution || item.attempt?.revokedAt) {
            stopLocal(); context.paused = true; context.state = 'error'; context.pauseReason = 'MANUALLY_RESOLVED_ATTEMPT';
            persist(context); render(context); return false;
        }
        if (!validAttempt(context, item)) return pause(context, 'uncertain', 'ATTEMPT_IDENTITY_MISMATCH');
        if (context.nextAt > Date.now()) { schedule(context.nextAt - Date.now()); return true; }
        const url = new URL(w.location.href);
        const rightPage = url.searchParams.get('screen') === 'market' && url.searchParams.get('mode') === 'own_offer' &&
            String(url.searchParams.get('village') || w.game_data?.village?.id) === String(item.villageId) && (!w.game_data?.village?.id || String(w.game_data.village.id) === String(item.villageId));
        if (!rightPage) {
            // A submitted item is only navigated to its own source for reconciliation, never reset.
            const destination = new URL('/game.php', w.location.origin);
            destination.searchParams.set('screen', 'market'); destination.searchParams.set('mode', 'own_offer'); destination.searchParams.set('village', item.villageId);
            if (context.navigationTarget === destination.href) return pause(context, 'error', 'NAVIGATION_NOT_READY');
            context.navigationTarget = destination.href; persist(context); stopLocal(); render(context); w.location.assign(destination.href); return true;
        }
        if (context.navigationTarget) { delete context.navigationTarget; persist(context); }
        if (item.attempt?.submitAt) {
            log('MARKET_RECONCILE', context, item);
            const result = api.reconcileBatchDom(item, w, context);
            if (result.success) return finish(context, item, result);
            if (result.uncertain) return pause(context, 'uncertain', result.reason);
            const confirmation = api.inspectBatchConfirmation(item, w);
            if (confirmation?.valid && !item.attempt.confirmAt) {
                if (Date.now() >= item.attempt.deadlineAt) return pause(context, 'uncertain', 'CONFIRMATION_DEADLINE');
                item.attempt.confirmAt = Date.now(); item.attempt.state = 'confirming'; item.status = 'submitting';
                persist(context);
                if (!unchanged(context) || rateLimited(context)) return false;
                log('MARKET_CONFIRM', context, item);
                confirmation.button.click();
                waitResult(context, item); return true;
            }
            const error = api.errorMessage(w.document);
            if (error) return pause(context, 'uncertain', 'O jogo indicou erro apos envio. Verifique o resultado; nao reenviar.');
            return waitResult(context, item);
        }
        if (!['pending', 'preparing', 'prepared'].includes(item.status)) return pause(context, 'error', 'ITEM_STATE_NOT_AUTHORIZED');
        item.status = 'preparing'; persist(context); render(context); log('MARKET_ITEM_PREPARING', context, item);
        // Refresh from the current DOM, not a global HTTP scan.
        api.refreshBatchVillage(item, w);
        const controller = new w.AbortController(); rt.preparationAbort = controller;
        let prepared;
        try { prepared = await api.prepareItem(context, w, { signal: controller.signal }); }
        finally { controller.abort(); if (rt.preparationAbort === controller) rt.preparationAbort = null; }
        if (!unchanged(context)) return false; // Stop/reload/another owner invalidated this continuation.
        if (rateLimited(context)) return false;
        if (!prepared.valid || !prepared.submit || !api.validateBatchForm(item, prepared.form, prepared.submit, w))
            return pause(context, 'error', prepared.message || 'FORM_VALIDATION_FAILED');
        const before = api.captureBatchSnapshot(w.document, item, w);
        if (before?.available !== true || !Array.isArray(before.offerIds)) {
            log('OFFER_SNAPSHOT', context, item, { available: false, offerIds: null, source: before?.source, reason: before?.reason });
            return pause(context, 'error', 'BEFORE_SNAPSHOT_UNAVAILABLE');
        }
        if (!item.attempt) {
            item.attempt = { attemptId: `${context.executionId}:${item.id}:${Date.now()}:${Math.random()}`,
                executionId: context.executionId, itemId: item.id, sourceVillageId: String(item.villageId),
                itemIdentity: JSON.stringify(fields(item)), createdAt: Date.now(), state: 'prepared' };
            log('MARKET_ATTEMPT_CREATED', context, item);
        }
        Object.assign(before, { executionId: context.executionId, itemId: item.id, attemptId: item.attempt.attemptId, sourceVillageId: String(item.villageId), itemIdentity: item.attempt.itemIdentity });
        item.attempt.beforeSnapshot = before; item.status = 'prepared';
        persist(context);
        log('OFFER_SNAPSHOT', context, item, { available: true, offerIds: before.offerIds, count: before.offerIds.length, source: before.source, persisted: true, readBackValid: true });
        if (!unchanged(context) || rateLimited(context)) return false;
        // Same executor as the existing "Criar esta oferta" action.
        const submitted = api.submitPreparedOffer({ context, item, prepared, targetWindow: w, commit: () => {
            if (!unchanged(context) || rateLimited(context) || item.attempt.submitAt) return false;
            item.attempt.submitAt = Date.now(); item.attempt.deadlineAt = Date.now() + VERIFY_MS;
            item.attempt.state = 'submitting'; item.status = 'submitting'; persist(context);
            if (!unchanged(context) || rateLimited(context)) return false;
            log('MARKET_SUBMIT', context, item); return true;
        } });
        if (!submitted.sent) return unchanged(context) ? pause(context, 'error', submitted.reason) : false;
        if (!waitResult(context, item)) return false;
        // One deferred inspection catches synchronous/AJAX success, not a polling loop.
        rt.deferredTimer = w.setTimeout(() => { rt.deferredTimer = null; resume(); }, 0);
        return true;
    };
    const resume = () => {
        const context = api.read();
        if (!active(context)) { close(context); return Promise.resolve(false); }
        if (!owned(context)) return Promise.resolve(false);
        listen();
        if (rt.busy) return rt.busy;
        if (!w.navigator?.locks?.request) { pause(context, 'error', 'WEB_LOCKS_UNAVAILABLE'); return Promise.resolve(false); }
        rt.busy = w.navigator.locks.request('eas-market-offers-execution', { ifAvailable: true }, async lock => {
            if (!lock) return false;
            try { return await step(); }
            catch (error) {
                const latest = api.read();
                if (owned(latest) && active(latest)) pause(latest, current(latest)?.attempt?.submitAt ? 'uncertain' : 'error', String(error.message));
                return false;
            }
        }).finally(() => { rt.busy = null; });
        return rt.busy;
    };
    const stop = () => {
        const context = api.read();
        if (!context?.batchAuthorization) return false;
        if (!active(context)) { close(context); return true; }
        close(context);
        api.finalizeBatchStop(context);
        try {
            persist(context);
            // Archive is diagnostic only. The terminal record remains the source of truth.
            api.archiveBatch(context);
            log('MARKET_USER_STOPPED', context, current(context));
            return true;
        } finally {
            // Also prevents this document/reload from resuming if storage failed.
            if (w.name === context.executionTab) w.name = '';
        }
    };
    const continueUnsent = () => {
        const context = api.read(), item = context && current(context);
        if (!owned(context) || !active(context) || context.state === 'uncertain' || item?.attempt?.submitAt || w.EASRateLimit?.check()) return false;
        context.paused = false; context.state = 'running'; context.pauseReason = null;
        if (item) item.status = 'pending'; persist(context); resume(); return true;
    };
    const skip = () => {
        const context = api.read(), item = context && current(context);
        if (!owned(context) || !active(context) || !context.paused || !item || item.attempt?.submitAt) return false;
        item.status = 'skipped'; context.currentIndex++;
        if (context.currentIndex === context.queue.length) { context.endedAt = Date.now(); context.finishedAt = context.endedAt; context.state = 'completed'; }
        persist(context); render(context); return true;
    };
    const markErrorAndSkip = identity => {
        if (!identity || rt.busy || !w.navigator?.locks?.request) return Promise.resolve(false);
        rt.busy = w.navigator.locks.request('eas-market-offers-execution', { ifAvailable: true }, lock => {
            if (!lock) return false;
            const context = api.read(), item = context && current(context);
            if (!owned(context) || !api.canMarkErrorAndSkip(context) || !validAttempt(context, item) ||
                context.executionId !== identity.executionId || item.id !== identity.itemId || item.attempt.attemptId !== identity.attemptId) return false;
            if (rateLimited(context)) return false;
            stopLocal();
            preserveFailureEvidence(item, context.pauseReason);
            const decidedAt = Date.now();
            item.manualResolution = { outcome: 'error', action: 'mark-error-and-skip', decidedAt,
                executionId: context.executionId, itemId: item.id, attemptId: item.attempt.attemptId,
                previousStatus: item.status, previousState: context.state, previousAttemptState: item.attempt.state, reason: context.pauseReason };
            item.status = 'skipped'; item.retrySafe = false;
            item.attempt.revokedAt = decidedAt; item.attempt.revocationReason = 'MANUAL_ERROR_SKIP'; item.attempt.state = 'manually-skipped';
            context.currentIndex++; context.paused = false; context.pauseReason = null; context.state = 'running';
            delete context.navigationTarget;
            context.nextAt = decidedAt + DELAY;
            if (context.currentIndex === context.queue.length) {
                context.state = 'completed'; context.endedAt = decidedAt; context.finishedAt = decidedAt; delete context.nextAt;
            }
            persist(context); // One durable decision + one index advance, before scheduling another item.
            log('MARKET_ITEM_MANUALLY_SKIPPED', context, item, { outcome: 'error' });
            log(context.endedAt ? 'MARKET_QUEUE_COMPLETED' : 'MARKET_QUEUE_ADVANCE', context, current(context));
            render(context);
            if (!context.endedAt && unchanged(context)) schedule(DELAY); else detach();
            return true;
        }).catch(error => {
            stopLocal(); const context = api.read();
            log('MARKET_ERROR', context, context && current(context), { result: String(error.message) });
            if (context) render(context);
            return false;
        }).finally(() => { rt.busy = null; });
        return rt.busy;
    };
    const start = input => {
        const existing = api.read();
        if (existing && !api.isExecutionFinished(existing)) throw Error('EXISTING_MARKET_EXECUTION');
        if ((!w.EASLocalBuild?.execute && !w.EASTWUserscriptLoader) || !w.navigator?.locks?.request) throw Error('PERSISTENT_USERSCRIPT_REQUIRED');
        if (w.EASRateLimit?.check()) throw Error('RATE_LIMITED');
        const executionId = `market-batch:${Date.now()}:${Math.random()}`;
        const queue = (input.queue || []).map((entry, index) => api.normalizeItem({ ...entry, id: `${executionId}:${index}`,
            maxTravelHours: entry.maxTravelHours || input.smartOfferConfig?.maxTravelHours, status: 'pending', attempt: null }));
        if (!queue.length) throw Error('EMPTY_QUEUE');
        const context = { version: api.EXECUTION_VERSION, executionId, executionTab: `eas-market-batch:${executionId}`,
            startedAt: Date.now(), createdAt: Date.now(), currentIndex: 0, queue, state: 'running', paused: false, revision: 0,
            smartOfferConfig: input.smartOfferConfig || {}, calculationMode: 'per-village',
            batchAuthorization: { authorizedAt: Date.now(), plan: null } };
        context.batchAuthorization.plan = plan(context);
        persist(context); w.name = context.executionTab;
        log('MARKET_QUEUE_CREATED', context, current(context)); resume(); return context;
    };
    EAS.MarketOffersBatch = { start, resume, stop, continueUnsent, skip, markErrorAndSkip, owned, active, stopLocal };
})();
