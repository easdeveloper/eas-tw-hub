const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const plain = x => JSON.parse(JSON.stringify(x));
function harness(type = 'attack', beforeIds = [], automatic = false) {
    let now = 500000, clicks = 0, uuid = 0, bot = false, observed = { available: true, commands: beforeIds.map(id => ({ id })) }, lock = false;
    const values = new Map(), timers = new Map(), listeners = new Map(); let serial = 0;
    const storage = { get length(){return values.size},key:i=>[...values.keys()][i]??null,getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) };
    const button = { id: 'troop_confirm_submit', textContent: type === 'attack' ? 'Enviar ataque' : 'Enviar apoio', isConnected: true,
        getClientRects: () => [1], addEventListener() {}, removeEventListener() {}, click: () => { clicks++; } };
    const form = { addEventListener() {}, removeEventListener() {}, textContent: 'Destino (484|527)', querySelectorAll: selector => selector.startsWith('button') ? [button] : selector === 'input[name="source_village"]' ? [{ value: '10' }] : selector === '[data-unit]' ? [{ dataset: {unit:'axe',count:'1'} }] : [] };
    button.form = form;
    const document = { readyState: 'complete', querySelector: selector => selector.startsWith('#command-confirm-form') ? form : selector.startsWith('#bot_check') && bot ? {} : null,
        querySelectorAll: selector => selector === '#troop_confirm_submit' ? [button] : [] };
    const w = { document, location: { href: 'https://br143.tribalwars.com.br/game.php?screen=place&village=10' }, localStorage: storage,
        game_data: { world: 'br-test',player: { id:'7' },village:{id:'10',x:500,y:500} }, Timing:{getCurrentServerTime:()=>now},
        crypto:{randomUUID:()=>`attempt-${++uuid}`}, performance:{now:()=>now},
        addEventListener: (k,v)=>listeners.set(k,v), removeEventListener:(k)=>listeners.delete(k), dispatchEvent(){}, CustomEvent:function(){},
        setTimeout:(fn)=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),
        navigator:{locks:{request:async (_key,_options,fn)=> { if(lock) return fn(null);lock=true;try{return await fn({});}finally{lock=false;} }}}
    };
    const EAS = { Selectors:{},Adapters:{},World:{getWorldName:()=> 'br-test',getPlayer:()=>({id:'7'}),getServerNowTimestamp:()=>now},
        Utils:{parseCoordinate:coord=>({coordinate:coord})}, MassSnipeExecution:{getCurrentServerTimeMs:()=>now},
        FakesExecution:{readOutgoingCommands:()=>observed} };
    w.EAS=EAS;
    const ctx=vm.createContext({EAS, window:w,localStorage:storage,location:w.location,URL,Date,console,setTimeout});
    for(const path of ['services/mass-snipe-precise.js','services/arrival-execution.js','services/tactical-operation-scheduler-adapter.js']) vm.runInContext(fs.readFileSync(path,'utf8'),ctx);
    const api=EAS.TacticalOperationSchedulerAdapter;
    const command={slotId:'one',parentSlotId:'one',commandType:type,source:{id:'10',coord:'500|500'},target:{coord:'484|527'},composition:{quantities:{axe:1}},sendAtMs:1000000,desiredArrivalMs:1010000,travelTimeMs:10000,validationStatus:'ready',blockers:[]};
    const snapshot={snapshotKind:'tactical-approved-operation',version:1,operationId:'op',revision:1,validation:{valid:true},commands:[command]};
    const queued=api.enqueue(snapshot,{createdAt:1,authorizeAutomaticAttack:automatic===true,authorizeAutomaticOperation:automatic==='operation',targetWindow:w});
    const executionId=queued.execution.executionId,id=queued.execution.units[0].executionUnitId;
    const read=()=>api.list()[0]?.units[0] || null;
    const save=unit=>api.updateStoredUnit(executionId,id,unit);
    let unit=automatic ? read() : api.authorizeStoredUnit(executionId,id,{authorizedAt:1});
    unit=save(api.advancePrecheck10m(unit,{now,sessionAvailable:true,accountValid:true,loggedIn:true,source:command.source,target:command.target}));
    now=800000;
    assert.equal(api.captureExecutionBaseline(unit,w).valid,true);
    unit=read();
    unit=save(api.advancePrepare5m(unit,{now,sourceCorrect:true,targetCorrect:true,compositionMatches:true,confirmationContextValid:true}));
    now=950000;
    unit=save(api.advanceSync2m(unit,{now,source:'Timing.getCurrentServerTime+World.getServerDateTime',samples:[0,1,2].map(i=>({serverNowMs:now-i,localNowMs:now-i,measuredAt:now-i}))}));
    unit=save(api.advanceFinalCheck(unit,{now,authorizationValid:true,sessionTrusted:true,sourceCorrect:true,targetCorrect:true,commandTypeCorrect:true,compositionMatches:true,confirmationContextValid:true,clockEvidenceFresh:true,singleSubmitControlFound:true}));
    w.location.href += '&try=confirm';
    return {api,w,read,save,executionId,id,button,values,timers,ctx,
        snapshot:queued.execution.approvedSnapshot, clicks:()=>clicks,now:value=>now=value,bot:value=>bot=value,observed:value=>observed=value,
        authorize:()=>api.authorizeFinalSubmit(executionId,id,w),
        arm:options=>api.armFinalExecution(executionId,id,w,options),
        fire:()=>{now=1000000;const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());return callbacks;},
        returnPage:()=>{w.location.href=w.location.href.replace('&try=confirm','');},
        recover:()=>api.recoverFinalExecution(executionId,id,w),reenqueue:()=>api.enqueue(snapshot,{createdAt:2,targetWindow:w})};
}
for(const type of ['attack','support']) test(`${type}: exact final authorization, persisted attempt before one click, shared reconciliation`,async()=>{
    const h=harness(type); assert.equal(h.read().state,'READY_TO_SEND');
    assert.equal((await h.arm({dryRun:false})).blocker,'FINAL_AUTHORIZATION_REQUIRED');
    assert.ok(h.authorize());
    h.button.click=()=>{assert.equal(h.read().state,'SUBMITTING');assert.ok([...h.values.keys()].some(k=>k.startsWith('eas_tw_tactical_consumed:')));h.button.calls=(h.button.calls||0)+1;};
    assert.equal((await h.arm({dryRun:false})).armed,true);
    assert.equal((await h.arm({dryRun:false})).blocker,'ALREADY_ARMED');
    const callbacks=h.fire();callbacks.forEach(fn=>fn());assert.equal(h.button.calls,1);
    assert.equal(h.read().state,'UNCERTAIN');
    h.returnPage();h.observed({available:true,commands:[{id:'42',type,target:'484|527',sourceVillageId:'10',evidence:{clock:'server-wall',arrivalMs:1010001,precisionMs:1}}]});
    const reconciled=h.recover();assert.equal(reconciled.state,'COMPLETED');assert.deepEqual(plain(reconciled.completedCommandIds),['42']);
    assert.equal(reconciled.executionTiming.serverArrivalDeviationMs,1);assert.equal(reconciled.executionTiming.serverRecordedSubmissionMs,null);
    assert.equal(h.read().state,'COMPLETED');assert.ok([...h.values.keys()].some(k=>k.startsWith('eas_tw_tactical_consumed:')));
    assert.equal(h.reenqueue().blockers[0],'APPROVED_SNAPSHOT_ALREADY_CONSUMED');
    assert.equal((await h.arm({dryRun:false})).armed,false);
});
test('dry run executes scheduler but never invokes irreversible action or consumes attempt',async()=>{
    const h=harness();assert.equal((await h.arm({dryRun:true})).armed,true);h.fire();assert.equal(h.clicks(),0);assert.equal(h.read().state,'READY_TO_SEND');
    assert.equal([...h.values.keys()].some(k=>k.startsWith('eas_tw_tactical_consumed:')),false);
});
test('authorization binds revision/source/target/composition/timestamp; preflight is insufficient',()=>{
    const h=harness();assert.equal(h.api.authorizationValid(h.read()),false);const unit=plain(h.authorize());
    for(const mutate of [u=>u.revision++,u=>u.source.id='11',u=>u.target.coord='1|1',u=>u.approvedCommand.composition.quantities.axe++,u=>u.executionSendAtMs++]){
        const changed=plain(unit);mutate(changed);assert.equal(h.api.authorizationValid(changed),false);
    }
});
test('late, stale clock, wrong village, bot, changed composition and terminal states fail closed',()=>{
    const h=harness();h.authorize();
    for(const state of ['CANCELLED','BLOCKED','UNCERTAIN','COMPLETED']) assert.equal(h.api.liveExecutionCheck({...plain(h.read()),state},h.w).valid,false);
    h.now(1001001);assert.equal(h.api.liveExecutionCheck(h.read(),h.w).blocker,'SUBMIT_OUTSIDE_ALLOWED_WINDOW');
    h.now(1100000);assert.equal(h.api.liveExecutionCheck(h.read(),h.w).blocker,'CLOCK_EVIDENCE_STALE');
    h.now(999999);h.bot(true);assert.equal(h.api.liveExecutionCheck(h.read(),h.w).valid,false);h.bot(false);
    h.w.game_data.village.id='11';assert.equal(h.api.liveExecutionCheck(h.read(),h.w).valid,false);
});
test('claim write failure prevents click; consumed tombstone is independent of a stale root',async()=>{
    const h=harness();h.authorize();const prior=h.values.get(h.api.STORAGE_KEY);
    await h.arm({dryRun:false});h.fire();assert.equal(h.clicks(),1);
    h.values.set(h.api.STORAGE_KEY,prior);assert.equal(h.api.liveExecutionCheck(h.read(),h.w).valid,false);
    assert.equal(h.recover().state,'UNCERTAIN');
    const failing=harness();failing.authorize();await failing.arm({dryRun:false});failing.w.localStorage.setItem=()=>{throw Error('quota');};failing.fire();assert.equal(failing.clicks(),0);
});
test('baseline survives reload; old/same target IDs, partial or unavailable evidence never complete or resend',async()=>{
    const h=harness();h.authorize();const baseline=plain(h.read().outgoingBaseline);await h.arm({dryRun:false});h.fire();h.returnPage();
    for(const observed of [{available:false,commands:[]},{available:true,commands:[]},{available:true,commands:[{id:'42',type:'attack',target:'484|527'}]},
        {available:true,commands:[{id:'42',type:'attack',target:'484|527'},{id:'43',type:'attack',target:'484|527'}]}]){
        h.observed(observed);assert.equal(h.recover().state,'UNCERTAIN');assert.deepEqual(plain(h.read().outgoingBaseline),baseline);
    }
    delete h.w.EAS.TacticalOperationSchedulerAdapter;vm.runInContext(fs.readFileSync('services/tactical-operation-scheduler-adapter.js','utf8'),h.ctx);
    assert.equal((await h.w.EAS.TacticalOperationSchedulerAdapter.armFinalExecution(h.executionId,h.id,h.w,{dryRun:false})).armed,false);
    assert.equal(h.clicks(),1);
});

