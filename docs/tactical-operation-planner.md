# Tactical Operation Planner — Phase 1

## Scope and boundary

`services/tactical-operation-planner.js` exposes `EAS.TacticalOperationPlanner` using the repository singleton convention. It has no bootstrap registration, DOM, network, storage, timers, game-state reads, Scheduler mutation or execution authority. PlannedMission records are review data, not scheduled missions.

APIs:

- `normalizeOperation`, `normalizeSlot`, `normalizeComposition`, `normalizeCandidate`: copy supplied domain data and preserve unknown values.
- `validateComposition`: require concrete, nonempty, confirmed FULL/custom quantities and trusted complete fresh ownHome evidence. Reject negative/fractional quantities and insufficient/unknown troops.
- `resolveTravelDuration`: require trusted duration for every positive selected quantity; return maximum duration, all limiting units and evidence.
- `calculateTiming`: pure integer arithmetic for central arrival + offset − travel duration.
- `evaluateNightBonus`: milliseconds since server midnight; normal/wrapping intervals, explicit boundary inclusion or unresolved boundary result.
- `aggregateTroops`: intra-operation allocation by village, with available/allocated/remaining/overAllocated/unknown. External outgoing commands and future returns are not accounted for.
- `validatePlan`: produce and validate PlannedMission review records, balances and blockers; sort by send time, not role. Noble role maps to eventual attack command type.

## Input contract

Operation uses `centralArrivalMs`, `revision`, target metadata and `slots`. Slot includes `source: {id, coord}`, `arrivalOffsetMs`, role and composition. Composition uses `requestedMode: full|custom`, `quantities`, `confirmed`, and evidence. FULL must already be resolved to concrete troops by the caller.

Candidate has `source`, `ownHome`, `evidence: {trusted: true, complete: true, fresh: true}`, and `travelDurations: {unit: {durationMs, trusted: true, evidence}}`. Trust/freshness must be established by the future adapter; this service does not invent freshness thresholds or inspect live data. Missing unit availability stays unknown, never zero. Zero unselected quantities do not require duration evidence.

All timestamps are safe integer milliseconds in the same normalized server-calendar domain, including explicit `serverNowMs`. This layer performs no Date/timezone conversion. Night `start`/`end` are milliseconds since server midnight; optional `boundary: {includeStart, includeEnd}` defines endpoints. Equal start/end is ambiguous. Warnings never move arrival times.

Caller-supplied `externalConflicts` with matching `slotId` or `sourceId` appear as warnings only. Review records retain composition/target/travel evidence and operation revision; they grant no execution authorization.

## NT4 remains explicit and pending

Four noble slots can represent one snob each. Missing offsets or `slotPolicy.nt4Confirmed !== true` block validation. This flag acknowledges an externally reviewed policy; it does not distribute escorts, siege units or remainders. No spacing is generated. Escort distribution, siege placement, remainder handling and spacing policy remain unresolved. NT5 is unsupported.

## Phase 2 remaining work

- Feed verified ownHome snapshots and freshness/completeness evidence through adapters.
- Feed trusted per-unit durations from Arrival mapInfo without speed defaults.
- Normalize authoritative server-calendar time and night-bonus metadata at the boundary.
- Define/review explicit NT4 distribution and spacing policy before generating any compositions.
- Add review UI and revision handling separately; any future Scheduler handoff needs a separately reviewed authorization boundary. Phase 1 never calls createMission.

## Future real acceptance evidence (not constants or per-unit test data)

Target FANTASMA `484|527`, player `chargboy`; observed night bonus `00:00–08:00`; central NT4 `2026-10-06 08:01:00.000`.

| Source | Observed composition/role | Observed duration |
| --- | --- | --- |
| 507\|475 | FULL attack | 28:25:47 |
| 501\|482 | CUSTOM attack | 14:25:52 |
| 509\|494 | FULL support | 13:48:01 |
| 510\|493 | CUSTOM support | 07:08:01 |

