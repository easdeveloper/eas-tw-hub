const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('core/game-data.js','utf8');
function fixture(screen='map',fresh=false){
 const counts={market:0,villages:0,troops:0,groups:0,http:0},logs=[],calls=[];
 const villages=Array.from({length:62},(_,i)=>({id:i+1}));let cache={updatedAt:fresh?Date.now():1,villages:{}};
 const EAS={Utils:{},State:{},Logger:{info:(module,event,data)=>logs.push({module,event,...data})},
 Villages:{getAll:()=>villages,getById:id=>villages.find(v=>v.id===id),getState:()=>({updatedAt:cache.updatedAt}),ensureFresh:async()=>{counts.villages++;counts.http++;return villages;},refresh:async()=>{counts.villages++;counts.http++;return villages;},invalidate(){}},
 Troops:{getAll:()=>({}),getSourceInfo:()=>({}),ensureLoaded:async()=>{counts.troops++;counts.http++;},refresh:async()=>{counts.troops++;counts.http++;}},
 Groups:{getAll:()=>[],getMetadata:()=>({stale:true}),ensureFresh:async()=>{counts.groups++;counts.http++;return[];},refresh:async()=>{counts.groups++;counts.http++;return[];}},
 World:{getGameData:()=>({}),getWorldName:()=> 'test'},
 MarketEngine:{getCache:()=>cache,cacheVillages:c=>Object.values(c.villages),withEconomicState:v=>v,getProjectedResources:()=>({}),refreshMarketNetworkState:async options=>{calls.push(options);counts.market++;counts.http+=options.villageIds.length*2;cache={...cache,updatedAt:Date.now()};return{refresh:{cancelled:false}};}}};
 const window={location:{href:'https://test/game.php?screen='+screen},dispatchEvent(){}};
 const context=vm.createContext({EAS,window,CustomEvent:class{}});const run=()=>vm.runInContext(source,context);run();
 return{EAS,window,run,counts,logs,calls,cache:()=>cache};
}
for(const screen of ['map','place'])test('bootstrap '+screen+' reads cache and makes zero collection requests',async()=>{
 const f=fixture(screen);await f.EAS.Data.bootstrap();assert.equal(f.counts.http,0);assert.equal(f.counts.market,0);
 assert.ok(f.logs.some(x=>x.event==='BACKGROUND_SCAN_SKIPPED'&&x.module==='Market'&&x.requestedBy==='EAS.Data.bootstrap'));
});
test('20 Fake navigations/reinjections cause no scans and preserve cache',async()=>{
 const f=fixture('place');const cached=f.cache();for(let i=0;i<20;i++){f.run();await f.EAS.Data.bootstrap();}
 assert.equal(f.counts.http,0);assert.equal(f.cache(),cached);
});
test('domain initialize/getCached are local only, even with stale cache',()=>{
 const f=fixture();for(const name of ['Market','Troops','Groups','Villages']){f.EAS.Data[name].initialize();f.EAS.Data[name].getCached();}assert.equal(f.counts.http,0);
});
test('module demand refreshes stale data once; valid cache is reused',async()=>{
 const f=fixture();await f.EAS.Data.Market.ensureFresh({requestedBy:'market.balance.open',reason:'module-open'});
 assert.equal(f.counts.market,1);assert.equal(f.calls[0].maxAgeMs,120000);assert.equal(f.logs.find(x=>x.event==='BACKGROUND_SCAN').forceRefresh,false);
 await f.EAS.Data.Market.ensureFresh({requestedBy:'market.balance.open'});assert.equal(f.counts.market,1);
});
test('explicit refresh and active Market operation still perform scoped scans',async()=>{
 const f=fixture('map',true);await f.EAS.Data.Market.refresh({villageIds:['1','2'],forceRefresh:true,requestedBy:'market.refreshButton',reason:'user-refresh'});
 await f.EAS.Data.Market.refresh({villageId:'3',forceRefresh:true,executionId:'active-market',requestedBy:'market-offers-execution',reason:'active-operation'});
 assert.equal(f.counts.market,2);assert.equal(f.counts.http,6);assert.equal(f.calls[0].maxAgeMs,0);
 assert.ok(f.logs.some(x=>x.executionId==='active-market'&&x.villageCount===1));
});
test('scan logging failures do not trigger extra HTTP or block cached bootstrap',async()=>{
 const f=fixture();f.EAS.Logger.info=()=>{throw Error('logger');};await f.EAS.Data.bootstrap();assert.equal(f.counts.http,0);
});
test('HTTP 429 in Market makes one request and no retry, even without global guard',async()=>{
 let requests=0;const EAS={MarketEngine:{}};const context=vm.createContext({EAS,window:{},URL,setTimeout(){throw Error('retry scheduled');},fetch:async()=>{requests++;return{status:429,ok:false};}});
 vm.runInContext(fs.readFileSync('services/market-engine.js','utf8'),context);
 await assert.rejects(EAS.MarketEngine.requestWithBackoff({url:new URL('https://test/game.php?screen=market'),maxRetries:10}),error=>error.status===429);
 assert.equal(requests,1);
});


test('opening a data-dependent Market module requests freshness only on open',async()=>{
 const calls=[];const EAS={Modules:{},MarketBalanceExecution:{start(){}},Data:{Villages:{ensureFresh:async()=>{}},Market:{ensureFresh:async options=>calls.push(options)}},UI:{createWindow(){throw Error('UI reached');}}};
 const context=vm.createContext({EAS});vm.runInContext(fs.readFileSync('modules/market-balance.js','utf8'),context);assert.equal(calls.length,0);
 await assert.rejects(EAS.Modules.MarketBalance.open(),/UI reached/);assert.equal(calls.length,1);assert.equal(calls[0].requestedBy,'market.balance.open');
});


test('explicit force and operation invalidation bypass Market cache age',async()=>{
 const f=fixture('map',true);await f.EAS.Data.Market.ensureFresh({forceRefresh:true,requestedBy:'manual'});assert.equal(f.calls[0].maxAgeMs,0);
 f.EAS.Data.Market.invalidate('operation-change');await f.EAS.Data.Market.ensureFresh({requestedBy:'market-executor'});assert.equal(f.calls[1].maxAgeMs,0);
});