test('another page runtime shares Web Lock, and old same-target ID cannot complete', async () => {
    const h=harness('attack',['7']);h.authorize();await h.arm({dryRun:false});
    delete h.w.EAS.TacticalOperationSchedulerAdapter;
    vm.runInContext(fs.readFileSync('services/tactical-operation-scheduler-adapter.js','utf8'),h.ctx);
    assert.equal((await h.w.EAS.TacticalOperationSchedulerAdapter.armFinalExecution(h.executionId,h.id,h.w,{dryRun:false})).blocker,'EXECUTION_LOCK_BUSY');
    h.fire();h.returnPage();
    const old={id:'7',type:'attack',target:'484|527',sourceVillageId:'10',evidence:{clock:'server-wall',arrivalMs:1010001,precisionMs:1}};
    h.observed({available:true,commands:[old]});assert.equal(h.recover().state,'UNCERTAIN');
    h.observed({available:true,commands:[old,{...old,id:'8'}]});const reconciled=h.recover();assert.equal(reconciled.state,'COMPLETED');
    assert.deepEqual(plain(reconciled.completedCommandIds),['8']);assert.equal(h.read().state,'COMPLETED');assert.equal(h.clicks(),1);
});
test('live target/composition changes and missing baseline stop the boundary',async()=>{
    const h=harness();h.authorize();await h.arm({dryRun:false});
    h.w.document.querySelector('#command-confirm-form').textContent='Origem (500|500) Destino (400|400)';
    h.fire();assert.equal(h.clicks(),0);assert.equal(h.read().state,'BLOCKED');
    const u=harness();const missing=plain(u.read());missing.outgoingBaseline=null;
    assert.equal(u.api.baselineValid(missing),false);
});

