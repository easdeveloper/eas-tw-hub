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
        const serverDateTime = EAS.World.getServerDateTime();

        return Number(serverDateTime.timestamp || Date.now());
    };

    const parseArrivalTimestamp = (dateValue, timeValue) => {
        const dateMatch = String(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        const timeMatch = String(timeValue).match(/^(\d{2}):(\d{2}):(\d{2})$/);

        if (!dateMatch || !timeMatch) {
            return null;
        }

        const year = Number(dateMatch[1]);
        const month = Number(dateMatch[2]);
        const day = Number(dateMatch[3]);
        const hours = Number(timeMatch[1]);
        const minutes = Number(timeMatch[2]);
        const seconds = Number(timeMatch[3]);

        if (
            hours > 23 ||
            minutes > 59 ||
            seconds > 59
        ) {
            return null;
        }

        const timestamp = new Date(
            year,
            month - 1,
            day,
            hours,
            minutes,
            seconds
        ).getTime();
        const date = new Date(timestamp);

        if (
            date.getFullYear() !== year ||
            date.getMonth() !== month - 1 ||
            date.getDate() !== day ||
            date.getHours() !== hours ||
            date.getMinutes() !== minutes ||
            date.getSeconds() !== seconds
        ) {
            return null;
        }

        return timestamp;
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

        return villages
            .map((village) => {
                if (!parsedDestination) {
                    return {
                        village,
                        distance: null,
                        durationMs: null,
                        sendTimestamp: null,
                        status: 'Coordenada inválida'
                    };
                }

                const distance = EAS.Utils.distance(
                    village.coordinate,
                    parsedDestination
                );

                if (distance === 0) {
                    return {
                        village,
                        distance,
                        durationMs: 0,
                        sendTimestamp: arrivalTimestamp,
                        status: 'Destino igual à origem'
                    };
                }

                const durationMs =
                    (distance * unit.minutesPerField * MS_PER_MINUTE) /
                    speedFactor;
                const sendTimestamp = arrivalTimestamp - durationMs;

                return {
                    village,
                    distance,
                    durationMs,
                    sendTimestamp,
                    status:
                        sendTimestamp < now
                            ? 'Horário já passou'
                            : 'Pronto'
                };
            })
            .sort((a, b) => {
                if (a.sendTimestamp === null) {
                    return 1;
                }

                if (b.sendTimestamp === null) {
                    return -1;
                }

                return a.sendTimestamp - b.sendTimestamp;
            });
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
            type: 'date',
            name: 'arrival-date'
        });

        const timeInput = EAS.UI.createInput({
            type: 'time',
            name: 'arrival-time'
        });
        timeInput.step = '1';

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
                input: dateInput
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
        status.textContent = 'Informe os dados de chegada e calcule os envios.';

        const table = EAS.UI.createTable({
            columns: [
                { key: 'village', label: 'Aldeia' },
                { key: 'coordinate', label: 'Coordenada' },
                { key: 'distance', label: 'Distância' },
                { key: 'duration', label: 'Duração' },
                { key: 'sendAt', label: 'Horário de envio' },
                { key: 'status', label: 'Status' },
                { key: 'action', label: 'Ação' }
            ],
            rows: []
        });

        const calculateButton = EAS.UI.createButton({
            text: 'Calcular',
            icon: '🧮',
            onClick: () => {
                const destination = coordinateInput.value.trim();
                const arrivalTimestamp = parseArrivalTimestamp(
                    dateInput.value,
                    timeInput.value
                );

                if (arrivalTimestamp === null) {
                    EAS.UI.showStatus({
                        target: status,
                        message: 'Informe data e horário de chegada válidos, incluindo segundos.',
                        type: 'error'
                    });
                    table.setRows([]);
                    return;
                }

                saveSettings({
                    destination,
                    unit: unitSelect.value
                });

                const rows = calculateRows({
                    destination,
                    arrivalTimestamp,
                    unitId: unitSelect.value
                });

                renderRows(table.tbody, rows);

                EAS.UI.showStatus({
                    target: status,
                    message: `${rows.length} aldeias avaliadas com base no horário do servidor.`,
                    type: EAS.Utils.isValidCoordinate(destination)
                        ? 'success'
                        : 'error'
                });
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
                EAS.Storage?.remove?.(STORAGE_KEY);
                EAS.UI.showStatus({
                    target: status,
                    message: 'Campos limpos.',
                    type: 'info'
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
        actions.appendChild(clearButton);
        actions.appendChild(backButton);

        win.body.appendChild(form);
        win.body.appendChild(actions);
        win.body.appendChild(status);
        win.body.appendChild(table.element);
    };
})();
