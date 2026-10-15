const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const F='eas_tw_fakes_execution',M='eas_tw_market_offers_execution',S='eas_tw_fakes_execution_summary';
function fixture(){
 const data=new Map();let fail=false,limit=Infinity,now=100000;
 const storage={get length(){return data.size},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem(k,v){if(fail||[...data].reduce((n,[key,value])=>n+key.length+value.length,0)-(data.has(k)?k.length+data.get(k).length:0)+k.length+v.length>limit)throw Object.assign(Error('quota'),{name:'QuotaExceededError'});data.set(k,v)},removeItem:k=>data.delete(k),clear(){throw Error('PROHIBITED')}};
 const box={EAS:{},localStorage:storage,Date:class extends Date{static now(){return now}},window:{}};vm.createContext(box);
 const reload=()=>vm.runInContext(fs.readFileSync('core/storage.js','utf8'),box);reload();
 return {data,storage,box,reload,api:()=>box.EAS.Storage.lifecycle,fail:()=>fail=true,saturate:()=>limit=[...data].reduce((n,[k,v])=>n+k.length+v.length,0),advance:()=>now+=86400001};
}
const fakes=(n=1165)=>({lifecycleVersion:1,finishedAt:100000,forwardingIndex:null,errors:[],queue:Array.from({length:n},(_,i)=>({villageId:9,target:'501|501',status:'completed',confirmationAttempt:{state:'completed',commandId:`${i}:9:501|501`,outgoingCommandId:String(i+1)},troops:{spear:1}}))});
test('hundreds of 1165-command runs leave no temporary results and no queues or archives',()=>{
 const f=fixture();for(let i=0;i<250;i++){const value=fakes();f.data.set(F,JSON.stringify(value));assert.equal(f.api().retire(F,value).status,'REMOVED');}
 assert.equal(f.data.size,0);assert.equal(f.data.has(S),false);assert.equal(f.data.has(F),false);
 f.reload();f.api().maintain();assert.equal(f.data.size,0);f.advance();f.api().maintain();assert.equal(f.data.size,0);f.api().maintain();assert.equal(f.data.size,0);
});
for(const mode of ['uncertain','pending','missing-id','error','stopped','foreign-identity'])test('protected Fakes '+mode+' survives maintenance',()=>{
 const f=fixture(),value=fakes(2);if(mode==='uncertain')value.queue[1].confirmationAttempt.state='submitted';if(mode==='pending')value.queue[1].status='pending';if(mode==='missing-id')delete value.queue[1].confirmationAttempt.outgoingCommandId;if(mode==='error')value.errors=[{commandKey:'1:9:501|501',state:'submitted'}];if(mode==='stopped')value.stopped=true;if(mode==='foreign-identity')value.queue[1].confirmationAttempt.commandId='foreign';
 const raw=JSON.stringify(value);f.data.set(F,raw);assert.equal(f.api().retire(F,value).status,'BLOCKED');f.api().maintain();assert.equal(f.data.get(F),raw);
});
test('BR143 legacy requires exact external backup and explicit consent, preserves legacy43 and Tactical',()=>{
 const f=fixture(),value=fakes();delete value.lifecycleVersion;value.queue[1164]={villageId:9,target:'501|501',status:'error'};value.errors=[{commandKey:'1164:9:501|501',state:'preparing'}];f.data.set(F,JSON.stringify(value));f.data.set(S,JSON.stringify({total:43}));f.data.set('eas_tw_tactical_scheduler_v1','REAL_MISSIONS');const before=[...f.data];
 f.api().maintain();assert.deepEqual([...f.data],before);const backup=f.api().backupLegacy();assert.equal(f.api().cleanLegacy({backup})[0].status,'BLOCKED');
 assert.equal(f.api().cleanLegacy({backup,authorize:true,externalBackupConfirmed:true})[0].status,'REMOVED');assert.equal(f.data.get(S),before[1][1]);assert.equal(f.data.get('eas_tw_tactical_scheduler_v1'),'REAL_MISSIONS');assert.equal(f.data.size,2);
});
test('saturated quota does not require an additional V2; optional result failure cannot retain reconciled queue',()=>{
 const f=fixture(),value=fakes(1);f.data.set(F,JSON.stringify(value));f.saturate();f.fail();assert.equal(f.api().retire(F,value).status,'REMOVED');assert.equal(f.data.has(F),false);assert.equal(f.data.has(S),false);
});
test('critical quota retry frees only optional logs, preserving locks and unknown records',()=>{
 const f=fixture();f.data.set('eas_tw_diagnostics_v1',JSON.stringify([{timestamp:100000,event:'LOGGER_READY',text:'x'.repeat(2000)}]));f.data.set('unknown','keep');f.data.set('eas_tw_tactical_consumed:account:exec:unit','protected');f.saturate();assert.equal(f.box.EAS.Storage.set('critical',{lock:'needed'}),true);assert.equal(f.data.has('eas_tw_diagnostics_v1'),false);assert.equal(f.data.get('unknown'),'keep');assert.equal(f.data.get('eas_tw_tactical_consumed:account:exec:unit'),'protected');
 f.fail();assert.equal(f.box.EAS.Storage.set('critical',{lock:'new'}),false);assert.equal(JSON.parse(f.data.get('eas-tw-hub:critical')).lock,'needed');
});
test('interleaved tab changes fail closed; reload of unknown legacy leaves raw records untouched',()=>{
 const f=fixture(),value=fakes(1);f.data.set(F,JSON.stringify(value));const changed=fakes(1);changed.queue[0].status='pending';f.data.set(F,JSON.stringify(changed));assert.equal(f.api().retire(F,value).reason,'CONTEXT_CHANGED');f.reload();f.api().maintain();assert.equal(f.data.get(F),JSON.stringify(changed));
});
test('Smart Offers retires reconciled completed without obligatory history; uncertain failure evidence retained',()=>{
 const f=fixture(),value={version:3,lifecycleVersion:1,executionId:'offer',state:'completed',finishedAt:100000,queue:[{status:'created',offerId:'42',attempt:{state:'completed'},confirmation:{evidence:'new-compatible-offer-id'}}]};f.data.set(M,JSON.stringify(value));assert.equal(f.api().retire(M,value).status,'REMOVED');assert.equal(f.data.has('eas_tw_market_offers_history'),false);value.queue[0].attempt.failureEvidence={before:['41']};f.data.set(M,JSON.stringify(value));f.api().maintain();assert.ok(f.data.has(M));
});
test('Mass Farm requires no pending actions and reconciled action counters before retirement',()=>{
 const f=fixture(),key='eas-tw-hub:farm.mass.execution',value={version:1,lifecycleVersion:1,status:'completed',completedAt:100000,queue:[{status:'completed-no-units',attacksSent:3,reconciledActions:3}]};f.data.set(key,JSON.stringify(value));assert.equal(f.api().retire(key,value).status,'REMOVED');value.queue[0].pendingAction={capturedAt:1};f.data.set(key,JSON.stringify(value));assert.equal(f.api().retire(key,value).status,'BLOCKED');
});
test('logs and caches have strict size and TTL; unknown malformed records remain',()=>{
 const f=fixture(),rows=Array.from({length:500},()=>({timestamp:100000,event:'LOGGER_READY',text:'x'.repeat(2000)}));f.data.set('eas_tw_diagnostics_v1',JSON.stringify(rows));f.data.set('unknown_cache','MALFORMED');f.api().maintain();assert.ok(f.data.get('eas_tw_diagnostics_v1').length<=32768);assert.equal(f.box.EAS.Storage.set('troops.available',{huge:'x'.repeat(262145)}),false);assert.equal(f.box.EAS.Storage.set('troops.available',{villages:{}}),true);f.advance();f.api().maintain();assert.equal(f.data.has('eas-tw-hub:troops.available'),false);assert.equal(f.data.get('unknown_cache'),'MALFORMED');
});
test('legacy archive cleanup requires proof, backup and absence of active dependency',()=>{
 const f=fixture(),key='eas_tw_market_offers_archive:old',value={executionId:'old',state:'completed',archiveKind:'market-offers-history',version:2,uncertainty:false,items:[{status:'created',attemptState:'completed',offerId:'42'}]};f.data.set(key,JSON.stringify(value));f.data.set('eas_tw_market_offers_archive:uncertain',JSON.stringify({...value,executionId:'uncertain',uncertainty:true}));const backup=f.api().backupLegacy();f.data.set(M,JSON.stringify({executionId:'old',state:'uncertain',queue:[]}));assert.equal(f.api().cleanLegacy({backup,authorize:true,externalBackupConfirmed:true}).find(r=>r.key===key).reason,'ACTIVE_EXECUTION_REFERENCE');f.data.delete(M);assert.equal(f.api().cleanLegacy({backup,authorize:true,externalBackupConfirmed:true}).find(r=>r.key===key).status,'REMOVED');assert.ok(f.data.has('eas_tw_market_offers_archive:uncertain'));
});

