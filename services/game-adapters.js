(() => {
    'use strict';
    EAS.Selectors ||= {};
    EAS.Selectors.market = Object.freeze({ resources: { wood: 'input[name="wood"],input#wood,input[id*="wood" i]', stone: 'input[name="stone"],input#stone,input[id*="stone" i]', iron: 'input[name="iron"],input#iron,input[id*="iron" i]' }, target: 'input[name="input"],input.target-input-field,input.target-input-autocomplete,input[name="target"],input[name="target_coord"],input#market_target', sendButton: 'input[type="submit"],button[type="submit"]', confirmSendButton: 'input.btn[type="submit"][value="Enviar"],button[type="submit"]', maxTime: 'input[name="max_time"]', multi: 'input[name="multi"]', merchants: '#market_merchant_available_count,.market_merchant_available,[data-merchants-available]' });
    EAS.Selectors.place = Object.freeze({ target: 'input[name="x"],input[name="target"],input.target-input-field', sendButton: '#target_attack,input[name="attack"],button[name="attack"]', confirmSendButton: '#troop_confirm_submit,input[type="submit"][value*="Enviar ataque" i]', units: 'input[name][data-unit],input.unitsInput' });
    EAS.Selectors.overview = Object.freeze({ villageRows: '#production_table tr,#overview_villages tr,#combined_table tr,#units_table tr', villageLink: 'a[href*="village="]' });
    const nativeSet = (input, value, targetWindow, events = ['input','change']) => { if (!input) return false; const setter = Object.getOwnPropertyDescriptor(targetWindow.HTMLInputElement.prototype, 'value')?.set; setter ? setter.call(input, String(value)) : input.value = String(value); events.forEach((type) => input.dispatchEvent(new targetWindow.Event(type, { bubbles: true }))); return true; };
    const market = EAS.Selectors.market;
    EAS.Adapters ||= {};
    EAS.Adapters.MarketPage = {
        fields(doc = document) { return { wood: doc.querySelector(market.resources.wood), stone: doc.querySelector(market.resources.stone), iron: doc.querySelector(market.resources.iron), target: doc.querySelector(market.target), maxTime: doc.querySelector(market.maxTime), multi: doc.querySelector(market.multi) }; },
        readResources(doc = document) { const fields = this.fields(doc); return { wood: Number(fields.wood?.value || 0), stone: Number(fields.stone?.value || 0), iron: Number(fields.iron?.value || 0) }; },
        readMerchants(doc = document) { return Number(String(doc.querySelector(market.merchants)?.textContent || '').replace(/\D/g, '')) || 0; },
        fillTransport({ wood = 0, stone = 0, iron = 0, target = '' }, targetWindow = window) { const fields = this.fields(targetWindow.document); nativeSet(fields.wood, wood, targetWindow); nativeSet(fields.stone, stone, targetWindow); nativeSet(fields.iron, iron, targetWindow); nativeSet(fields.target, target, targetWindow, ['input','keyup','change','blur']); return fields; },
        findSendButton(doc = document) { return EAS.MarketEngine.TransportExecutor.findMarketSendButton(doc); },
        detectConfirmation(doc = document, targetWindow = window) { return EAS.MarketEngine.TransportExecutor.isMarketTransportConfirmationPage(doc, targetWindow); },
        findConfirmButton(doc = document, targetWindow = window) { return EAS.MarketEngine.TransportExecutor.findMarketConfirmationSendButton(doc, targetWindow); },
        detectSuccess(doc = document, targetWindow = window) { return EAS.MarketEngine.TransportExecutor.detectMarketTransportSuccess(doc, targetWindow); }
    };
    EAS.Adapters.RallyPoint = { fields(doc = document) { return { target: doc.querySelector(EAS.Selectors.place.target), send: doc.querySelector(EAS.Selectors.place.sendButton), confirm: doc.querySelector(EAS.Selectors.place.confirmSendButton) }; } };
    EAS.Adapters.Overview = { rows(doc = document) { return [...doc.querySelectorAll(EAS.Selectors.overview.villageRows)]; }, villageLinks(doc = document) { return this.rows(doc).map((row) => row.querySelector(EAS.Selectors.overview.villageLink)).filter(Boolean); } };
})();
