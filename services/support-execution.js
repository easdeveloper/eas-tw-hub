(() => {
    'use strict';
    EAS.SupportExecution = EAS.SupportExecution || {};
    const STORAGE_KEY = 'eas_tw_support_execution';
    const PANEL_ID = 'eas-support-execution-panel';

    const save = (context) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(context)); return true; } catch { return false; } };
    const read = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } };
    const remove = () => { try { localStorage.removeItem(STORAGE_KEY); } catch {} };
    const current = (context) => context.queue?.[context.currentIndex] || null;
    const screenVillage = (targetWindow) => Number(new URL(targetWindow.location.href).searchParams.get('village') || targetWindow.game_data?.village?.id || 0);
    const findUnitInput = (form, unit) => form.querySelector(`input[name="${unit}"], input[name="unit_${unit}"], #unit_input_${unit}`);
    const setValue = (input, value, targetWindow) => {
        const setter = Object.getOwnPropertyDescriptor(targetWindow.HTMLInputElement.prototype, 'value')?.set;
        setter ? setter.call(input, String(value)) : input.value = String(value);
        input.dispatchEvent(new targetWindow.Event('input', { bubbles: true })); input.dispatchEvent(new targetWindow.Event('change', { bubbles: true }));
    };
    const prepare = (context, targetWindow) => {
        const entry = current(context); const form = EAS.Place.getCommandForm(targetWindow.document);
        if (!entry || screenVillage(targetWindow) !== Number(entry.villageId)) return { valid: false, message: 'Abra a aldeia de origem correta.' };
        const validation = EAS.CommandRules?.validateCommandComposition?.({ world: EAS.CommandRules.getWorld(), villageId: entry.villageId, villageCoord: entry.villageCoord, commandType: 'support', troops: entry.troops }) || { valid: true };
        if (!validation.valid) return { valid: false, message: `Composição inválida: ${validation.reasons.map((reason) => `${reason.type} ${reason.current}/${reason.required}`).join(', ')}.` };
        if (!form || !EAS.Place.fillCommandTarget(entry.target, targetWindow)) return { valid: false, message: 'Formulário ou destino indisponível.' };
        for (const [unit, amount] of Object.entries(entry.troops || {}).filter(([, value]) => Number(value) > 0)) {
            const input = findUnitInput(form, unit); if (!input) return { valid: false, message: `Campo de tropa indisponível: ${unit}.` }; setValue(input, amount, targetWindow);
        }
        entry.status = 'prepared'; save(context); return { valid: true, form, entry };
    };
    const supportButton = (form) => ['button[name="support"]', 'input[name="support"]', '#target_support', '[data-command="support"]']
        .map((selector) => form?.querySelector(selector)).find(Boolean) || null;
    const isConfirmation = (doc) => Boolean(doc.querySelector('#command-confirm-form, form[action*="action=command"]'));
    const openEntry = (context) => {
        const entry = current(context); if (!entry) return Promise.resolve(false);
        save(context); return EAS.Place.openAndFillTarget({ villageId: entry.villageId, coordinate: entry.target });
    };

    const mount = (targetWindow = window) => {
        const context = read(); const entry = current(context || {});
        if (!context || !entry || EAS.World.getScreen().screen !== 'place' || screenVillage(targetWindow) !== Number(entry.villageId)) return false;
        const doc = targetWindow.document; doc.getElementById(PANEL_ID)?.remove();
        const panel = doc.createElement('aside'); panel.id = PANEL_ID; panel.className = 'fake-execution-panel support-execution-panel';
        let watcher = null;
        let watcherTimer = null;
        let watcherPoll = null;
        const stopWatcher = () => { watcher?.disconnect(); watcher = null; clearTimeout(watcherTimer); clearInterval(watcherPoll); watcherTimer = null; watcherPoll = null; };
        const render = (message = '', type = 'info') => {
            const item = current(context); panel.innerHTML = '';
            const header = doc.createElement('div'); header.className = 'fake-execution-header'; header.innerHTML = '<strong>🛡️ Execução de Apoios</strong>';
            const close = doc.createElement('button'); close.className = 'fake-execution-close'; close.textContent = '×'; close.onclick = () => { stopWatcher(); panel.remove(); }; header.appendChild(close); panel.appendChild(header);
            const content = doc.createElement('div'); content.className = 'fake-execution-content';
            const troops = item ? Object.entries(item.troops || {}).filter(([, amount]) => amount > 0).map(([unit, amount]) => `${amount} ${unit}`).join(', ') : '-';
            content.innerHTML = `<div class="fake-execution-summary"><div><strong>Origem</strong><span>${EAS.Utils.escapeHtml(item?.villageName || '-')}<br>${EAS.Utils.escapeHtml(item?.villageCoord || '-')}</span></div><div><strong>Destino</strong><span>${EAS.Utils.escapeHtml(item?.target || 'Concluído')}</span></div><div><strong>Envio planejado</strong><span>${EAS.Utils.formatDateTime(item?.sendTime)}</span></div><div><strong>Chegada</strong><span>${EAS.Utils.formatDateTime(item?.arrivalTime)}</span></div><div><strong>Progresso</strong><span>${Math.min(context.currentIndex + 1, context.queue.length)} de ${context.queue.length}</span></div></div><div class="fake-execution-troops"><strong>Tropas</strong><p>${EAS.Utils.escapeHtml(troops)}</p></div><div class="eas-status eas-status--${type}">${EAS.Utils.escapeHtml(message || (item ? 'Apoio aguardando ação manual.' : 'Fila concluída.'))}</div>`;
            const actions = doc.createElement('div'); actions.className = 'fake-execution-actions';
            const add = (text, handler, disabled = false) => { const button = doc.createElement('button'); button.className = 'eas-button'; button.textContent = text; button.disabled = disabled; button.onclick = handler; actions.appendChild(button); };
            add('Preparar', () => { const result = prepare(context, targetWindow); render(result.valid ? 'Destino e tropas preparados. Nada foi enviado.' : result.message, result.valid ? 'success' : 'error'); }, !item);
            add('Enviar apoio', () => {
                const result = prepare(context, targetWindow); const button = result.valid ? supportButton(result.form) : null;
                if (!button) { render(result.message || 'Botão Enviar apoio não encontrado.', 'error'); return; }
                result.entry.status = 'forwarding'; save(context); render('Encaminhando apoio; aguardando confirmação do jogo.', 'info');
                const inspect = () => { if (!isConfirmation(targetWindow.document)) return; stopWatcher(); result.entry.status = 'forwarded'; context.completed = [...(context.completed || []), context.currentIndex]; context.currentIndex += 1; save(context); render('Apoio encaminhado à confirmação. O próximo item não foi preparado.', 'success'); };
                stopWatcher(); watcher = new targetWindow.MutationObserver(inspect); watcher.observe(targetWindow.document.body, { childList: true, subtree: true }); button.click();
                watcherPoll = setInterval(inspect, 250);
                watcherTimer = setTimeout(() => { if (watcher) { stopWatcher(); result.entry.status = 'pending'; save(context); render('Não foi possível confirmar o avanço; o item foi mantido.', 'error'); } }, 10000);
            }, !item);
            add('Pular', () => { if (item) { item.status = 'skipped'; context.skipped = [...(context.skipped || []), context.currentIndex]; context.currentIndex += 1; save(context); render('Item pulado.', 'info'); } }, !item);
            add('Voltar', () => { context.currentIndex = Math.max(0, context.currentIndex - 1); save(context); render('Retornou um item.', 'info'); }, context.currentIndex < 1);
            add('Abrir aldeia', () => openEntry(context), !item);
            add('Encerrar', () => { stopWatcher(); remove(); panel.remove(); });
            content.appendChild(actions); panel.appendChild(content);
        };
        doc.body.appendChild(panel); render(); return true;
    };

    EAS.SupportExecution.start = (context) => { const normalized = { ...context, commandType: 'support', queue: (context.queue || []).map((entry) => ({ ...entry, villageId: Number(entry.villageId || entry.sourceVillageId), status: entry.status || 'pending' })) }; save(normalized); return openEntry(normalized); };
    EAS.SupportExecution.initialize = () => mount(window);
    EAS.SupportExecution.mount = mount;
    EAS.SupportExecution.read = read;
})();
