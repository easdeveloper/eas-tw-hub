# Weekly maintenance audit - 2026-10-01

Checkpoint: `80b6c38` (`main`, matching local `origin/main`). Initial working tree clean. No network fetch was required to establish this local reference comparison.

## Baseline

- Node: 290/291 passed. Existing Discord test expects LF in userscript metadata; checkout has CRLF. Evidence: `local-test/maintenance-baseline-node.txt`.
- Browser: 56/57 pages passed. Existing `scheduled-mission-process2.test.html` failure. Minting pages use descriptive titles; all three result elements passed. Evidence: `local-test/maintenance-baseline-browser.json`.
- All 89 tracked JS/CJS files passed `node --check`; `git diff --check` clean.
- `local-test/` is ignored and has no tracked files; generated artifacts remain untracked/ignored.

## Classification before editing

| Class | Finding | Decision/evidence |
|---|---|---|
| SAFE | `modules/fakes.js`: private `renderAnalysis` closure and its exclusive `getVillageStatus`/`createAnalysisContext` helpers | No call, callback registration, export, assignment or string evaluation exposes the renderer. Only its declaration names it. Both helpers are referenced solely inside this unreachable body. Current UI calls `renderMultiVillageAnalysis`; all public module exports remain. Remove the closed unreachable subtree, not executor code. |
| SAFE | `modules/fakes.js`: local `applies` | Read-only unused expression; no caller consumes it. Remove declaration only. |
| SAFE | `modules/market-smart-offers.js`: `considerActive` | `option()` only constructs detached label/input/text nodes, registers no listener and attaches nothing. Result never read/appended. Persisted configuration comes from the live `calculationBase` select. Remove this unused construction; retain storage key/config behavior. |
| REVIEW | Private `isConfirmationScreen`, `recalculatePending`, `isMissionExecutionTime` | Apparently unreachable helpers in safety-sensitive executors. Left unchanged to keep cleanup away from reconciliation and timing. |
| REVIEW | `massSnipe.js` unused `laterDatePattern` | Legacy date parsing evaluates external language patterns. Not removed: removing evaluation could alter error behavior; script remains supported. |
| REVIEW | Repeated loader/bootstrap diagnostics | Intentionally available before dependencies and in distinct userscript/page realms. Do not centralize/remove. |
| REVIEW | Public globals and dynamic EAS registrations | Not dead code merely because static callers are scarce. All preserved. |
| REVIEW | Legacy storage and migration branches | Cross-navigation/persisted state may predate this checkpoint. No evidence authorizes removal. |
| REVIEW | Broad modal-removal observers in Mass Snipe/precise Snipe/Minting | Runtime owns cleanup; they observe external close/removal. Narrowing without validating all removal paths can change lifecycle. Left unchanged. |
| REVIEW | Local-only image tracer, verbose Market/attack diagnostics | Diagnostics remain externally callable and covered by investigations/tests; no proof they are disposable. No logs removed. |
| DO NOT TOUCH | Authorization, attempts, snapshots, reconciliation, precise timing, dedupe/no-resend | No production service or core file changed. |

## Audit coverage and equivalence decisions

Repository-wide structural scans cover every tracked production JS file, test/fixture paths, documentation, CSS and the build script. Targeted manual review followed suspicious local declarations, active UI callbacks, public registration boundaries, observer ownership and storage contracts. This is not a claim of exhaustive runtime reachability or leak proof.

- URL, ID and coordinate readers intentionally differ by ownership, route, normalization and fail-closed requirements. No shared helper introduced.
- Core general storage fallback differs from executor read-back/attempt storage; no consolidation or migration removal.
- Local dates, server-wall time and monotonic precise clocks are distinct contracts; no timing/date helpers consolidated.
- Fake outgoing parsing remains the shared inventory source used by Arrival. Canonical return exclusion and unknown-marker rejection unchanged.
- Runtime owns timers/observers/listeners; incoming socket cleanup removes only owned callbacks. Broad waits have bounded deadlines or execution-specific teardown. No polling, observer scope or lifecycle changed.
- No formatter, public rename, compatibility deletion, storage reset, diagnostic removal, network action or live game execution.
- Byte-preserving edits retain existing line endings outside removed spans. Smart Offers replacement retains its original physical line ending.
- Optimization is limited to avoiding unused function allocations and three detached checkbox nodes on panel open; no measured latency/FPS/network claim.

