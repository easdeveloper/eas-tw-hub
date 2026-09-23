// Page-local counters. Passive: no observer, DOM writes, timers or HTTP.
(() => {
    const root = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    if (root.EASLoaderDebug) return;
    const session = `${Date.now()}:${Math.random()}`, events = [], resources = new Map();
    let sequence = 0;
    const fingerprints = new Map(), seenContent = new Map();
    const safeUrl = value => {
        if (!value) return null;
        if (String(value).startsWith('data:')) return 'data:[content-redacted]';
        try {
            const url = new URL(value, root.location.href);
            if (url.protocol === 'blob:') return url.href.split(/[?#]/)[0];
            return url.origin + (url.pathname.startsWith('/st/') ? '/st/[payload-redacted]' : url.pathname);
        } catch { return '[invalid-url]'; }
    };
    const safeText = value => String(value).replace(/(?:blob:)?https?:\/\/[^\s"'<>\)]+/g, url => safeUrl(url));
    const fingerprint = asset => {
        const sha = root.EASLocalBuild?.assetHashes?.[asset];
        if (sha) return `sha256:${sha}`;
        if (fingerprints.has(asset)) return fingerprints.get(asset);
        const content = root.EASLocalBuild?.files?.[asset];
        if (typeof content !== 'string') return null;
        // Legacy builds only. Explicitly non-cryptographic; never logs source text.
        let hash = 2166136261;
        for (let i = 0; i < content.length; i++) hash = Math.imul(hash ^ content.charCodeAt(i), 16777619);
        const value = `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}:${content.length}`;
        fingerprints.set(asset, value); return value;
    };
    const counts = { loaderStartCalls: 0, loaderStarts: 0, indexStartCalls: 0,
        indexStarts: 0, loadScriptCalls: 0, scriptsInjected: 0, factoryExecutions: 0,
        deduplicated: 0, scriptsCreated: 0, scriptsLoaded: 0, scriptErrors: 0,
        bootstrapCompleted: 0, imageObserverCallbacks: 0, childListMutations: 0 };
    const labels = {
        'loader-start-call': ['LOADER', 'start'], 'load-script': ['LOADER', 'loadScript'],
        'script-created': ['LOADER', 'script-created'], 'script-loaded': ['LOADER', 'script-loaded'],
        'script-error': ['LOADER', 'script-error'], deduplicated: ['LOADER', 'duplicate-blocked'],
        'index-start': ['BOOTSTRAP', 'start'], 'bootstrap-already-running': ['BOOTSTRAP', 'already-running'],
        'bootstrap-completed': ['BOOTSTRAP', 'completed']
    };
    root.__EASLoaderTrace = (event, detail = {}) => {
        try {
            const counter = { 'loader-start-call': 'loaderStartCalls', 'loader-start': 'loaderStarts',
                'index-start-call': 'indexStartCalls', 'index-start': 'indexStarts',
                'load-script': 'loadScriptCalls', 'script-injected': 'scriptsInjected',
                'factory-executed': 'factoryExecutions', deduplicated: 'deduplicated',
                'script-created': 'scriptsCreated', 'script-loaded': 'scriptsLoaded',
                'script-error': 'scriptErrors', 'bootstrap-completed': 'bootstrapCompleted' }[event];
            if (counter) counts[counter]++;
            if (event === 'image-observer') {
                counts.imageObserverCallbacks++; counts.childListMutations += detail.childListMutations || 0;
                return;
            }
            const sanitized = {};
            for (const [key, value] of Object.entries(detail)) {
                if (/content|token|csrf|cookie|password|^h$/i.test(key)) continue;
                sanitized[key] = typeof value === 'string' ? safeText(value) : value;
            }
            if (sanitized.callerStack) sanitized.callerStack = sanitized.callerStack.split('\n').slice(0, 6).join('\n');
            const contentHash = detail.asset ? fingerprint(detail.asset) : null;
            const processing = event === 'script-created' || event === 'factory-executed';
            const previous = contentHash ? (seenContent.get(contentHash) || 0) : null;
            if (processing && contentHash) seenContent.set(contentHash, previous + 1);
            const entry = { ...sanitized, counter: ++sequence, timestamp: Date.now(), event, session,
                codeSource: root.EASLocalBuild ? 'local-embedded' : 'remote',
                localBuildId: root.EASLocalBuild?.id || null, buildId: root.EASLocalBuild?.id || null,
                url: safeUrl(detail.url || resources.get(detail.asset)?.url),
                reason: safeText(detail.reason || 'unspecified'), contentHash,
                stableResourceId: detail.asset ? `${root.EASLocalBuild?.id || 'remote'}:${detail.asset}` : null,
                sameContentProcessedBefore: processing && contentHash ? previous > 0 : null };
            events.push(entry); if (events.length > 200) events.shift();
            if (detail.asset) resources.set(detail.asset, { ...resources.get(detail.asset), ...entry });
            const label = labels[event];
            if (label) {
                try { root.console?.info?.(`[EAS][${label[0]}] ${label[1]}`, { ...entry }); } catch {}
                try { root.__EASLogger?.debug?.(label[0], label[1], { ...entry }); } catch {}
            }
        } catch { /* Diagnostics cannot change loading. */ }
    };
    root.EASLoaderDebug = () => JSON.parse(JSON.stringify({ session,
        buildId: root.EASLocalBuild?.id || null, url: safeUrl(root.location.href), counts,
        resources: [...resources.values()], events, loaderObservers: 0,
        note: 'Observer counts cover only the passive EAS image tracer, not game observers.' }));
})();
