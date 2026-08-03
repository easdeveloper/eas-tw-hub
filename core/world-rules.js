(() => {
    'use strict';

    EAS.WorldRules = EAS.WorldRules || {};

    const STORAGE_KEY = 'eas_tw_world_rules';

    const getWorld = () => {
        return EAS.World?.getWorldName?.() || location.hostname || 'unknown';
    };

    const readAll = () => {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch {
            return {};
        }
    };

    const writeAll = (rules) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
            return true;
        } catch {
            return false;
        }
    };

    EAS.WorldRules.get = (world = getWorld()) => {
        const rules = readAll();
        return rules[world] ? { ...rules[world] } : null;
    };

    EAS.WorldRules.setMinimumAttackPopulation = (
        minimumAttackPopulation,
        {
            attemptedPopulation = null,
            source = 'game-error',
            world = getWorld()
        } = {}
    ) => {
        const minimum = Math.max(0, Number(minimumAttackPopulation) || 0);

        if (!minimum) {
            return false;
        }

        const rules = readAll();
        rules[world] = {
            ...(rules[world] || {}),
            minimumAttackPopulation: minimum,
            attemptedPopulation: Number(attemptedPopulation) || null,
            detectedAt: Date.now(),
            source
        };

        return writeAll(rules);
    };

    EAS.WorldRules.clear = (world = getWorld()) => {
        const rules = readAll();
        delete rules[world];
        return writeAll(rules);
    };

    EAS.WorldRules.getWorld = getWorld;
})();
