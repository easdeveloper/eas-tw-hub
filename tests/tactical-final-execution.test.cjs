const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const plain = x => JSON.parse(JSON.stringify(x));
function harness(type = 'attack', beforeIds = []) {
    let now = 500000, clicks = 0, uuid = 0, bot = false, observed = { available: true, commands: beforeIds.map(id => ({ id })) }, lock = false;
    const values = new Map(), timers = new Map(), listeners = new Map(); let serial = 0;
    const storage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) };
    const button = { id: 'troop_confirm_submit', textContent: type === 'attack' ? 'Enviar ataque' : 'Enviar apoio', isConnected: true,
        getClientRects: () => [1], addEventListener() {}, removeEventListener() {}, click: () => { clicks++; } };
    const form = { addEventListener() {}, removeEventListener() {}, textContent: 'Origem (500|500) Destino (484|527)', querySelectorAll: selector => selector.startsWith('button') ? [button] : selector === '[data-unit]' ? [{ dataset: {unit:'axe',count:'1'} }] : [] };
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
    const ctx=vm.createContext({EAS, window:w,localStorage:storage,location:w.location,URL,Date,console});
    for(const path of ['services/mass-snipe-precise.js','services/arrival-execution.js','services/tactical-operation-scheduler-adapter.js']) vm.runInContext(fs.readFileSync(path,'utf8'),ctx);
    const api=EAS.TacticalOperationSchedulerAdapter;
    const command={slotId:'one',parentSlotId:'one',commandType:type,source:{id:'10',coord:'500|500'},target:{coord:'484|527'},composition:{quantities:{axe:1}},sendAtMs:1000000,desiredArrivalMs:1010000,travelTimeMs:10000,validationStatus:'ready',blockers:[]};
    const queued=api.enqueue({snapshotKind:'tactical-approved-operation',version:1,operationId:'op',revision:1,validation:{valid:true},commands:[command]},{createdAt:1});
    const executionId=queued.execution.executionId,id=queued.execution.units[0].executionUnitId;
    const read=()=>api.list()[0].units[0];
    const save=unit=>api.updateStoredUnit(executionId,id,unit);
    let unit=api.authorizeStoredUnit(executionId,id,{authorizedAt:1});
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
        clicks:()=>clicks,now:value=>now=value,bot:value=>bot=value,observed:value=>observed=value,
        authorize:()=>api.authorizeFinalSubmit(executionId,id,w),
        arm:options=>api.armFinalExecution(executionId,id,w,options),
        fire:()=>{now=1000000;const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());return callbacks;},
        returnPage:()=>{w.location.href=w.location.href.replace('&try=confirm','');},
        recover:()=>api.recoverFinalExecution(executionId,id,w)};
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
    assert.equal(h.recover().state,'COMPLETED');assert.deepEqual(plain(h.read().completedCommandIds),['42']);
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
    h.observed({available:true,commands:[old,{...old,id:'8'}]});assert.equal(h.recover().state,'COMPLETED');
    assert.deepEqual(plain(h.read().completedCommandIds),['8']);assert.equal(h.clicks(),1);
});
test('live target/composition changes and missing baseline stop the boundary',async()=>{
    const h=harness();h.authorize();await h.arm({dryRun:false});
    h.w.document.querySelector('#command-confirm-form').textContent='Origem (500|500) Destino (400|400)';
    h.fire();assert.equal(h.clicks(),0);assert.equal(h.read().state,'BLOCKED');
    const u=harness();const missing=plain(u.read());missing.outgoingBaseline=null;
    assert.equal(u.api.baselineValid(missing),false);
});
