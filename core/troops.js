(() => {
    'use strict';

    EAS.Troops = EAS.Troops || {};

    const CACHE_KEY = 'troops.available';
    const CACHE_SCHEMA_VERSION = 4;
    const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;
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
        'snob',
        'militia'
    ];

    let villagesById = {};
    let refreshPromise = null;
    const normalizationWarnings = new Set();
    let sourceInfo = {
        available: false,
        source: 'none',
        complete: false,
        schemaVersion: CACHE_SCHEMA_VERSION,
        updatedAtServer: null,
        updatedAtLocal: null,
        unitOrder: [],
        unitColumnDetails: [],
        rowTypes: [],
        villageCount: 0,
        selectedTable: null,
        rowType: null,
        label: null,
        stale: false,
        error: null
    };

    const getScope = () => {
        const info = EAS.World.getInfo();

        return {
            world: info.world || location.hostname,
            playerId: info.player?.id || 0
        };
    };

    const createEmptyTroops = () => {
        return UNITS.reduce((troops, unit) => {
            troops[unit] = 0;
            return troops;
        }, {});
    };

    const normalizeText = (value) => {
        return String(value ?? '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    };

    const parseInteger = (value) => {
        const match = String(value ?? '')
            .replace(/\./g, '')
            .replace(/,/g, '')
            .replace(/\s/g, '')
            .match(/\d+/);

        return Number(match?.[0] || 0);
    };

    const detectUnitFromText = (value) => {
        const text = normalizeText(value);

        return UNITS.find((unit) => {
            return text.includes(`unit_${unit}`) ||
                text.includes(`unit-${unit}`) ||
                text.includes(`unit ${unit}`) ||
                text.includes(`${unit}.png`) ||
                text.includes(`${unit}.webp`) ||
                text.includes(`${unit}.gif`) ||
                new RegExp(`(^|[^a-z])${unit}([^a-z]|$)`, 'i').test(text);
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
        const classToken =
            className.match(/unit-item-([a-z_]+)/i)?.[1] ||
            className.match(/unit[_-]([a-z_]+)/i)?.[1];
        const unitFromClass = detectUnitFromText(classToken || className);

        if (unitFromClass) {
            return {
                unit: unitFromClass,
                identifier: classToken
                    ? `class=${classToken}`
                    : `class=${className}`
            };
        }

        const image = element.matches?.('img')
            ? element
            : element.querySelector('img');
        const src = image?.getAttribute('src') || '';
        const srcName = src.split('/').pop() || src;
        const unitFromSrc = detectUnitFromText(srcName);

        if (unitFromSrc) {
            return {
                unit: unitFromSrc,
                identifier: srcName
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

    const normalizeTroops = (value = {}) => {
        const troops = createEmptyTroops();

        UNITS.forEach((unit) => {
            troops[unit] = Math.max(0, Number(value[unit] || 0));
        });

        return troops;
    };
    const addTroops = (...values) => Object.fromEntries(UNITS.map((unit) => [unit, values.reduce((sum, value) => sum + Math.max(0, Number(value?.[unit] || 0)), 0)]));
    const subtractTroops = (left, right) => Object.fromEntries(UNITS.map((unit) => [unit, Math.max(0, Number(left?.[unit] || 0) - Number(right?.[unit] || 0))]));
    const warnImpossibleState = ({ villageId, ownHome, inVillage, outside, inTransit }) => { const units = UNITS.filter((unit) => inVillage[unit] < ownHome[unit]); const key = `${villageId}:${units.join(',')}`; if (!units.length || normalizationWarnings.has(key)) return; normalizationWarnings.add(key); EAS.Log?.warn?.('troops', 'normalization.warning', { villageId: String(villageId), ownHome, inVillage, outside, inTransit, support: subtractTroops(inVillage, ownHome), units }); };
    const normalizeVillageStates = (village = {}, id = village.id) => { const ownHome = normalizeTroops(village.ownHome || village.available || village.troops || village); const inVillage = normalizeTroops(village.inVillage || village.home || ownHome); const outside = normalizeTroops(village.outside); const inTransit = normalizeTroops(village.inTransit); warnImpossibleState({ villageId: id, ownHome, inVillage, outside, inTransit }); const support = subtractTroops(inVillage, ownHome); const allOwn = addTroops(ownHome, outside, inTransit); return { ownHome, inVillage, outside, inTransit, support, allOwn, total: normalizeTroops(village.total), available: ownHome, home: inVillage, own: allOwn, troops: ownHome }; };

    const readCache = () => {
        if (!EAS.Storage?.get) {
            return null;
        }

        const cache = EAS.Storage.get(CACHE_KEY, null);
        const scope = getScope();

        if (
            !cache ||
            Number(cache.schemaVersion || 0) !== CACHE_SCHEMA_VERSION ||
            cache.world !== scope.world ||
            Number(cache.playerId || 0) !== Number(scope.playerId || 0) ||
            !cache.villages
        ) {
            return null;
        }

        return cache;
    };

    const setStateFromCache = (cache, extra = {}) => {
        const ownedIds = new Set((EAS.Villages?.getAll?.() || []).map((village) => String(village.id)));
        villagesById = Object.entries(cache.villages || {}).filter(([id]) => !ownedIds.size || ownedIds.has(String(id))).reduce(
            (result, [id, village]) => {
                const states = normalizeVillageStates(village, id);
                result[Number(id)] = {
                    id: Number(village.id || id),
                    name: village.name || '',
                    coordinate: village.coordinate || '',
                    ...states
                };
                return result;
            },
            {}
        );

        sourceInfo = {
            available: Object.keys(villagesById).length > 0,
            source: cache.source || 'cache',
            complete: Boolean(cache.complete),
            schemaVersion: CACHE_SCHEMA_VERSION,
            updatedAtServer: cache.updatedAtServer || null,
            updatedAtLocal: cache.updatedAtLocal || null,
            unitOrder: cache.unitOrder || [],
            unitColumnDetails: cache.unitColumnDetails || [],
            rowTypes: cache.rowTypes || ['available', 'home'],
            villageCount: Object.keys(villagesById).length,
            selectedTable: cache.selectedTable || '#units_table',
            rowType: cache.rowType || 'home',
            label: cache.label || 'Na Aldeia',
            stale: false,
            error: null,
            ...extra
        };
    };

    const saveCache = (data) => {
        if (!EAS.Storage?.set || !data?.villages || !Object.keys(data.villages).length) {
            return;
        }

        EAS.Storage.set(CACHE_KEY, {
            schemaVersion: CACHE_SCHEMA_VERSION,
            ...getScope(),
            ...data
        });
    };

    const getCurrentVillageId = () => {
        return EAS.World.getScreen?.().villageId ||
            EAS.World.getCurrentVillage?.().id ||
            0;
    };

    const buildOverviewUrl = () => {
        const url = new URL('/game.php', location.origin);
        url.searchParams.set('village', getCurrentVillageId());
        url.searchParams.set('screen', 'overview_villages');
        url.searchParams.set('mode', 'units');
        url.searchParams.set('type', 'complete');
        url.searchParams.set('page', '-1');

        return url.toString();
    };
    EAS.Troops.buildOverviewUrl = buildOverviewUrl;

    EAS.Troops.detectUnitOrder = (table) => {
        const headers = Array.from(
            table.querySelectorAll('thead th, thead td, tr:first-child th, tr:first-child td')
        );
        const details = [];
        const seen = new Set();

        headers.forEach((header) => {
            const detected = detectUnitInElement(header) ||
                Array.from(header.querySelectorAll('*'))
                    .map(detectUnitInElement)
                    .find(Boolean);

            if (!detected || seen.has(detected.unit)) {
                return;
            }

            details.push({
                position: details.length,
                unit: detected.unit,
                identifier: detected.identifier
            });
            seen.add(detected.unit);
        });

        EAS.Troops._lastUnitColumnDetails = details;
        return details.map((item) => item.unit);
    };

    EAS.Troops.detectUnitColumns = (table) => {
        const order = EAS.Troops.detectUnitOrder(table);

        return order.reduce((columns, unit, index) => {
            columns[index] = unit;
            return columns;
        }, {});
    };

    EAS.Troops.detectRowType = (row) => {
        const text = normalizeText(row.textContent);
        const technical = normalizeText([
            row.dataset?.type,
            row.dataset?.row,
            row.dataset?.mode,
            row.className,
            row.id,
            Array.from(row.querySelectorAll('a[href]'))
                .map((link) => link.getAttribute('href'))
                .join(' ')
        ].join(' '));

        if (text.includes('suas proprias') || text.includes('proprias tropas') || technical.includes('type=own')) {
            return 'ownHome';
        }

        if (technical.includes('type=there') || text.includes('na aldeia')) {
            return 'inVillage';
        }

        if (text.includes('em transito') || text.includes('em movimento')) {
            return 'inTransit';
        }

        if (text.includes('fora')) {
            return 'outside';
        }

        if (text.includes('apoio')) {
            return 'support';
        }

        if (text.includes('total')) {
            return 'total';
        }

        return 'unknown';
    };

    EAS.Troops.findHomeRow = (tbody) => {
        return Array.from(tbody.querySelectorAll('tr')).find((row) => {
            return EAS.Troops.detectRowType(row) === 'ownHome' &&
                row.querySelectorAll('td.unit-item').length > 0;
        }) || null;
    };

    EAS.Troops.parseVillageBlock = (tbody, unitOrder) => {
        const villageElement = tbody.querySelector('.quickedit-vn[data-id]');
        const labelElement = tbody.querySelector('.quickedit-label');
        const rows = Array.from(tbody.querySelectorAll('tr')).filter((row) => row.querySelectorAll('td.unit-item').length > 0);
        const typedRows = Object.fromEntries(rows.map((row, index) => [EAS.Troops.detectRowType(row) === 'unknown' ? ['ownHome','inVillage','outside','inTransit','total'][index] : EAS.Troops.detectRowType(row), row]));
        const ownHomeRow = typedRows.ownHome;

        if (!villageElement || !labelElement || !ownHomeRow) {
            return null;
        }

        const text = labelElement.textContent?.trim() || '';
        const name =
            labelElement.dataset?.text ||
            text.replace(/\(\d{1,3}\|\d{1,3}\).*$/, '').trim();
        const coordinate = EAS.Utils.parseCoordinate(text)?.coordinate;

        if (!coordinate) {
            return null;
        }

        const parseRow = (row) => { const result = createEmptyTroops(); const cells = Array.from(row?.querySelectorAll('td.unit-item') || []); unitOrder.forEach((unit, index) => { result[unit] = parseInteger(cells[index]?.textContent); }); return result; };
        const ownHome = parseRow(ownHomeRow); const inVillage = parseRow(typedRows.inVillage || ownHomeRow); const outside = parseRow(typedRows.outside); const inTransit = parseRow(typedRows.inTransit); const total = parseRow(typedRows.total); const support = subtractTroops(inVillage, ownHome); const allOwn = addTroops(ownHome, outside, inTransit);
        warnImpossibleState({ villageId: String(villageElement.dataset.id || 0), ownHome, inVillage, outside, inTransit });

        return {
            id: Number(villageElement.dataset.id || 0),
            name,
            coordinate,
            troops: ownHome,
            available: ownHome,
            home: inVillage,
            ownHome,
            inVillage,
            outside,
            inTransit,
            support,
            allOwn,
            own: allOwn,
            total
        };
    };

    const hasPagination = (doc, parsedVillageCount) => {
        const pager = doc.querySelector('.paged-nav-item, .paged-nav-item-current, .pagination');
        const pageSizeText = normalizeText(doc.body?.textContent || '');
        const pageSizeMatch = pageSizeText.match(/aldeias por pagina:\s*(\d+)/);
        const pageSize = Number(pageSizeMatch?.[1] || 0);

        return Boolean(pager) || Boolean(pageSize && parsedVillageCount >= pageSize);
    };

    const parseUnitsOverview = (doc) => {
        const table = doc.querySelector('#units_table');

        if (!table) {
            throw new Error('A tabela #units_table não foi encontrada.');
        }

        const unitOrder = EAS.Troops.detectUnitOrder(table);
        const unitColumnDetails = EAS.Troops._lastUnitColumnDetails || [];

        if (!unitOrder.length) {
            throw new Error('Não foi possível identificar as unidades da tabela de tropas.');
        }

        const blocks = Array.from(table.querySelectorAll('tbody.row_marker'));
        const villages = {};
        let missingHomeRows = 0;

        blocks.forEach((tbody) => {
            const village = EAS.Troops.parseVillageBlock(tbody, unitOrder);

            if (!village) {
                if (!EAS.Troops.findHomeRow(tbody)) {
                    missingHomeRows += 1;
                }
                return;
            }

            villages[village.id] = village;
        });

        if (!Object.keys(villages).length) {
            if (missingHomeRows) {
                throw new Error('Não foi possível identificar a linha Na Aldeia.');
            }

            throw new Error('Nenhuma aldeia foi localizada na visão geral.');
        }

        const rowTypes = ['available','own','home','support','outside','inTransit'];
        return {
            source: 'remote_units_overview',
            complete: !hasPagination(doc, Object.keys(villages).length),
            unitOrder,
            unitColumnDetails,
            selectedTable: '#units_table',
            rowType: 'home',
            label: 'Na Aldeia',
            rowTypes,
            villages
        };
    };

    const refreshTroops = async (_options = {}) => {
        const perfMark = EAS.Utils.Perf?.start('troops.refresh');
        const url = buildOverviewUrl();
        let response;

        try {
            response = await fetch(url, {
                credentials: 'same-origin'
            });
        } catch (error) {
            throw new Error('Não foi possível carregar a visão geral de tropas.');
        }

        if (!response.ok) {
            throw new Error('Não foi possível carregar a visão geral de tropas.');
        }

        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const parsed = parseUnitsOverview(doc);
        const serverNow = EAS.World.getServerDateTime();
        const cache = {
            ...parsed,
            updatedAtServer: serverNow.available ? serverNow.timestamp : null,
            updatedAtLocal: Date.now()
        };

        saveCache(cache);
        setStateFromCache({
            schemaVersion: CACHE_SCHEMA_VERSION,
            ...getScope(),
            ...cache
        });

        EAS.Utils.Perf?.end(perfMark, { villageCount: Object.keys(villagesById).length, source: parsed.source });
        return villagesById;
    };

    EAS.Troops.refresh = (_options = {}) => {
        if (refreshPromise) return refreshPromise;
        refreshPromise = refreshTroops(_options).finally(() => { refreshPromise = null; });
        return refreshPromise;
    };

    EAS.Troops.ensureLoaded = async ({
        forceRefresh = false,
        maxAgeMs = DEFAULT_MAX_AGE_MS
    } = {}) => {
        const cache = readCache();
        const cacheAge = cache?.updatedAtLocal
            ? Date.now() - cache.updatedAtLocal
            : Infinity;

        if (cache && !forceRefresh && cacheAge <= maxAgeMs) {
            setStateFromCache(cache, {
                source: 'cache'
            });
            return villagesById;
        }

        try {
            return await EAS.Troops.refresh();
        } catch (error) {
            if (cache) {
                setStateFromCache(cache, {
                    source: 'cache',
                    stale: true,
                    error: 'Utilizando cache de tropas desatualizado.'
                });
                return villagesById;
            }

            sourceInfo = {
                ...sourceInfo,
                available: false,
                source: 'none',
                error: error.message
            };
            throw error;
        }
    };

    EAS.Troops.getVillageTroops = (villageId) => {
        return normalizeTroops(villagesById[Number(villageId || 0)]?.troops);
    };

    EAS.Troops.hasUnit = (villageId, unit, minimum = 1) => {
        return EAS.Troops.getVillageTroops(villageId)[unit] >= minimum;
    };

    EAS.Troops.hasVillageData = (villageId) => {
        return Boolean(villagesById[Number(villageId || 0)]);
    };

    EAS.Troops.getAll = () => { const entries = Object.values(villagesById); const owned = EAS.Villages?.filterOwned ? EAS.Villages.filterOwned(entries, { sourceModule: 'troops' }) : entries; return Object.fromEntries(owned.map((village) => [village.id, village])); };

    EAS.Troops.getSourceInfo = () => {
        return { ...sourceInfo };
    };

    const cache = readCache();

    if (cache) {
        setStateFromCache(cache, {
            source: 'cache'
        });
    }
})();
