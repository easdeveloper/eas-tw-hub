(() => {
    'use strict';

    EAS.World = EAS.World || {};

    const getGameData = () => window.game_data || {};

    const getText = (selector) => {
        return document.querySelector(selector)?.textContent?.trim() || '';
    };

    const findServerDateTimeText = () => {
        const bodyText = document.body?.textContent || '';
        const match = bodyText.match(
            /Hora do servidor:\s*(\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)\s+(\d{2}\/\d{2}\/\d{4})/i
        );

        if (!match) {
            return null;
        }

        return {
            time: match[1],
            date: match[2],
            source: 'server_text'
        };
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
        const textFallback = findServerDateTimeText();
        const date = dateText || textFallback?.date || '';
        const time = timeText || textFallback?.time || '';
        const parsed = EAS.Utils.createServerDateTime(date, time);

        if (!parsed) {
            return {
                available: false,
                date: date || null,
                time: time || null,
                timestamp: null,
                formatted: `${date} ${time}`.trim(),
                source: 'unavailable'
            };
        }

        return {
            available: true,
            ...parsed,
            source: dateText && timeText
                ? 'server_elements'
                : textFallback?.source || 'server_elements'
        };
    };

    EAS.World.getServerNowTimestamp = () => {
        const serverDateTime = EAS.World.getServerDateTime();

        return serverDateTime.available
            ? serverDateTime.timestamp
            : null;
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
