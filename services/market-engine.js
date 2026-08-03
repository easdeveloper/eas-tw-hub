(() => {
    'use strict';
    EAS.MarketEngine = EAS.MarketEngine || {};
    const CACHE_KEY = 'eas_tw_market_cache';
    const RESOURCES = ['wood', 'stone', 'iron'];
    const amount = (value) => Math.max(0, Math.floor(Number(value) || 0));
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const resourceMap = (value = {}) => Object.fromEntries(RESOURCES.map((resource) => [resource, amount(value[resource])]));
    const addResources = (...values) => Object.fromEntries(RESOURCES.map((resource) => [resource, values.reduce((sum, value) => sum + Number(value?.[resource] || 0), 0)]));
    const subtractResources = (base, ...values) => Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(0, Number(base?.[resource] || 0) - values.reduce((sum, value) => sum + Number(value?.[resource] || 0), 0))]));
    const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; } };
    const saveCache = (cache) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); return true; } catch { return false; } };
    const cacheVillages = (cache) => Array.isArray(cache?.villages) ? cache.villages : Object.values(cache?.villages || {});

    const normalizeVillage = (village = {}) => ({
        villageId: String(village.villageId ?? village.id ?? ''),
        villageName: village.villageName ?? village.name ?? 'Aldeia desconhecida',
        villageCoord: village.villageCoord ?? village.coordinate ?? village.coord ?? (village.x != null && village.y != null ? `${village.x}|${village.y}` : ''),
        resources: resourceMap(village.resources || village), storage: amount(village.storage ?? village.warehouse),
        merchants: { available: amount(village.merchants?.available ?? village.merchantsAvailable), total: amount(village.merchants?.total ?? village.merchantsTotal) },
        activeOffers: Array.isArray(village.activeOffers)
            ? { ...aggregateActiveOffers(village.activeOffers), alreadyDebited: false }
            : { ...resourceMap(village.activeOffers), merchantsUsed: amount(village.activeOffers?.merchantsUsed), requested: resourceMap(village.activeOffers?.requested), alreadyDebited: Boolean(village.activeOffers?.alreadyDebited) },
        activeOfferList: [...(village.activeOfferList || (Array.isArray(village.activeOffers) ? village.activeOffers : []))],
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
    const calculateOfferRepeatCount = ({ totalOfferAmount, amountPerOffer, merchantsAvailable }) => {
        const total = amount(totalOfferAmount); const unit = amount(amountPerOffer); const available = amount(merchantsAvailable);
        if (!total || !unit || !available) return 0;
        return Math.min(Math.floor(total / unit), available);
    };
    const calculateOfferQuantity = ({ totalOfferAmount, amountPerOffer, requestAmountPerOffer = amountPerOffer, merchantsAvailable }) => {
        const plannedTotal = amount(totalOfferAmount); const unit = amount(amountPerOffer); const requestUnit = amount(requestAmountPerOffer);
        const repeatCount = calculateOfferRepeatCount({ totalOfferAmount: plannedTotal, amountPerOffer: unit, merchantsAvailable });
        const totalOfferAmountPrepared = unit * repeatCount; const totalRequestAmountPrepared = requestUnit * repeatCount; const pendingAmount = Math.max(0, plannedTotal - totalOfferAmountPrepared);
        return { valid: repeatCount > 0 && totalOfferAmountPrepared > 0 && totalRequestAmountPrepared > 0, amountPerOffer: unit, requestAmountPerOffer: requestUnit, repeatCount, totalOfferAmount: totalOfferAmountPrepared, totalRequestAmount: totalRequestAmountPrepared, plannedTotalOfferAmount: plannedTotal, pendingAmount, merchantsRequired: repeatCount, status: pendingAmount > 0 ? 'Parcial' : 'Pronta' };
    };
    const splitOfferAmount = (total, { maximum = 10000, minimum = 100, roundToHundreds = false } = {}) => {
        let remaining = amount(total); const blocks = []; const max = Math.max(1, amount(maximum)); const min = Math.max(1, amount(minimum));
        while (remaining >= min) {
            let block = Math.min(remaining, max);
            if (roundToHundreds) block = Math.floor(block / 100) * 100;
            if (block < min || block <= 0) break;
            blocks.push(block); remaining -= block;
        }
        return { blocks, remainder: remaining };
    };

    const aggregateActiveOffers = (offers = []) => offers.reduce((aggregate, offer) => {
        const repeatCount = Math.max(1, amount(offer.repeatCount || offer.quantity || 1));
        const totalOffered = amount(offer.totalOfferAmount || (amount(offer.offerAmount) * repeatCount));
        const totalRequested = amount(offer.totalRequestAmount || (amount(offer.requestAmount) * repeatCount));
        aggregate[offer.offerResource] = amount(aggregate[offer.offerResource]) + totalOffered;
        aggregate.requested[offer.requestResource] = amount(aggregate.requested[offer.requestResource]) + totalRequested;
        aggregate.merchantsUsed += amount(offer.merchantsUsed || offer.merchantsRequired);
        return aggregate;
    }, { wood: 0, stone: 0, iron: 0, requested: resourceMap(), merchantsUsed: 0 });

    const parseMarketVillageDocument = (doc, village = {}) => {
        const textNumber = (selectors) => {
            const element = selectors.split(',').map((selector) => doc.querySelector(selector.trim())).find(Boolean);
            return element ? amount((element.dataset?.value || element.textContent || '').replace(/[^\d]/g, '')) : 0;
        };
        const resources = { wood: textNumber('#wood, [data-resource="wood"]'), stone: textNumber('#stone, [data-resource="stone"]'), iron: textNumber('#iron, [data-resource="iron"]') };
        const storage = textNumber('#storage, [data-storage]');
        const merchantArea = doc.querySelector('#market_merchant_available_count, .market_merchant_available, #content_value');
        const merchantMatch = String(merchantArea?.textContent || '').match(/(\d[\d.]*)\s*\/\s*(\d[\d.]*)/);
        const merchantsAvailable = textNumber('#market_merchant_available_count, .market_merchant_available') || amount(merchantMatch?.[1]?.replace(/\D/g, ''));
        const merchantsTotal = textNumber('#market_merchant_total_count, .market_merchant_total') || amount(merchantMatch?.[2]?.replace(/\D/g, ''));
        const offerRows = [...doc.querySelectorAll('#own_offers_table tr, [data-own-offer], .own_offer')];
        const activeOfferList = offerRows.map((row, index) => {
            const findResource = (kind) => row.querySelector(`[data-${kind}-resource]`)?.dataset?.[`${kind}Resource`] || row.querySelector(`[name*="${kind}_resource"]`)?.value || row.querySelector(`.${kind} img[src*="wood"], .${kind} img[src*="stone"], .${kind} img[src*="iron"]`)?.src?.match(/(wood|stone|iron)/)?.[1];
            const iconResources = [...row.querySelectorAll('img[src*="wood"], img[src*="stone"], img[src*="iron"]')].map((image) => image.src.match(/(wood|stone|iron)/)?.[1]).filter(Boolean);
            const offerResource = findResource('offer') || row.dataset.offerResource || iconResources[0];
            const requestResource = findResource('request') || row.dataset.requestResource || iconResources[1];
            const numbers = [...row.textContent.matchAll(/\d[\d.]*/g)].map((match) => amount(match[0].replace(/\D/g, ''))).filter(Boolean);
            if (!RESOURCES.includes(offerResource) || !RESOURCES.includes(requestResource)) return null;
            const offerAmount = amount(row.dataset.offerAmount || numbers[0]); const requestAmount = amount(row.dataset.requestAmount || numbers[1]);
            const quantityElement = row.querySelector('[data-quantity], .offer-count, .quantity, [title*="vez"]');
            const repeatCount = Math.max(1, amount(row.dataset.quantity || row.dataset.repeatCount || quantityElement?.dataset?.quantity || quantityElement?.textContent || numbers[2] || 1));
            const totalOfferAmount = offerAmount * repeatCount; const totalRequestAmount = requestAmount * repeatCount;
            return { offerId: row.dataset.offerId || `${village.id || village.villageId}-${index}`, villageId: String(village.id || village.villageId), offerResource, offerAmount, requestResource, requestAmount, repeatCount, totalOfferAmount, totalRequestAmount, merchantsUsed: calculateMerchantsRequired({ [offerResource]: totalOfferAmount }), status: 'active' };
        }).filter(Boolean);
        const sessionExpired = Boolean(doc.querySelector('form#login, input[name="password"]'));
        const marketAvailable = Boolean(doc.querySelector('#market_merchant_available_count, form[action*="screen=market"], #own_offers_table, #content_value')) && !sessionExpired;
        const complete = RESOURCES.some((resource) => resources[resource] > 0) && storage > 0;
        return { resources, storage, merchants: { available: merchantsAvailable, total: merchantsTotal, occupied: Math.max(0, merchantsTotal - merchantsAvailable) }, activeOfferList, activeOffers: { ...aggregateActiveOffers(activeOfferList), alreadyDebited: true }, sessionExpired, marketAvailable, status: sessionExpired ? 'session-expired' : !marketAvailable ? 'market-unavailable' : complete ? (merchantsAvailable ? 'ready' : 'no-free-merchants') : 'incomplete', updatedAt: Date.now(), available: complete };
    };

    const refreshAllVillages = async ({ onProgress = () => {}, shouldCancel = () => false, delayMs = 250 } = {}) => {
        const listed = EAS.Villages?.list?.() || []; const previous = getCache(); const previousMap = Object.fromEntries(cacheVillages(previous).map((village) => [String(village.villageId), village])); const result = {};
        for (let index = 0; index < listed.length; index += 1) {
            const village = listed[index];
            if (shouldCancel()) break;
            onProgress({ index: index + 1, total: listed.length, village, status: 'updating' });
            try {
                const url = new URL('/game.php', location.origin); url.searchParams.set('village', village.id); url.searchParams.set('screen', 'market'); url.searchParams.set('mode', 'own_offer');
                const response = await fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const html = await response.text(); const doc = new DOMParser().parseFromString(html, 'text/html'); const parsed = parseMarketVillageDocument(doc, village);
                result[String(village.id)] = normalizeVillage({ ...village, ...parsed, activeOffers: parsed.activeOffers, activeOfferList: parsed.activeOfferList, source: 'market-page' });
                result[String(village.id)].status = parsed.status; result[String(village.id)].activeOfferList = parsed.activeOfferList;
                onProgress({ index: index + 1, total: listed.length, village, status: parsed.status });
                if (parsed.sessionExpired) break;
            } catch (error) {
                result[String(village.id)] = { ...(previousMap[String(village.id)] || normalizeVillage(village)), status: 'read-failed', error: error.message, available: false, updatedAt: Date.now() };
                onProgress({ index: index + 1, total: listed.length, village, status: 'read-failed', error });
            }
            if (index < listed.length - 1 && !shouldCancel()) await wait(Math.max(0, delayMs));
        }
        listed.forEach((village) => { if (!result[String(village.id)]) result[String(village.id)] = previousMap[String(village.id)] || normalizeVillage({ ...village, available: false }); });
        const cache = { version: 1, world: EAS.World?.getWorldName?.() || location.hostname, playerId: String(EAS.World?.getPlayer?.().id || ''), updatedAt: Date.now(), merchantCapacity: getMerchantCapacity(), villages: result }; saveCache(cache); return cache;
    };
    const refreshMarketVillage = async (villageId) => {
        const cache = getCache(); const key = String(villageId); const listed = EAS.Villages?.list?.() || [];
        const village = listed.find((item) => String(item.id) === key) || cacheVillages(cache).find((item) => String(item.villageId) === key) || { id: key };
        const url = new URL('/game.php', location.origin); url.searchParams.set('village', key); url.searchParams.set('screen', 'market'); url.searchParams.set('mode', 'own_offer');
        const response = await fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html'); const parsed = parseMarketVillageDocument(doc, village);
        if (parsed.sessionExpired || !parsed.marketAvailable) throw new Error(parsed.sessionExpired ? 'Sessão expirada' : 'Mercado indisponível');
        const normalized = normalizeVillage({ ...village, ...parsed, activeOffers: parsed.activeOffers, activeOfferList: parsed.activeOfferList, source: 'market-page' }); normalized.status = parsed.status;
        cache.villages = Array.isArray(cache.villages) ? Object.fromEntries(cache.villages.map((item) => [String(item.villageId), item])) : (cache.villages || {});
        cache.villages[key] = normalized; cache.updatedAt = Date.now(); saveCache(cache); return normalized;
    };
    const applyCreatedOfferToCache = (item) => {
        const cache = getCache(); const key = String(item.villageId); const villages = Array.isArray(cache.villages) ? Object.fromEntries(cache.villages.map((village) => [String(village.villageId), village])) : { ...(cache.villages || {}) };
        const village = normalizeVillage(villages[key] || { id: key }); const repeatCount = Math.max(1, amount(item.repeatCount || 1));
        const totalOfferAmount = amount(item.totalOfferAmount || amount(item.offerAmount) * repeatCount); const totalRequestAmount = amount(item.totalRequestAmount || amount(item.requestAmount) * repeatCount);
        const activeOffer = { offerId: item.offerId || `optimistic-${item.id}`, villageId: key, offerResource: item.offerResource, offerAmount: amount(item.offerAmount), requestResource: item.requestResource, requestAmount: amount(item.requestAmount), repeatCount, totalOfferAmount, totalRequestAmount, merchantsUsed: amount(item.merchantsRequired || calculateMerchantsRequired({ [item.offerResource]: totalOfferAmount })), status: 'active', optimistic: true };
        village.resources[item.offerResource] = Math.max(0, village.resources[item.offerResource] - totalOfferAmount);
        village.activeOfferList = [...village.activeOfferList.filter((offer) => offer.offerId !== activeOffer.offerId), activeOffer]; village.activeOffers = { ...aggregateActiveOffers(village.activeOfferList), alreadyDebited: true };
        village.merchants.available = Math.max(0, village.merchants.available - activeOffer.merchantsUsed); village.updatedAt = Date.now(); village.source = 'optimistic-offer-created';
        villages[key] = village; cache.villages = villages; cache.updatedAt = Date.now(); saveCache(cache); return village;
    };
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
    const buildGlobalOfferSuggestions = (villages, config = {}) => {
        const options = { maximum: amount(config.maximumPerOffer || 10000), minimum: amount(config.minimumPerOffer || 100), roundToHundreds: config.roundToHundreds !== false };
        const normalized = villages.map(normalizeVillage).filter((village) => village.available && village.status !== 'read-failed');
        const selector = config.considerActiveOffers === false ? (village) => getAvailableResources({ ...village, activeOffers: resourceMap() }) : getProjectedResources;
        const scenario = calculateGlobalResources(normalized, selector); const imbalance = calculateResourceImbalance(scenario); const merchantCapacity = amount(config.merchantCapacity || getMerchantCapacity());
        const merchantUsage = new Map(normalized.map((village) => [village.villageId, 0])); const availableByVillage = new Map(normalized.map((village) => [village.villageId, subtractResources(getAvailableResources(village), resourceMap(config.reserve))]));
        const suggestions = []; const uncovered = resourceMap(); let sequence = 0;
        RESOURCES.forEach((offered) => RESOURCES.forEach((requested) => {
            if (offered === requested) return;
            let required = Math.min(imbalance.surplus[offered], imbalance.deficit[requested]);
            const candidates = normalized.filter((village) => availableByVillage.get(village.villageId)[offered] >= options.minimum && village.merchants.available > 0)
                .sort((a, b) => availableByVillage.get(b.villageId)[offered] - availableByVillage.get(a.villageId)[offered] || b.merchants.available - a.merchants.available || a.activeOfferList.length - b.activeOfferList.length || a.villageId.localeCompare(b.villageId));
            let cursor = 0; let idle = 0;
            while (required >= options.minimum && candidates.length && idle < candidates.length) {
                const village = candidates[cursor % candidates.length]; cursor += 1;
                const used = merchantUsage.get(village.villageId); const merchantsLeft = village.merchants.available - used; const available = availableByVillage.get(village.villageId)[offered];
                const raw = Math.min(required, options.maximum, merchantsLeft * merchantCapacity, available);
                const split = splitOfferAmount(raw, options); const plannedAmount = split.blocks[0] || 0; const amountPerOffer = Math.min(merchantCapacity, plannedAmount);
                const quantity = calculateOfferQuantity({ totalOfferAmount: plannedAmount, amountPerOffer, requestAmountPerOffer: amountPerOffer, merchantsAvailable: merchantsLeft });
                const duplicate = config.avoidDuplicates !== false && village.activeOfferList.some((offer) => offer.offerResource === offered && offer.requestResource === requested && amount(offer.offerAmount) === quantity.amountPerOffer && amount(offer.requestAmount) === quantity.requestAmountPerOffer);
                if (!quantity.valid || duplicate) { idle += 1; continue; }
                idle = 0; const before = { ...getAvailableResources(village) }; const afterCreation = { ...before, [offered]: before[offered] - quantity.totalOfferAmount }; const afterAcceptance = { ...afterCreation, [requested]: afterCreation[requested] + quantity.totalRequestAmount };
                suggestions.push({ id: `offer-${Date.now()}-${sequence++}`, villageId: village.villageId, villageName: village.villageName, villageCoord: village.villageCoord, offerResource: offered, offerAmount: quantity.amountPerOffer, amountPerOffer: quantity.amountPerOffer, requestResource: requested, requestAmount: quantity.requestAmountPerOffer, requestAmountPerOffer: quantity.requestAmountPerOffer, repeatCount: quantity.repeatCount, plannedTotalOfferAmount: plannedAmount, totalOfferAmount: quantity.totalOfferAmount, totalRequestAmount: quantity.totalRequestAmount, pendingAmount: quantity.pendingAmount, merchantsRequired: quantity.merchantsRequired, merchantsAvailable: village.merchants.available, ratio: '1:1', resourcesBefore: before, resourcesAfterCreation: afterCreation, resourcesAfterAcceptance: afterAcceptance, status: quantity.status, selected: true });
                merchantUsage.set(village.villageId, used + quantity.merchantsRequired); availableByVillage.get(village.villageId)[offered] -= quantity.totalOfferAmount; required -= quantity.totalOfferAmount; imbalance.surplus[offered] -= quantity.totalOfferAmount; imbalance.deficit[requested] -= quantity.totalOfferAmount;
            }
            if (required > 0) uncovered[requested] += required;
        }));
        return { suggestions, uncovered, currentResources: calculateGlobalResources(normalized, getAvailableResources), projectedResources: scenario, currentImbalance: calculateResourceImbalance(calculateGlobalResources(normalized, getAvailableResources)), projectedImbalance: calculateResourceImbalance(scenario) };
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
        const cache = { version: 1, world: EAS.World?.getWorldName?.() || location.hostname, playerId: String(EAS.World?.getPlayer?.().id || ''), updatedAt: Date.now(), merchantCapacity: getMerchantCapacity(), villages: Object.fromEntries(villages.map((village) => [village.villageId, village])) }; saveCache(cache); return cache;
    };
    const getCache = ({ refresh = false } = {}) => refresh ? collectVillageData() : readCache() || collectVillageData();

    const openFoundationModule = (type) => {
        const meta = {
            offers: ['🔄 Ofertas Inteligentes', 'Sugestões 1:1 para corrigir o desequilíbrio global.'],
            balance: ['⚖️ Balanceamento entre Aldeias', 'Planejamento de transportes internos por proximidade.'],
            target: ['🎯 Abastecimento de Aldeia', 'Distribuição equilibrada para uma aldeia-alvo.']
        }[type];
        const win = EAS.UI.createWindow({ id: `eas-market-${type}`, title: meta[0], width: 850 }); const body = document.createElement('div'); body.className = 'market-module'; const status = document.createElement('div');
        const render = (refresh = false) => { const cache = getCache({ refresh }); const allVillages = cacheVillages(cache); const valid = allVillages.filter((village) => village.available); const global = calculateGlobalResources(valid); const imbalance = calculateResourceImbalance(global); const merchants = allVillages.reduce((sum, village) => ({ available: sum.available + village.merchants.available, total: sum.total + village.merchants.total }), { available: 0, total: 0 }); const offers = calculateGlobalResources(valid, (village) => village.activeOffers); const outgoing = calculateGlobalResources(valid, (village) => village.outgoingTransports); const incoming = calculateGlobalResources(valid, (village) => village.incomingTransports); const storage = valid.reduce((sum, village) => sum + village.storage, 0);
            body.innerHTML = `<p>${meta[1]}</p><div class="fake-analysis-warning">Fundação do Mercado ativa. A execução de ofertas e transportes será habilitada nas etapas específicas após validação dos dados do mundo.</div><h3>Diagnóstico do Mercado</h3><div class="market-diagnostic"><span>Aldeias lidas: <strong>${allVillages.length}</strong></span><span>Sem dados: <strong>${allVillages.length - valid.length}</strong></span><span>Comerciantes totais: <strong>${merchants.total}</strong></span><span>Comerciantes livres: <strong>${merchants.available}</strong></span><span>Ocupados: <strong>${Math.max(0, merchants.total - merchants.available)}</strong></span><span>Ofertas ativas: <strong>${offers.wood + offers.stone + offers.iron}</strong></span><span>Transportes de saída: <strong>${outgoing.wood + outgoing.stone + outgoing.iron}</strong></span><span>Transportes de entrada: <strong>${incoming.wood + incoming.stone + incoming.iron}</strong></span><span>Capacidade total: <strong>${storage}</strong></span><span>Madeira: <strong>${global.wood}</strong> (${imbalance.percentages.wood}%)</span><span>Argila: <strong>${global.stone}</strong> (${imbalance.percentages.stone}%)</span><span>Ferro: <strong>${global.iron}</strong> (${imbalance.percentages.iron}%)</span><span>Última atualização: <strong>${EAS.Utils.formatDateTime(cache.updatedAt)}</strong></span></div><h3>Desequilíbrio global</h3><p>Excedentes: madeira ${imbalance.surplus.wood}, argila ${imbalance.surplus.stone}, ferro ${imbalance.surplus.iron}.<br>Déficits para 33/33/33: madeira ${imbalance.deficit.wood}, argila ${imbalance.deficit.stone}, ferro ${imbalance.deficit.iron}.</p><div class="eas-actions"><button data-market-refresh>Atualizar dados do Mercado</button><button data-market-back>Voltar ao menu</button></div>`;
            body.querySelector('[data-market-refresh]').onclick = () => render(true); body.querySelector('[data-market-back]').onclick = () => { win.close(); EAS.UI.openMainWindow(); };
        }; win.body.append(body, status); render();
    };

    Object.assign(EAS.MarketEngine, { CACHE_KEY, RESOURCES, normalizeVillage, getAvailableResources, getProjectedResources, getProjectedStorageSpace, calculateBalancedResourceTarget, calculateResourceImbalance, getMerchantCapacity, calculateMerchantsRequired, calculateOfferRepeatCount, calculateOfferQuantity, splitOfferAmount, aggregateActiveOffers, parseMarketVillageDocument, refreshMarketVillage, refreshAllVillages, applyCreatedOfferToCache, validateTransport, buildOfferPlan, buildGlobalOfferSuggestions, buildTransportPlan, calculateGlobalResources, applyInternalTransport, distributeTargetNeed, collectVillageData, getCache, cacheVillages, openFoundationModule });
})();
