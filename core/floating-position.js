(() => {
    'use strict';

    const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    const clampPosition = (position, size, viewport) => {
        const width = Math.max(0, finite(viewport.width, 0));
        const height = Math.max(0, finite(viewport.height, 0));
        const margin = Math.min(12, width / 2, height / 2);
        const axis = (value, extent, available) => Math.min(
            Math.max(margin, available - Math.max(0, finite(extent, 0)) - margin),
            Math.max(margin, finite(value, margin))
        );
        return { x: axis(position?.x, size.width, width), y: axis(position?.y, size.height, height) };
    };
    const restoreState = (saved, minimizedByDefault = false) => {
        const position = (value) => ({ x: finite(value?.x, 12), y: finite(value?.y, 12) });
        return {
            version: 1,
            minimized: typeof saved?.minimized === 'boolean' ? saved.minimized : minimizedByDefault,
            panel: position(saved?.panel),
            launcher: position(saved?.launcher)
        };
    };

    // Shared by the header and launcher; pointer events also support touch/pen.
    const attachDrag = (handle, element, onMove, onEnd, allowButton = false) => {
        let drag = null, suppressClick = false;
        const end = () => {
            if (!drag) return;
            suppressClick = drag.moved;
            drag = null;
            element.classList.remove('eas-tw-dragging');
            document.removeEventListener('pointermove', move);
            document.removeEventListener('pointerup', end);
            document.removeEventListener('pointercancel', end);
            window.removeEventListener('blur', end);
            onEnd();
        };
        const move = (event) => {
            if (!drag || event.pointerId !== drag.pointerId) return;
            const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
            if (!drag.moved && Math.hypot(dx, dy) < 4) return;
            drag.moved = true;
            event.preventDefault();
            onMove({ x: drag.left + dx, y: drag.top + dy });
        };
        handle.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || event.isPrimary === false || drag) return;
            if (!allowButton && event.target.closest('button, a, input, select, textarea, label')) return;
            suppressClick = false;
            const rect = element.getBoundingClientRect();
            drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
            event.preventDefault();
            element.classList.add('eas-tw-dragging');
            document.addEventListener('pointermove', move, { passive: false });
            document.addEventListener('pointerup', end);
            document.addEventListener('pointercancel', end);
            window.addEventListener('blur', end);
        });
        handle.addEventListener('click', (event) => {
            if (!suppressClick || event.detail === 0) return;
            suppressClick = false;
            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);
    };

    EAS.UI.FloatingPosition = { clampPosition, restoreState, attachDrag };
})();
