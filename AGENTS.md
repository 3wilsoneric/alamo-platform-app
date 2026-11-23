# AGENTS

This is the agent-readable map for the Alamo Platform app.

Use progressive disclosure:

- start here
- open the single linked doc that matches the task
- avoid loading old reference docs unless a task genuinely needs history

## Primary Map

- Platform handbook: [docs/platform/README.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/README.md)
- Architecture: [docs/platform/architecture.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/architecture.md)
- Integration platform strategy: [docs/platform/integration-platform.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/integration-platform.md)
- AlamoAgent living build spec: [docs/platform/alamoagent-build-spec.md](docs/platform/alamoagent-build-spec.md) — read before agent, skill, workflow, memory, embedding, or agent-rollout work; update it in the same change when decisions, scope, implementation status, evidence, or next steps change.
- Product surfaces: [docs/platform/product-surfaces.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/product-surfaces.md)
- Folder and material styling: [docs/platform/material-folder-design.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/material-folder-design.md) — read before reusing the realistic folders, dashboard folios, ledgers, or Licensing styling in Platform or Pipeline.
- Operator journeys: [docs/platform/user-journeys.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/user-journeys.md)
- AH Analyst system: [docs/platform/analyst-system.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/analyst-system.md)
- Data publishing: [docs/platform/data-publishing.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/data-publishing.md)
- Deployment and operations: [docs/platform/deployment-operations.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/deployment-operations.md)
- Testing and quality: [docs/platform/testing-quality.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/testing-quality.md)
- Repository ownership: [docs/platform/repository-ownership.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/repository-ownership.md)
- Ship checklist: [docs/platform/ship-checklist.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/ship-checklist.md)

## Supporting References

- Complete platform and data-strategy map: [docs/reference/alamo-platform-complete-data-strategy-map-2026-08-03.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/alamo-platform-complete-data-strategy-map-2026-08-03.md)
- Analysis session state: [docs/reference/analysis-session-state-spec.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/analysis-session-state-spec.md)
- Module registry: [docs/reference/platform-module-registry-spec.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/platform-module-registry-spec.md)
- Tool-context views: [docs/reference/analytics-tool-context-views.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/analytics-tool-context-views.md)
- MAR source inventory: [docs/reference/mar-source-inventory-findings.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/mar-source-inventory-findings.md)
- Daily publish runbook: [docs/reference/platform-daily-publish-runbook.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/platform-daily-publish-runbook.md)
- Deferred Knowledge Atlas + jobs workflow: [docs/reference/alamo-knowledge-job-workflow-deferred.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/alamo-knowledge-job-workflow-deferred.md)

## Hard Boundaries

- This repo is Alamo Platform only.
- Do not reintroduce the old root shell, desktop shell, or unused prototype pages.
- Do not add generic AI scaffolds unless they are wired into the live platform runtime and covered by checks.
- Medication/MAR data may be documented only as platform analytics context, not as a separate product.

## Verification Defaults

For AlamoAgent work, keep the living build spec current before handoff. Distinguish
user requirements, proposed architecture, implemented source, and verified
deployment; a passing build or saved branding does not establish production
availability. Preserve the latest rollout and notification restrictions. Keep
deployment receipts in the operations doc and link them from the spec rather
than creating competing plans. Documentation maintenance does not authorize
deployment, broader access, or outbound notifications.

Run from this directory:

```bash
npm run check:docs
npm run typecheck
npm run check:analyst
npm run build
```

For smaller changes, run the narrowest relevant script first, then the full gate before handoff.

## November 23 owner-directed scoped releases

For changes confined to Ally's report UI and governed report adapters, use
`npm run check:ship:ally:predeploy` (nine stages), then the immutable-image
configuration/file-diff check and `npm run check:ship:ally:postdeploy` against
the deployed candidate. Check the actual changed workflow signed in: a real
question must reach a saved answer or an explicit coverage limit; reopen it and
exercise History in the normal panel and on a phone. Engine changes additionally
require engine tests/build/package and the native Functions recovery check.
Source grant changes require exact before/after registry receipts, denied-scope
checks and a usable conditional rollback. Never use synthetic model output as
proof of live model availability or answer accuracy.

This is the applicable gate for bounded Ally releases; it supersedes the earlier
blanket full-suite-before-and-after requirement for this scope. The full suite
remains for broad shell, authentication, data-publishing or cross-feature changes.
Historical guided-question generation, unrelated journey fuzzing and repeated
whole-app browser passes are not repeated for an Ally-only change. Do not weaken
assertions or suppress a relevant failure. Promote only the tested source/build;
retain rollback and verify production health, authorization and real behavior.

The History regression must assert containment within its clipping panel, not
merely within the page viewport, with eight long titles, keyboard focus, scroll
and click access. Source tests must distinguish daily from monthly grain, incomplete
coverage from zero, source failures from model failures, and retries from duplicate
work. Revisit this scoped gate when a change touches a shared owner outside Ally.
