# Repository Ownership And Retention

- purpose: define why every project file exists and prevent stale files, plans, prototypes, and generated debris from returning
- status: authoritative current-state repository contract
- owners: engineering, product, data platform
- updated: 2026-08-02
- tags: repository, ownership, retention, cleanup, governance
- labels: platform-handbook, current-state, source-of-truth
- related files:
  - [AGENTS.md](/Users/eric/CareEngineMain/alamo-platform-app/AGENTS.md)
  - [package.json](/Users/eric/CareEngineMain/alamo-platform-app/package.json)
  - [check-repository-retention.mjs](/Users/eric/CareEngineMain/alamo-platform-app/scripts/check-repository-retention.mjs)

## Retention Rule

A project file remains only when it belongs to one of the ownership classes
below and passes the automated retention gate. Completed plans, duplicate
documentation, sample data, placeholder product areas, generated mirrors, and
unreachable code are deleted rather than archived in the app repository.

## Ownership Classes

| Class | Paths | Owner | Why it exists |
|---|---|---|---|
| App shell and tooling | approved root files | engineering | Build, typecheck, dependency, deployment, and local-development configuration. |
| Browser runtime | `src/**` | frontend and product | Shipped React routes, workspace modules, authentication, data clients, UI utilities, and source-traceable static research consumed directly by a product surface. |
| Static browser assets | approved image files in `public/**` | frontend and product | Shipped favicon and other directly served brand assets. |
| Vercel API | `api/**` | backend | Production HTTP boundaries consumed by the browser or operations. |
| Server domain | `server/**` | backend and data platform | Snapshot access, deterministic analysis, validation, and local API behavior. |
| Shared contracts | `shared/**` | frontend and backend | Runtime-neutral intent, session, module, metric, period, and display contracts. |
| Data publishing | `databricks/notebooks/**`, `databricks/workflows/**` | data platform | Governed ElderMark transformation, QA, tool context, and snapshot publication. |
| Verification | `scripts/**` | engineering and QA | Package-invoked checks, browser journeys, artifact generation, and shared QA helpers. |
| Handbook | `README.md`, `AGENTS.md`, `docs/platform/**` | product and engineering | Current product, architecture, operations, testing, and ownership guidance. |
| Live specifications | six files in `docs/reference/**` | named domain owners | Detailed contracts still implemented by current code or required by operators. |

## Retained Specifications

The reference directory is an allowlist, not an archive:

- [alamo-platform-complete-data-strategy-map-2026-08-03.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/alamo-platform-complete-data-strategy-map-2026-08-03.md)
- [analysis-session-state-spec.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/analysis-session-state-spec.md)
- [analytics-tool-context-views.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/analytics-tool-context-views.md)
- [mar-source-inventory-findings.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/mar-source-inventory-findings.md)
- [platform-daily-publish-runbook.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/platform-daily-publish-runbook.md)
- [platform-module-registry-spec.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/platform-module-registry-spec.md)

## Generated And Local State

`node_modules`, `dist`, `generated`, `.auth`, `.vercel`, `.env`, Python bytecode,
and local browser-auth state are ignored operational state, not project source.
They are never documentation or implementation authority. Cache files such as
`.DS_Store`, `__pycache__`, and `*.pyc` are rejected when found outside ignored
dependency/build boundaries.

## Permanent Gates

`npm run check:retention` verifies:

- every project-owned file matches one ownership class
- production Vercel APIs and Databricks workflows match exact allowlists
- every retained Markdown file is allowlisted and linked from the handbook map
- every QA script is package-invoked or imported by another QA script
- every declaration file has a runtime module
- every Databricks notebook is workflow-owned or an explicitly retained diagnostic
- the environment template includes every supported runtime variable and excludes retired variables
- no retired product directories, cache debris, backup files, or generated source mirrors return

`npm run check:unused`, `npm run check:duplicates`, `npm run check:code-health`,
and `npm run check:docs` provide the corresponding import, clone, architecture,
and documentation checks.
