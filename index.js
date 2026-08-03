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
            if (window.EAS?.UI?.toggle) {
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
                    await loadScript('services/fakes-execution.js');
                }

                window.EAS.Place.fillTargetFromUrl();
                window.EAS.FakesExecution.initialize();
                window.EAS.UI.toggle();
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
            await loadScript('services/fakes-execution.js');

            window.EAS.start();
            window.EAS.Place.fillTargetFromUrl();
            window.EAS.FakesExecution.initialize();
        } catch (error) {
            console.error('[EAS TW Hub]', error);
            alert(`EAS TW Hub: ${error.message}`);
        }
    };

    start();
})();
