// Compact persistence for editable Tactical Operation intent only.
(() => {
    'use strict';
    if (EAS.TacticalOperationDrafts) return;

    const VERSION = 1;
    const STORAGE_PREFIX = 'eas_tw_tactical_operation_drafts_v1';
    const MAX_DRAFTS = 20;
    const MAX_SLOTS = 200;
    const MAX_RECORD_CHARS = 65536;
    const MAX_STORE_CHARS = 262144;
    const integer = Number.isSafeInteger;
    const copy = value => Array.isArray(value) ? value.map(copy) : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)])) : value;
    const scopeKey = ({ world, playerId } = {}) => {
        const safeWorld = String(world || '').trim();
        const safePlayer = String(playerId ?? '').trim();
        if (!safeWorld || !safePlayer) return null;
        return `${STORAGE_PREFIX}:${encodeURIComponent(safeWorld)}:${encodeURIComponent(safePlayer)}`;
    };
    const currentScope = () => ({
        world: EAS.World?.getWorldName?.() || window.game_data?.world || location.hostname,
        playerId: EAS.World?.getPlayer?.()?.id || window.game_data?.player?.id || 0
    });
    const readStore = storage => {
        try {
            const value = JSON.parse(storage.getItem(scopeKey(currentScope())) || 'null');
            if (value?.schemaVersion === VERSION && Array.isArray(value.drafts)) return value;
        } catch {}
        return { schemaVersion: VERSION, drafts: [] };
    };
    const safeQuantities = quantities => Object.fromEntries(Object.entries(quantities || {}).filter(([, value]) =>
        typeof value === 'number' && Number.isFinite(value)));

    const serialize = (draft, { draftId, name = '', savedAt = Date.now() } = {}) => {
        const operation = draft?.operation;
        if (!operation || !integer(savedAt) || !Array.isArray(operation.slots)) return null;
        const selectedSlots = operation.slots.filter(slot => slot.role !== 'unused');
        if (selectedSlots.length > MAX_SLOTS) return null;
        if (selectedSlots.some(slot => slot.composition?.requestedMode === 'custom' &&
            Object.values(slot.composition.quantities || {}).some(value => typeof value !== 'number' || !Number.isFinite(value)))) return null;
        const slots = selectedSlots.map(slot => ({
            sourceId: String(slot.source?.id ?? ''), sourceCoord: slot.source?.coord || null, sourceName: slot.source?.name || null,
            role: slot.role, arrivalOffsetMs: slot.arrivalOffsetMs,
            compositionMode: ['custom', 'full'].includes(slot.composition?.requestedMode) ? slot.composition.requestedMode : null,
            customQuantities: slot.composition?.requestedMode === 'custom' ? safeQuantities(slot.composition.quantities) : null
        }));
        return {
            schemaVersion: VERSION,
            draftId: String(draftId || `tactical-draft-${savedAt}-${Math.random().toString(36).slice(2, 8)}`),
            name: String(name || '').trim().slice(0, 80) || 'Rascunho sem nome',
            savedAt,
            world: String(operation.world || ''),
            playerId: String(operation.playerId || ''),
            target: { coord: operation.target?.coord || null, villageId: operation.target?.villageId || null,
                name: operation.target?.name || null, playerId: operation.target?.playerId || null,
                playerName: operation.target?.playerName || null },
            centralArrivalMs: integer(operation.centralArrivalMs) ? operation.centralArrivalMs : null,
            slotPolicy: copy(operation.slotPolicy || {}),
            filter: draft.filter || 'ALL',
            slots
        };
    };

    const list = ({ storage = typeof localStorage === 'undefined' ? null : localStorage } = {}) => {
        if (!storage) return [];
        return copy(readStore(storage).drafts).sort((left, right) => right.savedAt - left.savedAt);
    };

    const save = (draft, { name = '', draftId = null, savedAt = Date.now(), storage = typeof localStorage === 'undefined' ? null : localStorage } = {}) => {
        if (!storage) return { saved: false, reason: 'STORAGE_UNAVAILABLE', draft: null };
        const record = serialize(draft, { name, draftId, savedAt });
        if (!record) return { saved: false, reason: 'DRAFT_INVALID_OR_TOO_LARGE', draft: null };
        const recordText = JSON.stringify(record);
        if (recordText.length > MAX_RECORD_CHARS) return { saved: false, reason: 'DRAFT_SIZE_LIMIT', draft: null };
        const store = readStore(storage);
        store.drafts = store.drafts.filter(item => item.draftId !== record.draftId);
        store.drafts.unshift(record);
        store.drafts = store.drafts.slice(0, MAX_DRAFTS);
        if (JSON.stringify(store).length > MAX_STORE_CHARS) return { saved: false, reason: 'STORE_SIZE_LIMIT', draft: null };
        try { storage.setItem(scopeKey(currentScope()), JSON.stringify(store)); }
        catch { return { saved: false, reason: 'STORAGE_WRITE_FAILED', draft: null }; }
        return { saved: true, reason: null, draft: copy(record) };
    };

    const remove = (draftId, { storage = typeof localStorage === 'undefined' ? null : localStorage } = {}) => {
        if (!storage || !draftId) return false;
        const store = readStore(storage), next = store.drafts.filter(record => record.draftId !== String(draftId));
        if (next.length === store.drafts.length) return false;
        store.drafts = next;
        try { storage.setItem(scopeKey(currentScope()), JSON.stringify(store)); return true; }
        catch { return false; }
    };

    EAS.TacticalOperationDrafts = Object.freeze({ VERSION, STORAGE_PREFIX, MAX_DRAFTS, MAX_SLOTS, MAX_RECORD_CHARS,
        scopeKey, serialize, list, save, remove });
})();