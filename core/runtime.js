(() => {
    'use strict';
    EAS.Runtime ||= {}; EAS.Window ||= {};
    const runtimes = new Map();
    EAS.Runtime.create = ({ id, type, payload = {}, persist = () => {}, onTransition = () => {} }) => {
        if (runtimes.has(id)) return runtimes.get(id); const resources = { timers: new Set(), intervals: new Set(), observers: new Set(), listeners: [] };
        const execution = { id, type, status: 'idle', currentIndex: 0, total: 0, startedAt: null, updatedAt: Date.now(), completedAt: null, error: null, payload, resources,
            transition(status, data = {}) { const previous = this.status; this.status = status; this.updatedAt = Date.now(); if (status === 'running' && !this.startedAt) this.startedAt = this.updatedAt; if (status === 'completed') this.completedAt = this.updatedAt; Object.assign(this, data); persist(this); EAS.Log?.info?.('runtime', 'transition', { executionId: id, type, previous, status }); onTransition({ previous, status, execution: this }); return this; },
            start(data) { return this.transition('running', data); }, resume(data) { return this.transition('running', data); }, pause(data) { return this.transition('paused', data); }, complete(data) { return this.transition('completed', data); }, cancel(data) { return this.transition('cancelled', data); },
            setTimeout(callback, delay, targetWindow = window) { const handle = targetWindow.setTimeout(() => { resources.timers.delete(handle); callback(); }, delay); resources.timers.add(handle); return handle; },
            setInterval(callback, delay, targetWindow = window) { const handle = targetWindow.setInterval(callback, delay); resources.intervals.add([targetWindow, handle]); return handle; }, observe(observer) { resources.observers.add(observer); return observer; }, listen(target, event, listener, options) { target.addEventListener(event, listener, options); resources.listeners.push([target,event,listener,options]); return listener; },
            dispose() { resources.timers.forEach((handle) => clearTimeout(handle)); resources.intervals.forEach(([targetWindow,handle]) => targetWindow.clearInterval(handle)); resources.observers.forEach((observer) => observer.disconnect?.()); resources.listeners.forEach(([target,event,listener,options]) => target.removeEventListener(event,listener,options)); resources.timers.clear(); resources.intervals.clear(); resources.observers.clear(); resources.listeners.length = 0; EAS.Log?.debug?.('runtime', 'disposed', { executionId: id, type }); }
        }; runtimes.set(id, execution); return execution;
    };
    EAS.Runtime.get = (id) => runtimes.get(id) || null; EAS.Runtime.dispose = (id) => { const runtime = runtimes.get(id); runtime?.dispose(); return runtimes.delete(id); };
    const aux = new Map();
    EAS.Window.openAuxiliary = ({ executionId, type, url, name = `eas-${type}-${executionId}`, ownerWindow = window }) => { const child = ownerWindow.open(url, name); if (child) aux.set(executionId, child); EAS.Log?.info?.('window', 'auxiliary-opened', { executionId, type, name }); return child; };
    EAS.Window.returnToMain = ({ targetWindow = window, executionId, type, summary } = {}) => { try { const opener = targetWindow.opener; if (!opener || opener.closed) return false; opener.postMessage({ source: 'eas-tw-hub', type: 'market-execution-finished', executionType: type, executionId, summary }, targetWindow.location.origin); opener.focus(); targetWindow.close(); EAS.Log?.info?.('window', 'returned-to-main', { executionId, type }); return true; } catch (error) { EAS.Log?.error?.('window', 'return-failed', error, { executionId }); return false; } };
    EAS.Window.closeAuxiliary = (executionId) => { const child = aux.get(executionId); if (child && !child.closed) child.close(); aux.delete(executionId); };
})();
