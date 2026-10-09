# Native NT inspection (no sending)

BR143 proves the add control `a#troop_confirm_train.place-confirm-new-attack`,
plain hidden first-command unit fields, and `train[N][unit]` number inputs in
`tr.units-row` through NT4. The structural validation phase is closed: NT2, NT3
and NT4 were validated directly in BR143; NT5 is accepted by project decision as
VALIDADO POR EQUIVALÊNCIA ESTRUTURAL, based on the shared implementation and
existing automated tests. NT5 was NOT tested in the real game. Missing, extra,
unordered, duplicate or unreadable fields still fail closed at runtime.

This is an explicit console inspection API, separate from scheduled execution.
The stored execution unit remains BLOCKED with NATIVE_NT_NATIVE_TIMING_UNPROVEN.
A successful inspection records STRUCTURE_VALIDATED, never temporal approval or
CONFIRMATION_READY on the executable state machine. No attempts, baselines,
preparation/final-send authorizations, POST requests or final-button clicks are
created by this API. Existing ATTACK/SUPPORT preparation is unchanged.

## Structural validation matrix

Real-game outcomes below were reported by the project owner. Automated evidence
comes from `tests/tactical-native-br143.test.html` (NT2 through NT5),
`tests/tactical-native-confirmation.test.html` and the Tactical Node regressions.

| Variant | Classification | Real BR143 inspection | Structural result and persistence | Basis |
| --- | --- | --- | --- | --- |
| NT2 | VALIDADO NO BR143 | Executed and confirmed | `STRUCTURE_VALIDATED`; persistence confirmed in BR143 | Real validation plus automated tests |
| NT3 | VALIDADO NO BR143 | Executed and confirmed | `STRUCTURE_VALIDATED`; persistence confirmed in BR143 | Real validation plus automated tests |
| NT4 | VALIDADO NO BR143 | Executed and confirmed | `STRUCTURE_VALIDATED`; persistence confirmed in BR143 | Real validation plus automated tests |
| NT5 | VALIDADO POR EQUIVALÊNCIA ESTRUTURAL | NOT executed | Structural validation and persistence covered by automated tests only | Project acceptance of the shared parser/preparation/validation implementation and existing NT5 tests |

This matrix closes structural validation only. For ALL variants:

- `NATIVE_NT_NATIVE_TIMING_UNPROVEN` remains in force.
- `timingApproved: false` remains unchanged.
- The executable unit remains `BLOCKED`; final sending remains blocked.
- No native 100 ms spacing, server-side submission acceptance or timing approval
  is established by this classification.
- NT5 equivalence is a documentation/acceptance classification, not a fabricated
  real-game result or a change to persisted runtime inspection evidence.

## Manual inspection procedure (reference)

1. Approve a new NT2, NT3, NT4 or NT5 operation with frozen compositions. Keep the
   native timing blocker. Do not use an operation blocked for another reason.
2. Manually open its first attack confirmation at the approved source and target.
   Do not press the final send button. Start with exactly one native command.
3. Load the inspection API explicitly on this document before querying it:

```javascript
await window.EASLoader.loadScript(
  'services/tactical-operation-scheduler-adapter.js',
  { reason: 'manual-native-inspection-api' }
);
console.log({
  list: typeof window.EAS?.TacticalOperationSchedulerAdapter?.list,
  inspectNativeTrain: typeof window.EAS?.TacticalOperationSchedulerAdapter?.inspectNativeTrain
});
```

Both values must be `"function"`. This loads the existing singleton through the
loader's shared Promise; it does not initialize scheduler hooks, inspect a train,
change operation state or authorize preparation/sending. In a local build the
factory is embedded, so no script download/insertion is needed. Loader errors,
including RATE_LIMITED, must be reported without bypassing the guard.

The public namespace is `window.EAS.TacticalOperationSchedulerAdapter`. The asset
being embedded does not mean its factory has run: loading is lazy. Ordinary
bootstrap does not load it solely for a BLOCKED native train. A manually opened
confirmation therefore needs this explicit step after each full navigation.
Do not open Scheduled Missions just to obtain the API; that route also initializes
scheduler hooks.

Then select the exact stored execution/unit (do not auto-select the first operation):

```javascript
const ntApi = EAS.TacticalOperationSchedulerAdapter;
console.table(ntApi.list().flatMap(e => e.units.filter(u => u.kind === 'native-noble-train').map(u => ({
  executionId: e.executionId, executionUnitId: u.executionUnitId,
  source: u.source.coord, target: u.target.coord, count: u.expectedCommands,
  state: u.state, inspection: u.nativeInspection?.status
}))));
```

4. Explicitly request inspection using those identifiers:

```javascript
await ntApi.inspectNativeTrain('EXECUTION_ID', 'EXECUTION_UNIT_ID');
```

The inspector verifies the account, source and target, persists a once-only claim,
adds N-1 native rows, then reapplies all approved compositions including command
one. It validates the entire form after input/change handlers have run. Compare
all visible/hidden quantities against the frozen approval. Expected result:
`valid: true`, `status: "STRUCTURE_VALIDATED"`, `timingApproved: false`.

5. Inspect `ntApi.list()` or `ntApi.preparationDiagnostic()` for the persisted
   inspection report. Reload must not repeat additions or resume inspection.
   Failure/interruption cannot automatically retry. Use a fresh approved review
   for a new explicit inspection; never clear persisted claims to force a retry.
6. Close the confirmation without submitting. Repeat separately for each N.

No evidence establishes native 100 ms spacing. NT5 is structurally accepted by
equivalence, not by real BR143 execution. Fixtures verify mechanics and guards,
not server-side acceptance or timing. The inspection deliberately starts at a manually opened
confirmation so it does not need a preparation POST.
