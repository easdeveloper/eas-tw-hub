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
    const calculateOfferExecutionValues = ({ totalOfferAmount, totalRequestAmount = totalOfferAmount, amountPerOffer, requestAmountPerOffer = amountPerOffer, merchantsAvailable }) => {
        const plannedOffer = amount(totalOfferAmount); const plannedRequest = amount(totalRequestAmount); const unit = amount(amountPerOffer); const requestUnit = amount(requestAmountPerOffer);
        const repeatCount = calculateOfferRepeatCount({ totalOfferAmount: plannedOffer, amountPerOffer: unit, merchantsAvailable }); const totalOfferAmountPrepared = unit * repeatCount; const totalRequestAmountPrepared = requestUnit * repeatCount;
        return { amountPerOffer: unit, requestAmountPerOffer: requestUnit, repeatCount, totalOfferAmountPrepared, totalRequestAmountPrepared, merchantsRequired: repeatCount, remainingOfferAmount: Math.max(0, plannedOffer - totalOfferAmountPrepared), remainingRequestAmount: Math.max(0, plannedRequest - totalRequestAmountPrepared) };
    };
    const calculateOfferQuantity = (options) => {
        const values = calculateOfferExecutionValues(options); const pendingAmount = values.remainingOfferAmount;
        return { valid: values.repeatCount > 0 && values.totalOfferAmountPrepared > 0 && values.totalRequestAmountPrepared > 0, amountPerOffer: values.amountPerOffer, requestAmountPerOffer: values.requestAmountPerOffer, repeatCount: values.repeatCount, totalOfferAmount: values.totalOfferAmountPrepared, totalRequestAmount: values.totalRequestAmountPrepared, plannedTotalOfferAmount: amount(options.totalOfferAmount), pendingAmount, merchantsRequired: values.merchantsRequired, status: pendingAmount > 0 ? 'Parcial' : 'Pronta' };
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
    const refreshCurrentMarketVillageFromPage = (doc = document, villageId = EAS.World?.getCurrentVillage?.().id) => {
        const key = String(villageId || ''); if (!key) throw new Error('Aldeia atual não identificada.');
        const cache = getCache(); const listed = EAS.Villages?.list?.() || []; const village = listed.find((item) => String(item.id) === key) || cacheVillages(cache).find((item) => String(item.villageId) === key) || { id: key };
        const parsed = parseMarketVillageDocument(doc, village); if (parsed.sessionExpired || !parsed.marketAvailable) throw new Error(parsed.sessionExpired ? 'Sessão expirada' : 'Mercado indisponível');
        const normalized = normalizeVillage({ ...village, ...parsed, activeOffers: parsed.activeOffers, activeOfferList: parsed.activeOfferList, source: 'market-current-page' }); normalized.status = parsed.status;
        cache.villages = Array.isArray(cache.villages) ? Object.fromEntries(cache.villages.map((item) => [String(item.villageId), item])) : (cache.villages || {}); cache.villages[key] = normalized; cache.updatedAt = Date.now(); saveCache(cache); return normalized;
    };
    const applyInternalTransportToCache = (transport) => {
        const cache = getCache(); const villages = Array.isArray(cache.villages) ? Object.fromEntries(cache.villages.map((village) => [String(village.villageId), village])) : { ...(cache.villages || {}) }; const sourceKey = String(transport.sourceVillageId); const targetKey = String(transport.targetVillageId); const sent = resourceMap(transport);
        const source = normalizeVillage(villages[sourceKey] || { id: sourceKey }); const target = normalizeVillage(villages[targetKey] || { id: targetKey }); RESOURCES.forEach((resource) => { source.resources[resource] = Math.max(0, source.resources[resource] - sent[resource]); target.incomingTransports[resource] += sent[resource]; }); source.outgoingTransports = { ...addResources(source.outgoingTransports, sent), alreadyDebited: true }; source.merchants.available = Math.max(0, source.merchants.available - amount(transport.merchantsRequired)); source.updatedAt = Date.now(); target.updatedAt = Date.now(); villages[sourceKey] = source; villages[targetKey] = target; cache.villages = villages; cache.updatedAt = Date.now(); saveCache(cache); return { source, target };
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
    const calculateVillageResourceBalance = (resources) => calculateResourceImbalance(resources);
    const buildVillageOfferPlan = ({ village, offerSize = 10000, minimumOfferSize = 100, merchantCapacity = getMerchantCapacity(), activeOffers = true, reserveConfig = {}, tolerance = 3, roundToHundreds = true } = {}) => {
        const item = normalizeVillage(village); const useProjected = activeOffers !== false; const initial = useProjected ? getProjectedResources(item) : resourceMap(item.resources); const virtual = { ...initial }; const reserve = resourceMap(reserveConfig.values || reserveConfig); let merchantsLeft = item.merchants.available; const offers = []; const minimum = Math.max(1, amount(minimumOfferSize)); const maximum = Math.max(1, amount(offerSize)); const capacity = Math.max(1, amount(merchantCapacity)); const tolerancePercent = Math.max(0, Number(tolerance) || 0); let sequence = 0;
        while (merchantsLeft > 0) {
            const balance = calculateVillageResourceBalance(virtual); const toleranceAmount = balance.total * tolerancePercent / 100; const surplus = Object.fromEntries(RESOURCES.map((resource) => [resource, balance.surplus[resource] > toleranceAmount ? balance.surplus[resource] : 0])); const deficit = Object.fromEntries(RESOURCES.map((resource) => [resource, balance.deficit[resource] > toleranceAmount ? balance.deficit[resource] : 0]));
            const offered = [...RESOURCES].sort((a, b) => surplus[b] - surplus[a] || RESOURCES.indexOf(a) - RESOURCES.indexOf(b))[0]; const requested = [...RESOURCES].sort((a, b) => deficit[b] - deficit[a] || RESOURCES.indexOf(a) - RESOURCES.indexOf(b))[0];
            if (!surplus[offered] || !deficit[requested] || offered === requested) break;
            let plannedAmount = Math.min(maximum, Math.floor(surplus[offered]), Math.floor(deficit[requested]), merchantsLeft * capacity, Math.max(0, virtual[offered] - reserve[offered])); if (roundToHundreds) plannedAmount = Math.floor(plannedAmount / 100) * 100; if (plannedAmount < minimum) break;
            const amountPerOffer = Math.min(capacity, plannedAmount); const quantity = calculateOfferQuantity({ totalOfferAmount: plannedAmount, amountPerOffer, requestAmountPerOffer: amountPerOffer, merchantsAvailable: merchantsLeft }); if (!quantity.valid) break;
            const before = { ...virtual }; const afterCreation = { ...before, [offered]: before[offered] - quantity.totalOfferAmount }; const afterAcceptance = { ...afterCreation, [requested]: afterCreation[requested] + quantity.totalRequestAmount }; sequence += 1;
            offers.push({ id: `offer-${Date.now()}-${item.villageId}-${sequence}`, villageId: item.villageId, villageName: item.villageName, villageCoord: item.villageCoord, villageSequence: sequence, offerResource: offered, offerAmount: quantity.amountPerOffer, amountPerOffer: quantity.amountPerOffer, requestResource: requested, requestAmount: quantity.requestAmountPerOffer, requestAmountPerOffer: quantity.requestAmountPerOffer, repeatCount: quantity.repeatCount, plannedTotalOfferAmount: plannedAmount, totalOfferAmount: quantity.totalOfferAmount, totalRequestAmount: quantity.totalRequestAmount, pendingAmount: quantity.pendingAmount, merchantsRequired: quantity.merchantsRequired, merchantsAvailable: item.merchants.available, ratio: '1:1', resourcesBefore: before, resourcesAfterCreation: afterCreation, resourcesAfterAcceptance: afterAcceptance, status: quantity.status, selected: true });
            Object.assign(virtual, afterAcceptance); merchantsLeft -= quantity.merchantsRequired;
        }
        const beforeBalance = calculateVillageResourceBalance(initial); const afterBalance = calculateVillageResourceBalance(virtual); const withinTolerance = (balance) => RESOURCES.every((resource) => Math.abs(balance.percentages[resource] - 100 / 3) <= tolerancePercent);
        return { village: item, offers, resourcesBefore: initial, resourcesAfter: virtual, balanceBefore: beforeBalance, balanceAfter: afterBalance, balancedBefore: withinTolerance(beforeBalance), balancedAfter: withinTolerance(afterBalance), merchantsUsed: item.merchants.available - merchantsLeft, merchantsLeft };
    };
    const buildGlobalOfferSuggestions = (villages, config = {}) => {
        const normalized = villages.map(normalizeVillage).filter((village) => village.available && village.status !== 'read-failed'); const merchantCapacity = amount(config.merchantCapacity || getMerchantCapacity()); const calculationBase = config.calculationBase || (config.considerActiveOffers === false ? 'current' : 'projected');
        const villagePlans = normalized.map((village) => buildVillageOfferPlan({ village, offerSize: config.maximumPerOffer || 10000, minimumOfferSize: config.minimumPerOffer || 100, merchantCapacity, activeOffers: calculationBase !== 'current', reserveConfig: config.reserve || {}, tolerance: config.tolerancePercent ?? 3, roundToHundreds: config.roundToHundreds !== false })); const suggestions = villagePlans.flatMap((plan) => plan.offers); const uncovered = villagePlans.reduce((total, plan) => addResources(total, plan.balanceAfter.deficit), resourceMap()); const currentResources = calculateGlobalResources(normalized, getAvailableResources); const projectedResources = calculateGlobalResources(normalized, getProjectedResources);
        return { version: 2, calculationMode: 'per-village', suggestions, villagePlans, uncovered, currentResources, projectedResources, currentImbalance: calculateResourceImbalance(currentResources), projectedImbalance: calculateResourceImbalance(projectedResources), summary: { villagesAnalyzed: villagePlans.length, villagesBalanced: villagePlans.filter((plan) => plan.balancedAfter).length, villagesUnbalanced: villagePlans.filter((plan) => !plan.balancedAfter).length, villagesWithoutMerchants: villagePlans.filter((plan) => !plan.village.merchants.available).length } };
    };
    const buildTransportPlan = ({ source, target, desiredResources }) => {
        const origin = normalizeVillage(source); const destination = normalizeVillage(target); const available = getAvailableResources(origin); const space = getProjectedStorageSpace(destination); const capacity = origin.merchants.available * getMerchantCapacity(); let capacityLeft = capacity; const resources = resourceMap();
        RESOURCES.forEach((resource) => { resources[resource] = Math.min(amount(desiredResources?.[resource]), available[resource], space[resource], capacityLeft); capacityLeft -= resources[resource]; });
        return { sourceVillageId: origin.villageId, targetVillageId: destination.villageId, resources, ...validateTransport({ source: origin, target: destination, resources }) };
    };
    const calculateGlobalResources = (villages, selector = getProjectedResources) => villages.reduce((total, village) => addResources(total, selector(village)), resourceMap());
    const calculateTargetSupplyNeed = ({ currentResources, incomingTransports, targetResources, storage }) => { const current = resourceMap(currentResources); const incoming = resourceMap(incomingTransports); const target = resourceMap(targetResources); const invalidResources = RESOURCES.filter((resource) => target[resource] > amount(storage)); const projectedCurrent = addResources(current, incoming); const need = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(0, target[resource] - projectedCurrent[resource])])); return { valid: invalidResources.length === 0, invalidResources, projectedCurrent, targetResources: target, need, storage: amount(storage) }; };
    const buildTargetSupplyPlan = ({ targetVillage, targetResources, sourceVillages = [], reserveConfig = { mode: 'storage-percent', values: { wood: 10, stone: 10, iron: 10 } }, merchantCapacity = getMerchantCapacity(), strategy = 'balanced', minimumTransport = 1000, allowSmallFinalAdjustment = false, considerIncomingAtSources = false } = {}) => {
        const target = normalizeVillage(targetVillage); const needResult = calculateTargetSupplyNeed({ currentResources: target.resources, incomingTransports: target.incomingTransports, targetResources, storage: target.storage }); if (!needResult.valid) return { ...needResult, needBefore: needResult.need, plannedResources: resourceMap(), unmetNeed: needResult.need, targetProjectedAfter: needResult.projectedCurrent, transports: [], states: [] };
        const remaining = { ...needResult.need }; const capacity = Math.max(1, amount(merchantCapacity)); const states = sourceVillages.map(normalizeVillage).filter((village) => village.villageId !== target.villageId && village.available).map((village) => { const base = getAvailableResources(village); const projected = considerIncomingAtSources ? addResources(base, village.incomingTransports) : base; const reserve = calculateVillageReserve(village, reserveConfig); const available = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(0, projected[resource] - reserve[resource])])); return { village, before: projected, projected: { ...projected }, reserve, available, merchantsLeft: village.merchants.available, contribution: resourceMap(), distance: coordinateDistance(village, target) }; });
        const allocate = (state, desired) => { const resources = distributeLimitedResources(desired, state.available, state.merchantsLeft * capacity); const total = RESOURCES.reduce((sum, resource) => sum + resources[resource], 0); if (!total) return false; const merchants = calculateMerchantsRequired(resources, capacity); RESOURCES.forEach((resource) => { state.available[resource] -= resources[resource]; state.projected[resource] -= resources[resource]; state.contribution[resource] += resources[resource]; remaining[resource] -= resources[resource]; }); state.merchantsLeft -= merchants; return true; };
        if (strategy === 'nearest') { [...states].sort((a, b) => a.distance - b.distance || b.village.merchants.available - a.village.merchants.available || RESOURCES.reduce((sum, resource) => sum + b.available[resource] - a.available[resource], 0) || a.village.villageId.localeCompare(b.village.villageId)).forEach((state) => allocate(state, remaining)); }
        else { let progressed = true; while (progressed && RESOURCES.some((resource) => remaining[resource] > 0)) { progressed = false; const roundNeed = { ...remaining }; const shares = Object.fromEntries(RESOURCES.map((resource) => { const capable = states.filter((candidate) => candidate.merchantsLeft > 0 && candidate.available[resource] > 0).length; return [resource, capable ? Math.ceil(roundNeed[resource] / capable) : 0]; })); states.forEach((state) => { if (!state.merchantsLeft) return; const desired = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.min(remaining[resource], shares[resource])])); if (allocate(state, desired)) progressed = true; }); } }
        const transports = states.filter((state) => RESOURCES.some((resource) => state.contribution[resource] > 0)).map((state, index) => { const total = RESOURCES.reduce((sum, resource) => sum + state.contribution[resource], 0); return { id: `target-${Date.now()}-${index}`, sourceVillageId: state.village.villageId, sourceVillageName: state.village.villageName, sourceCoord: state.village.villageCoord, targetVillageId: target.villageId, targetVillageName: target.villageName, targetCoord: target.villageCoord, ...state.contribution, total, merchantsRequired: calculateMerchantsRequired(state.contribution, capacity), distance: state.distance, sourceBefore: state.before, sourceAfter: state.projected, reserve: state.reserve, status: total < amount(minimumTransport) && !allowSmallFinalAdjustment ? 'Transporte abaixo do mínimo' : RESOURCES.some((resource) => remaining[resource] > 0) ? 'Parcial' : 'Pronto', selected: total >= amount(minimumTransport) || allowSmallFinalAdjustment }; });
        const accepted = transports.filter((transport) => transport.selected); const plannedResources = accepted.reduce((total, transport) => addResources(total, transport), resourceMap()); const unmetNeed = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(0, needResult.need[resource] - plannedResources[resource])])); const targetProjectedAfter = addResources(needResult.projectedCurrent, plannedResources); return { valid: true, projectedCurrent: needResult.projectedCurrent, needBefore: needResult.need, plannedResources, unmetNeed, targetProjectedAfter, targetResources: needResult.targetResources, transports, states };
    };
    const coordinateDistance = (source, target) => {
        const parse = (village) => { const match = String(village.villageCoord || village.coordinate || village.coord || '').match(/(\d+)\|(\d+)/); return match ? { x: Number(match[1]), y: Number(match[2]) } : null; };
        const a = parse(source); const b = parse(target); return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Number.POSITIVE_INFINITY;
    };
    const calculateVillageReserve = (village, config = {}) => {
        const item = normalizeVillage(village); const mode = config.mode || 'storage-percent'; const values = config.values || config;
        return Object.fromEntries(RESOURCES.map((resource) => { const configured = Number(values?.[resource] ?? 10); if (mode === 'none') return [resource, 0]; if (mode === 'fixed') return [resource, amount(configured)]; if (mode === 'resource-percent') return [resource, amount(item.resources[resource] * configured / 100)]; return [resource, amount(item.storage * configured / 100)]; }));
    };
    const distributeLimitedResources = (needs, available, capacity) => {
        const limits = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.min(amount(needs[resource]), amount(available[resource]))])); const total = RESOURCES.reduce((sum, resource) => sum + limits[resource], 0); const limit = Math.min(amount(capacity), total); const result = resourceMap(); if (!limit || !total) return result;
        let assigned = 0; RESOURCES.forEach((resource) => { result[resource] = Math.min(limits[resource], Math.floor(limit * limits[resource] / total)); assigned += result[resource]; });
        while (assigned < limit) { const resource = [...RESOURCES].sort((a, b) => (limits[b] - result[b]) - (limits[a] - result[a]) || RESOURCES.indexOf(a) - RESOURCES.indexOf(b))[0]; if (!resource || result[resource] >= limits[resource]) break; result[resource] += 1; assigned += 1; }
        return result;
    };
    const buildMarketBalancePlan = ({ villages, reserveConfig = { mode: 'storage-percent', values: { wood: 10, stone: 10, iron: 10 } }, merchantCapacity = getMerchantCapacity(), priority = 'distance', minimumTransport = 1000, allowSmallFinalAdjustments = false } = {}) => {
        const normalized = (villages || []).map(normalizeVillage).filter((village) => village.available); const count = normalized.length; const global = calculateGlobalResources(normalized, getProjectedResources); const target = Object.fromEntries(RESOURCES.map((resource) => [resource, count ? Math.floor(global[resource] / count) : 0]));
        const states = normalized.map((village) => { const projected = getProjectedResources(village); const reserve = calculateVillageReserve(village, reserveConfig); const goal = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.min(target[resource], village.storage)])); const deficit = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.min(Math.max(0, goal[resource] - projected[resource]), Math.max(0, village.storage - projected[resource]))])); const surplus = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(0, Math.min(projected[resource] - goal[resource], projected[resource] - reserve[resource]))])); return { village, before: { ...projected }, projected: { ...projected }, reserve, goal, deficit, surplus, merchantsLeft: village.merchants.available }; });
        const transports = []; const destinations = [...states].sort((a, b) => RESOURCES.reduce((sum, resource) => sum + b.deficit[resource] - a.deficit[resource], 0) || a.village.villageId.localeCompare(b.village.villageId));
        destinations.forEach((destination) => {
            while (RESOURCES.some((resource) => destination.deficit[resource] > 0)) {
                const origins = states.filter((origin) => origin !== destination && origin.merchantsLeft > 0 && RESOURCES.some((resource) => origin.surplus[resource] > 0));
                origins.sort((a, b) => priority === 'surplus' ? RESOURCES.reduce((sum, resource) => sum + b.surplus[resource] - a.surplus[resource], 0) : priority === 'merchants' ? b.merchantsLeft - a.merchantsLeft : coordinateDistance(a.village, destination.village) - coordinateDistance(b.village, destination.village) || RESOURCES.reduce((sum, resource) => sum + b.surplus[resource] - a.surplus[resource], 0) || b.merchantsLeft - a.merchantsLeft || a.village.villageId.localeCompare(b.village.villageId));
                const origin = origins[0]; if (!origin) break; const space = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(0, destination.village.storage - destination.projected[resource])])); const needs = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.min(destination.deficit[resource], space[resource])])); const available = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.min(origin.surplus[resource], needs[resource])])); const resources = distributeLimitedResources(needs, available, origin.merchantsLeft * merchantCapacity); const total = RESOURCES.reduce((sum, resource) => sum + resources[resource], 0);
                if (!total || (total < minimumTransport && !allowSmallFinalAdjustments)) { origin.merchantsLeft = 0; continue; }
                const merchantsRequired = calculateMerchantsRequired(resources, merchantCapacity); const beforeSource = { ...origin.projected }; const beforeTarget = { ...destination.projected };
                RESOURCES.forEach((resource) => { origin.projected[resource] -= resources[resource]; destination.projected[resource] += resources[resource]; origin.surplus[resource] -= resources[resource]; destination.deficit[resource] -= resources[resource]; }); origin.merchantsLeft -= merchantsRequired;
                transports.push({ id: `balance-${Date.now()}-${transports.length}`, sourceVillageId: origin.village.villageId, sourceVillageName: origin.village.villageName, sourceCoord: origin.village.villageCoord, targetVillageId: destination.village.villageId, targetVillageName: destination.village.villageName, targetCoord: destination.village.villageCoord, distance: coordinateDistance(origin.village, destination.village), ...resources, total, merchantsRequired, sourceBefore: beforeSource, sourceAfter: { ...origin.projected }, targetBefore: beforeTarget, targetAfter: { ...destination.projected }, status: RESOURCES.some((resource) => destination.deficit[resource] > 0) ? 'Parcial' : 'Pronto', selected: true });
            }
        });
        const remainingDeficits = states.reduce((total, state) => addResources(total, state.deficit), resourceMap()); const afterGlobal = states.reduce((total, state) => addResources(total, state.projected), resourceMap());
        return { transports, states, global, afterGlobal, targetPerVillage: target, remainingDeficits, totalsPreserved: RESOURCES.every((resource) => global[resource] === afterGlobal[resource]) };
    };
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
            target: ['🎯 Envio Coordenado', 'Distribuição equilibrada para uma aldeia-alvo.']
        }[type];
        const win = EAS.UI.createWindow({ id: `eas-market-${type}`, title: meta[0], width: 850 }); const body = document.createElement('div'); body.className = 'market-module'; const status = document.createElement('div');
        const render = (refresh = false) => { const cache = getCache({ refresh }); const allVillages = cacheVillages(cache); const valid = allVillages.filter((village) => village.available); const global = calculateGlobalResources(valid); const imbalance = calculateResourceImbalance(global); const merchants = allVillages.reduce((sum, village) => ({ available: sum.available + village.merchants.available, total: sum.total + village.merchants.total }), { available: 0, total: 0 }); const offers = calculateGlobalResources(valid, (village) => village.activeOffers); const outgoing = calculateGlobalResources(valid, (village) => village.outgoingTransports); const incoming = calculateGlobalResources(valid, (village) => village.incomingTransports); const storage = valid.reduce((sum, village) => sum + village.storage, 0);
            body.innerHTML = `<p>${meta[1]}</p><div class="fake-analysis-warning">Fundação do Mercado ativa. A execução de ofertas e transportes será habilitada nas etapas específicas após validação dos dados do mundo.</div><h3>Diagnóstico do Mercado</h3><div class="market-diagnostic"><span>Aldeias lidas: <strong>${allVillages.length}</strong></span><span>Sem dados: <strong>${allVillages.length - valid.length}</strong></span><span>Comerciantes totais: <strong>${merchants.total}</strong></span><span>Comerciantes livres: <strong>${merchants.available}</strong></span><span>Ocupados: <strong>${Math.max(0, merchants.total - merchants.available)}</strong></span><span>Ofertas ativas: <strong>${offers.wood + offers.stone + offers.iron}</strong></span><span>Transportes de saída: <strong>${outgoing.wood + outgoing.stone + outgoing.iron}</strong></span><span>Transportes de entrada: <strong>${incoming.wood + incoming.stone + incoming.iron}</strong></span><span>Capacidade total: <strong>${storage}</strong></span><span>Madeira: <strong>${global.wood}</strong> (${imbalance.percentages.wood}%)</span><span>Argila: <strong>${global.stone}</strong> (${imbalance.percentages.stone}%)</span><span>Ferro: <strong>${global.iron}</strong> (${imbalance.percentages.iron}%)</span><span>Última atualização: <strong>${EAS.Utils.formatDateTime(cache.updatedAt)}</strong></span></div><h3>Desequilíbrio global</h3><p>Excedentes: madeira ${imbalance.surplus.wood}, argila ${imbalance.surplus.stone}, ferro ${imbalance.surplus.iron}.<br>Déficits para 33/33/33: madeira ${imbalance.deficit.wood}, argila ${imbalance.deficit.stone}, ferro ${imbalance.deficit.iron}.</p><div class="eas-actions"><button data-market-refresh>Atualizar dados do Mercado</button><button data-market-back>Voltar ao menu</button></div>`;
            body.querySelector('[data-market-refresh]').onclick = () => render(true); body.querySelector('[data-market-back]').onclick = () => { win.close(); EAS.UI.openMainWindow(); };
        }; win.body.append(body, status); render();
    };

    Object.assign(EAS.MarketEngine, { CACHE_KEY, RESOURCES, normalizeVillage, getAvailableResources, getProjectedResources, getProjectedStorageSpace, calculateBalancedResourceTarget, calculateResourceImbalance, calculateVillageResourceBalance, calculateTargetSupplyNeed, getMerchantCapacity, calculateMerchantsRequired, calculateOfferRepeatCount, calculateOfferExecutionValues, calculateOfferQuantity, splitOfferAmount, aggregateActiveOffers, parseMarketVillageDocument, refreshMarketVillage, refreshCurrentMarketVillageFromPage, refreshAllVillages, applyCreatedOfferToCache, applyInternalTransportToCache, validateTransport, coordinateDistance, calculateVillageReserve, distributeLimitedResources, buildMarketBalancePlan, buildTargetSupplyPlan, buildOfferPlan, buildVillageOfferPlan, buildGlobalOfferSuggestions, buildTransportPlan, calculateGlobalResources, applyInternalTransport, distributeTargetNeed, collectVillageData, getCache, cacheVillages, openFoundationModule });
})();
