# Deployment And Operations

- purpose: document local development, production deployment, auth, environment variables, and health checks
- status: authoritative current-state reference
- owners: engineering, operations
- updated: 2026-09-26
- tags: deployment, azure-container-apps, vercel, local-dev, entra, databricks, operations
- labels: platform-handbook, current-state
- related files:
  - [alamo-platform-app/.env.example](/Users/eric/CareEngineMain/alamo-platform-app/.env.example)
  - [alamo-platform-app/package.json](/Users/eric/CareEngineMain/alamo-platform-app/package.json)
  - [alamo-platform-app/server/databricks.mjs](/Users/eric/CareEngineMain/alamo-platform-app/server/databricks.mjs)
  - [alamo-platform-app/server/platform-snapshot.mjs](/Users/eric/CareEngineMain/alamo-platform-app/server/platform-snapshot.mjs)
  - [alamo-platform-app/vite.config.ts](/Users/eric/CareEngineMain/alamo-platform-app/vite.config.ts)
  - [alamo-platform-app/vercel.json](/Users/eric/CareEngineMain/alamo-platform-app/vercel.json)

## Current Production Host

`www.alamoplatform.com` is served by the Azure Container App
`alamo-platform-prod-web` in resource group `alamo-data-rg` (West US 2), using
Azure Container Registry `pipelineprodacra6qdvl6ebenac`. The Container App is
in single-revision mode; a new image update promotes the new revision. Confirm
the current image and revision with `az containerapp show` before every change.

The Vercel variables, API adapter, and cron settings below describe that
deployment target, not the current public `www` host. Do not treat a Vercel
promotion as an Azure production release. The September 2026 iPhone polish
release used `Dockerfile.iphone-overlay` to add CSS and Home Screen HTML
metadata to the exact preceding Azure image digest. The follow-up phone
experience release uses `Dockerfile.mobile-experience-overlay` on that digest
and adds only phone CSS, the stacked community selector, same-origin profile and
analytics choice controls, and their HTML references.
Neither overlay rebuilds the browser bundle or server. Rollback is an Azure
Container App image update to the recorded preceding digest, not a Vercel
promotion.

Source-level browser changes use `Dockerfile.frontend-release`. Build the Vite
bundle locally, pass the exact current production image digest as `BASE_IMAGE`,
and replace only `/app/dist`. This preserves the already-proven Azure server,
API, environment, and data adapters while shipping the reviewed React bundle.
Record the preceding image digest before promotion so rollback remains an Azure
Container App image update.

### Admissions board release — 2026-09-26

The compact Admissions workflow board is deployed as a frontend-only release:

- source commit: `348e96e`
- image tag: `alamo-platform:admissions-board-348e96e`
- image digest: `sha256:5f69353518b7c653062b80c6575a4cb2a0f80052e4ce6bfc2925ef90ec729132`
- active revision: `alamo-platform-prod-web--admissions-board-0926`
- rollback digest: `sha256:abd325d6a2dcb05837932ce77eedabd1d90fcaddbfe8539827cfd933a8553e15`

The release overlays `/app/dist` on the preceding production digest. It does
not replace the server, API, environment, or Pipeline feed configuration.
Post-promotion verification confirmed a healthy revision at 100% traffic,
4/4 public smoke probes, and a connected live Admissions payload with 21 of 21
board cards, five communities, and portfolio census 541.

### Admissions client identity release — 2026-09-26

The authenticated Admissions board now carries and displays the actual client
name from Pipeline. This is an intentional PHI-bearing server-to-server
contract inside the existing protected Platform boundary; deployment checks
must report name coverage by count and must not print names.

Pipeline producer:

- source commit: `58ddaf0874e966673156042df262656255ac7c7e`
- source PR: `https://github.com/3wilsoneric/pipeline-app/pull/209`
- image digest: `sha256:fdbdaad81a9babcab2e3477fe1274f72d45a3d4f4dd6ae36798bcbb03d8e2a3e`
- active revision: `pipeline-prod-web--58ddaf0874e96667`

Platform consumer:

- source commit: `8b3cce2`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/2`
- image tag: `alamo-platform:admissions-identity-8b3cce2`
- image digest: `sha256:9e58125439ee4e070bc17fab2cf5719081cea97186f23e6d70214da35742ffb3`
- active revision: `alamo-platform-prod-web--admissions-identity-0926`
- rollback digest: `sha256:5f69353518b7c653062b80c6575a4cb2a0f80052e4ce6bfc2925ef90ec729132`

The Platform release uses `Dockerfile.admissions-identity-release` to replace
the reviewed browser bundle and the Pipeline summary normalizer on the exact
preceding production digest. Post-promotion verification confirmed healthy
Pipeline and Platform revisions at 100% traffic, contract version 2.1, 21 of
21 board cards with non-empty client names, five communities, portfolio census
541, the desktop/mobile Admissions browser regression, and 4/4 public smoke
probes.

### Admissions progress review release — 2026-09-26

The Admissions board is now a self-contained analyst update. Its section tabs
use a quiet underline treatment, visible Pipeline links are removed, and every
client card opens a responsive progress modal with workflow stage, next action,
assignment, timing, planned admission, priority, and current review flags.

- source commit: `e5849bb`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/3`
- image tag: `alamo-platform:admissions-progress-e5849bb`
- image digest: `sha256:1fb96dc2fbc4de25e503b8f47248153b107ac979a94476e7dfcb34b25944b05e`
- active revision: `alamo-platform-prod-web--admissions-progress-0926`
- rollback digest: `sha256:9e58125439ee4e070bc17fab2cf5719081cea97186f23e6d70214da35742ffb3`

This is a frontend-only overlay on the preceding production digest.
Post-promotion verification confirmed a healthy revision at 100% traffic, a
connected payload with 21 of 21 named cards, five communities, portfolio census
541, the responsive desktop/mobile progress-modal regression, the absence of
the former Pipeline control in the deployed bundle, and 4/4 public smoke
probes.

### Admissions executive update release — 2026-09-26

The Board view now opens with one live executive paragraph derived from the
governed referral summary. It reports active workload, stage distribution,
the three busiest communities, and the current exception load in the voice of
an admissions coordinator briefing leadership.

- source commit: `7aa2ac7`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/4`
- image tag: `alamo-platform:admissions-executive-7aa2ac7`
- image digest: `sha256:507e93f00abb513e72e48810a2f687b2445c4077ce9fac548bca61104ba46ac8`
- active revision: `alamo-platform-prod-web--admissions-executive-0926`
- rollback digest: `sha256:1fb96dc2fbc4de25e503b8f47248153b107ac979a94476e7dfcb34b25944b05e`

This is a frontend-only overlay on the preceding production digest.
Post-promotion verification confirmed a healthy revision at 100% traffic, the
executive update and progress modal in the deployed bundle, no visible Pipeline
control, a connected payload with 21 of 21 named cards, and 4/4 public smoke
probes.

### Admissions canvas alignment release — 2026-09-26

The Admissions page canvas now uses the same white background as the main Home
surface while preserving workflow-column and card colors.

- source commit: `0faa171`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/5`
- image tag: `alamo-platform:admissions-canvas-0faa171`
- image digest: `sha256:02d025953096a7b0c7fdfb5f351b3cb9a0d6cb92d123288e301800a58d50d6e6`
- active revision: `alamo-platform-prod-web--admissions-canvas-0926`
- rollback digest: `sha256:507e93f00abb513e72e48810a2f687b2445c4077ce9fac548bca61104ba46ac8`

This is a frontend-only overlay. Post-promotion verification confirmed a
healthy revision at 100% traffic, matching computed Home and Admissions canvas
colors in desktop/mobile browser QA, a connected payload with 21 of 21 named
cards, and 4/4 public smoke probes.

### Admissions executive briefing format release — 2026-09-26

The live executive paragraph now separates workload, community concentration,
and immediate follow-up into three scannable lines. Selective semibold emphasis
creates reading hierarchy, and community loads use natural language instead of
parenthetical counts.

