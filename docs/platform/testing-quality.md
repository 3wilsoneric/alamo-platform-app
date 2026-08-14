# Testing And Quality Gates

- purpose: document platform verification commands, what they protect, and known gaps
- status: authoritative current-state reference
- owners: engineering, QA
- updated: 2026-08-02
- tags: qa, testing, analyst, typecheck, build, docs
- labels: platform-handbook, current-state
- related files:
  - [alamo-platform-app/package.json](/Users/eric/CareEngineMain/alamo-platform-app/package.json)
  - [alamo-platform-app/scripts/check-code-health.mjs](/Users/eric/CareEngineMain/alamo-platform-app/scripts/check-code-health.mjs)
  - [alamo-platform-app/knip.json](/Users/eric/CareEngineMain/alamo-platform-app/knip.json)
  - [alamo-platform-app/scripts/check-analyst-capabilities.mjs](/Users/eric/CareEngineMain/alamo-platform-app/scripts/check-analyst-capabilities.mjs)
  - [user-journeys.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/user-journeys.md)
  - [repository-ownership.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/repository-ownership.md)

## Main Commands

Run from:

```bash
cd /Users/eric/CareEngineMain/alamo-platform-app
```

Core gates:

```bash
npm run typecheck
npm run check:source-syntax
npm run check:code-health
npm run check:unused
npm run check:duplicates
npm run check:dependencies
npm run check:retention
npm run check:analyst
npm run build
npm run check:docs
```

Daily/generated artifacts:

```bash
npm run cache:certified
npm run qa:analyst
```

Focused analyst checks:

```bash
npm run check:query-intent
npm run check:query-matrix
npm run check:copilot-tools
npm run check:module-registry
npm run check:ad-hoc-modules
npm run check:module-benchmark
npm run check:analysis-state
npm run check:thread-transitions
npm run check:answer-formatting
npm run check:answer-contracts
npm run check:answer-quality
npm run check:databricks-serverless
npm run check:certified-rails
npm run check:mar-analytics
npm run check:mar-analytics:azure
npm run check:platform-api
npm run check:regression-replays
npm run check:tool-registry
npm run check:analyst-capabilities
npm run check:analysis-capability-guards
npm run check:incident-contracts
npm run check:fiftystate
npm run check:user-journeys
npm run check:user-journey-stress
npm run check:user-journey-fuzz
npm run check:user-missions
npm run check:browser-missions
npm run check:browser-surfaces
npm run check:browser-community-surfaces
npm run check:browser-community-questions
npm run check:browser-mar
npm run check:browser-explorer
npm run check:browser-chat-flow
npm run check:browser-all-guided-answers
npm run check:browser-guided-accessibility
npm run check:browser-guided-interactions
npm run check:browser-clutter
npm run check:browser-journey-fuzz
npm run check:browser-journey-replay
npm run check:browser-performance
npm run check:browser-scroll
npm run check:production-smoke
npm run check:production-signed-in-smoke
npm run check:platform-ready
npm run check:release
npm run check:ship
```

## What `check:analyst` Protects

`npm run check:analyst` currently runs:

- TypeScript typecheck.
- syntax validation for every retained JavaScript module, Databricks notebook, and workflow/configuration JSON file.
- code-health static checks.
- tool registry checks.
- analyst capability registry checks.
- current-state historical-period capability guards.
- incident domain contracts.
- module registry integrity.
- query intent compiler checks.
- large query-intent matrix.
- tool scope validation.
- ad hoc module planner checks.
- module selection benchmark.
- analysis session state checks.
- thread transition matrix.
- answer formatting checks.
- answer contract checks.
- answer quality scoring checks.
- Databricks serverless notebook compatibility checks.
- turn-trace store checks.
- platform API boundary checks.
- certified rails checks.
- MAR analytics routing, truth-state, and answer-format checks.
- user journey QA scoring.
- seeded user journey fuzz checks.

This is the main guard against "technically answered but wrong shape/wrong
grain/wrong period" failures.

