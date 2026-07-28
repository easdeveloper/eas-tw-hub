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

    EAS.Utils.parseBrazilianDate = (value) => {
        const match = String(value ?? '').trim().match(
            /^(\d{2})\/(\d{2})\/(\d{4})$/
        );

        if (!match) {
            return null;
        }

        const day = Number(match[1]);
        const month = Number(match[2]);
        const year = Number(match[3]);
        const timestamp = new Date(year, month - 1, day).getTime();
        const date = new Date(timestamp);

        if (
            year < 1970 ||
            date.getFullYear() !== year ||
            date.getMonth() !== month - 1 ||
            date.getDate() !== day
        ) {
            return null;
        }

        return {
            day,
            month,
            year,
            formatted: [
                String(day).padStart(2, '0'),
                String(month).padStart(2, '0'),
                String(year)
            ].join('/')
        };
    };

    EAS.Utils.parseTime = (value) => {
        const match = String(value ?? '').trim().match(
            /^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/
        );

        if (!match) {
            return null;
        }

        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        const seconds = Number(match[3]);
        const milliseconds = Number(String(match[4] || '0').padEnd(3, '0'));

        if (
            hours > 23 ||
            minutes > 59 ||
            seconds > 59 ||
            milliseconds > 999
        ) {
            return null;
        }

        return {
            hours,
            minutes,
            seconds,
            milliseconds,
            formatted: [
                String(hours).padStart(2, '0'),
                String(minutes).padStart(2, '0'),
                String(seconds).padStart(2, '0')
            ].join(':')
        };
    };

    EAS.Utils.createServerDateTime = (dateValue, timeValue) => {
        const date = EAS.Utils.parseBrazilianDate(dateValue);
        const time = EAS.Utils.parseTime(timeValue);

        if (!date || !time) {
            return null;
        }

        const timestamp = new Date(
            date.year,
            date.month - 1,
            date.day,
            time.hours,
            time.minutes,
            time.seconds,
            time.milliseconds
        ).getTime();

        return {
            ...date,
            ...time,
            date: date.formatted,
            time: time.formatted,
            timestamp,
            formatted: `${date.formatted} ${time.formatted}`
        };
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
