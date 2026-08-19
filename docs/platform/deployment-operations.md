# Deployment And Operations

- purpose: document local development, production deployment, auth, environment variables, and health checks
- status: authoritative current-state reference
- owners: engineering, operations
- updated: 2026-07-22
- tags: deployment, vercel, local-dev, entra, databricks, azure, operations
- labels: platform-handbook, current-state
- related files:
  - [alamo-platform-app/.env.example](/Users/eric/CareEngineMain/alamo-platform-app/.env.example)
  - [alamo-platform-app/package.json](/Users/eric/CareEngineMain/alamo-platform-app/package.json)
  - [alamo-platform-app/server/databricks.mjs](/Users/eric/CareEngineMain/alamo-platform-app/server/databricks.mjs)
  - [alamo-platform-app/server/platform-snapshot.mjs](/Users/eric/CareEngineMain/alamo-platform-app/server/platform-snapshot.mjs)
  - [alamo-platform-app/vite.config.ts](/Users/eric/CareEngineMain/alamo-platform-app/vite.config.ts)
  - [alamo-platform-app/vercel.json](/Users/eric/CareEngineMain/alamo-platform-app/vercel.json)

## Local Development

Install and run:

```bash
cd /Users/eric/CareEngineMain/alamo-platform-app
npm install
npm run dev:all
```

Ports:

- Vite frontend: `http://localhost:3001`
- local API server: `http://localhost:3002`
- Vite proxies `/api` to port `3002`
- The local API accepts loopback-only browser origins (`localhost`,
  `127.0.0.1`, and `[::1]`) on any port so isolated QA servers remain usable.
  Use the comma-separated `DEV_API_ALLOWED_ORIGINS` override to restrict this
  to an explicit local origin list.

Useful separate commands:

```bash
npm run dev
npm run dev:api
npm run snapshot:generate
npm run snapshot:publish
npm run build
```

## Production Build

```bash
cd /Users/eric/CareEngineMain/alamo-platform-app
npm run build
```

Build behavior:

- `npm run build` only runs the Vite production build.
- It does not generate or publish platform snapshots.
- Production runtime requires Azure snapshot storage and fails closed when its
  credentials are incomplete, its latest blob is missing, or its read fails.
- Local generated snapshot is a development-only fallback. It is never used to
  conceal an Azure production outage.
- `npm run snapshot:generate` writes a local fallback snapshot only.
- `npm run snapshot:publish` is an explicit escape hatch that can publish a
  locally generated snapshot to Azure; do not use it for the normal daily data
  pipeline because the Databricks `snapshot_publish` notebook owns the governed
  tool-context snapshot.
- App-side Azure publishing refuses to publish an empty analyst `toolContext`
  unless `PLATFORM_SNAPSHOT_ALLOW_EMPTY_TOOL_CONTEXT=true` is set for an
  intentional emergency override.

## Frontend Auth Variables

Browser-safe Entra variables:

- `VITE_ENTRA_CLIENT_ID`
- `VITE_ENTRA_TENANT_ID`
- `VITE_ENTRA_API_SCOPE` optional override; defaults to `api://<client-id>/access_as_user`
- `VITE_API_AUTH_REQUIRED` optional local-development opt-in; production builds always require API auth

If the first two are missing, the protected shell shows an authentication setup
message instead of rendering the app.

The browser callback is always `<current-origin>/login`; it is not configurable.
For production, register `https://www.alamoplatform.com/login` as a **Single-page
application** redirect URI in Entra. The registered URI must match the canonical
browser origin exactly. The apex domain redirects to `www`, so an apex callback
cannot safely carry the OAuth response.

MSAL also reuses `/login` inside a same-origin hidden frame when it refreshes an
API token. Production security headers therefore allow framing by the same
origin only (`frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN`) and allow
both Microsoft and same-origin frame sources. External sites still cannot frame
the platform. Do not restore `frame-ancestors 'none'`, `X-Frame-Options: DENY`,
or a Microsoft-only `frame-src`; those settings let the first sign-in complete
but block the authenticated workspace from acquiring its API token.

## Server Auth Variables

Microsoft/Azure service principal:

- `ENTRA_CLIENT_ID`
- `ENTRA_CLIENT_SECRET`
- `ENTRA_TENANT_ID`

Delegated user API authorization:

