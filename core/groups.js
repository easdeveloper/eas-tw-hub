(() => {
    'use strict';
    EAS.Groups ||= {};
    const normalizeIds = (value) => [...new Set((Array.isArray(value) ? value : value == null ? [] : String(value).split(',')).map((id) => String(id?.id ?? id).trim()).filter(Boolean))];
    const gameData = () => EAS.World?.getGameData?.() || window.game_data || {};
    const collect = () => {
        const data = gameData(); const source = data.player?.groups || data.groups || data.village_groups || [];
        const groups = new Map();
        const add = (raw, fallbackId = '') => { const id = String(raw?.id ?? raw?.groupId ?? fallbackId); const name = String(raw?.name ?? raw?.label ?? raw?.title ?? '').trim(); if (!id || id === '0' || !name) return; const villageIds = normalizeIds(raw?.villageIds ?? raw?.villages ?? raw?.members); groups.set(id, { id, name, villageIds, source: 'authenticated-game-data' }); };
        if (Array.isArray(source)) source.forEach(add); else Object.entries(source || {}).forEach(([id, value]) => add(value, id));
        (EAS.Villages?.getAll?.() || []).forEach((village) => normalizeIds(village.groupIds ?? village.groups).forEach((groupId) => { const group = groups.get(groupId) || { id: groupId, name: `Grupo ${groupId}`, villageIds: [], source: 'village-metadata' }; group.villageIds = [...new Set([...group.villageIds, String(village.id)])]; groups.set(groupId, group); }));
        return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    };
    EAS.Groups.getAll = collect;
    EAS.Groups.getById = (id) => collect().find((group) => group.id === String(id)) || null;
    EAS.Groups.getVillageIds = (id) => id == null || String(id) === 'all' ? (EAS.Villages?.getAll?.() || []).map((village) => String(village.id)) : EAS.Groups.getById(id)?.villageIds || [];
    EAS.Groups.getMetadata = () => ({ source: collect().length ? 'authenticated-metadata' : 'unavailable', count: collect().length, remoteRequests: 0 });
})();
