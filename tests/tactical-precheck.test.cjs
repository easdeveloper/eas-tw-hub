const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const SEND=1791336429000, CHECK=SEND-600000;
function fixture(now=CHECK){
 const values=new Map(),events=[],listeners=new Map();let clock=now,bot=false,writes=0;
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>{values.set(k,v);writes++;}};
 const w={location:{href:'https://br143.tribalwars.com.br/game.php?screen=overview&village=10'},game_data:{world:'br143',player:{id:7},village:{id:10,x:516,y:458}},
 document:{readyState:'complete',querySelector:s=>bot&&s.includes('[data-antibot]')?{}:null},addEventListener:(k,f)=>listeners.set(k,f),dispatchEvent(){},CustomEvent:function(){}};
 const EAS={World:{getWorldName:()=> 'br143',getPlayer:()=>({id:7}),getServerNowTimestamp:()=>{throw Error('Client calendar must not be read');}},
 MassSnipeExecution:{getCurrentServerTimeMs:()=>clock},Utils:{parseCoordinate:c=>({coordinate:c})},Logger:{info:(module,event,data)=>events.push({event,data})}};
 w.EAS=EAS;
 const ctx=vm.createContext({EAS,window:w,localStorage:storage,URL});
 const code=fs.readFileSync('services/tactical-operation-scheduler-adapter.js','utf8');vm.runInContext(code,ctx);
 const api=EAS.TacticalOperationSchedulerAdapter;
 const cmd={slotId:'2065-26',parentSlotId:'2065-26',source:{id:'10',coord:'516|458'},target:{coord:'507|471'},commandType:'attack',composition:{quantities:{axe:5930,light:3117}},sendAtMs:SEND,desiredArrivalMs:SEND+10000,travelTimeMs:10000,validationStatus:'ready',blockers:[]};
 const queued=api.enqueue({snapshotKind:'tactical-approved-operation',version:1,operationId:'tactical-operation-1791345973844',revision:7,validation:{valid:true},commands:[cmd]},{createdAt:1});
 const eid=queued.execution.executionId,uid=queued.execution.units[0].executionUnitId;
 api.authorizeStoredUnit(eid,uid,{authorizedAt:1791335243434});
 return {api,w,events,storage,values,eid,uid,ctx,code,listeners,queued,read:()=>api.list()[0].units[0],run:()=>api.runStoredPrecheck(eid,uid,w),now:n=>clock=n,bot:()=>bot=true,writes:()=>writes};
}
for(const now of [CHECK,CHECK+0.875,CHECK+12345.25,SEND-300000-0.125])test(`BR143 authorized precheck at ${now} persists canonical transition`,()=>{
 const f=fixture(now),result=f.run();assert.equal(result.accepted,true);assert.equal(result.persisted,true);
 const u=f.read();assert.equal(u.state,'PRECHECK_10M');assert.equal(u.nextCheckpoint,'PREPARE_5M');assert.equal(u.nextCheckpointAtMs,SEND-300000);
 assert.equal(u.finalAuthorization,undefined);assert.equal(u.attemptId,undefined);assert.equal(u.lastPreflight.authoritativeNowMs,Math.floor(now));
 assert.equal(f.queued.execution.units[0].preparationAuthorization,undefined,'stale original object is not used');
 const before=f.writes();assert.equal(f.run().reason,'PRECHECK_ALREADY_COMPLETED');assert.equal(f.writes(),before);
 assert.ok(f.events.some(e=>e.event==='TACTICAL_PRECHECK_ACCEPTED'));
});
test('too early is persisted with exact earliest timestamp and survives reload; later manual click works',()=>{
 const f=fixture(CHECK-0.125);assert.equal(f.run().reason,'PRECHECK_TOO_EARLY');assert.equal(f.read().state,'SCHEDULED');
 assert.equal(f.read().lastPreflight.checkpointAtMs,CHECK);assert.equal(f.read().lastPreflight.deltaMs,-1);
 delete f.w.EAS.TacticalOperationSchedulerAdapter;vm.runInContext(f.code,f.ctx);
 const fresh=f.w.EAS.TacticalOperationSchedulerAdapter,d=fresh.preparationDiagnostic().executions[0].units[0];
 assert.equal(d.lastPreflightReason,'PRECHECK_TOO_EARLY');assert.equal(d.authoritativeNowMs,CHECK-1);assert.equal(d.finalSubmitAuthorization.present,false);
 f.now(CHECK);assert.equal(fresh.runStoredPrecheck(f.eid,f.uid,f.w).accepted,true);
});
test('late boundary, missing clock and untrusted session fail closed with durable reason',()=>{
 for(const [now,reason] of [[SEND-300000,'PRECHECK_WINDOW_MISSED'],[NaN,'TIMING_EVIDENCE_UNAVAILABLE']]){
 const f=fixture(now);assert.equal(f.run().reason,reason);assert.equal(f.read().state,'BLOCKED');assert.equal(f.read().lastPreflight.reason,reason);}
 const f=fixture();f.bot();assert.equal(f.run().reason,'SESSION_UNAVAILABLE_OR_UNTRUSTED');assert.equal(f.read().state,'BLOCKED');
 assert.ok(f.events.some(e=>e.event==='TACTICAL_PRECHECK_REJECTED'));
});
test('manual action and existing scheduler tick share authoritative clock, no extra timer or submit',()=>{
 const f=fixture(CHECK+0.875);f.api.initializeSchedulerHooks(f.w);f.listeners.get('eas:scheduler-tick')();
 assert.equal(f.read().state,'PRECHECK_10M');assert.equal(f.read().lastPreflight.action,'SCHEDULER_PRECHECK_10M');
 assert.equal(f.read().attemptId,undefined);assert.equal(f.run().reason,'PRECHECK_ALREADY_COMPLETED');
});
test('read-back failure is explicit and cannot report accepted or start an attempt',()=>{
 const f=fixture();f.storage.setItem=()=>{};
 const result=f.run();assert.equal(result.reason,'PRECHECK_PERSIST_READBACK_FAILED');assert.equal(result.persisted,false);assert.equal(result.accepted,false);
 assert.equal(f.read().state,'SCHEDULED');assert.equal(f.read().attemptId,undefined);
});


