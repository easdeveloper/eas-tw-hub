(() => {
    'use strict';
    if (EAS.IncomingTransport) return;
    const travelCache = new Map();
    let nextActionAt = 0;
    const check = signal => { if (signal?.aborted) throw Error('MONITOR_STOPPED'); if (window.EASRateLimit?.check()) throw Error('RATE_LIMITED'); };
    const bounded = async (signal, work) => {
        check(signal);
        const controller = new AbortController(), cancel = () => controller.abort();
        signal?.addEventListener('abort', cancel, { once: true });
        const timer = setTimeout(cancel, 8000);
        try { return await work(controller.signal); }
        finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
    };
    const pace = async signal => {
        check(signal);
        await new Promise((resolve, reject) => {
            const cancel = () => { clearTimeout(timer); reject(Error('MONITOR_STOPPED')); };
            const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, Math.max(0, nextActionAt - Date.now()));
            signal?.addEventListener('abort', cancel, { once: true });
        });
        check(signal); nextActionAt = Date.now() + 1100;
    };
    const request = async (url, options) => {
        check(options.signal);
        const response = await fetch(url, { credentials: 'same-origin', ...options });
        if (response.status === 429) { window.EASRateLimit?.reportStatus?.(429); throw Error('RATE_LIMITED'); }
        if (!response.ok) throw Error('INCOMING_HTTP_' + response.status);
        return response;
    };
    const overview = signal => bounded(signal, async signal => {
        const url = new URL('/game.php', location.origin);
        for (const [key, value] of Object.entries({ village: window.game_data.village.id, screen: 'overview_villages', mode: 'incomings', type: 'unignored', subtype: 'attacks' })) url.searchParams.set(key, value);
        const response = await request(url, { signal });
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        return EAS.IncomingParser.parse(doc, response.url || url.href);
    });
    const travel = (attack, signal) => {
        check(signal);
        const key = `${EAS.IncomingStore.scope()}:${attack.source.id}:${attack.target.id}:${attack.target.coords}`;
        if (travelCache.has(key)) return travelCache.get(key);
        // Reuse the proven Arrival map_info request/parser/cache; no duplicate
        // travel calculation or changes to the scheduled executor.
        const promise = bounded(signal, boundedSignal => EAS.ArrivalPlanner.mapInfo(attack.source.id, attack.target, boundedSignal)).catch(error => { travelCache.delete(key); throw error; });
        if (travelCache.size >= 256) travelCache.delete(travelCache.keys().next().value);
        travelCache.set(key, promise); return promise;
    };
    const rename = async (attack, text, signal) => {
        check(signal);
        const token = window.csrf_token;
        if (typeof token !== 'string' || !token) throw Error('DYNAMIC_TOKEN_UNAVAILABLE');
        const url = new URL('/game.php', location.origin);
        for (const [key, value] of Object.entries({ village: window.game_data.village.id, screen: 'info_command', ajaxaction: 'edit_other_comment', id: attack.commandId })) url.searchParams.set(key, value);
        const response = await bounded(signal, boundedSignal => request(url, { method: 'POST', signal: boundedSignal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ text, h: token }) }));
        // Successful HTTP alone does not prove the name. The next overview read
        // must return the exact requested label. No speculative response parser.
        return { status: response.status };
    };
    const discord = async (attack, signal) => {
        check(signal);
        const bridge = window.EASDiscordBridge;
        if (!bridge?.configured?.()) throw Error('DISCORD_TRANSPORT_UNAVAILABLE');
        return bridge.send({ messageId: attack.discord.messageId || null, payload: EAS.IncomingModel.message(attack) });
    };
    EAS.IncomingTransport = { overview, travel, rename, discord, check, pace };
})();
