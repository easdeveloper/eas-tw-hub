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
test('silent existing-UI path loads the missing Fake module for the authorized tab',async()=>{
 const f=fixture();f.root.document.readyState='complete';f.root.__EAS_TW_SILENT_BOOTSTRAP__=true;
 f.root.EAS={UI:{toggle(){},FloatingPanel:{initialize(){}}},Minting:{},MissionScheduler:{initialize(){}}, Units:{calculateCommandPopulation(){}},CommandRules:{scanCommandRuleErrors(){}},Place:{getCommandForm(){},ensureCommandTarget(){}}};
 f.run('index.js');await new Promise(resolve=>setImmediate(resolve));
 const data=f.root.EASFakeDebug();assert.equal(data.bootstrap.silentExistingUIBranch,true);assert.equal(data.bootstrap.fakeModuleInitialized,false);assert.equal(data.bootstrap.resumeEntered,false);assert.equal(f.scripts.length,1);assert.match(f.scripts[0].src,/services\/fakes-execution\.js/);
});

test('persistent local userscript executes embedded index once per fresh page without script injection',async()=>{
 const source=fs.readFileSync('local-test/eas-tw-local.user.js','utf8');
 for(let page=0;page<3;page++){
  const f=fixture();f.root.__EAS_TW_BOOTSTRAPPED__=false;
  f.sandbox.Blob=class{constructor(){throw Error('unexpected JS blob');}};
  vm.runInContext(source,f.sandbox);const build=f.root.EASLocalBuild;
  vm.runInContext(source,f.sandbox);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.root.EASLocalBuild,build);assert.equal(f.scripts.length,0);
  assert.equal(f.root.EASLoaderDebug().counts.indexStarts,1);
  assert.equal(f.root.EASLoaderDebug().counts.factoryExecutions,1);
  assert.equal(f.root.EASFakeDebug().bootstrap.codeSource,'local-embedded');
  assert.equal(typeof f.root.EASFakeDebug,'function');assert.equal(f.root.EASFakeBootstrapDebug.loaded,true);
  assert.equal(f.root.EASTWUserscriptLoader.pageContext().localBuildId,build.id);
  const first=build.execute('missing.js');assert.equal(build.execute('missing.js'),first);
  await assert.rejects(first,/Local build asset missing/);
 }
});

test('embedded index resolves local assets and fails closed for missing files',async()=>{
 const f=fixture();const blobs=[],revoked=[];
 f.root.EASLocalBuild={id:'test',files:{'core/test.js':'window.localAssetExecuted=true;'}};
 f.sandbox.Blob=class{constructor(parts){this.parts=parts;}};
 f.sandbox.URL=class extends URL{static createObjectURL(blob){blobs.push(blob);return 'blob:asset-'+blobs.length;}static revokeObjectURL(url){revoked.push(url);}};
 f.run('index.js');const loading=f.root.EASLoader.loadScript('core/test.js');
 assert.equal(f.scripts[0].src,'blob:asset-1');assert.equal(blobs[0].parts[0],'window.localAssetExecuted=true;');assert.equal(revoked.length,0);f.scripts[0].onload();await loading;assert.deepEqual(revoked,['blob:asset-1']);
 await assert.rejects(f.root.EASLoader.loadScript('core/missing.js'),/Local build asset missing/);
 assert.equal(f.scripts.length,1);
});

test('local bundle blob is revoked after load and duplicate bootstrap does not create another',()=>{
 const f=fixture(),revoked=[];f.root.__EAS_TW_BOOTSTRAPPED__=false;f.root.EASLocalBuild={id:'test',files:{'index.js':'/* test */'}};
 f.sandbox.Blob=class{};f.sandbox.URL=class extends URL{static createObjectURL(){return 'blob:test';}static revokeObjectURL(url){revoked.push(url);}};
 f.run('eas-tw-loader.user.js');assert.equal(revoked.length,0);f.scripts[0].onload();assert.deepEqual(revoked,['blob:test']);f.run('eas-tw-loader.user.js');assert.equal(f.scripts.length,1);
});

test('index reinjection preserves the in-flight dependency promise without early success',async()=>{
 const f=fixture();f.run('index.js');const loader=f.root.EASLoader;
 const first=loader.loadScript('core/test.js');let settled=false;first.then(()=>{settled=true;});
 f.run('index.js');assert.equal(f.root.EASLoader,loader);assert.equal(loader.loadScript('core/test.js'),first);
 await Promise.resolve();assert.equal(settled,false);assert.equal(f.scripts.length,1);
 f.scripts[0].onload();await first;assert.equal(settled,true);
 await loader.loadScript('core/test.js');assert.equal(f.scripts.length,1);
});

test('failed dependency remains failed and is not injected automatically again',async()=>{
 const f=fixture();f.run('index.js');const first=f.root.EASLoader.loadScript('core/failure.js');
 f.scripts[0].onerror();await assert.rejects(first,/core\/failure/);
 const again=f.root.EASLoader.loadScript('core/failure.js');assert.equal(again,first);
 await assert.rejects(again,/core\/failure/);assert.equal(f.scripts.length,1);
});

