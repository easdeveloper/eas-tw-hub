(() => {
    'use strict';
    const LOG_KEY = 'runtime.logs'; const USAGE_KEY = 'runtime.usage'; const LOG_LIMIT = 500;
    const storageGet = (key, fallback) => EAS.Storage?.get?.(key, fallback) ?? fallback;
    const storageSet = (key, value) => EAS.Storage?.set?.(key, value);
    const pageContext = () => { try { const url = new URL(location.href); return { url: url.href, screen: url.searchParams.get('screen'), mode: url.searchParams.get('mode'), try: url.searchParams.get('try'), villageId: String(window.game_data?.village?.id || url.searchParams.get('village') || '') }; } catch { return {}; } };
    const serializeError = (error) => error ? { name: error.name || 'Error', message: error.message || String(error), stack: error.stack || '' } : null;
    const write = (level, module, action, data = {}, context = {}) => {
        const entry = { timestamp: Date.now(), level, module, action, executionId: context.executionId || data.executionId || null, villageId: context.villageId || data.villageId || pageContext().villageId || null, page: pageContext(), state: context.state || data.state || null, data: { ...data }, error: serializeError(context.error || data.error) };
        if (entry.data.error) delete entry.data.error;
        const entries = storageGet(LOG_KEY, []); entries.push(entry); storageSet(LOG_KEY, entries.slice(-LOG_LIMIT));
        const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'info' ? 'info' : 'debug'; console[method](`[EAS ${module}] ${action}`, entry); return entry;
    };
    EAS.Log = { debug: (module, action, data, context) => write('debug', module, action, data, context), info: (module, action, data, context) => write('info', module, action, data, context), warn: (module, action, data, context) => write('warn', module, action, data, context), error: (module, action, error, context = {}) => write('error', module, action, {}, { ...context, error }), entries: ({ module, level, limit = LOG_LIMIT } = {}) => storageGet(LOG_KEY, []).filter((entry) => (!module || entry.module === module) && (!level || entry.level === level)).slice(-limit), clear: () => storageSet(LOG_KEY, []), context: pageContext };
    EAS.Usage = { track(name, data = {}) { const report = storageGet(USAGE_KEY, {}); const previous = report[name] || { count: 0 }; report[name] = { count: previous.count + 1, firstUsedAt: previous.firstUsedAt || Date.now(), lastUsedAt: Date.now(), lastData: data }; storageSet(USAGE_KEY, report); return report[name]; }, report: () => ({ ...storageGet(USAGE_KEY, {}) }), clear: () => storageSet(USAGE_KEY, {}) };
})();
