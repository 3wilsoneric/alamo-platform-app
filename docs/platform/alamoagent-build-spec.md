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
routing are edited in AlamoAgent. Platform consumes a pinned archive at
`vendor/alamo-agent-runtime-0.1.0.tgz`; the old engine modules re-export that package.
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
