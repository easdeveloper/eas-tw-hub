(() => {
    'use strict';

    EAS.Villages = EAS.Villages || {};

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
        href = ''
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
            href: href || ''
        };
    };

    const readFromGameData = () => {
        const source = window.game_data?.player?.villages;

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
                        `${village.x}|${village.y}`
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
                    `${village.x}|${village.y}`
            });

            if (item) {
                villages.push(item);
            }
        });

        return villages;
    };

    const readFromLinks = () => {
        const selectors = [
            'a[href*="village="]',
            '.village_switch_link',
            '#village_switch_right a',
            '#village_switch_left a',
            '#production_table a[href*="village="]',
            '#overview_villages a[href*="village="]'
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
                href: link.href
            });

            if (village) {
                villages.push(village);
            }
        });

        return villages;
    };

    const includeCurrentVillage = (villages) => {
        const current = EAS.World.getCurrentVillage();

        if (!current.coordinate) {
            return villages;
        }

        villages.push({
            id: current.id,
            name: current.name,
            x: current.x,
            y: current.y,
            coordinate: current.coordinate,
            href: location.href,
            current: true
        });

        return villages;
    };

    EAS.Villages.list = () => {
        let villages = [
            ...readFromGameData(),
            ...readFromLinks()
        ];

        villages = includeCurrentVillage(villages);

        villages = EAS.Utils.uniqueBy(
            villages.filter((village) => village.coordinate),
            'coordinate'
        );

        villages.sort((a, b) => {
            if (a.id === EAS.World.getCurrentVillage().id) {
                return -1;
            }

            if (b.id === EAS.World.getCurrentVillage().id) {
                return 1;
            }

            return a.name.localeCompare(b.name, 'pt-BR');
        });

        return villages;
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