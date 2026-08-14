# Alamo Platform App

- purpose: app-level entry point for the current Alamo Platform web workspace
- status: current
- owners: engineering, product, data platform
- updated: 2026-07-18
- tags: alamo-platform, vite, react, vercel, snapshot, analyst
- labels: app-readme, current-state
- related files:
  - [docs/platform/README.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/README.md)
  - [docs/platform/architecture.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/architecture.md)
  - [docs/platform/integration-platform.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/integration-platform.md)
  - [docs/platform/deployment-operations.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/deployment-operations.md)
  - [docs/platform/testing-quality.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/testing-quality.md)
  - [docs/platform/repository-ownership.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/repository-ownership.md)
  - [.env.example](/Users/eric/CareEngineMain/alamo-platform-app/.env.example)

## What This Is

Alamo Platform is the web operating workspace for Alamo Health. It is a
Microsoft Entra-protected React app backed by Vercel API routes, Databricks gold
views, Azure-published daily snapshots, and a bounded AH Analyst tool layer.

The signed-in entry experience is `/home`: a California community map where users
select one of five locations and open its census, incidents, medication, diagnosis,
and resident profile. The governed vertical analyst sits directly beneath the map
and remains deep-linkable at `/questions`, where users choose vetted questions, receive deterministic answers,
surface reusable modules, and follow registered drilldowns into Communities,
Incidents, and Resident Search.

This repository is only the Alamo Platform app and its supporting publish,
analytics, and operations code.

## Canonical Docs

Start here:

- [Platform Handbook](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/README.md)

The handbook explains:

- current routes and product surfaces
- the integration path for EHR, eMAR, and analytics products
- snapshot-first runtime
- Databricks publish pipeline
- AH Analyst architecture
- deployment and operations
- testing/QA gates
- repository ownership and retention rules

## Local Development

```bash
cd /Users/eric/CareEngineMain/alamo-platform-app
npm install
npm run dev:all
```

Ports:

- frontend: `http://localhost:3001`
- local API: `http://localhost:3002`

Run separately when useful:

```bash
npm run dev
npm run dev:api
```

## Build And Checks

```bash
npm run typecheck
npm run check:source-syntax
npm run check:unused
npm run check:duplicates
npm run check:dependencies
npm run check:analyst
npm run check:docs
npm run build
```

Daily/generated analyst artifacts:

```bash
npm run cache:certified
npm run qa:analyst
```

## Runtime Model

Core platform surfaces read from published snapshot artifacts first:

- `snapshots/daily/latest.json`
- `snapshots/daily/YYYY-MM-DD.json`

Incident Center is the main exception: `/api/incidents` tries live Databricks
first, disables caching, and uses snapshot fallback only if live access fails.

## Environment

Use:

- [.env.example](/Users/eric/CareEngineMain/alamo-platform-app/.env.example)

Never put private service credentials in browser-exposed `VITE_*` variables.

Important groups:

- frontend Entra: `VITE_ENTRA_CLIENT_ID`, `VITE_ENTRA_TENANT_ID`, optional `VITE_ENTRA_API_SCOPE`; register `<canonical-origin>/login` as the Entra SPA callback
- delegated API auth: `API_AUTH_REQUIRED`, optional `ENTRA_API_AUDIENCE`, `ENTRA_API_SCOPE`
- server Entra/Azure: `ENTRA_CLIENT_ID`, `ENTRA_CLIENT_SECRET`, `ENTRA_TENANT_ID`
- Databricks OAuth: `DATABRICKS_CLIENT_ID`, `DATABRICKS_CLIENT_SECRET`
- snapshot storage: `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_CONTAINER`, `SNAPSHOT_ROOT`
- AH Analyst model key: `ANTHROPIC_API_KEY`

## Health Endpoints

Production and preview health endpoints use the same delegated Entra bearer
token as every other platform API. Check them from a signed-in browser session
or an authenticated API client; an anonymous request should return `401`.

- `/api/platform/health`
- `/api/platform/snapshot-health`
- `/api/platform/snapshot-metadata`
- `/api/platform/analyst-qa`
- `/api/platform/bootstrap`
- `/api/incidents`
- `/api/chat/claude/health`

See [deployment-operations.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/deployment-operations.md)
for interpretation and common fixes.
