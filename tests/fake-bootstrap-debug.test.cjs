const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture(){
 const saved=new Map([['eas_tw_fakes_execution',JSON.stringify({executionTab:'fake-tab',currentIndex:1,queue:[{villageId:9,target:'501|501',status:'completed'},{villageId:9,target:'502|502',status:'attacking'}]})]]);
 const logs=[],scripts=[];let clicks=0;
 const button={disabled:false,value:'Enviar ataque',click(){clicks++;}};
 const form={querySelector:()=>button};
 const doc={readyState:'loading',querySelector:s=>s==='#command-data-form'?form:null,getElementById:()=>null,
 addEventListener(){},createElement:()=>({dataset:{},style:{},remove(){}}),head:{appendChild(n){scripts.push(n);}},body:{appendChild(){}},documentElement:{appendChild(){}}};
 const root={name:'fake-tab',location:{href:'https://br123.tribalwars.com.br/game.php?village=9&screen=place&try=confirm'},document:doc,
 localStorage:{getItem:k=>saved.get(k)||null,setItem(){throw Error('unexpected storage write');},removeItem(){throw Error('unexpected storage delete');}},
 addEventListener(){},removeEventListener(){},dispatchEvent(){},setTimeout:()=>1,clearTimeout(){},__EAS_TW_BOOTSTRAPPED__:true,EAS_TW_LOADER_AUTOSTART:false};
 const sandbox={window:root,location:root.location,document:doc,localStorage:root.localStorage,URL,console:{log:(...args)=>logs.push(args),info(){},debug(){},error(){}},setTimeout:()=>1,clearTimeout(){},navigator:{maxTouchPoints:0,userAgent:'test'},screen:{width:1200},innerWidth:1200,CustomEvent:class{}};
 vm.createContext(sandbox);
 return {root,sandbox,saved,scripts,logs,run:file=>vm.runInContext(fs.readFileSync(file,'utf8'),sandbox),clicks:()=>clicks};
}
for(const file of ['loader.js','eas-tw-loader.user.js','index.js'])test(`${file}: helper is available before dependencies, guards or DOM ready`,()=>{
 const f=fixture();f.run(file);assert.equal(typeof f.root.EASFakeDebug,'function');
 const before=JSON.stringify([...f.saved]),marker=JSON.stringify(f.root.EASFakeBootstrapDebug);
 const data=f.root.EASFakeDebug();assert.equal(data.executionFound,true);assert.equal(data.currentCommandId,'1:9:502|502');assert.equal(data.blockedReason,'FAKE_MODULE_NOT_INITIALIZED');assert.equal(data.buttonFound,true);
 data.bootstrap.loaded=false;data.currentCommand.status='completed';
 assert.equal(JSON.stringify([...f.saved]),before);assert.equal(JSON.stringify(f.root.EASFakeBootstrapDebug),marker);assert.equal(f.clicks(),0);assert.equal(f.scripts.length,0);
});
test('userscript exposes diagnostics on unsafeWindow, not the isolated userscript window',()=>{
 const f=fixture();f.sandbox.unsafeWindow=f.root;f.sandbox.window={};f.run('eas-tw-loader.user.js');assert.equal(typeof f.root.EASFakeDebug,'function');assert.equal(f.sandbox.window.EASFakeDebug,undefined);
});
test('bundle network failure leaves a working early diagnostic',()=>{
 const f=fixture();f.root.__EAS_TW_BOOTSTRAPPED__=false;f.run('eas-tw-loader.user.js');assert.equal(f.scripts.length,1);f.scripts[0].onerror();
 assert.equal(f.root.EASFakeDebug().bootstrap.bundleError,true);assert.equal(f.root.EASFakeDebug().bootstrap.fakeModuleInitialized,false);
});
test('fresh page has no marker until a loader executes; previous page markers are not reused',()=>{
 const first=fixture();first.run('index.js');const next=fixture();assert.equal(next.root.EASFakeDebug,undefined);assert.equal(next.root.EASFakeBootstrapDebug,undefined);next.run('index.js');assert.notEqual(next.root.EASFakeBootstrapDebug,first.root.EASFakeBootstrapDebug);
});
test('module failure before initialization retains the early helper and reached marker',()=>{
 const f=fixture();f.run('index.js');assert.throws(()=>f.run('services/fakes-execution.js'),/EAS/);
 const data=f.root.EASFakeDebug();assert.equal(data.bootstrap.fakeModuleReached,true);assert.equal(data.bootstrap.fakeModuleInitialized,false);assert.equal(data.blockedReason,'FAKE_MODULE_NOT_INITIALIZED');
});
test('initialized module, resume and confirmation are separate diagnostic stages',()=>{
 const f=fixture();f.run('index.js');f.sandbox.EAS={};f.root.EAS=f.sandbox.EAS;f.run('services/fakes-execution.js');
 let marker=f.root.EASFakeDebug().bootstrap;assert.equal(marker.fakeModuleInitialized,true);assert.equal(marker.resumeEntered,false);assert.equal(marker.confirmationHandlerEntered,false);
 f.root.EAS.FakesExecution.resume();marker=f.root.EASFakeDebug().bootstrap;assert.equal(marker.resumeEntered,true);assert.equal(marker.confirmationHandlerEntered,true);assert.equal(f.clicks(),0);
});
test('silent existing-UI path is diagnosed without loading the missing Fake module',async()=>{
 const f=fixture();f.root.document.readyState='complete';f.root.__EAS_TW_SILENT_BOOTSTRAP__=true;
 f.root.EAS={UI:{toggle(){},FloatingPanel:{initialize(){}}},Minting:{},MissionScheduler:{initialize(){}}};
 f.run('index.js');await new Promise(resolve=>setImmediate(resolve));
 const data=f.root.EASFakeDebug();assert.equal(data.bootstrap.silentExistingUIBranch,true);assert.equal(data.bootstrap.fakeModuleInitialized,false);assert.equal(data.bootstrap.resumeEntered,false);assert.equal(f.scripts.length,0);
});