## Public registration inventory

Assignment surfaces below are locators, not a dead-code list. Object-literal APIs, aliases, computed registrations and entry points remain public and unchanged. Methods on these services are preserved; no static reference count is used to delete a public method.

| Source | EAS assignment surfaces | Lifecycle/storage indicators (static occurrences) |
|---|---|---|
| `core/eas.js` | Entry point / indirect registration | observer: 0, timers: 0, storage: 0 |
| `core/floating-panel.js` | `EAS.UI.FloatingPanel` | observer: 0, timers: 0, storage: 0 |
| `core/floating-position.js` | `EAS.UI.FloatingPosition` | observer: 0, timers: 0, storage: 0 |
| `core/game-data.js` | `EAS.Data`, `EAS.State`, `EAS.State.snapshot` | observer: 0, timers: 0, storage: 2 |
| `core/groups.js` | `EAS.Groups`, `EAS.Groups.buildOverviewUrl`, `EAS.Groups.contains`, `EAS.Groups.ensureFresh`, `EAS.Groups.ensureMembership`, `EAS.Groups.get`, `EAS.Groups.getAll`, `EAS.Groups.getById`, `EAS.Groups.getGroupsForVillage`, `EAS.Groups.getMetadata`, `EAS.Groups.getVillageIds`, `EAS.Groups.invalidate`, `EAS.Groups.parseGroups`, `EAS.Groups.parseVillageIds`, `EAS.Groups.refresh` | observer: 0, timers: 0, storage: 0 |
| `core/image-trace.js` | Entry point / indirect registration | observer: 2, timers: 0, storage: 2 |
| `core/loader-diagnostics.js` | Entry point / indirect registration | observer: 0, timers: 0, storage: 0 |
| `core/logger.js` | `EAS.Logger` | observer: 0, timers: 1, storage: 5 |
| `core/observability.js` | `EAS.Log`, `EAS.Usage` | observer: 0, timers: 0, storage: 0 |
| `core/rate-limit.js` | Entry point / indirect registration | observer: 2, timers: 0, storage: 5 |
| `core/runtime.js` | `EAS.Runtime`, `EAS.Runtime.create`, `EAS.Runtime.dispose`, `EAS.Runtime.get`, `EAS.Window`, `EAS.Window.closeAuxiliary`, `EAS.Window.openAuxiliary`, `EAS.Window.returnToMain` | observer: 0, timers: 4, storage: 0 |
| `core/storage.js` | `EAS.Storage`, `EAS.Storage.get`, `EAS.Storage.remove`, `EAS.Storage.set` | observer: 0, timers: 0, storage: 3 |
| `core/troops.js` | `EAS.Troops`, `EAS.Troops._lastUnitColumnDetails`, `EAS.Troops.buildOverviewUrl`, `EAS.Troops.detectRowType`, `EAS.Troops.detectUnitColumns`, `EAS.Troops.detectUnitOrder`, `EAS.Troops.ensureLoaded`, `EAS.Troops.findHomeRow`, `EAS.Troops.getAll`, `EAS.Troops.getSourceInfo`, `EAS.Troops.getVillageTroops`, `EAS.Troops.hasUnit`, `EAS.Troops.hasVillageData`, `EAS.Troops.parseVillageBlock`, `EAS.Troops.refresh` | observer: 0, timers: 0, storage: 0 |
| `core/ui.js` | `EAS.UI.closeWindow`, `EAS.UI.createButton`, `EAS.UI.createField`, `EAS.UI.createInput`, `EAS.UI.createTable`, `EAS.UI.createWindow`, `EAS.UI.getDashboardIndicator`, `EAS.UI.loadModule`, `EAS.UI.openDevelopmentPlaceholder`, `EAS.UI.openDiagnostic`, `EAS.UI.openMainWindow`, `EAS.UI.openModuleTest`, `EAS.UI.refreshDashboardIndicator`, `EAS.UI.renderHubDashboard`, `EAS.UI.showStatus`, `EAS.UI.toggle` | observer: 0, timers: 0, storage: 2 |
| `core/units.js` | `EAS.Units`, `EAS.Units.calculateCommandPopulation`, `EAS.Units.calculateTravelDuration`, `EAS.Units.getPopulation`, `EAS.Units.getSlowestUnit`, `EAS.Units.getTravelSpeed`, `EAS.Units.population`, `EAS.Units.travelSpeed` | observer: 0, timers: 0, storage: 0 |
| `core/utils.js` | `EAS.Utils`, `EAS.Utils.Perf`, `EAS.Utils.createServerDateTime`, `EAS.Utils.distance`, `EAS.Utils.escapeHtml`, `EAS.Utils.formatDateTime`, `EAS.Utils.formatDateTimeInTimeZone`, `EAS.Utils.formatDuration`, `EAS.Utils.formatNumber`, `EAS.Utils.isValidCoordinate`, `EAS.Utils.parseBrazilianDate`, `EAS.Utils.parseCoordinate`, `EAS.Utils.parseDateTimeInTimeZone`, `EAS.Utils.parseTime`, `EAS.Utils.serverTimeToJapan`, `EAS.Utils.uniqueBy`, `EAS.Utils.waitForElement` | observer: 1, timers: 1, storage: 1 |
| `core/villages.js` | `EAS.Villages`, `EAS.Villages.current`, `EAS.Villages.distanceTo`, `EAS.Villages.ensureFresh`, `EAS.Villages.filterOwned`, `EAS.Villages.findByCoordinate`, `EAS.Villages.findById`, `EAS.Villages.getAll`, `EAS.Villages.getByCoord`, `EAS.Villages.getById`, `EAS.Villages.getDiagnostic`, `EAS.Villages.getSourceInfo`, `EAS.Villages.getState`, `EAS.Villages.getVersion`, `EAS.Villages.invalidate`, `EAS.Villages.isOwned`, `EAS.Villages.list`, `EAS.Villages.refresh`, `EAS.Villages.withDistanceTo` | observer: 0, timers: 0, storage: 2 |
| `core/world-rules.js` | `EAS.CommandRules`, `EAS.WorldRules`, `EAS.WorldRules.clear`, `EAS.WorldRules.get`, `EAS.WorldRules.getWorld`, `EAS.WorldRules.setMinimumAttackPopulation` | observer: 2, timers: 1, storage: 2 |
| `core/world.js` | `EAS.World`, `EAS.World.getCurrentVillage`, `EAS.World.getGameData`, `EAS.World.getInfo`, `EAS.World.getPlayer`, `EAS.World.getScreen`, `EAS.World.getServerDateTime`, `EAS.World.getServerNowTimestamp`, `EAS.World.getSpeed`, `EAS.World.getUnitSpeed`, `EAS.World.getWorldName` | observer: 0, timers: 0, storage: 0 |
| `eas-discord-transport.user.js` | Entry point / indirect registration | observer: 0, timers: 0, storage: 0 |
| `eas-tw-loader.user.js` | Entry point / indirect registration | observer: 0, timers: 2, storage: 5 |
| `index.js` | Entry point / indirect registration | observer: 0, timers: 0, storage: 11 |
| `loader.js` | Entry point / indirect registration | observer: 0, timers: 4, storage: 2 |
| `massSnipe.js` | Entry point / indirect registration | observer: 0, timers: 3, storage: 33 |
| `modules/antisnipe.js` | Entry point / indirect registration | observer: 0, timers: 0, storage: 0 |
| `modules/attack.js` | `EAS.Modules`, `EAS.Modules.Attack`, `EAS.Modules.Attack.open` | observer: 0, timers: 0, storage: 2 |
| `modules/fakes.js` | `EAS.Modules`, `EAS.Modules.Fakes`, `EAS.Modules.Fakes.applyAntiSnipeLatencyCorrection`, `EAS.Modules.Fakes.buildAntiSnipeArrivalSchedule`, `EAS.Modules.Fakes.calculateFakeCapacity`, `EAS.Modules.Fakes.distributeAntiSnipeRoundRobin`, `EAS.Modules.Fakes.distributeTargets`, `EAS.Modules.Fakes.distributeTargetsRoundRobin`, `EAS.Modules.Fakes.extractCoordinates`, `EAS.Modules.Fakes.generateAntiSnipeOffsets`, `EAS.Modules.Fakes.open`, `EAS.Modules.Fakes.presets` | observer: 0, timers: 3, storage: 4 |
| `modules/incoming-monitor.js` | `EAS.Modules`, `EAS.Modules.IncomingMonitor` | observer: 0, timers: 0, storage: 0 |
| `modules/market-balance.js` | `EAS.Modules`, `EAS.Modules.MarketBalance` | observer: 0, timers: 0, storage: 2 |
| `modules/market-smart-offers.js` | `EAS.Modules`, `EAS.Modules.MarketSmartOffers` | observer: 0, timers: 0, storage: 2 |
| `modules/market-target-supply.js` | `EAS.Modules`, `EAS.Modules.MarketTargetSupply` | observer: 0, timers: 0, storage: 2 |
| `modules/mass-farm.js` | `EAS.Modules`, `EAS.Modules.MassFarm` | observer: 0, timers: 0, storage: 0 |
| `modules/mass-snipe.js` | `EAS.Modules`, `EAS.Modules.MassSnipe` | observer: 1, timers: 0, storage: 0 |
| `modules/minting.js` | `EAS.Modules`, `EAS.Modules.Minting` | observer: 1, timers: 0, storage: 0 |
| `modules/noble.js` | Entry point / indirect registration | observer: 0, timers: 0, storage: 0 |
| `modules/resources.js` | Entry point / indirect registration | observer: 0, timers: 0, storage: 0 |
| `modules/scheduled-missions.js` | `EAS.Modules`, `EAS.Modules.ScheduledMissions` | observer: 0, timers: 0, storage: 0 |
| `modules/support.js` | `EAS.Modules`, `EAS.Modules.Support`, `EAS.Modules.Support.open` | observer: 0, timers: 0, storage: 3 |
| `modules/troop-counter.js` | `EAS.Modules`, `EAS.Modules.TroopCounter` | observer: 0, timers: 1, storage: 0 |
| `services/arrival-execution.js` | `EAS.ArrivalExecution` | observer: 0, timers: 3, storage: 3 |
| `services/arrival-planner.js` | `EAS.ArrivalPlanner` | observer: 1, timers: 2, storage: 0 |
| `services/attack-preparation.js` | `EAS.AttackPreparation` | observer: 0, timers: 5, storage: 5 |
| `services/fakes-execution.js` | `EAS.FakesExecution`, `EAS.FakesExecution.automaticControl`, `EAS.FakesExecution.detectConfirmationCommandType`, `EAS.FakesExecution.detectMinimumPopulationError`, `EAS.FakesExecution.executionCounts`, `EAS.FakesExecution.findPlaceCommandButton`, `EAS.FakesExecution.initialize`, `EAS.FakesExecution.mountPanel`, `EAS.FakesExecution.openCurrentVillage`, `EAS.FakesExecution.parseMinimumPopulationError`, `EAS.FakesExecution.readContext`, `EAS.FakesExecution.readOutgoingCommands`, `EAS.FakesExecution.reconcileOutgoing`, `EAS.FakesExecution.resume`, `EAS.FakesExecution.resumeConfirmation`, `EAS.FakesExecution.snapshotSourceEvidence`, `EAS.FakesExecution.start` | observer: 1, timers: 4, storage: 10 |
| `services/farm-assistant-adapter.js` | `EAS.Adapters`, `EAS.Adapters.FarmAssistant` | observer: 0, timers: 0, storage: 0 |
| `services/game-adapters.js` | `EAS.Adapters`, `EAS.Adapters.MarketPage`, `EAS.Adapters.Overview`, `EAS.Adapters.RallyPoint`, `EAS.Selectors`, `EAS.Selectors.market`, `EAS.Selectors.overview`, `EAS.Selectors.place` | observer: 0, timers: 0, storage: 0 |
| `services/incoming-model.js` | `EAS.IncomingModel` | observer: 0, timers: 0, storage: 0 |
| `services/incoming-monitor.js` | `EAS.IncomingMonitor` | observer: 0, timers: 1, storage: 0 |
| `services/incoming-parser.js` | `EAS.IncomingParser` | observer: 0, timers: 0, storage: 0 |
| `services/incoming-socket.js` | `EAS.IncomingSocket` | observer: 0, timers: 1, storage: 0 |
| `services/incoming-store.js` | `EAS.IncomingStore` | observer: 0, timers: 0, storage: 5 |
| `services/incoming-transport.js` | `EAS.IncomingTransport` | observer: 0, timers: 2, storage: 0 |
| `services/market-balance-execution.js` | `EAS.MarketBalanceExecution` | observer: 0, timers: 6, storage: 7 |
| `services/market-engine.js` | `EAS.MarketEngine` | observer: 0, timers: 1, storage: 2 |
| `services/market-execution-ui.js` | `EAS.Market`, `EAS.Market.ExecutionPanel`, `EAS.Market.returnToMain` | observer: 0, timers: 0, storage: 0 |
| `services/market-offers-batch.js` | `EAS.MarketOffersBatch` | observer: 2, timers: 3, storage: 0 |
| `services/market-offers-execution.js` | `EAS.MarketOffersExecution`, `EAS.MarketOffersExecution.initialize`, `EAS.MarketOffersExecution.start` | observer: 2, timers: 8, storage: 24 |
| `services/market-target-execution.js` | `EAS.MarketTargetExecution` | observer: 0, timers: 6, storage: 7 |
| `services/mass-farm-execution.js` | `EAS.MassFarmExecution` | observer: 2, timers: 2, storage: 0 |
| `services/mass-snipe-execution.js` | `EAS.Adapters.MassSnipe`, `EAS.MassSnipeExecution`, `EAS.Selectors.massSnipe` | observer: 0, timers: 1, storage: 0 |
| `services/mass-snipe-precise.js` | `EAS.Adapters.MassSnipePrecise`, `EAS.MassSnipePrecise`, `EAS.Selectors.massSnipePrecise` | observer: 1, timers: 2, storage: 0 |
| `services/minting-adapter.js` | `EAS.Adapters`, `EAS.Adapters.Minting`, `EAS.Selectors`, `EAS.Selectors.Minting` | observer: 0, timers: 1, storage: 0 |
| `services/minting.js` | `EAS.Minting` | observer: 0, timers: 0, storage: 0 |
| `services/mission-scheduler.js` | `EAS.MissionScheduler` | observer: 0, timers: 1, storage: 4 |
| `services/place.js` | `EAS.Place`, `EAS.Place.buildPlaceUrl`, `EAS.Place.clearTemporaryTarget`, `EAS.Place.ensureCommandTarget`, `EAS.Place.fillCommandTarget`, `EAS.Place.fillTarget`, `EAS.Place.fillTargetFromUrl`, `EAS.Place.getCommandForm`, `EAS.Place.openAndFillTarget`, `EAS.Place.openVillagePlace`, `EAS.Place.readCommandTarget`, `EAS.Place.readTargetReadiness`, `EAS.Place.waitAndFillTarget`, `EAS.Place.waitForTargetInput` | observer: 1, timers: 3, storage: 11 |
| `services/public-map.js` | `EAS.PublicMap`, `EAS.PublicMap.findPlayerVillages`, `EAS.PublicMap.getVillages` | observer: 0, timers: 0, storage: 0 |
| `services/scheduled-mission-execution.js` | `EAS.ScheduledMissionExecution` | observer: 0, timers: 7, storage: 3 |
| `services/support-execution.js` | `EAS.SupportExecution`, `EAS.SupportExecution.initialize`, `EAS.SupportExecution.mount`, `EAS.SupportExecution.read`, `EAS.SupportExecution.start` | observer: 1, timers: 2, storage: 3 |

