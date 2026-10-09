const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = vm.createContext({ EAS: {}, Date, Object, Array, Map, Set, JSON, Number, String, Math, Infinity, Error, RegExp });
vm.runInContext(fs.readFileSync('services/tactical-operation-scheduler-adapter.js', 'utf8'), context);
const api = context.EAS.TacticalOperationSchedulerAdapter;
const plain = value => JSON.parse(JSON.stringify(value));
const source = { id: '10', coord: '500|500', name: 'Source' };
const target = { villageId: '20', coord: '484|527', name: 'Target' };
const command = (slotId, commandType, sendAtMs, quantities, extra = {}) => ({
    slotId, parentSlotId: slotId, trainIndex: null, trainSize: null, commandType,
    source: { ...source }, target: { ...target }, composition: { quantities },
    sendAtMs, desiredArrivalMs: sendAtMs + 10000, travelTimeMs: 10000,
    validationStatus: 'ready', blockers: [], ...extra
});
const trainChildren = count => Array.from({ length: count }, (_, index) => {
    const trainIndex = index + 1;
    const desiredArrivalMs = 900000 + index * 100;
    const travelTimeMs = 10000 + index * 100;
    return command(`slot:nt:${trainIndex}`, 'attack', 890000, {
        snob: 1, axe: 150 + trainIndex, light: 200 - trainIndex,
        ...(trainIndex === 1 ? { ram: 20, catapult: 3, knight: 1 } : {})
    }, { parentSlotId: 'slot:nt', trainIndex, trainSize: count, desiredArrivalMs, travelTimeMs });
});
const snapshot = commands => ({ snapshotKind: 'tactical-approved-operation', version: 1, operationId: 'op-1', revision: 7,
    target, centralArrivalMs: 900000, commands, totals: {}, counts: {}, validation: { valid: true } });
const validSessionEvidence = now => ({ now, sessionAvailable: true, accountValid: true, loggedIn: true, antiBotPresent: false,
    source: { id: source.id, coord: source.coord }, target: { coord: target.coord }, cancelled: false, completed: false });

test('approved ATTACK and SUPPORT commands each map to one execution unit', () => {
    const approved = snapshot([command('attack-1', 'attack', 500000, { axe: 10 }), command('support-1', 'support', 600000, { spear: 20 })]);
    const result = api.deriveExecutionUnits(approved);
    assert.equal(result.valid, true);
    assert.deepEqual(plain(result.units.map(unit => [unit.kind, unit.expectedCommands, unit.commandType])), [
        ['single-command', 1, 'attack'], ['single-command', 1, 'support']
    ]);
    assert.equal(result.units[0].approvedCommand.composition.quantities.axe, 10);
    assert.equal(Object.isFrozen(result.units[0].approvedCommand.composition.quantities), true);
    assert.deepEqual(plain(result.units.map(api.formatExecutionUnitLabel)), ['ATTACK · envio simples', 'SUPPORT · envio simples']);
    assert.equal(result.units.every(unit => unit.kind === api.SINGLE && unit.expectedCommands === 1), true);
});

for (const count of [2, 3, 4, 5]) test(`NT(${count}) maps to one native train execution unit with concrete approved children`, () => {
    const approvedChildren = trainChildren(count);
    const result = api.deriveExecutionUnits(snapshot(approvedChildren));
    assert.equal(result.valid, false);
    assert.equal(result.units.length, 1);
    const [group] = result.units;
    assert.equal(group.kind, 'native-noble-train');
    assert.equal(group.expectedCommands, count);
    assert.equal(group.count, count);
    assert.equal(group.executionSendAtMs, null); assert.equal(group.nativeSubmitAtMs, null);
    assert.equal(group.timingMapping, 'blocked-no-safe-single-native-submit-time-v1');
    assert.equal(group.approvedChildren.length, count);
    assert.deepEqual(plain(group.approvedChildren.map(child => child.composition.quantities)),
        approvedChildren.map(child => child.composition.quantities));
    assert.equal(api.formatExecutionUnitLabel(group), `NT(${count}) · um envio nativo`);
    assert.deepEqual(plain(group.approvedChildren.map(api.formatApprovedChildLabel)), approvedChildren.map((_, index) => `NT${index + 1}/${count}`));
});

test('simple self-parented commands cannot become NT(0), and malformed train labels never print null/null', () => {
    const attack = command('simple-attack', 'attack', 500000, { axe: 5 });
    const support = command('simple-support', 'support', 500000, { spear: 5 });
    const simple = api.deriveExecutionUnits(snapshot([attack, support]));
    assert.equal(simple.units.every(unit => unit.kind === 'single-command'), true);
    assert.equal(simple.units.some(unit => unit.kind === 'native-noble-train' || unit.count === 0), false);
    assert.equal(simple.units.map(api.formatExecutionUnitLabel).some(label => /NT\(0\)|NTnull|null\/null/.test(label)), false);
    const malformed = api.deriveExecutionUnits(snapshot([{ ...attack, slotId: 'child-with-bad-train-meta', parentSlotId: 'nt-parent', trainIndex: null, trainSize: null }]));
    assert.equal(malformed.units[0].kind, 'native-noble-train');
    assert.equal(malformed.units[0].state, 'BLOCKED');
    assert.equal(api.formatExecutionUnitLabel(malformed.units[0]), 'Trem nativo bloqueado');
    assert.equal(api.formatApprovedChildLabel(malformed.units[0].approvedChildren[0]), 'Comando de trem inválido');
    assert.doesNotMatch(`${api.formatExecutionUnitLabel(malformed.units[0])} ${api.formatApprovedChildLabel(malformed.units[0].approvedChildren[0])}`, /NT\(0\)|NTnull|null\/null/);
});

