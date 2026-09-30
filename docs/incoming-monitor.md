# Incoming Attack Monitor

## Baseline

Implementation started from a clean `main` at `bfba96d8375737dc4bd2a5c727607a5839baf0c1`, tagged `stable-fake-87of87` (annotated tag peeled to that commit). No Fake, Market, Scheduler, Groups or troop execution files were changed.

## Architecture

- `services/incoming-parser.js`: authoritative overview parser. Rows come only from `input[name^="command_ids["]` and their nearest row; ID sources must agree. Own target village, source, attacker, distance, exact arrival, size and Watchtower evidence are independent. Dates reuse `MassSnipeExecution`.
- `services/incoming-model.js`: pure classification, merge, labels and Discord payload. The initial event time is immutable; current countdown never becomes launch time. Shared speeds remain explicit groups. A Watchtower unit does not overwrite the calculated candidate group.
- `services/incoming-store.js`: world/player scoped, read-back checked state. Maximum 2,000 records / 2 MB; ended records retained seven days. Exceeding the limit stops work rather than evicting active dedupe identities. Events are separately bounded at 50.
- `services/incoming-monitor.js`: `EAS.Runtime` owns listeners/timers and cancellation. A Web Lock serializes reconciliation/actions across tabs; burst events are debounced 250 ms. Minimum overview interval is three seconds across documents. Watchtower reads are at most once per minute across tabs without a new event. Failed reads back off 5/15 seconds and stop after three failures. RATE_LIMITED stops automatically. No global WebSocket patch, page reload or new socket connection.
- `services/incoming-socket.js`: subscribes directly to the real, game-owned `Connection.socket` namespace `/game`. It never calls `Connection.addSocketListener`, `connect`, `emit` or `off(event)` without the exact owned handler. Handles attack, observed command_count types, connect and disconnect. A connected socket gets four owned listeners exactly once; stop/pagehide removes those four only. Late availability uses local reference checks at 250/500/1000/2000/5000 ms; stable identity is checked every 15 seconds, plus focus/visibility changes. These checks perform no network operation. Silent replacement can therefore have an observation gap up to 15 seconds; normal reconnect events are handled immediately. Reconnect/replacement requests an authoritative catch-up without fabricating an attack creation timestamp.
- `services/incoming-transport.js`: reuses `ArrivalPlanner.mapInfo` and its validated parser/cache; adds in-flight dedupe. Label POST uses the proven `edit_other_comment` endpoint and current `window.csrf_token`, already used by the repository's original Mass Snipe integration. No static action token. Successful HTTP does not prove a label: a subsequent overview must match the desired text.
- `modules/incoming-monitor.js`: opt-in Hub panel. Disabled monitor loads no monitor services or background requests. `index.js` resumes only explicitly enabled configurations.
- `eas-discord-transport.user.js`: optional companion userscript, isolated from the validated `@grant none` local loader. Stores webhook through GM storage, not page storage. Uses POST with `wait=true`, then PATCH by returned message ID. No browser fetch fallback. No webhook URL is exposed by the bridge or logged.

Map/label/Discord work is sequential, paced at least 1.1 seconds apart, limited to three attacks per reconciliation batch. Backlogged entries continue through the same throttled path. New attack hints can advance a Watchtower timer without bypassing the shared minimum interval. Hints arriving during a request schedule one additional reconciliation.

## Exactly-once limits

Discord creation intention is persisted **before** the external POST. Lost response, navigation or crash leaves pending/uncertain status and prevents automatic creation again. This favors avoiding duplicate alerts over guaranteed delivery; Discord webhooks do not provide the transactional storage operation needed to promise both. Edits retain the original message ID; failed identical edits are not retried indefinitely. Labels follow the same no-blind-retry policy and are proven by later overview read-back. All actions require explicit monitor configuration; baseline entries never notify or rename.

The first packet is a timing hint, not command identity. A single new command and a matching target event within 30 seconds can be associated. Duplicate packet deliveries within one second use the earliest time, only when exactly one new row matches that target; all hints in that burst are consumed together and cannot time a later command. Multiple commands/events that cannot be distinguished stay unclassified. If the row is not yet visible, at most three reads spaced by the shared minimum interval retain the original timestamp. Travel-time matches allow one second early / two seconds late; no broad tolerance or guessed unit. Existing attacks discovered without an event may be notified as newly observed, with speed explicitly unproven.

## Native evidence and remaining limitation

