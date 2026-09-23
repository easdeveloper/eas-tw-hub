// Persistent diagnostics only: never participates in execution decisions.
(() => {
    const root = typeof unsafeWindow === 'undefined' ? window : unsafeWindow;
    if (root.__EASLogger) { if (root.EAS) root.EAS.Logger = root.__EASLogger; return; }
    const KEY = 'eas_tw_diagnostics_v1', LIMIT = 300, MAX_BYTES = 180000, TTL = 86400000;
    let pending = [], timer = null, sequence = 0, dropped = 0, storageError = null;
    const session = `${Date.now()}:${Math.random()}`;
    const safeUrl = value => {
        try { const url = new URL(value, root.location.href), out = new URL(url.origin + url.pathname);
            for (const key of ['screen','mode','village','try']) { const v = url.searchParams.get(key); if (v && /^[\w-]{1,40}$/.test(v)) out.searchParams.set(key,v); }
            return out.href;
        } catch { return '[invalid-url]'; }
    };
    const clean = (value, depth = 0, seen = new WeakSet()) => {
        if (depth > 4) return '[depth-limit]';
        if (typeof value === 'string') return value.slice(0,1500).replace(/(?:https?:\/\/|blob:https?:\/\/)[^\s"'<>]+/g, safeUrl).replace(/\b(h|token|csrf|password|cookie|authorization)=([^\s&]+)/gi,'$1=[redacted]');
        if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
        if (typeof value !== 'object') return String(value).slice(0,100);
        if (seen.has(value)) return '[circular]'; seen.add(value);
        if (Array.isArray(value)) return value.slice(0,20).map(v=>clean(v,depth+1,seen));
        const out = {};
        for (const key of Object.keys(value).slice(0,30)) {
            if (/^(h|token|csrf|password|cookie|authorization|outerHTML|files|queue)$/i.test(key)) { out[key]='[redacted]'; continue; }
            try { out[key]=clean(value[key],depth+1,seen); } catch { out[key]='[unreadable]'; }
        }
        if (value instanceof Error) { out.message=clean(value.message); out.name=value.name; }
        return out;
    };
    const read = () => {
        try { const text=root.localStorage.getItem(KEY); if (!text || text.length>MAX_BYTES*2) return [];
            const rows=JSON.parse(text); return Array.isArray(rows)?rows.filter(x=>x && x.timestamp>Date.now()-TTL).slice(-LIMIT):[];
        } catch { return []; }
    };
    const entries = () => [...new Map([...read(),...pending].map(x=>[x.id,x])).values()].sort((a,b)=>a.timestamp-b.timestamp).slice(-LIMIT);
    const flush = () => {
        try {
            if (timer !== null) { root.clearTimeout(timer); timer=null; }
            if (!pending.length) return;
            const rows=entries(); let text=JSON.stringify(rows);
            while(text.length>MAX_BYTES && rows.length) { rows.shift(); dropped++; text=JSON.stringify(rows); }
            root.localStorage.setItem(KEY,text); pending=[]; storageError=null;
        } catch { storageError='LOG_STORAGE_UNAVAILABLE'; }
    };
    const write = (level,module,event,data={}) => {
        try {
            const timestamp=Date.now();
            if (pending.length>=LIMIT) { pending.shift(); dropped++; }
            let sanitized=clean(data); if(JSON.stringify(sanitized).length>6000) sanitized={truncated:true};
            pending.push({id:`${session}:${++sequence}`,timestamp,level,module:String(module).slice(0,80),event:String(event).slice(0,120),
                buildId:root.EASLocalBuild?.id || root.EAS?.version || 'production',documentUrl:safeUrl(root.location.href),data:sanitized});
            if(timer===null) timer=root.setTimeout(flush,500);
        } catch { /* Never recurse or throw into functional code. */ }
    };
    const exportDiagnostic = () => {
        try {
            flush(); const events=entries(); let activeExecution=null; const activeExecutions=[];
            for (const [module,key] of [['FARM','eas-tw-hub:farm.mass.execution'],['ATTACK','eas_tw_scheduler_v2'],['MARKET','eas_tw_market_target_supply_execution'],['MARKET','eas_tw_market_offers_execution'],['MARKET','eas_tw_market_balance_execution']]) {
                try { const text=root.localStorage.getItem(key); if(!text || text.length>2000000)continue; let value=JSON.parse(text); if(value?.contexts)value=Object.values(value.contexts).find(c=>c?.activeMissionId)||null; if(value && !value.finishedAt && !value.endedAt)activeExecutions.push({module,executionId:value.executionId||value.id||null,status:value.status||null,currentIndex:value.currentIndex??null,activeMissionId:value.activeMissionId||null}); } catch {}
            }
            try { const text=root.localStorage.getItem('eas_tw_fakes_execution');
                if(text && text.length<2000000) { const state=JSON.parse(text),entry=state?.queue?.[state.currentIndex];
                    activeExecution={module:'FAKE',executionId:state.executionTab,currentIndex:state.currentIndex,paused:state.paused,
                        commandId:entry?.confirmationAttempt?.commandId,attemptId:entry?.confirmationAttempt?.attemptId,status:entry?.status}; }
            } catch { /* Summaries must not affect state. */ }
            return {title:'EAS TW HUB DIAGNOSTIC',timestamp:Date.now(),buildId:root.EASLocalBuild?.id||null,version:root.EAS?.version||null,
                world:root.location.host,documentUrl:safeUrl(root.location.href),bootstrap:{bootstrapped:!!root.__EAS_TW_BOOTSTRAPPED__,initializing:!!root.__EAS_TW_INITIALIZING__,resumed:clean(root.__EAS_TW_RUNTIME_RESUMED__||null)},
                activeExecution:clean(activeExecution),activeExecutions:clean([...(activeExecution?[activeExecution]:[]),...activeExecutions]),currentModule:events.at(-1)?.module||null,events:cleanExport(events),warnings:cleanExport(events.filter(e=>['WARN','ERROR'].includes(e.level))),dropped,storageError};
        } catch { return {title:'EAS TW HUB DIAGNOSTIC',error:'EXPORT_UNAVAILABLE'}; }
    };
    const cleanExport = value => JSON.parse(JSON.stringify(value));
    const api={sanitizeUrl:safeUrl,flush,exportDiagnostic,entries:()=>{try{return cleanExport(entries());}catch{return[];}},clear:()=>{try{pending=[];root.localStorage.removeItem(KEY);}catch{}}};
    for(const level of ['debug','info','warn','error']) api[level]=(module,event,data)=>write(level.toUpperCase(),module,event,data);
    root.__EASLogger=api; if(root.EAS) root.EAS.Logger=api; root.EASDebug=exportDiagnostic;
    const listeners = [];
    const listen = (target, event, fn) => { target?.addEventListener?.(event, fn); listeners.push([target, event, fn]); };
    api.dispose = () => { flush(); for (const [target,event,fn] of listeners) target?.removeEventListener?.(event,fn); listeners.length=0; };
    listen(root, 'pagehide',flush);
    listen(root.document, 'visibilitychange',()=>{if(root.document.visibilityState==='hidden')flush();});
    let errors=0;
    listen(root, 'error',event=>{if(errors>=20 || !event.message)return; errors++;api.error('GLOBAL','WINDOW_ERROR',{message:event.message,filename:event.filename,attribution:'unverified'});});
    listen(root, 'unhandledrejection',event=>{if(errors++<20)api.error('GLOBAL','UNHANDLED_REJECTION',{reason:String(event.reason?.message||event.reason),attribution:'unverified'});});
    api.info('CORE','LOGGER_READY',{local:!!root.EASLocalBuild});
})();
