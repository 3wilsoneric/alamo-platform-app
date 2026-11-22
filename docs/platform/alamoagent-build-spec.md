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

The expanded layout now keeps a compact conversation trail beside a reading canvas. An answer appears directly with its formatted text and tables; source links stay in one collapsed disclosure. Entitled report users can build a report in the canvas without losing the chat, and the existing report view renders its chart or values there. On phones, Chat and Canvas are separate tabs and a new answer opens the Canvas tab. A synthetic HTTP fixture exercises a conversation answer, table, cited source, chart report, and follow-up composer at desktop and phone widths. These are presentation and existing report-rendering behaviors; model-authored arbitrary UI components and broader data coverage are not implemented by this change.

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
