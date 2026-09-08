(() => {
    'use strict';
    EAS.Adapters ||= {};
    EAS.Selectors ||= {};
    const selectors = EAS.Selectors.Minting = Object.freeze({
        forms: 'form[action]', count: 'input[name="count"]', token: 'input[name="h"]',
        login: 'form#login, input[type="password"], input[name="password"]', content: '#content_value, #contentContainer',
        success: '.success, .success_box, .success-message', error: '.error, .error_box, .error-message, #error'
    });
    const integer = (value) => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
    const normalizeText = (text) => String(text || '').replace(/\s+/g, ' ').trim();
    const messages = (doc) => [...doc.querySelectorAll(selectors.success)].map((node) => normalizeText(node.textContent)).filter(Boolean);
    // The user verified the official fill-max link's literal "(7)" in world 143.
    // Accept only that unambiguous integer notation inside the selected form.
    const maxMintable = (form) => {
        const nativeMax = integer(form.querySelector(selectors.count)?.getAttribute('max'));
        const links = form.querySelectorAll('#coin_mint_fill_max');
        const match = links.length === 1 ? normalizeText(links[0].textContent).match(/^\((\d+)\)$/) : null;
        const linkMax = match ? integer(match[1]) : null;
        return linkMax === null ? nativeMax : nativeMax === null ? linkMax : Math.min(linkMax, nativeMax);
    };
    const calculateCount = (requested, maximum) => {
        if (!Number.isSafeInteger(requested) || requested < 1) return 0;
        if (maximum === null) return 1;
        return Number.isSafeInteger(maximum) && maximum >= 0 ? Math.min(1, requested, maximum) : 0;
    };
    const createAdapter = ({ origin = location.origin, fetchPage = (...args) => fetch(...args), gameData = () => EAS.World.getGameData(),
        onDiagnostic = (detail) => { if (EAS.Storage?.get?.('minting.diagnostics', false)) console.debug('[EAS Cunhagem] academy GET', detail); }
    } = {}) => {
        const pending = new Set();
        const safeUrl = (value) => {
            try {
                const url = new URL(value, origin);
                const query = new URLSearchParams();
                for (const [key, val] of url.searchParams) {
                    if ((['village', 'group', 't'].includes(key) && /^\d{1,20}$/.test(val))
                        || (key === 'screen' && ['snob', 'overview', 'place', 'login', 'overview_villages'].includes(val))
                        || (key === 'action' && val === 'coin')) query.append(key, val);
                }
                const host = url.origin === origin ? origin : '[external-origin]';
                const path = ['/game.php', '/index.php', '/'].includes(url.pathname) ? url.pathname : '/[redacted-path]';
                return host + path + (query.size ? '?' + query : '');
            } catch { return '[invalid-url]'; }
        };
        const fieldNames = (fields) => [...new Set([...fields].map((field) => {
            const name = field.getAttribute('name');
            return !name ? null : /^[a-z_\[\]]{1,40}$/.test(name) ? name : '[redacted-name]';
        }).filter(Boolean))];
        const sitterId = () => String(gameData().player?.sitter || 0);
        const sameContext = (url, villageId, action = null) => {
            if (url.origin !== origin || url.pathname !== '/game.php' || url.username || url.password || url.hash) return false;
            const expected = { village: String(villageId), screen: 'snob', ...(action ? { action } : {}) };
            for (const [key, value] of Object.entries(expected)) if (url.searchParams.getAll(key).length !== 1 || url.searchParams.get(key) !== value) return false;
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
            const diagnostics = { finalGetUrl: safeUrl(url), formCount: doc.querySelectorAll('form').length,
                coinCandidateCount: 0, mintCandidateCount: 0, selectedAction: null, method: null,
                descendantFieldNames: [], associatedFieldNames: [], documentHCount: doc.querySelectorAll(selectors.token).length,
                selectedHCount: 0, associatedHCount: 0, selectedHHasValue: false };
            const result = { villageId: String(villageId), eligible: false, actionUrl: null, h: null, maxMintable: null, status: 'NOT_ELIGIBLE', reason: null, stage: 'page', diagnostics };
            const reject = (status, reason, stage) => ({ ...result, status, reason, stage });
            const invalid = pageReason(doc, url, villageId);
            if (invalid) return reject(invalid === 'SESSION_EXPIRED' ? 'SESSION_EXPIRED' : 'PARSE_FAILED', invalid === 'SESSION_EXPIRED' ? 'LOGIN_PAGE' : invalid, 'page');
            const coinForms = [...doc.querySelectorAll(selectors.forms)].filter((form) => {
                try { return new URL(form.getAttribute('action'), url).searchParams.get('action') === 'coin'; }
                catch { return false; }
            });
            const candidates = coinForms.filter((form) => new URL(form.getAttribute('action'), url).searchParams.get('screen') === 'snob');
            diagnostics.coinCandidateCount = coinForms.length;
            diagnostics.mintCandidateCount = candidates.length;
            if (!candidates.length) {
                if (coinForms.some((form) => form.querySelector(selectors.count))) return reject('PARSE_FAILED', 'INVALID_ACTION', 'action');
                if (!doc.querySelector(selectors.content) && !(doc.querySelector('#serverDate') && doc.querySelector('#serverTime'))) return reject('PARSE_FAILED', 'INVALID_PAGE', 'page');
                return reject('NOT_ELIGIBLE', 'NO_MINT_FORM', 'form');
            }
            if (candidates.length !== 1) return reject('PARSE_FAILED', 'MULTIPLE_MINT_FORMS', 'form');
            const form = candidates[0], action = new URL(form.getAttribute('action'), url);
            const count = form.querySelector(selectors.count), tokens = form.querySelectorAll(selectors.token);
            Object.assign(diagnostics, { selectedAction: safeUrl(action), method: form.method.toUpperCase(),
                descendantFieldNames: fieldNames(form.querySelectorAll('input, select, textarea, button')),
                associatedFieldNames: fieldNames(form.elements), selectedHCount: tokens.length, selectedHHasValue: tokens.length === 1 && Boolean(tokens[0].value.trim()),
                associatedHCount: [...form.elements].filter((field) => field.matches(selectors.token)).length });
            if (!sameContext(action, villageId, 'coin')) return reject('PARSE_FAILED', 'INVALID_ACTION', 'action');
            if (form.method.toLowerCase() !== 'post') return reject('PARSE_FAILED', 'INVALID_METHOD', 'method');
            if (!tokens.length || (tokens.length === 1 && !tokens[0].value.trim())) return reject('PARSE_FAILED', 'NO_H_FIELD', 'token');
            if (tokens.length !== 1 || tokens[0].matches(':disabled') || tokens[0].form !== form) return reject('PARSE_FAILED', 'INVALID_H_FIELD', 'token');
            if (form.querySelectorAll(selectors.count).length !== 1 || count?.matches(':disabled') || count?.form !== form) return reject('PARSE_FAILED', 'INVALID_COUNT_FIELD', 'count');
            return { ...result, eligible: true, actionUrl: action.href, h: tokens[0].value,
                maxMintable: maxMintable(form), maxLength: integer(count.getAttribute('maxlength')), status: 'READY', reason: null, stage: 'complete' };
        };
        const requestDocument = async (url, options = {}) => {
            const abort = new AbortController();
            const timeout = setTimeout(() => abort.abort(), 20000);
            try {
                const response = await fetchPage(String(url), { credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'follow',
                    ...options, headers: { Accept: 'text/html', ...options.headers }, signal: abort.signal });
                const htmlResponse = (response.headers.get('content-type') || '').toLowerCase().includes('text/html');
                const diagnostics = { finalGetUrl: safeUrl(response.url), redirected: Boolean(response.redirected), httpStatus: response.status, htmlResponse };
                if (response.status === 401 || response.status === 403) return { reason: 'SESSION_EXPIRED', diagnostics };
                if (!response.ok) return { reason: 'HTTP_ERROR', diagnostics };
                if (!htmlResponse) return { reason: 'INVALID_PAGE', diagnostics };
                const html = await response.text();
                // No transformations; scripts in this detached document are not executed.
                const doc = new DOMParser().parseFromString(html, 'text/html');
                return { doc, url: new URL(response.url), reason: null, diagnostics };
            } catch { return { reason: 'REQUEST_FAILED' }; }
            finally { clearTimeout(timeout); }
        };
        const inspectMinting = async (villageId) => {
            let page, requestedGetUrl = '[invalid-url]';
            try { const url = academyUrl(villageId); requestedGetUrl = safeUrl(url); page = await requestDocument(url); }
            catch { page = { reason: 'INVALID_PAGE' }; }
            const result = page.reason ? { villageId: String(villageId), eligible: false, actionUrl: null, h: null, maxMintable: null,
                status: page.reason === 'SESSION_EXPIRED' ? 'SESSION_EXPIRED' : page.reason === 'INVALID_PAGE' ? 'PARSE_FAILED' : 'REQUEST_FAILED', reason: page.reason, stage: 'request' }
                : { ...parsePage(page.doc, page.url, villageId), previousMessages: messages(page.doc) };
            const diagnostics = { ...result.diagnostics, ...page.diagnostics, requestedGetUrl,
                villageId: /^[1-9]\d*$/.test(String(villageId)) ? String(villageId) : '[invalid-id]', status: result.status, stage: result.stage, reason: result.reason };
            try { onDiagnostic(diagnostics); } catch {}
            return result;
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
                if (!current.eligible) return { ...base, status: current.status, reason: current.reason, stage: current.stage };
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
                    maxMintable: value.maxMintable, status: value.status, reason: value.reason, stage: value.stage };
            }
        };
    };
    EAS.Adapters.Minting = { ...createAdapter(), createAdapter };
})();
