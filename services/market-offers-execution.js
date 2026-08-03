(() => {
    'use strict';
    EAS.MarketOffersExecution = EAS.MarketOffersExecution || {};
    const STORAGE_KEY = 'eas_tw_market_offers_execution';
    const HISTORY_KEY = 'eas_tw_market_offers_history';
    const CHANNEL_NAME = 'eas_tw_market_offers_channel';
    const PANEL_ID = 'eas-market-offer-execution-panel';
    const EXECUTION_VERSION = 3;
    const TERMINAL = new Set(['created', 'skipped', 'cancelled', 'canceled']);
    const amount = (value) => Math.max(0, Math.floor(Number(value) || 0));
    const read = () => { try { const context = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); if (context && (!Number.isFinite(Number(context.version)) || Number(context.version) < EXECUTION_VERSION)) { localStorage.removeItem(STORAGE_KEY); return null; } return context; } catch { return null; } };
    const save = (context) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(context)); return true; } catch { return false; } };
    const remove = () => { try { localStorage.removeItem(STORAGE_KEY); } catch {} };
    const emit = (message) => { try { const channel = new BroadcastChannel(CHANNEL_NAME); channel.postMessage(message); channel.close(); } catch {} };
    const getRuntime = (targetWindow = window) => targetWindow.EASMarketOfferRuntime ||= { initialized: false, preparing: false, preparedItemId: null, paused: false, observer: null, timers: new Set(), prepareAttempts: new Map() };
    const cleanupMarketOfferRuntime = (targetWindow = window) => { const runtime = getRuntime(targetWindow); runtime.observer?.disconnect?.(); runtime.observer = null; runtime.timers.forEach((timer) => { targetWindow.clearTimeout(timer); targetWindow.clearInterval(timer); }); runtime.timers.clear(); runtime.preparing = false; return runtime; };
    const registerPrepareAttempt = (runtime, itemId, now = Date.now()) => { const attempts = (runtime.prepareAttempts.get(itemId) || []).filter((timestamp) => now - timestamp < 10000); attempts.push(now); runtime.prepareAttempts.set(itemId, attempts); if (attempts.length > 3) runtime.paused = true; return { allowed: !runtime.paused, count: attempts.length }; };
    const addHistory = (item, result, error = null) => { try { const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); history.unshift({ executedAt: Date.now(), villageId: item.villageId, offerResource: item.offerResource, offerAmount: item.offerAmount, requestResource: item.requestResource, requestAmount: item.requestAmount, repeatCount: item.repeatCount, totalOfferAmount: item.totalOfferAmount, totalRequestAmount: item.totalRequestAmount, result, error }); localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 200))); } catch {} };
    const normalizeItem = (item) => {
        const repeatCount = Math.max(1, amount(item.repeatCount || 1)); const offerAmount = amount(item.amountPerOffer || item.offerAmount); const requestAmount = amount(item.requestAmountPerOffer || item.requestAmount);
        const totalOfferAmount = amount(item.totalOfferAmount || offerAmount * repeatCount); const totalRequestAmount = amount(item.totalRequestAmount || requestAmount * repeatCount);
        return { ...item, id: item.id || `queue-${Date.now()}-${Math.random().toString(36).slice(2)}`, offerAmount, amountPerOffer: offerAmount, requestAmount, requestAmountPerOffer: requestAmount, repeatCount, totalOfferAmount, totalRequestAmount, merchantsRequired: amount(item.merchantsRequired || EAS.MarketEngine.calculateMerchantsRequired({ [item.offerResource]: totalOfferAmount })), status: item.status || 'pending', error: item.error || null };
    };
    const nextPendingIndex = (context, start = 0) => {
        const index = (context.queue || []).findIndex((item, itemIndex) => itemIndex >= start && !TERMINAL.has(item.status));
        return index < 0 ? context.queue.length : index;
    };
    const current = (context) => context?.queue?.[nextPendingIndex(context, context.currentIndex || 0)] || null;
    const syncIndex = (context) => { context.currentIndex = nextPendingIndex(context, context.currentIndex || 0); return context.currentIndex; };
    const getCurrentPendingOfferItem = (execution) => { if (!execution) return null; syncIndex(execution); return current(execution); };
    const getVillageId = (targetWindow) => String(new URL(targetWindow.location.href).searchParams.get('village') || targetWindow.game_data?.village?.id || '');
    const marketUrl = (villageId) => { const url = new URL('/game.php', location.origin); url.searchParams.set('village', villageId); url.searchParams.set('screen', 'market'); url.searchParams.set('mode', 'own_offer'); return url; };
    const injectLoader = (targetWindow) => {
        try { const doc = targetWindow.document; if (targetWindow.EAS?.MarketOffersExecution?.initialize) { targetWindow.EAS.MarketOffersExecution.initialize(); return true; } if (doc.querySelector('script[data-eas-market-auto-loader]')) return true; const script = doc.createElement('script'); script.src = `https://easdeveloper.github.io/eas-tw-hub/index.js?v=${Date.now()}`; script.dataset.easMarketAutoLoader = 'true'; (doc.head || doc.documentElement).appendChild(script); return true; } catch { return false; }
    };
    const watchExecutionWindow = (targetWindow, ownerWindow = window) => {
        if (!targetWindow || targetWindow.closed) return null; if (targetWindow.__easMarketWatchTimer) return targetWindow.__easMarketWatchTimer;
        const timer = ownerWindow.setInterval(() => { if (targetWindow.closed || !read() || read()?.endedAt) { ownerWindow.clearInterval(timer); return; } try { if (targetWindow.document?.readyState !== 'loading' && !targetWindow.EAS?.MarketOffersExecution?.initialize) injectLoader(targetWindow); else if (!targetWindow.document?.getElementById(PANEL_ID)) targetWindow.EAS?.MarketOffersExecution?.initialize?.(); } catch {} }, 300);
        try { targetWindow.__easMarketWatchTimer = timer; } catch {} return timer;
    };
    const openCurrent = (context) => {
        syncIndex(context); const item = current(context); if (!item) return false;
        item.status = item.status === 'error' || item.status === 'verification-required' ? item.status : 'opening'; context.popupName = `eas-market-offer-${context.executionId}`; save(context);
        if (window.name === context.popupName) { window.location.assign(marketUrl(item.villageId)); return true; }
        const popup = window.open(marketUrl(item.villageId), context.popupName); if (!popup) return false;
        try { popup.addEventListener('load', () => injectLoader(popup)); } catch {}
        watchExecutionWindow(popup, window);
        return true;
    };
    const setValue = (input, value, targetWindow) => { const setter = Object.getOwnPropertyDescriptor(targetWindow.HTMLInputElement.prototype, 'value')?.set; setter ? setter.call(input, String(value)) : input.value = String(value); input.dispatchEvent(new targetWindow.Event('input', { bubbles: true })); input.dispatchEvent(new targetWindow.Event('change', { bubbles: true })); };
    const findField = (doc, names) => names.map((name) => doc.querySelector(`[name="${name}"], #${name}, [data-field="${name}"]`)).find(Boolean) || null;
    const findRepeatField = (doc) => doc.querySelector('input[name="multi"]');
    const fillRepeatCount = (doc, item, targetWindow = window) => {
        const multiInput = findRepeatField(doc); if (!multiInput) return { valid: false, message: 'Campo Quantas vezes oferecer não encontrado.' };
        const repeatCount = Number(item.repeatCount); if (!Number.isInteger(repeatCount) || repeatCount <= 0) return { valid: false, message: 'repeatCount inválido.' };
        const debug = localStorage.getItem('eas_tw_market_offers_debug') === 'true';
        if (debug) console.debug('[EAS Market Offer]', { repeatCountFromQueue: item.repeatCount, merchantsAvailable: item.merchantsAvailable, fieldBefore: multiInput.value });
        const apply = () => { multiInput.focus(); const setter = Object.getOwnPropertyDescriptor(targetWindow.HTMLInputElement.prototype, 'value')?.set; setter ? setter.call(multiInput, String(repeatCount)) : multiInput.value = String(repeatCount); multiInput.dispatchEvent(new targetWindow.Event('input', { bubbles: true })); multiInput.dispatchEvent(new targetWindow.Event('change', { bubbles: true })); multiInput.blur(); };
        apply(); if (Number(multiInput.value) !== repeatCount) apply();
        if (debug) console.debug('[EAS Market Offer]', { fieldAfter: multiInput.value });
        return { valid: Number(multiInput.value) === repeatCount, input: multiInput, repeatCount, apply, message: Number(multiInput.value) === repeatCount ? null : 'Não foi possível preencher Quantas vezes oferecer.' };
    };
    const setOfferRepeatCount = async (doc, item, targetWindow = window) => {
        const input = findRepeatField(doc); const expected = Number(item.repeatCount); if (!input) return { valid: false, message: 'Campo Quantas vezes oferecer não encontrado.' };
        if (!Number.isInteger(expected) || expected <= 0) return { valid: false, message: 'repeatCount inválido.' };
        const sleep = (milliseconds) => new Promise((resolve) => targetWindow.setTimeout(resolve, milliseconds)); const startedAt = Date.now(); const initialValue = input.value; const timeline = [{ elapsedMs: 0, phase: 'start', readyState: doc.readyState, value: input.value }];
        if (doc.readyState !== 'complete') await new Promise((resolve) => targetWindow.addEventListener('load', resolve, { once: true }));
        const navigation = targetWindow.performance?.getEntriesByType?.('navigation')?.[0]; timeline.push({ elapsedMs: Date.now() - startedAt, phase: 'window.load', readyState: doc.readyState, value: input.value, domContentLoadedMs: Math.round(navigation?.domContentLoadedEventEnd || 0), loadMs: Math.round(navigation?.loadEventEnd || 0) });
        let observedValue = input.value;
        for (let sample = 1; sample <= 10; sample += 1) { await sleep(50); if (input.value !== observedValue) { observedValue = input.value; timeline.push({ elapsedMs: Date.now() - startedAt, phase: 'tribal-initialization', value: input.value }); } }
        let result = null; let stableAttempt = null; let overwriteDetectedAtMs = null;
        for (let attempt = 1; attempt <= 5; attempt += 1) {
            const before = input.value; result = fillRepeatCount(doc, item, targetWindow); timeline.push({ elapsedMs: Date.now() - startedAt, phase: `fill-${attempt}`, before, after: input.value });
            await sleep(200); const actual = Number(input.value); timeline.push({ elapsedMs: Date.now() - startedAt, phase: `verify-${attempt}`, value: input.value });
            if (actual === expected) { stableAttempt = attempt; break; }
            overwriteDetectedAtMs = Date.now() - startedAt; timeline.push({ elapsedMs: overwriteDetectedAtMs, phase: `overwrite-after-fill-${attempt}`, expected, actual });
        }
        const actual = Number(input.value); const valid = actual === expected; const stabilizedAtMs = valid ? Date.now() - startedAt : null; const diagnostics = { expected, initialValue, finalValue: input.value, stableAttempt, overwriteDetectedAtMs, stabilizedAtMs, timeline };
        console.debug('[EAS Offer Multi Timing]', diagnostics);
        return { ...result, valid, initialValue, finalValue: input.value, stableAttempt, stabilizedAtMs, diagnostics, message: valid ? null : `Falha ao preparar repetições após 5 tentativas. Esperado: ${expected}. Atual: ${actual}.` };
    };
    const findSubmit = (doc, form) => form?.querySelector('[name="create_offer"], button[type="submit"], input[type="submit"], [data-action="create-offer"]') || doc.querySelector('[name="create_offer"], [data-action="create-offer"]');
    const chooseResource = (doc, kind, resource, targetWindow = window) => {
        const names = kind === 'offer' ? ['res_sell', 'sell_resource', 'offer_resource'] : ['res_buy', 'buy_resource', 'request_resource'];
        const select = names.map((name) => doc.querySelector(`select[name="${name}"], select#${name}`)).find(Boolean);
        if (select) { select.value = resource; select.dispatchEvent(new targetWindow.Event('change', { bubbles: true })); return select.value === resource; }
        const input = names.flatMap((name) => [...doc.querySelectorAll(`input[name="${name}"]`)]).find((entry) => entry.value === resource) || doc.querySelector(`#${names[0]}_${resource}, [data-${kind}-resource="${resource}"]`);
        if (input) { input.click(); return true; } return false;
    };
    const errorMessage = (doc) => {
        if (doc.querySelector('form#login, input[name="password"]')) return 'Sessão expirada';
        const text = [...doc.querySelectorAll('.error, .error_box, .error-message, #error, .warn, .warning')].map((node) => node.textContent?.trim()).find(Boolean);
        if (!text) return null;
        const known = [/comerciante/i, /recurso/i, /proporção|proporcao/i, /limite.*oferta/i, /quantidade/i, /mercado.*indisponível|mercado.*indisponivel/i, /sessão|sessao/i];
        return known.some((pattern) => pattern.test(text)) ? text : `Erro do Mercado: ${text}`;
    };
    const snapshotOffers = (doc, expectedOffer = {}) => {
        const parsed = EAS.MarketEngine.parseMarketVillageDocument(doc, { id: expectedOffer.villageId || '' }); const rows = parsed.activeOfferList;
        const matchingRows = rows.filter((offer) => offer.offerResource === expectedOffer.offerResource && offer.requestResource === expectedOffer.requestResource && amount(offer.offerAmount) === amount(expectedOffer.offerAmount) && amount(offer.requestAmount) === amount(expectedOffer.requestAmount));
        return { offerCount: rows.length, matchingOffers: matchingRows.length, matchingQuantity: matchingRows.reduce((sum, offer) => sum + Math.max(1, amount(offer.repeatCount)), 0), rows, successMessages: [...doc.querySelectorAll('.success, .success_box, .success-message')].map((node) => node.textContent?.trim()).filter(Boolean) };
    };
    const detectOfferCreationSuccess = ({ document: doc, expectedOffer, previousSnapshot }) => {
        const currentSnapshot = snapshotOffers(doc, expectedOffer); const previous = previousSnapshot || { offerCount: 0, matchingOffers: 0, matchingQuantity: 0, successMessages: [] };
        const newCompatibleOffer = currentSnapshot.matchingOffers > previous.matchingOffers;
        const groupedQuantityIncreased = currentSnapshot.matchingQuantity > previous.matchingQuantity;
        const explicitSuccess = currentSnapshot.successMessages.some((message) => !previous.successMessages?.includes(message));
        if (!newCompatibleOffer && !groupedQuantityIncreased && !explicitSuccess) return { success: false, snapshot: currentSnapshot };
        const compatible = currentSnapshot.rows.find((offer) => offer.offerResource === expectedOffer.offerResource && offer.requestResource === expectedOffer.requestResource && amount(offer.offerAmount) === amount(expectedOffer.offerAmount) && amount(offer.requestAmount) === amount(expectedOffer.requestAmount));
        return { success: true, offerId: compatible?.offerId || null, detectedAmount: compatible?.offerAmount || expectedOffer.offerAmount, detectedQuantity: Math.max(1, currentSnapshot.matchingQuantity - previous.matchingQuantity || expectedOffer.repeatCount || 1), evidence: newCompatibleOffer ? 'new-compatible-offer' : groupedQuantityIncreased ? 'grouped-quantity-increased' : 'explicit-success', snapshot: currentSnapshot };
    };
    const classifyOfferResult = (doc, item, initialOfferCount = 0) => {
        const error = errorMessage(doc); if (error) return { status: 'error', error };
        const result = detectOfferCreationSuccess({ document: doc, expectedOffer: item, previousSnapshot: { offerCount: initialOfferCount, matchingOffers: 0, matchingQuantity: 0, successMessages: [] } });
        return result.success ? { status: 'created', offerId: result.offerId, evidence: result.evidence } : null;
    };
    const validateQueueItem = (item) => {
        const cache = EAS.MarketEngine.getCache(); const village = EAS.MarketEngine.cacheVillages(cache).find((entry) => String(entry.villageId) === String(item.villageId)); const reasons = [];
        if (!village?.available) reasons.push('Dados incompletos');
        if (Date.now() - Number(village?.updatedAt || 0) > 15 * 60 * 1000) reasons.push('Dados alterados ou desatualizados');
        if (!(item.offerAmount > 0) || !(item.requestAmount > 0) || !(item.repeatCount > 0) || item.offerResource === item.requestResource) reasons.push('Oferta inválida');
        if (village && EAS.MarketEngine.getAvailableResources(village)[item.offerResource] < item.totalOfferAmount) reasons.push('Recursos insuficientes');
        if (!(item.totalRequestAmount > 0)) reasons.push('Total solicitado inválido');
        if (village && item.repeatCount > village.merchants.available) reasons.push('Repetições acima dos comerciantes livres');
        if (village && village.merchants.available < item.merchantsRequired) reasons.push('Comerciantes insuficientes');
        return { valid: reasons.length === 0, reasons, village };
    };
    const prepareItem = async (context, targetWindow) => {
        syncIndex(context); const item = current(context); if (!item || getVillageId(targetWindow) !== String(item.villageId)) return { valid: false, message: 'Abra o Mercado da aldeia correta.' };
        const validation = validateQueueItem(item); if (!validation.valid) { item.status = 'error'; item.error = validation.reasons.join(', '); save(context); return { valid: false, message: item.error }; }
        const doc = targetWindow.document; const offerAmount = findField(doc, ['sell', 'offer_amount', 'amount_sell']); const requestAmount = findField(doc, ['buy', 'request_amount', 'amount_buy']); const repeatCount = findRepeatField(doc);
        if (!offerAmount || !requestAmount || !chooseResource(doc, 'offer', item.offerResource, targetWindow) || !chooseResource(doc, 'request', item.requestResource, targetWindow)) return { valid: false, message: 'Campos de criação de oferta não encontrados.' };
        const form = offerAmount.closest('form') || requestAmount.closest('form'); const submit = findSubmit(doc, form); if (submit) submit.disabled = true;
        if (!repeatCount) return { valid: false, message: 'Campo Quantas vezes oferecer não encontrado.' };
        setValue(offerAmount, item.amountPerOffer, targetWindow); setValue(requestAmount, item.requestAmountPerOffer, targetWindow);
        const duration = doc.querySelector('select[name="duration"], select[name="time"]'); if (duration?.options?.length) { duration.selectedIndex = duration.options.length - 1; duration.dispatchEvent(new targetWindow.Event('change', { bubbles: true })); }
        const repeatResult = await setOfferRepeatCount(doc, item, targetWindow); if (!repeatResult.valid) return repeatResult;
        if (Number(repeatCount.value) !== Number(item.repeatCount)) return { valid: false, message: `Não foi possível configurar a quantidade de repetições. Esperado: ${item.repeatCount}. Atual: ${repeatCount.value}.` };
        if (submit) submit.disabled = false; item.status = 'prepared'; item.error = null; item.repeatFillDiagnostics = repeatResult.diagnostics; item.previousSnapshot = snapshotOffers(doc, item); save(context);
        return { valid: true, item, form, submit, message: `Oferta preparada: ${item.repeatCount} × ${item.offerAmount} por ${item.requestAmount}. Clique em Criar no jogo.` };
    };
    const finishSuccess = (context, item, result, targetWindow) => {
        item.status = 'created'; item.createdAt = Date.now(); item.offerId = result.offerId; item.confirmation = { evidence: result.evidence, detectedAmount: result.detectedAmount, detectedQuantity: result.detectedQuantity };
        EAS.MarketEngine.applyCreatedOfferToCache(item); addHistory(item, 'created'); syncIndex(context); save(context);
        emit({ type: 'offer-created', executionId: context.executionId, queueItemId: item.id, villageId: item.villageId, offerResource: item.offerResource, offerAmount: item.offerAmount, requestResource: item.requestResource, requestAmount: item.requestAmount, repeatCount: item.repeatCount, createdAt: item.createdAt });
        try { EAS.MarketEngine.refreshCurrentMarketVillageFromPage(targetWindow.document, item.villageId); emit({ type: 'market-village-refreshed', executionId: context.executionId, villageId: item.villageId }); } catch { EAS.MarketEngine.refreshMarketVillage(item.villageId).then(() => emit({ type: 'market-village-refreshed', executionId: context.executionId, villageId: item.villageId })).catch(() => {}); }
        emit({ type: 'offer-queue-updated', executionId: context.executionId, currentIndex: context.currentIndex });
        if (!current(context)) emit({ type: 'offer-execution-finished', executionId: context.executionId });
        return current(context);
    };
    const getNextPendingOfferItem = (execution) => getCurrentPendingOfferItem(execution);
    const advanceMarketOfferExecution = async ({ context, item, result, targetWindow, render = () => {}, prepareNext = async () => {} }) => {
        const nextItem = finishSuccess(context, item, result, targetWindow); render('Oferta criada com sucesso.', 'success');
        await new Promise((resolve) => targetWindow.setTimeout(resolve, 700));
        if (!nextItem) {
            const villageIds = [...new Set(context.queue.filter((entry) => entry.status === 'created').map((entry) => entry.villageId))];
            Promise.allSettled(villageIds.map((villageId) => EAS.MarketEngine.refreshMarketVillage(villageId))).then(() => emit({ type: 'market-villages-refreshed', executionId: context.executionId, villageIds }));
            render('', 'success'); return { state: 'finished', nextItem: null };
        }
        if (getVillageId(targetWindow) === String(nextItem.villageId)) { render('Preparando próxima oferta...', 'info'); await prepareNext(); return { state: 'same-village', nextItem }; }
        render(`Abrindo próxima aldeia: ${nextItem.villageName}.`, 'info'); save(context); cleanupMarketOfferRuntime(targetWindow); targetWindow.location.assign(marketUrl(nextItem.villageId)); return { state: 'different-village', nextItem };
    };
    const finishError = (context, item, message, render) => { item.status = 'error'; item.error = message; addHistory(item, 'error', message); save(context); emit({ type: 'offer-error', executionId: context.executionId, queueItemId: item.id, error: message }); render(message, 'error'); };
    const mount = (targetWindow = window) => {
        const context = read(); if (!context) return false; syncIndex(context); const item = current(context); const url = new URL(targetWindow.location.href); const screen = url.searchParams.get('screen'); const mode = url.searchParams.get('mode');
        if (screen !== 'market' || mode !== 'own_offer') return false;
        const doc = targetWindow.document; const runtime = getRuntime(targetWindow); const existingPanel = doc.getElementById(PANEL_ID); if (runtime.initialized && existingPanel) return true; runtime.initialized = true; const correctVillage = !item || getVillageId(targetWindow) === String(item.villageId); let panel = existingPanel; if (!panel) { panel = doc.createElement('aside'); panel.id = PANEL_ID; panel.className = 'fake-execution-panel market-offers-execution-panel'; doc.body.appendChild(panel); } let observer = null; let timeout = null; let clickListener = null; let preparedSubmit = null; let submissionLocked = false;
        const stop = () => { observer?.disconnect(); observer = null; runtime.observer = null; clearTimeout(timeout); runtime.timers.delete(timeout); timeout = null; if (clickListener) { doc.removeEventListener('click', clickListener, true); clickListener = null; } };
        const render = (message = '', type = 'info') => {
            syncIndex(context); const active = current(context); const created = context.queue.filter((entry) => entry.status === 'created').length; const skipped = context.queue.filter((entry) => entry.status === 'skipped').length; const errors = context.queue.filter((entry) => ['error', 'verification-required'].includes(entry.status)).length; const sameVillage = active && getVillageId(targetWindow) === String(active.villageId); const finished = !active;
            panel.innerHTML = `<div class="fake-execution-header"><strong>Criação de Ofertas</strong></div><div class="fake-execution-content"><div class="fake-execution-summary"><div><strong>Aldeia</strong><span>${EAS.Utils.escapeHtml(active?.villageName || '-')}</span></div><div><strong>Oferta</strong><span>${active ? `${active.repeatCount} × ${active.offerAmount} ${active.offerResource} por ${active.requestAmount} ${active.requestResource}` : '-'}</span></div><div><strong>Total</strong><span>${active ? `${active.totalOfferAmount} por ${active.totalRequestAmount}` : '-'}</span></div><div><strong>Comerciantes</strong><span>${active?.merchantsRequired || 0}</span></div><div><strong>Progresso</strong><span>${created} de ${context.queue.length} concluídas</span></div><div><strong>Estado</strong><span>${finished ? 'Execução concluída' : !sameVillage ? 'Aldeia incorreta' : active.status}</span></div></div>${finished ? `<div class="eas-status eas-status--success">Execução concluída. Criadas: ${created}. Puladas: ${skipped}. Erros: ${errors}.</div>` : `<div class="eas-status eas-status--${type}">${EAS.Utils.escapeHtml(message || (!sameVillage ? 'A oferta atual pertence a outra aldeia.' : 'Carregando execução...'))}</div>`}<div class="fake-execution-actions" data-actions></div></div>`;
            const actions = panel.querySelector('[data-actions]'); const add = (text, handler, disabled = false) => { const button = doc.createElement('button'); button.className = 'eas-button'; button.textContent = text; button.disabled = disabled; button.onclick = handler; actions.appendChild(button); };
            add(active?.status === 'submitting' ? 'Criando...' : 'Criar esta oferta', () => submitCurrent(), submissionLocked || !active || !sameVillage || active.status !== 'prepared' || !preparedSubmit);
            add('Preparar novamente', () => arm(true), runtime.preparing || !active || !sameVillage || active.status === 'submitting');
            add(sameVillage ? 'Abrir próxima aldeia' : 'Abrir aldeia correta', () => openCurrent(context), !active || sameVillage);
            add('Repetir oferta com erro', () => { active.status = 'pending'; active.error = null; save(context); arm(); }, !active || !sameVillage || !['error', 'verification-required'].includes(active.status));
            add('Pular oferta', () => { active.status = 'skipped'; addHistory(active, 'skipped'); syncIndex(context); save(context); emit({ type: 'offer-queue-updated', executionId: context.executionId }); const next = current(context); if (next && getVillageId(targetWindow) === String(next.villageId)) arm(); else render(next ? `Próxima oferta: ${next.villageName}.` : '', 'info'); }, !active || active.status === 'submitting');
            add('Atualizar dados desta aldeia', () => { try { EAS.MarketEngine.refreshCurrentMarketVillageFromPage(doc, getVillageId(targetWindow)); render('Dados da aldeia atualizados.', 'success'); emit({ type: 'market-village-refreshed', executionId: context.executionId, villageId: getVillageId(targetWindow) }); } catch (error) { render(error.message, 'error'); } }, !active);
            add('Recalcular ofertas pendentes', () => recalculatePending(), !active);
            if (finished) add('Atualizar todos os dados', () => EAS.MarketEngine.refreshAllVillages().then(() => render('', 'success')));
            add('Voltar ao menu', () => EAS.UI?.toggle?.());
            add('Encerrar execução', () => { if (confirm('Encerrar a execução de ofertas?')) { stop(); cleanupMarketOfferRuntime(targetWindow); context.endedAt = Date.now(); context.queue.forEach((entry) => { if (!TERMINAL.has(entry.status)) entry.status = 'cancelled'; }); syncIndex(context); save(context); emit({ type: 'offer-execution-finished', executionId: context.executionId }); render('Execução encerrada.', 'info'); } });
        };
        const verify = () => {
            const active = current(context); if (!active || active.status !== 'submitting') return;
            const error = errorMessage(targetWindow.document); if (error) { stop(); submissionLocked = false; finishError(context, active, error, render); return; }
            const result = detectOfferCreationSuccess({ document: targetWindow.document, expectedOffer: active, previousSnapshot: active.previousSnapshot });
            if (result.success) { stop(); submissionLocked = false; advanceMarketOfferExecution({ context, item: active, result, targetWindow, render, prepareNext: arm }); }
        };
        const beginVerification = () => {
            const active = current(context); if (!active || active.status === 'submitting') return;
            active.previousSnapshot = active.previousSnapshot || snapshotOffers(doc, active); active.status = 'submitting'; active.submittedAt = Date.now(); save(context); render('Aguardando confirmação real do jogo...', 'info');
            observer = new targetWindow.MutationObserver(verify); runtime.observer = observer; observer.observe(doc.querySelector('#own_offers_table, #content_value, main') || doc.body, { childList: true, subtree: true, characterData: true });
            timeout = setTimeout(() => { stop(); submissionLocked = false; const pending = current(context); if (pending?.status === 'submitting') { pending.status = 'verification-required'; pending.error = 'Não foi possível confirmar automaticamente a criação da oferta.'; save(context); emit({ type: 'offer-verification-required', executionId: context.executionId, queueItemId: pending.id }); render(pending.error, 'error'); } }, 10000);
            runtime.timers.add(timeout);
        };
        const arm = async (force = false) => {
            const queueItem = current(context); if (!queueItem) return; const debug = localStorage.getItem('eas_tw_market_offers_debug') === 'true';
            if (force) { runtime.preparedItemId = null; runtime.preparing = false; runtime.paused = false; runtime.prepareAttempts.set(queueItem.id, []); }
            if (runtime.paused || runtime.preparing) return;
            if (!force && runtime.preparedItemId === queueItem.id && queueItem.status === 'prepared') { if (debug) console.debug('[EAS Offer Executor]', { event: 'prepare-skipped-already-prepared', itemId: queueItem.id }); return; }
            const attempt = registerPrepareAttempt(runtime, queueItem.id); if (!attempt.allowed) { cleanupMarketOfferRuntime(targetWindow); runtime.paused = true; render('Execução pausada por repetição inesperada. Nenhuma nova ação será realizada até você clicar em Preparar novamente.', 'error'); return; }
            runtime.preparing = true; queueItem.status = 'preparing'; save(context); if (debug) console.debug('[EAS Offer Executor]', { event: 'prepare-start', itemId: queueItem.id, status: queueItem.status });
            try {
                stop(); render('Aguardando o formulário do jogo estabilizar...', 'info'); const prepared = await prepareItem(context, targetWindow); const latest = current(context); if (!latest || latest.id !== queueItem.id) return;
                if (!prepared.valid) { runtime.preparing = false; render(prepared.message, 'error'); return; }
                runtime.preparedItemId = queueItem.id; preparedSubmit = prepared.submit; runtime.preparing = false; render('Oferta preparada.', 'success'); if (debug) console.debug('[EAS Offer Executor]', { event: 'prepare-finish', itemId: queueItem.id });
                clickListener = (event) => { const submit = event.target.closest?.('[name="create_offer"], button[type="submit"], input[type="submit"], [data-action="create-offer"]'); if (!submit || (prepared.form && submit.form && submit.form !== prepared.form)) return; doc.removeEventListener('click', clickListener, true); clickListener = null; beginVerification(); };
                doc.addEventListener('click', clickListener, true);
            } finally { runtime.preparing = false; }
        };
        const submitCurrent = () => {
            const active = current(context); if (submissionLocked || !active || active.status !== 'prepared' || !preparedSubmit) return;
            const repeatInput = findRepeatField(doc); const offerInput = findField(doc, ['sell', 'offer_amount', 'amount_sell']); const requestInput = findField(doc, ['buy', 'request_amount', 'amount_buy']);
            if (Number(repeatInput?.value) !== active.repeatCount || Number(offerInput?.value) !== active.amountPerOffer || Number(requestInput?.value) !== active.requestAmountPerOffer) { render('Os campos foram alterados. Prepare novamente antes de criar.', 'error'); return; }
            submissionLocked = true; active.previousSnapshot = snapshotOffers(doc, active); save(context); beginVerification(); preparedSubmit.click();
        };
        const recalculatePending = () => {
            let config = {}; try { config = JSON.parse(localStorage.getItem('eas_tw_market_offers_config') || '{}'); } catch {}
            const result = EAS.MarketEngine.buildGlobalOfferSuggestions(EAS.MarketEngine.cacheVillages(EAS.MarketEngine.getCache()), config); const preserved = context.queue.filter((entry) => TERMINAL.has(entry.status)); context.queue = [...preserved, ...result.suggestions.map(normalizeItem)]; context.currentIndex = preserved.length; syncIndex(context); save(context); emit({ type: 'offer-queue-updated', executionId: context.executionId }); render('Ofertas pendentes recalculadas.', 'success');
        };
        render();
        if (!item) render('', 'success');
        else if (!correctVillage) render('A oferta atual pertence a outra aldeia.', 'info');
        else if (item.status === 'submitting') { const result = detectOfferCreationSuccess({ document: doc, expectedOffer: item, previousSnapshot: item.previousSnapshot }); if (result.success) advanceMarketOfferExecution({ context, item, result, targetWindow, render, prepareNext: arm }); else { item.status = 'verification-required'; item.error = 'A página foi recarregada durante o envio. Confirme a oferta antes de repetir.'; save(context); render(item.error, 'error'); } }
        else if (['pending', 'opening', 'prepared'].includes(item.status)) arm();
        return true;
    };
    EAS.MarketOffersExecution.start = (context) => { const queue = (context.queue || []).map((item) => normalizeItem({ ...item, status: 'pending', error: null })); const normalized = { ...context, version: EXECUTION_VERSION, executionId: context.executionId || `market-${Date.now()}-${Math.random().toString(36).slice(2)}`, world: EAS.World.getWorldName(), createdAt: Date.now(), currentIndex: 0, queue }; if (localStorage.getItem('eas_tw_market_offers_debug') === 'true') queue.forEach((queueItem, index) => console.debug('[EAS Offer Flow]', { suggestion: context.queue[index], queue: { repeatCount: queueItem.repeatCount, merchantsRequired: queueItem.merchantsRequired, merchantsAvailable: queueItem.merchantsAvailable } })); syncIndex(normalized); save(normalized); emit({ type: 'execution-started', executionId: normalized.executionId }); openCurrent(normalized); return true; };
    const initializeMarketOfferExecutionIfNeeded = (targetWindow = window) => { const execution = read(); const item = getCurrentPendingOfferItem(execution); if (!execution || (!item && !execution.queue?.length)) return false; const url = new URL(targetWindow.location.href); if (url.searchParams.get('screen') !== 'market' || url.searchParams.get('mode') !== 'own_offer') return false; return mount(targetWindow); };
    EAS.MarketOffersExecution.initialize = () => initializeMarketOfferExecutionIfNeeded(window);
    Object.assign(EAS.MarketOffersExecution, { STORAGE_KEY, CHANNEL_NAME, EXECUTION_VERSION, PANEL_ID, read, save, remove, current, getCurrentPendingOfferItem, getNextPendingOfferItem, syncIndex, nextPendingIndex, normalizeItem, getRuntime, cleanupMarketOfferRuntime, registerPrepareAttempt, injectLoader, watchExecutionWindow, openCurrent, mount, initializeMarketOfferExecutionIfNeeded, validateQueueItem, prepareItem, findRepeatField, fillRepeatCount, setOfferRepeatCount, snapshotOffers, detectOfferCreationSuccess, classifyOfferResult, errorMessage, finishSuccess, advanceMarketOfferExecution, finishError });
})();