`npm run check:mar-analytics` exercises medication/MAR profile, medication
watch, compliance, refusal rollup, exception detail, late/held/PRN detail, and resident MAR profile
questions through the live deterministic tool path. If the active local snapshot
does not include governed MAR rows yet, the check verifies fail-closed behavior
instead of pretending MAR data exists. When MAR rows are loaded, the same check
becomes stricter and requires the MAR-specific tools and answer shape.

After Databricks publishes the governed snapshot, run:

```bash
npm run check:mar-analytics:azure
```

That command loads `.env`, forces `PLATFORM_SNAPSHOT_READ_SOURCE=azure`, and
verifies the app reads the same Azure snapshot production uses. Use it to prove
Command Center `MAR Analyst Context: Ready` and AH Analyst MAR answers are
backed by published MAR rows, not a stale local generated snapshot.

Then run the browser MAR pass:

```bash
npm run check:browser-mar
```

That command uses the same browser surface harness, but enables MAR-specific
surface cases and forces the Azure snapshot. It verifies the rendered chat
modules for medication profile, medication watch, refusal detail, and resident
MAR profile. Keep it separate from `check:browser-surfaces` because local
developer snapshots may intentionally omit governed MAR rows.

`npm run check:platform-ready` is the one-command readiness bundle. It runs the
core gates in order, keeps going after failures by default, and writes one
summary artifact:

```text
generated/platform-ready/latest.json
```

Use the quick profile for a fast operating check:

```bash
PLATFORM_READY_PROFILE=quick npm run check:platform-ready
```

Use the release profile for a stronger pre-push check that keeps runtime short
but includes the focused browser surface/explorer/chat/scroll/performance gates:

```bash
npm run check:release
```

Use the ship gate before a handoff or production promotion:

```bash
npm run check:ship
```

`check:ship` runs the full platform-ready profile, includes browser checks,
includes the production build, and stops on the first failure. Treat it as the
local engineering release gate. Pair it with the human/data checklist in
[ship-checklist.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/ship-checklist.md).
Both `check:release` and `check:ship` require a captured signed-in production
session and fail rather than silently passing when that verification is unavailable.

The full profile is the default. It runs analyst, regression, mission/stress,
browser, production, and signed-in-smoke checks. Set
`PLATFORM_READY_SKIP_BROWSER=true` when browser automation is not available, or
`PLATFORM_READY_INCLUDE_BUILD=true` when the readiness bundle should also run a
production build. Command Center reads this artifact as the top-level Platform
Ready signal.

When a late command fails after earlier stages have already passed, resume the
same profile at a validated stage number or script name instead of replaying the
entire browser catalog:

```bash
PLATFORM_READY_PROFILE=full PLATFORM_READY_START_AT=check:thread-context-stress PLATFORM_READY_INCLUDE_BUILD=true PLATFORM_READY_STOP_ON_FAILURE=true npm run check:platform-ready
```

The normal release and ship commands always start at stage one. A resumed run
records its start boundary in `generated/platform-ready/latest.json` and is
evidence for only the selected suffix of the profile.

Browser QA uses a clean-room local app by default. The shared browser harness
starts Vite with the dev-only Entra bypass on `http://127.0.0.1:3101` instead
of reusing the normal developer port. If that port is busy, it automatically
chooses the next free port and records the actual base URL in the generated QA
artifact. Set `BROWSER_QA_REUSE_EXISTING_APP=true` only when intentionally
debugging against an already-running local app.

The default local app may read the repository's deterministic fallback
snapshot. Do not use a default local browser run to judge production data
freshness. Any live-data verification must explicitly set
`PLATFORM_SNAPSHOT_READ_SOURCE=azure` so the check reads the same published
snapshot as production.

The authenticated shell immediately warms the user's landing route and keeps a
single branded preparation state visible for no more than two seconds. The
route then renders even when the data request is still pending, so a slow or
failed API cannot trap the user behind the sign-in screen. The map landing gate
warms both the home metrics and community dashboard, and those cached values
seed the first map and community-modal render. Incident and resident-search
preloads begin only after that first-route gate. In-flight data must be labeled
as loading; unavailable language is reserved for a failed request or a governed
value that is actually absent.

