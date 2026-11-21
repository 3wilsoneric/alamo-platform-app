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
candidate below uses `vendor/alamo-agent-runtime-0.18.0.tgz`. Old engine modules re-export that package.
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
The independent engine now has a local 0.18.0 candidate, consumed by this checkout
through its pinned archive. Existing production images, access and source data
have not changed. The engine's living spec remains the implementation authority;
this section records Platform's ownership and integration evidence.

Platform owns `/api/platform/ally-source/v1`, its workload-token verifier, the
separate private `agent-source/report-grants-v1.json` registry, and domain readers.
Community and date constraints are added by the source, outside model arguments.
Aggregate grants cannot use private fields for grouping or named-person probes.
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
See the candidate rollout boundary in [deployment operations](deployment-operations.md).

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
