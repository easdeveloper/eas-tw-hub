# Tactical ATTACK / SUPPORT final execution

Scope: single commands only. Native NT inspection and its timing blocker remain
unchanged. This completes the explicit final boundary after the existing automatic
preparation/confirmation flow, using `EAS.MassSnipePrecise.createScheduler`.

## Flow and authorization

1. In the approved single-command card, authorize preparation as before. While
   SCHEDULED or PRECHECK_10M, explicitly choose **Autorizar envio real antecipadamente**
   or **Programar DRY RUN (sem envio)**. The persisted choice binds the operation,
   revision, account, source, target, type, approved troops and timestamp.
2. Existing automatic preparation reaches `CONFIRMATION_READY`.
3. At T-10 seconds, the existing scheduler tick performs FINAL CHECK automatically
   on the bound confirmation tab. It validates account, source/target/type/troops,
   native duration, clock and baseline/read-back, then reaches READY_TO_SEND.
4. Only a valid early choice permits automatic arming: real mode materializes the
   final authorization; dry-run mode creates no send authorization and never clicks.
   Missing/changed consent or failed validation is persisted as BLOCKED. There is
   no need to click in the final seconds.
5. The shared precision scheduler validates again, persists its single-use claim,
   and holds an exclusive Web Lock. UNCERTAIN never resends. Reload can re-arm only
   before the deadline, in the bound tab with unchanged early consent and no
   consumed attempt; duplicate concurrent documents share the lock.

The original preparation does not create a send attempt. Before its existing
rally-to-confirmation navigation it now preserves optional read-only outgoing
inventory evidence in the navigation intent. Failure to read this evidence does
not change the working preparation; the new explicit FINAL CHECK refuses to proceed
without it. Old confirmations lacking this evidence cannot be retroactively armed:
start a new reviewed operation, never clear locks or fabricate an empty baseline.

## Local and server measurements

Inspect `EAS.TacticalOperationSchedulerAdapter.preparationDiagnostic()` or `list()`:
`executionTiming` contains planned/actual local dispatch time, local deviation,
scheduler deviation, dry-run flag, click-error flag and server outcome. Logs include
FINAL_CHECK_COMPLETED, FINAL_AUTHORIZED, SUBMIT_CLAIMED, FINAL_CLICK_DISPATCH or
DRY_RUN_TIMING, and RECONCILIATION.

- `localWithin100Ms` measures strictly less than 100 ms absolute local deviation.
  A dry run measures the dispatch point without a native click.
- `serverArrivalMs`, `serverClock`, `serverPrecisionMs` and
  `serverArrivalDeviationMs` come from reconciled outgoing arrival evidence, when
  available. Unix-clock evidence is compared in its own frame using the captured
  server/wall-clock relation.
- Arrival time is NOT a measured server submission timestamp.
  `serverRecordedSubmissionMs` stays null without such evidence. Do not claim a
  sub-100 ms server submission result from the local click or coarse arrival data.
- A past deadline can never be newly armed or executed as catch-up. An already
  armed callback at 100 ms or more lateness is blocked, including a second check
  immediately before dispatch. Sub-100 ms scheduling jitter remains measurable;
  this is not a server timing guarantee. Browser scheduling, clock precision and network/server delays remain
  material limitations. No latency compensation is invented.

## BR143 validation

Install the generated local userscript. Use a new ATTACK operation and a separate
new SUPPORT operation to run DRY RUN first. Verify origin/target/troops on each
native confirmation; select the early DRY RUN choice before preparation completes. Expect zero final clicks, no
consumed attempt and persisted local metrics. Do not reuse an expired dry-run
schedule for real sending.

Only after reviewing those results, explicitly approve separate real test operations
and select **Autorizar envio real antecipadamente** in each approved operation
card while SCHEDULED or PRECHECK_10M. No click is required in the final seconds. Confirm exactly one
new outgoing command, compare the local metric separately from server arrival
precision, and retain UNCERTAIN if evidence is missing. Reload must not resend.
These are manual validation instructions, not a record of real BR143 testing.
