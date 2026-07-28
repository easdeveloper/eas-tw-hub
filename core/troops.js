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
        updatedAt: null
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
        const result = {};
        const tables = Array.from(document.querySelectorAll('table'));

        tables.forEach((table) => {
            const unitColumns = detectUnitColumns(table);
            const units = Object.keys(unitColumns);

            if (!units.length) {
                return;
            }

            Array.from(table.querySelectorAll('tbody tr, tr')).forEach((row) => {
                const villageId = extractVillageId(row);

                if (!villageId) {
                    return;
                }

                const cells = Array.from(row.children);
                const troops = result[villageId] || createEmptyTroops();

                units.forEach((unit) => {
                    const cell = cells[unitColumns[unit]];

                    if (cell) {
                        troops[unit] = parseAmount(cell.textContent);
                    }
                });

                result[villageId] = troops;
            });
        });

        return result;
    };

    const hasTroopData = (value) => {
        return Object.keys(value).length > 0;
    };

    const mergeWithCache = (data) => {
        const cache = readCache();

        if (!cache?.troopsByVillage) {
            return data;
        }

        return {
            ...cache.troopsByVillage,
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
        const updatedAt = Date.now();

        EAS.Storage.set(CACHE_KEY, {
            ...scope,
            source,
            updatedAt,
            troopsByVillage: data
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
                updatedAt: Date.now()
            });
            saveCache('game_data', troopsByVillage);
            return troopsByVillage;
        }

        const tableTroops = readFromTables();

        if (hasTroopData(tableTroops)) {
            const mergedTroops = mergeWithCache(tableTroops);

            setData(mergedTroops, {
                source: 'troop_overview',
                updatedAt: Date.now()
            });
            saveCache('troop_overview', troopsByVillage);
            return troopsByVillage;
        }

        const cache = readCache();

        if (cache) {
            setData(cache.troopsByVillage, {
                source: 'cache',
                updatedAt: cache.updatedAt || null
            });
            return troopsByVillage;
        }

        setData({}, {
            source: 'none',
            updatedAt: null
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