1. **Native socket accessor confirmed.** User validated `Connection.socket.connected`, namespace `/game`, and on/off in BR143 `game.47097f.js`. Integration now starts automatically when the enabled monitor boots. Incoming counts `incoming_attack` and `attack` are hints only; `count: "0"` is never an empty snapshot. Other count types are ignored. Native listeners are retained, including through replacements and cleanup. Logs include `LISTENERS_ATTACHED`, `WAITING_FOR_CONNECTION_SOCKET`, `DISCONNECTED`, `RECONNECTED`, `LISTENERS_REMOVED` and event timestamps, without socket session IDs or tokens.
2. **Empty overview confirmed in production BR143.** The final route is `screen=overview_villages&mode=incomings&type=unignored&subtype=attacks`. The selected attacks view had zero command rows, one form, 31 tables and no pagination. Fetch now explicitly requests `type=unignored`. Empty recognition requires that route, a form, a table and a same-origin attacks-overview navigation link; no orphan command markers, pagination, login or error evidence may be present. Incidental table counts are not hardcoded. A recognized empty result persists the baseline normally; arbitrary empty/incomplete HTML still fails closed. The representative empty fixture models these structural facts, not a verbatim production HTML capture.
3. **Socket evidence.** `window.Connection.socket` is connected to `/game`, with `on/off/emit`. Native `addSocketListener` calls `off(name)` before bridging events, so EAS never uses it. Real `attack` and `command_count` packets trigger debounced authoritative reads only. No socket session ID or CSRF token is logged.

## Violentmonkey permissions

The main local build retains its current permissions and static factories. Install the optional companion only for Discord. It declares `GM_xmlhttpRequest`, `GM_getValue`, `GM_setValue`, `GM_registerMenuCommand`, `unsafeWindow`, `@connect discord.com`, and `@noframes`. Configure a standard text-channel webhook via its Violentmonkey menu, scoped to the current world. Forum/thread webhooks are not supported in this version. The panel shows only configured/unconfigured; never paste the secret in diagnostic output.

