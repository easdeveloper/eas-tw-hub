(() => {
    'use strict';
    EAS.Adapters ||= {};
    EAS.Selectors ||= {};
    // Preserve the controller's existing state names; expose their semantic contract.
    // NO_ACADEMY requires separate native evidence, not an absent form or token.
    const STATES = Object.freeze({ AUTO_MINT_AVAILABLE: 'AVAILABLE', AUTO_MINT_ACTIVE: 'ACTIVE',
        AUTO_MINT_UNAVAILABLE: 'UNAVAILABLE', NO_ACADEMY: 'NO_ACADEMY', READ_ERROR: 'PARSE_FAILED' });
    const START = 'start_auto_minting_session', CANCEL = 'cancel_auto_minting_session';
    const selectors = EAS.Selectors.Minting = Object.freeze({ table: 'table.auto-minting', token: 'input[name="h"]',
        login: 'form#login, input[type="password"], input[name="password"]' });
    // Like Arrival Planner, encode the displayed server calendar with UTC fields.
    // This is server wall time, not a Unix instant in the player's PC timezone.
    const formatEndTime = value => {
        if (!Number.isSafeInteger(value)) return '—';
        const date = new Date(value), pad = n => String(n).padStart(2, '0');
        if (!Number.isFinite(date.getTime())) return '—';
        return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
    };
    const readActiveEndTime = (form, doc) => {
        try {
            const controls = form.closest('.auto-minting-controls');
            if (!controls) return null;
            // Read a complete leaf line in the proven surrounding controls only.
            const lines = [...controls.querySelectorAll('div')].filter(node => !node.children.length)
                .map(node => node.textContent.replace(/\s+/g, ' ').trim()).filter(text => /^Fim\s*:/i.test(text));
            if (lines.length !== 1) return null;
            const match = /^Fim:\s*(hoje|amanhã)\s+às\s+(\d{2}):(\d{2}):(\d{2})$/i.exec(lines[0]);
            if (!match || +match[2] > 23 || +match[3] > 59 || +match[4] > 59) return null;
            const dates = [...doc.querySelectorAll('#serverDate')];
            if (dates.length > 1) return null;
            // Detached responses must use their own date, including across midnight.
            // Never substitute the PC date or a newer live-page date for a response.
            const live = !dates.length && doc === document ? EAS.World?.getServerDateTime?.() : null;
            const dateText = dates[0]?.textContent.trim() || (live?.available ? live.date : '');
            const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateText || '');
            if (!parts) return null;
            const [, day, month, year] = parts.map(Number), date = new Date(Date.UTC(year, month - 1, day));
            if (year < 1970 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
            date.setUTCDate(date.getUTCDate() + (match[1].toLowerCase() === 'amanhã' ? 1 : 0));
            date.setUTCHours(+match[2], +match[3], +match[4], 0);
            return date.getTime();
        } catch { return null; } // Optional metadata must never change the ACTIVE decision.
    };
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
                        || (key === 'mode' && val === 'train')
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
        // TEMPORARY read-only comparison. Never use live fields as a parser/token fallback.
        const compareLiveDocument = villageId => {
            const comparison = { applicable: false, sameVillage: false, hasAutoMintingTable: false,
                startCandidates: 0, cancelCandidates: 0,
                hCounts: { document: 0, autoMintingTable: 0, matchingForm: 0 }, matchingFormFieldNames: [] };
            try {
                const url = new URL(location.href), currentVillage = gameData().village?.id;
                comparison.sameVillage = url.searchParams.getAll('village').length === 1
                    && url.searchParams.get('village') === String(villageId)
                    && (currentVillage == null || String(currentVillage) === String(villageId));
                comparison.applicable = comparison.sameVillage && url.origin === origin
                    && url.searchParams.getAll('screen').length === 1 && url.searchParams.get('screen') === 'snob';
                if (!comparison.applicable) return comparison;
                const doc = document, forms = [...doc.querySelectorAll('table.auto-minting form')];
                const matching = forms.filter(form => {
                    try {
                        const action = new URL(form.getAttribute('action'), url), kind = action.searchParams.get('action');
                        if (![START, CANCEL].includes(kind) || !sameContext(action, villageId, kind)) return false;
                        if (kind === START) comparison.startCandidates++; else comparison.cancelCandidates++;
                        return true;
                    } catch { return false; }
                });
                comparison.hasAutoMintingTable = Boolean(doc.querySelector(selectors.table));
                comparison.hCounts.document = doc.querySelectorAll(selectors.token).length;
                comparison.hCounts.autoMintingTable = doc.querySelectorAll('table.auto-minting input[name="h"]').length;
                // Ambiguous matches are not selected, just as with the fetched document.
                if (matching.length === 1) {
                    comparison.hCounts.matchingForm = matching[0].querySelectorAll(selectors.token).length;
                    comparison.matchingFormFieldNames = [...new Set([...matching[0].querySelectorAll('[name]')].map(field =>
                        /^[a-z_\[\]]{1,40}$/.test(field.getAttribute('name')) ? field.getAttribute('name') : '[redacted-name]'))];
                }
            } catch { /* Diagnostic failure must never affect the fetched parser result. */ }
            return comparison;
        };
        const rawMarkers = html => ({
            // Lexical marker only: markup inside comments/scripts may also match. Never return excerpts.
            containsHInputMarkup: [...html.matchAll(/<input\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi)].some(([tag]) =>
                [...tag.matchAll(/\s([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].some(attribute =>
                    attribute[1].toLowerCase() === 'name' && (attribute[2] ?? attribute[3] ?? attribute[4]) === 'h')),
            containsStartAutoMintingAction: html.includes(START),
            containsCancelAutoMintingAction: html.includes(CANCEL)
        });
        // TEMPORARY: presence only; do not read the h value or invoke the official helper.
        const rawFormDiagnostic = (form, baseUrl) => {
            let action;
            try { action = new URL(form.getAttribute('action'), baseUrl); } catch {}
            return {
                isStartAutoMinting: action?.searchParams.get('action') === START,
                isCancelAutoMinting: action?.searchParams.get('action') === CANCEL,
                method: form.method.toUpperCase(),
                hasHQueryParamInRawAction: action?.searchParams.has('h') ?? false,
                hasHiddenHField: Boolean(form.querySelector('input[type="hidden"][name="h"]'))
            };
        };
        const runtimeDiagnostic = () => {
            try {
                const pageWindow = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
                const ui = pageWindow.UI;
                return { hasUI: Boolean(ui), hasFixupCSRFInUrl: typeof ui?.fixupCSRFInUrl === 'function' };
            } catch { return { hasUI: false, hasFixupCSRFInUrl: false }; }
        };
        const diagnosticForms = (doc, baseUrl) => [...new Set([
            ...(doc?.querySelectorAll('table.auto-minting form') || []),
            ...[...(doc?.querySelectorAll('form') || [])].filter(form => {
                try { return [START, CANCEL].includes(new URL(form.getAttribute('action'), baseUrl).searchParams.get('action')); } catch { return false; }
            })
        ])];
        const liveDiagnostic = (page, result, villageId, requestedUrl) => {
            const doc = page.doc, forms = diagnosticForms(doc, page.url);
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
                tokenSource: selected?.tokenSource ?? null, academyPresent: selected?.academyPresent ?? null,
                resultReason: result.reason,
                rawFormDiagnostics: forms.map(form => rawFormDiagnostic(form, page.url)),
                runtimeDiagnostics: runtimeDiagnostic(),
                liveDocumentComparison: compareLiveDocument(villageId),
                rawMarkers: page.diagnostics?.rawMarkers ?? { containsHInputMarkup: false, containsStartAutoMintingAction: false, containsCancelAutoMintingAction: false },
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
            url.search = new URLSearchParams({ village: String(villageId), screen: 'snob', mode: 'train' }).toString();
            const sitter = String(gameData().player?.sitter || 0);
            if (sitter !== '0') url.searchParams.set('t', sitter);
            return url;
        };
        const parsePage = (doc, url, villageId) => {
            const diagnostics = { finalGetUrl: safeUrl(url), formCount: doc.querySelectorAll('form').length,
                tableCount: doc.querySelectorAll(selectors.table).length, candidateCount: 0, selectedAction: null,
                method: null, fieldNames: [], tokenSource: null, actionHCount: 0, academyPresent: null, documentHCount: doc.querySelectorAll(selectors.token).length, selectedHCount: 0, selectedHHasValue: false };
            const base = { villageId: String(villageId), state: 'PARSE_FAILED', reason: null, endTime: null, actionUrl: null, h: null, diagnostics };
            const result = (state, reason = null) => ({ ...base, state, reason });
            if (doc.querySelector(selectors.login)) return result('SESSION_INVALID', 'LOGIN_PAGE');
            if (!sameContext(url, villageId) || doc.querySelector('meta[http-equiv="refresh" i]')) return result('SESSION_INVALID', 'INVALID_PAGE');
            if (doc.querySelector('.error_box, .error')) return result('PARSE_FAILED', 'GAME_ERROR');
            // The official action is the evidence; a surrounding table is optional.
            // Missing forms/tokens never prove that a village has no Academy.
            if (diagnostics.tableCount > 1) return result('PARSE_FAILED', 'MULTIPLE_TABLES');
            const forms = [...doc.querySelectorAll('form')];
            diagnostics.academyPresent = Boolean(diagnostics.tableCount || doc.querySelector('#gold_overview')) || null;
            const candidates = forms.filter(form => {
                try { return [START, CANCEL].includes(new URL(form.getAttribute('action'), url).searchParams.get('action')); }
                catch { return false; }
            });
            diagnostics.candidateCount = candidates.length;
            if (!candidates.length) return forms.length ? result('PARSE_FAILED', 'INVALID_ACTION')
                : result(diagnostics.academyPresent ? 'UNAVAILABLE' : 'PARSE_FAILED', 'NO_AUTO_MINT_FORM');
            if (candidates.length !== 1) return result('PARSE_FAILED', 'MULTIPLE_FORMS');
            const form = candidates[0], action = new URL(form.getAttribute('action'), url), kind = action.searchParams.get('action');
            const tokens = form.querySelectorAll(selectors.token), queryTokens = action.searchParams.getAll('h');
            Object.assign(diagnostics, { selectedAction: safeUrl(action), method: form.method.toUpperCase(),
                fieldNames: [...new Set([...form.querySelectorAll('[name]')].map(field => /^[a-z_\[\]]{1,40}$/.test(field.getAttribute('name')) ? field.getAttribute('name') : '[redacted-name]'))],
                actionHCount: queryTokens.length, selectedHCount: tokens.length, selectedHHasValue: tokens.length === 1 && Boolean(tokens[0].value.trim()) });
            if (!sameContext(action, villageId, kind)) return result('PARSE_FAILED', 'INVALID_ACTION');
            if (form.method.toLowerCase() !== 'post') return result('PARSE_FAILED', 'INVALID_METHOD');
            diagnostics.academyPresent = true;
            if (tokens.length > 1 || (tokens.length === 1 && (tokens[0].matches(':disabled') || tokens[0].form !== form))) return result('PARSE_FAILED', 'INVALID_H_FIELD');
            if (queryTokens.length > 1) return result('PARSE_FAILED', 'INVALID_H_TOKEN');
            const inputToken = tokens.length ? tokens[0].value : null, queryToken = queryTokens.length ? queryTokens[0] : null;
            if (inputToken !== null && queryToken !== null && inputToken !== queryToken) return result('PARSE_FAILED', 'H_TOKEN_CONFLICT');
            const token = queryToken ?? inputToken;
            if (!token?.trim()) return result('PARSE_FAILED', 'NO_H_TOKEN');
            diagnostics.tokenSource = queryToken !== null ? (inputToken !== null ? 'action-and-input' : 'action-query') : 'form-input';
            if ([...form.querySelectorAll('input[name], select[name], textarea[name], button[name]')].some(field => field.name !== 'h' && !field.matches(':disabled'))) return result('PARSE_FAILED', 'UNSUPPORTED_FIELDS');
            if (form.querySelector('button:disabled, input[type="submit"]:disabled')) return result('UNAVAILABLE', 'DISABLED_CONTROL');
            return { ...base, state: kind === START ? 'AVAILABLE' : 'ACTIVE', actionUrl: action.href, h: token, tokenInInput: tokens.length === 1,
                endTime: kind === CANCEL ? readActiveEndTime(form, doc) : null };
        };
        const requestDocument = async (url, options = {}) => {
            const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 20000);
            try {
                if (window.EASRateLimit?.check()) throw new Error('RATE_LIMITED');
                const response = await fetchPage(String(url), { credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'follow',
                    ...options, headers: { Accept: 'text/html', ...options.headers }, signal: abort.signal });
                const mime = (response.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
                if (window.EASRateLimit?.reportStatus(response.status)) throw new Error('RATE_LIMITED');
                const diagnostics = { finalGetUrl: safeUrl(response.url), finalUrl: diagnosticUrl(response.url), ok: Boolean(response.ok), responseLength: null, redirected: Boolean(response.redirected), httpStatus: response.status,
                    contentType: ['text/html', 'application/json', 'text/plain', 'application/xhtml+xml'].includes(mime) ? mime : '[other-or-missing]' };
                if ([401, 403].includes(response.status)) return { state: 'SESSION_INVALID', reason: 'HTTP_SESSION_INVALID', diagnostics };
                if (!response.ok || mime !== 'text/html') return { state: 'PARSE_FAILED', reason: !response.ok ? 'HTTP_ERROR' : 'INVALID_CONTENT_TYPE', diagnostics };
                // Parse the fresh response directly. Detached scripts never execute.
                const html = await response.text();
                diagnostics.responseLength = html.length;
                diagnostics.rawMarkers = rawMarkers(html);
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
        const activateVillage = async (row, { beforePost = () => false } = {}) => {
            const id = String(row.villageId);
            const result = (state, outcome, reason = null, endTime = null) => ({ villageId: id, state, outcome, reason, endTime });
            if (pending.has(id)) return result('PARSE_FAILED', 'SKIPPED', 'ALREADY_RUNNING');
            pending.add(id);
            let sent = false;
            try {
                const current = await inspectMinting(id);
                if (current.state !== 'AVAILABLE') return result(current.state, 'SKIPPED', current.reason || 'ALREADY_ACTIVE', current.endTime);
                // The controller durably claims this attempt before the only POST.
                if (beforePost() !== true) return result('AVAILABLE', 'SKIPPED', 'CANCELLED');
                sent = true;
                const page = await requestDocument(current.actionUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(current.tokenInInput ? { h: current.h } : {}).toString() });
                if (!page.doc) return result('UNCERTAIN', 'UNCERTAIN', page.reason);
                const response = parsePage(page.doc, page.url, id);
                if (response.state === 'SESSION_INVALID') return result('UNCERTAIN', 'UNCERTAIN', response.reason);
                // A final fresh Academy GET confirms the official state, not an HTTP status or success text.
                const final = await inspectMinting(id);
                return final.state === 'ACTIVE' ? result('ACTIVE', 'ACTIVATED', null, final.endTime) : result('UNCERTAIN', 'UNCERTAIN', final.reason || 'ACTIVATION_NOT_CONFIRMED');
            } catch { return result(sent ? 'UNCERTAIN' : 'PARSE_FAILED', sent ? 'UNCERTAIN' : 'SKIPPED', 'REQUEST_FAILED'); }
            finally { pending.delete(id); }
        };
        return { available: true, states: STATES, formatEndTime, parsePage, inspectMinting, activateVillage,
            async inspectVillage(village) {
                const value = await inspectMinting(village.id);
                // Explicit allowlist: tokens, action URLs and documents never reach storage/UI.
                return { villageId: String(village.id), villageName: village.name || String(village.id), state: value.state, reason: value.reason, endTime: value.endTime };
            } };
    };
    EAS.Adapters.Minting = { ...createAdapter(), createAdapter };
})();
