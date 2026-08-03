(() => {
    'use strict';

    EAS.Modules = EAS.Modules || {};
    EAS.Modules.Fakes = EAS.Modules.Fakes || {};

    const STORAGE_KEYS = {
        preset: 'eas_tw_fakes_selected_preset',
        commandType: 'eas_tw_fakes_command_type',
        troops: 'eas_tw_fakes_troops',
        coordinates: 'eas_tw_fakes_coordinates',
        fakesPerTarget: 'eas_tw_fakes_per_target',
        selectedVillages: 'eas_tw_fakes_selected_villages',
        analysis: 'eas_tw_fakes_analysis'
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

    const calculateFakeCapacity = (availableTroops, troopsPerTarget) => {
        const requiredUnits = Object.entries(troopsPerTarget || {})
            .filter(([, quantity]) => normalizeQuantity(quantity) > 0);

        if (!requiredUnits.length) {
            return {
                capacity: 0,
                limitingUnits: [],
                missingUnits: [],
                sufficient: false
            };
        }

        const capacities = requiredUnits.map(([unit, required]) => ({
            unit,
            capacity: Math.floor(
                normalizeQuantity(availableTroops?.[unit]) /
                normalizeQuantity(required)
            )
        }));
        const capacity = Math.min(...capacities.map((item) => item.capacity));
        const missingUnits = capacities
            .filter((item) => normalizeQuantity(availableTroops?.[item.unit]) === 0)
            .map((item) => item.unit);
        const limitingUnits = capacity > 0
            ? capacities
                .filter((item) => item.capacity === capacity)
                .map((item) => item.unit)
            : [];

        return {
            capacity,
            limitingUnits,
            missingUnits,
            sufficient: capacity > 0
        };
    };

    const distributeTargets = (villageAnalyses, targets) => {
        let targetIndex = 0;

        return villageAnalyses.map((analysis) => {
            const availableSlots = Math.max(0, targets.length - targetIndex);
            const assignmentCount = analysis.sufficient
                ? Math.min(analysis.capacity, availableSlots)
                : 0;
            const assignedTargets = targets.slice(
                targetIndex,
                targetIndex + assignmentCount
            );

            targetIndex += assignmentCount;

            return {
                ...analysis,
                assignedTargets
            };
        });
    };

    const distributeTargetsRoundRobin = (
        villageAnalyses,
        targets,
        fakesPerTarget
    ) => {
        const eligible = villageAnalyses.filter((analysis) =>
            analysis.selected && analysis.sufficient && analysis.capacity > 0
        );
        const remainingCapacity = new Map(
            eligible.map((analysis) => [
                Number(analysis.village.id),
                analysis.capacity
            ])
        );
        let cursor = 0;

        const assignments = targets.map((target) => {
            const sources = [];
            let checked = 0;

            while (
                sources.length < fakesPerTarget &&
                checked < eligible.length
            ) {
                const analysis = eligible[cursor % eligible.length];
                const villageId = Number(analysis.village.id);
                cursor += 1;
                checked += 1;

                if ((remainingCapacity.get(villageId) || 0) < 1) {
                    continue;
                }

                sources.push({
                    villageId,
                    villageName: analysis.village.name,
                    villageCoord: analysis.village.coordinate,
                    commandIndex: sources.length + 1
                });
                remainingCapacity.set(
                    villageId,
                    remainingCapacity.get(villageId) - 1
                );
            }

            return { target, sources };
        });
        const executionQueue = assignments.flatMap((assignment) =>
            assignment.sources.map((source) => ({
                target: assignment.target,
                villageId: source.villageId,
                villageName: source.villageName,
                villageCoord: source.villageCoord,
                status: 'pending'
            }))
        );

        return { assignments, executionQueue, remainingCapacity };
    };

    EAS.Modules.Fakes.extractCoordinates = extractCoordinates;
    EAS.Modules.Fakes.calculateFakeCapacity = calculateFakeCapacity;
    EAS.Modules.Fakes.distributeTargets = distributeTargets;
    EAS.Modules.Fakes.distributeTargetsRoundRobin = distributeTargetsRoundRobin;
    EAS.Modules.Fakes.presets = FAKE_PRESETS;

    EAS.Modules.Fakes.open = ({ autoAnalyze = false } = {}) => {
        const savedPresetId = readStorage(STORAGE_KEYS.preset, 'simple');
        const selectedPreset = FAKE_PRESETS[savedPresetId] || FAKE_PRESETS.simple;
        const savedCommandType = readStorage(
            STORAGE_KEYS.commandType,
            selectedPreset.commandType
        );
        const savedTroops = readStorage(STORAGE_KEYS.troops, selectedPreset.troops);
        const savedCoordinates = readStorage(STORAGE_KEYS.coordinates, '');
        const savedFakesPerTarget = normalizeQuantity(
            readStorage(STORAGE_KEYS.fakesPerTarget, 1)
        ) || 1;
        const savedSelectedVillageIds = readStorage(
            STORAGE_KEYS.selectedVillages,
            null
        );
        const availableUnits = getAvailableUnits();
        let worldRule = EAS.WorldRules.get();

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
        const fakesPerTargetInput = EAS.UI.createInput({
            type: 'number',
            value: savedFakesPerTarget,
            name: 'fakes-per-target',
            min: 1
        });
        fakesPerTargetInput.step = '1';
        presetsForm.appendChild(EAS.UI.createField({
            label: 'Fakes por alvo',
            input: fakesPerTargetInput
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

        const populationSection = document.createElement('section');
        populationSection.className = 'fake-manager-population';
        const populationTitle = document.createElement('h3');
        populationTitle.textContent = 'População mínima do mundo';
        const populationInfo = document.createElement('div');
        populationInfo.className = 'fake-manager-population__info';
        const completionUnitSelect = createSelect(
            'population-completion-unit',
            availableUnits
                .filter((unit) => EAS.Units.getPopulation(unit.id) > 0)
                .map((unit) => ({ value: unit.id, label: unit.name })),
            availableUnits[0]?.id || ''
        );
        const populationActions = document.createElement('div');
        populationActions.className = 'fake-manager-population__actions';
        populationSection.appendChild(populationTitle);
        populationSection.appendChild(populationInfo);
        populationSection.appendChild(EAS.UI.createField({
            label: 'Unidade para completar população',
            input: completionUnitSelect
        }));
        populationSection.appendChild(populationActions);

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
        targetCount.className = 'fake-manager-target-count fake-target-count';
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

        const analysisSection = document.createElement('section');
        analysisSection.className = 'fake-analysis';
        analysisSection.hidden = true;
        const analysisTitle = document.createElement('h3');
        analysisTitle.textContent = 'Análise das aldeias';
        const analysisSummary = document.createElement('div');
        analysisSummary.className = 'fake-analysis-summary';
        const villageSelection = document.createElement('div');
        villageSelection.className = 'fake-village-selection';
        const analysisTable = document.createElement('div');
        analysisTable.className = 'fake-analysis-table eas-table-wrapper';
        const targetDistribution = document.createElement('div');
        targetDistribution.className = 'fake-distribution-grid';
        const prepareOperationContainer = document.createElement('div');
        prepareOperationContainer.className = 'fake-analysis-prepare';
        analysisSection.appendChild(analysisTitle);
        analysisSection.appendChild(analysisSummary);
        analysisSection.appendChild(villageSelection);
        analysisSection.appendChild(analysisTable);
        analysisSection.appendChild(targetDistribution);
        analysisSection.appendChild(prepareOperationContainer);

        const status = document.createElement('div');
        status.className = 'eas-status eas-status--info';
        status.textContent = 'Revise os dados da operação.';
        let currentAnalysis = null;

        const getTroops = () => availableUnits.reduce((troops, unit) => {
            troops[unit.id] = normalizeQuantity(troopInputs[unit.id].value);
            return troops;
        }, {});

        const getPopulationState = (troops = getTroops()) => {
            const commandPopulation = EAS.Units.calculateCommandPopulation(troops);
            const minimumPopulation = Number(
                worldRule?.minimumAttackPopulation || 0
            );
            const applies = commandTypeSelect.value === 'attack' &&
                minimumPopulation > 0;

            return {
                commandPopulation,
                minimumPopulation,
                deficit: applies
                    ? Math.max(0, minimumPopulation - commandPopulation)
                    : 0,
                valid: !applies || commandPopulation >= minimumPopulation
            };
        };

        const renderPopulationRule = () => {
            const population = getPopulationState();
            const selectedUnit = availableUnits.find(
                (unit) => unit.id === completionUnitSelect.value
            );
            const unitPopulation = EAS.Units.getPopulation(selectedUnit?.id);
            const additional = unitPopulation > 0
                ? Math.ceil(population.deficit / unitPopulation)
                : 0;

            if (!worldRule?.minimumAttackPopulation) {
                populationInfo.innerHTML = `
                    <p>Nenhuma regra de população mínima foi detectada para <strong>${EAS.Utils.escapeHtml(EAS.WorldRules.getWorld())}</strong>.</p>
                    <small>A detecção real acontece quando o jogo rejeita um ataque.</small>
                `;
                completionUnitSelect.closest('.eas-field').hidden = true;
                return;
            }

            completionUnitSelect.closest('.eas-field').hidden = false;
            populationInfo.innerHTML = `
                <div class="fake-manager-population__values">
                    <span>Mínimo: <strong>${population.minimumPopulation}</strong></span>
                    <span>Atual: <strong>${population.commandPopulation}</strong></span>
                    <span>Faltam: <strong>${population.deficit}</strong></span>
                </div>
                ${population.deficit > 0 && commandTypeSelect.value === 'attack'
                    ? `<div class="fake-analysis-warning">Composição inválida para ataques neste mundo. Sugestão: adicionar ${additional} ${EAS.Utils.escapeHtml(selectedUnit?.plural || selectedUnit?.name || 'unidades')}.</div>`
                    : '<div class="fake-manager-population__valid">A composição atende à regra conhecida.</div>'}
            `;
        };

        const updateSummary = () => {
            const preset = FAKE_PRESETS[presetSelect.value] || FAKE_PRESETS.custom;
            const coordinates = extractCoordinates(coordinatesInput.value);
            const troops = getTroops();
            const population = getPopulationState(troops);
            const troopLines = formatTroopLines(troops, coordinates.length, availableUnits);
            const escape = EAS.Utils.escapeHtml;
            const list = (lines) => lines.length
                ? `<ul>${lines.map((line) => `<li>${escape(line)}</li>`).join('')}</ul>`
                : '<span>Nenhuma tropa informada.</span>';

            targetCount.textContent = `${coordinates.length} coordenada${coordinates.length === 1 ? '' : 's'} válida${coordinates.length === 1 ? '' : 's'} encontrada${coordinates.length === 1 ? '' : 's'}.`;
            summaryContent.innerHTML = `
                <p><strong>${escape(preset.name)}</strong><br>
                Comando: ${commandTypeSelect.value === 'support' ? 'Apoio' : 'Ataque'}<br>
                Alvos: ${coordinates.length}<br>
                Fakes por alvo: ${Math.max(1, normalizeQuantity(fakesPerTargetInput.value))}<br>
                População por comando: ${population.commandPopulation}</p>
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

            renderPopulationRule();

            return { coordinates, troops, ...population };
        };

        const invalidateAnalysis = () => {
            analysisSection.hidden = true;
            analysisSummary.innerHTML = '';
            analysisTable.innerHTML = '';
            villageSelection.innerHTML = '';
            targetDistribution.innerHTML = '';
            prepareOperationContainer.innerHTML = '';
            currentAnalysis = null;
        };

        const getVillageStatus = (analysis, troopsStale, populationValid) => {
            if (!populationValid) {
                return 'Composição abaixo da população mínima';
            }

            if (!analysis.hasTroopData) {
                return 'Sem dados de tropas';
            }

            if (troopsStale) {
                return 'Dados desatualizados';
            }

            if (analysis.missingUnits.length) {
                return 'Sem a unidade necessária';
            }

            if (!analysis.sufficient) {
                return 'Tropas insuficientes';
            }

            if (!analysis.assignedTargets.length) {
                return 'Não utilizada';
            }

            if (analysis.assignedTargets.length < analysis.capacity) {
                return 'Capacidade parcial';
            }

            return 'Pronto';
        };

        const createAnalysisContext = ({
            operation,
            assignments,
            troopsInfo
        }) => ({
            preset: presetSelect.value,
            commandType: commandTypeSelect.value,
            troopsPerTarget: { ...operation.troops },
            targets: [...operation.coordinates],
            assignments: assignments
                .filter((analysis) => analysis.assignedTargets.length > 0)
                .map((analysis) => ({
                    villageId: analysis.village.id,
                    villageName: analysis.village.name,
                    villageCoord: analysis.village.coordinate,
                    capacity: analysis.capacity,
                    assignedTargets: [...analysis.assignedTargets]
                })),
            troopsSource: troopsInfo.source || 'none',
            troopsUpdatedAt: troopsInfo.updatedAtLocal || null,
            createdAt: Date.now()
        });

        const renderAnalysis = ({ operation, assignments, troopsInfo }) => {
            const escape = EAS.Utils.escapeHtml;
            const withTroopData = assignments.filter(
                (analysis) => analysis.hasTroopData
            ).length;
            const eligible = assignments.filter(
                (analysis) => analysis.sufficient && operation.valid
            ).length;
            const distributed = assignments.reduce(
                (total, analysis) => total + analysis.assignedTargets.length,
                0
            );
            const undistributed = operation.coordinates.length - distributed;
            const totalCapacity = assignments.reduce(
                (total, analysis) => total + analysis.capacity,
                0
            );
            const summaryItems = [
                `${assignments.length} aldeias cadastradas`,
                `${withTroopData} com dados de tropas`,
                `${eligible} aldeias aptas`,
                `${operation.coordinates.length} alvos informados`,
                `${distributed} alvos distribuídos`,
                `${undistributed} alvos sem aldeia disponível`,
                `Capacidade total: ${totalCapacity} comandos`
            ];

            analysisSummary.innerHTML = `
                <div class="fake-analysis-summary__grid">
                    ${summaryItems.map((item) => `<span>${escape(item)}</span>`).join('')}
                </div>
                ${undistributed > 0 && operation.valid
                    ? `<div class="fake-analysis-warning">Faltam tropas para distribuir ${undistributed} alvo${undistributed === 1 ? '' : 's'}.</div>`
                    : ''}
                ${troopsInfo.stale
                    ? '<div class="fake-analysis-warning">O cache de tropas está desatualizado. Atualize as tropas antes de executar a operação.</div>'
                    : ''}
                ${!operation.valid
                    ? `<div class="fake-analysis-warning">Composição abaixo da população mínima. Atual: ${operation.commandPopulation}. Mínimo: ${operation.minimumPopulation}. Faltam: ${operation.deficit}.</div>`
                    : ''}
            `;

            const table = document.createElement('table');
            table.className = 'eas-table';
            table.innerHTML = `
                <thead><tr>
                    <th>Aldeia</th>
                    <th>Coordenada</th>
                    <th>Tropas disponíveis</th>
                    <th>Capacidade</th>
                    <th>Alvos atribuídos</th>
                    <th>Status</th>
                    <th>Ação</th>
                </tr></thead>
            `;
            const tbody = document.createElement('tbody');

            assignments.forEach((analysis) => {
                const tr = document.createElement('tr');
                const usedUnits = availableUnits.filter(
                    (unit) => normalizeQuantity(operation.troops[unit.id]) > 0
                );
                const availableText = analysis.hasTroopData
                    ? usedUnits.map((unit) =>
                        `${unit.plural}: ${normalizeQuantity(analysis.availableTroops[unit.id])}`
                    )
                    : ['-'];
                const statusText = getVillageStatus(
                    analysis,
                    Boolean(troopsInfo.stale),
                    operation.valid
                );
                const values = [
                    analysis.village.name,
                    analysis.village.coordinate
                ];

                values.forEach((value) => {
                    const td = document.createElement('td');
                    td.textContent = value;
                    tr.appendChild(td);
                });

                const troopsCell = document.createElement('td');
                availableText.forEach((line) => {
                    const item = document.createElement('div');
                    item.textContent = line;
                    troopsCell.appendChild(item);
                });
                tr.appendChild(troopsCell);

                const capacityCell = document.createElement('td');
                capacityCell.textContent = String(analysis.capacity);
                tr.appendChild(capacityCell);

                const targetsCell = document.createElement('td');
                targetsCell.appendChild(document.createTextNode(
                    String(analysis.assignedTargets.length)
                ));

                if (analysis.assignedTargets.length) {
                    const details = document.createElement('details');
                    details.className = 'fake-analysis-targets';
                    const summary = document.createElement('summary');
                    summary.textContent = 'Ver alvos';
                    const list = document.createElement('ul');
                    analysis.assignedTargets.forEach((target) => {
                        const item = document.createElement('li');
                        item.textContent = target;
                        list.appendChild(item);
                    });
                    details.appendChild(summary);
                    details.appendChild(list);
                    targetsCell.appendChild(details);
                }
                tr.appendChild(targetsCell);

                const statusCell = document.createElement('td');
                statusCell.className = 'fake-analysis-status';
                statusCell.textContent = statusText;
                tr.appendChild(statusCell);

                const actionCell = document.createElement('td');

                if (
                    operation.valid &&
                    analysis.assignedTargets.length &&
                    analysis.village.id
                ) {
                    const button = EAS.UI.createButton({
                        text: 'Abrir Praça',
                        onClick: () => {
                            const context = createAnalysisContext({
                                operation,
                                assignments,
                                troopsInfo
                            });
                            writeStorage(STORAGE_KEYS.analysis, {
                                ...context,
                                selectedVillageId: analysis.village.id,
                                selectedTargets: [...analysis.assignedTargets],
                                currentTargetIndex: 0
                            });
                            EAS.FakesExecution.start({
                                villageId: analysis.village.id,
                                villageName: analysis.village.name,
                                villageCoord: analysis.village.coordinate,
                                preset: presetSelect.value,
                                commandType: commandTypeSelect.value,
                                troopsPerTarget: { ...operation.troops },
                                targets: [...analysis.assignedTargets]
                            }).then((opened) => {
                                if (!opened) {
                                    EAS.UI.showStatus({
                                        target: status,
                                        message: 'Não foi possível abrir o painel de execução. Verifique o bloqueio de popups.',
                                        type: 'error'
                                    });
                                }
                            });
                        }
                    });
                    actionCell.appendChild(button);
                } else {
                    actionCell.textContent = '-';
                }
                tr.appendChild(actionCell);
                tbody.appendChild(tr);
            });

            table.appendChild(tbody);
            analysisTable.innerHTML = '';
            analysisTable.appendChild(table);
            analysisSection.hidden = false;
        };

        const renderMultiVillageAnalysis = () => {
            const state = currentAnalysis;

            if (!state) {
                return;
            }

            const {
                operation,
                villageAnalyses,
                troopsInfo
            } = state;
            const fakesPerTarget = Math.max(
                1,
                normalizeQuantity(fakesPerTargetInput.value)
            );
            const eligible = villageAnalyses.filter((analysis) =>
                analysis.sufficient && analysis.capacity > 0 && !troopsInfo.stale
            );
            const selectedEligible = eligible.filter((analysis) =>
                analysis.selected
            );

            if (!state.distribution) {
                state.distribution = distributeTargetsRoundRobin(
                    villageAnalyses,
                    operation.coordinates,
                    fakesPerTarget
                );
            }

            const rebuildQueue = () => {
                state.distribution.executionQueue =
                    state.distribution.assignments.flatMap((assignment) =>
                        assignment.sources.map((source) => ({
                            target: assignment.target,
                            villageId: source.villageId,
                            villageName: source.villageName,
                            villageCoord: source.villageCoord,
                            status: 'pending'
                        }))
                    );
            };
            rebuildQueue();

            const selected = villageAnalyses.filter((analysis) =>
                analysis.selected
            );
            const desiredCommands = operation.coordinates.length *
                fakesPerTarget;
            const distributedCommands = state.distribution.executionQueue.length;
            const completeTargets = state.distribution.assignments.filter(
                (assignment) => assignment.sources.length === fakesPerTarget
            ).length;
            const partialTargets = state.distribution.assignments.filter(
                (assignment) => assignment.sources.length > 0 &&
                    assignment.sources.length < fakesPerTarget
            ).length;
            const emptyTargets = state.distribution.assignments.filter(
                (assignment) => assignment.sources.length === 0
            ).length;
            const selectedCapacity = selected.reduce(
                (total, analysis) => total + analysis.capacity,
                0
            );
            const summaryItems = [
                `Alvos: ${operation.coordinates.length}`,
                `Fakes por alvo: ${fakesPerTarget}`,
                `Comandos desejados: ${desiredCommands}`,
                `Comandos distribuídos: ${distributedCommands}`,
                `Aldeias selecionadas: ${selected.length}`,
                `Capacidade selecionada: ${selectedCapacity}`,
                `Alvos completos: ${completeTargets}`,
                `Alvos parciais: ${partialTargets}`,
                `Sem atribuição: ${emptyTargets}`
            ];
            analysisSummary.innerHTML = `
                <div class="fake-analysis-summary__grid">
                    ${summaryItems.map((item) => `<span>${EAS.Utils.escapeHtml(item)}</span>`).join('')}
                </div>
                ${distributedCommands < desiredCommands
                    ? `<div class="fake-analysis-warning">Capacidade insuficiente: faltam ${desiredCommands - distributedCommands} comandos.</div>`
                    : ''}
                ${!operation.valid
                    ? `<div class="fake-analysis-warning">Composição abaixo da população mínima. Atual: ${operation.commandPopulation}. Mínimo: ${operation.minimumPopulation}.</div>`
                    : ''}
            `;

            villageSelection.innerHTML = '';
            const selectionButtons = [
                {
                    text: 'Selecionar todas as aldeias prontas',
                    action: () => villageAnalyses.forEach((analysis) => {
                        analysis.selected = eligible.includes(analysis);
                    })
                },
                {
                    text: 'Desmarcar todas',
                    action: () => villageAnalyses.forEach((analysis) => {
                        analysis.selected = false;
                    })
                },
                {
                    text: 'Selecionar somente com capacidade',
                    action: () => villageAnalyses.forEach((analysis) => {
                        analysis.selected = eligible.includes(analysis);
                    })
                }
            ];
            selectionButtons.forEach(({ text, action }) => {
                villageSelection.appendChild(EAS.UI.createButton({
                    text,
                    className: 'eas-button--secondary',
                    onClick: () => {
                        action();
                        state.distribution = null;
                        writeStorage(
                            STORAGE_KEYS.selectedVillages,
                            villageAnalyses
                                .filter((analysis) => analysis.selected)
                                .map((analysis) => analysis.village.id)
                        );
                        renderMultiVillageAnalysis();
                    }
                }));
            });
            const firstNInput = EAS.UI.createInput({
                type: 'number',
                value: Math.min(1, eligible.length),
                min: 1,
                name: 'select-first-villages'
            });
            firstNInput.step = '1';
            villageSelection.appendChild(firstNInput);
            villageSelection.appendChild(EAS.UI.createButton({
                text: 'Selecionar primeiras N aldeias',
                className: 'eas-button--secondary',
                onClick: () => {
                    const limit = normalizeQuantity(firstNInput.value);
                    villageAnalyses.forEach((analysis) => {
                        analysis.selected = false;
                    });
                    eligible.slice(0, limit).forEach((analysis) => {
                        analysis.selected = true;
                    });
                    state.distribution = null;
                    writeStorage(
                        STORAGE_KEYS.selectedVillages,
                        eligible.slice(0, limit).map((analysis) =>
                            analysis.village.id
                        )
                    );
                    renderMultiVillageAnalysis();
                }
            }));

            const table = document.createElement('table');
            table.className = 'eas-table';
            table.innerHTML = `
                <thead><tr>
                    <th>Selecionar</th><th>Aldeia</th><th>Coordenada</th>
                    <th>Tropas disponíveis</th><th>Capacidade</th>
                    <th>Comandos atribuídos</th><th>Status</th>
                </tr></thead>
            `;
            const tbody = document.createElement('tbody');
            const usage = new Map();
            state.distribution.executionQueue.forEach((entry) => {
                usage.set(
                    Number(entry.villageId),
                    (usage.get(Number(entry.villageId)) || 0) + 1
                );
            });

            villageAnalyses.forEach((analysis) => {
                const tr = document.createElement('tr');
                const canSelect = eligible.includes(analysis);
                const checkboxCell = document.createElement('td');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = analysis.selected;
                checkbox.disabled = !canSelect;
                checkbox.addEventListener('change', () => {
                    analysis.selected = checkbox.checked;
                    state.distribution = null;
                    writeStorage(
                        STORAGE_KEYS.selectedVillages,
                        villageAnalyses
                            .filter((item) => item.selected)
                            .map((item) => item.village.id)
                    );
                    renderMultiVillageAnalysis();
                });
                checkboxCell.appendChild(checkbox);
                tr.appendChild(checkboxCell);

                const usedUnits = availableUnits.filter(
                    (unit) => normalizeQuantity(operation.troops[unit.id]) > 0
                );
                const statusText = !operation.valid
                    ? 'População mínima não atingida'
                    : troopsInfo.stale
                        ? 'Dados desatualizados'
                        : !analysis.hasTroopData
                            ? 'Sem dados'
                            : !analysis.sufficient
                                ? 'Tropas insuficientes'
                                : analysis.selected
                                    ? (usage.get(Number(analysis.village.id)) || 0) >= analysis.capacity
                                        ? 'Capacidade esgotada'
                                        : 'Selecionada'
                                    : 'Não selecionada';
                const values = [
                    analysis.village.name,
                    analysis.village.coordinate,
                    analysis.hasTroopData
                        ? usedUnits.map((unit) =>
                            `${unit.plural}: ${normalizeQuantity(analysis.availableTroops[unit.id])}`
                        ).join(' / ')
                        : '-',
                    analysis.capacity,
                    usage.get(Number(analysis.village.id)) || 0,
                    statusText
                ];
                values.forEach((value) => {
                    const td = document.createElement('td');
                    td.textContent = String(value);
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            analysisTable.innerHTML = '';
            analysisTable.appendChild(table);

            targetDistribution.innerHTML = '<h3>Distribuição por alvo</h3>';
            state.distribution.assignments.forEach((assignment, targetIndex) => {
                const details = document.createElement('details');
                details.className = `fake-target-assignment ${assignment.sources.length === fakesPerTarget
                    ? 'fake-assignment-complete'
                    : 'fake-assignment-partial'}`;
                const summary = document.createElement('summary');
                summary.textContent = `${assignment.target} — ${assignment.sources.length} de ${fakesPerTarget} fakes`;
                details.appendChild(summary);

                assignment.sources.forEach((source, sourceIndex) => {
                    const row = document.createElement('div');
                    row.className = 'fake-target-assignment__source';
                    const activeCheckbox = document.createElement('input');
                    activeCheckbox.type = 'checkbox';
                    activeCheckbox.checked = true;
                    activeCheckbox.title = 'Combinação ativa';
                    activeCheckbox.addEventListener('change', () => {
                        if (!activeCheckbox.checked) {
                            assignment.sources.splice(sourceIndex, 1);
                            renderMultiVillageAnalysis();
                        }
                    });
                    const select = document.createElement('select');
                    select.className = 'eas-input';
                    const duplicatedIds = new Set(
                        assignment.sources.map((item) => Number(item.villageId))
                    );
                    selectedEligible.forEach((candidate) => {
                        const candidateId = Number(candidate.village.id);
                        const isCurrent = candidateId === Number(source.villageId);
                        const hasCapacity = (usage.get(candidateId) || 0) <
                            candidate.capacity;

                        if (!isCurrent && (duplicatedIds.has(candidateId) || !hasCapacity)) {
                            return;
                        }

                        const option = document.createElement('option');
                        option.value = candidateId;
                        option.textContent = `${candidate.village.name} — ${candidate.village.coordinate}`;
                        select.appendChild(option);
                    });
                    select.value = source.villageId;
                    select.addEventListener('change', () => {
                        const replacement = selectedEligible.find((candidate) =>
                            Number(candidate.village.id) === Number(select.value)
                        );

                        if (!replacement || assignment.sources.some(
                            (item, index) => index !== sourceIndex &&
                                Number(item.villageId) === Number(select.value)
                        )) {
                            return;
                        }

                        assignment.sources[sourceIndex] = {
                            villageId: replacement.village.id,
                            villageName: replacement.village.name,
                            villageCoord: replacement.village.coordinate,
                            commandIndex: sourceIndex + 1
                        };
                        renderMultiVillageAnalysis();
                    });
                    const removeButton = EAS.UI.createButton({
                        text: 'Remover',
                        className: 'eas-button--secondary',
                        onClick: () => {
                            assignment.sources.splice(sourceIndex, 1);
                            renderMultiVillageAnalysis();
                        }
                    });
                    row.appendChild(activeCheckbox);
                    row.appendChild(select);
                    row.appendChild(removeButton);
                    details.appendChild(row);
                });

                if (assignment.sources.length < fakesPerTarget) {
                    const missing = document.createElement('div');
                    missing.className = 'fake-assignment-missing';
                    missing.textContent = `Faltam ${fakesPerTarget - assignment.sources.length} aldeias.`;
                    details.appendChild(missing);
                }
                targetDistribution.appendChild(details);
            });

            prepareOperationContainer.innerHTML = '';
            const prepareButton = EAS.UI.createButton({
                text: 'Preparar operação',
                disabled: !operation.valid || !distributedCommands,
                onClick: () => {
                    rebuildQueue();
                    const execution = {
                        preset: presetSelect.value,
                        commandType: commandTypeSelect.value,
                        troopsPerTarget: { ...operation.troops },
                        fakesPerTarget,
                        selectedVillageIds: selected.map((analysis) =>
                            analysis.village.id
                        ),
                        queue: state.distribution.executionQueue.map(
                            (entry) => ({ ...entry })
                        ),
                        currentIndex: 0,
                        completed: [],
                        skipped: [],
                        errors: [],
                        createdAt: Date.now()
                    };

                    EAS.FakesExecution.start(execution).then((opened) => {
                        if (!opened) {
                            EAS.UI.showStatus({
                                target: status,
                                message: 'Não foi possível abrir a primeira aldeia da fila.',
                                type: 'error'
                            });
                        }
                    });
                }
            });
            prepareOperationContainer.appendChild(prepareButton);
            analysisSection.hidden = false;
        };

        const analyzeOperation = async ({ forceRefresh = false } = {}) => {
            const operation = updateSummary();
            const hasTroops = Object.values(operation.troops).some(
                (value) => value > 0
            );
            const villages = EAS.Villages.list();
            let validationMessage = '';

            if (!operation.coordinates.length) {
                validationMessage = 'Informe ao menos uma coordenada válida.';
            } else if (!hasTroops) {
                validationMessage = 'Informe ao menos uma unidade por alvo.';
            } else if (!commandTypeSelect.value) {
                validationMessage = 'Selecione o tipo de comando.';
            } else if (!villages.length) {
                validationMessage = 'Nenhuma aldeia cadastrada foi encontrada.';
            }

            if (validationMessage) {
                invalidateAnalysis();
                EAS.UI.showStatus({
                    target: status,
                    message: validationMessage,
                    type: 'error'
                });
                return;
            }

            EAS.UI.showStatus({
                target: status,
                message: forceRefresh
                    ? 'Atualizando tropas e refazendo a análise...'
                    : 'Carregando tropas e analisando aldeias...',
                type: 'info'
            });

            try {
                await EAS.Troops.ensureLoaded({ forceRefresh });
            } catch (error) {
                invalidateAnalysis();
                EAS.UI.showStatus({
                    target: status,
                    message: error.message,
                    type: 'error'
                });
                return;
            }

            const troopsInfo = EAS.Troops.getSourceInfo();
            const villageAnalyses = villages.map((village) => {
                const hasTroopData = EAS.Troops.hasVillageData(village.id);
                const availableTroops = hasTroopData
                    ? { ...EAS.Troops.getVillageTroops(village.id) }
                    : {};
                const capacity = hasTroopData
                    ? calculateFakeCapacity(availableTroops, operation.troops)
                    : {
                        capacity: 0,
                        limitingUnits: [],
                        missingUnits: [],
                        sufficient: false
                    };

                return {
                    village: { ...village },
                    availableTroops,
                    hasTroopData,
                    ...capacity,
                    sufficient: capacity.sufficient && operation.valid
                };
            });
            const storedSelection = readStorage(
                STORAGE_KEYS.selectedVillages,
                savedSelectedVillageIds
            );
            const selectedIds = Array.isArray(storedSelection)
                ? new Set(storedSelection.map(Number))
                : null;
            villageAnalyses.forEach((analysis) => {
                analysis.selected = selectedIds
                    ? selectedIds.has(Number(analysis.village.id)) &&
                        analysis.sufficient && !troopsInfo.stale
                    : analysis.sufficient && !troopsInfo.stale;
            });
            currentAnalysis = {
                operation,
                villageAnalyses,
                troopsInfo,
                distribution: null
            };
            renderMultiVillageAnalysis();
            const distribution = currentAnalysis.distribution;
            const distributed = distribution.executionQueue.length;
            const desired = operation.coordinates.length * Math.max(
                1,
                normalizeQuantity(fakesPerTargetInput.value)
            );

            writeStorage(STORAGE_KEYS.analysis, {
                preset: presetSelect.value,
                commandType: commandTypeSelect.value,
                troopsPerTarget: { ...operation.troops },
                targets: [...operation.coordinates],
                fakesPerTarget: Math.max(
                    1,
                    normalizeQuantity(fakesPerTargetInput.value)
                ),
                selectedVillageIds: villageAnalyses
                    .filter((analysis) => analysis.selected)
                    .map((analysis) => analysis.village.id),
                assignments: distribution.assignments.map((assignment) => ({
                    target: assignment.target,
                    sources: assignment.sources.map((source) => ({ ...source }))
                })),
                executionQueue: distribution.executionQueue.map(
                    (entry) => ({ ...entry })
                ),
                createdAt: Date.now()
            });
            EAS.UI.showStatus({
                target: status,
                message: operation.valid
                    ? `Análise concluída: ${distributed} de ${desired} comandos distribuídos. Nenhum comando foi enviado.`
                    : `Composição inválida para ataques neste mundo. População atual: ${operation.commandPopulation}. Mínima: ${operation.minimumPopulation}. Faltam: ${operation.deficit}.`,
                type: operation.valid && distributed === desired
                    ? 'success'
                    : 'error'
            });
        };

        const applyPreset = () => {
            const preset = FAKE_PRESETS[presetSelect.value] || FAKE_PRESETS.custom;
            commandTypeSelect.value = preset.commandType;
            availableUnits.forEach((unit) => {
                troopInputs[unit.id].value = normalizeQuantity(preset.troops[unit.id]);
            });
            invalidateAndMaybeReanalyze();
        };

        let reanalysisTimer = null;
        const invalidateAndMaybeReanalyze = () => {
            const shouldReanalyze = Boolean(currentAnalysis);
            invalidateAnalysis();
            updateSummary();

            if (shouldReanalyze) {
                clearTimeout(reanalysisTimer);
                reanalysisTimer = setTimeout(() => analyzeOperation(), 250);
            }
        };

        presetSelect.addEventListener('change', applyPreset);
        commandTypeSelect.addEventListener('change', () => {
            invalidateAndMaybeReanalyze();
        });
        fakesPerTargetInput.addEventListener('input', () => {
            fakesPerTargetInput.value = Math.max(
                1,
                normalizeQuantity(fakesPerTargetInput.value)
            );
            invalidateAndMaybeReanalyze();
        });
        completionUnitSelect.addEventListener('change', renderPopulationRule);
        coordinatesInput.addEventListener('input', () => {
            invalidateAnalysis();
            updateSummary();
        });
        Object.values(troopInputs).forEach((input) => {
            input.addEventListener('input', () => {
                invalidateAndMaybeReanalyze();
            });
        });

        const actions = document.createElement('div');
        actions.className = 'eas-actions';
        const analyzeButton = EAS.UI.createButton({
            text: 'Analisar operação',
            icon: '🔍',
            onClick: () => analyzeOperation()
        });
        const refreshTroopsButton = EAS.UI.createButton({
            text: 'Atualizar tropas',
            icon: '🔄',
            className: 'eas-button--secondary',
            onClick: () => analyzeOperation({ forceRefresh: true })
        });
        const verifyWorldRuleButton = EAS.UI.createButton({
            text: 'Verificar regra do mundo',
            className: 'eas-button--secondary',
            onClick: () => {
                worldRule = EAS.WorldRules.get();
                renderPopulationRule();
                EAS.UI.showStatus({
                    target: status,
                    message: worldRule?.minimumAttackPopulation
                        ? `Este mundo exige no mínimo ${worldRule.minimumAttackPopulation} de população por ataque.`
                        : 'Nenhuma regra foi detectada. Nenhum ataque de teste foi criado.',
                    type: 'info'
                });
            }
        });
        const clearWorldRuleButton = EAS.UI.createButton({
            text: 'Limpar regra detectada',
            className: 'eas-button--secondary',
            onClick: () => {
                if (!confirm('Deseja remover a população mínima salva para este mundo?')) {
                    return;
                }

                EAS.WorldRules.clear();
                worldRule = null;
                invalidateAnalysis();
                updateSummary();
                EAS.UI.showStatus({
                    target: status,
                    message: 'Regra do mundo removida. A próxima detecção ocorrerá por uma mensagem real do jogo.',
                    type: 'info'
                });
            }
        });
        const adjustPopulationButton = EAS.UI.createButton({
            text: 'Ajustar composição',
            onClick: () => {
                const population = getPopulationState();
                const unit = completionUnitSelect.value;
                const unitPopulation = EAS.Units.getPopulation(unit);

                if (!population.deficit || !troopInputs[unit] || !unitPopulation) {
                    return;
                }

                const hadAnalysis = !analysisSection.hidden;
                troopInputs[unit].value = normalizeQuantity(troopInputs[unit].value) +
                    Math.ceil(population.deficit / unitPopulation);
                invalidateAnalysis();
                updateSummary();

                if (hadAnalysis) {
                    analyzeOperation();
                }
            }
        });
        populationActions.appendChild(verifyWorldRuleButton);
        populationActions.appendChild(clearWorldRuleButton);
        populationActions.appendChild(adjustPopulationButton);
        const clearButton = EAS.UI.createButton({
            text: 'Limpar',
            icon: '🧹',
            className: 'eas-button--secondary',
            onClick: () => {
                coordinatesInput.value = '';
                Object.values(troopInputs).forEach((input) => {
                    input.value = 0;
                });
                invalidateAnalysis();
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
                    writeStorage(STORAGE_KEYS.coordinates, coordinatesInput.value),
                    writeStorage(
                        STORAGE_KEYS.fakesPerTarget,
                        Math.max(1, normalizeQuantity(fakesPerTargetInput.value))
                    )
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
        actions.appendChild(refreshTroopsButton);
        actions.appendChild(clearButton);
        actions.appendChild(saveButton);
        actions.appendChild(backButton);

        manager.appendChild(description);
        manager.appendChild(presetsForm);
        manager.appendChild(troopsSection);
        manager.appendChild(populationSection);
        manager.appendChild(targetsSection);
        manager.appendChild(summarySection);
        manager.appendChild(analysisSection);
        manager.appendChild(actions);
        manager.appendChild(status);
        win.body.appendChild(manager);
        updateSummary();

        if (autoAnalyze) {
            setTimeout(() => analyzeOperation(), 0);
        }
    };
})();