test('changed account after arming never submits',async()=>{
 for(const field of ['world','player']){const h=harness();h.authorize();await h.arm({dryRun:false});
  if(field==='world')h.w.game_data.world='other';else h.w.game_data.player.id='other';
  h.fire();assert.equal(h.clicks(),0);assert.equal(h.read().state,'BLOCKED');}
});

test('armed callback at 100ms lateness blocks instead of sending a late command',async()=>{
 const h=harness();h.authorize();assert.equal((await h.arm({dryRun:false})).armed,true);
 h.now(1000100);[...h.timers.values()].forEach(fn=>fn());assert.equal(h.clicks(),0);assert.equal(h.read().state,'BLOCKED');
});

test('creation consent is atomic, bound to immutable attack data, and duplicates never grant consent',()=>{
 const h=harness('attack',[],true),u=h.read();
 assert.equal(h.api.earlySendValid(u),true);
 assert.equal(u.earlySendConsent.origin,'explicit-operation-creation');
 assert.equal(u.earlySendConsent.mode,'real');
 for(const mutate of [x=>x.account.playerId='8',x=>x.revision++,x=>x.source.id='11',x=>x.target.coord='1|1',x=>x.approvedCommand.composition.quantities.axe++,x=>x.executionSendAtMs++]){
  const changed=plain(u);mutate(changed);assert.equal(h.api.earlySendValid(changed),false);
 }
 const old=harness();assert.equal(old.api.earlySendValid(old.read()),false);
 const result=old.api.enqueue(old.snapshot,{createdAt:2,authorizeAutomaticAttack:true,targetWindow:old.w});
 assert.equal(result.duplicate,true);assert.equal(old.api.earlySendValid(old.read()),false);
 for(const type of ['support','attack']){
  const blocked=harness(type);blocked.now(1000000);
  const result=blocked.api.enqueue({...plain(blocked.snapshot),operationId:'expired'},{authorizeAutomaticAttack:true,targetWindow:blocked.w});
  assert.equal(result.created,false);assert.equal(blocked.api.list().length,1);assert.equal(blocked.clicks(),0);
 }
 const bad=harness();bad.w.game_data.player.id='8';
 assert.equal(bad.api.enqueue({...plain(bad.snapshot),operationId:'wrong-account'},{authorizeAutomaticAttack:true,targetWindow:bad.w}).created,false);
 assert.equal(bad.api.list().length,1);
});

