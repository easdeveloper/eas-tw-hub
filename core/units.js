(() => {
    'use strict';

    EAS.Units = EAS.Units || {};

    const UNIT_POPULATION = Object.freeze({
        spear: 1,
        sword: 1,
        axe: 1,
        archer: 1,
        spy: 2,
        light: 4,
        marcher: 5,
        heavy: 6,
        ram: 5,
        catapult: 8,
        knight: 10,
        snob: 100
    });

    const getDynamicPopulation = (unit) => {
        const units = EAS.World?.getGameData?.().units;
        const metadata = !Array.isArray(units) && units?.[unit];
        const population = Number(
            metadata?.population ?? metadata?.pop ?? metadata?.farm ?? 0
        );

        return population > 0 ? population : null;
    };

    EAS.Units.getPopulation = (unit) => {
        return getDynamicPopulation(unit) || UNIT_POPULATION[unit] || 0;
    };

    EAS.Units.calculateCommandPopulation = (troops = {}) => {
        return Object.entries(troops).reduce((total, [unit, quantity]) => {
            const normalizedQuantity = Math.max(0, Number(quantity) || 0);

            return total + normalizedQuantity * EAS.Units.getPopulation(unit);
        }, 0);
    };

    EAS.Units.population = UNIT_POPULATION;
})();