Additional globals reviewed: `EASLocalBuild`, loader singleton/trace helpers, `EASDebug`, `EASFakeDebug`, `EASFakeBootstrapDebug`, `EASImageTraceDebug`, `EASDiscordBridge`, runtime-resume helpers. These are developer/userscript integration surfaces and were retained.

## Remaining inspected tree

### scripts (1 tracked files)

`scripts/build-local-userscript.py`

### css (1 tracked files)

`css/eas.css`

### tests (110 tracked files)

`tests/anti-snipe.test.html`, `tests/arrival-global-snip.test.html`, `tests/arrival-navigation.test.html`, `tests/arrival-page-mount.test.html`, `tests/arrival-planner.test.cjs`, `tests/arrival-planner.test.html`, `tests/arrival-reconciliation.test.cjs`, `tests/arrival-reconciliation.test.html`, `tests/attack-preparation.test.html`, `tests/attack-small-outgoing.test.html`, `tests/command-rules.test.html`, `tests/core-foundation.test.html`, `tests/dashboard.test.html`, `tests/data-lazy-bootstrap.test.cjs`, `tests/fake-bootstrap-debug.test.cjs`, `tests/fakes-auto-execution.test.cjs`, `tests/fakes-execution.test.cjs`, `tests/farm-spy-return-outgoing.test.html`, `tests/fixtures/arrival-global-incomings.html`, `tests/fixtures/incoming-br143-complete-shell.html`, `tests/fixtures/incoming-br143-real.html`, `tests/fixtures/incoming-br143-sorting.html`, `tests/fixtures/incoming-empty.html`, `tests/fixtures/incoming-overview.html`, `tests/fixtures/loader/arrival-info-page.html`, `tests/fixtures/loader/arrival-page.html`, `tests/fixtures/loader/causal-idle-page.html`, `tests/fixtures/loader/idle-local-page.html`, `tests/fixtures/loader/market-recovery-page.html`, `tests/fixtures/loader/market-stop-page.html`, `tests/fixtures/loader/native-telemetry-excerpt.js`, `tests/fixtures/market-own-offer-native-icons.html`, `tests/fixtures/market-own-offer-row.html`, `tests/fixtures/minting/academy-form.html`, `tests/fixtures/minting/academy-no-form.html`, `tests/fixtures/minting/academy-world143.html`, `tests/fixtures/minting/auto-off.html`, `tests/fixtures/minting/auto-on.html`, `tests/fixtures/minting/confirmation-one.html`, `tests/fixtures/minting/login.html`, `tests/fixtures/minting/unexpected.html`, `tests/fixtures/place/attack-small-rows.html`, `tests/fixtures/place/farm-spy-return.html`, `tests/fixtures/place/mixed-return-farm.html`, `tests/fixtures/place/normal-return.html`, `tests/fixtures/place/outgoing-command-row.html`, `tests/fixtures/place/ready-empty-outgoing.html`, `tests/fixtures/place/target-resolved.html`, `tests/fixtures/place/target-unresolved.html`, `tests/fixtures/place/watchtower-command-row.html`, `tests/floating-panel.test.html`, `tests/floating-position.test.cjs`, `tests/groups-data.test.html`, `tests/image-trace.test.cjs`, `tests/incoming-monitor.test.cjs`, `tests/incoming-pagination.test.html`, `tests/incoming-panel.test.html`, `tests/incoming-parser.test.html`, `tests/incoming-socket.test.cjs`, `tests/incoming-socket.test.html`, `tests/incoming-transport.test.cjs`, `tests/index-silent-bootstrap.test.html`, `tests/loader-telemetry-causality.test.cjs`, `tests/loader-telemetry-causality.test.html`, `tests/loader.test.html`, `tests/local-idle-bootstrap.test.html`, `tests/logger.test.cjs`, `tests/market-balance-stability.test.html`, `tests/market-engine.test.html`, `tests/market-execution-ui.test.html`, `tests/market-offer-id-reconciliation.test.html`, `tests/market-offers-batch.test.cjs`, `tests/market-offers-batch.test.html`, `tests/market-offers-cancel-waits.test.html`, `tests/market-offers-execution.test.html`, `tests/market-offers-manual-recovery.test.html`, `tests/market-offers-preparation-panel.test.html`, `tests/market-offers-recovery.test.html`, `tests/market-offers-stop-navigation.test.html`, `tests/market-smart-offers-panel.test.html`, `tests/market-smart-offers-refresh.test.html`, `tests/market-target-execution-stability.test.html`, `tests/mass-farm-ui.test.html`, `tests/mass-farm.test.html`, `tests/mass-snipe-precise.test.cjs`, `tests/mass-snipe-precise.test.html`, `tests/mass-snipe-timezone.test.cjs`, `tests/mass-snipe.test.html`, `tests/minting-adapter.test.html`, `tests/minting-live-diagnostics.test.html`, `tests/minting.test.cjs`, `tests/minting.test.html`, `tests/mission-scheduler.test.html`, `tests/normal-return-outgoing.test.html`, `tests/outgoing-dom.cjs`, `tests/place-outgoing-rows.test.html`, `tests/place-resolved-target.test.html`, `tests/place-target.test.cjs`, `tests/rate-limit.test.cjs`, `tests/return-farm-outgoing.test.html`, `tests/runtime-performance.test.html`, `tests/scheduled-mission-execution.test.html`, `tests/scheduled-mission-process2.test.html`, `tests/support-planner.test.html`, `tests/troop-counter.test.html`, `tests/troops-dimensions.test.html`, `tests/userscript-loader.test.html`, `tests/villages-state.test.html`, `tests/watchtower-outgoing.test.html`, `tests/weekly-maintenance.test.cjs`

