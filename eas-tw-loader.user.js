// ==UserScript==
// @name         EAS TW Hub Loader
// @namespace    eas.tw.hub
// @version      0.1.0
// @description  Carrega silenciosamente o EAS TW Hub e retoma execuções após navegações.
// @match        https://tribalwars.com.br/game.php*
// @match        https://*.tribalwars.com.br/game.php*
// @run-at       document-idle
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @connect      easdeveloper.github.io
// ==/UserScript==

(() => {
    'use strict';

    // Temporary DEV bootstrap probe: intentionally self-contained before loader guards/network.
    ((root, stage) => {
        try {
            const marker = root.EASFakeBootstrapDebug = root.EASFakeBootstrapDebug || {
                loaded: true, url: root.location.href, timestamp: Date.now(),
                codeSource: root.EASLocalBuild ? 'local-embedded' : 'remote',
                localBuildId: root.EASLocalBuild?.id || null,
                loaderReached: false, indexReached: false, fakeModuleReached: false,
                fakeModuleInitialized: false, resumeRequested: false,
                resumeEntered: false, confirmationHandlerEntered: false, events: []
            };
            root.__EASFakeBootstrapMark = (event, details = {}) => {
                try {
                    marker[event] = true;
                    marker.lastEvent = event;
                    marker.events.push({ event, timestamp: Date.now(), ...details });
                    if (marker.events.length > 40) marker.events.shift();
                    const url = new URL(root.location.href);
                    let execution = null, storageError = null;
                    try { execution = JSON.parse(root.localStorage.getItem('eas_tw_fakes_execution') || 'null'); }
                    catch (error) { storageError = String(error); }
                    console.log?.('[EAS][FAKE][BOOTSTRAP]', { event, ...details, url: url.href,
                        fakeExecutionDetected: Boolean(execution), storageError,
                        confirmPageDetected: url.searchParams.get('screen') === 'place' && url.searchParams.get('try') === 'confirm',
                        resumeRequested: marker.resumeRequested, fakeModuleInitialized: marker.fakeModuleInitialized });
                } catch { /* Diagnostic failure must not affect bootstrap. */ }
            };
            if (typeof root.EASFakeDebug !== 'function') root.EASFakeDebug = () => {
                let execution = null, storageError = null;
                try { execution = JSON.parse(root.localStorage.getItem('eas_tw_fakes_execution') || 'null'); }
                catch (error) { storageError = String(error); }
                const entry = execution?.queue?.[execution.currentIndex];
                const form = root.document.querySelector('#command-data-form');
                const button = form?.querySelector('#troop_confirm_submit');
                const snapshot = { url: root.location.href, executionFound: Boolean(execution), storageError,
                    executionId: execution?.executionTab || null, tabId: root.name,
                    tabAuthorized: Boolean(execution?.executionTab && execution.executionTab === root.name),
                    currentCommand: entry || null,
                    currentCommandId: entry ? `${execution.currentIndex}:${entry.villageId || 0}:${entry.target || ''}` : null,
                    commandState: entry?.status || null, attemptId: entry?.confirmationAttempt?.attemptId || null,
                    confirmationLock: entry?.confirmationAttempt || null,
                    formFound: Boolean(form), buttonFound: Boolean(button), buttonDisabled: button?.disabled ?? null,
                    canConfirm: null, blockedReason: !marker.fakeModuleInitialized ? 'FAKE_MODULE_NOT_INITIALIZED'
                        : !marker.resumeEntered ? 'FAKE_RESUME_NOT_ENTERED' : 'CONFIRMATION_DIAGNOSTIC_NOT_REGISTERED',
                    bootstrap: marker };
                const copy = JSON.parse(JSON.stringify(snapshot));
                console.log?.('[EAS][FAKE][BOOTSTRAP] snapshot', copy);
                return copy;
            };
            root.__EASFakeBootstrapMark(stage, { message: stage === 'indexReached' ? 'index reached' : 'loader reached' });
        } catch { /* Keep the original loader behavior. */ }
    })(typeof unsafeWindow === 'undefined' ? window : unsafeWindow, 'loaderReached');


    const LOADER_VERSION = '0.1.0';
    const BUNDLE_URL = 'https://easdeveloper.github.io/eas-tw-hub/index.js';
    const SCRIPT_SELECTOR = 'script[data-eas-userscript-bundle]';
    const LOAD_TIMEOUT_MS = 15000;
    const pageWindow = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;

    const log = (event, details = {}) => console.info(`[EAS TW Loader] ${event}`, details);
    const pageContext = () => {
        const url = new URL(pageWindow.location.href);
        const state = (() => {
            try {
                const root = JSON.parse(pageWindow.localStorage.getItem('eas_tw_scheduler_v2') || 'null');
                if (root?.contexts) return Object.values(root.contexts).find((context) => context?.activeMissionId || context?.missions?.some((item) => item.id === url.searchParams.get('eas_mission'))) || null;
                return JSON.parse(pageWindow.localStorage.getItem('eas_tw_scheduler') || 'null');
            } catch { return null; }
        })();
        const missionIdFromUrl = url.searchParams.get('eas_mission');
        const tabExecutionId = url.searchParams.get('eas_scheduled_execution');
        const mission = state?.missions?.find((item) => item.id === missionIdFromUrl || item.id === state.activeMissionId);
        const pageStage = url.searchParams.get('screen') === 'place'
            ? (url.searchParams.get('try') === 'confirm' ? 'scheduled-confirmation' : 'scheduled-preparation')
            : `${url.searchParams.get('screen') || 'unknown'}:${url.searchParams.get('mode') || ''}`;
        return {
            loaderVersion: LOADER_VERSION,
            codeSource: pageWindow.EASLocalBuild ? 'local-embedded' : BUNDLE_URL,
            localBuildId: pageWindow.EASLocalBuild?.id || null,
            bundleVersion: pageWindow.EAS?.version || null,
            url: url.href,
            pageStage,
            missionIdFromUrl,
            tabExecutionId,
            activeRuntimeType: mission ? 'scheduled-mission' : null,
            bootstrapState: {
                bootstrapped: Boolean(pageWindow.__EAS_TW_BOOTSTRAPPED__),
                initializing: Boolean(pageWindow.__EAS_TW_INITIALIZING__),
                resumed: Boolean(pageWindow.__EAS_TW_RUNTIME_RESUMED__)
            }
        };
    };
    const hasActiveRuntime = () => {
        const url = new URL(pageWindow.location.href);
        if (url.searchParams.get('eas_mission') || url.searchParams.get('eas_scheduled_execution')) return true;
        return ['eas_tw_fakes_execution', 'eas_tw_scheduler_v2', 'eas_tw_scheduler', 'eas_tw_market_target_supply_execution', 'eas_tw_market_offers_execution', 'eas_tw_market_balance_execution']
            .some((key) => {
                try {
                    const value = JSON.parse(pageWindow.localStorage.getItem(key) || 'null');
                    const scheduledActive = value?.contexts && Object.values(value.contexts).some((context) => context?.activeMissionId);
                    return Boolean(value && !value.endedAt && !value.finishedAt && (scheduledActive || value.activeMissionId || value.currentItemId || value.queue?.length));
                } catch { return false; }
            });
    };
    const showResumeError = (message) => {
        if (!hasActiveRuntime() || pageWindow.document.getElementById('eas-tw-loader-resume-error')) return;
        const notice = pageWindow.document.createElement('div');
        notice.id = 'eas-tw-loader-resume-error';
        notice.style.cssText = 'position:fixed;z-index:2147483647;top:10px;right:10px;max-width:360px;padding:12px;background:#fff3cd;border:1px solid #856404;color:#533f03;font:13px Arial';
        notice.textContent = message;
        (pageWindow.document.body || pageWindow.document.documentElement).appendChild(notice);
    };
    const start = () => {
        log('eas-loader-start', pageContext());
        if (pageWindow.__EAS_TW_BOOTSTRAPPED__ || pageWindow.__EAS_TW_INITIALIZING__ || pageWindow.document.querySelector(SCRIPT_SELECTOR)) {
            pageWindow.__EASFakeBootstrapMark?.('loaderGuardReturned', pageContext().bootstrapState);
            log('eas-loader-already-running', pageContext());
            return;
        }
        pageWindow.__EAS_TW_INITIALIZING__ = true;
        pageWindow.__EAS_TW_SILENT_BOOTSTRAP__ = true;
        const script = pageWindow.document.createElement('script');
        script.src = pageWindow.EASLocalBuild
            ? URL.createObjectURL(new Blob([pageWindow.EASLocalBuild.files['index.js']], { type: 'text/javascript' }))
            : `${BUNDLE_URL}?loader=${encodeURIComponent(LOADER_VERSION)}&v=${Date.now()}`;
        script.async = true;
        script.dataset.easUserscriptBundle = 'true';
        pageWindow.__EASFakeBootstrapMark?.('bundleRequested', { src: script.src });
        log('eas-loader-bundle-requested', pageContext());
        let finished = false;
        const finish = (success, error = null) => {
            if (finished) return;
            finished = true;
            pageWindow.clearTimeout(timeout);
            pageWindow.removeEventListener('eas-tw-hub-ready', ready);
            pageWindow.removeEventListener('eas-tw-hub-error', failed);
            pageWindow.__EAS_TW_INITIALIZING__ = false;
            pageWindow.__EASFakeBootstrapMark?.(success ? 'bundleReady' : 'bundleError', { error: error ? String(error.message || error) : null });
            if (success) {
                pageWindow.__EAS_TW_BOOTSTRAPPED__ = true;
            } else {
                pageWindow.__EAS_TW_BOOTSTRAPPED__ = false;
                log('eas-loader-bundle-error', { ...pageContext(), error: String(error?.message || error) });
                showResumeError('O EAS TW Hub não pôde retomar a execução ativa. Use o atalho manual e copie o diagnóstico.');
            }
        };
        const ready = () => finish(true);
        const failed = (event) => finish(false, new Error(event.detail?.message || 'Falha ao inicializar o bundle.'));
        pageWindow.addEventListener('eas-tw-hub-ready', ready, { once: true });
        pageWindow.addEventListener('eas-tw-hub-error', failed, { once: true });
        const timeout = pageWindow.setTimeout(() => {
            script.remove();
            finish(false, new Error('Tempo limite ao carregar o bundle oficial.'));
        }, LOAD_TIMEOUT_MS);
        script.onload = () => log('eas-loader-bundle-loaded', pageContext());
        script.onerror = () => finish(false, new Error('Falha de rede ao carregar o bundle oficial.'));
        (pageWindow.document.head || pageWindow.document.documentElement).appendChild(script);
    };

    pageWindow.EASTWUserscriptLoader = { version: LOADER_VERSION, bundleUrl: BUNDLE_URL, pageContext, hasActiveRuntime, start };
    start();
})();
