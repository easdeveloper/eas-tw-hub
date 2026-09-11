(() => {
    'use strict';
    if (EAS.MassSnipePrecise) return;

    const PANEL_ID = 'eas-mass-snipe-precise';
    const RUNTIME_ID = 'mass-snipe-precise';
    const consumedForms = new WeakSet();
    let closeActive = null;

    const calculateFireTime = (targetLaunchTime, latencyCompensation) => {
        if (!Number.isSafeInteger(targetLaunchTime) || !Number.isSafeInteger(latencyCompensation) || latencyCompensation < 0) {
            throw new Error('Informe um horário válido e uma compensação inteira, em ms, maior ou igual a zero.');
        }
        return targetLaunchTime - latencyCompensation;
    };
    const nextDelay = (remaining) => {
        if (remaining > 1000) return Math.min(250, remaining - 1000);
        if (remaining > 100) return Math.min(25, remaining - 100);
        if (remaining > 10) return Math.min(2, remaining - 10);
        return 0;
    };

    // Times use Mass Snipe's server wall-clock coordinate, not local Date/Unix
    // time. Dependencies are injectable to test every deadline deterministically.
    const createScheduler = ({ targetLaunchTime, latencyCompensation, explicitlyEnabled,
        serverNow, monotonicNow, schedule, unschedule, canFire, claim, button,
        onResult = () => {}, onCancel = () => {} }) => {
        const fireTime = calculateFireTime(targetLaunchTime, latencyCompensation);
        let state = 'idle';
        let timer = null;
        let anchor = null;
        let finalWindow = false;
        const projectedNow = () => anchor.server + monotonicNow() - anchor.monotonic;
        const sample = () => {
            const before = monotonicNow();
            const server = serverNow();
            const after = monotonicNow();
            if (!Number.isFinite(server) || !Number.isFinite(before) || !Number.isFinite(after)) throw new Error('Relógio indisponível.');
            anchor = { server, monotonic: (before + after) / 2 };
        };
        const cancel = (reason = 'Agendamento cancelado.') => {
            if (state === 'fired' || state === 'cancelled') return;
            state = 'cancelled';
            if (timer !== null) unschedule(timer);
            timer = null;
            onCancel(reason);
        };
        const check = () => {
            timer = null;
            if (state !== 'armed') return;
            try {
                if (!canFire()) { cancel('A confirmação mudou ou o envio não está mais disponível.'); return; }
                if (!finalWindow) sample();
                const remaining = fireTime - projectedNow();
                if (remaining <= 10) finalWindow = true;
                if (remaining > 0) { timer = schedule(check, nextDelay(remaining)); return; }
                if (!canFire() || !claim()) { cancel('O comando já foi utilizado ou a confirmação mudou.'); return; }
                // Consume before invoking click: even an exception or reentrant
                // event must never cause another attempt for this scheduler.
                state = 'fired';
                const actualPerformanceTime = monotonicNow();
                const actualClickTime = anchor.server + actualPerformanceTime - anchor.monotonic;
                let clickError = null;
                try { button.click(); } catch (error) { clickError = error; }
                onResult({ targetLaunchTime, latencyCompensation, fireTime, actualClickTime,
                    actualPerformanceTime, schedulerErrorMs: actualClickTime - fireTime, clickError });
            } catch (error) { cancel(error.message); }
        };
        return {
            fireTime,
            get state() { return state; },
            get remaining() { return anchor ? Math.max(0, fireTime - projectedNow()) : null; },
            start() {
                if (state !== 'idle') return false;
                if (explicitlyEnabled !== true || !canFire()) throw new Error('Ative o modo experimental na confirmação antes de agendar.');
                sample();
                if (fireTime <= projectedNow()) throw new Error('O momento previsto para o clique já passou.');
                state = 'armed';
                timer = schedule(check, nextDelay(fireTime - projectedNow()));
                return true;
            },
            cancel
        };
    };

    EAS.Selectors.massSnipePrecise = Object.freeze({
        form: '#command-confirm-form, form[action*="action=command"], form[action*="screen=place"]',
        button: '#troop_confirm_submit, input[type="submit"], input[type="button"], button[type="submit"], button:not([type])'
    });
    EAS.Adapters.MassSnipePrecise = {
        confirmation() {
            const url = new URL(location.href);
            if (url.searchParams.get('screen') !== 'place' || url.searchParams.get('try') !== 'confirm') return null;
            // Do not compete with the existing scheduled-mission executor.
            if (url.searchParams.has('eas_mission') || window.EASScheduledMissionRuntime?.sendTimer || document.getElementById('eas-scheduled-mission-panel')) return null;
            const form = document.querySelector(EAS.Selectors.massSnipePrecise.form);
            if (!form || consumedForms.has(form)) return null;
            const buttons = [...form.querySelectorAll(EAS.Selectors.massSnipePrecise.button)].filter((button) => {
                const text = (button.value || button.textContent || '').trim();
                return /^(?:Enviar (?:ataque|apoio)|Send (?:attack|support))\b/i.test(text) &&
                    button.isConnected && !button.disabled && button.getAttribute('aria-disabled') !== 'true' && button.getClientRects().length > 0;
            });
            if (buttons.length !== 1) return null;
            return { form, button: buttons[0], url: url.href };
        }
    };

    const open = () => {
        const confirmation = EAS.Adapters.MassSnipePrecise.confirmation();
        if (!confirmation) throw new Error('Abra a tela final de confirmação com “Enviar ataque” ou “Enviar apoio”, sem outra execução agendada ativa.');
        closeActive?.();
        const service = EAS.MassSnipeExecution;
        const win = EAS.UI.createWindow({ id: PANEL_ID, title: 'Envio preciso (experimental)', icon: '⏱️', width: 650 });
        const runtime = EAS.Runtime.create({ id: RUNTIME_ID, type: 'mass-snipe-precise' });
        let scheduler = null;
        let closed = false;
        const close = () => {
            if (closed) return;
            scheduler?.cancel(); closed = true;
            EAS.Runtime.dispose(RUNTIME_ID); win.close(); closeActive = null;
        };
        closeActive = close;
        win.body.innerHTML = `
            <p>Comando: <strong data-command></strong></p>
            <label>Alvo servidor (data/hora de saída)
                <input class="eas-input" data-target placeholder="DD/MM/YYYY HH:MM:SS:mmm" autocomplete="off">
            </label>
            <label>Compensação de latência (ms)
                <input class="eas-input" data-latency type="number" min="0" step="1" value="0">
            </label>
            <p><label><input type="checkbox" data-enable> Ativar envio preciso (experimental) para este comando</label></p>
            <div style="font-variant-numeric:tabular-nums">
                <div>Alvo servidor: <strong data-target-display>—</strong></div>
                <div>Compensação: <strong data-latency-display>0 ms</strong></div>
                <div>Clique previsto: <strong data-fire-display>—</strong></div>
                <div>Contagem: <strong data-countdown>—</strong></div>
            </div>
            <p>Este experimento mede o scheduler do navegador. Não garante o horário registrado pelo servidor.</p>
            <div class="eas-actions">
                <button class="eas-button" data-arm disabled>Agendar clique</button>
                <button class="eas-button eas-button--secondary" data-cancel disabled>Cancelar agendamento</button>
            </div><div data-status role="status"></div>`;
        const find = (selector) => win.body.querySelector(selector);
        const target = find('[data-target]'), latency = find('[data-latency]'), enabled = find('[data-enable]');
        find('[data-command]').textContent = confirmation.button.value || confirmation.button.textContent;
        const status = (message, type = 'info') => EAS.UI.showStatus({ target: find('[data-status]'), message, type });
        const formatTime = (value) => service.formatDateTime(Math.floor(value)).replace(/:(\d{3})$/, '.$1');
        const duration = (value) => service.formatDurationMs(value).replace(/^(\d):/, '0$1:');
        const readPlan = () => {
            if (!latency.value.trim()) throw new Error('Informe a compensação em ms.');
            const targetLaunchTime = service.getLandingTime(target.value).getTime();
            const latencyCompensation = Number(latency.value);
            return { targetLaunchTime, latencyCompensation, fireTime: calculateFireTime(targetLaunchTime, latencyCompensation) };
        };
        const unlock = () => {
            target.disabled = false; latency.disabled = false; enabled.disabled = false; enabled.checked = false;
            find('[data-arm]').disabled = true; find('[data-cancel]').disabled = true;
        };
        const preview = () => {
            find('[data-arm]').disabled = !enabled.checked || scheduler?.state === 'armed' || consumedForms.has(confirmation.form);
            try {
                const plan = readPlan();
                find('[data-target-display]').textContent = formatTime(plan.targetLaunchTime);
                find('[data-latency-display]').textContent = `${plan.latencyCompensation} ms`;
                find('[data-fire-display]').textContent = formatTime(plan.fireTime);
            } catch {
                find('[data-target-display]').textContent = '—'; find('[data-fire-display]').textContent = '—';
                find('[data-arm]').disabled = true;
            }
        };
        const validConfirmation = () => {
            const current = EAS.Adapters.MassSnipePrecise.confirmation();
            return !closed && win.element.isConnected && enabled.checked && current?.button === confirmation.button &&
                current?.form === confirmation.form && current?.url === confirmation.url;
        };
        [target, latency, enabled].forEach((input) => runtime.listen(input, 'input', preview));
        find('[data-arm]').onclick = () => {
            if (scheduler?.state === 'armed' || consumedForms.has(confirmation.form)) return;
            try {
                if (typeof window.Timing?.getCurrentServerTime !== 'function' || !Number.isFinite(window.Timing.getCurrentServerTime())) throw new Error('O relógio sincronizado Timing não está disponível para este experimento.');
                const plan = readPlan();
                scheduler = createScheduler({ ...plan, explicitlyEnabled: enabled.checked,
                    serverNow: service.getCurrentServerTimeMs, monotonicNow: () => performance.now(),
                    schedule: (callback, delay) => runtime.setTimeout(callback, delay),
                    unschedule: (timer) => runtime.clearTimeout(timer),
                    canFire: validConfirmation,
                    claim: () => { if (consumedForms.has(confirmation.form)) return false; consumedForms.add(confirmation.form); return true; },
                    button: confirmation.button,
                    onCancel: (reason) => { unlock(); find('[data-countdown]').textContent = '—'; status(reason); },
                    onResult: (result) => {
                        const error = `${result.schedulerErrorMs >= 0 ? '+' : ''}${result.schedulerErrorMs.toFixed(3)} ms`;
                        console.info('[Mass Snipe · Envio preciso]', {
                            targetTimestamp: result.targetLaunchTime, targetClickTimestamp: result.fireTime,
                            actualClickTimestamp: result.actualClickTime, performanceNowAtClick: result.actualPerformanceTime,
                            'Target click': formatTime(result.fireTime), 'Actual click': formatTime(result.actualClickTime),
                            'Scheduler error': error, clickError: result.clickError?.message || null
                        });
                        unlock(); enabled.disabled = true;
                        find('[data-countdown]').textContent = '00:00:00.000';
                        status(result.clickError ? `Falha no clique: ${result.clickError.message}. Não haverá nova tentativa.` : `Clique chamado. Erro local do scheduler: ${error}.`, result.clickError ? 'error' : 'success');
                    }
                });
                scheduler.start();
                target.disabled = true; latency.disabled = true; enabled.disabled = true;
                find('[data-arm]').disabled = true; find('[data-cancel]').disabled = false;
                find('[data-countdown]').textContent = duration(scheduler.remaining);
                status('Agendado. O botão de envio será clicado automaticamente no momento previsto.');
                EAS.Usage?.track?.('mass-snipe.precise.arm');
            } catch (error) { scheduler?.cancel(); unlock(); status(error.message, 'error'); }
        };
        find('[data-cancel]').onclick = () => scheduler?.cancel();
        // A manual click/submit consumes this confirmation too, without blocking
        // the native action. Reopening the panel cannot arm a second attempt.
        const manualSend = () => { consumedForms.add(confirmation.form); scheduler?.cancel('Envio manual detectado; agendamento cancelado.'); preview(); };
        runtime.listen(confirmation.button, 'click', manualSend, true);
        runtime.listen(confirmation.form, 'submit', manualSend, true);
        runtime.listen(window, 'pagehide', close);
        runtime.observe(new MutationObserver(() => { if (!win.element.isConnected) close(); }))
            .observe(document.body, { childList: true, subtree: true });
        runtime.setInterval(() => {
            if (scheduler?.state === 'armed') find('[data-countdown]').textContent = duration(scheduler.remaining);
        }, 25);
        return win;
    };

    EAS.MassSnipePrecise = { PANEL_ID, calculateFireTime, nextDelay, createScheduler, open };
})();
