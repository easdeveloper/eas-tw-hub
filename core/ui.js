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

    EAS.UI.loadModule = async (moduleId) => {
        const moduleNames = {
            attack: 'Attack',
            fakes: 'Fakes',
            support: 'Support',
            antisnipe: 'Antisnipe',
            noble: 'Noble',
            resources: 'Resources',
            'market-smart-offers': 'MarketSmartOffers',
            'market-balance': 'MarketBalance',
            'market-target-supply': 'MarketTargetSupply',
            'scheduled-missions': 'ScheduledMissions'
        };
        const moduleName = moduleNames[moduleId];

        if (!moduleName) {
            throw new Error(`Módulo desconhecido: ${moduleId}`);
        }

        if (EAS.Modules?.[moduleName]?.open) {
            return EAS.Modules[moduleName];
        }

        if (!window.EASLoader?.loadScript) {
            throw new Error('Carregador de módulos indisponível.');
        }

        await window.EASLoader.loadScript(`modules/${moduleId}.js`);

        if (!EAS.Modules?.[moduleName]?.open) {
            throw new Error(`Módulo não registrado: ${moduleId}`);
        }

        return EAS.Modules[moduleName];
    };

    EAS.UI.openDevelopmentPlaceholder = (tool) => {
        const win = EAS.UI.createWindow({ id: `eas-placeholder-${tool.id}`, title: tool.title, icon: tool.icon, width: 520 });
        win.body.innerHTML = '<div class="eas-status eas-status--info">🚧 Funcionalidade em desenvolvimento.</div>';
        win.body.appendChild(EAS.UI.createButton({ text: '← Voltar ao painel', onClick: () => { win.close(); EAS.UI.openMainWindow(); } }));
    };

    EAS.UI.getDashboardIndicator = (toolId) => {
        const read = (key) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
        if (toolId === 'scheduled-missions') { const waiting=(read('eas_tw_scheduler')?.missions||[]).filter((mission)=>['created','prepared','waiting','paused'].includes(mission.status)).length; return waiting ? `${waiting} aguardando` : ''; }
        if (toolId === 'market-smart-offers') { const execution=read('eas_tw_market_offers_execution'); const pending=(execution?.queue||[]).filter((item)=>!['created','skipped','cancelled'].includes(item.status)).length; return pending ? `Execução ativa · ${pending} pendentes` : ''; }
        if (toolId === 'market-balance') { const execution=read('eas_tw_market_balance_execution'); const pending=(execution?.queue||[]).filter((item)=>!['sent','skipped','cancelled'].includes(item.status)).length; return pending ? `${pending} transportes pendentes` : ''; }
        if (toolId === 'fakes') { const execution=read('eas_tw_fakes_execution'); const pending=(execution?.queue||[]).filter((item)=>!['sent','skipped','cancelled','completed'].includes(item.status)).length; return pending ? `Operação em andamento · ${pending}` : ''; }
        return '';
    };

    EAS.UI.renderHubDashboard = (win, version) => {
        const categories = [
            { icon:'⚔️', title:'Operações', description:'Planejamento e coordenação de comandos.', tools:[
                {id:'attack',icon:'🎯',title:'Planejador de Ataques',description:'Calcule origens, tropas e horários de envio.',status:'Disponível'},
                {id:'scheduled-missions',icon:'⏱️',title:'Missões Agendadas',description:'Gerencie operações preparadas para horários futuros.',status:'Beta'},
                {id:'support',icon:'🛡️',title:'Planejador de Apoios',description:'Distribua e programe apoios entre aldeias.',status:'Disponível'},
                {id:'fakes',icon:'🎭',title:'Gerenciador de Fakes',description:'Crie e analise operações de fake.',status:'Disponível'} ] },
            { icon:'🏪', title:'Mercado', description:'Economia e distribuição de recursos.', tools:[
                {id:'market-smart-offers',icon:'🔄',title:'Ofertas Inteligentes',description:'Equilibre os recursos de cada aldeia por ofertas.',status:'Disponível'},
                {id:'market-balance',icon:'⚖️',title:'Balanceamento',description:'Redistribua recursos entre suas aldeias.',status:'Disponível'},
                {id:'market-target-supply',icon:'🎯',title:'Envio Coordenado',description:'Abasteça uma aldeia-alvo usando várias origens.',status:'Disponível'} ] },
            { icon:'🧠', title:'Inteligência', description:'Dados, relatórios e auditoria.', tools:[
                {id:'statistics',icon:'📊',title:'Estatísticas',description:'Visualize dados consolidados da conta.',status:'Em desenvolvimento',disabled:true},
                {id:'reports',icon:'📋',title:'Relatórios',description:'Gere análises de operações e economia.',status:'Em desenvolvimento',disabled:true},
                {id:'history',icon:'📜',title:'Histórico',description:'Consulte operações e ações anteriores.',status:'Em desenvolvimento',disabled:true},
                {id:'diagnostic',icon:'🔍',title:'Diagnóstico',description:'Verifique caches, regras e erros do Hub.',status:'Disponível'} ] },
            { icon:'⚙️', title:'Sistema', description:'Preferências e informações do Hub.', tools:[
                {id:'settings',icon:'⚙️',title:'Configurações',description:'Personalize o comportamento do EAS TW Hub.',status:'Em desenvolvimento',disabled:true},
                {id:'license',icon:'🔑',title:'Licença',description:'Consulte o status e os dados da licença.',status:'Em desenvolvimento',disabled:true},
                {id:'updates',icon:'⬆️',title:'Atualizações',description:'Veja versão, novidades e atualizações disponíveis.',status:'Em desenvolvimento',disabled:true} ] }
        ];
        const dashboard=document.createElement('div');dashboard.className='hub-dashboard';const subtitle=document.createElement('p');subtitle.className='hub-dashboard-subtitle';subtitle.textContent='Central de operações, economia e inteligência.';dashboard.appendChild(subtitle);
        categories.forEach((category)=>{const section=document.createElement('section');section.className='hub-category';section.innerHTML=`<div class="hub-category-header"><span class="hub-category-icon">${category.icon}</span><div><h2 class="hub-category-title">${category.title}</h2><small>${category.description}</small></div></div><div class="hub-category-tools"></div>`;const tools=section.querySelector('.hub-category-tools');category.tools.forEach((tool)=>{const card=document.createElement('button');card.type='button';card.className=`hub-tool-card${tool.disabled?' hub-tool-card-disabled':''}`;const badge=EAS.UI.getDashboardIndicator(tool.id);card.innerHTML=`<span class="hub-tool-card-icon">${tool.icon}</span><span class="hub-tool-card-content"><strong class="hub-tool-card-title">${tool.title}</strong><span class="hub-tool-card-description">${tool.description}</span><span class="hub-tool-card-status hub-tool-card-status--${tool.status.toLowerCase().replaceAll(' ','-')}">${tool.status}</span>${badge?`<span class="hub-tool-card-badge">${badge}</span>`:''}</span>`;card.onclick=()=>{if(tool.disabled){EAS.UI.openDevelopmentPlaceholder(tool);return;}EAS.UI.openModuleTest({id:tool.id,icon:tool.icon,text:tool.title});};tools.appendChild(card);});dashboard.appendChild(section);});
        win.body.append(version,dashboard);
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
            width: 960
        });

        const version = document.createElement('div');
        version.className = 'eas-version';
        version.textContent = `Versão ${EAS.version}`;

        const menu = document.createElement('div');
        menu.className = 'eas-menu';

        EAS.UI.renderHubDashboard(win, version);
        return;

        const operations = [
            {
                id: 'attack',
                icon: '⚔️',
                text: 'Planejador de Ataques'
            },
            {
                id: 'fakes',
                icon: '🎭',
                text: 'Gerenciador de Fakes'
            },
            {
                id: 'support',
                icon: '🛡️',
                text: 'Planejador de Apoios'
            },
            {
                id: 'scheduled-missions',
                icon: '⚔️',
                text: 'Missões Agendadas'
            },
            {
                id: 'scheduler-history',
                icon: '📜',
                text: 'Histórico',
                comingSoon: true
            },
            {
                id: 'scheduler-settings',
                icon: '⚙️',
                text: 'Configurações',
                comingSoon: true
            }
        ];

        const modules = [
            {
                id: 'diagnostic',
                icon: '🔍',
                text: 'Diagnóstico do jogo'
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
            }
        ];

        const operationsSection = document.createElement('section');
        operationsSection.className = 'operations-section';

        const operationsTitle = document.createElement('h2');
        operationsTitle.className = 'operations-section__title';
        operationsTitle.textContent = '⚔️ Operações';

        const operationsTools = document.createElement('div');
        operationsTools.className = 'operations-tools';

        operations.forEach((module) => {
            const button = EAS.UI.createButton({
                text: module.text,
                icon: module.icon,
                className: 'eas-menu__button',
                onClick: () => module.comingSoon ? alert(`${module.text}: estrutura reservada para uma próxima etapa.`) : EAS.UI.openModuleTest(module)
            });

            operationsTools.appendChild(button);
        });

        operationsSection.appendChild(operationsTitle);
        operationsSection.appendChild(operationsTools);
        menu.appendChild(operationsSection);

        const marketSection = document.createElement('section');
        marketSection.className = 'market-section';
        const marketTitle = document.createElement('h2');
        marketTitle.className = 'operations-section__title';
        marketTitle.textContent = '🏪 Mercado';
        const marketTools = document.createElement('div');
        marketTools.className = 'operations-tools';
        [
            { id: 'market-smart-offers', icon: '🔄', text: 'Ofertas Inteligentes' },
            { id: 'market-balance', icon: '⚖️', text: 'Balanceamento entre Aldeias' },
            { id: 'market-target-supply', icon: '🎯', text: 'Envio Coordenado' }
        ].forEach((module) => marketTools.appendChild(EAS.UI.createButton({
            text: module.text, icon: module.icon, className: 'eas-menu__button',
            onClick: () => EAS.UI.openModuleTest(module)
        })));
        marketSection.append(marketTitle, marketTools);
        menu.appendChild(marketSection);

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

        if (module.id === 'attack' || module.id === 'fakes' || module.id === 'support' || module.id === 'scheduled-missions' || module.id.startsWith('market-')) {
            EAS.UI.loadModule(module.id)
                .then((loadedModule) => {
                    EAS.UI.closeWindow(DEFAULT_WINDOW_ID);
                    loadedModule.open();
                })
                .catch((error) => {
                    alert(`EAS TW Hub: ${error.message}`);
                });

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
