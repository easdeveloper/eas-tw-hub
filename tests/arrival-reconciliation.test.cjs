const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

function fixture(type = 'support') {
    let now = 1790316299155, reads = 0, finalized = 0, next = 1, persisted;
    const timers = new Map(), storage = new Map(), listeners = new Map(), logs = [];
    const runtime = { timers: new Set() };
    const mission = { id: 'mission', world: 'test', playerId: '7', sourceModule: 'arrival-planner',
        attemptId: 'attempt', submitAttemptId: 'attempt', tabExecutionId: 'tab', villageId: '4286',
        villageCoord: '523|438', targetVillageId: '9113', targetCoord: '524|438', commandType: type, type,
        troops: { light: 1 }, expectedTroopsSnapshot: { light: 1 }, travelTimeMs: 600000,
        submitStartedAt: now, status: 'submitting', finalClickConsumed: true, arrivalAuthorized: true,
        submitAuthorization: { used: true, missionId: 'mission', attemptId: 'attempt', allowedStage: 'attack-confirmation' },
        outgoingBaseline: { missionId: 'mission', attemptId: 'attempt', sourceVillageId: '4286',
            targetCoord: '524|438', commandType: type, capturedAt: now - 100, commandIds: ['100'] } };
    mission.verification = { missionId: 'mission', attemptId: 'attempt', submitAttemptId: 'attempt',
        tabExecutionId: 'tab', sourceVillageId: '4286', targetCoord: '524|438', commandType: type,
        troops: { light: 1 }, travelTimeMs: 600000, submitStartedAt: now, submitWallTimeMs: now,
        submitServerTimeMs: now, baseline: mission.outgoingBaseline, deadline: now + 15000, attempts: 0, status: 'pending' };
    persisted = JSON.stringify({ missions: [mission], tabExecutions: { tab: { tabExecutionId: 'tab', missionId: 'mission' } } });
    let observed = { available: true, commands: [] }, storageFails = false;
    const scheduler = { load: () => JSON.parse(persisted), updateMission(id, change) {
        if (storageFails) throw Error('storage full');
        const state = this.load(), current = state.missions.find(m => m.id === id);
        Object.assign(current, change); persisted = JSON.stringify(state); return current;
    } };
    const window = { location: { href: 'https://test/game.php?screen=place&village=4286&h=SECRET' },
        game_data: { village: { id: 4286 } },
        document: { querySelector: () => null, getElementById: () => null },
        setTimeout(fn, delay) { const id = next++; timers.set(id, { fn, at: now + delay }); return id; },
        clearTimeout: id => timers.delete(id), addEventListener: (name, fn) => listeners.set(name, fn),
        removeEventListener: name => listeners.delete(name) };
    const EAS = { MissionScheduler: scheduler, ArrivalPlanner: { clock: () => now, log: (event, detail) => logs.push({ event, detail }) },
        FakesExecution: { readOutgoingCommands() { reads++; return observed; } },
        ScheduledMissionExecution: { runtimeFor: () => runtime, readTabContext: () => ({ tabExecutionId: 'tab' }),
            contextMatchesPage: () => ({ valid: true }), renderConfirmationPanel() {},
            finalizeScheduledAttackSuccess(m) { finalized++; scheduler.updateMission(m.id, { status: 'sent', completed: true }); } } };
    const context = vm.createContext({ EAS, window, URL, Date: class extends Date { static now() { return now; } },
        localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) } });
    const load = () => vm.runInContext(fs.readFileSync('services/arrival-execution.js', 'utf8'), context);
    load();
    return { EAS, window, runtime, timers, logs, scheduler, mission, current: () => scheduler.load().missions[0],
        get api() { return EAS.ArrivalExecution; }, observed: value => { observed = value; },
        next() { const [id, t] = [...timers].sort((a, b) => a[1].at - b[1].at)[0]; timers.delete(id); now = t.at; t.fn(); },
        reload() { listeners.get('pagehide')?.(); delete EAS.ArrivalExecution; load(); },
        storageFails() { storageFails = true; }, reads: () => reads, finalized: () => finalized,
        command: (id = '200', extra = {}) => ({ id, type, target: '524|438', sourceVillageId: '4286', ...extra }) };
}

for (const type of ['support', 'attack']) test(`${type}: persisted attempt survives navigation, shared outgoing proof completes once`, () => {
    const f = fixture(type);
    f.window.location.href += '&try=confirm';
    f.api.outcome(f.current(), f.window);
    assert.equal(f.reads(), 0, 'confirmation document is not outgoing evidence');
    assert.equal(f.current().status, 'submitting');
    const deadline = f.current().verification.deadline;
    f.reload(); f.window.location.href = 'https://test/game.php?screen=place&village=4286';
    f.observed({ available: true, commands: [f.command('100'), f.command()] });
    f.api.outcome(f.current(), f.window);
    assert.equal(f.current().status, 'sent'); assert.equal(f.current().outgoingCommandId, '200');
    assert.equal(f.current().verification.deadline, deadline);
    assert.equal(f.current().verification.submitAttemptId, 'attempt');
    assert.equal(f.timers.size, 0); assert.equal(f.finalized(), 1);
    f.api.outcome(f.current(), f.window); assert.equal(f.finalized(), 1);
    assert.equal(f.api.allowed(f.current()), false);
});

