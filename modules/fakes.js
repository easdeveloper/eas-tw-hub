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
        allowCommandSwitch: 'eas_tw_fakes_allow_command_switch',
        analysis: 'eas_tw_fakes_analysis',
        fakeNtConfig: 'eas_tw_fake_nt_config',
        fakeNtPlayer: 'eas_tw_fake_nt_target_player',
        fakeNtVillages: 'eas_tw_fake_nt_selected_target_villages',
        fakeNtCommands: 'eas_tw_fake_nt_commands_per_target',
        antiSnipeConfig: 'eas_tw_fake_anti_snipe_config'
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
        fake_nt: {
            id: 'fake_nt',
            name: 'Fake NT',
            commandType: 'attack', defaultCommandType: 'attack',
            allowedCommandTypes: ['attack'], requiredUnitGroups: [['ram', 'catapult']],
            forbiddenUnits: ['snob'], defaultCommandsPerTarget: 4,
            requiresArrivalTime: true, usesTravelPlanning: true,
            respectsMinimumPopulation: true, troops: { ram: 1 }
        },
        anti_snipe: {
            id: 'anti_snipe',
            name: 'Fake Anti-Snipe',
            commandType: 'attack', defaultCommandType: 'attack',
            allowedCommandTypes: ['attack'], requiresCentralArrivalTime: true,
            usesArrivalWindow: true, supportsMilliseconds: true,
            respectsMinimumPopulation: true, usesWorldRules: true,
            defaultCommandsPerTarget: 6, troops: { spear: 1 }
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

    const generateAntiSnipeOffsets = ({ mode, commandCount, intervalMs, customOffsets = [] }) => {
        const count = Math.max(1, normalizeQuantity(commandCount));
        const interval = Math.max(1, normalizeQuantity(intervalMs));
        if (mode === 'custom') {
            return [...new Set((Array.isArray(customOffsets) ? customOffsets : String(customOffsets || '').split(/[\s,;]+/))
                .map((value) => Math.trunc(Number(value))).filter(Number.isFinite))].sort((a, b) => a - b);
        }
        if (mode === 'before') return Array.from({ length: count }, (_, index) => -(count - index) * interval);
        if (mode === 'after') return Array.from({ length: count }, (_, index) => (index + 1) * interval);
        const beforeCount = Math.floor(count / 2);
        const afterCount = count - beforeCount;
        return [
            ...Array.from({ length: beforeCount }, (_, index) => -(beforeCount - index) * interval),
            ...Array.from({ length: afterCount }, (_, index) => (index + 1) * interval)
        ];
    };

    const buildAntiSnipeArrivalSchedule = ({ centralArrival, offsets }) =>
        [...offsets].sort((a, b) => a - b).map((offsetMs, index) => ({
            sequence: index + 1, offsetMs, arrivalTime: Number(centralArrival) + offsetMs
        }));

    const applyAntiSnipeLatencyCorrection = (sendTime, correctionMs = 0) =>
        Number(sendTime) + Math.trunc(Number(correctionMs) || 0);

    const distributeAntiSnipeRoundRobin = (villageAnalyses, targets, schedule, preferDiversity = true) => {
        const eligible = villageAnalyses.filter((analysis) => analysis.selected && analysis.sufficient && analysis.capacity > 0);
        const remaining = new Map(eligible.map((analysis) => [Number(analysis.village.id), analysis.capacity]));
        let cursor = 0;
        const assignments = targets.map((target) => {
            const sources = []; const used = new Set();
            schedule.forEach((slot) => {
                let chosen = null;
                for (let attempt = 0; attempt < eligible.length * 2; attempt += 1) {
                    const candidate = eligible[cursor % Math.max(eligible.length, 1)]; cursor += 1;
                    if (!candidate || (remaining.get(Number(candidate.village.id)) || 0) < 1) continue;
                    const unusedAvailable = eligible.some((item) =>
                        !used.has(Number(item.village.id)) && (remaining.get(Number(item.village.id)) || 0) > 0
                    );
                    if (preferDiversity && unusedAvailable && used.has(Number(candidate.village.id))) continue;
                    chosen = candidate; break;
                }
                if (!chosen) return;
                const villageId = Number(chosen.village.id); used.add(villageId);
                remaining.set(villageId, remaining.get(villageId) - 1);
                sources.push({ villageId, villageName: chosen.village.name, villageCoord: chosen.village.coordinate, commandIndex: slot.sequence, ...slot });
            });
            return { target, sources };
        });
        return { assignments, executionQueue: [], remainingCapacity: remaining };
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
    EAS.Modules.Fakes.generateAntiSnipeOffsets = generateAntiSnipeOffsets;
    EAS.Modules.Fakes.buildAntiSnipeArrivalSchedule = buildAntiSnipeArrivalSchedule;
    EAS.Modules.Fakes.applyAntiSnipeLatencyCorrection = applyAntiSnipeLatencyCorrection;
    EAS.Modules.Fakes.distributeAntiSnipeRoundRobin = distributeAntiSnipeRoundRobin;
    EAS.Modules.Fakes.presets = FAKE_PRESETS;

    EAS.Modules.Fakes.open = ({ autoAnalyze = false } = {}) => {
        const rawSavedPresetId = readStorage(STORAGE_KEYS.preset, 'simple');
        const savedPresetId = rawSavedPresetId === 'nt' ? 'fake_nt' : rawSavedPresetId === 'antiSnipe' ? 'anti_snipe' : rawSavedPresetId;
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
        const savedAllowCommandSwitch = Boolean(readStorage(
            STORAGE_KEYS.allowCommandSwitch,
            false
        ));
        const savedFakeNtConfig = readStorage(STORAGE_KEYS.fakeNtConfig, {});
        const savedFakeNtVillages = readStorage(STORAGE_KEYS.fakeNtVillages, []);
        const savedFakeNtCommands = Math.max(1, normalizeQuantity(readStorage(
            STORAGE_KEYS.fakeNtCommands, 4
        )) || 4);
        const savedAntiSnipeConfig = readStorage(STORAGE_KEYS.antiSnipeConfig, {});
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
        const commandSwitchOption = document.createElement('label');
        commandSwitchOption.className = 'fake-command-switch';
        const commandSwitchInput = document.createElement('input');
        commandSwitchInput.type = 'checkbox';
        commandSwitchInput.checked = savedAllowCommandSwitch;
        commandSwitchOption.appendChild(commandSwitchInput);
        commandSwitchOption.appendChild(document.createTextNode(
            'Permitir trocar Ataque/Apoio durante a execução'
        ));
        presetsForm.appendChild(commandSwitchOption);

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

        const fakeNtSection = document.createElement('section');
        fakeNtSection.className = 'fake-nt-settings';
        const compatibleSlowUnits = ['ram', 'catapult'].filter((id) => troopInputs[id]);
        const slowUnitSelect = createSelect('fake-nt-slow-unit', compatibleSlowUnits.map((id) => ({
            value: id, label: id === 'ram' ? 'Aríete' : 'Catapulta'
        })), savedFakeNtConfig.slowUnit || compatibleSlowUnits[0] || '');
        const arrivalDateInput = EAS.UI.createInput({
            type: 'text', name: 'fake-nt-arrival-date',
            value: savedFakeNtConfig.arrivalDate || EAS.World.getServerDateTime().date || '',
            placeholder: 'DD/MM/AAAA'
        });
        const arrivalTimeInput = EAS.UI.createInput({
            type: 'text', name: 'fake-nt-arrival-time',
            value: savedFakeNtConfig.arrivalTime || '08:00:00', placeholder: 'HH:MM:SS'
        });
        const intervalSelect = createSelect('fake-nt-interval', [100, 200, 500, 1000].map((value) => ({ value: String(value), label: value === 1000 ? '1 segundo' : `${value} ms` })), String(savedFakeNtConfig.intervalMs || 200));
        const playerInput = EAS.UI.createInput({ type: 'text', name: 'fake-nt-player', value: readStorage(STORAGE_KEYS.fakeNtPlayer, '') || '', placeholder: 'Nome exato do jogador' });
        const playerActions = document.createElement('div');
        playerActions.className = 'eas-actions';
        const playerResult = document.createElement('div');
        playerResult.className = 'fake-nt-player-result';
        let targetVillages = [];
        let selectedTargetVillageIds = new Set((Array.isArray(savedFakeNtVillages) ? savedFakeNtVillages : []).map(Number));

        fakeNtSection.innerHTML = '<h3>Configuração do Fake NT</h3><div class="fake-analysis-warning">Fake NT é exclusivo para ataques e nunca utiliza Nobre.</div>';
        fakeNtSection.appendChild(EAS.UI.createField({ label: 'Unidade lenta do Fake NT', input: slowUnitSelect }));
        fakeNtSection.appendChild(EAS.UI.createField({ label: 'Data de chegada', input: arrivalDateInput }));
        fakeNtSection.appendChild(EAS.UI.createField({ label: 'Hora de chegada (com segundos)', input: arrivalTimeInput }));
        fakeNtSection.appendChild(EAS.UI.createField({ label: 'Intervalo entre comandos (planejamento)', input: intervalSelect }));
        fakeNtSection.appendChild(EAS.UI.createField({ label: 'Jogador-alvo', input: playerInput }));
        fakeNtSection.appendChild(playerActions);
        fakeNtSection.appendChild(playerResult);
        if (!compatibleSlowUnits.length) {
            slowUnitSelect.disabled = true;
            fakeNtSection.insertAdjacentHTML('beforeend', '<div class="fake-analysis-warning">Este mundo não possui uma unidade compatível com Fake NT.</div>');
        }

        const antiSnipeSection = document.createElement('section');
        antiSnipeSection.className = 'fake-anti-snipe-settings';
        const antiDateInput = EAS.UI.createInput({ type: 'text', value: savedAntiSnipeConfig.centralDate || EAS.World.getServerDateTime().date || '', placeholder: 'DD/MM/AAAA' });
        const antiTimeInput = EAS.UI.createInput({ type: 'text', value: savedAntiSnipeConfig.centralTime || '08:00:00', placeholder: 'HH:MM:SS' });
        const antiMillisecondsInput = EAS.UI.createInput({ type: 'number', value: savedAntiSnipeConfig.milliseconds ?? 0, min: 0, max: 999 });
        const antiModeSelect = createSelect('anti-snipe-mode', [
            { value: 'before', label: 'Antes do horário central' }, { value: 'after', label: 'Depois do horário central' },
            { value: 'around', label: 'Cercar o horário central' }, { value: 'custom', label: 'Personalizado' }
        ], savedAntiSnipeConfig.mode || 'around');
        const antiIntervalInput = EAS.UI.createInput({ type: 'number', value: savedAntiSnipeConfig.intervalMs || 200, min: 1 });
        const antiLatencyInput = EAS.UI.createInput({ type: 'number', value: savedAntiSnipeConfig.latencyCorrectionMs ?? 0 });
        const antiCustomOffsetsInput = document.createElement('textarea');
        antiCustomOffsetsInput.className = 'eas-input'; antiCustomOffsetsInput.placeholder = '-700\n-350\n150\n400';
        antiCustomOffsetsInput.value = savedAntiSnipeConfig.customOffsets || '';
        const speedUnitOptions = [{ value: 'composition', label: 'Pela composição real' }, ...availableUnits
            .filter((unit) => EAS.Units.getTravelSpeed(unit.id) > 0)
            .map((unit) => ({ value: unit.id, label: unit.name }))];
        const antiSpeedUnitSelect = createSelect('anti-snipe-speed-unit', speedUnitOptions, savedAntiSnipeConfig.speedUnit || 'composition');
        const antiDiversityOption = document.createElement('label'); antiDiversityOption.className = 'fake-command-switch';
        const antiDiversityInput = document.createElement('input'); antiDiversityInput.type = 'checkbox'; antiDiversityInput.checked = savedAntiSnipeConfig.preferDiversity !== false;
        antiDiversityOption.append(antiDiversityInput, document.createTextNode('Preferir aldeias diferentes no mesmo alvo'));
        antiSnipeSection.innerHTML = '<h3>Configuração Anti-Snipe</h3><div class="fake-analysis-warning">Fake Anti-Snipe é exclusivo para ataques. Os milissegundos representam planejamento; latência, navegador e servidor podem alterar o horário real.</div>';
        antiSnipeSection.appendChild(EAS.UI.createField({ label: 'Data central de chegada', input: antiDateInput }));
        antiSnipeSection.appendChild(EAS.UI.createField({ label: 'Hora central de chegada', input: antiTimeInput }));
        antiSnipeSection.appendChild(EAS.UI.createField({ label: 'Milissegundos (000–999)', input: antiMillisecondsInput }));
        antiSnipeSection.appendChild(EAS.UI.createField({ label: 'Distribuição dos comandos', input: antiModeSelect }));
        const customOffsetsField = EAS.UI.createField({ label: 'Offsets personalizados em milissegundos', input: antiCustomOffsetsInput });
        antiSnipeSection.appendChild(customOffsetsField);
        antiSnipeSection.appendChild(EAS.UI.createField({ label: 'Intervalo entre comandos (ms)', input: antiIntervalInput }));
        antiSnipeSection.appendChild(EAS.UI.createField({ label: 'Correção de latência (ms)', input: antiLatencyInput }));
        antiSnipeSection.appendChild(EAS.UI.createField({ label: 'Unidade de velocidade preferida', input: antiSpeedUnitSelect }));
        antiSnipeSection.appendChild(antiDiversityOption);
        const toggleCustomOffsets = () => { customOffsetsField.hidden = antiModeSelect.value !== 'custom'; };
        toggleCustomOffsets();

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

        const isFakeNt = () => presetSelect.value === 'fake_nt';
        const isAntiSnipe = () => presetSelect.value === 'anti_snipe';
        const getTargetCoordinates = () => [...new Set([
            ...targetVillages.filter((village) => selectedTargetVillageIds.has(village.id)).map((village) => village.coordinate),
            ...extractCoordinates(coordinatesInput.value)
        ])];
        const renderTargetVillages = (meta = '') => {
            if (!targetVillages.length) {
                playerResult.innerHTML = meta ? `<div class="fake-analysis-warning">${EAS.Utils.escapeHtml(meta)}</div>` : '';
                return;
            }
            playerResult.innerHTML = `
                <p><strong>${EAS.Utils.escapeHtml(meta)}</strong><br>${targetVillages.length} aldeias encontradas.</p>
                <div class="fake-nt-target-tools">
                    <button type="button" data-select="all">Selecionar todas</button>
                    <button type="button" data-select="none">Desmarcar todas</button>
                    <input class="eas-input" data-filter="continent" placeholder="Continente (K55)">
                    <input class="eas-input" type="number" data-filter="min" placeholder="Pontos mínimos">
                    <input class="eas-input" type="number" data-filter="max" placeholder="Pontos máximos">
                    <input class="eas-input" data-filter="name" placeholder="Filtrar nome">
                </div>
                <div class="eas-table-wrapper"><table class="eas-table"><thead><tr><th>Selecionar</th><th>Aldeia</th><th>Coordenada</th><th>Pontos</th><th>Continente</th></tr></thead><tbody>
                    ${targetVillages.map((village) => `<tr data-target-row data-continent="${village.continent}" data-points="${village.points}" data-name="${EAS.Utils.escapeHtml(village.name.toLocaleLowerCase())}"><td><input type="checkbox" data-target-id="${village.id}" ${selectedTargetVillageIds.has(village.id) ? 'checked' : ''}></td><td>${EAS.Utils.escapeHtml(village.name)}</td><td>${village.coordinate}</td><td>${EAS.Utils.formatNumber(village.points)}</td><td>${village.continent}</td></tr>`).join('')}
                </tbody></table></div>`;
            playerResult.querySelectorAll('[data-target-id]').forEach((input) => input.addEventListener('change', () => {
                const id = Number(input.dataset.targetId);
                input.checked ? selectedTargetVillageIds.add(id) : selectedTargetVillageIds.delete(id);
                writeStorage(STORAGE_KEYS.fakeNtVillages, [...selectedTargetVillageIds]);
                invalidateAnalysis(); updateSummary();
            }));
            const applyFilters = () => {
                const continent = playerResult.querySelector('[data-filter="continent"]').value.trim().toUpperCase();
                const min = Number(playerResult.querySelector('[data-filter="min"]').value) || 0;
                const max = Number(playerResult.querySelector('[data-filter="max"]').value) || Infinity;
                const name = playerResult.querySelector('[data-filter="name"]').value.trim().toLocaleLowerCase();
                playerResult.querySelectorAll('[data-target-row]').forEach((row) => {
                    row.hidden = Boolean((continent && row.dataset.continent !== continent) || Number(row.dataset.points) < min || Number(row.dataset.points) > max || (name && !row.dataset.name.includes(name)));
                });
            };
            playerResult.querySelectorAll('[data-filter]').forEach((input) => input.addEventListener('input', applyFilters));
            playerResult.querySelectorAll('[data-select]').forEach((button) => button.addEventListener('click', () => {
                playerResult.querySelectorAll('[data-target-row]:not([hidden]) [data-target-id]').forEach((input) => {
                    input.checked = button.dataset.select === 'all'; input.dispatchEvent(new Event('change'));
                });
            }));
        };

        const searchPlayer = async (forceRefresh = false) => {
            EAS.UI.showStatus({ target: status, message: 'Buscando dados públicos do jogador...', type: 'info' });
            try {
                const previousIds = new Set(targetVillages.map((village) => village.id));
                const result = await EAS.PublicMap.findPlayerVillages(playerInput.value, { forceRefresh });
                const currentIds = new Set(result.villages.map((village) => village.id));
                const added = result.villages.filter((village) => !previousIds.has(village.id)).length;
                const removed = [...previousIds].filter((id) => !currentIds.has(id)).length;
                selectedTargetVillageIds = new Set([...selectedTargetVillageIds].filter((id) => currentIds.has(id)));
                targetVillages = result.villages;
                writeStorage(STORAGE_KEYS.fakeNtPlayer, result.player.name);
                writeStorage(STORAGE_KEYS.fakeNtVillages, [...selectedTargetVillageIds]);
                renderTargetVillages(`${result.player.name} · última busca ${new Date(result.updatedAt).toLocaleString('pt-BR')}${forceRefresh ? ` · +${added}/-${removed}` : ''}`);
                invalidateAnalysis(); updateSummary();
                EAS.UI.showStatus({ target: status, message: `${targetVillages.length} aldeias de ${result.player.name} carregadas.`, type: 'success' });
            } catch (error) {
                EAS.UI.showStatus({ target: status, message: error.message || 'Erro de rede ao buscar o jogador.', type: 'error' });
            }
        };
        playerActions.appendChild(EAS.UI.createButton({ text: 'Buscar aldeias', onClick: () => searchPlayer(false) }));
        playerActions.appendChild(EAS.UI.createButton({ text: 'Atualizar aldeias do jogador', className: 'eas-button--secondary', onClick: () => searchPlayer(true) }));

        const getTroops = () => availableUnits.reduce((troops, unit) => {
            troops[unit.id] = normalizeQuantity(troopInputs[unit.id].value);
            if (isFakeNt() && unit.id === 'snob') troops[unit.id] = 0;
            return troops;
        }, {});

        const getPopulationState = (troops = getTroops()) => {
            const commandPopulation = EAS.Units.calculateCommandPopulation(troops);
            const compositionRule = EAS.CommandRules.validateCommandComposition({
                world: EAS.CommandRules.getWorld(), villageId: '__composition__',
                commandType: commandTypeSelect.value, troops
            });
            const minimumPopulation = 0;
            const applies = commandTypeSelect.value === 'attack' &&
                minimumPopulation > 0;
            const attackPopulationValid = compositionRule.valid;

            return {
                commandPopulation,
                minimumPopulation,
                deficit: 0,
                attackPopulationValid,
                valid: attackPopulationValid &&
                    (!isFakeNt() || (normalizeQuantity(troops.ram) + normalizeQuantity(troops.catapult) > 0 && normalizeQuantity(troops.snob) === 0))
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
                    <p>A população mínima é validada individualmente por aldeia.</p>
                    <small>Aldeias sem regra conhecida permanecem com “Regra ainda não detectada”.</small>
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
            const coordinates = getTargetCoordinates();
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
                ${isFakeNt() ? 'Fake NT' : 'Fakes'} por alvo: ${Math.max(1, normalizeQuantity(fakesPerTargetInput.value))}<br>
                Comandos desejados: ${coordinates.length * Math.max(1, normalizeQuantity(fakesPerTargetInput.value))}<br>
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

            const arrival = EAS.Utils.createServerDateTime(arrivalDateInput.value, arrivalTimeInput.value);
            const antiCentral = EAS.Utils.createServerDateTime(antiDateInput.value, antiTimeInput.value);
            const antiMilliseconds = Math.min(999, Math.max(0, normalizeQuantity(antiMillisecondsInput.value)));
            const antiCentralTimestamp = antiCentral ? antiCentral.timestamp + antiMilliseconds : null;
            const antiOffsets = generateAntiSnipeOffsets({
                mode: antiModeSelect.value,
                commandCount: fakesPerTargetInput.value,
                intervalMs: antiIntervalInput.value,
                customOffsets: antiCustomOffsetsInput.value
            });
            return {
                coordinates, troops, ...population,
                arrivalTimestamp: arrival?.timestamp ?? null,
                arrivalFormatted: arrival?.formatted || null,
                intervalMs: Math.max(0, Number(intervalSelect.value) || 0),
                slowUnit: slowUnitSelect.value,
                antiCentralTimestamp, antiOffsets,
                antiSchedule: antiCentralTimestamp === null ? [] : buildAntiSnipeArrivalSchedule({ centralArrival: antiCentralTimestamp, offsets: antiOffsets }),
                latencyCorrectionMs: Math.trunc(Number(antiLatencyInput.value) || 0),
                valid: population.valid && (!isFakeNt() || Boolean(arrival && compatibleSlowUnits.length)) &&
                    (!isAntiSnipe() || Boolean(antiCentral && antiOffsets.length))
            };
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
                isAntiSnipe() ? operation.antiSchedule.length : normalizeQuantity(fakesPerTargetInput.value)
            );
            const eligible = villageAnalyses.filter((analysis) =>
                analysis.sufficient && analysis.capacity > 0 && !troopsInfo.stale
            );
            const selectedEligible = eligible.filter((analysis) =>
                analysis.selected
            );

            if (!state.distribution) {
                state.distribution = isAntiSnipe()
                    ? distributeAntiSnipeRoundRobin(villageAnalyses, operation.coordinates, operation.antiSchedule, antiDiversityInput.checked)
                    : distributeTargetsRoundRobin(villageAnalyses, operation.coordinates, fakesPerTarget);
            }

            const rebuildQueue = () => {
                state.distribution.executionQueue =
                    state.distribution.assignments.flatMap((assignment) =>
                        assignment.sources.map((source) => ({
                            target: assignment.target,
                            targetVillageId: targetVillages.find((village) => village.coordinate === assignment.target)?.id || null,
                            villageId: source.villageId,
                            sourceVillageId: source.villageId,
                            villageName: source.villageName,
                            villageCoord: source.villageCoord,
                            disabled: Boolean(source.disabled),
                            ...(() => {
                                if (!isFakeNt() && !isAntiSnipe()) return {};
                                const distance = EAS.Utils.distance(source.villageCoord, assignment.target);
                                const slowest = EAS.Units.getSlowestUnit(operation.troops);
                                const durationMs = distance * slowest.minutesPerField * 60 * 1000 /
                                    (EAS.World.getSpeed() * EAS.World.getUnitSpeed());
                                const arrivalTime = isAntiSnipe() ? source.arrivalTime : operation.arrivalTimestamp + (source.commandIndex - 1) * operation.intervalMs;
                                const sendTime = arrivalTime - durationMs;
                                const recommendedActionTime = applyAntiSnipeLatencyCorrection(sendTime, isAntiSnipe() ? operation.latencyCorrectionMs : 0);
                                const now = EAS.World.getServerNowTimestamp() ?? Date.now();
                                return {
                                    distance, durationMs, arrivalTime, sendTime, recommendedActionTime,
                                    offsetMs: source.offsetMs ?? null, sequence: source.sequence ?? source.commandIndex,
                                    slowUnit: slowest.unit, commandType: 'attack',
                                    timingStatus: recommendedActionTime < now ? 'Atrasado' : recommendedActionTime - now < 1000 ? 'Pronto para ação' : recommendedActionTime - now < 300000 ? 'Próximo do horário' : 'Futuro'
                                };
                            })(),
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
            if (isAntiSnipe()) {
                const times = state.distribution.executionQueue.map((entry) => entry.sendTime).filter(Number.isFinite);
                summaryItems.push(
                    `Menor envio: ${times.length ? EAS.Utils.formatDateTime(Math.min(...times), true) : '-'}`,
                    `Maior envio: ${times.length ? EAS.Utils.formatDateTime(Math.max(...times), true) : '-'}`,
                    `Comandos atrasados: ${state.distribution.executionQueue.filter((entry) => entry.timingStatus === 'Atrasado').length}`
                );
            }
            analysisSummary.innerHTML = `
                <div class="fake-analysis-summary__grid">
                    ${summaryItems.map((item) => `<span>${EAS.Utils.escapeHtml(item)}</span>`).join('')}
                </div>
                ${distributedCommands < desiredCommands
                    ? `<div class="fake-analysis-warning">Capacidade insuficiente: faltam ${desiredCommands - distributedCommands} comandos.</div>`
                    : ''}
                ${!operation.attackPopulationValid && commandTypeSelect.value === 'attack'
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
            villageSelection.appendChild(EAS.UI.createButton({
                text: 'Selecionar mais próximas', className: 'eas-button--secondary',
                onClick: () => {
                    const limit = Math.max(1, normalizeQuantity(firstNInput.value));
                    const ordered = [...eligible].sort((a, b) =>
                        Math.min(...operation.coordinates.map((target) => EAS.Utils.distance(a.village.coordinate, target))) -
                        Math.min(...operation.coordinates.map((target) => EAS.Utils.distance(b.village.coordinate, target)))
                    );
                    villageAnalyses.forEach((analysis) => { analysis.selected = false; });
                    ordered.slice(0, limit).forEach((analysis) => { analysis.selected = true; });
                    state.distribution = null; renderMultiVillageAnalysis();
                }
            }));
            const continentInput = EAS.UI.createInput({ type: 'text', placeholder: 'K55', name: 'source-continent' });
            villageSelection.appendChild(continentInput);
            villageSelection.appendChild(EAS.UI.createButton({
                text: 'Selecionar por continente', className: 'eas-button--secondary',
                onClick: () => {
                    const continent = continentInput.value.trim().toUpperCase();
                    villageAnalyses.forEach((analysis) => {
                        const parsed = EAS.Utils.parseCoordinate(analysis.village.coordinate);
                        const ownContinent = parsed ? `K${Math.floor(parsed.y / 100)}${Math.floor(parsed.x / 100)}` : '';
                        analysis.selected = eligible.includes(analysis) && ownContinent === continent;
                    });
                    state.distribution = null; renderMultiVillageAnalysis();
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
                            : !analysis.commandValidation.valid
                                ? analysis.commandValidation.reasons[0]?.type === 'minimum-attack-population'
                                    ? `População ${analysis.commandValidation.commandPopulation}/${analysis.commandValidation.minimumAttackPopulation}`
                                    : `Mínimo de ${analysis.commandValidation.unitViolations[0]?.unit}: ${analysis.commandValidation.unitViolations[0]?.required}`
                            : !analysis.sufficient
                                ? 'Tropas insuficientes'
                                : analysis.selected
                                    ? (usage.get(Number(analysis.village.id)) || 0) >= analysis.capacity
                                        ? 'Capacidade esgotada'
                                        : 'Selecionada'
                                    : analysis.commandValidation.ruleKnown ? 'Não selecionada' : 'Regra ainda não detectada';
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
                summary.textContent = `${assignment.target} — ${assignment.sources.length} de ${fakesPerTarget} ${isAntiSnipe() ? 'comandos' : 'fakes'}`;
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

                        if (!isCurrent && ((!isAntiSnipe() && duplicatedIds.has(candidateId)) || !hasCapacity)) {
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

                        if (!replacement || (!isAntiSnipe() && assignment.sources.some(
                            (item, index) => index !== sourceIndex &&
                                Number(item.villageId) === Number(select.value)
                        ))) {
                            return;
                        }

                        assignment.sources[sourceIndex] = {
                            ...source,
                            villageId: replacement.village.id,
                            villageName: replacement.village.name,
                            villageCoord: replacement.village.coordinate,
                            commandIndex: source.commandIndex || sourceIndex + 1
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

            if (isFakeNt()) {
                const showJapan = localStorage.getItem('eas_tw_attack_timezone_japan') === 'true';
                const japanLine = (timestamp) => {
                    if (!showJapan) return '';
                    const japan = EAS.Utils.serverTimeToJapan(EAS.Utils.formatDateTime(timestamp));
                    const milliseconds = String(new Date(timestamp).getMilliseconds()).padStart(3, '0');
                    return japan ? `<div class="attack-send-time-japan">(${EAS.Utils.escapeHtml(japan)}.${milliseconds} Japão)</div>` : '';
                };
                const planning = document.createElement('div');
                planning.className = 'fake-nt-planning eas-table-wrapper';
                planning.innerHTML = `<h3>Planejamento do Fake NT</h3><table class="eas-table"><thead><tr><th>Alvo</th><th>Origem</th><th>Distância</th><th>Unidade lenta</th><th>Duração</th><th>Horário de envio</th><th>Horário de chegada</th><th>Capacidade</th><th>Status</th></tr></thead><tbody>${state.distribution.executionQueue.map((entry) => `<tr><td>${entry.target}</td><td>${EAS.Utils.escapeHtml(entry.villageName)}<br>${entry.villageCoord}</td><td>${EAS.Utils.formatNumber(entry.distance, 2, 2)}</td><td>${entry.slowUnit === 'ram' ? 'Aríete' : 'Catapulta'}</td><td>${EAS.Utils.formatDuration(entry.durationMs)}</td><td><strong>${EAS.Utils.formatDateTime(entry.sendTime, operation.intervalMs % 1000 !== 0)}</strong>${japanLine(entry.sendTime)}</td><td><strong>${EAS.Utils.formatDateTime(entry.arrivalTime, operation.intervalMs % 1000 !== 0)}</strong>${japanLine(entry.arrivalTime)}</td><td>${villageAnalyses.find((item) => Number(item.village.id) === Number(entry.villageId))?.capacity || 0}</td><td>${entry.timingStatus}</td></tr>`).join('')}</tbody></table>`;
                targetDistribution.appendChild(planning);
            }
            if (isAntiSnipe()) {
                const showJapan = localStorage.getItem('eas_tw_attack_timezone_japan') === 'true';
                const japanLine = (timestamp) => {
                    if (!showJapan) return '';
                    const japan = EAS.Utils.serverTimeToJapan(EAS.Utils.formatDateTime(timestamp));
                    const milliseconds = String(new Date(timestamp).getMilliseconds()).padStart(3, '0');
                    return japan ? `<div class="attack-send-time-japan">(${EAS.Utils.escapeHtml(japan)}.${milliseconds} Japão)</div>` : '';
                };
                const planning = document.createElement('div'); planning.className = 'fake-anti-snipe-planning eas-table-wrapper';
                planning.innerHTML = `<h3>Planejamento Anti-Snipe</h3><div class="fake-analysis-warning">Horários em milissegundos são estimativas. A latência, o navegador e o servidor podem alterar o resultado real.</div><table class="eas-table"><thead><tr><th>Selecionar</th><th>Sequência</th><th>Alvo</th><th>Origem</th><th>Offset</th><th>Chegada</th><th>Unidade lenta</th><th>Duração</th><th>Envio calculado</th><th>Horário recomendado</th><th>Status</th><th>Ação</th></tr></thead><tbody>${state.distribution.executionQueue.map((entry) => `<tr><td><input type="checkbox" checked data-anti-active="${entry.target}:${entry.sequence}"></td><td>${entry.sequence}</td><td>${entry.target}</td><td>${EAS.Utils.escapeHtml(entry.villageName)}<br>${entry.villageCoord}</td><td><input class="eas-input" type="number" value="${entry.offsetMs}" data-anti-offset="${entry.target}:${entry.sequence}"> ms</td><td><strong>${EAS.Utils.formatDateTime(entry.arrivalTime, true)}</strong>${japanLine(entry.arrivalTime)}</td><td>${EAS.Utils.escapeHtml(entry.slowUnit)}</td><td>${EAS.Utils.formatDuration(entry.durationMs)}</td><td><strong>${EAS.Utils.formatDateTime(entry.sendTime, true)}</strong>${japanLine(entry.sendTime)}</td><td><strong>${EAS.Utils.formatDateTime(entry.recommendedActionTime, true)}</strong>${japanLine(entry.recommendedActionTime)}</td><td>${entry.timingStatus}</td><td><button type="button" data-anti-remove="${entry.target}:${entry.sequence}">Remover</button></td></tr>`).join('')}</tbody></table>`;
                const findSource = (key) => { const [target, sequence] = key.split(':'); const assignment = state.distribution.assignments.find((item) => item.target === target); return { assignment, source: assignment?.sources.find((item) => Number(item.sequence) === Number(sequence)) }; };
                planning.querySelectorAll('[data-anti-active]').forEach((input) => input.addEventListener('change', () => { const found = findSource(input.dataset.antiActive); if (found.source) found.source.disabled = !input.checked; rebuildQueue(); }));
                planning.querySelectorAll('[data-anti-offset]').forEach((input) => input.addEventListener('change', () => { const found = findSource(input.dataset.antiOffset); if (found.source) { found.source.offsetMs = Math.trunc(Number(input.value) || 0); found.source.arrivalTime = operation.antiCentralTimestamp + found.source.offsetMs; renderMultiVillageAnalysis(); } }));
                planning.querySelectorAll('[data-anti-remove]').forEach((button) => button.addEventListener('click', () => { const found = findSource(button.dataset.antiRemove); if (found.assignment && found.source) { found.assignment.sources.splice(found.assignment.sources.indexOf(found.source), 1); renderMultiVillageAnalysis(); } }));
                targetDistribution.appendChild(planning);
            }

            prepareOperationContainer.innerHTML = '';
            const prepareButton = EAS.UI.createButton({
                text: isFakeNt() ? 'Preparar operação Fake NT' : isAntiSnipe() ? 'Preparar operação Anti-Snipe' : 'Preparar operação',
                disabled: !operation.valid || !distributedCommands || ((isFakeNt() || isAntiSnipe()) && state.distribution.executionQueue.some((entry) => entry.timingStatus === 'Atrasado')),
                onClick: () => {
                    rebuildQueue();
                    const execution = {
                        preset: presetSelect.value,
                        commandType: isFakeNt() || isAntiSnipe() ? 'attack' : commandTypeSelect.value,
                        allowCommandSwitch: isFakeNt() || isAntiSnipe() ? false : commandSwitchInput.checked,
                        centralArrival: isAntiSnipe() ? operation.antiCentralTimestamp : null,
                        intervalMs: isAntiSnipe() ? Number(antiIntervalInput.value) : operation.intervalMs,
                        latencyCorrectionMs: isAntiSnipe() ? operation.latencyCorrectionMs : 0,
                        troopsPerTarget: { ...operation.troops },
                        fakesPerTarget,
                        selectedVillageIds: selected.map((analysis) =>
                            analysis.village.id
                        ),
                        queue: state.distribution.executionQueue.map(
                            (entry) => ({ ...entry })
                        ).filter((entry) => !entry.disabled
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
            } else if (isAntiSnipe() && !operation.antiCentralTimestamp) {
                validationMessage = 'Informe data, hora e milissegundos centrais válidos.';
            } else if (isAntiSnipe() && !operation.antiOffsets.length) {
                validationMessage = 'Informe ao menos um offset Anti-Snipe válido.';
            } else if (isFakeNt() && !compatibleSlowUnits.length) {
                validationMessage = 'Este mundo não possui uma unidade compatível com Fake NT.';
            } else if (isFakeNt() && !operation.arrivalTimestamp) {
                validationMessage = 'Informe data e hora de chegada válidas, incluindo segundos.';
            } else if (isFakeNt() && !(operation.troops.ram > 0 || operation.troops.catapult > 0)) {
                validationMessage = 'Fake NT exige ao menos um Aríete ou uma Catapulta.';
            } else if (isFakeNt() && operation.troops.snob > 0) {
                validationMessage = 'Fake NT não pode utilizar Nobre.';
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
                const commandValidation = EAS.CommandRules.validateCommandComposition({
                    world: EAS.CommandRules.getWorld(), villageId: village.id,
                    villageCoord: village.coordinate,
                    commandType: commandTypeSelect.value, troops: operation.troops
                });

                return {
                    village: { ...village },
                    availableTroops,
                    hasTroopData,
                    commandValidation,
                    ...capacity,
                    sufficient: capacity.sufficient && operation.valid && commandValidation.valid
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
                allowCommandSwitch: commandSwitchInput.checked,
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
            commandTypeSelect.value = preset.defaultCommandType || preset.commandType;
            availableUnits.forEach((unit) => {
                troopInputs[unit.id].value = normalizeQuantity(preset.troops[unit.id]);
            });
            if (isFakeNt()) {
                const slowUnit = compatibleSlowUnits.includes(slowUnitSelect.value) ? slowUnitSelect.value : compatibleSlowUnits[0];
                if (slowUnit && troopInputs[slowUnit]) troopInputs[slowUnit].value = Math.max(1, normalizeQuantity(troopInputs[slowUnit].value));
                fakesPerTargetInput.value = savedFakeNtCommands;
            } else if (isAntiSnipe()) {
                fakesPerTargetInput.value = Math.max(1, normalizeQuantity(savedAntiSnipeConfig.commandCount) || 6);
            }
            configurePresetUi();
            invalidateAndMaybeReanalyze();
        };

        const configurePresetUi = () => {
            const fakeNt = isFakeNt();
            const antiSnipe = isAntiSnipe();
            fakeNtSection.hidden = !fakeNt;
            antiSnipeSection.hidden = !antiSnipe;
            commandTypeSelect.closest('.eas-field').hidden = fakeNt || antiSnipe;
            commandSwitchOption.hidden = fakeNt || antiSnipe;
            fakesPerTargetInput.closest('.eas-field').querySelector('label')?.replaceChildren(document.createTextNode(fakeNt ? 'Comandos Fake NT por alvo' : antiSnipe ? 'Comandos Anti-Snipe por alvo' : 'Fakes por alvo'));
            if (fakeNt || antiSnipe) {
                commandTypeSelect.value = 'attack';
                commandSwitchInput.checked = false;
            }
            if (fakeNt) {
                if (troopInputs.snob) { troopInputs.snob.value = 0; troopInputs.snob.disabled = true; }
                if (compatibleSlowUnits.length && !compatibleSlowUnits.some((id) => normalizeQuantity(troopInputs[id]?.value) > 0)) {
                    troopInputs[slowUnitSelect.value || compatibleSlowUnits[0]].value = 1;
                }
                targetsTitle.textContent = 'Inserir coordenadas manualmente (opcional)';
            } else {
                targetsTitle.textContent = 'Coordenadas dos alvos';
                if (troopInputs.snob) troopInputs.snob.disabled = false;
            }
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
        commandSwitchInput.addEventListener('change', () => {
            writeStorage(
                STORAGE_KEYS.allowCommandSwitch,
                commandSwitchInput.checked
            );
            invalidateAndMaybeReanalyze();
        });
        fakesPerTargetInput.addEventListener('input', () => {
            fakesPerTargetInput.value = Math.max(
                1,
                normalizeQuantity(fakesPerTargetInput.value)
            );
            invalidateAndMaybeReanalyze();
            if (isFakeNt()) writeStorage(STORAGE_KEYS.fakeNtCommands, Number(fakesPerTargetInput.value));
        });
        completionUnitSelect.addEventListener('change', renderPopulationRule);
        coordinatesInput.addEventListener('input', () => {
            invalidateAnalysis();
            updateSummary();
        });
        Object.values(troopInputs).forEach((input) => {
            input.addEventListener('input', () => {
                if (isFakeNt() && input === troopInputs.snob) input.value = 0;
                if (isFakeNt() && compatibleSlowUnits.length && !compatibleSlowUnits.some((id) => normalizeQuantity(troopInputs[id]?.value) > 0)) {
                    troopInputs[slowUnitSelect.value || compatibleSlowUnits[0]].value = 1;
                }
                invalidateAndMaybeReanalyze();
            });
        });
        slowUnitSelect.addEventListener('change', () => {
            const other = slowUnitSelect.value === 'ram' ? 'catapult' : 'ram';
            if (troopInputs[slowUnitSelect.value]) troopInputs[slowUnitSelect.value].value = Math.max(1, normalizeQuantity(troopInputs[slowUnitSelect.value].value));
            if (troopInputs[other]) troopInputs[other].value = 0;
            invalidateAndMaybeReanalyze();
        });
        [arrivalDateInput, arrivalTimeInput, intervalSelect].forEach((input) => input.addEventListener('input', invalidateAndMaybeReanalyze));
        [antiDateInput, antiTimeInput, antiMillisecondsInput, antiIntervalInput, antiLatencyInput, antiCustomOffsetsInput, antiSpeedUnitSelect, antiDiversityInput].forEach((input) => input.addEventListener('input', invalidateAndMaybeReanalyze));
        antiModeSelect.addEventListener('change', () => { toggleCustomOffsets(); invalidateAndMaybeReanalyze(); });
        antiSpeedUnitSelect.addEventListener('change', () => {
            if (antiSpeedUnitSelect.value !== 'composition' && troopInputs[antiSpeedUnitSelect.value]) {
                troopInputs[antiSpeedUnitSelect.value].value = Math.max(1, normalizeQuantity(troopInputs[antiSpeedUnitSelect.value].value));
                completionUnitSelect.value = antiSpeedUnitSelect.value;
            }
            invalidateAndMaybeReanalyze();
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
        const rulesButton = EAS.UI.createButton({
            text: 'Regras detectadas',
            className: 'eas-button--secondary',
            onClick: () => {
                const rulesWin = EAS.UI.createWindow({ id: 'eas-command-rules', title: 'Regras detectadas', width: 680 });
                const render = () => {
                    const world = EAS.CommandRules.getWorld();
                    const rules = EAS.CommandRules.getWorldRules(world);
                    const villages = Object.values(rules.villageRules || {});
                    const units = Object.values(rules.unitRules || {});
                    rulesWin.body.innerHTML = `<p><strong>Mundo:</strong> ${EAS.Utils.escapeHtml(world)}</p><h3>Aldeias</h3>${villages.length ? `<div class="eas-table-wrapper"><table class="eas-table"><thead><tr><th>Aldeia</th><th>Coordenada</th><th>População mínima</th><th>Detectada</th><th>Ação</th></tr></thead><tbody>${villages.map((rule) => `<tr><td>${EAS.Utils.escapeHtml(rule.villageName || rule.villageId)}</td><td>${EAS.Utils.escapeHtml(rule.villageCoord || '-')}</td><td>${rule.minimumAttackPopulation}</td><td>${new Date(rule.lastConfirmedAt || rule.detectedAt).toLocaleString('pt-BR')}</td><td><button type="button" data-clear-village="${EAS.Utils.escapeHtml(rule.villageId)}">Limpar</button></td></tr>`).join('')}</tbody></table></div>` : '<p>Nenhuma regra de aldeia detectada.</p>'}<h3>Unidades</h3>${units.length ? `<ul>${units.map((rule) => `<li>${EAS.Utils.escapeHtml(rule.unit)} — mínimo ${rule.minimumQuantity}</li>`).join('')}</ul>` : '<p>Nenhuma regra de unidade detectada.</p>'}<div class="eas-actions"><button type="button" data-rule-action="scan">Reescanear ao próximo erro</button><button type="button" data-rule-action="clear">Limpar regras do mundo</button><button type="button" data-rule-action="export">Exportar diagnóstico</button></div><div class="eas-status eas-status--info" data-rule-status>Revise as regras aprendidas com erros reais do jogo.</div>`;
                    rulesWin.body.querySelectorAll('[data-clear-village]').forEach((button) => button.addEventListener('click', () => {
                        if (confirm('Deseja limpar a regra desta aldeia?')) { EAS.CommandRules.clearVillageRule(world, button.dataset.clearVillage); render(); }
                    }));
                    rulesWin.body.querySelector('[data-rule-action="clear"]').addEventListener('click', () => {
                        if (confirm('Deseja limpar todas as regras deste mundo?')) { EAS.CommandRules.clearWorldRules(world); render(); }
                    });
                    rulesWin.body.querySelector('[data-rule-action="export"]').addEventListener('click', async () => {
                        const diagnostic = JSON.stringify({ version: 1, world, rules }, null, 2);
                        try { await navigator.clipboard.writeText(diagnostic); rulesWin.body.querySelector('[data-rule-status]').textContent = 'Diagnóstico copiado.'; }
                        catch { prompt('Copie o diagnóstico:', diagnostic); }
                    });
                    rulesWin.body.querySelector('[data-rule-action="scan"]').addEventListener('click', () => {
                        const output = rulesWin.body.querySelector('[data-rule-status]');
                        output.textContent = 'Observando a área principal por 5 segundos...';
                        EAS.CommandRules.observeCommandRuleErrors({ timeout: 5000, onRule: (rule) => { output.textContent = `Regra detectada: ${rule.type}.`; setTimeout(render, 400); } });
                    });
                };
                render();
            }
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
                const unit = completionUnitSelect.value;
                const troops = getTroops();
                const candidates = (currentAnalysis?.villageAnalyses || EAS.Villages.list().map((village) => ({ village })))
                    .map(({ village }) => EAS.CommandRules.suggestCompositionAdjustment({
                        world: EAS.CommandRules.getWorld(), villageId: village.id,
                        villageCoord: village.coordinate, commandType: commandTypeSelect.value,
                        troops, preferredUnits: [unit]
                    })).sort((a, b) => b.additionalQuantity - a.additionalQuantity);
                const suggestion = candidates[0];

                if (!suggestion?.additionalQuantity || !troopInputs[unit]) {
                    EAS.UI.showStatus({ target: status, message: 'Nenhum ajuste conhecido é necessário. Aldeias sem regra detectada não recebem mínimo presumido.', type: 'info' });
                    return;
                }

                const hadAnalysis = !analysisSection.hidden;
                troopInputs[unit].value = normalizeQuantity(troopInputs[unit].value) +
                    suggestion.additionalQuantity;
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
                if (isFakeNt() && troopInputs[slowUnitSelect.value]) {
                    troopInputs[slowUnitSelect.value].value = 1;
                }
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
                    ),
                    writeStorage(
                        STORAGE_KEYS.allowCommandSwitch,
                        commandSwitchInput.checked
                    ),
                    !isFakeNt() || writeStorage(STORAGE_KEYS.fakeNtConfig, {
                        slowUnit: slowUnitSelect.value,
                        arrivalDate: arrivalDateInput.value,
                        arrivalTime: arrivalTimeInput.value,
                        intervalMs: Number(intervalSelect.value)
                    }),
                    !isFakeNt() || writeStorage(STORAGE_KEYS.fakeNtCommands, Math.max(1, normalizeQuantity(fakesPerTargetInput.value))),
                    !isAntiSnipe() || writeStorage(STORAGE_KEYS.antiSnipeConfig, {
                        centralDate: antiDateInput.value, centralTime: antiTimeInput.value,
                        milliseconds: Number(antiMillisecondsInput.value), mode: antiModeSelect.value,
                        commandCount: Math.max(1, normalizeQuantity(fakesPerTargetInput.value)),
                        intervalMs: Math.max(1, normalizeQuantity(antiIntervalInput.value)),
                        latencyCorrectionMs: Math.trunc(Number(antiLatencyInput.value) || 0),
                        customOffsets: antiCustomOffsetsInput.value,
                        speedUnit: antiSpeedUnitSelect.value,
                        preferDiversity: antiDiversityInput.checked
                    })
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
        actions.appendChild(rulesButton);
        actions.appendChild(clearButton);
        actions.appendChild(saveButton);
        actions.appendChild(backButton);

        manager.appendChild(description);
        manager.appendChild(presetsForm);
        manager.appendChild(troopsSection);
        manager.appendChild(populationSection);
        manager.appendChild(fakeNtSection);
        manager.appendChild(antiSnipeSection);
        manager.appendChild(targetsSection);
        manager.appendChild(summarySection);
        manager.appendChild(analysisSection);
        manager.appendChild(actions);
        manager.appendChild(status);
        win.body.appendChild(manager);
        if (isFakeNt()) fakesPerTargetInput.value = savedFakeNtCommands;
        if (isAntiSnipe()) fakesPerTargetInput.value = Math.max(1, normalizeQuantity(savedAntiSnipeConfig.commandCount) || 6);
        configurePresetUi();
        updateSummary();

        if (autoAnalyze) {
            setTimeout(() => analyzeOperation(), 0);
        }
    };
})();
