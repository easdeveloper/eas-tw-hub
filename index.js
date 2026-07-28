(() => {
    'use strict';

    const BASE_URL = 'https://easdeveloper.github.io/eas-tw-hub';

    const loadScript = (src) => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${BASE_URL}/${src}?v=${Date.now()}`;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Falha ao carregar: ${src}`));
        document.head.appendChild(script);
    });

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
                window.EAS.UI.toggle();
                return;
            }

            await loadStyle('css/eas.css');

            await loadScript('core/eas.js');
            await loadScript('core/utils.js');
            await loadScript('core/storage.js');
            await loadScript('core/ui.js');
            await loadScript('core/world.js');
            await loadScript('core/villages.js');
            await loadScript('core/troops.js');

            window.EAS.start();
        } catch (error) {
            console.error('[EAS TW Hub]', error);
            alert(`EAS TW Hub: ${error.message}`);
        }
    };

    start();
})();