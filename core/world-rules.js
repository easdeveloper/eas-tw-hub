(() => {
    'use strict';

    EAS.CommandRules = EAS.CommandRules || {};
    EAS.WorldRules = EAS.WorldRules || {};
    const STORAGE_KEY = 'eas_tw_world_rules';
    const VERSION = 1;
    const UNIT_ALIASES = Object.freeze({
        explorador: 'spy', exploradores: 'spy', espiao: 'spy', espioes: 'spy', spy: 'spy', spies: 'spy',
        lanceiro: 'spear', lanceiros: 'spear', spear: 'spear',
        espadachim: 'sword', espadachins: 'sword', sword: 'sword',
        barbaro: 'axe', barbaros: 'axe', machado: 'axe', axe: 'axe',
        arqueiro: 'archer', arqueiros: 'archer', archer: 'archer',
        cavalaria_leve: 'light', cavalarias_leves: 'light', light: 'light',
        ariete: 'ram', arietes: 'ram', ram: 'ram',
        catapulta: 'catapult', catapultas: 'catapult', catapult: 'catapult',
        paladino: 'knight', paladinos: 'knight', knight: 'knight',
        nobre: 'snob', nobres: 'snob', snob: 'snob'
    });

    const normalizeText = (value) => String(value ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
    const getWorld = () => EAS.World?.getWorldName?.() || window.game_data?.world || location.hostname || 'unknown';
    const getVillageContext = () => {
        const village = EAS.World?.getCurrentVillage?.() || {};
        return {
            villageId: String(village.id || window.game_data?.village?.id || ''),
            villageName: village.name || window.game_data?.village?.name || '',
            villageCoord: village.coordinate || window.game_data?.village?.coord || ''
        };
    };
    const emptyStore = () => ({ version: VERSION, worlds: {} });
    const readStore = () => {
        let stored;
        try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { stored = null; }
        if (stored?.version === VERSION && stored.worlds) return stored;
        const migrated = emptyStore();
        if (stored && typeof stored === 'object') {
            Object.entries(stored).forEach(([world, rule]) => {
                if (!rule?.minimumAttackPopulation) return;
                migrated.worlds[world] = {
                    detectedAt: rule.detectedAt || Date.now(), villageRules: {}, unitRules: {},
                    legacyMinimumAttackPopulation: Number(rule.minimumAttackPopulation), source: rule.source || 'legacy'
                };
            });
        }
        return migrated;
    };
    const writeStore = (store) => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); return true; } catch { return false; }
    };
    const ensureWorld = (store, world) => {
        store.worlds[world] = store.worlds[world] || { detectedAt: null, villageRules: {}, unitRules: {} };
        store.worlds[world].villageRules = store.worlds[world].villageRules || {};
        store.worlds[world].unitRules = store.worlds[world].unitRules || {};
        return store.worlds[world];
    };
    const withHistory = (previous, rule, valueKey) => {
        const now = Date.now();
        const history = [...(previous?.history || [])];
        if (previous && Number(previous[valueKey]) !== Number(rule[valueKey])) {
            history.push({ previousValue: previous[valueKey], newValue: rule[valueKey], changedAt: now });
        }
        return { ...previous, ...rule, detectedAt: previous?.detectedAt || now, lastConfirmedAt: now, history };
    };

    const getWorldRules = (world = getWorld()) => {
        const rules = readStore().worlds[world];
        return rules ? structuredClone(rules) : { detectedAt: null, villageRules: {}, unitRules: {} };
    };
    const saveWorldRules = (world, rules) => {
        const store = readStore();
        store.worlds[world] = { ...ensureWorld(store, world), ...rules };
        return writeStore(store);
    };
    const getVillageRules = (world = getWorld(), villageId = getVillageContext().villageId, villageCoord = '') => {
        const rules = getWorldRules(world);
        return rules.villageRules?.[String(villageId)] ||
            Object.values(rules.villageRules || {}).find((rule) => villageCoord && rule.villageCoord === villageCoord) || null;
    };
    const saveVillageRule = (world = getWorld(), villageId, rule = {}) => {
        const store = readStore();
        const worldRules = ensureWorld(store, world);
        const key = String(villageId || rule.villageId || rule.villageCoord || 'unknown');
        worldRules.villageRules[key] = withHistory(worldRules.villageRules[key], {
            ...rule, villageId: String(villageId || rule.villageId || ''), source: rule.source || 'game-error'
        }, 'minimumAttackPopulation');
        worldRules.detectedAt = Date.now();
        return writeStore(store);
    };
    const getUnitRule = (world = getWorld(), unit) => getWorldRules(world).unitRules?.[unit] || null;
    const saveUnitRule = (world = getWorld(), unit, rule = {}) => {
        const store = readStore();
        const worldRules = ensureWorld(store, world);
        worldRules.unitRules[unit] = withHistory(worldRules.unitRules[unit], { ...rule, unit, source: rule.source || 'game-error' }, 'minimumQuantity');
        worldRules.detectedAt = Date.now();
        return writeStore(store);
    };
    const clearVillageRule = (world = getWorld(), villageId) => {
        const store = readStore(); const rules = ensureWorld(store, world);
        delete rules.villageRules[String(villageId)]; return writeStore(store);
    };
    const clearWorldRules = (world = getWorld()) => { const store = readStore(); delete store.worlds[world]; return writeStore(store); };

    const parseCommandRuleError = (text) => {
        const normalized = normalizeText(text);
        const population = normalized.match(/cada ataque.*?pelo menos\s+(\d+)\s+de populacao.*?tentando enviar\s+(\d+)/i);
        if (population) return { type: 'minimum-attack-population', minimumPopulation: Number(population[1]), attemptedPopulation: Number(population[2]) };
        const unitMinimum = normalized.match(/(?:necessario|precisa).*?(?:minimo|minima)(?:\s+de)?\s+(\d+)\s+([\p{L}_ -]+)/iu);
        if (unitMinimum) {
            const alias = normalizeText(unitMinimum[2]).toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '');
            const unit = UNIT_ALIASES[alias] || UNIT_ALIASES[alias.replace(/s$/, '')];
            if (unit) return { type: 'minimum-unit-quantity', unit, minimumQuantity: Number(unitMinimum[1]) };
        }
        return null;
    };
    const scanCommandRuleErrors = (root = document) => {
        const selectors = ['.error', '.error_box', '.error-message', '#error', '.warn', '.warning', '.popup_box_content', '#content_value'];
        const texts = [...root.querySelectorAll(selectors.join(','))]
            .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
            .map((element) => element.textContent).filter(Boolean);
        if (!texts.length) texts.push((root.querySelector('#contentContainer, main') || root.body || {}).textContent || '');
        const unique = new Map();
        texts.forEach((text) => { const parsed = parseCommandRuleError(text); if (parsed) unique.set(JSON.stringify(parsed), parsed); });
        return [...unique.values()];
    };
    const saveDetectedRule = (rule, context = {}) => {
        const world = context.world || getWorld();
        const village = { ...getVillageContext(), ...context };
        if (rule.type === 'minimum-attack-population') {
            saveVillageRule(world, village.villageId || village.villageCoord, { ...village, minimumAttackPopulation: rule.minimumPopulation, attemptedPopulation: rule.attemptedPopulation, source: 'game-error' });
        } else if (rule.type === 'minimum-unit-quantity') saveUnitRule(world, rule.unit, { minimumQuantity: rule.minimumQuantity, source: 'game-error' });
        return rule;
    };
    const observeCommandRuleErrors = ({ root = document, timeout = 5000, context = {}, onRule = () => {} } = {}) => {
        const area = root.querySelector('#content_value, #contentContainer, main') || root.body;
        let stopped = false; let timer;
        const inspect = () => scanCommandRuleErrors(root).forEach((rule) => onRule(saveDetectedRule(rule, context)));
        const observer = area && typeof MutationObserver !== 'undefined' ? new MutationObserver(inspect) : null;
        observer?.observe(area, { childList: true, subtree: true, characterData: true });
        timer = setTimeout(() => { stopped = true; observer?.disconnect(); }, Math.max(100, Number(timeout) || 5000));
        inspect();
        return () => { if (!stopped) { stopped = true; observer?.disconnect(); clearTimeout(timer); } };
    };

    const calculateCommandPopulation = (troops = {}) => EAS.Units.calculateCommandPopulation(troops);
    const validateCommandComposition = ({ world = getWorld(), villageId = '', villageCoord = '', commandType = 'attack', troops = {} } = {}) => {
        const commandPopulation = calculateCommandPopulation(troops);
        const villageRule = getVillageRules(world, villageId, villageCoord);
        const minimumAttackPopulation = Number(villageRule?.minimumAttackPopulation || 0);
        const reasons = []; const unitViolations = [];
        if (commandType === 'attack' && minimumAttackPopulation > commandPopulation) reasons.push({ type: 'minimum-attack-population', required: minimumAttackPopulation, current: commandPopulation });
        Object.entries(troops).forEach(([unit, quantity]) => {
            const current = Math.max(0, Number(quantity) || 0); const rule = getUnitRule(world, unit);
            if (current > 0 && rule?.minimumQuantity > current) unitViolations.push({ type: 'minimum-unit-quantity', unit, required: Number(rule.minimumQuantity), current });
        });
        reasons.push(...unitViolations);
        return { valid: reasons.length === 0, commandPopulation, minimumAttackPopulation, missingPopulation: commandType === 'attack' ? Math.max(0, minimumAttackPopulation - commandPopulation) : 0, unitViolations, reasons, ruleKnown: Boolean(villageRule) };
    };
    const applyMinimumAdjustment = ({ troops = {}, missingPopulation = 0, unit } = {}) => {
        const result = { ...troops }; const population = EAS.Units.getPopulation(unit);
        if (population > 0 && missingPopulation > 0) result[unit] = Math.max(0, Number(result[unit]) || 0) + Math.ceil(missingPopulation / population);
        return result;
    };
    const suggestCompositionAdjustment = (options = {}) => {
        const validation = validateCommandComposition(options);
        const preferredUnits = (options.preferredUnits || []).filter((unit) => EAS.Units.getPopulation(unit) > 0);
        const unit = preferredUnits[0] || Object.keys(EAS.Units.population).find((item) => EAS.Units.getPopulation(item) > 0);
        const quantity = unit && validation.missingPopulation > 0 ? Math.ceil(validation.missingPopulation / EAS.Units.getPopulation(unit)) : 0;
        return { valid: validation.valid, unit, additionalQuantity: quantity, missingPopulation: validation.missingPopulation, adjustedTroops: quantity ? applyMinimumAdjustment({ troops: options.troops, missingPopulation: validation.missingPopulation, unit }) : { ...(options.troops || {}) }, validation };
    };

    Object.assign(EAS.CommandRules, { STORAGE_KEY, UNIT_POPULATION: EAS.Units.population, calculateCommandPopulation, parseCommandRuleError, scanCommandRuleErrors, observeCommandRuleErrors, saveDetectedRule, getWorldRules, saveWorldRules, getVillageRules, saveVillageRule, getUnitRule, saveUnitRule, validateCommandComposition, suggestCompositionAdjustment, applyMinimumAdjustment, clearVillageRule, clearWorldRules, getWorld, getVillageContext });
    EAS.WorldRules.get = (world = getWorld(), villageId = getVillageContext().villageId) => getVillageRules(world, villageId);
    EAS.WorldRules.setMinimumAttackPopulation = (minimum, options = {}) => saveVillageRule(options.world || getWorld(), options.villageId || getVillageContext().villageId, { ...getVillageContext(), ...options, minimumAttackPopulation: Number(minimum) });
    EAS.WorldRules.clear = clearWorldRules;
    EAS.WorldRules.getWorld = getWorld;
})();