- `API_AUTH_REQUIRED` optional local-development override; Vercel preview and production always fail closed
- `ENTRA_API_AUDIENCE` optional override; defaults to `api://<ENTRA_CLIENT_ID>`
- `ENTRA_API_SCOPE` defaults to `access_as_user`
- `ENTRA_API_REQUIRED_ROLE` optional defense in depth; when set, the delegated token must contain this Entra app role

The API validates Microsoft signatures, the configured tenant, audience, scope,
and optional role. It accepts both Entra v1 (`sts.windows.net`) and v2
(`login.microsoftonline.com/.../v2.0`) issuer forms because the app registration's
token version controls which valid issuer Microsoft returns.

The Entra app registration must expose the delegated `access_as_user` scope. A deployment without that scope will show the login UI but API requests will be rejected rather than exposing resident or operational data anonymously.

Before production access is granted, configure the Entra Enterprise Application
with **Assignment required** enabled and assign only approved users or groups.
For an additional server-enforced boundary, define an app role such as
`AlamoPlatform.User`, assign it to the same users or groups, and set
`ENTRA_API_REQUIRED_ROLE=AlamoPlatform.User` in Vercel. Do not set the variable
until the role appears in delegated access tokens; the API rejects tokens that
do not carry it.

Azure snapshot storage:

- `AZURE_STORAGE_ACCOUNT`
- `AZURE_STORAGE_CONTAINER`
- `AZURE_STORAGE_CONNECTION_STRING` optional legacy path
- `SNAPSHOT_ROOT`
- `PLATFORM_SNAPSHOT_MAX_BYTES` defaults to 64 MB. The publisher emits compact,
  tables-only analyst context so the governed snapshot remains below this bound.

Databricks:

- `DATABRICKS_HOST`
- `DATABRICKS_HTTP_PATH` or `DATABRICKS_SQL_WAREHOUSE_ID`
- `DATABRICKS_CATALOG`
- `DATABRICKS_SCHEMA`
- `DATABRICKS_CLIENT_ID`
- `DATABRICKS_CLIENT_SECRET`

Development-only Databricks fallback:

- `DATABRICKS_TOKEN`
- `ALLOW_DATABRICKS_PAT_IN_DEV=true`

Production should use Databricks OAuth, not PAT fallback.

Anthropic/AH Analyst:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `ANTHROPIC_MAX_TOKENS`
- `ANTHROPIC_TIMEOUT_MS` bounded per-attempt timeout; defaults to 35 seconds
- `ANTHROPIC_MAX_ATTEMPTS` bounded retry count from 1 to 3; defaults to 2
- `COPILOT_ASSISTANT_LABEL`
- `GOVERNED_REPORT_SYNTHESIS_ENABLED`; set `false` to force deterministic one-page report prose

Do not put private API keys in `VITE_*` variables.

Governed report delivery:

- `REPORT_EMAIL_WEBHOOK_URL`: HTTPS-only mail-delivery webhook
- `REPORT_EMAIL_WEBHOOK_SECRET`: Bearer secret checked by the webhook
- `REPORT_EMAIL_ALLOWED_DOMAINS`: comma-separated recipient-domain allowlist
- `REPORT_EMAIL_TIMEOUT_MS`: bounded from 2 to 30 seconds

All three delivery values must be valid before the workspace exposes **Email
to me**. The webhook receives `to`, `subject`, `html`, `filename`, `reportId`,
`audience`, `period`, and `idempotencyKey`. It must reject bad Bearer tokens,
send only to the supplied approved recipients, and deduplicate the
`Idempotency-Key` header.

Weekly briefing delivery:

- `CRON_SECRET`: required by `/api/reports/weekly`; Vercel supplies it to cron requests
- `WEEKLY_BRIEFING_EXECUTIVE_RECIPIENTS`
- `WEEKLY_BRIEFING_OPERATIONS_RECIPIENTS`
- `WEEKLY_BRIEFING_CLINICAL_RECIPIENTS`
- `WEEKLY_BRIEFING_COMMUNITY_RECIPIENTS_JSON`: recipients keyed by facility ID or exact community name
- `WEEKLY_BRIEFING_SCHEDULE_LABEL`: display-only operator label

The schedule itself lives in `vercel.json` and currently runs each Monday.
Plans without recipients are skipped. A failed audience is reported
independently. The cron endpoint returns `503` when any configured plan fails,
allowing a safe retry through idempotent delivery.

