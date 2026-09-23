const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('core/logger.js','utf8');
function fixture(storage=new Map()){
 const listeners={},timers=new Map();let id=0,writes=0;
 const root={location:{href:'https://br143.tribalwars.com.br/game.php?screen=place&h=SECRET',host:'br143.tribalwars.com.br'},EASLocalBuild:{id:'test-build'},EAS:{version:'test'},
 localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{writes++;storage.set(k,v);},removeItem:k=>storage.delete(k)},setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:i=>timers.delete(i),addEventListener:(k,fn)=>{(listeners[k]||=[]).push(fn);},document:{addEventListener(){}}};
 const c=vm.createContext({window:root,URL,console});const run=()=>vm.runInContext(source,c);run();return{root,run,storage,listeners,timers,writes:()=>writes,api:root.EAS.Logger};
}
test('batched logs survive navigation and export has no authentication parameters',()=>{
 const a=fixture();a.api.info('FAKE','CONFIRM_SUBMIT',{attemptId:'a',url:'https://game/game.php?h=SECRET&screen=place',h:'SECRET'});
 assert.equal(a.writes(),0);a.listeners.pagehide[0]();assert.equal(a.writes(),1);
 const b=fixture(a.storage),d=b.api.exportDiagnostic();assert.ok(d.events.some(e=>e.event==='CONFIRM_SUBMIT'));assert.ok(!JSON.stringify(d).includes('SECRET'));assert.equal(d.buildId,'test-build');
});
test('circular values, throwing getters, bigint and huge data never throw',()=>{
 const f=fixture(),data={huge:'x'.repeat(100000),big:1n};data.self=data;Object.defineProperty(data,'bad',{enumerable:true,get(){throw Error('bad');}});
 assert.doesNotThrow(()=>f.api.info('CORE','DATA',data));assert.doesNotThrow(()=>f.api.flush());assert.ok(f.storage.get('eas_tw_diagnostics_v1').length<180001);
});
test('quota failure remains bounded and does not throw or loop; old data expires',()=>{
 const f=fixture();f.root.localStorage.setItem=()=>{throw Error('quota');};for(let i=0;i<1000;i++)f.api.info('CORE','EVENT',{i});
 assert.doesNotThrow(()=>f.api.flush());assert.ok(f.api.entries().length<=300);assert.equal(f.api.exportDiagnostic().storageError,'LOG_STORAGE_UNAVAILABLE');assert.ok(f.timers.size<=1);
 const s=new Map([['eas_tw_diagnostics_v1',JSON.stringify([{id:'old',timestamp:1}])]]);assert.ok(!fixture(s).api.entries().some(e=>e.id==='old'));
});
test('duplicate bootstrap does not duplicate listeners; global errors capped; export detached',()=>{
 const f=fixture();f.run();assert.equal(f.listeners.pagehide.length,1);for(let i=0;i<100;i++)f.listeners.error[0]({message:'boom'});
 const d=f.api.exportDiagnostic();assert.equal(d.events.filter(e=>e.module==='GLOBAL').length,20);d.events.length=0;assert.ok(f.api.entries().length>0);
});


test('100 logger bootstraps and exports produce only local storage writes',()=>{
 const f=fixture(),deny=()=>{throw Error('logger network');};f.root.fetch=deny;f.root.Image=deny;f.root.XMLHttpRequest=deny;f.root.navigator={sendBeacon:deny};f.root.document.createElement=deny;
 for(let i=0;i<100;i++){f.run();f.api.info('CORE','LOCAL',{});f.api.exportDiagnostic();}assert.equal(f.listeners.pagehide.length,1);assert.ok(f.writes()>0);
});
