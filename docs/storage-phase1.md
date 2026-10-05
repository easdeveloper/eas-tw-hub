# Storage Phase 1: Market Offers history

## Contract and ownership

- **CRITICAL**: active execution, authorization, attempt claims, BEFORE baseline,
  reconciliation, uncertain evidence and anti-resend markers. Not subject to history retention.
- **CONFIG**: small user preferences.
- **CACHE**: data reconstructible from the game.
- **HISTORY**: terminal outcomes and compact historical evidence. Never grants authorization.
- **DIAGNOSTIC**: disposable bounded logs.

Storage cleanup must never be implemented as prefix-wide deletion.

| Key | Class | Writer / reader |
| --- | --- | --- |
| eas_tw_market_offers_execution | CRITICAL | MarketOffersExecution read/save/remove; MarketOffersBatch uses that API; bootstrap/UI/logger read status; RateLimit may persist safety state |
| eas_tw_market_offers_archive:<executionId> | HISTORY | archiveBatch; getArchivedBatch / EASMarketOffersDebug.getArchive only |
| eas_tw_market_offers_history | HISTORY | executor addHistory; Smart Offers UI reads (200 entries) |
| eas_tw_market_offers_debug_log | DIAGNOSTIC | executor logging/read/clear (200 entries) |
| eas_tw_market_offers_analysis | CACHE | Smart Offers UI; Villages invalidation |
| eas_tw_market_offers_config | CONFIG | Smart Offers UI; executor reads |

Before this patch archiveBatch serialized the whole terminal context. All repository
references were traced: no resume or reconciliation reads an archive. They read the
active key. getArchivedBatch is a diagnostics API, not an execution restore API.
The old save/remove gates could also refuse to replace a terminal execution when
optional history persistence failed.

## V2

`archiveKind: market-offers-history`, `version: 2`. Explicit projection only:
execution identity/timestamps/state, safe authorizedAt metadata, counts and an
uncertainty flag. Per-item operation, outcome, attempt identity/state/submit time,
matched offer ID, reconciliation evidence, BEFORE count, failure reason/game error,
and up to 20 numeric AFTER IDs plus total AFTER count.

No executable batchAuthorization/plan, queue, tab ownership, locks, full BEFORE/AFTER
rows, analysis/cache/UI or event arrays. Diagnostic strings are capped at 240 characters;
execution/item/attempt identities are not shortened. AFTER IDs are a sample, not a baseline.
This history must never be passed to save/resume or used to reconstruct an attempt.
The critical execution representation and submission/reconciliation algorithms are unchanged.

Legacy V1 means a full context archive (currently execution schema version 3), not
necessarily a literal version:1 field. Unknown schemas remain protected. The reader
projects recognized legacy records to the same diagnostic V2 representation without
rewriting their stored bytes or returning executable authorization.

## Retention and admission

Limits for recognized compact V2 history: 10 records, 7 days, and 256 KiB estimated
Web Storage bytes, calculated conservatively as 2 * (key.length + value.length). This
is a policy metric, not a claim about a browser's exact quota implementation. Every
recognized V2 record counts toward count/bytes, including protected records; only safe
eligible records may be removed. Legacy V1, unknown, and malformed archives do not
count toward V2 limits and are never deleted by normal admission.

No startup/submit/quota path deletes existing browser data. New archive writes enforce
V2-only count and byte admission limits; duplicate execution IDs do not append or
overwrite. If protected V2 records exhaust the budget, writes return false and log
ARCHIVE_WRITE_FAILED. V1/unknown bytes remain part of the physical-storage diagnostic
total and may still cause the browser's actual localStorage quota to reject a write.

Explicit maintenance API: `EAS.MarketOffersExecution.retainArchives()`.
Default maintenance applies age/count/byte limits to V2 records only and removes the
oldest eligible V2 records. V1 history is preserved and does not distort V2 accounting.
Explicit `{includeLegacy: true}` adds a separate legacy pass with its own count/byte/age
totals and permits removal only of V1 records proven safe by the existing checks.
Protected legacy overage does not cause V2 deletion. No automatic legacy migration or
deletion occurs. Age limits are applied only when maintenance is explicitly requested,
not by a timer or normal completion.

Eligibility requires matching key/identity, recognized schema, explicit terminal state,
positive finish timestamp, known item outcomes and no uncertain/in-flight attempt.
A submitted item requires completed attempt + created status + real offer ID.
Malformed/unknown/ambiguous records and any record matching the current execution ID
are preserved. An unreadable active record aborts maintenance. Recheck active bytes and
candidate bytes immediately before each removal. No other prefix is touched.
Protected V2 history may exceed the V2 budget; it is never discarded to satisfy a
quota. New V2 writes then stop until eligible V2 history can be explicitly retained or
removed. Protected V1/unknown history does not block V2 policy admission, though actual
browser storage quota remains authoritative.

## Failures

No retries, localStorage.clear or critical deletion to make room. Archive failure cannot
undo a persisted terminal result or authorize another send. Proven safe terminal contexts
can be explicitly replaced/removed even if optional history failed; the new critical write
still uses existing revision/read-back protections. Ambiguous terminal contexts retain the
archive preservation gate. A failed critical write remains a failed critical write.
Archive logging is best-effort and cannot throw into execution.

## Fakes Summary V2

`eas_tw_fakes_execution_summary` is history-only, explicitly tagged with
`summaryKind: "fakes-execution-summary"` and `version: 2`. It contains terminal
metadata/counts, compact per-command result rows, and a separate unresolved-attempt
evidence list. It omits the active queue objects, execution tab binding, auto mode,
forwarding state, troop configuration, and raw outgoing snapshot object.

Top-level fields are `summaryKind`, `version`, `createdAt`, `finishedAt`, `elapsedMs`,
`stopped`, optional `stopReason`, `preset`, `commandType`, `counts`, `results`, and
`unresolvedEvidence`. Result rows contain `commandRef`, source/target village IDs,
target coordinate, terminal `outcome`, and only applicable executed command type,
matched outgoing command ID, completion time, or compact error code/reason/time.
Unresolved evidence contains the non-authorizing command reference and source/target,
attempt state/time, outgoing snapshot capture time, baseline command IDs, and reason.
The raw attempt ID is omitted because current attempt IDs embed the execution-tab token.
Completed/reconciled rows do not retain baseline command ID arrays.

The ordering remains: persist the full terminal execution to
`eas_tw_fakes_execution`; write the projected V2 summary; only then remove the active
execution and Fake preset mirrors. If the optional summary write fails, the terminal
active context remains stored and cannot resume because it is already finished.
Summary V2 is never read by resume or reconciliation. Existing unversioned summaries
are legacy V1; they are neither migrated nor deleted, and a later successful run may
overwrite the existing single summary slot.

The 730-command `fakes-auto-execution.test.cjs` fixture measures the full-context
legacy-equivalent and compact V2 serialized sizes during the same test run; random
attempt identifiers make the legacy byte count vary slightly between runs. Active
execution persistence and outgoing baseline/reconciliation logic are unchanged.

## Measured synthetic fixture

84 terminal offers with 20 baseline rows and eight diagnostic events per item:
context / old full-context archive: **377,757 UTF-8 bytes**;
V2: **35,417 UTF-8 bytes**, **90.62% reduction**.
This is measured test data, not a claim about exact BR143 archive sizes.
The admission/retention budget uses the separate UTF-16 key/value metric above.
