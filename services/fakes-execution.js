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
        const queue = Array.isArray(context?.queue) ? context.queue : [];
        const allowedVillageIds = queue.length
            ? queue.map((entry) => Number(entry.villageId))
            : [Number(context?.villageId || 0)];

        return screen.screen === 'place' &&
            allowedVillageIds.includes(Number(screen.villageId));
    };

    const normalizeContext = (context) => {
        const legacyTargets = Array.isArray(context?.targets)
            ? context.targets
            : [];
        const queue = Array.isArray(context?.queue) && context.queue.length
            ? context.queue.map((entry) => ({
                ...entry,
                villageId: Number(entry.villageId || 0),
                status: entry.status || 'pending'
            }))
            : legacyTargets.map((target) => ({
                villageId: Number(context?.villageId || 0),
                villageName: context?.villageName || '',
                villageCoord: context?.villageCoord || '',
                target,
                status: 'pending'
            }));

        return {
            ...context,
            queue,
            targets: legacyTargets,
            troopsPerTarget: { ...(context?.troopsPerTarget || {}) },
            currentIndex: Math.max(0, Number(context?.currentIndex || 0)),
            prepared: Array.isArray(context?.prepared)
                ? [...context.prepared]
                : Array.isArray(context?.preparedTargets)
                    ? [...context.preparedTargets]
                    : [],
            skipped: Array.isArray(context?.skipped)
                ? [...context.skipped]
                : Array.isArray(context?.skippedTargets)
                    ? [...context.skippedTargets]
                    : [],
            completed: Array.isArray(context?.completed)
                ? [...context.completed]
                : Array.isArray(context?.completedTargets)
                    ? [...context.completedTargets]
                    : [],
            errors: Array.isArray(context?.errors)
                ? [...context.errors]
                : Array.isArray(context?.errorTargets)
                    ? [...context.errorTargets]
                    : []
        };
    };

    const getCurrentEntry = (context) => {
        return context.queue[context.currentIndex] || null;
    };

    const getCommandKey = (entry, index) => {
        return `${index}:${entry?.villageId || 0}:${entry?.target || ''}`;
    };

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
            removeValue(context.completed, target);
        }

        if (keptStatus !== 'skipped') {
            removeValue(context.skipped, target);
        }

        if (keptStatus !== 'error') {
            context.errors = context.errors.filter(
                (item) => item.commandKey !== target
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
        const entry = getCurrentEntry(context);
        const parsedTarget = EAS.Utils.parseCoordinate(entry?.target);
        const form = EAS.Place.getCommandForm(targetWindow.document);
        const requiredTroops = Object.entries(context.troopsPerTarget)
            .filter(([, quantity]) => Number(quantity) > 0);

        if (!parsedTarget) {
            return { valid: false, message: 'Alvo inválido.' };
        }

        if (
            Number(getScreen(targetWindow).villageId) !==
            Number(entry.villageId)
        ) {
            return {
                valid: false,
                wrongVillage: true,
                message: `Abra a aldeia ${entry.villageName} (${entry.villageCoord}) para continuar.`
            };
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

        const worldRule = EAS.WorldRules.get();
        const commandPopulation = EAS.Units.calculateCommandPopulation(
            context.troopsPerTarget
        );

        if (
            context.commandType === 'attack' &&
            worldRule?.minimumAttackPopulation > commandPopulation
        ) {
            return {
                valid: false,
                populationInvalid: true,
                commandPopulation,
                minimumPopulation: worldRule.minimumAttackPopulation,
                message: `Composição inválida para ataques neste mundo. População atual: ${commandPopulation}. Mínima: ${worldRule.minimumAttackPopulation}. Faltam: ${worldRule.minimumAttackPopulation - commandPopulation}.`
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

        const cachedTroops = getCachedTroops(entry.villageId);
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
            entry,
            commandKey: getCommandKey(entry, context.currentIndex),
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

        uniquePush(context.prepared, validation.commandKey);
        validation.entry.status = 'prepared';
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

    const normalizeMessageText = (value) => {
        return String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const parseMinimumPopulationError = (value) => {
        const text = normalizeMessageText(value);
        const match = text.match(
            /cada ataque.*?pelo menos\s+(\d+)\s+de populacao.*?tentando enviar\s+(\d+)/i
        );

        return match
            ? {
                minimumPopulation: Number(match[1]),
                attemptedPopulation: Number(match[2])
            }
            : null;
    };

    const detectMinimumPopulationError = (targetDocument) => {
        const selectors = [
            '.error',
            '.error_box',
            '.error-message',
            '#error',
            '.warn',
            '.warning'
        ];
        const candidates = Array.from(
            targetDocument.querySelectorAll(selectors.join(','))
        ).filter((element) =>
            !element.hidden &&
            element.getAttribute('aria-hidden') !== 'true' &&
            element.style.display !== 'none' &&
            element.style.visibility !== 'hidden'
        );

        for (const element of candidates) {
            const detected = parseMinimumPopulationError(element.textContent);

            if (detected) {
                return detected;
            }
        }

        const main = targetDocument.querySelector(
            '#content_value, #contentContainer, main'
        ) || targetDocument.body;

        return parseMinimumPopulationError(main?.textContent);
    };

    const isConfirmationScreen = (targetDocument) => {
        return Boolean(targetDocument.querySelector(
            '#command-confirm-form, form[action*="action=command"] input[name="h"]'
        ));
    };

    const rejectForMinimumPopulation = (context, entryIndex, detected) => {
        const entry = context.queue[entryIndex];
        const commandKey = getCommandKey(entry, entryIndex);
        clearOtherTargetStatuses(context, commandKey, 'error');
        context.errors.push({
            commandKey,
            target: entry?.target,
            villageId: entry?.villageId,
            reason: 'minimum-attack-population',
            minimumPopulation: detected.minimumPopulation,
            attemptedPopulation: detected.attemptedPopulation
        });
        if (entry) {
            entry.status = 'rejected-minimum-population';
        }
        context.forwardingIndex = null;
        context.lastPopulationRejection = {
            target: entry?.target,
            ...detected,
            detectedAt: Date.now()
        };
        EAS.WorldRules.setMinimumAttackPopulation(
            detected.minimumPopulation,
            {
                attemptedPopulation: detected.attemptedPopulation,
                source: 'game-error'
            }
        );
        saveContext(context);
    };

    const completeForwardedTarget = (context, entryIndex) => {
        const entry = context.queue[entryIndex];
        const commandKey = getCommandKey(entry, entryIndex);
        clearOtherTargetStatuses(context, commandKey, 'completed');
        uniquePush(context.completed, commandKey);

        if (entry) {
            entry.status = 'forwarded';
        }

        if (context.currentIndex === entryIndex) {
            context.currentIndex += 1;
        }

        context.forwardingIndex = null;
        context.lastPopulationRejection = null;
        saveContext(context);
    };

    const watchCommandResult = ({
        context,
        entryIndex,
        targetWindow,
        onRejected,
        onConfirmed,
        onTimeout
    }) => {
        const startedAt = Date.now();
        let observedDocument = targetWindow.document;
        let observer = null;
        let timer = null;

        const stop = () => {
            observer?.disconnect();
            clearInterval(timer);
        };
        const inspect = () => {
            let currentDocument;

            try {
                currentDocument = targetWindow.document;
            } catch {
                return;
            }

            if (currentDocument !== observedDocument) {
                observer?.disconnect();
                observedDocument = currentDocument;
                observeMain();
            }

            const detected = detectMinimumPopulationError(currentDocument);

            if (detected && context.commandType === 'attack') {
                stop();
                rejectForMinimumPopulation(context, entryIndex, detected);
                onRejected(detected);
                return;
            }

            if (isConfirmationScreen(currentDocument)) {
                stop();
                completeForwardedTarget(context, entryIndex);
                onConfirmed();
                return;
            }

            if (Date.now() - startedAt >= OPEN_TIMEOUT_MS) {
                stop();
                context.forwardingIndex = null;
                saveContext(context);
                onTimeout();
            }
        };
        const observeMain = () => {
            const main = observedDocument.querySelector(
                '#content_value, #contentContainer, main'
            ) || observedDocument.body;

            if (!main) {
                return;
            }

            observer = new targetWindow.MutationObserver(inspect);
            observer.observe(main, { childList: true, subtree: true });
        };

        observeMain();
        timer = setInterval(inspect, POLL_INTERVAL_MS);
        inspect();

        return stop;
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

    const getTargetStatus = (context, entry, index) => {
        const commandKey = getCommandKey(entry, index);

        if (context.forwardingIndex === index) {
            return 'Encaminhando';
        }

        if (context.errors.some(
            (item) => item.commandKey === commandKey &&
                item.reason === 'minimum-attack-population'
        )) {
            return 'Rejeitado por população mínima';
        }

        if (context.errors.some((item) => item.commandKey === commandKey)) {
            return 'Erro';
        }

        if (context.skipped.includes(commandKey)) {
            return 'Pulado';
        }

        if (context.completed.includes(commandKey)) {
            return 'Enviado';
        }

        if (context.prepared.includes(commandKey)) {
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
        const initialPopulationError = detectMinimumPopulationError(doc);
        const hasForwardingEntry = Number.isInteger(context.forwardingIndex);

        if (
            hasForwardingEntry &&
            context.commandType === 'attack' &&
            initialPopulationError
        ) {
            rejectForMinimumPopulation(
                context,
                context.forwardingIndex,
                initialPopulationError
            );
        } else if (hasForwardingEntry && isConfirmationScreen(doc)) {
            completeForwardedTarget(context, context.forwardingIndex);
        } else if (hasForwardingEntry) {
            context.forwardingIndex = null;
            saveContext(context);
        }

        copyStyles(targetWindow);
        doc.getElementById(PANEL_ID)?.remove();
        let stopResultWatcher = null;

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
        closeButton.addEventListener('click', () => {
            stopResultWatcher?.();
            panel.remove();
        });
        header.appendChild(title);
        header.appendChild(closeButton);

        const content = doc.createElement('div');
        content.className = 'fake-execution-content';
        panel.appendChild(header);
        panel.appendChild(content);
        doc.body.appendChild(panel);

        const render = (message = '', messageType = 'info') => {
            const currentEntry = getCurrentEntry(context);
            const currentTarget = currentEntry?.target || null;
            const currentCommandKey = currentEntry
                ? getCommandKey(currentEntry, context.currentIndex)
                : null;
            const validation = currentEntry
                ? validateCurrent(context, targetWindow)
                : { valid: false, message: 'Todos os alvos foram processados.' };
            const completed = new Set(context.completed).size;
            const skipped = new Set(context.skipped).size;
            const errors = new Set(
                context.errors.map((item) => item.commandKey)
            ).size;
            const processedTargets = new Set([
                ...context.completed,
                ...context.skipped,
                ...context.errors
                    .filter((item) =>
                        item.reason !== 'minimum-attack-population'
                    )
                    .map((item) => item.commandKey)
            ]);
            const remaining = Math.max(
                0,
                context.queue.length - processedTargets.size
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
                <div><strong>Aldeia necessária</strong><span>${EAS.Utils.escapeHtml(currentEntry?.villageName || '-')}<br>${EAS.Utils.escapeHtml(currentEntry?.villageCoord || '-')}</span></div>
                <div><strong>Preset</strong><span>${EAS.Utils.escapeHtml(PRESET_NAMES[context.preset] || context.preset || '-')}</span></div>
                <div><strong>Comando</strong><span>${context.commandType === 'support' ? 'Apoio' : 'Ataque'}</span></div>
                <div><strong>Alvo</strong><span>${EAS.Utils.escapeHtml(currentTarget || 'Concluído')}</span></div>
                <div><strong>Progresso</strong><span>${Math.min(context.currentIndex + 1, context.queue.length)} de ${context.queue.length}</span></div>
                <div><strong>Restantes</strong><span>${remaining}</span></div>
            `;

            const troops = doc.createElement('div');
            troops.className = 'fake-execution-troops';
            troops.innerHTML = `<strong>Tropas por alvo</strong><ul>${troopLines.map((line) => `<li>${EAS.Utils.escapeHtml(line)}</li>`).join('')}</ul>`;

            const executionStatus = doc.createElement('div');
            executionStatus.className = 'fake-execution-status-grid';
            executionStatus.innerHTML = `
                <span>Total: ${context.queue.length}</span>
                <span>Concluídos: ${completed}</span>
                <span>Pulados: ${skipped}</span>
                <span>Erros: ${errors}</span>
                <span>Restantes: ${remaining}</span>
            `;

            const targetList = doc.createElement('ol');
            targetList.className = 'fake-execution-targets fake-execution-queue';
            context.queue.forEach((entry, index) => {
                const item = doc.createElement('li');
                const status = getTargetStatus(context, entry, index);
                item.className = `fake-execution-${status
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')}`;
                item.textContent = `${entry.villageName} → ${entry.target} — ${status}`;
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

            if (validation.wrongVillage && currentEntry) {
                addButton({
                    text: 'Abrir aldeia e Praça',
                    onClick: () => {
                        EAS.FakesExecution.openCurrentVillage(context);
                    }
                });
            }

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
                disabled: !validation.valid ||
                    context.commandType !== 'attack' ||
                    Number.isInteger(context.forwardingIndex),
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

                    context.forwardingIndex = context.currentIndex;
                    context.forwardingStartedAt = Date.now();
                    result.entry.status = 'forwarding';
                    saveContext(context);
                    render(
                        'Encaminhando ataque. Aguardando resposta do jogo...',
                        'info'
                    );
                    stopResultWatcher = watchCommandResult({
                        context,
                        entryIndex: context.currentIndex,
                        targetWindow,
                        onRejected: (detected) => render(
                            `Regra do mundo detectada. Este mundo exige no mínimo ${detected.minimumPopulation} de população por ataque. A composição atual possui ${detected.attemptedPopulation}. Reanalise a operação ou ajuste as tropas.`,
                            'error'
                        ),
                        onConfirmed: () => render(
                            'Ataque encaminhado para confirmação. O próximo alvo não foi preparado.',
                            'success'
                        ),
                        onTimeout: () => render(
                            'Não foi possível confirmar o avanço. O alvo atual foi mantido.',
                            'error'
                        )
                    });
                    commandButton.click();
                }
            });
            addButton({
                text: 'Apoiar',
                disabled: !validation.valid ||
                    context.commandType !== 'support' ||
                    Number.isInteger(context.forwardingIndex),
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

                    context.forwardingIndex = context.currentIndex;
                    context.forwardingStartedAt = Date.now();
                    result.entry.status = 'forwarding';
                    saveContext(context);
                    render(
                        'Encaminhando apoio. Aguardando resposta do jogo...',
                        'info'
                    );
                    stopResultWatcher = watchCommandResult({
                        context,
                        entryIndex: context.currentIndex,
                        targetWindow,
                        onRejected: () => render(
                            'O apoio foi rejeitado pelo jogo. O alvo atual foi mantido.',
                            'error'
                        ),
                        onConfirmed: () => render(
                            'Apoio encaminhado para confirmação. O próximo alvo não foi preparado.',
                            'success'
                        ),
                        onTimeout: () => render(
                            'Não foi possível confirmar o avanço. O alvo atual foi mantido.',
                            'error'
                        )
                    });
                    commandButton.click();
                }
            });
            if (context.lastPopulationRejection) {
                addButton({
                    text: 'Reanalisar operação',
                    onClick: () => {
                        const saved = [
                            ['eas_tw_fakes_selected_preset', context.preset],
                            ['eas_tw_fakes_command_type', context.commandType],
                            ['eas_tw_fakes_troops', context.troopsPerTarget],
                            ['eas_tw_fakes_coordinates', [...new Set(
                                context.queue.map((entry) => entry.target)
                            )].join('\n')],
                            ['eas_tw_fakes_per_target', context.fakesPerTarget || 1],
                            ['eas_tw_fakes_selected_villages', context.selectedVillageIds || []]
                        ];

                        saved.forEach(([key, value]) => {
                            localStorage.setItem(key, JSON.stringify(value));
                        });
                        EAS.UI.loadModule('fakes').then((module) => {
                            module.open({ autoAnalyze: true });
                            panel.remove();
                        });
                    }
                });
            }
            addButton({
                text: 'Pular alvo',
                disabled: !currentEntry || Number.isInteger(context.forwardingIndex),
                className: 'eas-button--secondary',
                onClick: () => {
                    clearOtherTargetStatuses(context, currentCommandKey, 'skipped');
                    uniquePush(context.skipped, currentCommandKey);
                    currentEntry.status = 'skipped';
                    context.currentIndex += 1;
                    saveContext(context);
                    render('Alvo pulado.', 'info');
                }
            });
            addButton({
                text: 'Marcar erro e pular',
                disabled: !currentEntry || Number.isInteger(context.forwardingIndex),
                className: 'eas-button--secondary',
                onClick: () => {
                    clearOtherTargetStatuses(context, currentCommandKey, 'error');
                    if (!context.errors.some(
                        (item) => item.commandKey === currentCommandKey
                    )) {
                        context.errors.push({
                            commandKey: currentCommandKey,
                            target: currentTarget,
                            villageId: currentEntry.villageId,
                            reason: validation.valid
                                ? 'manual-error'
                                : 'invalid-target'
                        });
                    }
                    currentEntry.status = 'error';
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
                    stopResultWatcher?.();
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

    const openCurrentVillage = (providedContext = null) => {
        const execution = normalizeContext(providedContext || readContext());
        const entry = getCurrentEntry(execution);
        const childWindow = EAS.Place.openVillagePlace(entry?.villageId);

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

    EAS.FakesExecution.start = (context) => {
        const execution = normalizeContext({
            ...context,
            currentIndex: 0,
            prepared: [],
            skipped: [],
            completed: [],
            errors: [],
            createdAt: Date.now()
        });

        if (!saveContext(execution)) {
            return Promise.resolve(false);
        }

        return openCurrentVillage(execution);
    };

    EAS.FakesExecution.openCurrentVillage = openCurrentVillage;

    EAS.FakesExecution.initialize = () => {
        const context = readContext();

        return context && isMatchingPlace(context, window)
            ? mountPanel(window)
            : false;
    };

    EAS.FakesExecution.mountPanel = mountPanel;
    EAS.FakesExecution.readContext = readContext;
    EAS.FakesExecution.parseMinimumPopulationError = parseMinimumPopulationError;
    EAS.FakesExecution.detectMinimumPopulationError = detectMinimumPopulationError;
})();
