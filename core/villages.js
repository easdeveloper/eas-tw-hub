(() => {
    'use strict';

    EAS.Villages = EAS.Villages || {};

    const CACHE_KEY = 'villages.list';
    let sourceInfo = {
        total: 0,
        completeness: 'empty',
        sources: {
            gameData: 0,
            villageSwitcher: 0,
            overview: 0,
            cache: 0,
            currentVillage: 0
        },
        selectedSource: 'none',
        updatedAt: null
    };

    const getCacheScope = () => {
        const info = EAS.World.getInfo();

        return {
            world: info.world || location.hostname,
            playerId: info.player?.id || 0
        };
    };

    const extractVillageId = (href) => {
        try {
            const url = new URL(href, location.origin);

            return Number(url.searchParams.get('village') || 0);
        } catch {
            const match = String(href).match(/[?&]village=(\d+)/);

            return Number(match?.[1] || 0);
        }
    };

    const createVillage = ({
        id = 0,
        name = '',
        coordinate = '',
        href = '',
        source = ''
    }) => {
        const parsedCoordinate =
            EAS.Utils.parseCoordinate(coordinate);

        if (!parsedCoordinate) {
            return null;
        }

        const cleanName = String(name)
            .replace(/\(\d{1,3}\|\d{1,3}\).*$/, '')
            .replace(/\d{1,3}\|\d{1,3}.*$/, '')
            .trim();

        return {
            id: Number(id || extractVillageId(href)),
            name: cleanName || `Aldeia ${parsedCoordinate.coordinate}`,
            x: parsedCoordinate.x,
            y: parsedCoordinate.y,
            coordinate: parsedCoordinate.coordinate,
            href: href || '',
            source
        };
    };

    const readFromGameData = () => {
        const data = EAS.World.getGameData();
        const source =
            data.player?.villages ||
            data.villages ||
            data.player_villages;

        if (!source) {
            return [];
        }

        const villages = [];

        if (Array.isArray(source)) {
            source.forEach((village) => {
                const item = createVillage({
                    id: village.id,
                    name: village.name,
                    coordinate:
                        village.coord ||
                        `${village.x}|${village.y}`,
                    source: 'gameData'
                });

                if (item) {
                    villages.push(item);
                }
            });

            return villages;
        }

        Object.values(source).forEach((village) => {
            if (!village || typeof village !== 'object') {
                return;
            }

            const item = createVillage({
                id: village.id,
                name: village.name,
                coordinate:
                    village.coord ||
                    `${village.x}|${village.y}`,
                source: 'gameData'
            });

            if (item) {
                villages.push(item);
            }
        });

        return villages;
    };

    const readFromVillageSwitcher = () => {
        const selectors = [
            '#village_switch_select option[value]',
            '#village_switch_select option[data-id]',
            '#village_switch_select option',
            '#village_switch_select a[href*="village="]',
            '#village_switch_list a[href*="village="]',
            '#village_switch_list option[value]',
            '#village_switcher a[href*="village="]',
            '#village_switcher option[value]',
            '.village_switcher a[href*="village="]',
            '.village_switcher option[value]',
            '.village_switch a[href*="village="]',
            '.village_switch option[value]',
            '.village_switch_link',
            '.group-menu-item a[href*="village="]',
            '.group-menu-item option[value]',
            '#village_switch_right a',
            '#village_switch_left a',
            '#village_switcher [data-village-id][data-coord]',
            '#village_switcher [data-village-id][data-coordinate]',
            '#village_switch_list [data-village-id][data-coord]',
            '#village_switch_list [data-village-id][data-coordinate]',
            '.village_switcher [data-village-id][data-coord]',
            '.village_switcher [data-village-id][data-coordinate]',
            '.group-menu-item [data-id][data-name][data-coord]',
            '.group-menu-item [data-id][data-name][data-coordinate]'
        ];
        const elements = document.querySelectorAll(selectors.join(','));
        const villages = [];

        elements.forEach((element) => {
            const text = element.textContent?.trim() || '';
            const title = element.getAttribute('title') || '';
            const value = element.value || '';
            const dataset = element.dataset || {};
            const href = element.href || value || '';
            const coordinate =
                EAS.Utils.parseCoordinate(dataset.coord)?.coordinate ||
                EAS.Utils.parseCoordinate(dataset.coordinate)?.coordinate ||
                EAS.Utils.parseCoordinate(text)?.coordinate ||
                EAS.Utils.parseCoordinate(title)?.coordinate ||
                EAS.Utils.parseCoordinate(value)?.coordinate;

            if (!coordinate) {
                return;
            }

            const village = createVillage({
                id:
                    Number(dataset.villageId || dataset.id || 0) ||
                    Number(element.value || 0) ||
                    extractVillageId(href),
                name: dataset.name || text || title,
                coordinate,
                href,
                source: 'villageSwitcher'
            });

            if (village) {
                villages.push(village);
            }
        });

        return villages;
    };

    const readFromOverview = () => {
        const selectors = [
            '#production_table a[href*="village="]',
            '#overview_villages a[href*="village="]',
            '#combined_table a[href*="village="]',
            '#units_table a[href*="village="]',
            'table.vis a[href*="village="]'
        ];

        const links = document.querySelectorAll(
            selectors.join(',')
        );

        const villages = [];

        links.forEach((link) => {
            const text = link.textContent?.trim() || '';
            const title = link.getAttribute('title') || '';
            const coordinate =
                EAS.Utils.parseCoordinate(text)?.coordinate ||
                EAS.Utils.parseCoordinate(title)?.coordinate;

            if (!coordinate) {
                return;
            }

            const village = createVillage({
                id: extractVillageId(link.href),
                name: text || title,
                coordinate,
                href: link.href,
                source: 'overview'
            });

            if (village) {
                villages.push(village);
            }
        });

        return villages;
    };

    const dedupeVillages = (villages) => {
        const byId = new Map();
        const byCoordinate = new Map();

        villages
            .filter((village) => village.coordinate)
            .forEach((village) => {
                if (village.id) {
                    byId.set(village.id, {
                        ...byId.get(village.id),
                        ...village
                    });
                    return;
                }

                if (!byCoordinate.has(village.coordinate)) {
                    byCoordinate.set(village.coordinate, village);
                }
            });

        byId.forEach((village) => {
            byCoordinate.delete(village.coordinate);
        });

        return [
            ...byId.values(),
            ...byCoordinate.values()
        ];
    };

    const readCache = () => {
        if (!EAS.Storage?.get) {
            return [];
        }

        const cache = EAS.Storage.get(CACHE_KEY, null);
        const scope = getCacheScope();

        if (
            !cache ||
            cache.world !== scope.world ||
            Number(cache.playerId || 0) !== Number(scope.playerId || 0) ||
            !Array.isArray(cache.villages)
        ) {
            return [];
        }

        return cache.villages
            .map(createVillage)
            .filter(Boolean);
    };

    const saveCache = (villages) => {
        if (!EAS.Storage?.set || villages.length <= 1) {
            return;
        }

        const cache = readCache();

        if (cache.length > villages.length) {
            return;
        }

        EAS.Storage.set(CACHE_KEY, {
            ...getCacheScope(),
            updatedAt: Date.now(),
            villages: villages.map((village) => ({
                id: village.id,
                name: village.name,
                x: village.x,
                y: village.y,
                coordinate: village.coordinate,
                source: village.source || 'cache'
            }))
        });
    };

    const readCurrentVillage = () => {
        const current = EAS.World.getCurrentVillage();

        if (!current.coordinate) {
            return [];
        }

        return [{
            id: current.id,
            name: current.name,
            x: current.x,
            y: current.y,
            coordinate: current.coordinate,
            href: location.href,
            current: true,
            source: 'currentVillage'
        }];
    };

    EAS.Villages.list = () => {
        const gameData = readFromGameData();
        const villageSwitcher = readFromVillageSwitcher();
        const overview = readFromOverview();
        const cache = readCache();
        let villages = [
            ...gameData,
            ...villageSwitcher,
            ...overview,
            ...readCurrentVillage()
        ];

        const liveVillages = dedupeVillages(villages);
        const isPartial = cache.length > liveVillages.length;

        villages = isPartial
            ? dedupeVillages([...cache, ...liveVillages])
            : liveVillages;
        const selectedSource = isPartial
            ? 'cache'
            : gameData.length
                ? 'gameData'
                : villageSwitcher.length
                    ? 'villageSwitcher'
                    : overview.length
                        ? 'overview'
                        : 'currentVillage';

        villages.sort((a, b) => {
            if (a.id === EAS.World.getCurrentVillage().id) {
                return -1;
            }

            if (b.id === EAS.World.getCurrentVillage().id) {
                return 1;
            }

            return a.name.localeCompare(b.name, 'pt-BR');
        });

        saveCache(villages);

        sourceInfo = {
            total: villages.length,
            completeness: villages.length > 1 ? 'complete' : 'partial',
            sources: {
                gameData: gameData.length,
                villageSwitcher: villageSwitcher.length,
                overview: overview.length,
                cache: cache.length,
                currentVillage: readCurrentVillage().length
            },
            selectedSource,
            updatedAt: Date.now()
        };

        return villages;
    };

    EAS.Villages.getSourceInfo = () => {
        EAS.Villages.list();
        return { ...sourceInfo };
    };

    EAS.Villages.current = () => {
        return EAS.World.getCurrentVillage();
    };

    EAS.Villages.findById = (id) => {
        return EAS.Villages.list().find(
            (village) => village.id === Number(id)
        ) || null;
    };

    EAS.Villages.findByCoordinate = (coordinate) => {
        const parsed = EAS.Utils.parseCoordinate(coordinate);

        if (!parsed) {
            return null;
        }

        return EAS.Villages.list().find(
            (village) =>
                village.coordinate === parsed.coordinate
        ) || null;
    };

    EAS.Villages.distanceTo = (
        village,
        destinationCoordinate
    ) => {
        return EAS.Utils.distance(
            village.coordinate,
            destinationCoordinate
        );
    };

    EAS.Villages.withDistanceTo = (
        destinationCoordinate
    ) => {
        return EAS.Villages.list()
            .map((village) => ({
                ...village,
                distance: EAS.Villages.distanceTo(
                    village,
                    destinationCoordinate
                )
            }))
            .filter((village) => village.distance !== null)
            .sort((a, b) => a.distance - b.distance);
    };
})();