test('mixed operations sort execution units by send time and preserve each approved composition', () => {
    const approvedChildren = trainChildren(2);
    const support = command('support', 'support', 880000, { spear: 5 });
    const attack = command('attack', 'attack', 900000, { axe: 9 });
    const result = api.deriveExecutionUnits(snapshot([attack, ...approvedChildren, support]));
    assert.equal(result.valid, false);
    assert.deepEqual(plain(result.units.map(unit => unit.kind)), ['single-command', 'single-command', 'native-noble-train']);
    assert.deepEqual(plain(result.units.map(unit => unit.executionSendAtMs)), [880000, 900000, null]);
    assert.equal(result.units[0].approvedCommand.composition.quantities.spear, 5);
    assert.equal(result.units[2].approvedChildren[0].composition.quantities.ram, 20);
    assert.equal(result.units[1].approvedCommand.composition.quantities.axe, 9);
});

test('NT children with inconsistent send timing block instead of creating independent sends', () => {
    const children = trainChildren(4);
    children[2].sendAtMs += 100;
    children[2].travelTimeMs -= 100;
    const result = api.deriveExecutionUnits(snapshot(children));
    assert.equal(result.valid, false);
    assert.equal(result.units[0].kind, 'native-noble-train');
    assert.equal(result.units[0].state, 'BLOCKED');
    assert.ok(result.units[0].blockers.includes('NATIVE_NT_NATIVE_TIMING_UNPROVEN'));
});

test('real NT4 per-child send times cannot map to one native submit, while approved arrivals and compositions are preserved', () => {
    const compositions = [
        { snob: 1, axe: 1503, light: 748, ram: 300, catapult: 50 },
        { snob: 1, axe: 1503, light: 748 },
        { snob: 1, axe: 1502, light: 747 },
        { snob: 1, axe: 1502, light: 747 }
    ];
    const travelTimes = [8000, 5000, 5000, 5000];
    const children = compositions.map((quantities, index) => {
        const desiredArrivalMs = 900000 + index * 100;
        const travelTimeMs = travelTimes[index];
        return command(`br143-nt4:${index + 1}`, 'attack', desiredArrivalMs - travelTimeMs, quantities, {
            parentSlotId: 'br143-nt4', trainIndex: index + 1, trainSize: 4,
            desiredArrivalMs, travelTimeMs
        });
    });
    const result = api.deriveExecutionUnits(snapshot(children));
    const [group] = result.units;
    assert.equal(result.valid, false);
    assert.equal(group.kind, 'native-noble-train');
    assert.equal(group.expectedCommands, 4);
    assert.equal(group.executionSendAtMs, null);
    assert.ok(group.blockers.includes('NATIVE_NT_NATIVE_TIMING_UNPROVEN'));
    assert.deepEqual(plain(group.approvedChildren.map(child => child.desiredArrivalMs)), [900000, 900100, 900200, 900300]);
    assert.deepEqual(plain(group.approvedChildren.map(child => child.composition.quantities)), compositions);
});

test('T-10 precheck requires explicit unit authorization, session, identities, and the correct window', () => {
    const unit = api.deriveExecutionUnits(snapshot([command('attack', 'attack', 1000000, { axe: 1 })])).units[0];
    assert.equal(api.advancePrecheck10m(unit, validSessionEvidence(500000)).blockers.includes('PREPARATION_AUTHORIZATION_MISSING'), true);
    const authorized = api.authorizePreparation(unit, { authorizedAt: 1 });
    const ready = api.advancePrecheck10m(authorized, validSessionEvidence(500000));
    assert.equal(ready.state, 'PRECHECK_10M');
    const bot = api.advancePrecheck10m(authorized, { ...validSessionEvidence(500000), antiBotPresent: true });
    assert.equal(bot.state, 'BLOCKED');
    assert.ok(bot.blockers.includes('SESSION_UNAVAILABLE_OR_UNTRUSTED'));
    const wrongSource = api.advancePrecheck10m(authorized, { ...validSessionEvidence(500000), source: { id: '99', coord: source.coord } });
    assert.equal(wrongSource.state, 'PRECHECK_10M', 'current village is not the T-10 source identity');
    const tooEarly = api.advancePrecheck10m(authorized, validSessionEvidence(100000));
    assert.equal(tooEarly.state, 'SCHEDULED');
    assert.equal(tooEarly.nextCheckpoint, 'PRECHECK_10M');
    assert.equal(tooEarly.nextCheckpointAtMs, 400000);
    assert.equal(tooEarly.blockers.length, 0);
});

