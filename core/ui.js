(() => {
    'use strict';

    const WINDOW_ID = 'eas-tw-hub-window';

    const getWindow = () => document.getElementById(WINDOW_ID);

    EAS.UI.close = () => {
        getWindow()?.remove();
    };

    EAS.UI.toggle = () => {
        const panel = getWindow();

        if (panel) {
            panel.remove();
            return;
        }

        EAS.UI.openMainWindow();
    };

    EAS.UI.openMainWindow = () => {
        EAS.UI.close();

        const panel = document.createElement('div');
        panel.id = WINDOW_ID;
        panel.className = 'eas-window';

        panel.innerHTML = `
            <div class="eas-window__header">
                <div>
                    <span class="eas-window__icon">⚔️</span>
                    <strong>${EAS.name}</strong>
                </div>

                <button
                    type="button"
                    class="eas-window__close"
                    data-eas-action="close"
                    title="Fechar"
                >
                    ×
                </button>
            </div>

            <div class="eas-window__body">
                <div class="eas-version">
                    Versão ${EAS.version}
                </div>

                <div class="eas-menu">
                    <button type="button" data-module="attack">
                        ⚔️ Planejador de Ataques
                    </button>

                    <button type="button" data-module="support">
                        🛡️ Planejador de Apoios
                    </button>

                    <button type="button" data-module="antisnipe">
                        ⏱️ Anti-Snipe
                    </button>

                    <button type="button" data-module="noble">
                        👑 Planejador de Nobres
                    </button>

                    <button type="button" data-module="resources">
                        📦 Distribuição de Recursos
                    </button>
                </div>

                <div class="eas-status">
                    Sistema carregado corretamente.
                </div>
            </div>
        `;

        document.body.appendChild(panel);

        panel
            .querySelector('[data-eas-action="close"]')
            .addEventListener('click', EAS.UI.close);

        panel.querySelectorAll('[data-module]').forEach((button) => {
            button.addEventListener('click', () => {
                const moduleName = button.dataset.module;

                alert(
                    `O módulo "${moduleName}" será desenvolvido na próxima etapa.`
                );
            });
        });
    };
})();