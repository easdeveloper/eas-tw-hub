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

    const UNIT_TRAVEL_SPEED = Object.freeze({
        spear: 18, sword: 22, axe: 18, archer: 18, spy: 9, light: 10,
        marcher: 10, heavy: 11, ram: 30, catapult: 30, knight: 10, snob: 35
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

    EAS.Units.getTravelSpeed = (unit) => {
        const units = EAS.World?.getGameData?.().units;
        const metadata = !Array.isArray(units) && units?.[unit];
        const dynamic = Number(metadata?.minutesPerField ?? metadata?.minutes_per_field ?? metadata?.speed ?? metadata?.travelTime ?? 0);
        return dynamic > 0 ? dynamic : UNIT_TRAVEL_SPEED[unit] || 0;
    };

    EAS.Units.getSlowestUnit = (troops = {}) => Object.entries(troops)
        .filter(([, quantity]) => Math.max(0, Number(quantity) || 0) > 0)
        .map(([unit]) => ({ unit, minutesPerField: EAS.Units.getTravelSpeed(unit) }))
        .filter((item) => item.minutesPerField > 0)
        .sort((a, b) => b.minutesPerField - a.minutesPerField)[0] || null;

    EAS.Units.calculateTravelDuration = ({ distance, troops, worldSpeed = 1, unitSpeed = 1 } = {}) => {
        const slowest = EAS.Units.getSlowestUnit(troops);
        const factor = Math.max(0.0001, Number(worldSpeed) * Number(unitSpeed));
        return slowest && Number.isFinite(Number(distance))
            ? Number(distance) * slowest.minutesPerField * 60 * 1000 / factor
            : null;
    };

    EAS.Units.population = UNIT_POPULATION;
    EAS.Units.travelSpeed = UNIT_TRAVEL_SPEED;
})();
