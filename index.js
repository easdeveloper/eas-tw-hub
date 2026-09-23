(() => {
    'use strict';

    // Temporary DEV bootstrap probe: intentionally self-contained before loader guards/network.
    ((root, stage) => {
        try {
            const marker = root.EASFakeBootstrapDebug = root.EASFakeBootstrapDebug || {
                loaded: true, url: root.location.href, timestamp: Date.now(),
                loaderReached: false, indexReached: false, fakeModuleReached: false,
                fakeModuleInitialized: false, resumeRequested: false,
                resumeEntered: false, confirmationHandlerEntered: false, events: []
            };
            root.__EASFakeBootstrapMark = (event, details = {}) => {
                try {
                    marker[event] = true;
                    marker.lastEvent = event;
                    marker.events.push({ event, timestamp: Date.now(), ...details });
                    if (marker.events.length > 40) marker.events.shift();
                    const url = new URL(root.location.href);
                    let execution = null, storageError = null;
                    try { execution = JSON.parse(root.localStorage.getItem('eas_tw_fakes_execution') || 'null'); }
                    catch (error) { storageError = String(error); }
                    console.log?.('[EAS][FAKE][BOOTSTRAP]', { event, ...details, url: url.href,
                        fakeExecutionDetected: Boolean(execution), storageError,
                        confirmPageDetected: url.searchParams.get('screen') === 'place' && url.searchParams.get('try') === 'confirm',
                        resumeRequested: marker.resumeRequested, fakeModuleInitialized: marker.fakeModuleInitialized });
                } catch { /* Diagnostic failure must not affect bootstrap. */ }
            };
            if (typeof root.EASFakeDebug !== 'function') root.EASFakeDebug = () => {
                let execution = null, storageError = null;
                try { execution = JSON.parse(root.localStorage.getItem('eas_tw_fakes_execution') || 'null'); }
                catch (error) { storageError = String(error); }
                const entry = execution?.queue?.[execution.currentIndex];
                const form = root.document.querySelector('#command-data-form');
                const button = form?.querySelector('#troop_confirm_submit');
                const snapshot = { url: root.location.href, executionFound: Boolean(execution), storageError,
                    executionId: execution?.executionTab || null, tabId: root.name,
                    tabAuthorized: Boolean(execution?.executionTab && execution.executionTab === root.name),
                    currentCommand: entry || null,
                    currentCommandId: entry ? `${execution.currentIndex}:${entry.villageId || 0}:${entry.target || ''}` : null,
                    commandState: entry?.status || null, attemptId: entry?.confirmationAttempt?.attemptId || null,
                    confirmationLock: entry?.confirmationAttempt || null,
                    formFound: Boolean(form), buttonFound: Boolean(button), buttonDisabled: button?.disabled ?? null,
                    canConfirm: null, blockedReason: !marker.fakeModuleInitialized ? 'FAKE_MODULE_NOT_INITIALIZED'
                        : !marker.resumeEntered ? 'FAKE_RESUME_NOT_ENTERED' : 'CONFIRMATION_DIAGNOSTIC_NOT_REGISTERED',
                    bootstrap: marker };
                const copy = JSON.parse(JSON.stringify(snapshot));
                console.log?.('[EAS][FAKE][BOOTSTRAP] snapshot', copy);
                return copy;
            };
            root.__EASFakeBootstrapMark(stage, { message: stage === 'indexReached' ? 'index reached' : 'loader reached' });
        } catch { /* Keep the original loader behavior. */ }
    })(window, 'indexReached');


    // Temporary diagnostic emitted before any asynchronous dependency loading.
    try {
        const page = new URL(window.location.href);
        if (page.searchParams.get('screen') === 'place' && page.searchParams.get('try') === 'confirm') {
            console.log?.('[EAS][FAKE][BOOTSTRAP]', { event: 'SCRIPT_ENTER', url: page.href,
                fakeExecutionDetected: Boolean(JSON.parse(localStorage.getItem('eas_tw_fakes_execution') || 'null')),
                confirmPageDetected: true, resumeCalled: false, resumeAvailable: Boolean(window.EAS?.FakesExecution?.resume) });
        }
    } catch (error) { console.log?.('[EAS][FAKE][BOOTSTRAP]', { event: 'SCRIPT_ENTER_DIAGNOSTIC_ERROR', error: String(error) }); }

    if (window.EASRateLimit?.check()) return;

    window.__EASLoaderTrace?.('index-start-call', { reason: 'index-evaluated' });
    if (window.__EASIndexBootstrap) {
        window.__EASLoaderTrace?.('deduplicated', { asset: 'index.js', reason: 'document-bootstrap-already-started' });
        window.__EASLoaderTrace?.('bootstrap-already-running', { reason: 'index-reinjection' });
        return;
    }
    window.__EASIndexBootstrap = { buildId: window.EASLocalBuild?.id || null, startedAt: Date.now() };
    window.__EASLoaderTrace?.('index-start', { reason: 'first-index-in-document' });

    const BASE_URL = 'https://easdeveloper.github.io/eas-tw-hub';

    try { window.__EASLogger?.info('CORE', 'INDEX_REACHED', { local: !!window.EASLocalBuild }); } catch {}
    const loadedScripts = new Set();
    const scriptPromises = new Map();
    // A generated local userscript embeds every asset; missing files never fall back
    // to the published release, so a validation run cannot silently mix versions.
    const assetUrl = (src, type) => {
        if (!window.EASLocalBuild) return `${BASE_URL}/${src}?v=${Date.now()}`;
        const content = window.EASLocalBuild.files[src];
        if (typeof content !== 'string') throw new Error(`Local build asset missing: ${src}`);
        const url = URL.createObjectURL(new Blob([content], { type }));
        window.__EASImageTraceMark?.({ event: 'local-asset-created', asset: src, url, type, stack: new Error('EAS asset creation').stack });
        return url;
    };

    const isMobile = () => Boolean(
        ((navigator.maxTouchPoints || 0) > 0 && Math.min(screen.width || innerWidth, innerWidth) <= 900) ||
        window.matchMedia?.('(pointer: coarse)')?.matches ||
        innerWidth <= 640
    );
    const notifyReady = () => {
        window.EAS?.UI?.FloatingPanel?.initialize({ minimizedByDefault: Boolean(window.__EAS_TW_RUNTIME_RESUMED__?.active) });
        window.__EASIndexBootstrap.completedAt = Date.now();
        window.__EASLoaderTrace?.('bootstrap-completed', { reason: 'dependencies-and-resume-completed' });
        window.dispatchEvent(new CustomEvent('eas-tw-hub-ready', {
            detail: { version: window.EAS?.version || '', mobile: isMobile(), timestamp: Date.now() }
        }));
    };

    const loadScript = (src, { reason = window.__EASIndexBootstrap.completedAt ? 'module-demand' : 'bootstrap-dependency' } = {}) => {
        window.__EASLoaderTrace?.('load-script', { asset: src, reason, callerStack: new Error('EAS loadScript caller').stack });
        if (scriptPromises.has(src)) {
            window.__EASLoaderTrace?.('deduplicated', { asset: src, reason: 'dependency-already-requested' });
            return scriptPromises.get(src);
        }
        const promise = window.EASLocalBuild?.execute
            ? (window.EASRateLimit?.check() ? Promise.reject(new Error('RATE_LIMITED')) : window.EASLocalBuild.execute(src, { reason }))
            : new Promise((resolve, reject) => {
        if (window.EASRateLimit?.check()) { reject(new Error('RATE_LIMITED')); return; }
        const existing = document.querySelector(`script[data-eas-script="${src}"]`);

        if (loadedScripts.has(src) || existing) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = assetUrl(src, 'text/javascript');
        script.dataset.easScript = src;
        window.__EASLoaderTrace?.('script-created', { asset: src, url: script.src, reason, transport: 'script-element', scriptType: script.type || '', callerStack: new Error('EAS dependency insertion').stack });
        script.onload = () => {
            if (window.EASLocalBuild && script.src.startsWith('blob:')) { try { URL.revokeObjectURL(script.src); } catch {} }
            loadedScripts.add(src);
            script.dataset.easLoaded = 'true';
            window.__EASLoaderTrace?.('script-loaded', { asset: src, url: script.src, reason, transport: 'script-element' });
            resolve();
        };
        script.onerror = () => {
            window.__EASLoaderTrace?.('script-error', { asset: src, url: script.src, reason: 'load-event-error', transport: 'script-element' });
            reject(new Error(`Falha ao carregar: ${src}`));
        };
        window.__EASLoaderTrace?.('script-injected', { asset: src, url: script.src, reason });
        document.head.appendChild(script);
    });
        scriptPromises.set(src, promise);
        return promise;
    };

    window.EASLoader = {
        loadScript
    };

    const getActiveMarketExecution = () => {
        try {
            const execution = JSON.parse(localStorage.getItem('eas_tw_market_offers_execution') || 'null');
            if (!execution || Number(execution.version) < 3 || execution.endedAt || execution.finishedAt) return null;
            const currentIndex = (execution.queue || []).findIndex((item) => !['created', 'skipped', 'cancelled', 'canceled'].includes(item.status));
            return { execution, item: currentIndex >= 0 ? execution.queue[currentIndex] : null, currentIndex };
        } catch { return null; }
    };

    const shouldInitializeMarketOfferExecution = () => {
        const url = new URL(location.href); const active = getActiveMarketExecution();
        if (!active || url.searchParams.get('screen') !== 'market' || url.searchParams.get('mode') !== 'own_offer') return false;
        const villageId = String(window.game_data?.village?.id || url.searchParams.get('village') || '');
        return !active.item || villageId === String(active.item.villageId);
    };
    const shouldInitializeMarketBalanceExecution = () => { try { const execution = JSON.parse(localStorage.getItem('eas_tw_market_balance_execution') || 'null'); const item = execution?.queue?.find((entry, index) => index >= (execution.currentIndex || 0) && !['sent', 'skipped', 'cancelled'].includes(entry.status)); const url = new URL(location.href); return Boolean(item && !execution.endedAt && url.searchParams.get('screen') === 'market' && url.searchParams.get('mode') === 'send' && String(window.game_data?.village?.id || url.searchParams.get('village') || '') === String(item.sourceVillageId)); } catch { return false; } };
    const shouldInitializeMarketTargetExecution = () => { try { const execution = JSON.parse(localStorage.getItem('eas_tw_market_target_supply_execution') || 'null'); const item = execution?.queue?.find((entry, index) => index >= (execution.currentIndex || 0) && !['sent', 'skipped', 'cancelled'].includes(entry.status)); const url = new URL(location.href); return Boolean(item && !execution.endedAt && !execution.finishedAt && url.searchParams.get('screen') === 'market' && url.searchParams.get('mode') === 'send'); } catch { return false; } };
    const shouldInitializeMassFarmExecution = () => { try { const execution=JSON.parse(localStorage.getItem('eas-tw-hub:farm.mass.execution')||'null');const url=new URL(location.href);return Boolean(execution&&!['completed','cancelled'].includes(execution.status)&&execution.queue?.[execution.currentIndex]&&url.searchParams.get('screen')==='am_farm'); } catch { return false; } };

    const initializeMarketOfferExecutionIfNeeded = () => {
        if (!shouldInitializeMarketOfferExecution()) return false;
        return Boolean(window.EAS?.MarketOffersExecution?.initialize?.());
    };

    window.initializeMarketOfferExecutionIfNeeded = initializeMarketOfferExecutionIfNeeded;
    const initializeScheduledMissionIfNeeded = async () => {
        if (!window.EAS?.MissionScheduler?.load || !window.EAS?.ScheduledMissionExecution?.initialize) return false;
        return Boolean(await window.EAS.ScheduledMissionExecution.initialize(window));
    };
    window.initializeScheduledMissionIfNeeded = initializeScheduledMissionIfNeeded;
    const getScheduledMissionTabContext = () => {
        try { return JSON.parse(sessionStorage.getItem('eas_tw_scheduled_mission_tab_context') || 'null'); } catch { return null; }
    };
    const initializeScheduledMissionConfirmationIfNeeded = async () => {
        const url = new URL(location.href);
        if (url.searchParams.get('screen') !== 'place' || url.searchParams.get('try') !== 'confirm') return false;
        const state = window.EAS?.MissionScheduler?.load?.();
        const tabContext = getScheduledMissionTabContext();
        const scheduledContext = tabContext?.tabExecutionId && state?.tabExecutions?.[tabContext.tabExecutionId]?.missionId === tabContext.missionId;
        if (!url.searchParams.get('eas_mission') && !scheduledContext) return false;
        return initializeScheduledMissionIfNeeded();
    };
    const initializeScheduledMissionPreparationIfNeeded = async () => {
        const url = new URL(location.href);
        if (url.searchParams.get('screen') !== 'place' || url.searchParams.get('try') === 'confirm') return false;
        const state = window.EAS?.MissionScheduler?.load?.();
        const tabContext = getScheduledMissionTabContext();
        const activeMission = state?.missions?.find?.((mission) => mission.id === state.activeMissionId);
        const boundTab = tabContext?.tabExecutionId && state?.tabExecutions?.[tabContext.tabExecutionId]?.missionId === tabContext.missionId;
        const returningAfterSend = boundTab && activeMission?.id === tabContext.missionId && activeMission?.tabExecutionId === tabContext.tabExecutionId && activeMission?.finalClickConsumed === true && ['sending', 'submitting'].includes(activeMission?.status);
        const returningAfterCompleted = state?.sourceFlow === 'scheduled-mission' && state?.lastCompletedMissionId && state?.lastCompletedAuxWindowName === window.name;
        if (!url.searchParams.get('eas_mission') && !boundTab && !returningAfterSend && !returningAfterCompleted) return false;
        return initializeScheduledMissionIfNeeded();
    };
    const initializeAttackPreparationIfNeeded = () => {
        try {
            const url = new URL(location.href);
            if (url.searchParams.get('screen') !== 'place' || !window.EAS?.AttackPreparation?.initialize) return false;
            if (url.searchParams.get('eas_mission')) {
                window.EAS?.MissionScheduler?.log?.('scheduled-mission-generic-preparer-suppressed', { missionId: url.searchParams.get('eas_mission') });
                return false;
            }
            const contextId = url.searchParams.get('eas_attack_preparation');
            if (!contextId && !window.EAS.AttackPreparation.read?.()) return false;
            return Boolean(window.EAS.AttackPreparation.initialize(window));
        } catch { return false; }
    };
    window.initializeAttackPreparationIfNeeded = initializeAttackPreparationIfNeeded;
    const loaderLog = (event, details = {}) => console.info(`[EAS TW Loader] ${event}`, details);
    const resumeEASRuntimeIfNeeded = async () => {
        let resumeCalled = false;
        const bootstrapDiagnostic = (event) => {
            try {
                const page = new URL(window.location.href);
                if (page.searchParams.get('screen') !== 'place' || page.searchParams.get('try') !== 'confirm') return;
                console.log?.('[EAS][FAKE][BOOTSTRAP]', { event, url: page.href,
                    fakeExecutionDetected: Boolean(JSON.parse(localStorage.getItem('eas_tw_fakes_execution') || 'null')),
                    confirmPageDetected: true, resumeCalled, resumeAvailable: Boolean(window.EAS?.FakesExecution?.resume),
                    cachedRuntime: window.__EAS_TW_RUNTIME_RESUMED__ || null });
            } catch (error) { console.log?.('[EAS][FAKE][BOOTSTRAP]', { event, diagnosticError: String(error) }); }
        };
        const resumeWithDiagnostic = () => {
            window.__EASFakeBootstrapMark?.('resumeRequested', { resumeAvailable: typeof window.EAS.FakesExecution?.resume === 'function' });
            resumeCalled = typeof window.EAS.FakesExecution?.resume === 'function';
            bootstrapDiagnostic('BEFORE_FAKE_RESUME');
            return window.EAS.FakesExecution?.resume?.();
        };
        bootstrapDiagnostic('RESUME_ENTER');
        try {
            // A cached bootstrap is not a lock for every command in a Fake queue.
            if (window.__EAS_TW_RUNTIME_RESUMED__ && resumeWithDiagnostic()) {
                window.__EAS_TW_RUNTIME_RESUMED__ = { active: true, type: 'fakes' };
                return true;
            }
            if (window.__EAS_TW_RUNTIME_RESUMED__) return Boolean(window.__EAS_TW_RUNTIME_RESUMED__.active);
            loaderLog('eas-loader-runtime-resume-start', { url: location.href });
            const url = new URL(location.href);
            if (shouldInitializeMassFarmExecution()) { const active=Boolean(window.EAS?.MassFarmExecution?.initialize?.());if(active){window.__EAS_TW_RUNTIME_RESUMED__={active:true,type:'mass-farm'};loaderLog('eas-loader-main-menu-suppressed',window.__EAS_TW_RUNTIME_RESUMED__);return true;} }
            if (url.searchParams.get('screen') === 'place' && (url.searchParams.get('eas_mission') || getScheduledMissionTabContext()?.missionId)) {
                loaderLog('eas-loader-scheduled-mission-detected', { missionId: url.searchParams.get('eas_mission'), stage: url.searchParams.get('try') === 'confirm' ? 'confirmation' : 'preparation' });
                const confirmation = await initializeScheduledMissionConfirmationIfNeeded();
                const preparation = confirmation ? false : await initializeScheduledMissionPreparationIfNeeded();
                if (confirmation || preparation) {
                    window.__EAS_TW_RUNTIME_RESUMED__ = { active: true, type: confirmation ? 'scheduled-confirmation' : 'scheduled-preparation' };
                    loaderLog('eas-loader-main-menu-suppressed', window.__EAS_TW_RUNTIME_RESUMED__);
                    return true;
                }
            }
            if (resumeWithDiagnostic()) {
                window.__EAS_TW_RUNTIME_RESUMED__ = { active: true, type: 'fakes' };
                return true;
            }
            const marketRuntimes = [
                ['coordinated-market', shouldInitializeMarketTargetExecution, () => window.EAS.MarketTargetExecution?.initialize?.()],
                ['market-offers', shouldInitializeMarketOfferExecution, () => window.EAS.MarketOffersExecution?.initialize?.()],
                ['market-balance', shouldInitializeMarketBalanceExecution, () => window.EAS.MarketBalanceExecution?.initialize?.()]
            ];
            for (const [type, shouldResume, initialize] of marketRuntimes) {
                if (!shouldResume()) continue;
                loaderLog('eas-loader-market-execution-detected', { type, url: location.href });
                const active = Boolean(await initialize());
                if (active) {
                    window.__EAS_TW_RUNTIME_RESUMED__ = { active: true, type };
                    loaderLog('eas-loader-main-menu-suppressed', window.__EAS_TW_RUNTIME_RESUMED__);
                    return true;
                }
            }
            const preparation = initializeAttackPreparationIfNeeded();
            window.__EAS_TW_RUNTIME_RESUMED__ = { active: Boolean(preparation), type: preparation ? 'attack-preparation' : null };
            if (preparation) loaderLog('eas-loader-main-menu-suppressed', window.__EAS_TW_RUNTIME_RESUMED__);
            else loaderLog('eas-loader-no-active-runtime', { url: location.href });
            return Boolean(preparation);
        } finally { bootstrapDiagnostic('RESUME_EXIT'); }
    };
    window.resumeEASRuntimeIfNeeded = resumeEASRuntimeIfNeeded;

    const loadStyle = (src) => new Promise((resolve, reject) => {
        const existing = document.querySelector(`link[data-eas-style="${src}"]`);

        if (existing) {
            resolve();
            return;
        }

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = assetUrl(src, 'text/css');
        link.dataset.easStyle = src;
        link.onload = resolve;
        link.onerror = () => reject(new Error(`Falha ao carregar: ${src}`));
        document.head.appendChild(link);
    });

    const loadActiveFakeRuntime = async () => {
        let execution;
        try { execution = JSON.parse(localStorage.getItem('eas_tw_fakes_execution') || 'null'); }
        catch { return; }
        const page = new URL(location.href);
        if (!execution || execution.finishedAt || execution.endedAt || !execution.executionTab ||
            execution.executionTab !== window.name || page.searchParams.get('screen') !== 'place') return;
        window.__EASFakeBootstrapMark?.('activeFakeDependenciesRequested');
        if (!window.EAS.Units?.calculateCommandPopulation) await loadScript('core/units.js');
        if (!window.EAS.CommandRules?.scanCommandRuleErrors) await loadScript('core/world-rules.js');
        if (!window.EAS.Place?.ensureCommandTarget) await loadScript('services/place.js');
        if (!window.EAS.FakesExecution?.resume) await loadScript('services/fakes-execution.js');
    };

    const start = async () => {
        try {
            if (document.readyState === 'loading') await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
            if (window.EAS?.UI?.toggle) {
                if (!window.EAS.Minting) {
                    await loadScript('services/minting-adapter.js');
                    await loadScript('services/minting.js');
                }
                if (!window.EAS.UI.FloatingPanel) {
                    await loadStyle('css/eas.css');
                    await loadScript('core/floating-position.js');
                    await loadScript('core/floating-panel.js');
                }
                const marketExecutionOnly = shouldInitializeMarketOfferExecution() || shouldInitializeMarketBalanceExecution() || shouldInitializeMarketTargetExecution();
                if (window.__EAS_TW_SILENT_BOOTSTRAP__) {
                    window.__EASFakeBootstrapMark?.('silentExistingUIBranch', { fakeModuleAvailable: Boolean(window.EAS.FakesExecution?.initialize) });
                    await loadActiveFakeRuntime();
                    window.EAS.MissionScheduler?.initialize?.();
                    await resumeEASRuntimeIfNeeded();
                    notifyReady();
                    return;
                }
                if (!window.__EAS_TW_SILENT_BOOTSTRAP__) {
                    if (!window.EAS.Log?.entries) await loadScript('core/observability.js');
                    if (!window.EAS.Runtime?.create) await loadScript('core/runtime.js');
                }
                if (!window.EAS.Place?.fillTargetFromUrl) {
                    await loadScript('services/place.js');
                }

                if (!window.EAS.Units?.calculateCommandPopulation) {
                    await loadScript('core/units.js');
                }
                if (!window.EAS.Groups?.getAll) await loadScript('core/groups.js');

                if (!window.EAS.WorldRules?.get) {
                    await loadScript('core/world-rules.js');
                }

                if (!window.EAS.FakesExecution?.initialize) {
                    await loadScript('services/public-map.js');
                    await loadScript('services/fakes-execution.js');
                }
                if (!window.EAS.SupportExecution?.initialize) {
                    await loadScript('services/support-execution.js');
                }
                if (!window.EAS.MarketEngine?.calculateResourceImbalance) {
                    await loadScript('services/market-engine.js');
                }
                if (!window.__EAS_TW_SILENT_BOOTSTRAP__) {
                    if (!window.EAS.Adapters?.MarketPage) await loadScript('services/game-adapters.js');
                    if (!window.EAS.Data?.Villages) await loadScript('core/game-data.js');
                }
                if (!window.EAS.Market?.ExecutionPanel) await loadScript('services/market-execution-ui.js');
                if (!window.EAS.Adapters?.FarmAssistant) await loadScript('services/farm-assistant-adapter.js');
                if (!window.EAS.MassFarmExecution?.initialize) await loadScript('services/mass-farm-execution.js');
                if (!window.EAS.MarketOffersExecution?.initialize) {
                    await loadScript('services/market-offers-execution.js');
                }
                if (!window.EAS.MarketBalanceExecution?.initialize) await loadScript('services/market-balance-execution.js');
                if (!window.EAS.MarketTargetExecution?.initialize) await loadScript('services/market-target-execution.js');
                if (!window.EAS.MissionScheduler?.initialize) await loadScript('services/mission-scheduler.js');
                if (!window.EAS.ScheduledMissionExecution?.initialize) await loadScript('services/scheduled-mission-execution.js');
                if (!window.EAS.AttackPreparation?.initialize) await loadScript('services/attack-preparation.js');

                window.EAS.MissionScheduler.initialize();
                const runtimeResumed = await resumeEASRuntimeIfNeeded();
                if (runtimeResumed || window.__EAS_TW_SILENT_BOOTSTRAP__) {
                    window.EAS.MissionScheduler.log('scheduled-mission-main-menu-suppressed', { stage: window.__EAS_TW_RUNTIME_RESUMED__?.type || 'silent-loader' });
                    notifyReady();
                    return;
                }
                window.EAS.Place.fillTargetFromUrl();
                window.EAS.FakesExecution.initialize();
                window.EAS.SupportExecution.initialize();
                window.EAS.MarketOffersExecution.initialize();
                window.EAS.MarketBalanceExecution.initialize();
                window.EAS.MarketTargetExecution.initialize();
                window.EAS.Data?.bootstrap?.();
                if (!marketExecutionOnly) window.EAS.UI.toggle();
                notifyReady();
                return;
            }

            await loadStyle('css/eas.css');

            await loadScript('core/eas.js');
            if (!window.EASRateLimit) await loadScript('core/rate-limit.js');
            if (window.EASRateLimit?.check()) return;
            if (!window.__EASLogger) await loadScript('core/logger.js').catch(() => {}); // Diagnostics must not block runtime loading.
            await loadScript('core/utils.js');
            await loadScript('core/storage.js');
            await loadScript('core/observability.js');
            await loadScript('core/runtime.js');
            await loadScript('core/ui.js');
            await loadScript('core/floating-position.js');
            await loadScript('core/floating-panel.js');
            await loadScript('core/world.js');
            await loadScript('core/units.js');
            await loadScript('core/world-rules.js');
            await loadScript('core/villages.js');
            await loadScript('core/groups.js');
            await loadScript('core/troops.js');
            await loadScript('services/place.js');
            await loadScript('services/public-map.js');
            await loadScript('services/fakes-execution.js');
            await loadScript('services/support-execution.js');
            await loadScript('services/market-engine.js');
            await loadScript('services/game-adapters.js');
            await loadScript('core/game-data.js');
            await loadScript('services/market-execution-ui.js');
            await loadScript('services/farm-assistant-adapter.js');
            await loadScript('services/mass-farm-execution.js');
            await loadScript('services/market-offers-execution.js');
            await loadScript('services/market-balance-execution.js');
            await loadScript('services/market-target-execution.js');
            await loadScript('services/mission-scheduler.js');
            await loadScript('services/scheduled-mission-execution.js');
            await loadScript('services/attack-preparation.js');

            await loadScript('services/minting-adapter.js');
            await loadScript('services/minting.js');

            window.EAS.Data.bootstrap().catch((error) => window.EAS.Log.error('bootstrap', 'cached-bootstrap-failed', error));

            const marketExecutionOnly = shouldInitializeMarketOfferExecution() || shouldInitializeMarketBalanceExecution() || shouldInitializeMarketTargetExecution();
            window.EAS.MissionScheduler.initialize();
            const runtimeResumed = await resumeEASRuntimeIfNeeded();
            if (runtimeResumed || window.__EAS_TW_SILENT_BOOTSTRAP__) {
                window.EAS.MissionScheduler.log('scheduled-mission-main-menu-suppressed', { stage: window.__EAS_TW_RUNTIME_RESUMED__?.type || 'silent-loader' });
                notifyReady();
                return;
            }
            window.EAS.Place.fillTargetFromUrl();
            window.EAS.FakesExecution.initialize();
            window.EAS.SupportExecution.initialize();
            window.EAS.MarketOffersExecution.initialize();
            window.EAS.MarketBalanceExecution.initialize();
            window.EAS.MarketTargetExecution.initialize();
            if (!marketExecutionOnly) window.EAS.start();
            notifyReady();
        } catch (error) {
            window.__EASFakeBootstrapMark?.('indexError', { error: String(error?.message || error) });
            console.error('[EAS TW Hub]', error);
            window.dispatchEvent(new CustomEvent('eas-tw-hub-error', { detail: {
                code: 'HUB_INIT_ERROR', message: error.message, stack: error.stack || '', timestamp: Date.now()
            }}));
            if (!window.EASTWHubLoaderRuntime && error.status !== 429 && !/RATE_LIMITED/.test(String(error.message))) alert(`EAS TW Hub: ${error.message}`);
        }
    };

    start();
})();
