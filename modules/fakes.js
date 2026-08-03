(() => {
    'use strict';

    EAS.Modules = EAS.Modules || {};
    EAS.Modules.Fakes = EAS.Modules.Fakes || {};

    const STORAGE_KEYS = {
        preset: 'eas_tw_fakes_selected_preset',
        commandType: 'eas_tw_fakes_command_type',
        troops: 'eas_tw_fakes_troops',
        coordinates: 'eas_tw_fakes_coordinates'
    };

    const UNIT_DEFINITIONS = [
        { id: 'spear', name: 'Lanceiro', plural: 'Lanceiros' },
        { id: 'sword', name: 'Espadachim', plural: 'Espadachins' },
        { id: 'axe', name: 'Bárbaro', plural: 'Bárbaros' },
        { id: 'archer', name: 'Arqueiro', plural: 'Arqueiros' },
        { id: 'spy', name: 'Explorador', plural: 'Exploradores' },
        { id: 'light', name: 'Cavalaria leve', plural: 'Cavalarias leves' },
        { id: 'marcher', name: 'Arqueiro montado', plural: 'Arqueiros montados' },
        { id: 'heavy', name: 'Cavalaria pesada', plural: 'Cavalarias pesadas' },
        { id: 'ram', name: 'Aríete', plural: 'Aríetes' },
        { id: 'catapult', name: 'Catapulta', plural: 'Catapultas' },
        { id: 'knight', name: 'Paladino', plural: 'Paladinos' },
        { id: 'snob', name: 'Nobre', plural: 'Nobres' }
    ];

    const FAKE_PRESETS = {
        simple: {
            id: 'simple',
            name: 'Fake simples',
            commandType: 'attack',
            troops: { spear: 1, sword: 1 }
        },
        nt: {
            id: 'nt',
            name: 'Fake NT',
            commandType: 'attack',
            troops: {}
        },
        antiSnipe: {
            id: 'antiSnipe',
            name: 'Fake Anti-Snipe',
            commandType: 'support',
            troops: {}
        },
        custom: {
            id: 'custom',
            name: 'Fake personalizado',
            commandType: 'attack',
            troops: {}
        }
    };

    const readStorage = (key, fallback = null) => {
        try {
            const value = localStorage.getItem(key);
            return value === null ? fallback : JSON.parse(value);
        } catch {
            return fallback;
        }
    };

    const writeStorage = (key, value) => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    };

    const normalizeQuantity = (value) => {
        const quantity = Math.floor(Number(value));
        return Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
    };

    const extractCoordinates = (value, removeDuplicates = true) => {
        const matches = String(value ?? '').matchAll(/(\d{1,3})\s*\|\s*(\d{1,3})/g);
        const coordinates = Array.from(matches, (match) => {
            const parsed = EAS.Utils.parseCoordinate(`${match[1]}|${match[2]}`);

            if (!parsed) {
                return null;
            }

            return `${String(parsed.x).padStart(3, '0')}|${String(parsed.y).padStart(3, '0')}`;
        }).filter(Boolean);

        return removeDuplicates ? [...new Set(coordinates)] : coordinates;
    };

    const getAvailableUnits = () => {
        const knownUnits = new Set(UNIT_DEFINITIONS.map((unit) => unit.id));
        const detectedOrder = EAS.Troops.getSourceInfo?.().unitOrder || [];
        const gameUnits = EAS.World.getGameData?.().units;
        const detected = detectedOrder.length
            ? detectedOrder
            : Array.isArray(gameUnits)
                ? gameUnits
                : Object.keys(gameUnits || {});
        const available = detected.filter((unit) => knownUnits.has(unit));

        return available.length
            ? UNIT_DEFINITIONS.filter((unit) => available.includes(unit.id))
            : UNIT_DEFINITIONS;
    };

    const createSelect = (name, options, value) => {
        const select = document.createElement('select');
        select.className = 'eas-input';
        select.name = name;

        options.forEach((optionData) => {
            const option = document.createElement('option');
            option.value = optionData.value;
            option.textContent = optionData.label;
            select.appendChild(option);
        });

        select.value = value;
        return select;
    };

    const formatTroopLines = (troops, targetCount, units) => {
        return units
            .filter((unit) => normalizeQuantity(troops[unit.id]) > 0)
            .map((unit) => {
                const perTarget = normalizeQuantity(troops[unit.id]);
                const quantity = perTarget * targetCount;
                return {
                    perTarget: `${perTarget} ${perTarget === 1 ? unit.name : unit.plural}`,
                    total: `${quantity} ${quantity === 1 ? unit.name : unit.plural}`
                };
            });
    };

    EAS.Modules.Fakes.extractCoordinates = extractCoordinates;
    EAS.Modules.Fakes.presets = FAKE_PRESETS;

    EAS.Modules.Fakes.open = () => {
        const savedPresetId = readStorage(STORAGE_KEYS.preset, 'simple');
        const selectedPreset = FAKE_PRESETS[savedPresetId] || FAKE_PRESETS.simple;
        const savedCommandType = readStorage(
            STORAGE_KEYS.commandType,
            selectedPreset.commandType
        );
        const savedTroops = readStorage(STORAGE_KEYS.troops, selectedPreset.troops);
        const savedCoordinates = readStorage(STORAGE_KEYS.coordinates, '');
        const availableUnits = getAvailableUnits();

        const win = EAS.UI.createWindow({
            id: 'eas-module-fakes',
            title: 'Gerenciador de Fakes',
            icon: '🎭',
            width: 820,
            className: 'fake-manager-window'
        });

        const manager = document.createElement('div');
        manager.className = 'fake-manager';

        const description = document.createElement('p');
        description.className = 'fake-manager__description';
        description.textContent = 'Planeje e prepare comandos falsos de ataque ou apoio utilizando presets de tropas.';

        const presetsForm = document.createElement('div');
        presetsForm.className = 'eas-form fake-manager-presets';
        const presetSelect = createSelect(
            'fake-preset',
            Object.values(FAKE_PRESETS).map((preset) => ({
                value: preset.id,
                label: preset.name
            })),
            selectedPreset.id
        );
        const commandTypeSelect = createSelect(
            'command-type',
            [
                { value: 'attack', label: 'Ataque' },
                { value: 'support', label: 'Apoio' }
            ],
            ['attack', 'support'].includes(savedCommandType)
                ? savedCommandType
                : selectedPreset.commandType
        );
        presetsForm.appendChild(EAS.UI.createField({
            label: 'Tipo de fake',
            input: presetSelect
        }));
        presetsForm.appendChild(EAS.UI.createField({
            label: 'Tipo de comando',
            input: commandTypeSelect
        }));

        const troopsSection = document.createElement('section');
        troopsSection.className = 'fake-manager-troops';
        const troopsTitle = document.createElement('h3');
        troopsTitle.textContent = 'Tropas por alvo';
        const troopsGrid = document.createElement('div');
        troopsGrid.className = 'fake-manager-troops__grid';
        const troopInputs = {};

        availableUnits.forEach((unit) => {
            const input = EAS.UI.createInput({
                type: 'number',
                value: normalizeQuantity(savedTroops?.[unit.id]),
                name: `fake-troops-${unit.id}`,
                min: 0
            });
            input.step = '1';
            troopInputs[unit.id] = input;
            troopsGrid.appendChild(EAS.UI.createField({
                label: unit.name,
                input
            }));
        });
        troopsSection.appendChild(troopsTitle);
        troopsSection.appendChild(troopsGrid);

        const targetsSection = document.createElement('section');
        targetsSection.className = 'fake-manager-targets';
        const targetsTitle = document.createElement('h3');
        targetsTitle.textContent = 'Coordenadas dos alvos';
        const coordinatesInput = document.createElement('textarea');
        coordinatesInput.className = 'eas-input';
        coordinatesInput.name = 'fake-targets';
        coordinatesInput.placeholder = '605|485\n617|473\n618|484';
        coordinatesInput.value = String(savedCoordinates || '');
        const targetCount = document.createElement('small');
        targetCount.className = 'fake-manager-target-count';
        targetsSection.appendChild(targetsTitle);
        targetsSection.appendChild(coordinatesInput);
        targetsSection.appendChild(targetCount);

        const summarySection = document.createElement('section');
        summarySection.className = 'fake-manager-summary';
        const summaryTitle = document.createElement('h3');
        summaryTitle.textContent = 'Resumo da operação';
        const summaryContent = document.createElement('div');
        summarySection.appendChild(summaryTitle);
        summarySection.appendChild(summaryContent);

        const status = document.createElement('div');
        status.className = 'eas-status eas-status--info';
        status.textContent = 'Revise os dados da operação.';

        const getTroops = () => availableUnits.reduce((troops, unit) => {
            troops[unit.id] = normalizeQuantity(troopInputs[unit.id].value);
            return troops;
        }, {});

        const updateSummary = () => {
            const preset = FAKE_PRESETS[presetSelect.value] || FAKE_PRESETS.custom;
            const coordinates = extractCoordinates(coordinatesInput.value);
            const troops = getTroops();
            const troopLines = formatTroopLines(troops, coordinates.length, availableUnits);
            const escape = EAS.Utils.escapeHtml;
            const list = (lines) => lines.length
                ? `<ul>${lines.map((line) => `<li>${escape(line)}</li>`).join('')}</ul>`
                : '<span>Nenhuma tropa informada.</span>';

            targetCount.textContent = `${coordinates.length} coordenada${coordinates.length === 1 ? '' : 's'} válida${coordinates.length === 1 ? '' : 's'} encontrada${coordinates.length === 1 ? '' : 's'}.`;
            summaryContent.innerHTML = `
                <p><strong>${escape(preset.name)}</strong><br>
                Comando: ${commandTypeSelect.value === 'support' ? 'Apoio' : 'Ataque'}<br>
                Alvos: ${coordinates.length}</p>
                <div class="fake-manager-summary__grid">
                    <div class="fake-manager-summary__block">
                        <strong>Por alvo</strong>
                        ${list(troopLines.map((line) => line.perTarget))}
                    </div>
                    <div class="fake-manager-summary__block">
                        <strong>Total necessário</strong>
                        ${list(troopLines.map((line) => line.total))}
                    </div>
                </div>
            `;

            return { coordinates, troops };
        };

        const applyPreset = () => {
            const preset = FAKE_PRESETS[presetSelect.value] || FAKE_PRESETS.custom;
            commandTypeSelect.value = preset.commandType;
            availableUnits.forEach((unit) => {
                troopInputs[unit.id].value = normalizeQuantity(preset.troops[unit.id]);
            });
            updateSummary();
        };

        presetSelect.addEventListener('change', applyPreset);
        commandTypeSelect.addEventListener('change', updateSummary);
        coordinatesInput.addEventListener('input', updateSummary);
        Object.values(troopInputs).forEach((input) => {
            input.addEventListener('input', updateSummary);
        });

        const actions = document.createElement('div');
        actions.className = 'eas-actions';
        const analyzeButton = EAS.UI.createButton({
            text: 'Analisar operação',
            icon: '🔍',
            onClick: () => {
                const operation = updateSummary();
                const hasTroops = Object.values(operation.troops).some((value) => value > 0);

                if (!operation.coordinates.length || !hasTroops) {
                    EAS.UI.showStatus({
                        target: status,
                        message: !operation.coordinates.length
                            ? 'Informe ao menos uma coordenada válida.'
                            : 'Informe ao menos uma unidade por alvo.',
                        type: 'error'
                    });
                    return;
                }

                EAS.UI.showStatus({
                    target: status,
                    message: `Operação analisada: ${operation.coordinates.length} alvo${operation.coordinates.length === 1 ? '' : 's'}. Nenhum comando foi enviado.`,
                    type: 'success'
                });
            }
        });
        const clearButton = EAS.UI.createButton({
            text: 'Limpar',
            icon: '🧹',
            className: 'eas-button--secondary',
            onClick: () => {
                coordinatesInput.value = '';
                Object.values(troopInputs).forEach((input) => {
                    input.value = 0;
                });
                updateSummary();
                EAS.UI.showStatus({
                    target: status,
                    message: 'Coordenadas e quantidades foram limpas.',
                    type: 'info'
                });
            }
        });
        const saveButton = EAS.UI.createButton({
            text: 'Salvar configuração',
            icon: '💾',
            onClick: () => {
                const operation = updateSummary();
                const saved = [
                    writeStorage(STORAGE_KEYS.preset, presetSelect.value),
                    writeStorage(STORAGE_KEYS.commandType, commandTypeSelect.value),
                    writeStorage(STORAGE_KEYS.troops, operation.troops),
                    writeStorage(STORAGE_KEYS.coordinates, coordinatesInput.value)
                ].every(Boolean);

                EAS.UI.showStatus({
                    target: status,
                    message: saved
                        ? 'Configuração salva neste navegador.'
                        : 'Não foi possível salvar a configuração neste navegador.',
                    type: saved ? 'success' : 'error'
                });
            }
        });
        const backButton = EAS.UI.createButton({
            text: 'Voltar ao menu',
            icon: '←',
            className: 'eas-button--secondary',
            onClick: () => {
                win.close();
                EAS.UI.openMainWindow();
            }
        });

        actions.appendChild(analyzeButton);
        actions.appendChild(clearButton);
        actions.appendChild(saveButton);
        actions.appendChild(backButton);

        manager.appendChild(description);
        manager.appendChild(presetsForm);
        manager.appendChild(troopsSection);
        manager.appendChild(targetsSection);
        manager.appendChild(summarySection);
        manager.appendChild(actions);
        manager.appendChild(status);
        win.body.appendChild(manager);
        updateSummary();
    };
})();