These observations require future authoritative composition and per-unit evidence before exact planning. Focused tests use independent synthetic durations.

## Validation

`node --test --test-isolation=none tests/tactical-operation-planner.test.cjs`

The focused suite covers offsets, send ordering, duration ties/missing evidence, invalid quantities, unknown availability, double allocation, unresolved FULL/NT4, night boundaries, explicit server now, immutability and arithmetic overflow. Existing Arrival/Scheduler calculation regressions are run separately. No build is required for this standalone domain layer.

## Phase 2 — explicit read-only candidate analysis

`EAS.TacticalOperationData.analyzeTarget({target, sourceVillageIds?, groupId?, signal?, onProgress?})` collects candidates; `diagnoseTarget(options)` produces a compact report. Both start work only on explicit invocation. The normal index loads the service definitions; no scan runs at bootstrap. Phase 1 remains unchanged.

Target is resolved by PublicMap coordinate, with expected ID/name/player conflicts rejected explicitly. An expected player name uses PublicMap's existing player lookup and compares the returned owner ID. A failed optional name lookup preserves the coordinate-resolved village with unresolved name evidence; a proven different owner ID blocks analysis. Missing owner stays unknown. PublicMap freshness is its existing cache policy, not proof of instantaneous ownership; observation timestamps are not claimed as server snapshot timestamps.

Own villages and troops use `EAS.Data.*.ensureFresh()` and existing getters. Optional groups use the existing verified membership request/cache API. No Rally Point is opened. Shared data infrastructure may update its normal caches; this adapter writes no planner state and mutates no execution state. Troop completeness requires all configured units in the overview's unit columns, complete source metadata and nonnegative integer ownHome counts. Stale cache fallback is blocked, never relabeled fresh. Known zero differs from absent data.

Travel uses `ArrivalPlanner.mapInfo()` (and therefore its existing `parseMapInfo()` validation/cache/429 behavior), sequentially with the existing 150 ms pacing convention. A second concurrent analysis is rejected. Only per-unit durations are reported: no composition is chosen. Source identity is supplied in the request but is not proven by the returned payload; `originProven: false` and a warning preserve this limitation. A source failure does not erase successful candidates; abort/429 stop further requests and report pending sources. No retries are added.

Cancellation is passed to map_info and pacing. Existing PublicMap/overview/group refresh APIs do not accept AbortSignal: an already-started shared refresh may finish, but the adapter checks cancellation before launching subsequent stages. Shared rate-limit state is checked between stages, including stale-cache fallback. Progress callback exceptions cannot change collection results.

### BR143 read-only validation

Install the newly generated local userscript, open the Hub once so the normal service bootstrap is available, then run exactly:

```javascript
console.log(JSON.stringify(await EAS.TacticalOperationData.diagnoseTarget({target:{coord:'484|527',playerName:'chargboy'}}), null, 2))
```

Paste the result back. Check target identity, sources discovered, complete/blocked troops, mapInfo success/failed/pending and per-source evidence. This does not schedule, prepare, authorize or send commands. Night bonus remains user-supplied metadata; no discovery or hardcoding is performed.

## Phase 3 — review-only operation desk

`services/tactical-operation-controller.js` owns immutable in-memory draft revisions and delegates authoritative checks to Phase 1. The dedicated `modules/tactical-operation-planner.js` desk starts Phase 2 analysis only after an explicit user action. It displays eligible and blocked sources, troop evidence, per-unit durations, user-selected roles, server-calendar arrival input, derived allocation balances, and send-time ordering.

FULL is materialized only after a user action from that source's trusted `ownHome` snapshot. CUSTOM is a separate explicit mode; quantity edits clear confirmation, and the user must confirm the composition again. Edits advance the operation revision and clear prior approval. Filters affect display only; validation and approval always cover every slot. Approval is a review marker only and produces no Scheduler mission, runtime state or execution artifact.