test('Tactical reload preserves even marked reconciled execution and preserves legacy, pending, locks and consumed markers',()=>{
 const f=fixture(),key='eas_tw_tactical_scheduler_v1',unit={state:'COMPLETED',executionUnitId:'u',attemptId:'a',submitAttempt:{attemptId:'a'},outgoingReconciliation:{match:{id:'42'}},completedCommandIds:['42']};
 const legacy={executionId:'legacy',state:'COMPLETED',units:[unit]},pending={lifecycleVersion:1,executionId:'pending',state:'UNCERTAIN',units:[{...unit,state:'UNCERTAIN',lock:{held:true}}]},complete={lifecycleVersion:1,executionId:'done',state:'COMPLETED',units:[unit]};
 f.data.set(key,JSON.stringify({version:1,executions:{'br143:7':[legacy,pending,complete]}}));f.data.set('eas_tw_tactical_consumed:br143:7:done:u','PROTECTED');f.reload();f.api().maintain();assert.deepEqual(JSON.parse(f.data.get(key)).executions['br143:7'],[legacy,pending,complete]);assert.equal(f.data.get('eas_tw_tactical_consumed:br143:7:done:u'),'PROTECTED');const raw=f.data.get(key);f.api().maintain();assert.equal(f.data.get(key),raw);
});
test('closed Tactical receipts expire after 24h only without active dependency; uncertain claims never expire',()=>{
 const f=fixture(),scope='br143:7',execution={executionId:'done',units:[{attemptId:'a',executionUnitId:'u',operationId:'op',revision:1}]},key='eas_tw_tactical_consumed:br143:7:done:u';f.data.set(key,JSON.stringify({attemptId:'a',identity:{operationId:'op',revision:1,approved:{large:'x'.repeat(2000)}}}));f.data.set('eas_tw_tactical_consumed:br143:7:uncertain:u',JSON.stringify({attemptId:'uncertain',submittedAt:1}));f.api().closeTactical(execution,scope);assert.ok(f.data.get(key).length<200);f.advance();f.data.set('eas_tw_tactical_scheduler_v1',JSON.stringify({version:1,executions:{[scope]:[{units:[{attemptId:'a',state:'UNCERTAIN'}]}]}}));f.api().maintain();assert.ok(f.data.has(key));f.data.set('eas_tw_tactical_scheduler_v1',JSON.stringify({version:1,executions:{[scope]:[]}}));f.api().maintain();assert.equal(f.data.has(key),false);assert.ok(f.data.has('eas_tw_tactical_consumed:br143:7:uncertain:u'));
});
