const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('core/rate-limit.js','utf8');
function fixture(storage=new Map(),text='',entries=[]){
 let observers=0,stops=0,callback;const listeners={},logs=[];
 const forbidden=()=>{throw Error('unexpected network or DOM mutation');};
 const root={name:'tab',document:{readyState:'complete',body:{textContent:text},addEventListener:(k,fn)=>listeners[k]=fn,removeEventListener:k=>delete listeners[k]},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},performance:{getEntriesByType:()=>entries},
 __easFakesAuto:{stop(){stops++;}},__EASLogger:{warn:(...x)=>logs.push(x)},
 fetch:forbidden,Image:forbidden,XMLHttpRequest:forbidden,navigator:{sendBeacon:forbidden},
 PerformanceObserver:class{constructor(fn){observers++;callback=fn;}observe(){}disconnect(){}}};
 const context=vm.createContext({window:root});const run=()=>vm.runInContext(source,context);run();
 return {root,run,storage,logs,observers:()=>observers,stops:()=>stops,emit:e=>callback({getEntries:()=>e})};
}
const state=()=>new Map([['eas_tw_fakes_execution',JSON.stringify({executionTab:'tab',currentIndex:0,queue:[{status:'pending'}],paused:false})]]);
const read=f=>JSON.parse(f.storage.get('eas_tw_fakes_execution'));
test('429 never resurrects a stopped Market execution, including legacy USER_STOP',()=>{
 for(const terminal of [{state:'cancelled',paused:false,finishedAt:123},{state:'paused',paused:true,pauseReason:'USER_STOP'}]){
  const key='eas_tw_market_offers_execution',record={batchAuthorization:{plan:'queue'},executionTab:'tab',revision:2,queue:[{attempt:{attemptId:'uncertain'}}],...terminal};
  const storage=new Map([[key,JSON.stringify(record)]]),f=fixture(storage);f.root.EASRateLimit.reportStatus(429);assert.deepEqual(JSON.parse(storage.get(key)),record);
 }
});
test('HTTP 429 persists Market batch pause before runtime bootstrap and preserves attempt',()=>{
 const key='eas_tw_market_offers_execution',attempt={attemptId:'offer-1',submitAt:123,beforeSnapshot:{matchingQuantity:0}};
 const storage=new Map([[key,JSON.stringify({batchAuthorization:{plan:'authorized'},executionTab:'tab',revision:2,queue:[{attempt}],currentIndex:0})]]);
 const f=fixture(storage);f.root.EASRateLimit.reportStatus(429);const actual=JSON.parse(storage.get(key));
 assert.equal(actual.state,'rate_limited');assert.equal(actual.paused,true);assert.deepEqual(actual.queue[0].attempt,attempt);assert.equal(actual.revision,3);
});
test('100 resumes reuse one passive observer and create no requests',()=>{const f=fixture(state());for(let i=0;i<100;i++){f.run();f.root.EASRateLimit.check();}assert.equal(f.observers(),1);assert.equal(read(f).paused,false);});
test('HTTP 429 pauses persistently, stops timers and never automatically recovers',()=>{const f=fixture(state());f.emit([{responseStatus:429}]);assert.equal(read(f).rateLimit.state,'RATE_LIMITED');assert.equal(read(f).paused,true);assert.ok(f.stops()>0);for(let i=0;i<100;i++)f.root.EASRateLimit.check();assert.equal(f.logs.length,1);assert.equal(f.root.EASRateLimit.resumeUnsent(),false);});
test('blocked game page pauses before runtime startup',()=>{const f=fixture(state(),'Solicita\u00e7\u00e3o bloqueada. Voc\u00ea est\u00e1 realizando muitos pedidos aos nossos servidores.');assert.equal(read(f).rateLimit.reason,'BLOCKED_PAGE');assert.equal(read(f).paused,true);});
test('navigation 429 can be detected without a response probe',()=>{const f=fixture(state(),'',[{responseStatus:429}]);assert.equal(read(f).rateLimit.reason,'HTTP_429');});
test('fresh healthy page permits explicit manual recovery of untouched command only',()=>{const a=fixture(state());a.root.EASRateLimit.reportStatus(429);const b=fixture(a.storage);assert.equal(b.root.EASRateLimit.check(),true);assert.equal(b.root.EASRateLimit.resumeUnsent(),true);assert.equal(read(b).paused,false);assert.equal(b.root.EASRateLimit.check(),false);});
test('uncertain confirmation identity survives rate limit and cannot be manually retried',()=>{const storage=state(),c=JSON.parse(storage.get('eas_tw_fakes_execution'));c.queue[0]={status:'confirming',confirmationAttempt:{attemptId:'a',state:'confirming',outgoingSnapshot:{beforeCommandIds:[]}}};storage.set('eas_tw_fakes_execution',JSON.stringify(c));const a=fixture(storage);a.root.EASRateLimit.reportStatus(429);const b=fixture(storage);assert.equal(b.root.EASRateLimit.resumeUnsent(),false);assert.deepEqual(read(b).queue[0],c.queue[0]);});
test('logger failure does not prevent rate-limit pause',()=>{const f=fixture(state());f.root.__EASLogger.warn=()=>{throw Error('log failure');};assert.doesNotThrow(()=>f.root.EASRateLimit.reportStatus(429));assert.equal(read(f).paused,true);});


test('429 without active execution logs locally and never raises a global alert',()=>{
 const f=fixture();f.root.alert=()=>{throw Error('global alert');};assert.doesNotThrow(()=>f.root.EASRateLimit.reportStatus(429));assert.equal(f.logs.length,1);assert.equal(f.storage.has('eas_tw_fakes_execution'),false);
});
