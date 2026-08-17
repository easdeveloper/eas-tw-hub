(() => {
    'use strict';

    EAS.Utils = EAS.Utils || {};

    const perfEntries = [];
    EAS.Utils.Perf = EAS.Utils.Perf || {
        enabled: () => {
            try { return localStorage.getItem('eas_tw_perf_debug') === 'true'; } catch { return false; }
        },
        start(name, detail = {}) {
            if (!this.enabled()) return null;
            return { name, detail, startedAt: performance.now() };
        },
        end(mark, detail = {}) {
            if (!mark) return null;
            const entry = { name: mark.name, durationMs: Number((performance.now() - mark.startedAt).toFixed(2)), timestamp: Date.now(), detail: { ...mark.detail, ...detail } };
            perfEntries.push(entry);
            if (perfEntries.length > 100) perfEntries.splice(0, perfEntries.length - 100);
            console.debug('[PERF]', entry);
            return entry;
        },
        entries: () => perfEntries.slice(),
        clear: () => { perfEntries.length = 0; }
    };

    EAS.Utils.waitForElement = (selector, { document: targetDocument = document, timeoutMs = 5000, targetWindow = window } = {}) => new Promise((resolve) => {
        const existing = targetDocument.querySelector(selector);
        if (existing) { resolve(existing); return; }
        let settled = false;
        let observer = null;
        let timer = null;
        const finish = (element) => {
            if (settled) return;
            settled = true;
            observer?.disconnect();
            if (timer !== null) targetWindow.clearTimeout(timer);
            resolve(element);
        };
        const Observer = targetWindow.MutationObserver;
        if (Observer) {
            observer = new Observer(() => {
                const element = targetDocument.querySelector(selector);
                if (element) finish(element);
            });
            observer.observe(targetDocument.documentElement || targetDocument, { childList: true, subtree: true });
        }
        timer = targetWindow.setTimeout(() => finish(targetDocument.querySelector(selector)), Math.max(0, Number(timeoutMs) || 0));
    });

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

    EAS.Utils.formatDateTime = (timestamp, includeMilliseconds = false) => {
        if (!Number.isFinite(timestamp)) return '-';
        const date = new Date(timestamp);
        const pad = (value, size = 2) => String(value).padStart(size, '0');
        const value = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        return includeMilliseconds ? `${value}.${pad(date.getMilliseconds(), 3)}` : value;
    };

    EAS.Utils.formatDuration = (durationMs) => {
        if (!Number.isFinite(durationMs)) return '-';
        const total = Math.max(0, Math.round(durationMs / 1000));
        const pad = (value) => String(value).padStart(2, '0');
        return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total % 3600 / 60))}:${pad(total % 60)}`;
    };

    const getZonedParts = (timestamp, timeZone) => Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
            .formatToParts(new Date(timestamp)).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)])
    );

    EAS.Utils.parseDateTimeInTimeZone = (value, timeZone) => {
        const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/);
        if (!match) return null;
        const wanted = { day: +match[1], month: +match[2], year: +match[3], hour: +match[4], minute: +match[5], second: +match[6] };
        const wallUtc = Date.UTC(wanted.year, wanted.month - 1, wanted.day, wanted.hour, wanted.minute, wanted.second);
        let timestamp = wallUtc;
        for (let i = 0; i < 3; i += 1) {
            const parts = getZonedParts(timestamp, timeZone);
            timestamp -= Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - wallUtc;
        }
        const result = getZonedParts(timestamp, timeZone);
        return Object.keys(wanted).every((key) => wanted[key] === result[key]) ? timestamp : null;
    };

    EAS.Utils.formatDateTimeInTimeZone = (timestamp, timeZone) => {
        if (!Number.isFinite(timestamp)) return '-';
        const parts = getZonedParts(timestamp, timeZone);
        const pad = (value) => String(value).padStart(2, '0');
        return `${pad(parts.day)}/${pad(parts.month)}/${parts.year} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
    };

    EAS.Utils.serverTimeToJapan = (formattedServerTime) => {
        const timestamp = EAS.Utils.parseDateTimeInTimeZone(formattedServerTime, 'America/Sao_Paulo');
        return timestamp === null ? null : EAS.Utils.formatDateTimeInTimeZone(timestamp, 'Asia/Tokyo');
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