- source commit: `5c6927a`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/6`
- image tag: `alamo-platform:admissions-executive-format-5c6927a`
- image digest: `sha256:8e6b3b5d7af56d3b9fe932947804630fb7409184602f00c4409afaf54c875808`
- active revision: `alamo-platform-prod-web--admissions-format-0926`
- rollback digest: `sha256:02d025953096a7b0c7fdfb5f351b3cb9a0d6cb92d123288e301800a58d50d6e6`

This is a frontend-only overlay. Post-promotion verification confirmed a
healthy revision at 100% traffic, the desktop/mobile formatting regression, a
connected payload with 21 of 21 named cards, five communities, portfolio census
541, and 4/4 public smoke probes.

### Admissions community pills release — 2026-09-26

Community is now the Board's only filter. The former community and status
dropdowns, attention filter, and Clear control are replaced by responsive
community pills. Multiple communities can remain selected together, and All
communities resets the full board.

- source commit: `41dc177`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/7`
- image tag: `alamo-platform:admissions-community-pills-41dc177`
- image digest: `sha256:512ae688013f991080215dedfae1a738e1b15081b5137695edde3418c5195f59`
- active revision: `alamo-platform-prod-web--admissions-pills-0926`
- rollback digest: `sha256:8e6b3b5d7af56d3b9fe932947804630fb7409184602f00c4409afaf54c875808`

This is a frontend-only overlay. Post-promotion verification confirmed a
healthy revision at 100% traffic, additive multi-community selection and reset
behavior in desktop/mobile browser QA, a connected payload with 21 of 21 named
cards, five communities, portfolio census 541, and 4/4 public smoke probes.

### Admissions referral chart release — 2026-09-26

Opening an Admissions client now presents the governed referral summary as a
Pipeline-inspired chart in a manila folder frame. The white chart sheet orders
identity, next action, referral facts, workflow progress, and review focus for
fast operational review on desktop and mobile. No clinical fields or additional
Pipeline data were added to the bounded Platform summary.

- source commit: `814c68e`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/8`
- image tag: `alamo-platform:admissions-chart-folder-814c68e`
- image digest: `sha256:69bf936c2cf79f398b3b1fb931a5aaaef1418dead54c40833e4718d4cb4e1a7f`
- active revision: `alamo-platform-prod-web--admissions-chart-0927`
- rollback digest: `sha256:512ae688013f991080215dedfae1a738e1b15081b5137695edde3418c5195f59`

This is a frontend-only overlay. Post-promotion verification confirmed a
healthy revision at 100% traffic, the desktop/mobile chart-folder visual and
overflow checks, the expected folder treatment in the production bundle, a
connected payload with 21 of 21 named cards, five communities, portfolio census
541, and 4/4 public smoke probes.

### Admissions management chart release — 2026-09-26

The client folder now opens as a larger management chart. Its folder tab is the
client name, and the chart adds client and placement facts, signed-assessment
overview and support items, medication handoff, admission readiness, workflow
progress, workflow details, and review focus. Narrative assessment data is
included only from a signed assessment; unsigned narrative, contacts,
documents, raw notes, and extraction evidence remain outside the Platform
summary contract.

Pipeline producer:

- source commit: `71896caf`
- source PR: `https://github.com/3wilsoneric/pipeline-app/pull/210`
- active revision: `pipeline-prod-web--b39c377c21d11ae9`
- contract version: `3.0`

Platform consumer:

