# AlamoAgent build spec — source ownership

- purpose: point to the independent agent engine's single living build spec
- status: current ownership map; see release receipts for deployed capabilities
- owners: product and engineering
- updated: 2026-10-18
- tags: alamoagent, engine, skills, connectors
- labels: platform-handbook, current-state

The canonical [AlamoAgent build spec](/Users/eric/CareEngineMain/alamoagent/docs/build-spec.md)
now lives with the independent engine at `/Users/eric/CareEngineMain/alamoagent`.
Read its [editing guide](/Users/eric/CareEngineMain/alamoagent/README.md) and
[application connector guide](/Users/eric/CareEngineMain/alamoagent/docs/connectors.md).
Update that spec in every relevant change; do not start a competing Platform plan.

Current rollout evidence is recorded in [Ally readability and response latency](deployment-operations.md#ally-readability-and-response-latency--november-23). Older dated entries below retain their historical scope; they do not override the current release.

### November 23 readability and responsive data — deployed and verified

Canonical display labels now normalize database field names in new source datasets
and existing saved reports without rewriting evidence or changing field bindings.
Numbers and exact dates use the existing display conventions. At narrow container
widths, tables become labeled records; line-chart axes and date labels stay in
normal layout instead of shrinking SVG text. PDF exports retain complete tables.
Composer scope controls scroll within short viewports. Bounded browser fixtures
cover 320/390/1440px, long names, legacy keys, null/negative chart values and PDFs.
Source references are folded into one quiet Sources disclosure. Readable links
open the matching saved report section and restore keyboard focus on close.
Repeated citations, source-grain metadata, duplicate table captions and raw JSON
are removed from presentation; saved evidence and access checks stay intact.
Paragraphs, lists and bold emphasis render as text-safe native markup. Data limits
remain visible. Source `bf2335e` is deployed. All 28 predeployment stages and four
postdeployment stages passed. Main Chrome verified 15 routes, 12 interactions,
619 requests, one explicit cancellation and no console or HTTP errors. An actual
saved report passed readable labels/dates, collapsed sources, exact-section links,
keyboard focus restoration and zero horizontal overflow at desktop and 390/320px.
The normal viewport was restored. API/worker 0.18.13 is also live; the fresh
14.309-second answer is a measured sample, not a general speedup claim.

### November 23 executive expansion — live and verified

The owner explicitly authorized Eric Wilson, Andrew Dominici and Betty Dominici,
with the available prepaid credits replacing the owner-only 50¢ daily cap.
Betty's enabled tenant object was verified directly in Entra; the release switch
names only those three accounts. UI visibility, independent API membership and
source grants remain separate checks. The matching OpenAI project shows $199.09
available, auto-reload off and expiration December 17. API/worker 0.18.12 and the
three-account interface are deployed. All 24 source reads and denied-account,
private-slice and direct-storage boundaries pass; the 12 old reports and previous
spending ledgers are unchanged. The live planned-admissions answer and follow-up
settled four model calls at $0.020320 in the cumulative allowance. No purchase,
new top-up or outbound notification is authorized by this change.

### November 23 conversation UX — deployed and verified

The owner approved the continuous conversation pass after reviewing the live
report-first interface. The candidate keeps questions and earlier answers visible,
with a compact searchable History menu, one data-question composer, readable
findings, real execution states, Stop, and an optional native report reader.
General guidance chats remain accessible from History only for accounts with the
existing guidance capability; report-only executives do not see a denied shortcut.
New chat returns to data
questions without mounting a second composer. Report versions, source controls,
chart selections, sharing and freshly authorized PDF export retain their owners.

Earlier answers use the existing per-version authorized reads, rechecked on
visibility and every 30 seconds. Denied versions disappear independently; failed
current authorization still removes the conversation. The service's existing
12-version ceiling bounds these reads. At that limit the composer directs the
user to New chat instead of allowing a doomed submission. A higher ceiling
requires paginated history before expansion. Answers appear after validation, not token streaming.
Scope changes remain explicit, and these UI changes grant no additional access.
The initial 28-stage predeployment gate passed and this interface is live.
The actual two-answer thread exposed absolutely positioned accessibility labels
escaping the answer scroller and extending the enclosing dialog. The answer
scroller now establishes its own containing block. A short-height, multi-answer
browser regression fails before this correction and passes after. The replacement
is live: all 28 predeployment stages and four postdeployment stages pass. Main
Chrome verified 15 routes and 12 interactions with 635 requests and no console or
HTTP errors. Desktop, 390/320px phone, saved history and native PDF checks pass.
No labels, report behavior or source boundaries change. Immutable images, receipts
and rollback are in the [current operations record](deployment-operations.md#executive-ally-conversations--november-23).

### November 23 priority: Ally in Platform

The owner deferred ProForma acceptance to prioritize useful Platform data questions,
follow-ups, saved reports and exports. The deployed UI opens the existing report
composer directly, retaining optional general chat and the answer canvas. Pending
chat sends are visible immediately and automatic refresh waits for completion;
explicit authorization rechecks and cancellation remain available. Desktop and
phone report/chat checks pass. A bounded live census answer and follow-up passed. That test exposed a chart
measure mismatch; the live UI now honors the independently validated measure
binding in saved views and PDFs, with user choices taking precedence. The owner
authorized a 50¢ UTC-day pilot cap. API/worker 0.18.11 and the matching UI are
live; the actual enabled worker branch passed without model calls, and the
report scheduler is enabled. Ten fresh real answers now pass the checked figures,
scope and source-limit assertions, including community filtering, counties,
bed-days and current Pipeline stages. Twenty model calls settled at $0.112816
(1.13¢ per answer). Correct default chart selection and saved reopening pass. The native date control and saved two-page PDF now pass. Main Chrome's
source/build-bound final check passes all 15 routes and 12 interactions with
664 requests, one explicit cancellation, and no console or HTTP failures.
A real owner question about planned admissions exposed a source gap: only stage
totals were available. A local source correction now reuses the Admissions
weekly schedule for aggregate planned move-ins by community. Its focused checks
pass; release verification and a fresh live question remain required.
Broader executive grants remain off.
See the [current candidate and evidence](deployment-operations.md#platform-data-questions--november-23-local-candidate).

### November 23 combined ProForma release

The combined Platform design, native report/PDF/read-recovery changes and
ProForma integration are live for Eric's pilot from `8634641`, after the complete
predeployment gate. API 0.18.10 preserves report configuration and passes all five existing executive
source-access checks. Its live published-guidance answer completed and was saved;
a subsequent UI source recheck timed out. ProForma acceptance is deferred. The postdeployment gate stopped
after 19 passing stages when a resident-search test sampled the roster while it
was loading. The bounded readiness wait now passes all 8 scenarios / 19 turns without
changing its assertions or application behavior; stages 21–28 also pass. Stage 29 remains blocked on a complete native Network
receipt. All 15 live page checks and 12 navigation
interactions pass; complete native Network evidence remains outstanding.
Report execution and expanded executive access remain off. The
[combined release receipt](deployment-operations.md#combined-ally-and-proforma-release--november-23-preparing)
owns current deployment evidence and the usable rollback.

### November 23 Azure read deadline

The release run exposed an indefinitely stalled snapshot response. The local
reader is now reconciled with the exact deployed compression/identity/cache owner,
with a bounded 60-second read deadline and equivalent credential-constructor
consolidation. All three authentication modes have focused assertions.
The real-SDK stalled-response regression fails before and passes after; data,
authorization and recovery checks pass. The existing candidate is superseded,
not deployed. The [operations receipt](deployment-operations.md#azure-read-deadline--november-23-awaiting-release)
owns evidence and the replacement release status. Execution and broader grants
remain disabled. The repaired live-data context run passed 635/635 turns.
Carelog's concurrent 0.1.26 release is reconciled: all 153 changed files are in
its app/Fleet assets. Use the new `76f01e1d` production base and rollback image.

### November 23 PDF chart selection

The print renderer now receives the open report version's selected chart measures
after fresh authorization. A failing-before/passing-after browser check proves
that choosing Discharges exports Discharges; version isolation and historical
selection also pass. Typecheck, focused ESLint and rendered PDF review pass.
The previous full gate was deliberately stopped at 15 completed stages; its
`68437690` candidate lacks this correction. Replacement `0db1b47d`, from
`34f0df2`, passes exact-file/configuration/access/HTTP verification and is pinned
in Suite's `ally-native-1123-pdf` plan. Its complete release gate is running;
production and model execution are unchanged.
See the [PDF correction receipt](deployment-operations.md#ally-pdf-chart-selection--november-23-awaiting-release).

### November 22 Platform control cleanup

The Platform Ally UI candidate now starts with one centered composer in full
screen, then reveals the reading canvas with the first answer. Its empty chat and
answer canvas no longer present duplicate suggestion cards, disabled actions, or
a second question-library entry. New chat and history controls appear when there
is work to restart or revisit. An empty chat offers one Report action; the New
menu handles multiple kinds of saved work. Phone Chat/Answer tabs, source links
and reversible panel controls remain.
This is a Platform interface change only; the independent model execution and
schedules remain disabled and no additional user access is granted. Local
desktop and 320/390px fixtures verify the compact and expanded interaction.

### November 22 current navigation and requested design integration

The design is live on `555272da` after its full predeployment gate. The rebuilt
native Ally owner candidate preserves all 19,639 base files outside its reviewed
allowlist and passes container/access checks. Its full gate was stopped when the
design owner began a final live control cleanup. That cleanup, `d7a97a1`, is now
merged in `04f82fe`; the combined native image `68437690` passes preservation,
configuration and access checks against the unchanged live image. Its complete
predeployment gate remains incomplete after storage-token and cache-read failures.
Fresh credential and idle controls pass. Yielding to the event loop between
simulated turns now passes 635/635 twice; the longer run also verifies a successful
second token request after the five-minute cache expiry. Runtime authentication
is unchanged. The following full run passed that stage but stalled during cache
generation; its terminated failure is retained. An instrumented generation passed
all 200 entries. The cache batch now also yields between calls; its 200-entry
generation and existing 150-prompt/48-cache/15-live-turn/three-parity assertions
pass. A complete release gate is still required. The current
live design has passed all 15 routes, 12 navigation interactions and a complete
native Network/console observation in main Chrome. That evidence does not cover
the pending image. At 23:09 UTC the new explicit driver also passed 15 routes,
12 interactions, 604 requests and zero console/HTTP failures on the live design;
the canonical signed-in release command accepted its source/build-bound receipt.
No second UI-only cutover is needed. See the
[current preparation receipt](deployment-operations.md#native-ally-on-the-live-design--november-22-prepared-only).

Source audit correction: the executive ProForma adapter now supplies the
canonical knowledge request's required `version: 1`. Its signed-route regression
failed with 503 before the fix and passes with the real knowledge reader after
it. Draft status, scoped capability denial and versioned citations are preserved.
This belongs to the later native Ally release, not the design chat's running UI
cutover. See the [source correction receipt](deployment-operations.md#ally-proforma-source-contract-correction--november-22-not-deployed).

The approved Platform design and navigation checks through `f553f30` are merged into the executive
integration branch. It includes the shared header, Carelog-style Ally transition,
expanded answer/report canvas and phone Chat/Answer or Report controls. The merge preserves
the 0.18.7 engine pin and canonical active-intake classification/completeness
guards. Previously live Clients, Admissions and community report URLs retain
their scope through explicit redirects. Desktop/320/390px Ally and Admissions
fixtures pass; combined source checks and fresh live verification are recorded
separately. The Platform design chat owns the current UI deployment, avoiding
competing production cutovers. This merge does not activate model execution or
broaden executive grants.

The owner authorized sending the integration to the Platform design chat, which
has accepted it for its release. The compact report controls pass the desktop/phone
service-browser fixture, including hidden-menu permission checks. All analyst
checks now pass across the retained run and its continuations, after correcting
obsolete Questions/header source assertions without changing authentication or
assessor-only boundaries. The synchronized design builds and typechecks. The
release chat is completing the remaining browser gates; no production cutover or
fresh live-model acceptance is claimed by this integration branch.

The latest merge retains one visible follow-up input in the expanded report.
Workspace and saved-report browser checks pass again at 1440/390/320px, including
sharing restrictions, revoked content, retries, versioning, PDF and saved reopening.
These are local fictional service fixtures; the existing native image receipts
precede this final CSS change and must be regenerated before a pilot cutover.

Shared release assertions now run in main Chrome without exporting its session.
The restored live image passed twelve route checks and twelve interactions, plus
fourteen local assertion fault tests. Request-failure coverage remains unproved
for this run; the native filter did not apply. The owner has requested integration
of the Platform chat's separate design branch with this newer Ally implementation.
Preserve that design and its active phone work, the 0.18.7 pin, current Carelog
files and disabled production execution while reconciling the candidate. See the
[operations record](deployment-operations.md#current-navigation-checks-and-design-integration--november-22).

### November 22 native release preparation — local validation

Native release preparation now uses the existing Platform UI build and overlay
owner instead of appending a second panel to an old minified bundle. It requires
an explicit current immutable base and matching public Microsoft configuration,
fingerprints the native sources/assets, and preserves the live Carelog/runtime
files. Local disabled and owner-only containers pass exact-file, configuration,
display/access, CSP, route and anonymous-denial checks. This is preparation only;
after the design chat's cutover, rebuild against that reviewed live image and
complete main-Chrome acceptance before reopening the model pilot. See the
[native release receipt](deployment-operations.md#native-ally-release-preparation--november-22).

### November 22 worker diagnosis — rollout still closed

The canonical worker's actual activity confirmed delayed adoption of enabled and
disabled configuration. No package change is needed for that finding; activation
must prove the activity branch before scheduling reports. Stale-attempt probes
left all report and model-budget state unchanged, both workers are restored, and
all 39 executive-report tests pass. Platform stays on `82069c2d`; no source
settings or executive access changed. See the [operations receipt](deployment-operations.md#ally-worker-configuration-diagnosis--november-22)
and [canonical evidence](/Users/eric/CareEngineMain/ally/docs/build-spec.md#november-22-worker-configuration-propagation--confirmed-without-report-execution).
Current-navigation release coverage and fresh answer acceptance remain open.

### November 22 bounded retest — rollout closed

The 0.18.7 candidate passed all 28 predeployment checks and the aggregate source
proof, but the first real question and two resumes paused before any model call.
Stop/start did not prove working worker execution. No fresh answer-quality pass or
Andrew/Sandeep access is claimed. Canonical worker execution is disabled, the
cloud evaluation window is expired, zero active runs/leases remain, and the same
235-reservation campaign is reconciled without new spend or a reset.

A concurrent Carelog release inherited the temporary pilot image. Guarded recovery
preserved all 461 Carelog files while removing only the Ally changes and temporary
source settings. Production is healthy on `82069c2d`; signed-in main Chrome Home
works. Native Network inspection resolves the console-only observation limitation,
but the complete current-navigation release gate is still outstanding. See the
[retest and recovery receipt](deployment-operations.md#ally-0187-retest-and-concurrent-release-recovery--november-22)
and canonical engine spec for the next work and retained failures.

### November 22 embedded-date correction — local 0.18.7 package

This checkout now pins engine 0.18.7/core 0.2.13 from `831a93d`, archive SHA-256
`9ca0192b721d66cfbdac7d2e026d82a44741d64ff679880a047f50fd05afa50e`.
The installed core bytes match the tested engine build. Fresh model replays over
the recorded authorized source responses reproduced both withheld capacity-date
findings and a separately written timestamp. The canonical validator now recognizes
those exact source labels and removes their components from numeric operands.
Source date ranges, unspecified timezones, legitimate negative counts and altered
or uncited date denial have focused regressions; the cache policy changed to v2.
Four captured proposals (fourteen findings) validate, and the recorded 30-case
suite plus ten-turn conversation remain passing. The full engine suite/builds
and isolated package check pass. Platform source/flow/agent integration and its
218-dependency audit pass. New release preparation and full Platform gate follow.

The change does not edit application layouts, source data or grants. Production
Platform remains on the restored Carelog coverage image. Independent API/worker
0.18.7 is now installed with execution and schedules disabled; exact configuration,
128 worker files and ten functions are verified. No wider executive access or
fresh cloud acceptance is claimed. Main Chrome again signed in as Eric without
an isolated window or credential export. The automated signed-in gate remains
unpassed and needs its older layout expectations reconciled with current workflows.
See the [canonical correction and limits](/Users/eric/CareEngineMain/ally/docs/build-spec.md#november-22-embedded-source-date-correction--local-0187)
and the [installation receipt](deployment-operations.md#ally-0187-installed-with-execution-disabled--november-22).

Eric's November 22 review of seven captured real-data answers in the native
report view was “Useful for an initial pilot.” Overall usefulness is accepted;
fresh corrected-answer acceptance and the technical release checks remain open.
The canonical spec links the timestamped human receipt; captured answers and
per-question grades were not rewritten. This does not enable wider access.

### November 22 corrected acceptance — current status

The corrected candidate passed 28/28 predeployment checks and ran six real
questions plus a cache repeat in Eric's main Chrome. Saved-report reopening and
PDF export passed. Growth, Pipeline stages and counties matched the sources;
occupancy/freshness still withheld findings, and delay causes lack source detail.
The prior Platform image and disabled canonical worker are restored. No isolated
sign-in window, credential export or Andrew/Sandeep access was added. Manual
acceptance does not pass the separate automated signed-in gate. See the
[recovery and evidence receipt](deployment-operations.md#corrected-ally-main-chrome-acceptance-and-recovery--november-22)
and the [canonical next work](/Users/eric/CareEngineMain/ally/docs/build-spec.md#november-22-corrected-main-chrome-acceptance--rollout-remains-closed).
The preparation and earlier pilot observations below remain historical evidence.

### November 22 local corrections after real acceptance

The current unpromoted source normalizes the publisher's `Facility`,
`Facility_Name` and `Incident_Category` aliases before snapshot filters and
aggregation. Conflicting dimensions and missing required query fields fail closed.
The Admissions page and report source share one four-stage classifier and a
complete active-board check; the report no longer combines overlapping old board
columns with the producer's broader awaiting-admission metric. Truncated lists or
unmapped/conflicting community identities cannot claim a complete count.

The resident-flow report capability has explicit community, admission-county and
current-occupancy views, using the existing reconciled stay reader and operating
limits. County views follow the selected admission episode cohort and community
permissions. Occupancy states its current source date and refuses to reuse today's
limits as historical capacity. Missing coverage remains partial.

Focused source, stage, scheduling, dashboard and syntax checks pass with fictional
regressions, including privacy and scope failures. An aggregate-only real-source
inspection confirmed 28 assessed / 2 under review / 11 accepted among 41 active
records. These edits do not change the rendered Admissions page, user-facing copy,
records, grants or production deployment. This checkout now pins engine **0.18.4**
(core **0.2.12**) from engine commit `6b3a356`, with archive SHA-256
`465b9120c995ea79abf89e44132ba0fda6bf0c5eea7e2a1f52b95cc537ab767a`.
The installed validator and lockfile integrity match that archive. The engine
suite, API/worker builds, isolated package and Platform production-dependency audit
pass. The full `check:analyst`, `check:docs` and production build now also pass.
The owner overlay on the current Carelog base passes its exact-file/configuration,
access/display and served-header checks. Full release-gate and fresh real browser
acceptance remain pending. See the
[canonical correction record](/Users/eric/CareEngineMain/ally/docs/build-spec.md#november-22-real-source-corrections--local-0184-candidate).

The next package must preserve the independently deployed Carelog coverage image
`b958cb49939c895b56a7c2f032c0208863efb0a5b726a29c00862f47117c59dd`.
The preparer's original-base guard stopped as intended; its new base is supported
by an image comparison showing only Carelog asset changes and identical host
configuration. See the [reconciliation receipt](deployment-operations.md#carelog-release-preserved-for-the-next-ally-candidate--november-22).
Separately, the independent engine 0.18.5 API and canonical worker are now
installed with model execution disabled, preserving their exact owner-only
configuration. This Platform pin remains 0.18.4. The current full predeployment
run stopped in the unchanged conversation duplicate-send assertion. Twenty
focused reruns passed; the first failure cause is not confirmed. Response
diagnostics were added without relaxing the assertion or retry limits, and
the complete release gate must be rerun. Main Chrome signs in normally, but
the separate required automated production test lacks a saved test session.
Neither manual access nor focused passes substitute for those gates. See the
[disabled runtime receipt](deployment-operations.md#ally-model-controls-installed-with-execution-disabled--november-22).

The user prioritized building the agent and connecting many applications. The
standalone UI is parked. Engine source, skill definitions, workflows and connector
routing are edited in AlamoAgent. Platform consumes a pinned archive; the original
extraction used `vendor/alamo-agent-runtime-0.1.0.tgz`, and the local executive
candidate below uses `vendor/alamo-agent-runtime-0.18.3.tgz`. Old engine modules re-export that package.
There are no sibling runtime imports or symlinks. Rebuild/bump the package and run
Platform integration checks before adopting another engine version.

Platform retains its [source API](../../server/platform-agent-source-api.mjs),
[source grant store](../../server/platform-agent-source-grants.mjs), domain adapters,
existing UI, and deployment records. Source permissions remain authoritative.
Both production skill definitions still read Platform projections; the Admissions
aggregate is not a direct Pipeline assessment integration. Multi-app routing is
verified with two synthetic authenticated HTTP applications.

Eric-only access and disabled emails remain unchanged. Andrew's Wilson branding
is saved, with no access enabled. Extraction and tests do not establish production
availability. See [deployment operations](deployment-operations.md) for receipts.

## Executive Ally candidate — November 22, 2026

**Local Platform UI follow-up:** Ally now enters from the Platform header and opens chat first in a compact Carelog-style panel. The old floating launcher and updates/skills landing are removed from the shared entry. Entitled report users can enter the retained report tool from chat. This is a source-only presentation change; the production owner pilot described below remains restored to the prior image. The engine, source grants, access policy, model configuration, and notification settings are unchanged. The ordinary local preview has no Ally API and displays a disabled chat layout; a separate synthetic configured browser run verified the create/send/read interaction. This is not signed-in production acceptance.

The subsequent local correction uses Carelog's actual three-path bookmark mark and its launch behavior. It leaves a slot in the Platform header, flies into the Ally panel heading, and returns on close. Both the executive report/chat panel and the EveryAgent chat panel use the same transition; it preserves focus return, supports desktop and phone dialogs, and honors reduced motion. The browser regression checks outbound and return flights at 1440px and 390px. This changes presentation only; the restored production image and access boundary remain as recorded above.

The local Ally panel now has a full-screen toggle. It expands the mounted chat into a viewport-sized workspace without changing the selected conversation, and the entitled executive report view uses the same control for wider charts, tables, and narrative reports. Restore returns to the compact panel; Escape restores first and closes on a second press. This is a Platform UI capability, not a new agent rendering protocol or an enabled production service. The local browser regression verifies expand, restore, and the existing bookmark flight at desktop and phone widths.

The expanded layout now keeps a compact conversation trail beside a reading canvas. An answer appears directly with its formatted text and tables; source links stay in one collapsed disclosure. Entitled report users can build a report in the canvas without losing the chat, and the existing report view renders its chart or values there. On phones, Chat and Answer are separate tabs; the second tab says Report while a report is open. A new answer opens the Answer tab. A synthetic HTTP fixture exercises a conversation answer, table, cited source, chart report, and follow-up composer at desktop and phone widths. These are presentation and existing report-rendering behaviors; model-authored arbitrary UI components and broader data coverage are not implemented by this change.

The phone workspace opens full screen without a resize step. Its header has a single New menu for chat/report work and a Close action; desktop retains its resize control. Report export, refresh and sharing live in one actions menu. A report with no history or alternate version does not display redundant pickers. Charts put the plotted answer first and retain the full table in a disclosure. A 320px regression caught and corrected sideways dialog scrolling caused by crowded controls. The synthetic browser check now covers 320px, 390px and desktop layouts, including report controls, answer/table rendering, and zero sideways panel scroll. This is a local UI candidate; it does not reactivate the closed owner pilot or widen access.

**Current status:** the owner-only image was deployed after all 28 predeployment
checks passed, then exercised with ten real aggregate questions through Eric's
signed-in main Chrome. The review found four passes, three partial results and
three failures, including operating-summary field mapping, misleading referral
stage counts and withheld findings. The prior production image was restored and
verified healthy; the temporary worker is stopped and canonical again. The full
automated postdeployment gate was not completed. Andrew/Sandeep are not enabled.
See [the real acceptance receipt](deployment-operations.md#real-ally-owner-acceptance-and-restoration--november-22)
and [engine findings](/Users/eric/CareEngineMain/ally/docs/build-spec.md#november-22-real-owner-acceptance--failures-found-pilot-restored).

The preparation observations below are historical and superseded by that receipt.

Current preparation: the separate API is configured and verified for Eric's
exact Platform client/origins, and the source workload identity/private aggregate
grant registry are installed. The canonical worker has the shared Carelog
connection configured with both timers and dispatch disabled. Existing Platform
production is still unchanged. These prepared permissions are not signed-in
source or model-execution acceptance. The
[engine status](/Users/eric/CareEngineMain/ally/docs/build-spec.md#november-22-owner-pilot-preparation--not-yet-exposed-in-platform)
and [suite recovery receipt](/Users/eric/suite-deploy/README.md#ally-owner-pilot-preparation--november-22)
own those boundaries.

The independent production API/worker is now installed in a separate closed
foundation; the [engine spec](/Users/eric/CareEngineMain/ally/docs/build-spec.md#november-22-closed-production-installation--0183)
owns its status. Existing Platform production remains unchanged. The release
preparer now has an explicit `--owner-pilot` mode bound to that exact service and
Eric's verified Entra object ID. It preserves the default disabled artifact and
the separate fictional preview. This changes release configuration, not layout,
source permissions or model execution. No broader participant list is accepted.
The checker exercises the configured subject and denied user/tenant/role branches
in the appended module. Deployment still needs the named candidate's release
checks, server/source configuration and signed-in owner acceptance.
All three packaged modes now pass their exact-file, configuration, HTTP and
display-access checks from source `b08e420`. The new real pilot artifact is local
only; [the operations receipt](deployment-operations.md#owner-only-ally-release-configuration--november-22)
records its image and preserved production boundary.
Subsequent inspection found the live host's static CSP would block the new service.
The enabled packager now adds only the exact configured service origin, with an
exact-host-file and actual-header regression. The prior image checks did not cover
that connection permission; updated enabled builds use a 20-file boundary and
must pass the expanded check before deployment.

The corrected `6ef50ea` artifacts now pass all expanded package checks, including
the real HTTP CSP on five routes. The owner image is pushed at
`704a3d5b918c41e158ddad6de7a4f893f0c995454d48affca76fe128fd938f00`.
Its exact deployment/rollback plan preserves the prior production app and adds
only the three source-connection settings. The full predeployment gate is still
running; source reads, signed-in owner acceptance and final worker recovery/load
remain open. Do not treat the pushed image as a completed deployment.

This production-source checkout now consumes the same **0.18.3** archive verified
in the bounded staging browser run, SHA-256
`cf320ffd5b2ab43a563b5d93c3b33239c1cd6cf78bd14e0fdfa765b91eae7266`.
Only the runtime pin and the actual source/chart regression from staging commit
`12f1461` were ported; no staging infrastructure or synthetic content was copied.
Source-owned classification now offers comparisons for unambiguous same-period
categories and trends for unique dated observations with constant context.
Mixed dates, duplicates and missing labels retain exact-value tables. Multi-series
charts remain outside this contract; revisit only with an explicit grouped-series
contract rather than guessing an axis.

The production-base packaging check now exercises the enabled display branch as
well as the disabled candidate. `--enabled-preview` creates a separate local image
with a fictional participant and unroutable service, never real access. It checks
wrong user/tenant, signed-out and restricted accounts, preserved route children and
account-bound remounting in the actual appended module. This does not replace
signed-in production or browser rendering acceptance. The normal artifact remains
disabled. Both images preserve unrelated production files, routes, readers,
authentication and image configuration. Exact results belong in
[deployment operations](deployment-operations.md#local-ally-0183-production-base-candidate--november-22).

### Earlier 0.18.2 integration evidence

This checkout previously pinned engine **0.18.2** from `7c657a2`. The owner's $10 live-test
authorization supersedes the earlier deferral. The shared Carelog GPT connection
passed 30 fictional report cases and a ten-question follow-up conversation after
corrections to date-label validation, source-scope planning and stage distinctions.
Human usefulness grades remain blank. The
[engine evaluation record](/Users/eric/CareEngineMain/ally/docs/evaluations/executive-quality-2026-11-22.md)
records results, costs and limitations. Platform's full analyst gate, source/flow,
dependency/docs, desktop/mobile browser, build and disabled-overlay checks pass
against this pinned candidate; earlier evidence applies to its recorded version.
No production setting, source grant or executive access has changed.
Staging remains disabled at **0.18.1**. The operations document distinguishes
the new local candidate from the existing staging receipt.

### Earlier 0.18.1 integration and staging evidence

The paired 0.18.1 engine/source correction is now installed in disabled staging.
Actual managed-identity/Blob tests passed saved detail sharing and downgrade
checks with fictional records. Final revocation and cleanup also passed after
honoring an Azure exec retry interval; active test state is cleared and the normal
staging snapshot is restored. Real executive access and live GPT testing remain off. Exact images, rollback and evidence are in
[deployment operations](deployment-operations.md#current-disabled-staging-paired-0181-permission-correction).

The owner authorized the executive experience and then deferred **live GPT testing**.
The independent engine now has a local 0.18.1 candidate, consumed by this checkout
through its pinned archive. Existing production images, access and source data
have not changed. The engine's living spec remains the implementation authority;
this section records Platform's ownership and integration evidence.

The November 21 permission correction adds source grant receipts exposing
their existing boolean `detail` permission, and evidence carries `requiresDetail`.
A signed-source regression first reproduced disclosure of saved detail to an
aggregate-only recipient. The corrected engine rejects that share and hides
saved reports after a detail downgrade; a fresh aggregate report remains usable
and shareable. Grant replacement during synthesis also prevents publication.
The new fields must ship with engine 0.18.1. The disabled local overlay has been
rebuilt and rechecked against the production base; the operations document holds
its current receipt. The current paired staging rollout is recorded above;
earlier 0.18.0 receipts remain historical. Live GPT testing stays deferred.

Platform owns `/api/platform/ally-source/v1`, its workload-token verifier, the
separate private `agent-source/report-grants-v1.json` registry, and domain readers.
Community and date constraints are added by the source, outside model arguments.
Aggregate grants cannot use private fields for grouping, date filters or named-person probes.
The November 21 continuation reproduced an aggregate-only field disclosure in a
synthetic fixture. The source now narrows its field manifest before SQL compilation
and projects every warehouse/fallback result to the same allowlist; newly added
private columns cannot enter evidence, datasets or the source catalog. Exact
publisher aliases retain community/category/county names and numerical measures;
native datasets preserve null versus zero and reject invalid/blank measures.
Partial snapshots, stale flow and bounded licensing results retain coverage limits.
The existing resident-flow reader accepts an explicit within-year period while
preserving its default full-year behavior and census/movement reconciliation.

The optional embedded Ally panel uses the shared report API, the approved orange
bookmark, current Platform typography, native controls, source-bound tables,
comparisons and trends. It supports saved/versioned investigations, follow-ups,
refresh/retry/cancel, recipient-checked sharing, report links and print/PDF. It
reauthorizes on export and periodically while displaying saved results. Exported
copies are snapshots and cannot be revoked after download. It does not replace
existing monitoring, assessment workflows or source applications.

Final integration checks retained the existing monitoring and conversation
behavior. The newer engine catalog includes a paused assessment-review skill;
updated compatibility assertions require it to remain paused, execute no runs
and publish no work. This package adoption does not activate that capability.
The browser pass also covers shared-link reopening, recipient-only controls and
removal of cached report titles after source revocation. It caught and fixed an
aborted-request lifecycle bug on direct report links; stale reads cannot replace
a newly opened report. Polls are serialized while a previous check is pending.

`VITE_ALLY_REPORTS_ENABLED` is false by omission. `VITE_ALLY_REPORT_PARTICIPANTS`
is display configuration, never API or source authority. The signed-in API subject,
engine membership and current independent source grant all remain mandatory.
The browser fixture enables this only in its isolated loopback test process.

Checks: `check:executive-reports`, `check:browser-executive-ally`, frontend/server
TypeScript, API boundaries, lint, dependency audit, code health, unused/duplicate
checks and browser build. The browser fixture exercises 320/390/1440px, keyboard
focus, reduced motion, lost-acknowledgement retry, saved reopening, version
selection, follow-ups, cancellation, sharing and PDF creation. Fixture responses
are explicitly synthetic; none of these checks establish GPT answer quality.
The initial separate staging API and worker used the tested 0.18.0 package, with dispatch off,
empty source connectors and no model configuration. This does not activate reports
or alter the production host. See the exact status and candidate rollout boundary
in [deployment operations](deployment-operations.md).

The subsequent staging workload test found a real Azure grant-reader defect:
`downloadToBuffer(0, 65537)` requires that exact byte count and rejects a valid
smaller registry. The shared source owner now reads a bounded stream, preserving
the 64 KiB limit and closing the stream on every result. A real Azure SDK test
with a local HTTP blob fixture reproduces the failure and covers small/exact-limit
documents, oversized/missing-size responses and invalid JSON. Both monitoring
and executive report grants use the correction. This is source/persistence
verification; GPT testing remains deferred.

The earlier corrected source was verified in isolated cloud staging using the real
Ally managed identity and Azure Blob persistence. Scoped values/private-field
exclusion, unknown-subject denial, concurrent-create idempotency, fresh-process
reopening, sharing and revocation passed with fictional records and a canned model.
Test state/grants were cleared and the normal staging snapshot restored. Executive
access and the public report runtime remain off. The operations receipt records
the exact image and recovery configuration; Functions execution and live GPT
acceptance are still outstanding.

Production-base reconciliation now has a reproducible **disabled** overlay and
image check. It preserves all unrelated live files, shared authentication, source
readers and the older monitoring engine instead of replacing the root build.
The 19-file allowlist was checked against 19,123 base files; HTTP health/routes,
anonymous denial and disabled/source-auth boundaries passed in an offline
container. Reconciliation also restores the live recorded-outcome counting fix
and outcome-review phase to this checkout, with a failing-before/passing-after
regression. No image was pushed or deployed. The operations document records the
image and commands. Enabling this package still requires the deferred live
acceptance, exact service/CSP configuration and signed-in release checks.

## Workflow content in Platform — 2026-10-18

Workflow is now embedded at `/workflow` in Platform, behind its existing owner
access gate. Workflow owns roles, human workflows, SOPs and learning content;
AlamoAgent owns skills, agent execution and evaluations. The source-linked
Documents and knowledge workspace contain 16 draft role guides, 32 workflow
summaries, 17 assessor procedures with 81 steps, and 40 read-only skill references.
These 105 records retain review status, source version and handoff links. They
are deployed content snapshots, not approved policies or a new agent activation.
See [deployment operations](deployment-operations.md) for the release receipt.

Refresh the deployed content with `npm run workflow:refresh-library` after an
intentional source JSON update. `npm run check:workflow-library` checks hashes,
review states, unique IDs, resolved knowledge links and exact generated output.
The data is a deployed snapshot; knowledge workspace notes are not a database
editor and do not save back to the canonical content.

The exact imported AlamoAgent JSON snapshot is excluded from code-clone detection:
its shared application catalog is intentional source data. Snapshot integrity and
content freshness are checked by `check:workflow-library`; runtime code retains
the existing zero-duplicate gate.

## Workflow knowledge connection — 2026-10-18

The existing helper now has a bounded Workflow source lookup. The source endpoint
`POST /api/platform/workflow-knowledge` checks Entra authentication, Platform owner
access and the Eric-only AlamoAgent gate before reading the 105-record snapshot.
Search returns original excerpts, draft/review labels and exact-version links into
Workflow Documents. Full-document reads require the expected SHA-256 revision;
stale references return 409 and the UI requires choosing the current version.

The engine owns the dependency-free `@alamo/agent-workflow-knowledge@0.17.0`
contract, read skill and delegated HTTP client. Platform owns the source adapter,
permissions, document rendering and helper integration. Its older
`@alamo/agent-runtime@0.1.0` and existing state stay pinned. The new lookup is
on demand: it does not register a scheduled responsibility, generate model answers,
change source documents or activate the independent service's Workflow connection.
The Workflow route keeps its existing helper-hidden setting; use the helper on
Platform Home and follow citations into Workflow.

Verification: `check:workflow-knowledge`, `check:browser-workflow-knowledge`,
`check:workflow-library`, frontend/server TypeScript, lint, code health, unused-code,
duplicate-code and dependency checks, plus the production browser build. The engine
suite and API/worker packaging checks also pass. Release preparation uses
`WORKFLOW_AGENT_BASE_IMAGE=<current digest> npm run workflow:prepare-agent-release`
to overlay only the endpoint, contract package, source snapshot and browser assets
on the actual current Azure image. See deployment operations for live evidence.

## Workflow reviewed publication adapter — deployed owner-only, 2026-10-19

Workflow now has a separate authenticated authoring/publication adapter in this
integration checkout. It adds durable Azure revisions, explicit document and
relationship decisions, frozen publications and cited owner-only retrieval under
`/api/platform/workflow/v1`. It does not replace the existing deployed snapshot
connector, change agent grants, activate a skill or enable emails. A future
consumer must use a separately reviewed versioned export/change contract; the
new endpoints currently require delegated owner credentials and reject app-only
identities. Workflow remains the content/review authority. See the canonical
[Workflow plan](/Users/eric/alamo-workflow/docs/contributor-workflow-plan.md) and
[deployment operations](deployment-operations.md).


The shared Workflow pilot was deployed owner-only on 2026-10-19. Exact Entra
tenant/object-ID grants, the existing owner gate and private Azure storage are
enabled. Live health, anonymous denial and runtime managed-identity read/write
checks pass; real-owner browser acceptance awaits sign-in. See the latest
[deployment receipt](deployment-operations.md). No additional user or agent access
was enabled.

## Workflow capture and guided SOP integration — source implemented, 2026-10-19

The integration checkout now reuses Workflow's existing text-capture importer,
guided SOP editor and versioned validators/renderers within the authenticated
owner publication flow. A reviewed capture becomes an editable procedure, then a
structured SOP with retained source evidence and exact-quote knowledge proposals.
Document and relationship approvals remain separate. Publication freezes the
approved structure, source evidence and renderer version; later draft edits leave
that publication intact. Legacy documents and all 17 procedures/81 steps remain.

Portable contracts are pinned by `src/features/workflow/authoring-contracts.v1.json`;
`workflow:refresh-authoring-contracts` refreshes them explicitly from canonical
Workflow and `check:workflow-contracts` verifies their hashes. There are no sibling
runtime imports. The owner grant, delegated identity requirement and Azure storage
adapter remain unchanged. Sixteen service tests and the desktop/mobile capture
and publication flow pass. This addition is not deployed; see the prepared-source
entry in [deployment operations](deployment-operations.md).

Visual capture, AI drafting, automatic entity/assertion extraction and authorized
agent consumption remain subsequent work. The current graph uses reviewed quoted
connections; free-text role/system labels are not automatically resolved entities.
No agent activation, notifications, staff grants or new consumer were added.


## ProForma guidance integration, November 23

The owner requested completion and live deployment through Ally. The native Platform route restores the reviewed November 17 ProForma application, preserving its owner gate and detailed assessor procedures. The header opens the existing single Ally component. New conversations use server-advertised capabilities and show ProForma source citations. The independent Ally 0.18.8 API owns source discovery, bounded model tool calls, transcript persistence and current-source reauthorization. ProForma retains publication authority. The four-file source overlay adds published-guidance discovery without importing Ally runtime or changing source permissions. Engine deployment is healthy; Platform deployment and signed-in acceptance are still pending.

Imported source context JSON and the pinned upstream ontology schema intentionally repeat evidence and schema shapes; duplicate-code checking excludes these immutable data files while retaining the zero-duplication rule for application code.