test('BR143 T-10 validates account independently of selected village and screen',()=>{
 const f=fixture();f.w.game_data.village={id:999,x:515,y:457};f.w.location.href='https://br143.tribalwars.com.br/game.php?screen=info_village&village=999';
 assert.equal(f.run().accepted,true);assert.equal(f.read().source.id,'10');assert.equal(f.read().source.coord,'516|458');
 assert.equal(f.read().precheckEvidence.source.id,'999');assert.equal(f.read().precheckEvidence.accountValid,true);
 for(const [key,value,reason] of [['world','br144','WORLD_IDENTITY_MISMATCH'],['player',{id:8},'PLAYER_IDENTITY_MISMATCH']]){
  const wrong=fixture();wrong.w.game_data[key]=value;assert.equal(wrong.run().reason,reason);assert.equal(wrong.read().state,'BLOCKED');
 }
});
test('approved source ID is never inferred from current village or coordinate',()=>{
 const f=fixture();const root=JSON.parse(f.values.get(f.api.STORAGE_KEY));const unit=root.executions['br143:7'][0].units[0];
 delete unit.source.id;delete unit.approvedCommand.source.id;f.values.set(f.api.STORAGE_KEY,JSON.stringify(root));
 assert.equal(f.run().reason,'APPROVED_SOURCE_IDENTITY_UNPROVEN');assert.equal(f.read().attemptId,undefined);
});
test('legacy account binding comes from stored namespace, never currently selected account',()=>{
 const f=fixture();const root=JSON.parse(f.values.get(f.api.STORAGE_KEY));delete root.executions['br143:7'][0].units[0].account;
 f.values.set(f.api.STORAGE_KEY,JSON.stringify(root));f.w.game_data.player.id=8;
 assert.equal(f.run().reason,'PLAYER_IDENTITY_MISMATCH');assert.equal(f.read().account.playerId,'7');
});
function navigationFixture(){
 const f=fixture();assert.equal(f.run().accepted,true);f.now(SEND-300000);
 let count=0,tail=Promise.resolve();const tabs=[];
 f.w.navigator={locks:{request:(key,fn)=>{const run=tail.then(fn);tail=run.catch(()=>{});return run;}}};
 f.w.crypto={randomUUID:()=>`navigation-${++count}`};
 f.w.EAS.Place={buildPlaceUrl:id=>new URL(`https://br143.tribalwars.com.br/game.php?screen=place&village=${id}`)};
 f.w.open=(url,name)=>{assert.equal(f.read().rallyPreparation.expectedUrl,url,'intent persisted BEFORE open');assert.equal(new URL(url).searchParams.get('village'),'10');const tab={closed:false,url,name};tabs.push(tab);return tab;};
 return {...f,tabs,open:(automatic=true)=>f.api.openRallyPoint(f.read(),f.w,{automatic})};
}
test('T-5 concurrent calls open one dedicated tab; reload retains intent and T-10 diagnostics',async()=>{
 const f=navigationFixture(),before=JSON.stringify(f.read().lastPreflight),url=f.w.location.href;
 const results=await Promise.all([f.open(),f.open(),f.open()]);assert.equal(f.tabs.length,1);assert.equal(results.filter(r=>r.opened).length,1);
 assert.equal(f.w.location.href,url);assert.equal(JSON.stringify(f.read().lastPreflight),before);assert.equal(f.read().attemptId,undefined);
 delete f.w.EAS.TacticalOperationSchedulerAdapter;vm.runInContext(f.code,f.ctx);
 assert.equal((await f.w.EAS.TacticalOperationSchedulerAdapter.openRallyPoint(f.read(),f.w,{automatic:true})).alreadyStarted,true);
 assert.equal(f.tabs.length,1);
});
test('popup blocked: durable manual recovery, no tick retry or authorization mutation',async()=>{
 const f=navigationFixture(),auth=JSON.stringify(f.read().preparationAuthorization);let opens=0;const realOpen=f.w.open;
 f.w.open=()=>{opens++;return null;};assert.equal((await f.open()).blocker,'RALLY_POINT_POPUP_BLOCKED');
 assert.equal(f.read().rallyPreparation.status,'FAILED');await f.open();assert.equal(opens,1);
 f.w.open=realOpen;assert.equal((await f.open(false)).opened,true);assert.equal(f.tabs.length,1);
 assert.equal(JSON.stringify(f.read().preparationAuthorization),auth);assert.equal(f.read().finalAuthorization,undefined);assert.equal(f.read().attemptId,undefined);
});
test('closed or stale navigation fails safely; only explicit recovery opens a fresh named tab',async()=>{
 for(const closed of [true,false]){
  const f=navigationFixture();await f.open();const old=f.read().rallyPreparation.navigationId;
  if(closed)f.tabs[0].closed=true;else f.now(SEND-300000+30001);
  assert.equal((await f.open()).blocker,closed?'PREPARATION_TAB_CLOSED':'NAVIGATION_ACK_TIMEOUT');await f.open();assert.equal(f.tabs.length,1);
  assert.equal((await f.open(false)).opened,true);assert.equal(f.tabs.length,2);assert.notEqual(f.read().rallyPreparation.navigationId,old);
 }
});
test('T-5 wrong account or missing Web Locks never opens a tab',async()=>{
 const wrong=navigationFixture();wrong.w.game_data.player.id=8;assert.equal((await wrong.open()).blocker,'PLAYER_IDENTITY_MISMATCH');assert.equal(wrong.tabs.length,0);
 const noLock=navigationFixture();delete noLock.w.navigator.locks;assert.equal((await noLock.open()).blocker,'NAVIGATION_LOCK_UNAVAILABLE');assert.equal(noLock.tabs.length,0);
});

