// Dedicated review-only operation desk. No Scheduler, Rally Point, send, timer or execution runtime.
(() => {
    'use strict';
    EAS.Modules = EAS.Modules || {};
    EAS.Modules.TacticalOperationPlanner = EAS.Modules.TacticalOperationPlanner || {};

    const UNIT_LABELS = { spear: 'Lanceiro', sword: 'Espadachim', archer: 'Arqueiro', spy: 'Explorador', heavy: 'Pesada', light: 'Leve', axe: 'Machado', ram: 'Aríete', catapult: 'Catapulta', knight: 'Paladino', snob: 'Nobre' };
    const OFFENSIVE_UNITS = ['axe', 'light', 'marcher', 'ram', 'catapult'];
    const DEFENSIVE_UNITS = ['spear', 'sword', 'archer', 'heavy'];
    const safeInteger = value => Number.isSafeInteger(Number(value)) ? Number(value) : null;
    const parseCustomQuantityInput = input => {
        if (!input || input.validity?.badInput) return NaN;
        if (typeof input.value !== 'string') return NaN;
        if (input.value.trim() === '') return 0;
        const quantity = Number(input.value);
        return Number.isFinite(quantity) ? quantity : NaN;
    };
    const calendarMilliseconds = value => value && [value.year, value.month, value.day, value.hours, value.minutes, value.seconds, value.milliseconds].every(Number.isInteger)
        ? Date.UTC(value.year, value.month - 1, value.day, value.hours, value.minutes, value.seconds, value.milliseconds) : null;
    const pad2 = value => String(value).padStart(2, '0');
    const formatCalendarTimestamp = (value, includeMilliseconds = false) => {
        if (!Number.isSafeInteger(value)) return '-';
        const date = new Date(value);
        const formatted = `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
        return includeMilliseconds ? `${formatted}.${String(date.getUTCMilliseconds()).padStart(3, '0')}` : formatted;
    };
    const formatDuration = value => {
        if (!Number.isSafeInteger(value) || value < 0) return '-';
        const totalSeconds = Math.floor(value / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        return `${String(hours).padStart(2, '0')}:${pad2(minutes)}:${pad2(seconds)}`;
    };
    const unitText = units => Object.entries(units).filter(([, count]) => Number(count) > 0).map(([unit, count]) => `${count} ${UNIT_LABELS[unit] || unit}`).join(', ') || '-';
    const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

    let state = { draft: null, analysis: null, status: '', error: null, active: false, customOpenIds: new Set(), pendingDraft: null, currentDraftId: null, currentDraftName: '' };
    const clearStatus = () => { state.status = ''; state.error = null; };
    const setStatus = (message, type = 'info') => { state.status = message; state.error = type === 'error'; };
    const emptyValidation = blockers => ({ valid: false, blockers: blockers || [], balances: [], missions: [], executionArtifact: null });

    const adaptAnalysisResult = (analysis, centralArrivalMs, serverNowMs) => {
        if (!analysis || !Array.isArray(analysis.candidates)) throw new Error('ANALYSIS_RESULT_INVALID: lista de candidatos ausente');
        return { ...analysis, centralArrivalMs, serverNowMs };
    };

    const createOperation = analysis => {
        const candidates = analysis?.candidates || [];
        const input = {
            id: `tactical-operation-${Date.now()}`,
            revision: 1,
            world: analysis?.world || null,
            playerId: analysis?.target?.playerId || null,
            target: analysis?.target || {},
            nightBonus: analysis?.nightBonus || null,
            centralArrivalMs: analysis?.centralArrivalMs ?? null,
            ntTemplate: analysis?.ntTemplate || null,
            slotPolicy: analysis?.slotPolicy || {},
            reviewState: 'unreviewed',
            slots: [],
            serverNowMs: analysis?.serverNowMs ?? null,
            analysisId: analysis?.analysisId || null,
            candidates
        };
        return EAS.TacticalOperationController.createDraft(input);
    };

    const buildDraft = analysis => {
        const draft = createOperation(analysis);
        const prepared = draft.operation.candidates || [];
        prepared.forEach((candidate, index) => {
            const slot = draft.operation.slots[index];
            const quantities = {};
            const source = candidate.source || {};
            slot.source = { id: source.id, coord: source.coord || null, name: source.name || null };
            slot.arrivalOffsetMs = 0;
            slot.role = 'unused';
            slot.composition = { requestedMode: 'custom', quantities, confirmed: false, evidence: { mode: 'custom', source: source.id, materializedBy: 'draft' }, limitingUnits: [] };
            slot.status = 'candidate';
        });
        return { ...draft, analysis };
    };

    const openFinalReview = root => {
        const controller = EAS.TacticalOperationController;
        const review = controller.buildFinalReview(state.draft, { unitOrder: EAS.Data?.Troops?.getUnits?.() || [] });
        state.finalReview = review; state.approvedSnapshot = null;
        const automaticAttack = review.commands.length > 0 && review.commands.every(c => c.commandType === 'attack' && !c.trainIndex);
        const container = root.parentElement, scrollTop = container.scrollTop;
        const view = document.createElement('section'); view.dataset.finalReview = '';
        const commandLabel = c => c.trainIndex ? `NT${c.trainIndex}/${c.trainSize}` : c.commandType === 'support' ? 'SUPPORT' : 'ATTACK';
        view.innerHTML = `<h2>OPERA\u00c7\u00c3O \u2014 ${escapeHtml(review.target.name || review.target.coord)}</h2>
            <p>Alvo: ${escapeHtml(review.target.coord)}<br>Jogador: ${escapeHtml(review.target.playerName || 'N\u00e3o comprovado')}<br>Chegada-base: ${formatCalendarTimestamp(review.centralArrivalMs, true)}</p>
            <strong data-final-state>${review.validation.valid ? 'PRONTA' : 'BLOQUEADA'}</strong>
            <p>Aldeias utilizadas: ${review.counts.villages}<br>Ataques simples: ${review.counts.attacks}<br>Apoios: ${review.counts.supports}<br>Trens de Nobre: ${review.counts.trains}<br>Comandos de Nobre: ${review.counts.nobleCommands}<br>TOTAL DE COMANDOS: ${review.counts.commands}</p>
            <div class="tactical-operation-table-wrap"><table class="eas-table"><thead><tr><th># / Tipo</th><th>Origem</th><th>Tropas</th><th>Envio / Dura\u00e7\u00e3o / Chegada</th><th>Estado</th></tr></thead><tbody>${review.commands.map((c, i) => `<tr data-final-command="${escapeHtml(c.slotId)}"><td>${i + 1} \u2014 ${commandLabel(c)}${c.trainIndex ? `<br><small>Trem: ${escapeHtml(c.parentSlotId)}</small>` : ''}</td><td>${escapeHtml(c.source.name || '')}<br>${escapeHtml(c.source.coord)}</td><td>${escapeHtml(unitText(c.composition.quantities))}</td><td>${formatCalendarTimestamp(c.sendAtMs, true)}<br>${formatDuration(c.travelTimeMs)}<br>${formatCalendarTimestamp(c.desiredArrivalMs, true)}</td><td>${c.validationStatus.toUpperCase()}<br>${escapeHtml(c.blockers.join(', '))}</td></tr>`).join('')}</tbody></table></div>
            <h3>Totais de tropas</h3><p>${review.unitOrder.filter(unit => Object.hasOwn(review.totals, unit) && review.totals[unit] !== 0).map(unit => `${escapeHtml(UNIT_LABELS[unit] || unit)}: ${review.totals[unit] ?? 'Indispon\u00edvel'}`).join(' | ')}</p>
            <h3>VALIDA\u00c7\u00c3O</h3><p>${review.validation.ready}/${review.counts.commands} comandos READY<br>Composi\u00e7\u00f5es confirmadas: ${review.validation.compositionsConfirmed ? 'Sim' : 'N\u00e3o'}<br>Evid\u00eancia de tropas v\u00e1lida: ${review.validation.troopEvidenceValid ? 'Sim' : 'N\u00e3o comprovada'}<br>Saldo conhecido sem sobrealoca\u00e7\u00e3o: ${review.validation.noOverAllocation ? 'Sim' : 'N\u00e3o comprovado'}<br>Timing dispon\u00edvel: ${review.validation.timingAvailable ? 'Sim' : 'N\u00e3o'}<br>${escapeHtml(review.validation.blockers.join(', ') || 'Nenhum blocker')}</p>
            <button type="button" data-final-back>\u2190 Voltar e editar</button><button type="button" data-final-approve ${review.validation.valid ? '' : 'disabled'}>Aprovar opera\u00e7\u00e3o</button><p data-final-status>Somente revis\u00e3o. Nenhum comando ser\u00e1 criado.</p>`;
        if (automaticAttack) {
            view.querySelector('[data-final-approve]').textContent = 'Confirmar e autorizar ataque real autom\u00e1tico';
            view.querySelector('[data-final-status]').textContent = 'Ao confirmar, autorizo o envio REAL autom\u00e1tico dos ataques, com as origens, destinos, tropas e hor\u00e1rios acima. Ap\u00f3s a cria\u00e7\u00e3o, todas as etapas e o clique nativo de envio ser\u00e3o autom\u00e1ticos.';
        }
        root.hidden = true; root.style.display = 'none'; container.append(view);
        view.querySelector('[data-final-back]').onclick = () => {
            state.finalReview = null; state.approvedSnapshot = null; view.remove(); root.hidden = false; root.style.display = ''; container.scrollTop = scrollTop;
        };
        view.querySelector('[data-final-approve]').onclick = async () => {
            const snapshot = controller.approveFinalReview(state.draft, review);
            state.approvedSnapshot = snapshot;
            view.querySelector('[data-final-status]').textContent = snapshot ? 'Opera\u00e7\u00e3o aprovada em mem\u00f3ria. Nenhum comando criado.' : 'Revis\u00e3o desatualizada ou bloqueada. Volte e gere uma nova revis\u00e3o.';
            view.querySelector('[data-final-approve]').disabled = true;
            if (snapshot && automaticAttack) {
                try {
                    if (!EAS.TacticalOperationSchedulerAdapter) await window.EASLoader.loadScript('services/tactical-operation-scheduler-adapter.js');
                    const adapter = EAS.TacticalOperationSchedulerAdapter;
                    const result = adapter.enqueue(snapshot, { authorizeAutomaticAttack: true, targetWindow: window });
                    adapter.initializeSchedulerHooks(window);
                    if (!EAS.MissionScheduler) await window.EASLoader.loadScript('services/mission-scheduler.js');
                    EAS.MissionScheduler.initialize(window);
                    view.querySelector('[data-final-status]').textContent = result.created
                        ? 'ATTACK criado e autorizado: execu\u00e7\u00e3o real autom\u00e1tica no hor\u00e1rio aprovado. Acompanhe status e eventuais erros nas opera\u00e7\u00f5es.'
                        : result.duplicate ? 'Opera\u00e7\u00e3o j\u00e1 existente. Nenhuma nova autoriza\u00e7\u00e3o foi concedida.' : `Cria\u00e7\u00e3o bloqueada: ${result.blockers.join(', ')}`;
                } catch (error) { view.querySelector('[data-final-status]').textContent = `Cria\u00e7\u00e3o bloqueada: ${error?.message || 'erro inesperado'}`; }
                return;
            }
            if (snapshot) {
                const queueButton = document.createElement('button');
                queueButton.type = 'button';
                queueButton.dataset.finalQueue = '';
                queueButton.textContent = 'Adicionar à preparação';
                queueButton.onclick = async () => {
                    try {
                        if (!EAS.TacticalOperationSchedulerAdapter) await window.EASLoader.loadScript('services/tactical-operation-scheduler-adapter.js');
                        const result = EAS.TacticalOperationSchedulerAdapter.enqueue(snapshot);
                        EAS.TacticalOperationSchedulerAdapter.initializeSchedulerHooks(window);
                        queueButton.disabled = true;
                        queueButton.textContent = result.created || result.duplicate ? 'Preparação adicionada' : 'Preparação não adicionada';
                        view.querySelector('[data-final-status]').textContent = result.created || result.duplicate
                            ? 'Snapshot aprovado adicionado ao Tactical Scheduler. Autorize a preparação por execução; nenhum envio foi habilitado.'
                            : `Falha ao adicionar preparação: ${result.blockers.join(', ')}`;
                    } catch (error) {
                        view.querySelector('[data-final-status]').textContent = `Falha ao adicionar preparação: ${error?.message || 'erro inesperado'}`;
                    }
                };
                view.querySelector('[data-final-approve]').after(queueButton);
            }
        };
    };
    const render = (root, draft, validation, anchorId = null) => {
        const findRow = () => [...root.querySelectorAll('[data-slot-id]')].find(row => row.dataset.slotId === anchorId);
        const row = anchorId ? findRow() : null;
        const scrollers = [];
        if (row) for (let node = row.parentElement; node; node = node.parentElement) {
            if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) scrollers.push({ node, top: node.scrollTop, left: node.scrollLeft, y: row.getBoundingClientRect().top - node.getBoundingClientRect().top });
        }
        if (!Array.isArray(validation?.balances)) throw new Error('REVIEW_BALANCES_UNAVAILABLE');
        const visibleIds = new Set(validation.visibleSlotIds || []);
        const visible = draft.operation.slots.filter(slot => visibleIds.has(slot.id));
        root.querySelector('[data-op-status]').textContent = state.status;
        root.querySelector('[data-op-status]').className = `eas-status eas-status--${state.error ? 'error' : 'info'}`;
        root.querySelector('[data-op-target]').textContent = `${draft.operation.target.name || 'Destino'} · ${draft.operation.target.coord || 'Coordenada ausente'} · revisão ${draft.operation.revision}`;
        root.querySelector('[data-op-summary]').textContent = `${validation.analyzedCount} analisadas · ${validation.selectedCount} planejadas · ${validation.blockedCount} bloqueadas${draft.reviewState === 'approved' ? ' · revisão aprovada' : ''}`;
        const draftSave = root.querySelector('[data-draft-save]');
        if (draftSave) draftSave.disabled = !state.draft;
        const table = root.querySelector('[data-op-table]');
        table.innerHTML = visible.length ? visible.map(slot => {
            const train = EAS.TacticalOperationPlanner.nobleTrainSize(slot.role);
            const commands = validation.missions.filter(item => (item.parentSlotId || item.slotId) === slot.id);
            const mission = commands.find(item => item.validationStatus === 'blocked') || commands[0];
            const trainReview = train ? commands.slice().sort((a, b) => a.trainIndex - b.trainIndex).map(command => `<div data-nt-command="${command.trainIndex}"><strong>NT${command.trainIndex} \u2014 ${command.validationStatus === 'ready' ? 'READY' : 'BLOCKED'}</strong><br>${escapeHtml(unitText(command.composition.quantities))}<br>Envio ${formatCalendarTimestamp(command.sendAtMs, true)}<br>Dura\u00e7\u00e3o ${formatDuration(command.travelTimeMs)}<br>Chegada ${formatCalendarTimestamp(command.desiredArrivalMs, true)}<br><small>${escapeHtml(command.blockers.join(', '))}</small></div>`).join('') : '';
            const quantities = unitText(slot.composition.quantities);
            const candidate = draft.operation.candidates.find(item => String(item.source.id) === String(slot.source.id));
            const balance = validation.balances.find(item => String(item.sourceId) === String(slot.source.id));
            const availabilityTrusted = candidate?.evidence?.trusted === true && candidate.evidence.complete === true && candidate.evidence.fresh === true;
            const quantityEditors = !train && state.customOpenIds.has(slot.id) ? Object.keys(candidate?.ownHome || {}).map(unit => `<label class="tactical-operation-unit">${escapeHtml(UNIT_LABELS[unit] || unit)}<input type="number" min="0" step="1" value="${Number(slot.composition.quantities?.[unit]) || 0}" data-quantity="${escapeHtml(slot.id)}" data-unit="${escapeHtml(unit)}"><span data-available="${escapeHtml(unit)}">/ ${availabilityTrusted && Number.isSafeInteger(candidate.ownHome[unit]) ? candidate.ownHome[unit] + ' dispon\u00edveis' : 'n\u00e3o verificado'}</span></label>`).join('') : '';
            const village = EAS.Villages?.getById?.(Number(slot.source.id));
            const villageName = slot.source.name || village?.name || null;
            const villageCoord = slot.source.coord || village?.coordinate || null;
            const displayName = villageName || villageCoord || `Aldeia sem identidade (${slot.source.id})`;
            const trustedTroops = candidate?.evidence?.trusted && candidate?.evidence?.complete && candidate?.evidence?.fresh;
            const offensiveCount = trustedTroops ? OFFENSIVE_UNITS.reduce((sum, unit) => sum + (Number.isSafeInteger(candidate.ownHome?.[unit]) ? candidate.ownHome[unit] : 0), 0) : null;
            const defensiveCount = trustedTroops ? DEFENSIVE_UNITS.reduce((sum, unit) => sum + (Number.isSafeInteger(candidate.ownHome?.[unit]) ? candidate.ownHome[unit] : 0), 0) : null;
            const nobleCount = trustedTroops && Number.isSafeInteger(candidate?.ownHome?.snob) ? candidate.ownHome.snob : null;
            const evidence = candidate?.evidence?.trusted ? 'Tropas verificadas' : 'Tropas não verificadas';
            const active = slot.role !== 'unused';
            const selectedLabel = slot.role === 'unused' ? 'Não selecionada' : ({ attack: 'Ataque', support: 'Apoio', nt2: 'NT(2)', nt3: 'NT(3)', nt4: 'NT(4)', nt5: 'NT(5)' }[slot.role] || slot.role);
            const commandState = !active ? 'Não selecionada' : mission?.validationStatus === 'ready' ? 'Pronta' : 'Bloqueada';
            return `<tr data-slot-id="${escapeHtml(slot.id)}" class="${mission?.validationStatus === 'blocked' ? 'eas-table-row--error' : ''}">
                <td><strong>${escapeHtml(displayName)}</strong><br><small>${escapeHtml(villageCoord || 'Coordenada não disponível')} · ${evidence}</small><br><small>ID: ${escapeHtml(slot.source.id)}</small></td>
                <td><select data-role="${escapeHtml(slot.id)}"><option value="unused" ${slot.role === 'unused' ? 'selected' : ''}>Não selecionar</option><option value="attack" ${slot.role === 'attack' ? 'selected' : ''}>Ataque</option><option value="support" ${slot.role === 'support' ? 'selected' : ''}>Apoio</option>${[2, 3, 4, 5].map(n => `<option value="nt${n}" ${slot.role === `nt${n}` ? 'selected' : ''}>NT(${n})</option>`).join('')}</select><small>${selectedLabel}</small></td>
                <td>${train ? trainReview : active ? `<strong>${slot.composition.requestedMode === 'full' ? 'FULL' : 'CUSTOM'}</strong><br><small>${escapeHtml(quantities)}</small>${slot.composition.requestedMode === 'custom' ? `<div>${state.customOpenIds.has(slot.id) ? `${quantityEditors}<button type="button" data-custom-close="${escapeHtml(slot.id)}">Concluir</button>` : `<button type="button" data-custom="${escapeHtml(slot.id)}">Editar CUSTOM</button>`}</div>` : ''}` : `<small>Ofensivas: ${offensiveCount == null ? 'não verificadas' : offensiveCount} · Defensivas: ${defensiveCount == null ? 'não verificadas' : defensiveCount} · Nobres: ${nobleCount == null ? 'não verificado' : nobleCount}</small>`}</td>
                <td>${active ? `<label class="tactical-operation-offset">Deslocamento da chegada (ms)<input type="number" step="1" value="${Number(slot.arrivalOffsetMs) || 0}" data-offset="${escapeHtml(slot.id)}"></label>` : '-'}</td>
                <td>${active ? `<strong>Envio</strong><br>${formatCalendarTimestamp(mission?.sendAtMs)}<br><small>Duração</small><br>${formatDuration(mission?.travelTimeMs)}<br><small>Chegada</small><br>${formatCalendarTimestamp(mission?.desiredArrivalMs, true)}` : '-'}</td>
                <td><span class="eas-status eas-status--${!active ? 'info' : mission?.validationStatus === 'ready' ? 'success' : 'error'}">${commandState}</span>${active ? `<br><small>${escapeHtml((mission?.blockers || []).join(', '))}</small>` : ''}</td>
                <td>${train ? 'Composi\u00e7\u00e3o autom\u00e1tica \u2014 somente leitura' : active ? `<button type="button" data-materialize="${escapeHtml(slot.id)}">Materializar FULL</button>${slot.composition.requestedMode === 'full' ? `<button type="button" data-custom="${escapeHtml(slot.id)}">Usar CUSTOM</button>` : ''}<button type="button" data-confirm="${escapeHtml(slot.id)}" ${slot.composition.confirmed ? 'disabled' : ''}>Confirmar</button>` : 'Selecione um tipo de comando'}</td>
            </tr>`;
        }).join('') : '<tr><td colspan="7">Nenhum slot visible. Alterar o filtro.</td></tr>';
        root.querySelectorAll('[data-quantity]').forEach(input => input.addEventListener('change', () => {
            state.draft = EAS.TacticalOperationController.setCustomQuantity(state.draft, input.dataset.quantity, input.dataset.unit, parseCustomQuantityInput(input));
            state.validation = EAS.TacticalOperationController.validateDraft(state.draft);
            render(root, state.draft, state.validation, input.dataset.quantity);
        }));
        root.querySelectorAll('[data-role]').forEach(select => select.addEventListener('change', () => {
            state.draft = EAS.TacticalOperationController.setRole(state.draft, select.dataset.role, select.value);
            if (select.value === 'unused' || EAS.TacticalOperationPlanner.nobleTrainSize(select.value)) state.customOpenIds.delete(select.dataset.role);
            state.validation = EAS.TacticalOperationController.validateDraft(state.draft);
            render(root, state.draft, state.validation, select.dataset.role);
        }));
        root.querySelectorAll('[data-offset]').forEach(input => input.addEventListener('change', () => {
            state.draft = EAS.TacticalOperationController.setArrivalOffset(state.draft, input.dataset.offset, safeInteger(input.value));
            state.validation = EAS.TacticalOperationController.validateDraft(state.draft);
            render(root, state.draft, state.validation, input.dataset.offset);
        }));
        root.querySelectorAll('[data-materialize]').forEach(button => button.addEventListener('click', () => {
            const slot = state.draft.operation.slots.find(item => item.id === button.dataset.materialize);
            const candidate = state.draft.operation.candidates.find(item => String(item.source.id) === String(slot.source.id));
            const quantities = Object.fromEntries(Object.entries(candidate?.ownHome || {}).filter(([, amount]) => Number.isSafeInteger(amount) && amount > 0));
            state.draft = EAS.TacticalOperationController.materializeFull(state.draft, button.dataset.materialize, quantities);
            state.customOpenIds.delete(button.dataset.materialize);
            state.validation = EAS.TacticalOperationController.validateDraft(state.draft);
            setStatus('FULL materializado. Confirme a composição antes da revisão.', 'info');
            render(root, state.draft, state.validation, button.dataset.materialize);
        }));
        root.querySelectorAll('[data-custom]').forEach(button => button.addEventListener('click', () => {
            state.draft = EAS.TacticalOperationController.useCustomComposition(state.draft, button.dataset.custom);
            state.customOpenIds.add(button.dataset.custom);
            state.validation = EAS.TacticalOperationController.validateDraft(state.draft);
            setStatus('Modo CUSTOM selecionado. Edite quantidades e confirme a composição.', 'info');
            render(root, state.draft, state.validation, button.dataset.custom);
        }));
        root.querySelectorAll('[data-custom-close]').forEach(button => button.addEventListener('click', () => {
            state.customOpenIds.delete(button.dataset.customClose);
            render(root, state.draft, state.validation, button.dataset.customClose);
        }));
        root.querySelectorAll('[data-confirm]').forEach(button => button.addEventListener('click', () => {
            state.draft = EAS.TacticalOperationController.confirmComposition(state.draft, button.dataset.confirm);
            state.validation = EAS.TacticalOperationController.validateDraft(state.draft);
            setStatus('Composição confirmada. A revisão permanece somente em memória.', 'info');
            render(root, state.draft, state.validation, button.dataset.confirm);
        }));
        root.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => {
            root.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('eas-button--active', item === button));
            state.draft = EAS.TacticalOperationController.setFilter(state.draft, button.dataset.filter);
            state.validation = EAS.TacticalOperationController.validateDraft(state.draft);
            render(root, state.draft, state.validation);
        });
        const review = root.querySelector('[data-op-review]');
        if (review) {
            review.disabled = validation.selectedCount === 0;
            review.onclick = () => openFinalReview(root);
        }
        const balanceRoot = root.querySelector('[data-op-balances]');
        balanceRoot.innerHTML = validation.balances.map(balance => {
            const candidate = draft.operation.candidates.find(item => String(item.source.id) === String(balance.sourceId));
            const village = EAS.Villages?.getById?.(Number(balance.sourceId));
            const name = candidate?.source?.name || village?.name || null;
            const coord = candidate?.source?.coord || village?.coordinate || null;
            const identity = name || coord || 'Aldeia sem identidade disponível';
            const evidence = balance.unknown ? 'Evidência não verificada' : 'Derivado';
            return `<div class="tactical-operation-balance"><strong>${escapeHtml(identity)}</strong><span>${escapeHtml(coord || 'Coordenada não disponível')}</span><small>ID: ${escapeHtml(balance.sourceId)}</small><span>${evidence}</span><span>Disponível: ${escapeHtml(unitText(balance.available || {}))}</span><span>Alocado: ${escapeHtml(unitText(balance.allocated || {}))}</span><span>Restante: ${escapeHtml(unitText(balance.remaining || {}))}</span><span>Excedido: ${escapeHtml(unitText(balance.overAllocated || {}))}</span></div>`;
        }).join('') || '<small>Sem saldos derivados.</small>';
        const restored = anchorId ? findRow() : null;
        if (restored) for (const saved of scrollers) {
            saved.node.scrollTop = saved.top;
            saved.node.scrollLeft = saved.left;
            saved.node.scrollTop += restored.getBoundingClientRect().top - saved.node.getBoundingClientRect().top - saved.y;
        }
    };

    const open = async ({ target: targetContext = null } = {}) => {
        if (!EAS.TacticalOperationDrafts) await window.EASLoader.loadScript('services/tactical-operation-drafts.js');
        const win = EAS.UI.createWindow({ id: 'eas-tactical-operation-planner', title: '🗺️ Operação Tática — Revisão', width: 1120, className: 'tactical-operation-planner-window', viewportRoot: true });
        win.body.innerHTML = '<div class="tactical-operation-planner"></div>';
        const root = win.body.querySelector('.tactical-operation-planner');
        root.innerHTML = `<div class="tactical-operation-header"><div><h2>Operação Tática</h2><p data-op-target>Analise uma alvo antes de revisar.</p></div><button type="button" data-op-close>Fechar</button></div>
            <div class="tactical-operation-controls"><label>Alvo<input data-op-target-input placeholder="484|527" value=""></label><label>Nome do jogador<input data-op-player-input placeholder="chargboy"></label><label>Data do servidor<input data-op-date placeholder="DD/MM/AAAA"></label><label>Hora do servidor<input data-op-time placeholder="HH:MM:SS.mmm"></label><button type="button" data-op-analyze>Analisar alvo</button></div>
            <div class="tactical-operation-drafts" data-op-drafts><label>Nome do rascunho<input data-draft-name maxlength="80" placeholder="Operação" value=""></label><button type="button" data-draft-save disabled>Salvar rascunho</button><label>Rascunhos salvos<select data-draft-select><option value="">Selecione</option></select></label><button type="button" data-draft-load disabled>Carregar rascunho</button><button type="button" data-draft-delete disabled>Excluir rascunho</button><span data-draft-status></span></div>
            <div class="tactical-operation-filters"><button type="button" data-filter="ALL" class="eas-button--active">Todos</button><button type="button" data-filter="OFFENSIVE">Ofensivas</button><button type="button" data-filter="DEFENSIVE">Defensivas</button><button type="button" data-filter="HAS_NOBLE">Com nobre</button><button type="button" data-filter="SELECTED">Selecionadas</button></div>
            <div class="tactical-operation-summary"><strong data-op-summary>Sem análise</strong><span data-op-status class="eas-status eas-status--info">A execução não é iniciada.</span></div>
            <div class="tactical-operation-review"><button type="button" data-op-review disabled>Aprovar revisão</button></div>
            <div class="tactical-operation-table-wrap"><table class="eas-table"><thead><tr><th>Origem</th><th>Função</th><th>Composição / evidência</th><th>Deslocamento</th><th>Envio / duração</th><th>Estado</th><th>Ações</th></tr></thead><tbody data-op-table></tbody></table></div>
            <details class="tactical-operation-balances"><summary>Saldos derivados por aldeia</summary><div class="tactical-operation-balance-list" data-op-balances></div></details>
            <div class="tactical-operation-notice"><strong>Segurança</strong><p>Somente revisão e planejamento em memória. Nenhum comando, scheduler, Rally Point, timer ou envio é criado.</p></div>`;
        if (targetContext?.coord) {
            root.querySelector('[data-op-target-input]').value = targetContext.coord;
            root.querySelector('[data-op-player-input]').value = targetContext.playerName || '';
        }
        const draftSelect = root.querySelector('[data-draft-select]'), draftStatus = root.querySelector('[data-draft-status]');
        const refreshDraftList = selectedId => {
            const records = EAS.TacticalOperationDrafts.list();
            draftSelect.replaceChildren(new Option('Selecione', ''));
            for (const record of records) draftSelect.add(new Option(`${record.name} · ${formatCalendarTimestamp(record.savedAt)}`, record.draftId));
            draftSelect.value = records.some(record => record.draftId === selectedId) ? selectedId : '';
            root.querySelector('[data-draft-load]').disabled = !draftSelect.value;
            root.querySelector('[data-draft-delete]').disabled = !draftSelect.value;
            root.querySelector('[data-draft-save]').disabled = !state.draft;
        };
        const setArrivalInputs = timestamp => {
            if (!Number.isSafeInteger(timestamp)) return;
            const date = new Date(timestamp), pad = value => String(value).padStart(2, '0');
            root.querySelector('[data-op-date]').value = `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
            root.querySelector('[data-op-time]').value = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${String(date.getUTCMilliseconds()).padStart(3, '0')}`;
        };
        root.querySelector('[data-draft-save]').onclick = () => {
            if (!state.draft) return;
            const name = root.querySelector('[data-draft-name]').value.trim() || state.draft.operation.target.name || state.draft.operation.target.coord;
            const result = EAS.TacticalOperationDrafts.save(state.draft, { name, draftId: state.currentDraftId });
            if (!result.saved) { draftStatus.textContent = `Rascunho não salvo: ${result.reason}`; return; }
            state.currentDraftId = result.draft.draftId; state.currentDraftName = result.draft.name;
            root.querySelector('[data-draft-name]').value = state.currentDraftName;
            draftStatus.textContent = 'Rascunho salvo. Nenhuma evidência ou aprovação foi persistida.';
            refreshDraftList(state.currentDraftId);
        };
        root.querySelector('[data-draft-load]').onclick = () => {
            const record = EAS.TacticalOperationDrafts.list().find(item => item.draftId === draftSelect.value);
            if (!record) return;
            state.pendingDraft = record; state.draft = null; state.analysis = null; state.validation = null;
            state.finalReview = null; state.approvedSnapshot = null;
            state.currentDraftId = record.draftId; state.currentDraftName = record.name;
            root.querySelector('[data-draft-name]').value = record.name;
            root.querySelector('[data-op-target-input]').value = record.target.coord || '';
            root.querySelector('[data-op-player-input]').value = record.target.playerName || '';
            setArrivalInputs(record.centralArrivalMs);
            root.querySelector('[data-op-summary]').textContent = `${record.slots.length} aldeias selecionadas · análise necessária`;
            root.querySelector('[data-op-table]').innerHTML = '<tr><td colspan="7">Rascunho carregado. Análise e evidências atuais são obrigatórias antes da revisão.</td></tr>';
            root.querySelector('[data-op-balances]').replaceChildren();
            root.querySelector('[data-op-review]').disabled = true;
            setStatus('Rascunho carregado sem evidências. Confira data/hora e analise novamente para validar as tropas atuais.');
            draftStatus.textContent = 'Configuração carregada; nenhuma revisão ou autorização reutilizada.';
            root.querySelector('[data-draft-save]').disabled = true;
        };
        root.querySelector('[data-draft-delete]').onclick = () => {
            const selectedId = draftSelect.value;
            if (!selectedId || !EAS.TacticalOperationDrafts.remove(selectedId)) return;
            if (state.currentDraftId === selectedId) { state.currentDraftId = null; state.currentDraftName = ''; }
            if (state.pendingDraft?.draftId === selectedId) state.pendingDraft = null;
            draftStatus.textContent = 'Rascunho excluído.';
            refreshDraftList();
        };
        draftSelect.onchange = () => {
            root.querySelector('[data-draft-load]').disabled = !draftSelect.value;
            root.querySelector('[data-draft-delete]').disabled = !draftSelect.value;
        };
        refreshDraftList(state.currentDraftId);
        root.querySelector('[data-op-close]').addEventListener('click', () => win.close());
        root.querySelector('[data-op-analyze]').addEventListener('click', async () => {
            const target = root.querySelector('[data-op-target-input]').value.trim();
            const playerName = root.querySelector('[data-op-player-input]').value.trim();
            const arrival = EAS.Utils.createServerDateTime(root.querySelector('[data-op-date]').value, root.querySelector('[data-op-time]').value);
            const centralArrivalMs = calendarMilliseconds(arrival);
            if (!target || centralArrivalMs == null) { setStatus('Informe alvo, data e hora válidas no calendário do servidor.', 'error'); render(root, createOperation({}), emptyValidation(['INPUT_MISSING'])); return; }
            state.active = true;
            state.customOpenIds = new Set();
            try {
                setStatus('Analisando alvo e evidências read-only…');
                render(root, createOperation({ candidates: [] }), emptyValidation([]));
                const savedTarget = state.pendingDraft?.target;
                const matchingContext = target === targetContext?.coord ? targetContext
                    : target === savedTarget?.coord ? savedTarget : null;
                const analysis = await EAS.TacticalOperationData.analyzeTarget({ target: { coord: target, playerName,
                    ...(matchingContext ? { villageId: matchingContext.villageId, ...(matchingContext.playerId != null ? { playerId: matchingContext.playerId } : {}) } : {}) } });
                const serverNow = EAS.World.getServerDateTime?.();
                const viewModel = adaptAnalysisResult(analysis, centralArrivalMs, serverNow?.available ? calendarMilliseconds(serverNow) : null);
                state.analysis = viewModel; state.draft = buildDraft(viewModel);
                const loadedDraft = state.pendingDraft;
                if (loadedDraft) {
                    const restored = EAS.TacticalOperationController.restoreEditableConfiguration(state.draft, loadedDraft);
                    state.draft = restored.draft;
                    state.currentDraftId = loadedDraft.draftId;
                    state.currentDraftName = restored.name || loadedDraft.name;
                    state.pendingDraft = null;
                    root.querySelector('[data-draft-name]').value = state.currentDraftName;
                    if (!restored.restored) setStatus(`Rascunho não aplicado: ${restored.reason}. Configure novamente a partir da análise atual.`, 'error');
                    else setStatus('Rascunho reconstruído sobre a análise atual. Confirme composições e gere uma nova Final Review.');
                }
                state.validation = EAS.TacticalOperationController.validateDraft(state.draft);
                if (!loadedDraft) setStatus(!Number.isSafeInteger(viewModel.serverNowMs) ? 'Relógio do servidor indisponível. Revisão bloqueada.' : viewModel.partial ? 'Análise parcial concluída. Evidências pendentes foram preservadas.' : 'Análise concluída. Revise os slots sem executar operações.', !Number.isSafeInteger(viewModel.serverNowMs) ? 'error' : viewModel.partial ? 'info' : 'success');
                render(root, state.draft, state.validation);
                refreshDraftList(state.currentDraftId);
            } catch (error) {
                state.draft = null;
                state.validation = null;
                setStatus(`A análise não pôde ser exibida: ${error?.message || 'erro inesperado.'}`, 'error');
                render(root, createOperation({ candidates: [] }), emptyValidation(['ANALYSIS_FAILED']));
            } finally { state.active = false; root.dispatchEvent(new CustomEvent('tactical-operation-analysis-finished')); }
        });
        root.querySelector('[data-op-target]').textContent = 'Sem análise ainda. O botão acima inicia a coleta read-only.';
        return win;
    };

    EAS.Modules.TacticalOperationPlanner.open = open;
    EAS.Modules.TacticalOperationPlanner.getState = () => ({ ...state, draft: state.draft ? EAS.TacticalOperationController.cloneDraft(state.draft) : null });
    EAS.Modules.TacticalOperationPlanner.formatting = Object.freeze({ formatCalendarTimestamp, formatDuration, parseCustomQuantityInput });
})();
