const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('core/image-trace.js','utf8');
function fixture(){
 let callback,observations=0;const imgs=[],listeners={},pending=[];
 const doc={scripts:[],querySelectorAll:()=>imgs,addEventListener:(name,fn)=>listeners[name]=fn};
 const root={document:doc,location:{href:'https://game/game.php'},EASLocalBuild:{id:'local-test'},performance:{getEntriesByType:()=>[{name:'https://game/st/a.gif',initiatorType:'img',startTime:5,duration:2,transferSize:0,responseStatus:404}]},MutationObserver:class{constructor(fn){callback=fn;}observe(){observations++;}disconnect(){}takeRecords(){return pending.splice(0);}}};
 root.atob=atob; const sandbox={window:{},unsafeWindow:root,URL};vm.createContext(sandbox);const run=()=>vm.runInContext(source,sandbox);run();
 const img={nodeType:1,tagName:'IMG',src:'https://game/st/a.gif',currentSrc:'',complete:false,naturalWidth:0,parentElement:{tagName:'BODY',id:'ds_body',className:''},outerHTML:'<img src="/st/a.gif">',closest:s=>s==='#ds_body'?{}:null,querySelectorAll:()=>[]};
 return {root,imgs,img,listeners,pending,run,observations:()=>observations,mutate:records=>callback(records)};
}
test('early unsafeWindow helper observes images without DOM writes and returns detached JSON',()=>{
 const f=fixture();f.imgs.push(f.img);f.mutate([{type:'childList',addedNodes:[f.img]}]);
 const data=f.root.EASImageTraceDebug();assert.equal(data.events.length,1);assert.equal(data.events[0].creatorStack,null);assert.equal(data.events[0].parent.id,'ds_body');assert.equal(data.events[0].broken,false);
 data.events[0].src='changed';assert.equal(f.root.EASImageTraceDebug().events[0].src,f.img.src);assert.equal(f.img.src,'https://game/st/a.gif');
 f.img.complete=true;f.listeners.error({target:f.img});assert.equal(f.root.EASImageTraceDebug().events.at(-1).broken,true);
});
test('late body, nested images, src changes, pending records and normal loading.gif filtering',()=>{
 const f=fixture();f.imgs.push(f.img);const wrapper={nodeType:1,querySelectorAll:()=>[f.img]};
 f.mutate([{type:'childList',addedNodes:[wrapper]}]);f.pending.push({type:'attributes',target:f.img});assert.equal(f.root.EASImageTraceDebug().events.length,2);
 f.img.src='https://cdn/graphic/loading.gif';f.mutate([{type:'attributes',target:f.img}]);assert.equal(f.root.EASImageTraceDebug().events.length,2);
});
test('bounded history, resource timing, blob mapping and duplicate initialization',()=>{
 const f=fixture();f.imgs.push(f.img);for(let i=0;i<305;i++)f.mutate([{type:'attributes',target:f.img}]);
 f.root.__EASImageTraceMark({asset:'index.js',url:'blob:game/test',stack:'actual EAS call site'});f.run();
 const data=f.root.EASImageTraceDebug();assert.equal(f.observations(),1);assert.equal(data.events.length,300);assert.equal(data.droppedEvents,5);assert.equal(data.resources[0].responseStatus,404);assert.equal(data.loaderEvents[0].asset,'index.js');assert.equal(data.origin,'undetermined');
});
test('generated local probe precedes loader execution',()=>{
 const bundle=fs.readFileSync('local-test/eas-tw-local.user.js','utf8');assert.ok(bundle.indexOf('// Temporary, passive LOCAL-build diagnostic.')<bundle.indexOf("const LOADER_VERSION"));
});

test('decodes real pixel and correlates only exact full blob URLs without duplicate event counting',()=>{
 const f=fixture();const blob='blob:https://br143.tribalwars.com.br/50df7718-0681-4fc9-b800-85b09fb7a0f2';
 f.img.src='https://br143.tribalwars.com.br/st/'+btoa('3e180fa8-'+blob)+'.gif';f.imgs.push(f.img);
 f.root.__EASImageTraceMark({asset:'index.js',url:blob,timestamp:100});
 f.mutate([{type:'childList',addedNodes:[f.img]}]);f.listeners.load({target:f.img});
 const d=f.root.EASImageTraceDebug(),c=d.correlations.find(x=>x.stPixel===f.img.src);
 assert.equal(c.decodedStPayload,'3e180fa8-'+blob);assert.equal(c.matchedEasBlob,blob);assert.equal(c.easBlobPurpose,'JS bundle');assert.equal(c.deltaMs,c.pixelAddedAt-100);
 assert.equal(d.correlationSummary.exactMatchedUniqueStUrls,1);assert.equal(d.correlationSummary.currentMatchedImageElements,1);
 f.img.src='https://br143.tribalwars.com.br/st/'+btoa('prefix-'+blob+'suffix')+'.gif';
 assert.equal(f.root.EASImageTraceDebug().images[0].matchesEasBlob,false);
});
test('malformed payload remains diagnostic and CSS/CSV purposes and repeated assets are reported',()=>{
 const f=fixture();f.img.src='https://game/st/!!!.gif';f.imgs.push(f.img);
 f.root.__EASImageTraceMark({asset:'css/eas.css',url:'blob:https://game/a',type:'text/css'});
 f.root.__EASImageTraceMark({asset:'css/eas.css',url:'blob:https://game/b',type:'text/css'});
 f.root.__EASImageTraceMark({asset:'report.csv',url:'blob:https://game/c',type:'text/csv;charset=utf-8'});
 const d=f.root.EASImageTraceDebug();assert.ok(d.images[0].decodeError);assert.equal(d.images[0].pixelAddedAt,null);assert.equal(d.images[0].deltaMs,null);
 assert.equal(d.blobMap[0].easBlobPurpose,'CSS');assert.equal(d.blobMap[2].easBlobPurpose,'CSV');assert.equal(d.correlationSummary.repeatedAssets[0].distinctBlobCount,2);
});


test('100 tracer bootstraps/debug reads reuse hooks without requests and can dispose',()=>{
 const f=fixture();const deny=()=>{throw Error('diagnostic network/DOM write');};
 f.root.fetch=deny;f.root.Image=deny;f.root.XMLHttpRequest=deny;f.root.navigator={sendBeacon:deny};f.root.document.createElement=deny;
 for(let i=0;i<100;i++){f.run();f.root.EASImageTraceDebug();}assert.equal(f.observations(),1);
 f.root.EASImageTraceDispose();assert.equal(f.root.EASImageTraceDebug().observerActive,false);
});
