(() => {
    'use strict';

    EAS.Utils = EAS.Utils || {};

    EAS.Utils.parseCoordinate = (value) => {
        const match = String(value ?? '').match(/(\d{1,3})\|(\d{1,3})/);

        if (!match) {
            return null;
        }

        return {
            x: Number(match[1]),
            y: Number(match[2]),
            coordinate: `${match[1]}|${match[2]}`
        };
    };

    EAS.Utils.isValidCoordinate = (value) => {
        return EAS.Utils.parseCoordinate(value) !== null;
    };

    EAS.Utils.distance = (origin, destination) => {
        const from = typeof origin === 'string'
            ? EAS.Utils.parseCoordinate(origin)
            : origin;

        const to = typeof destination === 'string'
            ? EAS.Utils.parseCoordinate(destination)
            : destination;

        if (!from || !to) {
            return null;
        }

        return Math.sqrt(
            Math.pow(to.x - from.x, 2) +
            Math.pow(to.y - from.y, 2)
        );
    };

    EAS.Utils.formatNumber = (
        value,
        minimumFractionDigits = 0,
        maximumFractionDigits = 2
    ) => {
        return Number(value).toLocaleString('pt-BR', {
            minimumFractionDigits,
            maximumFractionDigits
        });
    };

    EAS.Utils.escapeHtml = (value) => {
        const element = document.createElement('div');
        element.textContent = String(value ?? '');

        return element.innerHTML;
    };

    EAS.Utils.uniqueBy = (items, key) => {
        const seen = new Set();

        return items.filter((item) => {
            const value = item[key];

            if (seen.has(value)) {
                return false;
            }

            seen.add(value);
            return true;
        });
    };
})();