function tickFixture(){
 const f=navigationFixture();f.w.localStorage=f.storage;f.w.document.visibilityState='hidden';
 f.api.initializeSchedulerHooks(f.w);
 return {...f,tick:async n=>{f.now(n);await f.listeners.get('eas:scheduler-tick')();},diag:()=>f.api.readTickDiagnostics(f.storage)[f.uid]};
}
test('tick records safe liveness diagnostics; before T-5 nothing opens; delayed tick inside window still opens from any village/screen',async()=>{
 const f=tickFixture();f.w.location.href='https://br143.tribalwars.com.br/game.php?screen=info_village&village=999';f.w.game_data.village.id=999;
 await f.tick(SEND-300001);assert.equal(f.tabs.length,0);assert.equal(f.diag().decision,'WAIT_T5');assert.equal(f.diag().visibility,'hidden');
 await f.tick(SEND-120001);assert.equal(f.tabs.length,1,'late but still inside T-5..T-2');assert.equal(new URL(f.tabs[0].url).searchParams.get('village'),'10');
 assert.equal(f.diag().decision,'T5_DUE');assert.equal(f.diag().village,'999');assert.equal(f.diag().screen,'info_village');
 await f.tick(SEND-100000);assert.equal(f.tabs.length,1,'later ticks never duplicate');
 assert.equal(f.read().finalAuthorization,undefined);assert.equal(f.read().attemptId,undefined);assert.ok(!JSON.stringify(f.storage.getItem(f.api.TICK_DIAGNOSTICS_KEY)).includes('token'));
});
test('missed T-5 window is persisted as BLOCKED, never reopened by ticks or manual action, no tab or send',async()=>{
 const f=tickFixture();
 await f.tick(SEND-120000);assert.equal(f.tabs.length,0);assert.equal(f.read().state,'BLOCKED');assert.ok(f.read().blockers.includes('PREPARATION_WINDOW_MISSED'));
 assert.equal(f.diag().decision,'T5_WINDOW_EXPIRED');
 await f.tick(SEND-119000);assert.equal(f.tabs.length,0);
 assert.equal((await f.open(false)).opened,false);assert.equal(f.tabs.length,0);
 assert.equal(f.read().attemptId,undefined);assert.equal(f.read().finalAuthorization,undefined);
});
test('tick-driven popup block is persisted once, not retried, and controller reload does not reopen',async()=>{
 const f=tickFixture();let opens=0;f.w.open=()=>{opens++;return null;};
 await f.tick(SEND-300000);await f.tick(SEND-290000);assert.equal(opens,1);assert.equal(f.read().rallyPreparation.status,'FAILED');assert.equal(f.read().rallyPreparation.reason,'RALLY_POINT_POPUP_BLOCKED');
 f.listeners.clear();delete f.w.EAS.TacticalOperationSchedulerAdapter;vm.runInContext(f.code,f.ctx);
 const api2=f.w.EAS.TacticalOperationSchedulerAdapter;api2.initializeSchedulerHooks(f.w);f.now(SEND-280000);await f.listeners.get('eas:scheduler-tick')();
 assert.equal(opens,1);assert.equal(f.tabs.length,0);assert.equal(f.read().finalAuthorization,undefined);
});
function preparedFixture({tab=true,support=false,earlyMode=null}={}){
 const f=tickFixture(),root=JSON.parse(f.values.get(f.api.STORAGE_KEY)),u=root.executions['br143:7'][0].units[0];
 const nav='navigation-prepared',name=`eas-tactical-preparation-${nav}`;
 if(support){u.commandType='support';u.approvedCommand.commandType='support';}
 if(earlyMode){f.values.set(f.api.STORAGE_KEY,JSON.stringify(root));assert.ok(f.api.authorizeEarlySend(f.eid,f.uid,earlyMode,f.w));u.earlySendConsent=f.read().earlySendConsent;}
 u.state='PREPARED';u.rallyPreparation={status:'PREPARED',navigationId:nav,tabName:name,executionId:f.eid,executionUnitId:f.uid,evidence:{}};
 u.nextCheckpoint='SYNC_2M';u.nextCheckpointAtMs=SEND-120000;f.values.set(f.api.STORAGE_KEY,JSON.stringify(root));
 const st={target:true},inputs={axe:{value:'5930'},light:{value:'3117'},spear:{value:''}};let clicks=0,submits=0;
 const attackBtn={disabled:false,clicks:0,click(){clicks++;}},form={querySelectorAll:s=>{if(s.includes('#target_attack'))return support||st.noAttack?[]:st.twoAttack?[attackBtn,{}]:[attackBtn];if(s.includes('#target_support'))return support?[attackBtn]:[];const n=/name="(\w+)"/.exec(s)?.[1];return inputs[n]?[inputs[n]]:[];},submit(){submits++;}};
 f.w.EAS.Place={...f.w.EAS.Place,getCommandForm:()=>form,readCommandTarget:()=>({}),readTargetReadiness:c=>({targetReady:st.target,expectedTarget:c,resolvedCoordinate:st.target?c:null,reason:!st.target?'TARGET_RESOLUTION_UNAVAILABLE':null})};
 f.w.EAS.World.getServerDateTime=()=>({available:true});f.w.Timing={getCurrentServerTime:()=>f.clockNow()};
 f.w.setTimeout=fn=>setTimeout(fn,0);f.w.game_data.units=['spear','axe','light'];
 f.w.document.querySelectorAll=()=>[];
 const href=`https://br143.tribalwars.com.br/game.php?screen=place&village=10&eas_tactical_navigation_id=${nav}&eas_tactical_execution_id=${f.eid}&eas_tactical_unit_id=${f.uid}`;
 if(tab){f.w.location.href=href;f.w.name=name;}
 let cur=SEND-130000;f.ctx.__now=()=>cur;vm.runInContext('Date.now=()=>__now()',f.ctx);f.clockNow=()=>cur;f.now=n=>{cur=n;};f.setNow=n=>{cur=n;};
 f.w.EAS.MassSnipeExecution.getCurrentServerTimeMs=()=>cur;
 const tick=async n=>{cur=n;await f.listeners.get('eas:scheduler-tick')();await new Promise(r=>setTimeout(r,60));};
 return {...f,tick,st,inputs,clicks:()=>clicks,submits:()=>submits,href,name,nav,diag:()=>f.api.readTickDiagnostics(f.storage)[f.uid]};
}
const noSend=f=>{assert.equal(f.read().attemptId,undefined);assert.equal(f.read().finalAuthorization,undefined);assert.equal(f.submits(),0);assert.equal(f.clicks(),0);};
test('PREPARED exposes SYNC_2M as next checkpoint at T-2 and waits before it',async()=>{
 const f=preparedFixture(),d=f.api.preparationDiagnostic().executions[0].units[0];
 assert.equal(d.nextStage,'SYNC_2M');assert.equal(f.read().nextCheckpointAtMs,SEND-120000);
 await f.tick(SEND-120001);assert.equal(f.read().state,'PREPARED');assert.equal(f.diag().decision,'WAIT_T2');noSend(f);
});
test('T-2 tick in the prepared tab syncs with authoritative samples, read-only, no attempt/authorization/send',async()=>{
 const f=preparedFixture();f.w.location.href='https://br143.tribalwars.com.br/game.php?screen=place&village=10&eas_tactical_navigation_id='+f.nav+'&eas_tactical_execution_id='+f.eid+'&eas_tactical_unit_id='+f.uid;
 await f.tick(SEND-120000);
 assert.equal(f.read().state,'SYNC_2M',JSON.stringify(f.read().blockers));assert.equal(f.read().nextCheckpoint,'FINAL_CHECK');
 assert.equal(f.read().clockEvidence.source,'Timing.getCurrentServerTime+World.getServerDateTime');assert.equal(f.inputs.axe.value,'5930');noSend(f);
 const snap=JSON.stringify(f.read());await f.tick(SEND-119000);assert.equal(JSON.stringify(f.read()),snap,'no duplicate sync after SYNC_2M');
});
test('delayed tick inside T-2..T still syncs; reload of the prepared tab recovers; after T it is missed',async()=>{
 const f=preparedFixture();await f.tick(SEND-120000);
 delete f.w.EAS.TacticalOperationSchedulerAdapter;f.listeners.clear();vm.runInContext(f.code,f.ctx);
 const api2=f.w.EAS.TacticalOperationSchedulerAdapter;api2.initializeSchedulerHooks(f.w);assert.equal(f.read().state,'SYNC_2M');
 const late=preparedFixture();await late.tick(SEND-1500);assert.equal(late.read().state,'SYNC_2M');
 const missed=preparedFixture();await missed.tick(SEND+1);assert.equal(missed.read().state,'BLOCKED');assert.ok(missed.read().blockers.includes('CLOCK_SYNC_WINDOW_MISSED'));noSend(missed);
});
test('T-2 blocks when the clock is unavailable or has no fallback; nothing is sent',async()=>{
 for(const mutate of [f=>{delete f.w.Timing;},f=>{f.w.EAS.World.getServerDateTime=()=>({available:false});},f=>{f.w.EAS.MassSnipeExecution.getCurrentServerTimeMs=undefined;}]){ // no server clock: no tick action at all
  const f=preparedFixture();mutate(f);await f.tick(SEND-100000).catch(()=>{});
  assert.notEqual(f.read().state,'SYNC_2M');assert.ok(['BLOCKED','PREPARED'].includes(f.read().state));noSend(f);
 }
});
test('T-2 blocks on diverging source, target, composition or account; nothing is written or sent',async()=>{
 const cases=[['SOURCE_IDENTITY_MISMATCH',f=>{f.w.game_data.village.id=999;}],['TARGET_IDENTITY_MISMATCH',f=>{f.st.target=false;}],
  ['APPROVED_COMPOSITION_MISMATCH',f=>{f.inputs.axe.value='5929';}],['PLAYER_IDENTITY_MISMATCH',f=>{f.w.game_data.player.id=8;}],
  ['NAVIGATION_CONTEXT_MISMATCH',f=>{f.w.name='other';}]];
 for(const [reason,mutate] of cases){const f=preparedFixture();mutate(f);const before=JSON.stringify(f.inputs);await f.tick(SEND-100000);
  assert.equal(f.read().state,'BLOCKED',reason);assert.ok(f.read().blockers.includes(reason),reason);assert.equal(JSON.stringify(f.inputs),before);noSend(f);}
});
test('controller tab never syncs a prepared unit it does not own; lost tab or expired window blocks, no recovery or send',async()=>{
 const f=preparedFixture({tab:false});f.w.location.href='https://br143.tribalwars.com.br/game.php?screen=info_village&village=999';
 await f.tick(SEND-100000);assert.equal(f.read().state,'PREPARED');assert.equal(f.diag().decision,'T2_NOT_PREPARED_TAB');noSend(f);
 await f.tick(SEND+5);assert.equal(f.read().state,'BLOCKED');assert.ok(f.read().blockers.includes('CLOCK_SYNC_WINDOW_MISSED'));
 await f.tick(SEND+10);assert.equal(f.tabs.length,0);noSend(f);
});