`npm run check:fiftystate` verifies all 50 maintained targeting records, all 50
national state-operated psychiatric-bed baselines, the 15-state verified demand
core, and the five-state buyer sprint. It also requires the 15 researched states
to be the default product scope while preserving an explicit All 50 view. The buyer gate requires the exact five
state scope, all 14 county or regional targets, a buyer route, opportunity
status, pitch, barrier set, first outreach plan, and official HTTPS sources. It
also checks cross-dataset bed-value reconciliation, source-reference integrity,
audience and research ordering, and the concise modal interaction contracts. The full
reports browser journey then verifies the default priority scope and opens one verified-demand state and one
baseline-only state, confirms the research-depth label, required dossier
sections, external sources, and honest evidence boundary, and exercises next,
close, and route-return behavior.

`npm run check:browser-community-surfaces` opens every canonical community in
all six supported focused surface modes at desktop and mobile widths. It also
physically clicks every latest-census and movement row in Communities Overview,
then opens every rendered incident-trend, incident-category, medication, and
diagnosis drilldown. The gate rejects wrong facility/focus routing, Safe Mode,
missing charts or tables, clipped content, horizontal overflow, browser console
errors, and API request failures. It writes:

```text
generated/browser-community-surface-qa/latest.json
```

`npm run check:browser-community-questions` derives its cases from the live
certified route registry rather than a separate prompt list. It renders every
route containing a community selector against all five canonical communities,
which currently produces 70 answer permutations across 14 routed variants and
14 question families. It requires the selected community, an evidence surface,
a numeric result where appropriate, readable controls, and no fallback or
failure language. It writes:

```text
generated/browser-community-question-qa/latest.json
```

Both gates run as the first stages of `npm run check:browser-surfaces`, so the
release and full readiness profiles cannot fall back to one-community spot
checks.

`npm run check:browser-california-home` verifies the map-first home separately.
It opens all five markers, checks every community modal tab, follows census,
incident, medication, and resident drill-downs, opens an exact incident report,
tests backdrop and close-button dismissal, validates marker coordinates, and
repeats the core flow on mobile. The full ship profile runs this gate.

`npm run check:browser-all-guided-answers` is the exhaustive guided-answer
render gate. It runs every certified catalog prompt at wide desktop, standard
desktop, standard mobile, and compact 320px phone viewports. The runner isolates
small browser batches and verifies the exact scored lead, evidence surface or
artifact, readable width, control clipping, horizontal overflow, and the
absence of a free-text composer. The command first regenerates both the scored
answer report and certified answer cache, preventing a stale scorecard or prior
reporting-day cache from being compared with the current UI. The current catalog
produces 124 rendered-answer checks: 31 prompts across four viewports. Use
`BROWSER_GUIDED_VIEWPORT` with `wide`,
`desktop`, `mobile`, or `compact` for a focused replay. It writes:

```text
generated/browser-all-guided-answer-qa/latest.json
```

`npm run check:browser-guided-interactions` exercises every guided answer that
offers a CSV attachment at desktop and compact-phone widths. It validates the
downloaded filename, nonempty CSV structure, and exact promised record count.
For every large detail answer, it also expands and collapses the preview, checks
the exact rendered row count after one click, verifies the module re-anchors in
view, and rejects overflow or clipped controls. It writes:

```text
generated/browser-guided-interaction-qa/latest.json
```

`npm run check:browser-guided-accessibility` inspects all 31 question controls
at desktop and 320px compact widths. It requires a single native button per
question, unique prompt-bearing accessible names, no nested interactive
elements, 44px targets, nonnegative letter spacing, and no horizontal overflow.
It also runs one direct question and one variable clarifier entirely from the
keyboard in each viewport.

```text
generated/browser-guided-accessibility-qa/latest.json
generated/browser-guided-accessibility-qa/screenshots/*.png
```

`npm run check:regression-replays` is the permanent "never break this again"
library. It runs high-signal cases from `scripts/regression-replay-cases.json`,
including AWOL people-versus-events grain, San Pablo January census, typo
correction, exact resident profile, unknown resident recovery, incident
freshness, unsupported November period recovery, large row preview/export, and
resident-search surface routing. It writes:

```text
generated/regression-replays/latest.json
```

Add cases here when a real user-facing failure teaches us a durable lesson. The
regression library should stay smaller and sharper than the fuzz suites.

The user journey QA suite runs curated operator-style journeys from
`scripts/user-journey-scenarios.json` through the live deterministic analyst
runtime. It scores each turn across intent, data scope, answer readability,
surface/module attachment, display hygiene, and recovery/trust behavior. The
runner expands prompt variants, preserves session state across follow-ups, and
writes `generated/user-journey-qa/latest.json` with category scores and
recommendations. Use this suite for "would a real user understand and trust
this?" regressions that are broader than exact tool-selection contracts.
The scenario catalog also carries the named journey map from
[user-journeys.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/user-journeys.md),
so the report can be read by product journey instead of only by individual
prompt. The current journeys include quick resident lookup, community pulse,
incident triage, trend review, exact rows/export, data trust and recovery,
medication signal review, surface-only use, operating snapshot, and the
inevitable analyst layer for loose community-history and slice-discovery
language.

`npm run check:user-journey-stress` is the heavier journey torture test. It
runs 50 surface-opening turns, 25 mixed analytical questions in one preserved
thread, and 2 fresh-session checks after the long thread. Use it before risky
changes to routing, thread context, surface resolution, or answer rendering. It
writes `generated/user-journey-stress/latest.json` with turn-level failures,
surface pass rate, question pass rate, and persistence failures.

`npm run check:user-journey-fuzz` is the seeded broad-coverage harness. It
generates a repeatable Monte Carlo-style set of operator prompts across
surfaces, incident slices, census, typo correction, people-versus-event grain,
resident profile/recovery, medication signals, comparisons, and unsupported
periods. Use `USER_JOURNEY_FUZZ_SEED` to replay a failure and
`USER_JOURNEY_FUZZ_TURNS` to raise volume for heavier runs, for example:

```bash
USER_JOURNEY_FUZZ_SEED=incident-rails USER_JOURNEY_FUZZ_TURNS=500 npm run check:user-journey-fuzz
```

It writes `generated/user-journey-fuzz/latest.json` with failures grouped by
journey family and selected tool.

`npm run check:user-missions` is the qualitative mission judge. Each mission
starts with a concrete operator end goal, runs a multi-turn simulated session,
and scores whether the user could complete the job quickly, accurately, and
without context drift or broken surfaces. The scorecard grades accuracy, thread
persistence, surface usefulness, readability/friction, and speed, then writes
`generated/user-mission-qa/latest.json`.

`npm run check:browser-missions` is the full browser rehearsal. It starts the
local API and Vite app when needed, enables the dev-only Entra bypass, drives
the real React chat canvas with Playwright, and scores surface rendering,
answer text, composer visibility, snap-to-message behavior, API failures, and
console crashes. It writes:

```text
generated/browser-mission-qa/latest.json
generated/browser-mission-qa/screenshots/*.png
```

Use it before handoff when UI flow, chat snapping, module rendering, auth
gates, or browser-only behavior changed. It is intentionally not part of
`check:analyst` because it starts servers and performs browser automation.

`npm run check:browser-surfaces` is the focused surface integrity and visual
hygiene audit. It starts the local browser workspace, opens the prepared
surfaces operators are expected to trust, then asks representative chart,
table, and profile questions. It fails on:

- A prepared surface that stays in a loading state.
- A surfaced module that renders too narrow, overflows horizontally, or loses
  the sticky composer.
- Large dark-mode panels inside chat-surfaced modules.
- Stale community labels such as `Victoria's Place`.
- Raw facility ID leaks in community-facing module text.
- Generated visuals that have no visible values or no chart/table/card
  structure.

It writes:

```text
generated/browser-surface-qa/latest.json
generated/browser-surface-qa/screenshots/*.png
```