test('loader diagnostics are singleton, bounded, detached and have no observer/network',()=>{
 const f=fixture();f.run('core/loader-diagnostics.js');const mark=f.root.__EASLoaderTrace,debug=f.root.EASLoaderDebug;
 for(let i=0;i<500;i++)mark('load-script',{asset:'core/eas.js',reason:'test'});
 mark('image-observer',{childListMutations:7});f.run('core/loader-diagnostics.js');
 assert.equal(f.root.__EASLoaderTrace,mark);assert.equal(f.root.EASLoaderDebug,debug);
 const data=debug();assert.equal(data.events.length,200);assert.equal(data.resources.length,1);
 assert.equal(data.counts.loadScriptCalls,500);assert.equal(data.counts.childListMutations,7);
 assert.equal(data.loaderObservers,0);data.counts.loadScriptCalls=0;assert.equal(debug().counts.loadScriptCalls,500);
 assert.equal(f.scripts.length,0);
});

test('loader lifecycle logs expose labels, counters, identity and concrete script outcomes',async()=>{
 const f=fixture(),consoleEvents=[],loggerEvents=[];
 f.root.console={info:(...args)=>consoleEvents.push(args)};
 f.root.__EASLogger={debug:(...args)=>loggerEvents.push(args),info(){}};
 f.run('core/loader-diagnostics.js');f.run('index.js');
 const good=f.root.EASLoader.loadScript('core/good.js',{reason:'test-explicit-demand'});
 const url=f.scripts[0].src;f.scripts[0].onload();await good;
 await f.root.EASLoader.loadScript('core/good.js');
 const bad=f.root.EASLoader.loadScript('core/bad.js');f.scripts[1].onerror();await assert.rejects(bad);
 f.run('index.js');
 const labels=consoleEvents.map(x=>x[0]);
 for(const label of ['[EAS][LOADER] loadScript','[EAS][LOADER] script-created','[EAS][LOADER] script-loaded','[EAS][LOADER] script-error','[EAS][LOADER] duplicate-blocked','[EAS][BOOTSTRAP] start','[EAS][BOOTSTRAP] already-running'])assert.ok(labels.includes(label),label);
 const data=f.root.EASLoaderDebug();assert.equal(data.counts.scriptsCreated,2);assert.equal(data.counts.scriptsLoaded,1);assert.equal(data.counts.scriptErrors,1);
 for(const event of data.events){assert.equal(typeof event.counter,'number');assert.equal(typeof event.timestamp,'number');assert.equal(event.codeSource,'remote');assert.equal(event.localBuildId,null);assert.ok(event.reason);assert.equal(event.session,data.session);}
 assert.ok(data.events.some(x=>x.event==='load-script'&&x.reason==='test-explicit-demand'&&x.callerStack));
 assert.equal(data.resources.find(x=>x.asset==='core/good.js').url,url.split('?')[0]);
 assert.ok(loggerEvents.length>0);
});

test('console and central logger failures cannot prevent resource completion',async()=>{
 const f=fixture();f.root.console={info(){throw Error('console');}};f.root.__EASLogger={debug(){throw Error('logger');},info(){}};
 f.run('core/loader-diagnostics.js');f.run('index.js');const loading=f.root.EASLoader.loadScript('core/test.js');
 f.scripts[0].onload();await loading;assert.equal(f.root.EASLoaderDebug().counts.scriptsLoaded,1);
});

test('content hashes detect same code behind different blob URLs without logging code or tokens',()=>{
 const f=fixture();const source='window.uniquePrivateSource = 42;';
 const hash=require('node:crypto').createHash('sha256').update(source).digest('hex');
 f.root.EASLocalBuild={id:'content-test',assetHashes:{'core/a.js':hash,'core/b.js':hash}};
 f.run('core/loader-diagnostics.js');
 f.root.__EASLoaderTrace('script-created',{asset:'core/a.js',url:'blob:https://test/uuid-one',scriptType:'text/javascript',content:source,csrf_token:'DO_NOT_LOG',callerStack:'at https://game/game.php?h=DO_NOT_LOG#DO_NOT_LOG'});
 f.root.__EASLoaderTrace('script-created',{asset:'core/b.js',url:'blob:https://test/uuid-two',scriptType:'text/javascript'});
 f.root.__EASLoaderTrace('script-created',{asset:'unknown.js',url:'data:text/javascript,DO_NOT_LOG'});
 const data=f.root.EASLoaderDebug();assert.equal(data.events[0].contentHash,'sha256:'+hash);
 assert.equal(data.events[0].sameContentProcessedBefore,false);assert.equal(data.events[1].sameContentProcessedBefore,true);
 assert.equal(data.events[2].contentHash,null);assert.equal(data.events[2].sameContentProcessedBefore,null);
 assert.ok(!JSON.stringify(data).includes('DO_NOT_LOG'));assert.ok(!JSON.stringify(data).includes(source));
});

test('legacy content fingerprint is stable across new blob IDs and does not imply source availability remotely',()=>{
 const f=fixture();f.root.EASLocalBuild={id:'legacy',files:{'core/a.js':'same content','core/b.js':'same content'}};f.run('core/loader-diagnostics.js');
 f.root.__EASLoaderTrace('script-created',{asset:'core/a.js',url:'blob:https://test/one'});
 f.root.__EASLoaderTrace('script-created',{asset:'core/b.js',url:'blob:https://test/two'});
 const data=f.root.EASLoaderDebug();assert.match(data.events[0].contentHash,/^fnv1a32:/);assert.equal(data.events[0].contentHash,data.events[1].contentHash);
 assert.equal(data.events[1].sameContentProcessedBefore,true);assert.ok(!JSON.stringify(data).includes('same content'));
});