### docs (22 tracked files)

`docs/arrival-planner.md`, `docs/attack-small-command-parser.md`, `docs/engineering-stabilization.md`, `docs/fake-command-identity-audit.md`, `docs/fake-empty-outgoing-evidence.md`, `docs/fake-local-validation.md`, `docs/fake-place-command-rows.md`, `docs/fake-snapshot-readiness.md`, `docs/fake-target-readiness.md`, `docs/http-429-investigation.md`, `docs/image-trace-investigation.md`, `docs/incoming-monitor.md`, `docs/incoming-recovery.md`, `docs/lazy-background-scans.md`, `docs/loader-lifecycle-audit.md`, `docs/loader-telemetry-causality.md`, `docs/local-static-loader.md`, `docs/market-offers-batch.md`, `docs/minting-v1.md`, `docs/return-farm-command-parser.md`, `docs/watchtower-command-parser.md`, `docs/weekly-maintenance-2026-09-11.md`

Root documentation/loader entry points: `README.md`, `ARCHITECTURE.md`, `bookmarklet.txt`, `loader.js`, `eas-tw-loader.user.js`, `eas-discord-transport.user.js`, `index.js`, standalone `massSnipe.js`. CSS selectors were retained: dynamic renderers/public markup can use them; no selector was deleted on reference counts alone.