test('T-5 preparation and T-2 synchronization require exact context and fresh consistent clock evidence', () => {
    const unit = api.deriveExecutionUnits(snapshot([command('attack', 'attack', 1000000, { axe: 1 })])).units[0];
    const authorized = api.authorizePreparation(unit, { authorizedAt: 1 });
    const checked = api.advancePrecheck10m(authorized, validSessionEvidence(500000));
    const prepared = api.advancePrepare5m(checked, { now: 800000, sourceCorrect: true, targetCorrect: true,
        confirmationContextValid: true, compositionMatches: true });
    assert.equal(prepared.state, 'PREPARE_5M');
    const wrongContext = api.advancePrepare5m(checked, { now: 800000, sourceCorrect: false, targetCorrect: true,
        confirmationContextValid: true, compositionMatches: true });
    assert.ok(wrongContext.blockers.includes('SOURCE_IDENTITY_MISMATCH'));

    const samples = [950000, 950010, 949990].map((localNowMs, index) => ({ localNowMs,
        serverNowMs: localNowMs + 1500, measuredAt: 950000 - index }));
    const synchronized = api.advanceSync2m(prepared, { now: 950000, samples, source: 'Timing.getCurrentServerTime+World.getServerDateTime' });
    assert.equal(synchronized.state, 'SYNC_2M');
    assert.equal(synchronized.clockEvidence.serverClockOffsetMs, 1500);
    const stale = api.advanceSync2m(prepared, { now: 950000, samples: samples.map(sample => ({ ...sample, measuredAt: 1 })), source: 'Timing.getCurrentServerTime+World.getServerDateTime' });
    assert.ok(stale.blockers.includes('CLOCK_EVIDENCE_STALE'));
    const outlier = api.evaluateClockSamples(samples.map((sample, index) => ({ ...sample, serverNowMs: sample.serverNowMs + (index === 2 ? 5000 : 0) })), 950000);
    assert.equal(outlier.blocker, 'CLOCK_SAMPLE_OUTLIER');
    const implausible = api.evaluateClockSamples(samples.map(sample => ({ ...sample, serverNowMs: sample.localNowMs + 2 * 86400000 })), 950000);
    assert.equal(implausible.blocker, 'CLOCK_OFFSET_IMPLAUSIBLE');
});

test('only a complete fresh final check reaches READY_TO_SEND and exposes no submit path', () => {
    const unit = api.deriveExecutionUnits(snapshot([command('attack', 'attack', 1000000, { axe: 1 })])).units[0];
    const authorized = api.authorizePreparation(unit, { authorizedAt: 1 });
    const precheck = api.advancePrecheck10m(authorized, validSessionEvidence(500000));
    const prepared = api.advancePrepare5m(precheck, { now: 800000, sourceCorrect: true, targetCorrect: true,
        confirmationContextValid: true, compositionMatches: true });
    const samples = [950000, 950010, 949990].map((localNowMs, index) => ({ localNowMs, serverNowMs: localNowMs + 1500, measuredAt: 950000 - index }));
    const synchronized = api.advanceSync2m(prepared, { now: 950000, samples, source: 'Timing.getCurrentServerTime+World.getServerDateTime' });
    const finalEvidence = { now: 999000, authorizationValid: true, sessionTrusted: true, sourceCorrect: true, targetCorrect: true,
        commandTypeCorrect: true, compositionMatches: true, confirmationContextValid: true, clockEvidenceFresh: true, singleSubmitControlFound: true };
    assert.equal(api.advanceFinalCheck(synchronized, finalEvidence).state, 'READY_TO_SEND');
    assert.ok(api.advanceFinalCheck(synchronized, { ...finalEvidence, clockEvidenceFresh: false }).blockers.includes('CLOCK_EVIDENCE_STALE'));
    assert.ok(api.advanceFinalCheck(synchronized, { ...finalEvidence, sessionTrusted: false }).blockers.includes('SESSION_UNAVAILABLE_OR_UNTRUSTED'));
    assert.ok(api.advanceFinalCheck(synchronized, { ...finalEvidence, singleSubmitControlFound: false }).blockers.includes('SINGLE_SUBMIT_CONTROL_UNAVAILABLE'));
    assert.equal(Object.hasOwn(api, 'submit'), false);
    assert.equal(Object.hasOwn(api, 'send'), false);
    assert.equal(Object.hasOwn(context.EAS, 'MissionScheduler'), false);
});

test('T-2 sampling refuses second-only clock fallback and records precise Timing-backed evidence', async () => {
    const withoutTiming = { EAS: { World: { getServerDateTime: () => ({ available: true }) },
        MassSnipeExecution: { getCurrentServerTimeMs: () => Date.now() } }, setTimeout };
    assert.equal((await api.collectClockSamples(withoutTiming, { count: 3, intervalMs: 1 })).blocker, 'CLOCK_PRECISION_UNAVAILABLE');
    const withTiming = { EAS: { World: { getServerDateTime: () => ({ available: true }) },
        MassSnipeExecution: { getCurrentServerTimeMs: () => Date.now() + 1250 } },
        Timing: { getCurrentServerTime: () => Date.now() }, setTimeout };
    const evidence = await api.collectClockSamples(withTiming, { count: 3, intervalMs: 2 });
    assert.equal(evidence.valid, true);
    assert.equal(evidence.serverClockOffsetMs, 1250);
    assert.equal(evidence.source, 'Timing.getCurrentServerTime+World.getServerDateTime');
    assert.equal(evidence.sampleCount, 3);
});