## Health Checks

Use these endpoints after deploy or publish from a signed-in platform session
or with an `Authorization: Bearer <access-token>` header. Preview and production
health endpoints are deliberately not public; an anonymous `401` confirms that
the delegated API boundary is fail-closed.

- `/api/platform/health`
- `/api/platform/snapshot-health`
- `/api/platform/snapshot-metadata`
- `/api/platform/analyst-qa`
- `/api/platform/analyst-traces`
- `/api/platform/bootstrap`
- `/api/integrations/pipeline/clinical/health`
- `/api/integrations/pipeline/clinical/census`
- `/api/integrations/pipeline/clinical/roster?limit=1`
- `/api/integrations/pipeline/clinical/medications/summary`
- `/api/communities/dashboard`
- `/api/communities/snapshot?facilityId=337`
- `/api/incidents`
- `/api/chat/claude/health`
- `/api/reports/status`

Interpretation:

- snapshot missing on bootstrap/community endpoints should be a controlled `503`
- snapshot stale should appear in metadata/Command Center, not silently hide
- `/api/incidents` should say whether it returned `live-databricks` or
  `snapshot-fallback`
- analyst QA warning means the app can still run, but at least one tested prompt
  path needs review
- Pipeline clinical health returns `503` for a stale, missing, QA-rejected, or
  incomplete snapshot. Data endpoints may preserve a stale last-known-good
  snapshot only when the response clearly carries stale freshness metadata.

Pipeline clinical integration:

- `PIPELINE_CLINICAL_API_SCOPE`: delegated Entra scope, normally `Pipeline.Clinical.Read`
- `PIPELINE_CLINICAL_API_ROLE`: service application role, normally `Pipeline.Clinical.Read.All`
- `PIPELINE_CLINICAL_SNAPSHOT_MAX_AGE_HOURS`: freshness target, defaults to 24
- `PIPELINE_CLINICAL_API_MAX_RESPONSE_BYTES`: per-response bound, defaults to 2 MB
- `PLATFORM_CLIENT_DATABASE_MAX_BYTES`: bounded static client database read,
  defaults to 16 MB

Assign the Pipeline service principal the Alamo API application role and grant
tenant admin consent before enabling the Pipeline production adapter. Do not
copy ElderMark, Databricks, Azure snapshot, or Alamo server credentials into a
Pipeline browser variable.

Pipeline clinical health is ready only when the QA-approved daily snapshot,
census, roster, medication summary, and referenced client database all validate.
The client database remains server-only and is never included in the platform
bootstrap or delivered in bulk to Pipeline.

## Common Operator Fixes

Snapshot/tool context is empty:

```text
Run tool_context_views -> analyst_context_qa -> snapshot_publish.
```

Entra login page blocks the app:

```text
Check VITE_ENTRA_CLIENT_ID, VITE_ENTRA_TENANT_ID, and confirm the Entra SPA redirect list contains the exact return address shown on the login page.
```

Databricks 401/secret errors:

```text
Use the client secret value, not the secret ID. Confirm service principal has Databricks/warehouse access.
```

Graph/email 401:

```text
This is separate from platform auth. Mail.Send app permission and mailbox eligibility must be configured.
```

Today's incidents not visible:

```text
Check latest incident detail date, rows dated today, snapshot generated time, and source feed freshness before changing UI.
```

## Vercel Routing

`vercel.json` rewrites nested API paths to single handler files and falls all
non-API routes back to `index.html`. This is why React deep links work even
though Vercel does not have a physical file per route.

It also schedules `/api/reports/weekly`. Changing the human-readable
`WEEKLY_BRIEFING_SCHEDULE_LABEL` does not change the cron; edit the UTC cron in
`vercel.json` when the actual run time changes.

## Security Notes

- Browser never calls Databricks or Claude directly.
- Browser sends a delegated Entra access token to every platform API request.
- Serverless API handlers validate token signature, issuer, audience, and scope before data access.
- When `ENTRA_API_REQUIRED_ROLE` is configured, handlers also require the assigned Entra app role.
- Server owns model/API keys and Databricks credentials.
- Frontend Entra variables are public configuration, not secrets.
- Generated docs should name environment variable keys but never preserve secret values.
