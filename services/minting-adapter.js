(() => {
    'use strict';
    EAS.Adapters ||= {};
    EAS.Selectors ||= {};
    const START = 'start_auto_minting_session', CANCEL = 'cancel_auto_minting_session';
    const selectors = EAS.Selectors.Minting = Object.freeze({ table: 'table.auto-minting', token: 'input[name="h"]',
        login: 'form#login, input[type="password"], input[name="password"]' });
    // TEMPORARY development diagnostics: remove after live Academy parsing is validated.
    // Only sanitized metadata is logged, never HTML or field values.
    const TEMPORARY_LIVE_DIAGNOSTICS = true;
    const createAdapter = ({ origin = location.origin, fetchPage = (...args) => fetch(...args), gameData = () => EAS.World.getGameData(),
        onDiagnostic = detail => { if (TEMPORARY_LIVE_DIAGNOSTICS || EAS.Storage?.get?.('minting.diagnostics', false)) console.debug('[EAS Cunhagem Debug] academy GET', detail); }
    } = {}) => {
        const pending = new Set();
        const safeUrl = value => {
            try {
                const url = new URL(value, origin), query = new URLSearchParams();
                for (const [key, val] of url.searchParams) {
                    if ((['village', 'group', 't'].includes(key) && /^\d{1,20}$/.test(val))
                        || (key === 'screen' && ['snob', 'overview', 'place', 'login'].includes(val))
                        || (key === 'action' && [START, CANCEL].includes(val))) query.append(key, val);
                }
                return (url.origin === origin ? origin : '[external-origin]')
                    + (['/game.php', '/index.php', '/'].includes(url.pathname) ? url.pathname : '/[redacted-path]')
                    + (query.size ? '?' + query : '');
            } catch { return '[invalid-url]'; }
        };
        const diagnosticUrl = value => EAS.Log?.sanitizeUrl?.(value) || '[sanitizer-unavailable]';
        const describeForm = form => ({
            actionSanitized: safeUrl(form.getAttribute('action')),
            method: form.method.toUpperCase(),
            fieldNames: [...new Set([...form.querySelectorAll('[name]')].map(field => /^[a-z_\[\]]{1,40}$/.test(field.getAttribute('name')) ? field.getAttribute('name') : '[redacted-name]'))],
            hasH: Boolean(form.querySelector(selectors.token)),
            hasCount: Boolean(form.querySelector('input[name="count"]')),
            // Only known UI labels are safe to report; never input values or arbitrary text.
            buttonTexts: [...form.querySelectorAll('button')].map(button => {
                const text = button.textContent.replace(/\s+/g, ' ').trim();
                return ['Ativar', 'Cancelar', 'Cunhar'].includes(text) ? text : '[redacted-text]';
            })
        });
        const liveDiagnostic = (page, result, villageId, requestedUrl) => {
            const doc = page.doc, forms = [...(doc?.querySelectorAll('table.auto-minting form') || [])];
            const selected = result.diagnostics;
            const candidates = action => forms.filter(form => { try { return new URL(form.getAttribute('action'), page.url).searchParams.get('action') === action; } catch { return false; } }).length;
            return {
                villageId: /^[1-9]\d*$/.test(String(villageId)) ? String(villageId) : '[invalid-id]',
                requestedUrl, finalUrl: page.diagnostics?.finalUrl ?? null,
                redirected: page.diagnostics?.redirected ?? null, status: page.diagnostics?.httpStatus ?? null,
                ok: page.diagnostics?.ok ?? null, contentType: page.diagnostics?.contentType ?? null,
                responseLength: page.diagnostics?.responseLength ?? null,
                hasGoldOverview: Boolean(doc?.querySelector('#gold_overview')),
                hasAutoMintingTable: Boolean(doc?.querySelector(selectors.table)),
                totalForms: doc?.querySelectorAll('form').length ?? 0, autoMintingForms: forms.length,
                forms: forms.map(describeForm), startAutoMintingCandidates: candidates(START), cancelAutoMintingCandidates: candidates(CANCEL),
                selectedState: result.state, selectedFormAction: selected?.selectedAction ?? null,
                selectedFormMethod: selected?.method ?? null, selectedFormFieldNames: selected?.fieldNames ?? [],
                selectedFormHasH: Boolean(selected?.selectedHCount),
                resultReason: result.reason,
                hCounts: { document: doc?.querySelectorAll(selectors.token).length ?? 0,
                    autoMintingTable: doc?.querySelectorAll('table.auto-minting input[name="h"]').length ?? 0,
                    selectedForm: selected?.selectedHCount ?? 0 }
            };
        };
        const sameContext = (url, villageId, action = null) => {
            if (url.origin !== origin || url.pathname !== '/game.php' || url.username || url.password || url.hash) return false;
            const expected = { village: String(villageId), screen: 'snob', ...(action ? { action } : {}) };
            for (const [key, value] of Object.entries(expected)) if (url.searchParams.getAll(key).length !== 1 || url.searchParams.get(key) !== value) return false;
            const sitter = String(gameData().player?.sitter || 0), t = url.searchParams.getAll('t');
            return sitter === '0' ? t.length === 0 : t.length === 1 && t[0] === sitter;
        };
        const academyUrl = villageId => {
            if (!/^[1-9]\d*$/.test(String(villageId))) throw new Error('INVALID_VILLAGE');
            const url = new URL('/game.php', origin);
            url.search = new URLSearchParams({ village: String(villageId), screen: 'snob' }).toString();
            const sitter = String(gameData().player?.sitter || 0);
            if (sitter !== '0') url.searchParams.set('t', sitter);
            return url;
        };
        const parsePage = (doc, url, villageId) => {
            const diagnostics = { finalGetUrl: safeUrl(url), formCount: doc.querySelectorAll('form').length,
                tableCount: doc.querySelectorAll(selectors.table).length, candidateCount: 0, selectedAction: null,
                method: null, fieldNames: [], documentHCount: doc.querySelectorAll(selectors.token).length, selectedHCount: 0, selectedHHasValue: false };
            const base = { villageId: String(villageId), state: 'PARSE_FAILED', reason: null, endTime: null, actionUrl: null, h: null, diagnostics };
            const result = (state, reason = null) => ({ ...base, state, reason });
            if (doc.querySelector(selectors.login)) return result('SESSION_INVALID', 'LOGIN_PAGE');
            if (!sameContext(url, villageId) || doc.querySelector('meta[http-equiv="refresh" i]')) return result('SESSION_INVALID', 'INVALID_PAGE');
            if (!diagnostics.tableCount) {
                const academyPage = doc.querySelector('#content_value, #contentContainer') || (doc.querySelector('#serverDate') && doc.querySelector('#serverTime'));
                return academyPage ? result('UNAVAILABLE', 'NO_AUTO_MINTING_TABLE') : result('PARSE_FAILED', 'INVALID_PAGE');
            }
            if (diagnostics.tableCount !== 1) return result('PARSE_FAILED', 'MULTIPLE_TABLES');
            const table = doc.querySelector(selectors.table), forms = [...table.querySelectorAll('form')];
            const candidates = forms.filter(form => {
                try { return [START, CANCEL].includes(new URL(form.getAttribute('action'), url).searchParams.get('action')); }
                catch { return false; }
            });
            diagnostics.candidateCount = candidates.length;
            if (!candidates.length) return forms.length ? result('PARSE_FAILED', 'INVALID_ACTION') : result('UNAVAILABLE', 'NO_AUTO_MINTING_FORM');
            if (candidates.length !== 1) return result('PARSE_FAILED', 'MULTIPLE_FORMS');
            const form = candidates[0], action = new URL(form.getAttribute('action'), url), kind = action.searchParams.get('action');
            const tokens = form.querySelectorAll(selectors.token);
            Object.assign(diagnostics, { selectedAction: safeUrl(action), method: form.method.toUpperCase(),
                fieldNames: [...new Set([...form.querySelectorAll('[name]')].map(field => /^[a-z_\[\]]{1,40}$/.test(field.getAttribute('name')) ? field.getAttribute('name') : '[redacted-name]'))],
                selectedHCount: tokens.length, selectedHHasValue: tokens.length === 1 && Boolean(tokens[0].value.trim()) });
            if (!sameContext(action, villageId, kind)) return result('PARSE_FAILED', 'INVALID_ACTION');
            if (form.method.toLowerCase() !== 'post') return result('PARSE_FAILED', 'INVALID_METHOD');
            if (!tokens.length || (tokens.length === 1 && !tokens[0].value.trim())) return result('PARSE_FAILED', 'NO_H_FIELD');
            if (tokens.length !== 1 || tokens[0].matches(':disabled') || tokens[0].form !== form) return result('PARSE_FAILED', 'INVALID_H_FIELD');
            if ([...form.querySelectorAll('input[name], select[name], textarea[name], button[name]')].some(field => field.name !== 'h' && !field.matches(':disabled'))) return result('PARSE_FAILED', 'UNSUPPORTED_FIELDS');
            if (form.querySelector('button:disabled, input[type="submit"]:disabled')) return result('UNAVAILABLE', 'DISABLED_CONTROL');
            return { ...base, state: kind === START ? 'AVAILABLE' : 'ACTIVE', actionUrl: action.href, h: tokens[0].value };
        };
        const requestDocument = async (url, options = {}) => {
            const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 20000);
            try {
                const response = await fetchPage(String(url), { credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'follow',
                    ...options, headers: { Accept: 'text/html', ...options.headers }, signal: abort.signal });
                const mime = (response.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
                const diagnostics = { finalGetUrl: safeUrl(response.url), finalUrl: diagnosticUrl(response.url), ok: Boolean(response.ok), responseLength: null, redirected: Boolean(response.redirected), httpStatus: response.status,
                    contentType: ['text/html', 'application/json', 'text/plain', 'application/xhtml+xml'].includes(mime) ? mime : '[other-or-missing]' };
                if ([401, 403].includes(response.status)) return { state: 'SESSION_INVALID', reason: 'HTTP_SESSION_INVALID', diagnostics };
                if (!response.ok || mime !== 'text/html') return { state: 'PARSE_FAILED', reason: !response.ok ? 'HTTP_ERROR' : 'INVALID_CONTENT_TYPE', diagnostics };
                // Parse the fresh response directly. Detached scripts never execute.
                const html = await response.text();
                diagnostics.responseLength = html.length;
                return { doc: new DOMParser().parseFromString(html, 'text/html'), url: new URL(response.url), diagnostics };
            } catch { return { state: 'PARSE_FAILED', reason: 'REQUEST_FAILED' }; }
            finally { clearTimeout(timeout); }
        };
        const inspectMinting = async villageId => {
            let page, requestedGetUrl = '[invalid-url]';
            try { const url = academyUrl(villageId); requestedGetUrl = diagnosticUrl(url); page = await requestDocument(url); }
            catch { page = { state: 'PARSE_FAILED', reason: 'INVALID_VILLAGE' }; }
            const result = page.doc ? parsePage(page.doc, page.url, villageId)
                : { villageId: String(villageId), state: page.state, reason: page.reason, endTime: null, actionUrl: null, h: null };
            try { onDiagnostic(liveDiagnostic(page, result, villageId, requestedGetUrl)); } catch {}
            return result;
        };
        const activateVillage = async (row, { beforePost = () => true } = {}) => {
            const id = String(row.villageId);
            const result = (state, outcome, reason = null) => ({ villageId: id, state, outcome, reason, endTime: null });
            if (pending.has(id)) return result('PARSE_FAILED', 'SKIPPED', 'ALREADY_RUNNING');
            pending.add(id);
            let sent = false;
            try {
                const current = await inspectMinting(id);
                if (current.state !== 'AVAILABLE') return result(current.state, 'SKIPPED', current.reason || 'ALREADY_ACTIVE');
                // The controller durably claims this attempt before the only POST.
                if (beforePost() !== true) return result('AVAILABLE', 'SKIPPED', 'CANCELLED');
                sent = true;
                const page = await requestDocument(current.actionUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ h: current.h }).toString() });
                if (!page.doc) return result('UNCERTAIN', 'UNCERTAIN', page.reason);
                const response = parsePage(page.doc, page.url, id);
                if (response.state === 'SESSION_INVALID') return result('UNCERTAIN', 'UNCERTAIN', response.reason);
                // A final fresh Academy GET confirms the official state, not an HTTP status or success text.
                const final = await inspectMinting(id);
                return final.state === 'ACTIVE' ? result('ACTIVE', 'ACTIVATED') : result('UNCERTAIN', 'UNCERTAIN', final.reason || 'ACTIVATION_NOT_CONFIRMED');
            } catch { return result(sent ? 'UNCERTAIN' : 'PARSE_FAILED', sent ? 'UNCERTAIN' : 'SKIPPED', 'REQUEST_FAILED'); }
            finally { pending.delete(id); }
        };
        return { available: true, parsePage, inspectMinting, activateVillage,
            async inspectVillage(village) {
                const value = await inspectMinting(village.id);
                // Explicit allowlist: tokens, action URLs and documents never reach storage/UI.
                return { villageId: String(village.id), villageName: village.name || String(village.id), state: value.state, reason: value.reason, endTime: null };
            } };
    };
    EAS.Adapters.Minting = { ...createAdapter(), createAdapter };
})();
