const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){
 const data=new Map();let fail=false,clicks=0,navigations=0;
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('quota');data.set(k,v)},removeItem:k=>data.delete(k)};
 const w={document:{},location:{href:'https://br143.tribalwars.com.br/game.php?screen=market&mode=send',assign:()=>navigations++},setTimeout:()=>0,clearTimeout(){},clearInterval(){},open:()=>{clicks++},game_data:{village:{id:1}}};
 const EAS={Data:{Market:{refresh:async()=>{},get:()=>({movements:{}})}}};
 const ctx=vm.createContext({EAS,window:w,localStorage:storage,location:{origin:'https://br143.tribalwars.com.br'},URL,console:{debug(){}}});
 vm.runInContext(fs.readFileSync('services/market-balance-execution.js','utf8'),ctx);
 return {api:EAS.MarketBalanceExecution,data,w,fail:()=>fail=true,clicks:()=>clicks,navigations:()=>navigations};
}
test('uncertain balance remains durable without automatic navigation or retry',async()=>{
 const f=fixture(),item={id:'one',status:'submitting',confirmationSendClicked:true},execution={queue:[item],currentIndex:0};f.api.save(execution);
 const result=await f.api.reconcileSubmittedTransport(execution,item,f.w);
 assert.equal(result.retrySafe,false);assert.equal(f.navigations(),0);assert.equal(f.api.read().queue[0].confirmationSendClicked,true);
});
test('balance retires proven execution only with durable deduplication receipt; legacy stays',()=>{
 const f=fixture(),item={status:'sent',sourceVillageId:1,targetVillageId:2,wood:3,stone:4,iron:5,execution:{successDetectedAt:1}};
 const execution={lifecycleVersion:1,queue:[item],currentIndex:1};f.api.save(execution);f.api.continueExecution(execution,f.w);assert.ok(f.api.read());
 f.data.set(f.api.HISTORY_KEY,JSON.stringify([{...item,result:'reconciled-sent'}]));f.api.continueExecution(execution,f.w);assert.equal(f.api.read(),null);assert.ok(f.data.has(f.api.HISTORY_KEY));
 delete execution.lifecycleVersion;f.api.save(execution);f.api.continueExecution(execution,f.w);assert.ok(f.api.read());
});
test('balance refuses new execution under quota before opening any window',()=>{
 const f=fixture();f.fail();assert.throws(()=>f.api.start({queue:[{sourceVillageId:1}]}),/PERSISTENCE/);assert.equal(f.clicks(),0);
});

test('completed legacy balance cannot be overwritten by a new plan',()=>{
 const f=fixture(),legacy={status:'completed',queue:[{status:'sent'}]};f.api.save(legacy);const before=f.data.get(f.api.STORAGE_KEY);
 assert.throws(()=>f.api.start({queue:[{sourceVillageId:1}]}),/ACTIVE_EXECUTION/);assert.equal(f.data.get(f.api.STORAGE_KEY),before);assert.equal(f.clicks(),0);
});
