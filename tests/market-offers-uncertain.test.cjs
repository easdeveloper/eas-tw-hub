const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const KEY='eas_tw_market_offers_execution',PREFIX='eas_tw_market_offers_uncertain:';
function fixture(){
 const data=new Map();let failWrite=false,ignoreWrite=false,failRemove=false,clicks=0;
 const storage={get length(){return data.size},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,
 setItem:(k,v)=>{if(failWrite&&k.startsWith(PREFIX))throw Error('quota');if(!(ignoreWrite&&k.startsWith(PREFIX)))data.set(k,v)},removeItem:k=>{if(failRemove&&k===KEY)throw Error('remove failed');data.delete(k)}};
 const w={document:{},name:'',game_data:{world:'br143',village:{id:9}},location:{href:'https://br143.tribalwars.com.br/game.php?screen=market&mode=own_offer&village=9'},
 EASLocalBuild:{execute(){}},navigator:{locks:{request:async()=>false}},setTimeout(){},clearTimeout(){}};
 const box={EAS:{MarketEngine:{calculateMerchantsRequired:()=>1}},window:w,localStorage:storage,Date,URL,console};vm.createContext(box);
 const load=()=>{for(const p of ['core/storage.js','services/market-offers-execution.js','services/market-offers-batch.js'])vm.runInContext(fs.readFileSync(p,'utf8'),box)};load();
 return {data,storage,w,box,load,api:()=>box.EAS.MarketOffersExecution,batch:()=>box.EAS.MarketOffersBatch,
 failWrite:()=>failWrite=true,ignoreWrite:()=>ignoreWrite=true,failRemove:()=>failRemove=true,click:()=>clicks++,clicks:()=>clicks};
}
function context(){
 const c={version:3,state:'completed',executionId:'old-br143',currentIndex:39,finishedAt:20,batchAuthorization:{authorizedAt:1},queue:Array.from({length:39},(_,i)=>({id:String(i),status:'created',offerId:String(100+i),attempt:{state:'completed'},confirmation:{evidence:'new-compatible-offer-id'}}))};
 const item={id:'item-38',villageId:'9',offerResource:'iron',requestResource:'wood',offerAmount:1000,requestAmount:1000,amountPerOffer:1000,requestAmountPerOffer:1000,repeatCount:2,maxTravelHours:15,
 status:'skipped',error:'O jogo indicou erro apos envio. Verifique o resultado; nao reenviar.',diagnostic:{large:'x'.repeat(10000)},diagnosticEvents:[{large:'x'.repeat(10000)}]};
 const itemIdentity=JSON.stringify([item.id,'9','iron','wood',1000,1000,2,15]);
 item.attempt={attemptId:'attempt-38',executionId:c.executionId,itemId:item.id,sourceVillageId:'9',itemIdentity,state:'manually-skipped',submitAt:10,revokedAt:15,
 beforeSnapshot:{available:true,offerIds:['12'],executionId:c.executionId,itemId:item.id,sourceVillageId:'9',itemIdentity,attemptId:'attempt-38'},failureEvidence:{gameError:'unknown result'}};
 item.manualResolution={outcome:'error',action:'mark-error-and-skip',executionId:c.executionId,itemId:item.id,attemptId:'attempt-38',decidedAt:15};
 c.queue[37]=item;return c;
}
const input=villageId=>({queue:[{villageId,offerResource:'iron',requestResource:'wood',offerAmount:1000,requestAmount:1000,repeatCount:2,maxTravelHours:15}]});
test('BR143 retains only a durable minimal uncertainty guard before dropping the completed full queue',()=>{
 const f=fixture(),c=context();f.data.set(KEY,JSON.stringify(c));f.data.set('eas_tw_tactical_scheduler_v1','PROTECTED');f.data.set('eas_tw_market_offers_history','PROTECTED');
 let durableAtRemove=false;const remove=f.storage.removeItem;f.storage.removeItem=k=>{if(k===KEY)durableAtRemove=f.api().readUncertainAttempts().length===1;remove(k)};
 assert.equal(f.api().prepareNewExecution().allowed,true);assert.equal(durableAtRemove,true);assert.equal(f.data.has(KEY),false);
 const guard=f.api().readUncertainAttempts()[0];assert.equal(guard.state,'uncertain');assert.equal(guard.attemptId,'attempt-38');assert.equal(guard.villageId,'9');assert.equal(guard.submittedAt,10);assert.equal(guard.offerAmount,1000);assert.equal(guard.repeatCount,2);
 assert.ok(JSON.stringify(guard).length<2048);for(const key of ['queue','diagnostic','diagnosticEvents','failureEvidence','batchAuthorization'])assert.equal(Object.hasOwn(guard,key),false);
 assert.equal(f.data.get('eas_tw_tactical_scheduler_v1'),'PROTECTED');assert.equal(f.data.get('eas_tw_market_offers_history'),'PROTECTED');assert.equal(f.clicks(),0);
 f.load();assert.equal(f.api().readUncertainAttempts()[0].attemptId,'attempt-38');
 assert.equal(f.api().save(c),false);assert.equal(f.data.has(KEY),false); // A stale tab cannot resurrect the retired queue.
});
for(const mode of ['quota','readback','remove'])test(mode+' failure keeps the full old context and duplicate protection',()=>{
 const f=fixture(),raw=JSON.stringify(context());f.data.set(KEY,raw);if(mode==='quota')f.failWrite();if(mode==='readback')f.ignoreWrite();if(mode==='remove')f.failRemove();
 assert.equal(f.api().prepareNewExecution().allowed,false);assert.equal(f.data.get(KEY),raw);assert.equal(f.clicks(),0);
});
test('uncertain village cannot enter batch, direct save or native submission, but another village can',()=>{
 const f=fixture();f.data.set(KEY,JSON.stringify(context()));assert.equal(f.api().prepareNewExecution().allowed,true);
 assert.throws(()=>f.batch().start(input('9')),/UNCERTAIN_MARKET_ATTEMPT/);
 assert.equal(f.api().save({executionId:'new',queue:input('9').queue}),false);assert.match(f.api().lastSaveFailure,/UNCERTAIN_MARKET_ATTEMPT/);
 let commits=0;assert.equal(f.api().submitPreparedOffer({context:{},item:input('9').queue[0],prepared:{submit:{click:f.click}},commit:()=>{commits++;return true}}).sent,false);assert.equal(commits,0);assert.equal(f.clicks(),0);
 const next=f.batch().start(input('10'));assert.equal(f.api().read().executionId,next.executionId);assert.equal(f.api().readUncertainAttempts().length,1);
 assert.ok(f.api().findUncertainConflict({...input('9').queue[0],offerAmount:999}));
});
test('corrupt guard fails closed and is never discarded',()=>{
 const f=fixture();f.data.set(PREFIX+'bad','CORRUPT');assert.equal(f.api().prepareNewExecution().allowed,false);assert.throws(()=>f.batch().start(input('10')));assert.equal(f.data.get(PREFIX+'bad'),'CORRUPT');
});
test('missing identity or another unresolved item prevents any compaction',()=>{
 for(const change of [c=>delete c.queue[37].attempt.itemIdentity,c=>c.queue[0].status='pending',c=>c.lock={held:true},c=>c.state='running',c=>c.queue[37].offerId='conflicting',c=>c.queue[37].confirmation={uncertain:true}]){
  const f=fixture(),c=context();change(c);const raw=JSON.stringify(c);f.data.set(KEY,raw);assert.equal(f.api().prepareNewExecution().allowed,false);assert.equal(f.data.get(KEY),raw);assert.equal(f.api().readUncertainAttempts().length,0);
 }
});
test('concurrent root change never removes the changed execution; written guard stays protective',()=>{
 const f=fixture(),c=context();f.data.set(KEY,JSON.stringify(c));const set=f.storage.setItem;
 f.storage.setItem=(k,v)=>{set(k,v);if(k.startsWith(PREFIX))f.data.set(KEY,JSON.stringify({...c,revision:999}))};
 assert.equal(f.api().prepareNewExecution().reason,'STORAGE_CONTEXT_CHANGED');assert.equal(f.api().read().revision,999);assert.ok(f.api().findUncertainConflict(input('9').queue[0]));
});
test('partial failure with two uncertain attempts loses neither context nor existing receipts',()=>{
 const f=fixture(),c=context(),second=JSON.parse(JSON.stringify(c.queue[37]));second.id='item-39';second.attempt.attemptId='attempt-39';second.attempt.itemId=second.id;second.manualResolution.itemId=second.id;second.manualResolution.attemptId='attempt-39';
 second.attempt.itemIdentity=JSON.stringify([second.id,'9','iron','wood',1000,1000,2,15]);c.queue[38]=second;const raw=JSON.stringify(c);f.data.set(KEY,raw);
 const set=f.storage.setItem;f.storage.setItem=(k,v)=>{if(k===PREFIX+'attempt-39')throw Error('quota');set(k,v)};
 assert.equal(f.api().prepareNewExecution().allowed,false);assert.equal(f.data.get(KEY),raw);assert.equal(f.api().readUncertainAttempts().length,1);
 f.storage.setItem=set;assert.equal(f.api().prepareNewExecution().allowed,true);assert.equal(f.api().readUncertainAttempts().length,2);
});
function currentPage(f,ids){
 const node=id=>({id:'offer_'+id,dataset:{offerResource:'iron',offerAmount:'1000'},getAttribute:key=>({'data-id':id,'data-count':'2','data-offer-resource':'iron','data-offer-amount':'1000','data-wanted_wood':'1000','data-wanted_stone':'0','data-wanted_iron':'0'}[key]??null),querySelector:()=>null,querySelectorAll:()=>[]});
 f.w.document={readyState:'complete',querySelector:selector=>selector.includes('#own_offers_table')?{}:null,querySelectorAll:selector=>selector==='tr.offer_container'?ids.map(node):[]};
}
test('current own-offer DOM reconciles one compatible new ID without submitting',()=>{
 const f=fixture();f.data.set(KEY,JSON.stringify(context()));currentPage(f,['12','999']);assert.equal(f.api().prepareNewExecution().allowed,true);
 const guard=f.api().readUncertainAttempts()[0];assert.equal(guard.state,'reconciled');assert.equal(guard.offerId,'999');assert.equal(f.api().findUncertainConflict(input('9').queue[0]),null);assert.equal(f.clicks(),0);
 assert.ok(f.api().findUncertainConflict({villageId:'10',attempt:{attemptId:'attempt-38'}}));
});
test('multiple new IDs or an ID already assigned to another item cannot resolve uncertainty',()=>{
 for(const ids of [['12','998','999'],['12','100']]){const f=fixture();f.data.set(KEY,JSON.stringify(context()));currentPage(f,ids);assert.equal(f.api().prepareNewExecution().allowed,true);assert.equal(f.api().readUncertainAttempts()[0].state,'uncertain');assert.equal(f.clicks(),0)}
});
test('one observed ID cannot resolve two uncertain attempts',()=>{
 const f=fixture(),c=context(),second=JSON.parse(JSON.stringify(c.queue[37]));second.id='item-39';second.attempt.attemptId='attempt-39';second.attempt.itemId=second.id;
 second.attempt.itemIdentity=JSON.stringify([second.id,'9','iron','wood',1000,1000,2,15]);Object.assign(second.attempt.beforeSnapshot,{itemId:second.id,attemptId:second.attempt.attemptId,itemIdentity:second.attempt.itemIdentity});
 Object.assign(second.manualResolution,{itemId:second.id,attemptId:second.attempt.attemptId});c.queue[38]=second;f.data.set(KEY,JSON.stringify(c));currentPage(f,['12','999']);
 assert.equal(f.api().prepareNewExecution().allowed,true);assert.ok(f.api().readUncertainAttempts().every(record=>record.state==='uncertain'));assert.equal(f.api().readUncertainAttempts().length,2);
});
test('maintenance never expires uncertainty guards or reopens their attempts',()=>{
 const f=fixture();f.data.set(KEY,JSON.stringify(context()));f.api().prepareNewExecution();const before=f.data.get(PREFIX+'attempt-38');
 f.box.EAS.Storage.lifecycle.maintain();assert.equal(f.data.get(PREFIX+'attempt-38'),before);f.load();assert.throws(()=>f.batch().start(input('9')),/UNCERTAIN_MARKET_ATTEMPT/);
});
