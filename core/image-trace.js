// Temporary, passive LOCAL-build diagnostic. No DOM/API patches or network calls.
(() => {
    const root = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    if (!root.EASLocalBuild || root.EASImageTraceDebug) return;
    try {
        const doc = root.document, limit = 300, events = [], loaderEvents = [];
        let dropped = 0, observer = null, active = true;
        const startedAt = Date.now();
        let navigationCount = null;
        try { const key='eas_image_trace_navigation_count'; navigationCount=Number(root.sessionStorage.getItem(key)||0)+1; root.sessionStorage.setItem(key,String(navigationCount)); } catch {}
        const matches = img => img?.tagName === 'IMG' &&
            [img.src, img.currentSrc].some(src => String(src || '').includes('/st/'));
        const images = () => Array.from(doc.querySelectorAll('#ds_body img')).filter(matches);
        const describe = img => ({ src: img.src, currentSrc: img.currentSrc || '',
            complete: img.complete, naturalWidth: img.naturalWidth,
            broken: Boolean(img.complete && img.naturalWidth === 0),
            parent: { tag: img.parentElement?.tagName || null, id: img.parentElement?.id || '', className: img.parentElement?.className || '' },
            outerHTML: img.outerHTML, easOwner: img.closest?.('[data-eas-tw-hub]')?.getAttribute('data-eas-tw-hub') || null });
        const record = (img, event) => {
            if (!matches(img)) return;
            events.push({ timestamp: Date.now(), event, ...describe(img), totalStImages: images().length,
                documentUrl: root.location.href, localBuildId: root.EASLocalBuild.id,
                creatorStack: null, origin: 'undetermined' });
            if (events.length > limit) { events.shift(); dropped++; }
        };
        const scan = (node, event) => {
            if (node?.nodeType !== 1) return;
            if (node.closest?.('#ds_body')) record(node, event);
            for (const img of node.querySelectorAll?.('img') || []) {
                if (img.closest?.('#ds_body')) record(img, event);
            }
        };
        root.__EASImageTraceMark = detail => {
            try {
                loaderEvents.push({ timestamp: Date.now(), ...detail });
                root.__EASLogger?.debug?.('CORE', 'NETWORK_REQUEST_SOURCE', { timestamp: Date.now(), url: detail.url, caller: detail.asset, operation: detail.event, stack: detail.stack, buildId: root.EASLocalBuild.id, navigationCount, scope: 'EAS resource creation only; does not attribute IMG creator' });
                if (loaderEvents.length > limit) loaderEvents.shift();
            } catch { /* Diagnostics cannot block loading. */ }
        };
        const consume = records => {
            try {
                if (records.length) root.__EASLoaderTrace?.('image-observer', { childListMutations: records.filter(item => item.type === 'childList').length });
                for (const item of records) {
                    if (item.type === 'attributes') scan(item.target, 'src-changed');
                    else for (const node of item.addedNodes) scan(node, 'added');
                }
            } catch { /* Diagnostics cannot affect the game. */ }
        };
        // The document anchor also catches a late or replaced #ds_body.
        observer = new root.MutationObserver(consume);
        observer.observe(doc, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] });
        for (const img of images()) record(img, 'existing-at-start');
        const settled = event => {
            if (event.target?.closest?.('#ds_body')) record(event.target, event.type);
        };
        doc.addEventListener('load', settled, true);
        doc.addEventListener('error', settled, true);
        root.EASImageTraceDispose = () => {
            active = false; observer.disconnect();
            doc.removeEventListener?.('load', settled, true); doc.removeEventListener?.('error', settled, true);
        };
        root.EASImageTraceDebug = () => {
            consume(observer.takeRecords());
            const resources = Array.from(root.performance?.getEntriesByType('resource') || [])
                .filter(item => String(item.name).includes('/st/'));
            const blobMap = loaderEvents.filter(item => String(item.url).startsWith('blob:')).map(item => ({
                blobUrl: item.url, asset: item.asset || null, createdAt: item.timestamp,
                easBlobPurpose: item.asset === 'index.js' ? 'JS bundle' : item.type === 'text/css' ? 'CSS'
                    : item.type?.startsWith('text/csv') ? 'CSV' : item.type === 'text/javascript' ? 'JS asset' : 'other' }));
            const correlate = src => {
                let decodedStPayload = null, decodeError = null, blobUrl = null;
                try {
                    const path = new URL(src, root.location.href).pathname;
                    const encoded = path.match(/^\/st\/(.+)\.gif$/)?.[1];
                    if (!encoded) throw new Error('Not a /st/<payload>.gif URL');
                    decodedStPayload = root.atob(decodeURIComponent(encoded).replace(/-/g, '+').replace(/_/g, '/'));
                    // Match the entire decoded URL token, never just a UUID or prefix.
                    blobUrl = decodedStPayload.match(/blob:https?:\/\/[^\s"'<>]+/)?.[0] || null;
                } catch (error) { decodeError = String(error.message || error); }
                const matched = blobUrl ? blobMap.find(item => item.blobUrl === blobUrl) : null;
                const insertion = events.find(item => item.src === src && item.event === 'added');
                const pixelAddedAt = insertion?.timestamp ?? null;
                return { stPixel: src, decodedStPayload, decodeError, blobUrl,
                    matchesEasBlob: Boolean(matched), matchedEasBlob: matched?.blobUrl || null,
                    easBlobPurpose: matched?.easBlobPurpose || null, easAsset: matched?.asset || null,
                    blobCreatedAt: matched?.createdAt ?? null, pixelAddedAt,
                    deltaMs: matched && pixelAddedAt !== null ? pixelAddedAt - matched.createdAt : null };
            };
            const currentImages = images().map(describe);
            const sources = new Set([...events.flatMap(item => [item.src, item.currentSrc]),
                ...currentImages.flatMap(item => [item.src, item.currentSrc]), ...resources.map(item => item.name)]
                .filter(src => src && src.includes('/st/')));
            const correlations = [...sources].map(correlate);
            const groups = new Map();
            for (const item of blobMap) {
                const key = item.asset || item.easBlobPurpose;
                if (!groups.has(key)) groups.set(key, new Set());
                groups.get(key).add(item.blobUrl);
            }
            return JSON.parse(JSON.stringify({ startedAt, timestamp: Date.now(), documentUrl: root.location.href,
                localBuildId: root.EASLocalBuild.id, easVersion: root.EAS?.version || null,
                observerActive: active, origin: 'undetermined',
                limitations: 'MutationObserver does not expose creator stacks. Loader stacks describe EAS blob creation only, not IMG creation. Timing correlation is not causation. History is page-local; resource entries may have been evicted by the browser.',
                droppedEvents: dropped, events: events.map(item => ({ ...item, ...correlate(item.src) })),
                images: currentImages.map(item => ({ ...item, ...correlate(item.src) })), totalStImages: currentImages.length,
                blobMap, correlations, correlationSummary: { uniqueStUrls: correlations.length,
                    exactMatchedUniqueStUrls: correlations.filter(item => item.matchesEasBlob).length,
                    currentMatchedImageElements: currentImages.filter(item => correlate(item.src).matchesEasBlob).length,
                    recordedUniqueEasBlobs: new Set(blobMap.map(item => item.blobUrl)).size,
                    repeatedAssets: [...groups].filter(([, urls]) => urls.size > 1).map(([asset, urls]) => ({ asset, distinctBlobCount: urls.size })),
                    scope: 'Retained events, current DOM and available resource entries; not a lifetime total. Exact URL correlation does not identify the IMG creator.' },
                loaderEvents, scripts: Array.from(doc.scripts || []).map(script => ({ src: script.src, type: script.type })),
                totalResourceEntries: resources.length, resources: resources.slice(-limit).map(item => ({ name: item.name,
                    initiatorType: item.initiatorType, startTime: item.startTime, duration: item.duration,
                    transferSize: item.transferSize, responseStatus: item.responseStatus ?? null })) }));
        };
    } catch { /* A missing diagnostic API must not prevent Hub startup. */ }
})();
