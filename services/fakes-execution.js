(() => {
    'use strict';

    EAS.FakesExecution = EAS.FakesExecution || {};

    const EXECUTION_STORAGE_KEY = 'eas_tw_fakes_execution';
    const PANEL_ID = 'eas-fake-execution-panel';
    const POLL_INTERVAL_MS = 200;
    const OPEN_TIMEOUT_MS = 10000;
    const COMMAND_TYPES = ['attack', 'support'];
    const UNITS = [
        'spear',
        'sword',
        'axe',
        'archer',
        'spy',
        'light',
        'marcher',
        'heavy',
        'ram',
        'catapult',
        'knight',
        'snob'
    ];
    const UNIT_NAMES = {
        spear: 'Lanceiros',
        sword: 'Espadachins',
        axe: 'Bárbaros',
        archer: 'Arqueiros',
        spy: 'Exploradores',
        light: 'Cavalarias leves',
        marcher: 'Arqueiros montados',
        heavy: 'Cavalarias pesadas',
        ram: 'Aríetes',
        catapult: 'Catapultas',
        knight: 'Paladinos',
        snob: 'Nobres'
    };
    const PRESET_NAMES = {
        simple: 'Fake simples',
        nt: 'Fake NT',
        antiSnipe: 'Fake Anti-Snipe',
        custom: 'Fake personalizado'
    };

    const readContext = () => {
        try {
            const value = localStorage.getItem(EXECUTION_STORAGE_KEY);
            return value ? JSON.parse(value) : null;
        } catch {
            return null;
        }
    };

    const saveContext = (context) => {
        try {
            localStorage.setItem(EXECUTION_STORAGE_KEY, JSON.stringify(context));
            return true;
        } catch {
            return false;
        }
    };

    const removeContext = () => {
        try {
            localStorage.removeItem(EXECUTION_STORAGE_KEY);
        } catch {
            // The panel can still be closed when browser storage is unavailable.
        }
    };

    const getScreen = (targetWindow = window) => {
        try {
            const url = new URL(targetWindow.location.href);

            return {
                screen: url.searchParams.get('screen'),
                villageId: Number(
                    url.searchParams.get('village') ||
                    targetWindow.game_data?.village?.id ||
                    0
                )
            };
        } catch {
            return { screen: null, villageId: 0 };
        }
    };

    const isMatchingPlace = (context, targetWindow = window) => {
        const screen = getScreen(targetWindow);

        return screen.screen === 'place' &&
            Number(screen.villageId) === Number(context?.villageId || 0);
    };

    const normalizeContext = (context) => ({
        ...context,
        targets: Array.isArray(context?.targets) ? [...context.targets] : [],
        troopsPerTarget: { ...(context?.troopsPerTarget || {}) },
        currentIndex: Math.max(0, Number(context?.currentIndex || 0)),
        preparedTargets: Array.isArray(context?.preparedTargets)
            ? [...context.preparedTargets]
            : [],
        skippedTargets: Array.isArray(context?.skippedTargets)
            ? [...context.skippedTargets]
            : [],
        completedTargets: Array.isArray(context?.completedTargets)
            ? [...context.completedTargets]
            : [],
        errorTargets: Array.isArray(context?.errorTargets)
            ? [...context.errorTargets]
            : []
    });

    const uniquePush = (items, value) => {
        if (!items.includes(value)) {
            items.push(value);
        }
    };

    const removeValue = (items, value) => {
        const index = items.indexOf(value);

        if (index >= 0) {
            items.splice(index, 1);
        }
    };

    const clearOtherTargetStatuses = (context, target, keptStatus) => {
        if (keptStatus !== 'completed') {
            removeValue(context.completedTargets, target);
        }

        if (keptStatus !== 'skipped') {
            removeValue(context.skippedTargets, target);
        }

        if (keptStatus !== 'error') {
            context.errorTargets = context.errorTargets.filter(
                (item) => item.target !== target
            );
        }
    };

    const setInputValue = (input, value, targetWindow) => {
        const descriptor = Object.getOwnPropertyDescriptor(
            targetWindow.HTMLInputElement.prototype,
            'value'
        );

        if (descriptor?.set) {
            descriptor.set.call(input, String(value));
        } else {
            input.value = String(value);
        }

        input.dispatchEvent(new targetWindow.Event('input', { bubbles: true }));
        input.dispatchEvent(new targetWindow.Event('change', { bubbles: true }));
    };

    const findUnitInput = (form, unit) => {
        const selectors = [
            `input[name="${unit}"]`,
            `input[name="unit_${unit}"]`,
            `#unit_input_${unit}`,
            `[data-unit="${unit}"] input`
        ];

        return selectors
            .map((selector) => form.querySelector(selector))
            .find(Boolean) || null;
    };

    const getCachedTroops = (villageId) => {
        if (!EAS.Troops?.hasVillageData?.(villageId)) {
            return null;
        }

        return { ...EAS.Troops.getVillageTroops(villageId) };
    };

    const readAvailableFromPage = (targetDocument, input, unit) => {
        const values = [
            input.dataset?.allCount,
            input.dataset?.available,
            targetDocument.querySelector(`#units_entry_all_${unit}`)?.textContent
        ];
        const parsed = values
            .map((value) => String(value ?? '').replace(/\D/g, ''))
            .filter((value) => value !== '')
            .map(Number)
            .find((value) => Number.isFinite(value));

        return parsed ?? null;
    };

    const validateCurrent = (context, targetWindow) => {
        const target = context.targets[context.currentIndex];
        const parsedTarget = EAS.Utils.parseCoordinate(target);
        const form = EAS.Place.getCommandForm(targetWindow.document);
        const requiredTroops = Object.entries(context.troopsPerTarget)
            .filter(([, quantity]) => Number(quantity) > 0);

        if (!parsedTarget) {
            return { valid: false, message: 'Alvo inválido.' };
        }

        if (!COMMAND_TYPES.includes(context.commandType)) {
            return { valid: false, message: 'Tipo de comando inválido.' };
        }

        if (!form) {
            return {
                valid: false,
                message: 'Formulário de comando não encontrado.'
            };
        }

        if (!requiredTroops.length) {
            return {
                valid: false,
                message: 'Nenhuma tropa configurada para este alvo.'
            };
        }

        const inputs = requiredTroops.reduce((result, [unit]) => {
            result[unit] = findUnitInput(form, unit);
            return result;
        }, {});
        const missingInputs = requiredTroops
            .filter(([unit]) => !inputs[unit])
            .map(([unit]) => unit);

        if (missingInputs.length) {
            return {
                valid: false,
                message: `Campos de tropas indisponíveis: ${missingInputs.join(', ')}.`
            };
        }

        const cachedTroops = getCachedTroops(context.villageId);
        const insufficient = requiredTroops.filter(([unit, quantity]) => {
            const available = cachedTroops
                ? Number(cachedTroops[unit] || 0)
                : readAvailableFromPage(
                    targetWindow.document,
                    inputs[unit],
                    unit
                );

            return available !== null && available < Number(quantity);
        });

        if (insufficient.length) {
            return {
                valid: false,
                message: 'Tropas insuficientes para este alvo.'
            };
        }

        return {
            valid: true,
            target: parsedTarget.coordinate,
            form,
            inputs,
            requiredTroops
        };
    };

    const prepareCurrent = (context, targetWindow) => {
        const validation = validateCurrent(context, targetWindow);

        if (!validation.valid) {
            return validation;
        }

        UNITS.forEach((unit) => {
            const input = findUnitInput(validation.form, unit);

            if (input) {
                setInputValue(input, 0, targetWindow);
            }
        });

        validation.requiredTroops.forEach(([unit, quantity]) => {
            setInputValue(validation.inputs[unit], Number(quantity), targetWindow);
        });

        if (!EAS.Place.fillCommandTarget(validation.target, targetWindow)) {
            return {
                valid: false,
                message: 'Não foi possível preparar o alvo.'
            };
        }

        uniquePush(context.preparedTargets, validation.target);
        saveContext(context);

        return validation;
    };

    const findCommandButton = (form, commandType) => {
        const selectors = commandType === 'attack'
            ? ['#target_attack', '[name="attack"]', '[data-command="attack"]']
            : ['#target_support', '[name="support"]', '[data-command="support"]'];

        return selectors
            .map((selector) => form.querySelector(selector))
            .find(Boolean) || null;
    };

    const copyStyles = (targetWindow) => {
        if (targetWindow.document.querySelector('[data-eas-fakes-style]')) {
            return;
        }

        const source = document.querySelector('link[data-eas-style="css/eas.css"]');

        if (!source?.href || targetWindow.document === document) {
            return;
        }

        const link = targetWindow.document.createElement('link');
        link.rel = 'stylesheet';
        link.href = source.href;
        link.dataset.easFakesStyle = 'true';
        targetWindow.document.head.appendChild(link);
    };

    const getTargetStatus = (context, target, index) => {
        if (context.errorTargets.some((item) => item.target === target)) {
            return 'Erro';
        }

        if (context.skippedTargets.includes(target)) {
            return 'Pulado';
        }

        if (context.completedTargets.includes(target)) {
            return 'Enviado';
        }

        if (context.preparedTargets.includes(target)) {
            return 'Preparado';
        }

        return index === context.currentIndex ? 'Atual' : 'Pendente';
    };

    const mountPanel = (targetWindow = window) => {
        const stored = readContext();

        if (!stored || !isMatchingPlace(stored, targetWindow)) {
            return false;
        }

        const context = normalizeContext(stored);
        const doc = targetWindow.document;
        copyStyles(targetWindow);
        doc.getElementById(PANEL_ID)?.remove();

        const panel = doc.createElement('aside');
        panel.id = PANEL_ID;
        panel.className = 'fake-execution-panel';
        const header = doc.createElement('div');
        header.className = 'fake-execution-header';
        const title = doc.createElement('strong');
        title.textContent = '🎭 Execução de Fake';
        const closeButton = doc.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'fake-execution-close';
        closeButton.textContent = '×';
        closeButton.title = 'Fechar painel';
        closeButton.addEventListener('click', () => panel.remove());
        header.appendChild(title);
        header.appendChild(closeButton);

        const content = doc.createElement('div');
        content.className = 'fake-execution-content';
        panel.appendChild(header);
        panel.appendChild(content);
        doc.body.appendChild(panel);

        const render = (message = '', messageType = 'info') => {
            const currentTarget = context.targets[context.currentIndex] || null;
            const validation = currentTarget
                ? validateCurrent(context, targetWindow)
                : { valid: false, message: 'Todos os alvos foram processados.' };
            const completed = new Set(context.completedTargets).size;
            const skipped = new Set(context.skippedTargets).size;
            const errors = new Set(
                context.errorTargets.map((item) => item.target)
            ).size;
            const processedTargets = new Set([
                ...context.completedTargets,
                ...context.skippedTargets,
                ...context.errorTargets.map((item) => item.target)
            ]);
            const remaining = Math.max(
                0,
                context.targets.length - processedTargets.size
            );
            const troopLines = Object.entries(context.troopsPerTarget)
                .filter(([, quantity]) => Number(quantity) > 0)
                .map(([unit, quantity]) =>
                    `${Number(quantity)} ${UNIT_NAMES[unit] || unit}`
                );

            content.innerHTML = '';
            const summary = doc.createElement('div');
            summary.className = 'fake-execution-summary';
            summary.innerHTML = `
                <div><strong>Aldeia</strong><span>${EAS.Utils.escapeHtml(context.villageName || '-')}<br>${EAS.Utils.escapeHtml(context.villageCoord || '-')}</span></div>
                <div><strong>Preset</strong><span>${EAS.Utils.escapeHtml(PRESET_NAMES[context.preset] || context.preset || '-')}</span></div>
                <div><strong>Comando</strong><span>${context.commandType === 'support' ? 'Apoio' : 'Ataque'}</span></div>
                <div><strong>Alvo</strong><span>${EAS.Utils.escapeHtml(currentTarget || 'Concluído')}</span></div>
                <div><strong>Progresso</strong><span>${Math.min(context.currentIndex + 1, context.targets.length)} de ${context.targets.length}</span></div>
                <div><strong>Restantes</strong><span>${remaining}</span></div>
            `;

            const troops = doc.createElement('div');
            troops.className = 'fake-execution-troops';
            troops.innerHTML = `<strong>Tropas por alvo</strong><ul>${troopLines.map((line) => `<li>${EAS.Utils.escapeHtml(line)}</li>`).join('')}</ul>`;

            const executionStatus = doc.createElement('div');
            executionStatus.className = 'fake-execution-status-grid';
            executionStatus.innerHTML = `
                <span>Total: ${context.targets.length}</span>
                <span>Concluídos: ${completed}</span>
                <span>Pulados: ${skipped}</span>
                <span>Erros: ${errors}</span>
                <span>Restantes: ${remaining}</span>
            `;

            const targetList = doc.createElement('ol');
            targetList.className = 'fake-execution-targets';
            context.targets.forEach((target, index) => {
                const item = doc.createElement('li');
                const status = getTargetStatus(context, target, index);
                item.className = `fake-execution-${status
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()}`;
                item.textContent = `${target} — ${status}`;
                targetList.appendChild(item);
            });

            const notice = doc.createElement('div');
            notice.className = `eas-status eas-status--${message
                ? messageType
                : validation.valid ? 'success' : 'error'}`;
            notice.textContent = message || (
                validation.valid
                    ? 'Alvo pronto para preparação.'
                    : validation.message
            );

            const actions = doc.createElement('div');
            actions.className = 'fake-execution-actions';
            const addButton = ({ text, className = '', disabled = false, onClick }) => {
                const button = doc.createElement('button');
                button.type = 'button';
                button.className = `eas-button ${className}`.trim();
                button.textContent = text;
                button.disabled = disabled;
                button.addEventListener('click', onClick);
                actions.appendChild(button);
            };

            addButton({
                text: 'Preparar',
                disabled: !validation.valid,
                onClick: () => {
                    const result = prepareCurrent(context, targetWindow);
                    render(
                        result.valid
                            ? 'Alvo preparado. Nenhum comando foi enviado.'
                            : result.message,
                        result.valid ? 'success' : 'error'
                    );
                }
            });
            addButton({
                text: 'Atacar',
                disabled: !validation.valid || context.commandType !== 'attack',
                onClick: () => {
                    const result = prepareCurrent(context, targetWindow);
                    const commandButton = result.valid
                        ? findCommandButton(result.form, 'attack')
                        : null;

                    if (!result.valid || !commandButton) {
                        render(
                            result.valid
                                ? 'Botão de ataque não encontrado.'
                                : result.message,
                            'error'
                        );
                        return;
                    }

                    clearOtherTargetStatuses(context, result.target, 'completed');
                    uniquePush(context.completedTargets, result.target);
                    context.currentIndex += 1;
                    saveContext(context);
                    render(
                        'Ataque encaminhado para confirmação. O próximo alvo não foi preparado.',
                        'success'
                    );
                    commandButton.click();
                }
            });
            addButton({
                text: 'Apoiar',
                disabled: !validation.valid || context.commandType !== 'support',
                onClick: () => {
                    const result = prepareCurrent(context, targetWindow);
                    const commandButton = result.valid
                        ? findCommandButton(result.form, 'support')
                        : null;

                    if (!result.valid || !commandButton) {
                        render(
                            result.valid
                                ? 'Botão de apoio não encontrado.'
                                : result.message,
                            'error'
                        );
                        return;
                    }

                    clearOtherTargetStatuses(context, result.target, 'completed');
                    uniquePush(context.completedTargets, result.target);
                    context.currentIndex += 1;
                    saveContext(context);
                    render(
                        'Apoio encaminhado para confirmação. O próximo alvo não foi preparado.',
                        'success'
                    );
                    commandButton.click();
                }
            });
            addButton({
                text: 'Pular alvo',
                disabled: !currentTarget,
                className: 'eas-button--secondary',
                onClick: () => {
                    clearOtherTargetStatuses(context, currentTarget, 'skipped');
                    uniquePush(context.skippedTargets, currentTarget);
                    context.currentIndex += 1;
                    saveContext(context);
                    render('Alvo pulado.', 'info');
                }
            });
            addButton({
                text: 'Marcar erro e pular',
                disabled: !currentTarget,
                className: 'eas-button--secondary',
                onClick: () => {
                    clearOtherTargetStatuses(context, currentTarget, 'error');
                    if (!context.errorTargets.some(
                        (item) => item.target === currentTarget
                    )) {
                        context.errorTargets.push({
                            target: currentTarget,
                            reason: validation.valid
                                ? 'manual-error'
                                : 'invalid-target'
                        });
                    }
                    context.currentIndex += 1;
                    saveContext(context);
                    render('Alvo marcado como erro.', 'error');
                }
            });
            addButton({
                text: 'Voltar um alvo',
                disabled: context.currentIndex <= 0,
                className: 'eas-button--secondary',
                onClick: () => {
                    context.currentIndex = Math.max(0, context.currentIndex - 1);
                    saveContext(context);
                    render();
                }
            });
            addButton({
                text: 'Encerrar execução',
                className: 'eas-button--secondary',
                onClick: () => {
                    removeContext();
                    panel.remove();
                }
            });

            content.appendChild(summary);
            content.appendChild(troops);
            content.appendChild(executionStatus);
            content.appendChild(targetList);
            content.appendChild(notice);
            content.appendChild(actions);
        };

        render();
        return true;
    };

    EAS.FakesExecution.start = (context) => {
        const execution = normalizeContext({
            ...context,
            currentIndex: 0,
            preparedTargets: [],
            skippedTargets: [],
            completedTargets: [],
            errorTargets: [],
            createdAt: Date.now()
        });

        if (!saveContext(execution)) {
            return Promise.resolve(false);
        }

        const childWindow = EAS.Place.openVillagePlace(execution.villageId);

        if (!childWindow) {
            return Promise.resolve(false);
        }

        return new Promise((resolve) => {
            const startedAt = Date.now();
            const timer = setInterval(() => {
                if (childWindow.closed) {
                    clearInterval(timer);
                    resolve(false);
                    return;
                }

                try {
                    if (
                        childWindow.document.readyState !== 'loading' &&
                        isMatchingPlace(execution, childWindow)
                    ) {
                        clearInterval(timer);
                        resolve(mountPanel(childWindow));
                        return;
                    }
                } catch {
                    // Same-origin access can fail briefly while navigating.
                }

                if (Date.now() - startedAt >= OPEN_TIMEOUT_MS) {
                    clearInterval(timer);
                    resolve(false);
                }
            }, POLL_INTERVAL_MS);
        });
    };

    EAS.FakesExecution.initialize = () => {
        const context = readContext();

        return context && isMatchingPlace(context, window)
            ? mountPanel(window)
            : false;
    };

    EAS.FakesExecution.mountPanel = mountPanel;
    EAS.FakesExecution.readContext = readContext;
})();
