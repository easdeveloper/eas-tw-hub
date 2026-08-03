(() => {
    'use strict';
    EAS.Modules = EAS.Modules || {};
    EAS.Modules.Support = EAS.Modules.Support || {};

    const CONFIG_KEY = 'eas_tw_support_config';
    const PLANNER_KEY = 'eas_tw_support_planner';
    const UNITS = [
        ['spear', 'Lanceiros'], ['sword', 'Espadas'], ['archer', 'Arqueiros'],
        ['spy', 'Exploradores'], ['heavy', 'Pesadas'], ['light', 'Leves'],
        ['axe', 'Machados'], ['ram', 'Aríetes'], ['catapult', 'Catapultas'], ['snob', 'Nobres']
    ];
    const quantity = (value) => Math.max(0, Math.floor(Number(value) || 0));
    const read = (key, fallback = {}) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
    const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
    const extractDestinations = (value) => [...new Set(Array.from(String(value || '').matchAll(/(\d{1,3})\s*\|\s*(\d{1,3})/g), (match) => {
        const parsed = EAS.Utils.parseCoordinate(`${match[1]}|${match[2]}`);
        return parsed ? `${String(parsed.x).padStart(3, '0')}|${String(parsed.y).padStart(3, '0')}` : null;
    }).filter(Boolean))];
    const calculateSendableTroops = ({ troops = {}, reserveMode = 'fixed', fixedReserve = {}, reservePercent = 0 }) =>
        Object.fromEntries(Object.entries(troops).map(([unit, value]) => {
            const available = quantity(value);
            const reserve = reserveMode === 'percentage'
                ? Math.ceil(available * Math.min(100, Math.max(0, Number(reservePercent) || 0)) / 100)
                : quantity(fixedReserve[unit]);
            return [unit, Math.max(0, available - reserve)];
        }));

    const distributeSupportNeeds = ({ villages, destinations, needs, mode = 'balanced' }) => {
        const remainingByVillage = new Map(villages.map((item) => [Number(item.village.id), { ...item.sendable }]));
        const rows = new Map(); let cursor = 0;
        const add = (source, destination, unit, amount) => {
            if (!amount) return;
            const key = `${source.village.id}:${destination}`;
            if (!rows.has(key)) rows.set(key, { village: source.village, destination, troops: {} });
            rows.get(key).troops[unit] = quantity(rows.get(key).troops[unit]) + amount;
            remainingByVillage.get(Number(source.village.id))[unit] -= amount;
        };
        destinations.forEach((destination) => Object.entries(needs).forEach(([unit, requested]) => {
            let remaining = quantity(requested);
            const candidates = villages.filter((item) => quantity(remainingByVillage.get(Number(item.village.id))?.[unit]) > 0);
            if (mode === 'balanced' && candidates.length) {
                const total = candidates.reduce((sum, item) => sum + quantity(remainingByVillage.get(Number(item.village.id))[unit]), 0);
                candidates.forEach((item) => {
                    const available = quantity(remainingByVillage.get(Number(item.village.id))[unit]);
                    const allocated = Math.min(available, Math.floor(quantity(requested) * available / Math.max(1, total)), remaining);
                    add(item, destination, unit, allocated); remaining -= allocated;
                });
            }
            let attempts = 0;
            while (remaining > 0 && candidates.length && attempts < candidates.length * 2) {
                const item = candidates[cursor % candidates.length]; cursor += 1; attempts += 1;
                const available = quantity(remainingByVillage.get(Number(item.village.id))[unit]);
                if (!available) continue;
                const allocated = mode === 'round_robin'
                    ? Math.min(available, Math.max(1, Math.ceil(remaining / Math.max(1, candidates.length - attempts + 1))))
                    : Math.min(available, remaining);
                add(item, destination, unit, allocated); remaining -= allocated;
            }
        }));
        return { rows: [...rows.values()], remainingByVillage };
    };

    Object.assign(EAS.Modules.Support, { extractDestinations, calculateSendableTroops, distributeSupportNeeds });

    EAS.Modules.Support.open = () => {
        const config = read(CONFIG_KEY, {});
        const villages = EAS.Villages.list();
        const win = EAS.UI.createWindow({ id: 'eas-module-support', title: '🛡️ Planejador de Apoios', width: 980, className: 'support-planner-window' });
        const root = document.createElement('div'); root.className = 'support-planner';
        const destinationsInput = document.createElement('textarea'); destinationsInput.className = 'eas-input';
        destinationsInput.placeholder = '516|458\n517|470\n520|452'; destinationsInput.value = config.destinations || '';
        const destinationCount = document.createElement('small');
        const dateInput = EAS.UI.createInput({ value: config.arrivalDate || EAS.World.getServerDateTime().date || '', placeholder: 'DD/MM/AAAA' });
        const timeInput = EAS.UI.createInput({ value: config.arrivalTime || '08:00:00', placeholder: 'HH:MM:SS' });
        const needsInputs = {}; const reserveInputs = {};
        const needsGrid = document.createElement('div'); needsGrid.className = 'support-unit-grid';
        const reserveGrid = document.createElement('div'); reserveGrid.className = 'support-unit-grid';
        UNITS.forEach(([unit, label]) => {
            needsInputs[unit] = EAS.UI.createInput({ type: 'number', min: 0, value: config.needs?.[unit] || 0 });
            reserveInputs[unit] = EAS.UI.createInput({ type: 'number', min: 0, value: config.fixedReserve?.[unit] || 0 });
            needsGrid.appendChild(EAS.UI.createField({ label, input: needsInputs[unit] }));
            reserveGrid.appendChild(EAS.UI.createField({ label, input: reserveInputs[unit] }));
        });
        const reserveMode = document.createElement('select'); reserveMode.className = 'eas-input';
        reserveMode.innerHTML = '<option value="fixed">Quantidade fixa</option><option value="percentage">Porcentagem</option>'; reserveMode.value = config.reserveMode || 'fixed';
        const reservePercent = EAS.UI.createInput({ type: 'number', min: 0, max: 50, value: config.reservePercent || 10 });
        const distribution = document.createElement('select'); distribution.className = 'eas-input';
        distribution.innerHTML = '<option value="balanced">Equilibrada</option><option value="round_robin">Round Robin</option><option disabled>Priorizar aldeias mais próximas — Em desenvolvimento</option><option disabled>Priorizar aldeias maiores — Em desenvolvimento</option><option disabled>Priorizar aldeias menores — Em desenvolvimento</option>';
        distribution.value = config.distribution || 'balanced';
        const sourceList = document.createElement('div'); sourceList.className = 'support-source-list';
        const savedSources = new Set((config.selectedVillageIds || villages.map((village) => village.id)).map(Number));
        villages.forEach((village) => {
            const label = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.value = village.id; checkbox.checked = savedSources.has(Number(village.id));
            label.append(checkbox, document.createTextNode(`${village.name} — ${village.coordinate}`)); sourceList.appendChild(label);
        });
        const result = document.createElement('section'); result.className = 'support-analysis'; result.hidden = true;
        const status = document.createElement('div'); status.className = 'eas-status eas-status--info'; status.textContent = 'Configure a operação e clique em Analisar Apoios.';
        const actions = document.createElement('div'); actions.className = 'eas-actions';

        root.innerHTML = '<p>Distribua apoios reais entre aldeias. Nenhum comando será enviado automaticamente.</p><h3>Destino(s)</h3>';
        root.append(destinationsInput, destinationCount);
        const arrival = document.createElement('section'); arrival.innerHTML = '<h3>Horário de chegada</h3>';
        arrival.append(EAS.UI.createField({ label: 'Data chegada', input: dateInput }), EAS.UI.createField({ label: 'Hora chegada (com segundos)', input: timeInput })); root.appendChild(arrival);
        const needs = document.createElement('section'); needs.innerHTML = '<h3>Tropas necessárias por destino</h3>'; needs.appendChild(needsGrid); root.appendChild(needs);
        const reserve = document.createElement('section'); reserve.innerHTML = '<h3>Reserva mínima da origem</h3>'; reserve.append(EAS.UI.createField({ label: 'Tipo de reserva', input: reserveMode }), reserveGrid, EAS.UI.createField({ label: 'Porcentagem de reserva', input: reservePercent })); root.appendChild(reserve);
        const options = document.createElement('section'); options.innerHTML = '<h3>Distribuição e origens</h3>'; options.append(EAS.UI.createField({ label: 'Distribuição', input: distribution }), sourceList); root.append(options, result, actions, status); win.body.appendChild(root);

        const updateVisibility = () => { reserveGrid.hidden = reserveMode.value !== 'fixed'; reservePercent.closest('.eas-field').hidden = reserveMode.value !== 'percentage'; };
        const updateDestinationCount = () => { const count = extractDestinations(destinationsInput.value).length; destinationCount.textContent = `${count} destino${count === 1 ? '' : 's'} válido${count === 1 ? '' : 's'}.`; };
        updateVisibility(); updateDestinationCount(); reserveMode.addEventListener('change', updateVisibility); destinationsInput.addEventListener('input', updateDestinationCount);

        const getConfig = () => ({ destinations: destinationsInput.value, arrivalDate: dateInput.value, arrivalTime: timeInput.value,
            needs: Object.fromEntries(UNITS.map(([unit]) => [unit, quantity(needsInputs[unit].value)])), reserveMode: reserveMode.value,
            fixedReserve: Object.fromEntries(UNITS.map(([unit]) => [unit, quantity(reserveInputs[unit].value)])), reservePercent: Number(reservePercent.value) || 0,
            distribution: distribution.value, selectedVillageIds: [...sourceList.querySelectorAll('input:checked')].map((input) => Number(input.value)) });

        const analyze = async (forceRefresh = false) => {
            const current = getConfig(); const destinations = extractDestinations(current.destinations); const arrivalTime = EAS.Utils.createServerDateTime(current.arrivalDate, current.arrivalTime);
            if (!destinations.length || !arrivalTime || !Object.values(current.needs).some(Boolean)) {
                EAS.UI.showStatus({ target: status, message: 'Informe destinos, horário completo e ao menos uma tropa necessária.', type: 'error' }); return;
            }
            EAS.UI.showStatus({ target: status, message: 'Carregando cache e distribuindo apoios...', type: 'info' });
            try { await EAS.Troops.ensureLoaded({ forceRefresh }); } catch (error) { EAS.UI.showStatus({ target: status, message: error.message, type: 'error' }); return; }
            const troopsInfo = EAS.Troops.getSourceInfo();
            const sources = villages.filter((village) => current.selectedVillageIds.includes(Number(village.id))).map((village) => {
                const hasCache = EAS.Troops.hasVillageData(village.id); const troops = hasCache ? EAS.Troops.getVillageTroops(village.id) : {};
                return { village, troops, hasCache, sendable: calculateSendableTroops({ troops, reserveMode: current.reserveMode, fixedReserve: current.fixedReserve, reservePercent: current.reservePercent }) };
            }).filter((source) => source.hasCache);
            const allocation = distributeSupportNeeds({ villages: sources, destinations, needs: current.needs, mode: current.distribution });
            const now = EAS.World.getServerNowTimestamp() ?? Date.now(); const showJapan = localStorage.getItem('eas_tw_attack_timezone_japan') === 'true';
            const rows = allocation.rows.map((row, index) => {
                const distance = EAS.Utils.distance(row.village.coordinate, row.destination);
                const durationMs = EAS.Units.calculateTravelDuration({ distance, troops: row.troops, worldSpeed: EAS.World.getSpeed(), unitSpeed: EAS.World.getUnitSpeed() });
                const sendTime = arrivalTime.timestamp - durationMs;
                const commandValidation = EAS.CommandRules?.validateCommandComposition?.({ world: EAS.CommandRules.getWorld(), villageId: row.village.id, villageCoord: row.village.coordinate, commandType: 'support', troops: row.troops }) || { valid: true };
                const rowStatus = troopsInfo.stale ? 'Cache desatualizado' : !commandValidation.valid ? 'Composição inválida' : sendTime < now ? 'Atrasado' : 'Pronto';
                return { ...row, id: index, distance, durationMs, sendTime, arrivalTime: arrivalTime.timestamp, commandValidation, status: rowStatus, selected: rowStatus === 'Pronto' };
            });
            villages.filter((village) => current.selectedVillageIds.includes(Number(village.id)) && !EAS.Troops.hasVillageData(village.id)).forEach((village) => {
                rows.push({ id: rows.length, village, destination: destinations[0], troops: {}, distance: EAS.Utils.distance(village.coordinate, destinations[0]), durationMs: null, sendTime: null, arrivalTime: arrivalTime.timestamp, status: 'Sem cache', selected: false });
            });
            sources.filter((source) => !rows.some((row) => Number(row.village.id) === Number(source.village.id))).forEach((source) => {
                const relevantUnits = Object.keys(current.needs).filter((unit) => current.needs[unit] > 0);
                const hasRelevantTroops = relevantUnits.some((unit) => quantity(source.troops[unit]) > 0);
                const hasSendableTroops = relevantUnits.some((unit) => quantity(source.sendable[unit]) > 0);
                rows.push({ id: rows.length, village: source.village, destination: destinations[0], troops: {}, distance: EAS.Utils.distance(source.village.coordinate, destinations[0]), durationMs: null, sendTime: null, arrivalTime: arrivalTime.timestamp, status: hasRelevantTroops && !hasSendableTroops ? 'Reserva insuficiente' : 'Sem tropas', selected: false });
            });
            const formatDate = (timestamp) => { if (!Number.isFinite(timestamp)) return '-'; const server = EAS.Utils.formatDateTime(timestamp); if (!showJapan) return `<strong>${server}</strong>`; const japan = EAS.Utils.serverTimeToJapan(server); return `<strong>${server}</strong><div class="attack-send-time-japan">(${japan} Japão)</div>`; };
            const troopText = (troops) => Object.entries(troops).filter(([, amount]) => amount > 0).map(([unit, amount]) => `${amount} ${UNITS.find(([id]) => id === unit)?.[1] || unit}`).join(', ');
            const remainingTroops = (row) => {
                const source = sources.find((item) => Number(item.village.id) === Number(row.village.id));
                if (!source) return {};
                const unusedSendable = allocation.remainingByVillage.get(Number(row.village.id)) || {};
                return Object.fromEntries(Object.entries(source.troops).map(([unit, available]) => [unit, quantity(available) - (quantity(source.sendable[unit]) - quantity(unusedSendable[unit]))]));
            };
            result.hidden = false; result.innerHTML = `<h3>Resultado da análise</h3><p>${rows.filter((row) => Object.values(row.troops).some(Boolean)).length} combinações distribuídas. ${sources.length} origens com cache.</p><div class="eas-table-wrapper"><table class="eas-table"><thead><tr><th>Selecionar</th><th>Origem</th><th>Destino</th><th>Distância</th><th>Tropas enviadas</th><th>Reserva restante</th><th>Envio</th><th>Chegada</th><th>Status</th><th>Ação</th></tr></thead><tbody>${rows.map((row) => `<tr><td><input type="checkbox" data-support-row="${row.id}" ${row.selected ? 'checked' : ''} ${row.status !== 'Pronto' ? 'disabled' : ''}></td><td>${EAS.Utils.escapeHtml(row.village.name)}<br>${row.village.coordinate}</td><td>${row.destination}</td><td>${EAS.Utils.formatNumber(row.distance, 2, 2)}</td><td>${EAS.Utils.escapeHtml(troopText(row.troops) || '-')}</td><td>${EAS.Utils.escapeHtml(troopText(remainingTroops(row)) || '-')}</td><td>${formatDate(row.sendTime)}</td><td>${formatDate(row.arrivalTime)}</td><td>${row.status}</td><td><button type="button" data-support-open="${row.id}" ${row.status !== 'Pronto' ? 'disabled' : ''}>Abrir Praça</button></td></tr>`).join('')}</tbody></table></div><div class="eas-actions"><button type="button" data-support-prepare>Preparar operação de Apoio</button></div>`;
            result.querySelectorAll('[data-support-row]').forEach((input) => input.addEventListener('change', () => { rows[Number(input.dataset.supportRow)].selected = input.checked; }));
            const start = (queue) => EAS.SupportExecution.start({ commandType: 'support', queue, currentIndex: 0, completed: [], skipped: [], errors: [], createdAt: Date.now() });
            result.querySelectorAll('[data-support-open]').forEach((button) => button.addEventListener('click', () => start([{ ...rows[Number(button.dataset.supportOpen)], sourceVillageId: rows[Number(button.dataset.supportOpen)].village.id, villageId: rows[Number(button.dataset.supportOpen)].village.id, villageName: rows[Number(button.dataset.supportOpen)].village.name, villageCoord: rows[Number(button.dataset.supportOpen)].village.coordinate, target: rows[Number(button.dataset.supportOpen)].destination, status: 'pending' }])));
            result.querySelector('[data-support-prepare]').addEventListener('click', () => { const queue = rows.filter((row) => row.selected).map((row) => ({ ...row, sourceVillageId: row.village.id, villageId: row.village.id, villageName: row.village.name, villageCoord: row.village.coordinate, target: row.destination, status: 'pending' })); write(PLANNER_KEY, { config: current, queue, analyzedAt: Date.now() }); if (queue.length) start(queue); });
            write(CONFIG_KEY, current); EAS.UI.showStatus({ target: status, message: rows.length ? 'Análise concluída. Nenhum apoio foi enviado.' : 'Necessidade não pôde ser distribuída com as tropas e reservas disponíveis.', type: rows.length ? 'success' : 'error' });
        };

        actions.append(EAS.UI.createButton({ text: 'Analisar Apoios', onClick: () => analyze(false) }), EAS.UI.createButton({ text: 'Atualizar tropas', className: 'eas-button--secondary', onClick: () => analyze(true) }), EAS.UI.createButton({ text: 'Salvar configuração', className: 'eas-button--secondary', onClick: () => { write(CONFIG_KEY, getConfig()); EAS.UI.showStatus({ target: status, message: 'Configuração salva.', type: 'success' }); } }), EAS.UI.createButton({ text: 'Voltar ao menu', className: 'eas-button--secondary', onClick: () => { win.close(); EAS.UI.openMainWindow(); } }));
    };
})();
