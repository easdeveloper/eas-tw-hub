(() => {
    'use strict';
    EAS.MarketOffersExecution = EAS.MarketOffersExecution || {};
    const STORAGE_KEY = 'eas_tw_market_offers_execution';
    const HISTORY_KEY = 'eas_tw_market_offers_history';
    const PANEL_ID = 'eas-market-offers-panel';
    const read = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } };
    const save = (context) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(context)); return true; } catch { return false; } };
    const remove = () => { try { localStorage.removeItem(STORAGE_KEY); } catch {} };
    const addHistory = (item, result, error = null) => { try { const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); history.unshift({ executedAt: Date.now(), villageId: item.villageId, offerResource: item.offerResource, offerAmount: item.offerAmount, requestResource: item.requestResource, requestAmount: item.requestAmount, result, error }); localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 200))); } catch {} };
    const current = (context) => context.queue?.[context.currentIndex] || null;
    const getVillageId = (targetWindow) => String(new URL(targetWindow.location.href).searchParams.get('village') || targetWindow.game_data?.village?.id || '');
    const marketUrl = (villageId) => { const url = new URL('/game.php', location.origin); url.searchParams.set('village', villageId); url.searchParams.set('screen', 'market'); url.searchParams.set('mode', 'own_offer'); return url; };
    const openCurrent = (context) => { const item = current(context); if (!item) return false; item.status = 'opening'; save(context); return Boolean(window.open(marketUrl(item.villageId), '_blank')); };
    const setValue = (input, value, targetWindow) => { const setter = Object.getOwnPropertyDescriptor(targetWindow.HTMLInputElement.prototype, 'value')?.set; setter ? setter.call(input, String(value)) : input.value = String(value); input.dispatchEvent(new targetWindow.Event('input', { bubbles: true })); input.dispatchEvent(new targetWindow.Event('change', { bubbles: true })); };
    const findField = (doc, names) => names.map((name) => doc.querySelector(`[name="${name}"], #${name}, [data-field="${name}"]`)).find(Boolean) || null;
    const chooseResource = (doc, kind, resource) => {
        const names = kind === 'offer' ? ['res_sell', 'sell_resource', 'offer_resource'] : ['res_buy', 'buy_resource', 'request_resource'];
        const select = names.map((name) => doc.querySelector(`select[name="${name}"], select#${name}`)).find(Boolean);
        if (select) { select.value = resource; select.dispatchEvent(new Event('change', { bubbles: true })); return select.value === resource; }
        const input = names.flatMap((name) => [...doc.querySelectorAll(`input[name="${name}"]`)]).find((item) => item.value === resource) || doc.querySelector(`#${names[0]}_${resource}, [data-${kind}-resource="${resource}"]`);
        if (input) { input.click(); return true; }
        return false;
    };
    const validateQueueItem = (item) => {
        const cache = EAS.MarketEngine.getCache(); const village = EAS.MarketEngine.cacheVillages(cache).find((entry) => String(entry.villageId) === String(item.villageId)); const reasons = [];
        if (!village?.available) reasons.push('Dados incompletos');
        if (Date.now() - Number(village?.updatedAt || 0) > 15 * 60 * 1000) reasons.push('Dados alterados ou desatualizados');
        if (!(item.offerAmount > 0) || !(item.requestAmount > 0) || item.offerResource === item.requestResource) reasons.push('Oferta inválida');
        if (village && EAS.MarketEngine.getAvailableResources(village)[item.offerResource] < item.offerAmount) reasons.push('Recursos insuficientes');
        if (village && village.merchants.available < item.merchantsRequired) reasons.push('Comerciantes insuficientes');
        if (village?.activeOfferList?.some((offer) => offer.offerResource === item.offerResource && offer.requestResource === item.requestResource && offer.offerAmount === item.offerAmount && offer.requestAmount === item.requestAmount)) reasons.push('Oferta duplicada');
        return { valid: reasons.length === 0, reasons, village };
    };
    const prepareItem = (context, targetWindow) => {
        const item = current(context); if (!item || getVillageId(targetWindow) !== String(item.villageId)) return { valid: false, message: 'Abra o Mercado da aldeia correta.' };
        const validation = validateQueueItem(item); if (!validation.valid) { item.status = 'error'; item.error = validation.reasons.join(', '); save(context); return { valid: false, message: item.error }; }
        const doc = targetWindow.document; const offerAmount = findField(doc, ['sell', 'offer_amount', 'amount_sell']); const requestAmount = findField(doc, ['buy', 'request_amount', 'amount_buy']);
        if (!offerAmount || !requestAmount || !chooseResource(doc, 'offer', item.offerResource) || !chooseResource(doc, 'request', item.requestResource)) return { valid: false, message: 'Campos de criação de oferta não encontrados.' };
        setValue(offerAmount, item.offerAmount, targetWindow); setValue(requestAmount, item.requestAmount, targetWindow); item.status = 'prepared'; item.error = null; save(context); return { valid: true, item, form: offerAmount.closest('form') || requestAmount.closest('form'), message: 'Oferta preparada. Nada foi criado.' };
    };
    const classifyOfferResult = (doc, item, initialOfferCount = 0) => {
        const error = doc.querySelector('.error, .error_box, .error-message, #error'); const errorText = error?.textContent?.trim();
        if (errorText) return { status: 'error', error: errorText };
        const success = doc.querySelector('.success, .success_box, .success-message');
        const rows = [...doc.querySelectorAll('#own_offers_table tr[data-offer-id], [data-own-offer], .own_offer')];
        const matching = rows.find((row) => row.dataset.offerResource === item.offerResource && row.dataset.requestResource === item.requestResource && Number(row.dataset.offerAmount) === Number(item.offerAmount));
        if (success?.textContent?.trim() || matching || rows.length > initialOfferCount) return { status: 'created', offerId: matching?.dataset.offerId || null };
        return null;
    };

    const mount = (targetWindow = window) => {
        const context = read(); const item = current(context || {}); const screen = new URL(targetWindow.location.href).searchParams.get('screen');
        if (!context || !item || screen !== 'market' || getVillageId(targetWindow) !== String(item.villageId)) return false;
        const doc = targetWindow.document; doc.getElementById(PANEL_ID)?.remove(); const panel = doc.createElement('aside'); panel.id = PANEL_ID; panel.className = 'fake-execution-panel market-offers-execution-panel'; let observer = null; let poll = null; let timeout = null;
        const stop = () => { observer?.disconnect(); observer = null; clearInterval(poll); clearTimeout(timeout); poll = null; timeout = null; };
        const render = (message = '', type = 'info') => {
            const active = current(context); panel.innerHTML = `<div class="fake-execution-header"><strong>🔄 Criação de Ofertas</strong><button class="fake-execution-close">×</button></div><div class="fake-execution-content"><div class="fake-execution-summary"><div><strong>Aldeia</strong><span>${EAS.Utils.escapeHtml(active?.villageName || '-')}</span></div><div><strong>Oferta</strong><span>${active ? `${active.offerAmount} ${active.offerResource} por ${active.requestAmount} ${active.requestResource}` : 'Fila concluída'}</span></div><div><strong>Comerciantes</strong><span>${active?.merchantsRequired || 0}</span></div><div><strong>Progresso</strong><span>${Math.min(context.currentIndex + 1, context.queue.length)} de ${context.queue.length}</span></div></div><div class="eas-status eas-status--${type}">${EAS.Utils.escapeHtml(message || 'Revise e crie somente a oferta atual.')}</div><div class="fake-execution-actions" data-actions></div></div>`;
            panel.querySelector('.fake-execution-close').onclick = () => { stop(); panel.remove(); }; const actions = panel.querySelector('[data-actions]');
            const add = (text, handler, disabled = false) => { const button = doc.createElement('button'); button.className = 'eas-button'; button.textContent = text; button.disabled = disabled; button.onclick = handler; actions.appendChild(button); };
            add('Preparar', () => { const result = prepareItem(context, targetWindow); render(result.message, result.valid ? 'success' : 'error'); }, !active);
            add('Criar próxima oferta', () => {
                const prepared = prepareItem(context, targetWindow); if (!prepared.valid) { render(prepared.message, 'error'); return; }
                const submit = prepared.form?.querySelector('[name="create_offer"], button[type="submit"], input[type="submit"], [data-action="create-offer"]'); if (!submit) { render('Botão de criar oferta não encontrado.', 'error'); return; }
                const initialCount = doc.querySelectorAll('#own_offers_table tr[data-offer-id], [data-own-offer], .own_offer').length; prepared.item.status = 'submitting'; save(context); render('Aguardando confirmação real do jogo...', 'info');
                const inspect = () => { const result = classifyOfferResult(targetWindow.document, prepared.item, initialCount); if (!result) return; stop(); if (result.status === 'created') { prepared.item.status = 'created'; prepared.item.createdAt = Date.now(); prepared.item.offerId = result.offerId; addHistory(prepared.item, 'created'); context.currentIndex += 1; save(context); render('Oferta criada e confirmada pelo jogo.', 'success'); } else { prepared.item.status = 'error'; prepared.item.error = result.error; addHistory(prepared.item, 'error', result.error); save(context); render(result.error, 'error'); } };
                stop(); observer = new targetWindow.MutationObserver(inspect); observer.observe(doc.body, { childList: true, subtree: true }); poll = setInterval(inspect, 250); timeout = setTimeout(() => { stop(); prepared.item.status = 'error'; prepared.item.error = 'Resultado não confirmado.'; save(context); render(prepared.item.error, 'error'); }, 10000); submit.click();
            }, !active);
            add('Repetir', () => { if (active) { active.status = 'pending'; active.error = null; save(context); render('Item liberado para nova tentativa.', 'info'); } }, !active || active.status !== 'error');
            add('Pular', () => { if (active) { active.status = 'skipped'; addHistory(active, 'skipped'); context.currentIndex += 1; save(context); render('Oferta pulada.', 'info'); } }, !active);
            add('Abrir aldeia', () => openCurrent(context), !active);
            add('Cancelar fila', () => { if (confirm('Cancelar a fila de ofertas?')) { stop(); remove(); panel.remove(); } });
            if (!active && !context.refreshStarted) {
                context.refreshStarted = true; save(context);
                EAS.MarketEngine.refreshAllVillages({ delayMs: 250 }).then(() => {
                    context.refreshedAt = Date.now(); save(context);
                    render('Fila concluída. Dados do Mercado atualizados.', 'success');
                }).catch(() => render('Fila concluída, mas a atualização dos dados falhou.', 'error'));
            }
        };
        doc.body.appendChild(panel); render(); return true;
    };
    EAS.MarketOffersExecution.start = (context) => { const normalized = { version: 1, world: EAS.World.getWorldName(), createdAt: Date.now(), currentIndex: 0, ...context, queue: (context.queue || []).map((item) => ({ ...item, status: 'pending', error: null })) }; save(normalized); openCurrent(normalized); return true; };
    EAS.MarketOffersExecution.initialize = () => mount(window);
    Object.assign(EAS.MarketOffersExecution, { read, mount, validateQueueItem, prepareItem, classifyOfferResult });
})();
