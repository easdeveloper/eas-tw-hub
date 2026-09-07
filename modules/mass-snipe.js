// Mass Snipe by RedAlert (https://twscripts.dev/), integrated with EAS TW Hub.
(() => {
    'use strict';
    EAS.Modules ||= {};
    const PANEL_ID = 'eas-mass-snipe';
    const UI_RUNTIME_ID = 'mass-snipe-ui';
    const DEFAULT_UNITS = ['spear', 'sword', 'archer', 'heavy'];
    let opening = null;
    let closeActive = null;
    const settingsKey = () => `mass-snipe.settings.${EAS.World.getWorldName()}.${EAS.World.getPlayer().id}`;

    const openPanel = async () => {
        if (!EAS.MassSnipeExecution) await EASLoader.loadScript('services/mass-snipe-execution.js');
        closeActive?.();
        const service = EAS.MassSnipeExecution;
        const escape = EAS.Utils.escapeHtml;
        const saved = EAS.Storage.get(settingsKey(), {});
        const data = EAS.World.getGameData();
        const units = (Array.isArray(data.units) ? data.units : Object.keys(data.units || {})).filter((unit) => !['spy', 'militia'].includes(unit));
        const win = EAS.UI.createWindow({ id: PANEL_ID, title: 'Mass Snipe', icon: '🎯', width: 1100 });
        const runtime = EAS.Runtime.create({ id: UI_RUNTIME_ID, type: 'mass-snipe-ui' });
        let closed = false;
        let snipes = saved.snipes || [];
        let calculating = false;
        const dispose = () => {
            if (closed) return;
            closed = true;
            service.stopCountdown();
            EAS.Runtime.dispose(UI_RUNTIME_ID);
            document.querySelectorAll('[data-eas-mass-snipe-selected]').forEach((row) => row.removeAttribute('data-eas-mass-snipe-selected'));
            win.close();
            closeActive = null;
        };
        closeActive = dispose;
        runtime.observe(new MutationObserver(() => { if (!win.element.isConnected) dispose(); }))
            .observe(document.body, { childList: true, subtree: true });
        win.body.innerHTML = `
            <style>
                #${PANEL_ID} .mass-snipe-units { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:16px; }
                #${PANEL_ID} .mass-snipe-units label { display:flex; align-items:center; gap:4px; }
                #${PANEL_ID} .eas-table input { box-sizing:border-box; min-width:70px; width:100%; }
                #${PANEL_ID} input[name="landing_time"] { min-width:235px; }
                #${PANEL_ID} .mass-snipe-time { white-space:nowrap; font-variant-numeric:tabular-nums; }
                #${PANEL_ID} textarea { box-sizing:border-box; width:100%; min-height:120px; }
                #${PANEL_ID} [hidden] { display:none !important; }
                [data-eas-mass-snipe-selected] td { background-color:#ffe563 !important; }
            </style>
            <div class="mass-snipe-units">${units.map((unit) => `<label><input type="checkbox" name="unit" value="${escape(unit)}" ${(saved.selectedUnits || DEFAULT_UNITS).includes(unit) ? 'checked' : ''}><img src="/graphic/unit/unit_${escape(unit)}.webp" alt="${escape(unit)}" title="${escape(unit)}"></label>`).join('')}</div>
            <div class="eas-table-wrapper"><table class="eas-table"><thead><tr><th>Aldeia</th><th>Hora de chegada</th><th>Aflição</th><th>Quantidade mín.</th><th>Ação</th></tr></thead><tbody data-needed></tbody></table></div>
            <div class="eas-actions">
                <button class="eas-button" data-add>Add novo snip</button>
                <button class="eas-button" data-calculate>Calcular tempos</button>
                <button class="eas-button" data-import>Import. em massa</button>
                <button class="eas-button" data-export>Exportar como Código BB</button>
                <button class="eas-button eas-button--secondary" data-refresh>Atualizar dados</button>
                <button class="eas-button eas-button--secondary" data-reset>Redefinir script</button>
                <button class="eas-button eas-button--secondary" data-back>Voltar ao menu</button>
            </div>
            <div data-import-panel hidden><label>Cole aqui o texto de um tópico do fórum<textarea data-import-text></textarea></label><button class="eas-button" data-import-execute>Import. em massa</button></div>
            <div data-status role="status"></div>
            <div data-results hidden><p><span data-count>0</span> combinações encontradas</p><div class="eas-table-wrapper" data-combinations></div></div>`;
        const find = (selector) => win.body.querySelector(selector);
        const status = (message, type = 'info') => EAS.UI.showStatus({ target: find('[data-status]'), message, type });
        const collect = () => ({
            selectedUnits: [...win.body.querySelectorAll('[name="unit"]:checked')].map((input) => input.value),
            snipesNeeded: [...find('[data-needed]').rows].map((row) => ({
                coord: row.querySelector('[name="village_coord"]').value.trim(),
                landingTime: row.querySelector('[name="landing_time"]').value.trim(),
                sigil: parseInt(row.querySelector('[name="sigil"]').value, 10),
                minAmount: parseInt(row.querySelector('[name="min_amount"]').value, 10)
            }))
        });
        const persist = () => EAS.Storage.set(settingsKey(), { ...collect(), snipes });
        const addRow = ({ coord = '', landingTime = '', sigil = 0, minAmount = 50 } = {}, checkDuplicate = true) => {
            if (checkDuplicate && collect().snipesNeeded.some((snipe) => snipe.coord === coord && snipe.landingTime === landingTime)) { status('Já existe!'); return; }
            const row = find('[data-needed]').insertRow();
            row.innerHTML = `<td><input class="eas-input" name="village_coord" aria-label="Aldeia" value="${escape(coord)}"></td>
                <td><input class="eas-input" name="landing_time" aria-label="Hora de chegada" placeholder="DD/MM/YYYY HH:MM:SS:mmm" value="${escape(landingTime)}"></td>
                <td><input class="eas-input" name="sigil" aria-label="Aflição" value="${escape(sigil)}"></td>
                <td><input class="eas-input" name="min_amount" aria-label="Quantidade mín." value="${escape(minAmount)}"></td>
                <td><button class="eas-button eas-button--secondary" data-remove aria-label="Remover snip">×</button></td>`;
        };
        const defaultRow = () => ({ coord: EAS.World.getCurrentVillage().coordinate || '', landingTime: service.formatDateTime(service.getCurrentServerTimeMs()) });
        (saved.snipesNeeded || [defaultRow()]).forEach((snipe) => addRow(snipe, false));
        const villageLink = (id, coordinate) => {
            if (!id) return escape(coordinate);
            const url = new URL('/game.php', location.origin);
            url.searchParams.set('screen', 'info_village'); url.searchParams.set('id', id);
            if (data.player?.sitter > 0) url.searchParams.set('t', data.player.id);
            return `<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${escape(coordinate)}</a>`;
        };
        const renderResults = (mapVillages) => {
            service.stopCountdown();
            const normalizeCoord = (coord) => coord.split('|').map(Number).join('|');
            const targets = new Map(mapVillages.map((village) => [normalizeCoord(village.coordinate), village.id]));
            const now = service.getCurrentServerTimeMs();
            find('[data-results]').hidden = !snipes.length;
            find('[data-count]').textContent = snipes.length;
            find('[data-combinations]').innerHTML = snipes.length ? `<table class="eas-table"><thead><tr><th>#</th><th>Origem</th><th>Destino</th><th>Unidade</th><th>Distância</th><th>Hora de saída</th><th>Enviar em</th><th>Enviar</th></tr></thead><tbody>${snipes.map((snipe, index) => `<tr>
                <td>${index + 1}</td><td>${villageLink(snipe.id, snipe.fromCoord)}</td><td>${villageLink(targets.get(normalizeCoord(snipe.toCoord)), snipe.toCoord)}</td>
                <td><img src="/graphic/unit/unit_${escape(snipe.unit)}.webp" alt="${escape(snipe.unit)}"> ${EAS.Utils.formatNumber(snipe.unitAmount)}</td>
                <td>${snipe.distance.toFixed(2)}</td><td class="mass-snipe-time">${snipe.formattedLaunchTime}</td>
                <td class="mass-snipe-time"><span data-endtime-ms="${snipe.launchTime}">${service.formatDurationMs(snipe.launchTime - now)}</span></td>
                <td><a class="eas-button" href="${escape(service.commandUrl(snipe))}" target="_blank" rel="noopener noreferrer">Enviar</a></td></tr>`).join('')}</tbody></table>` : '';
            if (snipes.length) service.startCountdownMs(find('[data-combinations]'));
        };
        const safely = (action) => async () => {
            try { await action(); } catch (error) {
                EAS.Log?.error?.('mass-snipe', 'action-failed', error);
                if (!closed) status(error.message, 'error');
            }
        };
        runtime.listen(win.body, 'change', persist);
        runtime.listen(find('[data-needed]'), 'click', (event) => {
            if (event.target.closest('[data-remove]')) { event.target.closest('tr').remove(); persist(); }
        });
        find('[data-add]').onclick = () => { addRow(); persist(); };
        find('[data-calculate]').onclick = safely(async () => {
            if (calculating) return;
            calculating = true; find('[data-calculate]').disabled = true;
            persist(); status('Calculando tempos…');
            try {
                const input = collect();
                const inputs = await service.loadInputs();
                if (closed) return;
                snipes = service.calculate(input, inputs);
                persist();
                renderResults(inputs.mapVillages);
                status(snipes.length ? `${snipes.length} combinações encontradas` : 'Nenhuma opção possível de snip encontrada!', snipes.length ? 'success' : 'info');
                EAS.Usage?.track?.('mass-snipe.calculate', { combinations: snipes.length });
            } finally { calculating = false; if (!closed) find('[data-calculate]').disabled = false; }
        });
        find('[data-import]').onclick = () => { find('[data-import-panel]').hidden = !find('[data-import-panel]').hidden; };
        find('[data-import-execute]').onclick = safely(() => {
            const text = find('[data-import-text]').value.trim();
            if (!text) throw new Error('Este campo não pode ficar vazio!');
            const imported = service.parseTrains(text);
            if (!imported.length) { status('Nenhum noble train foi encontrado!'); return; }
            imported.forEach((snipe) => addRow(snipe)); persist();
        });
        find('[data-export]').onclick = safely(async () => {
            if (!snipes.length) { status('Nada para exportar!'); return; }
            const text = service.getBBCodeExport(snipes);
            await navigator.clipboard.writeText(text);
            status('Copiado na área de transferência!', 'success');
        });
        find('[data-refresh]').onclick = safely(async () => {
            status('Atualizando dados…');
            const results = await EAS.Data.refreshStale(['Villages', 'Groups', 'Troops']);
            const failure = results.find((result) => result.status === 'rejected');
            if (failure) throw failure.reason;
            if (!closed) status('Dados atualizados.', 'success');
        });
        find('[data-reset]').onclick = () => {
            if (calculating) return;
            EAS.Storage.remove(settingsKey()); service.stopCountdown(); snipes = [];
            find('[data-needed]').innerHTML = ''; addRow(defaultRow(), false);
            win.body.querySelectorAll('[name="unit"]').forEach((input) => { input.checked = DEFAULT_UNITS.includes(input.value); });
            renderResults([]); status('A configuração do script foi redefinida!', 'success');
        };
        find('[data-back]').onclick = () => { dispose(); EAS.UI.openMainWindow(); };
        runtime.listen(document, 'click', (event) => {
            const row = event.target.closest?.(`${EAS.Selectors.massSnipe.commands}, ${EAS.Selectors.massSnipe.incomings}`);
            if (!row || !row.querySelector('td')) return;
            try {
                const snipe = EAS.Adapters.MassSnipe.readCommand(row);
                row.setAttribute('data-eas-mass-snipe-selected', ''); addRow(snipe); persist();
            } catch (error) { status(error.message, 'error'); }
        });
        EAS.Usage?.track?.('mass-snipe.open');
        return win;
    };
    EAS.Modules.MassSnipe = {
        PANEL_ID,
        open() {
            if (!opening) opening = openPanel().finally(() => { opening = null; });
            return opening;
        }
    };
})();
