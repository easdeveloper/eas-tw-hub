const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = vm.createContext({ EAS: {}, window: { addEventListener() {} } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../services/minting.js'), 'utf8'), context);
const service = context.EAS.Minting;
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
function fixture(options = {}) {
    let state, now = 10000, locked = false, sequence = 0;
    const timers = new Map(), calls = [], groups = [];
    const villages = Array.from({ length: 7 }, (_, i) => ({ villageId: String(i + 1), villageName: `V${i}`, eligible: true, maxMintable: 10 }));
    const deps = {
        read: () => clone(state), write: (value) => { state = clone(value); return true; }, now: () => now,
        setTimer: (fn, delay) => { timers.set(++sequence, { fn, at: now + delay }); return sequence; }, cancelTimer: (id) => timers.delete(id),
        available: () => true, blockedReason: () => 'Contract not verified',
        lock: async (fn) => { if (locked) return false; locked = true; try { return await fn(); } finally { locked = false; } },
        discover: async (id) => { groups.push(id); return { groupName: 'Group', villages }; }, contains: async () => true,
        execute: async (row, { beforePost }) => { if (!beforePost(row.requested)) return {attempted:0,confirmed:0}; calls.push(row); return { status: 'CONFIRMED', attempted: row.requested, confirmed: row.requested }; }, ...options
    };
    let controller = service.createController(deps);
    controller.configure({ groupId: '12', requestedPerVillage: 1, intervalHours: 0.5 });
    return { deps, timers, calls, groups, villages, get c() { return controller; },
        reload() { controller.dispose(); controller = service.createController(deps); return controller.restore(); },
        async next() { const [id, timer] = [...timers.entries()].sort((a,b) => a[1].at-b[1].at)[0]; timers.delete(id); now = Math.max(now, timer.at); await timer.fn(); },
        advance(ms) { now += ms; }, get now() { return now; }
    };
}
test('7 eligible villages x 1, only confirmed coins count', async () => {
    const f = fixture(); await f.c.run();
    assert.equal(f.c.read().lastCycleRequested, 7); assert.equal(f.c.read().totalConfirmedCoins, 7); assert.equal(f.calls.length, 7);
});
test('7 eligible villages x 2 requests 14', async () => {
    const f = fixture(); f.c.configure({ groupId: '12', requestedPerVillage: 2, intervalHours: 0.5 }); await f.c.run();
    assert.equal(f.c.read().lastCycleRequested, 14); assert.equal(f.c.read().totalConfirmedCoins, 14);
});
test('Academy, resources and unknown information are distinguished', async () => {
    const f = fixture(); f.villages[0].eligible = false; f.villages[0].reason = 'NO_ACADEMY'; f.villages[1].eligible = false; f.villages[2].maxMintable = 0;
    await f.c.run(); assert.equal(f.calls.length, 4);
    assert.deepEqual(clone(f.c.read().results.slice(0,3).map(r => r.status)), ['NO_ACADEMY','NOT_ELIGIBLE','INSUFFICIENT_RESOURCES']);
});
test('sent request without confirmation never increases total and stops retries', async () => {
    const f = fixture({ execute: async (row, {beforePost}) => { beforePost(row.requested); return {confirmed:100}; } }); await f.c.start();
    assert.equal(f.c.read().totalConfirmedCoins, 0); assert.equal(f.c.read().lastCycleAttempted, 1);
    assert.equal(f.c.read().status, 'ERROR'); assert.equal(f.timers.size, 0);
});
test('WAITING reload restores exactly one timer', async () => {
    const f = fixture(); await f.c.start(); const deadline = f.c.read().nextRunAt;
    await f.reload(); await f.c.restore(); assert.equal(f.timers.size, 1); assert.equal(f.c.read().nextRunAt, deadline);
});
test('overdue recovery runs at most one cycle and establishes new deadline', async () => {
    const f = fixture(); await f.c.start(); f.advance(3600000 * 5); await f.reload(); await f.next();
    assert.equal(f.calls.length, 14); assert.equal(f.c.read().nextRunAt, f.now + 1800000); assert.equal(f.timers.size, 1);
});
test('Execute Now OFF is one-shot without scheduling', async () => {
    const f = fixture(); await f.c.run(); assert.equal(f.c.read().automation, false); assert.equal(f.timers.size, 0); assert.equal(f.c.read().nextRunAt, null);
});
test('Execute Now ON recalculates deadline after completion', async () => {
    const f = fixture(); await f.c.start(); f.advance(15000); await f.c.run();
    assert.equal(f.c.read().nextRunAt, f.now + 1800000); assert.equal(f.calls.length, 14); assert.equal(f.timers.size, 1);
});
test('simultaneous Start/Now blocked by reentrancy guard', async () => {
    let release; const wait = new Promise(resolve => release = resolve);
    const f = fixture({ discover: async () => { await wait; return { groupName: 'Group', villages: [] }; } });
    const running = f.c.start(); assert.equal(await f.c.run(), false); assert.equal(await f.c.start(), false); release(); await running;
});
test('empty group sends no command', async () => {
    const f = fixture(); f.villages.length = 0; await f.c.run(); assert.equal(f.calls.length, 0); assert.equal(f.c.read().lastCycleRequested, 0);
});
test('decimal hours and invalid intervals', () => {
    assert.equal(service.intervalMs(0.5), 1800000); assert.equal(service.intervalMs('0,5'), 1800000);
    for (const value of [0,-1,'',NaN,Infinity,'foo']) assert.throws(() => service.intervalMs(value));
});
test('group change is used by next cycle', async () => {
    const f = fixture(); await f.c.start(); f.c.configure({ groupId: '99', requestedPerVillage: 2, intervalHours: 1 }); await f.next();
    assert.deepEqual(f.groups, ['12','99']); assert.equal(f.c.read().lastCycleRequested, 14);
});
test('removed village is revalidated and skipped', async () => {
    const f = fixture({ contains: async (_group,id) => id !== '1' }); await f.c.run(); assert.equal(f.calls.length, 6); assert.equal(f.c.read().results[0].status, 'NOT_ELIGIBLE');
});
test('RUNNING recovery is stopped, not replayed', async () => {
    const f = fixture(); f.deps.write({ ...f.c.read(), status: 'RUNNING', automation: true }); await f.reload();
    assert.equal(f.c.read().status, 'ERROR'); assert.equal(f.calls.length, 0); assert.equal(f.timers.size, 0);
});
test('Stop during discovery prevents all actions', async () => {
    let release; const wait = new Promise(resolve => release = resolve);
    const f = fixture({ discover: async () => { await wait; return { groupName: 'Group', villages: f.villages }; } });
    const running = f.c.start(); f.c.stop(); release(); await running;
    assert.equal(f.c.read().status, 'STOPPED'); assert.equal(f.calls.length, 0); assert.equal(f.timers.size, 0);
});
test('production capability gate blocks discovery, requests and timers', async () => {
    const f = fixture({ available: () => false }); await f.c.start();
    assert.equal(f.groups.length, 0); assert.equal(f.calls.length, 0); assert.equal(f.c.read().automation, false); assert.equal(f.c.read().status, 'ERROR');
});
test('cross-controller lock prevents concurrent cycles and stale due timers', async () => {
    const f = fixture(); await f.c.start();
    const second = service.createController(f.deps); await second.restore();
    f.advance(1800000); await Promise.all([f.c.run('timer'), second.run('timer')]);
    assert.equal(f.calls.length, 14);
});
test('missing group and persistence failure never send', async () => {
    const f = fixture({ discover: async () => { throw new Error('Group missing'); } }); await f.c.start();
    assert.equal(f.calls.length, 0); assert.equal(f.c.read().status, 'ERROR');
    f.deps.write = () => false; await f.c.run(); assert.equal(f.calls.length, 0);
});
test('fresh form disappearance is skipped with no attempted coins', async () => {
    const f = fixture({execute:async()=>({status:'NOT_ELIGIBLE',reason:'NO_MINT_FORM',attempted:0,confirmed:0})});
    await f.c.run(); assert.equal(f.c.read().lastCycleAttempted,0); assert.equal(f.c.read().totalConfirmedCoins,0);
    assert.equal(f.c.read().status,'IDLE');
});
test('actual attempted count is the freshly validated amount', async () => {
    const f = fixture({execute:async(row,{beforePost})=>{beforePost(3);return{status:'CONFIRMED',attempted:3,confirmed:3};}});
    f.c.configure({groupId:'12',requestedPerVillage:5,intervalHours:0.5});await f.c.run();
    assert.equal(f.c.read().lastCycleRequested,35);assert.equal(f.c.read().lastCycleAttempted,21);assert.equal(f.c.read().totalConfirmedCoins,21);
});
test('Stop during fresh inspection is honored before POST', async () => {
    let release, entered;const wait=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>entered=resolve);
    let sends=0;
    const f=fixture({execute:async(row,{beforePost})=>{entered();await wait;if(beforePost(1))sends++;return{attempted:0,confirmed:0,reason:'CANCELLED'};}});
    const running=f.c.start();await ready;f.c.stop();release();await running;
    assert.equal(sends,0);assert.equal(f.c.read().lastCycleAttempted,0);assert.equal(f.timers.size,0);
});
test('transient failure persisting a claim aborts the cycle before POST', async () => {
    let sends=0;
    const f=fixture({execute:async(row,{beforePost})=>{if(beforePost(1))sends++;return{status:'CONFIRMED',attempted:1,confirmed:1};}});
    const write=f.deps.write;let rejected=false;
    f.deps.write=value=>{if(!rejected && value.results.some(row=>row.status==='ATTEMPTED')){rejected=true;return false;}return write(value);};
    await f.c.start();assert.equal(sends,0);assert.equal(f.c.read().status,'ERROR');assert.equal(f.timers.size,0);
});
test('each cycle discovers eligibility again: seven then three', async () => {
    const f=fixture();await f.c.start();assert.equal(f.c.read().totalConfirmedCoins,7);
    f.villages.slice(3).forEach(v=>{v.eligible=false;v.reason='NO_MINT_FORM';v.status='NOT_ELIGIBLE';});
    await f.next();assert.equal(f.c.read().lastCycleConfirmed,3);assert.equal(f.c.read().totalConfirmedCoins,10);assert.equal(f.calls.length,10);
    assert.deepEqual(f.groups,['12','12']);
});
test('Stop cancels timers while preserving configuration, total and old logs', async () => {
    const f=fixture();await f.c.start();const previous=f.c.read();f.c.stop();const stopped=f.c.read();
    assert.equal(f.timers.size,0);assert.equal(stopped.automation,false);assert.equal(stopped.nextRunAt,null);
    assert.equal(stopped.totalConfirmedCoins,7);assert.deepEqual(clone(stopped.config),clone(previous.config));
    assert.deepEqual(clone(stopped.logs.slice(0,-1)),clone(previous.logs));
    await f.reload();assert.equal(f.timers.size,0);
});
test('Execute Now stopped: a single eligible village adds one and stays OFF', async () => {
    const f=fixture();f.deps.write({...f.c.read(),totalConfirmedCoins:16,status:'STOPPED'});
    f.villages.splice(1);await f.c.run();assert.equal(f.c.read().totalConfirmedCoins,17);
    assert.equal(f.c.read().automation,false);assert.equal(f.c.read().nextRunAt,null);assert.equal(f.timers.size,0);assert.equal(f.calls.length,1);
});
test('unknown maximum does not skip requested > 1 and logs the limit', async () => {
    const f=fixture({execute:async(row,{beforePost})=>{beforePost(1);return{status:'CONFIRMED',attempted:1,confirmed:1};}});
    f.villages.forEach(v=>v.maxMintable=null);f.c.configure({groupId:'12',requestedPerVillage:5,intervalHours:0.5});
    await f.c.run();assert.equal(f.c.read().lastCycleConfirmed,7);assert.equal(f.c.read().lastCycleAttempted,7);
    assert.ok(f.c.read().logs.some(entry=>entry.level==='WARNING' && entry.message.includes('1 moeda por aldeia')));
});
test('parser status and diagnostics survive discovery without secrets', async () => {
    const diagnostics=[];const f=fixture({diagnostic:detail=>diagnostics.push(detail)});
    f.villages.splice(1);Object.assign(f.villages[0],{eligible:false,status:'PARSE_FAILED',reason:'NO_H_FIELD',stage:'token',h:'must-not-persist'});
    await f.c.run();assert.equal(f.c.read().results[0].status,'PARSE_FAILED');assert.equal(f.c.read().results[0].reason,'NO_H_FIELD');
    assert.deepEqual(clone(diagnostics),[{villageId:'1',stage:'token',reason:'NO_H_FIELD'}]);
    assert.equal(JSON.stringify(f.c.read()).includes('must-not-persist'),false);assert.equal(f.calls.length,0);
});