API references: [Violentmonkey privileged APIs](https://violentmonkey.github.io/api/gm/), [official Discord webhook API](https://github.com/discord/discord-api-docs/blob/main/developers/resources/webhook.mdx).

## Real-game checklist

1. Install generated local build and, if desired, companion. Configure webhook locally. Enable monitor, optional labels and Discord in the Hub.
2. Confirm native sensor connected and baseline registered. Existing incoming commands must not alert or rename. Start with zero attacks: confirm BASELINE_EMPTY and persisted initialized state before sending the controlled attack.
3. Receive one controlled attack. Inspect `IncomingMonitor` socket/reconcile/new/classify logs and immutable firstDetectedAt. Confirm one label and one Discord message with truthful speed group.
4. Repeat socket hints/reload/navigate and use two game tabs. Confirm no duplicate listener, label or Discord creation and no extra idle requests.
5. Observe tower enrichment: structured tiny unit evidence updates the same command, label and Discord message ID. Attack-size remains independent.
6. Confirm removal/arrival stops tracking once authoritative evidence permits; disable monitor and verify pending reads/listeners cease. Test a lost Discord response: no automatic resend.
7. Check Fake/Market/Scheduler behavior and idle Network. No commit/push until real validation.

Collect safe monitor logs with:

```js
JSON.stringify(EASDebug().events.filter(event => event.module === 'IncomingMonitor'), null, 2)
```

Expect `SOCKET_ATTACHED` once per socket object, `SOCKET_EVENT`, `BASELINE_EMPTY` on the first valid empty baseline, `RECONCILE`, `NEW_INCOMING`, and `DISCORD_SENT` or `DISCORD_FAILED`. `watchtower` and a Discord `updated` operation must retain the same command/message IDs. A reconnect may cause a catch-up read but cannot create a new attack identity by itself.

## Tests

Fixtures reproduce the supplied populated HTML, including nested parent rows, repeated markers, size images and tower variants. Node tests cover classification, immutable timing, baseline/dedupe, label read-back, Discord creation/edit/uncertainty, request pacing/debounce, cancellation, bounded storage and secret-safe transport. Browser fixture exercises the real DOM/date parser. Full-regression results and local build ID are reported in the task delivery.

Validation results and regenerated build IDs are reported in the task delivery. The prior full run had a preexisting failure in `scheduled-mission-process2.test.html`, reproduced against HEAD (noble field zero versus empty, and stale confirmation panel); no Scheduler code is changed here.

Latest validation: 280/280 Node tests passed (`local-test/incoming-final-node.txt`). Browser: 49/50 pages passed after correcting and rerunning the socket fixture (14 assertions); parser 25 assertions. The remaining failure is the preexisting Scheduler test described above. All three minting result elements passed. JavaScript syntax and `git diff --check` passed. No live game or Discord actions were performed.

Local artifacts: `local-test/eas-tw-local.user.js` and `local-test/eas-discord-transport.user.js` (copy of the optional companion, version 0.1.0). Main build: `local-a4c5dc857cdc92c5`. Loader permissions are unchanged.

## Socket-to-reconciliation diagnostics (BR143 follow-up)

Production established SOCKET_EVENT reception but did not include persisted failure counters or lock ownership. That evidence alone cannot identify which old silent guard returned. Code review reproduced two lost-work paths: unavailable cross-tab run lock returned without retry; a new lifecycle timer could consume an old in-flight promise, whose finalizer would not schedule the new generation. Both now retain work, with at most three lock retries spaced three seconds apart and generation-aware continuation. No periodic fallback scan is added.

All scheduling emits RECONCILE_SCHEDULED; coalescing preserves the earliest timer and emits RECONCILE_SKIPPED/DEBOUNCED. RECONCILE_START precedes lock acquisition. RECONCILE_RESULT follows successful merge/actions; RECONCILE_FAILED reports sanitized failure reasons. Disabled, failure-limit, read backoff, busy lock, no relevant change, lifecycle change and concurrent-run exits report explicit reasons. Persisted failure limits and RATE_LIMITED remain safety stops, not silently reset by new socket events. Event-storage completion from a disposed generation cannot schedule another generation.

New regression tests drive runtime timers (rather than only calling reconcile directly): each real event type, three-packet burst, reconnect, disabled/failure guard, bounded lock contention and stop/start during an in-flight read. Existing tests retain baseline/dedupe and uncertain Discord no-resend coverage.

### Exact BR143 validation

1. Install the regenerated main local userscript, leave the Discord companion installed, and reload once. Do not clear monitor storage or dedupe identities.
2. Open the monitor and confirm enabled, native socket attached, baseline registered and Discord enabled/configured. Inspect the new logs before issuing an attack. If FAILURE_LIMIT appears, retain the diagnostic output; after resolving its reported cause, save the enabled configuration once to use the existing manual recovery path. Do not automatically retry uncertain Discord entries.
3. Wait for the initial reconciliation to finish, then send exactly one NEW controlled attack to the monitored account. Do not use the old attack as the acceptance test.
4. Filter EAS.Logger.entries() for module IncomingMonitor. Expect SOCKET_EVENT, RECONCILE_SCHEDULED, RECONCILE_START, RECONCILE_RESULT, NEW_INCOMING and one DISCORD_SENT for the new ID. READ_BACKOFF may defer a read to the persisted three-second boundary; DEBOUNCED must retain a scheduled timer.
5. Repeated command_count/reconnect and F5 must not create another Discord message for that ID. Watchtower enrichment may update its existing message ID. Any uncertain response must remain without automatic resend.
6. If no result arrives, collect RECONCILE_SKIPPED/FAILED reasons and counts, without webhook, token or raw event payloads. Production root cause is confirmed only when this evidence identifies the guard/path.

Follow-up validation: 288/288 Node tests passed (`local-test/incoming-trigger-node.txt`); 49/50 browser pages passed, with only the previously reproduced `scheduled-mission-process2.test.html` failure. Incoming tests all passed. Syntax and git diff checks passed. Build: `local-2b0cb5babe584749`. No production actions, commit, push or publication.

## BR143 real-row parser correction

The old INCOMING_INCOMPLETE_PAGE guard was a global union of `.error_box`, login forms, `.paged-nav` and any link containing `page=`. Merely having a pagination widget or an unrelated paginated menu invalidated the response before command parsing. The supplied production row contains none of those markers, so it cannot identify which selector matched elsewhere in the 59,199-character production document. This distinction remains unproven until a reasonCode or surrounding matching element is captured; the supplied row itself parses correctly.

Pagination validation now inspects same-origin game-page destinations and incoming screen/mode/subtype rather than rejecting all paged links or the mere widget class. Links to a different incoming page still fail closed. Login/game errors remain rejected. Empty responses still require recognized route/form/table/navigation and no orphan command evidence. Broken command rows reject as COMMAND_ROW_INVALID. Error reasonCode is propagated through a fixed allowlist only; no HTML or credentials are logged. Parsed rows now expose structural commandType and use data-icon-hint (with existing data-title fallback).

The real-row fixture preserves the supplied tr verbatim in a table wrapper. Browser tests check canonical ID 1787006936, attack type, destination 200 / 507|495, origin 1561 / 509|493, player 6562420 / cristofeer, distance 2.8, arrival 01:58:28:638, N/A tower, hint and label; additionally unrelated/single-page navigation versus genuine pagination, login, game error, partial and unrecognized documents. Reconciliation results include count, newCount and knownCount (initial baseline entries count as known).

For production: preserve storage, install the new local main userscript, reload, and inspect FAILURE_LIMIT. If the previous three parser errors left that guard set, save the enabled monitor configuration once using the existing manual recovery path; do not delete dedupe state. Wait for a successful RECONCILE_RESULT, then send exactly one NEW attack after this baseline. Expect NEW_INCOMING and one DISCORD_SENT; repeated packets/F5 must not create another message. If parsing fails, collect RECONCILE_FAILED.reasonCode without copying the full HTML or any credential.

Real-row patch validation: 288/288 Node tests passed (`local-test/incoming-parser-real-node.txt`); 49/50 browser pages passed, only the previously reproduced Scheduler failure remains. Parser: 41 assertions passed. Syntax and git diff checks passed. Build `local-b4a4257ed1c6e97d`. No commit, push, publication or production actions.
