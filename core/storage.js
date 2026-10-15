(() => {
    'use strict';

    EAS.Storage = EAS.Storage || {};

    const PREFIX = 'eas-tw-hub:';

    const getKey = (key) => `${PREFIX}${key}`;

    // Runtime lifecycle, not an archive. Only this policy's own successful runs
    // are maintained automatically; legacy deletion requires an external backup.
    const DAY = 86400000, RESULT_LIMIT = 2048; // At most 4 KiB of UTF-16 storage.
    const ownedResults = new Set(['eas_tw_fakes_execution_summary', 'eas_tw_market_offers_history', 'eas-tw-hub:farm.mass.history']);
    const optionalLogs = new Set(['eas_tw_diagnostics_v1', 'eas-tw-hub:runtime.logs', 'eas_tw_market_offers_debug_log', 'eas_tw_attack_preparation_logs']);
    const cacheKeys = new Set(['villages.state','troops.available','groups.state','market.cache','public-map.villages','public-map.players']);
    const readRaw = key => localStorage.getItem(key);
    const parse = raw => raw === null ? null : JSON.parse(raw);
    const stableRemove = (key, raw) => {
        if (readRaw(key) !== raw) return false;
        localStorage.removeItem(key);
        return readRaw(key) === null;
    };
    const fakesProof = (value, legacy = false) => {
        if (!value?.finishedAt || value.stopped || value.forwardingIndex != null ||
            ['nt','fake_nt','anti_snipe','antiSnipe'].includes(value.preset) || !Array.isArray(value.queue) || !Array.isArray(value.errors)) return false;
        if (!legacy && value.errors.length) return false;
        const refs = new Set(value.queue.map((item, index) => `${index}:${item?.villageId || 0}:${item?.target || ''}`));
        const safe = state => ['pending','preparing','prepared','snapshot-ready'].includes(state);
        return value.errors.every(error => refs.has(error.commandKey) && safe(error.state)) && value.queue.every((item,index) => {
            const attempt = item?.confirmationAttempt, ref = `${index}:${item?.villageId || 0}:${item?.target || ''}`;
            if (attempt?.commandId && attempt.commandId !== ref) return false;
            if (item?.status === 'completed') return attempt?.state === 'completed' && !!attempt.outgoingCommandId;
            if (item?.status === 'skipped') return !attempt || safe(attempt.state);
            return legacy && item?.status === 'error' && (!attempt || safe(attempt.state)) && value.errors.some(error => error.commandKey === ref);
        });
    };
    const marketItemBlocker = (item, context) => {
        const attempt = item?.attempt, confirmation = item?.confirmation, failure = attempt?.failureEvidence;
        if (item?.status === 'skipped' && !attempt?.submitAt && !failure && item.manualResolution?.outcome !== 'error') return null;
        if (item?.status !== 'created') return 'ITEM_UNRECONCILED: item.status';
        if (attempt?.state !== 'completed') return 'ATTEMPT_UNRECONCILED: attempt.state';
        if (!item.offerId) return 'OFFER_ID_MISSING: item.offerId';
        if (!confirmation?.evidence) return 'CONFIRMATION_MISSING: item.confirmation.evidence';
        if (item.error) return 'ITEM_UNRECONCILED: item.error';
        if (item.manualResolution?.outcome === 'error') return 'ITEM_UNRECONCILED: item.manualResolution.outcome';
        if (attempt.revokedAt) return 'ATTEMPT_UNRECONCILED: attempt.revokedAt';
        if (confirmation.success === false) return 'CONFIRMATION_CONTRADICTORY: item.confirmation.success';
        if (confirmation.uncertain === true) return 'CONFIRMATION_CONTRADICTORY: item.confirmation.uncertain';
        if (confirmation.reason && confirmation.reason !== 'NEW_COMPATIBLE_OFFER_ID') return 'CONFIRMATION_CONTRADICTORY: item.confirmation.reason';
        if (confirmation.offerId != null && String(confirmation.offerId) !== String(item.offerId)) return 'CONFIRMATION_CONTRADICTORY: item.confirmation.offerId';
        if (!failure) return null;
        const blocked = field => `FAILURE_EVIDENCE: attempt.failureEvidence.${field}`;
        if (failure.gameError) return blocked('gameError');
        const unknown = Object.keys(failure).find(key => !['recordedAt','reason','gameError','afterSnapshot'].includes(key) && failure[key] != null);
        if (unknown) return blocked(unknown);
        // Only a known persistence diagnostic can be superseded. Unknown/game/uncertain
        // outcomes remain evidence, even if someone changed the terminal counters.
        if (!['STORAGE_CONTEXT_CHANGED','STORAGE_WRITE_FAILED','STORAGE_READBACK_FAILED'].includes(failure.reason)) return blocked('reason');
        if (confirmation.success !== true || confirmation.uncertain !== false || confirmation.reason !== 'NEW_COMPATIBLE_OFFER_ID' ||
            confirmation.evidence !== 'new-compatible-offer-id' || String(confirmation.offerId) !== String(item.offerId)) return 'CONFIRMATION_MISSING: item.confirmation';
        const before = attempt.beforeSnapshot;
        const identity = JSON.stringify([item.id, String(item.villageId), item.offerResource, item.requestResource,
            item.offerAmount, item.requestAmount, item.repeatCount, item.maxTravelHours]);
        if (!attempt.attemptId || attempt.executionId !== context?.executionId || attempt.itemId !== item.id || attempt.sourceVillageId !== String(item.villageId) ||
            attempt.itemIdentity !== identity || before?.available !== true || before.executionId !== context.executionId || before.itemId !== item.id ||
            before.attemptId !== attempt.attemptId || before.sourceVillageId !== attempt.sourceVillageId || before.itemIdentity !== attempt.itemIdentity ||
            !Array.isArray(before.offerIds) || before.offerIds.some(id => String(id) === String(item.offerId))) return 'ATTEMPT_UNRECONCILED: attempt.beforeSnapshot';
        if (!Number.isFinite(failure.recordedAt) || !Number.isFinite(item.createdAt) || failure.recordedAt > item.createdAt ||
            !Number.isFinite(attempt.submitAt) || failure.recordedAt < attempt.submitAt) return blocked('recordedAt');
        const after = failure.afterSnapshot;
        if (after != null && (after.available !== true || after.uncertain === true || after.reason || !Array.isArray(after.offerIds) || after.sourceVillageId !== attempt.sourceVillageId ||
            after.offerIds.filter(id => !before.offerIds.includes(id)).some(id => String(id) !== String(item.offerId)))) return blocked('afterSnapshot');
        return null;
    };
    const marketProof = value => value?.version === 3 && value?.state === 'completed' && !!(value.finishedAt || value.endedAt) &&
        Array.isArray(value.queue) && value.queue.every(item => marketItemBlocker(item, value) === null);
    const farmProof = value => value?.version === 1 && value?.status === 'completed' && !!value.completedAt && Array.isArray(value.queue) &&
        value.queue.every(item => ['completed-no-units','completed','skipped'].includes(item.status) && !item.pendingAction &&
            !item.error && item.reconciledActions === Number(item.attacksSent || 0));
    const balanceProof = value => {
        if (value?.lifecycleVersion !== 1 || value.status !== 'completed' || !value.completedAt || !Array.isArray(value.queue)) return false;
        const receipts = parse(readRaw('eas_tw_market_balance_history'));
        const signature = item => [item.sourceVillageId,item.targetVillageId,item.wood,item.stone,item.iron].join(':');
        return value.queue.every(item => item.status === 'sent' && item.execution?.successDetectedAt && Array.isArray(receipts) &&
            receipts.some(record => ['sent','reconciled-sent'].includes(record.result) && signature(record) === signature(item)) ||
            ['skipped','cancelled'].includes(item.status) && !item.confirmationSendClicked && !item.confirmationSubmitted);
    };
    const proof = (key,value,legacy=false) => (!value?.lock || value.lock.consumed || value.lock.releasedAt) && (key === 'eas_tw_fakes_execution' ? fakesProof(value,legacy) :
        key === 'eas_tw_market_offers_execution' ? marketProof(value) : key === getKey('farm.mass.execution') ? farmProof(value) : key === 'eas_tw_market_balance_execution' ? balanceProof(value) : false);
    const retire = (key, expected, { legacy = false, finishedAt = null } = {}) => {
        try {
            const raw = readRaw(key), value = parse(raw);
            if (!value || JSON.stringify(value) !== JSON.stringify(expected)) return { status:'BLOCKED', reason:'CONTEXT_CHANGED' };
            const terminal = key==='eas_tw_fakes_execution' && finishedAt && value.currentIndex===value.queue?.length ? {...value,finishedAt} :
                key===getKey('farm.mass.execution') && finishedAt && ['completed','completed-no-units','skipped'].includes(value.status) ? {...value,status:'completed',completedAt:finishedAt} : value;
            if (!proof(key,terminal,legacy) || value.lock && !value.lock.consumed && !value.lock.releasedAt) return { status:'BLOCKED', reason:'RECONCILIATION_OR_DEPENDENCY_UNPROVEN' };
            if (!stableRemove(key,raw)) return { status:'BLOCKED', reason:'CONTEXT_CHANGED' };
            // Remove only results owned by this policy; divergent legacy evidence stays.
            for (const target of ownedResults) {
                try { const prior = readRaw(target); if (parse(prior)?.lifecycleVersion === 1) stableRemove(target, prior); } catch {}
            }
            return { status:'REMOVED', removedCharacters:raw.length };
        } catch(error) { return { status:'BLOCKED', reason:error.name || 'STORAGE_UNAVAILABLE' }; }
    };
    const boundRows = (rows, maxCharacters=32768) => {
        if (!Array.isArray(rows)) return rows;
        if (!rows.every(row=>Number.isFinite(row?.timestamp) && (typeof row.event==='string' || typeof row.action==='string'))) return rows;
        const kept = rows.filter(row => Number.isFinite(row?.timestamp) && row.timestamp > Date.now()-DAY).slice(-200);
        while (kept.length && JSON.stringify(kept).length > maxCharacters) kept.shift();
        return kept;
    };
    const releaseOptional = () => {
        // Known optional logs are never sources of locks or reconciliation.
        for (const key of optionalLogs) try {
            const raw=readRaw(key), rows=parse(raw);
            if (!Array.isArray(rows) || !rows.every(row=>Number.isFinite(row?.timestamp) && (typeof row.event==='string' || typeof row.action==='string'))) continue;
            if (readRaw(key)===raw) localStorage.removeItem(key);
        } catch {}
    };
    const closeTactical = (execution,scope) => {
        for(const unit of execution.units) try {
            const key=`eas_tw_tactical_consumed:${scope}:${execution.executionId}:${unit.executionUnitId}`,raw=readRaw(key),claim=parse(raw);
            if(claim?.attemptId!==unit.attemptId)continue;
            const closed={lifecycleVersion:1,attemptId:claim.attemptId,identity:{operationId:unit.operationId,revision:unit.revision},reconciled:true,expiresAt:Date.now()+DAY};
            if(readRaw(key)===raw)localStorage.setItem(key,JSON.stringify(closed));
        } catch {}
    };
    const maintain = () => {
        const report=[];
        for (const key of ['eas_tw_fakes_execution','eas_tw_market_offers_execution','eas_tw_market_balance_execution',getKey('farm.mass.execution')]) try {
            const value=parse(readRaw(key));
            const finishedAt=key==='eas_tw_fakes_execution' && value?.currentIndex===value?.queue?.length || key===getKey('farm.mass.execution') && ['completed','completed-no-units','skipped'].includes(value?.status) ? Date.now() : null;
            const terminal=finishedAt && key===getKey('farm.mass.execution')?{...value,status:'completed',completedAt:finishedAt}:finishedAt?{...value,finishedAt}:value;
            if (value?.lifecycleVersion === 1 && proof(key,terminal)) report.push({key,...retire(key,value,{finishedAt})});
        } catch {}
        for (const key of ownedResults) try {
            const raw=readRaw(key), value=parse(raw);
            if (value?.lifecycleVersion === 1 && true) stableRemove(key,raw);
        } catch {}
        for (const key of optionalLogs) try {
            const raw=readRaw(key), rows=parse(raw);
            if (!Array.isArray(rows) || !rows.every(row=>Number.isFinite(row?.timestamp) && (typeof row.event==='string' || typeof row.action==='string'))) continue;
            const text=JSON.stringify(boundRows(rows));
            if (text!==raw && readRaw(key)===raw) localStorage.setItem(key,text);
        } catch {}
        for (const key of cacheKeys) try {
            const raw=readRaw(getKey(key)), value=parse(raw);
            if (value?._easCacheExpiresAt && (value._easCacheExpiresAt<=Date.now() || raw.length>262144)) stableRemove(getKey(key),raw);
        } catch {}
        try {
            const key='eas_tw_market_cache',raw=readRaw(key),value=parse(raw);
            if(value?._easCacheExpiresAt && value._easCacheExpiresAt<=Date.now())stableRemove(key,raw);
        } catch {}
        // Only closed, policy-owned receipts expire. Active/uncertain/legacy claims do not.
        for(const key of Array.from({length:localStorage.length},(_,i)=>localStorage.key(i))) try {
            if(!key?.startsWith('eas_tw_tactical_consumed:'))continue;
            const raw=readRaw(key),claim=parse(raw);
            if(claim?.lifecycleVersion!==1 || claim.reconciled!==true || typeof claim.attemptId!=='string' || typeof claim.identity?.operationId!=='string' || !Number.isInteger(claim.identity.revision) || !Number.isFinite(claim.expiresAt) || claim.expiresAt>Date.now())continue;
            const root=parse(readRaw('eas_tw_tactical_scheduler_v1'));
            if(root!==null && (!root?.executions || !Object.values(root.executions).every(rows=>Array.isArray(rows))))continue;
            if(Object.values(root?.executions||{}).some(rows=>rows.some(execution=>(execution.units||[]).some(unit=>unit.attemptId===claim.attemptId))))continue;
            stableRemove(key,raw);
        } catch {}
        return report;
    };
    const legacyKeys = () => {
        const keys=['eas_tw_fakes_execution','eas_tw_market_offers_execution'];
        for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(key?.startsWith('eas_tw_market_offers_archive:'))keys.push(key);}
        return keys;
    };
    const legacyProof = (key,value) => {
        if (!key.startsWith('eas_tw_market_offers_archive:')) return proof(key,value,true);
        if(key!=='eas_tw_market_offers_archive:'+value?.executionId || value.state!=='completed')return false;
        if(Array.isArray(value.queue))return marketProof(value);
        return value.archiveKind==='market-offers-history' && value.version===2 && value.uncertainty===false &&
            !value.batchAuthorization && Array.isArray(value.items) && value.items.every(item=>item.status==='created'&&item.attemptState==='completed'&&!!item.offerId);
    };
    const inspectLegacy = () => legacyKeys().map(key => {
        try { const raw=readRaw(key),value=parse(raw); return {key,status:!value?'NO_CONTEXT':legacyProof(key,value)?'ELIGIBLE':'BLOCKED',characters:raw?.length||0,reason:'Deletion requires reconciled outcome, exact backup and no active reference.'}; }
        catch { return {key,status:'BLOCKED'}; }
    });
    const backupLegacy = () => ({ purpose:'external-lifecycle-backup', records:Object.fromEntries(inspectLegacy().filter(row=>row.status==='ELIGIBLE').map(row=>[row.key,readRaw(row.key)])) });
    const cleanLegacy = ({backup,authorize=false,externalBackupConfirmed=false}={}) => {
        if (!authorize || !externalBackupConfirmed || backup?.purpose!=='external-lifecycle-backup') return [{status:'BLOCKED',reason:'EXTERNAL_BACKUP_AND_AUTHORIZATION_REQUIRED'}];
        return inspectLegacy().map(row => {
            if (row.status!=='ELIGIBLE') return row;
            const raw=readRaw(row.key);
            if (backup.records?.[row.key]!==raw) return {...row,status:'BLOCKED',reason:'BACKUP_STALE_OR_MISSING'};
            if(row.key.startsWith('eas_tw_market_offers_archive:')) {
                const value=parse(raw),active=parse(readRaw('eas_tw_market_offers_execution'));
                if(active?.executionId===value.executionId)return {...row,status:'BLOCKED',reason:'ACTIVE_EXECUTION_REFERENCE'};
                return {...row,status:legacyProof(row.key,value)&&stableRemove(row.key,raw)?'REMOVED':'BLOCKED'};
            }
            return {key:row.key,...retire(row.key,parse(raw),{legacy:true})};
        });
    };
    EAS.Storage.lifecycle = { maintain, retire, proof, marketItemBlocker, boundRows, releaseOptional, closeTactical, inspectLegacy, backupLegacy, cleanLegacy, DAY, RESULT_LIMIT };

    EAS.Storage.get = (key, fallback = null) => {
        try {
            const value = localStorage.getItem(getKey(key));

            if (value === null) {
                return fallback;
            }

            const parsed = JSON.parse(value);
            if (cacheKeys.has(key) && parsed?._easCacheExpiresAt && parsed._easCacheExpiresAt <= Date.now()) return fallback;
            return parsed;
        } catch {
            return fallback;
        }
    };

    EAS.Storage.set = (key, value) => {
        if (cacheKeys.has(key) && value && typeof value==='object' && !Array.isArray(value)) value={...value,_easCacheExpiresAt:Date.now()+DAY};
        if (cacheKeys.has(key) && JSON.stringify(value).length>262144) return false;
        try {
            localStorage.setItem(getKey(key), JSON.stringify(value));
            return localStorage.getItem(getKey(key)) === JSON.stringify(value);
        } catch {
            releaseOptional();
            try { const text=JSON.stringify(value);localStorage.setItem(getKey(key),text);return localStorage.getItem(getKey(key))===text; } catch { return false; }
        }
    };

    EAS.Storage.remove = (key) => {
        try {
            localStorage.removeItem(getKey(key));
            return true;
        } catch {
            return false;
        }
    };
})();