test('native NT row reconciliation catches missing, extra, composition, and identity mismatches', () => {
    const group = api.deriveExecutionUnits(snapshot(trainChildren(2))).units[0];
    const rows = group.approvedChildren.map(child => ({ sourceId: source.id, sourceCoord: source.coord,
        targetCoord: target.coord, commandType: 'attack', composition: child.composition.quantities }));
    assert.equal(api.reconcileNativeNobleRows(group, rows).valid, true);
    assert.equal(api.reconcileNativeNobleRows(group, rows.slice(0, 1)).blocker, 'NATIVE_NT_ROW_COUNT_MISMATCH');
    assert.equal(api.reconcileNativeNobleRows(group, [...rows, rows[0]]).blocker, 'NATIVE_NT_UNEXPECTED_EXTRA_ROW');
    for (const unit of ['snob', 'axe', 'light', 'ram', 'catapult', 'knight']) {
        const changed = rows.map(row => ({ ...row, composition: { ...row.composition } }));
        changed[0].composition[unit] = Number(changed[0].composition[unit] || 0) + 1;
        assert.equal(api.reconcileNativeNobleRows(group, changed).blocker, 'NATIVE_NT_COMPOSITION_MISMATCH', `${unit} mismatch`);
    }
    const wrongSource = rows.map(row => ({ ...row })); wrongSource[0].sourceId = 'other';
    assert.equal(api.reconcileNativeNobleRows(group, wrongSource).blocker, 'NATIVE_NT_COMPOSITION_MISMATCH');
});

test('post-submit evidence is one-to-one; partial NT is UNCERTAIN and never requests a resend', () => {
    const group = api.deriveExecutionUnits(snapshot(trainChildren(4))).units[0];
    const observations = group.approvedChildren.map((child, index) => ({ commandId: `out-${index + 1}`,
        sourceId: source.id, sourceCoord: source.coord, targetCoord: target.coord, commandType: 'attack',
        composition: child.composition.quantities, sentAtMs: child.sendAtMs }));
    assert.equal(api.compareOutgoing(group, observations, { now: 900000 }).state, 'SENT');
    assert.equal(api.compareOutgoing(group, observations.slice(0, 2), { now: 900000 }).state, 'UNCERTAIN');
    assert.equal(api.compareOutgoing(group, [], { now: 900000 }).state, 'UNCERTAIN');
    assert.equal(api.compareOutgoing(group, [], { now: 900000, absenceProven: true }).state, 'FAILED');
    const duplicate = [...observations, { ...observations[0], commandId: 'duplicate' }];
    assert.equal(api.compareOutgoing(group, duplicate, { now: 900000 }).state, 'UNCERTAIN');
    const single = api.deriveExecutionUnits(snapshot([command('single-attack', 'attack', 880000, { axe: 12 })])).units[0];
    const singleObservation = [{ commandId: 'single-out', sourceId: source.id, sourceCoord: source.coord,
        targetCoord: target.coord, commandType: 'attack', composition: { axe: 12 }, sentAtMs: 880000 }];
    assert.equal(api.compareOutgoing(single, singleObservation, { now: 900000 }).state, 'SENT');
    assert.equal(api.compareOutgoing(single, [], { now: 900000 }).state, 'UNCERTAIN');
});

test('enqueue persists approved data separately without creating Scheduler missions', () => {
    const data = new Map();
    const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
    const approved = snapshot([command('support', 'support', 600000, { spear: 20 })]);
    const result = api.enqueue(approved, { storage, scope: 'br143:7', createdAt: 5 });
    assert.equal(result.created, true);
    assert.equal(result.execution.units[0].state, 'SCHEDULED');
    assert.equal(api.list({ storage, scope: 'br143:7' }).length, 1);
    assert.equal(api.list({ storage, scope: 'br143:7' })[0].approvedSnapshot.commands[0].composition.quantities.spear, 20);
    assert.equal(approved.commands[0].composition.quantities.spear, 20);
    const execution = api.list({ storage, scope: 'br143:7' })[0], unit = execution.units[0];
    const authorized = api.authorizeStoredUnit(execution.executionId, unit.executionUnitId, { storage, scope: 'br143:7', authorizedAt: 10 });
    assert.equal(authorized.preparationAuthorization.executionUnitId, unit.executionUnitId);
    assert.equal(api.updateStoredUnit(execution.executionId, unit.executionUnitId, { ...unit, state: 'READY_TO_SEND' }, { storage, scope: 'br143:7' }), null,
        'storage cannot bypass precheck, preparation, synchronization, and final validation');
    assert.equal(api.updateStoredUnit(execution.executionId, unit.executionUnitId, { ...authorized, approvedCommand: { ...authorized.approvedCommand, target: { coord: '999|999' } } }, { storage, scope: 'br143:7' }), null);
    const cancelled = api.cancelStoredUnit(execution.executionId, unit.executionUnitId, { storage, scope: 'br143:7' });
    assert.equal(cancelled.state, 'CANCELLED', 'preflight unit can be explicitly cancelled');
    assert.equal(api.authorizeStoredUnit(execution.executionId, unit.executionUnitId, { storage, scope: 'br143:7', authorizedAt: 11 }), null,
        'cancelled unit cannot be re-authorized or retried');
    assert.equal(Object.hasOwn(context.EAS, 'MissionScheduler'), false);
});

