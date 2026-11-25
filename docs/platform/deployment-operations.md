## November 25: daily medication source staged, application publication pending

Created only the derived warehouse view
`alamohealth.gold.v_tool_mar_daily_by_community_medication` from the reviewed
canonical notebook SELECT. Existing source records, views, manifest, nightly
notebook, application snapshot and source grants were unchanged. `CREATE VIEW`
was used deliberately, so a concurrent publisher could not be overwritten.

The published view has 13 columns and 391,581 distinct daily community/medication
groups covering 1,092,085 underlying administration records in January–November
2026. An independent query reconciles all 11 months to the existing monthly
medication view. Duplicate grains, missing dates, unknown PRN flags, scheduled
outcome partition mismatches and scheduled/PRN refusal partition mismatches are
all zero. Pending outcomes remain separate; medication identity includes the
source's medication name/strength rather than an invented drug grouping.

This is **not yet available through Ally's published catalog**. The tested
Platform source-reader candidate remains `936ab032`; its scoped data gate passes
12 commands in 151.7 seconds. Main-Chrome inspection cannot attach to the existing
Platform tab, so the live release check remains incomplete. Source publication
still needs the preserved owner notebook update, manifest entry, current grants
and snapshot binding, with conditional before/after receipts. Do not assume that
creating the SQL view enables the application.

Private SQL, source-definition hashes, statement receipts, reconciliation results
and the derived-view-only rollback are retained under
`/Users/eric/suite-deploy/.state/ally-system-repair-20261124/investigation-v14/medication-source/`.
The source's declared as-of date must be preserved during publication; staging
this view does not refresh the existing application snapshot.

# Deployment And Operations

## Ally History and incident recovery — November 23, deployed

Source `fbdc99b` is live in revision
`alamo-platform-prod-web--ally-history-incident-1123`, image
`pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:57489fee1b7c2c172a387fec1a4ef837e41b2eb533fbedaecc069d647ed8db17`.
Exact configuration, one healthy active revision with all traffic, health 200,
and anonymous source/API denial passed. The image changes 41 reviewed files;
19,939 other files, including Carelog, are preserved. Browser entry
`/assets/index-pPQvlJpG.js` has SHA-256
`6e6ea401ff0b326e881ab2fdb96cb531679fd6ac3e4fedbd0f2e9915811228da`.

History was positioned against its small trigger and clipped by the normal side
panel. Its anchor is now the header. The new regression fails on the old CSS and
passes with eight long titles, scroll/click access, Escape/focus, normal/expanded
panels, and 1440/390/320px layouts. Live desktop and phone containment, 18 saved
reports, and reopening the completed incident answer were verified in main Chrome.

The failed incident question had completed planning, then requested a partial
month from a monthly-only source. The daily `incident-summary` capability now
reuses the incident register's exact date/priority filters and returns aggregates
only. Monthly limitations return explicit unavailable evidence. Six existing
API/worker grants add this capability for the same three subjects, with unchanged
scope, expiry and `detail:false`. All three live source checks passed; an unlisted
subject was denied. No client/source records were modified.

Engine 0.18.14 separates source, model and validation failures and exposes active
planning without changing persisted states. API/worker deployment and exact
package verification passed, but the first live follow-up revealed that Azure's
activity process still held the disabled state after settings were enabled.
An explicit restart corrected it. A stale-run Durable probe then proved the
actual enabled branch with zero model calls or report mutations; configuration
inspection alone is not accepted as worker readiness.

The same real question resumed successfully: 18.569 seconds after Resume, two
model calls, 7.919 seconds total model latency, estimated $0.009012 model usage.
It uses `incident-summary` and retains the original failed version. It reports
zero available high-priority Santa Clarita records for November 22, with explicit
partial coverage. The canonical incident reader currently falls back to the
published snapshot, so this is **not a confirmed complete zero**. Restoring full
live incident-register coverage remains a source-owner follow-up; do not relabel
snapshot answers as complete. One recovered answer is not a latency guarantee.

The scoped predeployment gate passed 9/9 in 150.755 seconds, replacing the roughly
95-minute 28-stage sequence for this bounded scope. Postdeployment passed 2/2.
Main Chrome captured 15 routes and 12 interactions, 613 requests, one explicit
cancellation, and no HTTP or console errors. The native Linux Functions recovery
workflow `45286447112` passed on engine source `be269c2`. All 18 existing reports
and spending ledgers were unchanged before re-enabling execution; subsequent
changes are the authorized real follow-up and its two model reservations.

Evidence:
- `generated/ally-recovery-20261123/main-chrome/evidence.json`, `postdeploy.log`, and `live/` screenshots.
- `generated/platform-ready/2026-11-23-ally.json` and `2026-11-23-ally-live.json`.
- `/Users/eric/suite-deploy/.state/platform-history-incident-1123.verification.json`.
- `/Users/eric/suite-deploy/.state/incident-summary-live.json` and `incident-grants-apply.json`.
- `/Users/eric/suite-deploy/.state/ally-recovery-runtime.verified.json`, `ally-recovery-runtime.preservation.json`, and `worker-01814-adoption.verified.json`.
- `/Users/eric/suite-deploy/.state/ally-failure-1123.json` records the final real-answer metadata.

Rollback is conditional on unchanged candidate configuration. Restore source
grants **first** using `.state/run-incident-grants.py restore`, then
`.state/deploy-platform-history-incident-1123.mjs restore` in `suite-deploy`.
The retained Platform base is image `211d4343ca7da14f8c1004cd7b47a4e9b24e76492783c4157f247b47e9085502`.
Engine rollback uses `.state/ally-recovery-runtime.mjs restore` and its retained
0.18.13 API image/worker package. Neither procedure resets reports or spending.
Verify actual worker adoption after any settings restoration before accepting
new execution. Existing three-person membership and $199.09 prepaid allowance,
expiry and auto-reload settings remain unchanged.

## Ally readability and response latency — November 23

Platform source `bf2335e` is live in image
`pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:211d4343ca7da14f8c1004cd7b47a4e9b24e76492783c4157f247b47e9085502`,
revision `alamo-platform-prod-web--ally-readability-final-1123`. Exact
configuration, one healthy active revision with all traffic, health 200 and
anonymous source/API denial 401 passed at 22:44 UTC. The initial verification
observed the normal transition before the ready revision caught up; read-only
verification passed after cutover. The deployment was not applied twice.

The replacement changes 41 allowed files: browser assets and the existing bundled
source adapter's display labels. All 19,971 other image files, Carelog 0.1.27,
resource limits, source authority, three-account membership and credit settings
are preserved. Browser entry `/assets/index-D853tz6S.js` has SHA-256
`387e3c5e4c6cc07dfd5ceddd428c5244b90d83c9e320652e3bf6db3f24157bb0`.

Database-style field names become readable labels in both new and saved reports.
Numbers and dates use product formatting; narrow tables become labeled records,
and chart axes stay readable without shrinking SVG text. Answers support
paragraphs, lists and selective emphasis. One collapsed Sources disclosure uses
readable links to the exact saved report section; raw JSON, repeated citations
and technical metadata no longer interrupt the answer. Stored evidence and
current/historical authorization remain intact. PDF retains the complete table.

The full predeployment gate passed **28/28** at 22:40 UTC. The final gate passed
**4/4** at 22:52 UTC. The current-build main-Chrome audit passed all 15 routes
and 12 interactions across 619 captured requests, with one explicit cancellation
and no console or HTTP failures. Eric's actual saved census/capacity answer passed
source-link keyboard activation and focus return, readable labels and dates,
collapsed sources, and zero horizontal overflow at desktop and 390/320px. The
composer stays inside the compact phone viewport. The 1470 × 636 viewport was
restored. Real-data screenshots, the build-bound network evidence and gate
receipts are under `generated/ally-readability-20261123/`. Synthetic browser/PDF
fixtures additionally cover long names, negative values, null gaps and literal
model HTML; they do not stand in for the actual saved-answer check.

Ally API/worker **0.18.13**, source `3e459f1`, is live at
`alamoallywqqka6kfae5ma.azurecr.io/ally@sha256:68ec41bb9527e689dd17b6e5a2f3826b7e31bd9d4602d9c69b0e08712146078a`,
revision `alamo-ally-prod-api--speed-01813-1123`. Native Linux Functions CI
45265914787 passed. All 134 worker files and ten Functions match the verified
package. Read-only discovery uses three concurrent reads; the latest version
avoids duplicate authorization while every request still checks current grants.
Idle Durable queue polling is capped at two seconds. Models, model concurrency,
source grants, the three participants and the cumulative prepaid allowance are
unchanged. All 15 pre-change reports and historical ledgers retain their hashes.

For the same 15 reports, list reads measured 1,861 ms before and 1,422 ms after.
A fresh one-source answer completed on its first attempt in 14.309 seconds,
including 6.705 seconds in model phases. This does not establish a consistent
full-answer speedup. A request interrupted during the worker restart completed
through Resume; its paused elapsed time is excluded. No active run or model lease
remained at the final engine verification.

Private Suite receipts: `.state/platform-readability-final-1123.*.json`,
`.state/ally-speed-runtime.*.json`, `.state/native-owner-speed-*.readiness.json`
and `.state/ally-latency-*.json`. Platform rollback restores image `6b5540b8`
from the exact saved plan. Engine rollback pauses dispatch and restores the
saved 0.18.12 worker/API/configuration. Neither rollback resets reports or ledgers.
Older dated entries below describe earlier releases.

## Executive Ally conversations — November 23

Eric authorized deployment for Eric Wilson, Andrew Dominici and Betty Dominici,
using the existing shared prepaid OpenAI balance. Entra identity, principal-only
consent and role assignments were verified for exactly those three accounts.
The API membership and six source grants independently enforce that scope.
Each person passed eight real source reads; unknown users, Sandeep, private
resident slices and direct storage access are denied. This is service/directory
verification for Andrew and Betty, not an interactive sign-in as either person.
No email, clinical write, credit purchase or automatic top-up was performed.

Ally API/worker **0.18.12** is live. The API image is
`alamoallywqqka6kfae5ma.azurecr.io/ally@sha256:a12ff7f7f1ee06945b3f0827b02b667a2020bc5096536a044136e866a1e1cc2b`,
revision `alamo-ally-prod-api--executives-01812-1123`. The keyless API, exact
configuration, healthy revision and access boundaries pass. Worker package
SHA-256 `d13e3dd5715a44fcc01c75100d1f8728a42a46ec7ad4102cb388989e076a8ece`
matches all 134 runtime files and ten Functions. Native Linux Functions CI
`45238412700` passed on verification commit `5052ee2`; runtime bytes match source
`1077069`. Only the report scheduler is enabled. Unrelated monitors remain off.

The cumulative `credits-20261123` allowance is **$199.09**, expiring December 17,
2026, matching the verified provider balance with auto-reload off. It does not
reset daily. Other applications share the provider balance and may exhaust it
sooner. Reservations, uncertain outcomes and final token settlements retain their
existing atomic behavior. The concurrency guard, 100 daily investigations per
person, 100 saved reports and 12 versions per conversation remain. Twelve prior
reports and both historical spending ledgers match their predeployment hashes.

The continuous conversation UI keeps questions and answers together, with
searchable History, one composer, Stop, native report reading and authorized PDF
export. Validated answers appear together rather than streaming tokens.
The initial Platform source `96790c3` was deployed in image
`pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:eb855b5aa0699a3a5be30e7c3f57f5ca8867708517b50d0012062d5772cf972c`,
revision `alamo-platform-prod-web--ally-executives-1123-2`, superseded by the
verified correction below. Both preserve Carelog
0.1.27, Platform's 1 CPU / 2 GiB resources and existing source authorities.
The planned-admissions source uses the same current weekly schedule as Admissions.

Two actual questions returned 0 planned admissions for November 23–29, 11
accepted clients without dates, and Santa Clarita's 6 / 11 = 54.5% share. The chart
correctly selects Awaiting date. The first request required Resume during
cutover; the follow-up completed on its first attempt. Four completed model calls
settled at **$0.020320**, leaving $199.069680 of the application allowance at
19:28 UTC. Native Chrome exported the saved second version to a two-page A4 PDF;
both pages were rendered and inspected, with values, measure, source note and
observed timestamp intact. Chrome's default background-graphics-off omits colored
bars; all labels and the full table remain. Its headers/footers print about:blank.
A second two-page export with background graphics enabled and browser headers
disabled preserves the chart bars too. Both versions were inspected; the original
Chrome print settings were restored.

Live inspection caught absolutely positioned accessibility labels extending the
enclosing dialog at short desktop heights. Source `0d78346` adds the containing
block at the answer scroller; the regression fails before and passes after.
Desktop 1440, phone 390/320 and existing interaction checks pass. Its replacement
image `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:6b5540b8c474887f8416b2d334290a8271d0d3eddbc480b7d3e8a3add3bf2579`
changes only the 40 allowed browser files. Comparison against all 19,962 base
files verifies preservation outside that allowlist and exact image configuration.
The correction is live as `alamo-platform-prod-web--ally-executives-scroll-1123`,
with one healthy active revision receiving 100% of traffic. Its browser entry is
`/assets/index-2Mzc9e3x.js`, SHA-256
`d92827ea1ed8b99d38b9f1e73471025b9bccb7b9a7b6089c72e53d9ac5fb4c76`.
The fresh full predeployment gate passed **28/28**, and the final postdeployment
gate passed **4/4**. Main Chrome's source/build-bound audit passed all 15 routes
and 12 interactions: 635 requests, one explicit cancellation, no console or HTTP
errors. Earlier incomplete network captures remain as failed evidence. The
context stress check passed all 19 assertions; its test-owned orphan crash
reporters were stopped after browser exit, with forensic evidence retained in
`generated/ally-conversation-20261123/stress-cleanup-note.json`.

Actual production conversation/history checks pass at 1440px desktop and 390/320px
phone widths. The header and composer stay fixed, only the answers scroll, and
there is no horizontal or enclosing-dialog overflow. Keyboard focus is visible.
The default 1470 × 636 viewport was restored and also passes containment. Native
PDF, saved reopening and the two-answer follow-up are verified in Eric's signed-in
session. Andrew and Betty retain the service/directory verification described
above; no interactive session was impersonated.

Private Suite receipts: `.state/ally-executives-runtime.*.json`,
`.state/ally-executives-identity.*.json`, `.state/executive-grants-apply.json`,
`.state/native-owner-executives-source.source.json`,
`.state/executives-preservation.json`, `.state/executives-live/acceptance.json`,
`.state/platform-executives.*.json` and `.state/platform-executives-scroll.*.json`.
Platform gate logs are under `generated/ally-conversation-20261123/`.

Rollback is bounded by the saved exact before-state in each plan. The browser-only
correction restores the initial executive UI image `eb855b5a` without touching
Ally or source data. A full engine rollback pauses dispatch, restores worker
0.18.11 and API image `e85db393`, then restores the prior owner-only configuration.
Identity/source rollback removes only this release's new assignments and grants.
Reports and spending ledgers are never reset. Older records below are historical
and do not supersede this release's explicit membership or spending authorization.

## Platform runtime recovery — November 23

At 07:09–07:20 UTC, production logged five JavaScript heap exhaustion crashes
at roughly 512 MB. Public requests timed out while the container restarted.
The resource-only recovery retains image `22682554`, all environment values,
identity, source grants, scaling rules and application files. It changes the
container from 0.5 CPU / 1 GiB to 1 CPU / 2 GiB, using revision
`alamo-platform-prod-web--ally-platform-1123-memory`. Exact configuration and
public health/root/anonymous-denial checks pass. This is a runtime headroom fix;
sustained load verification remains in progress. The immutable prior resource
configuration and verification are in Suite
`.state/platform-production-ally-platform-1123-memory.{plan,deployment,verification}.json`.

<a id="platform-data-questions--november-23-local-candidate"></a>
## Platform data questions — November 23, owner pilot live

Ally now opens Platform's existing data-question/report surface by default, with
one composer at desktop and phone widths. General chat remains in New; an existing
chat can still keep its answer beside a report. Sending a chat immediately shows
the question and pending state, prevents overlapping automatic refresh reads,
and preserves explicit access rechecks and cancellation. Trusted transient source
failures offer reopening the saved chat rather than implying revoked access.

Browser checks pass for 320/390/1440px report creation, follow-up, saved reopening,
versioning, chart measures, PDF, cancellation, revoked access, full-screen transitions
and focus return. The held-model conversation check crosses the five-second poll
boundary and verifies no duplicate automatic read while a send is pending.
Screenshots and logs are in `generated/current-navigation-20261122/` and
`generated/platform-page-screenshots-2026-11-22/`.
Platform source `75aa993` is now live as
`alamo-platform-prod-web--ally-platform-1123-ui2`, image
`pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:b8e37dccd3fe0a12a904a5a0078f0c538e9c0790da37443e990b9c57d06b23dd`.
Its entry `/assets/index-BALokCJd.js` hashes to
`49da760b3748c3994f48811b70e41b2f9fd70333e7eaf2f4dc30764070a68f94`.
All 28 predeployment stages passed at 08:20 UTC. The tested 826 source hashes
and 40 browser asset changes are unchanged. Carelog deployed 0.1.27 concurrently;
the first cutover correctly stopped on configuration drift. Rebuilding these same
browser bytes on Carelog's `dfc49a1a` image preserves its 0.1.27 assets and every
one of the 19,944 base files outside the 40-file allowlist. Inherited changes are
confined to Carelog/Fleet assets. Exact configuration, health 200, anonymous 401,
and one healthy active revision with 100% traffic passed at 08:29 UTC.

Ally API/worker 0.18.11, source `73438b8`, are deployed. API image:
`alamoallywqqka6kfae5ma.azurecr.io/ally@sha256:e85db3937047d0327f722970c98feedf5747c56bafaec6ddfe2d3ea008ea6f9c`,
revision `alamo-ally-prod-api--platform-01811-1123`. Health 200, anonymous 401,
untrusted origin 403, keyless API and owner-only scope pass. All 134 worker files
match package SHA-256 `590dd6c3e0895eee8807b01608e2cb77eb13cc6e1499c86c1497b44ffb3e64a6`.
The real local Functions/Azurite host passed eight lifecycle checks, with fictional
records and canned responses; this does not prove cloud recovery latency.

The owner authorized 50¢ per UTC day for the report worker. Conditional storage
reserves a conservative maximum before each model call and settles verified
completed-response token usage. Unknown outcomes retain their full reservation.
The 100-investigations/day abuse ceiling and 100 saved-report limit remain.
The original $11 evaluation campaign is closed with all 239 reservations retained.
No ledger or request history was reset. A deliberately stale run probe of a paused
record returned `paused, claimed: false`; only the report timer is now enabled.
Unrelated monitors and broader executive access remain off. Connection verification
expires December 23, 2026. Two fresh real-data questions completed: San Pablo's 22 available beds and its
22/60 = 36.7% share. Both versions default to `availableBeds`; reload/reopen retains
the answer, version and measure. The authorized print view retains that measure.
Native Chrome saved the actual two-page A4 PDF at 15:58 UTC; both rendered pages
retain the answer, selected measure, values, source note and timestamp without
raw JSON or clipped text. Chrome's default background-graphics-off option omits
colored bars; their labels/values and complete table remain. Four model calls settled at $0.019668, leaving $0.480332; this is
token-rated model cost, excluding hosting. The 390×844 and 1440×900 live checks
have no horizontal overflow. Screenshot evidence is in
`generated/current-navigation-20261122/platform-daily-live/`. The partial-coverage
follow-up implies other communities might be omitted even though all five appear;
record that as an imprecise caveat, not a count error or missing-community finding.

Eight subsequent real-data questions pass their numeric, scope and evidence
checks: annual admissions/discharges/net growth; bed-days and daily census;
18 admission counties; Turlock-only scope; current Pipeline stage totals;
unsupported wait-time/causal claims; source freshness; and a fresh growth repeat.
The independent baseline matches 413 admissions, 287 discharges, +126 net,
162,346 occupied bed-days, and 41 current Pipeline workspaces (0/28/2/11).
These are implementation-authored development checks, not held-out tests or
human usefulness ratings. The complete ten answers cost an estimated $0.112816
across 20 settled model calls, leaving $0.387184 of the daily allowance.
The repeat was not cache-served: partial-coverage results remain uncached.
Fresh source authorization proofs pass all five capabilities and return 403 for
an unknown subject, a private resident dataset and direct grant-store access.
No source writes or new permissions were introduced. Evidence:
`platform-daily-live/broader-acceptance.json` within the folder above, and Suite
`native-owner-platform-daily.{ten-answer-cost,source}.json`.
Native date editing now passes: the Through-day stepper changed November 23 to
22 and updated the scope summary; restoring 23 restored the summary. Saved
version 2 remained unchanged, with no model call or report write. The earlier
DOM-fill attempt was an automation limitation, not a confirmed product defect.

Production worker recovery was checked with report dispatch paused and no active
runs or leases. `az functionapp restart` was acknowledged but did not replace the
observed host process. A controlled stop, at least 90 seconds after observing
`Stopped`, then start reached a replacement process. The host's reported start
time was 09:08:54 UTC, versus 08:58:41 before recovery, and its instance identity
changed. It was observed running after start; a newly submitted Durable stale-run
probe completed on the enabled branch with `paused, claimed: false`.
Report/index/model-state hashes, both spending ledgers and request history were
unchanged. No model calls or source writes were added. Exact app configuration
and all 134 worker file hashes were rechecked before restoring the report timer
with the same 50¢ cap; unrelated monitors remain disabled. This is a verified
recovery path, not a guaranteed stop interval or a claim that plain ARM restart
works. Receipts: `native-owner-platform-daily.recovery-*.json` and
`native-owner-platform-daily.resume-schedule-recovery-a.json` in Suite state.
The loaded host's own `/admin/functions` response at 09:13 UTC confirms the
report activity and timer enabled, the unrelated monitor timer disabled, and all
10 functions present.

Receipts are under `/Users/eric/suite-deploy/.state/`:
`platform-priority-ui2.{plan,verification,predeploy}.json`,
`platform-priority-ui2-verified.json`, `ally-01811.api-update.verification.json`,
`ally-01811.worker-update.verification.json`, `ally-01811.functions-proof.json`,
and `native-owner-platform-daily.*.json`.
The final signed-in check passed at 16:05 UTC on this exact live entry: 15 routes,
12 interactions, 664 requests, one explicit cancellation, no console/HTTP errors.
The canonical signed-in command accepted the source/build-bound receipt and all
18 assertion regression groups passed. Earlier incomplete captures are retained;
main Chrome was reconnected in the same signed-in browser, with no session export.
Evidence: `platform-daily-live/final-main-chrome-reconnected/evidence.json` and
`platform-daily-live/native-date-acceptance.json`. The actual PDF is Suite
`.state/Ally Platform available beds 2026-11-23.pdf`. At 16:04 UTC all 22 model
calls were settled at $0.120954; no active runs or model leases remained. A fresh
16:07 UTC source proof reads the November 23 publication and verifies all five
capabilities plus the existing three denial cases.

Rollback UI to Carelog's current base
`pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:dfc49a1a2bba53914b7af983b2f5fa629a09f48fe29f424b4b1240de50a5d57d`
using the prepared UI2 restore plan, retaining 1 CPU / 2 GiB and Carelog 0.1.27.
Stop the report schedule, verify drain, then disable worker execution before any
worker restore; never enable an older worker that lacks the daily cap. If a day
has over 20 investigations, retain the new API reader: 0.18.10 cannot parse that
larger request list. Source records, counting definitions and grants are unchanged.

## Planned-admission question — November 23, local candidate

The owner's saved “Admits planned this week” question correctly refused to infer
scheduled admissions from 11 accepted workspaces. The source now adds the
`pipeline-summary` view `planned-admissions`, reusing the canonical Admissions
weekly briefing rather than reconstructing dates from stage totals. It emits
community counts only, with the published Monday–Sunday Pacific period. Missing
schedule coverage fails closed; a prior-week publication is marked partial.
The prior default stages view, permissions and source records are unchanged.

Focused checks cover week boundaries, cancellations/denials, community scope,
covered zero versus unavailable data, unmapped destinations, stale weeks and
private-field removal. The pre-change test fails on the unsupported view; the
new source passes. This is an aggregate current-week schedule, not a historical
schedule archive or proof of admission. Revisit the bounded date selector only
when future/historical schedule questions require a producer contract for those
periods. Full release and live model acceptance are pending; no new deployment
is claimed by the source change.

<a id="combined-ally-and-proforma-release--november-23-preparing"></a>
## Combined Ally and ProForma release — November 23, owner pilot live

Current Platform source `8634641` is deployed as
`alamo-platform-prod-web--ally-native-1123-final`, image
`pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:22682554622ece5a5d28367a18de94cb6049becdfa430251c6e61e72eba1ac44`.
The complete 28-stage predeployment gate passed; cutover and exact runtime/file
preservation were verified at 05:29:56 UTC. The live entry is
`/assets/index-ezkWWaEF.js`. Suite receipts are
`/Users/eric/suite-deploy/.state/platform-production-ally-native-1123-final.{plan,deployment,verification}.json`.
Rollback remains the Carelog-preserving `76f01e1d` base described below.

The postdeployment full gate passed its first 19 stages, then failed the
resident-search turn in `check:thread-context-stress`: the test sampled the
independently loading roster after a fixed 350 ms delay. The failed receipt is
retained as `generated/current-navigation-20261122/combined-brand-postdeploy-failed.json`.
The test now waits for the existing result-count loading state to settle within
its unchanged 35-second timeout, before applying the unchanged content and
positive-count assertions. The focused rerun passes all 8 scenarios / 19 turns with no console or request
failures. Stages 21–28 also passed. Stage 29 stopped because the native
Network receipt is incomplete; prior passing stages are retained. This test-only
correction does not change the deployed application.

Main Chrome passed all 15 current/legacy routes and 12 navigation interactions
with no captured console errors. Evidence is in
`generated/current-navigation-20261122/combined-brand-live/navigation-only.json`.
The native Network capture was interrupted and includes unverified request
statuses; this is explicitly not a complete passing signed-in release receipt.
Saved-report reopening and source expansion were also checked without generation.

Ally API 0.18.10 is live on image `c1b30010`, revision
`alamo-ally-prod-api--proforma-01810-1123`. Independent checks at 07:00 UTC
confirmed exact runtime/report-authority preservation and all five delegated
source reads, with no model calls or source/report writes. The live model answer
completed and was saved at 07:01 UTC (three calls, 5,300 input / 585 output tokens).
Its subsequent UI reopen failed on repeated 12-second source-read timeouts;
this does not pass end-to-end acceptance. The owner has now prioritized Platform
reporting; ProForma acceptance is not a prerequisite for that work.

The owner explicitly approved an additional $1 in the coordinated ProForma chat.
The shared campaign retains its original pricing and every prior reservation,
with an append-only $10→$11 cap amendment. Total reservations are $10.381116;
$0.618884 remains. This is a reserved ceiling, not a billing total. The combined
Ally source passes the full engine suite, API/worker builds, installed-package
check and all 44 evaluation tests. No additional executive grants, report-worker
execution or schedules are enabled by these checks.

Preparation history follows; its pending statements describe earlier candidates.

Eric authorized coordination of the overlapping releases. ProForma source
`ddad581` is fast-forwarded into the native executive integration branch, including
`8562631` and the selected-measure PDF repair. The earlier `627dd9ce` image and
`ally-native-1123-read` plan are superseded before cutover. Their verifier passed
against the current Carelog base; their full gate was intentionally stopped for
this integration, with the interruption and partial results retained under
`generated/current-navigation-20261122/pre-proforma-read-candidate/`.

ProForma's owner has deployed Ally API 0.18.8, immutable image `6523a987`, while
preserving the report configuration. All 39 executive-report regressions pass
against that source. Suite's updated controller binds the next Platform plan
to the actual API state and refuses drift at cutover; its 21 tests pass. The live
report-configuration comparison also passes. Report-worker execution, report
campaign budget and executive membership remain unchanged by this integration.

One canonical preparer combines the native UI, report source endpoint,
bounded snapshot reader and four-file ProForma guidance extension. Its completed
cutover and remaining acceptance checks are recorded above. The source contract is described in
[ProForma guidance](#proforma-guidance-in-the-combined-ally-release).

## Azure read deadline — November 23, awaiting release

The full `native-pdf-predeploy` run stopped at stage 8 after its context process
stalled in an HTTP 200 Azure download: 20,693,845 bytes received of a declared
57,370,446, no active timer, and no CPU progress. The owned child was terminated;
the failed gate and read-only socket/sample evidence are retained under
`generated/current-navigation-20261122/`. This was not a passing release.

The local reader was older than production. It now starts from the exact live
reader (`e7f5b60`, SHA-256 `2b577edfd96749e6991a8fd7aab9ecff41bf0dfea557cce3673d4d020b33a447`),
preserving managed identity, compressed publications, ETag revalidation and data
validation. The production-relative change adds one 60-second abort deadline per
Azure read, spanning metadata and the response body. The credential factory uses
one shared client constructor, with all three existing authentication modes
covered by assertions. No source writes or counting rules change. A real-SDK local HTTP regression fails before the change and passes
after it: stalled headers/body, concurrent readers, retry after failure, compressed
and raw reads, missing/invalid/denied sources. Thirteen credential/revalidation cases,
client integration, server typecheck, focused lint, unused-code and API checks pass.
The candidate verifier now runs that transport check inside the built container.
The fixture advances its controlled deadline only after the intended request
exists; it passes natively and inside the container without relying on CPU speed.
The subsequent full gate stopped at duplicate detection; consolidating the
credential factory resolves that finding without changing its choices. Focused
transport, credential, duplication, type and lint checks pass. The full gate must
run again against the rebuilt candidate.

The live-data context rerun passed all 635 turns across 130 sessions. The
`0db1b47d` plan remains historical and must not be deployed. Rebuild and verify
the corrected candidate, then run the complete release gate.

Preparation correctly stopped when Carelog 0.1.26 advanced the production base
to `76f01e1d3bd3786d8e740a418b27f47ce5c63b12e8472b43a1c2440490fe6fc0`
(`recovery-1122-18c389b`). The complete file comparison found 153 changes, all
within `dist/poc/` or `dist/fleet/`; Platform's snapshot reader is unchanged.
The replacement must preserve all 19,783 current base files outside its explicit
overlay and use this newer image for rollback. The comparison is retained in
`carelog-base-reconciliation.json`; worker execution remains disabled.

## Ally PDF chart selection — November 23, awaiting release

Visual review found that selecting Discharges still exported an Admissions chart.
The focused browser regression reproduced the mismatch. The report workspace now
owns the selected measures for the open report version and passes them to the
reauthorized print renderer. Saved report/source data and access checks are
unchanged. The browser suite passes at 320/390/1440px, including the selected PDF
measure, isolation between versions, historical selection, revocation and saved
reopening. Typecheck and focused ESLint pass; the rendered PDF preserves the
selection, full source table and long labels without clipping.

The preceding full gate was deliberately stopped after 15 passing stages when
this mismatch was found. Its log and interruption receipt are retained as
`native-final-ui-predeploy-batches.log` and
`native-final-ui-predeploy-pdf-interrupted.json`. The `68437690` artifact lacks
this correction and must not be promoted. Rebuild and verify the candidate, then
complete its full release gate. Production remains `555272da`; model execution,
campaign budget and executive grants are unchanged. Regression logs use the
`pdf-measure-` prefix under `generated/current-navigation-20261122/`.

The replacement from `34f0df2` passed its container verifier at 00:38 UTC:
19,639 base files preserved outside 44 reviewed files, unchanged image
configuration, all 318 source hashes matched, and access/CSP/HTTP checks passed.
It is pushed as immutable image
`0db1b47d2669bba9d78ac71172ae68a6b32f71e7d87297c3b03caa0ec5445192`.
Suite's `ally-native-1123-pdf` plan pins that candidate and the unchanged
`555272da` rollback, with the same three source settings and owner-only display.
The complete predeployment run is in progress in `native-pdf-predeploy.log`;
`native-pdf-prepare.log`, `native-pdf-image.log`, `native-pdf-verification.log`
and `native-pdf-push.log` retain the preparation evidence. This is not a cutover
or a fresh live-model/signed-in acceptance pass.

## Native Ally on the live design — November 22, prepared only

The design chat's 28-command predeployment gate passed and its UI is live on
`555272da288d0e69acb6c52d8dd39b986d36c0cf04982837e0eb254fcfac2c34`, revision
`alamo-platform-prod-web--ui-1122-d10bddc-r2`. That image preserves the intervening
Carelog/fleet update. The native owner-only Ally candidate was rebuilt on this
exact base. At 21:06 UTC its verifier passed against 19,639 base files, with 44
reviewed files, unchanged image configuration, scoped display/authentication,
compressed assets, HTTP routes and anonymous/source-disabled denial checks.
Receipts and logs are under `generated/current-navigation-20261122/` with the
`native-pilot-ui-r2` prefix; preceding receipts are retained in `native-before-ui-r2`.

The subsequent Ally predeployment run was deliberately stopped after the design
owner began another control cleanup during live acceptance. This is an incomplete
gate, not a release pass. Final cleanup `d7a97a1` is now merged in `04f82fe`, and
the combined candidate was rebuilt against the unchanged `555272da` image.
At 21:46 UTC its exact-file, configuration, access and HTTP verifier passed. The
44-file native overlay is pushed as immutable image
`68437690ab2038b99d74a86c9aeb5e4b1c1873ae2ba4bb5466ea3156ec91bd11`.
Suite's `ally-native-1122-final` plan pins that candidate and `555272da` rollback;
the first complete run passed seven stages, then stopped on an Azure Identity
`network_error` obtaining the storage token in `check:thread-context-fuzz`.
The failed receipt is retained as `native-final-ui-predeploy-first-failure.json`;
the unchanged candidate's full retry stopped in the nested analyst fuzz check on
the same failure. Both receipts/logs are retained. A metadata-only transport trace
observed the first token return 200 and the later token request fail with `EPIPE`.
Direct fetch and Azure SDK credential checks pass, as does a five-minute idle
control. The harness now yields to Node's event loop between simulated turns,
allowing socket-close events and timers to run without changing its assertions.
Two focused runs passed all 635 turns across 130 sessions. The longer run crossed
the snapshot cache's five-minute expiry: both token requests returned 200 on new
sockets (338ms and 444ms), and its final receipt is dated 23:00:25 UTC. This supports
the event-loop starvation diagnosis; no production authentication code changed.
Its log and report are retained as `fuzz-yield-extended.log` and
`fuzz-yield-second-token-pass.json`. The next full run passed the corrected fuzz
stage but stalled in answer-cache generation: the process held an Azure socket,
with unchanged CPU time and byte counters for repeated observations over twenty
minutes. A separate instrumented generation completed all 200 entries with zero
errors. The stalled child was terminated; the full run failed at 23:36 UTC with
exit 143, retained in `native-final-ui-predeploy-cache-stall.json`. The cache
generator now also yields between cached tool calls. Its focused generation
passed all 200 entries; rail validation passed 150 prompts, 48 cache requests,
15 live turns and three parity checks across 44 families. Logs are
`cache-yield.log` and `cache-yield-rails.log`. Another complete gate is required.
The current full run has since passed both corrected batches, 635 context turns,
Ally report interactions and 68 mobile route/viewport checks plus safe-area
checks. It was subsequently stopped for the PDF correction above; these completed
stages are not a release pass.
The precise stalled request
was not captured; yielding prevents a tight microtask chain but does not add a
transport deadline or establish a general network-availability guarantee.

At 22:07 UTC the current live design passed 15 routes and 12 interactions in main
Chrome. Its settled native capture observed 600 requests with one explicit
navigation cancellation, no unknown statuses, no HTTP failures, and zero console
errors. The earlier interrupted capture is retained separately. This proves the
current design, not the pending native image. The explicit main-Chrome release
driver now rechecks source/build hashes, freshness, complete route/interaction
coverage, native request statuses and filter settings; 18 fault-injection tests
and focused ESLint pass. A normal `/api/platform/everyagent` background poll can
repopulate a just-cleared log, so the driver validates its initial statuses and
uses the observed count as a baseline. It never ignores a failed initial request.
Capture is split into begin, canonical routes, canonical interactions and finish
calls to stay within the browser tool's execution context. The first whole-run
attempt lost that context; later native-control interruptions are not passes.
The bounded attempt also reset the browser tool before saving its initial
observation. That tool failure is distinct from the passing saved design check.
A fresh driver run completed at 23:09:25 UTC: 15/15 routes, 12/12 interactions,
604 requests, two explicit navigation cancellations and zero console errors or
HTTP failures. The normal signed-in release command accepted that evidence and
all 18 assertion regression groups passed. The capture is bound to the currently
served `index-CzZG_tv8.js` asset, not the pending image, and is saved privately at
`main-chrome-driver-batched/evidence.json`; the verifier's log is
`main-chrome-driver-cli.log`. DevTools was closed after capture. The pending
image still requires its own fresh acceptance after cutover.
No source
settings, model execution, campaign counters or executive grants changed here.
Suite's named package/readiness and campaign-window helpers are prepared locally;
ten in-memory tests exercise their actual remote budget body, including ETag
conflict, changed ledger, active work, expiry and read-only behavior. They do not
prove a production renewal or activation.

## Ally ProForma source contract correction — November 22, not deployed

The executive `proforma-search` adapter omitted `version: 1` when calling the
canonical Workflow knowledge reader. A regression through the signed source
endpoint reproduced a 503; the one-field request correction passes against the
real reader and committed draft library. The regression also checks capability
denial before and after the read, versioned source links, draft/review labels,
partial-result coverage and exclusion of full document bodies.

`check:executive-reports`, `check:workflow-knowledge`, server typecheck and focused
ESLint pass. Before/after evidence is in
`generated/current-navigation-20261122/proforma-*.log`. The separate design chat's
UI overlay preserves the live server and does not contain this new source
endpoint; its running release candidate is unchanged. Include this correction
in the subsequent native Ally overlay and recheck all approved live sources.
The earlier live proof catalogued five capabilities but read only resident flow
and Pipeline. Suite's canonical read-only proof now executes every capability,
including licensing metadata and ProForma draft references, while emitting only
hashes, counts, scope and freshness. That expanded live proof is still pending.

## Ally 0.18.7 installed with execution disabled — November 22

The independent API is Healthy on `alamo-ally-prod-api--runtime-0187-1122`,
image `0ca7e7d46a3491b699cd0d52574d2348eafd1c7e19d5bf159b7cc343f068a08e`.
Configuration, identity and owner-only access are preserved; health is 200,
anonymous reports 401, foreign origin 403 and Platform preflight 204. The canonical
worker ZIP is `677bf4a0209edc7e595c23dc4e1c27770ce60ae869d233d4b2ce3581765106c4`.
All 128 runtime files, ten functions and exact settings are verified; execution
and both schedules remain disabled. Earlier EPIPE/timeout readbacks are retained,
and read-only verification passed at 16:04 UTC without redeployment. API/worker
0.18.6 remains the recovery target. Suite deployment owns the exact plans and
private `ally-0187.*` receipts.

Platform's current UI revision is `alamo-platform-prod-web--ui-1122-d10bddc-r2`,
image `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:555272da288d0e69acb6c52d8dd39b986d36c0cf04982837e0eb254fcfac2c34`
from source `d10bddc`. It rebased the tested browser build on the immediately
preceding Carelog/fleet image `d0f544e76ce5c94d2b1e5a1cf69e2fadb05df3d1ea6a0e37522ab6c58a57fbaa`,
which is the rollback target. The full 28/28 predeployment gate passed with the
Platform environment loaded; the named revision became Healthy/Running with one
replica and 100% traffic. Public production smoke passed 4/4, six SPA routes
served the release receipt's exact HTML hash, and `/poc` and `/healthz` responded.
Server, API, Carelog, fleet, licensing alert and Carelog launcher bytes match the
preceding image. Eric signed in through the existing personal Microsoft account
in main Chrome and opened the live Home, Admissions and `/chat` surfaces. The
separate automated signed-in postdeployment gate was not completed; its stored
test session was absent. The model worker remains disabled, no broader access was
granted, and no paid model calls were made by this UI release. The subsequent
control cleanup is a local candidate awaiting the next combined release gate.

- purpose: document local development, production deployment, auth, environment variables, and health checks
- status: authoritative current-state reference
- owners: engineering, operations
- updated: 2026-10-20
- tags: deployment, azure-container-apps, vercel, local-dev, entra, databricks, operations
- labels: platform-handbook, current-state
- related files:
  - [alamo-platform-app/.env.example](/Users/eric/CareEngineMain/alamo-platform-app/.env.example)
  - [alamo-platform-app/package.json](/Users/eric/CareEngineMain/alamo-platform-app/package.json)
  - [alamo-platform-app/server/databricks.mjs](/Users/eric/CareEngineMain/alamo-platform-app/server/databricks.mjs)
  - [alamo-platform-app/server/platform-snapshot.mjs](/Users/eric/CareEngineMain/alamo-platform-app/server/platform-snapshot.mjs)
  - [alamo-platform-app/vite.config.ts](/Users/eric/CareEngineMain/alamo-platform-app/vite.config.ts)
  - [alamo-platform-app/vercel.json](/Users/eric/CareEngineMain/alamo-platform-app/vercel.json)

## Current Production Host

### Carelog release preserved for the next Ally candidate — November 22

Another authorized release subsequently advanced Platform to image
`b958cb49939c895b56a7c2f032c0208863efb0a5b726a29c00862f47117c59dd`, revision
`alamo-platform-prod-web--coverage-1121-db9b538`. The Ally preparer's drift guard
stopped before creating a candidate from the obsolete restoration image.
An independent hash comparison of the old and new images found identical image
configuration and changes/additions only within `dist/poc/app/`: the Carelog
coverage release. No files were removed. The compared inventories contain 19,123
and 19,270 files respectively. Platform's shell, source readers and API bytes are
unchanged. Private proof: `suite-deploy/.state/platform-current-base-delta.json`.

The preparer now pins that current image as both base and rollback target.
Its exact shell/content assertions and full overlay preservation checks remain.
Old owner-pilot deployment/restore plans are historical and must not be applied
to this new base. No Ally cutover was performed by this reconciliation. Eric's
existing main Chrome Microsoft session successfully reopened the live Platform
home; that observation is not a replacement for the required release gate.

See the [Carelog coverage receipt](/Users/eric/.codex/worktrees/carelog-coverage-completion-20261121/docs/handoff/coverage-completion-2026-11-21.md).

### Real Ally owner acceptance and restoration — November 22

The owner image `704a3d5b918c41e158ddad6de7a4f893f0c995454d48affca76fe128fd938f00`
was deployed as `alamo-platform-prod-web--ally-owner-1122-6ef50ea` after the full
28/28 predeployment gate passed. Public production smoke passed 4/4. The source
managed-identity proof read five real community aggregate rows and denied an
unknown subject, a private clinical slice and direct source-storage access.

Eric explicitly requested his signed-in **main Chrome**, not another login window.
Ten real questions completed there, with saved reports/version history verified
after reload. The full automated postdeployment `check:ship` was not completed;
the separate session recorder did not capture a usable session. Manual acceptance
is not reported as that gate. The real answers found three failures and three
partial results, including normalized snapshot field mapping, overlapping old
Pipeline stages and withheld net-growth/freshness findings. Four questions passed.
See the [exact review](/Users/eric/CareEngineMain/ally/generated/executive-evaluations/real-owner-20261122/Results.json)
and [engine findings](/Users/eric/CareEngineMain/ally/docs/build-spec.md#november-22-real-owner-acceptance--failures-found-pilot-restored).

The failed candidate was restored at 06:39 UTC to the previous immutable image
`a030b9aa57edda854cb15515e237b93d94c080d99ff82778d1d1f74569270639`, revision
`alamo-platform-prod-web--pre-ally-restored-1122`. Readback verified one Healthy
active revision, 100% traffic, health 200 and anonymous bootstrap 401. Only the
three added source-connection settings were removed; the prior configuration and
source records/snapshots were preserved. The source tree remains the unpromoted
candidate for repairing those findings.

The temporary paid report worker was disabled, its canonical 0.18.3 package
restored, its five selected active-file hashes and settings verified, and ten
functions indexed with both timers disabled. The API remains Eric-only; no wider
executive access was added. Saved reports and source grants remain retained.
Twenty real calls used an estimated $0.096656, with all prior reservations kept
inside the unchanged $10 campaign. Cloud/local ledgers were reconciled only after
execution stopped. Exact protected receipts are owned by
[suite deployment](/Users/eric/suite-deploy/README.md#real-owner-acceptance--tested-and-restored-november-22).

### Owner-only Ally release configuration — November 22

Historical preparation state; the real test and restoration receipt above is current.

**Current prepared artifact (not deployed):** source `6ef50ea`, owner image
`pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:704a3d5b918c41e158ddad6de7a4f893f0c995454d48affca76fe128fd938f00`.
Registry digest was read back after the push at 05:47 UTC. The expanded package
checks pass for owner, fictional-preview and disabled modes. Each preserves the
base image configuration and all 19,123 files outside its reviewed allowlist;
the enabled modes change 20 files. Actual HTTP headers on five routes permit only
the exact independent service in addition to the existing connections. Updated
preview image is `82295bd8b2812ed4c1183ceec24ec1e20151a2497b9359beeab0b1a087fd32dd`;
disabled image is `7f6834b10a9a2793b9c3b9150291526467fbe818a031e3774c62bab8ce3e1bd9`.
Earlier artifact IDs in this section are superseded, not rollback candidates.

The isolated API now has Eric-only role/Principal consent and the exact Platform
client/origin configuration. The source workload audience is
`3c0d757d-0dc8-42d4-b7e2-aaa618dab5b9`, with only the independent API and worker
assigned. Platform's identity owns its private `alamodatalake/ally-source-grants`
registry, containing Eric's two aggregate-only workload bindings. The source
endpoint is not connected in the current production image/configuration. The
worker has the shared model configuration, with dispatch and both schedules off.
See [current service preparation and recovery](/Users/eric/suite-deploy/README.md#ally-owner-pilot-preparation--november-22),
which supersedes the closed-foundation observations below.

The protected `.state/platform-production-ally-pilot.plan.json` in suite-deploy
retains the exact existing app identity/configuration/template and original image
`a030b9aa57edda854cb15515e237b93d94c080d99ff82778d1d1f74569270639`.
Its candidate changes only the named image/revision and
`PLATFORM_AGENT_SOURCE_AUDIENCE`, `PLATFORM_AGENT_SOURCE_STORAGE_ACCOUNT`,
`PLATFORM_AGENT_SOURCE_STORAGE_CONTAINER`. No snapshot override is introduced.
`platform-production-ally-pilot.mjs` checks configuration drift, candidate source
hashes and the complete current predeployment report before applying the plan.
Restore uses the retained image and removes only those three new settings.
Health/revision checks are separate from the full postdeployment gate.

The full `check:ship:predeploy` is currently running, recorded in
`generated/executive-ally-pilot-predeploy-1122.log`. Do not cut over until it
passes. Then require the new production `check:ship`, current source-boundary
checks and signed-in Eric acceptance. Existing Platform production remains
unchanged; neither a pushed artifact nor source grants prove runtime acceptance.

Production-host inspection found that its static browser policy still limited
connections to self and Microsoft sign-in. The enabled release now adds exactly
its configured Ally origin to that one CSP directive; every other host byte and
directive is retained. The disabled host remains byte-identical. The image check
compares the exact host-file replacement and verifies headers on all served entry
routes. Enabled artifacts therefore have a 20-file boundary; the preceding
19-file receipts below predate this connection fix and are not pilot-ready.

`release:executive-ally:prepare -- --owner-pilot` prepares a separate
`generated/executive-ally-release-pilot` artifact. The shared release-mode owner
binds it to verified Eric subject `f73371d5-d2b4-48b4-a32b-1edc7c88869f`, the new
production Ally origin and API scope. The default remains disabled;
`--enabled-preview` remains fictional and cannot be deployed. Mixed/duplicate or
unknown switches fail. Ambient Vite activation remains forbidden. The preparer
records the exact display configuration and hashes its configuration owner.

Build tag `platform-executive-pilot:20261122-v0183` from that directory, then run
`check:executive-ally-release -- --owner-pilot`. The checker verifies the exact
production-base file boundary, inherited image configuration and actual appended
display module, including other users/tenants, signed-out/restricted accounts and
an attempted production auth bypass. Existing routes and monitoring remain
unchanged. The source endpoint remains closed without its server configuration.
Artifact preparation cannot assign Entra access, grant sources or start model work.
The new mode is not evidence of deployment or authenticated runtime acceptance.

Source `b08e420` built all three modes. Their exact-file, compressed-asset,
source-fingerprint, inherited image settings, display gate, route and authorization
checks passed at 05:31 UTC. Each preserves the 19,123 base files outside the
reviewed 19-file boundary. The three mode-guard regressions, docs/retention and
JavaScript lint also pass. Local image IDs:

- Owner pilot: `047726c00af2d409aafd57c36aea248c90622eeb2c0a584346b6e069ea166a5a`.
- Fictional preview: `261ce730dfbb019c8da993974334d884ece542f9f8ddd8b3453d58ab88b51d40`.
- Disabled: `118773e1d4d4186429b51304f4f626ca9d3a7638c8d0b2e2981182fdb66a645a`.

Receipts are the `receipt.json` and `verification.json` in each mode's generated
directory. These supersede the earlier local build IDs below, not the unchanged
production deployment. No image was pushed/deployed and no live model call or
signed-in owner test was made by these checks.

The [separate Ally foundation](/Users/eric/suite-deploy/README.md#ally-production-foundation--november-22)
has no assigned executives, Platform client enrollment, source grants or model
configuration. Preserve its closed baseline and the current Platform image as
recovery targets. Complete the release checklist and source/identity prerequisites
before deploying this UI to Eric; broaden to Andrew/Sandeep after owner acceptance.

### Local Ally 0.18.3 production-base candidate — November 22

The candidate now pins the verified 0.18.3 archive
`cf320ffd5b2ab43a563b5d93c3b33239c1cd6cf78bd14e0fdfa765b91eae7266` and ports
the source/chart correction from staging commit `12f1461`. The lockfile changes
only that runtime. No staging adapters, synthetic snapshots or deployed settings
were copied. The real-source/permission/chart tests, resident flow, production
dependency audit and Chromium fixture at 320/390/1440px pass. The phone screenshot
was inspected: wrapped names remain readable and controls meet the 44px check.
The complete analyst gate and production build also pass. The existing bundle-size
warning remains; no threshold was raised. These checks do not replace the final
predeployment/postdeployment checklist or real-account pilot acceptance.

Both local production-base images pass exact-file, compression, configuration,
source-fingerprint, HTTP-route and authorization checks against the unchanged
November 19 production image. They preserve all 19,123 inventoried base files
outside the 19-file allowlist. The original monitoring runtime and source readers
remain unchanged. Final images built from committed source `c232f73`:

- Disabled: `platform-executive-disabled:20261122-v0183`,
  `sha256:bfaa34419d521b6ef765b1d7e12148f8e88c9992b02e58d95bd5c3d2d02ece63`.
- Fictional enabled preview: `platform-executive-preview:20261122-v0183`,
  `sha256:8b88d100e8fa6d022ca7d53dccf07b14027dbe382f0cb9af98f0aa72c6e818db`.

The preview's enabled UI uses a fictional subject and `https://ally.invalid`;
its source remains disabled. Never deploy this preview. Its bundled display gate
is exercised for allowed/wrong users, wrong tenant, signed-out sessions, restricted
roles and a production-host bypass attempt. Existing route children remain intact
and the account key remains attached to the report panel. This is executable
module evidence, not a signed-in real-account browser test. Actual pilot settings
remain subject to source grants, human acceptance and the release checklist.

Reproduce the disabled image using `npm run release:executive-ally:prepare`, build
its tag from `generated/executive-ally-release`, then run
`npm run check:executive-ally-release`. Add `-- --enabled-preview` to both commands
and build the separate preview tag from `generated/executive-ally-release-preview`
to exercise the enabled branch. Each directory contains its own immutable input
hashes, image and verification receipts. The preparer refuses environment-driven
activation and checks that production still matches its pinned base before work.

No image has been pushed or deployed. Production remains
`a030b9aa57edda854cb15515e237b93d94c080d99ff82778d1d1f74569270639`.
The five-question cloud browser test and verified restoration are recorded in the
[staging operations receipt](/Users/eric/.codex/worktrees/platform-ally-staging-20261121/docs/platform/deployment-operations.md#bounded-executive-browser-test-completed-and-restored-november-22).
That cloud evidence uses only fictional data; it does not authorize real sources.

### Local Ally 0.18.2 integration — November 22

The local candidate pins engine `7c657a2` through
`vendor/alamo-agent-runtime-0.18.2.tgz`, SHA-256
`04651bf664e31f01650267733d703120f81bb1d117cdc99056773d756d898bad`.
The lockfile changes only that package. The engine's live fictional evaluation
passed 30 cases plus ten conversational follow-ups using the shared Carelog GPT
connection, within the owner's $10 allowance. Human grades are still blank; see
[the evaluation](/Users/eric/CareEngineMain/ally/docs/evaluations/executive-quality-2026-11-22.md).

Platform's signed-source/flow checks, production dependency audit and browser
journey pass against this archive. The first browser run exposed a stale test
response missing `requiresDetail`. Direct checks reproduced its rejection on
both 0.18.1 and 0.18.2. The fictional source now explicitly declares aggregate
permission and aggregate evidence, matching the current real-source contract;
no runtime validation was relaxed. The rerun covers 320/390/1440px, 44px controls,
reduced motion, retry, saved reopening, versioning, follow-ups, recipient controls,
revocation, cancellation and PDF export. The three viewport screenshots were
visually inspected. These are Chromium fixtures, not physical-device acceptance.

The complete analyst gate, documentation checks and browser build also pass.
The rebuilt disabled overlay is
`platform-executive-disabled:20261122-v0182`, image
`sha256:2fb410d6e3949f4cc8f7bc46d772fb2fee2a3d0e223035a8b1ddedb7943a4ced`.
Its verification preserves all 19,123 base files outside the 19-file allowlist,
image settings, existing authentication and routes. The source and display gates
remain disabled. Reproduce with `npm run release:executive-ally:prepare`, build
that tag from `generated/executive-ally-release`, then run
`npm run check:executive-ally-release`. The generated receipt binds the archive,
source hashes, base image and rollback; the verification records the exact image.

This is a local integration and checked image, not a deployment. Existing staging
remains on 0.18.1; its receipts below do not certify this new candidate. Production
images, settings, source grants and user access are unchanged.

### Current disabled staging: paired 0.18.1 permission correction

The engine API and worker (`f8b69e3`, packaged at `3ba5a5a`) and the matching
Platform source (`831611e`) are deployed only to isolated staging. ACR builds
`ccj` and `cck` passed. Platform's complete analyst gate, source/grant-reader/flow,
server type, dependency, documentation and build checks passed. The cloud package
contains the synthetic/empty company-content replacements; no local published
snapshot, credentials or production records were uploaded.

- API: `suitestg-ally--v0181-1121-f8b69e3`, image
  `f529fe734e08c7ae090c72823b22a12a8c4a9c395abe08c7c2a819939851ce8a`.
- Platform: `suitestg-platform--ally-v0181-ready-1121`, image
  `c425d60c2c2a45cae84789b6a43c04209f92dc0f48a2e04d750aeae153e88186`.
- Worker: deployment `be5eef68-40f5-4bbf-88be-d97e3516200a`, zip SHA-256
  `64e1098543745a31b7c00f57e7351e5a34dd7ad17b2bd70dd5893ba352902a34`.

API and Platform each have one Healthy revision with all traffic. Exact
configuration/identity comparisons passed, health is 200, and protected endpoints
reject anonymous access. The temporary proof snapshot override is removed.
The worker's settings are unchanged, both timers remain disabled, and no public
report runtime, provider, real executive grant or production change is enabled.
Six existing monitor functions are indexed; this is not report-execution proof.

The expanded actual-cloud test passed scoped aggregate reads, duplicate-create
idempotency, fresh-process reopening, denied detail sharing, authorized detail
sharing, and subsequent detail downgrade. Aggregate content remains accessible;
saved detail is hidden without rewriting history. These checks use fictional
subjects, real workload tokens and Azure Blob storage, and a canned model.
The final revoked-access and cleanup checks also passed after honoring Azure
exec's ten-minute Retry-After. The 18-phase receipt confirms empty active
fictional report indexes, an empty source-grant registry, removal of the fixture
snapshot, and a readback of the normal staging snapshot.

The four-app warm runtime gate passed. Cold staging probes over 25 seconds on
Pipeline, Carelog and Ally are retained in `staging-cold-start-v0181.json`;
thresholds and scaling were unchanged. Staffed-pilot latency remains open.

Current receipts in `/Users/eric/suite-deploy/.state/` include
`ally-v0181.verification.json`, `platform-v0181.final.verification.json`,
`platform-v0181.final.expected.json`, `ally-worker-v0181.runtime-proof.json`
and the complete `ally-v0181-source-proof.json` (with ordered phase receipts in
`ally-v0181-proof-phases.json`). Previous release/configuration/package
receipts are retained. Rollback, with reports still disabled, restores API
`3ba811e447b2ce84e25c4699c5c371a8636fb60038c0ffb943f9983b272cc95b`,
Platform `1df0d00cd59c8edcc826af41f87c9c7575b239a4dc304dd80349a53e63a3b3f5`,
and the retained worker zip `ally-worker-d18b39d.zip`. Use the corresponding
`suitestg-*-v0181.previous.json` settings and repeat health/authentication checks;
preserve all state storage. The earlier sections below retain historical evidence.

### Executive Ally — local Platform candidate; disabled staging worker, November 21

**Local correction before the paired staging rollout:** this checkout pins engine 0.18.1,
archive SHA-256
`f7b8edca576eafc3125bfe3d00d052cc27d308106be0340ab6c7bbef9eab30f3`.
Platform source receipts include `grant.detail` and evidence `requiresDetail`.
The engine rejects sharing/reopening detail under aggregate-only access and
rechecks evidence grant revisions after synthesis. Both defects were reproduced
with fictional data before the correction. The signed local source test covers
denied sharing, authorized sharing, subsequent downgrade, unchanged saved history
and a fresh aggregate report shared successfully. Required fields fail closed;
old unclassified development reports require a fresh investigation.

The paired source/engine changes have since reached disabled staging, as recorded
above. The older cloud and initial overlay receipts below remain historical
and do not certify 0.18.1. No cloud setting, grant, provider request or executive
access changed during the preceding local correction.

Engine commit `f8b69e3` passed the full engine suite, 24 focused executive checks,
34 canned evaluation checks, API/worker builds and isolated package checks. Local
Functions dispatch/restart/cancel/resume passed with fingerprinted receipt
`generated/executive-functions-mHSLNM/verification.json` in the engine checkout.
Platform's full analyst gate and build passed; after the final pin was installed,
source/flow, server types, dependency audit (218 runtime dependencies), docs and
build were repeated successfully. The installed service hash matches the engine
source. These are offline/fictional authorization proofs, not live model quality.

The updated disabled overlay is now built and verified from Platform commit
`b1291d7`. Image ID:
`sha256:7e5682cd08dd698e213b567c680ac212a971f1a7989059c995e8f8d7c5a25e8a`.
Its November 21, 23:38 UTC receipt in
`generated/executive-ally-release/verification.json` confirms the same 19-file
allowlist against 19,123 base files, unchanged image configuration, preserved
host authentication, packaged HTTP routes and disabled/unauthorized gates.
It remains local and has not been pushed or deployed. Production base/rollback
is unchanged. This current receipt supersedes the generated 0.18.0 overlay check;
the initial image and its historical result are recorded below.

**Initial 0.18.0 production-base package:** the exact November 19
production image was compared with this checkout before packaging. A whole-root
replacement would overwrite unrelated live server and browser updates. The new
`release:executive-ally:prepare` command therefore retains that image and changes
only 19 recorded files, including compressed browser assets. It reuses the live
React/MSAL/router instances and existing source readers; the source boundary
bundles the pinned report contracts without replacing the installed monitoring
engine. The shared source readers, other routes, authentication, package lock and
image configuration remain intact. This is an additive disabled candidate, not
a production deployment or executive activation.

`check:executive-ally-release` compared all **19,123** base files against the exact
allowlist, verified source fingerprints and compressed assets, exercised the
disabled panel with restricted/unrestricted synthetic identities, and ran the
packaged HTTP server with networking disabled. Health and browser routes passed;
existing protected APIs returned 401. The new source returned 503 without
configuration and 401 with an audience but no workload token. Local image ID:
`sha256:4a92f7c1a1bcba7afbc201dff215c0016984f44ad96a1e99204f06305bb92637`.
The current preparation and verification receipts in
`generated/executive-ally-release/` now cover 0.18.1 as described above;
the rollback/base remains `a030b9aa…70639`.
The image was not pushed to a registry or deployed.

Reconciliation also recovered an existing production fix missing from the local
candidate: recorded outcomes cannot inflate active referral counts, truncated
boards retain their valid published count, and `outcome_review` remains an
accepted briefing phase. The new regression failed before restoring the live
behavior; dashboard/scheduling, source/flow, API, types and code checks passed
afterward. No source records changed.

This preparer intentionally rejects activation and any changed production base.
After live acceptance resumes, prepare the enabled candidate with the reviewed
API origin/CSP, scope and named display participants, then run the full release
and signed-in checks. Its disabled-package receipt does not substitute for those
checks or for actual Functions report execution.

**Earlier 0.18.0 staging receipt:** Platform source `3963cc0` on
`codex/platform-ally-staging-20261121` was deployed at
`suitestg-platform--ally-source-ready-1121`, image SHA-256
`1df0d00cd59c8edcc826af41f87c9c7575b239a4dc304dd80349a53e63a3b3f5`.
ACR run `cch` passed; synthetic package manifest SHA-256 is
`095dbc0bc077cfe10eafed6cd2800dc887b84fcb62104687f523ac59895e362e`.
The prior Platform staging image is retained at
`6e164c247a0a7fa327f2f30773a539965e3b0e9930efeebaec454390e26b08e6`.
Identity, existing access, scale and configuration are preserved except the
explicit source audience and source-owned grant-store settings. The temporary
proof snapshot override was removed; the normal synthetic snapshot was read back.
One healthy revision has 100% traffic. Health returned 200; anonymous bootstrap
and source requests returned 401. Production remains at the November 19 image
`a030b9aa57edda854cb15515e237b93d94c080d99ff82778d1d1f74569270639`.

The dedicated staging workload audience is
`6b0b50fd-1511-4aac-ab1e-6c8bc88e90de`. Its application role is assigned only to
the existing Ally API and worker managed identities; no delegated scope, user
assignment or secret was added. Platform owns the private
`suitestg1y764dg4h5gh4q/agent-source-grants` container. Its current report registry
is `{ "version": 1, "grants": [] }`; real executives have no new grant.

Cloud acceptance used a separate fabricated snapshot and fictional subjects:
the allowed census 7 was returned while another community's 99 and a private
field were excluded. Unknown subjects/communities/private dimensions were denied.
Ally's identity could not read the grant container directly. The canonical report
service, with a canned model in an isolated process, passed concurrent-create
idempotency, durable reopening in a fresh process, recipient-only read access,
edit denial and source revocation for both owner and recipient. Revocation hid
the saved report without rewriting its history. Cleanup removed active fictional
report state and the isolated snapshot; fresh checks confirmed empty grants,
empty fictional report indexes, a 403 for the former grant and restoration of
the original staging snapshot. No GPT call or public report runtime was enabled.

The complete Platform analyst gate passed using the existing **local** published
snapshot; that snapshot was excluded from the cloud package. The later grant
reader correction reran its real-SDK regression, executive/monitoring source,
flow, host, types, lint, source-health, unused/duplicate and documentation checks.
Runtime dependency audit passed. API/worker model and report configuration remain
absent, and worker timers remain disabled. Actual Functions report execution,
signed-in executive journeys, live answer quality and load/cold-start acceptance
remain required before production activation.

Receipts in `/Users/eric/suite-deploy/.state/` are named
`platform-ally.plan.json`, `platform-ally.final.json`,
`platform-ally.verification.json`, `ally-source-identity.receipt.json` and
`ally-executive-source-proof.json`. Retain the preceding release/package receipts;
never export `.state/` wholesale. Recovery restores the retained preceding
Platform staging image and the `before` configuration from its plan, removing
the three `PLATFORM_AGENT_SOURCE_*` settings and any proof `SNAPSHOT_ROOT` override,
then repeats health/authentication checks. Do not choose the superseded intermediate
image with the failed grant reader as a recovery point. This staging update does
not authorize replacing Platform's layered production shell.

Later staging source acceptance reproduced a 503 caused by the shared grant
reader's fixed-length Azure buffer download. The new `check-source-grant-blob.mjs`
uses the actual SDK against a local HTTP fixture and rejects the old reader on a
25-byte valid registry. The source correction streams the bounded response,
retains the 64 KiB cap, and closes the body after success or failure. The focused
grant/source/flow and monitoring-source checks cover the correction. The isolated
staging integration lives at `platform-ally-staging-20261121`; its cloud receipts
remain separate from production release authorization and live-model acceptance.

The owner deferred live GPT tests after the shared Carelog OpenAI project was
observed with no active credit balance. Billing, keys, source grants, production
images and executive access remain unchanged. The November 21 continuation
deployed disabled staging worker infrastructure and its tested package, then
updated the staging API to the same engine version, detailed below. Do not
renew the expired connection gate by changing a date: first verify an active provider connection, then run the live
acceptance cases in the canonical Ally spec.

The original November 20 candidate pinned engine 0.18.0, added Platform's report source endpoint and embedded
its executive report client. It is disabled by default. The currently live
Platform digest below remains the base and rollback for this feature. The root
frontend still must not overwrite the production shell's separate route overlays.

Original engine candidate: `d18b39d`, package 0.18.0; archive SHA-256
`1c5831a797ca30fb98a8e8103bd7f2627e17babcf4c22da4de7f156cc115fd62`.
The lockfile integrity and installed runtime match the archive. Engine's full
existing suite and all 21 focused executive checks passed. API/worker builds and
isolated package closure passed. Platform's source/flow, prior monitoring and
conversation integration, type, lint, API boundary, dependency, docs, code-health,
unused/duplicate and production-build checks passed. The browser fixture passed
320/390/1440px, PDF, retry, follow-up, versions, sharing and direct links, recipient
controls, revocation, cancellation and saved reopening. The rendered PDF was
visually inspected. These are synthetic local receipts, not signed-in, live-model,
device, load, or full production release acceptance.

November 21 source-permission correction: a synthetic aggregate-only query could
return newly added private summary columns. The regression was reproduced before
the fix. `ally-data-source.mjs` now projects explicit authorized columns in SQL
and in both warehouse/fallback results. Catalog, date filtering, evidence and
native datasets use the same restricted manifest. Focused signed-source, data
projection, resident-flow, server type and API checks pass. The full analyst
regression gate also passed; the final published-column mapping correction reran the affected source/flow, type and lint
checks. Exact publisher names now retain community/category/county labels and
counts/net movement. Native datasets mark governed measures as numbers, preserve
null versus zero, and reject blank measures. No real record was used for these
reproductions.

Disabled worker infrastructure receipt (subscription
`84d40648-8488-4226-9e74-6b9458d0d73f`, `rg-suite-staging`):

- Function App/plan/managed identity: `suitestg-ally-worker`, Node 22 Flex Consumption.
- Identity client `83a4c5dd-ca6b-4ea8-ab98-724b1b50782e`, principal
  `1bbdd6bd-60b4-4cb7-a496-6d60b08d7ad3`.
- Host/deployment storage `suitestgawy764dg4h5gh4q`; shared keys/public blobs off.
- Existing state container `suitestg2y764dg4h5gh4q/ally-state`; new identity has
  container-scoped Blob Data Contributor, plus host-only blob/queue/table roles.
- Both schedule disable flags true; worker enabled flag false; connectors `[]`;
  no report registry, provider key or source credential. SCM/FTP basic publishing off.
- Reviewed Bicep SHA-256
  `51a9a98fab748f03e8a5d8568d05fc1eb995dd0e589b022bceb57bd7d8ae54de`.
  Provisioned at `2026-11-21T07:59:05Z`; cloud configuration and exact role scopes
  verified at `2026-11-21T08:01:13Z`.
- Owner: `/Users/eric/suite-deploy`, branch `codex/ally-worker-20261120`.
  Its named `.state/ally-worker.*.json` receipts retain the reviewed plan,
  configuration proof and package provenance. Never export `.state/` wholesale.

The initial staging API update used engine 0.18.0 at `suitestg-ally--v018-1121-d18b39d`,
image SHA-256 `3ba811e447b2ce84e25c4699c5c371a8636fb60038c0ffb943f9983b272cc95b`.
ACR run `cce` passed. Exact identity, environment, configuration and scaling were
unchanged; only image/revision changed. The new revision is Healthy with 100%
traffic; health returned 200 and work/conversations/catalog/reports rejected
anonymous access with 401. Its report registry and model settings remain absent.
Rollback is the retained 0.17.0 image
`5a45222df65817019318afa0a01fc2a8c2727914db1a537896adef07dc0214c9`,
with the same configuration. Named API package/release/verification receipts are
`.state/ally-v018.*.json` in suite-deploy. At that API release the other staging
images were unchanged; the later Platform staging receipt above supersedes that
state. Every production application remains unchanged.

Worker package 0.18.0 from engine `d18b39d` was deployed with zip SHA-256
`2023a23e00456940f884c71f0affcd0ae76174bf832dbefc978161052e8eaa2c`.
Azure deployment `8fcb9f09-c9ea-4457-916a-d7153c45d20c` succeeded at
`2026-11-21T08:03:08Z`. Six monitor functions indexed, the only registered timer
was disabled, and report functions remained unregistered without their registry.
Anonymous management requests returned 401 and the absent public report route 404.
Post-deploy configuration and exact-role verification passed. No report/source
operation ran; indexing is not execution acceptance. Recovery is to retain
state and the preceding package, disable schedules, and stop the Function App if
necessary; do not delete shared Ally state or restore application records.

Named pilot identities (verified directory/branding references, not active grants):

| Person | Entra object ID |
| --- | --- |
| Eric | `f73371d5-d2b4-48b4-a32b-1edc7c88869f` |
| Andrew | `e9f39185-d751-45c0-bcf5-c24d3565bdd9` |
| Sandeep | `b72c34f0-0ee8-4ab4-8359-81c8f7b0d3b2` |

Required activation order:

1. Pin reviewed engine/API/worker and Platform candidates. Re-run affected checks
   after any changes; run the actual release checklist at the release boundary.
2. Finish the independent worker execution/storage acceptance against the engine's
   private state store. Disabled staging infrastructure is provisioned; its
   disabled-by-omission report registry and worker switch stay off until source and
   provider proofs pass. Platform remains the source owner. No migration of records.
3. Configure Platform's dedicated source audience and `AlamoAgent.Source.Read`
   workload role for the engine identity. Store explicit subject/community/capability
   grants in a **separate private source-owned container**, using the existing grant
   reader. Do not give the engine write access to those grants. Begin with aggregate
   dimensions and no raw assessment, personal HR, emails or clinical notes.
4. Configure `ALAMOAGENT_EXECUTIVE_REPORTS_JSON` on the independent API/worker and
   the verified shared OpenAI connection. Register Platform's delegated client and
   exact browser origin. Run signed-in, source-permission, restart/recovery, live
   answer, load/cost and export checks in staging. A disabled Function App is
   provisioned; that alone does not prove source access or report execution.
5. Enable the host flag and named display participants for Eric after acceptance,
   then Andrew, then Sandeep after their own source and usefulness checks. A name
   in the browser configuration grants no data or service access.
6. On a rollout failure, disable report membership/host visibility, stop report
   dispatch, and restore the pinned preceding images. Keep private report state
   and evidence for investigation; do not roll back or delete source records.

Source scope currently implemented: governed Platform analytics, reconciled
resident-flow episodes, the published Pipeline summary, bounded state licensing
metadata, and the deployed ProForma draft-reference snapshot. It does not imply
complete Pipeline event history, live ProForma authoring, all Carelog encounter
content or Workforce personal records. Those need their owning application's
content contract and grants before catalog exposure.

### Platform Clients and Admissions consistency — 2026-11-19

- Runtime source: `1fde4b0`; release-test correction: `41187ae`; ACR build `ccfp`.
- Active revision: `alamo-platform-prod-web--clients-1119-1fde4b0`;
  Healthy/Running, one replica, 100% traffic.
- Active image: `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:a030b9aa57edda854cb15515e237b93d94c080d99ff82778d1d1f74569270639`.
- Rollback image: `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:0c3798779c63d731e11377ceeaecdb34356d255cf0eef95f57d5789a28822cf7`.

Clients now leads with resident flow, a year selector in its heading, and an
expandable current-client profile. Admissions uses readable named rows, a stage
selector in the list heading, and community scope beside the page title. Both
use compact typography, clearer component boundaries, and less repeated copy.

The image adds one frontend layer to the exact preceding production digest.
All 15 packaged files and their gzip/Brotli representations matched. Runtime
configuration, authentication guard, server, and data layers are preserved.
No data migration or record mutation occurred.

Verification reused the passing analyst, type, docs, focused Admissions/Clients
browser, and build checks from the unchanged runtime candidate. Fresh desktop,
dependency, regression-replay, and mission checks passed. All 19 browser/build
release stages passed, including 72 mobile route/viewport checks and 116 catalog
renders across four widths. The initial mobile gate expected retired
Briefing/Pipeline tabs; its corrected assertion requires the approved community
selector, 44px touch geometry, and scoped route changes. The original failure
and passing resumed run are retained separately. No runtime change was needed.

After cutover, public smoke passed 4/4; all 15 served-asset/encoding comparisons
matched; health returned 200; protected incident and Admissions APIs returned
401 anonymously. Eric's existing signed-in Chrome session verified reload,
Clients community scope and detail close/focus return, current-profile expansion,
Admissions stage/community filters, the original client-file dialog, and Escape
focus return. The 320px/390px layouts had no page overflow or clipped names;
selectors met 44px targets. No browser console errors were captured, and the
viewport was restored. The separate fresh-session suite was not rerun, following
the owner's direction to use the existing Chrome session.

The before/after totals matched: 39 active referrals (28 being assessed, 1 under
review, 10 accepted awaiting move-in); 412 admissions, 286 discharges, 545 ending
census, and 160,712 occupied bed-days for January 1–November 19.

Receipts: `generated/platform-consistency-20261119/deployment-1fde4b0/`.
Visual proof: `generated/platform-consistency-20261119/live-clients.jpg`.
Rollback: update the app to the pinned rollback digest with a fresh revision
suffix, then verify health, traffic, served assets, and signed-in navigation.
No data rollback is required. Continue using the pinned production shell;
the root build must not replace its remaining route overlays wholesale.


### Compact controls and resident history — 2026-11-19

- Runtime source: `9954d00`; ACR build `ccfn`.
- Active revision: `alamo-platform-prod-web--contrast-1119-9954d00`;
  Healthy/Running, one replica, 100% traffic.
- Active image: `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:0c3798779c63d731e11377ceeaecdb34356d255cf0eef95f57d5789a28822cf7`.
- Rollback image: `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:117d807c10bd16cc9dd0b0fddf8ba16c60611cc3a750bc7354d4d983f0da34d2`.

The community title is now its native community selector, with period selection
beside it. Dashboard components have stronger boundaries. Admissions, discharges,
and net use aligned labeled rows. Resident incident history uses a compact facts
grid and one severity-count row, with keyboard focus restored after closing.

The image extends the exact previous production image with one frontend layer.
All 15 packaged files and their gzip/Brotli representations matched their
receipts. Runtime configuration and base layers are identical, and the development
authentication bypass remains disabled. No server or data files were replaced.

Verification reused the passing analyst, type, documentation, report-browser,
incident-browser, stress, and build evidence from the unchanged implementation.
Fresh desktop, dependency, regression-replay, and mission checks passed. The
remaining 19 browser/build release stages passed, including 72 mobile route checks
and 116 catalog renders across four screen sizes. Updated report-browser assertions
cover the approved Overview layout and title location rather than retired markup.

After cutover, public smoke passed 4/4; all 15 live asset/encoding comparisons
matched; health returned 200; protected incident and Admissions APIs returned 401
without authentication. Eric's existing signed-in Chrome session verified the
community-title selector, historical period selection, portfolio return, Clients,
and resident history at desktop, 390px, and 320px widths. The dialog had no horizontal
overflow, severity labels stayed on one line, the close target was 44px, and Escape
restored focus. No browser console errors were captured. The viewport was restored.
The separate fresh-session signed-in suite was not rerun, following the owner's
instruction to verify through the existing Chrome session.

Receipts: `generated/community-contrast-20261119/deployment-9954d00/`.
Visual proof: `generated/community-contrast-20261119/live-platform-design.jpg`.
Rollback: update the app to the pinned rollback digest under a new revision suffix,
then verify health, traffic, served assets, and signed-in navigation. No data
rollback is required.

### Platform title motion and dashboard hierarchy — 2026-11-19

- Runtime source: `3602e3a`; release-test correction: `5784df4`; ACR build `ccfm`.
- Active revision: `alamo-platform-prod-web--design-1119-3602e3a`;
  Healthy/Running, one replica, 100% traffic.
- Active image: `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:117d807c10bd16cc9dd0b0fddf8ba16c60611cc3a750bc7354d4d983f0da34d2`.
- Rollback image: `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:1f2470f950e8317f0e0c1a276bc274e41068214f07307961116ab689b7aec117`
  (preceding community-caption release below).

Page titles now use the same compact typography as navigation. Clicked labels
travel into the title position, with cleanup for rapid navigation, keyboard
navigation, browser Back, viewport changes, and reduced motion. Community and
Overview reports use white surfaces, clearer rules and hierarchy, and capacity
bars proportional to actual operating limits. The Clients community drilldown
updates the report scope and returns focus to its selector. Scoped incident
history preserves its return path. Historical capacity and missing-data notices
remain intact. Remaining design work in Admissions named records, Home repeated
dates, and secondary Clients profile copy is recorded in the design guide.

The release overlays 16 verified files on the exact preceding live image. It
preserves deployed routes, authentication guards, API handlers, report figures,
and data storage. Ten image-level report comparisons passed, including historical,
mixed-month, and missing-data scenarios. All overlay hashes and compressed
representations match. The development authentication bypass remains disabled.

Verification: source analyst suite (including API/access, report, fuzz, and stress
checks), typecheck, lint, code health, unused-source checks, docs, dependency audit,
desktop checks, regression replays, and missions passed. All 19 browser/build
predeployment stages passed, including 72 mobile route/viewport checks and 116
catalog renders across four widths. An obsolete Home assertion expected Analytics
beside the map, although both the pinned pre-change source and the candidate place
it in the header. The corrected check requires header containment and 44px targets;
the original failure and passing resumed run are both retained. No runtime change
was needed for that test correction.

After the revision became healthy, public smoke passed 4/4, all 15 served-asset
identity/gzip/Brotli checks matched, and anonymous incident/Admissions APIs returned
401. An earlier probe while Azure still served the old healthy revision is retained
separately. Eric's existing signed-in Chrome session verified reload, title motion,
Clients scope and reload, Licensing, Admissions, the community dashboard, and scoped
incident-history return at 320/390/1024/1470px without page overflow or console errors.
The browser viewport was restored. The automated isolated signed-in suite was not
rerun; the owner's prior instruction to use the existing Chrome session instead of
opening another Microsoft login window remains in effect. This manual evidence is
separate from the automated predeploy and public-smoke results.

Receipts: `generated/community-dashboard-20261119/deployment-3602e3a/`.
Visual proof: `generated/community-dashboard-20261119/live-platform-design.jpg`.
Rollback: update the app to the pinned rollback digest under a new revision suffix,
then verify health, traffic, served entry assets, and signed-in navigation. No data
rollback is required.

### Community metric caption cleanup — 2026-11-19

- Source: `e488476`; ACR build `ccfj`.
- Active revision: `alamo-platform-prod-web--community-copy-1119-e488476`;
  Healthy/Running, one replica, 100% traffic.
- Active image: `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:1f2470f950e8317f0e0c1a276bc274e41068214f07307961116ab689b7aec117`.
- Rollback image: `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:9d25e0be6f874e7fc44440d651e20b4bf850ddfabd67094ea5c1e8c425929ef5`
  (preceding mobile-label revision below).

The community report builder removes repeated headline-metric month captions
and "Current governed profile" captions. A metric covering a different month
still names that month. The report header, figures, calculations, supporting
counts, source context, and HTML export remain consistent. Seven exact source
hunks were applied to the pinned production report module, preserving its
existing client terminology and all other runtime/browser/data files.

Verification: full source analyst suite, report browser checks, dependency
audit, docs, type checks, and source build passed. Nine image-level report
comparisons cover all report families, historical community reporting, and
different source months: every field matches the prior image except the
specified captions. The general source fixture's navigation-catalog assertion
also fails unchanged on the prior production image; that pre-existing source/
production catalog difference was retained and recorded separately, not counted
as a passed image test. Production smoke passed 4/4, health returned 200, and
anonymous report creation remained 401.

Preview checks covered 320/390/1440px and historical selection. Eric's existing
signed-in Chrome session reloaded successfully and verified all five live
community pages at 390px, without repeated internal captions or horizontal
overflow. The desktop viewport was restored. Evidence and rollback receipts:
`generated/community-copy-cleanup-20261119/`; visual proof:
`live-community-clean.jpg`. Revert by updating the app to the pinned rollback
digest and checking health, traffic, and the signed-in community report; no
data rollback is required.

### Live mobile audit and incident-history label — 2026-11-19

- Source: `7323fba`; ACR build `ccfh`.
- Active revision: `alamo-platform-prod-web--mobile-label-1119-7323fba`;
  Healthy/Running, one replica, 100% traffic.
- Active image: `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:9d25e0be6f874e7fc44440d651e20b4bf850ddfabd67094ea5c1e8c425929ef5`.
- Rollback image: `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:c8033e1d2c994636db1ae240e1580af761b1fbfb40fb5a17b2040435eaff6420`
  (preceding formatting revision below).

Eric's existing signed-in Chrome session checked all five live community
reports at 320/390/430px, their community/period controls and independently
scrollable tables, the mobile menu, and incident priority/date/community
filters, expanded cards, Show all, and resident history. No page overflow,
clipped names/headings, or undersized controls was observed. One history label
split midword at 320px. The sole runtime change adds `shrink-0` to the canonical
fact label, allowing the adjacent value to wrap without crowding the label.

The overlay preserves the exact preceding image and changes only that browser
bundle statement, its hashed entry references, and compressed representations.
The focused incident-card regression at 320/390/768/1440px, typecheck, and source
build passed. The broader unchanged release evidence is recorded below; it was
not rerun for this one-class correction. Production smoke passed 4/4; all 12
identity/gzip/Brotli image and served-asset checks matched. The live corrected
320px dialog has a one-line Diagnosis label, no overlap, and no overflow;
Escape closes it and returns focus. The authenticated session survived reload,
with no console errors. Browser width was restored after testing.

Evidence: `generated/live-mobile-review-20261119/live-audit.json`,
`live-community-390.jpg`, `live-history-fixed-320.jpg`, and `release/` in that
directory. These are browser viewport checks, not physical-device testing.
Rollback uses the pinned image above and the same health/traffic/asset checks;
no migration or data rollback is involved.


### Platform formatting, incident cards, and mobile navigation — 2026-11-19

- App source: `e875f72156f42d443d1bbbda33582d41a5ccce9b`; verification-only
  follow-ups through `68d2798`. ACR build `ccfg`.
- Active revision: `alamo-platform-prod-web--formatting-1119-e875f72`;
  Healthy/Running, one replica, 100% traffic.
- Active image: `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:c8033e1d2c994636db1ae240e1580af761b1fbfb40fb5a17b2040435eaff6420`.
- Rollback image: `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:e2a0e3b24e9596530ac83cb1bf1e281739fe43ebe5dbf31b49c694b867a8652f`
  (prior revision `alamo-platform-prod-web--client-flow-1119-b7a7c2d`).

The release overlays eight canonical browser assets and their compressed
representations on the exact previous production image. It restores the daily
Incidents entry, scopes Fleet/Carelog/Tablets navigation to the canonical owner,
and applies the reviewed report hierarchy, text surfaces, and mobile gutters.
Server code, authentication configuration, data, and independent application
runtimes are unchanged. The full source build is validation only; it was not
used to replace the accumulated production overlays.

Verification:

- Full analyst/type/lint/contracts gate, dependency audit, regression and user
  missions, focused incident-card/owner checks, and production build passed.
- Predeploy browser stages completed through resumed runs, including 72 mobile
  route cases, 116 guided answers, context resets, accessibility, scrolling,
  community navigation, 5 browser missions, and performance. Test expectations
  were corrected for the approved Incidents entry and the existing governed
  medication-given measure. Reload tests now wait for visible route controls
  instead of unrelated background network idleness; semantic assertions remain.
- One first-run journey scenario stalled while compiling a report. The full
  unchanged seeded rerun passed 11/11 turns across eight sessions. The original
  result is retained in `generated/platform-mobile-review/journey-first-run.json`.
  The replay command reported no current failure after the successful rerun;
  it is not counted as an additional executed scenario.
- Production smoke passed 4/4. All 24 served identity/gzip/Brotli asset checks
  matched the reviewed image; health returned 200 and anonymous protected
  incident/Admissions requests returned 401.
- Eric's existing signed-in Chrome session survived refresh and verified Home,
  Overview, community incident filtering/details, Admissions client-file open/
  close, Clients community flow, and Licensing reader/return navigation. The
  Overview title is 38px, desktop overflow is zero, and no console errors were
  observed. Proof: `generated/platform-mobile-review/live-formatting.jpg`.

The saved isolated Microsoft test session had expired. Its fresh-login capture
was stopped at the owner's request; production signed-in verification used the
existing Chrome session. Automated signed-in/guided production scripts are not
claimed as passed, and authentication settings were not relaxed. The source
predeploy evidence and production manual checks above are separate evidence.
Release recipe, image hashes, live bytes, and cutover receipt are in
`generated/platform-mobile-review/release/`.

To roll back, update `alamo-platform-prod-web` in `alamo-data-rg` to the exact
rollback digest above with a fresh revision suffix, then verify Healthy/Running,
100% traffic, public smoke, and the existing signed-in session. No data rollback
or migration is involved.


### LIC 624 pre-role capacity safeguards — 2026-10-20

- active image: `alamo-platform@sha256:4e39ca10164067286c4bd6b9fcb7a3fbf9e5741b284e6df5d0ef6385ff27ca0e`
- active revision: `alamo-platform-prod-web--lic624-preroles-1020`; Healthy/Running, 100% traffic
- rollback image: `alamo-platform@sha256:41f46c5c9c8f149aedfec48409e95181bb2312aef141aa4a344d4ce320fa0468`
- build: ACR `cc9g`, using `deploy/Dockerfile.lic624-ocr-release` on the exact rollback digest
- verified: five concurrent synthetic two-page analyzes through the production managed identity completed within six seconds; LIC 624 OCR mapping/two-page/deadline fixtures; 50-file/five-facility persistence and isolation; Executive Director access contracts; 1440/768/390/320px and zoom-equivalent Licensing browser checks; native-form browser checks; docs, client/server types, syntax, lint, build; production smoke 4/4; `/executive/licensing` 200; anonymous intake list/upload/OCR-retry 401 with `private, no-store`

The OCR operation now has a 120-second overall deadline so stalled analysis can
return before the browser's 180-second upload timeout. Three-or-more-page PDFs
are preserved for manual review but are not automatically mapped as one LIC 624;
this prevents a combined packet from silently mixing separate reports. The
native two-page form and two-page AcroForm extraction remain supported. The
five-concurrent production OCR check exercised only synthetic sources and did
not create queue records or prove handwritten scan accuracy. Staff still must
review each extracted field. There is no durable background OCR worker, and
the Blob catalog is not a 20,000-report historical-import store.

The full analyst gate remains red at `check:copilot-tools` because its fixed
resident-ranking expectation names a different resident than current live
data; this is unrelated to the LIC 624 modules and was not changed to force a
pass. Director role registration/assignment, signed-in five-user verification,
mailbox intake, transactional database, and historical backfill remain off.

### LIC 624 scan-review audit — 2026-10-20

- active image: `alamo-platform@sha256:41f46c5c9c8f149aedfec48409e95181bb2312aef141aa4a344d4ce320fa0468`
- active revision: `alamo-platform-prod-web--lic624-audit-1019`; Healthy/Running, 100% traffic
- rollback image: `alamo-platform@sha256:0ebaee1e9621c91ac5335ceb55a9db07f910d9cdd2a77a1eecf0d5a876b2b596`
- build: ACR `cc9f`, using `deploy/Dockerfile.lic624-ocr-release` on the exact preceding production digest; the overlay adds the LIC 624 review helper used by extraction
- verified: synthetic OCR mapping for multiple people and low-confidence evidence, unrelated/partial fillable PDF fallback, 50-file/five-facility batch isolation, Executive Director access tests, desktop and mobile browser checks, documentation, type checks, server syntax/lint, production build, production smoke 4/4, `/executive/licensing` HTTP 200, anonymous intake and OCR-retry HTTP 401

The scan review now counts only fields that reached the editable LIC 624, not
unmapped OCR/PDF text; low-confidence pairs remain in private evidence for
staff comparison. Scans with several involved people retain up to four rows.
PDFs with unrelated fillable fields no longer bypass OCR. If OCR is unavailable,
partial recognized LIC 624 fields remain available for manual review rather
than being discarded. The original document and review requirement remain
unchanged. The full analyst suite was not green: `check:copilot-tools` still
expects an older resident ranking from live data. This focused release did
not activate the deferred Entra Director roles, mailbox intake, historical
backfill, or transactional database.

### Admissions weekly briefing visual alignment — 2026-10-19

- source commit: `edbfb49` on `codex/admissions-platform-style-20261019`
- active image: `alamo-platform@sha256:f0e4ab9b84753d4b729c484fae237e4bf4b11511ccee36a3b1a0c3104b8fa84c`
- active revision: `alamo-platform-prod-web--admstyle-1019-edbfb49`; Healthy/Running, one replica, 100% traffic
- rollback image: `alamo-platform@sha256:7f94313ee5f1a18171291cf6f49c9268fba10cc9388a2decba92b5cbc56462e8`
- build: ACR `cc97` using `Dockerfile.frontend-release` on the exact preceding production digest; only `/app/dist` changed
- verified: focused combined-briefing and broader Admissions material browser checks, Admissions data/access checks, dependency audit, docs, typecheck, build, production smoke 4/4, and exact live identity-byte matches for `/`, `/admissions`, `/chat`, and the new CSS/JS assets. Anonymous Admissions and Executive Director APIs returned 401. Eric's signed-in production Admissions view showed the weekly census and existing admitted/planned/did-not-move-in sections; computed live colors matched the reviewed blue edge, paper surface, and blue census bars, with no horizontal overflow.

The full predeploy gate did not pass: its analyst suite expects a fixed resident
ranking from older data and then an older incident-history range, while the
current live records have changed. This was a focused frontend release of the
already verified Admissions design only; those unrelated analyst expectations
were not edited or treated as passing. The remaining full ship gate and signed-in
automation are not claimed as complete.

### Home community index restored — 2026-10-19

- source commit: `be77d61` on `codex/admissions-moving-hide-20261019`
- active image: `alamo-platform@sha256:fe0400ee76f159be5426892f206b555e38527b1b568362b4c7891385bfe8f2f0`
- active revision: `alamo-platform-prod-web--homeidx-1019-be77d61`; Healthy/Running, 100% traffic
- rollback image: `alamo-platform@sha256:4a1604902c2ce3935fd5c32b413cfe0ab94be35b2b249f8f7291b6e251c22139`
- build: ACR `cc95` with `Dockerfile.frontend-release` on the exact preceding production digest; only `/app/dist` changed, preserving the newer backend release
- verified: focused Home community-index and California carousel browser checks, typecheck, unused-source check, docs, build; public `/healthz`, `/home`, and `/admissions` return 200. Signed-in production Home shows all five boxed community links and no briefing ribbon. The broader California Home browser check reaches the Analytics route but times out waiting for its unrelated network-idle condition.

The Monday Home briefing ribbon is removed. The boxed community index no longer
disappears in short desktop windows and is the primary phone Home navigation.
Its census comparisons name the prior date instead of saying “vs prior.”

### Admissions moving-clients panel temporarily removed — 2026-10-19

- source commit: `0829f72` on `codex/admissions-moving-hide-20261019`, based on the preceding production source commit `9d4124a`
- active image: `alamo-platform@sha256:6db0d4b0d045f71d1ffc99f37921f53b8451bd5c499a3eadd9044b76e136f294`
- active revision: `alamo-platform-prod-web--adm-hide-1019-0829f72`
- rollback image: `alamo-platform@sha256:5151185d496f7e3e6de140f3aea7554aefa6e71f0710ce6db15e6bc7f9037641`
- build: ACR `cc93`, using `Dockerfile.frontend-release` on the exact rollback digest; only `/app/dist` changed
- verified: Healthy/Running, 100% traffic; production smoke 4/4; `/admissions` 200 and anonymous Admissions API 401. Signed-in Admissions shows census and admitted/planned lists with no "Clients moving through" panel. Focused desktop and mobile Admissions browser checks, typecheck, docs, and build passed. The full predeploy gate failed on an unrelated live-data analyst fixture expecting an outdated resident ranking; the release was limited to the verified browser bundle.

The removed panel had displayed Pipeline referral statuses alongside governed
census without a verified referral-to-resident identity join. It remains out of
the briefing pending reconciliation; Pipeline's own workflow is unchanged.

### Combined admissions context — 2026-10-19

- source commit: `1b48456` on `codex/combined-admissions-briefing-20261019`
- image: `alamo-platform@sha256:7a03bb9af8c6d8eb5a83ad700ae79fc00a3cc3b2d0ebe3e481b44a707c97bc1f`
- revision: `alamo-platform-prod-web--admctx-1019-1b48456`
- rollback image: `alamo-platform@sha256:510964a9ef6d0e9c3233066da2929bb045b7d7083191b80d4c2a349597a21d89`
- build: ACR `cc91`, based on the exact rollback digest through `Dockerfile.admissions-briefing-release`
- verified: Healthy/Running with 100% traffic; public `/healthz`, `/`, `/home`, and `/admissions` return 200; Admissions API returns 401 without authorization; `/` and `/admissions` entry bytes match the built source.

The weekly Admissions view now shows the Pipeline-recorded origin, county,
signed-assessment prior placement, and assigned assessor for client rows. Its
week labels use Pipeline's reporting window, matching the Pipeline briefing.

`www.alamoplatform.com` is served by the Azure Container App
`alamo-platform-prod-web` in resource group `alamo-data-rg` (West US 2), using
Azure Container Registry `pipelineprodacra6qdvl6ebenac`. The Container App is
in single-revision mode; a new image update promotes the new revision. Confirm
the current image and revision with `az containerapp show` before every change.

October 19 LIC 624 OCR/readiness overlay: `deploy/Dockerfile.lic624-ocr-release`
was built on exact preceding digest
`sha256:eb5337a19c9ea124a57b9d9b46731dd3dbd04f7dfbf8943bbdf0b497e3f2db8f`.
The active revision `alamo-platform-prod-web--lic624ocr-1019` uses digest
`sha256:0ebaee1e9621c91ac5335ceb55a9db07f910d9cdd2a77a1eecf0d5a876b2b596`.
The overlay adds the browser bundle plus the LIC 624 OCR/extraction, intake,
native draft, and API modules. The existing `alamo-docreader` resource is
configured by `AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT`; the Platform managed
identity has Cognitive Services User at that resource scope. Rollback is an
image update to the preceding digest and removal of the OCR endpoint setting.
The five Director app-role assignments are deliberately deferred.

The Vercel variables, API adapter, and cron settings below describe that
deployment target, not the current public `www` host. Do not treat a Vercel
promotion as an Azure production release. The September 2026 iPhone polish
release used `Dockerfile.iphone-overlay` to add CSS and Home Screen HTML
metadata to the exact preceding Azure image digest. The follow-up phone
experience release uses `Dockerfile.mobile-experience-overlay` on that digest
and adds only phone CSS, the stacked community selector, same-origin profile and
analytics choice controls, and their HTML references.
Neither overlay rebuilds the browser bundle or server. Rollback is an Azure
Container App image update to the recorded preceding digest, not a Vercel
promotion.

Source-level browser changes use `Dockerfile.frontend-release`. Build the Vite
bundle locally, pass the exact current production image digest as `BASE_IMAGE`,
and replace only `/app/dist`. This preserves the already-proven Azure server,
API, environment, and data adapters while shipping the reviewed React bundle.
The production build stages the same current entry document at the root,
`/admissions` and `/chat`, then regenerates gzip and Brotli siblings for every
served HTML, JavaScript, CSS, JSON, and SVG file. This prevents physical route
indexes or compressed representations retained from an older overlay from
serving a stale browser bundle. Always reconcile identity, gzip, and Brotli
entry responses before promotion. Record the preceding image digest so
rollback remains an Azure Container App image update.

`/workflow` must use the SPA fallback. Do not stage a physical `workflow/`
directory: the current Azure app server treats that directory as a file and
returns 503 (`EISDIR`) on direct requests.

### Owner-only Workflow preview — 2026-10-18

- source commit: `46333e4` on `codex/workflow-native-20261018`
- active image: `alamo-platform@sha256:551e826ba6dd003217f9d324839506c5d00620ec030e59f2b95dfec6cd46dd18`
- active revision: `alamo-platform-prod-web--workflowfix-1018-46333e4`
- rollback image: `alamo-platform@sha256:bea22afd04f233c2768aa5d84e0b0a1a08619b8000f8dcd47e75e28d9ca6847d`
- verified: Healthy/Running, 100% traffic; direct `/workflow`, `/home`, `/admissions`, and `/healthz` return 200; protected API returns 401 anonymously.

The first overlay staged a physical `/workflow` directory and returned 503 on
that route. The corrective image was built from the original healthy base,
removed that directory, and verified through the public host.

### AlamoAgent engine source extraction — 2026-10-16 (not deployed)

The agent engine now has its own local Git project at
`/Users/eric/CareEngineMain/alamoagent`. Its [editing guide](/Users/eric/CareEngineMain/alamoagent/README.md)
and [living build spec](/Users/eric/CareEngineMain/alamoagent/docs/build-spec.md)
are canonical. The user prioritized engine capabilities and application connections;
standalone UI work is parked. Platform's existing client is retained.

Platform consumes the reviewed internal archive
`vendor/alamo-agent-runtime-0.1.0.tgz` from engine source commit `ee7c428` through
its normal package lock. The archive integrity and runtime source bytes were
verified against that project. Existing
agent entry points and contracts re-export that package; unused internal aliases
were removed. The engine owns its runtime dependencies, checked source, emitted
public types, independent API/worker packaging, and skill definitions. No sibling
checkout or symlink is needed by an installed consumer. The Platform source API,
source-owned grants and domain adapters remain in this application.

Both independent entry points use the engine's application connector router.
Each reviewed skill binds to a source application; deployment configuration maps
that app to an exact HTTPS origin/path, audience and workload identity. Optional
`ALAMOAGENT_CONNECTORS_JSON` replaces the older single-Platform settings when set.
Unknown apps, duplicate app registrations, invalid paths and unsafe origins fail
configuration. No chat can choose a connector URL or credential. There is no
cross-app fallback after denial. Current production definitions still use Platform
for both Licensing and Admissions summaries; direct Pipeline, Workforce and
AlamoHealth source capabilities are not claimed by the synthetic routing test.

Verification receipts in this checkout:

- Independent engine `npm test`, API/worker builds and isolated API package check:
  passed. API has 36 runtime files and three direct dependencies; worker has 24
  runtime files and four dependencies. No browser build is needed in the engine.
- Two independently signed local HTTP apps: routing, separate grants, wrong-user
  and wrong-community denial, cross-app receipt rejection, revocation, durable
  publication and conversation rechecks passed. No live model/source calls.
- Platform compatibility checks: work, workflows, source permissions and scoped
  conversations passed against the installed archive, including public types.
- `generated/alamoagent-extraction-package.log`: isolated API install/startup,
  real HTTP authorization suite and shutdown passed (57 installed packages).
- `generated/alamoagent-extraction-worker-host.log`: isolated worker install
  (92 packages) and real Functions/Azurite kill/restart/replay passed; one source
  read, one result, and preserved review receipt.
- `generated/alamoagent-extraction-browser.log`: existing direct/embedded client
  regression passed at 320/390/1440px. This is preservation coverage, not new UI work.
- `generated/alamoagent-extraction-analyst.log` and
  `generated/alamoagent-extraction-build.log`: the complete `check:analyst` suite
  and production build passed (exit 0). The existing large-chunk build warning
  remains. Documentation/retention, lint and dependency/type checks passed.

Dependency-aware Platform builds must include `vendor/` before `npm ci`. The
Licensing job context/Dockerfile now do so using the pinned package path. The old
agent-only overlay fails early with an explicit migration message, because it
cannot safely install the new dependency. Use a reviewed full dependency-aware
Platform image or the independent engine packages for a future release; copying
only compatibility modules onto the old image would leave the package missing.

No deployment, Git remote, cloud resource, registration, consent, source grant,
rollout expansion or email delivery was created. Eric-only access, inactive Wilson
branding, existing state paths and the current production scheduler remain intact.

### AlamoAgent direct home and conversations — 2026-10-16 (not deployed)

The independent API now has a standalone browser build and a versioned central
conversation endpoint at `/api/agent/v1/conversations`. The same React component
can open a conversation from Platform using `?chat=<id>`. Chats read Licensing
summaries and Admissions aggregates through the authenticated source connector;
no direct application transaction, email or assessment-detail capability is added.
The existing `/chat` analyst route remains its separate, unchanged product surface.

Build and verification commands:

```bash
npm run check:everyagent-conversations
npm run check:browser-everyagent-conversations
npm run everyagent:prepare-service
npm run check:everyagent-service-package
npm run check:docs
npm run check:analyst
npm run build
```

`everyagent:prepare-service` builds the separate web entry before assembling the
API package. It contains 33 runtime modules, three direct backend dependencies,
and `web/` with the independent HTML/assets and original approved mark. It does
not copy Platform's public directory, router, reporting modules or private assets.
The Dockerfile serves the browser from `/app/web` in the same API process; this
code change does not require a second web hosting resource. The durable worker
package is still independent and contains no conversation/model runtime.

Configuration, in addition to the source/API settings below:

- `ALAMOAGENT_CHAT_CLIENT_IDS`: exact delegated client IDs allowed to render
  transcripts. Every entry must also be in `ALAMOAGENT_ENTRA_CLIENT_IDS`. Leave
  empty to keep the conversation routes inactive. Register both the direct
  browser client and the trusted Platform client before testing continuity.
  CORS, a supplied host label and conversation possession are insufficient.
- `ALAMOAGENT_WEB_ROOT`: optional fixed directory of compiled browser assets.
  The packaged image sets `/app/web`. Public routes are only `/`, emitted assets
  and the approved mark; API misses never fall through to HTML. CSP blocks
  framing and limits scripts to the same origin. Configure the exact direct-home
  origin in `ALAMOAGENT_BROWSER_ORIGINS` along with authorized embedded hosts;
  verify CSP/MSAL popup behavior against the real registered origins before release.
- `VITE_ALAMOAGENT_API_ORIGIN` and `VITE_ALAMOAGENT_SCOPE`: public build-time agent
  endpoint and delegated scope. Platform shows its optional Chats entry only
  when both are configured. Its existing MSAL instance requests an agent-audience
  token; it never forwards its ordinary Platform API token to this service.
- `VITE_ALAMOAGENT_CLIENT_ID`: the direct browser's own Entra SPA client. Register
  the direct origin as its return address and consent its agent delegated scope.
  Keep `VITE_E2E_AUTH_BYPASS` unset for release. The existing loopback-only browser
  preview convention does not disable backend JWT verification.
- `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`: existing provider convention, supplied
  only to the independent API. Default model remains `claude-sonnet-4-6`. This
  runtime makes one request per submitted turn with its own fixed limits, not
  the analyst retry settings. Missing credentials leave saved work accessible
  and report chat synthesis as unconfigured.

Conversations use `everyagent/conversations-v1.json` in agent-owned state storage,
separate from `everyagent/state-v1.json`. Reads and writes retain the existing
managed-identity and ETag behavior. Current bounds: 50 saved chats, 40 turns per
chat, 8 MiB total; two active turns and 50 submitted turns per rolling 24 hours.
A provider attempt has a 35-second timeout, at most 85 KB context and 1,200 output
tokens. Turns record planned model/prompt, model-attempt start and reported
input/output tokens on completed answers. Failed/interrupted attempts can have
unknown usage; reconcile provider billing rather than counting those as free.
These are resource bounds, not a measured dollar budget. Enabling chat
uses paid provider calls; no live model call was made for local verification.

Conversation scope is immutable per chat and can only become less accessible as
source grants/assignments narrow. A work-linked conversation filters by its source
references; missing matches stay explicit. Source failures can produce partial
answers only while all conversation permissions can still be verified. If a
required grant cannot be verified, the entire transcript/title is withheld,
including previously saved answers. The UI clears rendered chat data when hidden
and rechecks on focus, refresh and polling. Already-read content is not erased.

Submitted request IDs are replay-safe within retained state: the same ID/text
returns the same turn, while altered text conflicts. A canceled or expired turn
cannot publish a late answer. Cancellation does not guarantee an in-flight model
request stops billing. This request-driven chat is not yet a durable model
workflow: after a process loss, pending turns become interrupted on the next
read after their two-minute lease. Retrying the original request does not rerun
it; the user explicitly submits another turn. No automatic model retries occur.

Local acceptance checks use signed synthetic Entra tokens, a separate authenticated
HTTP source, temporary file-backed state and synthetic model responses. They
exercise source/client/user isolation, persistence, request deduplication,
citations, revocation, cancellation and process-loss lease behavior. The browser
check runs the actual API with two registered clients behind a test transport;
no live credentials, production data, deployment or notification is involved.
Local verification passed: full `check:analyst`, both TypeScript checks,
source/HTTP conversation tests, docs/retention, lint, code-health, unused-code,
zero duplicates and the Platform build. The independent API/web package installs
outside the repo (57 backend packages), boots its actual production entry point,
serves the browser, rejects unauthenticated chat/work requests and shuts down
cleanly. Browser checks pass at 320/390/1440px for both the existing helper and
the new direct/embedded conversation flow, including unsent-draft preservation
across tab visibility changes. Mobile and desktop screenshots were visually
inspected. The build retains Platform's existing large-chunk warning.

Receipts are `generated/alamoagent-chat-{analyst,build,browser,package}.log`,
`generated/alamoagent-chat-existing-browser.log`, and screenshots under
`generated/browser-everyagent-conversations/`. The browser setup caught and
fixed public-asset origin handling and a StrictMode refresh/remount race.
These are local synthetic verification artifacts, not production receipts.

Before release: verify actual Entra consent, downstream source roles/grants and
RBAC, isolated storage lifecycle/backups, production availability and rollback.
Define transcript retention/deletion/export; test real-model groundedness and
adversarial source text, measure latency/token spend, and set operational alerts.
Schema/citation checks do not prove that a model's claims are supported. The
full-report correction workflow, durable model replay, learning/memory review,
additional embedded hosts and PostgreSQL migration remain future work.

Provider and sign-in contracts were checked against the
[Claude tool-response documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/parallel-tool-use)
and [MSAL token acquisition documentation](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/acquire-token).
The [living spec](alamoagent-build-spec.md#s2a-direct-home-and-scoped-conversations--2026-10-16)
is the canonical capability and remaining-work record.

### AlamoAgent authenticated source connector — 2026-10-16 (not deployed)

The independent API and durable worker now use the source-owned Platform
connector at `POST /api/platform/agent-source/v1`. Operations are `read` and
`authorize`; capabilities are current Licensing monitoring and the existing
Admissions aggregate projection. Platform retains its source implementations
and upstream Pipeline credentials. The independent runtime does not receive
referral rows, raw source payloads or a user/browser token.

Prepare both independent packages:

```bash
npm run everyagent:prepare-service
npm run everyagent:prepare-worker
npm run check:everyagent-source
npm run check:everyagent-service-package
npm run check:everyagent-connector-host
```

The shared package builder emits explicit closures and rejects lockfile drift.
The API has 26 runtime files/3 direct dependencies; the worker has 21 runtime
files/4 direct dependencies. Neither includes the Platform reporting, clinical,
Licensing storage or source-grant implementation. The worker has 92 locked
transitive package entries, including optional platform packages, at this
receipt. There is no production fallback to direct imports or local credentials.
The legacy Platform facade and its inline timer keep their existing composition
until the controlled cloud cutover described below.

Required source-side setup before deployment:

1. Register a dedicated Entra API audience for the Platform connector, use
   `requestedAccessTokenVersion=2`, and expose application role
   `AlamoAgent.Source.Read` with Application membership. Assign it only to the
   intended managed-identity service principal. Configure the actual token
   audience in `PLATFORM_AGENT_SOURCE_AUDIENCE`; v2 audiences are normally the
   resource application ID. Do not reuse the agent/browser audience.
2. Set `PLATFORM_AGENT_SOURCE_STORAGE_ACCOUNT` and
   `PLATFORM_AGENT_SOURCE_STORAGE_CONTAINER` for a separate private source-owned
   grant container. Platform reads it using its `AZURE_CLIENT_ID`. The reader
   rejects using the work-state account/container pair, reads at most 64 KiB,
   and does not cache or fall back when missing/unavailable.
3. Maintain `agent-source/grants-v1.json` through source administration, outside
   the agent. Each grant binds exact workload client/service-principal IDs to
   one subject, skill, community scope, expiry and revocation state. Missing,
   duplicate, malformed, expired and revoked grants deny access. Existing
   Licensing/owner permissions and the Eric-only agent grant also apply.
4. Verify Azure RBAC for **every identity attached to the agent host**, including
   the work-state identity. None may write source grants or possess account-wide
   roles/keys that bypass container separation. Use an agent-specific identity
   for work state and connectors; do not attach Platform's source identity to
   the agent host. Container separation alone does not prove RBAC isolation.

Inert example registry; the workload IDs must be replaced with verified Entra
IDs, expiry deliberately selected, and revocation explicitly cleared during
source administration before this permits anything:

```json
{
  "version": 1,
  "grants": [{
    "id": "eric-licensing-monitor",
    "clientId": "00000000-0000-0000-0000-000000000000",
    "principalId": "00000000-0000-0000-0000-000000000000",
    "subjectId": "f73371d5-d2b4-48b4-a32b-1edc7c88869f",
    "skillId": "licensing",
    "communityIds": ["337"],
    "expiresAt": "2026-10-16T00:00:00Z",
    "revoked": true
  }]
}
```

Use a separate `admissions-watch` grant with `communityIds: []` for the current
aggregate capability. This grants no assessment-detail or other-user access.
The source grant revision is a digest of all authorization fields, including
expiry/scope; edits do not rely on an operator remembering to bump a version.
Revocation is rechecked around source reads, during validation, before publish,
and on independent-API retrieval. These are point-in-time checks across services,
not an atomic distributed revocation transaction. Engine history and retained
work have separate retention/access policies. New reads with unverifiable
access hide stored results; pause/cancel remain usable.

Required independent API/worker settings:

- `ALAMOAGENT_PLATFORM_ORIGIN`: exact HTTPS Platform origin. The endpoint path is
  fixed; redirects, arbitrary destinations and HTTP origins are rejected.
- `ALAMOAGENT_PLATFORM_SCOPE`: the source resource scope, normally
  `api://<source-application-id>/.default`.
- `ALAMOAGENT_CONNECTOR_CLIENT_ID`: the agent-specific managed identity client ID.
  Its service-principal ID must also match the source grant. Token acquisition
  is bounded; tokens never enter task/checkpoint inputs, state or logs.
- Existing managed-identity work-state settings and the API/Functions settings
  in the candidate sections below. No new model configuration is required.

Local evidence, October 16: signed-token HTTP tests pass for token/grant/scope
denials, narrowed projections, revocation during reads and before publication,
retrieval withholding, expiry, changed grant revisions, safe links, bounded
responses, error redaction and retained reviews. The API package passes an
isolated install and real entry-point checks. The worker package independently
installs outside the repository and passes an actual Functions process
kill/restart against a separately authenticated local source; one read, one
result/receipt and review continuity are verified at
`generated/everyagent-host-check/1792209050905/result.json`.
Browser checks pass at 320/390/1440px. No test used live source data, Azure
credentials, a public model or an email action. The first independent worker
install timed out; the retry using the package cache passed.

The full `check:analyst` gate, `check:docs`, browser/server TypeScript checks,
production build, lint, code-health, unused-code and duplicate-code checks pass.
The final browser pass also verifies that portable Platform evidence links
resolve locally inside Platform. Build, analyst and browser logs are saved at
`generated/alamoagent-connectors-{build,analyst,browser}.log`; the build retains
its existing large-chunk warning. These are local verification artifacts.

Azure registrations, role assignments, grant storage/RBAC, production source
access, live rollout and rollback remain unverified and unprovisioned. No cloud
resource, outbound notification or deployment was created by this change.
Direct conversation, interactive OBO, additional hosts and the independent
chat workspace remain future work in the [living build spec](alamoagent-build-spec.md).
[Entra access-token versions and audiences](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens)
and [workload authorization](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow)
underpin the identity configuration; a JWT unit test does not validate tenant setup.

### AlamoAgent independent API candidate — 2026-10-16 (not deployed)

The independently runnable Node service exposes `GET/POST /api/agent/v1/work`
and an unauthenticated liveness-only `GET /healthz`. It has no scheduler, model
client or direct source reader. Platform still uses `/api/platform/everyagent`
through the same handler/service; its existing authenticated browser transport
is now injected into a shared client. No production routing changed.

Prepare and verify from the owning checkout:

```bash
npm run everyagent:prepare-service
npm run check:everyagent-service
npm run check:everyagent-service-package
```

Preparation creates `generated/everyagent-service` with 26 explicit source
files, a Dockerfile and a pruned lock. Its only direct dependencies are Azure
identity, Azure Blob and JOSE (57 installed packages at this receipt).
It excludes Platform source readers/reporting, clinical code, presentation
assets, browser bundles and environment files. Preparation may contact the npm
registry to prune the lock; it creates no cloud resources. The package check
installs dependencies outside the repository and runs the signed-token HTTP
suite there, preventing fallback to Platform's node_modules.

Before hosting, configure:

- `NODE_ENV=production`; `PORT` defaults to 8080.
- `ALAMOAGENT_ENTRA_TENANT_ID` for the existing pilot tenant.
- `ALAMOAGENT_ENTRA_API_AUDIENCE` for a dedicated Entra v2 API registration.
- `ALAMOAGENT_ENTRA_CLIENT_IDS` as explicit comma-separated registered client
  IDs. `ALAMOAGENT_ENTRA_SCOPE` defaults to `access_as_user`.
- `ALAMOAGENT_BROWSER_ORIGINS` as exact comma-separated HTTPS origins, including
  the direct home itself when it exists. No wildcard or ambient Platform auth.
  Clients acquire a token for this audience; a Platform-audience token is denied.
- The source connector origin/scope/identity settings described in the current
  source-connector receipt above; startup requires them.
- `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_CONTAINER`, `AZURE_CLIENT_ID` for the
  agent-specific managed identity and approved work-state container. There is no production
  local-file fallback. Existing `everyagent/state-v1.json` schema and ETag
  behavior are retained; configure ownership/RBAC and verify continuity at cutover.

Local verification: real HTTP tests pass for signed JWT validation, wrong
issuer/audience/tenant/client/scope/signature/expiry, application-only claims,
Eric-only access, exact origins, bounded commands, redacted errors, conflicts,
review persistence through host recreation and shared cancel/retry commands.
The isolated package passes that same suite and startup refusal without
production mode, complete authentication or managed-identity storage settings.
The real CLI entry also starts, serves health/unauthenticated requests, and
shuts down cleanly with synthetic configuration and no Azure calls.
These tests use only synthetic local state and keys. They do not verify an
Azure Entra registration, deployed image, managed identity or ingress.

Local regression receipt, October 16: `check:docs`, both TypeScript checks,
full `check:analyst`, and `build` pass. Agent browser checks pass at 320, 390 and
1440px with the existing quiet helper, scope, review, progress and cancel/retry
flows. The actual Functions worker kill/restart proof also passes after source
composition was separated; its receipt is
`generated/everyagent-host-check/1792203400253/result.json`.
The API build, analyst and browser logs are under
`generated/alamoagent-api-{build,analyst,browser}.log`. These are local artifacts,
not deployment receipts. The build retains its existing large-chunk warning.

Before release, build/scan the image, verify cloud identity and storage access,
set ingress/availability/log retention and request-rate limits, verify the
source-owned connector and grants in Azure, then test routing/CSP, state
continuity and rollback. The subsequent source-connector change also extracts
the durable worker; its package uses authenticated HTTP and excludes Platform
source readers. The historical first-install `everyagent:prepare-release`
overlay is not a runtime-upgrade recipe for this extraction. Use a reviewed
complete runtime image with these new helper dependencies at Platform cutover.

No Azure resource, Entra registration, hostname or repository was created, and
no deployment/email/access expansion occurred. The [living build spec cost
estimate](alamoagent-build-spec.md#cost-envelope--checked-2026-10-16) records the
$15–50/month small-pilot infrastructure planning allowance and separate model
usage, with its assumptions and exclusions. This code step adds neither.

### AlamoAgent durable worker candidate — 2026-10-16 (not deployed)

The initial candidate established Azure Durable Functions with the Azure Storage provider;
the source-connector receipt above supersedes its initial direct-import worker
composition and broad package. The durable runtime remains
registered through `server/everyagent-worker.mjs`. There is no public HTTP
starter. The timer resolves server-owned assignments; the existing authenticated
web API exposes task projections and scoped cancel/retry commands. Existing
production remains on the inline timer until a separately verified cutover.

Prepare the worker from the owning checkout:

```bash
npm run everyagent:prepare-worker
npm ci --prefix generated/everyagent-worker --omit=dev --ignore-scripts
```

The generated package includes the worker's checked runtime, pinned dependencies,
lockfile/overrides, and host configuration. It excludes private presentation
assets and environment files. No cloud resources are created by preparation.
Preparation replaces only its own generated directory to prevent stale files
from entering a subsequent package. The isolated package passed a production
dependency install and rejects development mode or absent storage settings.

Local execution proof uses isolated synthetic data and local Azure emulation:

```bash
npm install --prefix generated/agent-workflow-tools --no-save azure-functions-core-tools@4.16.0 azurite@3.37.0
npm run check:everyagent-workflows
npm run check:everyagent-workflow-host
npm run check:browser-everyagent
```

The host check retains diagnostic artifacts under ignored
`generated/everyagent-host-check/`. It actually terminates the Functions process
after collection, restarts against the same Azurite history, and verifies that
the source is read once, the instance resumes, one cited result/run receipt is
published, and review persists through the app service. Azurite uses only its
public development credential on loopback; cloud credentials are not passed.

Local verification receipt, October 16: the final real-host replay check passed
at `generated/everyagent-host-check/1792200024134/result.json`. Browser checks
passed at 320, 390, and 1440px, with captured work-progress screenshots under
`generated/browser-everyagent/`. The complete `check:docs`, `check:analyst`
(including both TypeScript checks and the workflow regressions), `build`, and
production dependency gate also passed. These are local verification receipts,
not production release evidence.

Required cloud configuration remains to be provisioned and verified:

- A separate Functions worker and private Azure Storage backend for Blob,
  Queue, and Table orchestration state. Select hosting/region/network settings
  and history purge/retention before enabling the timer.
- `NODE_ENV=production`, `FUNCTIONS_WORKER_RUNTIME=node`,
  `EVERYAGENT_WORKER_ENABLED=true`, and `EVERYAGENT_WORKER_MODE=durable`.
  The production worker refuses development-mode startup.
- An identity-based `AzureWebJobsStorage` connection with the documented host
  and Durable Functions permissions. Use managed identity rather than storing
  an account key; see [Microsoft's configuration guide](https://learn.microsoft.com/en-us/azure/durable-task/durable-functions/durable-functions-configure-managed-identity).
- Existing `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_CONTAINER`, and
  `AZURE_CLIENT_ID` for retained work state, plus the independent worker
  connector settings described above. Licensing/Pipeline credentials stay in
  Platform. The orchestration storage and application work Blob have
  distinct responsibilities. Do not reuse a source application's database.

Cutover order: deploy the updated web/API code with the existing inline mode;
verify backward compatibility; stop its inline scheduler and allow its lease to
finish; then enable the durable worker. Its first prepare persists the durable
execution fence, which the updated inline worker checks before claim and
publication. Use the worker heartbeat and observed task completion to verify
the transition. Existing assignment cursors prevent a new backlog flood.

Rollback must first stop/drain durable execution, account for any running task,
and retain current work/review receipts. Changing only an environment flag does
not clear the persisted fence. Do not restore an older web image that ignores
the fence while the durable worker is active. A production rollback utility
and reconciliation exercise remain rollout prerequisites; no automatic reset
or history deletion is provided by this candidate.

The Eric-only catalog, disabled email delivery, and Andrew's inactive Wilson
profile are unchanged. PostgreSQL migration, conversation/correction, and
broader agent rollout remain tracked in the [living build spec](alamoagent-build-spec.md).

### AlamoAgent name — 2026-10-16

The private embedded helper is now named AlamoAgent in navigation, tooltips,
accessible control names, settings, and browser error copy. It retains the
original Alamo orb, compact work-first layout, Eric-only grant, and disabled
email delivery. Existing routes, API contracts, stored assignments, and asset
names remain stable. This is a browser-bundle-only release.

- source: `2d11635`, branch `codex/licensing-readable-briefs`
- ACR build: `cc83`
- image: `sha256:a117b996e48b90c393e1cd54c244dab2d8300c483721cc760862db761e6cb111`
- revision: `alamo-platform-prod-web--alamoagent-2d11635`
- preceding image / rollback: `sha256:5586eb10d975d085167ca7133406311e30ee228a0d1ce28b59f26b167dd083c9`
- browser assets: `/assets/index-A3T4VVga.js`, `/assets/index-BK0NXO1R.css`

Docs, TypeScript, the full analyst gate, production build, and responsive agent
and Licensing browser checks passed. The exact candidate retains the Eric-only
catalog and Raj/Betty's standalone Licensing grants. Candidate and production
each passed 28 entry, asset, logo-byte, compression, and anonymous-API checks.
The new revision is Healthy/Running with one replica and 100% traffic. Eric's
signed-in production navigation, workspace, launcher, and companion use the new
name and retain existing work. The Licensing Logic App remains Disabled and its
scheduled job notification flag is `false`.

### EveryAgent opens directly to the work — 2026-10-16

The helper has no welcome hero, greeting, product heading, explanatory subtitle,
tagline, or first-visit pop-up. Its workspace starts with a small status toolbar,
skill links, and the existing updates. The icon-only launcher opens actual work
and source links immediately. Licensing uses a compact collection status instead
of an EveryAgent title card; standalone Licensing for Raj and Betty keeps its
existing presentation. Functional report titles, filters, source links, review
actions, history, and skill settings remain available.

- source: `39c3327`, branch `codex/licensing-readable-briefs`
- ACR build: `cc82`
- image: `sha256:5586eb10d975d085167ca7133406311e30ee228a0d1ce28b59f26b167dd083c9`
- revision: `alamo-platform-prod-web--everyagent-helper-39c3327`
- preceding image / rollback: `sha256:e486661ea96b398bd43f8608c1f1f2d208e57d7661b3c252ea9aeea511703805`
- browser assets: `/assets/index-BA3VPLyw.js`, `/assets/index-BK0NXO1R.css`

The release replaces only `/app/dist` over the exact Eric-only production
image. The candidate's catalog still grants EveryAgent only to Eric and
preserves Raj/Betty's standalone Licensing permissions. No server, worker,
notification, or data configuration changes are included.

Docs, TypeScript, the full analyst gate, and the production build passed.
EveryAgent browser checks at 320/390/1440 pixels verify work appears within
the first screen, compact marks, absence of introductory copy and pop-ups,
keyboard focus, source recovery, and persisted pause/scope/review/history.
Licensing checks at 320/390/430/1440 pixels cover compact helper status,
readable reports, sources, and retained account exclusions. The candidate and
production each passed 28 entry, asset, logo-byte, compression, and anonymous-API
checks. The revision is Healthy/Running with one replica and 100% traffic.
Eric's signed-in production workspace and companion both open directly to
existing work with the small original mark and no introductory copy. The
Licensing Logic App remains Disabled and its job notification flag is `false`.

### EveryAgent preview restricted to Eric — 2026-10-16

EveryAgent is now enabled only for Eric Wilson's verified tenant-local object
ID. The same grant policy gates the navigation, launcher/provider, workspace,
API reads and commands, and worker assignments. Existing Raj/Betty assignments
and history are retained but no longer run or publish. They keep standalone
Licensing reports at `/analytics/licensing`, with Licensing navigation and no
EveryAgent identity or launcher. The original combined logo remains selected
for Eric. Email delivery remains disabled.

- source: `d6b608e`, branch `codex/licensing-readable-briefs`
- ACR build: `cc81`
- image: `sha256:e486661ea96b398bd43f8608c1f1f2d208e57d7661b3c252ea9aeea511703805`
- revision: `alamo-platform-prod-web--everyagent-private-d6b608e`
- preceding image: `sha256:e28ffec58d67f5bebc513634a889956c508cecea19e1aa3bbeaef97f7c4de1c3`
- browser assets: `/assets/index-dPWoKmQF.js`, `/assets/index-Bw0pVmX2.css`

This release overlays only the browser bundle and `shared/everyagent-catalog.mjs`
onto the exact preceding production image. Rollbacks must retain this access
restriction; the preceding image grants EveryAgent to all three prior pilots.
No data migration, email activation, or integration permission change occurs.

Docs, TypeScript, the full analyst gate, build, and responsive browser checks
passed. Signed local test tokens verify Raj/Betty receive 404 from EveryAgent
while retaining Licensing. Service checks cover denied commands and ignored
legacy worker assignments. Browser fixtures exercise the real grant policies:
both prior pilots retain report drilldowns without agent navigation or API
requests; unlisted accounts are redirected. The exact release container also
passed the owner/denied-account service checks and 28 route, compression,
asset, logo, and anonymous-API checks. Production passed those same 28 HTTP
checks, and Eric's signed-in session retained his introduction, first logo,
and both skills. Azure reports the restricted revision Healthy/Running with
one replica and 100% traffic; the preceding revision is no longer active.
The worker flag remains `true`, the Licensing Logic App is Disabled, and the
scheduled job's notification flag is still `false`.

### Original Alamo / EveryAgent mark — 2026-10-16

The original combined head-and-leaves emerald orb is deployed as
`/brand/everyagent-alamo-v1.webp` in the briefing, embedded launcher, companion
header, and Licensing skill. The approved asset and generation provenance are
recorded in [material-folder-design.md](material-folder-design.md).

- source: `8b2b9ba`, branch `codex/licensing-readable-briefs`
- ACR build: `cc80`
- image: `sha256:e28ffec58d67f5bebc513634a889956c508cecea19e1aa3bbeaef97f7c4de1c3`
- revision: `alamo-platform-prod-web--everyagent-logo-8b2b9ba`
- preceding image: `sha256:46e520d30bbf34b5012a8c59028593282b476a554a3f048cfbbc93a61177bea0`
- browser assets: `/assets/index-6jD-fc75.js`, `/assets/index-Bw0pVmX2.css`

Docs, TypeScript, the full analyst gate, production build, and responsive
EveryAgent/Licensing checks passed. Both candidate and production passed 28
route, compression, asset, logo-byte, and anonymous-API checks. The revision is
Healthy/Running; the signed-in production view loaded the selected first logo.
The worker remains enabled and email delivery remains disabled. This release
predates the subsequent Eric-only rollout restriction; do not restore its
broader access policy when rolling back presentation changes.

### Embedded EveryAgent introduction and briefing — 2026-10-16

EveryAgent now introduces itself, greets the signed-in user, and leads with
source-linked findings. Skill controls are behind “Manage my skills.” A persistent
green launcher opens the same work in a compact dialog from permitted Platform
pages, with the current page name, recent findings, skill links, and access to
the existing question workspace. No new conversational planner or application
permissions were introduced. Email remains disabled.

- source: `f96108e`, branch `codex/licensing-readable-briefs`
- ACR build: `cc7y`
- image: `sha256:46e520d30bbf34b5012a8c59028593282b476a554a3f048cfbbc93a61177bea0`
- revision: `alamo-platform-prod-web--everyagent-ui-f96108e`
- preceding image / rollback: `sha256:c826df7073d656b51d66c266b985e7bd0a4247d2df3b8ffe044c3cc0c4e7afa9`
- browser assets: `/assets/index-CP98q5fh.js`, `/assets/index-BsNoGC8I.css`

The initial overlay build (`cc7x`) hit the image-depth limit at 125 source layers.
The successful build uses the existing `Dockerfile.frontend-rebase` against that
exact live digest. The local candidate has three filesystem layers; its runtime
configuration and hashes of 24,019 backend, dependency, and runtime files match
the source image. Only the browser bundle changes. The worker setting stays
`true`, its private Blob state is preserved, the Licensing Logic App remains
Disabled, and the job's notification flag remains `false`.

Docs, the full analyst gate, TypeScript, and production build passed. EveryAgent
browser checks passed at 320/390/1440 pixels, covering introduction, embedded
findings, page context, Escape/focus restoration, source failure/recovery, and
persisted pause/scope/review. Licensing reader regression checks passed at
320/390/430/1440 pixels. The candidate and production each passed 27 route,
entry/asset parity, compression, and anonymous API checks. Azure reports the
new revision Healthy/Running with one replica. Eric's signed-in session showed
the personal introduction and real existing work. These checks do not replace
the previously documented full live ship-gate limitation.

### EveryAgent responsibilities across Platform and Pipeline — 2026-10-16

EveryAgent is deployed at `/analytics/agent`, with `/everyagent` as an alias and
an entry in the shared Platform navigation for the existing three pilot users.
Its first two registered skills use the real Licensing library and the existing
protected Pipeline admissions-summary integration. Eric receives both skills;
Raj and Betty retain Licensing. Personal pause/resume, community monitoring
scope, review receipts, recent runs, source references, and explicit evidence
relationships persist in the private Azure Blob `everyagent/state-v1.json`.
No source-application commands, outbound notifications, or clinical writes are
exposed. Email remains disabled in both the Licensing job and its Logic App.

- source: `cbc7292`, branch `codex/licensing-readable-briefs`
- ACR build: `cc7w`
- web image: `sha256:c826df7073d656b51d66c266b985e7bd0a4247d2df3b8ffe044c3cc0c4e7afa9`
- revision: `alamo-platform-prod-web--everyagent-cbc7292`
- preceding web image: `sha256:c5d92d466d065b0c6f12307223d3d2e1af644725242f1fab1ae15001efd0ef28`
- browser assets: `/assets/index-BRqtPndE.js`, `/assets/index-ZjZNtUtd.css`
- runtime setting: `EVERYAGENT_WORKER_ENABLED` is the string `true`
- persistence verified: Blob created at `2026-10-16T22:33:17Z`, 38,938 bytes

The shared worker wakes each minute in the always-on web runtime and checks due
responsibilities every 15 minutes. An expiring Blob-backed lease coordinates
replicas. Source reads are shared across subscribers; assignment grants, scope,
version, and pause state are checked again before results are published. First
collections create completed baselines; subsequent content changes create review
items. Existing state collection stays on its Monday/Wednesday schedule. The
worker does not need an open browser or a saved user token.

The release overlays only the EveryAgent modules, a bounded insertion into the
actual live API router, and the reviewed browser bundle. The preparation command
is `everyagent:prepare-release` with `EVERYAGENT_BASE_IMAGE` set to the exact live
digest. Azure CLI's normal `containerapp update` successfully applied the image
and worker setting; raw PATCH requests from CLI-expanded template output were
rejected because that output includes unsupported/read-only fields such as
`imageType` and `customMetricsSettings`. Do not replay those rejected bodies.

Full analyst checks, docs, TypeScript, lint, unused-code/duplicate checks, and
production build passed. EveryAgent tests cover identity and community scope,
concurrent leases, restart recovery, duplicate suppression, review persistence,
pause races, failed sources, older unresolved work, and aggregate-only Pipeline
memory. Responsive EveryAgent checks passed at 320/390/1440 pixels; the existing
Licensing skill passed at 320/390/430/1440 pixels. The candidate container passed
20 route/compression/auth checks. Production passed the existing 23 entry/asset/
Licensing-auth checks plus the EveryAgent alias and anonymous GET/POST denials.

The new revision is Healthy/Running, has one replica, and receives 100% of traffic.
Eric's signed-in session showed both real completed checks, the 95-report
Licensing baseline, the current Pipeline aggregate summary, and persisted check
history. Opening Licensing preserved its report modules and returned to
EveryAgent. The Logic App is still Disabled and the job delivery flag is still
the string `false`; no email was sent. The previously documented full live
ship-gate limitation remains separate from these passing release checks.

Rollback points the web app to the preceding image digest. That image ignores
the EveryAgent worker flag; retain the private state Blob for recovery. General
skill authoring, team assignment administration, the full shared knowledge graph,
and AlamoHealth adapters are not part of this first release.

### Agent workspace with Licensing skill; email delivery paused — 2026-10-16

The user clarified that the product is one general Agent with connected skills.
The navigation and workspace are now Agent, with Licensing explicitly labeled
as the active skill. The shared Agent work card renders the existing licensing
collector status and report modules. It does not introduce an unconnected chat
or claim additional skills. Existing licensing deep links redirect to
`/analytics/agent` with query parameters intact, and the same three-account
access boundary applies before the skill mounts.

**Email delivery is paused until a new explicit user request.** The production
Logic App `alamo-platform-licensing-alerts` is Disabled, and the scheduled job's
`LICENSING_ALERT_NOTIFICATIONS_ENABLED` is the string `false`. State collection
and in-app updates continue. There were no Logic App executions after the
previous activation; the last listed attempts were failed runs on October 6.
Do not restore the preceding section's enabled state during a redeployment.
If future delivery is approved, use a fresh cutoff unless the user explicitly
asks to send the backlog.

- source: `8e50054`, branch `codex/licensing-readable-briefs`
- ACR build: `cc7v`
- web image: `sha256:c5d92d466d065b0c6f12307223d3d2e1af644725242f1fab1ae15001efd0ef28`
- revision: `alamo-platform-prod-web--agent-skills-1016`
- preceding web image: `sha256:38f114944f49b9d1326f6da914f5feaa21be7624932d7484fa0d72e99aae1dd0`
- browser assets: `/assets/index-OzBLv6cD.js`, `/assets/index-DtZiCD2T.css`

Typecheck, docs, unused-code, full analyst checks, Licensing contracts/job
checks, responsive browser checks at four widths, and the production build
passed. The browser check verifies the general Agent identity, the active
Licensing skill, preserved report links through the old route, automatic report
modules, and failed-check handling. The earlier full live ship-gate limitation
recorded below remains separate from these passing scoped checks.
Production is Healthy/Running. Twenty-three route/asset/auth checks passed,
and Eric's signed-in session followed the legacy URL to `/analytics/agent`,
showing Agent, Active skill: Licensing, and the automatic 95-report results.
The job update completed successfully with delivery false; its Monday/Wednesday
cron remains unchanged, and the Logic App remains Disabled.

### Licensing agent, readable reports, and change emails — 2026-10-16

Licensing now opens with a green agent work summary and the latest report
module already populated. Its status comes from the scheduled collector's
actual last-check record; failed checks remain visible. Explore reports is a
secondary control for community-scoped findings, citations, correction plans,
and text retrieval. Report drilldowns retain their URL and return context.
The report body uses source headings, paragraph spacing, sentence-boundary
breaks, and page markers; original wording and the complete raw-text download
remain intact. The official-source link uses the stable facility record and
identifies the report date/control number to select.

- source: `b3c3aba`, branch `codex/licensing-readable-briefs`
- ACR build: `cc7u`
- web image: `sha256:38f114944f49b9d1326f6da914f5feaa21be7624932d7484fa0d72e99aae1dd0`
- web revision: `alamo-platform-prod-web--licensing-worker-1016`
- preceding brief-only revision/image: `alamo-platform-prod-web--licensing-briefs-1016`, `sha256:3c4881cbebe85f61a2bd597d08e3ce6a71d00017c4bbc4e16059fad7c8b0fbc7`
- browser assets: `/assets/index-6esYPSyh.js`, `/assets/index-u5UgfaAt.css`
- worker image: `sha256:96987c75e617f25a6d768cd43314da944493b8dbd44098c5f0f34cd6f84c43c3` (ACR `cc7q`)
- notifications activated after: `2026-10-16T19:12:51Z`

The existing Monday/Wednesday 9 a.m. Pacific job now emails Raj and Betty when
new source changes publish. The Office 365 workflow is Enabled and its signed
callback remains in Key Vault. Email contains change metadata and links to the
report brief, with no report narrative or resident details. Versioned envelopes
and sent receipts support retries. The activation cutoff leaves the two old
queued notices archived without delivering them. Manual verification execution
`alamo-platform-licensing-check-d4rpica` succeeded; its log recorded an
outside-schedule skip and `before_start` for both old notices. No test email was
sent. Preserve the activation timestamp and notification enable flag when
redeploying the scheduled job.

Validation: Licensing contracts, job/email tests, docs, typecheck, analyst
checks, production build, and 320/390/430/1440-pixel Licensing browser checks
passed. Browser coverage includes automatic results, failed-check truth,
community filtering, empty results, drilldown/back/reload, source-page focus,
wrapping, and an unchanged original download. All 95 archived reports produced
readable narratives; real complaint and inspection pages were inspected.
Earlier broad browser regressions passed after aligning stale expectations
with the deployed medication and navigation labels. The full live ship gate
is not certified: the runtime incident report-shape audit still fails on
pre-existing taxonomy/comparison-data expectations, and automated signed-in
smoke has no saved auth state. This scoped release does not change that runtime
or published incident data.

Production verification: the named revision is Healthy/Running with one
replica. Twenty public checks passed across entry/asset parity, identity/gzip/
Brotli responses, and all three anonymous Licensing API denials. Eric's existing
signed-in session showed the automatic 95-report/four-community worker view,
eight latest report summaries, a readable Turlock narrative with original page
numbers, and the official facility link. Citation exploration returned eleven
matching reports with thirteen citations and eleven recorded correction plans.

### Presentation shortcut removal — 2026-10-16

The presentation icon is temporarily removed from both the main Platform and
Executive Director headers. The authenticated `/presentation` direct link,
viewer controls, private deck, and Eric/Andrew access rules remain available.
This frontend-only release preserves the incident taxonomy release's runtime
and keeps `VITE_WORKFORCE_DEMO=true`.

- source commit: `374e411` on `codex/hide-presentation-shortcut`
- image digest: `sha256:66af35e63a6c372a6db6664b5d67e93abdb52ad61c42bb7c550576111dedfafd`
- revision: `alamo-platform-prod-web--hide-presentation-374e411`
- rollback digest: `sha256:4624f6a2be1f4f25f937e4b97cbff0d4bcb157e0f768a9a3c0236cbc768d6669`
- browser entry assets: `/assets/index-D3Y8Ia8M.js` and `/assets/index-0KRl1n-B.css`

The candidate's root, admissions, chat, and presentation entries match the
release build across identity, gzip, and Brotli. The runtime image configuration
is identical to its base, and anonymous presentation API access returns 401 with
private/no-store caching. Docs, TypeScript, build, and presentation authorization
checks passed, including validation of the current 16-slide private package.
The live revision is Healthy/Running with one replica and 100% traffic; all four
production smoke probes passed. Signed-in browser verification confirmed both
headers omit the icon and the direct presentation link still loads all 16 slides.
Executive Director, Workforce, and auth-redirect contract checks also passed.
The full analyst gate stopped at an unrelated existing query-intent expectation:
`find medication refusal incidents ever` expected `Medication Refusal` but
received `null` after the preceding incident-taxonomy release. This release does
not change query intent, taxonomy, or server behavior.

### Incident taxonomy release — 2026-10-16

Routine medication-refusal reports no longer enter governed incident totals or
detail. Mixed refusal/AWOL records remain AWOL/Elopement; former
aggressive-behavior and substance-use categories publish as Other. Original
silver records remain intact for audit, and MAR administration counts are
unchanged. The Community dashboard, incident register, full reports, and guided
question choices use the refreshed categories; refusal leaderboards were
removed from the Community and medication-performance reports.

- source commit: `2071023` on `codex/licensing-gate-release-20261013`
- Databricks one-time view/QA/audit/snapshot run: `521292136360406` (all four tasks succeeded)
- scheduled notebook paths updated: `eldermark_staged_transform` and `tool_context_views` (the `.py` view alias used by the one-time run was updated too)
- ACR build: `cc7n`
- image digest: `sha256:4624f6a2be1f4f25f937e4b97cbff0d4bcb157e0f768a9a3c0236cbc768d6669`
- active revision: `alamo-platform-prod-web--incident-taxonomy-1016`
- rollback digest: `sha256:8991ed82bb0a10e9ee3afd14db1460f2681bd922b5724b544db0ed924e895480`
- browser entry assets: `/assets/index-Dl0OAAnL.js` and `/assets/index-D8Zcsa20.css`

The full analyst gate, docs, typecheck, build, incident-history browser check,
Executive Director viewport check, and 72 mobile route/viewport checks passed.
The production revision is Healthy/Running with one replica. Identity, gzip,
and Brotli entries serve the new browser bundle; anonymous incident-history
access remains 401. Signed-in verification showed 339 October incidents across
the portfolio, with Other, Medical Emergency, and Fall in the current incident
report; San Pablo's register showed 104 October incidents and no retired
category options. The all-history register still explicitly marks its published
snapshot as partial when live history is unavailable; this release does not
expand historical coverage.

### Fictional Workforce demo — 2026-10-13

The browser-only Workforce demo is deployed with `VITE_WORKFORCE_DEMO=true`.
It always uses labeled fictional counts and roles; it never requests the live
Workforce dashboard API. The owner and Andrew's exact presentation-authorized
account may open `/workforce`. Andrew's Executive Director header links to the
demo, while the HR API remains owner-only. The real Workforce feed and
Paylocity integration are not connected by this release.

- ACR build: `cc6v`
- image digest: `sha256:8991ed82bb0a10e9ee3afd14db1460f2681bd922b5724b544db0ed924e895480`
- active revision: `alamo-platform-prod-web--workforce-demo-1013`
- rollback digest: `sha256:435aedccd2f6208d061013bfb9f9e1f87c1b478379810fbccc957432d7938d0a`
- active browser assets: `/assets/index-PZcFUVpd.js` and `/assets/index-D8Zcsa20.css`

Focused Workforce, access-contract, desktop/mobile, docs, type, and build
checks passed. The live revision became Running/Healthy with one replica;
identity, gzip, and Brotli entry documents reference the new assets, while
anonymous Workforce and presentation access APIs return 401. The full platform
gate was started but intentionally stopped after the focused release because
the user requested immediate deployment; it did not report a failure. Andrew's
signed-in view still requires verification in his own Microsoft session.

Repeated frontend overlays eventually approach the registry's image-depth
ceiling. When that happens, use `Dockerfile.frontend-rebase` once with the exact
current production digest as `BASE_IMAGE`. It copies the proven runtime
filesystem into one fresh layer, adds the validated `/app/dist`, and recreates
the current image's user, environment, working directory, entrypoint, and
command. Before promotion, compare the resulting image configuration with the
source image and confirm the flattened layer count. Resume ordinary
`Dockerfile.frontend-release` overlays after that rebase release.

### Presentation v3 replacement — 2026-10-13

The supplied 16-slide HTML deck replaced the private slide package on
2026-10-13. The viewer opens `/home` from the Platform slide and
`/executive/dashboard` from the Executive Director slide; the Pipeline slide
retains its referrals link. Links open in a new tab and do not bypass the
destination's authorization. All slides passed fixed-canvas fit and browser
navigation checks before promotion. The local fictional Workforce preview was
added only after this image was built and was not deployed.

- source ZIP SHA-256: `935a69e9ac2e6a4ab2d7bb3b64e484a03b1567bb578ab1b59e0a85f80255ae3b`
- ACR build: `cc6u`
- image digest: `sha256:435aedccd2f6208d061013bfb9f9e1f87c1b478379810fbccc957432d7938d0a`
- active revision: `alamo-platform-prod-web--presentation-v3-1013`
- rollback digest: `sha256:7d61c46b35654a0f4146309fd13cbf511f322eefe8d16055950072a294d54768`
- post-promotion: Running, Healthy, one replica; `/presentation` served the new browser bundle and anonymous deck API remained 401. Signed-in production slide inspection was unavailable in the fresh browser session because it required Microsoft sign-in.

### Earlier presentation live links and Andrew access — 2026-10-13

The private 28-slide deck now shows a contextual **Open** link on its four
Platform/Pipeline screenshot slides. Each link opens the real destination in a
new tab from the viewer controls; slides remain inert, and destination route
authorization is unchanged. The existing presentation button requests browser
full screen in the main and Executive Director headers, and the viewer retains
its explicit full-screen toggle. An Executive Director account with separate
presentation authorization may enter `/presentation` without being redirected
back to its normal workspace. Three point-of-care screenshot slides also carry
the local Alamo Point of Care text
correction from the preceding presentation edit.

The viewer bundle and Git-ignored private deck were overlaid on the exact
preceding production image using `Dockerfile.presentation-experience-release`.
The LIC 624 native-draft frontend and server changes were merged into the
release source first, then preserved in the base image. Andrew Dominici's
existing Platform tenant object ID was configured in
`PLATFORM_PRESENTATION_ANDREW_OBJECT_ID`; this grants only presentation access,
not Community, Workforce, or Pipeline privileges.

- source merge commit: `a62492c` on `codex/licensing-gate-release-20261013`
- ACR build: `cc6s`
- image tag: `alamo-platform:presentation-live-a62492c`
- image digest: `sha256:a5a6c629138267711d85ebc151d933f4e061428f2aa670d55b8d66a94c8cb249`
- first revision: `alamo-platform-prod-web--presentation-links-1013` (superseded)
- preceding production digest: `sha256:3602c45fb00a60beb68b3ee36ca0f9dc741b0259ddb3e3150e934a4bf0a7d6d1`

A follow-up browser-only overlay fixed the Executive Director header shortcut
and its route guard without changing the private deck, server, or Andrew's
environment setting:

- source commit: `4d333b3` on `codex/licensing-gate-release-20261013`
- ACR build: `cc6t`
- image tag: `alamo-platform:presentation-access-4d333b3`
- active image digest: `sha256:7d61c46b35654a0f4146309fd13cbf511f322eefe8d16055950072a294d54768`
- active revision: `alamo-platform-prod-web--presentation-access-1013`
- immediate rollback digest: `sha256:a5a6c629138267711d85ebc151d933f4e061428f2aa670d55b8d66a94c8cb249`

The final 112-layer image retains all 111 layers of the first presentation
release, which retained all 109 preceding production layers. The final revision
became Healthy/Running with one replica and 100% traffic. Production served the
new fingerprinted browser bundle at `/presentation`; anonymous deck
API access still returned 401 with private/no-store headers. Presentation
authorization, 28-slide content validation, browser desktop/mobile controls,
the Executive Director header/route browser flow, native LIC 624 browser
workflow, Executive Director viewport suite, full merged analyst suite,
typecheck, docs/retention, and build passed. Andrew's signed-in view still
requires verification with Andrew's own Microsoft session; a fresh test tab
correctly reached sign-in and could not impersonate his account.

### Native LIC 624 drafts — 2026-10-13

Licensing Reports now includes **New LIC 624**, which creates a blank,
facility-scoped report and opens the existing five-section editor. Staff can
save incomplete drafts, reload and reopen them, and confirm review only after
the required-field checks pass. Upload remains the entry point for existing
files. Native records have no fabricated uploaded original or extraction.

- implementation commit: `eaac672` on `codex/lic624-native-report`
- release recipe commit: `0aab74a`; reconciled source: `6c7be8a`
- ACR build: `cc6r`
- image tag: `alamo-platform:lic624-native-0aab74a-v2`
- image digest: `sha256:3602c45fb00a60beb68b3ee36ca0f9dc741b0259ddb3e3150e934a4bf0a7d6d1`
- active revision: `alamo-platform-prod-web--lic624-native-1013`
- rollback digest: `sha256:8a84fa5cd9cfed6eab6be6a1034dd62a73b2ae43beb4207833a5f98b93fb1c7f`
- active browser assets: `/assets/index-2UVv3rqe.js` and
  `/assets/index-CrEkWIvk.css`

`deploy/Dockerfile.lic624-native-release` overlays the browser bundle and three
native-draft server modules on the exact preceding production image. The
candidate was rebuilt after the presentation release landed, preserving its
28-slide package, API adapter, runtime configuration, and access controls.
All 27 predeployment stages passed. The browser stage was resumed after fixing
the isolated checkout's missing governed-data read configuration. The final
build was byte-identical to the staged bundle. Native creation, save/reopen,
confirmation, scope checks, concurrent writes, and interrupted-request recovery
also passed inside the actual registry image using disposable local storage
with network access disabled.

The revision became Healthy and Running with one replica and 100% traffic.
Production smoke passed 4/4. Nineteen live checks verified the root, Admissions,
chat, and Licensing entry documents in identity/gzip/Brotli, exact browser asset
hashes, and anonymous 401/private/no-store boundaries, including draft creation.
A signed-in production check created one blank San Pablo draft, saved revision
1, reloaded the page, filtered Drafts, and reopened that saved revision in the
same editor. No incident facts, signatures, review confirmation, or filing were
added; the blank draft remains available for the demo. The formal postdeployment
`check:ship` remains unverified because this checkout has no saved Playwright
sign-in state. The live signed-in check used the existing browser session.

This release does not add official-PDF generation, OCR, mailbox intake,
automatic filing, or incident-record creation/linking.

### Private presentation replacement — 2026-10-13

The authorized `/presentation` viewer now serves the supplied 28-slide Alamo
Data Strategy deck in place of the previous 23-slide package. Slide HTML,
images, ordering, and speaker notes were copied from the supplied ZIP without
rewriting the presentation. The existing private, self-hosted fonts were
retained so the new deck renders without fetching Google Fonts. The deck stays
in the Git-ignored `server/presentations/alamo-data-strategy` directory and is
not published as a static asset; the existing exact-identity authorization and
private, no-store API responses remain unchanged.

- source ZIP SHA-256: `292040105186b599b3a72d7b5499e2e49557fbf0e5a471d015dd71f8ee8e1d1a`
- source commit: `8593462` on `codex/licensing-gate-release-20261013`
- ACR build: `cc6q`
- image tag: `alamo-platform:presentation-v2-8593462`
- image digest: `sha256:8a84fa5cd9cfed6eab6be6a1034dd62a73b2ae43beb4207833a5f98b93fb1c7f`
- active revision: `alamo-platform-prod-web--presentation-v2-1013`
- rollback digest: `sha256:1096d419d1705f517fdffccb98572c4ae06fb75fc5a4f656dfa84e961b87cd13`

`Dockerfile.presentation-content-release` added only the private deck directory
to the exact preceding production image. `/app/dist/index.html`,
`/app/api/platform.js`, and `/app/server/presentation.mjs` were byte-identical
between the old and new images. The package passed its 28-slide manifest,
asset, notes, tenant-boundary, and authorization checks. All 28 slides were
rendered at 1920 × 1080 with no clipped text or missing images. The full
predeployment ship gate passed 27/27 stages. The new Azure revision became
Healthy and Running with one replica and 100% traffic; production smoke passed
4/4. In a signed-in Chrome session, the live viewer showed slide 1 of 28,
keyboard navigation reached slide 28, and speaker notes opened. Anonymous
presentation and asset API requests returned 401 with private, no-store
caching. The formal postdeployment `check:ship` was not run because this
checkout still lacks the required signed-in Playwright storage state; its
predeployment equivalent and the live signed-in viewer check passed.

### Licensing upload and analyst-gate repair — 2026-10-13

The Executive Director Licensing folder keeps the Alamo Health header and
realistic file treatment, but the Upload view no longer shows a decorative
LIC 624 document alongside the actual drop zone. Its tab is simply `Upload`,
with one clear `Upload incident reports` heading. The private desktop
presentation and server runtime from the preceding production release remain
unchanged.

- source merge commit: `f02a9e5` on `codex/licensing-gate-release-20261013`
- ACR build: `cc6n`
- image tag: `alamo-platform:licensing-gate-f02a9e5`
- image digest: `sha256:1096d419d1705f517fdffccb98572c4ae06fb75fc5a4f656dfa84e961b87cd13`
- active revision: `alamo-platform-prod-web--licensing-ui-1013`
- rollback digest: `sha256:e3d3b33871272b2ba5058c5e9cf534a1cfbfefe582476873a98170f2bb09f189`
- active browser assets: `/assets/index-BOygJL_n.js` and
  `/assets/index-B95HeeUQ.css`

The local analyst snapshot contains January–June 2026 monthly rows, not
July–September. The previously failing analyst tests were corrected to check
loaded periods and to retain explicit `not_loaded` assertions for later ones;
this does not publish or imply newer data. The merged candidate passed all 27
predeployment ship stages. The frontend-only image replaced `/app/dist` on the
exact preceding presentation digest; the private presentation package and
server module were verified present in the candidate image. The new revision
became Healthy and Running with one replica and 100% traffic. Live root,
Admissions, and chat HTML, compressed HTML, JavaScript, and CSS matched the
tested build. Production smoke passed 4/4. A signed-in Chrome session reloaded
the new Executive Director Licensing view and verified the Reports and Upload
tabs, the actual upload drop zone, and the removal of the decorative document.

The formal postdeployment `check:ship` remains unverified: its required
Playwright signed-in stage fails before navigation because this checkout has no
`.auth/alamo-production-storage-state.json`. A non-required invocation skips
that stage; it is not a pass. Provision a dedicated authorized test session
and rerun the required signed-in smoke, guided questions, and full ship gate.

### Portfolio incident history — 2026-10-12

The main Platform now has `/incidents/history`, reached from Incident Center,
with a searchable, sortable record list and facility, year, type, category,
date, and derived-priority filters. Its provisional priority rule is High for
recorded sentinel events or emergency-services notification, Medium for injury,
Low only when all three inputs explicitly say No, and Unknown otherwise. It is
not a clinical or licensing severity grade. Executive Director access remains
facility-scoped. The page identifies incomplete historical coverage instead of
presenting the available records as an all-time total. LIC 624 uploads are not
included in this register.

- source commit: `9fe37f6` on `codex/compact-executive-dashboard`
- ACR build: `cc6m`
- image tag: `alamo-platform:incident-history-9fe37f6`
- image digest: `sha256:031790d22e0b126f8172fef4667a131cb5bb3c9596f4709ad2b00425e6867084`
- active revision: `alamo-platform-prod-web--incident-history-1012`
- rollback digest: `sha256:a9038cdb6b30a58a63e624f72033242daaa63124233170153b7f523ffbabc1cc`
- active browser assets: `/assets/index-chCHzB_1.js` and
  `/assets/index-DDghh2CP.css`

The release used `deploy/Dockerfile.incident-history-release` to overlay the
tested browser bundle and only the incident-history server modules onto the
exact prior production image. It patches the single API route into the proven
production adapter; it does not ship unrelated unreleased API routes. The
candidate preserved the preceding runtime configuration, and its local route
and access-control checks passed before promotion. Documentation, dependency,
TypeScript, build, platform API, Executive Director, incident-history browser,
and responsive access checks passed. The formal broad ship gate remains blocked
by the pre-existing analyst fixture missing San Pablo July–September 2026
months. The user explicitly approved this focused release; it is not a passing
full `check:ship`.

The new revision became Healthy with one replica and 100% traffic. The live
incident-history HTML, JavaScript, and CSS matched the tested build; gzip and
Brotli HTML responses were available. Anonymous incident-history and Executive
Director API requests returned 401 with private, no-store caching. Production
smoke passed 4/4. A signed-in production visual/data check was unavailable for
this release. The fallback incident register currently has 14,966 individual
records against 22,488 published monthly incidents, with available individual
records beginning 2025-04-01 and ending 2026-10-11. Local Databricks read-only
queries for the full governed view were denied SELECT permission, so do not
describe this as complete history until live permissions and coverage are
verified.
### Private desktop presentation — 2026-10-13

The desktop Platform header now has an authorized presentation shortcut into a
full-window 23-slide viewer with browser full screen, slide selection, keyboard
navigation, and optional speaker notes. The phone menu has no shortcut. Eric's
exact tenant object ID is enabled; Andrew remains disabled until his exact
identity is configured. No administrator role, name match, service principal,
or production development bypass can grant access. Slides, images, and bundled
fonts are delivered only through authenticated, private/no-store API requests.

- source commit: `28f6214` on `codex/platform-presentation-release`
- image tag: `alamo-platform:presentation-28f6214`
- image digest: `sha256:e3d3b33871272b2ba5058c5e9cf534a1cfbfefe582476873a98170f2bb09f189`
- active revision: `alamo-platform-prod-web--presentation-28f6214`
- rollback digest: `sha256:031790d22e0b126f8172fef4667a131cb5bb3c9596f4709ad2b00425e6867084`
- active browser assets: `/assets/index-BxFIKohb.js` and
  `/assets/index-7U5CU34O.css`

The release starts from the exact production source and image, retaining the
existing incident-history and executive changes. It adds the viewer, three
presentation routes to the exact production API adapter, and its private asset
package; the remaining runtime and configuration are preserved. The repository
is public, so presentation content is Git-ignored and was not uploaded to
GitHub. Recover the private package, including font licenses, from
`/app/server/presentations/alamo-data-strategy` in this authenticated Azure
registry image. Anonymous registry pulls are disabled.

Documentation, dependency checks, both TypeScript gates, lint, desktop browser
review, and presentation authorization/content checks passed. The latter also
passed inside the actual container using signed test tokens. Live checks found
one healthy ready replica at 100% traffic, 4/4 production smoke probes, identical
entry documents in identity/gzip/Brotli, exact deployed browser asset hashes,
401/no-store responses from anonymous deck/image API requests, and no deck
content at public static paths. Full pre/post ship gates remain blocked by
missing local Databricks credentials; they are not reported as passing. A live
signed-in visual check requires the user's Microsoft session, which was not
available in the verification browser or Azure CLI.

### Executive Director mobile detail and Licensing intake refinement — 2026-10-10

The Executive Director census, incident, and medication detail workspaces now
use a full-month picker on narrow screens in place of a clipped horizontal tab
strip. The full incident register keeps search visible while its category and
date filters collapse behind a phone-sized control. Licensing intake describes
file selection rather than drag-and-drop on touch layouts. This release
replaced only `/app/dist`; server/API, source data, storage, OCR, mailbox, and
notification settings were unchanged.

- source commit: `358a983` on `codex/compact-executive-dashboard`
- ACR build: `cc6k`
- image tag: `alamo-platform:mobile-358a983`
- image digest: `sha256:a9038cdb6b30a58a63e624f72033242daaa63124233170153b7f523ffbabc1cc`
- active revision: `alamo-platform-prod-web--mobile-358a983`
- rollback digest: `sha256:b94e4e94987c75e2a6902c763f37618adc3cd6ecf9482ec41c5ca43a04f32246`
- active browser assets: `/assets/index-BfPkMCIX.js` and
  `/assets/index-BbLx6HAs.css`

Documentation, TypeScript, Executive Director and Licensing contracts, 72
platform mobile route/viewport checks, the focused Executive Director and
Licensing browser suites at 320–1440px and 200%-equivalent zoom, dependency
audit, and production build passed. The broad `check:analyst` gate remains
blocked by the pre-existing San Pablo community-history fixture missing
July–September 2026 periods; this is not a passing full `check:ship`.

The candidate inherited the preceding runtime configuration and 97 filesystem
layers unchanged, adding one `/app/dist` layer. Its HTML, JavaScript, CSS,
gzip, and Brotli bytes matched the locally tested build before promotion. The
new revision became Healthy with one replica and 100% traffic. Public routes,
assets, and access boundaries passed 28 live parity checks; production smoke
passed 4/4. A signed-in visual smoke pass was unavailable because no active
Platform browser session or saved production auth state was present.

### Inline Licensing report and Executive Director navigation — 2026-10-10

The full archived state Licensing report now reads inside the main Platform
report reader, while state-source and original-text download links remain
available. The Executive Director community dashboard opens directly on its
overview without the redundant Overview/MARs/Incidents header tabs. Its
incident and MAR panels open their distinct inline detail workspaces, and
direct `?view=incidents` and `?view=mars` links remain supported. This release
replaced only `/app/dist`; server/API, source data, storage, OCR, mailbox,
and notification settings were unchanged.

- source commits: `ef4047b` and `d8e2745` on `codex/compact-executive-dashboard`
- ACR build: `cc6j`
- image tag: `alamo-platform:reader-nav-d8e2745`
- image digest: `sha256:b94e4e94987c75e2a6902c763f37618adc3cd6ecf9482ec41c5ca43a04f32246`
- active revision: `alamo-platform-prod-web--reader-nav-1010`
- rollback digest: `sha256:c8fa38cb943908df98d69e5bbd2359daa9daac89f43b59672ecc77fddc3b84d4`
- active browser assets: `/assets/index-B9DqlELj.js` and
  `/assets/index-DbrVrsXV.css`

Documentation, TypeScript, Licensing contracts, Executive Director contracts,
desktop/mobile/zoom browser suites, dependency audit, and production build
passed. The broad `check:analyst` gate still stops at the pre-existing San
Pablo community-history fixture missing July–September 2026 periods; this is
not a passing full `check:ship`. The candidate preserved the preceding image's
runtime configuration, added one `/app/dist` layer, and matched the locally
tested HTML, gzip, Brotli, JS, and CSS byte-for-byte.

The promoted revision became Healthy with one replica and 100% traffic. Eight
public route entry documents matched the candidate under identity, gzip, and
Brotli (24/24); JS and CSS matched (2/2). Production smoke passed 4/4. In a
signed-in production browser, the tab-free Executive Director overview loaded,
its incident and MAR panel buttons opened the separate live workspaces, and a
selected Licensing report displayed its full archived text inline.

### Admissions client file and dashboard styling — 2026-10-10

The Admissions Briefing, Pipeline cards, and referral client file now share
the reviewed document styling with Licensing. The client file keeps live
Pipeline fields and disclosures rather than introducing illustrative content.
This release replaced only the frontend bundle; no API/server, data, storage,
OCR, mailbox, or notification setting changed.

- source commit: `b23812b` on `codex/compact-executive-dashboard`
- ACR build: `cc6h`
- image tag: `alamo-platform:admissions-b23812b`
- image digest: `sha256:c8fa38cb943908df98d69e5bbd2359daa9daac89f43b59672ecc77fddc3b84d4`
- active revision: `alamo-platform-prod-web--admissions-file-1010`
- rollback digest: `sha256:340a57c678058f8609d388962d2579c9034846127e829e1816d5f26c532c303c`
- active browser assets: `/assets/index-64NtRLSi.js` and
  `/assets/index-C_pSndLd.css`
- material asset: `/materials/manila-stock-v1.webp`

Documentation, TypeScript, build, dependency, focused Admissions browser,
access, and dashboard checks passed. The broader `check:analyst` gate still
stops at the existing San Pablo community-history fixture missing requested
July–September 2026 periods; this is not a passing full `check:ship`.
The candidate image preserved the preceding runtime configuration and added
only the validated `/app/dist` layer. After the revision became Healthy/Running
at 100% traffic, seven public route entry documents matched the candidate in
identity, gzip, and Brotli (21/21), and the JS, CSS, and manila asset matched
(3/3). Public smoke passed 4/4. A signed-in production browser opened the
Admissions Pipeline and a real referral client file, confirming the new
layout with live data.

### Main Platform home and report reader correction — 2026-10-10

The prior release materially changed the Executive Director context app but
left the main Platform home looking almost unchanged. This correction keeps the
California map and adds a connected community census index beside it, shows
current census in the phone community list, gives the map a restrained
blue-gray atlas background, and makes Analytics reports a paper reader with
domain-colored document accents. The index opens the same community profiles
and highlights their map markers. No dashboard counts are invented when the
governed home response is unavailable.

- source commit: `79e2c32` on `codex/compact-executive-dashboard`
- ACR build: `cc6g`
- image tag: `alamo-platform:main-platform-79e2c32`
- image digest: `sha256:340a57c678058f8609d388962d2579c9034846127e829e1816d5f26c532c303c`
- active revision: `alamo-platform-prod-web--main-platform-1010`
- rollback digest: `sha256:c18adfc74b05b88c0a84a80c6732a0964ad4259d957fc99da182d214a473b445`
- active browser assets: `/assets/index-B3AxUnyG.js` and
  `/assets/index-Dy-cRijC.css`

This frontend-only image inherits all 94 layers of the preceding production
image unchanged and adds one `/app/dist` layer. The home browser suite passed
map/index data parity, cross-highlighting, route/modal behavior, desktop and
phone layouts; the full-reports browser suite passed all five report families
and responsive layouts. Documentation, TypeScript, report contracts, 13/13
browser-surface cases, and production build passed. The broad predeploy runner
again stopped at the existing analyst community-history fixture missing
July–September 2026 San Pablo periods, so this is not a passing full
`check:ship`.

After the new revision became Healthy/Running with one replica and 100%
traffic, root, Home, Analytics, Executive Director, Admissions, and Chat entry
documents matched the candidate byte-for-byte in identity, gzip, and Brotli
(21/21); the JS, CSS, and material asset matched (3/3). The first request
during revision activation still reached the preceding entry document; parity
was repeated successfully after health became ready. Public smoke passed 4/4,
and four anonymous Executive Director API probes returned `401` with
`private, no-store`. No API/server, data, storage, OCR, email, or notification
setting changed.

### Platform dashboard and document-navigation refinement — 2026-10-10

The Executive Director community and Licensing views, plus the related
full-Platform report/navigation surfaces, now use the reviewed compact layout,
material-folder treatment, and responsive spacing. This is a frontend-only
release. It did not replace the API/server runtime or change storage, OCR,
mailbox intake, report data, or notification settings.

- source commit: `32ceffa` on `codex/compact-executive-dashboard`
- ACR build: `cc6f`
- image tag: `alamo-platform:platform-design-32ceffa`
- image digest: `sha256:c18adfc74b05b88c0a84a80c6732a0964ad4259d957fc99da182d214a473b445`
- active revision: `alamo-platform-prod-web--platform-design-1010`
- rollback digest: `sha256:759d9ab22bd3a7847768191a92654883f741cfd2225078a7db53fa38109459c2`
- active browser assets: `/assets/index-CMkJ0TrM.js` and
  `/assets/index-K-Xux5vR.css`
- material asset: `/materials/bookbinding-leather-v1.webp`

The candidate inherited all 93 layers of the preceding production image
unchanged and added one `/app/dist` layer. Documentation, TypeScript,
dependency audit, Executive Director contracts, Licensing browser checks,
browser-surface checks, community browser checks, and production build passed.
The dashboard and full-reports browser suites reached their pass assertions at
the tested desktop/mobile widths but hung during browser shutdown and were
interrupted; they are not recorded as clean exits. The broad predeploy runner
still stops at the existing analyst community-history fixture, which lacks the
requested July–September 2026 San Pablo periods. This was a bounded
frontend-only release, not a passing full `check:ship`.

Post-promotion verification confirmed Healthy/Running, one replica, and 100%
traffic. The root, Executive Director dashboard and Licensing, Admissions, and
Chat routes returned the tested entry document byte-for-byte under identity,
gzip, and Brotli (15/15 representations). The live JS, CSS, and material asset
also matched the candidate (3/3); public smoke passed 4/4 probes. Four
anonymous Executive Director API routes returned `401` with `private, no-store`.
No report, review, incident, Pipeline record, or email was created or changed
during verification.

### Executive Director Licensing folder refinement — 2026-10-09

The Executive Director Licensing workspace now uses the shared material-folder
design reference: a quieter printed cover label, clearly separated Reports and
Upload tabs, and a Review tab only while editing a report. Folder stock,
typography, tab spacing, filename wrapping, and the upload/review controls were
refined across desktop, tablet, phone, and zoom layouts. The existing report
queue, original-file access, and editable LIC 624 form remain intact. This is a
frontend-only release; no API, storage, OCR, mailbox, or notification setting
was changed.

- source commit: `6333b5f` on `codex/compact-executive-dashboard`
- image tag: `alamo-platform:executive-lic-folder-6333b5f`
- image digest: `sha256:759d9ab22bd3a7847768191a92654883f741cfd2225078a7db53fa38109459c2`
- active revision: `alamo-platform-prod-web--licensing-folder-1009`
- rollback digest: `sha256:4b3d7a966d927a3d40a701fbda6bb34324965faef995a0b5bf235a306d1854ec`
- active browser assets: `/assets/index-DDGGL0-z.js` and
  `/assets/index-1JBAcUl4.css`
- material asset: `/materials/manila-stock-v1.webp`

The candidate replaced only `/app/dist` in the exact preceding production
image. Offline image inspection confirmed the same runtime configuration and
byte-identical build assets. Documentation, TypeScript, Executive Director
contracts, synthetic batch persistence/recovery, production build, and the
Licensing browser suite passed. The browser suite exercised upload, review,
original-file access, long filenames, keyboard tabs, unsaved drafts, and
320/390/768/1440px plus 200%-equivalent layouts. The broad predeploy runner
still stops in the pre-existing analyst community-history fixture because its
July–September 2026 baseline periods are absent. Following the user's explicit
request to release after that limitation was disclosed, this promotion used
the focused Executive Director gate; it is not a passing full `check:ship`.

Post-promotion checks confirmed one Healthy/Running replica and 100% traffic.
Identity, gzip, and Brotli responses for `/executive/licensing`,
`/executive/dashboard`, `/admissions`, and `/chat` matched the tested entry
document byte-for-byte. Live JavaScript, CSS, and folder material also matched
the candidate exactly. Four anonymous Executive Director API probes returned
`401` with `private, no-store`. No report, review, incident, Pipeline record,
or email was created or changed during verification.

### Executive Director workspace and bounded LIC 624 uploads — 2026-10-09

The facility workspace now has Overview, MARs, and Incidents, a New client
notification opening the existing client profile, and a searchable, paginated
full-history incident register. Licensing retains the editable digital LIC 624
and now accepts up to 100 PDF/JPG/PNG files per batch, 20 MB each, with one
upload in flight, per-file receipts, failed-file retry, and facility-scoped
exact-byte duplicate protection. Reviewed forms and their immutable originals
are preserved when the same bytes are delivered again.

- source commit: `a6863b21967b8a6ba70127ae5a04902a68706c46`
- source branch: `codex/compact-executive-dashboard`
- ACR build: `cc6e`
- image tag: `alamo-platform:executive-upload-review-a6863b2`
- image digest: `sha256:4b3d7a966d927a3d40a701fbda6bb34324965faef995a0b5bf235a306d1854ec`
- active revision: `alamo-platform-prod-web--executive-upload-1009`
- rollback digest: `sha256:4abc417b5a114d451f0821b77c8b36502247fb14087031bb158b5dda92a4a5e3`
- active browser assets: `/assets/index-Cvi0sR18.js` and
  `/assets/index-DPixrpLO.css`

The bounded overlay retains the exact preceding production runtime. Packaging
now includes all incident and receipt/lock/object modules and checks their
transitive relative imports against the combined candidate filesystem. The
actual runtime-plus-overlay passed API module linkage, incident contracts, and
all 20 synthetic batch persistence/recovery tests with networking disabled.
The built image also passed API/PDF-library imports and entry-document hash
parity before promotion. No real reports were uploaded during verification.

Focused verification passed documentation, retention, TypeScript and server
TypeScript, dependency audit, desktop freshness guards, Platform API and
Admissions access boundaries, Executive Director contracts, the production
build, Licensing browser tests at 320/390/768/1440px and 200%-equivalent zoom,
and dashboard tests at 320/390/768/1024/1440px and 200%-equivalent zoom.

The user explicitly approved this limited release with focused verification
and rollback, despite the full analyst gate not being green. The maintained
June fixture conflicts with later analyst test windows and lacks monthly MAR
refusal detail. A current Azure probe of the unchanged AWOL-since-May analyst
path returned a safe refusal and no artifact, so that failure is not classified
as merely an outdated expected date. Analyst runtime and those tests were not
changed. This is a one-release exception, not a successful full `check:ship`.

Post-promotion checks confirmed Healthy/Running, one replica, and 100% traffic;
28 exact-byte/cache/access probes across six routes, two assets, and four
Executive Director APIs; current retirement-worker bytes; and 4/4 public smoke
probes. Identity, gzip, and Brotli responses match the candidate. An already-open
signed-in Chrome tab adopted the release without a manual reload. Owner checks
confirmed the existing report queue and editable form, batch controls, live
community Overview, MARs, and the complete incident register. No report, review,
incident, Pipeline record, or email was created or changed. Identity, ingress,
environment, scaling, and all other non-image application settings have an
unchanged configuration hash.

The user's selected scope is upload/review only. Scans remain explicitly
Awaiting OCR. No database, OCR processing, incoming Outlook connector, Microsoft
mailbox grant, outgoing notification, or Raj/Betty alert was activated. The
current catalog remains unsuitable for the proposed 20,000-report backfill;
that requires the separately approved processing/index milestone.

### Hidden Executive Director Licensing workspace — 2026-10-08

The URL-only `/executive/licensing` context app is live for the Platform owner
and facility-scoped Executive Director Entra roles. It is absent from general
navigation. Restricted Executive Director identities are redirected into this
workspace and rejected from general Platform APIs; the server derives their
facility scope from verified token roles rather than a browser-supplied
facility ID.

- source commit: `e13546d7dcd86179a5c4355a67a93efdd999453f`
- source branch: `codex/licensing-nav-refine`
- ACR build: `cc63`
- image tag: `alamo-platform:executive-licensing-e13546d`
- image digest: `sha256:ff6facee113399cc70951034fa4e96bbbbcff26d5ba6dd355f180297e6c4acf7`
- active revision: `alamo-platform-prod-web--executive-lic-1008`
- rollback digest: `sha256:a7e86776e618dcab284cb04f52e60a015c907a0ea2661d5fa9137bab3b2a610a`
- active browser assets: `/assets/index-BjxUXIjt.js` and
  `/assets/index-D5os_LT7.css`

The release preserves the exact preceding production runtime and patches only
the validated browser bundle, the Executive Director API/auth modules, and the
locked `pdf-lib@1.17.1` runtime dependency. The release builder starts from the
verified production API file so unreleased main-branch API routes are not
accidentally promoted. Direct route refreshes use the existing Azure SPA
fallback; only the established Admissions and Chat physical indexes remain.

LIC 624 PDFs, JPGs, and PNGs are stored under the private
`licensing/executive-director-intake-v1/` prefix in the existing snapshot
container. Each facility has an ETag-protected `catalog.json` queue projection,
while immutable originals, extraction manifests, and append-only review audits
remain under facility/year/submission paths. Existing manifests are cataloged
automatically on first read. The production managed identity has `Storage Blob Data Contributor`
only at that container scope. Fillable PDFs are mapped into the versioned LIC
624 review record; image-only files remain explicitly `ocr_required`. The UI
does not expose extracted PHI in its recent-submissions list.

Release-specific Executive Director, Licensing, Admissions-access, Reports,
California-home, TypeScript, server-TypeScript, source-syntax, lint,
documentation, retention, dependency, unused-code, production-build, and
container-runtime checks passed. The broader legacy predeploy runner reached
its known local Databricks-credential boundary during the analyst-decision
suite. Post-promotion verification confirmed a Healthy/Running revision at 100
percent traffic, 4/4 public smoke probes, byte-identical deployed JS and CSS,
401 plus private/no-store on both anonymous Executive Director endpoints, and
signed-in owner rendering of the hidden San Pablo workspace with current
community data. The existing redesigned Analytics Licensing library also
loaded its 93-report production collection. No Licensing alert gates or email
settings changed.

### Digital LIC 624 review workflow — 2026-10-08

The hidden `/executive/licensing` workspace now opens a structured digital LIC
624 immediately after fillable-PDF extraction and can reopen the same review
from the licensing queue. Reviewers can correct the facility, people, incident,
treatment, notification, supervisor, and signature sections; save a draft; and
mark the form reviewed only after required fields are complete. The original
upload and source extraction remain immutable. Saved reviews use explicit
revisions, append-only audit records, and optimistic concurrency protection.

- source commit: `369aef716e8ea53a626224c2467d1546fdf2aa0e`
- merge commit: `d44907c9c16695e03bd4bc6247ffe671e96c5373`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/164`
- ACR build: `cc64`
- image tag: `alamo-platform:executive-lic-review-369aef7`
- image digest: `sha256:0c22acada4960b058517c8dfaa072138306bb74b8f9fce4db3c0fd706ba8b2ac`
- active revision: `alamo-platform-prod-web--lic624-review-1008`
- rollback digest: `sha256:ff6facee113399cc70951034fa4e96bbbbcff26d5ba6dd355f180297e6c4acf7`
- active browser assets: `/assets/index-BRY0Uuj0.js` and
  `/assets/index-CiISyH-H.css`

The release uses the bounded Executive Director overlay on the exact preceding
production digest. It replaces the browser bundle and only the related API,
storage, extraction, validation, and shared-contract modules while retaining
the proven application runtime and locked `pdf-lib@1.17.1` dependency.

Verification included documentation, TypeScript, server TypeScript, source
syntax, JavaScript lint, dependency reachability, the full Executive Director
upload/review/reopen/concurrency/confirmation contract, production build, 390px
responsive rendering without horizontal overflow, release-container syntax
and content checks, and image-configuration parity. Post-promotion verification
confirmed Healthy/Running at 100 percent traffic, byte-identical deployed JS
and CSS, successful public route probes, private/no-store anonymous API guards,
and signed-in owner rendering of the San Pablo workspace with current community
data. No sample or production licensing report was created during live
verification, and no alert or email configuration changed.

### Executive Director community dashboard — 2026-10-08

Facility-scoped Executive Director identities now land on
`/executive/dashboard`, with Community and Licensing as the only context-app
destinations. The dashboard adapts the main community profile into a simpler
operating view and adds the assigned facility's Pipeline referrals,
assessments, planned move-ins, and management-chart drilldown. The Executive
Director API filters every admissions card and schedule row on the server; the
browser never receives another facility's records.

- source commit: `39d0abfc8b7e6d62fbf30bd487702cca512d4ce9`
- merge commit: `5cfea0c3aab0d83070aa0876180cd80f3dd7ae85`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/166`
- ACR build: `cc65`
- image tag: `alamo-platform:executive-community-5cfea0c`
- image digest: `sha256:f408902c1c2bdcccd96e5df472fe46043b3d903492c1007e49f52bc88508523b`
- active revision: `alamo-platform-prod-web--executive-community-1008`
- rollback digest: `sha256:0c22acada4960b058517c8dfaa072138306bb74b8f9fce4db3c0fd706ba8b2ac`
- active browser assets: `/assets/index-C33IYSiE.js` and
  `/assets/index-CFcAjl9g.css`

The release uses the bounded Executive Director overlay on the exact preceding
production digest. It replaces the browser bundle and the Executive Director
API modules while retaining the proven application runtime, platform data
adapters, environment, and locked PDF dependency. Verification included the
facility-isolation fixture, Executive Director workflow contract, TypeScript,
server TypeScript, source syntax, documentation, production build, 320px,
390px, and 1440px responsive rendering, and the 320px management-chart modal.
The broad analyst gate reached the existing dynamic-period fixture mismatch in
the AWOL-since-May case; release-specific and production checks do not depend
on that fixture.

Post-promotion verification confirmed Healthy/Running with one ready replica
and 100 percent traffic, 4/4 public smoke probes, byte-identical deployed JS
and CSS, `401` plus `private, no-store` on both anonymous Executive Director
API endpoints, and signed-in owner rendering of the live San Pablo Overview
and Admissions sections. No licensing submission, alert setting, email, or
Pipeline record was changed during verification.

### Executive Director dashboard and incident-intake scale-up — 2026-10-08

The Executive Director community dashboard now presents one facility-scoped
operating brief instead of a grid of detached KPI cards. Census, admissions,
incidents, and medication administration each open a larger detail workspace
using only the assigned facility's governed data. The existing client chart
remains available from the admissions work list.

The LIC 624 intake backend now supports an ongoing multi-user report library.
Each facility has a private ETag-protected catalog with retry-safe concurrent
updates, cursor pagination, status and filename filtering, full-history totals,
immutable source and extraction records, and authenticated retrieval of the
original report. Source retrieval verifies the stored SHA-256 digest before
returning a private, non-cacheable response. Existing manifests are indexed
without rewriting their originals or review history.

- dashboard source commit: `4fc18ee`
- intake source commit: `3f72085`
- merge commit: `f8629dfe208012d39b4c5b5732e58968a151386f`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/168`
- ACR build: `cc66`
- image tag: `alamo-platform:executive-intake-f8629df`
- image digest: `sha256:e6c69f28b8a983fad59c43d1ab555600b74cc4c1148a2364ffe57501e90d1418`
- active revision: `alamo-platform-prod-web--executive-intake-1008`
- rollback digest: `sha256:f408902c1c2bdcccd96e5df472fe46043b3d903492c1007e49f52bc88508523b`
- active browser assets: `/assets/index-DqhlC7bl.js` and
  `/assets/index-DEi9zNM3.css`

The release uses the bounded Executive Director overlay on the exact preceding
production digest and retains the proven Platform runtime and data adapters.
Release-specific verification covered documentation, TypeScript, server
TypeScript, source syntax, code health, unused code, duplication, Platform API
contracts, Executive Director contracts, production build, concurrent catalog
updates, paginated and filtered reads, original-source digest integrity,
optimistic review conflicts, and 390px and 1440px layouts without horizontal
overflow. The broader predeploy runner stopped at the existing dynamic-period
fixture mismatch in the unrelated AWOL-since-May analyst case.

Post-promotion verification confirmed a Healthy/Running revision with one
replica and 100 percent traffic; 4/4 public route probes; byte-identical live
HTML, JavaScript, and CSS; and `401` plus `private, no-store` on all four
anonymous Executive Director API probes. A signed-in owner check confirmed the
live San Pablo dashboard, census drill-down, report queue, and authenticated
two-page original-PDF retrieval. The legacy signed-in smoke script reached its
retired California-carousel selector after its route probes; the direct
Executive Director checks passed. No report, review, alert setting, email, or
Pipeline record was created or changed during deployment verification.

### Executive Director dashboard visual refinement — 2026-10-08

The facility dashboard now presents census, impending admissions, incidents,
and medication administration as four integrated operating components. The
detached KPI shelves and internal mini-stat strips were removed, admissions is
limited to clients moving toward admission, and every component now uses one
restrained, darker Alamo-green surface system. The existing client management
chart remains available from each impending-admit profile.

- source commit: `f08d94b`
- source branch: `codex/compact-executive-dashboard`
- ACR build: `cc67`
- image tag: `alamo-platform:executive-dashboard-f08d94b`
- image digest: `sha256:36b2af9cacc6c1ec8fcc5fc47a380845a01ef42d049d8a03fea3280e8d19bb42`
- active revision: `alamo-platform-prod-web--executive-dash-1008`
- rollback digest: `sha256:e6c69f28b8a983fad59c43d1ab555600b74cc4c1148a2364ffe57501e90d1418`
- active browser assets: `/assets/index-D8gNi9yF.js` and
  `/assets/index-BJ2YsHCL.css`

This is a frontend-only overlay on the exact preceding production digest; the
server, API, data adapters, Licensing persistence, scheduled monitor, alert
settings, and email settings are unchanged. Focused TypeScript, Executive
Director contract, production build, documentation, unused-code, duplication,
and 390px/1440px browser checks passed. The broad legacy predeploy gate stopped
at its documented local Databricks-credential boundary after its preceding
checks passed.

Post-promotion verification confirmed one Healthy/Running replica at 100
percent traffic, 4/4 public route probes, byte-identical HTML/JavaScript/CSS on
the root, `/admissions`, and `/chat`, and `401` plus `private, no-store` on all
four anonymous Executive Director API probes. The browser correctly redirected
an unauthenticated `/executive/dashboard` request to Microsoft sign-in; no
saved production session was available for a signed-in visual pass. No report,
review, alert setting, email, or Pipeline record was created or changed during
deployment verification.

### Executive Director stale-client activation follow-up — 2026-10-08

An already-open Executive Director window remained on the superseded
title-heavy dashboard after the visual-refinement release. The published HTML,
JavaScript, and CSS were current, but the unchanged service worker did not emit
a controller change for that long-lived window. Cache generation `v8` now
activates over `v7`, prunes the older static cache, claims open windows, and
navigates them to their current URL so the compact dashboard is adopted.

- source commit: `3c2c029`
- source branch: `codex/compact-executive-dashboard`
- ACR build: `cc68`
- image tag: `alamo-platform:executive-dashboard-refresh-3c2c029`
- image digest: `sha256:51202c7e7c12b55e5766243fdcfbe7c80f46e2e449676ed7ae6ed3795d5670ac`
- active revision: `alamo-platform-prod-web--executive-refresh-1008`
- rollback digest: `sha256:36b2af9cacc6c1ec8fcc5fc47a380845a01ef42d049d8a03fea3280e8d19bb42`
- active browser assets: `/assets/index-D8gNi9yF.js` and
  `/assets/index-BJ2YsHCL.css`

Desktop readiness, TypeScript, Executive Director contract, production build,
and 390px/1440px browser checks passed. Post-promotion verification confirmed
one Healthy/Running replica at 100 percent traffic, 4/4 public probes, current
byte-identical browser assets, and `/sw.js` serving cache generation `v8`. No
server, API, data, report, alert, email, or Pipeline state changed.

### Browser release-current enforcement — 2026-10-08

The application no longer registers a service worker or caches application
bundles. The published `/sw.js` is now a retirement worker for legacy clients:
it deletes only `alamo-static-*` Cache Storage entries, unregisters itself, and
navigates controlled windows to a cache-busted current release. It has no fetch
handler and cannot cache HTML, JavaScript, API responses, or PHI.

- source commit: `f22e213`
- source branch: `codex/compact-executive-dashboard`
- ACR build: `cc6b`
- image tag: `alamo-platform:legacy-recovery-f22e213`
- image digest: `sha256:2be22aec101a59b014a1b5136f660e1f31707768db9c03cc114784ac8b372d5f`
- active revision: `alamo-platform-prod-web--legacy-recovery-1008`
- rollback digest: `sha256:4caa3693aa11157f7cd5d2d3e1915db08243368a7ca8cd17a3bbef5256e5e2d0`
- active browser assets: `/assets/index-DgyuGtSb.js` and
  `/assets/index-BJ2YsHCL.css`

The hidden `/recover.html` fallback covers the browser edge case where a
retired worker continues to control its already-open tab until that client is
released. It fetches the public release shell without credentials, removes
only Alamo's legacy worker/cache entries, replaces the tab URL with
`/executive/dashboard`, and imports the current fingerprinted bundle with a
cache-busting query. It does not read, store, or transmit platform data.
Future releases remain network-current because the application has no
controlling worker and the entry document is served with
`no-cache, max-age=0, must-revalidate`.

`check:desktop` is a required stage in quick, release, and full platform-ready
profiles. A future build fails its release gate if application worker
registration, fetch interception, or bundle caching is reintroduced.

Desktop readiness, TypeScript, production build, and 390px/1440px Executive
Director browser checks passed. The broader analyst suite reached its existing
local Databricks-credential boundary after its preceding checks passed.
Post-promotion verification confirmed one Healthy/Running replica at 100
percent traffic, 4/4 public route probes, the current bundle in the entry
document, the credential-free recovery bootstrap, the fetch-free retirement
worker, and the anonymous Executive Director API still failing closed with
`401`.

### Compressed browser shell correction — 2026-10-09

The compact Executive Director dashboard is now served from the same release
for identity, gzip, and Brotli requests. The preceding frontend overlay copied
the current uncompressed entry document over a production base image but did
not replace the base image's older `index.html.gz` and `index.html.br`
siblings. Chrome requested Brotli and therefore received the older dashboard,
while the identity-only command-line smoke probe saw the current dashboard.

- source commit: `728aaa7`
- source branch: `codex/compact-executive-dashboard`
- ACR build: `cc6c`
- image tag: `alamo-platform:compressed-shell-728aaa7`
- image digest: `sha256:f8c89a033da30aa944cf63a566ad9cd4adabc5bc93bcbde6abbd58011511752b`
- active revision: `alamo-platform-prod-web--compressed-shell-1009`
- rollback digest: `sha256:2be22aec101a59b014a1b5136f660e1f31707768db9c03cc114784ac8b372d5f`
- active browser assets: `/assets/index-DgyuGtSb.js` and
  `/assets/index-BJ2YsHCL.css`

`npm run build` now regenerates gzip and Brotli siblings after staging every
SPA entry document. Desktop readiness enforces that build step so it cannot be
removed from quick, release, or full release gates without failing the check.
Post-promotion verification confirmed a Healthy/Running revision at 100
percent traffic; identity, gzip, and Brotli entry responses decompress to the
same byte-identical HTML and reference the same active bundle. Signed-in Chrome
loaded that bundle, rendered four compact dashboard panels, and contained none
of the retired Community briefing markup. No server, API, data, report, alert,
email, or Pipeline state changed.

### Executive Director dashboard color and type scale — 2026-10-09

The compact facility dashboard now gives its four operating components distinct
visual identities instead of repeating the mint treatment. Census uses navy,
impending admissions uses ochre, incidents uses rust, and medication
administration uses plum. Component headings, client rows, values, metadata,
controls, and the community title use a larger type scale. At phone widths the
header uses the head-and-tree mark so Community and Licensing remain readable
without squeezing the page.

- source commit: `d2546d7`
- source branch: `codex/compact-executive-dashboard`
- ACR build: `cc6d`
- image tag: `alamo-platform:executive-color-d2546d7`
- image digest: `sha256:4abc417b5a114d451f0821b77c8b36502247fb14087031bb158b5dda92a4a5e3`
- active revision: `alamo-platform-prod-web--executive-color-1009`
- rollback digest: `sha256:f8c89a033da30aa944cf63a566ad9cd4adabc5bc93bcbde6abbd58011511752b`
- active browser assets: `/assets/index-DCQ2TIN1.js` and
  `/assets/index-BoEmI97a.css`

TypeScript, the Executive Director contract, desktop readiness, production
build, and 390px/1440px browser checks passed. Post-promotion verification
confirmed a Healthy/Running revision at 100 percent traffic; identity, gzip,
and Brotli entry responses decompress to the same byte-identical HTML and
reference the same active bundle. Signed-in Chrome rendered four differently
colored components with 20px headings and no retired Community briefing copy.
No server, API, data, report, alert, email, or Pipeline state changed.

### Current Data Architecture explainer release — 2026-10-06

The URL-only `/data-architecture` explainer now documents the production system
that actually exists: Azure Container Apps, the ElderMark/MAR governed snapshot
spine, live bounded Pipeline and client-database integrations, separately
restricted Licensing and acquisition stores, deterministic analyst boundaries,
and sources that are not connected. Static coverage-month claims were removed;
the page now directs changing coverage and freshness to the runtime manifest.

- source commit: `670f9c2647729f5eae0402043f7d1c49d10e5771`
- merge commit: `2cde4a8937a3a1a284eb6ba91948cc9e0dd7b233`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/159`
- ACR build: `cc61`
- image tag: `alamo-platform:data-architecture-670f9c2`
- image digest: `sha256:80b72b6a8d648e0b046273336a5094c3a5169617e9e9ae7d16234fb447db256a`
- active revision: `alamo-platform-prod-web--data-arch-1006`
- rollback digest: `sha256:01c4f436f67a209eabf5f03dbcba0dd2137887943ac31a1fc6005f93abb3980c`
- active browser assets: `/assets/index-CDK1hUw2.js` and
  `/assets/index-5g3z1oKo.css`

This is a frontend-only release on the exact preceding production image.
TypeScript, source syntax, lint, documentation, production build, desktop and
390-pixel visual review, and the 72-case whole-platform phone/landscape matrix
plus safe-area check passed. Post-promotion verification confirmed one ready
healthy replica at 100 percent traffic, 4/4 production smoke probes,
byte-identical deployed JS and CSS hashes, the revised architecture copy in the
production bundle, and clean application startup. The Licensing job remains on
its Monday/Wednesday schedule with notifications disabled, the alert Logic App
remains disabled, and no Licensing email was sent.

### Whole-platform mobile remediation release — 2026-10-06

The Platform now has one production-tested mobile contract across Home,
Analytics, Admissions, Workforce, Outreach, Incident Center, Command Center,
Data Architecture, Licensing, Explorer, and governed question surfaces. The
release adds safe-area-aware navigation, touch-safe controls, bounded dialogs,
phone-specific prioritization and chapter navigation, and explicit missing-data
language in Admissions. Desktop and print layouts remain available without the
phone-only simplifications.

- source commit: `a961a83336ba832d1efde1b57e24b13d123f25b4`
- merge commit: `127c14e1e2f8054405485bb91dd3f2f60e5b6304`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/157`
- ACR build: `cc60`
- image tag: `alamo-platform:platform-mobile-127c14e`
- image digest: `sha256:01c4f436f67a209eabf5f03dbcba0dd2137887943ac31a1fc6005f93abb3980c`
- active revision: `alamo-platform-prod-web--platform-mobile-1006`
- rollback digest: `sha256:cc9f7628cff6d0aaf3fa26c7a0d22b3f3b7586cdcd9af2aab493fe8c48dcdd47`
- active browser assets: `/assets/index-COD0X9Gr.js` and
  `/assets/index-B1jtzz9D.css`

This is a frontend-only release on the exact preceding production image. The
permanent whole-platform browser gate passed 72 route-and-viewport checks across
18 routes at 320-by-568, 390-by-844, 430-by-932, and 844-by-390, plus a
synthetic 47-pixel safe-area pass. Focused Admissions, Licensing, Home,
Explorer, Outreach, community-surface, analyst-capability, question-catalog,
query-understanding, and governed module checks passed, as did type checking,
linting, documentation, dependency, API-boundary, production build, and source
health checks. The broader legacy predeploy runner still encounters an older
local June fixture when a July-through-September community-history case is
requested; the release-specific checks and live production guards do not depend
on that stale fixture.

Post-promotion verification confirmed one ready healthy replica at 100 percent
traffic, 4/4 production smoke probes, one current bundle on `/`, `/admissions`,
and `/chat`, byte-identical deployed JS and CSS hashes, and authenticated API
boundaries returning `401` with private no-store caching when called
anonymously. The Licensing job remains scheduled for Monday and Wednesday with
`LICENSING_ALERT_NOTIFICATIONS_ENABLED=false`; the alert Logic App remains
disabled, and no Licensing email was sent.

### Admissions mobile mode release — 2026-10-04

Admissions now has a dedicated phone reading path across Briefing and Pipeline:
touch-safe dashboard tabs, wrapping schedule detail, collapsible open-field
records, bounded mobile Pipeline lists, compact card facts, and a safe-area-aware
management chart.

- source commit: `b21ea49`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/148`
- image tag: `alamo-platform:admissions-mobile-b21ea49`
- image digest: `sha256:9fa7c3337eccb9da963a87b982c024db69833bb1b828b881b5523d56569f76d8`
- active revision: `alamo-platform-prod-web--admissions-mobile-1004`
- rollback digest: `sha256:31b1ac20f887ede11d8505c09f7bb2d6924e426777d96209901b44d594f40f70`

This is a frontend-only overlay on the preceding production digest. The release
passed the live Azure-snapshot and Pipeline browser suite at 320, 375, 390, and
430 pixel portrait widths and 667-by-375 landscape, including touch targets,
horizontal overflow, modal bounds, disclosure behavior, and offline recovery.
Post-promotion verification confirmed a healthy revision with one ready replica
and 100% traffic, 4/4 public route probes, one shared current asset bundle on
`/`, `/admissions`, and `/chat`, exact production-to-build JS/CSS hashes, and the
anonymous API boundary returning `401` with `private, no-store` caching.

### Admissions board release — 2026-09-26

The compact Admissions workflow board is deployed as a frontend-only release:

- source commit: `348e96e`
- image tag: `alamo-platform:admissions-board-348e96e`
- image digest: `sha256:5f69353518b7c653062b80c6575a4cb2a0f80052e4ce6bfc2925ef90ec729132`
- active revision: `alamo-platform-prod-web--admissions-board-0926`
- rollback digest: `sha256:abd325d6a2dcb05837932ce77eedabd1d90fcaddbfe8539827cfd933a8553e15`

The release overlays `/app/dist` on the preceding production digest. It does
not replace the server, API, environment, or Pipeline feed configuration.
Post-promotion verification confirmed a healthy revision at 100% traffic,
4/4 public smoke probes, and a connected live Admissions payload with 21 of 21
board cards, five communities, and portfolio census 541.

### Admissions client identity release — 2026-09-26

The authenticated Admissions board now carries and displays the actual client
name from Pipeline. This is an intentional PHI-bearing server-to-server
contract inside the existing protected Platform boundary; deployment checks
must report name coverage by count and must not print names.

Pipeline producer:

- source commit: `58ddaf0874e966673156042df262656255ac7c7e`
- source PR: `https://github.com/3wilsoneric/pipeline-app/pull/209`
- image digest: `sha256:fdbdaad81a9babcab2e3477fe1274f72d45a3d4f4dd6ae36798bcbb03d8e2a3e`
- active revision: `pipeline-prod-web--58ddaf0874e96667`

Platform consumer:

- source commit: `8b3cce2`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/2`
- image tag: `alamo-platform:admissions-identity-8b3cce2`
- image digest: `sha256:9e58125439ee4e070bc17fab2cf5719081cea97186f23e6d70214da35742ffb3`
- active revision: `alamo-platform-prod-web--admissions-identity-0926`
- rollback digest: `sha256:5f69353518b7c653062b80c6575a4cb2a0f80052e4ce6bfc2925ef90ec729132`

The Platform release uses `Dockerfile.admissions-identity-release` to replace
the reviewed browser bundle and the Pipeline summary normalizer on the exact
preceding production digest. Post-promotion verification confirmed healthy
Pipeline and Platform revisions at 100% traffic, contract version 2.1, 21 of
21 board cards with non-empty client names, five communities, portfolio census
541, the desktop/mobile Admissions browser regression, and 4/4 public smoke
probes.

### Admissions progress review release — 2026-09-26

The Admissions board is now a self-contained analyst update. Its section tabs
use a quiet underline treatment, visible Pipeline links are removed, and every
client card opens a responsive progress modal with workflow stage, next action,
assignment, timing, planned admission, priority, and current review flags.

- source commit: `e5849bb`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/3`
- image tag: `alamo-platform:admissions-progress-e5849bb`
- image digest: `sha256:1fb96dc2fbc4de25e503b8f47248153b107ac979a94476e7dfcb34b25944b05e`
- active revision: `alamo-platform-prod-web--admissions-progress-0926`
- rollback digest: `sha256:9e58125439ee4e070bc17fab2cf5719081cea97186f23e6d70214da35742ffb3`

This is a frontend-only overlay on the preceding production digest.
Post-promotion verification confirmed a healthy revision at 100% traffic, a
connected payload with 21 of 21 named cards, five communities, portfolio census
541, the responsive desktop/mobile progress-modal regression, the absence of
the former Pipeline control in the deployed bundle, and 4/4 public smoke
probes.

### Admissions executive update release — 2026-09-26

The Board view now opens with one live executive paragraph derived from the
governed referral summary. It reports active workload, stage distribution,
the three busiest communities, and the current exception load in the voice of
an admissions coordinator briefing leadership.

- source commit: `7aa2ac7`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/4`
- image tag: `alamo-platform:admissions-executive-7aa2ac7`
- image digest: `sha256:507e93f00abb513e72e48810a2f687b2445c4077ce9fac548bca61104ba46ac8`
- active revision: `alamo-platform-prod-web--admissions-executive-0926`
- rollback digest: `sha256:1fb96dc2fbc4de25e503b8f47248153b107ac979a94476e7dfcb34b25944b05e`

This is a frontend-only overlay on the preceding production digest.
Post-promotion verification confirmed a healthy revision at 100% traffic, the
executive update and progress modal in the deployed bundle, no visible Pipeline
control, a connected payload with 21 of 21 named cards, and 4/4 public smoke
probes.

### Admissions canvas alignment release — 2026-09-26

The Admissions page canvas now uses the same white background as the main Home
surface while preserving workflow-column and card colors.

- source commit: `0faa171`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/5`
- image tag: `alamo-platform:admissions-canvas-0faa171`
- image digest: `sha256:02d025953096a7b0c7fdfb5f351b3cb9a0d6cb92d123288e301800a58d50d6e6`
- active revision: `alamo-platform-prod-web--admissions-canvas-0926`
- rollback digest: `sha256:507e93f00abb513e72e48810a2f687b2445c4077ce9fac548bca61104ba46ac8`

This is a frontend-only overlay. Post-promotion verification confirmed a
healthy revision at 100% traffic, matching computed Home and Admissions canvas
colors in desktop/mobile browser QA, a connected payload with 21 of 21 named
cards, and 4/4 public smoke probes.

### Admissions executive briefing format release — 2026-09-26

The live executive paragraph now separates workload, community concentration,
and immediate follow-up into three scannable lines. Selective semibold emphasis
creates reading hierarchy, and community loads use natural language instead of
parenthetical counts.

- source commit: `5c6927a`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/6`
- image tag: `alamo-platform:admissions-executive-format-5c6927a`
- image digest: `sha256:8e6b3b5d7af56d3b9fe932947804630fb7409184602f00c4409afaf54c875808`
- active revision: `alamo-platform-prod-web--admissions-format-0926`
- rollback digest: `sha256:02d025953096a7b0c7fdfb5f351b3cb9a0d6cb92d123288e301800a58d50d6e6`

This is a frontend-only overlay. Post-promotion verification confirmed a
healthy revision at 100% traffic, the desktop/mobile formatting regression, a
connected payload with 21 of 21 named cards, five communities, portfolio census
541, and 4/4 public smoke probes.

### Admissions community pills release — 2026-09-26

Community is now the Board's only filter. The former community and status
dropdowns, attention filter, and Clear control are replaced by responsive
community pills. Multiple communities can remain selected together, and All
communities resets the full board.

- source commit: `41dc177`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/7`
- image tag: `alamo-platform:admissions-community-pills-41dc177`
- image digest: `sha256:512ae688013f991080215dedfae1a738e1b15081b5137695edde3418c5195f59`
- active revision: `alamo-platform-prod-web--admissions-pills-0926`
- rollback digest: `sha256:8e6b3b5d7af56d3b9fe932947804630fb7409184602f00c4409afaf54c875808`

This is a frontend-only overlay. Post-promotion verification confirmed a
healthy revision at 100% traffic, additive multi-community selection and reset
behavior in desktop/mobile browser QA, a connected payload with 21 of 21 named
cards, five communities, portfolio census 541, and 4/4 public smoke probes.

### Admissions referral chart release — 2026-09-26

Opening an Admissions client now presents the governed referral summary as a
Pipeline-inspired chart in a manila folder frame. The white chart sheet orders
identity, next action, referral facts, workflow progress, and review focus for
fast operational review on desktop and mobile. No clinical fields or additional
Pipeline data were added to the bounded Platform summary.

- source commit: `814c68e`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/8`
- image tag: `alamo-platform:admissions-chart-folder-814c68e`
- image digest: `sha256:69bf936c2cf79f398b3b1fb931a5aaaef1418dead54c40833e4718d4cb4e1a7f`
- active revision: `alamo-platform-prod-web--admissions-chart-0927`
- rollback digest: `sha256:512ae688013f991080215dedfae1a738e1b15081b5137695edde3418c5195f59`

This is a frontend-only overlay. Post-promotion verification confirmed a
healthy revision at 100% traffic, the desktop/mobile chart-folder visual and
overflow checks, the expected folder treatment in the production bundle, a
connected payload with 21 of 21 named cards, five communities, portfolio census
541, and 4/4 public smoke probes.

### Admissions management chart release — 2026-09-26

The client folder now opens as a larger management chart. Its folder tab is the
client name, and the chart adds client and placement facts, signed-assessment
overview and support items, medication handoff, admission readiness, workflow
progress, workflow details, and review focus. Narrative assessment data is
included only from a signed assessment; unsigned narrative, contacts,
documents, raw notes, and extraction evidence remain outside the Platform
summary contract.

Pipeline producer:

- source commit: `71896caf`
- source PR: `https://github.com/3wilsoneric/pipeline-app/pull/210`
- active revision: `pipeline-prod-web--b39c377c21d11ae9`
- contract version: `3.0`

Platform consumer:

- source commit: `33a14c1`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/9`
- image tag: `alamo-platform:admissions-management-auth-a0a9e14`
- image digest: `sha256:c25f70d4c2dfba2158e51960c2e99ee3ac7d6207ce789e9ee0ff1cff0fadc29d`
- active revision: `alamo-platform-prod-web--admissions-mgmt-auth-0927`
- rollback digest: `sha256:69bf936c2cf79f398b3b1fb931a5aaaef1418dead54c40833e4718d4cb4e1a7f`

The release replaces the browser bundle and Pipeline summary normalizer on the
preceding known-good runtime. The browser bundle was built with the production
`VITE_ENTRA_*` public configuration before image promotion. Post-promotion
verification confirmed a healthy single active revision at 100% traffic, 4/4
public smoke probes, 21 named admissions with management profiles, six signed
assessment profiles, client-name tab identity, nine chart sections, and no
horizontal overflow at a 390-pixel viewport.

### Admissions decision tabs release — 2026-09-26

The management chart is expanded to 1240 pixels on desktop. Its client name is
now isolated on a larger white folder label beside a decision tab: green
`Accept`, red `Deny`, or yellow `Under review`. Accepted, awaiting-admit, and
Meet-the-Client-pending statuses map to `Accept`; declined or denied statuses
map to `Deny`; all earlier workflow states map to `Under review`.

- source commit: `0accb73`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/11`
- image tag: `alamo-platform:admissions-decision-tabs-44e0ecb`
- image digest: `sha256:08521d6ce65ea83c0d92506cbaa5fd9fb9f46aa9e75e96fe749f67ce78f2ca9b`
- active revision: `alamo-platform-prod-web--admissions-tabs-0927`
- rollback digest: `sha256:c25f70d4c2dfba2158e51960c2e99ee3ac7d6207ce789e9ee0ff1cff0fadc29d`

Post-promotion verification confirmed a healthy single active revision at 100%
traffic, 4/4 public smoke probes, correct client-name identity across all 21
live cards, correct live mapping for six accepted and 15 under-review cards,
synthetic coverage for the deny state, and no horizontal overflow at a
390-pixel viewport.

### Admissions folder refinement release — 2026-09-26

The chart now opens directly on the operational content without the redundant
management-review title block. The folder and name tab use pale manila stock,
and the client name sits on an inset off-white paper label inside the tab. The
separate decision tab and all management-chart content remain unchanged.

- source commit: `337e615`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/13`
- image tag: `alamo-platform:admissions-folder-d1ebbdb`
- image digest: `sha256:d6dc6d4518bdeb40c29c04be02c59fd95adc4f766a56ae642dc6329732850f09`
- active revision: `alamo-platform-prod-web--admissions-folder-0927`
- rollback digest: `sha256:08521d6ce65ea83c0d92506cbaa5fd9fb9f46aa9e75e96fe749f67ce78f2ca9b`

Post-promotion verification confirmed a healthy single active revision at 100%
traffic, 4/4 public smoke probes, the intended production folder and label
colors, removal of the old title block, and no horizontal overflow at a
390-pixel viewport.

### Admissions folder viewport cap — 2026-09-26

The entire management folder, including its tabs, now remains inside the
visible browser viewport. The outer folder keeps an 8-pixel mobile margin and a
24-pixel desktop margin; long chart content scrolls inside the paper instead of
extending the folder beyond the page.

- source commit: `905abca`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/15`
- image tag: `alamo-platform:admissions-folder-cap-e01f159`
- image digest: `sha256:7ceabdf89a2e947f53b50a85d96bd0f481a88ce844aa2b2ed4e71988839d79c1`
- active revision: `alamo-platform-prod-web--admissions-folder-cap-0927`
- rollback digest: `sha256:d6dc6d4518bdeb40c29c04be02c59fd95adc4f766a56ae642dc6329732850f09`

Production browser verification measured the desktop folder from 24 to 675 in
a 699-pixel viewport and the mobile folder from 8 to 836 in an 844-pixel
viewport. The mobile chart scrolls internally with zero horizontal overflow.
The release also passed all four public production smoke probes.

### Admissions analyst response release — 2026-09-26

The Board's governed executive update now reads as an Admissions analyst
response instead of a bordered report paragraph. A compact analyst identity,
soft response surface, selective emphasis, and a short staged reveal preserve
the same workload, community, and follow-up facts while making the update feel
generated and conversational. Reduced-motion users receive the complete answer
immediately. A scoped theme rule preserves the 16-pixel response radius without
changing the Platform's sharper treatment elsewhere.

- source commits: `1d12635`, `f5c87e6`, `2e1afd3`
- source PRs: `https://github.com/3wilsoneric/alamo-platform-app/pull/17`, `https://github.com/3wilsoneric/alamo-platform-app/pull/18`, `https://github.com/3wilsoneric/alamo-platform-app/pull/19`
- image tag: `alamo-platform:admissions-chat-theme-2e1afd3`
- image digest: `sha256:eb55e1cb950de372a2215653a4f6dd5473e7509b50d1e68ff378d5460141403d`
- active revision: `alamo-platform-prod-web--admissions-chat-theme-0927`
- rollback digest: `sha256:e71b3bd4a2b441aafb1bab898ff6bd2c1ab81faea443fa9cd127ad20e9a1ef6c`

Production browser verification confirmed the staged reveal completes, the
three formatted lines and analyst mark remain visible, the old left border is
absent, the response retains its intended background and radius, and the page
has zero horizontal overflow at a 390-pixel viewport. The release is healthy at
100% traffic and passed all four public production smoke probes.

### Admissions attention-label removal — 2026-09-26

The Admissions overview no longer turns Pipeline timing flags into management
judgments. Automated `Update overdue`, `Move-in overdue`, `No owner`, `Needs
follow-up`, and `Immediate follow-up` labels are absent from the board, list,
client chart, and analyst response. Factual workflow status, owner, next action,
days open, last update, and planned admission remain available.

- source commit: `6d06456`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/21`
- image tag: `alamo-platform:admissions-no-attention-6d06456`
- image digest: `sha256:0a2184a1b74f856e82c1ba53ebfd9ef0370122e504dff70b11988f7cd0793a5a`
- active revision: `alamo-platform-prod-web--admissions-no-attention-0927`
- rollback digest: `sha256:eb55e1cb950de372a2215653a4f6dd5473e7509b50d1e68ff378d5460141403d`

Post-promotion verification confirmed the removed labels are absent from the
deployed browser bundle, the retained analyst response content is present, the
single active revision is healthy at 100% traffic, and all four public
production smoke probes pass.

### Admissions view-selection release — 2026-09-26

The Board/List control no longer sits inside a gray segmented tray. Only the
current view receives an Alamo-green surface and text treatment; the inactive
view remains transparent. Both labels remain visible at phone width.

- source commit: `bd374bf`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/23`
- image tag: `alamo-platform:admissions-view-bd374bf`
- image digest: `sha256:121a0ff2216a9298e4fa7a99fcfc76b67924d35e9389be4e7afac1f13498cbe0`
- active revision: `alamo-platform-prod-web--admissions-view-0927`
- rollback digest: `sha256:0a2184a1b74f856e82c1ba53ebfd9ef0370122e504dff70b11988f7cd0793a5a`

Post-promotion verification confirmed the active-view treatment in the
deployed browser bundle, a healthy single revision at 100% traffic, and all
four public production smoke probes.

### Admissions modal dismissal release — 2026-09-26

The Admissions management chart no longer includes a redundant full-width
`Done` action. Users dismiss the chart with the corner close control, by
clicking the surrounding backdrop, or with Escape. The chart content and
Pipeline data contract are unchanged.

- source commit: `e14f666`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/25`
- image tag: `alamo-platform:admissions-modal-dismiss-e14f666`
- image digest: `sha256:01b1d9fa953fb72797b1292808378b10bb534bb8fd2670be139a13c7a65c532c`
- active revision: `alamo-platform-prod-web--admissions-dismiss-0927`
- rollback digest: `sha256:121a0ff2216a9298e4fa7a99fcfc76b67924d35e9389be4e7afac1f13498cbe0`

Post-promotion verification confirmed the exact production browser asset,
a healthy single revision at 100% traffic, and all four public production
smoke probes. TypeScript, the deterministic Admissions dashboard check, and
the production browser build also pass.

### Admissions chart streamlining release — 2026-09-26

The client management chart now follows one vertical reading path instead of
splitting facts across two competing dashboard columns. Four deliberate
sections cover the next action, admission brief, workflow and readiness, and
signed client context. Flat chart rows replace the former fact-card grids while
preserving placement, referral, payer, owner, timing, assessment, requirement,
support, and medication information.

- source commit: `579203f`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/27`
- image tag: `alamo-platform:admissions-chart-streamline-579203f`
- image digest: `sha256:8519eb08dc81c02eb18a0dba174fe9c70c2d4e59f733ac732ac26022227fafe8`
- active revision: `alamo-platform-prod-web--admissions-streamline-0927`
- rollback digest: `sha256:01b1d9fa953fb72797b1292808378b10bb534bb8fd2670be139a13c7a65c532c`

Post-promotion verification confirmed the exact production browser asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and phone renders contained one chart stream,
four sections, and no horizontal overflow.

### Admissions executive card release — 2026-09-26

The Admissions Board and List now present each referral as an executive
briefing rather than an operator task card. Raw workflow instructions such as
`Continue preparation` are no longer shown. Each referral surfaces its
decision, stage, accountable owner, time open and update freshness, planned
admission, and an evidence-based readiness summary. The detailed chart also
reframes its former next-action callout as `Current management focus`.

- source commit: `6ca694c`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/29`
- image tag: `alamo-platform:admissions-ceo-cards-6ca694c`
- image digest: `sha256:d0359b87e5ef9bba5dfa286a8923cd86e68c162873752f9c449b6dedcf4dea20`
- active revision: `alamo-platform-prod-web--admissions-ceo-cards-0927`
- rollback digest: `sha256:8519eb08dc81c02eb18a0dba174fe9c70c2d4e59f733ac732ac26022227fafe8`

Post-promotion verification confirmed the exact production browser asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and phone renders showed the executive fields,
excluded raw workflow-action copy, and had no horizontal overflow.

### Admissions navigation release — 2026-09-26

Admissions now appears directly below Analytics in the shared desktop and
phone navigation for identities that pass the existing Admissions access
decision. The destination remains absent for identities without an Admissions
role, and opens the native `/admissions` overview without changing API, data,
or authentication configuration.

- source commit: `255f742`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/31`
- image tag: `alamo-platform:admissions-nav-255f742`
- image digest: `sha256:e933cfde2251be9582d47303a9b35b3d1e0d90df6f58b84adc323c3911933bfe`
- active revision: `alamo-platform-prod-web--admissions-nav-0927`
- rollback digest: `sha256:d0359b87e5ef9bba5dfa286a8923cd86e68c162873752f9c449b6dedcf4dea20`

Post-promotion verification confirmed the exact production browser asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and 390-pixel renders placed Admissions below
Analytics, opened `/admissions`, and had no horizontal overflow.

### Admissions navigation access correction — 2026-09-26

The Admissions destination is now shown below Analytics for every authenticated
Platform identity. Admissions-specific roles continue to constrain assessor-only
identities but no longer act as a second navigation entitlement for normal
Platform users. The release bundle was rebuilt with the required browser-safe
Entra client and tenant values after an unconfigured intermediate bundle was
detected and rolled back.

- source commit: `3ac46d5`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/33`
- image tag: `alamo-platform:admissions-nav-auth-3ac46d5`
- image digest: `sha256:1e8c4d9295e091f118e7d079fa6919a92eaab7027a6ffc07052e30aa5919a737`
- active revision: `alamo-platform-prod-web--admissions-nav-auth-0927`
- rollback digest: `sha256:d0359b87e5ef9bba5dfa286a8923cd86e68c162873752f9c449b6dedcf4dea20`

Post-promotion verification confirmed the exact configured production asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. A fresh load in the owner's signed-in Chrome session showed no
authentication setup error, placed Admissions below Analytics, and opened the
native `/admissions` overview from that menu item.

### Admissions decision-color refinement — 2026-09-27

Admissions decision labels now use a more legible executive palette across
Board cards, List rows, and management-chart folder tabs. `Accept` uses a
deeper Alamo green with white text, while `Under review` uses a warmer gold
with dark text and a defined gold border. No decision logic, source data, or
workflow behavior changed.

- source commit: `37c0f94`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/35`
- image tag: `alamo-platform:admissions-decision-colors-37c0f94`
- image digest: `sha256:28b7f08d72a68da6a1e47997eaf689ea3937e20429239a7a78e3c28279acd755`
- active revision: `alamo-platform-prod-web--admissions-colors-0927`
- rollback digest: `sha256:1e8c4d9295e091f118e7d079fa6919a92eaab7027a6ffc07052e30aa5919a737`

Post-promotion verification confirmed the exact configured production asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and 390-pixel checks verified the label and folder
tab colors without horizontal overflow. A fresh load in the owner's signed-in
Chrome session confirmed six visible `Accept` labels with white text and fifteen
visible `Under review` labels with the new gold treatment.

### Admissions streamed executive briefing — 2026-09-27

The Admissions analyst briefing now renders as a progressive character stream
at a conversational response pace instead of revealing complete lines at once.
Accepted clients lead the response, with clients carrying planned admission
dates ordered first and their destination communities and dates shown inline.
The workload and community summaries follow after that client rollup. Reduced-
motion preferences continue to reveal the complete response immediately.

- source commit: `df983ed`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/37`
- image tag: `alamo-platform:admissions-streamed-briefing-df983ed`
- image digest: `sha256:16c8de1f4be9fa83403eaf0c5bf14368a33d4fad49a8012a44e69e80cf2736f1`
- active revision: `alamo-platform-prod-web--admissions-stream-0927`
- rollback digest: `sha256:28b7f08d72a68da6a1e47997eaf689ea3937e20429239a7a78e3c28279acd755`

Post-promotion verification confirmed the exact configured production asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and 390-pixel checks verified progressive text,
accepted-client ordering, stream completion, zero horizontal overflow, and final
caret removal. A fresh load in the owner's signed-in Chrome session confirmed
the response remained in the composing state while its visible text grew, then
finished with all six live accepted clients in the leading paragraph, no
authentication setup error, and no horizontal overflow.

### Admissions Analytics-navigation placement — 2026-09-27

The Admissions page-level navigation now keeps Home on the left and places
Analytics at the far right of the header. The same alignment is preserved at
desktop and mobile widths; navigation destinations and access rules are
unchanged.

- source commit: `a573838`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/39`
- image tag: `alamo-platform:admissions-analytics-right-a573838`
- image digest: `sha256:1a441d5e6f166e1b38ffddbdeb00ff9443901d79717c2de9607024d04b6c5430`
- active revision: `alamo-platform-prod-web--admissions-nav-right-0927`
- rollback digest: `sha256:16c8de1f4be9fa83403eaf0c5bf14368a33d4fad49a8012a44e69e80cf2736f1`

The frontend-only release was rebuilt over the stable runtime image
`sha256:1e8c4d9295e091f118e7d079fa6919a92eaab7027a6ffc07052e30aa5919a737`
to collapse accumulated frontend layers after the registry reached its maximum
image depth; backend behavior was unchanged. Post-promotion verification
confirmed the exact tested production JavaScript asset, one active revision at
100% traffic, and all four public production smoke probes. Deterministic desktop
and 390-pixel Admissions checks verified right-side placement without overflow.
A fresh load in the owner's signed-in Chrome session confirmed Analytics on the
right side of `/admissions` with no authentication setup error.

### Admissions explicit review-status correction — 2026-09-27

Admissions now displays `Under review` only when Pipeline explicitly reports
that status. Accepted and denied status mappings are unchanged; every other
undecided workflow status now displays as `In progress` with a blue treatment
instead of being inferred as a yellow review decision.

- source commit: `cf5ac4d`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/41`
- image tag: `alamo-platform:admissions-explicit-review-cf5ac4d`
- image digest: `sha256:27078ece1f18465312cc3ef725e25b536b75062c737f055507509cd88b6edc6e`
- active revision: `alamo-platform-prod-web--admissions-review-status-0927`
- rollback digest: `sha256:1a441d5e6f166e1b38ffddbdeb00ff9443901d79717c2de9607024d04b6c5430`

Post-promotion verification confirmed the exact configured production asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and 390-pixel browser checks covered both an
ordinary in-progress record and an explicit Pipeline `Under Review` record. A
fresh load in the owner's signed-in Chrome session confirmed all 21 live cards
matched their source statuses: six accepted, 15 in progress, zero incorrectly
inferred as under review, and no authentication setup error.

### Admissions in-progress contrast correction — 2026-09-27

The blue `In progress` category now forces white text in every Admissions
surface so surrounding card, table, or modal styles cannot reduce its contrast.

- source commit: `2908814`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/43`
- image tag: `alamo-platform:admissions-in-progress-white-2908814`
- image digest: `sha256:30beb8bcead8e7e817e0261faed877d0730bc709cb6453817e6b3497dcd21060`
- active revision: `alamo-platform-prod-web--progress-white-0927`
- rollback digest: `sha256:27078ece1f18465312cc3ef725e25b536b75062c737f055507509cd88b6edc6e`

Post-promotion verification confirmed the exact configured production asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. A fresh load in the owner's signed-in Chrome session confirmed all 15
visible `In progress` labels computed to pure white text.

### Admissions client-chart drill-downs — 2026-09-27

The three summary bands inside each Admissions management chart are now
interactive. `Admission brief` opens status provenance, placement, and referral
origin; `Workflow and readiness` opens ownership, timing, and requirement
readiness; and `Client context` opens the bounded assessment overview, care and
support snapshot, and medication handoff. The detail remains inside the existing
folder chart, keeps the client name and decision tab visible, and does not expose
raw Pipeline notes or documents.

- source commit: `635e467`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/45`
- image tag: `alamo-platform:admissions-chart-drilldowns-635e467`
- image digest: `sha256:8bb15245c20ac250b5c25dc4fef4ff4d475d19665bc80545b054ec8baa50bf61`
- active revision: `alamo-platform-prod-web--chart-drilldowns-0927`
- rollback digest: `sha256:30beb8bcead8e7e817e0261faed877d0730bc709cb6453817e6b3497dcd21060`

This frontend-only release was rebuilt over the stable runtime image
`sha256:1e8c4d9295e091f118e7d079fa6919a92eaab7027a6ffc07052e30aa5919a737`;
the backend and Pipeline feed contract did not change. TypeScript, JavaScript
lint, docs, the Admissions dashboard check, the production-configured build,
and deterministic desktop and 390-pixel browser coverage passed before
promotion. Post-promotion verification confirmed the exact JavaScript asset,
a healthy single revision at 100% traffic, and all four public smoke probes. A
signed-in production check opened all three chart drill-downs against the live
21-card feed with no horizontal overflow, raw-document links, or browser errors.

### Admissions data-row drill-down correction — 2026-09-27

The chart-level drill-down sheets were replaced with direct, in-place
disclosure on the existing management-chart rows. Status, placement, referral
origin, coverage, client details, ownership and timing, assessment, documents,
and requirements now expand into their underlying source fields. Only one row
opens at a time; client context stays directly readable in the chart. This also
corrects the mobile reading order and keeps the disclosure control to the right
of each left-aligned label and value.

- source commit: `c395211`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/47`
- image tag: `alamo-platform:admissions-inline-drilldowns-c395211`
- image digest: `sha256:049f7e365d29ded864c86f6ffbac9798964392e021f7cb4ac5e1d737e15cd99a`
- active revision: `alamo-platform-prod-web--inline-drill-0927`
- rollback digest: `sha256:8bb15245c20ac250b5c25dc4fef4ff4d475d19665bc80545b054ec8baa50bf61`

This frontend-only correction used the existing stable runtime and did not
change the backend or Pipeline feed contract. TypeScript, JavaScript lint,
documentation, the Admissions dashboard check, the production-configured
build, and deterministic desktop and 390-pixel browser coverage passed before
promotion. Post-promotion verification confirmed the exact JavaScript asset, a
healthy single revision at 100% traffic, and all four public smoke probes. A
signed-in production check found all nine row controls on the live 21-card feed,
expanded placement and assessment in place, kept one detail open at a time,
and reported no horizontal overflow, legacy drill-down overlays, or browser
errors.

### Admissions mobile category navigation — 2026-09-28

The Admissions workspace now uses a category-first list on phone and tablet
widths instead of compressing the desktop board. `Referral received`,
`In progress`, `Decision`, `Census`, and `Trends` form the mobile navigation;
the selected pipeline category renders its client list and each client opens
the existing management chart. Community filters stay in one horizontally
scrollable row. Desktop retains the board/list controls and centers the
`Board`, `Census`, and `Trends` navigation.

- source commit: `024409e`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/49`
- image tag: `alamo-platform:admissions-mobile-lists-024409e`
- image digest: `sha256:cf66502c8155f201b5b3776c18d9e17db8fed29f23544494846f8070c46dce30`
- active revision: `alamo-platform-prod-web--mobile-lists-0928`
- rollback digest: `sha256:049f7e365d29ded864c86f6ffbac9798964392e021f7cb4ac5e1d737e15cd99a`

This frontend-only release used the exact preceding production image as its
base, so the backend, Pipeline feed contract, environment, and secrets did not
change. TypeScript, the Admissions dashboard check, a production-configured
build, and deterministic responsive coverage at 320, 390, 768, and 1024 pixels
passed before promotion. Connected-feed fixture coverage confirmed category
selection, client lists, the management-chart modal, one-row community filters,
and no page or modal overflow at 390 and 768 pixels. Post-promotion verification
confirmed the exact JavaScript and CSS assets, a healthy single revision at
100% traffic, and all four public production smoke probes.

### Analytics Monday-briefing removal — 2026-09-28

The Monday census briefing is no longer presented as an Analytics report on
desktop or mobile. Analytics now contains only the five finished governed
report families. The separate scheduled Monday census email workflow remains
available and was not changed.

- source commit: `0828abf`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/51`
- release-tooling commit: `850e3fd`
- release-tooling PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/52`
- image tag: `alamo-platform:reports-no-monday-0828abf`
- image digest: `sha256:9ee73ecb35a542b4a52f717c59645fd197c7df5f1e685ee58c39f4c4edbe8382`
- active revision: `alamo-platform-prod-web--reports-no-monday-0928`
- rollback digest: `sha256:cf66502c8155f201b5b3776c18d9e17db8fed29f23544494846f8070c46dce30`

The frontend release Dockerfile was reduced to one filesystem layer after the
original overlay attempt reached the inherited image-depth limit. The successful
release still uses the exact preceding production image as its runtime base and
changes only the browser bundle. TypeScript, the report contract check,
documentation, a production-configured build, and the complete desktop/mobile
report browser regression passed before promotion. Post-promotion verification
confirmed the exact JavaScript and CSS assets, absence of the removed report
label in the live bundle, a healthy revision at 100% traffic, and all four
public production smoke probes.

### Analytics text navigation release — 2026-09-28

The Analytics workspace switcher is now a quiet text row at the upper right.
`Reports` and `Ask a question` sit directly beside one another with no tray or
icons; only the current destination receives a light green outlined box. The
desktop placement reserves space for the separate Admissions destination, and
the same selected-state treatment remains legible without horizontal overflow
on phone widths.

- source commit: `9145330`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/54`
- release-tooling commit: `5da22a3`
- release-tooling PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/55`
- image tag: `alamo-platform:analytics-text-nav-9145330`
- image digest: `sha256:35916d7d19fac583b623defe7c17d717c319436e37e28ed7f88c98f9fb0212c2`
- active revision: `alamo-platform-prod-web--analytics-text-nav-0928`
- rollback digest: `sha256:9ee73ecb35a542b4a52f717c59645fd197c7df5f1e685ee58c39f4c4edbe8382`

The release rebased the exact proven production filesystem into a fresh image
after inherited frontend overlays reached the registry depth ceiling. Runtime
configuration was preserved exactly while filesystem layers were reduced from
125 to two. TypeScript, the California Home contract check, documentation, a
production-configured build, the full report browser regression, and responsive
desktop, phone, tablet, and ultrawide visual checks passed before promotion.
Post-promotion verification confirmed the exact JavaScript and CSS assets, a
healthy revision at 100% traffic, and all four public production smoke probes.

### Primary Platform text navigation correction — 2026-09-28

The preceding text-only treatment was corrected to apply to the primary
`Analytics` and `Admissions` destinations, not the Analytics workspace
switcher. Those primary destinations now remain beside one another at the upper
right without arrows, and the active page receives a light green outlined box.
The Alamo home anchor remains at the upper left. `Reports` and `Ask a question`
were restored to their bordered Analytics control and positioned independently
so neither navigation overlaps from phone through ultrawide widths.

- source commit: `c245bcf`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/57`
- image tag: `alamo-platform:primary-text-nav-c245bcf`
- image digest: `sha256:d93329474498a735d53c18214034eeca777b0d272fe65eba930bc312ff613763`
- active revision: `alamo-platform-prod-web--primary-text-nav-0928`
- rollback digest: `sha256:35916d7d19fac583b623defe7c17d717c319436e37e28ed7f88c98f9fb0212c2`

This frontend-only release adds one browser-bundle layer to the flattened
runtime and does not change the server, API, environment, or data adapters.
TypeScript, the California Home contract, documentation, the
production-configured build, full report coverage, Admissions dashboard
contracts, and responsive browser coverage from phone through ultrawide passed
before promotion. Desktop and mobile visual checks also confirmed the active
Analytics and Admissions states. Post-promotion verification confirmed the
exact JavaScript and CSS assets, a healthy revision at 100% traffic, and all
four public production smoke probes.

## Local Development

Install and run:

```bash
cd /Users/eric/CareEngineMain/alamo-platform-app
npm install
npm run dev:all
```

Ports:

- Vite frontend: `http://localhost:3001`
- local API server: `http://localhost:3002`
- Vite proxies `/api` to port `3002`
- The local API accepts loopback-only browser origins (`localhost`,
  `127.0.0.1`, and `[::1]`) on any port so isolated QA servers remain usable.
  Use the comma-separated `DEV_API_ALLOWED_ORIGINS` override to restrict this
  to an explicit local origin list.

Useful separate commands:

```bash
npm run dev
npm run dev:api
npm run snapshot:generate
npm run snapshot:publish
npm run build
```

## Production Build

```bash
cd /Users/eric/CareEngineMain/alamo-platform-app
npm run build
```

Build behavior:

- `npm run build` only runs the Vite production build.
- It does not generate or publish platform snapshots.
- Production runtime requires Azure snapshot storage and fails closed when its
  credentials are incomplete, its latest blob is missing, or its read fails.
- Local generated snapshot is a development-only fallback. It is never used to
  conceal an Azure production outage.
- `npm run snapshot:generate` writes a local fallback snapshot only.
- `npm run snapshot:publish` is an explicit escape hatch that can publish a
  locally generated snapshot to Azure; do not use it for the normal daily data
  pipeline because the Databricks `snapshot_publish` notebook owns the governed
  tool-context snapshot.
- App-side Azure publishing refuses to publish an empty analyst `toolContext`
  unless `PLATFORM_SNAPSHOT_ALLOW_EMPTY_TOOL_CONTEXT=true` is set for an
  intentional emergency override.

## Frontend Auth Variables

Browser-safe Entra variables:

- `VITE_ENTRA_CLIENT_ID`
- `VITE_ENTRA_TENANT_ID`
- `VITE_ENTRA_API_SCOPE` optional override; defaults to `api://<client-id>/access_as_user`
- `VITE_API_AUTH_REQUIRED` optional local-development opt-in; production builds always require API auth

If the first two are missing, the protected shell shows an authentication setup
message instead of rendering the app.

The browser callback is always `<current-origin>/login`; it is not configurable.
For production, register `https://www.alamoplatform.com/login` as a **Single-page
application** redirect URI in Entra. The registered URI must match the canonical
browser origin exactly. The apex domain redirects to `www`, so an apex callback
cannot safely carry the OAuth response.

MSAL also reuses `/login` inside a same-origin hidden frame when it refreshes an
API token. Production security headers therefore allow framing by the same
origin only (`frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`) and allow
both Microsoft and same-origin frame sources. External sites still cannot frame
the platform. Do not restore `frame-ancestors 'none'`, `X-Frame-Options: DENY`,
or a Microsoft-only `frame-src`; those settings let the first sign-in complete
but block the authenticated workspace from acquiring its API token.

## Server Auth Variables

Microsoft/Azure service principal:

- `ENTRA_CLIENT_ID`
- `ENTRA_CLIENT_SECRET`
- `ENTRA_TENANT_ID`

Delegated user API authorization:

- `API_AUTH_REQUIRED` optional local-development override; Vercel preview and production always fail closed
- `ENTRA_API_AUDIENCE` optional override; defaults to `api://<ENTRA_CLIENT_ID>`
- `ENTRA_API_SCOPE` defaults to `access_as_user`
- `ENTRA_API_REQUIRED_ROLE` optional defense in depth; when set, the delegated token must contain this Entra app role

The API validates Microsoft signatures, the configured tenant, audience, scope,
and optional role. It accepts both Entra v1 (`sts.windows.net`) and v2
(`login.microsoftonline.com/.../v2.0`) issuer forms because the app registration's
token version controls which valid issuer Microsoft returns.

The Entra app registration must expose the delegated `access_as_user` scope. A deployment without that scope will show the login UI but API requests will be rejected rather than exposing resident or operational data anonymously.

Before production access is granted, configure the Entra Enterprise Application
with **Assignment required** enabled and assign only approved users or groups.
For an additional server-enforced boundary, define an app role such as
`AlamoPlatform.User`, assign it to the same users or groups, and set
`ENTRA_API_REQUIRED_ROLE=AlamoPlatform.User` in Vercel. Do not set the variable
until the role appears in delegated access tokens; the API rejects tokens that
do not carry it.

Azure snapshot storage:

- `AZURE_STORAGE_ACCOUNT`
- `AZURE_STORAGE_CONTAINER`
- `AZURE_STORAGE_CONNECTION_STRING` optional legacy path
- `SNAPSHOT_ROOT`
- `PLATFORM_SNAPSHOT_MAX_BYTES` defaults to 64 MB. The publisher emits compact,
  tables-only analyst context so the governed snapshot remains below this bound.

Private acquisition storage uses the same Azure account and private container:

- `ACQUISITION_STORAGE_CONTAINER` optionally overrides
  `AZURE_STORAGE_CONTAINER`
- `ACQUISITION_STORAGE_ROOT` defaults to `acquisition-intelligence`
- `ACQUISITION_STORAGE_READ_SOURCE` may force `local` or `azure` for controlled
  verification; production defaults to Azure and fails closed
- `ACQUISITION_STORAGE_CACHE_TTL_MS` defaults to five minutes
- `npm run acquisition:publish:azure` publishes raw source lineage plus the
  validated manifest and compressed facility index
- `ACQUISITION_PUBLISH_RESEARCH_INITIALIZE=true npm run
  acquisition:publish:azure` is a first-use-only initializer; it cannot replace
  an existing production research store

Production research mutations use conditional Blob ETags and retry bounded
conflicts. Successful revisions are archived under the acquisition storage root
so the owner-authored workflow is durable across Azure Container Apps replicas
and Vercel serverless instances. The Azure Container Apps runtime uses its
existing user-assigned managed identity; grant that identity Blob Data
Contributor only on the private snapshot container so it can persist research
without receiving account-wide write access.

Company-level research, hold, and pass decisions are stored separately at
`research/operator-selections-v1.json.gz` with the same owner-only API boundary
and conditional Blob-write protection. Generated proposal refreshes never
overwrite this decision store.

Databricks:

- `DATABRICKS_HOST`
- `DATABRICKS_HTTP_PATH` or `DATABRICKS_SQL_WAREHOUSE_ID`
- `DATABRICKS_CATALOG`
- `DATABRICKS_SCHEMA`
- `DATABRICKS_CLIENT_ID`
- `DATABRICKS_CLIENT_SECRET`

Development-only Databricks fallback:

- `DATABRICKS_TOKEN`
- `ALLOW_DATABRICKS_PAT_IN_DEV=true`

Production should use Databricks OAuth, not PAT fallback.

Anthropic/AH Analyst:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `ANTHROPIC_MAX_TOKENS`
- `ANTHROPIC_TIMEOUT_MS` bounded per-attempt timeout; defaults to 35 seconds
- `ANTHROPIC_MAX_ATTEMPTS` bounded retry count from 1 to 3; defaults to 2
- `COPILOT_ASSISTANT_LABEL`
- `GOVERNED_REPORT_SYNTHESIS_ENABLED`; set `false` to force deterministic one-page report prose

Do not put private API keys in `VITE_*` variables.

Governed report delivery:

- `REPORT_EMAIL_WEBHOOK_URL`: HTTPS-only mail-delivery webhook
- `REPORT_EMAIL_WEBHOOK_SECRET`: Bearer secret checked by the webhook
- `REPORT_EMAIL_ALLOWED_DOMAINS`: comma-separated recipient-domain allowlist
- `REPORT_EMAIL_TIMEOUT_MS`: bounded from 2 to 30 seconds

All three delivery values must be valid before the workspace exposes **Email
to me**. The webhook receives `to`, `subject`, `html`, `filename`, `reportId`,
`audience`, `period`, and `idempotencyKey`. It must reject bad Bearer tokens,
send only to the supplied approved recipients, and deduplicate the
`Idempotency-Key` header.

Weekly briefing delivery:

- `CRON_SECRET`: required by `/api/reports/weekly`; Vercel supplies it to cron requests
- `WEEKLY_BRIEFING_EXECUTIVE_RECIPIENTS`
- `WEEKLY_BRIEFING_OPERATIONS_RECIPIENTS`
- `WEEKLY_BRIEFING_CLINICAL_RECIPIENTS`
- `WEEKLY_BRIEFING_COMMUNITY_RECIPIENTS_JSON`: recipients keyed by facility ID or exact community name
- `WEEKLY_BRIEFING_SCHEDULE_LABEL`: display-only operator label

The schedule itself lives in `vercel.json` and currently runs each Monday.
Plans without recipients are skipped. A failed audience is reported
independently. The cron endpoint returns `503` when any configured plan fails,
allowing a safe retry through idempotent delivery.

## Health Checks

Use these endpoints after deploy or publish from a signed-in platform session
or with an `Authorization: Bearer <access-token>` header. Preview and production
health endpoints are deliberately not public; an anonymous `401` confirms that
the delegated API boundary is fail-closed.

- `/api/platform/health`
- `/api/platform/snapshot-health`
- `/api/platform/snapshot-metadata`
- `/api/platform/analyst-qa`
- `/api/platform/analyst-traces`
- `/api/platform/bootstrap`
- `/api/integrations/pipeline/clinical/health`
- `/api/integrations/pipeline/clinical/census`
- `/api/integrations/pipeline/clinical/roster?limit=1`
- `/api/integrations/pipeline/clinical/medications/summary`
- `/api/communities/dashboard`
- `/api/communities/snapshot?facilityId=337`
- `/api/incidents`
- `/api/chat/claude/health`
- `/api/reports/status`

Interpretation:

- snapshot missing on bootstrap/community endpoints should be a controlled `503`
- snapshot stale should appear in metadata/Command Center, not silently hide
- `/api/incidents` should say whether it returned `live-databricks` or
  `snapshot-fallback`
- analyst QA warning means the app can still run, but at least one tested prompt
  path needs review
- Pipeline clinical health returns `503` for a stale, missing, QA-rejected, or
  incomplete snapshot. Data endpoints may preserve a stale last-known-good
  snapshot only when the response clearly carries stale freshness metadata.

Pipeline clinical integration:

- `PIPELINE_CLINICAL_API_SCOPE`: delegated Entra scope, normally `Pipeline.Clinical.Read`
- `PIPELINE_CLINICAL_API_ROLE`: service application role, normally `Pipeline.Clinical.Read.All`
- `PIPELINE_CLINICAL_SNAPSHOT_MAX_AGE_HOURS`: freshness target, defaults to 24
- `PIPELINE_CLINICAL_API_MAX_RESPONSE_BYTES`: per-response bound, defaults to 2 MB
- `PLATFORM_CLIENT_THUMBNAIL_MAX_BYTES`: private client-thumbnail bound, defaults to 2 MB
- `PLATFORM_CLIENT_DOCUMENT_MAX_BYTES`: private client-preview bound, defaults to 32 MB

Assign the Pipeline service principal the Alamo API application role and grant
tenant admin consent before enabling the Pipeline production adapter. Do not
copy ElderMark, Databricks, Azure snapshot, or Alamo server credentials into a
Pipeline browser variable.

## Common Operator Fixes

Snapshot/tool context is empty:

```text
Run tool_context_views -> analyst_context_qa -> snapshot_publish.
```

Entra login page blocks the app:

```text
Check VITE_ENTRA_CLIENT_ID, VITE_ENTRA_TENANT_ID, and confirm the Entra SPA redirect list contains the exact return address shown on the login page.
```

Databricks 401/secret errors:

```text
Use the client secret value, not the secret ID. Confirm service principal has Databricks/warehouse access.
```

Graph/email 401:

```text
This is separate from platform auth. Mail.Send app permission and mailbox eligibility must be configured.
```

Today's incidents not visible:

```text
Check latest incident detail date, rows dated today, snapshot generated time, and source feed freshness before changing UI.
```

## Vercel Routing

`vercel.json` rewrites nested API paths to single handler files and falls all
non-API routes back to `index.html`. This is why React deep links work even
though Vercel does not have a physical file per route.

It also schedules `/api/reports/weekly`. Changing the human-readable
`WEEKLY_BRIEFING_SCHEDULE_LABEL` does not change the cron; edit the UTC cron in
`vercel.json` when the actual run time changes.

## Security Notes

- Browser never calls Databricks or Claude directly.
- Browser sends a delegated Entra access token to every platform API request.
- Serverless API handlers validate token signature, issuer, audience, and scope before data access.
- When `ENTRA_API_REQUIRED_ROLE` is configured, handlers also require the assigned Entra app role.
- Server owns model/API keys and Databricks credentials.
- Frontend Entra variables are public configuration, not secrets.
- Generated docs should name environment variable keys but never preserve secret values.

### Licensing reports and update feed release — 2026-09-28

- source commits: `3686069` and `4bdacc5`, branch `codex/licensing-production-20260928`
- image tag: `alamo-platform:licensing-4bdacc5`
- image digest: `sha256:2cfacc47f400a787b501875ced690f71e4c6a62f43f59feeecdb4d8ec4a9e0fb`
- active revision: `alamo-platform-prod-web--licensing-4bdacc5`
- rollback digest: `sha256:d93329474498a735d53c18214034eeca777b0d272fe65eba930bc312ff613763`
- baseline: `20260928T211945Z-350926e2`, 93 reports across four communities

The protected `/licensing` page has a compact breadcrumb and Updates row,
one search box, and source-grounded report briefs. The page title and subtitle
were removed so reports begin higher on the screen. Community profiles link to
the corresponding Licensing collection. The final production browser asset is
`/assets/index-BGafwIFT.js`.

This release overlays the exact preceding production image with the browser
bundle, only the new Licensing server/shared modules, and three protected GET
routes patched into the production image's API handler. Existing Azure runtime,
Admissions integrations, authentication, environment, and data adapters remain
from that image. `scripts/prepare-licensing-release.mjs` builds the bounded
context and refreshes compressed static representations along with the originals.
Do not substitute the repository's whole API/server tree for the image runtime.

The serving bundle is private Azure Blob data at
`alamodatalake/alamo-platform-snapshots/licensing/library-v1.json`, read with the
existing managed identity. Immutable bundle versions and original source/SQLite
archives are kept under `licensing/versions/` and `licensing/evidence/`.
The publisher validates source hashes and uses conditional writes. Production
fails closed when cloud data cannot be read; it does not use local evidence as
an outage fallback. No new credentials or public storage permissions were added.

At initial launch, a Monday 9 a.m. Pacific Codex monitor ran
`node scripts/check-licensing-updates.mjs --publish` from the primary app checkout.
That initial trigger required the Mac and Codex. The later Licensing cloud job
below replaces this local scheduling design.

Verification: the full nonbrowser `check:ship:predeploy` gate passed all eight
stages, including `check:analyst`, dependency audit, regression replays, stress
checks, and production-configured build. Browser checks were performed through
CUA instead of the shell Playwright runner. The initial revision was rolled back
when signed-in search changed its URL but not its displayed results. The issue
was reproduced in the optimized build and corrected by making BrowserRouter
navigation synchronous (`useTransitions={false}`). TypeScript, Licensing,
Admissions access, California home contracts, and the resumed build gate passed
after that change. Optimized-browser search, report selection, clearing search,
and Back navigation passed before the final deployment.

Post-deployment verification confirmed Healthy/Running at 100% traffic, exact
browser asset identity, 4/4 public smoke probes, and 401/no-store for all three
unauthenticated Licensing endpoints. Signed-in production showed all 93 reports,
four results for the substantiated-medication/San Pablo query, source briefs,
the successful no-change Updates feed, the map and community Licensing link
(55 San Pablo reports), and the populated Admissions board. The compact layout
was visually verified; the local phone layout had no horizontal overflow.

### Licensing full-width layout release — 2026-09-28

- source commit: `5821b29`, branch `codex/licensing-production-20260928`
- image tag: `alamo-platform:licensing-width-5821b29`
- image digest: `sha256:6e266efc866b895fffbdf7f208850ff1bad1279f29ee0ea7b15b5e4d444b5476`
- active revision: `alamo-platform-prod-web--licensing-width-5821b29`
- rollback digest: `sha256:2cfacc47f400a787b501875ced690f71e4c6a62f43f59feeecdb4d8ec4a9e0fb`

The Licensing page now fills the available width with 32-pixel desktop and
12-pixel phone gutters. Its page and shell width caps are removed only for
Licensing; the report list retains its 300-pixel desktop width. This is a
frontend-only overlay on the exact preceding production digest, including
fresh compressed static files. The live browser asset is
`/assets/index-Dz0-Q1Nr.js`.

Verification: 8/8 nonbrowser predeployment stages passed, including the full
analyst checks and production-configured build; browser QA used CUA. Desktop
content measured 1406 pixels in a 1470-pixel viewport, and the local phone layout
measured 366 pixels in a 390-pixel viewport, both without horizontal overflow.
Production is Healthy/Running at 100% traffic, serves matching JS and CSS,
and passed 4/4 public smoke probes. Signed-in search returned four matching
reports, and clearing it restored all 93 reports.

### Licensing cloud job

The platform-owned collector uses an Azure Container Apps Job named
`alamo-platform-licensing-check`, in the platform's existing Container Apps
environment. Its source definition is `scripts/azure/licensing-job.json` and
its image is built with `Dockerfile.licensing-job`. The job uses the existing
platform managed identity and private snapshot container; it has no user login
or Codex dependency. It publishes into the existing Licensing Updates feed.

Change-only email is prepared for the Logic App
`alamo-platform-licensing-alerts` through the existing connected Office 365
Outlook connector. Its source definition is
`scripts/azure/licensing-alert-workflow.json`; deploy it with
`npm run licensing:deploy-alert-workflow`. The deployment stores the signed
callback URL in Key Vault as `licensing-alert-webhook-url`. The job resolves
that secret through its existing user-assigned identity and never includes the
URL in its image or source. Recipients are locked to
`raj@aaahealthservices.com` and `betty@aaahealthservices.com` in both code and
the workflow definition. Templates default to disabled delivery. Activation
uses `licensing:deploy-alert-workflow -- --enable` and the job deploy script's
`--enable-notifications --notifications-not-before=<UTC timestamp>` options.
The Office 365 connection must be Connected. The job requires both
`LICENSING_ALERT_NOTIFICATIONS_ENABLED=true` and `LICENSING_ALERT_NOT_BEFORE`;
queued runs before that timestamp are skipped without deleting their evidence.
Email delivery was paused by the user on October 16: the job flag is false and
the Logic App is Disabled. Keep both disabled until explicit authorization to
resume. If later approved, choose a new activation timestamp so this pause does
not silently release old notices. The v2 email
includes report dates and direct brief links; v1 envelopes remain readable for
explicitly included older runs. No report body or resident details enter email.

The twice-weekly schedule is Monday and Wednesday at 9 a.m.
America/Los_Angeles. Azure evaluates
cron in UTC, so the job is triggered at both candidate UTC hours and the worker
checks Pacific local time before contacting the source. Exactly one slot runs
in either standard time or daylight time. See Microsoft's
[Container Apps jobs documentation](https://learn.microsoft.com/en-us/azure/container-apps/jobs).

The published library atomically points to the complete collector evidence
archive. Each fresh container verifies and restores that archive before
checking the four facilities. The initial evidence hash in the deployment
specification is used only to migrate the pre-job baseline; its run ID must
match the published collection. Later executions use the published pointer.
A renewable blob lease prevents overlapping writers. Failed/partial scans
retain the last complete collection and mark Updates as failed; comparison
history advances only after all four facilities pass. Job execution history
also records failures, including storage outages that cannot update the feed.
After a successful atomic publish, the job queues only the latest run's changes
under `licensing/notifications/pending/`, calls the mail workflow, and writes an
immutable receipt under `licensing/notifications/sent/`. Pending envelopes are
retried before later scans, including the daylight-saving guard execution. A
run with no new, revised, removed, or reappearing record sends no email.

Use `npm run licensing:prepare-job` to create a bounded image context with only
collector code and locked dependencies. Build that context in ACR, then deploy
its immutable digest with
`npm run licensing:deploy-job -- --image=<digest>`. Use `--manual` for initial
verification before enabling the schedule. `az containerapp job start` runs a
manual execution; for a scheduled definition, supply an execution template with
the `--scheduled` argument removed to run outside the weekly time window.
Run `npm run check:licensing-job` for DST, overlap, failure, restore, and atomic
history checks. The first cloud execution and a fresh-container repeat must
succeed before retiring the former Codex automation.

### Licensing cloud-job release — 2026-09-28

- source commit: `3b3cee1`, branch `codex/licensing-production-20260928`
- web revision: `alamo-platform-prod-web--licensing-cloud-3b3cee1`
- web image: `sha256:68675f708e944a4df062abec537b6ef45475b266539516bdd119ee411fe524ed`
- preceding web image: `sha256:6e266efc866b895fffbdf7f208850ff1bad1279f29ee0ea7b15b5e4d444b5476`
- job: `alamo-platform-licensing-check`
- job image: `alamo-licensing-job@sha256:e8561200eba9d127c02fe3992fc0a86c7957ffc38a1586c0ece71ef1095232f1`
- first successful execution: `alamo-platform-licensing-check-cmak8uj`

The web release overlays only the browser bundle and Licensing validation and
library modules on the preceding runtime. The job image contains collector
code and locked dependencies, no local records or Azure CLI credentials. Both
use the platform's existing managed identity; no RBAC permissions changed.
The first cloud run restored the original evidence archive, checked all four
facilities, published 93 reports, and found zero changes.

Verification: all eight nonbrowser predeployment stages passed, including the
analyst suite and production build. Additional collector checks verify that
partial source failures cannot advance history, unsafe archives are rejected,
leases prevent overlap and release after failure, and the Monday/Wednesday
9 a.m. Pacific
schedule follows daylight-saving time. Production is Healthy/Running at 100%
traffic, matches `/assets/index-B75ElOs8.js`, passes 4/4 public smoke probes,
and returns 401/no-store on anonymous Licensing APIs. Signed-in CUA verification
confirmed 93 reports, four matches for the substantiated-medication/San Pablo
query, and the automatic schedule in Updates. The original release was
Monday-only; the current cadence is recorded in the later schedule release.

To suspend collection, change the job trigger to Manual and stop any active
execution. Keep the current web reader when suspending the schedule. A rollback
to a web version predating `platform_scheduled` requires restoring its compatible
published library from `licensing/versions/` as well; otherwise its older
validator rejects the newly scheduled baseline. Preserve immutable evidence
archives when recovering or rolling back.

The fresh-container repeat `alamo-platform-licensing-check-ihhsma7` also
succeeded with 93 reports and zero changes. Its published run is
`20260929T031120Z-db2eace4`, bundle hash
`f1ad3de99e21936abb84c7cb66dbe95178887d1abd45fc37e21511f33d10613b`,
and evidence hash
`816ab93485375a377a6cf6a2244d3be5439704b82effc9b36a548095629fde62`.
The final evidence blob was read back and its checksum verified. The job was
then changed to Schedule with the Pacific-time guard enabled and provisioning
Succeeded. The old `alamo-licensing-updates` Codex automation was deleted only
after both successful cloud executions and schedule verification. No Mac,
Codex session, or interactive Azure sign-in is required for subsequent checks.

### Licensing email launch hold — 2026-10-06

- source merge: `c29da51` (PR #151)
- job image: `alamo-licensing-job@sha256:556933b3a3c8402248ca30a87cbe0070435a99b381a81add3946d8e7cdc0ff8e`
- preceding job image: `alamo-licensing-job@sha256:cf2cabc0d6bb362977910c0fc820a7f6085e475a525df10b09ffd72eb469c90d`
- ACR build: `cc5v`
- verification execution: `alamo-platform-licensing-check-g5a0sit`

The change-only email path is installed but not launched. The Logic App is
Disabled and the scheduled job has
`LICENSING_ALERT_NOTIFICATIONS_ENABLED=false`. A real Oct 5 Santa Clarita
change remains in the private pending queue; no sent receipt exists. The
verification execution succeeded and reported one paused pending envelope,
proving the scheduled collector can remain healthy without calling the mail
workflow. The existing Office 365 connector also requires reauthorization
before launch. Do not enable either gate or retry the pending alert without
explicit approval to send to Raj and Betty.

### Monday/Wednesday Licensing cadence — 2026-10-06

- source merge: `2ae6a58` (PR #153)
- web revision: `alamo-platform-prod-web--licensing-mon-wed-1006`
- web image: `alamo-platform@sha256:90bfb108e4dc37280d9a1d62a5afed2b5b36440ba7f95e40ae2146bbe58a2049`
- preceding web image: `alamo-platform@sha256:9fa7c3337eccb9da963a87b982c024db69833bb1b828b881b5523d56569f76d8`
- web ACR build: `cc5w`; active assets: `/assets/index-DMBP8I8e.js`
  and `/assets/index-BxRd7BsG.css`
- job image: `alamo-licensing-job@sha256:3209766d83f4b50f66535862a0105778678b4a5611e6244e1c9293843e167b03`
- preceding job image: `alamo-licensing-job@sha256:556933b3a3c8402248ca30a87cbe0070435a99b381a81add3946d8e7cdc0ff8e`
- job ACR build: `cc5x`
- verification execution: `alamo-platform-licensing-check-pmqlf0g`

The scheduled job now triggers at both candidate UTC hours on Monday and
Wednesday, with the worker's America/Los_Angeles guard selecting exactly 9 a.m.
through daylight-saving changes. Its cron is `0 16,17 * * 1,3`. The web and API
release accepts the legacy Monday-only schedule while exposing the new
Monday/Wednesday contract once the next complete check publishes it. The safe
Tuesday verification execution succeeded and reported that it was outside the
Monday/Wednesday window. Email remains launch-gated: the Logic App is Disabled,
the worker flag is `false`, one pending envelope remains queued, and no email
was sent.

### Licensing mobile workspace — 2026-10-06

- source merge: `53f42ce` (PR #155)
- revision: `alamo-platform-prod-web--licensing-mobile-1006`
- image: `alamo-platform@sha256:cc9f7628cff6d0aaf3fa26c7a0d22b3f3b7586cdcd9af2aab493fe8c48dcdd47`
- preceding image: `alamo-platform@sha256:90bfb108e4dc37280d9a1d62a5afed2b5b36440ba7f95e40ae2146bbe58a2049`
- ACR build: `cc5y`
- active assets: `/assets/index-CGaTtB-f.js` and
  `/assets/index-Hj-mupV4.css`

The frontend and Licensing-module overlay preserves the production API,
authentication, private storage, twice-weekly monitor, and paused email gates.
The Licensing phone view now uses a bounded Updates sheet, a compact search
control, readable report cards, larger source text, and full-width source and
download actions. The dedicated browser regression passed at 320, 390, and 430
pixels across list, Updates, reader, and expanded-source states with no
horizontal overflow. The revision is Healthy/Running at 100% traffic, the live
HTML references the expected assets, public smoke passed, and anonymous
Licensing access remains 401 with private/no-store caching.

### Navigation and responsive review release — 2026-09-28

- source: `2a2f9db`, following `8b5461f` and `3610feb` on
  `codex/licensing-production-20260928`
- revision: `alamo-platform-prod-web--responsive-2a2f9db`
- image: `alamo-platform@sha256:69bc343962ec7f02ce6d4e144f05d02c65b4336b9f9a431793b35b15a4cc3d14`
- preceding image: `alamo-platform@sha256:1ac18b97d8616a6dd7477e2e4b100d6b4702c40c73a459175763906d474ab34c`
- active browser asset: `/assets/index-B6wycf3A.js`
- ACR build: `cc3x`

The frontend-only overlay preserves the currently deployed API/runtime and
Licensing cloud job. Both gzip and Brotli siblings were regenerated before the
image build, so compressed index responses reference the new assets. The final
revision is Healthy/Running with 100% traffic. All eight nonbrowser release
stages passed, followed by focused checks for the last tooltip adjustment and a
fresh production build. Public production smoke passes 4/4; anonymous Licensing
library and Updates requests still return 401 with private/no-store caching.

Signed-in CUA verification confirmed the exact asset above, the corrected
320px search selectors and Admissions timing, the account hint beneath the
header, and the shared Analytics/Admissions/Licensing navigation. The broader
review covered ten viewport sizes and the product routes described in
`testing-quality.md`. Licensing reported its then-current Monday 9 a.m. Pacific
schedule; the current cadence is recorded in the later schedule release.
Physical iOS and Safari/WebKit were not available in this browser session.

The release was made from the clean release checkout rather than the shared
main checkout, which contains separate in-progress product work. Do not replace
this immutable runtime with an older image or deploy the shared working tree
without reconciling those changes first.

### Licensing access and Analytics placement — 2026-09-28

- source commit: `920db3f`, branch `codex/licensing-production-20260928`
- revision: `alamo-platform-prod-web--licensing-access-920db3f`
- image: `alamo-platform@sha256:a907d6af426d8e7b5a7e4306fb4ea50f6aadeae5e469e68d221a9786c54462b5`
- base image: `alamo-platform@sha256:69bc343962ec7f02ce6d4e144f05d02c65b4336b9f9a431793b35b15a4cc3d14`
- ACR build: `cc3y`; active asset: `/assets/index-CxQlospQ.js`

Licensing now lives at `/analytics/licensing`, alongside Reports and Ask a
question. Only Betty Dominici and Raj Thandi's tenant-local Entra object IDs
qualify. The shared browser/server policy is `shared/licensing-access.mjs`.
All three Licensing API routes require a verified delegated identity and the
explicit allowlist; denied authenticated requests return generic 404 responses.
The top-level and community-profile links were removed. Legacy `/licensing`
links preserve their query string when redirecting to the protected new route.

The approved IDs were verified against the existing Entra directory; no account,
role, consent, or tenant permission was created or expanded. The scheduled
collector and its managed identity remain unchanged. The bounded release
overlay patches only the Licensing API handlers and modules plus the browser
bundle, preserving the established runtime. Do not roll back to a pre-access
API image: it would restore access for every authenticated Platform user.

Verification: 8/8 nonbrowser release stages and 4/4 production smoke probes
passed. Signed-token tests exercise the actual API authentication/handlers,
reject nonmembers and misleading names/email claims, and let both approved IDs
reach the report loader. These same tests passed against the overlaid production
container with networking disabled. Local CUA fixtures verified both permitted
identities, a denied identity with zero Licensing requests, and 320/390/768/1440px
navigation. These fixtures did not sign in as Betty or Raj. Production CUA under
Eric confirmed the exact asset, no Licensing navigation, and redirects from both
old and new direct URLs to Analytics. The revision is Healthy/Running at 100%
traffic; all anonymous Licensing APIs return 401/private-no-store.

### Admissions weekly briefing release — 2026-09-28

- integrated source: `a7b5249` on `main` through PRs #59 and #60
- revision: `alamo-platform-prod-web--admissions-briefing-0928`
- image: `alamo-platform@sha256:84e4fb881f354714f8fe1cc36d6a9db8c48fcdb2df9b31f849c047f196f9a5ef`
- base and rollback image: `alamo-platform@sha256:a907d6af426d8e7b5a7e4306fb4ea50f6aadeae5e469e68d221a9786c54462b5`
- ACR build: `cc40`; active assets: `/assets/index-CfNa8vME.js` and
  `/assets/index-DbM4zKqw.css`

Admissions replaces Trends with Briefing and opens there by default. The
briefing presents current census by community, referral origin over 7 and 14
days, census trend, upcoming assessments this week, and planned move-ins this
week. Existing Board and Census workflows remain available. Mobile navigation
uses the same compact category pattern as Communities.

The release overlay started from the active Licensing-access image and replaces
only the built browser assets and the two reviewed Admissions aggregation
modules. It therefore preserves the restricted Licensing route and its runtime.
The current Pipeline producer contract is version 3.0 and does not yet publish
the optional `briefing` slice. Census is live; the four dependent briefing
sections identify themselves as `source_upgrade_required` rather than displaying
invented zeros. Upgrade the producer contract before treating those sections as
complete operational reporting.

Verification: all nonbrowser, analyst, regression, stress, fuzz, browser,
mobile, guided-render, journey, and performance checks passed before release;
the final reconciled source also passed typecheck, Admissions access/dashboard,
Licensing, browser-Admissions, and production build checks. Azure reports the
revision Healthy/Running at 100% traffic. Production serves the expected assets,
`/healthz` is healthy, and the public smoke suite passes 4/4. Authenticated
production smoke and guided-question scripts were not executed because the
release checkout has no saved production browser storage state; their local and
predeployment equivalents passed. Roll back to the immutable base digest above
if an authenticated production issue is found.

#### Compressed-shell correction

The first Admissions briefing overlay updated the uncompressed browser build
but inherited older precompressed `index.html.gz` and `index.html.br` files from
its base image. Production correctly advertised no-cache for HTML, but browsers
that requested gzip or Brotli still received the older asset references and
continued to show Trends. The command-line smoke probe requested the identity
representation and therefore did not expose the mismatch.

The corrected release regenerated every compressed HTML, JavaScript, CSS, JSON,
and SVG sibling before building. Revision
`alamo-platform-prod-web--admissions-cachefix-0928` runs image
`alamo-platform@sha256:45991a8f5c3db93f8410694985b39e0e497d2a14e7d1cd39122db043d2a7adcf`
from ACR build `cc41`; the preceding image
`sha256:84e4fb881f354714f8fe1cc36d6a9db8c48fcdb2df9b31f849c047f196f9a5ef`
is its rollback point. The correction is Healthy/Running at 100% traffic.
Identity and gzip responses both reference `/assets/index-CfNa8vME.js` and
`/assets/index-DbM4zKqw.css`. A signed-in Chrome verification on the clean
`/admissions` URL confirmed that Briefing is selected and Trends is absent.
Future overlay releases must regenerate and replace the precompressed browser
representations, not only their source files.

### Owner workspace and Licensing access — 2026-09-29

Eric Wilson's existing tenant-local Entra object ID now joins Betty Dominici
and Raj Thandi on the explicit Licensing allowlist. The same verified owner ID
already protects the private Knowledge and Acquisition APIs; the shared browser
navigation now exposes Outreach only to that identity. No role, tenant
assignment, service principal, or access for any other account is expanded.

The release is prepared with `scripts/prepare-licensing-release.mjs` on the
exact preceding production digest. It replaces the current browser bundle and
only the shared Licensing/owner access modules plus the owner access server
adapter. Anonymous requests and authenticated nonmembers continue to receive
the existing private failure behavior.

Source PR `#65` merged as `9e12b431b2258bde23c8dd9a83eea7b3fcfaf385`.
ACR build `cc42` produced immutable image
`alamo-platform@sha256:62e5da15dbd8c0321ecfa0385b856c8a1ca3ee23ffec103da65d45dffab40e30`
from rollback digest
`sha256:45991a8f5c3db93f8410694985b39e0e497d2a14e7d1cd39122db043d2a7adcf`.
Revision `alamo-platform-prod-web--owner-access-0929` is Healthy/Running at
100% traffic. `/healthz` returned 200, the public production smoke suite passed
4/4, and identity plus gzip HTML both referenced
`/assets/index-CNv--yTM.js`. Anonymous Licensing remained 401. A signed-in
Chrome verification under Eric Wilson's production account confirmed both the
Outreach header destination and a working Licensing archive.

### David and Angela Platform access — 2026-09-29

David (`david@aaahealthservices.com`) and Angela
(`angela@aaahealthservices.com`) were invited into the production Entra tenant
as enabled guest users with the Platform login URL as their invitation return
path. Their tenant-local object IDs are
`d238e1f3-fb9d-40bc-a946-59540560bfb1` and
`530b3414-ff80-4df1-92dc-24bf400c2de1`, respectively.

Both identities are assigned the enabled `Alamo.Admissions.Supervisor` app role
on the `Alamo-Health-Data-Platform` enterprise application. This role permits
Admissions and the broader operating workspace; it does not add either user to
the owner-only Outreach or Licensing allowlists. The change is live Entra
configuration and does not require a Container App image revision. Both guest
objects remain `PendingAcceptance` until each user accepts Microsoft's emailed
invitation. Production remained Healthy/Running at 100% traffic and
`/healthz` returned 200 after the assignments.

### Admissions single-page briefing and Pipeline 3.1 — 2026-09-29

Admissions is now one continuous management page. The former Briefing/Census
surface navigation and standalone Census panel are removed. The executive
update leads into the collapsible **This week at a glance** deck, followed by
the existing Board/List. Census remains a governed briefing input rather than a
separate destination; the mobile board still uses its three pipeline-category
tabs.

Platform consumer:

- source PR: `#68`; merge commit: `64ce8dd5d868f78c41b08af157c5a01f35fbbc8e`
- ACR build: `cc43`
- image: `alamo-platform@sha256:38f1d8b5e06ea9a28fa3aaa1ec47bfc0579f5b85320df7b162a88828668ecae3`
- active revision: `alamo-platform-prod-web--admissions-single-0929`
- rollback image: `alamo-platform@sha256:62e5da15dbd8c0321ecfa0385b856c8a1ca3ee23ffec103da65d45dffab40e30`
- active browser asset: `/assets/index-EkLkOWwE.js`

Pipeline producer:

- source PR: `#221`; merge commit: `2ad828692b803f6418bf141ede772287b44453c`
- deployment workflow: `36584921689`
- image: `pipeline-app:2ad828692b803f6418bf141ede772287b44453c`
- active revision: `pipeline-prod-web--2ad828692b-r36584921689-1`
- rollback image: `pipeline-app:1024053bd132fae0373bf141ede772287b44453c`
- contract version: `3.1`

The producer's required CI rerun passed every browser, operational, Postgres,
verification, and immutable-image job before the full Azure lane ran. Both
Container App revisions are Healthy/Running at 100% traffic. The direct
server-to-server contract reports complete coverage for recent referrals,
assessments, move-ins, and weekly trend. A non-PHI verification counted 27
recent-referral rows, zero remaining assessments this week, two planned
move-ins, and 12 weekly trend points. Production `/healthz`, Pipeline liveness
and readiness, identity/gzip asset delivery, local desktop/mobile Admissions
browser regression, and Eric Wilson's signed-in production page all passed.
The signed-in page shows live 7-day and 14-day referral totals and the complete
16-page briefing deck without the former source-upgrade notice.

### Admissions assessment schedule correction — 2026-09-29

The CEO briefing no longer displays the low-value Weekly trend panel. Referral
origins use the full briefing width, while Upcoming assessments and Move-ins
remain the two priority schedules. The Pipeline producer now reads appointment
start time and duration from the canonical assessment schedule used by Pipeline
Home; it no longer mistakes the clinical assessment date for the appointment.

Platform consumer:

- source PR: `#73`; merge commit: `f483fbe446bac30cb6089ebdf8822f8f769be014`
- ACR build: `cc47`
- image: `alamo-platform@sha256:41bca5d43cdc2d22ee700b201a176f7bf91ad9028a6ec0f9aecdcae74a2e4252`
- active revision: `alamo-platform-prod-web--admissions-assessments-0929`
- rollback image: `alamo-platform@sha256:0409a19a29e91b992672e4a975d44495586a3f6e54dc6b9a7bc4eb41b4e5e26f`
- active browser asset: `/assets/index-Eh2hLDQT.js`

Pipeline producer:

- source PR: `#225`; merge commit: `fa3eb2db203a3f02be554c09793e843d0c05a8bb`
- deployment workflow: `36625173723`
- image: `pipeline-app:fa3eb2db203a3f02be554c09793e843d0c05a8bb`
- active revision: `pipeline-prod-web--fa3eb2db20-r36625173723-1`
- contract version: `3.1`

Both revisions are Healthy/Running at 100% traffic. Non-PHI contract
verification reports complete assessment coverage, two remaining appointments
this week, and two planned move-ins. The live-feed desktop/mobile Admissions
browser regression passed without horizontal overflow, the production bundle
omits Weekly trend, identity and gzip HTML reference the same active asset, and
the public production smoke suite passed 4/4.

### Workforce owner-only overview — 2026-09-30

Adds `/workforce` (Briefing and Hiring board) fed by the separate Alamo Workforce
pilot, visible only to the platform owner (nav entry hidden, page redirects, and
`/api/platform/workforce-dashboard` answers 404 to other accounts). The Workforce
pilot holds placeholder data only.

Production's `api/platform.js` and `server/platform-data.mjs` differ from `main`
(main carries unreleased acquisition-operator routes and a community-label
change). `Dockerfile.workforce-release` therefore overlays production's exact
files from the base digest plus only the Workforce route, loader, and
`server/workforce-summary.mjs`; the bundle is built from PR `#75` with
production's public Entra settings and regenerated `.gz`/`.br` siblings.

- source PR: `#75`
- ACR build: `cc4b`
- image: `alamo-platform@sha256:6c9a07b0aa1d0788c6a9d827863fec339f13746934fe6f91176652d5c28ecf85` (tag `workforce-owner-20260930`)
- active revision: `alamo-platform-prod-web--workforce-owner-0930`
- rollback image: `alamo-platform@sha256:41bca5d43cdc2d22ee700b201a176f7bf91ad9028a6ec0f9aecdcae74a2e4252`
- active browser asset: `/assets/index-BBNkATW7.js` (identity, gzip, and Brotli)
- new settings: `WORKFORCE_SUMMARY_URL`, `WORKFORCE_SUMMARY_TOKEN` (secret `workforce-summary-token`)

The revision is Healthy/Running at 100% traffic. `/`, `/home`, `/admissions`,
and `/workforce` return 200; platform APIs still reject anonymous callers; the
server log shows a clean start. Not included: the unpushed
`codex/admissions-county-outreach` branch, which was not released.

### Outreach rename — 2026-09-30

The owner-only national market and acquisition workspace is now named
**Outreach** throughout the live product. `/outreach` is the canonical route.
The retired `/fiftystate` URL redirects to Outreach and preserves query strings
and hashes so saved links continue to work. The underlying state research,
acquisition data, API boundary, and owner allowlist are unchanged.

- source PR: `#81`; merge commit: `7a696cb901be95dd966f8e482bfb541c9c26672b`
- ACR build: `cc4h`
- image: `alamo-platform@sha256:05713cac42d4e6e28fa5484c8ad82f759d3a36bb73fc4c61c3883784a8a29778`
- active revision: `alamo-platform-prod-web--outreach-rename-0930`
- rollback image: `alamo-platform@sha256:41f5c9eca19c21256a6c3360be8b7833d47a414a54747546ed8eab2c7c0c677f`
- active browser asset: `/assets/index-CYXljkcc.js` (identity, gzip, and Brotli)

The revision is Healthy/Running at 100% traffic and the public production smoke
suite passes 4/4. A signed-in Chrome verification confirmed the Outreach
navigation destination, workspace heading, canonical URL, and legacy redirect.
Desktop and 390px local browser checks passed without horizontal overflow.

### Mobile platform polish — 2026-09-30

The signed-in phone experience now uses a full-height primary menu with
touch-sized destinations. The Communities landing page distributes its five
rows across the available viewport instead of leaving a dead lower half.
Admissions keeps the same governed content while presenting a denser phone
brief: census cards omit unavailable activity lines, county outreach opens as
two summary-first disclosures, and empty or incomplete weekly schedules no
longer reserve desktop-height panels. Workforce empty action lists follow the
same compact phone treatment. Desktop layouts and data contracts are unchanged.

- source PR: `#83`; merge commit: `be63f3cd9ac754bc9127724aefa1a04eb03e0b40`
- ACR build: `cc4j`
- image: `alamo-platform@sha256:ea53b038166663980d50967515913ea4141db9590c106c1e292477c3db5001fa` (tag `mobile-polish-be63f3c`)
- active revision: `alamo-platform-prod-web--mobile-polish-0930`
- rollback image: `alamo-platform@sha256:05713cac42d4e6e28fa5484c8ad82f759d3a36bb73fc4c61c3883784a8a29778`
- active browser asset: `/assets/index-DspIFtyv.js` (identity, gzip, and Brotli)

The revision is Healthy/Running at 100% traffic and the public production smoke
suite passes 4/4. Local phone QA passed at 390 and 320 pixels for Communities,
the community profile, resident search/profile, Analytics, governed questions,
Admissions, and Outreach. Signed-in production verification at 390 by 844
pixels measured zero horizontal overflow, a 60-to-844-pixel full-height menu,
64-pixel menu rows, a 784-pixel Communities workspace, and two collapsed
county disclosures that both retain their verified detail. The broad analyst
suite passed its source, registry, live-decision, intent, module, and transition
stages before a transient Azure identity network error interrupted the unrelated
long context-fuzz stage; the focused mobile, Admissions, Workforce, type, docs,
and production-build gates all passed.

### Analytics controls and governed questions polish — 2026-09-30

Analytics now labels the cross-community report simply `Overview` in both the
report picker and compiled document while retaining the stable `overview` API
identifier. Report, period, community, and audience controls use labeled,
compact fields with explicit chevrons and 44-to-48-pixel phone targets. The
governed question library uses a quieter editorial list, consistent mobile
inputs, clear execution states, and preserved pagination instead of stacked
card borders. The production frontend normalizes the Overview label across the
current API response so this presentation change does not require a backend
contract or data-service rollout.

- source PRs: `#85`, merge commit `41e3ad5e2947d6868f0587d0ac4fa60150c0976c`; `#86`, merge commit `1dd29c1305ba108b89f5e66f726635b193f13dfe`
- ACR builds: `cc4k`, `cc4m`
- image: `alamo-platform@sha256:c5ab27d612310ed062d54904b581453e57620f613275eb3820e68125a41f952e` (tag `overview-display-0930-1dd29c1`)
- active revision: `alamo-platform-prod-web--overview-label-0930`
- rollback image: `alamo-platform@sha256:ea53b038166663980d50967515913ea4141db9590c106c1e292477c3db5001fa`
- active browser asset: `/assets/index-DJ673HV6.js` (identity, gzip, and Brotli)

The revision is Healthy/Running at 100% traffic. TypeScript, documentation,
report contracts, the production build, all five full reports, mobile answer
flow, cross-device Analytics carousel, and 62 desktop/compact guided-question
controls with four keyboard journeys passed. Signed-in production verification
at 390 by 844 pixels confirmed `Overview` in both locations, the labeled latest
period control, a 48-pixel minimum question-control height, and zero horizontal
overflow. The browser viewport was reset after verification.

### Unlisted owner analyst route — 2026-10-01

Adds `/chat` as an unlisted conversational entry to the governed analyst
workspace. It is absent from shared navigation and waits for the signed-in
Entra account claims before applying the same verified owner allowlist used by
Workforce and Outreach. Other authenticated identities are redirected to Home;
knowing the URL is not the access boundary. The ordinary Analytics question
library remains unchanged.

The release also advances the service-worker cache generation and makes every
navigation request bypass the HTTP cache. Installed, mobile, and long-lived
browser sessions therefore discover the current hashed bundle after a release
instead of continuing to execute an older application shell. A follow-up gives
`/chat` and `/chat/` a dedicated server entry document with `Cache-Control:
no-store`, preventing an already-open pre-chat shell from routing the owner back
to Home before the current application bundle loads.

- source PRs: `#88` through `#99`; final merge commit: `4b2eb453cf02bf30d52ff4ec5e610f7cb2e23bc1`
- ACR build: `cc4y`
- image: `alamo-platform@sha256:7ecd9deebc12419ac03ad83d421d42389e381727a8601f35c74101a76e4dfc11` (tag `chat-dedicated-entry-1001`)
- active revision: `alamo-platform-prod-web--chat-dedicated-1001`
- rollback image: `alamo-platform@sha256:53d87a68b0d41c89c249d87a37bcf31a66ffbb63e812d3a2efb315185147e52d`
- active browser asset: `/assets/index-ombYQBwC.js`

The revision is Healthy/Running at 100% traffic and the public production smoke
suite passes 4/4. The full predeployment platform readiness run passed 17/17
stages, including 124 guided-answer renders across four viewports, accessibility,
keyboard, interaction, context, mission, fuzz, performance, type, documentation,
retention, and build gates. Focused owner-route, authentication-redirect,
platform-knowledge, desktop-readiness, chat-flow, and production-build checks
also pass.

The dedicated-entry follow-up was additionally verified in Eric Wilson's
existing signed-in Chrome tab: navigating from the stale Home shell to `/chat`
loaded the current hashed bundle, retained the `/chat` URL, and rendered the
owner-only Alamo Analyst prompt instead of redirecting to Home.

### Admissions county-outreach removal — 2026-10-01

The County outreach panel and its mobile disclosures have been removed from
the Admissions briefing. Admissions retains its executive update, census by
community, upcoming assessments, move-ins, and referral-origin dashboard. The
responsive browser regression now requires County outreach to remain absent on
desktop and mobile.

`/admissions`, `/admissions/`, `/chat`, and `/chat/` use dedicated no-store
entry documents so a long-lived signed-in browser cannot continue rendering a
pre-release shell after the browser bundle changes.

- source PRs: `#101`, `#102`; final merge commit: `25e3d4dec698de296fbc7bd72caeb941441eb796`
- ACR build: `cc51`
- image: `alamo-platform@sha256:44c08e19e74e41085f718570ab2d85b14113b85db87a47d928b888fd86736608` (tag `admissions-clean-fresh-1001`)
- active revision: `alamo-platform-prod-web--admissions-fresh-1001`
- rollback image: `alamo-platform@sha256:7ecd9deebc12419ac03ad83d421d42389e381727a8601f35c74101a76e4dfc11`
- active browser asset: `/assets/index-BvG4h9iY.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. The Admissions dashboard, access contract, code-health,
type, build, and responsive desktop/mobile browser checks pass. Signed-in
production verification loaded the active bundle, rendered both priority
schedules, and found zero County outreach headings or panels.

### Admissions briefing answer structure — 2026-10-01

The Admissions analyst answer is now a compact operational brief instead of a
long repeated paragraph. It opens with active and accepted counts, groups
scheduled accepted clients by date and destination, groups accepted clients
awaiting dates by destination, and closes with stage and workload rows. The
one-time typing treatment remains, while repeated destination phrases and
per-client `admission date not scheduled` language are removed.

- source PRs: `#104`, `#105`; final merge commit: `1d26171c8540127d8401a6cac4b2f289bf224ebf`
- ACR build: `cc53`
- image: `alamo-platform@sha256:2a6efee1864bfc90a37265b7135f4e663036b8260de62f2bbadccf0ed8dc4deb` (tag `admissions-briefing-answer-v2-1001`)
- active revision: `alamo-platform-prod-web--admissions-answer-v2-1001`
- rollback image: `alamo-platform@sha256:44c08e19e74e41085f718570ab2d85b14113b85db87a47d928b888fd86736608`
- active browser asset: `/assets/index-CF-5ZmKH.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression pass. Signed-in production
verification confirmed the concise lead, four scheduled groups, three
date-pending groups, two pipeline rows, and none of the retired repetitive
phrases.

### Admissions referral-source redesign — 2026-10-01

The Admissions briefing now treats referral origin as an operating flow rather
than a ranked leaderboard. Duplicate source organizations are consolidated,
the current seven days are compared with the previous seven, and each source
shows the communities receiving its referrals. Rankings, client-county labels,
and the redundant 14-day total have been removed. Referrals without a recorded
source are excluded from the source list and disclosed in a separate
data-quality footnote.

- source PR: `#107`; merge commit: `3197b5e0936ce7299c4a6088a066faad056ff793`
- ACR build: `cc54`
- image: `alamo-platform@sha256:fcc13d164c91f0e5085a819918d4d20864da8c7a6d3e0a82802651012913cfe8` (tag `admissions-referral-sources-1001`)
- active revision: `alamo-platform-prod-web--admissions-sources-1001`
- rollback image: `alamo-platform@sha256:2a6efee1864bfc90a37265b7135f4e663036b8260de62f2bbadccf0ed8dc4deb`
- active browser asset: `/assets/index-DMqDBptW.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression pass. Signed-in production
verification confirmed five active sources and seven referrals in the current
week, rendered eight grouped source rows on the first of three pages, excluded
unattributed pseudo-sources, and surfaced two current and six prior-week
unattributed referrals in the footnote.

### Compact Admissions executive briefing — 2026-10-01

The Admissions analyst update now uses the available page width instead of
stacking every section into one tall response. Its label and executive summary
share a compact header row on desktop, followed by scheduled admissions,
accepted clients awaiting dates, and pipeline context in three horizontal
columns. Mobile retains the same content in a tight stacked layout.

- source PR: `#109`; merge commit: `5236740444c0085f6a480aa3e82387ea00488e74`
- ACR build: `cc55`
- image: `alamo-platform@sha256:d7d5362579f044ae3a336a3abb8b95b330d5aad1e73ef0c0987bfbc4804fd2e2` (tag `admissions-compact-1001`)
- active revision: `alamo-platform-prod-web--admissions-compact-1001`
- rollback image: `alamo-platform@sha256:fcc13d164c91f0e5085a819918d4d20864da8c7a6d3e0a82802651012913cfe8`
- active browser asset: `/assets/index-DZlivcoP.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression all pass without mobile horizontal
overflow.

### Admissions community census simplification — 2026-10-01

The Admissions briefing no longer renders the Referral sources section. The
community census area now follows the Analytics row treatment: one concise row
per governed community with current census, upcoming admits this week, and new
referrals assigned to that community during the last seven days. The occupancy
bars and card grid were removed, while unassigned referral activity remains an
explicit footnote and missing event coverage remains a dash rather than zero.

- source PR: `#111`; merge commit: `674ad580e02d11f5f2942a711949b727ee6a1376`
- ACR build: `cc56`
- image: `alamo-platform@sha256:e37697566144bbad27d677a4a5002f590ca9f8efa4976bf55a9b95e2062a799b` (tag `admissions-community-census-1001`)
- active revision: `alamo-platform-prod-web--admissions-census-1001`
- rollback image: `alamo-platform@sha256:d7d5362579f044ae3a336a3abb8b95b330d5aad1e73ef0c0987bfbc4804fd2e2`
- active browser asset: `/assets/index-CRNhwUWD.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression pass. Desktop and mobile verification
confirmed five governed community rows, all three requested measures, no
Referral sources UI, and no horizontal overflow.

### Stale-shell recovery and Admissions briefing correction — 2026-10-02

The shared header no longer exposes Outreach on desktop or mobile; its
owner-only direct route remains available. The Admissions analyst update is a
single concise summary followed by three horizontal bullets for scheduled
admits, accepted clients awaiting dates, and pipeline status.

The service-worker cache advances to `alamo-static-v6`. When the new worker
replaces an older Alamo cache, it claims existing windows and navigates them to
their current URLs. This prevents an already-open platform or installed-app
window from remaining indefinitely on an older client shell after deployment.
Navigation HTML and `sw.js` remain served with no-store/no-cache policies.

- source PR: `#113`; merge commit: `44d255018dac50b05b97bc6e8cfa86a786f23c9f`
- ACR build: `cc57`
- image: `alamo-platform@sha256:2c1f28a4dd34be9e33cb24f7a4008407edafd330b6e8cae717862e6bc45a5cf6` (tag `platform-shell-refresh-1002`)
- active revision: `alamo-platform-prod-web--shell-refresh-1002`
- rollback image: `alamo-platform@sha256:e37697566144bbad27d677a4a5002f590ca9f8efa4976bf55a9b95e2062a799b`
- active browser asset: `/assets/index-BsetnkgM.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, desktop-readiness,
platform-knowledge, documentation, build, and responsive Admissions browser
checks pass. The exact signed-in Chrome tab that had displayed the older shell
was reloaded and verified against the active asset: Outreach, County outreach,
and referral sources were absent; Community census rendered five rows; and all
three concise analyst bullets shared one horizontal row.

### Admissions community snapshot clarification — 2026-10-02

The Admissions briefing now moves directly from the analyst update into the
community operating data. The redundant Weekly operating brief title and date
strip are removed, Community census is renamed Community snapshot, and its
description now identifies the three measures shown by community. The analyst
lead is also easier to scan: active, accepted, scheduled, and date-pending
counts appear as four concise facts, while every accepted client remains tied
to a destination community in the detail bullets.

- source PR: `#115`; merge commit: `608f386d914c154c1be929558fc3e3f409ae47a2`
- ACR build: `cc58`
- image: `alamo-platform@sha256:ea6cb6b934c7c9f1e677781b19ae80e030e3376a0bf6a10ab20eafc4ee051a69` (tag `admissions-snapshot-1002`)
- active revision: `alamo-platform-prod-web--admissions-snapshot-1002`
- rollback image: `alamo-platform@sha256:2c1f28a4dd34be9e33cb24f7a4008407edafd330b6e8cae717862e6bc45a5cf6`
- active browser asset: `/assets/index-FezJ1hoL.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression pass. Signed-in production
verification confirmed the new heading and concise analyst copy, the removed
weekly framing, five governed community rows, and no Outreach navigation.

### Structured Admissions executive briefing — 2026-10-02

The Admissions analyst panel no longer compresses scheduled clients,
date-pending clients, and pipeline context into three paragraph-length bullets.
Scheduled move-ins now render as dated rows, accepted clients awaiting dates
have a separate readable list, and pipeline stage counts and community load
occupy their own section. The four-number executive lead remains at the top.

- source PR: `#117`; merge commit: `68a177f38a20ba112371e82e34f4abfb6a813053`
- ACR build: `cc59`
- image: `alamo-platform@sha256:f16e3ccd11af40ccc44fbceb40ae89dc4d65b6c04ea963ae7ccf5e264a0f67a0` (tag `admissions-briefing-layout-1002`)
- active revision: `alamo-platform-prod-web--admissions-layout-1002`
- rollback image: `alamo-platform@sha256:ea6cb6b934c7c9f1e677781b19ae80e030e3376a0bf6a10ab20eafc4ee051a69`
- active browser asset: `/assets/index-Cbci_OP4.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, production build, and the responsive
Admissions browser regression pass. Signed-in production verification
confirmed five scheduled rows, three date-pending rows, two pipeline rows,
the Community snapshot heading, and the absence of the retired weekly title.

### Conversational Admissions briefing and drill-downs — 2026-10-02

The Admissions analyst lead now speaks as a short operating narrative instead
of restating the dashboard in labeled columns. The detailed evidence below is
organized into a combined Admissions movement timeline, an accepted-client
scheduling queue, expandable community rows, and a collapsed action-only
attention queue. Community and client rows open the existing management chart
without duplicating the Pipeline board.

- source PRs: `#119`, `#120`; merge commits: `a9e2d12ec6cddb64efb70047c14800a5ba80cc1c`, `f5ec62572d7edd81b065a06b00eb39888ad64c27`
- ACR build: `cc5b`
- image: `alamo-platform@sha256:6ebdeb79917737eface8f2d5fea84cc00c994c076fdbf0b37e76dc2fadc7cb33` (tag `admissions-drilldown-compact-1002`)
- active revision: `alamo-platform-prod-web--admissions-compact-drill-1002`
- rollback image: `alamo-platform@sha256:8af1e3c8a8826a9dcefffef53ae74ff29fae2c487572e092171d7828341cda0b`
- active browser asset: `/assets/index-B8FKlbJZ.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression pass. Signed-in production
verification confirmed five scheduled movement rows, five accepted clients
awaiting dates, five expandable community rows, a collapsed attention queue,
and successful management-chart opening from a community drill-down.

### Readable conversational Admissions update — 2026-10-02

The Admissions analyst update now renders each movement as its own short line
instead of joining client groups with semicolons. Client names retain the
strong reading hierarchy, destination community names use a consistent bold
Alamo-green treatment, and workload and stage context are split into plain
sentences. The release wrapper is also repeatable against a production image
that already contains the dedicated `/chat` and `/admissions` entry patch.

- source PRs: `#122`, `#123`; merge commits: `159db0167a8065095c832d821babccebbd0783f5`, `34146e851136d8527bfa5be3a8b6c07d7abab836`
- ACR build: `cc5d`
- image: `alamo-platform@sha256:af126b3ffa343c76d4f4fbd9b373927a470ad8e68ed11560de71254cafe59c7e` (tag `admissions-readable-chat-1002`)
- active revision: `alamo-platform-prod-web--admissions-readable-1002`
- rollback image: `alamo-platform@sha256:6ebdeb79917737eface8f2d5fea84cc00c994c076fdbf0b37e76dc2fadc7cb33`
- active browser asset: `/assets/index-DVGG8n2l.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression pass. Signed-in production
verification confirmed seven concise answer lines, zero semicolons, bold
client names, five bold green community references, and the active release
asset.

### Admissions response header removal — 2026-10-02

The decorative analyst avatar and `Admissions analyst` role label have been
removed from the Admissions briefing. The response now starts directly with
the governed summary, preserving its one-time typing treatment and the
line-by-line details beneath it.

- source PR: `#125`; merge commit: `607a691862b4b55906aac8e1f5f8973678f92a07`
- ACR build: `cc5e`
- image: `alamo-platform@sha256:d60363b738d94b056a71e65ed41d3a7c6fa085a97b07892802dc39e07899469c` (tag `admissions-no-analyst-label-1002`)
- active revision: `alamo-platform-prod-web--admissions-no-label-1002`
- rollback image: `alamo-platform@sha256:af126b3ffa343c76d4f4fbd9b373927a470ad8e68ed11560de71254cafe59c7e`
- active browser asset: `/assets/index-CFFuXwmo.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression pass. Signed-in production
verification confirmed the summary begins the panel and both retired header
elements are absent.

### Date-aware Admissions briefing — 2026-10-02

Forward-looking Admissions surfaces now use the current Los Angeles calendar
date. Past planned dates are excluded from the analyst schedule, Admissions
movement list, community upcoming-admit counts, and community activity
drill-downs. Same-day records read as `Today`; accepted records that still
carry a past planned date are reported separately as requiring move-in outcome
confirmation.

- source PR: `#127`; merge commit: `76bc64b409b74ece8f0a2c4a967a376faee68f57`
- ACR build: `cc5f`
- image: `alamo-platform@sha256:f2f747f38910a126a27e1b69d906db008b3519ab1a97d520add5c0a84ded7a32` (tag `admissions-date-aware-1002`)
- active revision: `alamo-platform-prod-web--admissions-date-aware-1002`
- rollback image: `alamo-platform@sha256:d60363b738d94b056a71e65ed41d3a7c6fa085a97b07892802dc39e07899469c`
- active browser asset: `/assets/index-DvvW6n9g.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. The responsive Admissions browser regression,
admissions-dashboard contract check, TypeScript, code-health, and production
build all pass. Signed-in production verification on October 2 confirmed only
October 2 and later dates in the forward schedule, two current calendar rows,
three past-dated accepted records in the explicit confirmation line, and zero
October 1 rows in the movement list.

### Natural-language Admissions briefing — 2026-10-02

The Admissions briefing now reads as four concise paragraphs instead of a
generated checklist. Same-day move-ins share one grammatical sentence, the
next scheduled movement and later calendar activity are summarized together,
accepted-client follow-up is consolidated, and workload and pipeline context
appear in one closing paragraph. Repetitive `Also` openings have been removed.

- source PR: `#129`; merge commit: `ad59ee20e807a9531318fc50cab277c6dc892492`
- ACR build: `cc5g`
- image: `alamo-platform@sha256:5f1a6a28cc4a0bd9c67c9fafe6e4ef2ce41cde673ee610e2357974b870e896de` (tag `admissions-prose-1002`)
- active revision: `alamo-platform-prod-web--admissions-prose-1002`
- rollback image: `alamo-platform@sha256:f2f747f38910a126a27e1b69d906db008b3519ab1a97d520add5c0a84ded7a32`
- active browser asset: `/assets/index-Be3GIeKZ.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression pass. Signed-in production
verification confirmed the four-paragraph briefing, consolidated current and
future movement sentences, current date handling, and no use of `Also`.

### Automatic stale-client recovery — 2026-10-04

An already-open signed-in Admissions tab was observed still rendering the old
briefing even though Azure was running the newer image. Reloading that exact
tab immediately adopted the current bundle, proving that the deployment was
healthy but the long-lived SPA client had not rechecked the release entry
point. Azure revision health alone was therefore insufficient verification.

The shared browser runtime now compares its loaded content-hashed JavaScript
entry point with the current no-store production entry document at startup,
on focus, visibility, and reconnect events, and once per minute while visible.
It reloads the current URL once when those paths differ. The service-worker
cache generation advances from v6 to v7, and the behavior remains independent
of service-worker availability.

- source PR: `#131`; merge commit: `f667ee836aff8dbbe0743d231ac7791ef84e09de`
- ACR build: `cc5h`
- image: `alamo-platform@sha256:f1053d5a693c9fdd7284c20709db67cc6bc2b9777238d655e43876adf50713d5` (tag `stale-client-refresh-1004`)
- active revision: `alamo-platform-prod-web--stale-refresh-1004`
- rollback image: `alamo-platform@sha256:5f1a6a28cc4a0bd9c67c9fafe6e4ef2ce41cde673ee610e2357974b870e896de`
- active browser asset: `/assets/index-DcWGrpE5.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. Identity, gzip, and Brotli production HTML all point to
the same active browser asset, `/sw.js` serves cache generation v7, and a
controlled browser test confirmed that a simulated newer entry bundle causes
the current client URL to reload automatically. Desktop readiness, TypeScript,
code health, the Admissions dashboard contract, documentation, production
build, and compression reconciliation checks pass.

### Admissions executive dashboard scale — 2026-10-04

The Admissions briefing now reads as an executive dashboard rather than one
long operating report. The briefing prose, movement detail, community metrics,
and management-chart drilldowns remain intact, while the operating content is
split into large in-place Movement, Communities, and Attention views. Type,
spacing, event rows, census measures, and phone touch targets are enlarged so
each view has one clear focal point on desktop and mobile.

- source PR: `#133`; merge commit: `b8262dd4af9b46fb93b9331108ae6cfaf1af7a21`
- ACR build: `cc5j`
- image: `alamo-platform@sha256:c20f762a6300f148e194c17e2afd007965109b8e947c29d70035363e4cb1e050` (tag `admissions-dashboard-scale-1004`)
- active revision: `alamo-platform-prod-web--admissions-scale-1004`
- rollback image: `alamo-platform@sha256:f1053d5a693c9fdd7284c20709db67cc6bc2b9777238d655e43876adf50713d5`
- active browser asset: `/assets/index-BQhaYp01.js`

The revision is Healthy/Running at 100% traffic. The production browser asset
matches the reviewed local build byte-for-byte through identity, gzip, and
Brotli delivery; the anonymous API health probe remains fail-closed with 401.
TypeScript, code health, the Admissions dashboard contract, production build,
and responsive browser regression all pass. The browser regression now covers
dashboard view switching, community drilldowns, minimum type scale, and
phone-width horizontal overflow.

### Admissions dashboard color system — 2026-10-04

The enlarged Admissions dashboard now uses restrained color to identify its
operating views without adding solid brand-green panels. Movement uses soft
blue, Communities uses pale sage, and Attention retains warm amber. The page
canvas is a warm neutral; the analyst update uses a subtle multi-tone wash;
community activity measures use quiet blue and sand treatments. All colors are
secondary to the existing type hierarchy and governed content.

- source PR: `#135`; merge commit: `66bbd241fabb4dfefdd302e0fe9c7f932c0a9dd0`
- ACR build: `cc5k`
- image: `alamo-platform@sha256:e74af55f1404e75a10fedd0d1e27d7bc2fee12750ac76af6742ec60d879d7864` (tag `admissions-dashboard-color-1004`)
- active revision: `alamo-platform-prod-web--admissions-color-1004`
- rollback image: `alamo-platform@sha256:c20f762a6300f148e194c17e2afd007965109b8e947c29d70035363e4cb1e050`
- active browser asset: `/assets/index-CtEBLCrX.js`

The revision is Healthy/Running at 100% traffic. Production identity, gzip,
and Brotli responses reconcile byte-for-byte with the reviewed local build,
and the anonymous API health probe remains fail-closed with 401. TypeScript,
code health, the Admissions dashboard contract, production build, and desktop
and phone browser regression all pass.

### Admissions movement coordination view — 2026-10-04

The Admissions Movement view now explains what management should coordinate
instead of rendering a plain event list. It leads with a current operating
takeaway, adds a textured seven-day activity lane, preserves exact scheduled
assessment and move-in drilldowns, and keeps accepted clients without dates in
a separate scheduling queue. A clear calendar, a missing Pipeline board, and
missing schedule coverage now render as distinct states; unavailable coverage
is never presented as zero activity.

- source PR: `#137`; merge commit: `9ef94e34bbd28debd5b8b2082666ed71268855ff`
- ACR build: `cc5m`
- image: `alamo-platform@sha256:bd7bc3a1307e910caf9180bee34a4283d5976d65a0b5a790e0ce808f0b3e9bdc` (tag `admissions-movement-1004`)
- active revision: `alamo-platform-prod-web--admissions-movement-1004`
- rollback image: `alamo-platform@sha256:e74af55f1404e75a10fedd0d1e27d7bc2fee12750ac76af6742ec60d879d7864`
- active browser asset: `/assets/index-O9DL_NSF.js`

The revision is Healthy/Running at 100% traffic. Production identity, gzip,
and Brotli responses reconcile byte-for-byte with the reviewed local build,
and the anonymous API health probe remains fail-closed with 401. TypeScript,
code health, the Admissions dashboard contract, production build, desktop and
phone visual QA, and responsive browser regression all pass.

### Admissions component texture system — 2026-10-04

Movement, Communities, and Attention now retain the same executive typography
and layout system while using distinct visual materials. Movement uses a blue
planning-board edge, calendar dots, and blueprint motifs. Communities uses an
organic sage edge, circular forms, and a dotted operational drilldown.
Attention uses a warm amber edge and quiet diagonal paper texture. These are
restrained orientation cues, not solid brand-color panels.

- source PR: `#139`; merge commit: `e3ba356c2c6b09f27dda996cc4d738b8cda58982`
- ACR build: `cc5n`
- image: `alamo-platform@sha256:491914f11cf57f1e5d7263e5a750a6d2b81632132438905335b32ef707dbbe79` (tag `admissions-texture-1004`)
- active revision: `alamo-platform-prod-web--admissions-texture-1004`
- rollback image: `alamo-platform@sha256:bd7bc3a1307e910caf9180bee34a4283d5976d65a0b5a790e0ce808f0b3e9bdc`
- active browser asset: `/assets/index-CMjZqqyL.js`

The revision is Healthy/Running at 100% traffic. Production identity, gzip,
and Brotli responses reconcile byte-for-byte with the reviewed local build,
and the anonymous API health probe remains fail-closed with 401. TypeScript,
code health, the Admissions dashboard contract, production build, desktop and
phone visual QA, and responsive browser regression all pass.

### Grounded Admissions schedule and open fields — 2026-10-04

The abstract Movement view is replaced by a literal Schedule with separate
lanes for upcoming assessments, planned move-ins, and accepted clients that do
not yet have a date. The Schedule view is omitted when it has no actual work,
so an empty decorative component does not displace the Community snapshot.
The editorial Attention view is replaced by Open fields, which states only
unresolved record fields already present in Pipeline and preserves Pipeline
order. It does not calculate or display an inferred priority score.

- source PR: `#141`; merge commit: `56895afb5ec97f76cbb99f15289cfedf693cd7ee`
- ACR build: `cc5p`
- image: `alamo-platform@sha256:dfa3deb18404d8acc6a2d52f77eb34dd32e86f4e7619636b3dc02f1f1c30e841` (tag `admissions-schedule-grounding-1004`)
- active revision: `alamo-platform-prod-web--admissions-grounding-1004`
- rollback image: `alamo-platform@sha256:491914f11cf57f1e5d7263e5a750a6d2b81632132438905335b32ef707dbbe79`
- active browser assets: `/assets/index-lUhAbQEM.js` and `/assets/index-DES-ycMx.css`

The revision is Healthy/Running at 100% traffic. Production identity, gzip,
and Brotli responses reconcile byte-for-byte with the reviewed local build,
and the anonymous API health probe remains fail-closed with 401 and `no-store`.
TypeScript, documentation, code health, the Admissions dashboard contract,
production build, desktop and phone visual QA, and responsive browser
regression all pass. The broader analyst suite reaches the repository's
pre-existing `check:unused` package-metadata warning and stops there.

### Admissions Briefing default and deep-link refresh — 2026-10-04

`/admissions` now opens on Briefing without a query string. Pipeline remains
available through the explicit, reload-safe `?view=pipeline` URL. The frontend
build also refreshes the physical `/admissions/index.html` and
`/chat/index.html` route entries so a direct deep link cannot retain an older
browser bundle from a previous overlay.

- source PRs: `#143` and `#144`; merge commits: `ae2ad5b98b8931bb4780ec2e5a917fb7c839b8fc` and `99c2657a47806e47e4681aa1e91a1d26fd1b83c7`
- ACR build: `cc5r`
- image: `alamo-platform@sha256:bb99f444ce0025f71a08f9895d9ff52df92b9cde8dfd153a1312df050c7d8b9f` (tag `briefing-route-refresh-1004`)
- active revision: `alamo-platform-prod-web--briefing-route-1004`
- rollback image: `alamo-platform@sha256:dfa3deb18404d8acc6a2d52f77eb34dd32e86f4e7619636b3dc02f1f1c30e841`
- active browser assets: `/assets/index-BvasIC3Z.js` and `/assets/index-DES-ycMx.css`
- superseded intermediate image: `alamo-platform@sha256:c701319930edc7df7492756a056d6d5181206a3eccb15ade48036bf01c64063d`; do not use it for rollback because its direct nested route entries are stale

The final revision is Healthy/Running at 100% traffic. Direct requests to `/`,
`/admissions`, and `/chat` all identify the same active JavaScript and CSS.
Production identity, gzip, and Brotli responses reconcile byte-for-byte with
the reviewed local build, and the anonymous API health probe remains
fail-closed with 401 and `no-store`. TypeScript, source syntax, documentation,
code health, Admissions access and dashboard contracts, production build, and
responsive Admissions browser regression all pass.

### Admissions move-in schedule reconciliation — 2026-10-04

The Admissions executive update, Schedule move-in lane, Community snapshot
counts, and Community drilldowns now use one canonical accepted-client move-in
schedule. The current Pipeline board determines which accepted clients have a
current or future planned admission; covered briefing rows can enrich those
records with readiness details but cannot remove a move-in named in the
executive update. When the Pipeline board is unavailable, the page falls back
only to a covered briefing slice rather than implying complete data.

- source PR: `#146`; merge commit: `38c04690cdfaa3ba754532d006c099eb69ae82d5`
- ACR build: `cc5s`
- image: `alamo-platform@sha256:31b1ac20f887ede11d8505c09f7bb2d6924e426777d96209901b44d594f40f70` (tag `admissions-schedule-reconcile-1004`)
- active revision: `alamo-platform-prod-web--schedule-reconcile-1004`
- rollback image: `alamo-platform@sha256:bb99f444ce0025f71a08f9895d9ff52df92b9cde8dfd153a1312df050c7d8b9f`
- active browser assets: `/assets/index-DRAFD-5n.js` and `/assets/index-DES-ycMx.css`

The revision is Healthy/Running at 100% traffic. Direct requests to `/`,
`/admissions`, and `/chat` identify the same active JavaScript and CSS.
Production identity, gzip, and Brotli responses reconcile byte-for-byte with
the reviewed build, and the anonymous API health probe remains fail-closed
with 401 and `no-store`. TypeScript, source syntax, documentation, code health,
the Admissions dashboard contract, production build, and responsive
Admissions browser regression pass. A dedicated regression also proves that a
future accepted Pipeline move-in remains present across the executive update
and detailed dashboard even when the week-bounded briefing slice omits it.

### Workflow full-height shell — 2026-10-18

Workflow no longer renders the Platform navigation above its own sidebar and
header. Its dashboard and libraries use the full viewport, with a sidebar link
back to Platform home. Other Platform routes retain their navigation.

- ACR build: `cc8k`
- image: `alamo-platform@sha256:6e1cb0eaaacb8268509102eb43824a91729f7d5db20e6dc39401cc15311b6bf5` (tag `workflow-no-header-20261018`)
- active revision: `alamo-platform-prod-web--wfheader-1018-6e1cb0e`
- rollback image: `alamo-platform@sha256:551e826ba6dd003217f9d324839506c5d00620ec030e59f2b95dfec6cd46dd18`
- active browser assets: `/assets/index-DTI8tOeS.js` and `/assets/index-CVYv3UsE.css`

The revision is Healthy/Running at 100% traffic. Direct `/workflow`, `/home`,
`/admissions`, and `/healthz` requests return 200. TypeScript, production build,
and local desktop/mobile route checks pass.

### Workflow role, procedure and knowledge content — 2026-10-18

The live native `/workflow` page now includes the authored content in its existing
Documents repository and linked knowledge workspace: 16 role guides, 32 workflow
summaries, 17 assessor procedures (81 steps), and 40 read-only AlamoAgent skill
references. All 105 records carry source and review information. Readable document
views, full-text filtering and Markdown downloads are connected. The existing role
library and procedure walkthroughs remain available. These are deployed content
snapshots; draft labels do not indicate clinical approval or new agent execution.

- browser source: `9eca43b`; content-integrity check follow-up: `b336856`
- branch: `codex/workflow-native-20261018`
- ACR build: `cc8m`; tag: `workflow-library-20261018`
- image: `alamo-platform@sha256:e100d97f394db9a7027bede75c8ef2c96cc582d9d73186b4ed55dfb1f008d624`
- revision: `alamo-platform-prod-web--wflibrary-1018-e100d97`
- rollback image: `alamo-platform@sha256:6e1cb0eaaacb8268509102eb43824a91729f7d5db20e6dc39401cc15311b6bf5`
- browser assets: `/assets/index-DQMVecW-.js`, `/assets/index-CWHiuZIC.css`

Verification: deterministic content/source hashes and graph links, frontend and
server TypeScript, source syntax, lint, code health, retention, unused/duplicate
code, dependency audit, documentation and production build passed. Desktop and
390px browser checks verified document reading, download, linked knowledge view,
no horizontal overflow in document detail and no page errors. Public `/workflow`,
`/home`, `/admissions` and `/chat` returned the new entry bundle for identity, gzip
and Brotli requests; live JS/CSS hashes match the reviewed build. `/healthz` returns
200 and anonymous `/api/platform/health` remains 401.

The full predeployment gate was not completed: after correcting the intentional
imported-data clone classification, `check:analyst` stopped in the unrelated live
analyst-decision check because local Databricks OAuth/PAT credentials are absent.
Production signed-in UI verification was unavailable in this browser session.
This scoped content release uses the exact preceding production image as its base,
replaces only browser assets, and preserves the Azure server, API, data adapters,
owner-only Workflow gate, Eric-only agent access and disabled emails.

### Workflow organization preview — 2026-10-18

Workflow now has an Organization view with an illustrated functional map, the
five canonical Platform communities, community team-layer drill-downs, search,
and a bounded question interface. The map labels executive functions as an
illustrative model; it does not assert personnel assignments, reporting lines,
or contact details. Unverified person-level questions receive an explicit
unavailable answer. `/workflow?view=organization` opens the view directly for
authorized users. The unrelated Platform assistant overlay is hidden inside
Workflow so it does not cover the organization tool.

- browser source branch: `codex/workflow-native-20261018`
- ACR build: `cc8n`; tag: `workflow-org-preview-20261018`
- image: `alamo-platform@sha256:05eff49e55eca5334f318d5a1eff94674f89632892d6df3eecc44caf30a4207b`
- revision: `alamo-platform-prod-web--wforg-1018-05eff49`
- rollback image: `alamo-platform@sha256:e100d97f394db9a7027bede75c8ef2c96cc582d9d73186b4ed55dfb1f008d624`
- browser assets: `/assets/index-_OnvK4l1.js`, `/assets/index-Bo3d6Wyv.css`

The revision is Healthy/Running at 100% traffic. Direct `/workflow`, `/home`,
`/admissions`, and `/healthz` requests return 200; an anonymous platform API
probe remains 401. TypeScript, production build, and desktop/mobile browser
checks pass, including map selection, community drill-down, chat grounding,
search, and no horizontal overflow.

### Workflow organization chart fit — 2026-10-18

The Organization map now uses a full-width two-tier chart with compact selected
details below it. The chart fits a 1280x800 desktop viewport without page scroll;
phone-width cards use one column. Community selection and the bounded Ask handoff
remain available.

- browser source commit: `16998de` on `codex/workflow-native-20261018`
- ACR build: `cc8p`; tag: `workflow-org-fit-20261018-16998de`
- image: `alamo-platform@sha256:c73c4a016549792382c696f5fe285934408cb51e0f1f958a5265b1eb5e5fc375`
- revision: `alamo-platform-prod-web--wforgfit-1018-c73c4a`
- rollback image: `alamo-platform@sha256:05eff49e55eca5334f318d5a1eff94674f89632892d6df3eecc44caf30a4207b`
- browser assets: `/assets/index-6U5VSFY_.js`, `/assets/index-BR6uz8Qm.css`

The revision is Healthy/Running at 100% traffic. Direct
`/workflow?view=organization`, `/home`, `/admissions`, and `/healthz` return 200.
Standalone Workflow build, lint, role-library check, and desktop/mobile chart
interaction checks pass. This release replaces browser assets only and keeps the
prior production server and access controls.

### Workflow Organization banner removal — 2026-10-18

Removed the dark banner from both Organization map and Ask views. The view now
starts with its tabs directly beneath the Workflow page bar; no chart data or
question behavior changed.

- browser source commit: `822f023` on `codex/workflow-native-20261018`
- ACR build: `cc8q`; tag: `workflow-org-nohero-20261018-822f023`
- image: `alamo-platform@sha256:a7bbb932b88792b92bbcd8d55d641f1be425191367b66a2688c9ac26ec871ba0`
- revision: `alamo-platform-prod-web--wforgclear-1018-a7bbb9`
- rollback image: `alamo-platform@sha256:c73c4a016549792382c696f5fe285934408cb51e0f1f958a5265b1eb5e5fc375`
- browser assets: `/assets/index-DlVZTx5S.js`, `/assets/index-BvVW_C7J.css`

The revision is Healthy/Running at 100% traffic. Direct
`/workflow?view=organization` returns 200. Standalone Workflow build and lint,
Platform production build, and local map/Ask browser checks pass. This release
replaces browser assets only.

### Workflow Organization control cleanup — 2026-10-18

Removed the redundant map title/section strip and preview status copy. Search
now shares the Map/Ask tab bar, and the chart begins immediately beneath it.
The footer caption retains the limitation that connections are functional,
not verified reporting relationships.

- browser source commit: `df1c3ff` on `codex/workflow-native-20261018`
- ACR build: `cc8r`; tag: `workflow-org-clean-20261018-df1c3ff`
- image: `alamo-platform@sha256:37f5b0a8cb1684cd040a0805ecc323206fdc817f9bfbb1d65f5c893500cebb09`
- revision: `alamo-platform-prod-web--wforgclean-1018-37f5b0`
- rollback image: `alamo-platform@sha256:a7bbb932b88792b92bbcd8d55d641f1be425191367b66a2688c9ac26ec871ba0`
- browser assets: `/assets/index-D1rMfEXK.js`, `/assets/index-CIdc-mKE.css`

The revision is Healthy/Running at 100% traffic. Direct
`/workflow?view=organization` returns 200. Standalone Workflow build and lint,
Platform production build, and desktop/phone layout checks pass. This release
replaces browser assets only.

### Client-first incidents and Personnel — 2026-10-18

The executive incident workspace now opens on linked clients, with incident
records one level deeper and the portfolio history still available. Display
aliases use “Passed on meds” and “Difficult interaction” while preserving source
categories and the original LIC 624 form. Workforce is presented as Personnel;
the former route redirects. The release also retains the already-live
given-administrations-only medication presentation and the newer Workflow
experience.

- source commit: `314732a` on `codex/incident-personnel-release-20261018`
- ACR build: `cc8v`; tag: `incident-personnel-1018-314732a`
- image: `alamo-platform@sha256:d482a6e04fbdcccc582b3d66789e9908bf34bfa0b868a54330a381a3c0411d8b`
- revision: `alamo-platform-prod-web--incper-1018-314732a`
- rollback image: `alamo-platform@sha256:150a51e82b5211f9cad3d152b6de5edb510d9fd00ff100c210cf3f152379fe7c`
- browser assets: `/assets/index-XALn5riT.js`, `/assets/index-CsdqTfOV.css`

The revision is Healthy/Running at 100% traffic. `/healthz`, `/personnel`,
`/executive/dashboard`, `/executive/licensing`, `/incidents/history`, and
`/workflow` return 200; the served JavaScript bundle matches the tested build
byte for byte. TypeScript, docs, build, executive desktop/mobile, Personnel
demo, LIC 624 upload/review, portfolio incident history, mobile route,
incident-contract, MAR, and query-intent checks pass. The broader analyst suite
remains red on an unrelated hard-coded resident ranking assertion that no longer
matches the live data; this release used the focused checks above.

### Executive incident, MAR, and mobile refinement — 2026-10-18

The San Pablo executive overview shows the three latest incident months above
the client-first incident list. Medication administration shows given counts by
month, while its MAR detail adds facility-scoped resident given counts for the
rolling 7 and 30 days. Mobile spacing and reading order were refined in the
executive, Personnel, analytics, and assistant surfaces. No source incident
categories or original LIC 624 form fields were changed.

- source commit: `1281ff3` on `codex/incident-personnel-release-20261018`
- ACR build: `cc8w`; tag: `exec-mobile-1018-1281ff3`
- image: `alamo-platform@sha256:141a41d0198c957b70b17c4480fe9bb24ba455090ea4317c28417073357894e6`
- revision: `alamo-platform-prod-web--execmob-1018-1281ff3`
- rollback image: `alamo-platform@sha256:d482a6e04fbdcccc582b3d66789e9908bf34bfa0b868a54330a381a3c0411d8b`
- browser assets: `/assets/index-sXfS0zgi.js`, `/assets/index-Ddzh_mH1.css`

The revision is Healthy/Running at 100% traffic. `/healthz`,
`/executive/dashboard`, `/personnel`, `/analytics`, `/executive/licensing`,
`/incidents/history`, and `/workflow` return 200. Root, Admissions, Chat, and
Executive serve the same tested entry bytes; the JS and CSS bundles match the
local build byte for byte. Anonymous executive API requests return 401 with
`private, no-store`. A signed-in production pass confirmed the three incident
columns and MAR resident given counts. Executive contract and responsive
browser checks, 72-route mobile QA, Personnel demo, reports, native LIC 624,
type, docs, dependency, source-health, and build checks passed. The full
predeploy gate was also run with the existing local Databricks credentials and
stopped at the same unrelated hard-coded resident-ranking assertion documented
above; the release used the passing focused checks and live verification.

### Monday Admissions ribbon — 2026-10-18 Pacific

Platform Home now shows a compact Monday-only census briefing ribbon in Pacific
time. It opens the existing Platform Admissions view and can be dismissed for
that Monday. This browser-only release did not change Admissions data, the API,
AlamoAgent access, or Workforce activation.

- source commit: `d9cc0a0` on `codex/monday-briefing-ribbon-20261019`
- ACR build: `cc8x`; tag: `monday-ribbon-1019-d9cc0a0`
- image: `alamo-platform@sha256:04b265edc130c866da37eaa2fd6032c174eab33e1178da4a35e2bc163bd6c65e`
- revision: `alamo-platform-prod-web--monday-1019-d9cc0a0`
- rollback image: `alamo-platform@sha256:141a41d0198c957b70b17c4480fe9bb24ba455090ea4317c28417073357894e6`
- browser assets: `/assets/index-CHHJoMOx.js`, `/assets/index-bvNVQero.css`

The revision is Healthy/Running at 100% traffic with the same replica scale.
Public `/healthz`, `/home`, `/admissions`, `/analytics/agent`, and `/personnel`
return 200; anonymous Admissions API access returns 401. Root, Home,
Admissions, and Chat entry bytes match the local candidate in identity, gzip,
and Brotli representations, and the JS/CSS entry assets match byte for byte.
The focused Monday desktop/320px/390px browser flow, Admissions browser and
dashboard checks, 72-route mobile QA, TypeScript, docs, dependency audit, and
production build passed. The full predeploy gate stopped at the same existing
resident-risk test that expects a fixed ranking from changing live data; neither
that test nor the ranking runtime changed in this release.

### Combined Admissions and census briefing — 2026-10-18 Pacific

Platform Admissions now opens a weekly view that combines its governed community
census with Pipeline's recorded admits last week, planned admits this week, and
active clients by stage. Source and county appear with each client when present.
The previous detailed Schedule, Communities, and Open fields views remain
available. Older Pipeline feeds retain the previous Admissions narrative.

- source commit: `7f59d86` on `codex/combined-admissions-briefing-20261019`
- ACR build: `cc8y`; tag: `combined-admissions-1019-7f59d86`
- image: `alamo-platform@sha256:510964a9ef6d0e9c3233066da2929bb045b7d7083191b80d4c2a349597a21d89`
- revision: `alamo-platform-prod-web--combo-1019-7f59d86`
- rollback image: `alamo-platform@sha256:04b265edc130c866da37eaa2fd6032c174eab33e1178da4a35e2bc163bd6c65e`
- browser assets: `/assets/index-Cp8aR-SR.js`, `/assets/index-WUf3Xm9K.css`

The new revision is Healthy/Running with 100% traffic and unchanged replica
scale. Public `/healthz`, `/`, `/home`, `/admissions`, `/analytics/agent`, and
`/personnel` return 200; anonymous Admissions API access returns 401. Root,
Home, and Admissions entry bytes match the built candidate, as do the served
JavaScript and CSS assets. The Admissions entry also matches under gzip and
Brotli. The protected Pipeline bridge contract, desktop/320px/390px combined
briefing, existing Admissions browser flows, legacy narrative fallback,
TypeScript, server types, docs, production build, and high-severity dependency
audit passed. A read-only probe from the running production container confirmed
the configured Pipeline endpoint returns 200 with contract 3.2 and both new
journey arrays; it printed only status and contract metadata. The full analyst
suite reached the same unrelated live-data resident-ranking assertion recorded
above; it was not changed for this release.

### Workflow shared authoring and publication — 2026-10-19, not deployed

Implemented in `/Users/eric/alamo-platform-workflow-native-20261018`. The standalone
preview on port 3015 still uses its local adapter. No Container App image, traffic,
Workflow enablement flag, staff grant, agent connector or email setting was changed
for this milestone. The deployed snapshot reader remains separate.

**Configured Azure storage:** private container `workflow-content` on account
`alamodatalake`. Platform runtime identity `alamo-platform-prod-runtime`
(principal `f71a7a56-a544-40cd-b3b4-bd5e3afacc64`) has Storage Blob Data Contributor
only at that container's scope. Existing account/container permissions were
preserved. Account blob/container soft deletion is seven days; blob versioning
is not enabled. Application-managed immutable revisions provide recovery history.

The adapter requires `WORKFLOW_CONTENT_ENABLED=true` and
`WORKFLOW_STORAGE_CONTAINER=workflow-content`, plus existing Azure storage
settings (`AZURE_STORAGE_ACCOUNT`, managed identity mode/client ID in production).
Both Workflow settings remain absent from production. Empty
`WORKFLOW_ACCESS_GRANTS_JSON` grants the verified owner the four pilot permissions;
a configured JSON map keys exact lowercase `tenant-guid:object-guid` to a subset
of `read`, `contribute`, `review`, `publish`. Missing/invalid grants deny access.
The existing owner gate still applies even if a non-owner has a grant. Neither
role labels nor Workforce records grant access. The owner can author and review
in this pilot; independent reviewer separation and staff scope are future work.

**Versioned contract:** `/api/platform/workflow/v1/session`, `/drafts`,
`/drafts/:uuid`, `/knowledge`, `/knowledge/evidence`, `/knowledge/impact`,
`/knowledge/proposals/:uuid`, `/published`, `/published/:uuid`. All require verified
delegated Entra identity and return private, uncached responses. Development auth
bypasses and app-only tokens are rejected. Every mutation uses an expected record
revision and a conditional aggregate write. Review notes and actors are retained;
forged actor/scope fields are rejected. Document and relationship decisions are
separate. Publication freezes only an approved content version and explicitly
selected approved connections. Published detail verifies direct target freshness;
withdrawn relationships retract affected publications. A library target stays a
draft reference even when its relationship is approved. Listing publication
metadata is not a substitute for the detail endpoint's freshness checks.

**Storage/recovery:** `workflow/v1/<sha256(tenant-guid)>/head.json` points to
`revisions/<sha256(serialized-state)>.json`. Snapshot creation uses If-None-Match;
head advancement uses If-Match (or If-None-Match for a new workspace). Only a
successful head update accepts an operation. Losing writers may leave orphan
candidate snapshots; do not treat all archives as accepted history. The accepted
aggregate contains immutable document/proposal revisions, publications, retractions
and raw source evidence. There is no local fallback, automatic pruning or deletion
endpoint. Pilot bounds are 16 MiB per aggregate, 200 document revisions and 50
connections per publication. Capacity errors preserve existing accepted records.

If a head is missing while archives exist, requests fail closed instead of
initializing an empty workspace. Disable the feature for recovery, preserve a
copy of any damaged head, and recover the last known accepted head from soft
deletion/backup or a verified recorded hash. Verify the snapshot's digest and
tenant scope, restore the head conditionally, then check revision history and
published evidence before re-enabling. Do not guess the accepted head from blob
timestamps: an orphan candidate may be newer. A snapshot/hash failure requires
operator recovery. Do not erase the container to reset the application.

**Verification:** `npm run check:workflow-publication` covers separate approvals,
permission denial, scope isolation, concurrent decisions, stale evidence,
retraction, policy dependencies, storage failures/recovery and API release patching.
`npm run check:browser-workflow-publication` uses the shared browser harness with
an isolated synthetic identity/store, exercising desktop/mobile create, connect,
submit, two review decisions, publish, reload, cited read and retract. It does not
validate real-owner Entra sign-in. Screenshots are under
`generated/workflow-publication-browser/`.

An explicit synthetic Azure check ran against the actual dedicated container:
`WORKFLOW_AZURE_CHECK_WRITE=true WORKFLOW_AZURE_CHECK_ACCOUNT=alamodatalake
WORKFLOW_AZURE_CHECK_CONTAINER=workflow-content npm run check:workflow-azure`
(as one shell command). The receipt at
`generated/workflow-publication/azure-check.json` confirms concurrent initialization,
conditional publication with one winner, cited retrieval in a fresh Node process,
immutable archives, missing-head denial/recovery and withdrawal. Synthetic records
were removed. This uses the operator's Azure CLI identity; the production runtime
managed-identity grant is configured but must still be exercised during rollout.

**Release preparation:** `deploy/Dockerfile.workflow-content-release` overlays the
validated browser bundle, Workflow modules and three pinned content snapshots on
an explicitly supplied current production digest. Its patcher inserts only the
new API prefix into the existing live API handler and fails if the expected
boundary changed. It preserves the newer `/api/platform/workflow-knowledge` reader,
other API routes, auth and agent runtime. Build with current compressed browser
assets; `/workflow` must remain a SPA fallback. No environment setting is enabled
by building this image.

Before promotion, reconcile the browser source with the current live release and
unrelated work in this checkout; do not promote this working tree wholesale. On
2026-10-19 production had advanced to `alamo-platform-prod-web--dnm-1019-dd8b554`,
image digest `7f94313ee5f1a18171291cf6f49c9268fba10cc9388a2decba92b5cbc56462e8`.
Re-read the live digest for any subsequent release. Targeted Workflow tests,
typechecks, docs, retention and build pass. `check:analyst` passed syntax, lint,
code health, retention, unused, duplicate, registry/capability and presentation
gates, then stopped at `check:analyst-decision` because this checkout has no
Databricks OAuth/PAT configuration. Complete that environment-dependent gate
before claiming a full Platform release validation.

A future owner-only rollout must verify real Entra sign-in, anonymous/non-owner
denial, runtime managed-identity storage access, signed-in create/review/publish
and exact cited retrieval across a new container process, mobile navigation,
identity/gzip/Brotli entries, existing Workflow snapshot-reader behavior and
Platform health. Do not invite staff or add an agent consumer as part of that
rollout. Record image/revision, health and rollback evidence. Rollback disables
`WORKFLOW_CONTENT_ENABLED` and restores the preceding image digest while preserving
all Workflow storage and revision history.


Local release-package verification succeeded against the recorded `7f94313e…`
base. Image `alamo-workflow-publication:verify` imports both the existing live API
and the added Workflow adapter. GET/PUT/POST anonymous Workflow calls each returned
401 using the packaged production auth implementation. The packaged catalog has
255 entities and 570 links; the existing snapshot-reader delegation is retained.
This image was built locally only, not pushed or promoted. Browser source
reconciliation and real-owner/runtime-identity acceptance remain outstanding.


### Owner-only Workflow authoring and publication — deployed 2026-10-19

At the user's explicit request, the shared Workflow pilot is now enabled only
for Eric through Platform. The server requires delegated Entra sign-in, the
existing owner gate, and an explicit grant for tenant
`d72d9036-cff8-4f5f-a6fa-d698f621d420` / user object ID
`f73371d5-d2b4-48b4-a32b-1edc7c88869f`. No other user, group, or app-only consumer
was granted access. Role labels and matching email addresses cannot substitute
for that exact grant. Existing agent snapshot reading remains separate.

- Release source: `f3ea3fe8e174a137dadb78a02397a8cef8fc8bb9` on
  `codex/workflow-owner-publication-20261019`, based on current Platform source
  `4a363b1`. The latest Admissions UI and Workflow citation behavior are retained.
- Image: `alamo-platform@sha256:54bb80c29f1606a21d2015feb85ccd245373dc803d200577a28ea5fbe6f2288e`
  (tag `workflow-owner-20261019`; built locally and pushed to ACR).
- Revision: `alamo-platform-prod-web--wfowner-1019-f3ea3fe`.
- Status: Healthy / Running, 100% traffic, unchanged application replica settings.
- Rollback image: `alamo-platform@sha256:eef986c7dc34fb4ecf1daa38f57ff2d94dc036f049fb710bb41c257b2da7bd04`.
- Runtime settings: `WORKFLOW_CONTENT_ENABLED=true`, dedicated private
  `WORKFLOW_STORAGE_CONTAINER=workflow-content`, and a one-entry
  `WORKFLOW_ACCESS_GRANTS_JSON` granting Eric read/contribute/review/publish.

Verified the public `/workflow?view=drafts`, `/workflow?view=knowledge`, `/home`,
`/admissions` and `/chat` entry documents against the built bytes using identity,
gzip and Brotli responses. Served JS/CSS hashes match. `/healthz` returns 200.
Anonymous Workflow GET/PUT/POST and invalid bearer tokens return 401; responses
are private and uncached. Existing protected Admissions and Workflow snapshot
endpoints still reject invalid tokens. Inside the actual running revision, the
managed identity wrote/read/deleted an isolated synthetic blob in the private
container, and the configured access policy accepted only the exact owner ID.
The synthetic probe was removed; no operational SOP was created or approved.

The 11 publication/access/storage/patch tests, full desktop/mobile publication
flow, existing Workflow citation flow at 1440/390px, Workflow source integrity,
Platform API boundaries, types, docs, source health, lint, retention, unused code,
duplicate checks, dependency audit and build passed. The full predeployment gate
ran with configured Databricks credentials and reached the previously documented
resident-ranking assertion in `check:copilot-tools`; the same failure was
reproduced on unchanged production source. No ranking code or test was changed.
The full postdeployment gate reached the same unchanged resident-ranking
assertion. Its result is separate from the passing live checks.

Real-owner browser acceptance remains pending sign-in: saved authentication state
could not restore its session, and the in-app browser is at Microsoft sign-in.
Do not describe the full signed-in publish/retrieve loop as verified on production
until that session is completed. The synthetic browser loop and actual managed
identity storage probe establish their respective boundaries only.

Receipts: `generated/workflow-publication/deployment.json` in the integration
checkout and `generated/workflow-live-checks.json` in the generated release export.
The exact release tree is preserved in Git; unrelated development changes were
excluded from the release. Rollback restores the recorded image and removes the
three `WORKFLOW_*` settings added here, preserving all stored content/history.

### Capture and guided SOP integration — prepared source, not deployed, 2026-10-19

The integration checkout now reuses canonical Workflow's existing capture import
and guided SOP editor within the authenticated owner review/publication flow.
`src/features/workflow/authoring-contracts.v1.json` pins six portable validation,
rendering and type files. Refresh them explicitly with
`npm run workflow:refresh-authoring-contracts`; verify the imported hashes with
`npm run check:workflow-contracts`, adding `--strict-sources` to the underlying
`node scripts/workflow-authoring-contracts.mjs` check when the canonical sibling
checkout is present. `WORKFLOW_AUTHORING_SOURCE_ROOT` can select that source for
the maintenance script; it is not a server runtime dependency or setting.

The API accepts bounded capture imports and optional schema-v1 SOP structure.
It retains original evidence across revisions, derives the rendered body, checks
required fields at review/publication, and freezes the approved structure and
source with an explicit renderer version. An identical import returns the latest
existing document without replacing edits or writing another revision. Conflicting
IDs, stale writes, malformed structures, foreign capture references and corrupted
retained evidence fail closed. Existing free-text records remain supported; no
rewrite of existing records, library revision, identity grant or Azure setting
was made. The 17 assessor procedures and 81 steps are unchanged.

Verified in this checkout:

- All 16 Workflow publication/access/storage/contract tests pass, including the
  new capture/SOP lifecycle, concurrency, lost-response recovery and integrity cases.
- The synthetic desktop/mobile browser flow passes import validation and retry,
  guided editing, exact-quote proposals, separate reviews, publication/reload,
  cited reads, mobile navigation, later draft edits and idempotent reimport. The
  legacy free-text publication/retraction flow also passes. Desktop/mobile
  screenshots in `generated/workflow-publication-browser` were inspected.
- Strict contract-source checks, the 105-record library check, frontend/server
  typechecks, source syntax, JavaScript lint, code health, retention, unused-code,
  duplicate, tool registry, capability and presentation checks pass. The Platform
  build passes with its existing chunk-size warning. Canonical Workflow strict
  role/source validation, lint and build also pass.
- `check:analyst` reaches `check:analyst-decision` and stops because this checkout
  has no Databricks OAuth/PAT credentials. This is not a full Platform gate pass.
- The local `linux/amd64` image `alamo-workflow-capture:verify` builds over the
  earlier local publication verification image. It imports both APIs, validates a
  synthetic capture, renders an SOP, retains 255 library entities/570 links and
  returns 401 for anonymous Workflow GET/PUT/POST through the packaged API. The
  release overlay now explicitly packages both portable runtime contract modules.

This image is a local packaging check, not a release candidate: the integration
checkout also contains unrelated work. Nothing was pushed or deployed, and the
new format was not exercised against live Azure or with a real signed-in owner.
The earlier owner-publication release receipt above does not establish availability
of this addition. Screenshots, AI drafting, automatic graph extraction and agent
consumption remain planned.

Next release: read the current live digest/source, reconcile the browser and API
changes into an isolated release tree, run the required release gates, then verify
real-owner import/save/review/publish/retrieve and runtime storage across process
restart. Preserve the exact owner grant. Before accepting structured writes,
verify that the retained rollback version understands the new optional records;
never roll back by deleting or flattening stored evidence. Keep original state
revisions and the prior image. No staff or agent expansion is part of this slice.

## Client flow community and county report — 2026-11-19 candidate

The Clients report now has a year-to-date admission/discharge equation, community
comparison, ranked admission counties, discharge timing, and searchable stay
lists. Selecting a community scopes every section of this report. The source
includes the current partial month through the published snapshot date.

The source change is isolated from existing production overlays. Prepare with
`CLIENT_FLOW_BASE_IMAGE=<current immutable production image>` and
`npm run release:client-flow-report:prepare`. The preparer verifies that the live
browser bytes match the pinned image, replaces only the existing flow component,
and preserves the surrounding bundle prefix and suffix. Its Docker overlay
contains the flow stylesheet, two entry documents, the new browser bundle, the
report owner, and the existing API route's year argument. It does not rebuild or
replace Carelog, Fleet, Workflow, or other application runtime files.

Data publication extends the existing daily episode history with admission
county, county provenance, and prior placement. Two privately documented reviewed
resolutions fill blank counties only; matching requires the original history ID,
resident, facility, and admission date. The resolution table is private governed
data and is never packaged into the browser or repository. Raw ElderMark values
win when populated. The QA step checks duplicate episode keys and conflicting
resolution rows before publishing. An initial QA execution failed because two
aggregate queries lacked the scalar helper's required column alias; both aliases
were corrected and the failed tasks were repaired without publishing the failed
run.

The prepared overlay base and rollback image is
`pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:8eaf6e2bb6361663992e44fcd7ecb853f9fe086bfeb87caa9f41ca365423add3`.
Preparation is not deployment. Final gate results, snapshot verification, and
cutover status are recorded below when completed. Private evidence is under
`generated/client-flow/`; it includes the exact source backups, checksums,
publication run, SQL fixture, API checks, and release recipe. Restore the three
prior notebook sources and rerun the governed publication path if data rollback
is required. The added fields are backward compatible with the existing app.

Data publication completed successfully in Databricks run `238701591367497`
(repair `725545725086097`). Snapshot `2026-11-19T18:02:19.219916+00:00` has
412 admissions, 286 discharges, 18 admission counties, and five reconciled
community scopes. The stay spine is byte-for-byte equivalent after omitting the
three new enrichment fields. All 412 admissions have a known county. The new
report's local desktop/phone, keyboard, search, pagination, scope-change, failed
refresh, and recovery paths were inspected; the source build and focused report
and API checks pass. Application cutover remains subject to the full release gate.

Application cutover completed at the owner's explicit follow-up instruction to
"just deploy" after the separate automation sign-in could not be captured. The
existing signed-in Chrome session was used for the live verification; no
production authentication setting was changed.

- Revision: `alamo-platform-prod-web--client-flow-1119-b7a7c2d`.
- Image: `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:e2a0e3b24e9596530ac83cb1bf1e281739fe43ebe5dbf31b49c694b867a8652f`.
- Azure reports Healthy/Running, one replica. Live JavaScript and stylesheet
  bytes match the prepared overlay. Public smoke passes 4/4; anonymous access to
  the report API returns 401.
- Eric's existing session shows the updated Clients report, all five expected
  community admission/discharge totals, San Pablo's 80-discharge list, seven
  Contra Costa admissions, and the 126-stay moved-in-and-out list. No browser
  console errors were observed. Private proof is `generated/client-flow/live-report.jpg`.
- This is not a claim of a completed automated full ship gate. The first ten
  predeploy stages passed. The chat reload test then timed out waiting for
  unrelated agent network activity; its route-ready and unchanged session-reset
  assertions pass after replacing the network-idle wait. Stages 12–14 passed,
  including 72 mobile route checks and 58 desktop/mobile question-family checks.
  The remaining suffix continues separately. The fresh signed-in automation
  was not captured; manual signed-in verification above is recorded explicitly.
- The local auth recorder now reports its non-sensitive route/state and fails
  promptly if its temporary window closes. This test-only change is not part
  of the production image. The prior immutable image above remains the rollback.


## Ally model controls installed with execution disabled — November 22

The independent API and canonical worker now run engine 0.18.5 from `5a8b624`.
API image `493ae5884d4629326300566ededeb731cce6c379841a57e410031bb04e208be0`
is Healthy at 100% on revision `alamo-ally-prod-api--runtime-0185-1122`.
The canonical worker ZIP hash is
`17a4f112572dc64cf6038c3b1a66f75617898a80c863666a538b1d6855c02d1b`;
128 runtime files, ten functions and exact unchanged settings are verified.
Dispatch and both schedules remain disabled. Source records/grants and the
Eric-only allowlist are unchanged. This is installed code, not enabled reports.

The corrected Platform image is pushed at
`56919745c78533e7f81d87d91c5e4896dfd0c4e435414fb6989dc70401e25e0d`;
its plan preserves the current Carelog base/rollback `b958cb49939c895b56a7c2f032c0208863efb0a5b726a29c00862f47117c59dd`.
No Platform release has occurred. The current full predeploy gate stopped in
`check:everyagent-conversations` on the duplicate-send response assertion.
Its conversation/store/persistence source is byte-identical to engine 0.18.3;
20 subsequent full focused runs and 20 direct duplicate-send probes passed.
The failure cause remains unconfirmed. The test now records response status/body
on failure without changing the assertion. Preserve
`generated/executive-ally-predeploy-1122-first-failure.json` and the failed log;
rerun the entire required gate before deploying the prepared image.

The main-Chrome live map is signed in as Eric and shows the expected five
communities. The required automated production smoke check failed because
`.auth/alamo-production-storage-state.json` is absent. No main-browser session
was exported; manual sign-in is not the automated gate. Real corrected-answer
and cache acceptance are still pending. No paid model calls ran during this
update: the unchanged $10 campaign retains 218 reservations totaling $5.758482.

The [suite recovery commands](/Users/eric/suite-deploy/README.md#corrected-runtime-installed-execution-disabled--november-22)
and [canonical engine status](/Users/eric/CareEngineMain/ally/docs/build-spec.md#november-22-0185-installation--execution-still-disabled)
record the named images, disabled execution and old-runtime recovery limits.

## Ally queued-stop correction installed — November 22

The independent API and canonical worker now run 0.18.6 (`f68c0f1`). Same-host
report/index writes queue before reading their snapshot; cross-process conditional
writes and their retry limit remain unchanged. A queued Durable activity checks
the disabled flag before advancing and pauses through the existing fenced service.
All 38 executive checks, the full engine suite, API/worker builds, isolated package
checks and eight real-Functions/Azurite cases pass. The fixture uses a ten-second
work-item visibility lease for crash redelivery; it does not claim production
recovery latency. Prior startup/visibility-timeout failures are retained.

API image `32d03f4cd41950f4b4336ec95e89985de976ab60d75c7eda1314753edfb79cd7`
is Healthy at 100%. Worker ZIP
`fe039f9dafab4a8ae38ed50b00d58f7182f861f95694d33b80b99a9a620463c4`
matches all 128 canonical files and ten functions. Settings, credentials and
Eric-only scope are preserved; execution and both schedules remain disabled.
An immediate EPIPE was resolved with read-only verification, without redeploying.
The release owner binds the corrected Platform pilot to these fresh receipts.

The current full Platform predeploy rerun passed its complete analyst stage,
including duplicate conversation sends, and continues. Platform stays on its
existing Carelog coverage image. Its local runtime pin remains 0.18.4/core 0.2.12;
the 0.18.6 changes affect the independent execution/storage host only.

The owner explicitly requires main Chrome. That session signs in as Eric and
loads the live map; no isolated sign-in window or credential export is used.
This is distinct from the automated signed-in smoke gate, which has no saved
session. Corrected real-answer/cache tests and executive expansion remain open.
There were no paid calls: the same campaign retains 218 reservations/$5.758482.

## Corrected Ally main-Chrome acceptance and recovery — November 22

The full corrected candidate predeploy gate passed 28/28 at 09:06:22 UTC
(`generated/platform-ready/latest.json`, SHA-256
`15c8c5ed3867ef052c5fd13b741128280ff72a7ef05312d3d3b8deff1897e080`).
Public production smoke passed 4/4. Owner-only image
`56919745c78533e7f81d87d91c5e4896dfd0c4e435414fb6989dc70401e25e0d`
ran on `alamo-platform-prod-web--ally-corrected-1122-863f038`.

Eric's existing main Chrome completed six real aggregate questions plus a repeat.
Growth, exclusive Pipeline stages and eighteen county rows matched their sources.
Delay causes were correctly left unknown. Occupancy and freshness each withheld
one finding; their exact rejected proposals were not retained. Synthesis reuse,
reopening saved reports after reload and native PDF export passed. This is manual
signed-in acceptance, not the separate automated signed-in smoke gate. No test
window or credential export; no broader executive access or source mutation.

The pilot was restored to the previous Carelog coverage image
`b958cb49939c895b56a7c2f032c0208863efb0a5b726a29c00862f47117c59dd`, revision
`alamo-platform-prod-web--pre-ally-restore-1122`. At 10:01:01 UTC the exact original
configuration (with that revision suffix) matched, one Healthy revision held
100% traffic, health returned 200 and anonymous bootstrap 401. The three temporary
source settings were removed. Azure rejected the original rollback suffix for
exceeding its revision-name length; the canonical helper now uses the shorter
suffix. No drift checks were removed.

The canonical independent worker 0.18.6 is restored: all 128 runtime files, ten
functions and original settings verified at 09:59:32 UTC. Dispatch and both timers
are disabled. A post-deploy EPIPE was resolved by read-only verification. The
source/model identities and grants are unchanged. During testing, a stale Durable
host kept earlier settings despite the verified package; a roughly 80–90 second
stop then start produced the verified new bootstrap. Treat that as one observed
recovery, not a universal wait or proof that control-plane settings drain work.

Thirteen paid calls cost an estimated $0.072084 using the campaign's reviewed
rates. The same $10 campaign retains 231 reservations/$6.132352 (not actual spend).
Read-only final run/lease and budget reconciliation receipts stay in suite `.state/`.
Private actual answers, agent review, screenshot and PDF live under
`/Users/eric/CareEngineMain/ally/generated/executive-evaluations/real-owner-corrected-20261122/`.
The [canonical engine status](/Users/eric/CareEngineMain/ally/docs/build-spec.md#november-22-corrected-main-chrome-acceptance--rollout-remains-closed)
records the open answer-quality and human-review work. Andrew/Sandeep remain closed.

Final acceptance cleanup at 10:04 UTC: zero active runs/model leases, canonical
worker disabled, prior Platform image healthy. All 231 cloud reservations were
returned to the local campaign ledger with the original prefix intact; the local
lock was released. Receipt: `/Users/eric/suite-deploy/.state/owner-0186-closed.json`.

## Ally pilot usefulness and corrected candidate — November 22

Eric reviewed the seven captured real-data results in main Chrome using the
unchanged native `ReportView` and `printReport` layout and answered “Useful for
an initial pilot.” The separate human receipt hashes the original results and
stored reports; it does not rewrite answers, agent verdicts or per-question grades.
This is overall usefulness acceptance for the captured 0.18.6 results, not fresh
0.18.7 cloud acceptance. The canonical spec retains that distinction.

The 0.18.7 Platform candidate from `6c7ae45` is pushed at
`89063699f25241170ef3934bb02268983683d524d4a6f2f1e8ce60355f0c2d30`.
Preparation verified the registry image, exact-file overlay and current production
base. Suite deployment's canonical helper now binds the new plan to the installed
0.18.7 API/worker and retains the complete predeployment requirement. Eleven suite
deployment tests pass. The full Platform predeployment run remains in progress;
no production cutover, new access or paid model call occurred in this preparation.

Live main Chrome confirmed the current Overview, Admissions and Clients reports,
five home communities, and `/analytics/community?community=337` navigation.
`/analytics/questions` returns to Overview; the old guide/carousel is absent.
Production smoke scripts still target those retired controls and the earlier
community modal. Preserve authentication, useful-ready, loaded-data, overflow,
navigation, console and request-failure checks when updating their assertions.
Do not reinstate the retired UI or mark those checks passed.

The supported main-Chrome tab console API was tested with a loopback fixture
returning deliberate 404, 500 and closed-connection responses. Only the fixture's
explicit completion log was captured; network failures were absent. Therefore
console-only observation cannot replace the existing request-failure checks.
The synthetic proof is `generated/main-chrome-diagnostics-proof/result.json`;
the server and tab were closed. The user requires main Chrome, so no isolated
sign-in window or credential export was used. A complete current-navigation and
network observation path is still required before the signed-in gate can pass.

Private review evidence:
`/Users/eric/CareEngineMain/ally/generated/executive-evaluations/real-owner-corrected-20261122/human-usefulness-review-20261122.json`.
The local native review stays available at `http://127.0.0.1:4383/`.
Candidate/rollback plan:
`/Users/eric/suite-deploy/.state/platform-production-ally-0187-1122.plan.json`.

## Current-navigation checks and design integration — November 22

The production navigation checker now follows the current report routes instead
of the retired carousel. It checks Overview, Admissions, Clients, Incidents and
Licensing, all five community reports and return links, the existing explorers
and Command Center. The two retired question entry routes must load Overview;
local guided-answer regressions remain in the predeployment suite. Readiness,
identity, error, loaded-record, performance and overflow assertions remain active.
Their common browser operations are exported for the supported main-Chrome
adapter; this never copies credentials or starts another sign-in session.

Fourteen synthetic assertion fault-injection tests pass. In main Chrome on live
`82069c2d`, all twelve route checks and twelve interactions passed. Home useful
readiness was 1,317 ms for `/` and 900 ms for `/home`, below the unchanged 5-second
budget. The initial test incorrectly waited on hidden map-description text and
required `/` to redirect; those test mistakes were corrected and the original
failure retained. An interrupted rerun is retained separately. There were zero
captured console errors. The native Network filter did not take effect (200 rows
remained visible), so this run does **not** prove absence of request failures or
complete the release gate. Browser controls were restored after the run.

Private evidence is `generated/current-navigation-20261122/main-chrome/`.
The user then requested integration of the new design in the separate Platform
chat. Its `codex/admissions-infographic-20261121` branch has additional committed
UI and active phone-layout work; the current live site does not contain that
design. Reconcile its final candidate with the newer engine pin and current live
Carelog files before another cutover. These browser results apply to `82069c2d`,
not to that forthcoming combined design.

Integration follow-up: design commits through `f369957` are merged, including the
phone workspace. The merge keeps runtime 0.18.7 and the shared active-intake
status/completeness guards. The release stylesheet filter uses the actual `href`
capture, preserving the Workflow layer without appending the previous main CSS.
Compatibility redirects retain saved Clients, Admissions and community links,
including scope/hash values; the browser fixture exercises all three redirects.
The current-navigation assertions now target the single header and community
modal, additionally requiring the three saved routes and exact report queries.
All fifteen assertion fault tests pass. Synthetic desktop/320/390px answer/report
and Admissions checks pass, as do bookmark flight, restore/Escape and focus
return. Combined source checks and live verification remain separate. Logs and
screenshots are in `generated/current-navigation-20261122/` and
`generated/platform-page-screenshots-2026-11-22/`. The other Platform chat owns
the current UI cutover; no competing deployment was made from this branch.

The executive service/browser fixture also passes at 320/390/1440px after fixing
the new expand control's target from 40px to the existing 44px minimum. It covers
lost acknowledgements, chart/value selection, saved reopening, version refresh,
follow-up, recipient controls, revoked access, shared links, PDF and cancellation.
The original target-size failure is retained; no assertion was relaxed. A clean
source build, TypeScript and documentation checks pass. The combined analyst
suite is still running; no all-checks or live-deployment claim follows from these
focused results.

The integration also restores the full community report reached by the live
map. Report query scope no longer opens a legacy popup, and the report reader
recognizes the community report and applies its validated community/period
parameters. The first browser failures exposed the missing report registration
and scope; they remain in the evidence directory. The corrected home check passes
all five scoped reports, legacy saved-profile drilldowns, desktop map geometry,
phone community/report fit, resident search and profile behavior. Its retired
question-carousel expectations were replaced by the current header, loaded
Overview/Clients, reload and both legacy question redirects. Existing data,
geographic, overflow and legacy-profile assertions remain enforced. The
`design-community-current-navigation.log` records the passing combined run.

Final design synchronization includes `3b74025` and its compact report controls.
The executive browser fixture passes again at 320/390/1440px, including assertions
that recipients and historical versions have no mutation controls even inside a
closed actions menu. Evidence: `design-final-report-controls.log`. The analyst
suite passed through answer quality, source authorization and workflow checks,
then identified two stale source assertions: retired Questions routing and the
former Home tab. Their replacements require the new Analytics redirects and
shared-header order while preserving the assessor-only navigation/API boundary.
The remaining analyst checks are running; the initial failures and continuation
logs are retained. Eric authorized the handoff, and the Platform chat accepted
the integration for its independently guarded UI release. This branch has made
no production cutover or model calls.

Integration validation is complete through `88f209c` (the final visual change is
`c1a813b`; subsequent changes update browser checks for the retained owner chat).
Every `check:analyst` component passed across the original run and the three
continuation logs in `generated/current-navigation-20261122/`. The initial
failures are retained, and only obsolete route/label assertions changed.
Coverage includes 635 context-fuzz turns, 1,800 transitions, 203 operator prompts
plus four follow-ups, 200 answer-shape checks, 42 workflow scenarios, 160 journey
fuzz turns, 83 stress turns, 200 cached routes without errors, 150 certified
prompt cases, 48 cache requests and three cache parity checks. Source, authorization,
scope, recovery and existing data assertions all remain enforced. The final
synchronized design typecheck and build pass; artifact logs have the
`final-synchronized-design-` prefix. Browser release gates remain with the
Platform chat. Its owner-chat performance check also requires the visible
composer or question guide, not merely the workspace shell, before measuring
useful readiness. Runtime/shared contracts/packages are unchanged by these final
UI and test commits. This is not a fresh live GPT or signed-in production pass.

Integration `160d305` subsequently merged design `f553f30`, which removes the
duplicate desktop follow-up field while preserving the phone controls. The
workspace and real-service/fictional-source browser suites passed again at
1440/390/320px; desktop and 320px report screenshots were inspected. Evidence:
`single-composer-workspace.log` and `single-composer-executive.log` in the same
generated directory. Native release artifacts below precede that CSS change;
rebuild them against the final source and actual post-design production image.

The former appended-panel preparation has been replaced by the native release
path below. The reviewed-current-image guard remains mandatory; old prepared
artifacts must not be promoted after another Platform/Carelog cutover.

## Native Ally release preparation — November 22

`prepare-executive-ally-release.mjs` now builds the existing native app and reuses
`prepare-platform-ui-release.mjs` for its browser overlay. It no longer patches
minified React internals, appends a second component tree, or installs a separate
Ally stylesheet/auth instance. Supply the reviewed `PLATFORM_UI_BASE_IMAGE`
immutable digest and the verified production `VITE_ENTRA_TENANT_ID`,
`VITE_ENTRA_CLIENT_ID` and `VITE_ENTRA_API_SCOPE`. The current live image, HTML,
entry asset and identity must agree before preparation; a final image readback
rejects a concurrent cutover. Public build inputs are fingerprinted in key order.
The current conventional `api://<client-id>/access_as_user` scope is supported;
any other scope must already occur in the live entry and requires explicit review.

With no mode flag, reports stay hidden; `--owner-pilot` configures only Eric's display
membership. The isolated `--enabled-preview` remains fictional and cannot be
deployed. Those modes do not create source grants, configure API membership,
install credentials, enable workers/schedules or reopen the evaluation campaign.
The source endpoint remains disabled without its separate runtime configuration.
The source bundle still reuses live governed readers and adds only the reviewed
API hook/export and exact CSP origin. Build/source hashes cover the actual native
chunks, package lock, pinned runtime and preparation owners.

Local image checks on base `82069c2d` compared all 19,462 inventoried files.
Only 43 disabled-mode / 44 pilot-mode files changed or were added; every other
file and image runtime setting matched. Native source-bound display tests cover
wrong subjects/tenants, signed-out accounts, missing configuration and both
restricted workspace types. The verifier rejects a second entry/panel, a prior
main stylesheet, unlisted paths, changed source/configuration and mismatched
compressed siblings. HTTP smoke covers Platform routes, licensing, Carelog,
anonymous protected-API denial and disabled/unauthorized source denial. These
are container/source checks, not fresh Microsoft or GPT acceptance.

Evidence is in `generated/current-navigation-20261122/native-*.log` and
`generated/executive-ally-release{,-pilot}/{receipt,verification}.json`.
The local verifier tags are `platform-executive-disabled:native-v0187` and
`platform-executive-pilot:native-v0187`. The current design chat owns the pending
UI cutover. Reprepare and reverify on its actual final live digest before any
Ally pilot deployment, preserving that exact rollback target and Carelog files.
No production deployment, source record change, grant or model call was made
while implementing this preparation path.

The final verifier passed again at 19:32 UTC. The owner artifact was rebuilt
from committed preparation `f951b1f`, producing local image
`sha256:9cd8d46fa5fe7bb6fd7fbc2280057148290ebe647ddd20d5c856d42d5d50d4dd`.
The disabled artifact also passed the final configured/unconfigured access
matrix. Documentation, JavaScript lint and all four mode tests passed. These
receipts remain local-only and require rebuilding after the pending UI cutover.

## Ally worker configuration diagnosis — November 22

At 17:44 UTC the canonical production worker was verified disabled after a no-op
configuration test. Both schedules stayed disabled throughout. Its real activity
observed the old flag shortly after both enable and disable, then adopted each
change. The [engine finding](/Users/eric/CareEngineMain/ally/docs/build-spec.md#november-22-worker-configuration-propagation--confirmed-without-report-execution)
records sampled times and the required activity-level activation/closure checks;
there is no claimed maximum propagation time. No production package changed.
All report/index/model-state hashes remained identical, zero source/model calls
occurred, and the same campaign remains expired. Staging was fully restored;
nine completed test histories were removed, preserving real report histories.
The focused engine suite passes 39/39, including stale delivery fencing.

Platform image/revision/source settings are unchanged from the recovery below;
health and `/poc/app/` return 200. Private receipts are in
`/Users/eric/suite-deploy/.state/worker-config-probe-prod/`:
`canonical-verification.json`, `canonical-restored.json`, `cleanup.json` and
`platform-unchanged.json`. This closes the configuration investigation, not fresh
answer acceptance or the signed-in current-navigation release gate.

## Ally 0.18.7 retest and concurrent release recovery — November 22

Full predeployment passed 28/28 at 16:34:58 UTC for packaged source `6c7ae45`.
The immutable gate copy is `/Users/eric/suite-deploy/.state/ally-0187.platform-predeploy.json`
(SHA-256 `89bc030d9d3e5f0b1c36d1c775bec72683488c32e8a7afaae8765d209e96028b`).
The owner-only image `89063699` deployed healthy at 16:46 UTC. Public smoke passed
4/4 and the aggregate source proof passed. These checks did not complete the
postdeployment signed-in gate or authorize Andrew/Sandeep.

Native Chrome Network, with recording and preserve-log enabled, showed 0/52
requests after excluding the recorded successful status codes. Checks covered
Clients reload, Home and two community pages. Console-only observation remains
insufficient; this native evidence proves a supported request-failure observation
path. It is not full route/viewport coverage. The console fixture, failed navigation
attempts and native evidence remain in `generated/main-chrome-diagnostics-proof/`.
DevTools was closed and its filter/preserve-log settings restored.

The first frozen real 0.18.7 question and two resumes paused before a model call.
The worker's disabled-host guard fired despite enabling configuration; stop/start
failed to establish working execution. The follow-up was not run. Original failed
attempts are retained, not graded as answers. The canonical worker was restored,
execution disabled, and the same cloud campaign explicitly expired. Final drain
and budget reconciliation passed with zero new model calls or reservations.

During this bounded test, Carelog `fbc258a` deployed image `c78c5e9d`, based on the
Ally pilot. The exact rollback guard rejected configuration drift. Recovery did
not overwrite that release: it rebuilds the prior Platform base `b958cb49` with
exactly its 461 current Carelog files, with no overlap with the Ally file list.
The manifest comparison verifies 19 Ally-only changes, every Carelog file unchanged,
and unchanged runtime configuration. HTTP routes, CSP and anonymous denial passed.

Verified at 17:08 UTC:
- Image `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:82069c2df4b6039d127431109044b4b1b593c3b233051f8379c63dc8d9930d70`.
- Revision `alamo-platform-prod-web--ally-closed-services-1122`, Healthy, single active, 100% traffic.
- Health 200, anonymous bootstrap 401, Carelog route 200.
- Temporary source settings and owner pilot display removed; all other runtime configuration preserved.
- Main Chrome remains signed in as Eric; Home has all five communities, the original entry bundle and zero horizontal overflow.

Recovery artifacts: `/Users/eric/suite-deploy/.state/ally-0187-recovery-preserve-carelog/`.
Final closure: `/Users/eric/suite-deploy/.state/owner-0187-closed.json`.
No source records, grants, emails or wider executive access changed. Canonical
worker 0.18.7 stays disabled. Resolve actual worker configuration recovery and the
obsolete signed-in test expectations before another release; a healthy recovery
is not an executive acceptance pass.

### ProForma guidance in the combined Ally release

`prepare-executive-ally-release.mjs` owns the single native UI release. Its
`prepare-proforma-guidance-overlay.mjs` helper patches only the deployed process
service, workflow routing, typed error handling and published-guidance reader.
The reader in `deploy/proforma-guidance-discovery.mjs` is a reviewed copy of
ProForma's `src/server/guidance-discovery.mjs`; update it explicitly from that
authoring source. No cross-application runtime or database client is imported.
The release fingerprints the copy and helper and verifies the exact delta
against the immutable live image. Existing authoring, review, publication,
owner authorization and storage stay source-owned.

Run `npm run check:proforma-guidance-overlay` before preparation. The image check
also exercises anonymous guidance denial and the native `/workflow` entry.
Signed-in acceptance must separately prove delegated Ally access, a current
publication citation and saved-chat reopen. Deployment-configured document IDs
only narrow source authorization; new guides require an explicit binding update.
A seeded demonstration or engineering tutorial is not approved clinical policy.

### Platform chart measure binding — November 23 candidate

The live census follow-up answered available beds correctly but rendered census
by default. ReportView now uses the validated API `measureKey` when the user has
not made an explicit choice. Old saved views keep their prior fallback. PDF uses
the same precedence. The browser regression supplies the independent API's new
optional wire field explicitly while retaining the host's real persisted fixture
service for retries, authorization, sharing and history.

Typecheck and the browser regression pass at 1440, 390 and 320 pixels, including
default and user-selected PDF measures, legacy views, historical version choices,
reopening and revocation. The 390px screenshot was inspected. Evidence:
`generated/current-navigation-20261122/platform-report-measure-browser.log`.
This entry records source validation, not deployment. The full gate is running.

### Ally complete-data analyst — November 23

Platform source/UI commit `2d683c5` deployed as revision
`alamo-platform-prod-web--ally-analyst-1124`, image
`pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:ee87ab9991fdf6420cf3dfcf66bb950797914b0ef68db066f92ecb6650c4f463`.
The full predeploy gate passed 28/28. Immutable comparison preserved 19,989 base
files except the 42 reviewed changes and retained runtime configuration. Main
Chrome verification passed 15 routes and 12 interactions: 615 network requests,
one cancellation, zero HTTP failures and zero console errors; postdeploy passed
2/2. Receipt: `/Users/eric/suite-deploy/.state/analyst-main-chrome-1124/evidence.json`.

Ally 0.18.16 source `b209813` uses API image
`alamoallywqqka6kfae5ma.azurecr.io/ally@sha256:066d4e3c130a622bd24039a27a26e6a4a5a6c5f0d2b2f0177823a16c0eef7afe`
and worker package SHA-256
`3f02099b0215bc71fbda37dc238f7859b054ebd0b557487f16cba2548dba63c4`.
The actual native activity proved adoption. Exact prior recovery CI source hashes
are in `ally-01816.evidence-reuse.json`; spending integration has separate tests
and live settlement evidence. All 20 original chats and prior ledger entries
survived the release. Four real turns matched independent age/incident calculations
and preserved contextual rewrite evidence; 16.582–32.829 seconds, $0.157062 total.
These are measured examples, not a general performance guarantee.

The exact six source grants (API/worker for Eric, Andrew and Betty) now include
discovery and the 28 reviewed Platform slices. Unlisted subjects/communities
remain denied. The publisher notebook preserves SELECT grants on view updates;
its exact exported hash is
`a39b5ca1076dd3bde35ad33c20c1de906655687e86f7334c3a5e8277e8bfe1fb`.
The scheduled job was not run during this release. Source records are unchanged.
Grant and notebook changes have conditional before/after recovery receipts.

Private evidence is under `/Users/eric/suite-deploy/.state/`: prefixes
`ally-analyst-final-runtime`, `platform-analyst-1124`, `analyst-publisher`,
`analyst-source-grants`, `analyst-source-acceptance`, `analyst-age-baseline`,
`analyst-incident-baseline`, `analyst-acceptance-1124`, and `worker-01816-adoption`.
The runtime driver supports conditional `restore`/`resume-restore`. Rollback API:
`alamoallywqqka6kfae5ma.azurecr.io/ally@sha256:e33fe2b1eaf4476cbfd2bb8eb624b18b7052c8d128bd2af7a2a4a87dd72087a0`.
Use the verified `ally-production-worker-01814-compatible.zip` alongside it;
plain 0.18.14 rejects the new spending receipts. Never reset or rewrite the ledger.
Platform rollback to the prior immutable image is separately guarded and must
preserve any intervening release. The report table rendering correction is a
separate UI candidate, not included in the image above.

### Ally prose table release — November 23

Source `d055533` adds the shared flat-table helpers and existing responsive report
renderer to saved prose. Test-only `7f203ec` fixes a measurement race: a transient
Latest button was detached between locator resolution and size measurement. The
check now queries and measures current visible controls in one DOM evaluation;
the touch-size threshold is unchanged. `platform-prose-table-1124.test-only-revision.json`
proves this changes no application or image bytes.

Deployed image:
`pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:31c8d8e3c8e9464b7ddbd6630949f32c87dd52ba7b85eff9fd8368045673d7ab`
Revision: `alamo-platform-prod-web--ally-prose-table-1124`.
Entry: `/assets/index-HVJ_pzpp.js`. Configuration and all non-overlay files are
unchanged: 19,995 base files, 40 browser-overlay files. The first verification
observed the old revision still draining; the subsequent read confirmed one
healthy active revision, 100% traffic, health 200 and anonymous API denial 401.
No update mutation was repeated.

The scoped predeploy gate passed 9/9 and postdeploy 2/2. Main Chrome checked
15 routes and 12 interactions, observing 466 requests, one cancellation, zero HTTP
failures and zero console errors. The actual saved age comparison displays the
five correct rows on desktop and five readable cards on 390/320px phones. History
is contained and scrollable, keyboard reopening works, and the pages have zero
horizontal overflow. No new model call was needed for these saved-report checks.

Private receipts: `/Users/eric/suite-deploy/.state/platform-prose-table-1124.*`.
The deployed-entry-bound browser evidence and desktop/phone screenshots are in
`/Users/eric/suite-deploy/.state/ally-prose-table-live-1124/`.
Conditional rollback uses the prior `ee87ab9991fdf6420cf3dfcf66bb950797914b0ef68db066f92ecb6650c4f463`
image through `deploy-platform-prose-table-1124.mjs restore`; it checks for
intervening configuration changes before applying. The analyst engine, sources,
permissions, grants, report content and spending ledger remain unchanged.

### Ally latency and build-cost release — November 23

Platform source `eb0eecc` is deployed as revision
`alamo-platform-prod-web--ally-speed-1124`, image
`pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:2d071a5b621b700118caa2a69d15afaede9a626f25a9a9e4d4a1d68f7b7526a7`.
The exact image diff contains only `server/ally-report-source.mjs`,
`server/ally-data-source.mjs` and `server/platform-agent-source-grants.mjs`.
Configuration, participants, all other files and entry `/assets/index-HVJ_pzpp.js`
are preserved. Source connections are reused, but grants remain fresh reads.
Canonical snapshot coverage, missing values and warehouse fallback are unchanged.

Ally source `fb5c7f5`, version 0.18.17, is deployed as API revision
`alamo-ally-prod-api--speed-01817-1124`, image
`alamoallywqqka6kfae5ma.azurecr.io/ally@sha256:168fca90a101a172eefa5e6bd7f2b8f4bb2316fe8f5546e889a910bf146e3cc1`.
Worker package SHA-256:
`977d88df141ac45b29119d334d678c6d4876dbdf3773ccd0e7a1a4954248ca7f`.
Independent reads are joined in bounded batches of three; authorization,
revocation, cancellation, checkpoint order and spending limits remain enforced.
Idle dispatch is two seconds. The first post-enable activity proved the running
host still used the paused configuration. A full stop/start cleared it; a fresh
activity then proved enabled execution with no source/model calls or record writes.
The first failed probe is retained, not marked as passing.

Engine full tests, packaging and real Functions-host recovery passed. Platform's
scoped predeploy gate passed 9/9; server typecheck and source checks were rerun
after the final projection edit. Postdeploy passed 2/2. The navigation component
reuses the still-fresh 03:11 UTC main-Chrome capture from
`.state/ally-prose-table-live-1124/evidence.json`: the entry, navigation assertions,
ordinary pages and their server files are byte-identical. This is evidence reuse,
not a new Network capture; macOS exposed no native Chrome window during this pass.
Fresh paid questions, source checks and desktop/mobile History observations cover
the changed Ally path. No capture timestamp, test threshold or assertion changed.

| Real question | Before | After |
| --- | ---: | ---: |
| Santa Clarita average age | 16.582s | 14.680s |
| Five-community age comparison | 32.829s | 22.914s |
| Rewrite the preceding findings | 16.235s | 15.679s |
| Yesterday's high-priority Santa Clarita incidents | 25.176s | 20.252s |

All four completed with correct source-backed results. The rewrite reused version
two's evidence. Eight model calls settled $0.156994. All 22 prior conversations
are unchanged; the tests added two conversations. Final readback found 24 chats,
zero active runs/leases and all 34 spending receipts settled. The existing
$199.09 credit allowance, expiry and three participants are unchanged. These
examples show an improvement, not a general latency guarantee; a cold warehouse
probe still took 13.761s. No clinical records or outbound messages changed.

Private receipts are under `/Users/eric/suite-deploy/.state/`, prefixes
`platform-ally-speed-1124`, `ally-speed-01817-runtime`, `worker-01817-fresh`,
`ally-speed-live-1124` and `ally-speed-1124.acceptance-summary`.
Platform recovery uses `deploy-platform-ally-speed-1124.mjs restore` and the prior
`31c8d8e3c8e9464b7ddbd6630949f32c87dd52ba7b85eff9fd8368045673d7ab` image.
Ally recovery uses `ally-speed-01817-runtime.mjs restore`/`resume-restore`, the
previous 0.18.16 API digest `066d4e3c130a622bd24039a27a26e6a4a5a6c5f0d2b2f0177823a16c0eef7afe`
and `.artifacts/ally-production-worker-01816.zip`. Both drivers check intervening
state and preserve existing records and spending.

GitHub cost reduction: Pipeline's scheduled no-op `Pipeline Guarded Codex Refactor`
workflow (344701215) is disabled; normal CI/security/deploy workflows remain.
Carelog's active Windows validation branch includes `6774877`: manual validation
defaults to candidate-only, with explicit published-baseline comparisons still
available, and PR diagnostic retention is seven days. PR harness checks, signed
x64/ARM64 release packaging, install/recovery and security checks remain. GitHub's
existing Actions budget blocked the two new Carelog cloud jobs before execution;
that is not a passing cloud check. YAML/trigger assertions ran locally. No Actions
budget increase, signed Windows rebuild or artifact purge was performed.


### Ally lossless snapshot release — November 24

Authorized by the owner request for faster accurate ordinary answers and standing
deployment approval. Platform source candidate `c8cd0383f344109237ca6ff5f5db0b47bb30f125`;
engine `0a3ba7f9d89efa87fb567c4cb4d48cbb994e0851` (0.18.18). No source-record,
source-grant, participant or UI changes. Eric, Andrew and Betty retain their
existing allowance and saved reports.

- Platform revision `alamo-platform-prod-web--ally-snapshot4-1124`, image
  `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:1c65830af9bbe895a8fc68fb359e0a3e312508fb0a662bb8f90e2d80d9d6a398`.
- Ally API revision `alamo-ally-prod-api--snapshot-01818-1124`, image
  `alamoallywqqka6kfae5ma.azurecr.io/ally@sha256:2efb6d77e19f935ce9ba0c759609adb5a6c6511a50d3ef38adbc52d208b88a1a`.
- Worker package SHA-256
  `2244c65f53266f9d27c4da1089db8d7499ffc4a64c4fec02d0b29246f80ffff8`.
  A native Durable activity proved enabled-branch adoption after stop/start.
- Canonical Databricks publisher QA run `844089458175866` passed both tasks;
  publish-only run `832824241106297`, task `144024801408862`, succeeded.
  Data date is November 23; UTC publication date is November 24.

The full data-publication predeploy gate passed 28/28. After the final type
narrowing, affected server/source checks passed again. Engine full tests,
build/package and native Functions recovery passed. Postdeploy resumed at the
production boundary and passed all four selected stages, including build; this
is retained predeploy evidence plus fresh postdeploy evidence, not a second fresh
31-stage run. Main Chrome observed 15 routes and 12 interactions, 617 requests,
one navigation cancellation, no HTTP failures and no console errors.

The first deployed Platform artifact preserved an obsolete release bundle and
rejected `prepare`. Before worker activation, the final artifact regenerated
`server/ally-report-source-release.mjs` from the tested canonical source. Its
SHA-256 is `dc8e4302fa8be4f8ea5d6023474e7960da16664d9002cefd08f3d74d3923a74e`.
Artifact-level tests verify the actual handler's prepare, authorization, revocation
and malformed-request behavior. The final image changes that bundle and four
reviewed raw server files relative to the original image; the browser entry stays
`/assets/index-HVJ_pzpp.js`, SHA-256
`d2ff3fa13d028384aee47a39e1eaa79327990ec9c0c9273d29e52345c7c00bf7`.

Private receipts in `/Users/eric/suite-deploy/.state/`:
`platform-ally-snapshot4-1124.verification.json`,
`ally-snapshot-01818-runtime.*`, `worker-01818-adopted.verified.json`,
`fast-snapshot.publication-verified.json`, `fast-snapshot.refreshed-tables.json`,
`snapshot18-source-acceptance.json`, `snapshot18-acceptance-1124.json`,
`snapshot18-main-chrome-1124/evidence.json`. Full snapshots contain private data;
do not commit them. All 24 conversations and existing spending receipts were
verified unchanged before the new authorized test questions.

Recovery: first restore the previous Ally 0.18.17 API/worker using the conditional
runtime driver. Retain API digest
`168fca90a101a172eefa5e6bd7f2b8f4bb2316fe8f5546e889a910bf146e3cc1`
and worker SHA-256
`977d88df141ac45b29119d334d678c6d4876dbdf3773ccd0e7a1a4954248ca7f`.
Then use candidate-4 and candidate-3 conditional Platform restore drivers in that
order to reach original image digest
`2d071a5b621b700118caa2a69d15afaede9a626f25a9a9e4d4a1d68f7b7526a7`.
Publisher and prior publication are backed up privately; do not overwrite a newer
publication or reset records, grants or spending during recovery.

Observed exact-repeat latency is 3.226s in Chrome, with zero model calls. Fresh
census/capacity/incident turns are 11–14s; the initial age turn took 16.341s
server-side. This is an improvement path, not a consistently sub-ten-second result.
The successful same-evidence rewrite and the rejected percentage-breakdown case
are recorded in the living spec; the latter remains an analytical-quality gap.

### Complete cohort source release — November 24

The owner's full real-data retest and existing deployment authorization cover this
source prerequisite. Candidate `0d64c7850452793c1db118bcb08d80108916576a`
provides warehouse-backed, revision-bound pages at the canonical analytical reader.
No business records, identity, participants, environment, secrets or credit
allowance were changed. The actual deployed image/imports were verified before
cutover; the frozen evaluation engine remains separate from production Ally.

- Revision: `alamo-platform-prod-web--ally-cohorts-1124`.
- Image: `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:350da8d2f55a5d0d3f4abd5a1f06bfbafe2d670e0863f688ee092188ac0e72fa`.
- Recovery image: `pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:83f4d2cf8abd2ca85f0f574c68109f61e55d561832b8d9f1cb841c3be86525b7`.
- Scoped predeployment: 10/10 stages, 125 seconds. Postdeployment: 2/2,
  46 seconds including browser capture; 18/18 production-boundary assertions.
- Main Chrome: 15 routes, 12 interactions, 622 captured requests, one expected
  navigation cancellation, no HTTP failures and no console errors.

Private receipts are under
`/Users/eric/suite-deploy/.state/ally-system-repair-20261124/investigation-v9/`:
`platform-intent.json`, `platform-image-proof.log`, `platform-deployed.json`
and `live-browser/evidence.json`. The retained native warehouse two-page proof
checks the whole-result count, identical content fingerprint and page boundary.
Restore only the image after checking the current revision; do not overwrite a
newer release, source publication or application configuration during recovery.

Full answer quality is being measured in the separate `retest-full-v10` run:
the original 50 conversations/156 turns, with unchanged questions and private
artifacts. Navigation and contract passes are not semantic-answer acceptance.
## November 24 investigation source release

Source commit `282a1417712deb9d496397174007b9386574f985` is deployed as
`alamo-platform-prod-web--ally-invest-v12`, image
`pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:95dcd4fab2635d7b6de70fa0c6d9791f257871240a4b69f080f2f2f362f9ea97`.
Rollback image:
`pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:350da8d2f55a5d0d3f4abd5a1f06bfbafe2d670e0863f688ee092188ac0e72fa`.

The pinned overlay changes 46 files for source byte paging, complete native
field/record collection and the registered calendar renderer. Existing host
configuration, identity and the other application assets are preserved. The
scoped gate passed 10/10 in 140 seconds; packaged file hashes/import passed.
Public production smoke passed 4/4. All three authorized executive source grants
and the Pipeline batch continuation passed against the deployed APIs.

Main Chrome completed Microsoft sign-in and displayed the authenticated map.
The native inspection call then timed out and the debugger detached; the full
Network/navigation capture and `ally-live` receipt are outstanding. This is a
partially verified release, not a completed release gate. Do not reuse a prior
browser receipt for this build. The independent engine remains at its existing
production version while the new candidate is evaluated separately.

Private packaging, before/after configuration, live-source and rollback receipts:
`/Users/eric/suite-deploy/.state/ally-system-repair-20261124/investigation-v12/`.

