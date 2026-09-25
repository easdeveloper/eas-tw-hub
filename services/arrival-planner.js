(() => {
    'use strict';
    if (EAS.ArrivalPlanner) return;
    const MODES = ['arrival_attack', 'arrival_support', 'snipe_support'];
    const EXCLUDED = new Set(['ram', 'catapult', 'snob']);
    const cache = new Map();
    let active = null;
    const log = (event, data = {}) => { try { EAS.Logger?.info?.('ARRIVAL', event, data); } catch {} };
    const clock = () => EAS.MassSnipeExecution.getCurrentServerTimeMs();
    const format = value => EAS.MassSnipeExecution.formatDateTime(value);
    const legacyTime = value => { const d = new Date(value); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()).getTime(); };
    const id = value => /^\d+$/.test(String(value || '')) ? String(value) : null;
    const coord = value => EAS.Utils.parseCoordinate(String(value || ''))?.coordinate || null;
    const duration = value => {
        const match = /^(\d+):(\d{2}):(\d{2})$/.exec(String(value));
        if (!match || +match[2] > 59 || +match[3] > 59) throw new Error('Duração map_info inválida.');
        const ms = (+match[1] * 3600 + +match[2] * 60 + +match[3]) * 1000;
        if (!Number.isSafeInteger(ms) || ms <= 0) throw new Error('Duração indisponível.');
        return ms;
    };
    const parseMapInfo = (data, target) => {
        if (id(data?.id) !== target.id || !data.units || typeof data.units !== 'object') throw new Error('map_info: destino/resposta divergente.');
        const xy = Number(data.xy), returnedCoord = `${Math.floor(xy / 1000)}|${xy % 1000}`;
        if (!Number.isInteger(xy) || coord(returnedCoord) !== target.coords) throw new Error('map_info: coordenada divergente.');
        const times = Object.fromEntries(Object.entries(data.units).map(([unit, item]) => {
            if (item.id && item.id !== unit) throw new Error('map_info: unidade divergente.');
            return [unit, duration(item.time)];
        }));
        if (!Object.keys(times).length) throw new Error('map_info sem unidades.');
        return times;
    };
    const aborted = signal => { if (signal?.aborted) throw new DOMException('Coleta cancelada.', 'AbortError'); };
    const wait = (ms, signal) => new Promise((resolve, reject) => {
        aborted(signal);
        const finish = () => { signal?.removeEventListener('abort', cancel); resolve(); };
        const timer = setTimeout(finish, ms);
        const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(new DOMException('Coleta cancelada.', 'AbortError')); };
        signal?.addEventListener('abort', cancel, { once: true });
    });
    const mapInfo = async (source, target, signal) => {
        aborted(signal);
        const key = `${location.host}:${window.game_data?.player?.id}:${source}:${target.id}:${target.coords}`;
        if (cache.has(key)) { log('MAP_INFO_CACHE_HIT', { sourceVillageId: source, targetVillageId: target.id }); return cache.get(key); }
        if (window.EASRateLimit?.check()) throw new Error('RATE_LIMITED');
        const url = new URL('game.php', location.href);
        url.searchParams.set('screen', 'map'); url.searchParams.set('ajax', 'map_info');
        url.searchParams.set('source', source); url.searchParams.set('target', target.id);
        const response = await fetch(url, { credentials: 'same-origin', signal });
        if (response.status === 429) { window.EASRateLimit?.reportStatus?.(429); log('RATE_LIMITED', { sourceVillageId: source }); throw new Error('RATE_LIMITED'); }
        if (!response.ok) throw new Error(`map_info HTTP ${response.status}`);
        const times = parseMapInfo(await response.json(), target);
        aborted(signal); cache.set(key, times);
        log('MAP_INFO_RESULT', { sourceVillageId: source, targetVillageId: target.id, times }); return times;
    };
    const candidateUnits = ({ mode, available, times, units, arrival, now }) => Object.fromEntries(units.filter(unit =>
        !(mode === 'snipe_support' && EXCLUDED.has(unit)) && Number(available[unit]) > 0 &&
        Number.isFinite(times[unit]) && arrival - times[unit] > now
    ).map(unit => [unit, { available: Number(available[unit]), travelTimeMs: times[unit], sendAtMs: arrival - times[unit] }]));
    const search = async ({ mode, target, arrival, signal, onCandidate = () => {} }) => {
        if (!MODES.includes(mode) || !Number.isSafeInteger(arrival) || arrival <= clock()) throw new Error('Chegada inválida ou passada.');
        aborted(signal);
        // Explicit search uses the shared data cache. No overview scan is started
        // here: refresh is a separate explicit user action in the Hub Data UI.
        const troops = EAS.Data.Troops.getAll(), units = EAS.Data.Troops.getUnits();
        const villages = EAS.Data.Villages.getAll().filter(v => id(v.id) && troops[v.id]);
        if (!villages.length) throw new Error('Atualize as tropas e aldeias no Hub antes de procurar.');
        const results = [];
        log('MAP_INFO_QUEUE_STARTED', { count: villages.length, concurrency: 1, targetVillageId: target.id });
        for (const village of villages) {
            aborted(signal);
            const available = troops[village.id].ownHome || {};
            if (!units.some(unit => available[unit] > 0 && !(mode === 'snipe_support' && EXCLUDED.has(unit)))) continue;
            try {
                const times = await mapInfo(String(village.id), target, signal);
                const candidates = candidateUnits({ mode, available, times, units, arrival, now: clock() });
                log(Object.keys(candidates).length ? 'CANDIDATE_FOUND' : 'CANDIDATE_REJECTED', { sourceVillageId: String(village.id), units: Object.keys(candidates) });
                if (Object.keys(candidates).length) { const result = { village, times, units: candidates }; results.push(result); onCandidate(result); }
            } catch (error) {
                log('MAP_INFO_FAILED', { sourceVillageId: String(village.id), reason: error.message });
                if (error.name === 'AbortError' || /RATE_LIMITED/.test(error.message)) throw error;
            }
            await wait(150, signal);
        }
        return results;
    };
    const composition = ({ mode, troops, available, times, units, arrival, now = clock() }) => {
        if (!MODES.includes(mode)) throw new Error('Modo inválido.');
        const selected = Object.entries(troops).filter(([, count]) => Number(count) !== 0);
        if (!selected.length) throw new Error('Selecione tropas.');
        for (const [unit, count] of selected) {
            if (!units.includes(unit) || !Number.isSafeInteger(count) || count < 1 || count > Number(available[unit] || 0) ||
                !Number.isFinite(times[unit]) || (mode === 'snipe_support' && EXCLUDED.has(unit))) throw new Error(`Composição inválida: ${unit}.`);
        }
        const travelTimeMs = Math.max(...selected.map(([unit]) => times[unit]));
        const sendAtMs = arrival - travelTimeMs;
        if (!Number.isSafeInteger(arrival) || sendAtMs <= now) throw new Error('A composição já não consegue chegar no horário.');
        return { travelTimeMs, sendAtMs, commandType: mode === 'arrival_attack' ? 'attack' : 'support' };
    };
    const readPageTarget = (doc = document, href = location.href) => {
        const url = new URL(href), targetId = id(url.searchParams.get('id'));
        if (url.searchParams.get('screen') !== 'info_village') return { reason: 'NOT_INFO_VILLAGE' };
        if (!targetId) return { reason: 'TARGET_ID_MISSING' };
        // The reported native village URL identifies the viewed village with
        // id=9113#524;438. #village_info is an optional layout, not a mount gate.
        const hash = /^#(\d{1,3});(\d{1,3})$/.exec(url.hash);
        const hashCoord = hash ? `${Number(hash[1])}|${Number(hash[2])}` : null;
        const table = doc.querySelector('#village_info');
        const values = [...(table?.querySelectorAll('td') || [])].map(td => coord(td.textContent.trim())).filter(Boolean);
        const unique = [...new Set(values)];
        if (unique.length > 1) return { reason: 'TARGET_COORDINATES_AMBIGUOUS' };
        if (hashCoord && unique.length && hashCoord !== unique[0]) return { reason: 'TARGET_URL_DOM_MISMATCH' };
        const coordinates = hashCoord || unique[0];
        if (!coordinates) return { reason: 'TARGET_COORDINATES_UNAVAILABLE' };
        return { source: hashCoord ? 'info-village-url' : 'village-info-table', target: { id: targetId, coords: coordinates,
            name: (table?.querySelector('h2, .village-name') || doc.querySelector('#content_value h2'))?.textContent.trim() || coordinates } };
    };
    const resolveTarget = (doc = document, href = location.href) => readPageTarget(doc, href).target || null;
    const parseIncoming = row => {
        const marker = row.querySelector('.command_hover_details[data-command-type="attack"]');
        if (!marker) return null;
        const commandId = id(marker.dataset.commandId || row.querySelector('.quickedit-out[data-id]')?.dataset.id);
        const quickId = row.querySelector('.quickedit-out[data-id]')?.dataset.id;
        if (!commandId || (quickId && quickId !== commandId)) return null;
        // Whitespace between the seconds separator and the nested millisecond span.
        const cells = [...row.cells].map(cell => cell.textContent.replace(/\s+/g, ' ').replace(/(\d{2}:\d{2}:\d{2})[:.]\s*(\d{3})/, '$1:$2'));
        const value = cells.find(text => /\d{2}:\d{2}:\d{2}:\d{3}/.test(text));
        if (!value) return null;
        const formatted = EAS.MassSnipeExecution.parseArrival(value);
        const enemyArrivalMs = +EAS.MassSnipeExecution.getLandingTime(formatted);
        log('INCOMING_PARSED', { enemyCommandId: commandId, enemyArrivalMs });
        return { enemyCommandId: commandId, enemyArrivalMs };
    };
    const createMission = ({ mode, target, candidate, troops, arrival, incoming = null, offset = 0 }) => {
        if (mode === 'snipe_support' && (!incoming || arrival !== incoming.enemyArrivalMs + offset || !Number.isSafeInteger(offset))) throw new Error('Ataque/offset divergente.');
        const available = EAS.Data.Troops.getById(candidate.village.id)?.ownHome || {};
        const calculated = composition({ mode, troops, available, times: candidate.times, units: EAS.Data.Troops.getUnits(), arrival });
        log('COMPOSITION_SELECTED', { sourceVillageId: String(candidate.village.id), troops });
        log('TRAVEL_TIME_RESOLVED', { travelTimeMs: calculated.travelTimeMs });
        log('SEND_AT_CALCULATED', { sendAtMs: calculated.sendAtMs, desiredArrivalMs: arrival });
        if (window.EASRateLimit?.check()) throw new Error('RATE_LIMITED');
        const mission = EAS.MissionScheduler.createMission({ sourceModule: 'arrival-planner', mode, type: calculated.commandType,
            commandType: calculated.commandType, operationType: calculated.commandType, troopMode: 'custom',
            villageId: String(candidate.village.id), sourceVillageId: String(candidate.village.id), villageName: candidate.village.name,
            villageCoord: candidate.village.coordinate || candidate.village.coord, targetVillageId: target.id, targetCoord: target.coords,
            troops: { ...troops }, preparedTroops: { ...troops }, expectedTroopsSnapshot: { ...troops },
            ...calculated, desiredArrivalMs: arrival, sendTime: legacyTime(calculated.sendAtMs), sendTimestamp: legacyTime(calculated.sendAtMs),
            arrivalTime: legacyTime(arrival), arrivalTimestamp: legacyTime(arrival), ...incoming, snipeOffsetMs: mode === 'snipe_support' ? offset : null,
            attemptId: crypto.randomUUID(), arrivalAuthorized: true, status: 'waiting' });
        if (!mission.id) throw new Error('Já existe uma missão equivalente.');
        const restored = EAS.MissionScheduler.load().missions.find(item => item.id === mission.id);
        if (!restored || restored.attemptId !== mission.attemptId || restored.sendAtMs !== mission.sendAtMs) throw new Error('Persistência da missão não comprovada.');
        log('MISSION_CREATED', { missionId: mission.id, attemptId: mission.attemptId, ...calculated });
        return restored;
    };
    const open = (mode, target, incoming = null) => {
        active?.close();
        log('ARRIVAL_PLANNER_OPEN', { mode, targetVillageId: target.id });
        if (incoming) log('SNIP_SELECTED', incoming);
        const win = EAS.UI.createWindow({ id: 'eas-arrival-planner', title: mode === 'snipe_support' ? 'EAS — SNIP (apoio)' : `EAS — ${mode === 'arrival_attack' ? 'Ataque' : 'Apoio'} por chegada`, icon: '⏱️', width: 760 });
        let controller = null, closed = false, selected = null, desired = null, scheduled = false;
        const originalClose = win.close.bind(win);
        const close = () => { if (closed) return; closed = true; controller?.abort(); originalClose(); if (active?.close === close) active = null; };
        win.close = close; active = { close };
        const esc = EAS.Utils.escapeHtml;
        win.body.innerHTML = `<p>Alvo: <strong>${esc(target.name)} (${esc(target.coords)})</strong></p>
          <p>Horários do servidor. Mantenha a aba de confirmação aberta. Precisão depende do navegador e da rede.</p>
          ${incoming ? `<p>Ataque ${esc(incoming.enemyCommandId)}: ${format(incoming.enemyArrivalMs)}</p><label>Offset (ms) <input data-offset type="number" step="1" value="200"></label>` : '<label>Chegada (DD/MM/YYYY HH:MM:SS:SSS) <input class="eas-input" data-arrival placeholder="25/09/2026 12:00:00:000"></label>'}
          <p data-desired></p><button class="btn" data-search>PROCURAR ALDEIAS</button> <button class="btn" data-close>Cancelar</button>
          <p data-status></p><div data-candidates></div><div data-composition></div>`;
        const q = s => win.body.querySelector(s), status = message => { q('[data-status]').textContent = message; };
        const arrivalValue = () => incoming ? incoming.enemyArrivalMs + Number(q('[data-offset]').value) : +EAS.MassSnipeExecution.getLandingTime(q('[data-arrival]').value.trim().replace(/\.(\d{3})$/, ':$1'));
        const changed = () => { controller?.abort(); selected = null; q('[data-candidates]').replaceChildren(); q('[data-composition]').replaceChildren(); try { desired = arrivalValue(); q('[data-desired]').textContent = `Chegada desejada: ${format(desired)}`; } catch { desired = null; } };
        (q('[data-offset]') || q('[data-arrival]')).addEventListener('input', changed);
        q('[data-close]').onclick = close;
        // UI's title close button uses its own closure; listen as well to abort
        // requests even when the window is removed through that native control.
        win.element?.querySelector?.('[data-eas-action="close"]')?.addEventListener('click', close);
        const showComposition = candidate => {
            selected = candidate;
            const panel = q('[data-composition]');
            panel.innerHTML = `<h3>${esc(candidate.village.name || String(candidate.village.id))}</h3>` + Object.entries(candidate.units).map(([unit, item]) =>
                `<label>${esc(unit)} — ${item.available} disponíveis · ${EAS.MassSnipeExecution.formatDurationMs(item.travelTimeMs)} · envio ${format(item.sendAtMs)} <input data-unit="${esc(unit)}" type="number" min="0" max="${item.available}" step="1" value="0"></label><br>`).join('') + '<p data-review></p><button class="btn" data-schedule>Agendar e preparar</button>';
            const selectedTroops = () => Object.fromEntries([...panel.querySelectorAll('[data-unit]')].map(input => [input.dataset.unit, Number(input.value)]));
            const review = () => { try {
                const result = composition({ mode, troops: selectedTroops(), available: EAS.Data.Troops.getById(candidate.village.id)?.ownHome || {}, times: candidate.times, units: EAS.Data.Troops.getUnits(), arrival: arrivalValue() });
                panel.querySelector('[data-review]').textContent = `Envio: ${format(result.sendAtMs)} · duração ${EAS.MassSnipeExecution.formatDurationMs(result.travelTimeMs)}`;
                panel.querySelector('[data-schedule]').disabled = false;
            } catch (error) { panel.querySelector('[data-review]').textContent = error.message; panel.querySelector('[data-schedule]').disabled = true; } };
            panel.addEventListener('input', review); review();
            panel.querySelector('[data-schedule]').onclick = () => { if (scheduled || closed || selected !== candidate) return; try {
                const mission = createMission({ mode, target, candidate, troops: selectedTroops(), arrival: arrivalValue(), incoming, offset: incoming ? Number(q('[data-offset]').value) : 0 });
                scheduled = true; log('MISSION_PREPARE_STARTED', { missionId: mission.id });
                EAS.ScheduledMissionExecution.openAndPrepare(mission); close();
            } catch (error) { status(error.message); } };
        };
        q('[data-search]').onclick = async () => {
            if (controller && !controller.signal.aborted) return;
            changed(); controller = new AbortController(); const thisController = controller;
            q('[data-search]').disabled = true; status('Consultando origens sequencialmente…');
            try {
                const results = await search({ mode, target, arrival: arrivalValue(), signal: thisController.signal, onCandidate: candidate => {
                    if (closed || thisController.signal.aborted) return;
                    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn';
                    button.textContent = `${candidate.village.name || candidate.village.id} (${candidate.village.coordinate || candidate.village.coord || ''}) — ${Object.keys(candidate.units).join(', ')}`;
                    button.onclick = () => showComposition(candidate); q('[data-candidates]').append(button, document.createElement('br'));
                } }); if (!closed) status(`Aldeias capazes: ${results.length}. Escolha uma origem e depois as tropas.`);
            } catch (error) { if (!closed) status(error.message); }
            finally { if (controller === thisController) { controller = null; if (!closed) q('[data-search]').disabled = false; } }
        };
        if (incoming) changed();
        return { close, win };
    };
    const PAGE_RUNTIME = 'arrival-page';
    const ownedNode = node => {
        const element = node.nodeType === 1 ? node : node.parentElement;
        return Boolean(element?.closest?.('#eas-arrival-actions, [data-eas-snip]'));
    };
    const disposePage = () => EAS.Runtime?.dispose?.(PAGE_RUNTIME);
    const mountPage = () => {
        const screen = new URL(location.href).searchParams.get('screen');
        const rows = [...document.querySelectorAll('tr.command-row')];
        const attackRows = rows.filter(row => row.querySelector('.command_hover_details[data-command-type="attack"]'));
        const details = { screen, targetVillageId: id(new URL(location.href).searchParams.get('id')),
            commandRows: rows.length, attackRows: attackRows.length, snipeButtonsInserted: 0 };
        log('ARRIVAL_PAGE_DETECTED', details);
        const info = readPageTarget(), target = info.target;
        const anchor = document.querySelector('#village_info') || document.querySelector('#content_value');
        if (!target || !anchor) {
            document.getElementById('eas-arrival-actions')?.remove();
            document.querySelectorAll('[data-eas-snip]').forEach(button => button.remove());
            log('ARRIVAL_PAGE_MOUNT_REFUSED', { ...details, reason: info.reason || 'PAGE_CONTAINER_MISSING' });
            return false;
        }
        log('ARRIVAL_PAGE_MOUNT_STARTED', { ...details, targetSource: info.source });
        log('TARGET_RESOLVED', target);
        if (!document.getElementById('eas-arrival-actions')) {
            const panel = document.createElement('div'); panel.id = 'eas-arrival-actions'; panel.className = 'eas-actions'; panel.textContent = 'EAS ';
            [['⚔ ATAQUE', 'arrival_attack'], ['🛡 APOIO', 'arrival_support']].forEach(([label, mode]) => {
                const button = document.createElement('button'); button.type = 'button'; button.className = 'btn'; button.textContent = label;
                button.onclick = () => { const current = resolveTarget(); if (current) open(mode, current); }; panel.append(button);
            });
            if (anchor.id === 'village_info') anchor.after(panel); else anchor.prepend(panel);
        }
        for (const row of rows) {
            const marker = row.querySelector('.command_hover_details[data-command-type="attack"]');
            const existing = [...row.querySelectorAll('[data-eas-snip]')];
            if (!marker) { existing.forEach(button => button.remove()); continue; }
            const commandId = id(marker.dataset.commandId || row.querySelector('.quickedit-out[data-id]')?.dataset.id);
            let incoming = null;
            try { incoming = parseIncoming(row); } catch (error) { log('INCOMING_UNREADABLE', { commandId, reason: error.message }); }
            let button = existing.shift(); existing.forEach(extra => extra.remove());
            if (!button) {
                button = document.createElement('button'); button.type = 'button'; button.className = 'btn'; button.textContent = 'SNIP';
                (row.cells[row.cells.length - 1] || row).append(button); details.snipeButtonsInserted++;
            }
            if (button.dataset.easSnip !== (commandId || '')) button.dataset.easSnip = commandId || '';
            button.disabled = !incoming;
            button.title = incoming ? '' : 'Identidade ou chegada do ataque indisponível.';
            if (!incoming) log('ARRIVAL_SNIP_UNAVAILABLE', { commandId, reason: 'INCOMING_UNREADABLE' });
            button.onclick = () => { const current = resolveTarget(); try { const fresh = parseIncoming(row); if (current && fresh) open('snipe_support', current, fresh); } catch (error) { log('INCOMING_UNREADABLE', { commandId, reason: error.message }); } };
        }
        log('ARRIVAL_PAGE_MOUNTED', { ...details, targetSource: info.source });
        return true;
    };
    const initialize = () => {
        if (new URL(location.href).searchParams.get('screen') !== 'info_village') { disposePage(); return false; }
        const runtime = EAS.Runtime?.create?.({ id: PAGE_RUNTIME, type: 'page-integration' });
        if (document.readyState === 'loading' && !document.querySelector('#content_value, #village_info')) {
            if (runtime && !runtime.arrivalReadyListener) { runtime.arrivalReadyListener = true; runtime.listen(document, 'DOMContentLoaded', initialize, { once: true }); }
            else if (!runtime) document.addEventListener('DOMContentLoaded', initialize, { once: true });
            return false;
        }
        const result = mountPage();
        // The page content owns the command table, including replacement of the
        // table itself. Never observe document/body or native countdown updates.
        const container = document.querySelector('#content_value, #commands_incomings, #village_info');
        if (runtime && container && runtime.arrivalContainer !== container) {
            runtime.arrivalObserver?.disconnect();
            if (runtime.arrivalObserver) runtime.resources.observers.delete(runtime.arrivalObserver);
            const schedule = () => {
                if (runtime.arrivalMountPending) return;
                runtime.arrivalMountPending = true;
                runtime.setTimeout(() => { runtime.arrivalMountPending = false; initialize(); }, 50);
            };
            const observer = new MutationObserver(records => {
                const relevant = records.some(record => {
                    if (ownedNode(record.target) || record.target.parentElement?.closest('[data-endtime]') || record.target.closest?.('[data-endtime]')) return false;
                    if (record.type === 'attributes') return true;
                    const nodes = [...(record.addedNodes || []), ...(record.removedNodes || [])];
                    if (nodes.length && nodes.every(ownedNode)) return false;
                    const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
                    return Boolean(element?.closest('tr.command-row, #village_info') || nodes.some(node => node.nodeType === 1 &&
                        (node.matches('table, tbody, tr.command-row, #commands_incomings, #village_info') || node.querySelector('tr.command-row, #village_info'))));
                });
                if (relevant) schedule();
            });
            observer.observe(container, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-command-type', 'data-command-id', 'data-id'] });
            runtime.observe(observer); runtime.arrivalObserver = observer; runtime.arrivalContainer = container;
            if (!runtime.arrivalPageListeners) { runtime.arrivalPageListeners = true; runtime.listen(window, 'pagehide', disposePage); runtime.listen(window, 'hashchange', schedule); runtime.listen(window, 'popstate', schedule); }
        }
        return result;
    };
    EAS.ArrivalPlanner = { MODES, log, clock, format, legacyTime, duration, parseMapInfo, mapInfo, candidateUnits, search, composition, resolveTarget, parseIncoming, createMission, open, initialize, disposePage, close: () => active?.close() };
})();