Use it with `check:browser-missions`: missions judge workflow quality, while
surface QA catches hidden module/display breakage across the prepared surface
catalog and high-volume visual answers.

`npm run check:browser-mar` is the MAR-specific version of this visual hygiene
audit. It loads the Azure-published snapshot and adds medication profile,
medication watch, medication refusal detail, and resident medication profile
cases to the browser suite.

`npm run check:browser-explorer` is the full-screen governed data explorer
gate. It opens the resident, incident, and census explorer routes directly,
checks filtering/search layout, expands representative rows, verifies there is
no horizontal overflow or large dark-mode panel, and confirms CSV/Excel
downloads are available for the filtered rows. It writes:

```text
generated/browser-explorer-qa/latest.json
generated/browser-explorer-qa/screenshots/*.png
```

Use it after changing resident search, incident search, census search,
full-screen handoff routes, table rendering, row expansion, or export behavior.

`npm run check:browser-chat-flow` is the basic chat mechanics gate. It drives
the real workspace through submit, copy, edit-and-submit, rerun, new clean
chat, full-screen search popup handoff, persistent wordmark behavior, and the
absence of the retired History control. It writes:

```text
generated/browser-chat-flow-qa/latest.json
generated/browser-chat-flow-qa/screenshots/*.png
```

Use it after changing composer behavior, user-message controls, persistence,
full-screen handoff actions, or thread state.

`npm run check:browser-clutter` is the action-density and downshift gate. It
checks common answer types for banned clutter phrases, prevents more than one
next-step action per answer, and verifies download
actions only appear for explicit export requests. It writes:

```text
generated/browser-clutter-qa/latest.json
generated/browser-clutter-qa/screenshots/*.png
```

Use it after changing answer actions, generated modules, export
handling, or recovery/downshift copy.

`npm run check:browser-journey-fuzz` is the seeded browser-level journey fuzz
gate. It uses the real React chat workspace and randomly samples named operator
journeys such as surface-only use, resident profile lookup, AWOL people counts,
typo trend recovery, current-incident freshness, community pulse checks,
historical detail lists, and unsupported-period recovery. It fails when:

- The app or API server does not look like the expected Alamo Platform shell
  and platform health endpoint.
- Expected answer facts do not appear in the newest turn.
- A rejected failure smell appears, such as `Analysis tool unavailable`,
  missing-category validation, or an unsafe substituted month.
- A deterministic journey silently drifts into analyst/Claude escalation text.
- A turn expected to surface a module does not render one.
- The newest message snap anchor is not near the top of the viewport.
- The sticky composer disappears, the page overflows horizontally, or API and
  console failures occur.

Replay a browser journey failure with:

```bash
BROWSER_JOURNEY_FUZZ_SEED=incident-ui BROWSER_JOURNEY_FUZZ_SESSIONS=20 npm run check:browser-journey-fuzz
```

It writes:

```text
generated/browser-journey-fuzz/latest.json
generated/browser-journey-fuzz/screenshots/*.png
generated/browser-journey-fuzz/failures/*.json
```

Failure JSON artifacts include the failed prompt, expected/rejected patterns,
newest chat text, recent chat items, recent module snippets, canvas metrics,
and a server identity probe. Use them before adding one-off prompt patches.

`npm run check:browser-journey-replay` replays the newest
`generated/browser-journey-fuzz/failures/*.json` artifact through the real chat
workspace. New failure artifacts include prior prompts, so follow-up failures
can be reproduced with the same thread context instead of guessing from the
final turn alone. Set `BROWSER_JOURNEY_REPLAY_ARTIFACT=/path/to/failure.json`
to replay a specific failure. If there are no failure artifacts, the command
writes a skipped passing artifact to:

```text
generated/browser-journey-replay/latest.json
```

Use this before repairing a browser-journey failure. The goal is to reproduce
the failure, then prove the same artifact passes after the fix.

`npm run check:browser-performance` is the first-render and workspace speed
gate. It starts the local API and Vite app when needed, loads `/home`, opens
the chat, surfaces Communities Overview, and fails if the normal top-load path
calls the heavyweight `/api/platform/bootstrap` endpoint. It also checks that
the composer remains visible and that no API request takes more than 4 seconds
in the local snapshot-backed path. It writes:

