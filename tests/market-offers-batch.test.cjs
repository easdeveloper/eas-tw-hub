const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
const source = fs.readFileSync('services/market-offers-batch.js', 'utf8');
const executionSource = fs.readFileSync('services/market-offers-execution.js', 'utf8');
const lifecycle = executionSource.slice(executionSource.indexOf('    const BATCH_TERMINAL'), executionSource.indexOf('    const amount ='));
const summaryRules = executionSource.slice(executionSource.indexOf('    const isManualError'), executionSource.indexOf('    const refreshExistingHubPanel'));
function fixture(options = {}) {
    let stored = null, now = 1000, clicks = 0, prepares = 0, sequence = 0;
    const timers = new Map(), attempts = [], logs = [], archives = new Map(); let panel = false;
    const copy = x => x == null ? x : JSON.parse(JSON.stringify(x));
    const api = {
        EXECUTION_VERSION: 3, read: () => copy(stored),
        save(c) { if (options.storageFailure || stored && c.revision !== stored.revision) return false; c.revision++; stored = copy(c); return true; },
        isExecutionFinished: c => !!c.endedAt, normalizeItem: x => ({ ...x, amountPerOffer: x.offerAmount, requestAmountPerOffer: x.requestAmount }),
        refreshBatchVillage() {}, renderBatch() { panel = true; }, disposeBatch() { panel = false; },
        async prepareItem(c) { prepares++; if (options.onPrepare) await options.onPrepare(f); return { valid: true, submit: {}, form: {} }; },
        validateBatchForm: () => true,
        captureBatchSnapshot: () => ({ available: !options.missingSnapshot, offerIds: options.missingSnapshot ? null : Array.from({length:clicks},(_,i)=>String(i+1)), source: 'own-offer-rows' }),
        submitPreparedOffer({ commit, item }) {
            if (!commit()) return { sent: false };
            assert.equal(stored.queue[stored.currentIndex].attempt.submitAt, now);
            assert.deepEqual(stored.queue[stored.currentIndex].attempt.beforeSnapshot.offerIds, Array.from({length:clicks},(_,i)=>String(i+1)));
            assert.equal(stored.queue[stored.currentIndex].attempt.beforeSnapshot.attemptId,item.attempt.attemptId);
            clicks++; attempts.push(item.attempt.attemptId); return { sent: true };
        },
        reconcileBatchDom: () => ({ success: !options.uncertain && !options.ambiguous && stored.currentIndex !== options.uncertainAt, uncertain: Boolean(options.ambiguous), reason: 'MULTIPLE_NEW_OFFERS', evidence: 'new-compatible-offer-id' }),
        inspectBatchConfirmation: () => options.confirmation ? { valid: true, button: { click() { options.confirmations = (options.confirmations || 0) + 1; assert.ok(stored.queue[0].attempt.confirmAt); } } } : null, errorMessage: () => options.gameError || '', commitBatchResult() {}
    };
    const w = { AbortController, name: '', location: { href: 'https://example.test/game.php?screen=market&mode=own_offer&village=9', origin: 'https://example.test', assign(url) { this.href = url; } },
        document: { body: {} }, EASLocalBuild: { execute() {} }, navigator: { locks: { request: async (key, opts, callback) => callback({}) } },
        EASRateLimit: { check: () => !!options.rateLimited },
        setTimeout(fn, ms) { const id = ++sequence; timers.set(id, { fn, at: now + ms }); return id; }, clearTimeout(id) { timers.delete(id); },
        MutationObserver: class { observe() {} disconnect() {} }
    };
    const EAS = { MarketOffersExecution: api, Logger: { info(...args) { if (options.loggerFailure) throw Error('logger'); logs.push(args); } } };
    function load() { delete EAS.MarketOffersBatch; delete w.__EASMarketBatch; vm.runInNewContext(lifecycle + summaryRules + '\nObject.assign(EAS.MarketOffersExecution,{canResumeBatch,finalizeBatchStop,archiveBatch,getArchivedBatch,batchDurationMs,canMarkErrorAndSkip,completionSummary});\n' + source, { EAS, window: w, URL, Date: { now: () => now }, Math, console, localStorage: {getItem:key=>archives.get(key)||null,setItem:(key,value)=>{if(options.archiveFailure)throw Error('quota');archives.set(key,value);}} }); }
    const f = { api, w, options, state: () => copy(stored), clicks: () => clicks, prepares: () => prepares, attempts, logs,
        batch: () => EAS.MarketOffersBatch, timers, panel:()=>panel, reload() { timers.clear(); panel=false; load(); },
        async tick(ms = 0) { now += ms; const ready = [...timers].filter(([, v]) => v.at <= now); for (const [id, entry] of ready) { if (timers.delete(id)) entry.fn(); } await EAS.MarketOffersBatch.resume(); },
        async start(count = 2) { EAS.MarketOffersBatch.start({ queue: Array.from({ length: count }, () => ({ villageId: '9', offerResource: 'iron', requestResource: 'wood', offerAmount: 1000, requestAmount: 1000, repeatCount: 16, maxTravelHours: 15 })) }); await w.__EASMarketBatch.busy; }
    };
    load(); return f;
}
for (const count of [1, 2, 70]) test(`${count} authorized offers submit once each without another user click`, async () => {
    const f = fixture(); await f.start(count);
    for (let i = 0; i < count; i++) { await f.tick(); if (i + 1 < count) await f.tick(700); }
    assert.equal(f.clicks(), count); assert.equal(f.state().state, 'completed');
    assert.equal(new Set(f.attempts).size, count);
    for (let i = 0; i < 10; i++) await f.batch().resume();
    assert.equal(f.clicks(), count);
});
test('normal completion persists terminal state before one archive and commits the result', async () => {
    const f = fixture(), order = []; let archivedState = null, committed = 0;
    const archiveBatch = f.api.archiveBatch;
    f.api.archiveBatch = context => { order.push('archive'); archivedState = f.state(); return archiveBatch(context); };
    f.api.commitBatchResult = (context, item, result) => {
        order.push('commit'); committed++;
        assert.equal(context.state, 'completed'); assert.equal(item.status, 'created');
        assert.equal(result.evidence, 'new-compatible-offer-id');
    };
    await f.start(1); await f.tick();
    const completed = f.state();
    assert.equal(completed.state, 'completed'); assert.equal(completed.currentIndex, 1);
    assert.equal(archivedState.state, 'completed');
    assert.equal(archivedState.revision, completed.revision);
    assert.deepEqual(order, ['archive', 'commit']); assert.equal(committed, 1);
    assert.equal(f.api.getArchivedBatch(completed.executionId).archiveKind, 'market-offers-history');
    assert.equal(f.api.getArchivedBatch(completed.executionId).version, 2);
});
test('archive failure after terminal persistence cannot reopen or resend a completed batch', async () => {
    const f = fixture(); let archiveCalls = 0;
    f.api.archiveBatch = () => { archiveCalls++; throw Error('archive unavailable'); };
    await f.start(1); await f.tick();
    const completed = f.state();
    assert.equal(archiveCalls, 1); assert.equal(completed.state, 'completed');
    assert.equal(completed.queue[0].status, 'created');
    assert.equal(completed.queue[0].attempt.state, 'completed');
    assert.equal(f.api.canResumeBatch(completed), false);
    assert.equal(f.clicks(), 1); assert.equal(f.attempts.length, 1);
    await f.batch().resume();
    assert.equal(f.clicks(), 1); assert.equal(f.attempts.length, 1);
    assert.deepEqual(f.state(), completed);
});
test('archive storage failure after terminal persistence leaves completion durable', async () => {
    const f = fixture({ archiveFailure: true });
    await f.start(1); await f.tick();
    const completed = f.state();
    assert.equal(completed.state, 'completed'); assert.equal(completed.currentIndex, 1);
    assert.equal(completed.queue[0].status, 'created');
    assert.equal(completed.queue[0].attempt.state, 'completed');
    assert.equal(f.clicks(), 1); assert.equal(f.api.canResumeBatch(completed), false);
    await f.batch().resume();
    assert.equal(f.clicks(), 1); assert.deepEqual(f.state(), completed);
});
test('failed critical terminal persist retains STORAGE_WRITE_FAILED behavior and skips archival', async () => {
    const f = fixture(); let archiveCalls = 0;
    const save = f.api.save;
    f.api.save = context => context.state === 'completed' ? false : save(context);
    f.api.archiveBatch = () => { archiveCalls++; return true; };
    await f.start(1); await f.tick();
    const failed = f.state();
    assert.equal(archiveCalls, 0);
    assert.equal(f.logs.some(entry => entry[1] === 'MARKET_UNCERTAIN' && entry[2].result === 'STORAGE_WRITE_FAILED'), true);
    assert.equal(failed.state, 'uncertain'); assert.equal(failed.currentIndex, 0);
    assert.equal(failed.queue[0].status, 'verification-required');
    assert.notEqual(failed.queue[0].attempt.state, 'completed');
    assert.equal(f.clicks(), 1);
    await f.batch().resume();
    assert.equal(f.clicks(), 1); assert.equal(f.state().state, 'uncertain');
});
test('submitted attempt survives navigation and concurrent resumes without resending', async () => {
    const f = fixture(); await f.start(); const attempt = f.state().queue[0].attempt;
    f.reload(); await Promise.all(Array.from({ length: 20 }, () => f.batch().resume()));
    assert.equal(f.clicks(), 1); assert.equal(f.state().queue[0].attempt.attemptId, attempt.attemptId);
    assert.deepEqual(f.state().queue[0].attempt.beforeSnapshot, attempt.beforeSnapshot);
    assert.equal(f.state().currentIndex, 1);
});
test('uncertain result pauses forever and never advances or retries', async () => {
    const f = fixture({ uncertain: true }); await f.start(); await f.tick(10001);
    assert.equal(f.state().state, 'uncertain'); assert.equal(f.state().currentIndex, 0);
    assert.equal(f.batch().continueUnsent(), false); f.reload(); await f.batch().resume(); assert.equal(f.clicks(), 1);
});
test('missing baseline blocks irreversible submission', async () => {
    const f = fixture({ missingSnapshot: true }); await f.start(); assert.equal(f.clicks(), 0); assert.equal(f.state().pauseReason, 'BEFORE_SNAPSHOT_UNAVAILABLE');
});
test('storage failure during preparation prevents submit', async () => {
    const f = fixture({ onPrepare: f => { f.options.storageFailure = true; } }); await f.start(); assert.equal(f.clicks(), 0);
});
test('STOP while preparing invalidates asynchronous continuation', async () => {
    const f = fixture({ onPrepare: f => f.batch().stop() }); await f.start(); assert.equal(f.clicks(), 0); assert.equal(f.state().state, 'cancelled'); assert.equal(f.state().paused, false);
});
test('429 during preparation preserves queue and prevents submit', async () => {
    const f = fixture({ onPrepare: f => { f.options.rateLimited = true; } }); await f.start(); assert.equal(f.clicks(), 0); assert.equal(f.state().state, 'rate_limited');
});
test('logger failure cannot block completion', async () => {
    const f = fixture({ loggerFailure: true }); await f.start(1); await f.tick(); assert.equal(f.state().state, 'completed');
});
test('other tab cannot resume the authorized queue', async () => {
    const f = fixture({ uncertain: true }); await f.start(); f.w.name = 'different'; await f.batch().resume(); assert.equal(f.clicks(), 1);
});
test('reload before submit preserves prepared attempt and authorizes exactly one dispatch', async () => {
    const f = fixture({ missingSnapshot: true }); await f.start(1);
    const c=f.state(), item=c.queue[0];c.paused=false;c.state='running';item.status='prepared';
    item.attempt={attemptId:'persisted-before-submit',executionId:c.executionId,itemId:item.id,sourceVillageId:'9',itemIdentity:JSON.stringify([item.id,'9',item.offerResource,item.requestResource,item.offerAmount,item.requestAmount,item.repeatCount,item.maxTravelHours])};
    f.api.save(c);f.options.missingSnapshot=false;f.reload();await f.batch().resume();
    assert.equal(f.clicks(),1);assert.equal(f.state().queue[0].attempt.attemptId,'persisted-before-submit');
});
test('reload on confirmation consumes confirmation marker once and never resends initial offer', async () => {
    const f=fixture({uncertain:true,confirmation:true});await f.start(1);f.reload();await f.batch().resume();
    const attempt=f.state().queue[0].attempt;assert.equal(f.options.confirmations,1);
    f.reload();await f.batch().resume();assert.equal(f.options.confirmations,1);assert.equal(f.clicks(),1);
    assert.equal(f.state().queue[0].attempt.attemptId,attempt.attemptId);
});
test('queue changes after authorization stop the next dispatch', async () => {
    const f=fixture();await f.start(2);await f.tick();const c=f.state();c.queue[1].offerAmount=2000;f.api.save(c);
    await f.tick(700);assert.equal(f.clicks(),1);assert.equal(f.state().pauseReason,'AUTHORIZED_QUEUE_CHANGED');
});
test('STOP is terminal and idempotent; navigation and F5 retain uncertain evidence without reopening', async () => {
    const f=fixture({uncertain:true});await f.start(2);await f.tick(10001);
    const before=f.state(), attempt=before.queue[0].attempt;
    assert.equal(before.state,'uncertain');assert.equal(f.panel(),true);
    f.batch().stop();const stopped=f.state();
    assert.equal(stopped.state,'cancelled');assert.equal(stopped.paused,false);assert.ok(stopped.finishedAt);
    assert.equal(stopped.batchAuthorization.revokedAt,stopped.finishedAt);
    assert.equal(f.timers.size,0);assert.equal(f.panel(),false);
    assert.deepEqual(stopped.queue[0].attempt,attempt);assert.equal(stopped.queue[0].status,'verification-required');
    const duration=f.api.batchDurationMs(stopped);
    f.batch().stop();assert.deepEqual(f.state(),stopped);assert.equal(f.logs.filter(x=>x[1]==='MARKET_USER_STOPPED').length,1);
    for(const screen of ['overview','place','market','market']){
        f.w.location.href=`https://example.test/game.php?screen=${screen}&village=9`;
        f.reload();f.w.name=stopped.executionTab; // even a retained/restored tab name cannot bypass terminal state
        await f.tick(100000);assert.equal(f.panel(),false);assert.equal(f.clicks(),1);assert.equal(f.timers.size,0);
        assert.equal(f.api.batchDurationMs(f.state()),duration);assert.equal(f.batch().continueUnsent(),false);
    }
    assert.equal(f.api.getArchivedBatch(stopped.executionId).items[0].attemptId,attempt.attemptId);
    assert.equal(f.api.getArchivedBatch(stopped.executionId).uncertainty,true);
    assert.deepEqual(f.state().queue[0].attempt,attempt);
});
test('STOP during the gap prevents next offer and clears pending timers',async()=>{
    const f=fixture();await f.start(2);await f.tick();assert.equal(f.state().currentIndex,1);
    f.batch().stop();await f.tick(10000);assert.equal(f.clicks(),1);assert.equal(f.timers.size,0);assert.equal(f.panel(),false);
});
test('terminal/legacy USER_STOP states cannot enter resume even without endedAt',async()=>{
    for(const state of ['cancelled','user_stopped','completed','unknown']){
        const f=fixture();await f.start(2);const c=f.state();c.state=state;f.api.save(c);f.reload();await f.batch().resume();assert.equal(f.panel(),false);assert.equal(f.clicks(),1);
    }
    const f=fixture();await f.start(2);const c=f.state();c.state='paused';c.pauseReason='USER_STOP';f.api.save(c);f.reload();await f.batch().resume();assert.equal(f.panel(),false);assert.equal(f.clicks(),1);
});
test('failed STOP persistence still detaches and releases tab; no accidental reload submission',async()=>{
    const f=fixture({uncertain:true});await f.start();f.options.storageFailure=true;
    assert.throws(()=>f.batch().stop(),/STORAGE_WRITE_FAILED/);assert.equal(f.w.name,'');assert.equal(f.panel(),false);
    f.reload();await f.tick(20000);assert.equal(f.clicks(),1);assert.equal(f.panel(),false);
});
test('persistent safety state wins over a stale paused=false compatibility flag',async()=>{
    for(const state of ['paused','rate_limited','uncertain','error']){
        const f=fixture();await f.start();const c=f.state();c.state=state;c.paused=false;f.api.save(c);f.reload();await f.batch().resume();
        assert.equal(f.state().currentIndex,0);assert.equal(f.clicks(),1);assert.equal(f.timers.size,0);
    }
});
test('ambiguous ID reconciliation pauses immediately without another submission',async()=>{
    const f=fixture({ambiguous:true});await f.start(2);await f.tick();assert.equal(f.state().state,'uncertain');
    assert.equal(f.state().currentIndex,0);await f.tick(10000);f.reload();await f.batch().resume();assert.equal(f.clicks(),1);
});
const manualIdentity = f => { const c=f.state(),item=c.queue[c.currentIndex];return {executionId:c.executionId,itemId:item.id,attemptId:item.attempt.attemptId}; };
test('84 planned: 71 completed, item 72 uncertain, manual error skip, resume item 73 and finish without resending 72',async()=>{
    const f=fixture({uncertainAt:71,gameError:'Erro retornado pelo jogo'});await f.start(84);
    for(let index=0;index<71;index++){await f.tick();await f.tick(700);}
    const completed=JSON.stringify(f.state().queue.slice(0,71));
    assert.equal(f.state().currentIndex,71);assert.equal(f.clicks(),72);
    await f.tick();assert.equal(f.state().state,'uncertain');
    const before=f.state().queue[71],identity=manualIdentity(f);
    assert.equal(before.attempt.failureEvidence.gameError,'Erro retornado pelo jogo');
    const results=await Promise.all([f.batch().markErrorAndSkip(identity),f.batch().markErrorAndSkip(identity)]);
    assert.equal(results.filter(Boolean).length,1);assert.equal(f.state().currentIndex,72);
    const skipped=f.state().queue[71];assert.equal(skipped.manualResolution.outcome,'error');assert.ok(skipped.attempt.revokedAt);
    assert.equal(skipped.attempt.attemptId,before.attempt.attemptId);assert.deepEqual(skipped.attempt.beforeSnapshot,before.attempt.beforeSnapshot);
    assert.deepEqual(skipped.attempt.failureEvidence,before.attempt.failureEvidence);assert.equal(skipped.error,before.error);
    assert.equal(JSON.stringify(f.state().queue.slice(0,71)),completed);assert.equal(f.state().queue[72].attempt,null);
    f.reload();await f.batch().resume();assert.equal(f.clicks(),72); // F5 between the decision and item 73
    assert.equal(await f.batch().markErrorAndSkip(identity),false);
    for(let index=72;index<84;index++){await f.tick(700);await f.tick();}
    assert.equal(f.state().state,'completed');assert.equal(f.clicks(),84);assert.equal(new Set(f.attempts).size,84);
    assert.equal(f.attempts.filter(id=>id===identity.attemptId).length,1);
    assert.deepEqual(JSON.parse(JSON.stringify(f.api.completionSummary(f.state()))),{created:83,errors:1,skipped:0});
    assert.equal(JSON.stringify(f.state().queue.slice(0,71)),completed);
    assert.notEqual(f.state().queue[72].attempt.attemptId,identity.attemptId);
    assert.equal(f.state().queue[72].attempt.beforeSnapshot.offerIds.length,72);
});
test('manual error skip is unavailable while running or before submission and never bypasses STOP',async()=>{
    const f=fixture();await f.start(2);const identity=manualIdentity(f);
    assert.equal(f.api.canMarkErrorAndSkip(f.state()),false);assert.equal(await f.batch().markErrorAndSkip(identity),false);
    f.batch().stop();assert.equal(await f.batch().markErrorAndSkip(identity),false);assert.equal(f.state().currentIndex,0);
    const g=fixture({missingSnapshot:true});await g.start();assert.equal(g.api.canMarkErrorAndSkip(g.state()),false);
});
test('manual error skip persists before advance and refuses wrong identity or failed storage',async()=>{
    const f=fixture({uncertain:true});await f.start(2);await f.tick(10001);const identity=manualIdentity(f);
    assert.equal(await f.batch().markErrorAndSkip({...identity,attemptId:'wrong'}),false);assert.equal(f.state().currentIndex,0);
    f.options.storageFailure=true;assert.equal(await f.batch().markErrorAndSkip(identity),false);
    assert.equal(f.state().currentIndex,0);assert.equal(f.state().state,'uncertain');assert.equal(f.clicks(),1);
});
test('manual error skip on final item finishes with error rather than claiming success',async()=>{
    const f=fixture({uncertain:true});await f.start(1);await f.tick(10001);const identity=manualIdentity(f);
    assert.equal(await f.batch().markErrorAndSkip(identity),true);assert.equal(f.state().state,'completed');assert.equal(f.state().currentIndex,1);
    assert.deepEqual(JSON.parse(JSON.stringify(f.api.completionSummary(f.state()))),{created:0,errors:1,skipped:0});
    assert.equal(await f.batch().markErrorAndSkip(identity),false);assert.equal(f.clicks(),1);
});
test('old recovery button cannot resolve a subsequent uncertain item',async()=>{
    const f=fixture({uncertain:true});await f.start(2);await f.tick(10001);const old=manualIdentity(f);
    await f.batch().markErrorAndSkip(old);await f.tick(700);await f.tick(10001);
    assert.equal(f.state().currentIndex,1);assert.equal(f.api.canMarkErrorAndSkip(f.state()),true);
    assert.equal(await f.batch().markErrorAndSkip(old),false);assert.equal(f.state().currentIndex,1);assert.equal(f.clicks(),2);
});
test('post-submit error permits manual resolution but rate limit never does',async()=>{
    const f=fixture({uncertain:true});await f.start();await f.tick(10001);const c=f.state();c.state='error';c.queue[0].status='error';f.api.save(c);
    assert.equal(f.api.canMarkErrorAndSkip(f.state()),true);f.options.rateLimited=true;
    assert.equal(await f.batch().markErrorAndSkip(manualIdentity(f)),false);assert.equal(f.state().state,'rate_limited');assert.equal(f.state().currentIndex,0);
});

test('archive quota failure cannot revive a stopped uncertain attempt or submit again',async()=>{
 const f=fixture({uncertain:true,archiveFailure:true});await f.start(2);await f.tick(10001);
 f.batch().stop();const stopped=f.state();assert.equal(stopped.state,'cancelled');
 assert.ok(stopped.queue[0].attempt.beforeSnapshot);f.reload();await f.tick(100000);
 assert.equal(f.clicks(),1);assert.deepEqual(f.state(),stopped);assert.equal(f.panel(),false);
});