test('reload-safe Scheduler hook runs T-10 precheck only for explicitly authorized units', () => {
    const values = new Map(), listeners = new Map(); let now = 500000, antiBot = false, timers = 0;
    const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
    const targetWindow = {
        location: { href: 'https://br-test.tribalwars.com.br/game.php?screen=place&village=10' },
        game_data: { world: 'br-test', player: { id: 7 }, village: { id: 10, x: 500, y: 500 } },
        document: { readyState: 'complete', querySelector: selector => antiBot && selector.includes('[data-antibot]') ? {} : null },
        addEventListener: (name, handler) => listeners.set(name, handler), dispatchEvent: () => {},
        CustomEvent: function (name, init) { this.type = name; this.detail = init?.detail; },
        setTimeout: () => { timers += 1; }
    };
    const world = { getWorldName: () => 'br-test', getPlayer: () => ({ id: 7 }), getServerNowTimestamp: () => now };
    const scoped = vm.createContext({ EAS: { World: world, MassSnipeExecution: { getCurrentServerTimeMs: () => now }, Utils: { parseCoordinate: value => {
        const match = /^(\d{1,3})\|(\d{1,3})$/.exec(String(value)); return match ? { coordinate: `${Number(match[1])}|${Number(match[2])}` } : null;
    } } }, window: targetWindow, localStorage: storage, location: { hostname: 'br-test.tribalwars.com.br' },
        Date, Object, Array, Map, Set, JSON, Number, String, Math, Infinity, Error, RegExp });
    targetWindow.EAS = scoped.EAS;
    vm.runInContext(fs.readFileSync('services/tactical-operation-scheduler-adapter.js', 'utf8'), scoped);
    const scopedApi = scoped.EAS.TacticalOperationSchedulerAdapter;
    const approved = snapshot([command('hooked-attack', 'attack', 1000000, { axe: 1 })]);
    const queued = scopedApi.enqueue(approved, { createdAt: 100 });
    scopedApi.initializeSchedulerHooks(targetWindow);
    listeners.get('eas:scheduler-tick')();
    assert.equal(scopedApi.list()[0].units[0].state, 'SCHEDULED', 'no authorization means no precheck advancement');
    const unitId = queued.execution.units[0].executionUnitId;
    scopedApi.authorizeStoredUnit(queued.execution.executionId, unitId, { authorizedAt: 2 });
    listeners.get('eas:scheduler-tick')();
    assert.equal(scopedApi.list()[0].units[0].state, 'PRECHECK_10M');
    assert.equal(timers, 0, 'existing scheduler tick uses no new timers');

    const blockedQueue = scopedApi.enqueue(snapshot([command('bot-attack', 'attack', 1000000, { axe: 1 })]), { createdAt: 200 });
    scopedApi.authorizeStoredUnit(blockedQueue.execution.executionId, blockedQueue.execution.units[0].executionUnitId, { authorizedAt: 3 });
    antiBot = true;
    listeners.get('eas:scheduler-tick')();
    const blocked = scopedApi.list().find(execution => execution.executionId === blockedQueue.execution.executionId).units[0];
    assert.equal(blocked.state, 'BLOCKED');
    assert.ok(blocked.blockers.includes('SESSION_UNAVAILABLE_OR_UNTRUSTED'));
});

test('cancelled simple and native NT units leave the active list and stay cancelled after reload', () => {
    const values = new Map(), storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
    const mixed = snapshot([command('attack-cancel', 'attack', 1000000, { axe: 1 }), ...trainChildren(4)]);
    const queued = api.enqueue(mixed, { storage, scope: 'world:player', createdAt: 400 });
    const attack = queued.execution.units.find(unit => unit.kind === 'single-command');
    const train = queued.execution.units.find(unit => unit.kind === 'native-noble-train');
    assert.equal(api.listActive({ storage, scope: 'world:player' })[0].units.length, 2);
    assert.equal(api.cancelStoredUnit(queued.execution.executionId, attack.executionUnitId, { storage, scope: 'world:player' }).state, 'CANCELLED');
    assert.equal(api.listActive({ storage, scope: 'world:player' })[0].units.length, 1);
    assert.equal(api.listActive({ storage, scope: 'world:player' })[0].units[0].kind, 'native-noble-train');
    assert.equal(api.cancelStoredUnit(queued.execution.executionId, train.executionUnitId, { storage, scope: 'world:player' }).state, 'CANCELLED');
    assert.equal(api.listActive({ storage, scope: 'world:player' }).length, 0);
    const reloaded = api.createStore(storage).read().executions['world:player'][0];
    assert.equal(reloaded.units.every(unit => unit.state === 'CANCELLED'), true);
    assert.equal(reloaded.units.find(unit => unit.kind === 'native-noble-train').approvedChildren.length, 4, 'cancelled NT remains one archived group with all children');
    const listeners = new Map(), targetWindow = { game_data: { world: 'world', player: { id: 'player' } },
        addEventListener: (name, handler) => listeners.set(name, handler), dispatchEvent: () => {}, CustomEvent: function () {} };
    targetWindow.EAS = { World: { getWorldName: () => 'world', getPlayer: () => ({ id: 'player' }) } };
    const reloadedContext = vm.createContext({ EAS: targetWindow.EAS, window: targetWindow, localStorage: storage,
        location: { hostname: 'world' }, Date, Object, Array, Map, Set, JSON, Number, String, Math, Infinity, Error, RegExp });
    vm.runInContext(fs.readFileSync('services/tactical-operation-scheduler-adapter.js', 'utf8'), reloadedContext);
    reloadedContext.EAS.TacticalOperationSchedulerAdapter.initializeSchedulerHooks(targetWindow);
    listeners.get('eas:scheduler-tick')();
    assert.equal(reloadedContext.EAS.TacticalOperationSchedulerAdapter.list()[0].units.every(unit => unit.state === 'CANCELLED'), true,
        'scheduler tick after reload never reactivates cancelled units');
});

