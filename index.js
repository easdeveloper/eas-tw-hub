(() => {
    'use strict';

    const BASE_URL = 'https://easdeveloper.github.io/eas-tw-hub';

    const loadedScripts = new Set();

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

    const initializeMarketOfferExecutionIfNeeded = () => {
        if (!shouldInitializeMarketOfferExecution()) return false;
        return Boolean(window.EAS?.MarketOffersExecution?.initialize?.());
    };

    window.initializeMarketOfferExecutionIfNeeded = initializeMarketOfferExecutionIfNeeded;

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
                const executionOnly = shouldInitializeMarketOfferExecution();
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

                window.EAS.Place.fillTargetFromUrl();
                window.EAS.FakesExecution.initialize();
                window.EAS.SupportExecution.initialize();
                window.EAS.MarketOffersExecution.initialize();
                if (!executionOnly) window.EAS.UI.toggle();
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

            const executionOnly = shouldInitializeMarketOfferExecution();
            if (!executionOnly) window.EAS.start();
            window.EAS.Place.fillTargetFromUrl();
            window.EAS.FakesExecution.initialize();
            window.EAS.SupportExecution.initialize();
            window.EAS.MarketOffersExecution.initialize();
        } catch (error) {
            console.error('[EAS TW Hub]', error);
            alert(`EAS TW Hub: ${error.message}`);
        }
    };

    start();
})();
