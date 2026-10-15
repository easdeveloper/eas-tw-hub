const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const KEY='eas_tw_market_offers_execution';
function fixture(){
 const data=new Map();let failRemove=false;
 const storage={get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>{if(failRemove)throw Error('remove denied');data.delete(k)}};
 const w={document:{},name:'',location:{href:'https://br143.tribalwars.com.br/game.php?screen=market&mode=own_offer'},EASLocalBuild:{execute(){}},navigator:{locks:{request:async()=>false}},setTimeout(){},clearTimeout(){}};
 const box={EAS:{MarketEngine:{calculateMerchantsRequired:()=>1}},window:w,localStorage:storage,Date,URL,console};vm.createContext(box);
 for(const p of ['core/storage.js','services/market-offers-execution.js','services/market-offers-batch.js'])vm.runInContext(fs.readFileSync(p,'utf8'),box);
 return {data,storage,api:box.EAS.MarketOffersExecution,batch:box.EAS.MarketOffersBatch,failRemove:()=>failRemove=true};
}
const completed=()=>({version:3,executionId:'market-batch:1791000562942:0.8281477908919493',state:'completed',currentIndex:39,pauseReason:null,finishedAt:1,revision:40,batchAuthorization:{authorizedAt:1},queue:Array.from({length:39},(_,i)=>({id:String(i),status:'created',offerId:String(i+100),attempt:{state:'completed',submitAt:1},confirmation:{evidence:'new-compatible-offer-id'}}))});
const input={queue:[{villageId:'9',offerResource:'iron',requestResource:'wood',offerAmount:1000,requestAmount:1000,repeatCount:1}]};
test('BR143 proven 39/39 is retired before a fresh batch; protected records stay byte-for-byte',()=>{
 const f=fixture();f.data.set(KEY,JSON.stringify(completed()));
 for(const key of ['eas_tw_market_offers_history','eas_tw_market_balance_history','eas_tw_market_offers_archive:legacy','eas_tw_tactical_scheduler_v1'])f.data.set(key,'PROTECTED');
 const next=f.batch.start(input);assert.notEqual(next.executionId,completed().executionId);assert.equal(f.api.read().executionId,next.executionId);assert.equal(f.api.read().currentIndex,0);assert.equal(f.api.read().revision,1);assert.equal(f.api.read().lifecycleVersion,1);
 for(const [key,value] of f.data)if(key!==KEY)assert.equal(value,'PROTECTED');
});
for(const [reason,change] of [
 ['OFFER_ID_MISSING',c=>delete c.queue[38].offerId],
 ['CONFIRMATION_MISSING',c=>delete c.queue[38].confirmation],
 ['ATTEMPT_UNRECONCILED',c=>c.queue[38].attempt.state='submitted'],
 ['FAILURE_EVIDENCE',c=>c.queue[38].attempt.failureEvidence={reason:'uncertain'}],
 ['COMPLETION_UNPROVEN',c=>delete c.finishedAt],
 ['ACTIVE_LOCK',c=>c.lock={owner:'other-tab'}],
 ['ITEM_UNRECONCILED',c=>{c.queue[38].status='skipped';c.queue[38].manualResolution={outcome:'error'}}]
])test('terminal counters cannot bypass '+reason,()=>{
 const f=fixture(),old=completed();change(old);const raw=JSON.stringify(old);f.data.set(KEY,raw);
 assert.throws(()=>f.batch.start(input),new RegExp(reason));assert.equal(f.data.get(KEY),raw);
 assert.equal(f.api.save({executionId:'new',version:3,queue:[]}),false);assert.match(f.api.lastSaveFailure,new RegExp(reason));assert.equal(f.data.get(KEY),raw);
});
test('real same-execution revision conflict stays STORAGE_CONTEXT_CHANGED',()=>{
 const f=fixture(),old=completed();f.data.set(KEY,JSON.stringify(old));assert.equal(f.api.save({...old,revision:39}),false);assert.equal(f.api.lastSaveFailure,'STORAGE_CONTEXT_CHANGED');assert.equal(f.api.read().revision,40);
});
test('concurrent context replacement between inspection and retirement is preserved',()=>{
 const f=fixture(),old=completed();f.data.set(KEY,JSON.stringify(old));let reads=0;
 const other={...old,executionId:'other-tab',state:'running'};const original=f.storage.getItem;
 f.storage.getItem=k=>{if(k===KEY&&++reads===2)f.data.set(KEY,JSON.stringify(other));return original(k)};
 assert.equal(f.api.prepareNewExecution().reason,'STORAGE_CONTEXT_CHANGED');assert.equal(f.api.read().executionId,'other-tab');
});
test('failed retirement blocks start and leaves old evidence intact',()=>{
 const f=fixture(),raw=JSON.stringify(completed());f.data.set(KEY,raw);f.failRemove();assert.throws(()=>f.batch.start(input),/PREVIOUS_MARKET_EXECUTION_BLOCKED/);assert.equal(f.data.get(KEY),raw);
});
test('direct save also retires the proven old context before replacing it',()=>{
 const f=fixture();f.data.set(KEY,JSON.stringify(completed()));let removed=false;const original=f.storage.removeItem;
 f.storage.removeItem=k=>{if(k===KEY)removed=true;original(k)};
 assert.equal(f.api.save({version:3,executionId:'new',batchAuthorization:{authorizedAt:2},revision:0,queue:[]}),true);assert.equal(removed,true);assert.equal(f.api.lastSaveFailure,null);
});

