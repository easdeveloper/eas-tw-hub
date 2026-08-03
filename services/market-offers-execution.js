(() => {
    'use strict';
    EAS.MarketOffersExecution = EAS.MarketOffersExecution || {};
    const STORAGE_KEY = 'eas_tw_market_offers_execution';
    const HISTORY_KEY = 'eas_tw_market_offers_history';
    const CHANNEL_NAME = 'eas_tw_market_offers_channel';
    const PANEL_ID = 'eas-market-offers-panel';
    const TERMINAL = new Set(['created', 'skipped']);
    const amount = (value) => Math.max(0, Math.floor(Number(value) || 0));
    const read = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } };
    const save = (context) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(context)); return true; } catch { return false; } };
    const remove = () => { try { localStorage.removeItem(STORAGE_KEY); } catch {} };
    const emit = (message) => { try { const channel = new BroadcastChannel(CHANNEL_NAME); channel.postMessage(message); channel.close(); } catch {} };
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
    const getVillageId = (targetWindow) => String(new URL(targetWindow.location.href).searchParams.get('village') || targetWindow.game_data?.village?.id || '');
    const marketUrl = (villageId) => { const url = new URL('/game.php', location.origin); url.searchParams.set('village', villageId); url.searchParams.set('screen', 'market'); url.searchParams.set('mode', 'own_offer'); return url; };
    const openCurrent = (context) => {
        syncIndex(context); const item = current(context); if (!item) return false;
        item.status = item.status === 'error' || item.status === 'verification-required' ? item.status : 'opening'; context.popupName = `eas-market-offer-${context.executionId}`; save(context);
        return Boolean(window.open(marketUrl(item.villageId), context.popupName));
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
        targetWindow.setTimeout?.(() => { if (doc.contains(multiInput) && Number(multiInput.value) !== repeatCount) apply(); }, 0);
        if (debug) console.debug('[EAS Market Offer]', { fieldAfter: multiInput.value });
        return { valid: Number(multiInput.value) === repeatCount, input: multiInput, repeatCount, message: Number(multiInput.value) === repeatCount ? null : 'Não foi possível preencher Quantas vezes oferecer.' };
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
    const prepareItem = (context, targetWindow) => {
        syncIndex(context); const item = current(context); if (!item || getVillageId(targetWindow) !== String(item.villageId)) return { valid: false, message: 'Abra o Mercado da aldeia correta.' };
        const validation = validateQueueItem(item); if (!validation.valid) { item.status = 'error'; item.error = validation.reasons.join(', '); save(context); return { valid: false, message: item.error }; }
        const doc = targetWindow.document; const offerAmount = findField(doc, ['sell', 'offer_amount', 'amount_sell']); const requestAmount = findField(doc, ['buy', 'request_amount', 'amount_buy']); const repeatCount = findRepeatField(doc);
        if (!offerAmount || !requestAmount || !chooseResource(doc, 'offer', item.offerResource, targetWindow) || !chooseResource(doc, 'request', item.requestResource, targetWindow)) return { valid: false, message: 'Campos de criação de oferta não encontrados.' };
        if (!repeatCount) return { valid: false, message: 'Campo Quantas vezes oferecer não encontrado.' };
        setValue(offerAmount, item.amountPerOffer, targetWindow); setValue(requestAmount, item.requestAmountPerOffer, targetWindow); const repeatResult = fillRepeatCount(doc, item, targetWindow); if (!repeatResult.valid) return repeatResult;
        item.status = 'prepared'; item.error = null; item.previousSnapshot = snapshotOffers(doc, item); save(context);
        const form = offerAmount.closest('form') || requestAmount.closest('form'); return { valid: true, item, form, submit: findSubmit(doc, form), message: `Oferta preparada: ${item.repeatCount} × ${item.offerAmount} por ${item.requestAmount}. Clique em Criar no jogo.` };
    };
    const finishSuccess = (context, item, result, targetWindow, render) => {
        item.status = 'created'; item.createdAt = Date.now(); item.offerId = result.offerId; item.confirmation = { evidence: result.evidence, detectedAmount: result.detectedAmount, detectedQuantity: result.detectedQuantity };
        EAS.MarketEngine.applyCreatedOfferToCache(item); addHistory(item, 'created'); syncIndex(context); save(context);
        emit({ type: 'offer-created', executionId: context.executionId, queueItemId: item.id, villageId: item.villageId, offerResource: item.offerResource, offerAmount: item.offerAmount, requestResource: item.requestResource, requestAmount: item.requestAmount, repeatCount: item.repeatCount, createdAt: item.createdAt });
        EAS.MarketEngine.refreshMarketVillage(item.villageId).then(() => emit({ type: 'village-refreshed', executionId: context.executionId, villageId: item.villageId })).catch(() => {});
        render('Oferta criada e confirmada pelo jogo. Esta janela será fechada.', 'success');
        setTimeout(() => { try { targetWindow.opener?.focus(); } catch {} if (targetWindow.name === context.popupName) { targetWindow.close(); setTimeout(() => { if (!targetWindow.closed) render('Oferta criada. Use “Fechar e continuar”.', 'success', true); }, 250); } else render('Oferta criada. Use “Fechar e continuar”.', 'success', true); }, 700);
    };
    const finishError = (context, item, message, render) => { item.status = 'error'; item.error = message; addHistory(item, 'error', message); save(context); emit({ type: 'offer-error', executionId: context.executionId, queueItemId: item.id, error: message }); render(message, 'error'); };
    const mount = (targetWindow = window) => {
        const context = read(); if (!context) return false; syncIndex(context); const item = current(context); const screen = new URL(targetWindow.location.href).searchParams.get('screen');
        if (!item || screen !== 'market' || getVillageId(targetWindow) !== String(item.villageId)) return false;
        const doc = targetWindow.document; doc.getElementById(PANEL_ID)?.remove(); const panel = doc.createElement('aside'); panel.id = PANEL_ID; panel.className = 'fake-execution-panel market-offers-execution-panel'; let observer = null; let timeout = null; let clickListener = null;
        const stop = () => { observer?.disconnect(); observer = null; clearTimeout(timeout); timeout = null; if (clickListener) { doc.removeEventListener('click', clickListener, true); clickListener = null; } };
        const render = (message = '', type = 'info', showCloseContinue = false) => {
            const active = current(context); panel.innerHTML = `<div class="fake-execution-header"><strong>Criação de Ofertas</strong><button class="fake-execution-close">×</button></div><div class="fake-execution-content"><div class="fake-execution-summary"><div><strong>Aldeia</strong><span>${EAS.Utils.escapeHtml(active?.villageName || '-')}</span></div><div><strong>Oferta</strong><span>${active ? `${active.repeatCount} × ${active.offerAmount} ${active.offerResource} por ${active.requestAmount} ${active.requestResource}` : 'Fila concluída'}</span></div><div><strong>Total</strong><span>${active ? `${active.totalOfferAmount} por ${active.totalRequestAmount}` : '-'}</span></div><div><strong>Progresso</strong><span>${context.queue.filter((entry) => entry.status === 'created').length} de ${context.queue.length}</span></div></div><div class="eas-status eas-status--${type}">${EAS.Utils.escapeHtml(message || 'Prepare a oferta e clique manualmente em Criar no jogo.')}</div><div class="fake-execution-actions" data-actions></div></div>`;
            panel.querySelector('.fake-execution-close').onclick = () => panel.remove(); const actions = panel.querySelector('[data-actions]');
            const add = (text, handler, disabled = false) => { const button = doc.createElement('button'); button.className = 'eas-button'; button.textContent = text; button.disabled = disabled; button.onclick = handler; actions.appendChild(button); };
            add('Preparar oferta', () => arm(), !active || active.status === 'submitting');
            add('Repetir oferta com erro', () => { active.status = 'pending'; active.error = null; save(context); arm(); }, !active || !['error', 'verification-required'].includes(active.status));
            add('Pular oferta', () => { active.status = 'skipped'; addHistory(active, 'skipped'); syncIndex(context); save(context); emit({ type: 'queue-updated', executionId: context.executionId }); render('Oferta pulada. Volte ao painel para abrir a próxima.', 'info'); }, !active || active.status === 'submitting');
            add('Atualizar dados desta aldeia', () => EAS.MarketEngine.refreshMarketVillage(active.villageId).then(() => render('Dados da aldeia atualizados.', 'success')).catch((error) => render(error.message, 'error')), !active);
            if (showCloseContinue) add('Fechar e continuar', () => { try { targetWindow.opener?.focus(); } catch {} targetWindow.close(); });
            add('Encerrar execução', () => { if (confirm('Encerrar a execução de ofertas?')) { stop(); context.endedAt = Date.now(); save(context); emit({ type: 'execution-ended', executionId: context.executionId }); panel.remove(); } });
        };
        const verify = () => {
            const active = current(context); if (!active || active.status !== 'submitting') return;
            const error = errorMessage(targetWindow.document); if (error) { stop(); finishError(context, active, error, render); return; }
            const result = detectOfferCreationSuccess({ document: targetWindow.document, expectedOffer: active, previousSnapshot: active.previousSnapshot });
            if (result.success) { stop(); finishSuccess(context, active, result, targetWindow, render); }
        };
        const beginVerification = () => {
            const active = current(context); if (!active || active.status === 'submitting') return;
            active.previousSnapshot = active.previousSnapshot || snapshotOffers(doc, active); active.status = 'submitting'; active.submittedAt = Date.now(); save(context); render('Aguardando confirmação real do jogo...', 'info');
            observer = new targetWindow.MutationObserver(verify); observer.observe(doc.querySelector('#own_offers_table, #content_value, main') || doc.body, { childList: true, subtree: true, characterData: true });
            timeout = setTimeout(() => { stop(); const pending = current(context); if (pending?.status === 'submitting') { pending.status = 'verification-required'; pending.error = 'Não foi possível confirmar automaticamente a criação da oferta.'; save(context); emit({ type: 'offer-verification-required', executionId: context.executionId, queueItemId: pending.id }); render(pending.error, 'error'); } }, 10000);
        };
        const arm = () => {
            stop(); const prepared = prepareItem(context, targetWindow); if (!prepared.valid) { render(prepared.message, 'error'); return; }
            render(prepared.message, 'success');
            clickListener = (event) => { const submit = event.target.closest?.('[name="create_offer"], button[type="submit"], input[type="submit"], [data-action="create-offer"]'); if (!submit || (prepared.form && submit.form && submit.form !== prepared.form)) return; doc.removeEventListener('click', clickListener, true); clickListener = null; beginVerification(); };
            doc.addEventListener('click', clickListener, true);
        };
        doc.body.appendChild(panel); render();
        if (item.status === 'submitting' && item.previousSnapshot) { observer = new targetWindow.MutationObserver(verify); observer.observe(doc.querySelector('#own_offers_table, #content_value, main') || doc.body, { childList: true, subtree: true, characterData: true }); timeout = setTimeout(() => { stop(); item.status = 'verification-required'; item.error = 'Não foi possível confirmar automaticamente a criação da oferta.'; save(context); render(item.error, 'error'); }, 10000); setTimeout(verify, 0); }
        else if (['pending', 'opening', 'prepared'].includes(item.status)) arm();
        return true;
    };
    EAS.MarketOffersExecution.start = (context) => { const normalized = { version: 2, executionId: context.executionId || `market-${Date.now()}-${Math.random().toString(36).slice(2)}`, world: EAS.World.getWorldName(), createdAt: Date.now(), currentIndex: 0, ...context, queue: (context.queue || []).map((item) => normalizeItem({ ...item, status: 'pending', error: null })) }; syncIndex(normalized); save(normalized); emit({ type: 'execution-started', executionId: normalized.executionId }); openCurrent(normalized); return true; };
    EAS.MarketOffersExecution.initialize = () => mount(window);
    Object.assign(EAS.MarketOffersExecution, { STORAGE_KEY, CHANNEL_NAME, read, save, remove, current, syncIndex, nextPendingIndex, normalizeItem, openCurrent, mount, validateQueueItem, prepareItem, findRepeatField, fillRepeatCount, snapshotOffers, detectOfferCreationSuccess, classifyOfferResult, errorMessage, finishError });
})();
