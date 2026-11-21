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
candidate below uses `vendor/alamo-agent-runtime-0.18.1.tgz`. Old engine modules re-export that package.
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

## Executive Ally candidate — November 20, 2026

The owner authorized the executive experience and then deferred **live GPT testing**.
The independent engine now has a local 0.18.1 candidate, consumed by this checkout
through its pinned archive. Existing production images, access and source data
have not changed. The engine's living spec remains the implementation authority;
this section records Platform's ownership and integration evidence.

The November 21 permission correction is local: source grant receipts now expose
their existing boolean `detail` permission, and evidence carries `requiresDetail`.
A signed-source regression first reproduced disclosure of saved detail to an
aggregate-only recipient. The corrected engine rejects that share and hides
saved reports after a detail downgrade; a fresh aggregate report remains usable
and shareable. Grant replacement during synthesis also prevents publication.
The new fields must ship with engine 0.18.1. The disabled local overlay has been
rebuilt and rechecked against the production base; the operations document holds
its current receipt. The earlier cloud staging receipts still cover 0.18.0,
so paired staging acceptance remains required. Live GPT testing stays deferred.

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
The separate staging API and worker now use the tested 0.18.0 package, with dispatch off,
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

The corrected source is now verified in isolated cloud staging using the real
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
