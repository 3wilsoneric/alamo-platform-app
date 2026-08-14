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
- Product surfaces: [docs/platform/product-surfaces.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/product-surfaces.md)
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

## Hard Boundaries

- This repo is Alamo Platform only.
- Do not reintroduce the old root shell, desktop shell, or unused prototype pages.
- Do not add generic AI scaffolds unless they are wired into the live platform runtime and covered by checks.
- Medication/MAR data may be documented only as platform analytics context, not as a separate product.

## Verification Defaults

Run from this directory:

```bash
npm run check:docs
npm run typecheck
npm run check:analyst
npm run build
```

For smaller changes, run the narrowest relevant script first, then the full gate before handoff.