test('delayed DOM retries once per runtime, no requests or duplicate jobs, stops on proof', () => {
    const f = fixture(); f.observed({ available: false, commands: [], reason: 'DOM_LOADING' });
    f.api.outcome(f.current(), f.window); f.api.outcome(f.current(), f.window);
    assert.equal(f.reads(), 1); assert.equal(f.timers.size, 1);
    f.next(); assert.equal(f.current().verification.attempts, 2);
    f.observed({ available: true, commands: [f.command()] }); f.next();
    assert.equal(f.current().status, 'sent'); assert.equal(f.timers.size, 0);
    assert.ok(f.logs.some(l => l.event === 'MISSION_RECONCILIATION_RETRY'));
    assert.ok(!JSON.stringify(f.logs).includes('SECRET'));
});

test('existing same-target command never proves new send; finite retries exhaust without authorization', () => {
    const f = fixture(); f.observed({ available: true, commands: [f.command('100')] });
    f.api.outcome(f.current(), f.window);
    while (f.timers.size) f.next();
    assert.equal(f.reads(), 8); assert.equal(f.current().status, 'verification-required');
    assert.equal(f.current().verification.reason, 'NO_NEW_COMMAND');
    assert.equal(f.current().arrivalAuthorized, false); assert.equal(f.api.allowed(f.current()), false);
    f.reload(); f.api.outcome(f.current(), f.window); assert.equal(f.reads(), 8); assert.equal(f.finalized(), 0);
});

test('navigation does not renew attempt count or deadline; cancellation stops pending checks', () => {
    const f = fixture(); f.api.outcome(f.current(), f.window); f.next();
    const v = f.current().verification; f.reload();
    assert.equal(f.timers.size, 0); f.api.outcome(f.current(), f.window);
    assert.equal(f.current().verification.attempts, v.attempts + 1);
    assert.equal(f.current().verification.deadline, v.deadline);
    f.scheduler.updateMission('mission', { status: 'cancelled' }); f.next();
    assert.equal(f.timers.size, 0); assert.equal(f.finalized(), 0);
});

test('timing disambiguates early baseline; missing, old or ambiguous evidence never proves success', () => {
    const f = fixture(), v = f.current().verification; v.baseline.capturedAt -= 120000;
    const match = commands => f.api.matchOutgoing(v, { available: true, commands });
    assert.equal(match([f.command()]).reason, 'TIMING_UNAVAILABLE_FOR_EARLY_BASELINE');
    const timing = { clock: 'server-wall', arrivalMs: v.submitWallTimeMs + v.travelTimeMs + 8, precisionMs: 1 };
    assert.equal(match([f.command('200', { evidence: timing })]).match.id, '200');
    assert.equal(match([f.command('200', { evidence: { ...timing, arrivalMs: timing.arrivalMs - 60000 } })]).reason, 'ARRIVAL_WINDOW_MISMATCH');
    assert.equal(match([f.command('200', { type: 'attack' })]).match, undefined);
    assert.equal(match([f.command('200'), f.command('201')]).reason, 'AMBIGUOUS_NEW_COMMANDS');
    assert.equal(match([f.command('200', { target: null })]).reason, 'AMBIGUOUS_NEW_COMMANDS');
    assert.equal(match([f.command('200', { sourceVillageId: '99' })]).match, undefined);
});

test('altered attempt and unavailable baseline fail closed; storage failure cancels runtime without resend', () => {
    const f = fixture(); f.scheduler.updateMission('mission', { verification: { ...f.current().verification, attemptId: 'other' } });
    f.api.outcome(f.current(), f.window); assert.equal(f.current().status, 'verification-required');
    const g = fixture(); g.api.outcome(g.current(), g.window); g.storageFails(); g.next();
    assert.equal(g.timers.size, 0); assert.equal(g.api.allowed(g.current()), false); assert.equal(g.finalized(), 0);
});

test('malformed retry state cannot create an unbounded zero-delay loop', () => {
    for (const change of [{ attempts: undefined }, { attempts: -1 }, { attempts: 1.5 }, { deadline: Infinity }]) {
        const f = fixture(); f.scheduler.updateMission('mission', { verification: { ...f.current().verification, ...change } });
        f.api.outcome(f.current(), f.window);
        assert.equal(f.current().status, 'verification-required'); assert.equal(f.timers.size, 0);
    }
});
