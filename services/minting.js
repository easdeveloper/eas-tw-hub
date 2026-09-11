(() => {
    'use strict';
    const validGroup = id => /^\d+$/.test(String(id));
    const initial = groupId => ({ version: 2, config: { groupId: validGroup(groupId) ? String(groupId) : '' }, status: 'IDLE', results: [], logs: [], error: null });
    const createController = deps => {
        // Only the selected group survives reload. Old v1 automation is never restored.
        let state = initial(deps.read()?.config?.groupId), busy = false, previewReady = false;
        const listeners = new Set();
        const read = () => JSON.parse(JSON.stringify({ ...state, previewReady }));
        const save = () => {
            if (deps.write(state) === false) throw new Error('Não foi possível salvar o estado. Ativação bloqueada.');
            listeners.forEach(listener => { try { listener(read()); } catch {} });
        };
        const record = (level, message) => {
            state.logs = [...state.logs, { at: deps.now(), level, message }].slice(-100);
            deps.log?.(level, message);
        };
        const configure = ({ groupId }) => {
            if (busy) throw new Error('Aguarde a operação atual.');
            if (!validGroup(groupId)) throw new Error('Selecione explicitamente um grupo.');
            if (state.config.groupId !== String(groupId)) { state.results = []; previewReady = false; }
            state.config = { groupId: String(groupId) }; save();
        };
        const perform = async fn => {
            if (busy) return false;
            busy = true;
            try { return await fn(); }
            catch {
                previewReady = false; state.status = 'ERROR'; state.error = 'Operação interrompida. Verifique a sessão, o grupo e o estado oficial antes de tentar novamente.';
                record('ERROR', state.error); try { save(); } catch {}
                return false;
            } finally { busy = false; }
        };
        const verify = () => perform(async () => {
            if (!validGroup(state.config.groupId)) throw new Error('GROUP_MISSING');
            previewReady = false; state.status = 'VERIFYING'; state.error = null; state.results = []; save();
            const discovery = await deps.discover(state.config.groupId);
            const seen = new Set();
            state.results = discovery.villages.filter(row => !seen.has(String(row.villageId)) && seen.add(String(row.villageId))).map(row => ({
                villageId: String(row.villageId), villageName: String(row.villageName), state: row.state, reason: row.reason || null, endTime: null, outcome: null
            }));
            previewReady = !state.results.some(row => row.state === 'SESSION_INVALID');
            state.status = 'PREVIEW';
            record('INFO', `${state.results.length} aldeias verificadas. Nenhuma ativação enviada.`); save(); return true;
        });
        const activate = () => perform(async () => {
            if (!previewReady || !deps.available()) throw new Error('PREVIEW_OR_LOCK_REQUIRED');
            return deps.lock(async () => {
                if (!previewReady) return false;
                previewReady = false; state.status = 'ACTIVATING'; state.error = null; save();
                for (const row of state.results) {
                    if (row.state !== 'AVAILABLE') continue;
                    if (!await deps.contains(state.config.groupId, row.villageId)) {
                        Object.assign(row, { state: 'UNAVAILABLE', outcome: 'SKIPPED', reason: 'REMOVED_FROM_GROUP' }); save(); continue;
                    }
                    let claimed = false, claimError = false;
                    const beforePost = () => {
                        if (claimed) return false;
                        claimed = true;
                        row.outcome = 'ATTEMPTED';
                        try { save(); } catch (error) { claimError = true; throw error; }
                        return true;
                    };
                    let result;
                    try { result = await deps.activateVillage({ ...row }, { beforePost }); }
                    catch { result = { state: claimed ? 'UNCERTAIN' : 'PARSE_FAILED', outcome: claimed ? 'UNCERTAIN' : 'SKIPPED', reason: 'REQUEST_FAILED' }; }
                    if (claimError) throw new Error('CLAIM_FAILED');
                    // Accept success only for a claimed request and confirmed official ACTIVE state.
                    if (result.outcome === 'ACTIVATED' && (!claimed || result.state !== 'ACTIVE')) result = { state: 'UNCERTAIN', outcome: 'UNCERTAIN', reason: 'INVALID_CONFIRMATION' };
                    Object.assign(row, { state: result.state, outcome: result.outcome, reason: result.reason || null });
                    record(row.outcome === 'ACTIVATED' ? 'SUCCESS' : 'INFO', `${row.villageId}: ${row.outcome} (${row.state}).`); save();
                    if (row.state === 'UNCERTAIN' || row.state === 'SESSION_INVALID') break;
                }
                state.status = 'DONE'; record('INFO', 'Operação encerrada. A criação automática é gerenciada pelo jogo; o EAS não agenda renovação.'); save();
                return true;
            });
        });
        return { read, configure, verify, activate,
            subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
    };
    // Keep the old scope/lock name to serialize with any still-open older tab.
    const key = () => { const data = EAS.World.getGameData(); return `minting.v1.${data.world}.${data.player?.id}.${data.player?.sitter || 0}`; };
    const discover = async groupId => {
        try {
            if (!validGroup(groupId)) throw new Error('GROUP_MISSING');
            await EAS.Data.Villages.ensureFresh({ forceRefresh: true });
            await EAS.Data.Groups.ensureFresh({ forceRefresh: true });
            const group = EAS.Data.Groups.getById(groupId);
            if (!group) throw new Error('GROUP_MISSING');
            const ids = new Set((await EAS.Data.Groups.ensureMembership(groupId, { forceRefresh: true })).map(String));
            const villages = EAS.Data.Villages.getAll().filter(village => ids.has(String(village.id)));
            return { groupName: group.name, villages: await EAS.Data.mapLimit(villages, 2, village => EAS.Adapters.Minting.inspectVillage(village)) };
        } catch { throw new Error('Não foi possível verificar o grupo. Atualize os grupos e confirme a sessão do jogo.'); }
    };
    let controller;
    const getController = () => controller ||= createController({
        read: () => EAS.Storage.get(key()), write: state => EAS.Storage.set(key(), state), now: () => Date.now(),
        available: () => EAS.Adapters.Minting.available && Boolean(navigator.locks),
        lock: fn => navigator.locks.request(key(), { ifAvailable: true }, lock => lock ? fn() : false),
        discover,
        contains: async (groupId, villageId) => {
            const membership = await EAS.Data.Groups.ensureMembership(groupId, { forceRefresh: true });
            return membership.map(String).includes(String(villageId)) && EAS.Data.Villages.getAll().some(village => String(village.id) === String(villageId));
        },
        activateVillage: (row, options) => EAS.Adapters.Minting.activateVillage(row, options),
        log: (level, message) => EAS.Log?.info?.('minting', 'official-session', { level, message })
    });
    EAS.Minting = { createController, discover, getController };
    // Deliberately no ready listener, restore, timers, renewal or background execution.
})();
