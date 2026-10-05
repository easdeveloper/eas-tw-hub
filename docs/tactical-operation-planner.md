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

Phase 3 still needs composition/review UI and reviewed NT policy. Phase 2 does not resolve FULL, distribute escorts or create missions.

### BR143 target identity patch

The real public-map record for 484|527 resolved successfully, but the optional supplied player name did not resolve. Previously this discarded the whole target. Coordinate resolution now remains primary; `playerName` stays null unless verified, while `ownerNameValidation` preserves the supplied name, target owner ID and validated/unresolved/not-supplied status. PublicMap owner ID 0 is explicitly unowned; absent owner ID stays unknown. Abort and rate limits still stop collection.

Compact diagnostics expose `failureStage`, `errorCode`, and a bounded explanatory `errorMessage` for target, own-village refresh/read, troop refresh/read and map_info failures. Per-source map failures retain their own diagnostics. Messages intentionally do not copy raw exceptions, HTML, URLs or tokens. The read-only Console command above is unchanged.
