const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/legacy-scheduler-export.json','utf8'));
const scope='br143:6562420',key='eas_tw_scheduler_v2';
function harness(input=fixture){
 const values=new Map([[key,JSON.stringify(input)]]);
 const storage={get length(){return values.size},key:i=>[...values.keys()][i]??null,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const EAS={World:{getWorldName:()=> 'br143',getPlayer:()=>({id:'6562420'})},ArrivalPlanner:{antiMissionValid:()=>true,log(){}}};
 const window={EAS,localStorage:storage,location:{hostname:'br143.tribalwars.com.br'},game_data:{world:'br143',player:{id:'6562420'}}};
 const ctx=vm.createContext({EAS,window,localStorage:storage,location:window.location,Date,console,URL,setTimeout,crypto:require('node:crypto').webcrypto});
 const reload=()=>{delete EAS.ArrivalExecution;for(const file of ['services/arrival-execution.js','services/mission-scheduler.js','services/tactical-operation-scheduler-adapter.js'])vm.runInContext(fs.readFileSync(file,'utf8'),ctx);};reload();
 const backup={key,raw:values.get(key)};
 const preview=mode=>EAS.TacticalOperationSchedulerAdapter.historyPreview({scope,mode:mode||'general'});
 const clean=(p=preview(),b=backup)=>EAS.TacticalOperationSchedulerAdapter.cleanHistory({scope,storage,preview:p,targetWindow:window,backup:b});
 return {values,storage,EAS,window,ctx,reload,backup,preview,clean};
}
const receiptKey=m=>`eas_tw_arrival_consumed:${m.world}:${m.playerId}:${m.id}:${m.attemptId}`;
test('real export: 7 unsent, 2 uncertain consumed, 1 proven; compact all with existing Arrival consumer and cold reload',async()=>{
 const h=harness(),original=fixture.contexts[scope],missions=original.missions;
 assert.equal(missions.length,10);assert.equal(missions.filter(m=>!m.finalClickConsumed).length,7);
 assert.equal(missions.filter(m=>m.finalClickConsumed&&!m.outgoingCommandId).length,2);
 assert.equal(missions.filter(m=>m.verification?.status==='proven'&&m.outgoingCommandId).length,1);
 assert.equal(h.preview('safe').eligible.length,0);assert.equal(h.preview('completed').eligible.length,1);assert.equal(h.preview().eligible.length,10);
 const result=await h.clean();assert.equal(result.success,true,JSON.stringify(result));assert.equal(result.removed,10);assert.ok(result.afterBytes<result.beforeBytes);
 const stored=JSON.parse(h.values.get(key)).contexts[scope];assert.deepEqual(stored.missions,[]);assert.deepEqual(stored.history,[]);
 assert.equal(Object.values(stored.tabExecutions).filter(t=>missions.some(m=>m.id===t.missionId)).length,0);
 assert.deepEqual(JSON.parse(h.values.get(key)).contexts['Desconhecido:0'],fixture.contexts['Desconhecido:0']);
 const receipts=missions.map(m=>JSON.parse(h.values.get(receiptKey(m))));
 assert.equal(receipts.filter(r=>r.outcome==='UNCERTAIN').length,2);assert.equal(receipts.filter(r=>r.outcome==='PROVEN_SUCCESS').length,1);
 assert.equal(receipts.filter(r=>r.outcome==='UNSENT_BLOCKED').length,7);
 for(const receipt of receipts){assert.equal(receipt.submitAuthorization,undefined);assert.equal(receipt.arrivalAuthorized,undefined);assert.equal(receipt.expiresAt,undefined);}
 h.reload();assert.equal(h.EAS.MissionScheduler.load().missions.length,0);
 for(const m of missions)assert.equal(h.EAS.ArrivalExecution.allowed({...m,mode:'arrival_attack',status:'ready',arrivalAuthorized:true,finalClickConsumed:false,submitAttemptId:null}),false);
 const again=await h.clean();assert.equal(again.success,true);assert.equal(again.removed,0);
 console.log(`Legacy fixture: ${result.beforeBytes} -> ${result.afterBytes} bytes; released ${result.beforeBytes-result.afterBytes}`);
});
test('no backup or unrecognized consumer: full history remains',async()=>{
 const h=harness(),before=h.values.get(key);assert.equal((await h.clean(h.preview(),null)).error,'LEGACY_EXACT_BACKUP_REQUIRED');assert.equal(h.values.get(key),before);
 h.EAS.ArrivalExecution.allowed=()=>true;const result=await h.clean();assert.equal(result.error,'LEGACY_RECEIPT_CONSUMER_UNPROVEN');assert.equal(h.values.get(key),before);
});
test('active, bound, divergent history and generic legacy consumers stay protected',()=>{
 const h=harness(),root=JSON.parse(h.values.get(key)),missions=root.contexts[scope].missions;
 missions[0].status='prepared';root.contexts[scope].activeMissionId=missions[1].id;
 root.contexts[scope].history.push({...missions[2],notes:'divergent'});missions[3].sourceModule='manual';
 h.values.set(key,JSON.stringify(root));const p=h.preview(),reasons=Object.fromEntries(p.protectedRecords.map(r=>[r.executionId,r.reason]));
 assert.equal(reasons[missions[0].id],'MISSION_ACTIVE');assert.equal(reasons[missions[1].id],'MISSION_EXECUTION_REFERENCE_ACTIVE');
 assert.equal(reasons[missions[2].id],'LEGACY_HISTORY_COPY_DIVERGED');assert.equal(reasons[missions[3].id],'LEGACY_SEND_EVIDENCE_DEDUPLICATION_UNPROVEN');
});
test('receipt/root write and read failures fail closed; recovery keeps receipt and full evidence until verified',async()=>{
 for(const fail of ['receipt-throw','receipt-silent','receipt-read','root-silent','root-throw','root-read']){
  const h=harness(),before=h.values.get(key),p=h.preview(),get=h.storage.getItem,set=h.storage.setItem;let wrote=false;
  h.storage.setItem=(k,v)=>{if(k===key&&fail==='root-throw'||k!==key&&fail==='receipt-throw')throw Error('quota');if(k===key&&fail==='root-silent'||k!==key&&fail==='receipt-silent')return;set(k,v);wrote=true;};
  h.storage.getItem=k=>{if(wrote&&(fail==='receipt-read'&&k!==key||fail==='root-read'&&k===key))throw Error('read-failed');return get(k);};
  const result=await h.clean(p);assert.equal(result.success,false,fail);
  if(fail!=='root-read')assert.equal(h.values.get(key),before,fail);
  h.storage.getItem=get;h.storage.setItem=set;const recovered=await h.clean();assert.equal(recovered.success,true,JSON.stringify(recovered));assert.equal(h.preview().eligible.length,0);
 }
});
test('existing consumed lock preserved and unrelated storage untouched',async()=>{
 const h=harness(),mission=fixture.contexts[scope].missions[1],unsent=fixture.contexts[scope].missions[0];h.values.set(receiptKey(mission),JSON.stringify({missionId:mission.id,attemptId:mission.attemptId,consumedAt:123}));h.values.set(receiptKey(unsent),JSON.stringify({missionId:unsent.id,attemptId:unsent.attemptId,consumedAt:456}));h.values.set('other-module','untouched');
 const result=await h.clean();assert.equal(result.success,true);assert.equal(JSON.parse(h.values.get(receiptKey(mission))).consumedAt,123);assert.equal(h.values.get('other-module'),'untouched');
 assert.equal(JSON.parse(h.values.get(receiptKey(unsent))).outcome,'UNCERTAIN');
});
test('provided original export: first JSON document migrates without rewriting the supplied file',{skip:!fs.existsSync('docs/eas_tw_scheduler_v2.json')},async()=>{
 const input=JSON.parse(fs.readFileSync('docs/eas_tw_scheduler_v2.json','utf8').replace(/^\uFEFF/,'').split(/\r?\n/)[0]);
 const h=harness(input),result=await h.clean();assert.equal(result.success,true,JSON.stringify(result));assert.equal(result.removed,10);
 console.log(`Original export: ${result.beforeBytes} -> ${result.afterBytes} bytes; released ${result.beforeBytes-result.afterBytes}`);
});
test('active mission survives a mixed batch; identity collision and stale preview cannot remove original',async()=>{
 const h=harness(),root=JSON.parse(h.values.get(key)),active=root.contexts[scope].missions[0];active.status='prepared';
 h.values.set(key,JSON.stringify(root));const result=await h.clean(h.preview(),{key,raw:h.values.get(key)});assert.equal(result.success,true);assert.equal(result.removed,9);
 assert.deepEqual(JSON.parse(h.values.get(key)).contexts[scope].missions,[active]);assert.equal(h.values.has(receiptKey(active)),false);
 const collision=harness(),mission=fixture.contexts[scope].missions[0];collision.values.set(receiptKey(mission),JSON.stringify({missionId:'other',attemptId:mission.attemptId}));
 assert.equal(collision.preview().protectedRecords.find(r=>r.executionId===mission.id).reason,'LEGACY_ARRIVAL_RECEIPT_CONFLICT');
 const stale=harness(),p=stale.preview(),changed=JSON.parse(stale.values.get(key));changed.contexts[scope].missions[0].status='prepared';stale.values.set(key,JSON.stringify(changed));
 assert.equal((await stale.clean(p)).error,'HISTORY_CONTEXT_CHANGED');assert.equal(JSON.parse(stale.values.get(key)).contexts[scope].missions.length,10);
});