```text
generated/browser-performance-qa/latest.json
generated/browser-performance-qa/screenshots/*.png
```

Use it after data-loading, provider, snapshot, cache, or first-render changes.
The platform should render the shell quickly, then warm dashboard data in the
background from the snapshot/cache. Databricks should not be in the page-load
path.

`npm run check:browser-scroll` is the focused chat-scroll regression gate. It
submits a real question, delays the structured analyst response, verifies that
the submitted user message snaps near the top immediately, simulates a user
scroll while the answer is still computing, and then fails if the final answer
render yanks the viewport away from the user's chosen position. It writes:

```text
generated/browser-scroll-snap-qa/latest.json
generated/browser-scroll-snap-qa/screenshots/*.png
```

Use it after changing chat timeline rendering, temporary related-surface
messages, sticky composer behavior, surfaced modules, or snap/scroll logic.

`npm run check:production-smoke` probes `https://www.alamoplatform.com` by default
without trying to bypass authentication. It passes when the deployed shell is
reachable and either renders the app shape or correctly redirects/blocks behind
the Entra login gate. It fails on DNS/TLS errors, 5xx responses, 404 routes, or
blank/non-platform responses. Override the target with:

```bash
PRODUCTION_SMOKE_BASE_URL=https://preview-url.vercel.app npm run check:production-smoke
```

It writes:

```text
generated/production-smoke/latest.json
```

`npm run check:production-signed-in-smoke` is the auth-state browser smoke. It
uses Playwright storage state from `.auth/alamo-production-storage-state.json`
by default. It opens production `/`, `/home`, `/explorer/residents`,
`/explorer/incidents`, and `/command-center`; requires all five California
community markers; waits for nonzero governed resident and incident records;
opens and closes every community profile; and exercises Questions, wordmark,
and Command Center navigation. It rejects console/API failures, horizontal
overflow, empty explorers, unresolved loading, unavailable snapshot health, and
a home useful-ready time above five seconds. Cold governed-data endpoints have
up to twelve seconds to become ready, but must settle with nonzero records and
no HTTP 400+ response; the larger allowance does not turn missing data into a
pass. If the auth state file is missing, the command writes a skipped artifact and exits
successfully unless `PRODUCTION_SIGNED_IN_REQUIRED=true` is set. The auth
directory is gitignored.
Create or refresh the local signed-in state with:

```bash
npm run capture:production-auth
```

That command opens production in a headed browser, waits for the signed-in
workspace, and saves the local browser storage state plus MSAL sessionStorage
for future smoke checks.
Override paths with:

```bash
PRODUCTION_SIGNED_IN_STORAGE_STATE=.auth/preview.json npm run check:production-signed-in-smoke
```

It writes:

```text
generated/production-signed-in-smoke/latest.json
```

Command Center reads the latest platform-ready, regression, browser, journey,
performance, replay, production-smoke, and signed-in-smoke artifacts into the
Validation Coverage section so a user can see whether the reliability suite
actually ran.

The capability registry check makes sure every certified analyst family has a
deterministic/Claude escalation policy, registered preferred tool, answer style,
examples, and data contract. It is the bridge between product intent and
executable analyst rails.

The analysis capability guard check generates dated prompts for every
current-state-only tool. It verifies each prompt fails preflight with
`temporal_scope_mismatch` instead of substituting today's roster, profile, or
snapshot data for a historical request.

The generated capability prompt check currently exercises 1,162 registry-derived
prompt variants and fails if coverage drops below 1,000. The operator prompt suite covers 171 single-turn prompts plus
4 follow-up prompts, including typo correction, module-surface aliases,
people-versus-incident AWOL grain, `what changed` variants, freshness
diagnostics, feed-delay wording, exact detail lists, and CSV parity.
Freshness diagnostics must expose lag-to-today and use `stale` truth state when
the latest incident detail date is behind today.
Incident Center "empty" or "zero today" troubleshooting prompts are pinned to
freshness/data-availability diagnostics before module-surface routing, so they
explain loaded rows instead of only opening the Incident Center.
Module-surface, module-catalog, incident freshness, and data availability
utility turns also carry certified family metadata so they stay deterministic
and show up in Command Center coverage instead of looking like generic chat.

