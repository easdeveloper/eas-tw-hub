// Mass Snipe by RedAlert (https://twscripts.dev/), adapted for EAS TW Hub.
// Reference and original copyright notice: ../massSnipe.js.
(() => {
    'use strict';

    const RUNTIME_ID = 'mass-snipe-countdown';
    // Encode the server's displayed calendar with UTC fields. These values are
    // server wall-clock milliseconds, not Unix instants or the client's timezone.
    const formatDateTime = (value) => {
        const date = new Date(Number(value));
        if (!Number.isFinite(date.getTime())) return '-';
        const pad = (part, size = 2) => String(part).padStart(size, '0');
        return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}:${pad(date.getUTCMilliseconds(), 3)}`;
    };
    const getLandingTime = (value) => {
        const match = String(value).trim().match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2}:\d{2})(?::(\d{1,3}))?$/);
        if (!match) throw new Error('Informe a chegada como DD/MM/YYYY HH:MM:SS:mmm.');
        const [day, month, year] = match[1].split('/').map(Number);
        const [hours, minutes, seconds] = match[2].split(':').map(Number);
        const milliseconds = Number(match[3] || 0);
        const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds, milliseconds));
        if (year < 1970 || formatDateTime(date) !== `${match[1]} ${match[2]}:${String(milliseconds).padStart(3, '0')}`) throw new Error('Hora de chegada inválida.');
        return date;
    };
    const getLaunchTime = (unit, landingTime, distance, sigil, unitSpeeds) => {
        const unitTime = (distance * unitSpeeds[unit] * 60000) / (1 + sigil / 100);
        return Math.round(landingTime.getTime() - unitTime);
    };
    const formatDurationMs = (milliseconds) => {
        const duration = Math.max(0, Math.floor(milliseconds));
        const pad = (value, size = 2) => String(value).padStart(size, '0');
        return `${Math.floor(duration / 3600000)}:${pad(Math.floor(duration / 60000) % 60)}:${pad(Math.floor(duration / 1000) % 60)}.${pad(duration % 1000, 3)}`;
    };
    const getCurrentServerTimeMs = () => {
        // Reuse the Hub's #serverDate/#serverTime reader, but never its locally
        // constructed timestamp. The displayed fields define the server calendar.
        const server = EAS.World.getServerDateTime();
        if (!server.date || !server.time) throw new Error('Data/hora do servidor indisponível.');
        const wallTime = getLandingTime(`${server.date} ${server.time.replace('.', ':')}`).getTime();
        const synchronized = window.Timing?.getCurrentServerTime?.();
        if (!Number.isFinite(synchronized)) return wallTime;
        // Discover the clock offset in whole minutes (including fractional-hour
        // zones). Rounding only the offset avoids importing the DOM clock's
        // second-level quantization into Timing's millisecond precision.
        const offset = Math.round((wallTime - synchronized) / 60000) * 60000;
        return synchronized + offset;
    };

    // Only the missing game-specific reads live in this adapter. Troops/groups
    // remain authoritative in EAS.Data; no second SDK or overview scraper.
    EAS.Selectors.massSnipe = Object.freeze({
        commands: '#commands_outgoings table tbody tr.command-row, #commands_incomings table tbody tr.command-row',
        incomings: '#incomings_table tbody tr'
    });
    EAS.Adapters.MassSnipe = {
        async getUnitSpeeds() {
            const key = `mass-snipe.unit-speeds.${EAS.World.getWorldName()}`;
            const cached = EAS.Storage.get(key);
            if (cached && Date.now() - cached.updatedAt < 7 * 86400000) return cached.speeds;
            return EAS.Data.dedupe(key, async () => {
                const response = await fetch('/interface.php?func=get_unit_info', { credentials: 'same-origin' });
                if (!response.ok) throw new Error('Não foi possível carregar as velocidades das unidades.');
                const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
                const speeds = Object.fromEntries([...xml.querySelectorAll('config > *')]
                    .map((node) => [node.nodeName, Number(node.querySelector('speed')?.textContent)])
                    .filter(([, speed]) => speed > 0));
                if (!Object.keys(speeds).length || xml.querySelector('parsererror')) throw new Error('Velocidades das unidades indisponíveis.');
                EAS.Storage.set(key, { updatedAt: Date.now(), speeds });
                return speeds;
            });
        },
        readCommand(row) {
            const overview = row.matches(EAS.Selectors.massSnipe.incomings);
            const coordinate = overview
                ? EAS.Utils.parseCoordinate(row.cells[1]?.textContent)?.coordinate
                : location.hash.slice(1).split(';').slice(0, 2).join('|');
            if (!EAS.Utils.isValidCoordinate(coordinate)) throw new Error('Não foi possível identificar a aldeia alvo.');
            return { coord: coordinate, landingTime: parseArrival(row.cells[overview ? 5 : 1]?.textContent || '') };
        }
    };

    const currentGroup = () => {
        const id = String(EAS.World.getGameData().group_id ?? '0');
        return id === '0' ? 'all' : id;
    };
    const loadInputs = async () => {
        await EAS.Data.Villages.ensureFresh();
        await EAS.Data.Groups.ensureFresh();
        const groupId = currentGroup();
        if (groupId !== 'all' && !EAS.Data.Groups.getById(groupId)) throw new Error('O grupo atual não foi encontrado. Atualize os dados.');
        const [ids, , unitSpeeds, mapVillages] = await Promise.all([
            EAS.Data.Groups.ensureMembership(groupId), EAS.Data.Troops.ensureFresh(),
            EAS.Adapters.MassSnipe.getUnitSpeeds(), EAS.PublicMap.getVillages()
        ]);
        const selected = new Set(ids.map(String));
        return {
            ownVillages: EAS.Data.Villages.getAll().filter((village) => selected.has(String(village.id))),
            troops: EAS.Data.Troops.getAll(), unitSpeeds, mapVillages
        };
    };

    // Same origin/target/unit combinations, sigil ratio and minimum as the source.
    const calculate = ({ selectedUnits, snipesNeeded }, { ownVillages, troops, unitSpeeds }, now = getCurrentServerTimeMs()) => {
        const arrivals = snipesNeeded.map((snipe) => {
            if (!/^\d{1,3}\|\d{1,3}$/.test(snipe.coord)) throw new Error('Informe uma aldeia válida, como 500|500.');
            if (!Number.isFinite(snipe.sigil) || snipe.sigil < 0 || !Number.isInteger(snipe.minAmount) || snipe.minAmount < 0) throw new Error('Aflição e quantidade mínima devem ser números válidos.');
            return { ...snipe, date: getLandingTime(snipe.landingTime) };
        });
        selectedUnits.forEach((unit) => { if (!(unitSpeeds[unit] > 0)) throw new Error(`Velocidade indisponível: ${unit}.`); });
        const possibleSnipes = [];
        ownVillages.forEach((village) => {
            arrivals.forEach((snipe) => {
                const distance = EAS.Utils.distance(snipe.coord, village.coordinate);
                selectedUnits.forEach((unit) => {
                    const launchTime = getLaunchTime(unit, snipe.date, distance, snipe.sigil, unitSpeeds);
                    if (launchTime > now && distance > 0) {
                        possibleSnipes.push({ id: village.id, name: village.name, unit, fromCoord: village.coordinate,
                            toCoord: snipe.coord, distance, launchTime, formattedLaunchTime: formatDateTime(launchTime),
                            minAmount: snipe.minAmount, landingTime: formatDateTime(snipe.date) });
                    }
                });
            });
        });
        possibleSnipes.sort((a, b) => a.launchTime - b.launchTime);
        return possibleSnipes.flatMap((snipe) => {
            const home = troops[String(snipe.id)]?.ownHome || troops[String(snipe.id)]?.available;
            return home && Number(home[snipe.unit]) >= snipe.minAmount
                ? [{ ...snipe, unitAmount: Number(home[snipe.unit]) }] : [];
        });
    };

    const commandUrl = ({ id, toCoord, unit, unitAmount }) => {
        const [x, y] = toCoord.split('|');
        const url = new URL('/game.php', location.origin);
        const player = EAS.World.getGameData().player;
        if (player?.sitter > 0) url.searchParams.set('t', player.id);
        Object.entries({ village: id, screen: 'place', x, y, [unit]: unitAmount }).forEach(([key, value]) => url.searchParams.set(key, value));
        return url.href;
    };
    const getBBCodeExport = (snipes) => '[table][**]Unidade[||]Origem[||]Destino[||]Hora de chegada[||]Hora de saída[||]Comando[||]Status[/**]\n' +
        snipes.map((snipe) => `[*][unit]${snipe.unit}[/unit] ${EAS.Utils.formatNumber(snipe.unitAmount)}[|] ${snipe.fromCoord} [|] ${snipe.toCoord} [|] ${snipe.landingTime} [|]${snipe.formattedLaunchTime}[|][url=${commandUrl(snipe)}]Enviar[/url][|]\n`).join('') + '[/table]';

    const parseArrival = (text) => {
        const value = String(text).trim();
        const time = value.match(/\b(\d{1,2}):(\d{2}):(\d{2})(?:[:.](\d{1,3}))?/);
        if (!time) throw new Error('Não foi possível ler a hora de chegada.');
        const clock = `${time[1].padStart(2, '0')}:${time[2]}:${time[3]}:${String(time[4] || '0').padStart(3, '0')}`;
        const explicit = value.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
        if (explicit) return formatDateTime(getLandingTime(`${explicit[0]} ${clock}`));
        const base = EAS.World.getServerDateTime();
        if (!base.available) throw new Error('Data do servidor indisponível para importar chegadas.');
        const date = getLandingTime(`${base.date} 00:00:00`);
        const language = window.lang || {};
        const today = (language.aea2b0aa9ae1534226518faaefffdaad || 'today at %s').split('%s')[0].trim();
        const tomorrow = (language['57d28d1b211fddbb7a499ead5bf23079'] || 'tomorrow at %s').split('%s')[0].trim();
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const english = value.match(/\b([A-Z][a-z]{2})\s+(\d{1,2}),\s*(\d{4})?\s/);
        const dotted = value.match(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\b/);
        if (english && months.includes(english[1])) date.setUTCFullYear(Number(english[3] || date.getUTCFullYear()), months.indexOf(english[1]), Number(english[2]));
        else if (/tomorrow|amanh[ãa]|mañana/i.test(value) || (tomorrow && value.includes(tomorrow))) date.setUTCDate(date.getUTCDate() + 1);
        else if (/today|hoje|hoy/i.test(value) || (today && value.includes(today))) { /* current server day */ }
        else if (dotted) date.setUTCFullYear(Number(dotted[3] || date.getUTCFullYear()), Number(dotted[2]) - 1, Number(dotted[1]));
        else throw new Error('Não foi possível ler a data de chegada.');
        return formatDateTime(getLandingTime(`${formatDateTime(date).split(' ')[0]} ${clock}`));
    };
    const parseTrains = (text, now = getCurrentServerTimeMs()) => {
        const found = [];
        String(text).split(/(?:Village|Aldeia|Pueblo):/i).slice(1).forEach((block) => {
            const coord = EAS.Utils.parseCoordinate(block)?.coordinate;
            if (!coord) return;
            block.split(/\r?\n/).filter((line) => /Noble|Nobre/i.test(line)).forEach((line) => {
                const arrival = line.split(/Arrival time:|Hora de chegada:|Horário de chegada:|Hora de llegada:/i)[1];
                if (!arrival) throw new Error('O texto do nobre não contém a hora de chegada.');
                const landingTime = parseArrival(arrival);
                if (getLandingTime(landingTime).getTime() > now) found.push({ coord, landingTime, sigil: 0, minAmount: 50 });
            });
        });
        return found;
    };

    let restoreTitle = null;
    const stopCountdown = () => {
        EAS.Runtime.dispose(RUNTIME_ID);
        restoreTitle?.();
        restoreTitle = null;
    };
    const startCountdownMs = (container, onChange = () => {}) => {
        stopCountdown();
        const runtime = EAS.Runtime.create({ id: RUNTIME_ID, type: 'mass-snipe' });
        const originalTitle = document.title;
        let lastTitle = null;
        restoreTitle = () => { if (document.title === lastTitle) document.title = originalTitle; };
        const update = () => {
            if (!container.isConnected) { stopCountdown(); return; }
            const now = getCurrentServerTimeMs();
            let first = null;
            container.querySelectorAll('[data-endtime-ms]').forEach((countdown) => {
                const remaining = Number(countdown.dataset.endtimeMs) - now;
                if (remaining <= 0) { countdown.closest('tr').remove(); return; }
                countdown.textContent = formatDurationMs(remaining);
                if (first === null) {
                    first = countdown.textContent;
                    if (remaining <= 10000 && !countdown.dataset.alertPlayed) {
                        countdown.dataset.alertPlayed = 'true';
                        try { window.TribalWars?.playSound('chat'); } catch (error) { EAS.Log?.error?.('mass-snipe', 'sound-failed', error); }
                    }
                }
            });
            onChange();
            if (first === null) { stopCountdown(); return; }
            lastTitle = `Enviar em ${first}`;
            document.title = lastTitle;
        };
        runtime.setInterval(update, 25);
        update();
        return stopCountdown;
    };

    EAS.MassSnipeExecution = { formatDateTime, getLandingTime, getLaunchTime, formatDurationMs, getCurrentServerTimeMs,
        loadInputs, calculate, commandUrl, getBBCodeExport, parseArrival, parseTrains, startCountdownMs, stopCountdown };
})();