test('persisted lifecycle re-derives each transition through READY_TO_SEND from stored evidence', () => {
    const values = new Map(), storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
    const queued = api.enqueue(snapshot([command('persisted', 'attack', 1000000, { axe: 1 })]), { storage, scope: 'world:player', createdAt: 300 });
    let unit = api.authorizeStoredUnit(queued.execution.executionId, queued.execution.units[0].executionUnitId,
        { storage, scope: 'world:player', authorizedAt: 1 });
    const step = (method, evidence) => {
        const next = api[method](unit, evidence);
        assert.notEqual(api.updateStoredUnit(queued.execution.executionId, unit.executionUnitId, next, { storage, scope: 'world:player' }), null, method);
        unit = api.list({ storage, scope: 'world:player' })[0].units[0];
    };
    step('advancePrecheck10m', validSessionEvidence(500000));
    step('advancePrepare5m', { now: 800000, sourceCorrect: true, targetCorrect: true, confirmationContextValid: true, compositionMatches: true });
    const samples = [949990, 950000, 950010].map(localNowMs => ({ localNowMs, serverNowMs: localNowMs + 500,
        measuredAt: localNowMs + 500, timingSource: 'Timing.getCurrentServerTime' }));
    step('advanceSync2m', { now: 950600, samples, source: 'Timing.getCurrentServerTime+World.getServerDateTime' });
    const final = api.advanceFinalCheck(unit, { now: 999000, authorizationValid: true, sessionTrusted: true,
        sourceCorrect: true, targetCorrect: true, commandTypeCorrect: true, compositionMatches: true,
        confirmationContextValid: true, clockEvidenceFresh: true, singleSubmitControlFound: true });
    assert.notEqual(api.updateStoredUnit(queued.execution.executionId, unit.executionUnitId, final, { storage, scope: 'world:player' }), null);
    assert.equal(api.list({ storage, scope: 'world:player' })[0].units[0].state, 'READY_TO_SEND');
});

test('preflight accepts fractional audit clock, persists once and exposes only safe diagnostic fields', () => {
    const values = new Map(), storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
    const options = { storage, scope: 'world:player', createdAt: 500 };
    const queued = api.enqueue(snapshot([command('preflight-fractional', 'attack', 1000000, { axe: 5930, light: 3117 })]), options);
    const eid = queued.execution.executionId, uid = queued.execution.units[0].executionUnitId;
    assert.equal(api.preparationAuthorizationValid(queued.execution.units[0]), false);
    const saved = api.authorizeStoredUnit(eid, uid, { ...options, authorizedAt: 100000.875 });
    assert.equal(saved.preparationAuthorization.authorizedAt, 100000);
    assert.equal(saved.preparationAuthorization.executionId, eid);
    assert.equal(saved.state, 'SCHEDULED'); assert.equal(saved.finalAuthorization, undefined);
    assert.deepEqual(plain(api.authorizeStoredUnit(eid, uid, { ...options, authorizedAt: 200000.125 })), plain(saved));
    const restored = api.createStore(storage).read().executions['world:player'][0].units[0];
    assert.equal(api.preparationAuthorizationValid(restored), true);
    const beforeWindow = api.advancePrecheck10m(restored, validSessionEvidence(100001));
    assert.equal(beforeWindow.state, 'SCHEDULED');
    for (const value of [NaN, Infinity, -1, '123', null]) assert.equal(api.authorizePreparation(queued.execution.units[0], { authorizedAt: value }), null);
    const root = api.createStore(storage).read();
    root.executions['world:player'][0].units[0].preparationAuthorization.secret = 'DO_NOT_EXPORT';
    storage.setItem(api.STORAGE_KEY, JSON.stringify(root));
    const diagnostic = api.preparationDiagnostic(options), unit = diagnostic.executions[0].units[0];
    assert.equal(unit.preflightAuthorization.valid, true); assert.equal(unit.finalSubmitAuthorization.present, false);
    assert.equal(unit.nextStage, 'PRECHECK_10M'); assert.equal(unit.scheduledSubmitAtMs, 1000000);
    assert.equal(JSON.stringify(diagnostic).includes('DO_NOT_EXPORT'), false);
    const changed = plain(restored); changed.revision++; assert.equal(api.preparationAuthorizationValid(changed), false);
});