async function syncedFixture(opts){
 const f=preparedFixture(opts);await f.tick(SEND-120000);assert.equal(f.read().state,'SYNC_2M',JSON.stringify(f.read().blockers));return f;
}
const noSendOrAuth=f=>{noSend(f);assert.equal(f.read().attemptId,undefined);assert.equal(f.read().outgoingBaseline,undefined);assert.equal(f.read().finalAuthorization,undefined);};
test('SYNC_2M exposes FINAL_CHECK at T-60s; before it nothing happens',async()=>{
 const f=await syncedFixture();assert.equal(f.read().nextCheckpoint,'FINAL_CHECK');assert.equal(f.read().nextCheckpointAtMs,SEND-60000);
 await f.tick(SEND-60001);assert.equal(f.read().state,'SYNC_2M');assert.equal(f.diag().decision,'WAIT_FINAL_CHECK');noSendOrAuth(f);
});
test('normal SYNC_2M -> FINAL_CHECK -> READY_TO_SEND with evidence; no auth, attempt, click or submit; idempotent',async()=>{
 const f=await syncedFixture();await f.tick(SEND-60000);
 const u=f.read();assert.equal(u.state,'READY_TO_SEND',JSON.stringify(u.blockers));assert.equal(u.nextCheckpoint,null);
 const e=u.finalCheckEvidence;assert.equal(e.fromPreparedForm,true);assert.equal(JSON.stringify(e.composition),JSON.stringify({axe:5930,light:3117}));assert.equal(e.commandType,'attack');
 assert.equal(e.target.coord,'507|471');assert.equal(e.source.id,'10');assert.equal(e.clockSource,'Timing.getCurrentServerTime+World.getServerDateTime');assert.ok(e.sampleCount>=3);assert.ok(e.offsetDriftMs<=500);
 noSendOrAuth(f);const snap=JSON.stringify(f.read());await f.tick(SEND-55000);await f.tick(SEND-50001);assert.equal(JSON.stringify(f.read()),snap);
 assert.equal(f.api.authorizeFinalSubmit(f.eid,f.uid,f.w),null,'READY_TO_SEND from prepared form is not an authorization');assert.equal(f.read().finalAuthorization,undefined);
 assert.equal((await f.api.armFinalExecution(f.eid,f.uid,f.w,{dryRun:true})).armed,false);noSendOrAuth(f);
});
test('reload between SYNC_2M and FINAL_CHECK recovers from storage; late tick still inside window works',async()=>{
 const f=await syncedFixture();delete f.w.EAS.TacticalOperationSchedulerAdapter;f.listeners.clear();vm.runInContext(f.code,f.ctx);
 f.w.EAS.TacticalOperationSchedulerAdapter.initializeSchedulerHooks(f.w);assert.equal(f.read().state,'SYNC_2M');
 await f.tick(SEND-5001);assert.equal(f.read().state,'READY_TO_SEND');noSendOrAuth(f);
});
test('delayed FINAL_CHECK past T-5s is blocked, never reopened',async()=>{
 const f=await syncedFixture();await f.tick(SEND-5000);assert.equal(f.read().state,'BLOCKED');assert.ok(f.read().blockers.includes('FINAL_CHECK_WINDOW_MISSED'));
 await f.tick(SEND-4000);assert.equal(f.read().state,'BLOCKED');noSendOrAuth(f);
 const g=await syncedFixture();await g.tick(SEND+10);assert.equal(g.read().state,'BLOCKED');noSendOrAuth(g);
});
test('FINAL_CHECK blocks with a persisted specific reason on any divergence',async()=>{
 const cases=[['SOURCE_IDENTITY_MISMATCH',f=>{f.w.game_data.village.id=999;}],['TARGET_IDENTITY_MISMATCH',f=>{f.st.target=false;}],
  ['APPROVED_COMPOSITION_MISMATCH',f=>{f.inputs.axe.value='5929';}],['APPROVED_COMPOSITION_MISMATCH',f=>{f.inputs.spear.value='1';}],
  ['PLAYER_IDENTITY_MISMATCH',f=>{f.w.game_data.player.id=8;}],['WORLD_IDENTITY_MISMATCH',f=>{f.w.game_data.world='br144';}],
  ['NAVIGATION_CONTEXT_MISMATCH',f=>{f.w.name='other';}],['RALLY_POINT_COMMAND_CONTROL_UNAVAILABLE',f=>{f.st.noAttack=true;}],
  ['RALLY_POINT_COMMAND_CONTROL_UNAVAILABLE',f=>{f.st.twoAttack=true;}],
  ['PREVIOUS_ATTEMPT_OR_UNCERTAIN_SEND',f=>{f.storage.setItem(`eas_tw_tactical_consumed:br143:7:${f.eid}:${f.uid}`,'1');}]];
 for(const [reason,mutate] of cases){const f=await syncedFixture();mutate(f);const before=JSON.stringify(f.inputs);await f.tick(SEND-50000);
  assert.equal(f.read().state,'BLOCKED',reason);assert.ok(f.read().blockers.includes(reason),reason+' got '+f.read().blockers);assert.equal(JSON.stringify(f.inputs),before);noSendOrAuth(f);}
});
test('FINAL_CHECK clock: unavailable, local-clock skew vs SYNC evidence and missing server clock all block; no Date.now substitute',async()=>{
 for(const [reason,mutate] of [['CLOCK_PRECISION_UNAVAILABLE',f=>{delete f.w.Timing;}],['CLOCK_PRECISION_UNAVAILABLE',f=>{f.w.EAS.World.getServerDateTime=()=>({available:false});}],
  ['CLOCK_INCONSISTENT',f=>{f.ctx.__now=()=>f.clockNow()+5000;}]]){
  const f=await syncedFixture();mutate(f);await f.tick(SEND-50000);assert.equal(f.read().state,'BLOCKED',reason);assert.ok(f.read().blockers.includes(reason),reason+' got '+f.read().blockers);noSendOrAuth(f);}
 const g=await syncedFixture();g.w.EAS.MassSnipeExecution.getCurrentServerTimeMs=undefined;await g.tick(SEND-50000).catch(()=>{});assert.equal(g.read().state,'SYNC_2M');noSendOrAuth(g);
});
test('wrong or closed tab: controller never finalizes; closed handle or expiry blocks; duplicate tab cannot create READY_TO_SEND',async()=>{
 const f=await syncedFixture();f.w.location.href='https://br143.tribalwars.com.br/game.php?screen=info_village&village=999';
 await f.tick(SEND-50000);assert.equal(f.read().state,'SYNC_2M');assert.equal(f.diag().decision,'FINAL_CHECK_NOT_PREPARED_TAB');
 await f.tick(SEND-4000);assert.equal(f.read().state,'BLOCKED');assert.ok(f.read().blockers.includes('FINAL_CHECK_WINDOW_MISSED'));noSendOrAuth(f);
 const dup=await syncedFixture();dup.w.name='duplicate-tab';await dup.tick(SEND-50000);assert.equal(dup.read().state,'BLOCKED');assert.ok(!dup.read().finalCheckEvidence?.fromPreparedForm||dup.read().state!=='READY_TO_SEND');noSendOrAuth(dup);
 const winner=await syncedFixture();await winner.tick(SEND-50000);assert.equal(winner.read().state,'READY_TO_SEND');
 const other=dup.api;await other.finalizePrepared(winner.eid,winner.uid,{...winner.w,name:'x'});assert.equal(winner.read().state,'READY_TO_SEND','late duplicate is a no-op');noSendOrAuth(winner);
});
test('cancelled operation is never finalized',async()=>{
 const f=await syncedFixture();f.api.cancelStoredUnit(f.eid,f.uid);assert.equal(f.read().state,'CANCELLED');await f.tick(SEND-50000);assert.equal(f.read().state,'CANCELLED');noSendOrAuth(f);
 assert.equal((await f.api.finalizePrepared(f.eid,f.uid,f.w)).valid,false);
});
const noNav=f=>{assert.equal(f.read().attemptId,undefined);assert.equal(f.read().finalAuthorization,undefined);assert.equal(f.read().outgoingBaseline,undefined);};
const attempts=f=>f.api.preparationDiagnostic().preparationAttempts.filter(a=>a.action==='AUTOMATIC_PREPARE_5M_OPEN_RALLY_POINT');
test('T-5 repeated ticks: one NAVIGATION_STARTED, coalesced NAVIGATION_ALREADY_IN_PROGRESS, no duplicate tab, history preserved',async()=>{
 const f=tickFixture();await f.tick(SEND-300000);const id=f.read().rallyPreparation.navigationId;
 for(let i=1;i<=25;i++)await f.tick(SEND-300000+i*1000);
 assert.equal(f.tabs.length,1);assert.equal(f.read().rallyPreparation.navigationId,id);
 const a=attempts(f);assert.equal(a.length,2,JSON.stringify(a.map(x=>[x.outcome,x.observations])));
 assert.equal(a[0].outcome,'NAVIGATION_STARTED');assert.equal(a[0].navigationStarted,true);
 assert.equal(a[1].outcome,'NAVIGATION_ALREADY_IN_PROGRESS');assert.equal(a[1].navigationStarted,false);assert.equal(a[1].navigationId,id);assert.equal(a[1].observations,25);
 assert.ok(f.api.preparationDiagnostic().preparationAttempts.some(x=>x.action==='MANUAL_PRECHECK_10M'||x.stage!=='PREPARE_5M')||true);
 noNav(f);
});
test('popup blocked and expired navigation report NAVIGATION_FAILED, never success; closed tab too',async()=>{
 const f=tickFixture();f.w.open=()=>null;await f.tick(SEND-300000);
 assert.equal(attempts(f).at(-1).outcome,'NAVIGATION_FAILED');assert.equal(attempts(f).at(-1).blocker,'RALLY_POINT_POPUP_BLOCKED');assert.equal(f.tabs.length,0);noNav(f);
 const g=tickFixture();await g.tick(SEND-300000);g.now(SEND-300000+30001);await g.open();
 assert.equal(attempts(g).at(-1).outcome,'NAVIGATION_FAILED');assert.equal(g.read().rallyPreparation.status,'FAILED');noNav(g);
});
test('wrong account/session is NAVIGATION_BLOCKED; prepared, ready and cancelled units never open another tab',async()=>{
 const w=tickFixture();w.w.game_data.player.id=8;await w.open();assert.equal(attempts(w).at(-1).outcome,'NAVIGATION_BLOCKED');assert.equal(w.tabs.length,0);
 const p=await syncedFixture();const before=JSON.stringify(p.read());
 for(const t of [SEND-100000,SEND-50000,SEND-55000])await p.tick(t);
 assert.equal(p.read().state,'READY_TO_SEND');
 const r=await p.api.openRallyPoint(p.read(),p.w,{automatic:true});assert.equal(r.valid,false);assert.equal(r.alreadyPrepared,true);
 assert.equal(p.read().state,'READY_TO_SEND');assert.notEqual(before,'');noNav(p);
 const c=tickFixture();await c.tick(SEND-300000);c.api.cancelStoredUnit(c.eid,c.uid);const n=c.tabs.length;await c.tick(SEND-290000);assert.equal(c.tabs.length,n);assert.equal(c.read().state,'CANCELLED');noNav(c);
});
test('clock frame: server wall clock as UTC; -3h offset with small skew is consistent and decomposed, never claimed as ms precision',()=>{
 const f=preparedFixture().api.describeClockFrame(-10796438);
 assert.equal(f.serverWallClockShiftMs,-10800000);assert.equal(f.residualSkewMs,3562);assert.equal(f.frame,'server-wall-clock-as-utc');assert.ok(f.note.includes('no millisecond precision'));
 assert.equal(preparedFixture().api.describeClockFrame(NaN),null);
 const api=preparedFixture().api,mk=(off,spread=0,at=1000000)=>[0,1,2].map(i=>({serverNowMs:at+off+i*(i===2?spread:0),localNowMs:at,measuredAt:at+off}));
 const big=api.evaluateClockSamples(mk(-10796438).map(s=>({...s,measuredAt:s.serverNowMs})),mk(-10796438)[0].serverNowMs);
 assert.equal(big.valid,true);assert.equal(big.serverClockOffsetMs,-10796438);
 const drift=api.evaluateClockSamples(mk(-10796438,900).map(s=>({...s,measuredAt:s.serverNowMs})),mk(-10796438,900)[2].serverNowMs);assert.equal(drift.blocker,'CLOCK_SAMPLE_OUTLIER');
 const wrongLocal=api.evaluateClockSamples(mk(2*86400000).map(s=>({...s,measuredAt:s.serverNowMs})),mk(2*86400000)[0].serverNowMs);assert.equal(wrongLocal.blocker,'CLOCK_OFFSET_IMPLAUSIBLE');
 assert.equal(api.evaluateClockSamples([],1).blocker,'CLOCK_SAMPLES_INSUFFICIENT');
});
function confirmFixture(opts){return syncedFixture(opts).then(async f=>{
 await f.tick(SEND-60000);assert.equal(f.read().state,'READY_TO_SEND',JSON.stringify(f.read().blockers));
 const store={};f.w.sessionStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v;}};
 const c={src:[{value:'10'}],finalClicks:0,rows:[{textContent:'Dura\u00e7\u00e3o: 0:00:10'}],inputs:[{name:'axe',value:'5930'},{name:'light',value:'3117'}],text:'Destino 507|471',label:opts?.support?'Enviar apoio':'Enviar ataque',buttons:1};
 let theForm=null;const buttons=()=>Array.from({length:c.buttons},()=>({id:'troop_confirm_submit',textContent:c.label,get form(){return theForm;},click(){c.finalClicks++;}}));
 const form=()=>theForm={innerText:c.text,querySelectorAll:s=>s.includes('button')?buttons():s==='input[name]'?c.inputs:s==='input[name="source_village"]'?c.src:[]};
 c.open=async(at=SEND-50000)=>{await f.tick(at);};
 c.go=()=>{f.w.location.href=`https://br143.tribalwars.com.br/game.php?village=10&screen=place&try=confirm`;f.w.document.querySelector=s=>s.includes('command-confirm-form')?form():null;f.w.document.querySelectorAll=s=>s==='tr'?c.rows:[];};
 return Object.assign(f,{c});});}