NT4 remains fail-closed. A user may add a manual noble slot tied to an analyzed source, but policy acknowledgement, spacing, escort distribution, siege placement and remainder handling are not implemented. The operation remains blocked until a separately reviewed NT policy is defined. No Rally Point, command submission, execution runtime or timers are used by Phase 3.

Arrival and server-now inputs are normalized as UTC arithmetic over explicit server-calendar components, not browser-local timestamps. A missing server clock blocks validation. Night-bonus discovery remains outside this phase; unknown night metadata remains a warning and never changes timing.

### BR143 target identity patch

The real public-map record for 484|527 resolved successfully, but the optional supplied player name did not resolve. Previously this discarded the whole target. Coordinate resolution now remains primary; `playerName` stays null unless verified, while `ownerNameValidation` preserves the supplied name, target owner ID and validated/unresolved/not-supplied status. PublicMap owner ID 0 is explicitly unowned; absent owner ID stays unknown. Abort and rate limits still stop collection.

Compact diagnostics expose `failureStage`, `errorCode`, and a bounded explanatory `errorMessage` for target, own-village refresh/read, troop refresh/read and map_info failures. Per-source map failures retain their own diagnostics. Messages intentionally do not copy raw exceptions, HTML, URLs or tokens. The read-only Console command above is unchanged.

## Phase 4 — automatic NT(N), planning/review only

The provisional manual noble workflow is retired. Desk roles are UNUSED, ATTACK, SUPPORT, NT(2), NT(3), NT(4), NT(5). Single-noble attacks use ordinary ATTACK FULL/CUSTOM. Earlier notes about unresolved NT4 policy describe previous phases and are superseded here.

Pure domain APIs:
- `nobleTrainSize(role)` recognizes `nt2` through `nt5`.
- `buildNobleTrain({slot, candidate, count?})` returns `{valid, blockers, slots}`. No inputs are mutated and no live data is read.
- `validatePlan()` expands each NT parent slot, validates the derived commands through the existing composition/timing path, aggregates their troop allocations with other selected slots, and sorts review records by actual send time. Each review record identifies `parentSlotId`, `trainIndex` and `trainSize`.

Axe and light divide by floor(total/N), with remaining units assigned from NT1 forwards. Siege is allocated entirely to NT1; one knight, when present, also goes only to NT1. Every command gets one noble. Other units are ignored. Optional missing siege/knight does not require a new scan. Extra nobles remain available.

Generated commands require at least 150 axe and 150 light each. Blockers are `INSUFFICIENT_NOBLES`, `INSUFFICIENT_AXE_ESCORT`, `INSUFFICIENT_LIGHT_ESCORT`; invalid/unknown evidence and timing retain existing fail-closed checks. No downgrade occurs. Unknown escorts are not replaced with zero. NT1 arrives at central arrival plus parent offset; subsequent commands add exactly 100 ms each. Each composition independently resolves its limiting units and duration; no travel modifier was added.

Controller selection derives trains automatically. NT composition editing/materialization/confirmation APIs are no-ops for NT slots, and those controls are absent from their rows. Derived compositions use the existing concrete composition validation representation internally; they are not editable CUSTOM requests. Returning to ATTACK/SUPPORT clears NT composition and requires the ordinary explicit workflow. UNUSED releases allocations. Summary counts are source-slot counts; a blocked train counts as one blocked selected slot. Per-command review shows READY/BLOCKED, specific blockers, troops, send, duration and millisecond arrival.

No Scheduler mission, authorization, execution timer, baseline or command is created. Data scanning semantics are unchanged. BR143 validation should select NT(4) on a suitable analyzed source, verify the four compositions, 100 ms spacing, independent send times and derived remaining nobles, without sending anything.

## Focused UX refinement after real Phase 4 validation

CUSTOM can be opened directly from ATTACK/SUPPORT. The controller materializes only zero selected quantities from the already trusted candidate's unit keys when the draft is empty; existing FULL-to-CUSTOM quantities remain preserved. The editor reads availability directly from candidate.ownHome and displays it separately from selected quantities. Untrusted availability is labelled unverified, never converted into permission. Opening/editing CUSTOM makes no data request. The prior implementation had no domain FULL prerequisite, but left a fresh CUSTOM map empty and displayed inputs without availability; this explicit initialization and availability presentation remove that UI ambiguity.

