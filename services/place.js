(() => {
    'use strict';

    EAS.Place = EAS.Place || {};

    const TARGET_PARAM = 'eas_target';
    const SESSION_TARGET_PREFIX = 'eas_tw_target_';
    const LOCAL_TARGET_PREFIX = 'eas_tw_place_target_';
    const DEFAULT_TIMEOUT_MS = 5000;
    const CHILD_TIMEOUT_MS = 10000;
    const CHILD_INTERVAL_MS = 200;
    const TEMP_TARGET_TTL_MS = 30 * 1000;

    const getScreen = () => {
        return EAS.World.getScreen?.() || {};
    };

    const getCurrentVillageId = (targetWindow = window) => {
        const url = new URL(targetWindow.location.href);

        return url.searchParams.get('village') ||
            getScreen().villageId ||
            EAS.World.getCurrentVillage?.().id ||
            0;
    };

    const getSessionKey = (villageId = getCurrentVillageId()) => {
        return `${SESSION_TARGET_PREFIX}${villageId}`;
    };

    const getScopeKey = () => {
        const info = EAS.World.getInfo?.() || {};
        const world = info.world || location.host || 'world';
        const player = info.player?.id || info.player || 'player';

        return `${world}:${player}`.replace(/[^a-z0-9:_-]+/gi, '_');
    };

    const getLocalKey = (villageId = getCurrentVillageId()) => {
        return `${LOCAL_TARGET_PREFIX}${getScopeKey()}_${villageId}`;
    };

    const removeTemporaryTarget = (villageId) => {
        if (!villageId) {
            return;
        }

        sessionStorage.removeItem(getSessionKey(villageId));
        localStorage.removeItem(getLocalKey(villageId));
    };

    const isVisibleInput = (input, targetWindow) => {
        const style = targetWindow.getComputedStyle(input);
        const rect = input.getBoundingClientRect();

        return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0;
    };

    const isCommandTargetInput = (input, targetWindow) => {
        if (!input || input.disabled || input.readOnly) {
            return false;
        }

        if (!isVisibleInput(input, targetWindow)) {
            return false;
        }

        return Boolean(input.closest(
            '#command-data-form, form[action*="screen=place"]'
        ));
    };

    const getTargetInput = (targetDocument = document) => {
        const selectors = [
            'input.target-input-field[name="input"]',
            'input.target-input-autocomplete[name="input"]',
            'input[name="input"][placeholder*="|"]',
            '#command-data-form input[name="input"]',
            'form[action*="screen=place"] input[name="input"]'
        ];
        const targetWindow = targetDocument.defaultView || window;

        return selectors
            .flatMap((selector) => Array.from(
                targetDocument.querySelectorAll(selector)
            ))
            .find((input) => isCommandTargetInput(input, targetWindow)) ||
            null;
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

    const setInputValue = (input, value, targetWindow) => {
        const descriptor = Object.getOwnPropertyDescriptor(
            targetWindow.HTMLInputElement.prototype,
            'value'
        );

        if (descriptor?.set) {
            descriptor.set.call(input, value);
        } else {
            input.value = value;
        }
    };

    const dispatchFieldEvents = (input, targetWindow) => {
        input.dispatchEvent(new targetWindow.Event('input', { bubbles: true }));
        input.dispatchEvent(new targetWindow.Event('change', { bubbles: true }));

        if (targetWindow.jQuery) {
            targetWindow.jQuery(input).val(input.value)
                .trigger('input')
                .trigger('change');
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

    const cleanExpiredTemporaryTargets = () => {
        const now = Date.now();

        Object.keys(localStorage)
            .filter((key) => key.startsWith(LOCAL_TARGET_PREFIX))
            .forEach((key) => {
                try {
                    const item = JSON.parse(localStorage.getItem(key));

                    if (!item?.expiresAt || item.expiresAt <= now) {
                        localStorage.removeItem(key);
                    }
                } catch (_error) {
                    localStorage.removeItem(key);
                }
            });
    };

    const saveTemporaryTarget = (villageId, coordinate) => {
        const parsed = EAS.Utils.parseCoordinate(coordinate);

        if (!parsed || !villageId) {
            return false;
        }

        cleanExpiredTemporaryTargets();
        localStorage.setItem(
            getLocalKey(villageId),
            JSON.stringify({
                scope: getScopeKey(),
                villageId: String(villageId),
                coordinate: parsed.coordinate,
                createdAt: Date.now(),
                expiresAt: Date.now() + TEMP_TARGET_TTL_MS
            })
        );

        return true;
    };

    const getTargetFromLocalStorage = () => {
        const villageId = getCurrentVillageId();
        const key = getLocalKey(villageId);

        cleanExpiredTemporaryTargets();

        try {
            const item = JSON.parse(localStorage.getItem(key));

            if (!item || item.expiresAt <= Date.now()) {
                localStorage.removeItem(key);
                return null;
            }

            return EAS.Utils.parseCoordinate(item.coordinate)?.coordinate ||
                null;
        } catch (_error) {
            localStorage.removeItem(key);
            return null;
        }
    };

    EAS.Place.clearTemporaryTarget = (targetWindow = window) => {
        const villageId = getCurrentVillageId(targetWindow);

        try {
            const url = new URL(targetWindow.location.href);

            if (url.searchParams.has(TARGET_PARAM)) {
                url.searchParams.delete(TARGET_PARAM);
                targetWindow.history.replaceState({}, '', url.toString());
            }
        } catch (_error) {
            // The child window can be mid-navigation while polling.
        }

        removeTemporaryTarget(villageId);
    };

    const fillTargetInWindow = (targetWindow, coordinate) => {
        const parsed = EAS.Utils.parseCoordinate(coordinate);
        const input = parsed
            ? getTargetInput(targetWindow.document)
            : null;

        if (!parsed || !input) {
            return false;
        }

        input.focus();
        setInputValue(input, parsed.coordinate, targetWindow);
        dispatchFieldEvents(input, targetWindow);
        input.blur();

        if (input.value !== parsed.coordinate) {
            return false;
        }

        EAS.Place.clearTemporaryTarget(targetWindow);
        return true;
    };

    EAS.Place.fillTarget = (coordinate) => {
        const parsed = EAS.Utils.parseCoordinate(coordinate);

        if (!parsed || !fillTargetInWindow(window, parsed.coordinate)) {
            return false;
        }

        showMessage(`Destino ${parsed.coordinate} preenchido na Praça.`, 'success');

        return true;
    };

    EAS.Place.waitForTargetInput = (
        childWindow,
        {
            coordinate,
            villageId = null,
            timeoutMs = CHILD_TIMEOUT_MS,
            intervalMs = CHILD_INTERVAL_MS
        } = {}
    ) => {
        return new Promise((resolve) => {
            const parsed = EAS.Utils.parseCoordinate(coordinate);

            if (!childWindow || !parsed) {
                resolve(false);
                return;
            }

            const startedAt = Date.now();
            let timer = null;

            const stop = (result) => {
                clearInterval(timer);
                resolve(result);
            };

            const tryFill = () => {
                if (childWindow.closed) {
                    removeTemporaryTarget(villageId);
                    stop(false);
                    return;
                }

                try {
                    if (fillTargetInWindow(childWindow, parsed.coordinate)) {
                        showMessage(
                            `Destino ${parsed.coordinate} preenchido na Praça da aldeia.`,
                            'success'
                        );
                        childWindow.focus();
                        stop(true);
                        return;
                    }
                } catch (_error) {
                    // Same-origin access can fail briefly during navigation.
                }

                if (Date.now() - startedAt >= timeoutMs) {
                    removeTemporaryTarget(villageId);
                    showMessage(
                        'A Praça foi aberta, mas o campo de destino não pôde ser localizado.',
                        'error'
                    );
                    stop(false);
                }
            };

            timer = setInterval(tryFill, intervalMs);
            tryFill();
        });
    };

    EAS.Place.openAndFillTarget = ({ villageId, coordinate }) => {
        const parsed = EAS.Utils.parseCoordinate(coordinate);
        const childWindow = window.open('about:blank', '_blank');

        if (!childWindow) {
            showMessage(
                'O navegador bloqueou a abertura da Praça. Autorize popups para o Tribal Wars.',
                'error'
            );
            return Promise.resolve(false);
        }

        if (!parsed || !villageId) {
            childWindow.close();
            return Promise.resolve(false);
        }

        saveTemporaryTarget(villageId, parsed.coordinate);

        const url = new URL('/game.php', location.origin);
        url.searchParams.set('village', villageId);
        url.searchParams.set('screen', 'place');
        url.searchParams.set(TARGET_PARAM, parsed.coordinate);
        childWindow.location.href = url.toString();

        return EAS.Place.waitForTargetInput(childWindow, {
            coordinate: parsed.coordinate,
            villageId
        });
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

        const coordinate = getTargetFromUrl() ||
            getTargetFromLocalStorage() ||
            getTargetFromSession();

        if (!coordinate) {
            return Promise.resolve(false);
        }

        return EAS.Place.waitAndFillTarget(coordinate);
    };
})();