function historicalDiagnostic(){
 const context=completed(),item=context.queue[37];
 Object.assign(item,{villageId:'9',offerResource:'iron',requestResource:'wood',offerAmount:1000,requestAmount:1000,repeatCount:1,maxTravelHours:15,
  createdAt:3,error:null,diagnostic:{lastEvent:'smart-offer-form-values-applied'},diagnosticEvents:[{event:'historical-error'}]});
 const itemIdentity=JSON.stringify([item.id,'9','iron','wood',1000,1000,1,15]);
 Object.assign(item.attempt,{attemptId:'attempt-38',executionId:context.executionId,itemId:item.id,sourceVillageId:'9',itemIdentity,
  beforeSnapshot:{available:true,executionId:context.executionId,itemId:item.id,attemptId:'attempt-38',sourceVillageId:'9',itemIdentity,offerIds:['12']},
  failureEvidence:{recordedAt:2,reason:'STORAGE_CONTEXT_CHANGED',gameError:null,afterSnapshot:{available:true,sourceVillageId:'9',offerIds:['12']}}});
 item.confirmation={success:true,uncertain:false,reason:'NEW_COMPATIBLE_OFFER_ID',evidence:'new-compatible-offer-id',offerId:item.offerId};
 return context;
}
test('BR143 item 38 historical persistence diagnostic is superseded by bound individual reconciliation',()=>{
 const f=fixture(),context=historicalDiagnostic(),raw=JSON.stringify(context);f.data.set(KEY,raw);
 assert.equal(f.api.prepareNewExecution().allowed,true);assert.equal(f.data.has(KEY),false);
 assert.equal(JSON.stringify(context),raw);const next=f.batch.start(input);assert.equal(f.api.read().executionId,next.executionId);
});
for(const [field,change] of [
 ['attempt.failureEvidence.gameError',i=>i.attempt.failureEvidence.gameError='Erro do jogo'],
 ['attempt.failureEvidence.reason',i=>i.attempt.failureEvidence.reason='NO_NEW_OFFER_TIMEOUT'],
 ['attempt.failureEvidence.uncertain',i=>i.attempt.failureEvidence.uncertain=true],
 ['attempt.failureEvidence.recordedAt',i=>i.attempt.failureEvidence.recordedAt=4],
 ['attempt.failureEvidence.afterSnapshot',i=>i.attempt.failureEvidence.afterSnapshot.offerIds.push('999')],
 ['attempt.beforeSnapshot',i=>i.attempt.beforeSnapshot.attemptId='other-attempt'],
 ['attempt.beforeSnapshot',i=>i.attempt.beforeSnapshot.offerIds.push(i.offerId)],
 ['attempt.beforeSnapshot',i=>i.offerAmount=2000],
 ['item.confirmation.success',i=>i.confirmation.success=false],
 ['item.confirmation.uncertain',i=>i.confirmation.uncertain=true],
 ['item.confirmation.offerId',i=>i.confirmation.offerId='other'],
 ['item.confirmation.reason',i=>i.confirmation.reason='MULTIPLE_NEW_OFFERS'],
 ['item.confirmation',i=>delete i.confirmation.success],
 ['item.error',i=>i.error='unresolved error'],
 ['attempt.revokedAt',i=>i.attempt.revokedAt=2]
])test('item 38 contradiction blocks and identifies '+field,()=>{
 const f=fixture(),context=historicalDiagnostic();change(context.queue[37]);const raw=JSON.stringify(context);f.data.set(KEY,raw);
 const result=f.api.prepareNewExecution();assert.equal(result.allowed,false);assert.ok(result.reason.includes(field),result.reason);assert.match(result.reason,/item 38/);assert.equal(f.data.get(KEY),raw);
});
test('diagnostic fields alone do not block proven success',()=>{
 const f=fixture(),context=historicalDiagnostic();delete context.queue[37].attempt.failureEvidence;f.data.set(KEY,JSON.stringify(context));assert.equal(f.api.prepareNewExecution().allowed,true);
});

