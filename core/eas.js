(() => {
    'use strict';

    window.EAS = {
        name: 'EAS TW Hub',
        version: '0.1.0',

        UI: {},
        Utils: {},
        Storage: {},
        Data: {},
        State: {},
        Selectors: {},
        Adapters: {},
        Runtime: {},
        Log: {},
        Usage: {},
        World: {},
        Villages: {},
        Troops: {},
        Units: {},
        WorldRules: {},
        CommandRules: {},
        FakesExecution: {},
        SupportExecution: {},
        PublicMap: {},
        MarketEngine: {},
        MarketOffersExecution: {},
        MissionScheduler: {},
        Modules: {},

        start() {
            console.log(
                `[${this.name}] versão ${this.version} iniciada com sucesso.`
            );

            if (typeof this.UI.openMainWindow !== 'function') {
                throw new Error('A interface principal não foi carregada.');
            }

            this.UI.openMainWindow();
        }
    };
})();
