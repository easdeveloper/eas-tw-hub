(() => {
    'use strict';
    EAS.Modules ||= {};
    let opening = null, cleanup = null;
    const open = async () => {
        if (!EAS.Adapters.Minting) await EASLoader.loadScript('services/minting-adapter.js');
        if (!EAS.Minting) await EASLoader.loadScript('services/minting.js');
        cleanup?.();
        const controller = EAS.Minting.getController();
        const win = EAS.UI.createWindow({ id: 'eas-minting', title: 'Cunhagem — Criação automática oficial', icon: '🪙', width: 700 });
        const runtime = EAS.Runtime.create({ id: 'minting-ui', type: 'minting-ui' }), escape = EAS.Utils.escapeHtml;
        win.body.innerHTML = `
            <p>Ative a criação automática oficial por 8h. O jogo gerencia a cunhagem durante a sessão; o EAS não renova automaticamente.</p>
            <p class="eas-status eas-status--warning" data-blocked></p>
            <div class="eas-field"><label>Grupo de aldeias: <select data-group><option value="">Selecione um grupo</option></select></label></div>
            <div class="eas-actions">
                <button type="button" class="eas-button" data-refresh>Atualizar grupos</button>
                <button type="button" class="eas-button" data-discover>Verificar aldeias</button>
            </div>
            <p data-status role="status"></p><p data-counts></p>
            <div class="eas-table-wrapper"><table class="eas-table"><thead><tr><th>Aldeia</th><th>Estado</th><th>Fim</th><th>Resultado</th></tr></thead><tbody data-results></tbody></table></div>
            <button type="button" class="eas-button" data-activate>Ativar 8h nas disponíveis</button>
            <pre data-logs style="white-space:pre-wrap;overflow-wrap:anywhere"></pre>`;
        const field = name => win.body.querySelector(`[data-${name}]`);
        const labels = { ACTIVE: 'ATIVA', AVAILABLE: 'DISPONÍVEL', UNAVAILABLE: 'INDISPONÍVEL', PARSE_FAILED: 'ERRO DE LEITURA', SESSION_INVALID: 'SESSÃO INVÁLIDA', UNCERTAIN: 'INCERTO' };
        const outcomes = { ACTIVATED: 'ATIVADA', UNCERTAIN: 'UNCERTAIN — confira a Academia antes de tentar novamente', SKIPPED: 'Não ativada', ATTEMPTED: 'Aguardando confirmação' };
        let refreshing = false;
        const render = state => {
            const busy = ['VERIFYING', 'ACTIVATING'].includes(state.status);
            const count = kind => state.results.filter(row => row.state === kind).length;
            field('status').textContent = state.error || ({ IDLE: 'Selecione um grupo e verifique as aldeias.', VERIFYING: 'Verificando Academias…', PREVIEW: 'Verificação concluída. Revise as aldeias antes de ativar.', ACTIVATING: 'Ativando sessões oficiais…', DONE: 'Operação encerrada. Não há renovação agendada pelo EAS.' }[state.status] || state.status);
            field('counts').textContent = `Ativas: ${count('ACTIVE')} | Disponíveis: ${count('AVAILABLE')} | Indisponíveis: ${count('UNAVAILABLE')} | Erros: ${state.results.filter(row => ['PARSE_FAILED', 'SESSION_INVALID', 'UNCERTAIN'].includes(row.state)).length}`;
            field('blocked').textContent = !navigator.locks ? 'Ativação indisponível: navegador sem lock exclusivo.' : '';
            for (const name of ['group', 'discover', 'refresh']) field(name).disabled = busy || refreshing;
            field('activate').disabled = busy || refreshing || !navigator.locks || !state.previewReady || !count('AVAILABLE');
            field('results').innerHTML = state.results.map(row => `<tr><td>${escape(row.villageName)} (${escape(row.villageId)})</td><td>${escape(labels[row.state] || row.state)}</td><td>—</td><td>${escape(outcomes[row.outcome] || row.reason || (row.state === 'AVAILABLE' ? 'Pronta para ativar' : '—'))}</td></tr>`).join('');
            field('logs').textContent = state.logs.map(entry => `[${new Date(entry.at).toLocaleTimeString()}] ${entry.level}: ${entry.message}`).join('\n');
        };
        const error = message => { field('status').textContent = message; };
        const refresh = async () => {
            if (refreshing) return;
            refreshing = true; render(controller.read());
            try {
                const selected = field('group').value || controller.read().config.groupId;
                const groups = await EAS.Data.Groups.ensureFresh({ forceRefresh: true });
                field('group').innerHTML = '<option value="">Selecione um grupo</option>' + groups.map(group => `<option value="${escape(group.id)}">${escape(group.name)}</option>`).join('');
                field('group').value = selected;
            } catch { error('Falha ao atualizar grupos. Verifique sua sessão do jogo.'); }
            finally { refreshing = false; render(controller.read()); }
        };
        field('group').onchange = () => { try { controller.configure({ groupId: field('group').value }); } catch (err) { error(err.message); } };
        field('refresh').onclick = refresh;
        field('discover').onclick = async () => { try { controller.configure({ groupId: field('group').value }); await controller.verify(); } catch (err) { error(err.message); } };
        field('activate').onclick = async () => {
            if (field('group').value !== controller.read().config.groupId) { error('Verifique novamente o grupo selecionado.'); return; }
            await controller.activate();
        };
        const unsubscribe = controller.subscribe(render);
        cleanup = () => { unsubscribe(); EAS.Runtime.dispose('minting-ui'); win.close(); cleanup = null; };
        runtime.observe(new MutationObserver(() => { if (!win.element.isConnected) cleanup?.(); })).observe(document.body, { childList: true, subtree: true });
        render(controller.read()); EAS.Usage?.track?.('minting.open'); await refresh(); return win;
    };
    EAS.Modules.Minting = { open() { if (!opening) opening = open().finally(() => { opening = null; }); return opening; } };
})();
