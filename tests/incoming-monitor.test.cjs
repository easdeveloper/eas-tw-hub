const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function fixture() {
    let now = 1790800000000, rows = [], requestError = null, transportError = null, waits = null, reads = 0, labels = [], messages = [], next = 1;
    const storage = new Map(), held = new Set(), timers = new Map(), logs = [];
    const window = { game_data: { village: { id: 1 } }, addEventListener() {}, removeEventListener() {},
        EASDiscordBridge: { configured: () => true }, setTimeout: (fn, ms) => { const id = next++; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id) };
    const navigator = { locks: { request: async (key, options, fn) => {
        if (typeof options === 'function') { fn = options; options = {}; }
        if (held.has(key)) return fn(null);
        held.add(key); try { return await fn({}); } finally { held.delete(key); }
    } } };
    const EAS = { IncomingSocket: { start() {}, stop() {}, status: () => ({state:'connected'}) }, World: { getWorldName: () => 'br143', getPlayer: () => ({ id: 7 }) },
        Logger: { info: (...args) => logs.push(args) }, MassSnipeExecution: { getCurrentServerTimeMs: () => now },
        IncomingParser: { coordinate: text => /\((\d+\|\d+)\)/.exec(text)?.[1] || null },
        IncomingTransport: { check() {}, pace: async () => {}, overview: async () => { reads++; if (waits) await waits; if (requestError) throw Error(requestError); return structuredClone(rows); },
            travel: async () => ({ ram: 600000, catapult: 600000, spy: 300000 }),
            rename: async (entry, value) => { labels.push({ id: entry.commandId, value }); },
            discord: async entry => { messages.push(structuredClone(entry)); if (transportError) throw Error(transportError); return { id: entry.discord.messageId || '999' }; } } };
    const context = vm.createContext({ EAS, window, navigator, AbortController, URL, console, Date: class extends Date { static now() { return now; } },
        localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
        clearTimeout: window.clearTimeout, clearInterval() {} });
    for (const path of ['core/runtime.js', 'services/incoming-model.js', 'services/incoming-store.js', 'services/incoming-monitor.js']) vm.runInContext(fs.readFileSync(path, 'utf8'), context);
    const store = EAS.IncomingStore, state = store.read();state.config = { enabled: true, labels: true, discord: true };store.write(state);
    const row = (id, extra = {}) => ({ commandId: id, source: { id: '5411', coords: '507|428', name: 'Origin (507|428)' }, target: { id: '2593', coords: '520|452', name: 'Target' }, attacker: { id: '2', name: 'Player' }, arrivalAt: now + 600000, arrivalText: 'today', distance: 27.3, name: 'Attack', watchtower: { state: 'watching', units: [] }, attackSize: { key: 'small' }, ...extra });
    return { EAS, api: EAS.IncomingMonitor, store, context, window, timers, logs, row, held,
        rows: value => { rows = value; }, reads: () => reads, labels, messages,
        advance: (ms = 60000) => { now += ms; }, requestError: value => { requestError = value; }, transportError: value => { transportError = value; }, wait: value => { waits = value; },
        event: () => store.record({ type: 'attack', receivedAt: now, detectedAt: now, target: '520|452' }) };
}
test('empty baseline persists across restart; subsequent incoming alerts once', async () => {
    const f=fixture();f.api.start();await f.api.reconcile();
    assert.equal(f.store.read().initialized,true);
    assert.equal(Object.keys(f.store.read().attacks).length,0);
    assert.equal(f.messages.length,0);
    assert.ok(f.logs.some(log=>log[1]==='BASELINE_EMPTY' && log[2].persisted));
    f.api.stop();f.api.start();f.advance();await f.api.reconcile();
    assert.equal(f.logs.filter(log=>log[1]==='BASELINE_EMPTY').length,1);
    f.advance();await f.event();f.rows([f.row('1992212583')]);await f.api.reconcile();
    assert.equal(f.messages.length,1);assert.equal(f.labels.length,1);
    assert.ok(f.logs.some(log=>log[1]==='NEW_INCOMING'));
    assert.ok(f.logs.some(log=>log[1]==='RECONCILE_RESULT' && log[2].count===1 && log[2].newCount===1 && log[2].knownCount===0));
    assert.ok(f.logs.some(log=>log[1]==='DISCORD_SENT'));
    f.api.stop();f.api.start();f.advance();await f.api.reconcile();
    assert.equal(f.messages.length,1);assert.equal(f.labels.length,1);
});
test('unique speeds and equal-speed groups preserve uncertainty and initial timing', () => {
    const f = fixture(), classify = f.EAS.IncomingModel.classify;
    assert.equal(classify(600000, 0, { ram: 600000, catapult: 600000 }).speedClass, 'RAM_OR_CATAPULT');
    assert.equal(classify(600000, 0, { knight: 600000, light: 600000 }).speedClass, 'LIGHT_OR_PALADIN');
    assert.equal(classify(600000, 0, { spear: 600000, axe: 600000 }).speedClass, 'SPEAR_OR_AXE');
    assert.equal(classify(600000, 0, { snob: 600000 }).speedClass, 'NOBLE');
    assert.equal(classify(600000, 10000, { snob: 600000 }).speedClass, 'UNKNOWN');
    assert.equal(classify(600000, null, { snob: 600000 }).speedClass, 'UNKNOWN');
});
test('startup baselines only, new attack labels once, Discord create then edit existing ID, navigation keeps identity', async () => {
    const f = fixture(); f.rows([f.row('1')]); f.api.start(); await f.api.reconcile();
    assert.equal(f.store.read().attacks['1'].state, 'BASELINED');assert.equal(f.messages.length, 0);assert.equal(f.labels.length, 0);
    f.advance(); const attack=f.row('2');await f.event();f.rows([f.row('1'),attack]);await f.api.reconcile();
    assert.equal(f.labels.length, 1);assert.ok(f.labels[0].value.includes('/'));assert.equal(f.messages.length, 1);
    const first=f.store.read().attacks['2'].firstDetectedAt;
    f.advance();await f.api.reconcile();assert.equal(f.labels.length,1);assert.equal(f.messages.length,1);
    attack.name=f.labels[0].value;attack.watchtower={state:'detected',units:['ram']};f.rows([f.row('1'),attack]);f.advance();await f.api.reconcile();
    assert.equal(f.messages.length,2);assert.equal(f.messages[1].discord.messageId,'999');assert.equal(f.labels.length,2);
    assert.equal(f.store.read().attacks['2'].firstDetectedAt,first);assert.equal(f.store.read().attacks['2'].classification.candidates.length,2);
    f.api.stop();f.api.start();f.advance();await f.api.reconcile();assert.equal(f.messages.length,2);
});
test('reconciliation is single-flight, rate bounded, failures terminate after three attempts', async () => {
    const f=fixture();let release;f.wait(new Promise(resolve=>release=resolve));f.api.start();
    const a=f.api.reconcile(),b=f.api.reconcile();assert.equal(a,b);assert.equal(f.reads(),1);release();await a;f.wait(null);
    await f.api.reconcile();assert.equal(f.reads(),1);
    f.requestError('INCOMING_INCOMPLETE_PAGE');for(const ms of [60000,5000,15000]){f.advance(ms);await f.api.reconcile();}
    assert.equal(f.store.read().failures,3);f.advance(60000);await f.api.reconcile();assert.equal(f.reads(),4);
});
test('Discord response loss persists uncertain intent and never retries creation on reload', async () => {
    const f=fixture();f.rows([f.row('1')]);f.api.start();await f.api.reconcile();f.advance();f.rows([f.row('1'),f.row('2')]);f.transportError('lost');
    await f.api.reconcile();assert.equal(f.messages.length,1);assert.equal(f.store.read().attacks['2'].discord.status,'uncertain');
    f.api.stop();f.api.start();f.advance();await f.api.reconcile();assert.equal(f.messages.length,1);
});
test('stop during fetch suppresses all actions; row disappearance ends only on proven response', async () => {
    const f=fixture();let release;f.wait(new Promise(resolve=>release=resolve));f.api.start();const p=f.api.reconcile();f.api.stop();release();await p;
    assert.equal(f.messages.length,0);assert.equal(f.store.read().initialized,false);
    f.wait(null);f.api.start();f.advance();f.rows([f.row('1')]);await f.api.reconcile();f.advance();f.rows([f.row('2')]);await f.api.reconcile();
    assert.equal(f.store.read().attacks['1'].state,'ENDED');
});
test('multiple same-target new commands cannot share a guessed detection time; storage is bounded', () => {
    const f=fixture(),state=f.store.read();state.initialized=true;
    f.EAS.IncomingModel.merge(state,[f.row('1'),f.row('2')],[{type:'attack',target:'520|452',detectedAt:1,receivedAt:1}],2);
    assert.equal(state.attacks['1'].firstDetectedAt,null);assert.equal(state.attacks['2'].firstDetectedAt,null);
    state.attacks=Object.fromEntries(Array.from({length:2001},(_,i)=>[String(i),{}]));assert.throws(()=>f.store.write(state),/LIMIT/);
});
test('attack hint advances watchtower timer and hints arriving during fetch are not lost', async () => {
    const f=fixture();f.rows([f.row('1')]);f.api.start();
    // Run the real runtime timer once instead of calling reconcile manually.
    const initial=[...f.timers.entries()][0];f.timers.delete(initial[0]);initial[1].fn();await f.api.reconcile();
    f.advance();f.rows([f.row('1'),f.row('2')]);await f.api.reconcile();
    assert.equal([...f.timers.values()][0].ms,60000);
    f.api.signal('attack',{target_village_name:'Target (520|452)'});await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].ms,250);
    let release;f.wait(new Promise(resolve=>release=resolve));f.advance();const pending=f.api.reconcile();
    f.api.signal('command_count');await new Promise(resolve=>setImmediate(resolve));
    release();await pending;assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].ms,250);
});
test('duplicate tab event burst uses earliest timestamp once, never reused for a later command', () => {
    const f=fixture(),state=f.store.read();state.initialized=true;
    const events=[{id:'a',type:'attack',target:'520|452',detectedAt:1000,receivedAt:1000},{id:'b',type:'attack',target:'520|452',detectedAt:1008,receivedAt:1008}];
    f.EAS.IncomingModel.merge(state,[f.row('1')],events,1100);assert.equal(state.attacks['1'].firstDetectedAt,1000);
    f.EAS.IncomingModel.merge(state,[f.row('1'),f.row('2')],events,1200);assert.equal(state.attacks['2'].firstDetectedAt,null);
});
test('attack packet preceding overview row keeps initial time through bounded visibility retries', async () => {
    const f=fixture();f.api.start();f.rows([f.row('1')]);await f.api.reconcile();f.advance(3000);await f.event();
    const later=f.row('2');await f.api.reconcile();assert.equal(f.messages.length,0);
    assert.equal(f.store.read().nextWatchAt-f.context.Date.now(),3000);
    f.advance(3000);f.rows([f.row('1'),later]);await f.api.reconcile();
    assert.equal(f.store.read().attacks['2'].classification.speedClass,'RAM_OR_CATAPULT');assert.equal(f.messages.length,1);
});