The ad hoc module planner check validates both template fit and module-selection
reason codes. Composed modules must explain whether they are the direct answer
or explicitly requested census, incident, medication, documentation, resident,
or operating context; weak adjacent modules are dropped before rendering.

Incident-domain contracts also assert that large exact-row detail answers keep
the chat table bounded while the CSV artifact preserves the complete row set and
fingerprint. This keeps broad `list every...` requests from turning the chat
thread into a heavyweight datasheet render.
Generic detail-list contracts now cover broad resident and census row requests
the same way, so non-incident datasheet-style asks are previewed in chat while
the full CSV row set and dataset provenance remain intact.

CSV artifacts are now checked through the shared runtime schema as well. Any
handled answer with a CSV artifact must include a row-set ID, row count, matching
provenance, a provenance dataset, and an inline CSV payload whose data-row count
matches the declared row count.
If a table visual is only a preview of a larger CSV artifact, the visual must
carry `originalRowCount`, and that value must match the artifact row count.

The answer-contract suite also enforces the shared action policy. Normal and
recovery answers stay within the small action-chip cap, export actions are
hidden unless the user explicitly asks for export/download/CSV, and explicit
export prompts must return a CSV artifact instead of a pile of follow-up
buttons.
The same suite also locks down period parsing: true ranges such as May through
June expand, while mixed discrete periods such as June 2026 and November 2020
fail closed without exporting partial rows or substituting a nearby period.
Code-health also keeps month parsing behind the shared `period-utils` boundary,
so the compiler and runtime tools cannot drift into two different date
interpretations again.
Strong direct answers and CSV-backed broad previews are also capped to one
useful action chip, so certified guidance cannot reintroduce button clutter.
Focused data-availability checks verify census, resident roster, and
documentation coverage questions render only the requested grain instead of a
generic all-dataset table.
Ad hoc module planner checks also verify exact-row/export/coverage prompts do
not compose extra modules, even when the prompt includes adjacent comparison or
context wording.

`npm run check:answer-quality` is the focused self-audit gate for rendered
answers. It runs representative resident profile, AWOL people-count, exact-row,
freshness, unsupported-period, and broad community-history prompts, then checks
that every turn receives an answer-quality score, avoids awkward stale language,
preserves module/artifact expectations, and appears in the trace telemetry
quality summaries.

Answer-formatting, operator, and turn-trace store checks now assert that
ordinary handled tool results include runtime schema validation metadata and
low-PHI analyst turn traces. The trace store check also verifies that raw prompt
text is not retained in runtime telemetry and that recovery/not-loaded turns are
counted in summary and family telemetry.
Trace telemetry also carries execution timing and row-volume diagnostics, so
Command Center can distinguish ordinary turns from slow or previewed broad-row
answers without storing prompt text or row content.
Trace telemetry also includes a scrubbed execution-plan summary: selected tool,
canonical prompt hash/length, temporal capability, expected metric/grain/mode,
periods, category, community scope, resident-scope boolean, export intent, and
presentation. The trace store check verifies resident-profile turns mark
resident scope without retaining the resident name.

The answer-contract suite also unit-tests the tool-result schema itself. A
handled tool result must carry a valid `truthState`, the trace must carry the
same `truthState`, and missing or mismatched trace metadata is treated as a
schema failure. Clarification and missing-context stops are covered by this same
contract instead of bypassing it.

The platform API boundary check makes sure the client fetch layer validates
health, trace telemetry, home, community, incident, analytics-summary, and data
explorer responses before rendering or accepting warm-cache entries. It also
verifies the server validates primary chat, tool, intent, and session-reset POST
request bodies before dispatching handlers.
The same API check now calls the production Claude message route with
`forceClaude: true` for a certified deterministic AWOL people-count prompt and
fails unless the response stays on `deterministic-tools`. This protects the
server boundary from silently using Anthropic for bread-and-butter certified
questions.
The trace telemetry validator checks recovery/stale/not-loaded summary fields,
certified/uncategorized turn counts, family breakdowns, sampled tool rows,
sampled trace rows, plan summaries, deterministic decision summaries, answer
quality scores/flags, module coverage, and outcome flags.

