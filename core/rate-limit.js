// Passive rate-limit guard. No requests, API patches or automatic recovery.
(() => {
    const root = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    if (root.EASRateLimit) return;
    const key = 'eas_tw_fakes_execution';
    let blocked = null, observer = null;
    const read = () => { try { return JSON.parse(root.localStorage.getItem(key) || 'null'); } catch { return null; } };
    const mark = reason => {
        blocked ||= { state: 'RATE_LIMITED', reason, detectedAt: Date.now() };
        root.__easFakesAuto?.stop?.();
        const context = read();
        if (context?.executionTab === root.name && !context.endedAt && !context.finishedAt && context.rateLimit?.state !== 'RATE_LIMITED') {
            context.paused = true; context.rateLimit = { ...blocked };
            try { root.localStorage.setItem(key, JSON.stringify(context)); } catch { blocked.persistenceFailed = true; }
        }
        if (!blocked.logged) {
            blocked.logged = true;
            try { root.__EASLogger?.warn?.('CORE', 'RATE_LIMITED', { ...blocked, executionId: context?.executionTab }); } catch {}
            try { root.console?.warn?.('[EAS][CORE][RATE_LIMITED]', { reason, timestamp: blocked.detectedAt }); } catch {}
        }
        return true;
    };
    const check = () => {
        if (blocked) return mark(blocked.reason);
        const text = String(root.document.body?.innerText || root.document.body?.textContent || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (/solicitacao bloqueada/.test(text) && /muitos pedidos|muitas solicitacoes/.test(text)) return mark('BLOCKED_PAGE');
        for (const type of ['navigation', 'resource']) {
            if (Array.from(root.performance?.getEntriesByType(type) || []).some(entry => Number(entry.responseStatus) === 429)) return mark('HTTP_429');
        }
        return read()?.rateLimit?.state === 'RATE_LIMITED';
    };
    root.EASRateLimit = { check, reportStatus: status => Number(status) === 429 ? mark('HTTP_429') : false,
        // Only a fresh page with no observed block and an untouched pending command
        // can be released. Submitted/prepared attempts require existing manual review.
        resumeUnsent: () => {
            check();
            if (blocked) return false;
            const context = read(), entry = context?.queue?.[context.currentIndex];
            if (context?.executionTab !== root.name || context.rateLimit?.state !== 'RATE_LIMITED' ||
                entry?.status !== 'pending' || entry.confirmationAttempt || context.forwardingStartedAt) return false;
            const old = context.rateLimit; context.rateLimit = { ...old, state: 'MANUALLY_RELEASED', releasedAt: Date.now() }; context.paused = false;
            try { root.localStorage.setItem(key, JSON.stringify(context)); return true; } catch { return false; }
        },
        dispose: () => { observer?.disconnect(); root.document.removeEventListener?.('DOMContentLoaded', check); }
    };
    if (root.PerformanceObserver) {
        try { observer = new root.PerformanceObserver(list => {
            if (list.getEntries().some(entry => Number(entry.responseStatus) === 429)) mark('HTTP_429');
        }); observer.observe({ type: 'resource', buffered: true }); } catch { observer?.disconnect(); }
    }
    if (root.document.readyState === 'loading') root.document.addEventListener?.('DOMContentLoaded', check, { once: true });
    check();
})();
