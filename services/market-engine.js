(() => {
    'use strict';
    EAS.MarketEngine = EAS.MarketEngine || {};
    const CACHE_KEY = 'eas_tw_market_cache';
    const RESOURCES = ['wood', 'stone', 'iron'];
    const amount = (value) => Math.max(0, Math.floor(Number(value) || 0));
    const resourceMap = (value = {}) => Object.fromEntries(RESOURCES.map((resource) => [resource, amount(value[resource])]));
    const addResources = (...values) => Object.fromEntries(RESOURCES.map((resource) => [resource, values.reduce((sum, value) => sum + Number(value?.[resource] || 0), 0)]));
    const subtractResources = (base, ...values) => Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(0, Number(base?.[resource] || 0) - values.reduce((sum, value) => sum + Number(value?.[resource] || 0), 0))]));
    const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; } };
    const saveCache = (cache) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); return true; } catch { return false; } };

    const normalizeVillage = (village = {}) => ({
        villageId: String(village.villageId ?? village.id ?? ''),
        villageName: village.villageName ?? village.name ?? 'Aldeia desconhecida',
        villageCoord: village.villageCoord ?? village.coordinate ?? village.coord ?? (village.x != null && village.y != null ? `${village.x}|${village.y}` : ''),
        resources: resourceMap(village.resources || village), storage: amount(village.storage ?? village.warehouse),
        merchants: { available: amount(village.merchants?.available ?? village.merchantsAvailable), total: amount(village.merchants?.total ?? village.merchantsTotal) },
        activeOffers: { ...resourceMap(village.activeOffers), merchantsUsed: amount(village.activeOffers?.merchantsUsed), requested: resourceMap(village.activeOffers?.requested), alreadyDebited: Boolean(village.activeOffers?.alreadyDebited) },
        outgoingTransports: { ...resourceMap(village.outgoingTransports), alreadyDebited: Boolean(village.outgoingTransports?.alreadyDebited) },
        incomingTransports: resourceMap(village.incomingTransports),
        updatedAt: Number(village.updatedAt || Date.now()), source: village.source || 'unknown', available: village.available !== false
    });
    const getAvailableResources = (village) => {
        const item = normalizeVillage(village);
        return subtractResources(item.resources, item.activeOffers.alreadyDebited ? {} : item.activeOffers, item.outgoingTransports.alreadyDebited ? {} : item.outgoingTransports);
    };
    const getProjectedResources = (village) => {
        const item = normalizeVillage(village);
        const available = getAvailableResources(item);
        return addResources(available, item.incomingTransports, item.activeOffers.requested);
    };
    const getProjectedStorageSpace = (village) => {
        const item = normalizeVillage(village); const projected = getProjectedResources(item);
        return Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(0, item.storage - projected[resource])]));
    };
    const calculateBalancedResourceTarget = (totalResources) => {
        const total = amount(totalResources); const base = Math.floor(total / 3); const remainder = total - base * 3;
        return { wood: base + (remainder > 0 ? 1 : 0), stone: base + (remainder > 1 ? 1 : 0), iron: base };
    };
    const calculateResourceImbalance = (resources) => {
        const normalized = resourceMap(resources); const total = RESOURCES.reduce((sum, resource) => sum + normalized[resource], 0); const target = calculateBalancedResourceTarget(total);
        const surplus = {}; const deficit = {}; const percentages = {};
        RESOURCES.forEach((resource) => { surplus[resource] = Math.max(0, normalized[resource] - target[resource]); deficit[resource] = Math.max(0, target[resource] - normalized[resource]); percentages[resource] = total ? Number((normalized[resource] * 100 / total).toFixed(2)) : 0; });
        return { total, target, surplus, deficit, percentages, balanced: RESOURCES.every((resource) => normalized[resource] === target[resource]) };
    };
    const getMerchantCapacity = () => amount(
        EAS.World?.getGameData?.().config?.merchant_capacity ??
        EAS.World?.getGameData?.().merchant_capacity ??
        document.querySelector?.('[data-merchant-capacity]')?.dataset?.merchantCapacity ?? 1000
    ) || 1000;
    const calculateMerchantsRequired = (resources, capacity = getMerchantCapacity()) => Math.ceil(RESOURCES.reduce((sum, resource) => sum + amount(resources?.[resource]), 0) / Math.max(1, amount(capacity)));
    const validateTransport = ({ source, target, resources, merchantCapacity = getMerchantCapacity() }) => {
        const origin = normalizeVillage(source); const destination = normalizeVillage(target); const sent = resourceMap(resources); const available = getAvailableResources(origin); const space = getProjectedStorageSpace(destination); const merchantsRequired = calculateMerchantsRequired(sent, merchantCapacity); const reasons = [];
        if (origin.villageId && origin.villageId === destination.villageId) reasons.push('same-village');
        if (!RESOURCES.some((resource) => sent[resource] > 0)) reasons.push('zero-resources');
        if (RESOURCES.some((resource) => sent[resource] > available[resource])) reasons.push('insufficient-resources');
        if (merchantsRequired > origin.merchants.available) reasons.push('insufficient-merchants');
        if (RESOURCES.some((resource) => sent[resource] > space[resource])) reasons.push('insufficient-storage');
        return { valid: reasons.length === 0, reasons, merchantsRequired, available, destinationSpace: space };
    };
    const buildOfferPlan = (village, { maximumPerOffer = 10000, reserve = {} } = {}) => {
        const item = normalizeVillage(village); const available = subtractResources(getAvailableResources(item), resourceMap(reserve));
        const imbalance = calculateResourceImbalance(getProjectedResources(item)); const merchantCapacity = getMerchantCapacity(); let merchantsLeft = item.merchants.available; const offers = [];
        RESOURCES.forEach((offered) => RESOURCES.forEach((requested) => {
            if (offered === requested) return;
            let quantity = Math.min(available[offered], imbalance.surplus[offered], imbalance.deficit[requested]);
            while (quantity > 0 && merchantsLeft > 0) {
                const offerAmount = Math.min(quantity, amount(maximumPerOffer), merchantsLeft * merchantCapacity);
                if (!offerAmount) break;
                const merchantsRequired = Math.ceil(offerAmount / merchantCapacity);
                offers.push({ villageId: item.villageId, villageName: item.villageName, offerResource: offered, offerAmount, requestResource: requested, requestAmount: offerAmount, merchantsRequired, ratio: '1:1', status: offerAmount < quantity ? 'Parcial' : 'Pronta' });
                quantity -= offerAmount; available[offered] -= offerAmount; imbalance.deficit[requested] -= offerAmount; merchantsLeft -= merchantsRequired;
            }
        }));
        return offers;
    };
    const buildTransportPlan = ({ source, target, desiredResources }) => {
        const origin = normalizeVillage(source); const destination = normalizeVillage(target); const available = getAvailableResources(origin); const space = getProjectedStorageSpace(destination); const capacity = origin.merchants.available * getMerchantCapacity(); let capacityLeft = capacity; const resources = resourceMap();
        RESOURCES.forEach((resource) => { resources[resource] = Math.min(amount(desiredResources?.[resource]), available[resource], space[resource], capacityLeft); capacityLeft -= resources[resource]; });
        return { sourceVillageId: origin.villageId, targetVillageId: destination.villageId, resources, ...validateTransport({ source: origin, target: destination, resources }) };
    };
    const calculateGlobalResources = (villages, selector = getProjectedResources) => villages.reduce((total, village) => addResources(total, selector(village)), resourceMap());
    const applyInternalTransport = ({ sourceResources, targetResources, resources }) => ({ source: subtractResources(sourceResources, resources), target: addResources(targetResources, resources) });
    const distributeTargetNeed = ({ need, origins, merchantCapacity = getMerchantCapacity() }) => {
        const remaining = resourceMap(need); const plans = []; const states = origins.map((origin) => ({ origin: normalizeVillage(origin), available: getAvailableResources(origin) }));
        while (RESOURCES.some((resource) => remaining[resource] > 0)) {
            const active = states.filter((state) => state.origin.merchants.available > calculateMerchantsRequired(plans.filter((plan) => plan.sourceVillageId === state.origin.villageId).reduce((sum, plan) => addResources(sum, plan.resources), resourceMap()), merchantCapacity) && RESOURCES.some((resource) => state.available[resource] > 0));
            if (!active.length) break;
            const roundRemaining = { ...remaining };
            let progressed = false;
            active.forEach((state) => {
                const contribution = resourceMap(); const capacityLeft = Math.max(0, (state.origin.merchants.available - calculateMerchantsRequired(plans.filter((plan) => plan.sourceVillageId === state.origin.villageId).reduce((sum, plan) => addResources(sum, plan.resources), resourceMap()), merchantCapacity)) * merchantCapacity);
                let transportLeft = capacityLeft;
                RESOURCES.forEach((resource) => { const share = Math.ceil(roundRemaining[resource] / active.length); contribution[resource] = Math.min(share, remaining[resource], state.available[resource], transportLeft); remaining[resource] -= contribution[resource]; state.available[resource] -= contribution[resource]; transportLeft -= contribution[resource]; progressed ||= contribution[resource] > 0; });
                if (RESOURCES.some((resource) => contribution[resource] > 0)) plans.push({ sourceVillageId: state.origin.villageId, resources: contribution, merchantsRequired: calculateMerchantsRequired(contribution, merchantCapacity) });
            });
            if (!progressed) break;
        }
        return { plans, remaining };
    };

    const collectVillageData = () => {
        const listed = EAS.Villages?.list?.() || []; const current = EAS.World?.getCurrentVillage?.() || {}; const game = EAS.World?.getGameData?.() || {};
        const gameVillages = game.player?.villages || game.villages || {}; const values = Array.isArray(gameVillages) ? gameVillages : Object.values(gameVillages);
        const villages = listed.map((village) => {
            const dynamic = values.find((item) => Number(item.id) === Number(village.id)) || {};
            const isCurrent = Number(village.id) === Number(current.id);
            const merchantText = (selector) => amount(document.querySelector?.(selector)?.textContent?.replace(/\D/g, ''));
            return normalizeVillage({ ...village, ...dynamic, resources: isCurrent ? { wood: current.wood, stone: current.stone, iron: current.iron } : dynamic.resources || dynamic, storage: isCurrent ? (game.village?.storage_max || game.village?.storage || dynamic.storage) : dynamic.storage, merchantsAvailable: isCurrent ? (dynamic.merchants_available ?? merchantText('#market_merchant_available_count, .market_merchant_available')) : dynamic.merchants_available, merchantsTotal: isCurrent ? (dynamic.merchants_total ?? merchantText('#market_merchant_total_count, .market_merchant_total')) : dynamic.merchants_total, source: isCurrent ? 'game-data-current' : Object.keys(dynamic).length ? 'game-data' : 'village-cache', available: isCurrent || Boolean(dynamic.resources || dynamic.wood) });
        });
        const cache = { version: 1, world: EAS.World?.getWorldName?.() || location.hostname, updatedAt: Date.now(), villages }; saveCache(cache); return cache;
    };
    const getCache = ({ refresh = false } = {}) => refresh ? collectVillageData() : readCache() || collectVillageData();

    const openFoundationModule = (type) => {
        const meta = {
            offers: ['🔄 Ofertas Inteligentes', 'Sugestões 1:1 para corrigir o desequilíbrio global.'],
            balance: ['⚖️ Balanceamento entre Aldeias', 'Planejamento de transportes internos por proximidade.'],
            target: ['🎯 Abastecimento de Aldeia', 'Distribuição equilibrada para uma aldeia-alvo.']
        }[type];
        const win = EAS.UI.createWindow({ id: `eas-market-${type}`, title: meta[0], width: 850 }); const body = document.createElement('div'); body.className = 'market-module'; const status = document.createElement('div');
        const render = (refresh = false) => { const cache = getCache({ refresh }); const valid = cache.villages.filter((village) => village.available); const global = calculateGlobalResources(valid); const imbalance = calculateResourceImbalance(global); const merchants = cache.villages.reduce((sum, village) => ({ available: sum.available + village.merchants.available, total: sum.total + village.merchants.total }), { available: 0, total: 0 }); const offers = calculateGlobalResources(valid, (village) => village.activeOffers); const outgoing = calculateGlobalResources(valid, (village) => village.outgoingTransports); const incoming = calculateGlobalResources(valid, (village) => village.incomingTransports); const storage = valid.reduce((sum, village) => sum + village.storage, 0);
            body.innerHTML = `<p>${meta[1]}</p><div class="fake-analysis-warning">Fundação do Mercado ativa. A execução de ofertas e transportes será habilitada nas etapas específicas após validação dos dados do mundo.</div><h3>Diagnóstico do Mercado</h3><div class="market-diagnostic"><span>Aldeias lidas: <strong>${cache.villages.length}</strong></span><span>Sem dados: <strong>${cache.villages.length - valid.length}</strong></span><span>Comerciantes totais: <strong>${merchants.total}</strong></span><span>Comerciantes livres: <strong>${merchants.available}</strong></span><span>Ocupados: <strong>${Math.max(0, merchants.total - merchants.available)}</strong></span><span>Ofertas ativas: <strong>${offers.wood + offers.stone + offers.iron}</strong></span><span>Transportes de saída: <strong>${outgoing.wood + outgoing.stone + outgoing.iron}</strong></span><span>Transportes de entrada: <strong>${incoming.wood + incoming.stone + incoming.iron}</strong></span><span>Capacidade total: <strong>${storage}</strong></span><span>Madeira: <strong>${global.wood}</strong> (${imbalance.percentages.wood}%)</span><span>Argila: <strong>${global.stone}</strong> (${imbalance.percentages.stone}%)</span><span>Ferro: <strong>${global.iron}</strong> (${imbalance.percentages.iron}%)</span><span>Última atualização: <strong>${EAS.Utils.formatDateTime(cache.updatedAt)}</strong></span></div><h3>Desequilíbrio global</h3><p>Excedentes: madeira ${imbalance.surplus.wood}, argila ${imbalance.surplus.stone}, ferro ${imbalance.surplus.iron}.<br>Déficits para 33/33/33: madeira ${imbalance.deficit.wood}, argila ${imbalance.deficit.stone}, ferro ${imbalance.deficit.iron}.</p><div class="eas-actions"><button data-market-refresh>Atualizar dados do Mercado</button><button data-market-back>Voltar ao menu</button></div>`;
            body.querySelector('[data-market-refresh]').onclick = () => render(true); body.querySelector('[data-market-back]').onclick = () => { win.close(); EAS.UI.openMainWindow(); };
        }; win.body.append(body, status); render();
    };

    Object.assign(EAS.MarketEngine, { CACHE_KEY, RESOURCES, normalizeVillage, getAvailableResources, getProjectedResources, getProjectedStorageSpace, calculateBalancedResourceTarget, calculateResourceImbalance, getMerchantCapacity, calculateMerchantsRequired, validateTransport, buildOfferPlan, buildTransportPlan, calculateGlobalResources, applyInternalTransport, distributeTargetNeed, collectVillageData, getCache, openFoundationModule });
})();
