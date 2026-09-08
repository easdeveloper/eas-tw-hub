(() => {
    'use strict';
    EAS.Modules ||= {};
    let opening = null;
    let cleanup = null;
    const open = async () => {
        if (!EAS.Adapters.Minting) await EASLoader.loadScript('services/minting-adapter.js');
        if (!EAS.Minting) await EASLoader.loadScript('services/minting.js');
        cleanup?.();
        const service = EAS.Minting, controller = service.getController();
        const win = EAS.UI.createWindow({ id: 'eas-minting', title: 'Cunhagem', icon: '🪙', width: 700 });
        const runtime = EAS.Runtime.create({ id: 'minting-ui', type: 'minting-ui' });
        const escape = EAS.Utils.escapeHtml;
        win.body.innerHTML = `
            <p>TOTAL DE MOEDAS: <strong data-total>0</strong></p>
            <p class="eas-status eas-status--warning" data-blocked></p>
            <div class="eas-field"><label>Grupo de aldeias: <select data-group><option value="">Selecione um grupo</option></select></label></div>
            <button type="button" class="eas-button" data-refresh>Atualizar grupos</button>
            <div class="eas-field"><label>Quantidade por aldeia: <input data-amount type="number" min="1" step="1"></label></div>
            <div class="eas-field"><label>Intervalo (horas): <input data-hours type="text" inputmode="decimal"></label></div>
            <div class="eas-actions">
                <button type="button" class="eas-button" data-start>Iniciar</button>
                <button type="button" class="eas-button" data-stop>Parar</button>
                <button type="button" class="eas-button" data-now>Executar Agora</button>
                <button type="button" class="eas-button" data-discover>Verificar aldeias</button>
            </div>
            <p data-status role="status"></p><p data-next></p><p data-counts></p>
            <p>Executar Agora: com automação desligada, executa uma vez. Com automação ligada, recalcula o intervalo após o ciclo.</p>
            <div class="eas-table-wrapper"><table class="eas-table"><thead><tr><th>Aldeia</th><th>Solicitado</th><th>Tentado</th><th>Confirmado</th><th>Resultado</th></tr></thead><tbody data-results></tbody></table></div>
            <pre data-logs style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>`;
        const field = (name) => win.body.querySelector(`[data-${name}]`);
        const config = controller.read().config;
        field('amount').value = config.requestedPerVillage;
        field('hours').value = config.intervalHours;
        const rows = (results) => { field('results').innerHTML = results.map((row) => `<tr><td>${escape(row.villageName)}</td><td>${row.requested}</td><td>${row.attempted}</td><td>${row.confirmed}</td><td>${escape(row.status)}: ${escape(row.reason)}</td></tr>`).join(''); };
        const render = (state) => {
            field('total').textContent = state.totalConfirmedCoins;
            field('status').textContent = `${state.status}${state.error ? ': ' + state.error : ''}`;
            field('next').textContent = `Próxima execução: ${state.nextRunAt ? new Date(state.nextRunAt).toLocaleString() + ' (horário deste navegador)' : '—'}`;
            field('counts').textContent = `Último ciclo: solicitado ${state.lastCycleRequested}; tentado ${state.lastCycleAttempted}; confirmado ${state.lastCycleConfirmed}.`;
            field('blocked').textContent = EAS.Adapters.Minting.blockedReason || (!navigator.locks ? 'Navegador sem suporte ao lock exclusivo.'
                : 'Sem máximo verificável, somente 1 moeda por aldeia. Se o resultado não puder ser confirmado, a automação será interrompida.');
            field('start').disabled = field('now').disabled = !EAS.Adapters.Minting.available || !navigator.locks || state.status === 'RUNNING';
            for (const name of ['group', 'amount', 'hours', 'refresh', 'discover']) field(name).disabled = state.status === 'RUNNING';
            rows(state.results);
            field('logs').textContent = state.logs.map((entry) => `[${new Date(entry.at).toLocaleTimeString()}] ${entry.level}: ${entry.message}`).join('\n');
        };
        const saveConfig = () => controller.configure({ groupId: field('group').value, requestedPerVillage: field('amount').value, intervalHours: field('hours').value });
        const error = (message) => { field('status').textContent = message; };
        let refreshing = false;
        const refresh = async () => {
            if (refreshing) return;
            refreshing = true; field('refresh').disabled = true;
            try {
                const selected = field('group').value || controller.read().config.groupId;
                const groups = await EAS.Data.Groups.ensureFresh({ forceRefresh: true });
                field('group').innerHTML = '<option value="">Selecione um grupo</option>' + groups.map((group) => `<option value="${escape(group.id)}">${escape(group.name)}</option>`).join('');
                field('group').value = selected;
                if (selected && !field('group').value) error('O grupo salvo não está mais disponível. Selecione outro grupo.');
            } catch { error('Falha ao atualizar grupos. Verifique sua sessão do jogo.'); }
            finally { refreshing = false; field('refresh').disabled = false; }
        };
        for (const name of ['group', 'amount', 'hours']) field(name).addEventListener('change', () => { try { saveConfig(); } catch (err) { error(err.message); } });
        field('refresh').onclick = refresh;
        field('stop').onclick = () => { try { controller.stop(); } catch (err) { error(err.message); } };
        for (const [name, action] of [['start', () => controller.start()], ['now', () => controller.run()]]) {
            field(name).onclick = async () => { try { saveConfig(); await action(); } catch (err) { error(err.message); } };
        }
        let discovering = false;
        field('discover').onclick = async () => {
            if (discovering) return;
            discovering = true; field('discover').disabled = true;
            try {
                saveConfig();
                const data = await service.discover(field('group').value);
                rows(data.villages.map((village) => service.planVillage(village, controller.read().config.requestedPerVillage)));
                error(`${data.villages.length} aldeias verificadas; ${data.villages.filter((village) => village.eligible).length} com formulário de cunhagem. Nenhuma moeda foi enviada nesta verificação.`);
            } catch (err) { error(err.message); }
            finally { discovering = false; field('discover').disabled = false; }
        };
        const unsubscribe = controller.subscribe(render);
        cleanup = () => { unsubscribe(); EAS.Runtime.dispose('minting-ui'); win.close(); cleanup = null; };
        runtime.observe(new MutationObserver(() => {
            if (!win.element.isConnected) cleanup?.();
        })).observe(document.body, { childList: true, subtree: true });
        render(controller.read());
        EAS.Usage?.track?.('minting.open');
        await refresh();
        return win;
    };
    EAS.Modules.Minting = { open() { if (!opening) opening = open().finally(() => { opening = null; }); return opening; } };
})();
