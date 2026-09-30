(() => {
    'use strict';
    EAS.Modules ||= {};
    EAS.Modules.IncomingMonitor = { open: async () => {
        for (const asset of ['core/runtime.js', 'services/mass-snipe-execution.js', 'services/arrival-planner.js', 'services/incoming-parser.js', 'services/incoming-model.js', 'services/incoming-store.js', 'services/incoming-transport.js', 'services/incoming-socket.js', 'services/incoming-monitor.js']) await EASLoader.loadScript(asset);
        const win = EAS.UI.createWindow({ id: 'eas-incoming-monitor', title: 'Monitor de ataques recebidos', icon: '🔔', width: 560 });
        const render = () => {
            const state = EAS.IncomingMonitor.status(), escape = EAS.Utils.escapeHtml;
            win.body.innerHTML = `<label><input type="checkbox" data-enabled ${state.config.enabled ? 'checked' : ''}> Monitor ativo</label><br>
                <label><input type="checkbox" data-labels ${state.config.labels ? 'checked' : ''}> Aplicar etiquetas automaticamente</label><br>
                <label><input type="checkbox" data-discord ${state.config.discord ? 'checked' : ''}> Notificar no Discord</label>
                <p>Discord: ${state.transportConfigured ? 'configurado' : 'transporte não configurado — use o menu do userscript Discord no Violentmonkey'}</p>
                <p>Sensor: ${state.socketStatus === 'connected' ? 'conectado a Connection.socket (/game)' : state.socketStatus === 'disconnected' ? 'socket do jogo desconectado — aguardando reconexão' : 'indisponível — aguardando Connection.socket (/game)'}</p>
                <p>Baseline: ${state.initialized ? 'registrado' : 'aguardando visão geral comprovada'} · Acompanhados: ${Object.values(state.attacks).filter(item => item.state !== 'ENDED').length}</p>
                <p>Última reconciliação: ${state.lastReconciledAt ? escape(EAS.MassSnipeExecution.formatDateTime(state.lastReconciledAt)) : '—'}</p>
                <p>Último evento: ${state.lastEventAt ? escape(EAS.MassSnipeExecution.formatDateTime(state.lastEventAt)) : '—'}</p>
                <p>${escape(state.lastError || '')}</p><button class="btn" data-save>Salvar</button> <button class="btn" data-refresh>Atualizar status</button>
                <ul>${Object.values(state.attacks).slice(-20).map(entry => `<li>${escape(entry.commandId)}: ${escape(entry.state)} · etiqueta ${escape(entry.label.status)} · Discord ${escape(entry.discord.status)}</li>`).join('')}</ul>
                <p>Falha ou resposta incerta ao criar mensagem não é reenviada automaticamente.</p>`;
            win.body.querySelector('[data-save]').onclick = async () => {
                const config = Object.fromEntries(['enabled', 'labels', 'discord'].map(key => [key, win.body.querySelector('[data-' + key + ']').checked]));
                try { await EAS.IncomingMonitor.configure(config); render(); } catch {
                    const error = document.createElement('p'); error.setAttribute('role', 'alert');
                    error.textContent = 'Não foi possível persistir a configuração. Verifique o armazenamento e a disponibilidade de Web Locks.'; win.body.append(error);
                }
            };
            win.body.querySelector('[data-refresh]').onclick = render;
        };
        render(); return win;
    } };
})();