- source commit: `33a14c1`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/9`
- image tag: `alamo-platform:admissions-management-auth-a0a9e14`
- image digest: `sha256:c25f70d4c2dfba2158e51960c2e99ee3ac7d6207ce789e9ee0ff1cff0fadc29d`
- active revision: `alamo-platform-prod-web--admissions-mgmt-auth-0927`
- rollback digest: `sha256:69bf936c2cf79f398b3b1fb931a5aaaef1418dead54c40833e4718d4cb4e1a7f`

The release replaces the browser bundle and Pipeline summary normalizer on the
preceding known-good runtime. The browser bundle was built with the production
`VITE_ENTRA_*` public configuration before image promotion. Post-promotion
verification confirmed a healthy single active revision at 100% traffic, 4/4
public smoke probes, 21 named admissions with management profiles, six signed
assessment profiles, client-name tab identity, nine chart sections, and no
horizontal overflow at a 390-pixel viewport.

### Admissions decision tabs release — 2026-09-26

The management chart is expanded to 1240 pixels on desktop. Its client name is
now isolated on a larger white folder label beside a decision tab: green
`Accept`, red `Deny`, or yellow `Under review`. Accepted, awaiting-admit, and
Meet-the-Client-pending statuses map to `Accept`; declined or denied statuses
map to `Deny`; all earlier workflow states map to `Under review`.

- source commit: `0accb73`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/11`
- image tag: `alamo-platform:admissions-decision-tabs-44e0ecb`
- image digest: `sha256:08521d6ce65ea83c0d92506cbaa5fd9fb9f46aa9e75e96fe749f67ce78f2ca9b`
- active revision: `alamo-platform-prod-web--admissions-tabs-0927`
- rollback digest: `sha256:c25f70d4c2dfba2158e51960c2e99ee3ac7d6207ce789e9ee0ff1cff0fadc29d`

Post-promotion verification confirmed a healthy single active revision at 100%
traffic, 4/4 public smoke probes, correct client-name identity across all 21
live cards, correct live mapping for six accepted and 15 under-review cards,
synthetic coverage for the deny state, and no horizontal overflow at a
390-pixel viewport.

### Admissions folder refinement release — 2026-09-26

The chart now opens directly on the operational content without the redundant
management-review title block. The folder and name tab use pale manila stock,
and the client name sits on an inset off-white paper label inside the tab. The
separate decision tab and all management-chart content remain unchanged.

- source commit: `337e615`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/13`
- image tag: `alamo-platform:admissions-folder-d1ebbdb`
- image digest: `sha256:d6dc6d4518bdeb40c29c04be02c59fd95adc4f766a56ae642dc6329732850f09`
- active revision: `alamo-platform-prod-web--admissions-folder-0927`
- rollback digest: `sha256:08521d6ce65ea83c0d92506cbaa5fd9fb9f46aa9e75e96fe749f67ce78f2ca9b`

Post-promotion verification confirmed a healthy single active revision at 100%
traffic, 4/4 public smoke probes, the intended production folder and label
colors, removal of the old title block, and no horizontal overflow at a
390-pixel viewport.

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

Private acquisition storage uses the same Azure account and private container:

- `ACQUISITION_STORAGE_CONTAINER` optionally overrides
  `AZURE_STORAGE_CONTAINER`
- `ACQUISITION_STORAGE_ROOT` defaults to `acquisition-intelligence`
- `ACQUISITION_STORAGE_READ_SOURCE` may force `local` or `azure` for controlled
  verification; production defaults to Azure and fails closed
- `ACQUISITION_STORAGE_CACHE_TTL_MS` defaults to five minutes
- `npm run acquisition:publish:azure` publishes raw source lineage plus the
  validated manifest and compressed facility index
- `ACQUISITION_PUBLISH_RESEARCH_INITIALIZE=true npm run
  acquisition:publish:azure` is a first-use-only initializer; it cannot replace
  an existing production research store

Production research mutations use conditional Blob ETags and retry bounded
conflicts. Successful revisions are archived under the acquisition storage root
so the owner-authored workflow is durable across Azure Container Apps replicas
and Vercel serverless instances. The Azure Container Apps runtime uses its
existing user-assigned managed identity; grant that identity Blob Data
Contributor only on the private snapshot container so it can persist research
without receiving account-wide write access.

Company-level research, hold, and pass decisions are stored separately at
`research/operator-selections-v1.json.gz` with the same owner-only API boundary
and conditional Blob-write protection. Generated proposal refreshes never
overwrite this decision store.

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
- `PLATFORM_CLIENT_THUMBNAIL_MAX_BYTES`: private client-thumbnail bound, defaults to 2 MB
- `PLATFORM_CLIENT_DOCUMENT_MAX_BYTES`: private client-preview bound, defaults to 32 MB

Assign the Pipeline service principal the Alamo API application role and grant
tenant admin consent before enabling the Pipeline production adapter. Do not
copy ElderMark, Databricks, Azure snapshot, or Alamo server credentials into a
Pipeline browser variable.

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
