(() => {
    'use strict';

    const DEFAULT_WINDOW_ID = 'eas-tw-hub-window';

    const getElement = (target) => {
        if (typeof target === 'string') {
            return document.querySelector(target);
        }

        return target;
    };

    EAS.UI.closeWindow = (id = DEFAULT_WINDOW_ID) => {
        document.getElementById(id)?.remove();
    };

    EAS.UI.createWindow = ({
        id = DEFAULT_WINDOW_ID,
        title = EAS.name,
        icon = '⚔️',
        width = 470,
        className = '',
        content = '',
        closable = true
    } = {}) => {
        EAS.UI.closeWindow(id);

        const windowElement = document.createElement('div');

        windowElement.id = id;
        windowElement.className = `eas-window ${className}`.trim();
        windowElement.style.width = `${width}px`;

        windowElement.innerHTML = `
            <div class="eas-window__header">
                <div class="eas-window__title">
                    <span class="eas-window__icon">${icon}</span>
                    <strong>${title}</strong>
                </div>

                ${
                    closable
                        ? `
                            <button
                                type="button"
                                class="eas-window__close"
                                data-eas-action="close"
                                title="Fechar"
                            >
                                ×
                            </button>
                        `
                        : ''
                }
            </div>

            <div class="eas-window__body">
                ${content}
            </div>
        `;

        document.body.appendChild(windowElement);

        const body = windowElement.querySelector('.eas-window__body');

        if (closable) {
            windowElement
                .querySelector('[data-eas-action="close"]')
                ?.addEventListener('click', () => {
                    windowElement.remove();
                });
        }

        return {
            element: windowElement,
            body,

            close() {
                windowElement.remove();
            },

            setTitle(newTitle) {
                const titleElement = windowElement.querySelector(
                    '.eas-window__title strong'
                );

                if (titleElement) {
                    titleElement.textContent = newTitle;
                }
            },

            setContent(html) {
                body.innerHTML = html;
            }
        };
    };

    EAS.UI.createButton = ({
        text,
        icon = '',
        className = '',
        type = 'button',
        disabled = false,
        onClick = null
    }) => {
        const button = document.createElement('button');

        button.type = type;
        button.className = `eas-button ${className}`.trim();
        button.disabled = disabled;
        button.innerHTML = `${icon ? `${icon} ` : ''}${text}`;

        if (typeof onClick === 'function') {
            button.addEventListener('click', onClick);
        }

        return button;
    };

    EAS.UI.createInput = ({
        type = 'text',
        value = '',
        placeholder = '',
        className = '',
        name = '',
        min = '',
        max = ''
    } = {}) => {
        const input = document.createElement('input');

        input.type = type;
        input.value = value;
        input.placeholder = placeholder;
        input.className = `eas-input ${className}`.trim();
        input.name = name;

        if (min !== '') {
            input.min = min;
        }

        if (max !== '') {
            input.max = max;
        }

        return input;
    };

    EAS.UI.createField = ({
        label,
        input,
        helpText = ''
    }) => {
        const field = document.createElement('div');

        field.className = 'eas-field';

        const labelElement = document.createElement('label');
        labelElement.className = 'eas-field__label';
        labelElement.textContent = label;

        field.appendChild(labelElement);
        field.appendChild(input);

        if (helpText) {
            const help = document.createElement('small');
            help.className = 'eas-field__help';
            help.textContent = helpText;
            field.appendChild(help);
        }

        return field;
    };

    EAS.UI.createTable = ({
        columns = [],
        rows = []
    } = {}) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'eas-table-wrapper';

        const table = document.createElement('table');
        table.className = 'eas-table';

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        columns.forEach((column) => {
            const th = document.createElement('th');
            th.textContent = column.label ?? column.key;
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);

        const tbody = document.createElement('tbody');

        rows.forEach((row) => {
            const tr = document.createElement('tr');

            columns.forEach((column) => {
                const td = document.createElement('td');
                const value = row[column.key];

                td.textContent = value ?? '';
                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        table.appendChild(thead);
        table.appendChild(tbody);
        wrapper.appendChild(table);

        return {
            element: wrapper,
            table,
            tbody,

            setRows(newRows = []) {
                tbody.innerHTML = '';

                newRows.forEach((row) => {
                    const tr = document.createElement('tr');

                    columns.forEach((column) => {
                        const td = document.createElement('td');
                        td.textContent = row[column.key] ?? '';
                        tr.appendChild(td);
                    });

                    tbody.appendChild(tr);
                });
            }
        };
    };

    EAS.UI.showStatus = ({
        target,
        message,
        type = 'info'
    }) => {
        const container = getElement(target);

        if (!container) {
            return;
        }

        container.textContent = message;
        container.className = `eas-status eas-status--${type}`;
    };

    EAS.UI.openMainWindow = () => {
        const existing = document.getElementById(DEFAULT_WINDOW_ID);

        if (existing) {
            existing.remove();
            return;
        }

        const win = EAS.UI.createWindow({
            title: EAS.name,
            icon: '⚔️',
            width: 470
        });

        const version = document.createElement('div');
        version.className = 'eas-version';
        version.textContent = `Versão ${EAS.version}`;

        const menu = document.createElement('div');
        menu.className = 'eas-menu';

        const modules = [
            {
                id: 'diagnostic',
                icon: '🔍',
                text: 'Diagnóstico do jogo'
            },
            {
                id: 'attack',
                icon: '⚔️',
                text: 'Planejador de Ataques'
            },
            {
                id: 'support',
                icon: '🛡️',
                text: 'Planejador de Apoios'
            },
            {
                id: 'antisnipe',
                icon: '⏱️',
                text: 'Anti-Snipe'
            },
            {
                id: 'noble',
                icon: '👑',
                text: 'Planejador de Nobres'
            },
            {
                id: 'resources',
                icon: '📦',
                text: 'Distribuição de Recursos'
            }
        ];

        modules.forEach((module) => {
            const button = EAS.UI.createButton({
                text: module.text,
                icon: module.icon,
                className: 'eas-menu__button',
                onClick: () => {
                    EAS.UI.openModuleTest(module);
                }
            });

            menu.appendChild(button);
        });

        const status = document.createElement('div');
        status.className = 'eas-status eas-status--success';
        status.textContent = 'Sistema carregado corretamente.';

        win.body.appendChild(version);
        win.body.appendChild(menu);
        win.body.appendChild(status);
    };

    EAS.UI.openModuleTest = (module) => {
        if (module.id === 'diagnostic') {
            EAS.UI.openDiagnostic();
            return;
        }

        const win = EAS.UI.createWindow({
            id: `eas-module-${module.id}`,
            title: module.text,
            icon: module.icon,
            width: 650
        });

        const form = document.createElement('div');
        form.className = 'eas-form';

        const coordinateInput = EAS.UI.createInput({
            placeholder: 'Exemplo: 500|500',
            name: 'coordinate'
        });

        const dateInput = EAS.UI.createInput({
            type: 'date',
            name: 'date'
        });

        const timeInput = EAS.UI.createInput({
            type: 'time',
            name: 'time'
        });

        form.appendChild(
            EAS.UI.createField({
                label: 'Coordenada de destino',
                input: coordinateInput,
                helpText: 'Informe a coordenada no formato 500|500.'
            })
        );

        form.appendChild(
            EAS.UI.createField({
                label: 'Data de chegada',
                input: dateInput
            })
        );

        form.appendChild(
            EAS.UI.createField({
                label: 'Horário de chegada',
                input: timeInput
            })
        );

        const actions = document.createElement('div');
        actions.className = 'eas-actions';

        const status = document.createElement('div');
        status.className = 'eas-status eas-status--info';
        status.textContent = 'Módulo em preparação.';

        const calculateButton = EAS.UI.createButton({
            text: 'Testar componentes',
            icon: '🧪',
            onClick: () => {
                const coordinate = coordinateInput.value.trim();

                if (!/^\d{1,3}\|\d{1,3}$/.test(coordinate)) {
                    EAS.UI.showStatus({
                        target: status,
                        message: 'Informe uma coordenada válida, como 500|500.',
                        type: 'error'
                    });

                    return;
                }

                EAS.UI.showStatus({
                    target: status,
                    message: `Componentes funcionando para o destino ${coordinate}.`,
                    type: 'success'
                });
            }
        });

        const backButton = EAS.UI.createButton({
            text: 'Voltar ao menu',
            icon: '↩️',
            className: 'eas-button--secondary',
            onClick: () => {
                win.close();
                EAS.UI.openMainWindow();
            }
        });

        actions.appendChild(calculateButton);
        actions.appendChild(backButton);

        win.body.appendChild(form);
        win.body.appendChild(actions);
        win.body.appendChild(status);
    };

    EAS.UI.openDiagnostic = () => {
        EAS.UI.closeWindow(DEFAULT_WINDOW_ID);

        const info = EAS.World.getInfo();
        const villages = EAS.Villages.list();
        const player = info.player || {};
        const currentVillage = info.currentVillage || {};
        const serverDateTime = info.serverDateTime || {};
        const escape = EAS.Utils.escapeHtml;

        const win = EAS.UI.createWindow({
            id: 'eas-module-diagnostic',
            title: 'Diagnóstico do jogo',
            icon: '🔍',
            width: 760
        });

        const summary = document.createElement('div');
        summary.className = 'eas-diagnostic';
        summary.innerHTML = `
            <div class="eas-diagnostic__grid">
                <div>
                    <strong>Mundo</strong>
                    <span>${escape(info.world)}</span>
                </div>
                <div>
                    <strong>Jogador</strong>
                    <span>${escape(player.name)}</span>
                </div>
                <div>
                    <strong>Aldeia atual</strong>
                    <span>${escape(currentVillage.name)}</span>
                </div>
                <div>
                    <strong>Coordenada atual</strong>
                    <span>${escape(currentVillage.coordinate)}</span>
                </div>
                <div>
                    <strong>Horário do servidor</strong>
                    <span>${escape(serverDateTime.formatted)}</span>
                </div>
                <div>
                    <strong>Aldeias encontradas</strong>
                    <span>${villages.length}</span>
                </div>
            </div>
        `;

        const table = EAS.UI.createTable({
            columns: [
                { key: 'name', label: 'Aldeia' },
                { key: 'coordinate', label: 'Coordenada' },
                { key: 'id', label: 'ID' }
            ],
            rows: villages.map((village) => ({
                name: escape(village.name),
                coordinate: escape(village.coordinate),
                id: escape(village.id)
            }))
        });

        const actions = document.createElement('div');
        actions.className = 'eas-actions';

        const refreshButton = EAS.UI.createButton({
            text: 'Atualizar leitura',
            icon: '🔄',
            onClick: () => {
                win.close();
                EAS.UI.openDiagnostic();
            }
        });

        const backButton = EAS.UI.createButton({
            text: 'Voltar ao menu',
            icon: '↩️',
            className: 'eas-button--secondary',
            onClick: () => {
                win.close();
                EAS.UI.openMainWindow();
            }
        });

        actions.appendChild(refreshButton);
        actions.appendChild(backButton);

        win.body.appendChild(summary);
        win.body.appendChild(table.element);
        win.body.appendChild(actions);
    };

    EAS.UI.toggle = EAS.UI.openMainWindow;
})();
