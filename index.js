(() => {
    'use strict';

    const BASE_URL = 'https://easdeveloper.github.io/eas-tw-hub';

    const loadedScripts = new Set();
    const isMobile = () => Boolean(
        ((navigator.maxTouchPoints || 0) > 0 && Math.min(screen.width || innerWidth, innerWidth) <= 900) ||
        window.matchMedia?.('(pointer: coarse)')?.matches ||
        innerWidth <= 640
    );
    const notifyReady = () => window.dispatchEvent(new CustomEvent('eas-tw-hub-ready', {
        detail: { version: window.EAS?.version || '', mobile: isMobile(), timestamp: Date.now() }
    }));

    const loadScript = (src) => new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[data-eas-script="${src}"]`);

        if (loadedScripts.has(src) || existing) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = `${BASE_URL}/${src}?v=${Date.now()}`;
        script.dataset.easScript = src;
        script.onload = () => {
            loadedScripts.add(src);
            resolve();
        };
        script.onerror = () => reject(new Error(`Falha ao carregar: ${src}`));
        document.head.appendChild(script);
    });

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
        if (window.__EAS_TW_RUNTIME_RESUMED__) return Boolean(window.__EAS_TW_RUNTIME_RESUMED__.active);
        loaderLog('eas-loader-runtime-resume-start', { url: location.href });
        const url = new URL(location.href);
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
        link.href = `${BASE_URL}/${src}?v=${Date.now()}`;
        link.dataset.easStyle = src;
        link.onload = resolve;
        link.onerror = () => reject(new Error(`Falha ao carregar: ${src}`));
        document.head.appendChild(link);
    });

    const start = async () => {
        try {
            if (document.readyState === 'loading') await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
            if (window.EAS?.UI?.toggle) {
                const marketExecutionOnly = shouldInitializeMarketOfferExecution() || shouldInitializeMarketBalanceExecution() || shouldInitializeMarketTargetExecution();
                if (!window.EAS.Place?.fillTargetFromUrl) {
                    await loadScript('services/place.js');
                }

                if (!window.EAS.Units?.calculateCommandPopulation) {
                    await loadScript('core/units.js');
                }

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
                if (!marketExecutionOnly) window.EAS.UI.toggle();
                notifyReady();
                return;
            }

            await loadStyle('css/eas.css');

            await loadScript('core/eas.js');
            await loadScript('core/utils.js');
            await loadScript('core/storage.js');
            await loadScript('core/ui.js');
            await loadScript('core/world.js');
            await loadScript('core/units.js');
            await loadScript('core/world-rules.js');
            await loadScript('core/villages.js');
            await loadScript('core/troops.js');
            await loadScript('services/place.js');
            await loadScript('services/public-map.js');
            await loadScript('services/fakes-execution.js');
            await loadScript('services/support-execution.js');
            await loadScript('services/market-engine.js');
            await loadScript('services/market-offers-execution.js');
            await loadScript('services/market-balance-execution.js');
            await loadScript('services/market-target-execution.js');
            await loadScript('services/mission-scheduler.js');
            await loadScript('services/scheduled-mission-execution.js');
            await loadScript('services/attack-preparation.js');

            await window.EAS.Villages.ensureFresh({ maxAgeMs: 5 * 60 * 1000 }).catch((error) => console.warn('[EAS Villages] inicialização usará o último snapshot válido.', error));

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
            console.error('[EAS TW Hub]', error);
            window.dispatchEvent(new CustomEvent('eas-tw-hub-error', { detail: {
                code: 'HUB_INIT_ERROR', message: error.message, stack: error.stack || '', timestamp: Date.now()
            }}));
            if (!window.EASTWHubLoaderRuntime) alert(`EAS TW Hub: ${error.message}`);
        }
    };

    start();
})();
