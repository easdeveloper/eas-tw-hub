(() => {
    'use strict';

    EAS.Modules = EAS.Modules || {};
    EAS.Modules.Attack = EAS.Modules.Attack || {};

    const STORAGE_KEY = 'modules.attack';
    const MS_PER_MINUTE = 60 * 1000;

    const UNIT_SPEEDS = [
        { id: 'spear', name: 'Lanceiro', minutesPerField: 18 },
        { id: 'sword', name: 'Espada', minutesPerField: 22 },
        { id: 'axe', name: 'Machado', minutesPerField: 18 },
        { id: 'archer', name: 'Arqueiro', minutesPerField: 18 },
        { id: 'spy', name: 'Explorador', minutesPerField: 9 },
        { id: 'light', name: 'Cavalaria leve', minutesPerField: 10 },
        { id: 'marcher', name: 'Arqueiro montado', minutesPerField: 10 },
        { id: 'heavy', name: 'Cavalaria pesada', minutesPerField: 11 },
        { id: 'ram', name: 'Aríete', minutesPerField: 30 },
        { id: 'catapult', name: 'Catapulta', minutesPerField: 30 },
        { id: 'knight', name: 'Paladino', minutesPerField: 10 },
        { id: 'snob', name: 'Nobre', minutesPerField: 35 }
    ];

    const getSettings = () => {
        if (EAS.Storage?.get) {
            return EAS.Storage.get(STORAGE_KEY, {});
        }

        return {};
    };

    const saveSettings = (settings) => {
        if (EAS.Storage?.set) {
            EAS.Storage.set(STORAGE_KEY, settings);
        }
    };

    const getWorldSpeed = () => {
        return Number(EAS.World.getSpeed?.() || 1);
    };

    const getUnitSpeed = () => {
        return Number(EAS.World.getUnitSpeed?.() || 1);
    };

    const getServerTimestamp = () => {
        return EAS.World.getServerNowTimestamp();
    };

    const parseArrivalTimestamp = (dateValue, timeValue) => {
        const serverDateTime = EAS.Utils.createServerDateTime(
            dateValue,
            timeValue
        );

        return serverDateTime?.timestamp ?? null;
    };

    const formatTime = (timestamp) => {
        if (!Number.isFinite(timestamp)) {
            return '-';
        }

        const date = new Date(timestamp);

        return [
            date.getHours(),
            date.getMinutes(),
            date.getSeconds()
        ].map((value) => String(value).padStart(2, '0')).join(':');
    };

    const formatDuration = (durationMs) => {
        if (!Number.isFinite(durationMs)) {
            return '-';
        }

        const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return [hours, minutes, seconds]
            .map((value) => String(value).padStart(2, '0'))
            .join(':');
    };

    const formatDateTime = (timestamp) => {
        if (!Number.isFinite(timestamp)) {
            return '-';
        }

        const date = new Date(timestamp);
        const parts = [
            date.getDate(),
            date.getMonth() + 1,
            date.getFullYear()
        ];
        const time = [
            date.getHours(),
            date.getMinutes(),
            date.getSeconds()
        ];

        return `${parts
            .map((value, index) =>
                index === 2
                    ? String(value)
                    : String(value).padStart(2, '0')
            )
            .join('/')} ${time
            .map((value) => String(value).padStart(2, '0'))
            .join(':')}`;
    };

    const getUnitById = (unitId) => {
        return UNIT_SPEEDS.find((unit) => unit.id === unitId) || UNIT_SPEEDS[0];
    };

    const pluralize = (count, singular, plural) => {
        return `${count} ${count === 1 ? singular : plural}`;
    };

    const formatTroopSourceInfo = (sourceInfo) => {
        if (!sourceInfo.available) {
            if (sourceInfo.rows?.length) {
                return 'Não foi possível identificar a linha de tropas disponíveis.';
            }

            return 'Dados de tropas indisponíveis nesta tela.';
        }

        const sourceLabel = {
            game_data: 'dados globais da página',
            troop_overview: 'visualização de Tropas',
            cache: 'cache do EAS TW Hub'
        }[sourceInfo.source] || sourceInfo.source;
        const updatedAt = sourceInfo.updatedAtServer
            ? formatTime(sourceInfo.updatedAtServer)
            : 'horário desconhecido';
        const rowLabel = sourceInfo.rowType
            ? `, linha: ${sourceInfo.label || sourceInfo.rowType}`
            : '';

        return `Dados de tropas: ${sourceLabel}${rowLabel}, atualizados às ${updatedAt} do servidor.`;
    };

    const getPlaceUrl = (villageId) => {
        const url = new URL('game.php', location.origin);
        url.searchParams.set('village', villageId);
        url.searchParams.set('screen', 'place');

        return url.toString();
    };

    const createSelect = (value) => {
        const select = document.createElement('select');
        select.className = 'eas-input';
        select.name = 'unit';

        UNIT_SPEEDS.forEach((unit) => {
            const option = document.createElement('option');
            option.value = unit.id;
            option.textContent = `${unit.name} (${unit.minutesPerField} min/campo)`;
            select.appendChild(option);
        });

        select.value = getUnitById(value).id;

        return select;
    };

    const calculateRows = ({
        destination,
        arrivalTimestamp,
        unitId
    }) => {
        const parsedDestination = EAS.Utils.parseCoordinate(destination);
        const villages = EAS.Villages.list();
        const unit = getUnitById(unitId);
        const speedFactor = getWorldSpeed() * getUnitSpeed();
        const now = getServerTimestamp();
        const summary = {
            registered: villages.length,
            withTroopData: 0,
            withUnit: 0,
            canSend: 0,
            displayed: 0,
            withoutUnit: 0,
            unavailable: 0,
            sameDestination: 0,
            pastSend: 0,
            invalidData: 0
        };
        const exclusions = [];

        const rows = villages
            .reduce((result, village) => {
                const hasTroopData = EAS.Troops.hasVillageData(village.id);
                const availableTroops = EAS.Troops.getVillageTroops(village.id);
                const available = availableTroops[unitId] || 0;

                if (!hasTroopData) {
                    summary.unavailable += 1;
                    exclusions.push({
                        village,
                        reason: 'sem dados de tropas'
                    });
                    return result;
                }

                summary.withTroopData += 1;

                if (available < 1) {
                    summary.withoutUnit += 1;
                    exclusions.push({
                        village,
                        reason: 'sem a unidade selecionada'
                    });
                    return result;
                }

                summary.withUnit += 1;

                if (!parsedDestination) {
                    summary.invalidData += 1;
                    exclusions.push({
                        village,
                        reason: 'dados inválidos'
                    });
                    return result;
                }

                const distance = EAS.Utils.distance(
                    village.coordinate,
                    parsedDestination
                );

                if (distance === 0) {
                    summary.sameDestination += 1;
                    exclusions.push({
                        village,
                        reason: 'destino igual à origem'
                    });
                    return result;
                }

                const durationMs =
                    (distance * unit.minutesPerField * MS_PER_MINUTE) /
                    speedFactor;
                const sendTimestamp = arrivalTimestamp - durationMs;

                if (sendTimestamp < now) {
                    summary.pastSend += 1;
                    exclusions.push({
                        village,
                        reason: 'horário de envio já passou'
                    });
                    return result;
                }

                summary.canSend += 1;
                result.push({
                    village,
                    available,
                    distance,
                    durationMs,
                    sendTimestamp,
                    status: 'Pronto'
                });

                return result;
            }, [])
            .sort((a, b) => {
                if (a.sendTimestamp === null) {
                    return 1;
                }

                if (b.sendTimestamp === null) {
                    return -1;
                }

                return a.sendTimestamp - b.sendTimestamp;
            });

        summary.displayed = rows.length;

        return {
            rows,
            summary,
            exclusions
        };
    };

    const renderRows = (tbody, rows) => {
        tbody.innerHTML = '';

        rows.forEach((row) => {
            const tr = document.createElement('tr');
            const village = row.village;
            tr.className = `eas-attack-row eas-attack-row--${row.status
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '')}`;
            const values = [
                EAS.Utils.escapeHtml(village.name),
                EAS.Utils.escapeHtml(village.coordinate),
                EAS.Utils.escapeHtml(row.available),
                row.distance === null
                    ? '-'
                    : EAS.Utils.formatNumber(row.distance, 2, 2),
                formatDuration(row.durationMs),
                formatDateTime(row.sendTimestamp),
                row.status
            ];

            values.forEach((value) => {
                const td = document.createElement('td');
                td.innerHTML = value;
                tr.appendChild(td);
            });

            const actionCell = document.createElement('td');
            const button = EAS.UI.createButton({
                text: 'Abrir Praça',
                icon: '🏛️',
                disabled: !village.id,
                onClick: () => {
                    window.open(
                        getPlaceUrl(village.id),
                        '_blank',
                        'noopener,noreferrer'
                    );
                }
            });

            actionCell.appendChild(button);
            tr.appendChild(actionCell);
            tbody.appendChild(tr);
        });
    };

    const renderExclusions = (container, exclusions) => {
        container.innerHTML = '';

        if (!exclusions.length) {
            container.hidden = true;
            return;
        }

        const details = document.createElement('details');
        details.className = 'eas-details';

        const summary = document.createElement('summary');
        summary.textContent = 'Ver aldeias não incluídas';
        details.appendChild(summary);

        const table = EAS.UI.createTable({
            columns: [
                { key: 'village', label: 'Aldeia' },
                { key: 'coordinate', label: 'Coordenada' },
                { key: 'reason', label: 'Motivo' }
            ],
            rows: exclusions.map((item) => ({
                village: item.village.name,
                coordinate: item.village.coordinate,
                reason: item.reason
            }))
        });

        details.appendChild(table.element);
        container.appendChild(details);
        container.hidden = false;
    };

    const renderDiagnostics = (container, unitId) => {
        const serverDateTime = EAS.World.getServerDateTime();
        const villagesInfo = EAS.Villages.getSourceInfo?.() || {};
        const troopsInfo = EAS.Troops.getSourceInfo();
        const localNow = Date.now();
        const difference = serverDateTime.available
            ? serverDateTime.timestamp - localNow
            : null;
        const villageSources = villagesInfo.sources || {};
        const troopRows = troopsInfo.rows || [];
        const troopUnits = Object.keys(troopsInfo.unitColumns || {});

        container.innerHTML = '';

        const details = document.createElement('details');
        details.className = 'eas-details';

        const summary = document.createElement('summary');
        summary.textContent = 'Diagnóstico técnico';
        details.appendChild(summary);

        const grid = document.createElement('div');
        grid.className = 'eas-diagnostic__grid';
        grid.innerHTML = `
            <div>
                <strong>Horário do servidor</strong>
                <span>${EAS.Utils.escapeHtml(serverDateTime.formatted || '-')}</span>
            </div>
            <div>
                <strong>Fonte do horário</strong>
                <span>${EAS.Utils.escapeHtml(serverDateTime.source || '-')}</span>
            </div>
            <div>
                <strong>Horário local</strong>
                <span>${EAS.Utils.escapeHtml(formatDateTime(localNow))}</span>
            </div>
            <div>
                <strong>Diferença servidor/local</strong>
                <span>${difference === null ? '-' : EAS.Utils.escapeHtml(formatDuration(Math.abs(difference)))}</span>
            </div>
            <div>
                <strong>Aldeias carregadas</strong>
                <span>${EAS.Utils.escapeHtml(villagesInfo.total ?? '-')}</span>
            </div>
            <div>
                <strong>Fonte das aldeias</strong>
                <span>${EAS.Utils.escapeHtml(villagesInfo.selectedSource || '-')}</span>
            </div>
            <div>
                <strong>Completude aldeias</strong>
                <span>${EAS.Utils.escapeHtml(villagesInfo.completeness || '-')}</span>
            </div>
            <div>
                <strong>Contagem por fonte</strong>
                <span>${EAS.Utils.escapeHtml([
                    `gameData=${villageSources.gameData || 0}`,
                    `switcher=${villageSources.villageSwitcher || 0}`,
                    `overview=${villageSources.overview || 0}`,
                    `cache=${villageSources.cache || 0}`,
                    `current=${villageSources.currentVillage || 0}`
                ].join(', '))}</span>
            </div>
            <div>
                <strong>Fonte das tropas</strong>
                <span>${EAS.Utils.escapeHtml(troopsInfo.source || '-')}</span>
            </div>
            <div>
                <strong>Atualização das tropas</strong>
                <span>${EAS.Utils.escapeHtml(troopsInfo.updatedAtServer ? `${formatTime(troopsInfo.updatedAtServer)} servidor` : '-')}</span>
            </div>
            <div>
                <strong>Unidade interna</strong>
                <span>${EAS.Utils.escapeHtml(unitId)}</span>
            </div>
            <div>
                <strong>Linha de tropas</strong>
                <span>${EAS.Utils.escapeHtml(troopsInfo.label || troopsInfo.rowType || '-')}</span>
            </div>
            <div>
                <strong>Linhas de tropas</strong>
                <span>${EAS.Utils.escapeHtml(troopRows.length)}</span>
            </div>
            <div>
                <strong>Tipos das linhas</strong>
                <span>${EAS.Utils.escapeHtml(troopRows.map((row) => row.type).join(', ') || '-')}</span>
            </div>
            <div>
                <strong>Colunas de unidades</strong>
                <span>${EAS.Utils.escapeHtml(troopUnits.length)}</span>
            </div>
            <div>
                <strong>Chaves detectadas</strong>
                <span>${EAS.Utils.escapeHtml(troopUnits.join(', ') || '-')}</span>
            </div>
        `;

        details.appendChild(grid);

        if (troopRows.length) {
            const rowsDetails = document.createElement('details');
            rowsDetails.className = 'eas-details';

            const rowsSummary = document.createElement('summary');
            rowsSummary.textContent = 'Linhas de tropas detectadas';
            rowsDetails.appendChild(rowsSummary);

            const rowsTable = EAS.UI.createTable({
                columns: [
                    { key: 'line', label: 'Linha' },
                    { key: 'text', label: 'Texto resumido' },
                    { key: 'type', label: 'Tipo detectado' }
                ],
                rows: troopRows.map((row) => ({
                    line: row.index,
                    text: row.text,
                    type: row.type
                }))
            });

            rowsDetails.appendChild(rowsTable.element);
            details.appendChild(rowsDetails);
        }

        container.appendChild(details);
    };

    EAS.Modules.Attack.open = () => {
        const savedSettings = getSettings();
        const win = EAS.UI.createWindow({
            id: 'eas-module-attack',
            title: 'Planejador de Ataques',
            icon: '⚔️',
            width: 950
        });

        const form = document.createElement('div');
        form.className = 'eas-form eas-attack-form';

        const coordinateInput = EAS.UI.createInput({
            value: savedSettings.destination || '',
            placeholder: 'Exemplo: 500|500',
            name: 'destination'
        });

        const dateInput = EAS.UI.createInput({
            value: savedSettings.arrivalDate || '',
            placeholder: 'DD/MM/AAAA',
            name: 'arrival-date'
        });
        dateInput.maxLength = 10;

        const timeInput = EAS.UI.createInput({
            value: savedSettings.arrivalTime || '',
            placeholder: 'HH:MM:SS',
            name: 'arrival-time'
        });
        timeInput.maxLength = 8;

        const unitSelect = createSelect(savedSettings.unit);

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
                input: dateInput,
                helpText: 'Use o formato DD/MM/AAAA.'
            })
        );
        form.appendChild(
            EAS.UI.createField({
                label: 'Horário de chegada',
                input: timeInput,
                helpText: 'Use o formato HH:MM:SS.'
            })
        );
        form.appendChild(
            EAS.UI.createField({
                label: 'Unidade',
                input: unitSelect
            })
        );

        const actions = document.createElement('div');
        actions.className = 'eas-actions';

        const status = document.createElement('div');
        status.className = 'eas-status eas-status--info';
        status.textContent = formatTroopSourceInfo(EAS.Troops.getSourceInfo());

        const emptyState = document.createElement('div');
        emptyState.className = 'eas-status eas-status--info';
        emptyState.textContent = 'Informe os dados de chegada e calcule os envios.';

        const exclusionsContainer = document.createElement('div');
        exclusionsContainer.hidden = true;

        const diagnosticsContainer = document.createElement('div');
        renderDiagnostics(diagnosticsContainer, unitSelect.value);
        unitSelect.addEventListener('change', () => {
            renderDiagnostics(diagnosticsContainer, unitSelect.value);
        });

        const table = EAS.UI.createTable({
            columns: [
                { key: 'village', label: 'Aldeia' },
                { key: 'coordinate', label: 'Coordenada' },
                { key: 'available', label: 'Disponível' },
                { key: 'distance', label: 'Distância' },
                { key: 'duration', label: 'Duração' },
                { key: 'sendAt', label: 'Horário de envio' },
                { key: 'status', label: 'Status' },
                { key: 'action', label: 'Ação' }
            ],
            rows: []
        });
        table.element.hidden = true;

        const calculateButton = EAS.UI.createButton({
            text: 'Calcular',
            icon: '🧮',
            onClick: () => {
                const destination = coordinateInput.value.trim();
                const serverDateTime = EAS.World.getServerDateTime();
                const arrivalTimestamp = parseArrivalTimestamp(
                    dateInput.value,
                    timeInput.value
                );

                renderDiagnostics(diagnosticsContainer, unitSelect.value);

                if (!serverDateTime.available) {
                    EAS.UI.showStatus({
                        target: status,
                        message: 'Não foi possível identificar o horário do servidor do Tribal Wars.',
                        type: 'error'
                    });
                    table.setRows([]);
                    table.element.hidden = true;
                    emptyState.hidden = false;
                    emptyState.textContent = 'Abra uma tela do jogo que contenha #serverDate e #serverTime e tente novamente.';
                    renderExclusions(exclusionsContainer, []);
                    return;
                }

                if (arrivalTimestamp === null) {
                    EAS.UI.showStatus({
                        target: status,
                        message: 'Informe data e horário de chegada válidos, incluindo segundos.',
                        type: 'error'
                    });
                    table.setRows([]);
                    table.element.hidden = true;
                    emptyState.hidden = false;
                    emptyState.textContent = 'Corrija data e horário para calcular.';
                    renderExclusions(exclusionsContainer, []);
                    return;
                }

                saveSettings({
                    destination,
                    arrivalDate: dateInput.value.trim(),
                    arrivalTime: timeInput.value.trim(),
                    unit: unitSelect.value
                });

                EAS.Troops.refresh();

                const calculation = calculateRows({
                    destination,
                    arrivalTimestamp,
                    unitId: unitSelect.value
                });
                const { rows, summary, exclusions } = calculation;
                const unit = getUnitById(unitSelect.value);
                const sourceInfo = EAS.Troops.getSourceInfo();

                renderRows(table.tbody, rows);
                renderExclusions(exclusionsContainer, exclusions);
                renderDiagnostics(diagnosticsContainer, unitSelect.value);
                table.element.hidden = rows.length === 0;

                EAS.UI.showStatus({
                    target: status,
                    message: `${[
                        pluralize(summary.registered, 'aldeia cadastrada', 'aldeias cadastradas'),
                        pluralize(summary.withTroopData, 'aldeia com dados de tropas', 'aldeias com dados de tropas'),
                        pluralize(summary.withUnit, `aldeia com ${unit.name} disponível`, `aldeias com ${unit.name} disponível`),
                        pluralize(summary.canSend, 'aldeia consegue chegar no horário', 'aldeias conseguem chegar no horário'),
                        pluralize(summary.displayed, 'aldeia exibida', 'aldeias exibidas')
                    ].join(', ')}. ${formatTroopSourceInfo(sourceInfo)}`,
                    type: rows.length > 0 && EAS.Utils.isValidCoordinate(destination)
                        ? 'success'
                        : 'error'
                });

                if (rows.length === 0) {
                    emptyState.hidden = false;
                    emptyState.textContent = sourceInfo.available
                        ? `Nenhuma aldeia possui ${unit.name} disponível.`
                        : 'Os dados de tropas desta aldeia não estão disponíveis nesta tela. Abra a visualização de Tropas para atualizar a leitura.';
                } else {
                    emptyState.hidden = true;
                    emptyState.textContent = '';
                }
            }
        });

        const clearButton = EAS.UI.createButton({
            text: 'Limpar',
            icon: '🧹',
            className: 'eas-button--secondary',
            onClick: () => {
                coordinateInput.value = '';
                unitSelect.value = UNIT_SPEEDS[0].id;
                table.setRows([]);
                table.element.hidden = true;
                emptyState.hidden = false;
                renderExclusions(exclusionsContainer, []);
                EAS.Storage?.remove?.(STORAGE_KEY);
                EAS.UI.showStatus({
                    target: status,
                    message: 'Campos limpos.',
                    type: 'info'
                });
                emptyState.textContent = 'Informe os dados de chegada e calcule os envios.';
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
        actions.appendChild(clearButton);
        actions.appendChild(backButton);

        win.body.appendChild(form);
        win.body.appendChild(actions);
        win.body.appendChild(status);
        win.body.appendChild(emptyState);
        win.body.appendChild(table.element);
        win.body.appendChild(exclusionsContainer);
        win.body.appendChild(diagnosticsContainer);
    };
})();