test('manual T-5 uses floored authoritative time and records accepted attempts separately', async () => {
    const makePrepared = scope => {
        const values = new Map(), storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
        const options = { storage, scope: 'br-test:7', createdAt: 1 };
        const queued = api.enqueue(snapshot([command(`t5-${scope}`, 'attack', 1000000, { axe: 1 })]), options);
        const executionId = queued.execution.executionId, unitId = queued.execution.units[0].executionUnitId;
        const authorized = api.authorizeStoredUnit(executionId, unitId, { ...options, authorizedAt: 2 });
        const prechecked = api.advancePrecheck10m(authorized, validSessionEvidence(400000));
        assert.equal(api.updateStoredUnit(executionId, unitId, prechecked, options).state, 'PRECHECK_10M');
        return { options, executionId, unitId, prechecked };
    };
    const makeWindow = now => ({
        game_data: { world: 'br-test', player: { id: 7 } }, navigator: { locks: { request: async (key, fn) => fn() } }, crypto: { randomUUID: () => 'test-nav-id' }, document: { readyState: 'complete', querySelector: () => null },
        EAS: {
            MassSnipeExecution: { getCurrentServerTimeMs: () => now },
            Place: { buildPlaceUrl: () => new URL('https://br-test.example/game.php?screen=place') }
        },
        open: () => ({ focus() {} })
    });

    for (const [scope, clock, expectedNow] of [['integer', 750000, 750000], ['fractional', 750000.875, 750000]]) {
        const { options, executionId, unitId, prechecked } = makePrepared(scope);
        const before = plain(api.list(options)[0].units[0]);
        const result = await api.openRallyPoint(prechecked, makeWindow(clock), options);
        assert.equal(result.valid, true);
        assert.equal(result.attemptedAtMs, expectedNow);
        assert.equal(result.diagnosticRecorded, true);
        const current = api.list(options)[0].units[0];
        assert.equal(current.rallyPreparation.status, 'NAVIGATING');
        const restored = plain(current); delete restored.rallyPreparation;
        assert.deepEqual(restored, before, 'only the navigation context changes; no send state');
        assert.equal((await api.openRallyPoint(prechecked, makeWindow(clock), options)).alreadyStarted, true);
        const diagnostic = api.preparationDiagnostic(options);
        assert.deepEqual(diagnostic.executions[0].units[0].lastPreflightAction, 'MANUAL_PRECHECK_10M');
        assert.equal(diagnostic.executions[0].units[0].preflightAuthorization.valid, true);
        assert.equal(diagnostic.executions[0].units[0].attempt.present, false);
        assert.deepEqual(diagnostic.preparationAttempts.at(-1), {
            action: 'MANUAL_PREPARE_5M_OPEN_RALLY_POINT', stage: 'PREPARE_5M', previousState: 'PRECHECK_10M', attemptedAtMs: expectedNow, serverNow: expectedNow, checkpointAtMs: 700000,
            navigationStarted: false, expectedUrl: result.url,
            result: 'ACCEPTED', outcome: 'NAVIGATION_ALREADY_IN_PROGRESS', navigationId: 'test-nav-id', reason: null, blocker: null, timingProviderReason: null,
            deltaMs: expectedNow - 700000, executionId, executionUnitId: unitId,
            operationId: 'op-1', revision: 7
        });
    }
    assert.equal(Object.hasOwn(api, 'submit'), false);
    assert.equal(Object.hasOwn(api, 'send'), false);
});

test('manual T-5 rejects unavailable clocks without unit mutation and exposes bounded diagnostics', async () => {
    const values = new Map(), storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
    const options = { storage, scope: 'invalid-clocks', createdAt: 1 };
    const queued = api.enqueue(snapshot([command('t5-invalid-clock', 'attack', 1000000, { axe: 1 })]), options);
    const executionId = queued.execution.executionId, unitId = queued.execution.units[0].executionUnitId;
    const authorized = api.authorizeStoredUnit(executionId, unitId, { ...options, authorizedAt: 2 });
    const prechecked = api.advancePrecheck10m(authorized, validSessionEvidence(400000));
    api.updateStoredUnit(executionId, unitId, prechecked, options);
    const before = plain(api.list(options)[0].units[0]);
    const targetWindow = provider => ({ navigator: { locks: { request: async (key, fn) => fn() } }, EAS: { MassSnipeExecution: provider } });
    const cases = [
        [targetWindow(undefined), 'TIMING_PROVIDER_UNAVAILABLE'],
        [targetWindow({ getCurrentServerTimeMs() { throw new Error('clock failed'); } }), 'TIMING_PROVIDER_ERROR'],
        [targetWindow({ getCurrentServerTimeMs: () => NaN }), 'TIMING_VALUE_NOT_FINITE'],
        [targetWindow({ getCurrentServerTimeMs: () => Infinity }), 'TIMING_VALUE_NOT_FINITE'],
        [targetWindow({ getCurrentServerTimeMs: () => '750000' }), 'TIMING_VALUE_NOT_NUMERIC'],
        [targetWindow({ getCurrentServerTimeMs: () => null }), 'TIMING_VALUE_NOT_NUMERIC'],
        [targetWindow({ getCurrentServerTimeMs: () => Number.MAX_SAFE_INTEGER + 1 }), 'TIMING_VALUE_UNSAFE']
    ];

    for (const [window, providerReason] of cases) {
        const result = await api.openRallyPoint(prechecked, window, options);
        assert.equal(result.valid, false);
        assert.equal(result.blocker, 'TIMING_EVIDENCE_UNAVAILABLE');
        assert.equal(result.attemptedAtMs, null);
        assert.equal(result.diagnosticRecorded, true);
        const current = api.list(options)[0].units[0];
        assert.deepEqual(plain(current), before, 'timing rejection must preserve T-10 evidence, authorization, and attempt fields');
        const latest = api.preparationDiagnostic(options).preparationAttempts.at(-1);
        assert.equal(latest.action, 'MANUAL_PREPARE_5M_OPEN_RALLY_POINT');
        assert.equal(latest.stage, 'PREPARE_5M');
        assert.equal(latest.result, 'REJECTED');
        assert.equal(latest.reason, 'TIMING_EVIDENCE_UNAVAILABLE');
        assert.equal(latest.timingProviderReason, providerReason);
        assert.equal(latest.attemptedAtMs, null);
    }

    const missingEntireProvider = await api.openRallyPoint(prechecked, targetWindow(undefined), options);
    assert.equal(missingEntireProvider.blocker, 'TIMING_EVIDENCE_UNAVAILABLE');
    for (let index = 0; index < 105; index += 1) await api.openRallyPoint(prechecked, targetWindow(undefined), options);
    const diagnostic = api.preparationDiagnostic(options);
    assert.equal(diagnostic.preparationAttempts.length, 100, 'manual attempt diagnostics are capped');
    assert.deepEqual(plain(api.list(options)[0].units[0]), before);
});


