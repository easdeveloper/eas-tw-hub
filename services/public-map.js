(() => {
    'use strict';
    EAS.PublicMap = EAS.PublicMap || {};
    const CACHE_TTL = 5 * 60 * 1000;
    let cache = null;
    const decode = (value) => { try { return decodeURIComponent(String(value || '').replace(/\+/g, ' ')); } catch { return String(value || ''); } };
    const lines = (text) => String(text || '').trim().split(/\r?\n/).filter(Boolean);
    const load = async (forceRefresh = false) => {
        if (!forceRefresh && cache && Date.now() - cache.updatedAt < CACHE_TTL) return cache;
        const [playersResponse, villagesResponse] = await Promise.all([
            fetch(new URL('/map/player.txt', location.origin), { credentials: 'same-origin' }),
            fetch(new URL('/map/village.txt', location.origin), { credentials: 'same-origin' })
        ]);
        if (!playersResponse.ok || !villagesResponse.ok) throw new Error('Os dados públicos do mapa não estão disponíveis neste mundo.');
        const [playersText, villagesText] = await Promise.all([playersResponse.text(), villagesResponse.text()]);
        if (!playersText.trim()) throw new Error('A lista pública de jogadores veio vazia.');
        const players = lines(playersText).map((line) => { const [id, name, allyId, villageCount, points, rank] = line.split(','); return { id: Number(id), name: decode(name), allyId: Number(allyId), villageCount: Number(villageCount), points: Number(points), rank: Number(rank) }; });
        const villages = lines(villagesText).map((line) => { const [id, name, x, y, playerId, points, rank] = line.split(','); return { id: Number(id), name: decode(name), x: Number(x), y: Number(y), playerId: Number(playerId), points: Number(points), rank: Number(rank), coordinate: `${String(x).padStart(3, '0')}|${String(y).padStart(3, '0')}`, continent: `K${Math.floor(Number(y) / 100)}${Math.floor(Number(x) / 100)}` }; });
        cache = { players, villages, updatedAt: Date.now() };
        return cache;
    };
    EAS.PublicMap.findPlayerVillages = async (name, { forceRefresh = false } = {}) => {
        const searched = String(name || '').trim().toLocaleLowerCase();
        if (!searched) throw new Error('Informe o nome do jogador.');
        const data = await load(forceRefresh);
        let matches = data.players.filter((player) => player.name.toLocaleLowerCase() === searched);
        if (!matches.length) matches = data.players.filter((player) => player.name.toLocaleLowerCase().includes(searched));
        if (!matches.length) throw new Error('Jogador não encontrado. Confira o nome e tente novamente.');
        if (matches.length > 1) throw new Error(`Nome ambíguo: ${matches.slice(0, 5).map((player) => player.name).join(', ')}.`);
        const player = matches[0];
        const villages = data.villages.filter((village) => village.playerId === player.id);
        if (!villages.length) throw new Error('O jogador foi encontrado, mas não possui aldeias no mapa atual.');
        return { player, villages, updatedAt: data.updatedAt };
    };
})();
