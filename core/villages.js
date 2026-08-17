(() => {
    'use strict';
    EAS.Villages ||= {};

    const STORAGE_KEY = 'villages.state';
    const LEGACY_KEY = 'villages.list';
    const HISTORY_LIMIT = 30;
    const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;
    let refreshPromise = null;
    let invalidated = false;
    let staleReferences = [];

    const scope = () => { const info = EAS.World.getInfo(); return { world: info.world || location.hostname, playerId: String(info.player?.id || 0) }; };
    const emptyState = () => ({ version: 0, ...scope(), updatedAt: 0, source: 'none', villages: {}, removedVillages: [], history: [], addedSincePrevious: [], removedSincePrevious: [] });
    const parseNumber = (value) => Number(String(value ?? '').replace(/[^\d]/g, '')) || 0;
    const villageIdFromHref = (href) => { try { return Number(new URL(href, location.origin).searchParams.get('village') || 0); } catch { return Number(String(href).match(/[?&]village=(\d+)/)?.[1] || 0); } };
    const normalizeVillage = (value = {}, source = value.source || 'unknown') => {
        const parsed = EAS.Utils.parseCoordinate(value.coordinate || value.coord || (value.x != null && value.y != null ? `${value.x}|${value.y}` : '')); const id = Number(value.id || value.villageId || villageIdFromHref(value.href)); if (!id || !parsed) return null;
        const rawName = String(value.name || value.villageName || '').replace(/\(\d{1,3}\|\d{1,3}\).*$/, '').replace(/\d{1,3}\|\d{1,3}.*$/, '').trim();
        return { id, name: rawName || `Aldeia ${parsed.coordinate}`, coord: parsed.coordinate, coordinate: parsed.coordinate, x: parsed.x, y: parsed.y, points: parseNumber(value.points), owned: true, href: value.href || '', source, lastSeenAt: Number(value.lastSeenAt || Date.now()) };
    };
    const readState = () => { const stored = EAS.Storage?.get?.(STORAGE_KEY, null); const current = scope(); if (stored && stored.world === current.world && String(stored.playerId) === current.playerId && stored.villages) return { ...emptyState(), ...stored, playerId: current.playerId }; const legacy = EAS.Storage?.get?.(LEGACY_KEY, null); if (legacy?.world === current.world && String(legacy.playerId) === current.playerId && Array.isArray(legacy.villages)) { const villages = Object.fromEntries(legacy.villages.map((village) => normalizeVillage(village, 'legacy-cache')).filter(Boolean).map((village) => [String(village.id), village])); return { ...emptyState(), source: 'legacy-cache', updatedAt: Number(legacy.updatedAt || 0), villages }; } return emptyState(); };
    const saveState = (state) => { EAS.Storage?.set?.(STORAGE_KEY, state); EAS.Storage?.remove?.(LEGACY_KEY); return state; };
    const values = (state = readState()) => Object.values(state.villages || {}).map((village) => normalizeVillage(village, village.source)).filter(Boolean).sort((a, b) => a.id === EAS.World.getCurrentVillage().id ? -1 : b.id === EAS.World.getCurrentVillage().id ? 1 : a.name.localeCompare(b.name, 'pt-BR'));
    const emit = (name, detail) => { try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {} };
    const log = (event, detail = {}) => console.debug(`[EAS Villages] ${event}`, detail);

    const readGameDataSnapshot = () => {
        const data = EAS.World.getGameData(); const source = data.player?.villages || data.villages || data.player_villages; if (!source) return [];
        return (Array.isArray(source) ? source : Object.values(source)).map((village) => normalizeVillage(village, 'authenticated-game-data')).filter(Boolean);
    };
    const readOverviewSnapshot = (doc = document) => {
        const selectors = ['#production_table tr','#overview_villages tr','#combined_table tr','#units_table tr']; const rows = [...doc.querySelectorAll(selectors.join(','))];
        return rows.map((row) => { const link = row.querySelector('a[href*="village="]'); if (!link) return null; const text = `${link.textContent || ''} ${link.title || ''} ${row.textContent || ''}`; const coordinate = EAS.Utils.parseCoordinate(text)?.coordinate; if (!coordinate) return null; const cells = [...row.querySelectorAll('td')]; const pointsCell = row.querySelector('[data-points],.points') || cells.find((cell) => /pontos|points/i.test(cell.title || cell.dataset?.title || '')); return normalizeVillage({ id: villageIdFromHref(link.href), name: link.textContent, coordinate, points: pointsCell?.dataset?.points || pointsCell?.textContent || 0, href: link.href }, 'authenticated-overview'); }).filter(Boolean);
    };
    const currentVillageFallback = () => { const current = EAS.World.getCurrentVillage(); return normalizeVillage({ ...current, coordinate: current.coordinate }, 'current-village'); };
    const authenticatedSnapshotFromPage = () => { const gameData = readGameDataSnapshot(); if (gameData.length > 1) return { villages: gameData, source: 'authenticated-game-data', complete: true }; const overview = readOverviewSnapshot(document); if (overview.length) return { villages: overview, source: 'authenticated-overview-dom', complete: true }; return { villages: [], source: 'none', complete: false }; };
    const buildOverviewUrl = () => { const url = new URL('/game.php', location.origin); const current = EAS.World.getCurrentVillage(); if (current.id) url.searchParams.set('village', current.id); url.searchParams.set('screen', 'overview_villages'); url.searchParams.set('mode', 'combined'); url.searchParams.set('group', '0'); return url; };
    const requestAuthoritativeSnapshot = async () => { log('villages-refresh-request', { url: buildOverviewUrl().pathname }); const response = await fetch(buildOverviewUrl(), { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } }); if (!response.ok) throw new Error(`Não foi possível atualizar aldeias (HTTP ${response.status}).`); const doc = new DOMParser().parseFromString(await response.text(), 'text/html'); if (doc.querySelector('form#login,input[name="password"]')) throw new Error('Sessão expirada ao atualizar aldeias.'); const villages = readOverviewSnapshot(doc); if (!villages.length) throw new Error('O overview autenticado não retornou aldeias.'); return { villages, source: 'authenticated-overview-request', complete: true }; };
    const invalidateDependentCaches = (activeIds, version) => {
        const mutate = (key, callback) => { try { const value = JSON.parse(localStorage.getItem(key) || 'null'); if (!value) return; const changed = callback(value); if (changed !== false) localStorage.setItem(key, JSON.stringify(value)); } catch {} };
        mutate('eas_tw_market_cache', (cache) => { const entries = Array.isArray(cache.villages) ? cache.villages : Object.values(cache.villages || {}); const filtered = entries.filter((village) => activeIds.has(String(village.villageId || village.id))); cache.villages = Object.fromEntries(filtered.map((village) => [String(village.villageId || village.id), village])); if (cache.movements) cache.movements = Object.fromEntries(Object.entries(cache.movements).filter(([id]) => activeIds.has(String(id)))); cache.villagesVersion = version; });
        mutate('eas_tw_market_offers_analysis', (plan) => { plan.staleBecauseVillageSetChanged = true; plan.currentVillagesVersion = version; });
        mutate('eas_tw_market_balance_execution', (plan) => { plan.staleBecauseVillageSetChanged = true; plan.currentVillagesVersion = version; });
        mutate('eas_tw_market_target_supply_execution', (plan) => { plan.staleBecauseVillageSetChanged = true; plan.currentVillagesVersion = version; });
        const troopCache = EAS.Storage?.get?.('troops.available', null); if (troopCache?.villages) { troopCache.villages = Object.fromEntries(Object.entries(troopCache.villages).filter(([id]) => activeIds.has(String(id)))); troopCache.villagesVersion = version; EAS.Storage.set('troops.available', troopCache); }
        log('villages-dependent-cache-invalidated', { villagesVersion: version }); emit('villages:invalidated', { version });
    };
    const applySnapshot = ({ villages, source, complete }) => {
        if (!complete) throw new Error('Snapshot de aldeias incompleto.'); const previous = readState(); const normalized = Object.fromEntries(villages.map((village) => normalizeVillage(village, source)).filter(Boolean).map((village) => [String(village.id), village])); const previousIds = new Set(Object.keys(previous.villages)); const nextIds = new Set(Object.keys(normalized)); const added = Object.values(normalized).filter((village) => !previousIds.has(String(village.id))); const removed = Object.values(previous.villages).filter((village) => !nextIds.has(String(village.id))).map((village) => ({ ...village, owned: false, removedAt: Date.now() })); const changed = added.length > 0 || removed.length > 0; const version = Math.max(1, Number(previous.version || 0) + 1); const historyEntry = { timestamp: Date.now(), previousCount: previousIds.size, currentCount: nextIds.size, added, removed };
        const state = { version, ...scope(), updatedAt: Date.now(), source, villages: normalized, removedVillages: [...removed, ...(previous.removedVillages || [])].slice(0, 100), history: [historyEntry, ...(previous.history || [])].slice(0, HISTORY_LIMIT), addedSincePrevious: added, removedSincePrevious: removed }; saveState(state); invalidated = false;
        if (changed) { log('villages-count-changed', historyEntry); if (added.length) { log('villages-added', { villages: added }); emit('villages:added', { villages: added, version }); } if (removed.length) { log('villages-removed', { villages: removed }); emit('villages:removed', { villages: removed, version }); } invalidateDependentCaches(nextIds, version); }
        log('villages-refresh-complete', { count: nextIds.size, version, source }); emit('villages:updated', { state, changed }); return values(state);
    };

    EAS.Villages.getAll = () => { const state = readState(); if (Object.keys(state.villages).length) return values(state); const live = authenticatedSnapshotFromPage(); if (live.complete) return applySnapshot(live); const current = currentVillageFallback(); return current ? [current] : []; };
    EAS.Villages.list = EAS.Villages.getAll;
    EAS.Villages.getById = (id) => EAS.Villages.getAll().find((village) => village.id === Number(id)) || null;
    EAS.Villages.findById = EAS.Villages.getById;
    EAS.Villages.getByCoord = (coord) => { const parsed = EAS.Utils.parseCoordinate(coord); return parsed ? EAS.Villages.getAll().find((village) => village.coordinate === parsed.coordinate) || null : null; };
    EAS.Villages.findByCoordinate = EAS.Villages.getByCoord;
    EAS.Villages.getVersion = () => Number(readState().version || 0);
    EAS.Villages.getState = () => readState();
    EAS.Villages.refresh = async ({ forceRefresh = true } = {}) => { if (refreshPromise) return refreshPromise; log('villages-refresh-start', { forceRefresh }); refreshPromise = (async () => { const page = authenticatedSnapshotFromPage(); const snapshot = forceRefresh || !page.complete ? await requestAuthoritativeSnapshot() : page; return applySnapshot(snapshot); })().finally(() => { refreshPromise = null; }); return refreshPromise; };
    EAS.Villages.ensureFresh = async ({ maxAgeMs = DEFAULT_MAX_AGE_MS, forceRefresh = false } = {}) => { const state = readState(); if (!forceRefresh && !invalidated && Object.keys(state.villages).length && Date.now() - state.updatedAt <= maxAgeMs) { log('villages-refresh-cache-hit', { ageMs: Date.now() - state.updatedAt, count: Object.keys(state.villages).length }); return values(state); } return EAS.Villages.refresh({ forceRefresh }); };
    EAS.Villages.invalidate = (reason = 'manual') => { invalidated = true; log('villages-invalidated', { reason }); emit('villages:invalidated', { reason, version: EAS.Villages.getVersion() }); };
    EAS.Villages.isOwned = (id) => Boolean(EAS.Villages.getById(id));
    EAS.Villages.filterOwned = (items = [], { sourceModule = 'unknown', idSelector = (item) => item?.villageId ?? item?.id } = {}) => { const active = new Set(EAS.Villages.getAll().map((village) => String(village.id))); return items.filter((item) => { const id = String(idSelector(item) || ''); const owned = active.has(id); if (!owned && id) { const reference = { detectedAt: Date.now(), villageId: id, sourceModule, cachedData: item }; staleReferences.push(reference); staleReferences = staleReferences.slice(-100); log('village-stale-reference-detected', reference); } return owned; }); };
    EAS.Villages.getDiagnostic = () => { const state = readState(); return { playerId: state.playerId, version: state.version, source: state.source, updatedAt: state.updatedAt, ageMs: Date.now() - state.updatedAt, count: Object.keys(state.villages).length, villages: values(state), addedSincePrevious: state.addedSincePrevious, removedSincePrevious: state.removedSincePrevious, staleReferences: [...staleReferences] }; };
    EAS.Villages.getSourceInfo = () => { const state = readState(); return { total: Object.keys(state.villages).length, completeness: Object.keys(state.villages).length ? 'complete' : 'empty', selectedSource: state.source, updatedAt: state.updatedAt, version: state.version }; };
    EAS.Villages.current = () => EAS.World.getCurrentVillage();
    EAS.Villages.distanceTo = (village, destination) => EAS.Utils.distance(village.coordinate, destination);
    EAS.Villages.withDistanceTo = (destination) => EAS.Villages.getAll().map((village) => ({ ...village, distance: EAS.Villages.distanceTo(village, destination) })).filter((village) => village.distance !== null).sort((a, b) => a.distance - b.distance);
})();
