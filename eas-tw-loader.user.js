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
        return ['eas_tw_scheduler_v2', 'eas_tw_scheduler', 'eas_tw_market_target_supply_execution', 'eas_tw_market_offers_execution', 'eas_tw_market_balance_execution']
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
            log('eas-loader-already-running', pageContext());
            return;
        }
        pageWindow.__EAS_TW_INITIALIZING__ = true;
        pageWindow.__EAS_TW_SILENT_BOOTSTRAP__ = true;
        const script = pageWindow.document.createElement('script');
        script.src = `${BUNDLE_URL}?loader=${encodeURIComponent(LOADER_VERSION)}&v=${Date.now()}`;
        script.async = true;
        script.dataset.easUserscriptBundle = 'true';
        log('eas-loader-bundle-requested', pageContext());
        let finished = false;
        const finish = (success, error = null) => {
            if (finished) return;
            finished = true;
            pageWindow.clearTimeout(timeout);
            pageWindow.removeEventListener('eas-tw-hub-ready', ready);
            pageWindow.removeEventListener('eas-tw-hub-error', failed);
            pageWindow.__EAS_TW_INITIALIZING__ = false;
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