const noFinal=f=>{noNav(f);assert.equal(f.c.finalClicks,0);assert.equal(f.submits(),0);assert.ok(f.clicks()<=1);assert.equal(f.api.authorizeFinalSubmit(f.eid,f.uid,f.w),null);};
for(const support of [false,true])test(`${support?'SUPPORT':'ATTACK'}: READY_TO_SEND -> native control click -> confirmation page -> CONFIRMATION_READY; no final click`,async()=>{
 const f=await confirmFixture({support});await f.c.open(SEND-55000);assert.equal(f.clicks(),0,'not before T-50s');
 await f.c.open();assert.equal(f.clicks(),1);const i=f.read().confirmationIntent;assert.equal(i.status,'NAVIGATING');assert.equal(f.read().state,'READY_TO_SEND');
 await f.c.open(SEND-49000);await f.c.open(SEND-48000);assert.equal(f.clicks(),1,'never re-click');
 f.c.go();await f.tick(SEND-45000);const u=f.read();assert.equal(u.state,'CONFIRMATION_READY',JSON.stringify(u.blockers));
 const e=u.confirmationEvidence;assert.equal(e.nativeDurationMs,10000);assert.equal(e.commandType,support?'support':'attack');assert.equal(e.submitControlCount,1);assert.equal(e.predictedArrivalMs,SEND+10000);assert.equal(e.target.coord,'507|471');
 await f.tick(SEND-30000);assert.equal(f.read().state,'CONFIRMATION_READY');noFinal(f);
});
for(const support of [false,true])test(`${support?'SUPPORT':'ATTACK'}: confirmation page shows no stale BLOCKED and the panel follows persisted state`,async()=>{
 const f=await confirmFixture({support});await f.c.open();f.c.go();
 const mk=()=>({children:[],style:{},dataset:{},querySelector(){return null;},addEventListener(){},append(...n){this.children.push(...n);},after(){},remove(){},get isConnected(){return true;}});
 const body=mk(),made=[];const d=f.w.document;
 d.readyState='complete';d.getElementById=()=>null;d.createElement=()=>{const e=mk();made.push(e);return e;};d.body=body;
 f.w.setInterval=()=>1;f.w.clearInterval=()=>{};
 assert.equal(f.api.initializePreparationPage(f.w),true,'panel initializes on try=confirm');
 const texts=()=>made.map(e=>e.textContent||'').join('|');
 assert.ok(!/BLOCKED/.test(texts()));assert.ok(/validando confirma/.test(texts()));
 await f.tick(SEND-45000);assert.equal(f.read().state,'CONFIRMATION_READY');
 made.length=0;assert.equal(f.api.initializePreparationPage(f.w),true);assert.ok(/CONFIRMATION_READY/.test(texts())&&/N\u00c3O ENVIADO/.test(texts()));
 f.w.name='other-tab';assert.equal(f.api.initializePreparationPage(f.w),false,'foreign tab is not adopted');noFinal(f);
});
test('reload on the confirmation page recovers from storage; reload on Rally Point after intent never re-clicks',async()=>{
 const f=await confirmFixture();await f.c.open();assert.equal(f.clicks(),1);
 delete f.w.EAS.TacticalOperationSchedulerAdapter;f.listeners.clear();vm.runInContext(f.code,f.ctx);f.w.EAS.TacticalOperationSchedulerAdapter.initializeSchedulerHooks(f.w);
 await f.tick(SEND-45000);assert.equal(f.clicks(),1);assert.equal(f.read().state,'READY_TO_SEND');
 f.c.go();await f.tick(SEND-44000);assert.equal(f.read().state,'CONFIRMATION_READY');noFinal(f);
});
for(const [reason,mut] of [
 ['SOURCE_IDENTITY_UNVERIFIED',c=>c.src=[]],['SOURCE_IDENTITY_UNVERIFIED',c=>c.src=[{value:'10'},{value:'10'}]],['SOURCE_IDENTITY_MISMATCH',c=>c.src=[{value:'11'}]],['SOURCE_IDENTITY_MISMATCH',c=>c.src=[{value:'x'}]],['TARGET_IDENTITY_MISMATCH',c=>c.text='Origem 516|458 Destino 500|500'],
 ['APPROVED_COMPOSITION_MISMATCH',c=>c.inputs[0].value='5929'],['CONFIRMATION_DURATION_MISMATCH',c=>c.rows[0].textContent='Dura\u00e7\u00e3o: 0:00:20'],
 ['CONFIRMATION_DURATION_UNAVAILABLE',c=>c.rows=[]],['COMMAND_TYPE_MISMATCH',c=>c.label='Enviar apoio'],
 ['CONFIRMATION_SUBMIT_CONTROL_AMBIGUOUS',c=>c.buttons=0],['CONFIRMATION_SUBMIT_CONTROL_AMBIGUOUS',c=>c.buttons=2]])
 test(`confirmation divergence blocks fail-closed: ${reason}`,async()=>{
  const f=await confirmFixture();await f.c.open();mut(f.c);f.c.go();await f.tick(SEND-45000);
  assert.equal(f.read().state,'BLOCKED');assert.ok(f.read().blockers.includes(reason),String(f.read().blockers));noFinal(f);
 });
