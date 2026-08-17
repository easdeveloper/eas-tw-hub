(() => {
    'use strict';
    EAS.MarketEngine = EAS.MarketEngine || {};
    const CACHE_KEY = 'eas_tw_market_cache';
    const RESOURCES = ['wood', 'stone', 'iron'];
    const INTELLIGENCE_WEIGHTS = Object.freeze({
        toleranceMinPercent: 30, toleranceMaxPercent: 36, overflowThreshold: 0.85, storageSafetyRatio: 0.98,
        development: Object.freeze({ points: 0.35, storage: 0.20, resourceScarcity: 0.30, merchants: 0.15 }),
        destination: Object.freeze({ deficit: 1, development: 0.65, operational: 0.20, overflowPenalty: 0.80 }),
        origin: Object.freeze({ surplus: 1, overflow: 0.75, merchants: 0.20, distance: 0.15 }),
        modes: Object.freeze({ global: Object.freeze({ developmentBoost: 0.25 }), development: Object.freeze({ developmentBoost: 1 }), conservative: Object.freeze({ developmentBoost: 0.05 }) })
    });
    const inFlightVillageRequests = new Map();
    const inFlightNetworkRequests = new Map();
    const inFlightNetworkProgress = new Map();
    const inFlightTransportRequests = new Map();
    const amount = (value) => Math.max(0, Math.floor(Number(value) || 0));
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const resourceMap = (value = {}) => Object.fromEntries(RESOURCES.map((resource) => [resource, amount(value[resource])]));
    const addResources = (...values) => Object.fromEntries(RESOURCES.map((resource) => [resource, values.reduce((sum, value) => sum + Number(value?.[resource] || 0), 0)]));
    const subtractResources = (base, ...values) => Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(0, Number(base?.[resource] || 0) - values.reduce((sum, value) => sum + Number(value?.[resource] || 0), 0))]));
    const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; } };
    const saveCache = (cache) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); return true; } catch { return false; } };
    const cacheVillages = (cache) => { const cached = Array.isArray(cache?.villages) ? cache.villages : Object.values(cache?.villages || {}); const owned = EAS.Villages?.getAll?.() || EAS.Villages?.list?.() || []; if (!owned.length) return cached; const ids = new Set(owned.map((village) => String(village.id))); return cached.filter((village) => ids.has(String(village.villageId || village.id))); };
    const requestMarketVillage = (village) => { const key = String(village?.id ?? village?.villageId ?? ''); if (inFlightVillageRequests.has(key)) return inFlightVillageRequests.get(key); const request = (async () => { const perfMark = EAS.Utils.Perf?.start('market.village-request', { villageId: key }); const url = new URL('/game.php', location.origin); url.searchParams.set('village', key); url.searchParams.set('screen', 'market'); url.searchParams.set('mode', 'own_offer'); const response = await fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const html = await response.text(); const doc = new DOMParser().parseFromString(html, 'text/html'); const parsed = parseMarketVillageDocument(doc, village); EAS.Utils.Perf?.end(perfMark, { status: parsed.status }); return { parsed, normalized: normalizeVillage({ ...village, ...parsed, activeOffers: parsed.activeOffers, activeOfferList: parsed.activeOfferList, source: 'market-page' }) }; })().finally(() => inFlightVillageRequests.delete(key)); inFlightVillageRequests.set(key, request); return request; };

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
        points: amount(village.points ?? village.villagePoints), production: resourceMap(village.production), farmCapacity: amount(village.farmCapacity ?? village.farm?.capacity), farmUsed: amount(village.farmUsed ?? village.farm?.used),
        updatedAt: Number(village.updatedAt || Date.now()), source: village.source || 'unknown', available: village.available !== false
    });
    const getAvailableResources = (village) => {
        return getEconomicState(village).committed;
    };
    const getProjectedResources = (village) => {
        return getEconomicState(village).potential;
    };
    const getConfirmedProjectedResources = (village) => getEconomicState(village).confirmed;
    const getCommittedResources = (village) => getEconomicState(village).committed;
    const getEconomicState = (village) => {
        const item = normalizeVillage(village); const physical = resourceMap(item.resources);
        const outgoingNotDebited = item.outgoingTransports.alreadyDebited ? resourceMap() : resourceMap(item.outgoingTransports);
        const confirmed = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(0, physical[resource] + item.incomingTransports[resource] - outgoingNotDebited[resource])]));
        const offeredNotDebited = item.activeOffers.alreadyDebited ? resourceMap() : resourceMap(item.activeOffers);
        const committed = subtractResources(confirmed, offeredNotDebited);
        // Accepted offers can briefly remain visible while their resulting transport is already
        // present. Without a native correlation id, confirmed incoming wins over potential return.
        const reconciledRequested = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.min(item.activeOffers.requested[resource], item.incomingTransports[resource])]));
        const pendingRequested = subtractResources(item.activeOffers.requested, reconciledRequested);
        const potential = addResources(committed, pendingRequested);
        return { villageId: item.villageId, physical, confirmed, committed, potential, incoming: resourceMap(item.incomingTransports), outgoing: resourceMap(item.outgoingTransports), offered: resourceMap(item.activeOffers), requested: resourceMap(item.activeOffers.requested), pendingRequested, reconciliation: { strategy: 'confirmed-incoming-wins', requestedCoveredByIncoming: reconciledRequested, conservative: RESOURCES.some((resource) => reconciledRequested[resource] > 0) } };
    };
    const withEconomicState = (village) => { const item = normalizeVillage(village); const economic = getEconomicState(item); return { ...item, ...economic, economic }; };
    const transportFingerprint = (transport = {}) => String(transport.transportId || transport.id || [
        transport.originVillageId || transport.sourceVillageId || '',
        transport.destinationVillageId || transport.targetVillageId || '',
        ...RESOURCES.map((resource) => amount(transport.resources?.[resource] ?? transport[resource])),
        transport.departureAt || '', transport.arrivalAt || ''
    ].join(':'));
    const classifyMarketMovement = (movement = {}) => {
        const status = String(movement.status || movement.type || '').toLowerCase();
        if (/complete|arrived|conclu/.test(status)) return 'COMPLETED_TRANSPORT';
        if (/incoming|entrad|receb/.test(status)) return 'INCOMING_TRANSPORT';
        if (/outgoing|sa[ií]d|envi/.test(status)) return 'OUTGOING_TRANSPORT';
        return 'OPEN_OFFER';
    };
    const deduplicateMarketMovements = (movements = []) => {
        const seen = new Set();
        return movements.filter((movement) => { const key = transportFingerprint(movement); if (seen.has(key)) return false; seen.add(key); return true; });
    };
    const createMarketVillageState = (village, movements = []) => {
        const item = normalizeVillage(village); const confirmed = deduplicateMarketMovements(movements).filter((entry) => ['INCOMING_TRANSPORT', 'OUTGOING_TRANSPORT'].includes(classifyMarketMovement(entry)));
        const incomingEntries = confirmed.filter((entry) => classifyMarketMovement(entry) === 'INCOMING_TRANSPORT'); const outgoingEntries = confirmed.filter((entry) => classifyMarketMovement(entry) === 'OUTGOING_TRANSPORT');
        const incoming = incomingEntries.length ? addResources(...incomingEntries.map((entry) => entry.resources || entry)) : resourceMap(item.incomingTransports);
        const outgoing = outgoingEntries.length ? addResources(...outgoingEntries.map((entry) => entry.resources || entry)) : resourceMap(item.outgoingTransports);
        const current = resourceMap(item.resources); const projected = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(0, current[resource] + incoming[resource] - (item.outgoingTransports.alreadyDebited ? 0 : outgoing[resource]))]));
        return { villageId: item.villageId, coordinate: item.villageCoord, villageName: item.villageName, resources: current, merchants: { ...item.merchants }, incoming, outgoing, projected, warehouseCapacity: item.storage, updatedAt: item.updatedAt, resourcesSource: item.source, transportSource: confirmed.length ? 'market-transport' : 'market-cache', marketCacheAge: Math.max(0, Date.now() - item.updatedAt), movements: confirmed };
    };
    const createMarketNetworkState = ({ villages = [], movements = [] } = {}) => {
        const ownedVillages = EAS.Villages?.filterOwned ? EAS.Villages.filterOwned(villages, { sourceModule: 'market-state', idSelector: (village) => village.villageId || village.id }) : villages; const unique = deduplicateMarketMovements(movements); const byVillage = new Map();
        unique.forEach((entry) => { const type = classifyMarketMovement(entry); if (!['INCOMING_TRANSPORT', 'OUTGOING_TRANSPORT'].includes(type)) return; const villageId = String(type === 'INCOMING_TRANSPORT' ? entry.destinationVillageId || entry.targetVillageId : entry.originVillageId || entry.sourceVillageId); if (!byVillage.has(villageId)) byVillage.set(villageId, []); byVillage.get(villageId).push(entry); });
        return { generatedAt: Date.now(), villages: ownedVillages.map((village) => createMarketVillageState(village, byVillage.get(String(village.villageId || village.id)) || [])), movements: unique, transports: unique.filter((entry) => ['INCOMING_TRANSPORT', 'OUTGOING_TRANSPORT'].includes(classifyMarketMovement(entry))), openOffers: unique.filter((entry) => classifyMarketMovement(entry) === 'OPEN_OFFER') };
    };
    const parseMarketTransportDocument = (doc, currentVillageId) => {
        const rows = [...doc.querySelectorAll('[data-transport-id],#market_transports tr,#trades_table tr,.market-transport,.transport-row')]; const currentId = String(currentVillageId || '');
        return rows.map((row, index) => {
            const links = [...row.querySelectorAll('a[href*="village="]')].map((link) => new URL(link.href, location.origin).searchParams.get('village')).filter(Boolean); const originVillageId = String(row.dataset.originVillageId || row.dataset.sourceVillageId || links[0] || ''); const destinationVillageId = String(row.dataset.destinationVillageId || row.dataset.targetVillageId || links[1] || ''); const explicit = String(row.dataset.direction || row.dataset.type || '').toLowerCase(); let type = /incoming|entrad|receb/.test(explicit) ? 'INCOMING_TRANSPORT' : /outgoing|sa[ií]d|envi/.test(explicit) ? 'OUTGOING_TRANSPORT' : destinationVillageId === currentId ? 'INCOMING_TRANSPORT' : originVillageId === currentId ? 'OUTGOING_TRANSPORT' : null; if (!type) return null;
            const value = (resource) => amount(row.dataset[resource] || row.querySelector(`[data-resource="${resource}"],[data-${resource}],img[src*="${resource}"]`)?.closest('td')?.textContent?.replace(/\D/g, '')); const resources = Object.fromEntries(RESOURCES.map((resource) => [resource, value(resource)])); if (!RESOURCES.some((resource) => resources[resource] > 0)) return null;
            const arrivalNode = row.querySelector('[data-endtime],[data-arrival],[data-timestamp]'); return { transportId: row.dataset.transportId || row.dataset.id || null, fingerprintIndex: index, type, status: type, originVillageId, destinationVillageId, resources, departureAt: Number(row.dataset.departureAt || 0) || null, arrivalAt: Number(row.dataset.arrivalAt || arrivalNode?.dataset?.endtime || arrivalNode?.dataset?.arrival || arrivalNode?.dataset?.timestamp || 0) || null, source: 'market-transport' };
        }).filter(Boolean);
    };
    const requestMarketTransports = (villageId) => { const key = String(villageId); if (inFlightTransportRequests.has(key)) return inFlightTransportRequests.get(key); const request = (async () => { const mark = EAS.Utils.Perf?.start('balance.transport-scan', { villageId: key }); const url = new URL('/game.php', location.origin); url.searchParams.set('village', key); url.searchParams.set('screen', 'market'); url.searchParams.set('mode', 'transports'); const response = await fetch(url, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const doc = new DOMParser().parseFromString(await response.text(), 'text/html'); const movements = parseMarketTransportDocument(doc, key); EAS.Utils.Perf?.end(mark, { movementCount: movements.length }); return movements; })().finally(() => inFlightTransportRequests.delete(key)); inFlightTransportRequests.set(key, request); return request; };
    const refreshMarketNetworkState = async ({ villageIds, maxAgeMs = 15000, concurrency = 2, shouldCancel = () => false, onProgress = () => {}, executionId = null } = {}) => {
        const cache = getCache(); const ids = (villageIds || cacheVillages(cache).map((village) => village.villageId)).map(String); const key = [...ids].sort().join(',');
        if (inFlightNetworkRequests.has(key)) { inFlightNetworkProgress.get(key)?.add(onProgress); onProgress({ phase: 'deduplicated', completed: 0, total: ids.length, executionId }); EAS.Log?.debug?.('market', 'refresh.deduplicated', { executionId, villageCount: ids.length }); return inFlightNetworkRequests.get(key); }
        const progressListeners = new Set([onProgress]); inFlightNetworkProgress.set(key, progressListeners); const emitProgress = (event) => progressListeners.forEach((listener) => { try { listener(event); } catch (error) { EAS.Log?.error?.('market', 'refresh.progressListenerError', error, { executionId, state: event.phase }); } });
        const request = (async () => { EAS.Log?.info?.('market', 'refresh.scanStart', { executionId, villageCount: ids.length, maxAgeMs }); const result = []; const movements = []; let cursor = 0; let completed = 0; let cacheHits = 0; let remoteRequests = 0; let cancelled = false;
            const worker = async () => { while (cursor < ids.length && !cancelled) { if (shouldCancel()) { cancelled = true; break; } const id = ids[cursor++]; const currentCache = getCache(); const cached = cacheVillages(currentCache).find((entry) => String(entry.villageId) === id); emitProgress({ phase: 'village-start', index: completed + 1, completed, total: ids.length, village: cached || { id, name: id }, villageId: id, status: 'checking' }); if (cached && Date.now() - cached.updatedAt <= maxAgeMs) { cacheHits += 1; result.push(cached); movements.push(...(currentCache.movements?.[id] || [])); completed += 1; EAS.Log?.debug?.('market', 'refresh.cacheHit', { executionId, villageId: id, completed, total: ids.length }); emitProgress({ phase: 'village-complete', index: completed, completed, total: ids.length, village: cached, villageId: id, status: 'cache-hit', source: 'cache' }); continue; } remoteRequests += 1; EAS.Log?.debug?.('market', 'refresh.villageStart', { executionId, villageId: id, completed, total: ids.length }); try { const [village, villageMovements] = await Promise.all([refreshMarketVillage(id), requestMarketTransports(id)]); result.push(village); movements.push(...villageMovements); const updated = getCache(); updated.movements ||= {}; updated.movements[id] = villageMovements; saveCache(updated); completed += 1; EAS.Log?.debug?.('market', 'refresh.villageComplete', { executionId, villageId: id, completed, total: ids.length, movementCount: villageMovements.length }); emitProgress({ phase: 'village-complete', index: completed, completed, total: ids.length, village, villageId: id, status: 'updated', source: 'remote' }); } catch (error) { EAS.Log?.error?.('market', 'refresh.villageError', error, { executionId, villageId: id, state: 'collecting' }); throw error; } } };
            await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, ids.length)) }, worker)); const state = createMarketNetworkState({ villages: result, movements }); const updated = getCache(); updated.villages = Array.isArray(updated.villages) ? Object.fromEntries(updated.villages.map((entry) => [String(entry.villageId), entry])) : (updated.villages || {}); state.villages.forEach((entry) => { if (!updated.villages[entry.villageId]) return; updated.villages[entry.villageId].incomingTransports = entry.incoming; updated.villages[entry.villageId].outgoingTransports = { ...entry.outgoing, alreadyDebited: false }; updated.villages[entry.villageId].transportSource = entry.transportSource; }); if (!cancelled) updated.updatedAt = Date.now(); saveCache(updated); const summary = { executionId, cancelled, completed, total: ids.length, cacheHits, remoteRequests, transportCount: state.transports.length }; EAS.Log?.info?.('market', cancelled ? 'refresh.cancelled' : 'refresh.scanComplete', summary); emitProgress({ phase: cancelled ? 'cancelled' : 'complete', ...summary }); return { ...state, refresh: summary };
        })().catch((error) => { EAS.Log?.error?.('market', 'refresh.error', error, { executionId, state: 'refreshing' }); throw error; }).finally(() => { inFlightNetworkRequests.delete(key); inFlightNetworkProgress.delete(key); EAS.Log?.debug?.('market', 'refresh.cleanup', { executionId, key }); }); inFlightNetworkRequests.set(key, request); return request;
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
        const listed = await EAS.Villages?.ensureFresh?.({ maxAgeMs: 5 * 60 * 1000 }) || EAS.Villages?.getAll?.() || EAS.Villages?.list?.() || []; const previous = getCache(); const previousMap = Object.fromEntries(cacheVillages(previous).map((village) => [String(village.villageId), village])); const result = {};
        for (let index = 0; index < listed.length; index += 1) {
            const village = listed[index];
            if (shouldCancel()) break;
            onProgress({ index: index + 1, total: listed.length, village, status: 'updating' });
            try {
                const { parsed, normalized } = await requestMarketVillage(village);
                result[String(village.id)] = normalized;
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
        const cache = { version: 1, villagesVersion: EAS.Villages?.getVersion?.() || 0, world: EAS.World?.getWorldName?.() || location.hostname, playerId: String(EAS.World?.getPlayer?.().id || ''), updatedAt: Date.now(), merchantCapacity: getMerchantCapacity(), villages: result }; saveCache(cache); return cache;
    };
    const refreshMarketVillage = async (villageId) => {
        const cache = getCache(); const key = String(villageId); const listed = EAS.Villages?.list?.() || [];
        const village = listed.find((item) => String(item.id) === key) || cacheVillages(cache).find((item) => String(item.villageId) === key) || { id: key };
        const { parsed, normalized } = await requestMarketVillage(village);
        if (parsed.sessionExpired || !parsed.marketAvailable) throw new Error(parsed.sessionExpired ? 'Sessão expirada' : 'Mercado indisponível');
        normalized.status = parsed.status;
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
        const source = normalizeVillage(villages[sourceKey] || { id: sourceKey }); const target = normalizeVillage(villages[targetKey] || { id: targetKey }); RESOURCES.forEach((resource) => { source.resources[resource] = Math.max(0, source.resources[resource] - sent[resource]); target.incomingTransports[resource] += sent[resource]; }); source.outgoingTransports = { ...addResources(source.outgoingTransports, sent), alreadyDebited: true }; source.merchants.available = Math.max(0, source.merchants.available - amount(transport.merchantsRequired)); source.updatedAt = Date.now(); target.updatedAt = Date.now(); villages[sourceKey] = source; villages[targetKey] = target; cache.villages = villages; cache.updatedAt = Date.now(); saveCache(cache); EAS.Data?.onTransportSent?.({ originVillageId: sourceKey, targetVillageId: targetKey }); return { source, target };
    };
    const applyCreatedOfferToCache = (item) => {
        const cache = getCache(); const key = String(item.villageId); const villages = Array.isArray(cache.villages) ? Object.fromEntries(cache.villages.map((village) => [String(village.villageId), village])) : { ...(cache.villages || {}) };
        const village = normalizeVillage(villages[key] || { id: key }); const repeatCount = Math.max(1, amount(item.repeatCount || 1));
        const totalOfferAmount = amount(item.totalOfferAmount || amount(item.offerAmount) * repeatCount); const totalRequestAmount = amount(item.totalRequestAmount || amount(item.requestAmount) * repeatCount);
        const activeOffer = { offerId: item.offerId || `optimistic-${item.id}`, villageId: key, offerResource: item.offerResource, offerAmount: amount(item.offerAmount), requestResource: item.requestResource, requestAmount: amount(item.requestAmount), repeatCount, totalOfferAmount, totalRequestAmount, merchantsUsed: amount(item.merchantsRequired || calculateMerchantsRequired({ [item.offerResource]: totalOfferAmount })), status: 'active', optimistic: true };
        village.resources[item.offerResource] = Math.max(0, village.resources[item.offerResource] - totalOfferAmount);
        village.activeOfferList = [...village.activeOfferList.filter((offer) => offer.offerId !== activeOffer.offerId), activeOffer]; village.activeOffers = { ...aggregateActiveOffers(village.activeOfferList), alreadyDebited: true };
        village.merchants.available = Math.max(0, village.merchants.available - activeOffer.merchantsUsed); village.updatedAt = Date.now(); village.source = 'optimistic-offer-created';
        villages[key] = village; cache.villages = villages; cache.updatedAt = Date.now(); saveCache(cache); EAS.Data?.onOfferCreated?.({ villageId: key }); return village;
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
        const item = normalizeVillage(village); const useProjected = activeOffers !== false; const initial = useProjected ? getCommittedResources(item) : resourceMap(item.resources); const virtual = { ...initial }; const reserve = resourceMap(reserveConfig.values || reserveConfig); let merchantsLeft = item.merchants.available; const offers = []; const minimum = Math.max(1, amount(minimumOfferSize)); const maximum = Math.max(1, amount(offerSize)); const capacity = Math.max(1, amount(merchantCapacity)); const tolerancePercent = Math.max(0, Number(tolerance) || 0); let sequence = 0;
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
        const perfMark = EAS.Utils.Perf?.start('market.smart-offers.calculate', { villageCount: villages.length });
        const normalized = villages.map(normalizeVillage).filter((village) => village.available && village.status !== 'read-failed'); const merchantCapacity = amount(config.merchantCapacity || getMerchantCapacity()); const calculationBase = config.calculationBase || (config.considerActiveOffers === false ? 'current' : 'projected');
        const villagePlans = normalized.map((village) => buildVillageOfferPlan({ village, offerSize: config.maximumPerOffer || 10000, minimumOfferSize: config.minimumPerOffer || 100, merchantCapacity, activeOffers: calculationBase !== 'current', reserveConfig: config.reserve || {}, tolerance: config.tolerancePercent ?? 3, roundToHundreds: config.roundToHundreds !== false })); const suggestions = villagePlans.flatMap((plan) => plan.offers); const uncovered = villagePlans.reduce((total, plan) => addResources(total, plan.balanceAfter.deficit), resourceMap()); const currentResources = calculateGlobalResources(normalized, getAvailableResources); const projectedResources = calculateGlobalResources(normalized, getProjectedResources);
        const result = { version: 2, calculationMode: 'per-village', suggestions, villagePlans, uncovered, currentResources, projectedResources, currentImbalance: calculateResourceImbalance(currentResources), projectedImbalance: calculateResourceImbalance(projectedResources), summary: { villagesAnalyzed: villagePlans.length, villagesBalanced: villagePlans.filter((plan) => plan.balancedAfter).length, villagesUnbalanced: villagePlans.filter((plan) => !plan.balancedAfter).length, villagesWithoutMerchants: villagePlans.filter((plan) => !plan.village.merchants.available).length } }; EAS.Utils.Perf?.end(perfMark, { analyzedVillages: villagePlans.length, suggestionCount: suggestions.length }); return result;
    };
    const buildTransportPlan = ({ source, target, desiredResources }) => {
        const origin = normalizeVillage(source); const destination = normalizeVillage(target); const available = getAvailableResources(origin); const space = getProjectedStorageSpace(destination); const capacity = origin.merchants.available * getMerchantCapacity(); let capacityLeft = capacity; const resources = resourceMap();
        RESOURCES.forEach((resource) => { resources[resource] = Math.min(amount(desiredResources?.[resource]), available[resource], space[resource], capacityLeft); capacityLeft -= resources[resource]; });
        return { sourceVillageId: origin.villageId, targetVillageId: destination.villageId, resources, ...validateTransport({ source: origin, target: destination, resources }) };
    };
    const calculateGlobalResources = (villages, selector = getProjectedResources) => villages.reduce((total, village) => addResources(total, selector(village)), resourceMap());
    const calculateTargetSupplyNeed = ({ currentResources, incomingTransports, targetResources, storage }) => { const current = resourceMap(currentResources); const incoming = resourceMap(incomingTransports); const target = resourceMap(targetResources); const invalidResources = RESOURCES.filter((resource) => target[resource] > amount(storage)); const projectedCurrent = addResources(current, incoming); const need = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(0, target[resource] - projectedCurrent[resource])])); return { valid: invalidResources.length === 0, invalidResources, projectedCurrent, targetResources: target, need, storage: amount(storage) }; };
    const buildTargetSupplyPlan = ({ targetVillage, targetResources, sourceVillages = [], reserveConfig = { mode: 'storage-percent', values: { wood: 10, stone: 10, iron: 10 } }, merchantCapacity = getMerchantCapacity(), strategy = 'balanced', minimumTransport = 1000, allowSmallFinalAdjustment = false, considerIncomingAtSources = false } = {}) => {
        const target = normalizeVillage(targetVillage); const needResult = calculateTargetSupplyNeed({ currentResources: getConfirmedProjectedResources(target), incomingTransports: resourceMap(), targetResources, storage: target.storage }); if (!needResult.valid) return { ...needResult, needBefore: needResult.need, plannedResources: resourceMap(), unmetNeed: needResult.need, targetProjectedAfter: needResult.projectedCurrent, transports: [], states: [] };
        const remaining = { ...needResult.need }; const capacity = Math.max(1, amount(merchantCapacity)); const states = sourceVillages.map(normalizeVillage).filter((village) => village.villageId !== target.villageId && village.available).map((village) => { const base = getAvailableResources(village); const projected = considerIncomingAtSources ? addResources(base, village.incomingTransports) : base; const reserve = calculateVillageReserve(village, reserveConfig); const available = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(0, projected[resource] - reserve[resource])])); return { village, before: projected, projected: { ...projected }, reserve, available, merchantsLeft: village.merchants.available, contribution: resourceMap(), distance: coordinateDistance(village, target) }; });
        const allocate = (state, desired) => { const resources = distributeLimitedResources(desired, state.available, state.merchantsLeft * capacity); const total = RESOURCES.reduce((sum, resource) => sum + resources[resource], 0); if (!total) return false; const merchants = calculateMerchantsRequired(resources, capacity); RESOURCES.forEach((resource) => { state.available[resource] -= resources[resource]; state.projected[resource] -= resources[resource]; state.contribution[resource] += resources[resource]; remaining[resource] -= resources[resource]; }); state.merchantsLeft -= merchants; return true; };
        if (strategy === 'nearest') { [...states].sort((a, b) => a.distance - b.distance || b.village.merchants.available - a.village.merchants.available || RESOURCES.reduce((sum, resource) => sum + b.available[resource] - a.available[resource], 0) || a.village.villageId.localeCompare(b.village.villageId)).forEach((state) => allocate(state, remaining)); }
        else if (strategy === 'fewest') { states.forEach((state) => allocate(state, remaining)); }
        else if (strategy === 'surplus') { [...states].sort((a, b) => RESOURCES.reduce((sum, resource) => sum + b.available[resource] - a.available[resource], 0) || b.village.merchants.available - a.village.merchants.available || a.distance - b.distance || a.village.villageId.localeCompare(b.village.villageId, undefined, { numeric: true })).forEach((state) => allocate(state, remaining)); }
        else { let progressed = true; while (progressed && RESOURCES.some((resource) => remaining[resource] > 0)) { progressed = false; const roundNeed = { ...remaining }; const shares = Object.fromEntries(RESOURCES.map((resource) => { const capable = states.filter((candidate) => candidate.merchantsLeft > 0 && candidate.available[resource] > 0).length; return [resource, capable ? Math.ceil(roundNeed[resource] / capable) : 0]; })); states.forEach((state) => { if (!state.merchantsLeft) return; const desired = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.min(remaining[resource], shares[resource])])); if (allocate(state, desired)) progressed = true; }); } }
        const transports = states.filter((state) => RESOURCES.some((resource) => state.contribution[resource] > 0)).map((state, index) => { const total = RESOURCES.reduce((sum, resource) => sum + state.contribution[resource], 0); return { id: `target-${Date.now()}-${index}`, sourceVillageId: state.village.villageId, sourceVillageName: state.village.villageName, sourceCoord: state.village.villageCoord, targetVillageId: target.villageId, targetVillageName: target.villageName, targetCoord: target.villageCoord, ...state.contribution, total, merchantsRequired: calculateMerchantsRequired(state.contribution, capacity), distance: state.distance, sourceBefore: state.before, sourceAfter: state.projected, reserve: state.reserve, status: total < amount(minimumTransport) && !allowSmallFinalAdjustment ? 'Transporte abaixo do mínimo' : RESOURCES.some((resource) => remaining[resource] > 0) ? 'Parcial' : 'Pronto', selected: total >= amount(minimumTransport) || allowSmallFinalAdjustment }; });
        const accepted = transports.filter((transport) => transport.selected); const plannedResources = accepted.reduce((total, transport) => addResources(total, transport), resourceMap()); const unmetNeed = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(0, needResult.need[resource] - plannedResources[resource])])); const targetProjectedAfter = addResources(needResult.projectedCurrent, plannedResources); return { valid: true, strategy, projectedCurrent: needResult.projectedCurrent, needBefore: needResult.need, plannedResources, unmetNeed, targetProjectedAfter, targetResources: needResult.targetResources, transports, states };
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
    const calculateVillageImbalance = (resources) => { const balance = calculateResourceImbalance(resources); return RESOURCES.reduce((score, resource) => score + Math.abs(resources[resource] - balance.target[resource]), 0); };
    const buildMarketBalancePlan = ({ villages, reserveConfig = { mode: 'storage-percent', values: { wood: 10, stone: 10, iron: 10 } }, merchantCapacity = getMerchantCapacity(), priority = 'distance', minimumTransport = 1000, allowSmallFinalAdjustments = false } = {}) => {
        const getConfirmedProjectedResources = getCommittedResources;
        const candidates = EAS.Villages?.filterOwned ? EAS.Villages.filterOwned(villages || [], { sourceModule: 'market-balance', idSelector: (village) => village.villageId || village.id }) : (villages || []); const perfMark = EAS.Utils.Perf?.start('balance.calculate', { villageCount: candidates.length }); const normalized = candidates.map(normalizeVillage).filter((village) => village.available); const global = calculateGlobalResources(normalized, getConfirmedProjectedResources);
        const states = normalized.map((village) => { const projected = getConfirmedProjectedResources(village); const reserve = calculateVillageReserve(village, reserveConfig); const goal = calculateBalancedResourceTarget(RESOURCES.reduce((sum, resource) => sum + projected[resource], 0)); const deficit = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.min(Math.max(0, goal[resource] - projected[resource]), Math.max(0, village.storage - projected[resource]))])); const surplus = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(0, Math.min(projected[resource] - goal[resource], projected[resource] - reserve[resource]))])); return { village, current: resourceMap(village.resources), incoming: resourceMap(village.incomingTransports), outgoing: resourceMap(village.outgoingTransports), before: { ...projected }, projected: { ...projected }, reserve, goal, deficit, surplus, merchantsLeft: village.merchants.available }; });
        const transports = []; const destinations = [...states].sort((a, b) => RESOURCES.reduce((sum, resource) => sum + b.deficit[resource] - a.deficit[resource], 0) || a.village.villageId.localeCompare(b.village.villageId));
        destinations.forEach((destination) => {
            while (RESOURCES.some((resource) => destination.deficit[resource] > 0)) {
                const origins = states.filter((origin) => origin !== destination && origin.merchantsLeft > 0 && RESOURCES.some((resource) => origin.surplus[resource] > 0));
                origins.sort((a, b) => priority === 'surplus' ? RESOURCES.reduce((sum, resource) => sum + b.surplus[resource] - a.surplus[resource], 0) : priority === 'merchants' ? b.merchantsLeft - a.merchantsLeft : coordinateDistance(a.village, destination.village) - coordinateDistance(b.village, destination.village) || RESOURCES.reduce((sum, resource) => sum + b.surplus[resource] - a.surplus[resource], 0) || b.merchantsLeft - a.merchantsLeft || a.village.villageId.localeCompare(b.village.villageId));
                const origin = origins[0]; if (!origin) break; const space = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(0, destination.village.storage - destination.projected[resource])])); const needs = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.min(destination.deficit[resource], space[resource])])); const available = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.min(origin.surplus[resource], needs[resource])])); const resources = distributeLimitedResources(needs, available, origin.merchantsLeft * merchantCapacity); const total = RESOURCES.reduce((sum, resource) => sum + resources[resource], 0);
                const beforeScore = calculateVillageImbalance(origin.projected) + calculateVillageImbalance(destination.projected); const candidateSource = subtractResources(origin.projected, resources); const candidateTarget = addResources(destination.projected, resources); const improves = calculateVillageImbalance(candidateSource) + calculateVillageImbalance(candidateTarget) < beforeScore;
                if (!total || !improves || (total < minimumTransport && !allowSmallFinalAdjustments)) { origin.merchantsLeft = 0; continue; }
                const merchantsRequired = calculateMerchantsRequired(resources, merchantCapacity); const beforeSource = { ...origin.projected }; const beforeTarget = { ...destination.projected };
                RESOURCES.forEach((resource) => { origin.projected[resource] -= resources[resource]; destination.projected[resource] += resources[resource]; origin.surplus[resource] -= resources[resource]; destination.deficit[resource] -= resources[resource]; }); origin.merchantsLeft -= merchantsRequired;
                transports.push({ id: `balance-${Date.now()}-${transports.length}`, sourceVillageId: origin.village.villageId, sourceVillageName: origin.village.villageName, sourceCoord: origin.village.villageCoord, targetVillageId: destination.village.villageId, targetVillageName: destination.village.villageName, targetCoord: destination.village.villageCoord, distance: coordinateDistance(origin.village, destination.village), ...resources, total, merchantsRequired, sourceBefore: beforeSource, sourceAfter: { ...origin.projected }, targetBefore: beforeTarget, targetAfter: { ...destination.projected }, status: RESOURCES.some((resource) => destination.deficit[resource] > 0) ? 'Parcial' : 'Pronto', selected: true });
            }
        });
        const remainingDeficits = states.reduce((total, state) => addResources(total, state.deficit), resourceMap()); const afterGlobal = states.reduce((total, state) => addResources(total, state.projected), resourceMap());
        const discardedTransfers = []; const result = { transports, plannedTransfers: transports, discardedTransfers, states, global, afterGlobal, remainingDeficits, totalsPreserved: RESOURCES.every((resource) => global[resource] === afterGlobal[resource]) }; EAS.Utils.Perf?.end(perfMark, { transportCount: transports.length }); return result;
    };
    const withinEconomicTolerance = (resources, weights = INTELLIGENCE_WEIGHTS) => { const balance = calculateResourceImbalance(resources); return balance.total > 0 && RESOURCES.every((resource) => balance.percentages[resource] >= weights.toleranceMinPercent && balance.percentages[resource] <= weights.toleranceMaxPercent); };
    const buildMarketIntelligenceState = ({ villages = [], reserveConfig = { mode: 'storage-percent', values: { wood: 10, stone: 10, iron: 10 } }, allowSmallFinalAdjustments = false, weights = INTELLIGENCE_WEIGHTS } = {}) => {
        const getConfirmedProjectedResources = getCommittedResources;
        console.debug('market-intelligence-build-start', { villageCount: villages.length }); const normalized = villages.map(normalizeVillage).filter((village) => village.available); const maxPoints = Math.max(1, ...normalized.map((village) => village.points)); const maxStorage = Math.max(1, ...normalized.map((village) => village.storage)); const maxMerchants = Math.max(1, ...normalized.map((village) => village.merchants.total));
        const states = normalized.map((village) => { const current = resourceMap(village.resources); const incoming = resourceMap(village.incomingTransports); const outgoing = resourceMap(village.outgoingTransports); const projected = getConfirmedProjectedResources(village); const totalProjected = RESOURCES.reduce((sum, resource) => sum + projected[resource], 0); const reserve = calculateVillageReserve(village, reserveConfig); const balance = calculateResourceImbalance(projected); const balanced = !allowSmallFinalAdjustments && withinEconomicTolerance(projected, weights); const occupancy = village.storage ? Math.max(...RESOURCES.map((resource) => projected[resource] / village.storage)) : 1; const overflowRisk = Math.max(0, Math.min(1, (occupancy - weights.overflowThreshold) / Math.max(0.01, 1 - weights.overflowThreshold))); const scarcity = village.storage ? Math.max(0, 1 - totalProjected / (village.storage * 3)) : 0; const parts = { points: village.points ? 1 - village.points / maxPoints : 0.5, storage: village.storage ? 1 - village.storage / maxStorage : 0.5, resourceScarcity: scarcity, merchants: village.merchants.total ? 1 - village.merchants.total / maxMerchants : 0.5 }; let developmentScore = Object.entries(weights.development).reduce((score, [key, factor]) => score + parts[key] * factor, 0); if (occupancy >= weights.storageSafetyRatio) developmentScore *= 0.1; const deficit = Object.fromEntries(RESOURCES.map((resource) => [resource, balanced ? 0 : Math.min(Math.max(0, balance.target[resource] - projected[resource]), Math.max(0, Math.floor(village.storage * weights.storageSafetyRatio) - projected[resource]))])); const surplus = Object.fromEntries(RESOURCES.map((resource) => { const ratioSurplus = balanced ? 0 : Math.max(0, projected[resource] - balance.target[resource]); const overflowSurplus = Math.max(0, projected[resource] - Math.floor(village.storage * weights.overflowThreshold)); return [resource, Math.max(0, Math.min(Math.max(ratioSurplus, overflowSurplus), projected[resource] - reserve[resource]))]; })); const flags = []; if (overflowRisk > 0) flags.push('overflow-risk'); if (!village.merchants.available) flags.push('no-free-merchants'); if (RESOURCES.some((resource) => incoming[resource])) flags.push('receiving'); if (RESOURCES.some((resource) => outgoing[resource])) flags.push('transporting'); if (Date.now() - village.updatedAt > 5 * 60 * 1000) flags.push('stale-data'); const primaryStatus = balanced ? 'balanced' : developmentScore >= 0.6 && occupancy < weights.storageSafetyRatio ? 'development-priority' : 'needs-resources'; return { village, villageId: village.villageId, name: village.villageName, coord: village.villageCoord, points: village.points, current, resources: current, incoming, outgoing, projected: { ...projected }, before: { ...projected }, storage: village.storage, merchants: { ...village.merchants, busy: Math.max(0, village.merchants.total - village.merchants.available) }, production: resourceMap(village.production), reserve, goal: balance.target, surplus, deficit, overflowRisk, occupancy, developmentScore: Number(developmentScore.toFixed(4)), developmentParts: parts, balanced, totalProjected, primaryStatus, flags, lastUpdated: village.updatedAt, confidence: flags.includes('stale-data') ? 'stale' : 'fresh', merchantsLeft: village.merchants.available }; }); console.debug('balance-existing-transports-applied', { incoming: states.reduce((sum, state) => sum + RESOURCES.reduce((total, resource) => total + state.incoming[resource], 0), 0), outgoing: states.reduce((sum, state) => sum + RESOURCES.reduce((total, resource) => total + state.outgoing[resource], 0), 0) }); console.debug('market-intelligence-build-complete', { villageCount: states.length }); return { generatedAt: Date.now(), weights, states };
    };
    const buildIntelligentMarketBalancePlan = ({ villages, reserveConfig = { mode: 'storage-percent', values: { wood: 10, stone: 10, iron: 10 } }, merchantCapacity = getMerchantCapacity(), priority = 'distance', mode = 'global', minimumTransport = 1000, allowSmallFinalAdjustments = false, intelligenceWeights = INTELLIGENCE_WEIGHTS } = {}) => {
        const getConfirmedProjectedResources = getCommittedResources;
        const candidates = EAS.Villages?.filterOwned ? EAS.Villages.filterOwned(villages || [], { sourceModule: 'market-balance', idSelector: (village) => village.villageId || village.id }) : (villages || []); const perfMark = EAS.Utils.Perf?.start('balance.calculate', { villageCount: candidates.length }); const strategyMode = ['development', 'conservative'].includes(mode) ? mode : 'global'; console.debug('balance-plan-start', { villageCount: candidates.length, mode: strategyMode }); const intelligence = buildMarketIntelligenceState({ villages: candidates, reserveConfig, allowSmallFinalAdjustments, weights: intelligenceWeights }); const states = intelligence.states; const global = states.reduce((total, state) => addResources(total, state.before), resourceMap()); const modeWeights = intelligenceWeights.modes[strategyMode];
        states.forEach((state) => { const deficitTotal = RESOURCES.reduce((sum, resource) => sum + state.deficit[resource], 0); state.priorityScore = deficitTotal * (1 + state.developmentScore * modeWeights.developmentBoost) - state.overflowRisk * Math.max(1, state.storage) * intelligenceWeights.destination.overflowPenalty; if (state.developmentScore >= 0.6 && deficitTotal) console.debug('balance-development-priority', { villageId: state.villageId, developmentScore: state.developmentScore }); if (state.overflowRisk > 0) console.debug('balance-overflow-priority', { villageId: state.villageId, overflowRisk: state.overflowRisk }); if (!state.merchantsLeft && RESOURCES.some((resource) => state.surplus[resource])) console.debug('balance-no-merchants', { villageId: state.villageId }); });
        const transports = []; const discardedTransfers = []; const destinations = [...states].sort((a, b) => b.priorityScore - a.priorityScore || a.villageId.localeCompare(b.villageId, undefined, { numeric: true }));
        destinations.forEach((destination) => { let safety = states.length * 4 + 4; while (safety-- > 0 && RESOURCES.some((resource) => destination.deficit[resource] > 0)) { const origins = states.filter((origin) => origin !== destination && origin.merchantsLeft > 0 && RESOURCES.some((resource) => origin.surplus[resource] > 0 && destination.deficit[resource] > 0)); if (!origins.length) break; origins.forEach((origin) => { const surplusTotal = RESOURCES.reduce((sum, resource) => sum + origin.surplus[resource], 0); const merchantRatio = origin.village.merchants.total ? origin.merchantsLeft / origin.village.merchants.total : 0; const distance = coordinateDistance(origin.village, destination.village); origin.originPriorityScore = surplusTotal + origin.overflowRisk * origin.storage * intelligenceWeights.origin.overflow + merchantRatio * merchantCapacity * intelligenceWeights.origin.merchants - (Number.isFinite(distance) ? distance : 1000) * merchantCapacity * intelligenceWeights.origin.distance; }); origins.sort((a, b) => priority === 'merchants' ? b.merchantsLeft - a.merchantsLeft || b.originPriorityScore - a.originPriorityScore : priority === 'surplus' || strategyMode === 'conservative' ? RESOURCES.reduce((sum, resource) => sum + b.surplus[resource] - a.surplus[resource], 0) || b.overflowRisk - a.overflowRisk || coordinateDistance(a.village, destination.village) - coordinateDistance(b.village, destination.village) : b.originPriorityScore - a.originPriorityScore || coordinateDistance(a.village, destination.village) - coordinateDistance(b.village, destination.village)); const origin = origins[0]; const space = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.max(0, Math.floor(destination.storage * intelligenceWeights.storageSafetyRatio) - destination.projected[resource])])); const needs = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.min(destination.deficit[resource], space[resource])])); if (RESOURCES.some((resource) => destination.deficit[resource] > space[resource])) console.debug('balance-destination-capacity-limited', { villageId: destination.villageId }); const available = Object.fromEntries(RESOURCES.map((resource) => [resource, Math.min(origin.surplus[resource], needs[resource])])); const resources = distributeLimitedResources(needs, available, origin.merchantsLeft * merchantCapacity); const total = RESOURCES.reduce((sum, resource) => sum + resources[resource], 0); if (!total) break; if (total < minimumTransport && !allowSmallFinalAdjustments) { discardedTransfers.push({ sourceVillageId: origin.villageId, targetVillageId: destination.villageId, resources, total, reason: 'below-minimum' }); RESOURCES.forEach((resource) => { if (resources[resource]) origin.surplus[resource] = 0; }); continue; } const merchantsRequired = calculateMerchantsRequired(resources, merchantCapacity); const beforeSource = { ...origin.projected }; const beforeTarget = { ...destination.projected }; RESOURCES.forEach((resource) => { origin.projected[resource] -= resources[resource]; destination.projected[resource] += resources[resource]; origin.surplus[resource] = Math.max(0, origin.surplus[resource] - resources[resource]); destination.deficit[resource] = Math.max(0, destination.deficit[resource] - resources[resource]); }); origin.merchantsLeft -= merchantsRequired; const reasons = []; if (origin.overflowRisk > 0) reasons.push('Risco de overflow na origem'); if (strategyMode === 'development' && destination.developmentScore >= 0.5) reasons.push('Prioridade de desenvolvimento'); const resourceNames = RESOURCES.filter((resource) => resources[resource]).map((resource) => ({ wood: 'madeira', stone: 'argila', iron: 'ferro' })[resource]); reasons.push(`Déficit de ${resourceNames.join(', ')}`); transports.push({ id: `balance-${Date.now()}-${transports.length}`, sourceVillageId: origin.villageId, sourceVillageName: origin.name, sourceCoord: origin.coord, targetVillageId: destination.villageId, targetVillageName: destination.name, targetCoord: destination.coord, distance: coordinateDistance(origin.village, destination.village), ...resources, total, merchantsRequired, sourceBefore: beforeSource, sourceAfter: { ...origin.projected }, targetBefore: beforeTarget, targetAfter: { ...destination.projected }, reason: reasons.join(' + '), decision: { mode: strategyMode, originPriorityScore: origin.originPriorityScore, destinationPriorityScore: destination.priorityScore, overflowRisk: origin.overflowRisk, developmentScore: destination.developmentScore }, status: RESOURCES.some((resource) => destination.deficit[resource]) ? 'Parcial' : 'Pronto', selected: true }); console.debug('balance-virtual-transport-applied', { sourceVillageId: origin.villageId, targetVillageId: destination.villageId, resources, merchantsLeft: origin.merchantsLeft }); } });
        const remainingDeficits = states.reduce((total, state) => addResources(total, state.deficit), resourceMap()); const afterGlobal = states.reduce((total, state) => addResources(total, state.projected), resourceMap()); const result = { version: 3, mode: strategyMode, intelligence, economicState: states, transports, plannedTransfers: transports, discardedTransfers, states, global, afterGlobal, remainingDeficits, totalsPreserved: RESOURCES.every((resource) => global[resource] === afterGlobal[resource]) }; console.debug('balance-plan-complete', { transportCount: transports.length, discardedCount: discardedTransfers.length }); EAS.Utils.Perf?.end(perfMark, { transportCount: transports.length }); return result;
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

    const normalizeTransportText = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');
    const isHubControl = (element) => Boolean(element?.closest?.('[id^="eas-"],.fake-execution-panel,.market-module'));
    const hasEditableTransportFields = (container) => [...(container?.querySelectorAll?.('input[name="wood"],input[name="stone"],input[name="iron"],input[name="input"],input[name="target"],input[name="target_coord"]') || [])].some((input) => String(input.type || 'text').toLowerCase() !== 'hidden' && !input.disabled);
    const transportSubmit = (container) => [...(container?.querySelectorAll?.('input[type="submit"],button[type="submit"]') || [])]
        .find((button) => !isHubControl(button) && normalizeTransportText(button.value || button.textContent) === 'enviar') || null;
    const findMarketSendForm = (doc) => [...doc.querySelectorAll('form')].find((form) => !isHubControl(form) && hasEditableTransportFields(form) && transportSubmit(form)) || null;
    const findMarketSendButton = (doc) => transportSubmit(findMarketSendForm(doc));
    const findMarketConfirmationContainer = (doc, targetWindow = window) => {
        const editableForm = findMarketSendForm(doc);
        const headings = [...doc.querySelectorAll('h1,h2,h3,h4,.title,.head')];
        const title = headings.find((element) => normalizeTransportText(element.textContent).includes('confirmar transporte'));
        const urlIsConfirmation = (() => { try { return new URL(targetWindow.location.href).searchParams.get('try') === 'confirm_send'; } catch { return false; } })();
        const candidates = [...doc.querySelectorAll('form')].filter((form) => !isHubControl(form) && !hasEditableTransportFields(form) && transportSubmit(form));
        if (!title && !urlIsConfirmation) return null;
        if (editableForm && !title && !urlIsConfirmation) return null;
        if (title) {
            let container = title.parentElement;
            while (container && container !== doc.documentElement) {
                if (!hasEditableTransportFields(container) && transportSubmit(container)) return container;
                container = container.parentElement;
            }
        }
        return candidates[0] || null;
    };
    const isMarketTransportConfirmationPage = (doc, targetWindow = window) => Boolean(findMarketConfirmationContainer(doc, targetWindow));
    const findMarketConfirmationSendButton = (doc, targetWindow = window) => transportSubmit(findMarketConfirmationContainer(doc, targetWindow));
    const detectMarketTransportSuccess = (doc, targetWindow = window) => {
        if (isMarketTransportConfirmationPage(doc, targetWindow)) return false;
        const text = normalizeTransportText(doc.body?.textContent);
        const explicit = /transporte (?:foi |enviado |realizado )?(?:enviado|realizado|efetuado) com sucesso/.test(text);
        return explicit || Boolean(findMarketSendForm(doc));
    };
    const TransportExecutor = { normalizeTransportText, findMarketSendForm, findMarketSendButton, findMarketConfirmationContainer, isMarketTransportConfirmationPage, findMarketConfirmationSendButton, detectMarketTransportSuccess };

    Object.assign(EAS.MarketEngine, { CACHE_KEY, RESOURCES, INTELLIGENCE_WEIGHTS, TransportExecutor, normalizeVillage, getEconomicState, withEconomicState, getAvailableResources, getCommittedResources, getProjectedResources, getConfirmedProjectedResources, getProjectedStorageSpace, transportFingerprint, classifyMarketMovement, deduplicateMarketMovements, createMarketVillageState, createMarketNetworkState, buildMarketIntelligenceState, withinEconomicTolerance, parseMarketTransportDocument, requestMarketTransports, refreshMarketNetworkState, calculateBalancedResourceTarget, calculateResourceImbalance, calculateVillageImbalance, calculateVillageResourceBalance, calculateTargetSupplyNeed, getMerchantCapacity, calculateMerchantsRequired, calculateOfferRepeatCount, calculateOfferExecutionValues, calculateOfferQuantity, splitOfferAmount, aggregateActiveOffers, parseMarketVillageDocument, requestMarketVillage, refreshMarketVillage, refreshCurrentMarketVillageFromPage, refreshAllVillages, applyCreatedOfferToCache, applyInternalTransportToCache, validateTransport, coordinateDistance, calculateVillageReserve, distributeLimitedResources, buildMarketBalancePlan: buildIntelligentMarketBalancePlan, buildTargetSupplyPlan, buildOfferPlan, buildVillageOfferPlan, buildGlobalOfferSuggestions, buildTransportPlan, calculateGlobalResources, applyInternalTransport, distributeTargetNeed, collectVillageData, getCache, cacheVillages, openFoundationModule });
})();
