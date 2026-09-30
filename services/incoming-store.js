(() => {
    'use strict';
    if (EAS.IncomingStore) return;
    const scope = () => `${EAS.World.getWorldName()}:${EAS.World.getPlayer().id}`;
    const key = () => `eas_tw_incoming_v1:${scope()}`;
    const initial = () => ({ version: 1, initialized: false, attacks: {}, failures: 0, nextReadAt: 0, config: { enabled: false, discord: false, labels: false } });
    const read = () => {
        const raw = localStorage.getItem(key());
        if (!raw) return initial();
        const state = JSON.parse(raw);
        if (state.version !== 1 || !state.attacks || !state.config) throw Error('INCOMING_STORAGE_INVALID');
        return state;
    };
    const write = state => {
        const text = JSON.stringify(state);
        if (text.length > 2000000 || Object.keys(state.attacks).length > 2000) throw Error('INCOMING_STORAGE_LIMIT');
        localStorage.setItem(key(), text);
        if (localStorage.getItem(key()) !== text) throw Error('INCOMING_READBACK_FAILED');
    };
    const prune = (state, now) => {
        for (const [id, entry] of Object.entries(state.attacks)) if (entry.endedAt && now - entry.endedAt > 7 * 86400000) delete state.attacks[id];
    };
    const events = () => JSON.parse(localStorage.getItem(key() + ':events') || '[]');
    const record = async event => navigator.locks.request(key() + ':events', async () => {
        const entries = events().filter(item => event.receivedAt - item.receivedAt < 30000);
        entries.push(event); localStorage.setItem(key() + ':events', JSON.stringify(entries.slice(-50)));
    });
    EAS.IncomingStore = { scope, key, read, write, prune, events, record };
})();