## Code Health Checks

The code-health script guards:

- source import cycles
- duplicate top-level declarations
- boundary regressions
- monolith growth budgets
- extracted incident symbols returning to `copilot-tools.mjs`
- certified-cache eligibility staying behind the cache-policy boundary
- platform API validators remaining wired into every frontend data fetch

`npm run check:unused` runs Knip with Vercel handlers and QA scripts registered
as entrypoints. It fails on unreachable production files, unused dependencies,
and stale exports while excluding declaration shims that describe shared
JavaScript modules.

`npm run check:duplicates` runs JSCPD across `src`, `server`, `shared`, and
`api`. The threshold is zero for clones of at least 12 lines and 80 tokens. The
gate prevents copied query, formatting, API, chart, and surface logic from
quietly diverging.

Both checks run inside `check:analyst`, so the full deterministic analyst gate
also protects repository structure.

`npm run check:governed-reports` validates the report layer independently. It
rejects stale or incompletely validated evidence, conflicting and unregistered
routes, unsafe HTML, out-of-domain email recipients, and missing weekly
question routes. It also verifies deterministic fallback output and weekly
delivery idempotency. The check runs inside `check:analyst`.

`npm run check:full-reports` validates all seven `governed-full-report-v1`
families against a fixed snapshot fixture. It requires stable report IDs,
period-correct community incident detail, audience-scoped effectiveness
evidence, evidence provenance, complete multi-section documents, natural
summary prose, and standalone HTML artifacts. The check runs inside
`check:analyst`.

Use the fixed fixture to prove deterministic report behavior. To verify the
currently published report data and freshness, run the browser check against
Azure explicitly:

```bash
PLATFORM_SNAPSHOT_READ_SOURCE=azure npm run check:browser-full-reports
```

Use the check as an early warning system, not as a substitute for refactoring.

`npm run check:pipeline-clinical` validates the dedicated read-only Pipeline
contract against a sanitized snapshot fixture. It covers required provenance,
null census behavior, reconciliation, deterministic opaque pagination,
duplicate resident ambiguity, qualified resident lookup, failed-QA rejection,
stale health, response bounds, scope-or-role authorization, and exclusion of
medication names and raw MAR detail. The check runs inside `check:analyst`.

## Databricks QA Versus Node QA

Databricks QA:

- validates source/view data contracts
- runs in `analyst_context_qa.py`
- blocks snapshot publication on critical contract failures

Node/app QA:

- validates language routing, tool selection, truth states, answer shape, and
  frontend-facing contracts
- runs through package scripts
- produces Command Center QA artifacts

Both are required. One does not replace the other.

## Browser Verification

When local Entra and API credentials are configured, verify:

- login redirect works
- `/home` renders the California map, all five community markers, and Ask a question
- every marker opens the complete community profile modal and the backdrop closes it
- a community surface opens in-thread
- Incident Center loads source indicator/current rows
- Command Center shows snapshot and analyst QA status

When local Entra prevents browser verification, rely on:

- TypeScript/check scripts
- production/staging deploy smoke checks
- authenticated health endpoints
- Command Center diagnostics

## Known Quality Gaps

- HTTP runtime schemas cover every live browser response boundary and primary
  chat/tool request body.
- Analyst turn traces now have a bounded runtime journal and Command Center
  diagnostics, but no external long-retention telemetry sink yet.
- `WorkspaceHomePage.tsx` still has too many responsibilities.
- `copilot-tools.mjs` still owns several domains.
- Prompt corpus should stay above 1,000 generated certified cases and continue
  growing from real Command Center misses.
- Browser-level persistence migration tests are still limited.
- Every retained Markdown file is allowlisted, owned, linked from the handbook,
  and checked for file-level local links.
