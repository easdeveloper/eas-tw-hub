(() => {
    'use strict';
    if (EAS.IncomingModel) return;
    const names = { spear: 'Lanceiro', sword: 'Espadachim', axe: 'Bárbaro', archer: 'Arqueiro', spy: 'Explorador', light: 'Cavalaria leve', marcher: 'Arqueiro a cavalo', heavy: 'Cavalaria pesada', ram: 'Aríete', catapult: 'Catapulta', knight: 'Paladino', snob: 'Nobre' };
    const classify = (arrivalAt, detectedAt, times) => {
        const observedMs = Number.isFinite(detectedAt) ? arrivalAt - detectedAt : null;
        const candidates = Number.isFinite(detectedAt) && observedMs > 0 ? Object.keys(times).filter(unit => names[unit] && Number.isFinite(times[unit]) && times[unit] >= observedMs - 1000 && times[unit] <= observedMs + 2000).sort() : [];
        const groups = { 'catapult,ram': 'RAM_OR_CATAPULT', 'knight,light': 'LIGHT_OR_PALADIN', 'axe,spear': 'SPEAR_OR_AXE' };
        return { state: candidates.length ? 'matched' : 'unknown', candidates, observedMs: Number.isFinite(observedMs) ? observedMs : null,
            speedClass: groups[candidates.join(',')] || (candidates.length ? candidates.map(unit => ({ snob: 'NOBLE', spy: 'SCOUT', knight: 'PALADIN' })[unit] || unit.toUpperCase()).join('_OR_') : 'UNKNOWN'), toleranceMs: { early: 1000, late: 2000 } };
    };
    const label = attack => {
        const confirmed = attack.watchtower.units;
        const candidates = confirmed.length ? confirmed : attack.classification?.candidates || [];
        if (!candidates.length) return null;
        return `${candidates.map(unit => names[unit]).join('/')}, ${attack.source.name}`.slice(0, 250);
    };
    const message = attack => ({ content: [
        '🚨 NOVO ATAQUE', `Atacante: ${attack.attacker.name}`, `Origem: ${attack.source.name}`, `Destino: ${attack.target.name}`,
        `Chegada: ${attack.arrivalText}`, `Distância: ${attack.distance}`, `Classe de velocidade: ${attack.classification?.candidates?.map(unit => names[unit]).join('/') || 'Não comprovada'}`,
        `Torre: ${attack.watchtower.state}${attack.watchtower.units.length ? ' — ' + attack.watchtower.units.map(unit => names[unit]).join('/') : ''}`,
        `Tamanho: ${attack.attackSize?.title || attack.attackSize?.key || 'Não informado'}`, `Comando: ${attack.commandId}`
    ].join('\n').slice(0, 1900), allowed_mentions: { parse: [] } });
    const merge = (state, rows, events, now) => {
        const baseline = !state.initialized, old = state.attacks || {}, incoming = new Set(rows.map(row => row.commandId));
        const newRows = rows.filter(row => !old[row.commandId]);
        const eventId = event => event.id || `${event.type}:${event.target}:${event.receivedAt}`;
        const consumedHints = new Set(Object.values(old).flatMap(entry => entry.detectionEventIds || []));
        for (const row of rows) {
            let entry = old[row.commandId];
            if (!entry) {
                const hints = events.filter(event => event.type === 'attack' && event.target === row.target.coords &&
                    Number.isFinite(event.detectedAt) && now >= event.receivedAt && now - event.receivedAt < 30000 && !consumedHints.has(eventId(event))).sort((a, b) => a.detectedAt - b.detectedAt);
                const peers = newRows.filter(other => other.target.coords === row.target.coords);
                // Duplicate delivery in other tabs can describe the same event.
                // Only one new target row and a tight burst admit association;
                // consume the entire burst so it cannot time a later command.
                const timed = !baseline && peers.length === 1 && hints.length && hints.at(-1).detectedAt - hints[0].detectedAt <= 1000 ? hints[0].detectedAt : null;
                entry = old[row.commandId] = { ...row, state: baseline ? 'BASELINED' : 'NEW_DETECTED', baseline,
                    firstDetectedAt: timed, firstSeenAt: now, detectionSource: timed == null ? 'reconciliation-only' : 'socket',
                    detectionEventIds: hints.map(eventId),
                    label: { status: 'idle' }, discord: { status: 'idle' }, classification: null };
                hints.forEach(event => consumedHints.add(eventId(event)));
            }
            const watchtower = !row.watchtower.units.length && entry.watchtower.units.length ? entry.watchtower : row.watchtower;
            Object.assign(entry, row, { watchtower, attackSize: row.attackSize || entry.attackSize, lastSeenAt: now });
            if (entry.watchtower.units.length && !entry.baseline) entry.state = 'WATCHTOWER_ENRICHED';
        }
        for (const entry of Object.values(old)) if (!incoming.has(entry.commandId) || entry.arrivalAt <= now) { entry.state = 'ENDED'; entry.endedAt ||= now; }
        state.attacks = old; state.initialized = true; state.lastReconciledAt = now;
        return state;
    };
    EAS.IncomingModel = { classify, label, message, merge, names };
})();