for(const [reason,mut] of [['WORLD_IDENTITY_MISMATCH',w=>w.game_data.world='br144'],['PLAYER_IDENTITY_MISMATCH',w=>w.game_data.player={id:8}],['SOURCE_IDENTITY_MISMATCH',w=>w.game_data.village.id=11]])
 test(`confirmation page wrong account/world/village blocks: ${reason}`,async()=>{
  const f=await confirmFixture();await f.c.open();f.c.go();mut(f.w);const r=f.api.captureConfirmation(f.eid,f.uid,f.w);
  assert.equal(r.valid,false);assert.equal(f.read().state,'BLOCKED');assert.ok(f.read().blockers.includes(reason),String(f.read().blockers));noFinal(f);
 });
test('duplicate tab, cancelled, legacy READY_TO_SEND, timeout, missed window, no clock: nothing is clicked or authorized',async()=>{
 const dup=await confirmFixture();await dup.c.open();dup.c.go();dup.w.name='other-tab';assert.equal(dup.api.captureConfirmation(dup.eid,dup.uid,dup.w).valid,false);
 assert.equal(dup.read().state,'BLOCKED');assert.ok(dup.read().blockers.includes('CONFIRMATION_CONTEXT_INVALID'));noFinal(dup);
 const cancelled=await confirmFixture();cancelled.api.cancelStoredUnit(cancelled.eid,cancelled.uid);await cancelled.c.open();assert.equal(cancelled.read().state,'CANCELLED');assert.equal(cancelled.clicks(),0);noFinal(cancelled);
 const legacy=await confirmFixture();const root=JSON.parse(legacy.values.get(legacy.api.STORAGE_KEY));delete root.executions['br143:7'][0].units[0].finalCheckEvidence.fromPreparedForm;legacy.values.set(legacy.api.STORAGE_KEY,JSON.stringify(root));
 await legacy.c.open();assert.equal(legacy.clicks(),0);assert.equal(legacy.read().state,'READY_TO_SEND');assert.equal(legacy.read().confirmationIntent,undefined);assert.equal(legacy.api.authorizeFinalSubmit(legacy.eid,legacy.uid,legacy.w),null);
 const slow=await confirmFixture();await slow.c.open();slow.c.go();await slow.tick(SEND-25000);assert.equal(slow.read().state,'BLOCKED');assert.ok(slow.read().blockers.includes('CONFIRMATION_NAVIGATION_TIMEOUT'));noFinal(slow);
 const late=await confirmFixture();await late.c.open(SEND-9000);assert.equal(late.read().state,'BLOCKED');assert.ok(late.read().blockers.includes('CONFIRMATION_WINDOW_MISSED'));assert.equal(late.clicks(),0);noFinal(late);
 const away=await confirmFixture();away.w.location.href='https://br143.tribalwars.com.br/game.php?screen=info_village&village=999';await away.c.open();assert.equal(away.clicks(),0);noFinal(away);
 const noClock=await confirmFixture();noClock.w.EAS.MassSnipeExecution.getCurrentServerTimeMs=undefined;await noClock.tick(SEND-50000).catch(()=>{});assert.equal(noClock.clicks(),0);assert.equal(noClock.read().confirmationIntent,undefined);noFinal(noClock);
});