for(const type of ['attack','support'])test(`confirmed new ${type} operation persists real consent through reload and cancellation prevents sending`,async()=>{
 const h=harness(type,[],'operation');
 assert.equal(h.api.earlySendValid(h.read()),true);assert.equal(h.read().earlySendConsent.mode,'real');
 assert.equal(h.read().earlySendConsent.origin,'explicit-operation-creation');
 vm.runInContext(fs.readFileSync('services/tactical-operation-scheduler-adapter.js','utf8'),h.ctx);
 const fresh=h.w.EAS.TacticalOperationSchedulerAdapter;
 assert.equal(fresh.earlySendValid(fresh.list()[0].units[0]),true);
 assert.ok(fresh.cancelStoredUnit(h.executionId,h.id));
 assert.equal(h.read().state,'CANCELLED');assert.equal(h.authorize(),null);
 assert.equal((await h.arm({dryRun:false})).armed,false);h.fire();assert.equal(h.clicks(),0);
});
test('confirmed mixed operation grants consent atomically; silent storage failure and old duplicates never grant it',()=>{
 const h=harness();h.now(500000);
 const snapshot=plain(h.snapshot);snapshot.operationId='new-mixed';
 snapshot.commands.push({...plain(snapshot.commands[0]),slotId:'two',parentSlotId:'two',commandType:'support'});
 const result=h.api.enqueue(snapshot,{createdAt:3,authorizeAutomaticOperation:true,targetWindow:h.w});
 assert.equal(result.created,true);assert.equal(result.execution.units.length,2);
 assert.ok(result.execution.units.every(u=>h.api.earlySendValid(u)&&u.earlySendConsent.mode==='real'&&h.api.preparationAuthorizationValid(u)));
 const old=h.api.enqueue(h.snapshot,{createdAt:4,authorizeAutomaticOperation:true,targetWindow:h.w});
 assert.equal(old.duplicate,true);assert.equal(h.api.earlySendValid(h.read()),false);
 const before=h.values.get(h.api.STORAGE_KEY);h.w.localStorage.setItem=()=>{};
 const failed=h.api.enqueue({...snapshot,operationId:'not-persisted'},{createdAt:5,authorizeAutomaticOperation:true,targetWindow:h.w});
 assert.equal(failed.created,false);assert.ok(failed.blockers.includes('TACTICAL_SCHEDULER_STORAGE_FAILED'));
 assert.equal(h.values.get(h.api.STORAGE_KEY),before);assert.equal(h.clicks(),0);
});

test('explicit result deletion blocks uncertain sends and incomplete proof, retains consumed receipts',async()=>{
 const h=harness();assert.equal(h.api.deleteResult(h.executionId),false);
 h.authorize();await h.arm({dryRun:false});h.fire();h.returnPage();
 h.observed({available:true,commands:[]});h.recover();assert.equal(h.api.deleteResult(h.executionId),false);
 h.observed({available:true,commands:[{id:'42',type:'attack',target:'484|527',sourceVillageId:'10',evidence:{clock:'server-wall',arrivalMs:1010001,precisionMs:1}}]});
 assert.equal(h.recover().state,'COMPLETED');assert.equal(h.api.canDeleteResult(h.api.list()[0]),true);
 const receipt=[...h.values.keys()].find(k=>k.startsWith('eas_tw_tactical_consumed:'));const saved=h.values.get(receipt);
 h.values.delete(receipt);assert.equal(h.api.deleteResult(h.executionId),false);h.values.set(receipt,saved);
 assert.equal(h.api.deleteResult(h.executionId),true);assert.equal(h.read(),null);assert.ok(h.values.has(receipt));
});

