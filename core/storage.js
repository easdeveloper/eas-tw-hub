(() => {
    'use strict';

    EAS.Storage = EAS.Storage || {};

    const PREFIX = 'eas-tw-hub:';

    const getKey = (key) => `${PREFIX}${key}`;

    EAS.Storage.get = (key, fallback = null) => {
        try {
            const value = localStorage.getItem(getKey(key));

            if (value === null) {
                return fallback;
            }

            return JSON.parse(value);
        } catch {
            return fallback;
        }
    };

    EAS.Storage.set = (key, value) => {
        try {
            localStorage.setItem(getKey(key), JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    };

    EAS.Storage.remove = (key) => {
        try {
            localStorage.removeItem(getKey(key));
            return true;
        } catch {
            return false;
        }
    };
})();