const flushEvents = () => new Promise(resolve => setImmediate(resolve));
async function fireTimer(f) {
    const [id,timer]=[...f.timers.entries()][0];
    f.timers.delete(id);f.advance(timer.ms);timer.fn();await flushEvents();
}
for(const [type,data] of [['attack',{target_village_name:'Target (520|452)'}],['command_count',{command_type:'attack'}],['command_count',{command_type:'incoming_attack'}]]) {
    test(`socket ${type}/${data.command_type||''} executes scheduled reconciliation`,async()=>{
        const f=fixture();f.api.start();await fireTimer(f);
        f.advance(3000);f.rows([f.row('2')]);f.api.signal(type,data);await flushEvents();
        assert.equal(f.timers.size,1);await fireTimer(f);
        assert.equal(f.reads(),2);assert.equal(f.messages.length,1);
        assert.ok(f.logs.some(x=>x[1]==='RECONCILE_SCHEDULED'));
        assert.ok(f.logs.some(x=>x[1]==='RECONCILE_START'));
        assert.ok(f.logs.some(x=>x[1]==='RECONCILE_RESULT'));
    });
}
test('three-packet burst and reconnect retain earliest timer and notify once',async()=>{
    const f=fixture();f.api.start();await fireTimer(f);f.advance(3000);f.rows([f.row('2')]);
    f.api.signal('attack',{target_village_name:'Target (520|452)',secret:'DO_NOT_LOG'});
    await flushEvents();const timer=[...f.timers.keys()][0];
    for(const command_type of ['attack','incoming_attack'])f.api.signal('command_count',{command_type});
    f.api.signal('reconnect',{});await flushEvents();
    assert.equal(f.timers.size,1);assert.equal([...f.timers.keys()][0],timer);
    await fireTimer(f);assert.equal(f.reads(),2);assert.equal(f.messages.length,1);
    assert.ok(!JSON.stringify(f.logs).includes('DO_NOT_LOG'));
    f.advance(60000);await f.api.reconcile();assert.equal(f.messages.length,1);
});
test('disabled and persisted failure guard explain skips without requests',async()=>{
    const f=fixture();f.api.signal('attack');await flushEvents();assert.equal(f.timers.size,0);
    f.api.start();const state=f.store.read();state.failures=3;f.store.write(state);await fireTimer(f);
    assert.equal(f.reads(),0);assert.ok(f.logs.some(x=>x[2].reason==='FAILURE_LIMIT'));
    assert.ok(f.logs.some(x=>x[2].reason==='MONITOR_DISABLED'));
});
test('busy cross-tab lock gets bounded deferred reconciliation instead of losing event',async()=>{
    const f=fixture();f.api.start();f.held.add(f.store.key()+':run');await fireTimer(f);
    assert.equal(f.reads(),0);assert.equal(f.timers.size,1);
    f.held.clear();await fireTimer(f);assert.equal(f.reads(),1);
    f.advance(60000);f.held.add(f.store.key()+':run');await f.api.reconcile();
    for(let i=0;i<3;i++)await fireTimer(f);
    assert.equal(f.timers.size,0);assert.ok(f.logs.some(x=>x[2].reason==='LOCK_RETRY_LIMIT'));
});
test('restart during old in-flight read resumes new lifecycle after old promise settles',async()=>{
    const f=fixture();let release;f.wait(new Promise(r=>release=r));f.api.start();const old=f.api.reconcile();
    f.api.stop();f.api.start();await fireTimer(f);assert.equal(f.reads(),1);
    release();await old;f.wait(null);assert.equal(f.timers.size,1);
    await fireTimer(f);await fireTimer(f);assert.equal(f.reads(),2);assert.equal(f.store.read().initialized,true);
});
