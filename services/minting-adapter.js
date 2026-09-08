(() => {
    'use strict';
    EAS.Adapters ||= {};
    EAS.Selectors ||= {};
    const selectors = EAS.Selectors.Minting = Object.freeze({
        forms: 'form[action]', count: 'input[name="count"]', token: 'input[type="hidden"][name="h"]',
        login: 'form#login, input[type="password"], input[name="password"]', content: '#content_value, #contentContainer',
        success: '.success, .success_box, .success-message', error: '.error, .error_box, .error-message, #error'
    });
    const integer = (value) => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
    const normalizeText = (text) => String(text || '').replace(/\s+/g, ' ').trim();
    const messages = (doc) => [...doc.querySelectorAll(selectors.success)].map((node) => normalizeText(node.textContent)).filter(Boolean);
    // No fill-max handler was supplied. Only a native numeric input constraint is
    // supported; never execute fetched JavaScript, infer costs, or read decorative text.
    const maxMintable = (form) => integer(form.querySelector(selectors.count)?.getAttribute('max'));
    const calculateCount = (requested, maximum) => {
        if (!Number.isSafeInteger(requested) || requested < 1) return 0;
        if (maximum === null) return requested === 1 ? 1 : 0;
        return Number.isSafeInteger(maximum) && maximum >= 0 ? Math.min(requested, maximum) : 0;
    };
    const createAdapter = ({ origin = location.origin, fetchPage = (...args) => fetch(...args), gameData = () => EAS.World.getGameData() } = {}) => {
        const pending = new Set();
        const sitterId = () => String(gameData().player?.sitter || 0);
        const sameContext = (url, villageId, action = null) => {
            if (url.origin !== origin || url.pathname !== '/game.php' || url.username || url.password || url.hash) return false;
            const expected = { village: String(villageId), screen: 'snob', ...(action ? { action } : {}) };
            for (const [key, value] of Object.entries(expected)) if (url.searchParams.getAll(key).length !== 1 || url.searchParams.get(key) !== value) return false;
            if (action && [...url.searchParams.keys()].some((key) => !['village', 'screen', 'action', 't'].includes(key))) return false;
            const t = url.searchParams.getAll('t');
            return sitterId() === '0' ? t.length === 0 : t.length === 1 && t[0] === sitterId();
        };
        const academyUrl = (villageId) => {
            if (!/^[1-9]\d*$/.test(String(villageId))) throw new Error('INVALID_VILLAGE');
            const url = new URL('/game.php', origin);
            url.search = new URLSearchParams({ village: String(villageId), screen: 'snob' }).toString();
            if (sitterId() !== '0') url.searchParams.set('t', sitterId());
            return url;
        };
        const pageReason = (doc, url, villageId) => {
            if (doc.querySelector(selectors.login)) return 'SESSION_EXPIRED';
            if (!sameContext(url, villageId) || doc.querySelector('meta[http-equiv="refresh" i]')) return 'INVALID_PAGE';
            return null;
        };
        const parsePage = (doc, url, villageId) => {
            const result = { villageId: String(villageId), eligible: false, actionUrl: null, h: null, maxMintable: null, reason: null };
            const invalid = pageReason(doc, url, villageId);
            if (invalid) return { ...result, reason: invalid };
            const candidates = [...doc.querySelectorAll(selectors.forms)].filter((form) => {
                try { return new URL(form.getAttribute('action'), url).searchParams.get('action') === 'coin'; }
                catch { return false; }
            });
            if (!candidates.length) {
                if (!doc.querySelector(selectors.content)) return { ...result, reason: 'INVALID_PAGE' };
                const village = gameData().village;
                const noAcademy = String(village?.id) === String(villageId) && integer(village?.buildings?.snob) === 0;
                return { ...result, reason: noAcademy ? 'NO_ACADEMY' : 'NO_MINT_FORM' };
            }
            if (candidates.length !== 1) return { ...result, reason: 'PARSE_FAILED' };
            const form = candidates[0], action = new URL(form.getAttribute('action'), url);
            const count = form.querySelector(selectors.count), tokens = form.querySelectorAll(selectors.token);
            if (!sameContext(action, villageId, 'coin') || form.method.toLowerCase() !== 'post'
                || form.querySelectorAll(selectors.count).length !== 1 || count?.disabled || count?.id !== 'coin_mint_count'
                || tokens.length !== 1 || !tokens[0].value.trim() || tokens[0].disabled) return { ...result, reason: 'PARSE_FAILED' };
            return { ...result, eligible: true, actionUrl: action.href, h: tokens[0].value,
                maxMintable: maxMintable(form), maxLength: integer(count.getAttribute('maxlength')), reason: null };
        };
        const requestDocument = async (url, options = {}) => {
            const abort = new AbortController();
            const timeout = setTimeout(() => abort.abort(), 20000);
            try {
                const response = await fetchPage(String(url), { credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'follow',
                    ...options, headers: { Accept: 'text/html', ...options.headers }, signal: abort.signal });
                if (response.status === 401 || response.status === 403) return { reason: 'SESSION_EXPIRED' };
                if (!response.ok) return { reason: 'HTTP_ERROR' };
                if (!(response.headers.get('content-type') || '').toLowerCase().includes('text/html')) return { reason: 'INVALID_PAGE' };
                const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
                return { doc, url: new URL(response.url), reason: null };
            } catch { return { reason: 'REQUEST_FAILED' }; }
            finally { clearTimeout(timeout); }
        };
        const inspectMinting = async (villageId) => {
            let page;
            try { page = await requestDocument(academyUrl(villageId)); }
            catch { page = { reason: 'INVALID_PAGE' }; }
            if (page.reason) return { villageId: String(villageId), eligible: false, actionUrl: null, h: null, maxMintable: null, reason: page.reason };
            return { ...parsePage(page.doc, page.url, villageId), previousMessages: messages(page.doc) };
        };
        const confirm = (doc, url, villageId, attempted, previousMessages = []) => {
            const invalid = pageReason(doc, url, villageId);
            if (invalid) return { confirmed: 0, reason: invalid };
            if ([...doc.querySelectorAll(selectors.error)].some((node) => normalizeText(node.textContent))) return { confirmed: 0, reason: 'GAME_ERROR' };
            const fresh = messages(doc).filter((message) => !previousMessages.includes(message));
            // No machine-readable receipt was supplied. Conservative PT-BR fallback:
            // a fresh, explicit per-operation sentence, never cumulative "já cunhou".
            const amounts = fresh.map((message) => message.match(/^(?:Você cunhou|Foi cunhada|Foram cunhadas) (\d+) moedas? de ouro(?: com sucesso)?[.!]?$/i))
                .filter(Boolean).map((match) => integer(match[1]));
            if (amounts.length !== 1 || amounts[0] < 1 || amounts[0] > attempted) return { confirmed: 0, reason: 'CONFIRMATION_NOT_FOUND' };
            return { confirmed: amounts[0], reason: null };
        };
        const execute = async (row, { beforePost = () => true } = {}) => {
            const base = { villageId: String(row.villageId), villageName: row.villageName, requested: row.requested, attempted: 0, confirmed: 0, status: 'NOT_ELIGIBLE', reason: null };
            if (pending.has(base.villageId)) return { ...base, reason: 'ALREADY_RUNNING' };
            pending.add(base.villageId);
            try {
                // Always GET again here: discovery tokens are never reused.
                const current = await inspectMinting(base.villageId);
                if (!current.eligible) return { ...base, reason: current.reason };
                const count = calculateCount(row.requested, current.maxMintable);
                if (!count || (current.maxLength !== null && String(count).length > current.maxLength)) return { ...base, reason: 'QUANTITY_NOT_VALIDATED' };
                if (beforePost(count) !== true) return { ...base, reason: 'CANCELLED' };
                base.attempted = count;
                const page = await requestDocument(current.actionUrl, {
                    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ count: String(count), h: current.h }).toString()
                });
                if (page.reason) return { ...base, status: 'REQUEST_FAILED', reason: page.reason };
                const result = confirm(page.doc, page.url, base.villageId, count, current.previousMessages);
                return { ...base, ...result, status: result.confirmed ? 'CONFIRMED' : 'CONFIRMATION_FAILED' };
            } finally { pending.delete(base.villageId); }
        };
        return { available: true, blockedReason: '', inspectMinting, parsePage, calculateCount, confirm, execute,
            async inspectVillage(village) {
                const value = await inspectMinting(village.id);
                // Only non-sensitive fields may enter the service/discovery state.
                return { villageId: String(village.id), villageName: village.name || String(village.id), eligible: value.eligible,
                    maxMintable: value.maxMintable, reason: value.reason };
            }
        };
    };
    EAS.Adapters.Minting = { ...createAdapter(), createAdapter };
})();
