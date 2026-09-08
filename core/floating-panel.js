(() => {
    'use strict';

    const STORAGE_KEY = 'floating-panel';
    let panel, launcher, body, state;
    const position = () => EAS.UI.FloatingPosition;
    const persist = () => EAS.Storage.set(STORAGE_KEY, state);
    const clampToViewport = (element, key, next = state[key]) => {
        const rect = element.getBoundingClientRect();
        state[key] = position().clampPosition(next, rect, { width: window.innerWidth, height: window.innerHeight });
        element.style.left = `${state[key].x}px`;
        element.style.top = `${state[key].y}px`;
    };
    const clampVisible = () => {
        clampToViewport(state.minimized ? launcher : panel, state.minimized ? 'launcher' : 'panel');
        persist();
    };
    const renderContent = () => {
        body.replaceChildren();
        const version = document.createElement('div');
        version.className = 'eas-version';
        version.textContent = `Versão ${EAS.version}`;
        EAS.UI.renderHubDashboard({ element: panel, body }, version);
    };
    const showState = () => {
        panel.hidden = state.minimized;
        launcher.hidden = !state.minimized;
        clampVisible();
    };
    const removeLegacyShortcut = () => {
        // Only the exact Hub entry, inside the game's quickbar. Other scripts stay untouched.
        document.querySelectorAll('#quickbar_contents a, #quickbar a').forEach((link) => {
            if (link.textContent.trim().replace(/\s+/g, ' ') === 'EAS TW Hub') link.remove();
        });
    };
    const initialize = ({ minimizedByDefault = false } = {}) => {
        if (panel?.isConnected && launcher?.isConnected) return;
        state = position().restoreState(EAS.Storage.get(STORAGE_KEY), minimizedByDefault);
        panel = document.createElement('section');
        panel.id = 'eas-tw-hub-root';
        panel.className = 'eas-window eas-tw-panel';
        panel.setAttribute('data-eas-tw-hub', 'window');
        panel.setAttribute('aria-label', 'EAS TW Hub');
        panel.innerHTML = `
            <header class="eas-tw-panel-header">
                <strong>EAS TW Hub</strong>
                <button type="button" class="eas-tw-panel-control" data-eas-tw-minimize title="Minimizar" aria-label="Minimizar EAS TW Hub">−</button>
            </header>
            <nav class="eas-tw-panel-nav" aria-label="Navegação do EAS TW Hub">
                <button type="button" class="eas-tw-panel-control" aria-current="page" data-eas-tw-home>Ferramentas</button>
            </nav>
            <div class="eas-window__body eas-tw-panel-body"></div>`;
        body = panel.querySelector('.eas-tw-panel-body');
        launcher = document.createElement('button');
        launcher.type = 'button';
        launcher.className = 'eas-tw-launcher';
        launcher.textContent = 'EAS';
        launcher.title = 'Abrir EAS TW Hub';
        launcher.setAttribute('aria-label', launcher.title);
        launcher.setAttribute('aria-controls', panel.id);
        renderContent();
        document.body.append(panel, launcher);
        panel.querySelector('[data-eas-tw-minimize]').addEventListener('click', () => {
            minimize();
            launcher.focus({ preventScroll: true });
        });
        panel.querySelector('[data-eas-tw-home]').addEventListener('click', renderContent);
        position().attachDrag(panel.querySelector('.eas-tw-panel-header'), panel,
            (next) => clampToViewport(panel, 'panel', next), clampVisible);
        position().attachDrag(launcher, launcher,
            (next) => clampToViewport(launcher, 'launcher', next), clampVisible, true);
        launcher.addEventListener('click', () => {
            open();
            panel.querySelector('[data-eas-tw-minimize]').focus({ preventScroll: true });
        });
        window.addEventListener('resize', clampVisible);
        window.visualViewport?.addEventListener('resize', clampVisible);
        // Content can change height without a window resize (fonts, module badges).
        new ResizeObserver(clampVisible).observe(panel);
        showState();
        removeLegacyShortcut();
    };
    const open = () => {
        initialize();
        state.minimized = false;
        renderContent();
        showState();
        return { element: panel, body, close: minimize };
    };
    const minimize = () => {
        if (!panel) return;
        state.minimized = true;
        showState();
    };
    const toggle = () => {
        if (!panel || state.minimized) return open();
        minimize();
    };

    EAS.UI.FloatingPanel = { initialize, open, minimize, toggle, clampToViewport };
})();
