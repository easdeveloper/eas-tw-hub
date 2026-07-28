(() => {
    'use strict';

    EAS.World = EAS.World || {};

    const getGameData = () => window.game_data || {};

    const getText = (selector) => {
        return document.querySelector(selector)?.textContent?.trim() || '';
    };

    EAS.World.getGameData = () => {
        return getGameData();
    };

    EAS.World.getWorldName = () => {
        const data = getGameData();

        return data.world ||
            location.hostname.split('.')[0] ||
            'Desconhecido';
    };

    EAS.World.getPlayer = () => {
        const player = getGameData().player || {};

        return {
            id: Number(player.id || 0),
            name: player.name || 'Desconhecido',
            points: Number(player.points || 0),
            rank: Number(player.rank || 0),
            allyId: Number(player.ally || 0),
            sitter: player.sitter || null
        };
    };

    EAS.World.getCurrentVillage = () => {
        const village = getGameData().village || {};
        const coordinate = EAS.Utils.parseCoordinate(
            `${village.x ?? ''}|${village.y ?? ''}`
        );

        return {
            id: Number(village.id || 0),
            name: village.name || 'Aldeia atual',
            x: coordinate?.x ?? null,
            y: coordinate?.y ?? null,
            coordinate: coordinate?.coordinate ?? null,
            points: Number(village.points || 0),
            wood: Number(village.wood || 0),
            stone: Number(village.stone || 0),
            iron: Number(village.iron || 0),
            population: Number(village.pop || 0),
            populationMax: Number(village.pop_max || 0)
        };
    };

    EAS.World.getServerDateTime = () => {
        const dateText =
            getText('#serverDate') ||
            getText('[data-endtime] #serverDate');

        const timeText =
            getText('#serverTime') ||
            getText('[data-endtime] #serverTime');

        const dateMatch = dateText.match(
            /(\d{1,2})\/(\d{1,2})\/(\d{4})/
        );

        const timeMatch = timeText.match(
            /(\d{1,2}):(\d{2}):(\d{2})/
        );

        if (!dateMatch || !timeMatch) {
            return {
                date: dateText || null,
                time: timeText || null,
                timestamp: null,
                formatted: `${dateText} ${timeText}`.trim()
            };
        }

        const day = Number(dateMatch[1]);
        const month = Number(dateMatch[2]);
        const year = Number(dateMatch[3]);

        const hours = Number(timeMatch[1]);
        const minutes = Number(timeMatch[2]);
        const seconds = Number(timeMatch[3]);

        const timestamp = new Date(
            year,
            month - 1,
            day,
            hours,
            minutes,
            seconds
        ).getTime();

        return {
            date: dateText,
            time: timeText,
            day,
            month,
            year,
            hours,
            minutes,
            seconds,
            timestamp,
            formatted: `${dateText} ${timeText}`
        };
    };

    EAS.World.getScreen = () => {
        const url = new URL(location.href);

        return {
            screen: url.searchParams.get('screen'),
            mode: url.searchParams.get('mode'),
            villageId: Number(
                url.searchParams.get('village') ||
                getGameData().village?.id ||
                0
            )
        };
    };

    EAS.World.getInfo = () => {
        return {
            world: EAS.World.getWorldName(),
            player: EAS.World.getPlayer(),
            currentVillage: EAS.World.getCurrentVillage(),
            serverDateTime: EAS.World.getServerDateTime(),
            screen: EAS.World.getScreen(),
            hostname: location.hostname
        };
    };
})();