test('all 39 original created states pass the same bound reconciliation criterion',()=>{
 const f=fixture(),context=completed();
 context.queue=Array.from({length:39},(_,index)=>{
  const source=historicalDiagnostic(),item=source.queue[37];
  item.id=String(index);item.offerId=String(100+index);item.confirmation.offerId=item.offerId;
  item.attempt.itemId=item.id;item.attempt.attemptId=`attempt-${index}`;
  item.attempt.itemIdentity=JSON.stringify([item.id,String(item.villageId),item.offerResource,item.requestResource,item.offerAmount,item.requestAmount,item.repeatCount,item.maxTravelHours]);
  Object.assign(item.attempt.beforeSnapshot,{itemId:item.id,attemptId:item.attempt.attemptId,itemIdentity:item.attempt.itemIdentity});
  return item;
 });
 f.data.set(KEY,JSON.stringify(context));assert.equal(f.api.prepareNewExecution().allowed,true);assert.equal(f.data.has(KEY),false);
});
test('displayed item 38 identifies queue[37], not the created offer at queue[38]',()=>{
 const f=fixture(),context=completed();context.queue[37]={id:'unresolved-38',status:'skipped',attempt:{state:'submitted',submitAt:1}};
 const raw=JSON.stringify(context);f.data.set(KEY,raw);const result=f.api.prepareNewExecution();
 assert.equal(result.allowed,false);assert.match(result.reason,/item 38/);assert.match(result.reason,/status="skipped"/);assert.match(result.reason,/queueIndex=37/);assert.match(result.reason,/itemId="unresolved-38"/);
 assert.deepEqual(JSON.parse(JSON.stringify(result.blockers)),[{queueIndex:37,itemNumber:38,itemId:'unresolved-38',status:'skipped',reason:'ITEM_UNRECONCILED: item.status'}]);
 assert.equal(f.data.get(KEY),raw);assert.equal(f.api.read().queue[38].status,'created');
});
test('every queue position remains blocked without individual confirmation, regardless of final counters',()=>{
 for(let index=0;index<39;index++){
  const f=fixture(),context=completed();delete context.queue[index].confirmation;
  const raw=JSON.stringify(context);f.data.set(KEY,raw);const result=f.api.prepareNewExecution();
  assert.equal(result.allowed,false);assert.equal(result.blockers[0].queueIndex,index);assert.equal(result.blockers[0].itemNumber,index+1);
  assert.match(result.reason,/CONFIRMATION_MISSING/);assert.equal(f.data.get(KEY),raw);
 }
});
test('diagnostic reports all blocked items without changing the stored execution',()=>{
 const f=fixture(),context=completed();delete context.queue[0].offerId;context.queue[37].status='pending';context.queue[38].attempt.state='submitted';
 const raw=JSON.stringify(context);f.data.set(KEY,raw);const result=f.api.prepareNewExecution();
 assert.deepEqual(Array.from(result.blockers,row=>row.queueIndex),[0,37,38]);assert.equal(result.executionId,context.executionId);assert.equal(f.data.get(KEY),raw);
});