The contextual OPERAÇÃO action shares Arrival's existing info_village mount and resolveTarget identity checks. resolveOperationTarget adds optional player metadata from unambiguous info_player links scoped to #village_info. Coordinates and stable village IDs remain primary; names remain contextual. The action loads the existing Planner module on demand and calls open({target}); no analysis starts until the user clicks Analisar alvo. Stable IDs are forwarded to ordinary analysis while the coordinate remains unchanged; editing the coordinate drops the old IDs.

Slot-local rerenders capture the affected data-slot-id row's relative viewport position and the actual scrollable ancestor positions. Immediately after rendering, the same row is found and scroll offsets are corrected synchronously, including nested scrollers. No timers are added. Filters and new analysis do not invoke anchor restoration.

Phase 4 literal question marks in NT presentation strings were source corruption, not domain data. Those strings now use JavaScript Unicode escapes to produce Portuguese text and em dashes consistently through the local builder. NT distribution/timing logic is unchanged.

## Phase 5 — Final Operation Review

The Desk's `Aprovar revisão` action derives `EAS.TacticalOperationController.buildFinalReview(draft, {unitOrder})` from `validateDraft()` before opening a separate read-only view. The review contains concrete planner missions sorted by desired arrival, then send time, then slot ID, including each generated NT child, train parent/index metadata, per-command blockers, operation totals/counts, and evidence-backed validation dimensions. Zero troop quantities are omitted from command compositions. Before approval, the view exposes only return-to-edit and approval actions; after approval, a separate action can enqueue the snapshot for preparation.

`approveFinalReview(draft, review, approvedAt?)` returns a deeply frozen `{snapshotKind: 'tactical-approved-operation', version: 1, ...}` snapshot containing reviewed target/timing, concrete commands, totals, counts and validation. Approval re-derives and compares the review and requires matching operation ID/revision; edits through the Desk advance the revision, so a returned-and-edited draft needs a new review. The snapshot intentionally excludes candidates and raw analysis data. It stays in memory only: this phase does not create Scheduler missions, prepare Rally Point commands, send, or start timers.

Validation: `node --test tests/tactical-operation-controller.test.cjs` and the `tactical-operation-planner.test.html` / `tactical-operation-ux.test.html` browser fixtures cover derivation, NT expansion, blocked approval, stale review rejection, read-only controls, return preservation, and target-page metadata handoff.

## Phase 6 - Preparation boundary (extended by final execution below)

`services/tactical-operation-scheduler-adapter.js` consumes only the version-1 `tactical-approved-operation` snapshot. `deriveExecutionUnits(snapshot)` copies approved concrete data without recalculating troops, target, command type, arrival, duration, or source. ATTACK/SUPPORT produce one `single-command` unit. NT(N) produces one `native-noble-train` unit retaining all N approved children; no child is sent independently. The Tactical queue is stored separately under `eas_tw_tactical_scheduler_v1`, scoped by world/player. It does not call `MissionScheduler.createMission()` or the legacy execution initializer.

