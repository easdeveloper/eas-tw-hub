const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
const context = require('./fixtures/market-archive-context.cjs');
const source = fs.readFileSync('services/market-offers-execution.js', 'utf8');
const lifecycle = source.slice(source.indexOf('    const BATCH_TERMINAL'), source.indexOf('    const amount ='));
const summary = source.slice(source.indexOf('    const isManualError'), source.indexOf('    const refreshExistingHubPanel'));
const prefix = 'eas_tw_market_offers_archive:', critical = 'eas_tw_market_offers_execution';
function fixture() {
    const data = new Map(), logs = []; let writes = 0, fail = false;
    const storage = {get length(){return data.size;}, key:i=>[...data.keys()][i] ?? null,
        getItem:k=>data.get(k) ?? null, setItem(k,v){writes++;if(fail)throw Error('quota');data.set(k,v);},
        removeItem:k=>data.delete(k), clear(){throw Error('NEVER CLEAR');}};
    const box = {localStorage:storage, Date, EAS:{Logger:{warn:(...x)=>logs.push(x)}}, console};
    vm.runInNewContext('const EXECUTION_VERSION=3;'+lifecycle+summary+
        ';globalThis.api={compactArchive,archiveBatch,getArchivedBatch,inspectArchive,retainArchives,ARCHIVE_POLICY,canResumeBatch,preserveTerminalHistory};',box);
    return {api:box.api,data,logs,storage,fail:()=>{fail=true;},writes:()=>writes};
}
const legacyContext = (id, payloadSize = 0, finishedAt = 1000000) => {
    const value = context(id, 1, finishedAt);
    if (payloadSize) value.queue[0].diagnosticEvents.push({event:'legacy-payload',detail:'x'.repeat(payloadSize)});
    return value;
};
test('V2 is compact history with identity/results, not a context or authorization',()=>{
    const f=fixture(), c=context(), original=JSON.stringify(c), a=f.api.compactArchive(c), text=JSON.stringify(a);
    assert.equal(a.version,2);assert.equal(a.items.length,84);assert.equal(a.items[0].attemptId,c.queue[0].attempt.attemptId);
    assert.equal(a.items[0].offerId,'9000');assert.equal(a.counts.created,84);
    for(const key of ['batchAuthorization','beforeSnapshot','diagnosticEvents','rows','executionTab'])assert.equal(text.includes('"'+key+'"'),false);
    assert.equal(f.api.canResumeBatch(a),false);assert.equal(JSON.stringify(c),original);
    const v1=Buffer.byteLength(original),v2=Buffer.byteLength(text);
    console.log('ARCHIVE_MEASUREMENT',JSON.stringify({contextBytes:v1,archiveV1Bytes:v1,archiveV2Bytes:v2,reductionPercent:Number((100*(1-v2/v1)).toFixed(2))}));
    assert.ok(v2<v1);assert.ok(2*(prefix.length+c.executionId.length+text.length)<f.api.ARCHIVE_POLICY.maxBytes);
});
test('uncertain evidence remains in critical state; compact history preserves failure identity',()=>{
    const f=fixture(),c=context('uncertain',1);c.state='cancelled';c.stoppedFromState='uncertain';
    Object.assign(c.queue[0],{status:'verification-required',error:'uncertain'});
    c.queue[0].attempt.failureEvidence={reason:'NO_NEW_OFFER',gameError:'game error',afterSnapshot:{rows:[{huge:'x'.repeat(9000)}]}};
    f.data.set(critical,JSON.stringify(c));const before=f.data.get(critical);
    assert.equal(f.api.archiveBatch(c),true);const a=f.api.getArchivedBatch(c.executionId);
    assert.equal(a.uncertainty,true);assert.equal(a.items[0].gameError,'game error');assert.equal(f.data.get(critical),before);
    f.api.retainArchives({now:1e12});assert.ok(f.data.has(prefix+c.executionId));assert.equal(f.data.get(critical),before);
});
test('large legacy bytes and count do not block V2 admission or alter legacy values',()=>{
    const f=fixture(),legacy=[];
    for(let i=0;i<12;i++){
        const value=legacyContext('legacy-'+i,12000,1000000+i),key=prefix+value.executionId,text=JSON.stringify(value);
        f.data.set(key,text);legacy.push([key,text]);
    }
    const legacyBytes=legacy.reduce((sum,[key,text])=>sum+2*(key.length+text.length),0);
    assert.ok(legacyBytes>f.api.ARCHIVE_POLICY.maxBytes);assert.ok(legacy.length>f.api.ARCHIVE_POLICY.maxCount);
    assert.equal(f.api.archiveBatch(context('fresh-v2',1)),true);
    for(const [key,text] of legacy)assert.equal(f.data.get(key),text);
    assert.equal(f.api.getArchivedBatch('fresh-v2').archiveKind,'market-offers-history');
    assert.equal(f.api.getArchivedBatch('fresh-v2').version,2);
});
test('protected V2 archives count toward the compact archive count limit',()=>{
    const f=fixture();
    for(let i=0;i<f.api.ARCHIVE_POLICY.maxCount;i++){
        const value=f.api.compactArchive(context('protected-'+i,1,1000000+i));value.uncertainty=true;
        f.data.set(prefix+value.executionId,JSON.stringify(value));
    }
    const before=[...f.data];
    assert.equal(f.api.archiveBatch(context('count-blocked',1)),false);
    assert.deepEqual([...f.data],before);assert.equal(f.logs.at(-1)[1],'ARCHIVE_WRITE_FAILED');
});
test('protected V2 bytes count toward admission and reject without changing critical state',()=>{
    const f=fixture(),active=context('critical-active',1),protectedV2=f.api.compactArchive(context('oversized-protected',1000));
    protectedV2.uncertainty=true;
    const key=prefix+protectedV2.executionId,text=JSON.stringify(protectedV2),bytes=2*(key.length+text.length);
    assert.ok(bytes>f.api.ARCHIVE_POLICY.maxBytes);
    f.data.set(critical,JSON.stringify(active));f.data.set(key,text);
    const criticalBefore=f.data.get(critical),before=[...f.data];
    assert.equal(f.api.archiveBatch(context('bytes-blocked',1)),false);
    assert.equal(f.data.get(critical),criticalBefore);assert.deepEqual([...f.data],before);
    assert.equal(f.logs.at(-1)[1],'ARCHIVE_WRITE_FAILED');
});
test('retention count removes oldest eligible only; critical and unrelated keys unchanged',()=>{
    const f=fixture();for(let i=0;i<12;i++)f.data.set(prefix+i,JSON.stringify(f.api.compactArchive(context(String(i),1,1000000+i))));
    f.data.set(critical,JSON.stringify(context('0',1)));const protectedKeys=['eas_tw_scheduler_v2','eas_tw_fakes_execution','eas_tw_arrival_consumed:attempt','eas_tw_market_offers_analysis'];
    for(const key of protectedKeys)f.data.set(key,'unchanged');
    const result=f.api.retainArchives({now:1000100});assert.equal(result.removed.length,2);
    assert.ok(f.data.has(prefix+'0'));assert.equal(f.data.has(prefix+'1'),false);assert.equal(f.data.has(prefix+'2'),false);
    for(const key of protectedKeys)assert.equal(f.data.get(key),'unchanged');assert.ok(f.data.has(critical));
});
test('default retention budgets V2 independently and preserves linked, protected, legacy and unrelated records',()=>{
    const f=fixture(),protectedKeys=['eas_tw_scheduler_v2','eas_tw_fakes_execution','eas_tw_arrival_consumed:attempt'];
    for(let i=0;i<13;i++){
        const value=f.api.compactArchive(context('retained-'+i,1,1000000+i));
        if(i===1)value.uncertainty=true;
        f.data.set(prefix+value.executionId,JSON.stringify(value));
    }
    const linked=context('retained-0',1);f.data.set(critical,JSON.stringify(linked));
    const legacy=legacyContext('large-legacy',160000,1000000),legacyKey=prefix+legacy.executionId,legacyText=JSON.stringify(legacy);
    f.data.set(legacyKey,legacyText);protectedKeys.forEach(key=>f.data.set(key,'unchanged'));
    const result=f.api.retainArchives({now:1000100});
    assert.equal(result.removed.length,3);assert.equal(result.v2Count,10);
    assert.equal(result.v2Bytes<=f.api.ARCHIVE_POLICY.maxBytes,true);
    assert.ok(result.bytes>f.api.ARCHIVE_POLICY.maxBytes);
    assert.equal(result.legacyCount,1);assert.equal(f.data.get(legacyKey),legacyText);
    assert.equal(result.bytes,[...f.data].filter(([key])=>key.startsWith(prefix)).reduce((sum,[key,text])=>sum+2*(key.length+text.length),0));
    assert.equal(f.data.has(prefix+'retained-0'),true);assert.equal(f.data.has(prefix+'retained-1'),true);
    assert.equal(f.data.has(critical),true);for(const key of protectedKeys)assert.equal(f.data.get(key),'unchanged');
});
test('age and UTF-16 key/value budget are independently enforced',()=>{
    const f=fixture();f.data.set(prefix+'old',JSON.stringify(f.api.compactArchive(context('old',1,1000))));
    assert.equal(f.api.retainArchives({now:1000+f.api.ARCHIVE_POLICY.maxAgeMs+1}).removed.length,1);
    for(let i=0;i<5;i++)f.data.set(prefix+i,JSON.stringify(f.api.compactArchive(context(String(i),84,1000000+i))));
    const result=f.api.retainArchives({now:1000010});assert.ok(result.removed.length>0);assert.ok(result.bytes<=f.api.ARCHIVE_POLICY.maxBytes);
});
test('legacy version is context schema 3, never executable via diagnostic getter; cleanup opt-in',()=>{
    const f=fixture(),c=context('legacy',1);f.data.set(prefix+c.executionId,JSON.stringify(c));
    assert.equal(f.api.inspectArchive(prefix+c.executionId,c).format,'V1');
    assert.equal(f.api.getArchivedBatch(c.executionId).batchAuthorization,undefined);
    assert.equal(f.api.canResumeBatch(f.api.getArchivedBatch(c.executionId)),false);
    assert.equal(f.api.retainArchives({now:1e12}).removed.length,0);
    assert.equal(f.api.retainArchives({now:1e12,includeLegacy:true}).removed.length,1);
});
test('explicit legacy cleanup is separate from V2 limits and preserves unsafe or malformed legacy evidence',()=>{
    const f=fixture(),safeLegacy=[];
    for(let i=0;i<3;i++){
        const value=legacyContext('cleanup-'+i,40000,1000000+i),key=prefix+value.executionId,text=JSON.stringify(value);
        f.data.set(key,text);safeLegacy.push([key,text]);
    }
    const uncertain=legacyContext('uncertain-legacy',0,1000004);
    uncertain.state='cancelled';uncertain.stoppedFromState='uncertain';uncertain.queue[0].status='verification-required';
    const uncertainKey=prefix+uncertain.executionId,uncertainText=JSON.stringify(uncertain);
    f.data.set(uncertainKey,uncertainText);
    const mismatched=legacyContext('different-identity',0,1000005),mismatchedKey=prefix+'wrong-key';
    f.data.set(mismatchedKey,JSON.stringify(mismatched));f.data.set(prefix+'malformed','{');
    const v2=f.api.compactArchive(context('independent-v2',1,1000000)),v2Key=prefix+v2.executionId,v2Text=JSON.stringify(v2);
    f.data.set(v2Key,v2Text);
    const unrelated=['eas_tw_scheduler_v2','eas_tw_fakes_execution','eas_tw_arrival_consumed:attempt'];
    unrelated.forEach(key=>f.data.set(key,'unchanged'));
    const beforeLegacyBytes=safeLegacy.reduce((sum,[key,text])=>sum+2*(key.length+text.length),0)+2*(uncertainKey.length+uncertainText.length);
    assert.ok(beforeLegacyBytes>f.api.ARCHIVE_POLICY.maxBytes);
    const result=f.api.retainArchives({now:1000100,includeLegacy:true});
    assert.ok(result.removed.length>0);assert.ok(result.removed.every(key=>safeLegacy.some(([legacyKey])=>legacyKey===key)));
    assert.equal(f.data.get(v2Key),v2Text);assert.equal(f.data.get(uncertainKey),uncertainText);
    assert.equal(f.data.has(mismatchedKey),true);assert.equal(f.data.get(prefix+'malformed'),'{');
    for(const [key,text] of safeLegacy)if(!result.removed.includes(key))assert.equal(f.data.get(key),text);
    for(const key of unrelated)assert.equal(f.data.get(key),'unchanged');
    assert.equal(result.v2Count,1);assert.equal(result.v2Bytes,2*(v2Key.length+v2Text.length));
    assert.ok(result.legacyBytes<=f.api.ARCHIVE_POLICY.maxBytes);
});
test('unknown and malformed archives are protected, excluded from V2 accounting, and never executable',()=>{
    const f=fixture();
    const malformed={archiveKind:'market-offers-history',version:2,executionId:'malformed-v2',state:'completed',finishedAt:1000000,
        uncertainty:false,counts:{created:1,errors:0,skipped:0},items:[null],batchAuthorization:{plan:'must-not-run'},large:'x'.repeat(150000)};
    const malformedKey=prefix+malformed.executionId,malformedText=JSON.stringify(malformed);
    const unknown={archiveKind:'future-history',version:99,executionId:'future',state:'completed',batchAuthorization:{plan:'must-not-run'}};
    const unknownKey=prefix+unknown.executionId,unknownText=JSON.stringify(unknown);
    f.data.set(malformedKey,malformedText);f.data.set(unknownKey,unknownText);f.data.set(prefix+'broken-json','{');
    assert.equal(f.api.archiveBatch(context('after-unknown',1)),true);
    const result=f.api.retainArchives({now:1000100});
    assert.equal(result.v2Count,1);assert.ok(result.bytes>f.api.ARCHIVE_POLICY.maxBytes);
    assert.equal(f.data.get(malformedKey),malformedText);assert.equal(f.data.get(unknownKey),unknownText);
    assert.equal(f.data.get(prefix+'broken-json'),'{');
    assert.equal(f.api.getArchivedBatch('malformed-v2'),null);
    assert.equal(f.api.canResumeBatch(f.api.getArchivedBatch('future')),false);
});
test('ambiguous legacy, unknown schema, mismatching identity, pending send and malformed active fail closed',()=>{
    const f=fixture();const values=[{...context('a',1),state:'uncertain'}, {...context('b',1),version:999}, {...context('c',1),executionId:'different'}];
    const pending=context('d',1);pending.queue[0].attempt.state='submitting';values.push(pending);
    values.forEach((v,i)=>f.data.set(prefix+'abcd'[i],JSON.stringify(v)));f.data.set(prefix+'broken','{');
    assert.equal(f.api.retainArchives({now:1e12,includeLegacy:true}).removed.length,0);
    f.data.set(prefix+'safe',JSON.stringify(context('safe',1)));f.data.set(critical,'{');
    assert.equal(f.api.retainArchives({now:1e12,includeLegacy:true}).removed.length,0);
});
test('quota failure is one history attempt, logs failure, never clears or modifies critical state',()=>{
    const f=fixture(),c=context('quota',1);f.data.set(critical,JSON.stringify(c));const before=f.data.get(critical);f.fail();
    assert.equal(f.api.archiveBatch(c),false);assert.equal(f.writes(),1);assert.equal(f.data.get(critical),before);
    assert.equal(f.logs[0][1],'ARCHIVE_WRITE_FAILED');assert.equal(f.api.canResumeBatch(c),false);
});
test('admission cap stops new archives without automatic deletion; duplicate write is idempotent',()=>{
    const f=fixture();for(let i=0;i<10;i++)assert.equal(f.api.archiveBatch(context(String(i),1)),true);
    const before=[...f.data];assert.equal(f.api.archiveBatch(context('11',1)),false);assert.deepEqual([...f.data],before);
    const writes=f.writes();assert.equal(f.api.archiveBatch(context('0',1)),true);assert.equal(f.writes(),writes);
});
test('Fake summary remains full context: Phase 2 only',()=>{
    assert.match(fs.readFileSync('services/fakes-execution.js','utf8'),/const summary = \{ \.\.\.context, counts:/);
});

test('optional archive failure does not block safe terminal replacement; uncertainty fails closed',()=>{
 const f=fixture(),safe=context('safe',1);f.fail();assert.equal(f.api.preserveTerminalHistory(safe),true);
 const uncertain=context('uncertain',1);uncertain.queue[0].attempt.state='submitting';
 assert.equal(f.api.preserveTerminalHistory(uncertain),false);
});

test('real save replaces safe terminal when history quota fails, but retains uncertain terminal',()=>{
 const data=new Map(),logs=[];let historyWrites=0;
 const storage={get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k)||null,
 setItem(k,v){if(k.startsWith(prefix)){historyWrites++;throw Error('quota');}data.set(k,v);},removeItem:k=>data.delete(k)};
 const box={EAS:{Logger:{warn:(...args)=>logs.push(args)}},window:{},localStorage:storage,URL,Date,console};
 vm.runInNewContext(source,box);const api=box.EAS.MarketOffersExecution;
 data.set(critical,JSON.stringify(context('old',1)));
 const fresh={...context('new',1),state:'running',finishedAt:null,endedAt:null,revision:0};
 assert.equal(api.save(fresh),true);assert.equal(historyWrites,1);assert.equal(api.read().executionId,'new');
 const old=context('uncertain',1);old.queue[0].attempt.state='submitting';data.set(critical,JSON.stringify(old));
 const before=data.get(critical);assert.equal(api.save({...fresh,executionId:'another'}),false);assert.equal(data.get(critical),before);
});