## Final validation

- Node: **290/291 passed**, same Discord LF/CRLF assertion as baseline. `local-test/maintenance-final-node.txt`.
- Browser: **56/57 passed**, exactly the same 57-page result list as baseline. `local-test/maintenance-final-browser.json`. Existing Scheduler failure retained; all three minting result elements PASS.
- Incoming, Fake/outgoing (including both normal return variants, unknown rejection and duplicate conflicts), Arrival/SNIP, Market and applicable Scheduler regressions passed except the recorded preexisting Scheduler case.
- All 89 tracked JS/CJS files passed syntax checks again. Build Python source parses successfully. `git diff --check` passed. Public EAS assignment surfaces in both edited files compare equal to HEAD.
- Generated local userscript syntax and post-build idle bootstrap passed.
- Build: `local-138d92f35ade52de`, 64 assets.
- SHA256: `e67d48f626638ae1c8bf8653f94749b91dda231c7bcd02d44dd3c288fcddc7b3`.
- Artifact: `local-test/eas-tw-local.user.js` (ignored, not staged).

## Files changed and diff

- `modules/fakes.js`: remove unused `applies`, unreachable `renderAnalysis`, and its exclusive helpers `getVillageStatus` / `createAnalysisContext`. Active multi-village renderer, exports, executor and storage remain unchanged.
- `modules/market-smart-offers.js`: remove unused detached `considerActive` checkbox construction. Keep `calculationBase` and saved configuration.
- `docs/weekly-maintenance-2026-10-01.md`: this audit/report and inventory.

Tracked source diff: **1 added / 234 removed lines** (net -233). The new report is untracked and therefore is not counted by plain `git diff --stat`.

```text
 modules/fakes.js               | 233 -----------------------------------------
 modules/market-smart-offers.js |   2 +-
 2 files changed, 1 insertion(+), 234 deletions(-)
```

Final `git status --short`:

```text
 M modules/fakes.js
 M modules/market-smart-offers.js
?? docs/weekly-maintenance-2026-10-01.md
```

No new test failures. No tracked generated assets, public API removal, execution-semantic changes, or changes to safety-critical services. Existing diagnostics and legacy support remain. Git may warn that a future checkout would convert the existing LF Fake module under `core.autocrlf`; this edit preserved the file's original LF and the Smart Offers file's CRLF.

## BR143 manual checks

Open Fake manager, analyze/distribute targets and confirm the current multi-village table/actions remain intact. Open Smart Offers, switch current/projected calculation base, save/reopen and verify active-offer behavior and duplicate controls. No live submission is required merely to inspect this cleanup. For release confidence, retain the usual small Fake/SNIP/Market validation: snapshots/returns, exact arrival milliseconds, uncertain no-resend and Incoming dedupe remain covered by unchanged regression tests.

No commit or push.
