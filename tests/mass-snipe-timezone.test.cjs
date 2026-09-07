// Run: node --test tests/mass-snipe-timezone.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

if (process.argv.includes('--fixture')) {
    const clock = { date: '07/09/2026', time: '01:31:00', timing: Date.UTC(2026, 8, 7, 4, 31, 0) };
    const elements = { '#serverDate': { get textContent() { return clock.date; } }, '#serverTime': { get textContent() { return clock.time; } } };
    const context = vm.createContext({
        EAS: { Selectors: {}, Adapters: {} },
        window: { Timing: { getCurrentServerTime: () => clock.timing } },
        document: { querySelector: (selector) => elements[selector] || null, body: { textContent: '' } }
    });
    // Use the real Hub DOM reader and helpers: the previous mock conflated the
    // local Date constructor and Timing, hiding the 12-hour error in Japan.
    for (const file of ['core/utils.js', 'core/world.js', 'services/mass-snipe-execution.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
    }
    const s = context.EAS.MassSnipeExecution;
    const landing = s.getLandingTime('07/09/2026 21:00:00:271');
    assert.equal(landing.getTime(), Date.UTC(2026, 8, 7, 21, 0, 0, 271));
    assert.equal(s.formatDateTime(landing), '07/09/2026 21:00:00:271');
    assert.throws(() => s.getLandingTime('31/02/2026 21:00:00:271'));

    const distance = context.EAS.Utils.distance('517|464', '537|450');
    const launch = s.getLaunchTime('spear', landing, distance, 0, { spear: 18 });
    assert.equal(s.formatDateTime(launch), '07/09/2026 13:40:34:111');
    assert.equal(s.formatDurationMs(launch - s.getCurrentServerTimeMs()), '12:09:34.111');
    // Also reproduce using exactly the whole-second duration shown by the game.
    const exactTravel = (7 * 3600 + 19 * 60 + 26) * 1000;
    const exactLaunch = s.getLaunchTime('spear', landing, 1, 0, { spear: exactTravel / 60000 });
    assert.equal(s.formatDateTime(exactLaunch), '07/09/2026 13:40:34:271');
    assert.equal(s.formatDurationMs(exactLaunch - s.getCurrentServerTimeMs()), '12:09:34.271');

    // The actual countdown and the future-departure filter share the same clock.
    const countdown = { dataset: { endtimeMs: String(launch) } };
    const container = { isConnected: true, querySelectorAll: () => [countdown] };
    context.EAS.Runtime = { dispose() {}, create: () => ({ setInterval() {} }) };
    context.document.title = 'game';
    s.startCountdownMs(container);
    assert.equal(countdown.textContent, '12:09:34.111');
    s.stopCountdown();
    const combinations = s.calculate({ selectedUnits: ['spear'], snipesNeeded: [{ coord: '537|450', landingTime: '07/09/2026 21:00:00:271', sigil: 0, minAmount: 50 }] },
        { ownVillages: [{ id: 1, coordinate: '517|464' }], troops: { 1: { ownHome: { spear: 100 } } }, unitSpeeds: { spear: 18 } });
    assert.equal(combinations.length, 1);
    assert.equal(combinations[0].launchTime, launch);

    // Seconds-only DOM does not discard Timing's milliseconds or introduce a
    // one-second jump when the page's displayed second is slightly behind.
    clock.timing += 583;
    assert.equal(s.formatDurationMs(launch - s.getCurrentServerTimeMs()), '12:09:33.528');
    clock.time = '01:30:59';
    assert.equal(s.formatDurationMs(launch - s.getCurrentServerTimeMs()), '12:09:33.528');
    clock.time = '01:31:00';
    assert.equal(s.parseArrival('hoje às 21:00:00:271'), '07/09/2026 21:00:00:271');
    assert.equal(s.parseArrival('amanhã às 00:00:00:007'), '08/09/2026 00:00:00:007');

    // Different server offsets, including non-whole hours: no Brazil constant.
    for (const minutes of [-180, 0, 120, 345, 570]) {
        clock.timing = Date.UTC(2026, 8, 7, 1, 31, 0, 583) - minutes * 60000;
        assert.equal(s.getCurrentServerTimeMs(), Date.UTC(2026, 8, 7, 1, 31, 0, 583));
    }
    const timing = context.window.Timing;
    delete context.window.Timing;
    assert.equal(s.getCurrentServerTimeMs(), Date.UTC(2026, 8, 7, 1, 31, 0));
    clock.time = '01:31:00.007';
    // The shared reader currently exposes full seconds; do not invent precision.
    assert.equal(s.getCurrentServerTimeMs(), Date.UTC(2026, 8, 7, 1, 31, 0));
    clock.date = ''; clock.time = '';
    assert.throws(() => s.getCurrentServerTimeMs(), /indisponível/);
    context.window.Timing = timing;

    clock.date = '31/12/2026'; clock.time = '23:59:59';
    clock.timing = Date.UTC(2027, 0, 1, 2, 59, 59, 999);
    assert.equal(s.formatDateTime(s.getCurrentServerTimeMs()), '31/12/2026 23:59:59:999');
    assert.equal(s.parseArrival('amanhã às 00:00:00:007'), '01/01/2027 00:00:00:007');
    // The client's own DST transition must not normalize a server input.
    assert.equal(s.formatDateTime(s.getLandingTime('29/03/2026 02:30:00:271')), '29/03/2026 02:30:00:271');
    assert.equal(s.formatDateTime(s.getLandingTime('08/03/2026 02:30:00:271')), '08/03/2026 02:30:00:271');

    process.stdout.write(JSON.stringify({
        clientOffset: new Date(2026, 8, 7).getTimezoneOffset(),
        result: { landing: landing.getTime(), launch, formattedLaunch: s.formatDateTime(launch), countdown: countdown.textContent }
    }));
} else {
    const test = require('node:test');
    const { spawnSync } = require('node:child_process');
    test('Mass Snipe uses the server clock in Japan, Brazil, Europe and other client timezones', () => {
        let expected;
        for (const [timezone, offset] of [['Asia/Tokyo', -540], ['America/Sao_Paulo', 180], ['Europe/Berlin', -120], ['America/New_York', 240], ['Asia/Kathmandu', -345], ['UTC', 0]]) {
            const child = spawnSync(process.execPath, [__filename, '--fixture'], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
            assert.equal(child.status, 0, `${timezone}: ${child.stderr}`);
            const actual = JSON.parse(child.stdout);
            assert.equal(actual.clientOffset, offset, `${timezone} was applied to the child process`);
            expected ||= actual.result;
            assert.deepEqual(actual.result, expected, `${timezone}: timestamps and countdown must be identical`);
        }
    });
}
