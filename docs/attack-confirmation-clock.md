# ATTACK native confirmation clock

The `local-4182b3ff2394499c` failure is reproducible at T-30 on
`screen=place&try=confirm`, even with a valid visible server clock. The old
`runAutomaticFinal` checked `Number.isSafeInteger(now)` before its T-10 wait.
`MassSnipeExecution.getCurrentServerTimeMs()` can legitimately return fractional
milliseconds from native `Timing.getCurrentServerTime()`. For example, a valid
server time ending in `.875` was classified as `CLOCK_UNAVAILABLE`, and the unit
became permanently `BLOCKED`. Later integer checks in `prepareFinalExecution`,
`authorizeFinalSubmit` and `liveExecutionCheck` would reject the same source.
The real session did not supply raw clock diagnostics, so this reproduction does
not establish that its modules or native Timing were actually missing.

## Required time sources

- `EAS.World.getServerDateTime()` reads `#serverDate` / `#serverTime`, with the
  existing server-text fallback. Its displayed calendar anchors the server wall
  clock. Its client-timezone timestamp is not used for final ATTACK execution.
- `MassSnipeExecution.getCurrentServerTimeMs()` parses that calendar with UTC
  fields and combines it with native `Timing.getCurrentServerTime()`, applying
  the existing whole-minute timezone offset. Its DOM-only fallback is not enough
  to authorize a precise final ATTACK.
- `runAutomaticFinal` and final ATTACK lifecycle checks now validate that source
  and native Timing, then floor only the integer lifecycle/audit timestamps.
  Visible DOM time alone, NaN, exceptions and missing native Timing remain
  blocked. No client `Date.now()` timestamp replaces the server source.
- `MassSnipePrecise.createScheduler` still receives the original fractional
  server time and native `performance.now()` through the existing injected
  callbacks. Progressive delays, monotonic anchoring, deadline, claim and click
  precision are unchanged. Actual click/deviation metrics keep their fractions.

## Confirmation bootstrap and recovery

The normal new-page bootstrap already loads World before tactical dependencies.
The existing-UI/silent route can enter tactical bootstrap without that reader.
For the matching ATTACK confirmation tab only, the bootstrap now explicitly
ensures the World reader and MassSnipe provider, and verifies that the precise
scheduler exposes `createScheduler` rather than accepting an empty namespace.
The native confirmation URL resumes using the persisted tab/session context;
EAS navigation URL parameters are not required.

`ensureAttackFinalClock` also loads missing World/provider modules through the
existing loader before a final ATTACK check. Concurrent ticks share the load
and cannot run two final checks or arm two schedulers. Native game Timing is
never synthesized. Failed loads or unavailable native Timing still block.
Terminal blocked, consumed, cancelled or overdue operations are never reopened.
SUPPORT and native noble-train paths keep their existing behavior.

The bounded `finalClock` tick diagnostic and `AUTOMATIC_FINAL_BLOCKED` log
identify provider/World/native-Timing availability, raw and integer time,
fractional milliseconds, DOM wall time, timezone offset and the failure reason.
They contain no account secrets, form tokens or authorization credentials.

## Verification

- Node regression failed before the fix with `BLOCKED` / `CLOCK_UNAVAILABLE`
  at T-30 and a `.875` server timestamp, then passed after the fix.
- Real World and MassSnipe providers recover missing modules using mocked
  visible server elements and BR143-style native Timing with a UTC-3 offset.
  Moving the local clock by one year does not change the final server source.
- Missing, throwing or non-finite native Timing and failed provider loads never
  authorize or click. Losing native Timing after arming also blocks.
- The browser test loads the generated userscript on a native confirmation DOM,
  exercises full bootstrap and lazy provider recovery, waits at T-30, arms
  automatically, prevents early sends and dispatches exactly one mocked native
  click. Its fractional local deviation is preserved.
- The existing authorized-creation-to-reconciliation ATTACK mock remains covered,
  along with SUPPORT, NT and precise scheduler regressions.
- Idle bootstrap still loads no tactical clock/execution modules, performs no
  HTTP scans and executes each factory once. Its old fixed factory count was
  stale relative to the existing draft module; the same count failure was
  reproduced with the pre-fix index before correcting the test expectation.

All network calls in the new browser fixture are trapped; native form submission
is prevented and counted. No real attacks are sent by these tests.