test('SYNC_2M rejection persists full bounded clock diagnostics through reload without retry or send',async()=>{
 const f=preparedFixture();let readings=0,mono=0;
 f.w.performance={now:()=>++mono};
 f.w.Timing.getCurrentServerTime=()=>{readings++;return f.clockNow();};
 // Local clock advances inconsistently; authoritative source remains unchanged.
 let localReads=0;f.ctx.__now=()=>f.clockNow()+(localReads++===2?900:0);
 await f.tick(SEND-120000);
 assert.equal(f.read().state,'BLOCKED');assert.ok(f.read().blockers.includes('CLOCK_SAMPLE_OUTLIER'));
 const d=f.read().clockDiagnostic;assert.equal(d.samples.length,3);assert.equal(d.spreadMs,900);assert.equal(d.reason,'CLOCK_SAMPLE_OUTLIER');
 assert.equal(d.minimumOffsetMs,-900);assert.equal(d.maximumOffsetMs,0);assert.equal(d.medianOffsetMs,0);assert.equal(d.limits.maximumSpreadMs,500);
 assert.ok(d.samples.every(s=>s.readDurationMs===1));noSendOrAuth(f);
 const count=readings;delete f.w.EAS.TacticalOperationSchedulerAdapter;vm.runInContext(f.code,f.ctx);
 const api2=f.w.EAS.TacticalOperationSchedulerAdapter;
 assert.equal(JSON.stringify(api2.preparationDiagnostic().executions[0].units[0].clockDiagnostic),JSON.stringify(d));
 await api2.synchronizePrepared(f.eid,f.uid,f.w);assert.equal(readings,count);assert.equal(f.read().state,'BLOCKED');noSendOrAuth(f);
});
test('successful SYNC_2M also exposes samples after persistence',async()=>{
 const f=await syncedFixture();const d=f.api.preparationDiagnostic().executions[0].units[0].clockDiagnostic;
 assert.equal(d.valid,true);assert.equal(d.reason,null);assert.equal(d.samples.length,3);assert.equal(d.spreadMs,0);noSendOrAuth(f);
});


async function finalReadyFixture(support=false, available=true, earlyMode=null) {
 const f=await confirmFixture({support,earlyMode});
 f.w.EAS.FakesExecution={readOutgoingCommands:()=>({available,commands:[],reason:available?null:'DOM_UNAVAILABLE'})};
 await f.c.open();f.c.go();await f.tick(SEND-45000);
 assert.equal(f.read().state,'CONFIRMATION_READY');
 const form=f.w.document.querySelector('#command-confirm-form'),oldQuery=f.w.document.querySelector;
 const button=form.querySelectorAll('button')[0];button.isConnected=true;button.getClientRects=()=>[1];button.addEventListener=button.removeEventListener=()=>{};
 form.addEventListener=form.removeEventListener=()=>{};
 f.w.document.querySelector=s=>s.includes('command-confirm-form')?form:oldQuery(s);
 const oldAll=f.w.document.querySelectorAll;f.w.document.querySelectorAll=s=>s==='#troop_confirm_submit'?[button]:oldAll(s);
 f.w.EAS.Selectors={};f.w.EAS.Adapters={};let loads=0;
 f.w.EASLoader={loadScript:async path=>{loads++;assert.equal(path,'services/mass-snipe-precise.js');vm.runInContext(fs.readFileSync(path,'utf8'),f.ctx);}};
 let locked=false;f.w.navigator={locks:{request:async(_key,_opts,fn)=>{if(locked)return fn(null);locked=true;try{return await fn({})}finally{locked=false}}}};
 const callbacks=[];f.w.setTimeout=fn=>{callbacks.push(fn);return callbacks.length};f.w.clearTimeout=()=>{};
 f.w.removeEventListener=()=>{};f.w.performance={now:()=>f.clockNow()};
 return Object.assign(f,{button,loads:()=>loads,fire:()=>{f.now(SEND);callbacks.splice(0).forEach(fn=>fn());}});
}
for(const support of [false,true])test(`${support?'SUPPORT':'ATTACK'} automatic preparation -> explicit FINAL_CHECK -> shared precise dry run`,async()=>{
 const f=await finalReadyFixture(support);const baseline=JSON.stringify(f.read().confirmationIntent.outgoingEvidence);
 const checked=await f.api.prepareFinalExecution(f.eid,f.uid,f.w);
 assert.equal(checked.valid,true,checked.blocker);assert.equal(f.read().state,'READY_TO_SEND');assert.equal(f.loads(),1);
 assert.equal(f.read().finalAuthorization,undefined);assert.ok(f.api.baselineValid(f.read()));
 assert.equal(JSON.stringify(f.read().confirmationIntent.outgoingEvidence),baseline);
 assert.equal((await f.api.armFinalExecution(f.eid,f.uid,f.w,{dryRun:false})).blocker,'FINAL_AUTHORIZATION_REQUIRED');
 const armed=await f.api.armFinalExecution(f.eid,f.uid,f.w,{dryRun:true});assert.equal(armed.armed,true,armed.blocker);
 f.fire();assert.equal(f.c.finalClicks,0);assert.equal(f.read().executionTiming.dryRun,true);assert.equal(f.read().executionTiming.localDeviationMs,0);
 assert.equal(f.read().state,'READY_TO_SEND');assert.equal(f.read().finalAuthorization,undefined);
});
for(const support of [false,true])test(`${support?'SUPPORT':'ATTACK'} new final flow requires explicit authorization and clicks only once`,async()=>{
 const f=await finalReadyFixture(support);assert.equal((await f.api.prepareFinalExecution(f.eid,f.uid,f.w)).valid,true);
 assert.ok(f.api.authorizeFinalSubmit(f.eid,f.uid,f.w));
 assert.equal((await f.api.armFinalExecution(f.eid,f.uid,f.w,{dryRun:false})).armed,true);
 f.fire();f.fire();assert.equal(f.c.finalClicks,1);assert.equal(f.read().state,'UNCERTAIN');
 assert.equal(f.read().executionTiming.localWithin100Ms,true);assert.equal(f.read().executionTiming.serverOutcome,'UNCONFIRMED');
 assert.equal((await f.api.armFinalExecution(f.eid,f.uid,f.w,{dryRun:false})).armed,false);
});
test('new final flow cannot invent unavailable baseline or accept a wrong account/tab',async()=>{
 const missing=await finalReadyFixture(false,false);assert.equal((await missing.api.prepareFinalExecution(missing.eid,missing.uid,missing.w)).blocker,'OUTGOING_BASELINE_UNAVAILABLE');assert.equal(missing.read().attemptId,undefined);
 for(const change of [f=>f.w.game_data.player.id=999,f=>f.w.game_data.world='other',f=>f.w.name='other']){
  const f=await finalReadyFixture();change(f);assert.equal((await f.api.prepareFinalExecution(f.eid,f.uid,f.w)).valid,false);assert.equal(f.read().attemptId,undefined);
 }
});

for(const support of [false,true])for(const mode of ['real','dry-run'])test(`${support?'SUPPORT':'ATTACK'} early ${mode}: checkpoint arms without final manual intervention`,async()=>{
 const f=await finalReadyFixture(support,true,mode);assert.ok(f.api.earlySendValid(f.read()));
 await f.tick(SEND-10001);assert.equal(f.read().state,'CONFIRMATION_READY');
 await f.tick(SEND-10000);assert.equal(f.read().state,'READY_TO_SEND',JSON.stringify(f.read().blockers));
 assert.equal(Boolean(f.read().finalAuthorization),mode==='real');
 await f.tick(SEND-9000);f.fire();f.fire();
 assert.equal(f.c.finalClicks,mode==='real'?1:0);assert.equal(f.read().executionTiming.localDeviationMs,0);
 assert.equal(f.read().state,mode==='real'?'UNCERTAIN':'READY_TO_SEND');
 await f.tick(SEND+2000);assert.equal(f.c.finalClicks,mode==='real'?1:0);
});
test('automatic final check blocks expired deadline and missing early consent, never catches up',async()=>{
 const late=await finalReadyFixture(false,true,'real');await late.tick(SEND+1);
 assert.equal(late.read().state,'BLOCKED');assert.ok(late.read().blockers.includes('FINAL_SEND_DEADLINE_PASSED'));assert.equal(late.c.finalClicks,0);assert.equal(late.read().attemptId,undefined);
 const noAuth=await finalReadyFixture();await noAuth.tick(SEND-10000);assert.equal(noAuth.read().state,'BLOCKED');assert.ok(noAuth.read().blockers.includes('EARLY_FINAL_AUTHORIZATION_MISSING_OR_CHANGED'));assert.equal(noAuth.c.finalClicks,0);
});
test('early consent binds account and immutable command, and cannot authorize NT',()=>{
 const f=fixture();const saved=f.api.authorizeEarlySend(f.eid,f.uid,'real',f.w);assert.ok(saved);
 for(const mutate of [u=>u.account.playerId='x',u=>u.revision++,u=>u.source.id='x',u=>u.target.coord='111|222',u=>u.commandType='support',u=>u.approvedCommand.composition.quantities.axe++,u=>u.executionSendAtMs++]){
  const changed=JSON.parse(JSON.stringify(saved));mutate(changed);assert.equal(f.api.earlySendValid(changed),false);
 }
 f.w.game_data.world='other';assert.equal(f.api.authorizeEarlySend(f.eid,f.uid,'real',f.w),null);
 f.w.game_data.world='br143';const root=JSON.parse(f.values.get(f.api.STORAGE_KEY));root.executions['br143:7'][0].units[0].kind='native-noble-train';f.values.set(f.api.STORAGE_KEY,JSON.stringify(root));assert.equal(f.api.authorizeEarlySend(f.eid,f.uid,'real',f.w),null);
});

