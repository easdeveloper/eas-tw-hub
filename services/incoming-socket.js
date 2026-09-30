(() => {
    'use strict';
    if (EAS.IncomingSocket) return;
    let runtime = null, socket = null, handlers = [], callback = null, timer = null, checks = 0, state = 'stopped';
    const log = (reason, detail = {}) => { try { EAS.Logger?.info?.('IncomingMonitor', reason === 'LISTENERS_ATTACHED' ? 'SOCKET_ATTACHED' : 'socket', { reason, state, ...detail }); } catch {} };
    const detach = () => {
        for (const [event, handler] of handlers) {
            try { socket.off(event, handler); } catch { /* Never call off(event) without our handler. */ }
        }
        if (handlers.length) log('LISTENERS_REMOVED', { count: handlers.length });
        handlers = []; socket = null;
    };
    const schedule = delay => {
        if (!runtime || timer !== null) return;
        timer = runtime.setTimeout(() => { timer = null; refresh(); }, delay);
    };
    const refresh = () => {
        if (!runtime) return false;
        const candidate = window.Connection?.socket;
        const valid = candidate?.nsp === '/game' && typeof candidate.on === 'function' && typeof candidate.off === 'function';
        if (candidate !== socket || !valid) {
            const catchUp = Boolean(socket) || checks > 0;
            detach();
            if (valid) {
                socket = candidate;
                const current = () => runtime && socket === candidate && window.Connection?.socket === candidate;
                const attack = data => { if (current()) callback('attack', data); };
                const count = data => {
                    if (!current()) return;
                    if (!['incoming_attack', 'attack'].includes(data?.command_type)) { log('COMMAND_COUNT_IGNORED'); return; }
                    callback('command_count', data);
                };
                const connect = () => {
                    if (!current()) { refresh(); return; }
                    state = 'connected'; checks = 0; log('RECONNECTED'); callback('reconnect', {});
                };
                const disconnect = () => {
                    if (!current()) { refresh(); return; }
                    state = 'disconnected'; log('DISCONNECTED');
                    if (timer !== null) { runtime.clearTimeout(timer); timer = null; }
                    schedule(250);
                };
                handlers = [['attack', attack], ['command_count', count], ['connect', connect], ['disconnect', disconnect]];
                try { for (const [event, handler] of handlers) candidate.on(event, handler); }
                catch { detach(); state = 'waiting'; log('SUBSCRIPTION_FAILED'); schedule(5000); return false; }
                checks = 0; state = candidate.connected === true ? 'connected' : 'disconnected';
                log('LISTENERS_ATTACHED', { namespace: '/game', count: handlers.length, connected: candidate.connected === true });
                if (catchUp && candidate.connected === true) callback('reconnect', {});
            } else {
                if (state !== 'waiting') { state = 'waiting'; log('WAITING_FOR_CONNECTION_SOCKET'); }
            }
        }
        // Only a local reference check, never an HTTP/socket connection attempt.
        // Catches silent object replacement; normal reconnect uses on('connect').
        schedule(socket ? 15000 : [250, 500, 1000, 2000, 5000][Math.min(checks++, 4)]);
        return Boolean(socket);
    };
    const stop = () => {
        detach(); EAS.Runtime.dispose('incoming-socket'); runtime = null; timer = null; callback = null; state = 'stopped'; checks = 0;
    };
    const start = listener => {
        if (runtime) { refresh(); return; }
        callback = (type, data) => { try { listener(type, data || {}); } catch { log('EVENT_HANDLER_FAILED'); } };
        runtime = EAS.Runtime.create({ id: 'incoming-socket', type: 'incoming-socket' });
        runtime.listen(window, 'pagehide', stop);
        runtime.listen(window, 'focus', refresh);
        runtime.listen(document, 'visibilitychange', refresh);
        refresh();
    };
    EAS.IncomingSocket = { start, stop, refresh, status: () => ({ state, attached: Boolean(socket), connected: socket?.connected === true }) };
})();
