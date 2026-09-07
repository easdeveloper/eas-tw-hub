// Run: node --test tests/mass-snipe-precise.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ EAS: { Selectors: {}, Adapters: {} } });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../services/mass-snipe-precise.js'), 'utf8'), context);
const precise = context.EAS.MassSnipePrecise;

const fixture = (options = {}) => {
    let monotonic = 0, shift = 0, valid = true, clicks = 0, reads = 0, nextId = 0;
    const timers = new Map(), delays = [], reports = [], cancellations = [];
    const base = Date.UTC(2026, 8, 7, 13, 40, 30);
    const scheduler = precise.createScheduler({
        targetLaunchTime: base + 4271, latencyCompensation: 93, explicitlyEnabled: true,
        serverNow: () => { reads++; return base + monotonic + shift; }, monotonicNow: () => monotonic,
        schedule: (callback, delay) => { delays.push(delay); timers.set(++nextId, { callback, deadline: monotonic + delay }); return nextId; },
        unschedule: (id) => timers.delete(id), canFire: () => valid, claim: () => true,
        button: { click: () => { clicks++; options.onClick?.(); } },
        onResult: (result) => reports.push(result), onCancel: (reason) => cancellations.push(reason), ...options
    });
    return { scheduler, timers, delays, reports, cancellations,
        get clicks() { return clicks; }, get reads() { return reads; }, get time() { return monotonic; },
        invalidate() { valid = false; }, shift(value) { shift = value; },
        step(extraDelay = 0) {
            const next = [...timers.entries()].sort((a, b) => a[1].deadline - b[1].deadline)[0];
            assert.ok(next, 'a timer is pending');
            timers.delete(next[0]);
            monotonic = Math.max(monotonic + 0.25, next[1].deadline) + extraDelay;
            next[1].callback();
        },
        finish() { for (let count = 0; timers.size && count < 1000; count++) this.step(); assert.equal(timers.size, 0); }
    };
};

test('fireTime subtracts compensation without timezone conversion or second rounding', () => {
    const target = Date.UTC(2026, 8, 7, 13, 40, 34, 271);
    assert.equal(precise.calculateFireTime(target, 93), Date.UTC(2026, 8, 7, 13, 40, 34, 178));
    assert.equal(precise.calculateFireTime(target, 0), target);
    for (const value of [-1, NaN, Infinity, 0.5, '93']) assert.throws(() => precise.calculateFireTime(target, value));
    assert.throws(() => precise.calculateFireTime(NaN, 0));
});

test('progressive timer boundaries', () => {
    assert.equal(precise.nextDelay(5000), 250);
    assert.equal(precise.nextDelay(1001), 1);
    assert.equal(precise.nextDelay(1000), 25);
    assert.equal(precise.nextDelay(101), 1);
    assert.equal(precise.nextDelay(100), 2);
    assert.equal(precise.nextDelay(11), 1);
    assert.equal(precise.nextDelay(10), 0);
    assert.equal(precise.nextDelay(0), 0);
});

test('explicit activation and confirmation are required; no click before start', () => {
    const disabled = fixture({ explicitlyEnabled: false });
    assert.equal(disabled.clicks, 0); assert.equal(disabled.timers.size, 0);
    assert.throws(() => disabled.scheduler.start());
    const missing = fixture(); missing.invalidate(); assert.throws(() => missing.scheduler.start());
    assert.equal(missing.clicks, 0);
});

test('compensated click traverses all phases and happens exactly once', () => {
    const f = fixture(); assert.equal(f.scheduler.start(), true); assert.equal(f.scheduler.start(), false);
    f.finish();
    assert.equal(f.clicks, 1); assert.equal(f.scheduler.state, 'fired');
    assert.equal(f.reports.length, 1);
    assert.ok(f.reports[0].schedulerErrorMs >= 0 && f.reports[0].schedulerErrorMs < 1);
    assert.equal(f.reports[0].actualPerformanceTime, f.time);
    for (const delay of [250, 25, 2, 0]) assert.ok(f.delays.includes(delay));
    assert.equal(f.scheduler.start(), false); f.scheduler.cancel(); assert.equal(f.clicks, 1);
});

test('final window uses the monotonic anchor even if the server sample changes', () => {
    const f = fixture(); f.scheduler.start();
    while (f.delays.at(-1) !== 0) f.step();
    const reads = f.reads;
    f.shift(12 * 3600000);
    f.finish();
    assert.equal(f.reads, reads, 'no wall-clock reads in final window');
    assert.equal(f.clicks, 1); assert.ok(Math.abs(f.reports[0].schedulerErrorMs) < 1);
});

test('clock corrections before the final window are resampled', () => {
    const f = fixture(); f.scheduler.start(); f.shift(100); f.finish();
    assert.ok(f.time < 4100); assert.ok(Math.abs(f.reports[0].schedulerErrorMs) < 1);
});

test('cancellation defeats even an already queued callback', () => {
    const f = fixture(); f.scheduler.start();
    const callback = [...f.timers.values()][0].callback;
    f.scheduler.cancel(); callback();
    assert.equal(f.clicks, 0); assert.equal(f.timers.size, 0); assert.equal(f.scheduler.state, 'cancelled');
});

test('leaving confirmation or losing the single-use claim prevents sending', () => {
    const lost = fixture(); lost.scheduler.start(); lost.invalidate(); lost.step();
    assert.equal(lost.clicks, 0); assert.equal(lost.scheduler.state, 'cancelled');
    const claimed = fixture({ claim: () => false }); claimed.scheduler.start(); claimed.finish();
    assert.equal(claimed.clicks, 0); assert.equal(claimed.scheduler.state, 'cancelled');
});

test('past compensated deadlines are rejected, not sent immediately', () => {
    const f = fixture({ targetLaunchTime: Date.UTC(2026, 8, 7, 13, 40, 30), latencyCompensation: 93 });
    assert.throws(() => f.scheduler.start(), /passou/); assert.equal(f.clicks, 0);
});

test('late callback measures actual error and does not claim server delivery', () => {
    const f = fixture(); f.scheduler.start();
    while (f.delays.at(-1) !== 0) f.step();
    f.step(20);
    assert.equal(f.clicks, 1); assert.ok(f.reports[0].schedulerErrorMs > 0);
    assert.equal(f.reports[0].schedulerErrorMs, f.reports[0].actualClickTime - f.reports[0].fireTime);
    assert.equal(f.reports[0].serverDeliveryTime, undefined);
});

test('click exception or reentrant start never retries', () => {
    let f;
    f = fixture({ onClick: () => { assert.equal(f.scheduler.state, 'fired'); assert.equal(f.scheduler.start(), false); throw new Error('blocked'); } });
    f.scheduler.start(); f.finish();
    assert.equal(f.clicks, 1); assert.equal(f.reports[0].clickError.message, 'blocked');
    assert.equal(f.scheduler.start(), false);
});
