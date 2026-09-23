// TEST ONLY. Model of the two supplied game.js excerpts, not the full game.
// Decoder mapping is inferred from the supplied SCRIPT/addedNodes/src description.
// tc defaults to empty: its real definitions and other native triggers are absent.
// report receives a request description; no network/native API is intercepted.
(function (root) {
    root.installTelemetryExcerpt = function ({ report, tc = {}, token = 'fixture-token' }) {
        const cache = Object.create(null), pending = [];
        const stats = { callbacks: 0, addedNodes: 0, scriptNodes: 0, imageNodes: 0, calls: 0, emissions: 0 };
        function process(n, t) {
            stats.calls++;
            const o = n.split('?')[0];
            t = t ? t.slice(0, 50) : '';
            const key = o + t;
            if (Object.prototype.hasOwnProperty.call(cache, key)) return;
            cache[key] = true;
            const parts = [btoa(token + '-' + o)];
            if (t) parts.push(btoa(t));
            const value = { key, source: n, suffix: t, pixel: '/st/' + parts.join('/') + '.gif' };
            stats.emissions++; pending.push(value); report?.(value);
        }
        function consume(records) {
            stats.callbacks++;
            for (const mutation of records) for (const element of mutation.addedNodes) {
                stats.addedNodes++;
                if (element.tagName === 'IMG') stats.imageNodes++;
                if (element.tagName !== 'SCRIPT') continue;
                stats.scriptNodes++;
                if (!element.src) for (const key in tc) {
                    if (Object.prototype.hasOwnProperty.call(tc, key)) {
                        const result = tc[key](element.textContent);
                        if (result) process(result);
                    }
                }
                if (element.src && element.src.length > 0) process(element.src);
            }
        }
        return { process, consume, stats, cache, pending };
    };
})(typeof window === 'undefined' ? globalThis : window);
