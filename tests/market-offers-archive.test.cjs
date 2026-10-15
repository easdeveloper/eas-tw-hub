const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function fixture(){const data=new Map();const storage={get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};const box={EAS:{},window:{document:{},location:{href:'https://br143.tribalwars.com.br/game.php'}},localStorage:storage,Date,URL};vm.createContext(box);for(const p of ['core/storage.js','services/market-offers-execution.js'])vm.runInContext(fs.readFileSync(p,'utf8'),box);return {data,api:box.EAS.MarketOffersExecution};}
test('successful reconciled batch removes context without producing an archive',()=>{const f=fixture(),c={version:3,state:'completed',executionId:'one',finishedAt:1,queue:[{status:'created',offerId:'42',attempt:{state:'completed'},confirmation:{evidence:'new-compatible-offer-id'}}]};f.data.set('eas_tw_market_offers_execution',JSON.stringify(c));assert.equal(f.api.archiveBatch(c),true);assert.equal(f.data.has('eas_tw_market_offers_execution'),false);assert.equal([...f.data.keys()].some(k=>k.startsWith('eas_tw_market_offers_archive:')),false);});
test('uncertain state and all legacy archives stay intact under automatic retention',()=>{const f=fixture(),c={executionId:'uncertain',state:'uncertain',queue:[{status:'submitting',attempt:{state:'submitted'}}]};f.data.set('eas_tw_market_offers_execution',JSON.stringify(c));f.data.set('eas_tw_market_offers_archive:unknown','UNKNOWN');const before=[...f.data];assert.equal(f.api.archiveBatch(c),false);f.api.retainArchives();assert.deepEqual([...f.data],before);});
test('new execution never requires history, but cannot overwrite uncertain prior authorization',()=>{const f=fixture();f.data.set('eas_tw_market_offers_execution',JSON.stringify({executionId:'old',state:'uncertain',batchAuthorization:{token:'keep'},queue:[]}));assert.equal(f.api.save({executionId:'new',version:3,queue:[]}),false);assert.equal(JSON.parse(f.data.get('eas_tw_market_offers_execution')).executionId,'old');});
test('first critical batch write has an exact readback including lifecycle marker and revision',()=>{const f=fixture(),context={executionId:'new',version:3,batchAuthorization:{authorizedAt:1},revision:0,queue:[]};assert.equal(f.api.save(context),true);assert.deepEqual(JSON.parse(f.data.get('eas_tw_market_offers_execution')),context);assert.equal(context.lifecycleVersion,1);});

test('save distinguishes revision conflicts from storage failure and clears stale failure on success',()=>{
 const f=fixture(),c={executionId:'one',version:3,batchAuthorization:{authorizedAt:1},revision:0,queue:[]};
 assert.equal(f.api.save(c),true);const stale={...c,revision:0,pauseReason:'STORAGE_WRITE_FAILED'};
 assert.equal(f.api.save(stale),false);assert.equal(f.api.lastSaveFailure,'STORAGE_CONTEXT_CHANGED');
 c.pauseReason='STORAGE_WRITE_FAILED';assert.equal(f.api.save(c),true);assert.equal(f.api.lastSaveFailure,null);
});
test('old Hub diagnostics cannot be mistaken for a game error',()=>{
 const f=fixture(),node={textContent:'STORAGE_WRITE_FAILED',closest:()=>({})};
 assert.equal(f.api.errorMessage({querySelector:()=>null,querySelectorAll:()=>[node]}),null);
 node.closest=()=>null;assert.match(f.api.errorMessage({querySelector:()=>null,querySelectorAll:()=>[node]}),/STORAGE_WRITE_FAILED/);
});