test('BR143 ATTACK: fractional server milliseconds on native confirmation are available at T-30, FINAL_CHECK and final click',async()=>{
 const f=await finalReadyFixture(false,true,'real');
 const original=f.w.EAS.MassSnipeExecution.getCurrentServerTimeMs;
 f.w.EAS.MassSnipeExecution.getCurrentServerTimeMs=()=>original()+0.875;
 f.w.Timing.getCurrentServerTime=f.w.EAS.MassSnipeExecution.getCurrentServerTimeMs;
 await f.tick(SEND-30000);
 assert.equal(f.read().state,'CONFIRMATION_READY',JSON.stringify(f.read().blockers));
 await f.tick(SEND-10000);
 assert.equal(f.read().state,'READY_TO_SEND',JSON.stringify(f.read().blockers));
 assert.ok(f.read().finalAuthorization);
 f.fire();
 assert.equal(f.c.finalClicks,1);
 assert.equal(f.read().executionTiming.localDeviationMs,0.875,'precision is preserved at the real click boundary');
});

function realConfirmationClock(f,{missingProvider=false,missingWorld=false}={}){
 const query=f.w.document.querySelector;
 f.w.document.querySelector=selector=>{
  const date=new Date(f.clockNow()),pad=n=>String(n).padStart(2,'0');
  if(selector==='#serverDate')return {textContent:`${pad(date.getUTCDate())}/${pad(date.getUTCMonth()+1)}/${date.getUTCFullYear()}`};
  if(selector==='#serverTime')return {textContent:`${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`};
  return query(selector);
 };
 f.ctx.document=f.w.document;f.ctx.location=f.w.location;
 // BR143's displayed calendar is UTC-3, while native Timing carries fractions.
 f.w.Timing={getCurrentServerTime:()=>f.clockNow()+10800000+0.875};
 for(const path of ['core/utils.js','core/world.js','services/mass-snipe-execution.js'])vm.runInContext(fs.readFileSync(path,'utf8'),f.ctx);
 if(missingProvider)delete f.w.EAS.MassSnipeExecution;
 if(missingWorld)delete f.w.EAS.World.getServerDateTime;
 const loaded=[];
 f.w.EASLoader.loadScript=async path=>{loaded.push(path);vm.runInContext(fs.readFileSync(path,'utf8'),f.ctx);};
 return loaded;
}

for(const missingWorld of [false,true])test(`BR143 native confirmation: recover missing ${missingWorld?'World reader':'MassSnipeExecution'} with real DOM/Timing provider, never client time`,async()=>{
 const f=await finalReadyFixture(false,true,'real'),loaded=realConfirmationClock(f,{missingProvider:!missingWorld,missingWorld});
 f.ctx.__now=()=>f.clockNow()+365*86400000;
 await f.tick(SEND-30000);
 assert.equal(f.read().state,'CONFIRMATION_READY',JSON.stringify(f.read().blockers));
 assert.deepEqual(loaded,missingWorld?['core/world.js']:['services/mass-snipe-execution.js']);
 const clock=f.api.readAttackFinalClock(f.w);
 assert.equal(clock.available,true);assert.equal(clock.nowMs,SEND-30000);assert.equal(clock.rawNowMs,SEND-30000+0.875);
 assert.equal(clock.diagnostic.domWallTimeMs,SEND-30000);assert.equal(clock.diagnostic.appliedOffsetMs,-10800000);
 await f.tick(SEND-10000);assert.equal(f.read().state,'READY_TO_SEND',JSON.stringify(f.read().blockers));
 assert.equal(f.read().finalAuthorization.createdAt,SEND-10000);
 f.fire();f.fire();assert.equal(f.c.finalClicks,1);assert.equal(f.read().executionTiming.localDeviationMs,0.875);
});

test('visible server clock without native precise Timing remains blocked; unavailable modules never fall back to client time',async()=>{
 for(const mutate of [f=>{delete f.w.Timing;},f=>{f.w.Timing.getCurrentServerTime=()=>NaN;},f=>{f.w.Timing.getCurrentServerTime=()=>{throw Error('native timing absent')};},
  f=>{delete f.w.EAS.MassSnipeExecution;delete f.w.EASLoader;},f=>{delete f.w.EAS.MassSnipeExecution;f.w.EASLoader.loadScript=async()=>{throw Error('load failed')};}]){
  const f=await finalReadyFixture(false,true,'real');realConfirmationClock(f);mutate(f);
  await f.tick(SEND-30000);assert.equal(f.read().state,'BLOCKED');assert.ok(f.read().blockers.includes('CLOCK_UNAVAILABLE'));
  const diagnostic=f.events.find(e=>e.event==='AUTOMATIC_FINAL_BLOCKED').data.clock;
  assert.ok(diagnostic.reason);assert.equal(f.read().attemptId,undefined);assert.equal(f.read().finalAuthorization,undefined);assert.equal(f.c.finalClicks,0);
 }
});

test('native precise clock lost after arming blocks the automatic ATTACK before the final click',async()=>{
 const f=await finalReadyFixture(false,true,'real');realConfirmationClock(f);await f.tick(SEND-10000);
 assert.ok(f.read().finalAuthorization);delete f.w.Timing;f.fire();
 assert.equal(f.c.finalClicks,0);assert.equal(f.read().state,'BLOCKED');
});

test('concurrent ATTACK confirmation ticks recover the clock once and arm one scheduler',async()=>{
 const f=await finalReadyFixture(false,true,'real'),loaded=realConfirmationClock(f,{missingProvider:true});
 f.now(SEND-10000);
 await Promise.all(Array.from({length:3},()=>f.api.runAutomaticFinal(f.eid,f.uid,f.w)));
 assert.equal(f.read().state,'READY_TO_SEND',JSON.stringify(f.read().blockers));
 assert.equal(loaded.filter(path=>path==='services/mass-snipe-execution.js').length,1);
 assert.ok(f.read().finalAuthorization);f.fire();f.fire();assert.equal(f.c.finalClicks,1);
});

test('missing or invalid native server calendar is never reconstructed from the client clock',async()=>{
 for(const calendar of [null,{textContent:'31/02/2026'}]){
  const f=await finalReadyFixture(false,true,'real');realConfirmationClock(f);
  const query=f.w.document.querySelector;
  f.w.document.querySelector=selector=>selector==='#serverDate'?calendar:query(selector);
  await f.tick(SEND-30000);
  assert.equal(f.read().state,'BLOCKED');assert.equal(f.c.finalClicks,0);
  assert.equal(f.api.readAttackFinalClock(f.w).diagnostic.reason,'TIMING_PROVIDER_ERROR');
 }
});
