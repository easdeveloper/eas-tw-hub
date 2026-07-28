(() => {
    'use strict';

    EAS.Troops = EAS.Troops || {};

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
    const CACHE_KEY = 'troops.available';

    let troopsByVillage = {};
    let sourceInfo = {
        available: false,
        source: 'none',
        rowType: null,
        label: null,
        updatedAtServer: null,
        updatedAtLocal: null,
        rows: [],
        unitColumns: {}
    };
    let hasAttemptedRefresh = false;

    const createEmptyTroops = () => {
        return UNITS.reduce((troops, unit) => {
            troops[unit] = 0;
            return troops;
        }, {});
    };

    const getCacheScope = () => {
        const info = EAS.World.getInfo();

        return {
            world: info.world || location.hostname,
            playerId: info.player?.id || 0
        };
    };

    const normalizeTroops = (value = {}) => {
        const troops = createEmptyTroops();

        UNITS.forEach((unit) => {
            troops[unit] = Math.max(0, Number(value[unit] || 0));
        });

        return troops;
    };

    const parseAmount = (value) => {
        const normalized = String(value ?? '')
            .replace(/\./g, '')
            .replace(/\s/g, '');
        const match = normalized.match(/\d+/);

        return Number(match?.[0] || 0);
    };

    const extractVillageId = (row) => {
        const link = row.querySelector('a[href*="village="]');

        if (!link) {
            return 0;
        }

        try {
            const url = new URL(link.href, location.origin);
            return Number(url.searchParams.get('village') || 0);
        } catch {
            const match = link.href.match(/[?&]village=(\d+)/);
            return Number(match?.[1] || 0);
        }
    };

    const getTechnicalText = (element) => {
        return [
            element.dataset?.type,
            element.dataset?.row,
            element.dataset?.group,
            element.dataset?.mode,
            element.getAttribute?.('data-row-type'),
            element.getAttribute?.('data-troop-type'),
            element.className,
            element.id,
            element.getAttribute?.('href')
        ].join(' ').toLowerCase();
    };

    EAS.Troops.detectRowType = (row, context = {}) => {
        const text = row.textContent?.trim().toLowerCase() || '';
        const technicalText = getTechnicalText(row);
        const firstCellText = row.children[0]?.textContent?.trim().toLowerCase() || '';
        const rowIndex = Number(context.rowIndex || 0);

        if (
            /(^|[^a-z])(home|available|own|in_village)([^a-z]|$)/.test(technicalText) ||
            firstCellText.includes('na aldeia') ||
            firstCellText.includes('em casa') ||
            firstCellText.includes('dispon') ||
            text.includes('na aldeia') ||
            text.includes('in village') ||
            text.includes('available')
        ) {
            return {
                rowType: 'home',
                label: 'Na aldeia'
            };
        }

        if (
            /(^|[^a-z])(total|all)([^a-z]|$)/.test(technicalText) ||
            firstCellText.includes('total') ||
            text.includes('total') ||
            text.includes('todos')
        ) {
            return {
                rowType: 'total',
                label: row.textContent?.trim() || ''
            };
        }

        if (
            /(^|[^a-z])(moving|command|commands)([^a-z]|$)/.test(technicalText) ||
            firstCellText.includes('em movimento') ||
            text.includes('em movimento') ||
            text.includes('comandos')
        ) {
            return {
                rowType: 'moving',
                label: row.textContent?.trim() || ''
            };
        }

        if (
            /(^|[^a-z])(away|out|outside)([^a-z]|$)/.test(technicalText) ||
            firstCellText.includes('fora') ||
            text.includes('fora') ||
            text.includes('próprias fora') ||
            text.includes('proprias fora')
        ) {
            return {
                rowType: 'away',
                label: row.textContent?.trim() || ''
            };
        }

        if (
            /(^|[^a-z])(support|supporting)([^a-z]|$)/.test(technicalText) ||
            firstCellText.includes('apoio') ||
            text.includes('apoio') ||
            text.includes('apoiando')
        ) {
            return {
                rowType: 'support',
                label: row.textContent?.trim() || ''
            };
        }

        if (context.hasUnitColumns && rowIndex === 1) {
            return {
                rowType: 'home',
                label: 'Na aldeia'
            };
        }

        return {
            rowType: 'unknown',
            label: row.textContent?.trim() || ''
        };
    };

    const detectUnit = (element) => {
        const text = [
            element.dataset?.unit,
            element.className,
            element.getAttribute?.('title'),
            element.getAttribute?.('alt'),
            element.getAttribute?.('src'),
            element.textContent
        ].join(' ').toLowerCase();

        return UNITS.find((unit) => {
            const pattern = new RegExp(`(^|[^a-z])${unit}([^a-z]|$)`, 'i');

            return pattern.test(text) ||
                text.includes(`unit_${unit}`) ||
                text.includes(`unit-${unit}`) ||
                text.includes(`unit ${unit}`);
        }) || null;
    };

    const detectUnitColumns = (table) => {
        const headerRows = Array.from(table.querySelectorAll('thead tr, tr'))
            .slice(0, 3);
        const columns = {};

        headerRows.forEach((row) => {
            Array.from(row.children).forEach((cell, index) => {
                const unit =
                    detectUnit(cell) ||
                    Array.from(cell.querySelectorAll('*'))
                        .map(detectUnit)
                        .find(Boolean);

                if (unit && columns[unit] === undefined) {
                    columns[unit] = index;
                }
            });
        });

        return columns;
    };

    const readFromGameData = () => {
        const data = EAS.World.getGameData();
        const source =
            data.player?.villages ||
            data.villages ||
            data.troops_by_village ||
            data.units_by_village;
        const result = {};

        if (!source || typeof source !== 'object') {
            return result;
        }

        Object.values(source).forEach((village) => {
            if (!village || typeof village !== 'object') {
                return;
            }

            const id = Number(village.id || village.village_id || 0);
            const units = village.units || village.troops || village.available;

            if (!id || !units || typeof units !== 'object') {
                return;
            }

            result[id] = normalizeTroops(units);
        });

        return result;
    };

    const readFromTables = () => {
        const result = {
            villages: {},
            rowType: null,
            label: null,
            rows: [],
            unitColumns: {}
        };
        const tables = Array.from(document.querySelectorAll('table'));

        tables.forEach((table) => {
            const unitColumns = detectUnitColumns(table);
            const units = Object.keys(unitColumns);
            result.unitColumns = {
                ...result.unitColumns,
                ...unitColumns
            };

            if (!units.length) {
                return;
            }

            const rows = Array.from(table.querySelectorAll('tbody tr, tr'));
            const rowDiagnostics = rows.map((row, index) => {
                const info = EAS.Troops.detectRowType(row, {
                    rowIndex: index,
                    hasUnitColumns: units.length > 0
                });

                return {
                    index: result.rows.length + index + 1,
                    text: row.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) || '',
                    type: info.rowType
                };
            });

            result.rows.push(...rowDiagnostics);
            result.rowType = result.rowType ||
                rowDiagnostics.find((row) => row.type === 'unknown')?.type ||
                null;

            rows.forEach((row, index) => {
                const villageId = extractVillageId(row);

                if (!villageId) {
                    return;
                }

                const cells = Array.from(row.children);
                const rowInfo = EAS.Troops.detectRowType(row, {
                    rowIndex: index,
                    hasUnitColumns: units.length > 0
                });

                if (rowInfo.rowType !== 'home') {
                    return;
                }

                const troops = result.villages[villageId] || createEmptyTroops();

                units.forEach((unit) => {
                    const cell = cells[unitColumns[unit]];

                    if (cell) {
                        troops[unit] = parseAmount(cell.textContent);
                    }
                });

                result.villages[villageId] = troops;
                result.rowType = 'home';
                result.label = rowInfo.label || 'Na aldeia';
            });
        });

        return result;
    };

    const hasTroopData = (value) => {
        return Object.keys(value).length > 0;
    };

    const mergeWithCache = (data) => {
        const cache = readCache();

        if (!cache?.villages && !cache?.troopsByVillage) {
            return data;
        }

        return {
            ...(cache.villages || cache.troopsByVillage),
            ...data
        };
    };

    const readCache = () => {
        if (!EAS.Storage?.get) {
            return null;
        }

        const cache = EAS.Storage.get(CACHE_KEY, null);
        const scope = getCacheScope();

        if (
            !cache ||
            cache.world !== scope.world ||
            Number(cache.playerId || 0) !== Number(scope.playerId || 0) ||
            !cache.villages &&
            !cache.troopsByVillage
        ) {
            return null;
        }

        return cache;
    };

    const saveCache = (source, data) => {
        if (!EAS.Storage?.set || !hasTroopData(data)) {
            return;
        }

        const scope = getCacheScope();
        const serverNow = EAS.World.getServerDateTime();

        EAS.Storage.set(CACHE_KEY, {
            ...scope,
            updatedAtServer: serverNow.available ? serverNow.timestamp : null,
            updatedAtLocal: Date.now(),
            source,
            rowType: sourceInfo.rowType,
            label: sourceInfo.label,
            villages: data
        });
    };

    const setData = (data, info) => {
        troopsByVillage = Object.entries(data).reduce(
            (result, [villageId, troops]) => {
                result[Number(villageId)] = normalizeTroops(troops);
                return result;
            },
            {}
        );
        sourceInfo = {
            available: hasTroopData(troopsByVillage),
            ...info
        };
    };

    EAS.Troops.refresh = () => {
        hasAttemptedRefresh = true;
        const gameDataTroops = readFromGameData();

        if (hasTroopData(gameDataTroops)) {
            setData(gameDataTroops, {
                source: 'game_data',
                rowType: 'home',
                label: 'Dados globais',
                updatedAtServer: EAS.World.getServerNowTimestamp(),
                updatedAtLocal: Date.now(),
                rows: [],
                unitColumns: {}
            });
            saveCache('game_data', troopsByVillage);
            return troopsByVillage;
        }

        const tableTroops = readFromTables();

        if (hasTroopData(tableTroops.villages) && tableTroops.rowType === 'home') {
            const mergedTroops = mergeWithCache(tableTroops.villages);

            setData(mergedTroops, {
                source: 'troop_overview',
                rowType: 'home',
                label: tableTroops.label || 'Na aldeia',
                updatedAtServer: EAS.World.getServerNowTimestamp(),
                updatedAtLocal: Date.now(),
                rows: tableTroops.rows,
                unitColumns: tableTroops.unitColumns
            });
            saveCache('troop_overview', troopsByVillage);
            return troopsByVillage;
        }

        const cache = readCache();

        if (cache) {
            setData(cache.villages || cache.troopsByVillage, {
                source: 'cache',
                rowType: cache.rowType || null,
                label: cache.label || null,
                updatedAtServer: cache.updatedAtServer || cache.updatedAt || null,
                updatedAtLocal: cache.updatedAtLocal || null,
                rows: tableTroops.rows,
                unitColumns: tableTroops.unitColumns
            });
            return troopsByVillage;
        }

        setData({}, {
            source: tableTroops.rows.length || Object.keys(tableTroops.unitColumns).length
                ? 'troop_overview'
                : 'none',
            rowType: tableTroops.rowType || null,
            label: tableTroops.label || null,
            updatedAtServer: null,
            updatedAtLocal: null,
            rows: tableTroops.rows,
            unitColumns: tableTroops.unitColumns
        });
        return troopsByVillage;
    };

    EAS.Troops.getVillageTroops = (villageId) => {
        const id = Number(villageId || 0);

        if (!sourceInfo.available && !hasAttemptedRefresh) {
            EAS.Troops.refresh();
        }

        return normalizeTroops(troopsByVillage[id]);
    };

    EAS.Troops.hasVillageData = (villageId) => {
        const id = Number(villageId || 0);

        if (!sourceInfo.available && !hasAttemptedRefresh) {
            EAS.Troops.refresh();
        }

        return Boolean(troopsByVillage[id]);
    };

    EAS.Troops.hasUnit = (villageId, unit, minimum = 1) => {
        if (!EAS.Troops.hasVillageData(villageId)) {
            return false;
        }

        return EAS.Troops.getVillageTroops(villageId)[unit] >= minimum;
    };

    EAS.Troops.getSourceInfo = () => {
        if (!sourceInfo.available && !hasAttemptedRefresh) {
            EAS.Troops.refresh();
        }

        return { ...sourceInfo };
    };

    EAS.Troops.refresh();
})();
