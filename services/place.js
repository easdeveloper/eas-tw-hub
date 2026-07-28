(() => {
    'use strict';

    EAS.Place = EAS.Place || {};

    const TARGET_PARAM = 'eas_target';
    const TARGET_PREFIX = 'eas_tw_target_';
    const DEFAULT_TIMEOUT_MS = 5000;

    const getScreen = () => {
        return EAS.World.getScreen?.() || {};
    };

    const getCurrentVillageId = () => {
        return getScreen().villageId ||
            EAS.World.getCurrentVillage?.().id ||
            0;
    };

    const getSessionKey = (villageId = getCurrentVillageId()) => {
        return `${TARGET_PREFIX}${villageId}`;
    };

    const getTargetInput = () => {
        const selectors = [
            'input.target-input-field[name="input"]',
            'input.target-input-autocomplete[name="input"]',
            'input[name="input"][placeholder*="|"]',
            '#command-data-form input[name="input"]'
        ];

        return document.querySelector(selectors.join(','));
    };

    const showMessage = (message, type = 'info') => {
        const status = document.createElement('div');

        status.className = `eas-status eas-status--${type}`;
        status.textContent = message;
        status.style.position = 'fixed';
        status.style.right = '12px';
        status.style.bottom = '12px';
        status.style.zIndex = '999999';
        document.body.appendChild(status);

        setTimeout(() => {
            status.remove();
        }, 4500);
    };

    const dispatchFieldEvents = (input) => {
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        if (window.jQuery) {
            window.jQuery(input).trigger('input').trigger('change');
        }
    };

    const getTargetFromUrl = () => {
        const url = new URL(location.href);
        const target = url.searchParams.get(TARGET_PARAM);

        return EAS.Utils.parseCoordinate(target)?.coordinate || null;
    };

    const getTargetFromSession = () => {
        const villageId = getCurrentVillageId();
        const target = sessionStorage.getItem(getSessionKey(villageId));

        return EAS.Utils.parseCoordinate(target)?.coordinate || null;
    };

    EAS.Place.clearTemporaryTarget = () => {
        const url = new URL(location.href);
        const villageId = getCurrentVillageId();

        if (url.searchParams.has(TARGET_PARAM)) {
            url.searchParams.delete(TARGET_PARAM);
            history.replaceState({}, '', url.toString());
        }

        sessionStorage.removeItem(getSessionKey(villageId));
    };

    EAS.Place.fillTarget = (coordinate) => {
        const parsed = EAS.Utils.parseCoordinate(coordinate);
        const input = getTargetInput();

        if (!parsed || !input) {
            return false;
        }

        input.value = parsed.coordinate;
        dispatchFieldEvents(input);
        EAS.Place.clearTemporaryTarget();
        showMessage(`Destino ${parsed.coordinate} preenchido na Praça.`, 'success');

        return true;
    };

    EAS.Place.waitAndFillTarget = (
        coordinate,
        { timeoutMs = DEFAULT_TIMEOUT_MS } = {}
    ) => {
        return new Promise((resolve) => {
            const startedAt = Date.now();
            let observer = null;
            let timer = null;

            const stop = (result) => {
                observer?.disconnect();
                clearInterval(timer);
                resolve(result);
            };

            const tryFill = () => {
                if (EAS.Place.fillTarget(coordinate)) {
                    stop(true);
                    return;
                }

                if (Date.now() - startedAt >= timeoutMs) {
                    EAS.Place.clearTemporaryTarget();
                    showMessage(
                        'Não foi possível localizar o campo de destino na Praça.',
                        'error'
                    );
                    stop(false);
                }
            };

            observer = new MutationObserver(tryFill);
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            timer = setInterval(tryFill, 250);
            tryFill();
        });
    };

    EAS.Place.fillTargetFromUrl = () => {
        const screen = getScreen();

        if (screen.screen !== 'place') {
            return Promise.resolve(false);
        }

        const coordinate = getTargetFromUrl() || getTargetFromSession();

        if (!coordinate) {
            return Promise.resolve(false);
        }

        return EAS.Place.waitAndFillTarget(coordinate);
    };
})();
