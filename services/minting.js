(() => {
    'use strict';
    const intervalMs = (hours) => {
        const value = Number(String(hours).trim().replace(',', '.')) * 3600000;
        if (!Number.isFinite(value) || value < 1 || value > Number.MAX_SAFE_INTEGER) throw new Error('Intervalo inválido: informe horas maiores que zero.');
        return Math.round(value);
    };
    const configOf = ({ groupId, requestedPerVillage, intervalHours }) => {
        const amount = Number(requestedPerVillage);
        if (!/^\d+$/.test(String(groupId))) throw new Error('Selecione explicitamente um grupo.');
        if (!Number.isSafeInteger(amount) || amount < 1) throw new Error('Quantidade por aldeia deve ser um inteiro positivo.');
        return { groupId: String(groupId), requestedPerVillage: amount, intervalHours: intervalMs(intervalHours) / 3600000 };
    };
    const planVillage = (village, amount) => {
        const status = ['SESSION_EXPIRED', 'PARSE_FAILED', 'REQUEST_FAILED'].includes(village.status) ? village.status
            : village.reason === 'NO_ACADEMY' ? 'NO_ACADEMY' : !village.eligible ? 'NOT_ELIGIBLE'
            : village.maxMintable === 0 ? 'INSUFFICIENT_RESOURCES'
            : 'READY';
        return { villageId: String(village.villageId), villageName: village.villageName, requested: amount, attempted: 0, confirmed: 0, status,
            reason: status === 'READY' ? null : village.reason || 'QUANTITY_NOT_VALIDATED', stage: village.stage || null };
    };
    const initial = () => ({ version: 1, config: { groupId: '', requestedPerVillage: 1, intervalHours: 0.5 }, automation: false,
        status: 'IDLE', totalConfirmedCoins: 0, lastCycleConfirmed: 0, lastCycleAttempted: 0, lastCycleRequested: 0,
        nextRunAt: null, lastRunAt: null, results: [], logs: [], error: null });
    const createController = (deps) => {
        let busy = false, timer = null;
        const listeners = new Set();
        const read = () => {
            const saved = deps.read();
            if (!saved || saved.version !== 1) return initial();
            return { ...initial(), ...saved, logs: Array.isArray(saved.logs) ? saved.logs : [], results: Array.isArray(saved.results) ? saved.results : [],
                totalConfirmedCoins: Number.isSafeInteger(saved.totalConfirmedCoins) && saved.totalConfirmedCoins >= 0 ? saved.totalConfirmedCoins : 0 };
        };
        const save = (state) => {
            if (deps.write(state) === false) throw new Error('Não foi possível persistir a cunhagem. Execução bloqueada.');
            listeners.forEach((listener) => { try { listener(state); } catch {} });
            return state;
        };
        const record = (state, level, message) => {
            state.logs = [...state.logs, { at: deps.now(), level, message }].slice(-100);
            deps.log?.(level, message);
        };
        const clear = () => { if (timer !== null) deps.cancelTimer(timer); timer = null; };
        const schedule = () => {
            clear();
            const state = read();
            if (!state.automation || state.status !== 'WAITING') return;
            timer = deps.setTimer(() => { timer = null; return run('timer'); }, Math.min(2147483647, Math.max(1000, state.nextRunAt - deps.now())));
        };
        const fail = (message) => {
            clear();
            const state = read();
            Object.assign(state, { status: 'ERROR', automation: false, nextRunAt: null, error: message });
            record(state, 'ERROR', message); save(state);
        };
        const run = async (mode = 'once') => {
            if (busy) return false;
            busy = true; clear();
            try {
                return await deps.lock(async () => {
                    let state = read();
                    if (mode === 'timer' && (!state.automation || state.nextRunAt > deps.now())) return false;
                    if (state.status === 'RUNNING') { fail('Ciclo interrompido: resultado incerto. Verifique o jogo antes de iniciar novamente.'); return false; }
                    const config = configOf(state.config);
                    if (!deps.available()) throw new Error(deps.blockedReason());
                    state = save({ ...state, config, status: 'RUNNING', automation: mode === 'start' || state.automation, nextRunAt: null,
                        lastRunAt: deps.now(), lastCycleConfirmed: 0, lastCycleAttempted: 0, lastCycleRequested: 0, results: [], error: null });
                    record(state, 'INFO', 'Iniciando ciclo de cunhagem.'); save(state);
                    const discovery = await deps.discover(config.groupId);
                    state = read();
                    if (state.status === 'STOPPED') return false;
                    const results = discovery.villages.map((village) => planVillage(village, config.requestedPerVillage));
                    state.results = results;
                    state.lastCycleRequested = results.reduce((sum, row) => sum + (row.status === 'READY' ? row.requested : 0), 0);
                    if (!Number.isSafeInteger(state.lastCycleRequested)) throw new Error('Quantidade total excede o limite seguro.');
                    record(state, 'INFO', `Grupo ${discovery.groupName}: ${results.length} aldeias; ${results.filter((row) => row.status === 'READY').length} elegíveis. Solicitando até ${state.lastCycleRequested} moedas.`);
                    if (discovery.villages.some((village) => village.eligible && village.maxMintable === null)) {
                        record(state, 'WARNING', 'Limite máximo oficial ainda não validado; execução limitada a 1 moeda por aldeia.');
                    }
                    for (const village of discovery.villages) {
                        if (village.stage && village.stage !== 'request' && village.stage !== 'page') record(state, 'INFO', `${village.villageId} - Academia carregada.`);
                        if (village.eligible) record(state, 'INFO', `${village.villageId} - Formulário de cunhagem encontrado; elegível para ${village.maxMintable === null ? 1 : Math.min(config.requestedPerVillage, village.maxMintable)} moeda(s).`);
                        else if (village.reason === 'NO_MINT_FORM') record(state, 'INFO', `${village.villageId} - Sem formulário de cunhagem.`);
                        else if (village.reason === 'NO_H_FIELD') record(state, 'WARNING', `${village.villageId} - h não encontrado no formulário.`);
                        if (village.status === 'PARSE_FAILED') deps.diagnostic?.({ villageId: String(village.villageId), stage: village.stage, reason: village.reason });
                    }
                    save(state);
                    if (discovery.villages.some((village) => village.status === 'SESSION_EXPIRED' || ['SESSION_EXPIRED', 'LOGIN_PAGE', 'INVALID_PAGE'].includes(village.reason))) throw new Error('Página da Academia inválida ou sessão expirada. Nenhuma nova cunhagem será enviada.');
                    for (let index = 0; index < results.length; index++) {
                        state = read();
                        if (state.status === 'STOPPED') break;
                        const row = state.results[index];
                        if (row.status !== 'READY') { record(state, 'WARNING', `${row.villageName}: ${row.reason}`); save(state); continue; }
                        // Revalidate membership immediately before each action.
                        if (!await deps.contains(config.groupId, row.villageId)) {
                            row.status = 'NOT_ELIGIBLE'; row.reason = 'Aldeia removida do grupo.'; save(state); continue;
                        }
                        if (read().status === 'STOPPED') break;
                        row.status = 'PREPARING'; save(state);
                        let claimed = false;
                        let beforePostError = null;
                        const beforePost = (count) => {
                            try {
                                const latest = read();
                                if (claimed || latest.status === 'STOPPED') return false;
                                if (!Number.isSafeInteger(count) || count < 1 || count > row.requested) throw new Error('Quantidade de cunhagem inválida.');
                                claimed = true;
                                latest.results[index].attempted = count;
                                latest.results[index].status = 'ATTEMPTED';
                                latest.lastCycleAttempted += count;
                                save(latest); // Must succeed before the adapter issues the POST.
                                return true;
                            } catch (error) { beforePostError = error; throw error; }
                        };
                        let response;
                        try { response = await deps.execute({ ...row }, { beforePost }); }
                        catch { response = { status: 'REQUEST_FAILED', confirmed: 0 }; }
                        if (beforePostError) throw beforePostError;
                        state = read();
                        const current = state.results[index];
                        const confirmed = response?.status === 'CONFIRMED' && Number.isSafeInteger(response.confirmed)
                            && response.confirmed > 0 && response.confirmed <= current.attempted && response.attempted === current.attempted ? response.confirmed : 0;
                        Object.assign(current, { confirmed, status: confirmed ? 'CONFIRMED' : current.attempted ? 'CONFIRMATION_FAILED'
                            : ['REQUEST_FAILED', 'SESSION_EXPIRED', 'PARSE_FAILED'].includes(response?.status) ? response.status : 'NOT_ELIGIBLE',
                            reason: confirmed ? null : response?.reason || 'Não foi possível confirmar a cunhagem. Verifique o jogo.', stage: response?.stage || current.stage });
                        if (current.status === 'PARSE_FAILED') deps.diagnostic?.({ villageId: current.villageId, stage: current.stage, reason: current.reason });
                        state.totalConfirmedCoins += confirmed; state.lastCycleConfirmed += confirmed;
                        record(state, confirmed ? 'SUCCESS' : 'ERROR', `${row.villageName}: ${confirmed} moedas confirmadas.`); save(state);
                        // Unknown mutation outcomes must not be automatically retried in later cycles.
                        if (!confirmed && current.attempted) throw new Error('Resultado de cunhagem incerto. Automação parada para evitar repetição.');
                        if (response?.status === 'SESSION_EXPIRED' || ['SESSION_EXPIRED', 'LOGIN_PAGE', 'INVALID_PAGE'].includes(response?.reason)) throw new Error('Página da Academia inválida ou sessão expirada. Automação parada.');
                    }
                    state = read();
                    state.status = state.automation ? 'WAITING' : state.status === 'STOPPED' ? 'STOPPED' : 'IDLE';
                    state.nextRunAt = state.automation ? deps.now() + intervalMs(state.config.intervalHours) : null;
                    record(state, 'INFO', `Ciclo concluído: ${state.lastCycleConfirmed} moedas confirmadas. Total: ${state.totalConfirmedCoins}.`);
                    save(state); return true;
                });
            } catch (error) {
                // Only locally generated, non-sensitive errors are exposed by production dependencies.
                try { fail(error.message); } catch {}
                return false;
            } finally { busy = false; schedule(); }
        };
        return {
            read, run,
            subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
            configure(config) {
                const state = read();
                if (busy || state.status === 'RUNNING') throw new Error('Aguarde o ciclo atual antes de alterar a configuração.');
                save({ ...state, config: configOf(config) });
            },
            start: () => run('start'),
            stop() { clear(); const state = read(); record(state, 'INFO', 'Automação parada.'); save({ ...state, automation: false, status: 'STOPPED', nextRunAt: null }); },
            async restore() {
                if (busy) return;
                const state = read();
                if (state.status === 'RUNNING') {
                    await deps.lock(async () => { if (read().status === 'RUNNING') fail('Ciclo interrompido: resultado incerto. Verifique o jogo antes de iniciar novamente.'); });
                } else if (state.automation) {
                    if (!deps.available()) { fail(deps.blockedReason()); return; }
                    try { configOf(state.config); } catch (error) { fail(error.message); return; }
                    if (!Number.isFinite(state.nextRunAt)) { fail('Agendamento salvo inválido.'); return; }
                    save({ ...state, status: 'WAITING' }); schedule();
                }
            },
            dispose: clear
        };
    };
    const key = () => {
        const data = EAS.World.getGameData();
        return `minting.v1.${data.world}.${data.player?.id}.${data.player?.sitter || 0}`;
    };
    const discover = async (groupId) => {
        try {
            await EAS.Data.Villages.ensureFresh({ forceRefresh: true });
            await EAS.Data.Groups.ensureFresh({ forceRefresh: true });
            const group = EAS.Data.Groups.getById(groupId);
            if (!group) throw new Error('GROUP_MISSING');
            const ids = new Set(await EAS.Data.Groups.ensureMembership(groupId, { forceRefresh: true }));
            const villages = EAS.Data.Villages.getAll().filter((village) => ids.has(String(village.id)));
            return { groupName: group.name, villages: await EAS.Data.mapLimit(villages, 2, (village) => EAS.Adapters.Minting.inspectVillage(village)) };
        } catch { throw new Error('Não foi possível verificar o grupo. Atualize os grupos e confirme que a sessão do jogo está ativa.'); }
    };
    let controller;
    const getController = () => {
        if (controller) return controller;
        const runtime = EAS.Runtime.create({ id: 'minting', type: 'minting' });
        controller = createController({
            read: () => EAS.Storage.get(key()), write: (state) => EAS.Storage.set(key(), state), now: () => Date.now(),
            setTimer: (callback, delay) => runtime.setTimeout(callback, delay), cancelTimer: (id) => { clearTimeout(id); runtime.resources.timers.delete(id); },
            available: () => EAS.Adapters.Minting.available && Boolean(navigator.locks),
            blockedReason: () => EAS.Adapters.Minting.blockedReason || 'Navegador sem suporte ao lock exclusivo.',
            lock: (fn) => navigator.locks ? navigator.locks.request(key(), { ifAvailable: true }, (lock) => lock ? fn() : false) : Promise.reject(new Error('Lock exclusivo indisponível.')),
            discover, contains: async (groupId, villageId) => {
                try { return (await EAS.Data.Groups.ensureMembership(groupId, { forceRefresh: true })).includes(villageId); }
                catch { throw new Error('Falha ao verificar o grupo antes da cunhagem. Confirme a sessão do jogo.'); }
            },
            execute: (row, options) => EAS.Adapters.Minting.execute(row, options),
            diagnostic: (detail) => { if (EAS.Storage.get('minting.diagnostics', false)) console.debug('[EAS Cunhagem] parser', detail); },
            log: (level, message) => EAS.Log?.info?.('minting', 'cycle', { level, message })
        });
        return controller;
    };
    EAS.Minting = { intervalMs, configOf, planVillage, createController, discover, getController };
    const restore = () => { if (EAS.Storage.get(key())?.automation || EAS.Storage.get(key())?.status === 'RUNNING') getController().restore().catch(() => {}); };
    window.addEventListener('eas-tw-hub-ready', restore);
})();
