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
    const CACHE_SCHEMA_VERSION = 2;

    let troopsByVillage = {};
    let sourceInfo = {
        available: false,
        source: 'none',
        rowType: null,
        label: null,
        updatedAtServer: null,
        updatedAtLocal: null,
        rows: [],
        unitColumns: {},
        unitColumnDetails: [],
        rowTypeCounts: {},
        selectedTable: null
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
            .replace(/,/g, '')
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

    const detectUnitFromText = (text) => {
        const normalized = String(text ?? '').toLowerCase();

        return UNITS.find((unit) => {
            const patterns = [
                `unit_${unit}`,
                `unit-${unit}`,
                `unit ${unit}`,
                `${unit}.png`,
                `/${unit}.png`,
                `/${unit}.webp`,
                `/${unit}.gif`
            ];
            const boundary = new RegExp(`(^|[^a-z])${unit}([^a-z]|$)`, 'i');

            return patterns.some((pattern) => normalized.includes(pattern)) ||
                boundary.test(normalized);
        }) || null;
    };

    const detectUnitInElement = (element) => {
        if (!element) {
            return null;
        }

        const dataUnit = element.dataset?.unit;
        const unitFromData = detectUnitFromText(dataUnit);

        if (unitFromData) {
            return {
                unit: unitFromData,
                identifier: `data-unit=${dataUnit}`
            };
        }

        const className = String(element.className || '');
        const classUnit =
            className.match(/unit-item-([a-z_]+)/i)?.[1] ||
            className.match(/unit[_-]([a-z_]+)/i)?.[1];
        const unitFromClass = detectUnitFromText(classUnit || className);

        if (unitFromClass) {
            return {
                unit: unitFromClass,
                identifier: classUnit
                    ? `class=${classUnit}`
                    : `class=${className}`
            };
        }

        const childWithUnitClass = element.querySelector(
            '[class*="unit-item-"], [class*="unit_"], [class*="unit-"]'
        );

        if (childWithUnitClass) {
            const detected = detectUnitInElement(childWithUnitClass);

            if (detected) {
                return detected;
            }
        }

        const image = element.matches?.('img')
            ? element
            : element.querySelector('img');
        const src = image?.getAttribute('src') || '';
        const unitFromSrc = detectUnitFromText(src.split('/').pop() || src);

        if (unitFromSrc) {
            return {
                unit: unitFromSrc,
                identifier: src.split('/').pop() || src
            };
        }

        const alt = image?.getAttribute('alt') || element.getAttribute?.('alt') || '';
        const unitFromAlt = detectUnitFromText(alt);

        if (unitFromAlt) {
            return {
                unit: unitFromAlt,
                identifier: `alt=${alt}`
            };
        }

        const title = image?.getAttribute('title') || element.getAttribute?.('title') || '';
        const unitFromTitle = detectUnitFromText(title);

        if (unitFromTitle) {
            return {
                unit: unitFromTitle,
                identifier: `title=${title}`
            };
        }

        const unitFromText = detectUnitFromText(element.textContent);

        if (unitFromText) {
            return {
                unit: unitFromText,
                identifier: `text=${element.textContent?.trim() || unitFromText}`
            };
        }

        return null;
    };

    const detectUnitColumnDetails = (table) => {
        const headerRows = Array.from(table.querySelectorAll('thead tr'));
        const rows = headerRows.length
            ? headerRows
            : Array.from(table.querySelectorAll('tr')).slice(0, 1);
        const details = [];
        const seenUnits = new Set();

        rows.forEach((row) => {
            let columnIndex = 0;

            Array.from(row.children).forEach((cell) => {
                const detected = detectUnitInElement(cell);
                const span = Math.max(1, Number(cell.colSpan || 1));

                if (detected && !seenUnits.has(detected.unit)) {
                    details.push({
                        index: columnIndex,
                        unit: detected.unit,
                        identifier: detected.identifier
                    });
                    seenUnits.add(detected.unit);
                }

                columnIndex += span;
            });
        });

        return details.sort((a, b) => a.index - b.index);
    };

    EAS.Troops.detectUnitColumns = (table) => {
        return detectUnitColumnDetails(table).reduce((columns, item) => {
            columns[item.index] = item.unit;
            return columns;
        }, {});
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

    const getTableIdentifier = (table) => {
        if (table.id) {
            return `#${table.id}`;
        }

        const classes = String(table.className || '').trim().split(/\s+/)
            .filter(Boolean);

        if (classes.length) {
            return `table.${classes.join('.')}`;
        }

        return 'table';
    };

    const getCandidateTroopTable = () => {
        return Array.from(document.querySelectorAll('table'))
            .map((table) => {
                const unitColumns = EAS.Troops.detectUnitColumns(table);
                const unitColumnDetails = detectUnitColumnDetails(table);
                const rows = Array.from(table.querySelectorAll('tbody tr, tr'));
                const villageRows = rows.filter(extractVillageId);
                const homeRows = rows.filter((row, index) => {
                    return EAS.Troops.detectRowType(row, {
                        rowIndex: index,
                        hasUnitColumns: Object.keys(unitColumns).length > 0
                    }).rowType === 'home';
                });

                return {
                    table,
                    unitColumns,
                    unitColumnDetails,
                    rows,
                    villageRows,
                    homeRows,
                    score:
                        Object.keys(unitColumns).length * 10 +
                        villageRows.length * 2 +
                        homeRows.length * 4
                };
            })
            .filter((candidate) => {
                return Object.keys(candidate.unitColumns).length >= 2 &&
                    candidate.villageRows.length > 0;
            })
            .sort((a, b) => b.score - a.score)[0] || null;
    };

    const readFromTables = () => {
        const result = {
            villages: {},
            rowType: null,
            label: null,
            rows: [],
            unitColumns: {},
            unitColumnDetails: [],
            rowTypeCounts: {},
            selectedTable: null
        };

        const candidate = getCandidateTroopTable();

        if (!candidate) {
            return result;
        }

        const table = candidate.table;
        const unitColumns = candidate.unitColumns;
        const unitColumnDetails = candidate.unitColumnDetails;
        const rows = candidate.rows;
        const unitColumnEntries = Object.entries(unitColumns)
            .map(([index, unit]) => [Number(index), unit])
            .sort((a, b) => a[0] - b[0]);

        result.unitColumns = unitColumns;
        result.unitColumnDetails = unitColumnDetails;
        result.selectedTable = getTableIdentifier(table);

        const rowDiagnostics = rows.map((row, index) => {
            const info = EAS.Troops.detectRowType(row, {
                rowIndex: index,
                hasUnitColumns: unitColumnEntries.length > 0
            });

            return {
                index: index + 1,
                text: row.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80) || '',
                type: info.rowType
            };
        });

        result.rows = rowDiagnostics;
        result.rowTypeCounts = rowDiagnostics.reduce((counts, row) => {
            counts[row.type] = (counts[row.type] || 0) + 1;
            return counts;
        }, {});
        result.rowType = rowDiagnostics.find((row) => row.type === 'home')
            ? 'home'
            : rowDiagnostics.find((row) => row.type === 'unknown')?.type || null;

        rows.forEach((row, index) => {
            const villageId = extractVillageId(row);

            if (!villageId) {
                return;
            }

            const cells = Array.from(row.children);
            const rowInfo = EAS.Troops.detectRowType(row, {
                rowIndex: index,
                hasUnitColumns: unitColumnEntries.length > 0
            });

            if (rowInfo.rowType !== 'home') {
                return;
            }

            const troops = result.villages[villageId] || createEmptyTroops();

            unitColumnEntries.forEach(([columnIndex, unit]) => {
                const cell = cells[columnIndex];

                if (cell) {
                    troops[unit] = parseAmount(cell.textContent);
                }
            });

            result.villages[villageId] = troops;
            result.rowType = 'home';
            result.label = rowInfo.label || 'Na aldeia';
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
            Number(cache.schemaVersion || 0) !== CACHE_SCHEMA_VERSION ||
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
            schemaVersion: CACHE_SCHEMA_VERSION,
            ...scope,
            updatedAtServer: serverNow.available ? serverNow.timestamp : null,
            updatedAtLocal: Date.now(),
            source,
            rowType: sourceInfo.rowType,
            label: sourceInfo.label,
            selectedTable: sourceInfo.selectedTable,
            unitColumnDetails: sourceInfo.unitColumnDetails,
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
                unitColumns: {},
                unitColumnDetails: [],
                rowTypeCounts: {},
                selectedTable: 'game_data'
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
                unitColumns: tableTroops.unitColumns,
                unitColumnDetails: tableTroops.unitColumnDetails,
                rowTypeCounts: tableTroops.rowTypeCounts,
                selectedTable: tableTroops.selectedTable
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
                unitColumns: Object.keys(tableTroops.unitColumns).length
                    ? tableTroops.unitColumns
                    : (cache.unitColumnDetails || []).reduce((columns, item) => {
                        columns[item.index] = item.unit;
                        return columns;
                    }, {}),
                unitColumnDetails: tableTroops.unitColumnDetails.length
                    ? tableTroops.unitColumnDetails
                    : cache.unitColumnDetails || [],
                rowTypeCounts: tableTroops.rowTypeCounts,
                selectedTable: tableTroops.selectedTable || cache.selectedTable || null
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
            unitColumns: tableTroops.unitColumns,
            unitColumnDetails: tableTroops.unitColumnDetails,
            rowTypeCounts: tableTroops.rowTypeCounts,
            selectedTable: tableTroops.selectedTable
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