function historyFixture(states){
 const h=harness(),key=h.api.STORAGE_KEY,root=JSON.parse(h.values.get(key)),scope=Object.keys(root.executions)[0],base=root.executions[scope][0];
 root.executions[scope]=states.map((state,index)=>{const execution=plain(base);execution.executionId='history-'+index;execution.createdAt=1;execution.units=execution.units.map(unit=>({...unit,state,executionId:execution.executionId,attemptId:undefined,submitAttempt:undefined,outgoingBaseline:undefined,finalAuthorization:undefined,executionSendAtMs:1,cancelledAt:state==='CANCELLED'?1:undefined}));return execution;});
 h.values.set(key,JSON.stringify(root));return {...h,key,scope,root};
}
test('history individual/batch removes persisted cancelled and unsent blocked only; reload and byte counts agree',async()=>{
 const h=historyFixture(['CANCELLED','BLOCKED','SCHEDULED','PREPARED','UNCERTAIN']);
 h.values.set('other-module','untouched');
 const preview=h.api.historyPreview();assert.equal(preview.eligible.length,2);assert.equal(preview.protectedCount,3);
 const one={...preview,eligible:[preview.eligible[0]]};const result=await h.api.cleanHistory({preview:one,targetWindow:null});
 assert.equal(result.success,true);assert.equal(result.removed,1);assert.ok(result.afterBytes<result.beforeBytes);
 vm.runInContext(fs.readFileSync('services/tactical-operation-scheduler-adapter.js','utf8'),h.ctx);
 assert.equal(h.w.EAS.TacticalOperationSchedulerAdapter.list().length,4);
 const batch=await h.api.cleanHistory({preview:h.api.historyPreview(),targetWindow:null});assert.equal(batch.removed,1);
 assert.deepEqual(plain(h.api.list().map(e=>e.units[0].state)),['SCHEDULED','PREPARED','UNCERTAIN']);assert.equal(h.values.get('other-module'),'untouched');
});
test('history rejects uncertain/blocked attempts, unproven completed outcomes and stale previews',async()=>{
 const h=historyFixture(['BLOCKED','COMPLETED','UNCERTAIN','CANCELLED']);h.root.executions[h.scope][0].units[0].attemptId='possibly-submitted';
 h.values.set(h.key,JSON.stringify(h.root));const preview=h.api.historyPreview();assert.equal(preview.eligible.length,1);
 const before=h.values.get(h.key);h.root.executions[h.scope][3].units[0].attemptId='concurrent-attempt';h.values.set(h.key,JSON.stringify(h.root));
 const result=await h.api.cleanHistory({preview,targetWindow:null});assert.equal(result.success,false);assert.equal(result.removed,0);assert.notEqual(h.values.get(h.key),before);assert.equal(h.api.list().length,4);
});
test('history stops on thrown/silent writes and failed readback without success',async()=>{
 for(const mode of ['throw','silent','read']){
  const h=historyFixture(['CANCELLED','CANCELLED']),preview=h.api.historyPreview(),before=h.values.get(h.key),get=h.w.localStorage.getItem;let written=false;
  h.w.localStorage.setItem=(key,value)=>{if(mode==='throw')throw Error('quota');if(mode==='silent')return;h.values.set(key,value);written=true;};
  if(mode==='read')h.w.localStorage.getItem=key=>{if(written)throw Error('read failed');return get(key);};
  const result=await h.api.cleanHistory({preview,targetWindow:null});assert.equal(result.success,false);assert.equal(result.removed,0);
  if(mode!=='read')assert.equal(h.values.get(h.key),before);
 }
});
test('history retention bounds eligible results and keeps all active/uncertain records',async()=>{
 const h=historyFixture([...Array(105).fill('CANCELLED'),'SCHEDULED','UNCERTAIN']);
 const now=1000;const deferred=await h.api.cleanHistory({automatic:true,now,targetWindow:null});assert.equal(deferred.deferred,true);assert.equal(h.api.list().length,107);
 h.root.executions[h.scope]=h.root.executions[h.scope].filter(execution=>execution.units[0].state!=='SCHEDULED');h.values.set(h.key,JSON.stringify(h.root));
 const result=await h.api.cleanHistory({automatic:true,now,targetWindow:null});assert.equal(result.success,true);assert.equal(result.removed,5);assert.equal(h.api.list().length,101);
 const expired=await h.api.cleanHistory({automatic:true,now:h.api.HISTORY_RETENTION_MS+2000,targetWindow:null});assert.equal(expired.removed,100);assert.equal(h.api.list().length,1);
});
test('completed history compacts the existing consumed key; deduplication survives deletion and reload',async()=>{
 const h=harness();h.authorize();await h.arm({dryRun:false});h.fire();h.returnPage();
 h.observed({available:true,commands:[{id:'42',type:'attack',target:'484|527',sourceVillageId:'10',evidence:{clock:'server-wall',arrivalMs:1010001,precisionMs:1}}]});h.recover();
 const receipt=[...h.values.keys()].find(k=>k.startsWith('eas_tw_tactical_consumed:')),before=h.values.get(receipt).length;
 const result=await h.api.cleanHistory({preview:h.api.historyPreview(),targetWindow:null});assert.equal(result.success,true);assert.equal(result.removed,1);
 assert.ok(h.values.get(receipt).length<before);assert.equal(JSON.parse(h.values.get(receipt)).expiresAt,undefined);
 vm.runInContext(fs.readFileSync('services/tactical-operation-scheduler-adapter.js','utf8'),h.ctx);
 assert.equal(h.w.EAS.TacticalOperationSchedulerAdapter.enqueue(h.snapshot,{createdAt:3,targetWindow:h.w}).duplicate,true);
});
test('legacy unsent cancelled histories remove exact orphan tabs; active references and uncertain evidence remain',async()=>{
 const h=historyFixture([]),key='eas_tw_scheduler_v2';
 h.values.set(key,JSON.stringify({version:2,contexts:{[h.scope]:{missions:[{id:'safe',status:'cancelled'},{id:'active',status:'cancelled'},{id:'uncertain',status:'error',submitAttemptId:'attempt'},{id:'completed',status:'completed'}],activeMissionId:'active',tabExecutions:{orphan:{missionId:'safe'},keep:{missionId:'uncertain'}}}}}));
 const preview=h.api.historyPreview();assert.equal(preview.eligible.length,1);const result=await h.api.cleanHistory({preview,targetWindow:null});assert.equal(result.success,true);
 const context=JSON.parse(h.values.get(key)).contexts[h.scope];assert.equal(context.missions.length,3);assert.equal(context.tabExecutions.orphan,undefined);assert.ok(context.tabExecutions.keep);
});
test('completed cleanup refuses missing receipts, contradicting identity and failed receipt compaction',async()=>{
 for(const mode of ['missing','identity','write']){
  const h=harness();h.authorize();await h.arm({dryRun:false});h.fire();h.returnPage();
  h.observed({available:true,commands:[{id:'42',type:'attack',target:'484|527',sourceVillageId:'10',evidence:{clock:'server-wall',arrivalMs:1010001,precisionMs:1}}]});h.recover();
  const key=[...h.values.keys()].find(k=>k.startsWith('eas_tw_tactical_consumed:'));
  if(mode==='missing')h.values.delete(key);
  if(mode==='identity'){const claim=JSON.parse(h.values.get(key));claim.identity.source.id='11';h.values.set(key,JSON.stringify(claim));}
  const preview=h.api.historyPreview();
  if(mode!=='write'){assert.equal(preview.eligible.length,0);assert.equal(h.api.deleteResult(h.executionId),false);}
  else {h.w.localStorage.setItem=()=>{};const result=await h.api.cleanHistory({preview,targetWindow:null});assert.equal(result.success,false);assert.equal(result.removed,0);}
  assert.equal(h.read().state,'COMPLETED');
 }
});
test('general cleanup removes terminal full records and retains deny-only uncertainty; active units stay intact',async()=>{
 const h=historyFixture(['COMPLETED','CANCELLED','BLOCKED','UNCERTAIN','FAILED','SENT','SCHEDULED','PREPARED','SYNC_2M','SUBMITTING','RECONCILING']);
 h.root.executions[h.scope][3].units[0].attemptId='uncertain-history';h.values.set(h.key,JSON.stringify(h.root));
 assert.equal(h.api.historyPreview({mode:'completed'}).eligible.length,0);
 const preview=h.api.historyPreview({mode:'general'});assert.equal(preview.eligible.length,6);assert.equal(preview.protectedCount,5);
 const active=JSON.stringify(h.root.executions[h.scope].slice(6));
 const result=await h.api.cleanHistory({preview,targetWindow:null});assert.equal(result.success,true,result.error);assert.equal(result.removed,6);assert.equal(result.protectedCount,5);
 assert.equal(JSON.stringify(JSON.parse(h.values.get(h.key)).executions[h.scope]),active);assert.ok(result.afterBytes<result.beforeBytes);
 const receipts=[...h.values].filter(([key])=>key.startsWith('eas_tw_tactical_consumed:')).map(([,value])=>JSON.parse(value));assert.equal(receipts.length,6);
 const uncertain=receipts.find(claim=>claim.attemptId==='uncertain-history');assert.equal(uncertain.state,'UNCERTAIN');assert.equal(uncertain.outcome,'UNRECONCILED');assert.equal(uncertain.reconciled,false);
 for(const claim of receipts){assert.equal(h.api.earlySendValid(claim),false);assert.equal(h.api.preparationAuthorizationValid(claim),false);assert.equal(claim.finalAuthorization,undefined);assert.equal(claim.expiresAt,undefined);}
 assert.equal(receipts.find(claim=>claim.originalState==='COMPLETED').reconciled,false);
});
test('general uncertainty receipt survives a fresh adapter load and blocks the original snapshot',async()=>{
 const h=historyFixture(['UNCERTAIN']);h.root.executions[h.scope][0].units[0].attemptId='once';h.values.set(h.key,JSON.stringify(h.root));
 assert.equal((await h.api.cleanHistory({preview:h.api.historyPreview({mode:'general'}),targetWindow:null})).success,true);
 delete h.w.EAS.TacticalOperationSchedulerAdapter;vm.runInContext(fs.readFileSync('services/tactical-operation-scheduler-adapter.js','utf8'),h.ctx);
 const fresh=h.w.EAS.TacticalOperationSchedulerAdapter;assert.equal(fresh.list().length,0);
 const again=fresh.enqueue(h.snapshot,{createdAt:100,authorizeAutomaticOperation:true,targetWindow:h.w});
 assert.equal(again.created,false);assert.equal(again.duplicate,true);assert.ok(again.blockers.includes('APPROVED_SNAPSHOT_ALREADY_CONSUMED'));assert.equal(h.clicks(),0);
});
test('general cleanup stops before losing full uncertain evidence when receipt writes or readback fail',async()=>{
 for(const mode of ['throw','silent','read','root']){
  const h=historyFixture(['UNCERTAIN']),preview=h.api.historyPreview({mode:'general'}),before=h.values.get(h.key),get=h.w.localStorage.getItem;let written=false;
  h.w.localStorage.setItem=(key,value)=>{if(mode==='throw')throw Error('quota');if(mode==='silent'||mode==='root'&&key===h.key)return;h.values.set(key,value);written=true;};
  if(mode==='read')h.w.localStorage.getItem=key=>{if(written&&key.startsWith('eas_tw_tactical_consumed:'))throw Error('receipt read failed');return get(key);};
  const result=await h.api.cleanHistory({preview,targetWindow:null});assert.equal(result.success,false);assert.equal(result.removed,0);assert.equal(h.values.get(h.key),before);
 }
});
test('completed-only mode removes proven successes and keeps cancelled/uncertain records',async()=>{
 const h=harness();h.authorize();await h.arm({dryRun:false});h.fire();h.returnPage();
 h.observed({available:true,commands:[{id:'42',type:'attack',target:'484|527',sourceVillageId:'10',evidence:{clock:'server-wall',arrivalMs:1010001,precisionMs:1}}]});h.recover();
 const root=JSON.parse(h.values.get(h.api.STORAGE_KEY)),scope=Object.keys(root.executions)[0];
 for(const state of ['CANCELLED','UNCERTAIN']){const row=plain(root.executions[scope][0]);row.executionId=state;row.units[0].state=state;root.executions[scope].push(row);}
 h.values.set(h.api.STORAGE_KEY,JSON.stringify(root));const preview=h.api.historyPreview({mode:'completed'});assert.equal(preview.eligible.length,1);
 const result=await h.api.cleanHistory({preview,targetWindow:null});assert.equal(result.success,true);assert.equal(result.removed,1);assert.equal(result.protectedCount,2);assert.equal(h.api.list().length,2);
});
test('old scheduler late/cancelled/pre-confirmation errors delete from v2, not cancellation; v1 cannot reimport them on reload',async()=>{
 const h=historyFixture([]),key='eas_tw_scheduler_v2';
 const missions=[{id:'late-14oct',status:'late',lastError:'SEND_WINDOW_MISSED'},
  {id:'cancelled-14oct',status:'cancelled',attackClicked:true,attackClickAttemptId:'first-click',submitAuthorization:{missionId:'cancelled-14oct',used:false,allowedStage:'attack-confirmation'}},
  {id:'parser-14oct',status:'error',lastError:'UNCLASSIFIED_COMMAND_MARKERS'},
  {id:'uncertain-14oct',status:'error',submitAttemptId:'final-click',finalClickConsumed:true,lastError:'UNCLASSIFIED_COMMAND_MARKERS'},
  {id:'live',status:'prepared'}];
 h.values.set(key,JSON.stringify({version:2,contexts:{[h.scope]:{missions,currentMissionId:'late-14oct',activeMissionId:'live',tabExecutions:{old:{missionId:'late-14oct'},live:{missionId:'live'}}}}}));
 h.values.set('eas_tw_scheduler',JSON.stringify({missions:plain(missions)}));
 let preview=h.api.historyPreview({mode:'general'});assert.equal(preview.eligible.length,3);
 assert.equal(preview.protectedRecords.find(row=>row.executionId==='uncertain-14oct').reason,'LEGACY_SEND_EVIDENCE_DEDUPLICATION_UNPROVEN');
 const one={...preview,eligible:[preview.eligible[0]]};assert.equal((await h.api.cleanHistory({preview:one,targetWindow:null})).removed,1);
 const context=JSON.parse(h.values.get(key)).contexts[h.scope];assert.equal(context.currentMissionId,null);assert.equal(context.tabExecutions.old,undefined);assert.ok(context.tabExecutions.live);
 preview=h.api.historyPreview({mode:'general'});const result=await h.api.cleanHistory({preview,targetWindow:null});assert.equal(result.removed,2);assert.equal(result.protectedCount,2);
 vm.runInContext(fs.readFileSync('services/mission-scheduler.js','utf8'),h.ctx);
 const loaded=h.w.EAS.MissionScheduler.load();assert.deepEqual(plain(loaded.missions.map(m=>m.id)),['uncertain-14oct','live']);
 assert.equal(loaded.missions[0].status,'error');assert.equal(loaded.missions[0].submitAttemptId,'final-click');assert.equal(loaded.missions[1].status,'prepared');
});
test('legacy history keeps final attempts, ambiguous confirmation, active references, and returns explicit reasons',()=>{
 const h=historyFixture([]),missions=[{id:'used',status:'cancelled',submitAuthorization:{missionId:'used',used:true}},
  {id:'unknown-click',status:'late',attackClicked:true},{id:'running',status:'submitting'},
  {id:'bound',status:'late'},{id:'outcome',status:'verification-required'}];
 h.values.set('eas_tw_scheduler_v2',JSON.stringify({version:2,contexts:{[h.scope]:{missions,confirmationMissionId:'bound'}}}));
 const preview=h.api.historyPreview({mode:'general'});assert.equal(preview.eligible.length,0);
 const reasons=Object.fromEntries(preview.protectedRecords.map(row=>[row.executionId,row.reason]));
 assert.equal(reasons.used,'LEGACY_SEND_EVIDENCE_DEDUPLICATION_UNPROVEN');assert.equal(reasons['unknown-click'],'LEGACY_CONFIRMATION_EVIDENCE_AMBIGUOUS');
 assert.equal(reasons.running,'MISSION_ACTIVE');assert.equal(reasons.bound,'MISSION_EXECUTION_REFERENCE_ACTIVE');assert.equal(reasons.outcome,'LEGACY_OUTCOME_OR_DEDUPLICATION_UNPROVEN');
});
test('legacy late cleanup stops on write/readback failure and preserves other scopes',async()=>{
 for(const fail of ['throw','silent','read']){
  const h=historyFixture([]),key='eas_tw_scheduler_v2',root={version:2,contexts:{[h.scope]:{missions:[{id:'old-late',status:'late'}]},other:{missions:[{id:'untouched',status:'late'}]}}};
  h.values.set(key,JSON.stringify(root));const preview=h.api.historyPreview({mode:'general'}),before=h.values.get(key),get=h.w.localStorage.getItem;let wrote=false;
  h.w.localStorage.setItem=(k,v)=>{if(fail==='throw')throw Error('quota');if(fail==='silent')return;h.values.set(k,v);wrote=true;};
  h.w.localStorage.getItem=k=>{if(fail==='read'&&wrote&&k===key)throw Error('readback');return get(k);};
  const result=await h.api.cleanHistory({preview,targetWindow:null});assert.equal(result.success,false);assert.equal(result.removed,0);
  if(fail!=='read')assert.equal(h.values.get(key),before);assert.deepEqual(JSON.parse(h.values.get(key)).contexts.other,root.contexts.other);
 }
});