The planner places `parentSlotId` on ordinary commands as a self-reference too. Classification therefore uses NT child markers (`trainIndex`/`trainSize`, or a parent different from the command's own slot ID); a self-parented ATTACK/SUPPORT remains a simple command. Safe label helpers emit no zero/null NT labels.

Native timing separates child arrival intentions from one `nativeSubmitAtMs`. All approved child timestamps and compositions remain immutable. Neither equal nor unequal child send times prove the native submit timestamp. Current fixtures contain no authoritative native common duration/row offsets. Consequently NT(2-5) remain one group each, blocked with `NATIVE_NT_NATIVE_TIMING_UNPROVEN`, and `nativeSubmitAtMs: null`. No child is submitted independently. Observed ~100 ms spacing is not a measured browser-submit schedule.

The lifecycle is `SCHEDULED → PRECHECK_10M → PREPARE_5M → SYNC_2M → READY_TO_SEND`, with `BLOCKED` and `CANCELLED` terminal preparation outcomes. A user explicitly authorizes preflight per execution unit/group. Existing Scheduler ticks run only the T−10 session/login/anti-bot/source/target check for authorized units. T−5 is a user action that opens the bound source's Rally Point; another explicit action fills the exact approved composition and opens the first confirmation step. Native NT uses only the game's non-submit “Adicionar ataque adicional” controls, then parses and reconciles every confirmation row. No final submit control is clicked.

T−2 requires three stable samples, a fresh server clock, and `Timing.getCurrentServerTime()` precision together with `World.getServerDateTime()`. Second-only fallback is rejected as `CLOCK_PRECISION_UNAVAILABLE`; outlier, stale, and implausible offsets block. The Scheduler view displays sample count, offset, spread, current state, and blockers.

Persisted transitions retain immutable execution identity and checkpoint evidence.
`preparationAuthorization` still authorizes preparation only. Final authorization,
arming and recovery are described in the next section. `compareOutgoing()` remains
a planning-level evidence comparator; the live single execution uses the shared
Arrival reconciliation instead of treating arbitrary observations as send proof.

BR143 dry-run: install the generated local build; approve and add one simple ATTACK to Tactical preparation; explicitly authorize it in Scheduled Missions; allow the T−10 check; at T−5 open the bound Rally Point, apply the approved quantities, and open confirmation; at T−2 synchronize and reconcile. Verify `READY_TO_SEND`, then stop without clicking Tribal Wars' final submit. NT dry-run is a separate follow-up because some approved child send-time patterns intentionally block until a safe shared native send time is proven.

## Phase 7 — editable drafts and operation agenda UX

Editable drafts use `EAS.TacticalOperationDrafts` with namespaced key `eas_tw_tactical_operation_drafts_v1:<world>:<player>`, schema version 1, a 20-record cap, a 200-selected-slot cap, and a per-record size bound. Records contain only user intent: label, target metadata/coordinate, previous central arrival, selected village IDs, roles, offsets, FULL intent, CUSTOM quantities, and filter. They exclude candidates, troop/timing evidence, analysis payloads, validation, and approvals. Loading only fills the Desk fields; the user must analyze again. `restoreEditableConfiguration()` applies saved roles/offsets/intent to fresh candidates, leaves compositions unconfirmed, rebuilds FULL from current trusted troops, and leaves the newly entered central arrival authoritative. A new Final Review and approval are required.

Cancelled Tactical execution units/groups remain in the versioned Tactical history store but are filtered out of `listActive()`. Native NT is already one execution unit, so cancelling it removes the entire group. The Scheduler tick only processes `SCHEDULED` units; a cancelled record is terminal across rerender/reload.

Scheduled Missions groups active Tactical cards by approved operation ID/revision inside a collapsible operation parent. Parent status/counts are presentation aggregates only; every unit retains its own state, blocker, timing, authorization, and cancel action. Legacy missions remain in their existing list. Tactical Desk, Final Review, and Scheduled Missions use fixed, viewport-bounded `.eas-window` surfaces with internally scrolling bodies; the Desk retains its row anchor restoration.


## Final execution validation (local, awaiting BR143)

Simple ATTACK/SUPPORT reuse `MassSnipePrecise.createScheduler`, the shared
`FakesExecution.readOutgoingCommands` reader, and `ArrivalExecution.matchOutgoing`.
No new clock or outgoing parser is introduced. The existing preparation controls
remain manual. Final execution is a separate explicit action on the confirmation panel.

Before opening confirmation the adapter captures an available BEFORE inventory,
creates one attempt ID, persists it and verifies read-back. An unavailable inventory
never becomes empty. Older prepared executions without this baseline cannot send;
create a newly approved execution instead of patching persisted state.

`Autorizar envio real` binds `tactical-final-submit` authorization to operation,
revision, execution/unit IDs, source, target, type, full approved composition and
submit timestamp. Preflight approval is insufficient. The final live check requires
the same confirmation, one visible enabled final submit, exact composition, trusted
session and a fresh precise server clock. Maximum permitted lateness is 1000 ms,
matching Arrival's boundary. No latency compensation is invented.

Arming holds a browser Web Lock scoped to world/player/execution/unit. Missing Web
Locks blocks. At the boundary it re-reads persistent state, writes an independent
consumed tombstone and SUBMITTING attempt, and verifies read-back before the single
native button action. Duplicate callbacks cannot click twice. Manual send while armed
also consumes the authorization. Tombstones are intentionally not cleared automatically.
The scheduler is cancelled on document exit. Reload never automatically rearms.

A click transitions through RECONCILING; until outgoing proof exists the result is
UNCERTAIN. Return navigation triggers one read of the existing outgoing DOM. New ID,
source, target, type and arrival evidence are matched by the shared Arrival matcher.
The early baseline requires timing evidence. Only an exact match becomes COMPLETED;
missing/ambiguous evidence stays UNCERTAIN without resend. A manual read-only
`Reconciliar novamente, sem reenviar` action permits another observation. No network
polling/retry is added. Attempt/baseline identity is preserved through recovery.

### Historical final-execution test (not the current preparation validation)

1. Plan one low-risk simple ATTACK with enough time for the existing T-10/T-5/T-2
   checkpoints; approve Final Review, add to preparation and authorize preparation.
2. At T-5 open its source Rally Point, apply approved composition, and open confirmation.
   Confirm baseline availability; no final send has occurred.
3. Validate the command; at T-2 synchronize and validate. Choose **DRY RUN - armar
   sem enviar**. Keep this tab open. At the deadline expect DRY RUN completed and
   zero new outgoing commands. Use a new execution for the subsequent real test.
4. NT(4) is deliberately BLOCKED, not READY. To collect native evidence without sending,
   manually prepare the approved first attack and add the three native additional rows.
   Do not click Enviar ataque. With the Tactical adapter loaded, run:

```js
// If the adapter is not loaded on this manually opened confirmation:
await EASLocalBuild.execute('services/tactical-operation-scheduler-adapter.js');
JSON.stringify(EAS.TacticalOperationSchedulerAdapter.nativeTimingDiagnostic(window), null, 2)
// Equivalent global helper:
JSON.stringify(EASTacticalNativeTimingDebug(), null, 2)
```

The diagnostic is read-only and excludes tokens/form actions/script bodies. It inventories
native timing text, numeric timing attributes and numeric timing inputs. Capture it before
and after adding the rows. Missing proof is the common native duration from final submit
to first arrival, each native row's offset relative to it, and stable row/timing structure.
A plain duration or independent map_info unit durations cannot establish those semantics.
It never computes an optimistic submit timestamp. NT real send remains unavailable.

### Controlled real test

1. Complete the simple dry run first. Create a NEW low-risk ATTACK, repeat preparation
   and synchronization, then explicitly choose **Autorizar envio real** before the deadline.
2. Keep the confirmation tab active. Expect one final action, then COMPLETED with one new
   outgoing ID. Independently inspect the game. UNCERTAIN means inspect/reconcile, never
   press the game submit again or authorize a replacement blindly.
3. Repeat with one low-risk SUPPORT only after the ATTACK reconciliation is verified.
4. Do not test native NT real submission yet: native timing is still unproven.

Browser scheduling does not guarantee the server's recorded millisecond of receipt.
No live BR143 send has been performed by this patch's automated tests.


## BR143 preparation-only validation: automatic T-5

The current authorized flow stops at **PREPARED**. Do not follow the historical
confirmation/send test above for this validation.

Code-path findings:

- The agenda button called `openRallyPoint`, but the scheduler hook only visited
  `SCHEDULED` units for T-10. It never performed T-5 for `PRECHECK_10M` units.
  The index bootstrap also only attached that hook for `SCHEDULED` records.
- Tactical's old identity verifier independently vetoed a canonical Place card
  whenever `readCommandTarget().actualTarget` disagreed. That payload prioritizes
  native x/y fields and can differ from the resolved widget. It also accepted a
  typed coordinate without resolution. The provided real screenshot does not
  identify which raw payload value triggered the real mismatch; the regression
  reproduces the conflicting hidden-payload case without attributing that value
  to BR143.
- The agenda rendered operation groups and then its observer grouped their cards
  again. Moving the cards left the first header empty. No execution unit was
  created by this rendering path. The regression verifies one stored unit and
  one nonempty header; confirming the user's original record count still requires
  their persisted diagnostic.

Implementation boundary:

- Existing scheduler tick calls the same `openRallyPoint` service. Automatic mode
  uses current-tab navigation (no popup activation requirement). It persists and
  reads back `unit.rallyPreparation` with the exact execution/unit context before
  navigation. Repeated ticks do not repeat a pending navigation.
- Index reattaches the existing scheduler for both SCHEDULED and PRECHECK_10M.
  On the Rally Point, its actual resume router loads Place and recovers the unit
  from storage and the two URL IDs. No pre-navigation closure is needed.
- Target application uses `Place.ensureCommandTarget`; resolved identity uses
  `Place.readTargetReadiness`. A single visible canonical village card must prove
  the exact coordinate. Busy, hidden, conflicting visible input, and multiple
  visible cards fail closed. A consumed/hidden input is not an independent veto.
  The previously supported canonical container outside the form remains supported.
- Source/session/time/authorization are checked again after awaiting native
  resolution. All troop inputs and availability are validated before writing;
  positive missing inputs block, missing zero units are allowed, and zero fields
  stay blank. Read-back is persisted as `rallyPreparation.evidence` with state
  PREPARED and no next checkpoint. Concurrent same-document preparation shares
  a Promise; subsequent calls read the persisted state.
- This path creates no send attempt, outgoing baseline or final authorization,
  and exposes no action to open confirmation. It does not click Attack/Support
  or submit a form. Existing final-execution tests exercise that older boundary
  separately, not through this new preparation path.

Local regression `tactical-t5-navigation.test.html` uses the real MissionScheduler
and index bootstrap in two actual browser documents. Only the clock, native target
widget response and local transport destination are fixtures. No game request or
real attack is made. It tests T-10, before/exact T-5, navigation, persisted recovery,
automatic troop fill and zero sending effects without opening the agenda.

### Minimal next BR143 test

1. Install the new local build. Create one simple ATTACK with enough time for T-10,
   approve its exact composition and authorize preparation. Keep one EAS tab active.
2. Close the agenda. At T-10 expect ACCEPTED; at T-5 expect the same tab to navigate
   automatically to the source Rally Point, carrying both Tactical URL IDs.
3. Verify the native target card and sword 7 / axe 5930 / light 3117 / heavy 2 (or
   the exact newly approved composition), zero fields blank, and PREPARED.
4. Stop there: do not click Attack, Support or confirmation. Verify no outgoing
   command was created. Inspect the agenda for one nonempty operation header.
5. Capture the safe persisted diagnostics if anything blocks:

```js
JSON.stringify(EAS.TacticalOperationSchedulerAdapter.preparationDiagnostic(), null, 2)
```

Logger events: `TACTICAL_PREPARATION_NAVIGATION`,
`TACTICAL_PREPARATION_BOOTSTRAP_RESUMED`, `TACTICAL_TARGET_IDENTITY_DIAGNOSTIC`,
`TACTICAL_PREPARATION_COMPLETED` / `TACTICAL_PREPARATION_BLOCKED`.
Server timing/checkpoint/delta and sanitized expected URL are recorded for navigation;
resolved candidates, busy/visibility and readiness reason are recorded for target proof.
The real BR143 validation remains pending.
