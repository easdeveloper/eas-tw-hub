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
        updatedAtLocal: null
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

    const classifyTroopRow = (row) => {
        const text = row.textContent?.trim().toLowerCase() || '';
        const technicalText = [
            row.dataset?.type,
            row.dataset?.row,
            row.className,
            row.id
        ].join(' ').toLowerCase();

        if (
            technicalText.includes('home') ||
            technicalText.includes('own') ||
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
            text.includes('total') ||
            text.includes('em movimento') ||
            text.includes('fora') ||
            text.includes('apoio') ||
            text.includes('próprias') ||
            text.includes('proprias')
        ) {
            return {
                rowType: 'ignored',
                label: row.textContent?.trim() || ''
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
            label: null
        };
        const tables = Array.from(document.querySelectorAll('table'));

        tables.forEach((table) => {
            const unitColumns = detectUnitColumns(table);
            const units = Object.keys(unitColumns);

            if (!units.length) {
                return;
            }

            const rows = Array.from(table.querySelectorAll('tbody tr, tr'));
            const hasHomeRows = rows.some((row) => {
                return classifyTroopRow(row).rowType === 'home';
            });

            rows.forEach((row) => {
                const villageId = extractVillageId(row);

                if (!villageId) {
                    return;
                }

                const cells = Array.from(row.children);
                const rowInfo = classifyTroopRow(row);

                if (rowInfo.rowType === 'ignored') {
                    return;
                }

                if (hasHomeRows && rowInfo.rowType !== 'home') {
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
                result.rowType = rowInfo.rowType === 'home'
                    ? 'home'
                    : result.rowType || 'unknown';
                result.label = rowInfo.rowType === 'home'
                    ? rowInfo.label
                    : result.label;
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
                updatedAtLocal: Date.now()
            });
            saveCache('game_data', troopsByVillage);
            return troopsByVillage;
        }

        const tableTroops = readFromTables();

        if (hasTroopData(tableTroops.villages)) {
            const mergedTroops = mergeWithCache(tableTroops.villages);

            setData(mergedTroops, {
                source: 'troop_overview',
                rowType: tableTroops.rowType || 'unknown',
                label: tableTroops.label || null,
                updatedAtServer: EAS.World.getServerNowTimestamp(),
                updatedAtLocal: Date.now()
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
                updatedAtLocal: cache.updatedAtLocal || null
            });
            return troopsByVillage;
        }

        setData({}, {
            source: 'none',
            rowType: null,
            label: null,
            updatedAtServer: null,
            updatedAtLocal: null
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