test('clock diagnostics preserve offsets, median and exact 500ms boundary without changing decisions',()=>{
 const samples=[0,250,500].map((offset,index)=>({serverNowMs:10000+offset,localNowMs:10000,measuredAt:10500,index,token:'must-not-copy'}));
 const ok=api.evaluateClockSamples(samples,10500);assert.equal(ok.valid,true);assert.equal(ok.diagnostic.spreadMs,500);
 assert.deepEqual(plain(ok.diagnostic.samples.map(s=>s.offsetMs)),[0,250,500]);assert.equal(ok.diagnostic.medianOffsetMs,250);
 assert.equal(ok.diagnostic.minimumOffsetMs,0);assert.equal(ok.diagnostic.maximumOffsetMs,500);
 assert.deepEqual(plain(ok.diagnostic.limits),{minimumSamples:3,maximumSpreadMs:500,maximumAgeMs:120000,maximumAbsoluteOffsetMs:86400000});
 const bad=api.evaluateClockSamples(samples.map((s,i)=>({...s,serverNowMs:s.serverNowMs+(i===2?1:0)})),10501);
 assert.equal(bad.blocker,'CLOCK_SAMPLE_OUTLIER');assert.equal(bad.diagnostic.reason,bad.blocker);assert.equal(bad.diagnostic.spreadMs,501);
 assert.equal(bad.diagnostic.samples.length,3);assert.ok(!JSON.stringify(bad.diagnostic).includes('token'));
 const many=api.evaluateClockSamples(Array.from({length:20},(_,i)=>({...samples[0],serverNowMs:10000+i*100})),12000);
 assert.equal(many.diagnostic.samples.length,8);assert.equal(many.diagnostic.sampleCount,20);assert.equal(many.diagnostic.spreadMs,1900);assert.equal(many.blocker,'CLOCK_SAMPLE_OUTLIER');
});
test('real shared clock observer records the exact values without additional reads or changing its result',async()=>{
 let raw=Date.UTC(2026,9,9,6,0,0),reads=0,domReads=0,mono=0;
 const world={getServerDateTime:()=>{domReads++;return {available:true,date:'09/10/2026',time:'03:00:00'};}};
 const EAS={Selectors:{},Adapters:{},World:world};
 const w={EAS,Timing:{getCurrentServerTime:()=>{reads++;return raw;}},performance:{now:()=>++mono},setTimeout:fn=>fn()};
 const context=vm.createContext({EAS,window:w,Date:class extends Date{static now(){return raw;}}});
 for(const file of ['services/mass-snipe-execution.js','services/tactical-operation-scheduler-adapter.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
 const clock=EAS.MassSnipeExecution;const unchanged=clock.getCurrentServerTimeMs();
 assert.equal(clock.getCurrentServerTimeMs(()=>{throw Error('diagnostic failure');}),unchanged);
 reads=0;domReads=0;
 const result=await EAS.TacticalOperationSchedulerAdapter.collectClockSamples(w);
 assert.equal(result.valid,true);assert.equal(reads,6,'two existing Timing calls per sample, no diagnostic rereads');assert.equal(domReads,4,'one availability check + one DOM read per sample');
 for(const sample of result.diagnostic.samples){assert.equal(sample.rawTimingMs,raw);assert.equal(sample.providerTimingMs,raw);assert.equal(sample.domWallTimeMs,raw-10800000);assert.equal(sample.appliedOffsetMs,-10800000);assert.equal(sample.readDurationMs,1);}
 delete w.performance;assert.equal((await EAS.TacticalOperationSchedulerAdapter.collectClockSamples(w)).diagnostic.samples[0].readDurationMs,null);
});
