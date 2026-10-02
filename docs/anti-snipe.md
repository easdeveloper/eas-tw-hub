# Anti-Snipe V1

Anti-Snipe is an `anti_snipe` mode of ArrivalPlanner. It reuses the existing
source cache, sequential map-info search, composition calculation,
ScheduledMissionExecution, ArrivalExecution and precise scheduler.

On `screen=info_village`, own attacks in `#commands_outgoings` receive one
ANTI-SNIPE action instead of SNIP. Incoming commands retain their SNIP action.
The reference reader requires consistent numeric quickedit, marker and details
link IDs, and every command marker must authoritatively say `attack`.
The BR143 details link's `type=other` does not override the own-table context.
The click rereads both the reference row and the viewed village target.

Arrival text preserves milliseconds. The default offset is +200 ms and remains
editable. The next readable chronological own attack supplies an informational
interval/warning; it neither adjusts the offset nor blocks preparation.
`snob.webp` supplies the informational noble indicator, not eligibility.

Only axe/light compositions with at least one positive count can be created.
All three mission type fields are attack. Persisted troop snapshots and type
fields are checked again through the existing preparation, authorization and
final confirmation/read-back gates. Known zero-valued unit placeholders added
by the scheduler's normalization are permitted; positive prohibited units and
unknown keys are rejected. No new submission or timing path is introduced.

Opening/searching never authorizes a submission. Existing outgoing baseline,
read-back, attempt locks, confirmation validation, reconciliation and uncertain
no-resend behavior remain required.

## Regression coverage

`tests/fixtures/arrival-anti-snipe.html` reproduces the BR143 own table with
arrivals .467/.604/.704/.804, duplicate attack markers, `type=other`, noble icon,
nested milliseconds and countdowns. It includes support/return/unknown rows and
an incoming SNIP row.

`tests/arrival-anti-snipe.test.html` covers mounting, fresh clicks, exact timing,
warnings, editable offsets, search/UI troop filtering, compositions, persisted
snapshot/type rejection, native confirmation validation and baseline/no-resend
gates. Existing Arrival navigation/reconciliation and scheduler suites exercise
the shared execution pipeline.

## BR143 manual validation

1. Install the generated LOCAL validation userscript and reload info_village.
2. Check one ANTI-SNIPE per own attack; incoming attacks still have SNIP.
3. Open a reference with explicit milliseconds. Verify command ID, target,
   noble indicator, +200 ms calculation and next-attack interval/warning.
4. Edit the offset; confirm it is retained. Search sources and verify only
   axe/light inputs appear. Opening/searching must not create a mission.
5. Explicitly schedule one small axe/light attack with sufficient lead time.
   Verify preparation, persisted baseline, confirmation and a single final
   submission, followed by reconciliation against the new outgoing ID.
6. Confirm reload does not resend a submitted/uncertain attempt. Do not manually
   retry an uncertain command until its real game outcome has been checked.

Real-game timing and reconciliation validation remain pending. No live attack
is sent by the automated tests.
