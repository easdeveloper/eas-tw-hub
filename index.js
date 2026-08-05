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

    const getPendingMarketExecution = () => {
        try {
            const execution = JSON.parse(localStorage.getItem('eas_tw_market_offers_execution') || 'null');
            if (!execution || Number(execution.version) < 3 || execution.endedAt) return null;
            const currentIndex = (execution.queue || []).findIndex((item) => !['created', 'skipped', 'cancelled'].includes(item.status));
            return currentIndex >= 0 ? { execution, item: execution.queue[currentIndex], currentIndex } : null;
        } catch { return null; }
    };

    const shouldInitializeMarketOfferExecution = () => {
        const url = new URL(location.href); const pending = getPendingMarketExecution();
        if (!pending || url.searchParams.get('screen') !== 'market' || url.searchParams.get('mode') !== 'own_offer') return false;
        const villageId = String(window.game_data?.village?.id || url.searchParams.get('village') || '');
        return villageId === String(pending.item.villageId);
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
    const initializeScheduledMissionConfirmationIfNeeded = async () => {
        const url = new URL(location.href);
        if (url.searchParams.get('screen') !== 'place' || url.searchParams.get('try') !== 'confirm') return false;
        const state = window.EAS?.MissionScheduler?.load?.();
        const scheduledContext = state?.sourceFlow === 'scheduled-mission' && Number(state?.attackProcess) === 2 && state?.activeMissionId;
        if (!url.searchParams.get('eas_mission') && !scheduledContext) return false;
        return initializeScheduledMissionIfNeeded();
    };
    const initializeScheduledMissionPreparationIfNeeded = async () => {
        const url = new URL(location.href);
        if (url.searchParams.get('screen') !== 'place' || url.searchParams.get('try') === 'confirm') return false;
        const state = window.EAS?.MissionScheduler?.load?.();
        const activeMission = state?.missions?.find?.((mission) => mission.id === state.activeMissionId);
        const returningAfterSend = state?.sourceFlow === 'scheduled-mission' && Number(state?.attackProcess) === 2 && activeMission?.finalClickConsumed === true && ['sending', 'submitting'].includes(activeMission?.status);
        const returningAfterCompleted = state?.sourceFlow === 'scheduled-mission' && state?.lastCompletedMissionId && state?.lastCompletedAuxWindowName === window.name;
        if (!url.searchParams.get('eas_mission') && !returningAfterSend && !returningAfterCompleted) return false;
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
                const scheduledConfirmationActive = await initializeScheduledMissionConfirmationIfNeeded();
                const scheduledPreparationActive = scheduledConfirmationActive ? false : await initializeScheduledMissionPreparationIfNeeded();
                if (scheduledConfirmationActive || scheduledPreparationActive) {
                    window.EAS.MissionScheduler.log('scheduled-mission-main-menu-suppressed', { stage: scheduledConfirmationActive ? 'confirmation' : 'preparation' });
                    notifyReady();
                    return;
                }
                window.EAS.Place.fillTargetFromUrl();
                window.EAS.FakesExecution.initialize();
                window.EAS.SupportExecution.initialize();
                window.EAS.MarketOffersExecution.initialize();
                window.EAS.MarketBalanceExecution.initialize();
                window.EAS.MarketTargetExecution.initialize();
                const attackPreparationActive = initializeAttackPreparationIfNeeded();
                if (!marketExecutionOnly && !attackPreparationActive) window.EAS.UI.toggle();
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

            const marketExecutionOnly = shouldInitializeMarketOfferExecution() || shouldInitializeMarketBalanceExecution() || shouldInitializeMarketTargetExecution();
            window.EAS.MissionScheduler.initialize();
            const scheduledConfirmationActive = await initializeScheduledMissionConfirmationIfNeeded();
            const scheduledPreparationActive = scheduledConfirmationActive ? false : await initializeScheduledMissionPreparationIfNeeded();
            if (scheduledConfirmationActive || scheduledPreparationActive) {
                window.EAS.MissionScheduler.log('scheduled-mission-main-menu-suppressed', { stage: scheduledConfirmationActive ? 'confirmation' : 'preparation' });
                notifyReady();
                return;
            }
            window.EAS.Place.fillTargetFromUrl();
            window.EAS.FakesExecution.initialize();
            window.EAS.SupportExecution.initialize();
            window.EAS.MarketOffersExecution.initialize();
            window.EAS.MarketBalanceExecution.initialize();
            window.EAS.MarketTargetExecution.initialize();
            const attackPreparationActive = initializeAttackPreparationIfNeeded();
            if (!marketExecutionOnly && !attackPreparationActive) window.EAS.start();
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
