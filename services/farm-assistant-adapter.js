(() => {
    'use strict';
    EAS.Adapters ||= {};
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const pageText = (doc) => normalize(doc.body?.textContent);
    const isDisabled = (element) => !element || element.disabled || element.getAttribute('aria-disabled') === 'true' || /disabled|inactive|unavailable/.test(element.className || '');
    const templateSelectors = (template) => [`a.farm_icon_${template.toLowerCase()}`, `button.farm_icon_${template.toLowerCase()}`, `[data-template="${template}"]`, `[data-farm-template="${template}"]`, `.farm_icon_${template.toLowerCase()}`];
    const adapter = {
        isPage(targetWindow = window) { const url = new URL(targetWindow.location.href); return url.searchParams.get('screen') === 'am_farm'; },
        noUnits(doc = document) { return /n[aã]o existem unidades suficientes|not enough units/i.test(pageText(doc)); },
        detectError(doc = document) { const text = pageText(doc); if (/429|too many requests|muitas solicita[cç][oõ]es/i.test(text)) return { code: 'HTTP_429', message: 'Limite temporário do servidor.' }; if (/network error|erro de rede|falha (?:de|na) conex[aã]o/i.test(text)) return { code: 'NETWORK_ERROR', message: 'Falha de rede ao usar o Assistente de Saque.' }; if (/assistente de saque.*(?:indispon[ií]vel|n[aã]o ativado)|farm assistant.*unavailable/i.test(text)) return { code: 'FARM_ASSISTANT_UNAVAILABLE', message: 'Assistente de Saque indisponível.' }; return null; },
        findTemplateActions(template = 'A', doc = document) { return [...doc.querySelectorAll(templateSelectors(template).join(','))].filter((element, index, list) => list.indexOf(element) === index); },
        findAvailableAction(template = 'A', doc = document) { return this.findTemplateActions(template, doc).find((element) => !isDisabled(element) && element.offsetParent !== null) || this.findTemplateActions(template, doc).find((element) => !isDisabled(element)) || null; },
        inspect({ template = 'A', targetWindow = window } = {}) { const doc = targetWindow.document; if (!this.isPage(targetWindow)) return { state: 'PAGE_UNEXPECTED', action: null }; const error = this.detectError(doc); if (error) return { state: error.code, error, action: null }; if (this.noUnits(doc)) return { state: 'NO_UNITS', action: null }; const actions = this.findTemplateActions(template, doc); if (!actions.length) return { state: 'MODEL_NOT_FOUND', action: null }; const action = this.findAvailableAction(template, doc); return action ? { state: 'READY', action } : { state: 'ACTION_NOT_AVAILABLE', action: null }; },
        trigger({ template = 'A', targetWindow = window } = {}) { const inspection = this.inspect({ template, targetWindow }); if (inspection.state !== 'READY') return inspection; inspection.action.click(); return { ...inspection, state: 'ACTION_SENT' }; }
    };
    EAS.Adapters.FarmAssistant = adapter;
})();
