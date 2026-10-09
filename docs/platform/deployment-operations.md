# Deployment And Operations

- purpose: document local development, production deployment, auth, environment variables, and health checks
- status: authoritative current-state reference
- owners: engineering, operations
- updated: 2026-10-09
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
The production build stages the same current entry document at the root,
`/admissions`, and `/chat`, then regenerates gzip and Brotli siblings for every
served HTML, JavaScript, CSS, JSON, and SVG file. This prevents physical route
indexes or compressed representations retained from an older overlay from
serving a stale browser bundle. Always reconcile identity, gzip, and Brotli
entry responses before promotion. Record the preceding image digest so
rollback remains an Azure Container App image update.

Repeated frontend overlays eventually approach the registry's image-depth
ceiling. When that happens, use `Dockerfile.frontend-rebase` once with the exact
current production digest as `BASE_IMAGE`. It copies the proven runtime
filesystem into one fresh layer, adds the validated `/app/dist`, and recreates
the current image's user, environment, working directory, entrypoint, and
command. Before promotion, compare the resulting image configuration with the
source image and confirm the flattened layer count. Resume ordinary
`Dockerfile.frontend-release` overlays after that rebase release.

### Executive Director workspace and bounded LIC 624 uploads — 2026-10-09

The facility workspace now has Overview, MARs, and Incidents, a New client
notification opening the existing client profile, and a searchable, paginated
full-history incident register. Licensing retains the editable digital LIC 624
and now accepts up to 100 PDF/JPG/PNG files per batch, 20 MB each, with one
upload in flight, per-file receipts, failed-file retry, and facility-scoped
exact-byte duplicate protection. Reviewed forms and their immutable originals
are preserved when the same bytes are delivered again.

- source commit: `a6863b21967b8a6ba70127ae5a04902a68706c46`
- source branch: `codex/compact-executive-dashboard`
- ACR build: `cc6e`
- image tag: `alamo-platform:executive-upload-review-a6863b2`
- image digest: `sha256:4b3d7a966d927a3d40a701fbda6bb34324965faef995a0b5bf235a306d1854ec`
- active revision: `alamo-platform-prod-web--executive-upload-1009`
- rollback digest: `sha256:4abc417b5a114d451f0821b77c8b36502247fb14087031bb158b5dda92a4a5e3`
- active browser assets: `/assets/index-Cvi0sR18.js` and
  `/assets/index-DPixrpLO.css`

The bounded overlay retains the exact preceding production runtime. Packaging
now includes all incident and receipt/lock/object modules and checks their
transitive relative imports against the combined candidate filesystem. The
actual runtime-plus-overlay passed API module linkage, incident contracts, and
all 20 synthetic batch persistence/recovery tests with networking disabled.
The built image also passed API/PDF-library imports and entry-document hash
parity before promotion. No real reports were uploaded during verification.

Focused verification passed documentation, retention, TypeScript and server
TypeScript, dependency audit, desktop freshness guards, Platform API and
Admissions access boundaries, Executive Director contracts, the production
build, Licensing browser tests at 320/390/768/1440px and 200%-equivalent zoom,
and dashboard tests at 320/390/768/1024/1440px and 200%-equivalent zoom.

The user explicitly approved this limited release with focused verification
and rollback, despite the full analyst gate not being green. The maintained
June fixture conflicts with later analyst test windows and lacks monthly MAR
refusal detail. A current Azure probe of the unchanged AWOL-since-May analyst
path returned a safe refusal and no artifact, so that failure is not classified
as merely an outdated expected date. Analyst runtime and those tests were not
changed. This is a one-release exception, not a successful full `check:ship`.

Post-promotion checks confirmed Healthy/Running, one replica, and 100% traffic;
28 exact-byte/cache/access probes across six routes, two assets, and four
Executive Director APIs; current retirement-worker bytes; and 4/4 public smoke
probes. Identity, gzip, and Brotli responses match the candidate. An already-open
signed-in Chrome tab adopted the release without a manual reload. Owner checks
confirmed the existing report queue and editable form, batch controls, live
community Overview, MARs, and the complete incident register. No report, review,
incident, Pipeline record, or email was created or changed. Identity, ingress,
environment, scaling, and all other non-image application settings have an
unchanged configuration hash.

The user's selected scope is upload/review only. Scans remain explicitly
Awaiting OCR. No database, OCR processing, incoming Outlook connector, Microsoft
mailbox grant, outgoing notification, or Raj/Betty alert was activated. The
current catalog remains unsuitable for the proposed 20,000-report backfill;
that requires the separately approved processing/index milestone.

### Hidden Executive Director Licensing workspace — 2026-10-08

The URL-only `/executive/licensing` context app is live for the Platform owner
and facility-scoped Executive Director Entra roles. It is absent from general
navigation. Restricted Executive Director identities are redirected into this
workspace and rejected from general Platform APIs; the server derives their
facility scope from verified token roles rather than a browser-supplied
facility ID.

- source commit: `e13546d7dcd86179a5c4355a67a93efdd999453f`
- source branch: `codex/licensing-nav-refine`
- ACR build: `cc63`
- image tag: `alamo-platform:executive-licensing-e13546d`
- image digest: `sha256:ff6facee113399cc70951034fa4e96bbbbcff26d5ba6dd355f180297e6c4acf7`
- active revision: `alamo-platform-prod-web--executive-lic-1008`
- rollback digest: `sha256:a7e86776e618dcab284cb04f52e60a015c907a0ea2661d5fa9137bab3b2a610a`
- active browser assets: `/assets/index-BjxUXIjt.js` and
  `/assets/index-D5os_LT7.css`

The release preserves the exact preceding production runtime and patches only
the validated browser bundle, the Executive Director API/auth modules, and the
locked `pdf-lib@1.17.1` runtime dependency. The release builder starts from the
verified production API file so unreleased main-branch API routes are not
accidentally promoted. Direct route refreshes use the existing Azure SPA
fallback; only the established Admissions and Chat physical indexes remain.

LIC 624 PDFs, JPGs, and PNGs are stored under the private
`licensing/executive-director-intake-v1/` prefix in the existing snapshot
container. Each facility has an ETag-protected `catalog.json` queue projection,
while immutable originals, extraction manifests, and append-only review audits
remain under facility/year/submission paths. Existing manifests are cataloged
automatically on first read. The production managed identity has `Storage Blob Data Contributor`
only at that container scope. Fillable PDFs are mapped into the versioned LIC
624 review record; image-only files remain explicitly `ocr_required`. The UI
does not expose extracted PHI in its recent-submissions list.

Release-specific Executive Director, Licensing, Admissions-access, Reports,
California-home, TypeScript, server-TypeScript, source-syntax, lint,
documentation, retention, dependency, unused-code, production-build, and
container-runtime checks passed. The broader legacy predeploy runner reached
its known local Databricks-credential boundary during the analyst-decision
suite. Post-promotion verification confirmed a Healthy/Running revision at 100
percent traffic, 4/4 public smoke probes, byte-identical deployed JS and CSS,
401 plus private/no-store on both anonymous Executive Director endpoints, and
signed-in owner rendering of the hidden San Pablo workspace with current
community data. The existing redesigned Analytics Licensing library also
loaded its 93-report production collection. No Licensing alert gates or email
settings changed.

### Digital LIC 624 review workflow — 2026-10-08

The hidden `/executive/licensing` workspace now opens a structured digital LIC
624 immediately after fillable-PDF extraction and can reopen the same review
from the licensing queue. Reviewers can correct the facility, people, incident,
treatment, notification, supervisor, and signature sections; save a draft; and
mark the form reviewed only after required fields are complete. The original
upload and source extraction remain immutable. Saved reviews use explicit
revisions, append-only audit records, and optimistic concurrency protection.

- source commit: `369aef716e8ea53a626224c2467d1546fdf2aa0e`
- merge commit: `d44907c9c16695e03bd4bc6247ffe671e96c5373`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/164`
- ACR build: `cc64`
- image tag: `alamo-platform:executive-lic-review-369aef7`
- image digest: `sha256:0c22acada4960b058517c8dfaa072138306bb74b8f9fce4db3c0fd706ba8b2ac`
- active revision: `alamo-platform-prod-web--lic624-review-1008`
- rollback digest: `sha256:ff6facee113399cc70951034fa4e96bbbbcff26d5ba6dd355f180297e6c4acf7`
- active browser assets: `/assets/index-BRY0Uuj0.js` and
  `/assets/index-CiISyH-H.css`

The release uses the bounded Executive Director overlay on the exact preceding
production digest. It replaces the browser bundle and only the related API,
storage, extraction, validation, and shared-contract modules while retaining
the proven application runtime and locked `pdf-lib@1.17.1` dependency.

Verification included documentation, TypeScript, server TypeScript, source
syntax, JavaScript lint, dependency reachability, the full Executive Director
upload/review/reopen/concurrency/confirmation contract, production build, 390px
responsive rendering without horizontal overflow, release-container syntax
and content checks, and image-configuration parity. Post-promotion verification
confirmed Healthy/Running at 100 percent traffic, byte-identical deployed JS
and CSS, successful public route probes, private/no-store anonymous API guards,
and signed-in owner rendering of the San Pablo workspace with current community
data. No sample or production licensing report was created during live
verification, and no alert or email configuration changed.

### Executive Director community dashboard — 2026-10-08

Facility-scoped Executive Director identities now land on
`/executive/dashboard`, with Community and Licensing as the only context-app
destinations. The dashboard adapts the main community profile into a simpler
operating view and adds the assigned facility's Pipeline referrals,
assessments, planned move-ins, and management-chart drilldown. The Executive
Director API filters every admissions card and schedule row on the server; the
browser never receives another facility's records.

- source commit: `39d0abfc8b7e6d62fbf30bd487702cca512d4ce9`
- merge commit: `5cfea0c3aab0d83070aa0876180cd80f3dd7ae85`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/166`
- ACR build: `cc65`
- image tag: `alamo-platform:executive-community-5cfea0c`
- image digest: `sha256:f408902c1c2bdcccd96e5df472fe46043b3d903492c1007e49f52bc88508523b`
- active revision: `alamo-platform-prod-web--executive-community-1008`
- rollback digest: `sha256:0c22acada4960b058517c8dfaa072138306bb74b8f9fce4db3c0fd706ba8b2ac`
- active browser assets: `/assets/index-C33IYSiE.js` and
  `/assets/index-CFcAjl9g.css`

The release uses the bounded Executive Director overlay on the exact preceding
production digest. It replaces the browser bundle and the Executive Director
API modules while retaining the proven application runtime, platform data
adapters, environment, and locked PDF dependency. Verification included the
facility-isolation fixture, Executive Director workflow contract, TypeScript,
server TypeScript, source syntax, documentation, production build, 320px,
390px, and 1440px responsive rendering, and the 320px management-chart modal.
The broad analyst gate reached the existing dynamic-period fixture mismatch in
the AWOL-since-May case; release-specific and production checks do not depend
on that fixture.

Post-promotion verification confirmed Healthy/Running with one ready replica
and 100 percent traffic, 4/4 public smoke probes, byte-identical deployed JS
and CSS, `401` plus `private, no-store` on both anonymous Executive Director
API endpoints, and signed-in owner rendering of the live San Pablo Overview
and Admissions sections. No licensing submission, alert setting, email, or
Pipeline record was changed during verification.

### Executive Director dashboard and incident-intake scale-up — 2026-10-08

The Executive Director community dashboard now presents one facility-scoped
operating brief instead of a grid of detached KPI cards. Census, admissions,
incidents, and medication administration each open a larger detail workspace
using only the assigned facility's governed data. The existing client chart
remains available from the admissions work list.

The LIC 624 intake backend now supports an ongoing multi-user report library.
Each facility has a private ETag-protected catalog with retry-safe concurrent
updates, cursor pagination, status and filename filtering, full-history totals,
immutable source and extraction records, and authenticated retrieval of the
original report. Source retrieval verifies the stored SHA-256 digest before
returning a private, non-cacheable response. Existing manifests are indexed
without rewriting their originals or review history.

- dashboard source commit: `4fc18ee`
- intake source commit: `3f72085`
- merge commit: `f8629dfe208012d39b4c5b5732e58968a151386f`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/168`
- ACR build: `cc66`
- image tag: `alamo-platform:executive-intake-f8629df`
- image digest: `sha256:e6c69f28b8a983fad59c43d1ab555600b74cc4c1148a2364ffe57501e90d1418`
- active revision: `alamo-platform-prod-web--executive-intake-1008`
- rollback digest: `sha256:f408902c1c2bdcccd96e5df472fe46043b3d903492c1007e49f52bc88508523b`
- active browser assets: `/assets/index-DqhlC7bl.js` and
  `/assets/index-DEi9zNM3.css`

The release uses the bounded Executive Director overlay on the exact preceding
production digest and retains the proven Platform runtime and data adapters.
Release-specific verification covered documentation, TypeScript, server
TypeScript, source syntax, code health, unused code, duplication, Platform API
contracts, Executive Director contracts, production build, concurrent catalog
updates, paginated and filtered reads, original-source digest integrity,
optimistic review conflicts, and 390px and 1440px layouts without horizontal
overflow. The broader predeploy runner stopped at the existing dynamic-period
fixture mismatch in the unrelated AWOL-since-May analyst case.

Post-promotion verification confirmed a Healthy/Running revision with one
replica and 100 percent traffic; 4/4 public route probes; byte-identical live
HTML, JavaScript, and CSS; and `401` plus `private, no-store` on all four
anonymous Executive Director API probes. A signed-in owner check confirmed the
live San Pablo dashboard, census drill-down, report queue, and authenticated
two-page original-PDF retrieval. The legacy signed-in smoke script reached its
retired California-carousel selector after its route probes; the direct
Executive Director checks passed. No report, review, alert setting, email, or
Pipeline record was created or changed during deployment verification.

### Executive Director dashboard visual refinement — 2026-10-08

The facility dashboard now presents census, impending admissions, incidents,
and medication administration as four integrated operating components. The
detached KPI shelves and internal mini-stat strips were removed, admissions is
limited to clients moving toward admission, and every component now uses one
restrained, darker Alamo-green surface system. The existing client management
chart remains available from each impending-admit profile.

- source commit: `f08d94b`
- source branch: `codex/compact-executive-dashboard`
- ACR build: `cc67`
- image tag: `alamo-platform:executive-dashboard-f08d94b`
- image digest: `sha256:36b2af9cacc6c1ec8fcc5fc47a380845a01ef42d049d8a03fea3280e8d19bb42`
- active revision: `alamo-platform-prod-web--executive-dash-1008`
- rollback digest: `sha256:e6c69f28b8a983fad59c43d1ab555600b74cc4c1148a2364ffe57501e90d1418`
- active browser assets: `/assets/index-D8gNi9yF.js` and
  `/assets/index-BJ2YsHCL.css`

This is a frontend-only overlay on the exact preceding production digest; the
server, API, data adapters, Licensing persistence, scheduled monitor, alert
settings, and email settings are unchanged. Focused TypeScript, Executive
Director contract, production build, documentation, unused-code, duplication,
and 390px/1440px browser checks passed. The broad legacy predeploy gate stopped
at its documented local Databricks-credential boundary after its preceding
checks passed.

Post-promotion verification confirmed one Healthy/Running replica at 100
percent traffic, 4/4 public route probes, byte-identical HTML/JavaScript/CSS on
the root, `/admissions`, and `/chat`, and `401` plus `private, no-store` on all
four anonymous Executive Director API probes. The browser correctly redirected
an unauthenticated `/executive/dashboard` request to Microsoft sign-in; no
saved production session was available for a signed-in visual pass. No report,
review, alert setting, email, or Pipeline record was created or changed during
deployment verification.

### Executive Director stale-client activation follow-up — 2026-10-08

An already-open Executive Director window remained on the superseded
title-heavy dashboard after the visual-refinement release. The published HTML,
JavaScript, and CSS were current, but the unchanged service worker did not emit
a controller change for that long-lived window. Cache generation `v8` now
activates over `v7`, prunes the older static cache, claims open windows, and
navigates them to their current URL so the compact dashboard is adopted.

- source commit: `3c2c029`
- source branch: `codex/compact-executive-dashboard`
- ACR build: `cc68`
- image tag: `alamo-platform:executive-dashboard-refresh-3c2c029`
- image digest: `sha256:51202c7e7c12b55e5766243fdcfbe7c80f46e2e449676ed7ae6ed3795d5670ac`
- active revision: `alamo-platform-prod-web--executive-refresh-1008`
- rollback digest: `sha256:36b2af9cacc6c1ec8fcc5fc47a380845a01ef42d049d8a03fea3280e8d19bb42`
- active browser assets: `/assets/index-D8gNi9yF.js` and
  `/assets/index-BJ2YsHCL.css`

Desktop readiness, TypeScript, Executive Director contract, production build,
and 390px/1440px browser checks passed. Post-promotion verification confirmed
one Healthy/Running replica at 100 percent traffic, 4/4 public probes, current
byte-identical browser assets, and `/sw.js` serving cache generation `v8`. No
server, API, data, report, alert, email, or Pipeline state changed.

### Browser release-current enforcement — 2026-10-08

The application no longer registers a service worker or caches application
bundles. The published `/sw.js` is now a retirement worker for legacy clients:
it deletes only `alamo-static-*` Cache Storage entries, unregisters itself, and
navigates controlled windows to a cache-busted current release. It has no fetch
handler and cannot cache HTML, JavaScript, API responses, or PHI.

- source commit: `f22e213`
- source branch: `codex/compact-executive-dashboard`
- ACR build: `cc6b`
- image tag: `alamo-platform:legacy-recovery-f22e213`
- image digest: `sha256:2be22aec101a59b014a1b5136f660e1f31707768db9c03cc114784ac8b372d5f`
- active revision: `alamo-platform-prod-web--legacy-recovery-1008`
- rollback digest: `sha256:4caa3693aa11157f7cd5d2d3e1915db08243368a7ca8cd17a3bbef5256e5e2d0`
- active browser assets: `/assets/index-DgyuGtSb.js` and
  `/assets/index-BJ2YsHCL.css`

The hidden `/recover.html` fallback covers the browser edge case where a
retired worker continues to control its already-open tab until that client is
released. It fetches the public release shell without credentials, removes
only Alamo's legacy worker/cache entries, replaces the tab URL with
`/executive/dashboard`, and imports the current fingerprinted bundle with a
cache-busting query. It does not read, store, or transmit platform data.
Future releases remain network-current because the application has no
controlling worker and the entry document is served with
`no-cache, max-age=0, must-revalidate`.

`check:desktop` is a required stage in quick, release, and full platform-ready
profiles. A future build fails its release gate if application worker
registration, fetch interception, or bundle caching is reintroduced.

Desktop readiness, TypeScript, production build, and 390px/1440px Executive
Director browser checks passed. The broader analyst suite reached its existing
local Databricks-credential boundary after its preceding checks passed.
Post-promotion verification confirmed one Healthy/Running replica at 100
percent traffic, 4/4 public route probes, the current bundle in the entry
document, the credential-free recovery bootstrap, the fetch-free retirement
worker, and the anonymous Executive Director API still failing closed with
`401`.

### Compressed browser shell correction — 2026-10-09

The compact Executive Director dashboard is now served from the same release
for identity, gzip, and Brotli requests. The preceding frontend overlay copied
the current uncompressed entry document over a production base image but did
not replace the base image's older `index.html.gz` and `index.html.br`
siblings. Chrome requested Brotli and therefore received the older dashboard,
while the identity-only command-line smoke probe saw the current dashboard.

- source commit: `728aaa7`
- source branch: `codex/compact-executive-dashboard`
- ACR build: `cc6c`
- image tag: `alamo-platform:compressed-shell-728aaa7`
- image digest: `sha256:f8c89a033da30aa944cf63a566ad9cd4adabc5bc93bcbde6abbd58011511752b`
- active revision: `alamo-platform-prod-web--compressed-shell-1009`
- rollback digest: `sha256:2be22aec101a59b014a1b5136f660e1f31707768db9c03cc114784ac8b372d5f`
- active browser assets: `/assets/index-DgyuGtSb.js` and
  `/assets/index-BJ2YsHCL.css`

`npm run build` now regenerates gzip and Brotli siblings after staging every
SPA entry document. Desktop readiness enforces that build step so it cannot be
removed from quick, release, or full release gates without failing the check.
Post-promotion verification confirmed a Healthy/Running revision at 100
percent traffic; identity, gzip, and Brotli entry responses decompress to the
same byte-identical HTML and reference the same active bundle. Signed-in Chrome
loaded that bundle, rendered four compact dashboard panels, and contained none
of the retired Community briefing markup. No server, API, data, report, alert,
email, or Pipeline state changed.

### Executive Director dashboard color and type scale — 2026-10-09

The compact facility dashboard now gives its four operating components distinct
visual identities instead of repeating the mint treatment. Census uses navy,
impending admissions uses ochre, incidents uses rust, and medication
administration uses plum. Component headings, client rows, values, metadata,
controls, and the community title use a larger type scale. At phone widths the
header uses the head-and-tree mark so Community and Licensing remain readable
without squeezing the page.

- source commit: `d2546d7`
- source branch: `codex/compact-executive-dashboard`
- ACR build: `cc6d`
- image tag: `alamo-platform:executive-color-d2546d7`
- image digest: `sha256:4abc417b5a114d451f0821b77c8b36502247fb14087031bb158b5dda92a4a5e3`
- active revision: `alamo-platform-prod-web--executive-color-1009`
- rollback digest: `sha256:f8c89a033da30aa944cf63a566ad9cd4adabc5bc93bcbde6abbd58011511752b`
- active browser assets: `/assets/index-DCQ2TIN1.js` and
  `/assets/index-BoEmI97a.css`

TypeScript, the Executive Director contract, desktop readiness, production
build, and 390px/1440px browser checks passed. Post-promotion verification
confirmed a Healthy/Running revision at 100 percent traffic; identity, gzip,
and Brotli entry responses decompress to the same byte-identical HTML and
reference the same active bundle. Signed-in Chrome rendered four differently
colored components with 20px headings and no retired Community briefing copy.
No server, API, data, report, alert, email, or Pipeline state changed.

### Current Data Architecture explainer release — 2026-10-06

The URL-only `/data-architecture` explainer now documents the production system
that actually exists: Azure Container Apps, the ElderMark/MAR governed snapshot
spine, live bounded Pipeline and client-database integrations, separately
restricted Licensing and acquisition stores, deterministic analyst boundaries,
and sources that are not connected. Static coverage-month claims were removed;
the page now directs changing coverage and freshness to the runtime manifest.

- source commit: `670f9c2647729f5eae0402043f7d1c49d10e5771`
- merge commit: `2cde4a8937a3a1a284eb6ba91948cc9e0dd7b233`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/159`
- ACR build: `cc61`
- image tag: `alamo-platform:data-architecture-670f9c2`
- image digest: `sha256:80b72b6a8d648e0b046273336a5094c3a5169617e9e9ae7d16234fb447db256a`
- active revision: `alamo-platform-prod-web--data-arch-1006`
- rollback digest: `sha256:01c4f436f67a209eabf5f03dbcba0dd2137887943ac31a1fc6005f93abb3980c`
- active browser assets: `/assets/index-CDK1hUw2.js` and
  `/assets/index-5g3z1oKo.css`

This is a frontend-only release on the exact preceding production image.
TypeScript, source syntax, lint, documentation, production build, desktop and
390-pixel visual review, and the 72-case whole-platform phone/landscape matrix
plus safe-area check passed. Post-promotion verification confirmed one ready
healthy replica at 100 percent traffic, 4/4 production smoke probes,
byte-identical deployed JS and CSS hashes, the revised architecture copy in the
production bundle, and clean application startup. The Licensing job remains on
its Monday/Wednesday schedule with notifications disabled, the alert Logic App
remains disabled, and no Licensing email was sent.

### Whole-platform mobile remediation release — 2026-10-06

The Platform now has one production-tested mobile contract across Home,
Analytics, Admissions, Workforce, Outreach, Incident Center, Command Center,
Data Architecture, Licensing, Explorer, and governed question surfaces. The
release adds safe-area-aware navigation, touch-safe controls, bounded dialogs,
phone-specific prioritization and chapter navigation, and explicit missing-data
language in Admissions. Desktop and print layouts remain available without the
phone-only simplifications.

- source commit: `a961a83336ba832d1efde1b57e24b13d123f25b4`
- merge commit: `127c14e1e2f8054405485bb91dd3f2f60e5b6304`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/157`
- ACR build: `cc60`
- image tag: `alamo-platform:platform-mobile-127c14e`
- image digest: `sha256:01c4f436f67a209eabf5f03dbcba0dd2137887943ac31a1fc6005f93abb3980c`
- active revision: `alamo-platform-prod-web--platform-mobile-1006`
- rollback digest: `sha256:cc9f7628cff6d0aaf3fa26c7a0d22b3f3b7586cdcd9af2aab493fe8c48dcdd47`
- active browser assets: `/assets/index-COD0X9Gr.js` and
  `/assets/index-B1jtzz9D.css`

This is a frontend-only release on the exact preceding production image. The
permanent whole-platform browser gate passed 72 route-and-viewport checks across
18 routes at 320-by-568, 390-by-844, 430-by-932, and 844-by-390, plus a
synthetic 47-pixel safe-area pass. Focused Admissions, Licensing, Home,
Explorer, Outreach, community-surface, analyst-capability, question-catalog,
query-understanding, and governed module checks passed, as did type checking,
linting, documentation, dependency, API-boundary, production build, and source
health checks. The broader legacy predeploy runner still encounters an older
local June fixture when a July-through-September community-history case is
requested; the release-specific checks and live production guards do not depend
on that stale fixture.

Post-promotion verification confirmed one ready healthy replica at 100 percent
traffic, 4/4 production smoke probes, one current bundle on `/`, `/admissions`,
and `/chat`, byte-identical deployed JS and CSS hashes, and authenticated API
boundaries returning `401` with private no-store caching when called
anonymously. The Licensing job remains scheduled for Monday and Wednesday with
`LICENSING_ALERT_NOTIFICATIONS_ENABLED=false`; the alert Logic App remains
disabled, and no Licensing email was sent.

### Admissions mobile mode release — 2026-10-04

Admissions now has a dedicated phone reading path across Briefing and Pipeline:
touch-safe dashboard tabs, wrapping schedule detail, collapsible open-field
records, bounded mobile Pipeline lists, compact card facts, and a safe-area-aware
management chart.

- source commit: `b21ea49`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/148`
- image tag: `alamo-platform:admissions-mobile-b21ea49`
- image digest: `sha256:9fa7c3337eccb9da963a87b982c024db69833bb1b828b881b5523d56569f76d8`
- active revision: `alamo-platform-prod-web--admissions-mobile-1004`
- rollback digest: `sha256:31b1ac20f887ede11d8505c09f7bb2d6924e426777d96209901b44d594f40f70`

This is a frontend-only overlay on the preceding production digest. The release
passed the live Azure-snapshot and Pipeline browser suite at 320, 375, 390, and
430 pixel portrait widths and 667-by-375 landscape, including touch targets,
horizontal overflow, modal bounds, disclosure behavior, and offline recovery.
Post-promotion verification confirmed a healthy revision with one ready replica
and 100% traffic, 4/4 public route probes, one shared current asset bundle on
`/`, `/admissions`, and `/chat`, exact production-to-build JS/CSS hashes, and the
anonymous API boundary returning `401` with `private, no-store` caching.

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

### Admissions folder viewport cap — 2026-09-26

The entire management folder, including its tabs, now remains inside the
visible browser viewport. The outer folder keeps an 8-pixel mobile margin and a
24-pixel desktop margin; long chart content scrolls inside the paper instead of
extending the folder beyond the page.

- source commit: `905abca`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/15`
- image tag: `alamo-platform:admissions-folder-cap-e01f159`
- image digest: `sha256:7ceabdf89a2e947f53b50a85d96bd0f481a88ce844aa2b2ed4e71988839d79c1`
- active revision: `alamo-platform-prod-web--admissions-folder-cap-0927`
- rollback digest: `sha256:d6dc6d4518bdeb40c29c04be02c59fd95adc4f766a56ae642dc6329732850f09`

Production browser verification measured the desktop folder from 24 to 675 in
a 699-pixel viewport and the mobile folder from 8 to 836 in an 844-pixel
viewport. The mobile chart scrolls internally with zero horizontal overflow.
The release also passed all four public production smoke probes.

### Admissions analyst response release — 2026-09-26

The Board's governed executive update now reads as an Admissions analyst
response instead of a bordered report paragraph. A compact analyst identity,
soft response surface, selective emphasis, and a short staged reveal preserve
the same workload, community, and follow-up facts while making the update feel
generated and conversational. Reduced-motion users receive the complete answer
immediately. A scoped theme rule preserves the 16-pixel response radius without
changing the Platform's sharper treatment elsewhere.

- source commits: `1d12635`, `f5c87e6`, `2e1afd3`
- source PRs: `https://github.com/3wilsoneric/alamo-platform-app/pull/17`, `https://github.com/3wilsoneric/alamo-platform-app/pull/18`, `https://github.com/3wilsoneric/alamo-platform-app/pull/19`
- image tag: `alamo-platform:admissions-chat-theme-2e1afd3`
- image digest: `sha256:eb55e1cb950de372a2215653a4f6dd5473e7509b50d1e68ff378d5460141403d`
- active revision: `alamo-platform-prod-web--admissions-chat-theme-0927`
- rollback digest: `sha256:e71b3bd4a2b441aafb1bab898ff6bd2c1ab81faea443fa9cd127ad20e9a1ef6c`

Production browser verification confirmed the staged reveal completes, the
three formatted lines and analyst mark remain visible, the old left border is
absent, the response retains its intended background and radius, and the page
has zero horizontal overflow at a 390-pixel viewport. The release is healthy at
100% traffic and passed all four public production smoke probes.

### Admissions attention-label removal — 2026-09-26

The Admissions overview no longer turns Pipeline timing flags into management
judgments. Automated `Update overdue`, `Move-in overdue`, `No owner`, `Needs
follow-up`, and `Immediate follow-up` labels are absent from the board, list,
client chart, and analyst response. Factual workflow status, owner, next action,
days open, last update, and planned admission remain available.

- source commit: `6d06456`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/21`
- image tag: `alamo-platform:admissions-no-attention-6d06456`
- image digest: `sha256:0a2184a1b74f856e82c1ba53ebfd9ef0370122e504dff70b11988f7cd0793a5a`
- active revision: `alamo-platform-prod-web--admissions-no-attention-0927`
- rollback digest: `sha256:eb55e1cb950de372a2215653a4f6dd5473e7509b50d1e68ff378d5460141403d`

Post-promotion verification confirmed the removed labels are absent from the
deployed browser bundle, the retained analyst response content is present, the
single active revision is healthy at 100% traffic, and all four public
production smoke probes pass.

### Admissions view-selection release — 2026-09-26

The Board/List control no longer sits inside a gray segmented tray. Only the
current view receives an Alamo-green surface and text treatment; the inactive
view remains transparent. Both labels remain visible at phone width.

- source commit: `bd374bf`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/23`
- image tag: `alamo-platform:admissions-view-bd374bf`
- image digest: `sha256:121a0ff2216a9298e4fa7a99fcfc76b67924d35e9389be4e7afac1f13498cbe0`
- active revision: `alamo-platform-prod-web--admissions-view-0927`
- rollback digest: `sha256:0a2184a1b74f856e82c1ba53ebfd9ef0370122e504dff70b11988f7cd0793a5a`

Post-promotion verification confirmed the active-view treatment in the
deployed browser bundle, a healthy single revision at 100% traffic, and all
four public production smoke probes.

### Admissions modal dismissal release — 2026-09-26

The Admissions management chart no longer includes a redundant full-width
`Done` action. Users dismiss the chart with the corner close control, by
clicking the surrounding backdrop, or with Escape. The chart content and
Pipeline data contract are unchanged.

- source commit: `e14f666`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/25`
- image tag: `alamo-platform:admissions-modal-dismiss-e14f666`
- image digest: `sha256:01b1d9fa953fb72797b1292808378b10bb534bb8fd2670be139a13c7a65c532c`
- active revision: `alamo-platform-prod-web--admissions-dismiss-0927`
- rollback digest: `sha256:121a0ff2216a9298e4fa7a99fcfc76b67924d35e9389be4e7afac1f13498cbe0`

Post-promotion verification confirmed the exact production browser asset,
a healthy single revision at 100% traffic, and all four public production
smoke probes. TypeScript, the deterministic Admissions dashboard check, and
the production browser build also pass.

### Admissions chart streamlining release — 2026-09-26

The client management chart now follows one vertical reading path instead of
splitting facts across two competing dashboard columns. Four deliberate
sections cover the next action, admission brief, workflow and readiness, and
signed client context. Flat chart rows replace the former fact-card grids while
preserving placement, referral, payer, owner, timing, assessment, requirement,
support, and medication information.

- source commit: `579203f`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/27`
- image tag: `alamo-platform:admissions-chart-streamline-579203f`
- image digest: `sha256:8519eb08dc81c02eb18a0dba174fe9c70c2d4e59f733ac732ac26022227fafe8`
- active revision: `alamo-platform-prod-web--admissions-streamline-0927`
- rollback digest: `sha256:01b1d9fa953fb72797b1292808378b10bb534bb8fd2670be139a13c7a65c532c`

Post-promotion verification confirmed the exact production browser asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and phone renders contained one chart stream,
four sections, and no horizontal overflow.

### Admissions executive card release — 2026-09-26

The Admissions Board and List now present each referral as an executive
briefing rather than an operator task card. Raw workflow instructions such as
`Continue preparation` are no longer shown. Each referral surfaces its
decision, stage, accountable owner, time open and update freshness, planned
admission, and an evidence-based readiness summary. The detailed chart also
reframes its former next-action callout as `Current management focus`.

- source commit: `6ca694c`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/29`
- image tag: `alamo-platform:admissions-ceo-cards-6ca694c`
- image digest: `sha256:d0359b87e5ef9bba5dfa286a8923cd86e68c162873752f9c449b6dedcf4dea20`
- active revision: `alamo-platform-prod-web--admissions-ceo-cards-0927`
- rollback digest: `sha256:8519eb08dc81c02eb18a0dba174fe9c70c2d4e59f733ac732ac26022227fafe8`

Post-promotion verification confirmed the exact production browser asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and phone renders showed the executive fields,
excluded raw workflow-action copy, and had no horizontal overflow.

### Admissions navigation release — 2026-09-26

Admissions now appears directly below Analytics in the shared desktop and
phone navigation for identities that pass the existing Admissions access
decision. The destination remains absent for identities without an Admissions
role, and opens the native `/admissions` overview without changing API, data,
or authentication configuration.

- source commit: `255f742`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/31`
- image tag: `alamo-platform:admissions-nav-255f742`
- image digest: `sha256:e933cfde2251be9582d47303a9b35b3d1e0d90df6f58b84adc323c3911933bfe`
- active revision: `alamo-platform-prod-web--admissions-nav-0927`
- rollback digest: `sha256:d0359b87e5ef9bba5dfa286a8923cd86e68c162873752f9c449b6dedcf4dea20`

Post-promotion verification confirmed the exact production browser asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and 390-pixel renders placed Admissions below
Analytics, opened `/admissions`, and had no horizontal overflow.

### Admissions navigation access correction — 2026-09-26

The Admissions destination is now shown below Analytics for every authenticated
Platform identity. Admissions-specific roles continue to constrain assessor-only
identities but no longer act as a second navigation entitlement for normal
Platform users. The release bundle was rebuilt with the required browser-safe
Entra client and tenant values after an unconfigured intermediate bundle was
detected and rolled back.

- source commit: `3ac46d5`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/33`
- image tag: `alamo-platform:admissions-nav-auth-3ac46d5`
- image digest: `sha256:1e8c4d9295e091f118e7d079fa6919a92eaab7027a6ffc07052e30aa5919a737`
- active revision: `alamo-platform-prod-web--admissions-nav-auth-0927`
- rollback digest: `sha256:d0359b87e5ef9bba5dfa286a8923cd86e68c162873752f9c449b6dedcf4dea20`

Post-promotion verification confirmed the exact configured production asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. A fresh load in the owner's signed-in Chrome session showed no
authentication setup error, placed Admissions below Analytics, and opened the
native `/admissions` overview from that menu item.

### Admissions decision-color refinement — 2026-09-27

Admissions decision labels now use a more legible executive palette across
Board cards, List rows, and management-chart folder tabs. `Accept` uses a
deeper Alamo green with white text, while `Under review` uses a warmer gold
with dark text and a defined gold border. No decision logic, source data, or
workflow behavior changed.

- source commit: `37c0f94`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/35`
- image tag: `alamo-platform:admissions-decision-colors-37c0f94`
- image digest: `sha256:28b7f08d72a68da6a1e47997eaf689ea3937e20429239a7a78e3c28279acd755`
- active revision: `alamo-platform-prod-web--admissions-colors-0927`
- rollback digest: `sha256:1e8c4d9295e091f118e7d079fa6919a92eaab7027a6ffc07052e30aa5919a737`

Post-promotion verification confirmed the exact configured production asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and 390-pixel checks verified the label and folder
tab colors without horizontal overflow. A fresh load in the owner's signed-in
Chrome session confirmed six visible `Accept` labels with white text and fifteen
visible `Under review` labels with the new gold treatment.

### Admissions streamed executive briefing — 2026-09-27

The Admissions analyst briefing now renders as a progressive character stream
at a conversational response pace instead of revealing complete lines at once.
Accepted clients lead the response, with clients carrying planned admission
dates ordered first and their destination communities and dates shown inline.
The workload and community summaries follow after that client rollup. Reduced-
motion preferences continue to reveal the complete response immediately.

- source commit: `df983ed`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/37`
- image tag: `alamo-platform:admissions-streamed-briefing-df983ed`
- image digest: `sha256:16c8de1f4be9fa83403eaf0c5bf14368a33d4fad49a8012a44e69e80cf2736f1`
- active revision: `alamo-platform-prod-web--admissions-stream-0927`
- rollback digest: `sha256:28b7f08d72a68da6a1e47997eaf689ea3937e20429239a7a78e3c28279acd755`

Post-promotion verification confirmed the exact configured production asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and 390-pixel checks verified progressive text,
accepted-client ordering, stream completion, zero horizontal overflow, and final
caret removal. A fresh load in the owner's signed-in Chrome session confirmed
the response remained in the composing state while its visible text grew, then
finished with all six live accepted clients in the leading paragraph, no
authentication setup error, and no horizontal overflow.

### Admissions Analytics-navigation placement — 2026-09-27

The Admissions page-level navigation now keeps Home on the left and places
Analytics at the far right of the header. The same alignment is preserved at
desktop and mobile widths; navigation destinations and access rules are
unchanged.

- source commit: `a573838`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/39`
- image tag: `alamo-platform:admissions-analytics-right-a573838`
- image digest: `sha256:1a441d5e6f166e1b38ffddbdeb00ff9443901d79717c2de9607024d04b6c5430`
- active revision: `alamo-platform-prod-web--admissions-nav-right-0927`
- rollback digest: `sha256:16c8de1f4be9fa83403eaf0c5bf14368a33d4fad49a8012a44e69e80cf2736f1`

The frontend-only release was rebuilt over the stable runtime image
`sha256:1e8c4d9295e091f118e7d079fa6919a92eaab7027a6ffc07052e30aa5919a737`
to collapse accumulated frontend layers after the registry reached its maximum
image depth; backend behavior was unchanged. Post-promotion verification
confirmed the exact tested production JavaScript asset, one active revision at
100% traffic, and all four public production smoke probes. Deterministic desktop
and 390-pixel Admissions checks verified right-side placement without overflow.
A fresh load in the owner's signed-in Chrome session confirmed Analytics on the
right side of `/admissions` with no authentication setup error.

### Admissions explicit review-status correction — 2026-09-27

Admissions now displays `Under review` only when Pipeline explicitly reports
that status. Accepted and denied status mappings are unchanged; every other
undecided workflow status now displays as `In progress` with a blue treatment
instead of being inferred as a yellow review decision.

- source commit: `cf5ac4d`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/41`
- image tag: `alamo-platform:admissions-explicit-review-cf5ac4d`
- image digest: `sha256:27078ece1f18465312cc3ef725e25b536b75062c737f055507509cd88b6edc6e`
- active revision: `alamo-platform-prod-web--admissions-review-status-0927`
- rollback digest: `sha256:1a441d5e6f166e1b38ffddbdeb00ff9443901d79717c2de9607024d04b6c5430`

Post-promotion verification confirmed the exact configured production asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. Deterministic desktop and 390-pixel browser checks covered both an
ordinary in-progress record and an explicit Pipeline `Under Review` record. A
fresh load in the owner's signed-in Chrome session confirmed all 21 live cards
matched their source statuses: six accepted, 15 in progress, zero incorrectly
inferred as under review, and no authentication setup error.

### Admissions in-progress contrast correction — 2026-09-27

The blue `In progress` category now forces white text in every Admissions
surface so surrounding card, table, or modal styles cannot reduce its contrast.

- source commit: `2908814`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/43`
- image tag: `alamo-platform:admissions-in-progress-white-2908814`
- image digest: `sha256:30beb8bcead8e7e817e0261faed877d0730bc709cb6453817e6b3497dcd21060`
- active revision: `alamo-platform-prod-web--progress-white-0927`
- rollback digest: `sha256:27078ece1f18465312cc3ef725e25b536b75062c737f055507509cd88b6edc6e`

Post-promotion verification confirmed the exact configured production asset, a
healthy single revision at 100% traffic, and all four public production smoke
probes. A fresh load in the owner's signed-in Chrome session confirmed all 15
visible `In progress` labels computed to pure white text.

### Admissions client-chart drill-downs — 2026-09-27

The three summary bands inside each Admissions management chart are now
interactive. `Admission brief` opens status provenance, placement, and referral
origin; `Workflow and readiness` opens ownership, timing, and requirement
readiness; and `Client context` opens the bounded assessment overview, care and
support snapshot, and medication handoff. The detail remains inside the existing
folder chart, keeps the client name and decision tab visible, and does not expose
raw Pipeline notes or documents.

- source commit: `635e467`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/45`
- image tag: `alamo-platform:admissions-chart-drilldowns-635e467`
- image digest: `sha256:8bb15245c20ac250b5c25dc4fef4ff4d475d19665bc80545b054ec8baa50bf61`
- active revision: `alamo-platform-prod-web--chart-drilldowns-0927`
- rollback digest: `sha256:30beb8bcead8e7e817e0261faed877d0730bc709cb6453817e6b3497dcd21060`

This frontend-only release was rebuilt over the stable runtime image
`sha256:1e8c4d9295e091f118e7d079fa6919a92eaab7027a6ffc07052e30aa5919a737`;
the backend and Pipeline feed contract did not change. TypeScript, JavaScript
lint, docs, the Admissions dashboard check, the production-configured build,
and deterministic desktop and 390-pixel browser coverage passed before
promotion. Post-promotion verification confirmed the exact JavaScript asset,
a healthy single revision at 100% traffic, and all four public smoke probes. A
signed-in production check opened all three chart drill-downs against the live
21-card feed with no horizontal overflow, raw-document links, or browser errors.

### Admissions data-row drill-down correction — 2026-09-27

The chart-level drill-down sheets were replaced with direct, in-place
disclosure on the existing management-chart rows. Status, placement, referral
origin, coverage, client details, ownership and timing, assessment, documents,
and requirements now expand into their underlying source fields. Only one row
opens at a time; client context stays directly readable in the chart. This also
corrects the mobile reading order and keeps the disclosure control to the right
of each left-aligned label and value.

- source commit: `c395211`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/47`
- image tag: `alamo-platform:admissions-inline-drilldowns-c395211`
- image digest: `sha256:049f7e365d29ded864c86f6ffbac9798964392e021f7cb4ac5e1d737e15cd99a`
- active revision: `alamo-platform-prod-web--inline-drill-0927`
- rollback digest: `sha256:8bb15245c20ac250b5c25dc4fef4ff4d475d19665bc80545b054ec8baa50bf61`

This frontend-only correction used the existing stable runtime and did not
change the backend or Pipeline feed contract. TypeScript, JavaScript lint,
documentation, the Admissions dashboard check, the production-configured
build, and deterministic desktop and 390-pixel browser coverage passed before
promotion. Post-promotion verification confirmed the exact JavaScript asset, a
healthy single revision at 100% traffic, and all four public smoke probes. A
signed-in production check found all nine row controls on the live 21-card feed,
expanded placement and assessment in place, kept one detail open at a time,
and reported no horizontal overflow, legacy drill-down overlays, or browser
errors.

### Admissions mobile category navigation — 2026-09-28

The Admissions workspace now uses a category-first list on phone and tablet
widths instead of compressing the desktop board. `Referral received`,
`In progress`, `Decision`, `Census`, and `Trends` form the mobile navigation;
the selected pipeline category renders its client list and each client opens
the existing management chart. Community filters stay in one horizontally
scrollable row. Desktop retains the board/list controls and centers the
`Board`, `Census`, and `Trends` navigation.

- source commit: `024409e`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/49`
- image tag: `alamo-platform:admissions-mobile-lists-024409e`
- image digest: `sha256:cf66502c8155f201b5b3776c18d9e17db8fed29f23544494846f8070c46dce30`
- active revision: `alamo-platform-prod-web--mobile-lists-0928`
- rollback digest: `sha256:049f7e365d29ded864c86f6ffbac9798964392e021f7cb4ac5e1d737e15cd99a`

This frontend-only release used the exact preceding production image as its
base, so the backend, Pipeline feed contract, environment, and secrets did not
change. TypeScript, the Admissions dashboard check, a production-configured
build, and deterministic responsive coverage at 320, 390, 768, and 1024 pixels
passed before promotion. Connected-feed fixture coverage confirmed category
selection, client lists, the management-chart modal, one-row community filters,
and no page or modal overflow at 390 and 768 pixels. Post-promotion verification
confirmed the exact JavaScript and CSS assets, a healthy single revision at
100% traffic, and all four public production smoke probes.

### Analytics Monday-briefing removal — 2026-09-28

The Monday census briefing is no longer presented as an Analytics report on
desktop or mobile. Analytics now contains only the five finished governed
report families. The separate scheduled Monday census email workflow remains
available and was not changed.

- source commit: `0828abf`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/51`
- release-tooling commit: `850e3fd`
- release-tooling PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/52`
- image tag: `alamo-platform:reports-no-monday-0828abf`
- image digest: `sha256:9ee73ecb35a542b4a52f717c59645fd197c7df5f1e685ee58c39f4c4edbe8382`
- active revision: `alamo-platform-prod-web--reports-no-monday-0928`
- rollback digest: `sha256:cf66502c8155f201b5b3776c18d9e17db8fed29f23544494846f8070c46dce30`

The frontend release Dockerfile was reduced to one filesystem layer after the
original overlay attempt reached the inherited image-depth limit. The successful
release still uses the exact preceding production image as its runtime base and
changes only the browser bundle. TypeScript, the report contract check,
documentation, a production-configured build, and the complete desktop/mobile
report browser regression passed before promotion. Post-promotion verification
confirmed the exact JavaScript and CSS assets, absence of the removed report
label in the live bundle, a healthy revision at 100% traffic, and all four
public production smoke probes.

### Analytics text navigation release — 2026-09-28

The Analytics workspace switcher is now a quiet text row at the upper right.
`Reports` and `Ask a question` sit directly beside one another with no tray or
icons; only the current destination receives a light green outlined box. The
desktop placement reserves space for the separate Admissions destination, and
the same selected-state treatment remains legible without horizontal overflow
on phone widths.

- source commit: `9145330`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/54`
- release-tooling commit: `5da22a3`
- release-tooling PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/55`
- image tag: `alamo-platform:analytics-text-nav-9145330`
- image digest: `sha256:35916d7d19fac583b623defe7c17d717c319436e37e28ed7f88c98f9fb0212c2`
- active revision: `alamo-platform-prod-web--analytics-text-nav-0928`
- rollback digest: `sha256:9ee73ecb35a542b4a52f717c59645fd197c7df5f1e685ee58c39f4c4edbe8382`

The release rebased the exact proven production filesystem into a fresh image
after inherited frontend overlays reached the registry depth ceiling. Runtime
configuration was preserved exactly while filesystem layers were reduced from
125 to two. TypeScript, the California Home contract check, documentation, a
production-configured build, the full report browser regression, and responsive
desktop, phone, tablet, and ultrawide visual checks passed before promotion.
Post-promotion verification confirmed the exact JavaScript and CSS assets, a
healthy revision at 100% traffic, and all four public production smoke probes.

### Primary Platform text navigation correction — 2026-09-28

The preceding text-only treatment was corrected to apply to the primary
`Analytics` and `Admissions` destinations, not the Analytics workspace
switcher. Those primary destinations now remain beside one another at the upper
right without arrows, and the active page receives a light green outlined box.
The Alamo home anchor remains at the upper left. `Reports` and `Ask a question`
were restored to their bordered Analytics control and positioned independently
so neither navigation overlaps from phone through ultrawide widths.

- source commit: `c245bcf`
- source PR: `https://github.com/3wilsoneric/alamo-platform-app/pull/57`
- image tag: `alamo-platform:primary-text-nav-c245bcf`
- image digest: `sha256:d93329474498a735d53c18214034eeca777b0d272fe65eba930bc312ff613763`
- active revision: `alamo-platform-prod-web--primary-text-nav-0928`
- rollback digest: `sha256:35916d7d19fac583b623defe7c17d717c319436e37e28ed7f88c98f9fb0212c2`

This frontend-only release adds one browser-bundle layer to the flattened
runtime and does not change the server, API, environment, or data adapters.
TypeScript, the California Home contract, documentation, the
production-configured build, full report coverage, Admissions dashboard
contracts, and responsive browser coverage from phone through ultrawide passed
before promotion. Desktop and mobile visual checks also confirmed the active
Analytics and Admissions states. Post-promotion verification confirmed the
exact JavaScript and CSS assets, a healthy revision at 100% traffic, and all
four public production smoke probes.

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

### Licensing reports and update feed release — 2026-09-28

- source commits: `3686069` and `4bdacc5`, branch `codex/licensing-production-20260928`
- image tag: `alamo-platform:licensing-4bdacc5`
- image digest: `sha256:2cfacc47f400a787b501875ced690f71e4c6a62f43f59feeecdb4d8ec4a9e0fb`
- active revision: `alamo-platform-prod-web--licensing-4bdacc5`
- rollback digest: `sha256:d93329474498a735d53c18214034eeca777b0d272fe65eba930bc312ff613763`
- baseline: `20260928T211945Z-350926e2`, 93 reports across four communities

The protected `/licensing` page has a compact breadcrumb and Updates row,
one search box, and source-grounded report briefs. The page title and subtitle
were removed so reports begin higher on the screen. Community profiles link to
the corresponding Licensing collection. The final production browser asset is
`/assets/index-BGafwIFT.js`.

This release overlays the exact preceding production image with the browser
bundle, only the new Licensing server/shared modules, and three protected GET
routes patched into the production image's API handler. Existing Azure runtime,
Admissions integrations, authentication, environment, and data adapters remain
from that image. `scripts/prepare-licensing-release.mjs` builds the bounded
context and refreshes compressed static representations along with the originals.
Do not substitute the repository's whole API/server tree for the image runtime.

The serving bundle is private Azure Blob data at
`alamodatalake/alamo-platform-snapshots/licensing/library-v1.json`, read with the
existing managed identity. Immutable bundle versions and original source/SQLite
archives are kept under `licensing/versions/` and `licensing/evidence/`.
The publisher validates source hashes and uses conditional writes. Production
fails closed when cloud data cannot be read; it does not use local evidence as
an outage fallback. No new credentials or public storage permissions were added.

At initial launch, a Monday 9 a.m. Pacific Codex monitor ran
`node scripts/check-licensing-updates.mjs --publish` from the primary app checkout.
That initial trigger required the Mac and Codex. The later Licensing cloud job
below replaces this local scheduling design.

Verification: the full nonbrowser `check:ship:predeploy` gate passed all eight
stages, including `check:analyst`, dependency audit, regression replays, stress
checks, and production-configured build. Browser checks were performed through
CUA instead of the shell Playwright runner. The initial revision was rolled back
when signed-in search changed its URL but not its displayed results. The issue
was reproduced in the optimized build and corrected by making BrowserRouter
navigation synchronous (`useTransitions={false}`). TypeScript, Licensing,
Admissions access, California home contracts, and the resumed build gate passed
after that change. Optimized-browser search, report selection, clearing search,
and Back navigation passed before the final deployment.

Post-deployment verification confirmed Healthy/Running at 100% traffic, exact
browser asset identity, 4/4 public smoke probes, and 401/no-store for all three
unauthenticated Licensing endpoints. Signed-in production showed all 93 reports,
four results for the substantiated-medication/San Pablo query, source briefs,
the successful no-change Updates feed, the map and community Licensing link
(55 San Pablo reports), and the populated Admissions board. The compact layout
was visually verified; the local phone layout had no horizontal overflow.

### Licensing full-width layout release — 2026-09-28

- source commit: `5821b29`, branch `codex/licensing-production-20260928`
- image tag: `alamo-platform:licensing-width-5821b29`
- image digest: `sha256:6e266efc866b895fffbdf7f208850ff1bad1279f29ee0ea7b15b5e4d444b5476`
- active revision: `alamo-platform-prod-web--licensing-width-5821b29`
- rollback digest: `sha256:2cfacc47f400a787b501875ced690f71e4c6a62f43f59feeecdb4d8ec4a9e0fb`

The Licensing page now fills the available width with 32-pixel desktop and
12-pixel phone gutters. Its page and shell width caps are removed only for
Licensing; the report list retains its 300-pixel desktop width. This is a
frontend-only overlay on the exact preceding production digest, including
fresh compressed static files. The live browser asset is
`/assets/index-Dz0-Q1Nr.js`.

Verification: 8/8 nonbrowser predeployment stages passed, including the full
analyst checks and production-configured build; browser QA used CUA. Desktop
content measured 1406 pixels in a 1470-pixel viewport, and the local phone layout
measured 366 pixels in a 390-pixel viewport, both without horizontal overflow.
Production is Healthy/Running at 100% traffic, serves matching JS and CSS,
and passed 4/4 public smoke probes. Signed-in search returned four matching
reports, and clearing it restored all 93 reports.

### Licensing cloud job

The platform-owned collector uses an Azure Container Apps Job named
`alamo-platform-licensing-check`, in the platform's existing Container Apps
environment. Its source definition is `scripts/azure/licensing-job.json` and
its image is built with `Dockerfile.licensing-job`. The job uses the existing
platform managed identity and private snapshot container; it has no user login
or Codex dependency. It publishes into the existing Licensing Updates feed.

Change-only email is prepared for the Logic App
`alamo-platform-licensing-alerts` through the existing connected Office 365
Outlook connector. Its source definition is
`scripts/azure/licensing-alert-workflow.json`; deploy it with
`npm run licensing:deploy-alert-workflow`. The deployment stores the signed
callback URL in Key Vault as `licensing-alert-webhook-url`. The job resolves
that secret through its existing user-assigned identity and never includes the
URL in its image or source. Recipients are locked to
`raj@aaahealthservices.com` and `betty@aaahealthservices.com` in both code and
the workflow definition. Delivery is currently launch-gated: the Logic App is
disabled and the job sets `LICENSING_ALERT_NOTIFICATIONS_ENABLED=false` so the
scheduled collector continues to queue changes without sending them. Launch
requires reauthorizing the Office 365 connection, enabling the Logic App, and
changing that job setting to exactly `true`; complete all three in one verified
release. A pending envelope must be reviewed before launch because enabling
delivery will retry it.

The twice-weekly schedule is Monday and Wednesday at 9 a.m.
America/Los_Angeles. Azure evaluates
cron in UTC, so the job is triggered at both candidate UTC hours and the worker
checks Pacific local time before contacting the source. Exactly one slot runs
in either standard time or daylight time. See Microsoft's
[Container Apps jobs documentation](https://learn.microsoft.com/en-us/azure/container-apps/jobs).

The published library atomically points to the complete collector evidence
archive. Each fresh container verifies and restores that archive before
checking the four facilities. The initial evidence hash in the deployment
specification is used only to migrate the pre-job baseline; its run ID must
match the published collection. Later executions use the published pointer.
A renewable blob lease prevents overlapping writers. Failed/partial scans
retain the last complete collection and mark Updates as failed; comparison
history advances only after all four facilities pass. Job execution history
also records failures, including storage outages that cannot update the feed.
After a successful atomic publish, the job queues only the latest run's changes
under `licensing/notifications/pending/`, calls the mail workflow, and writes an
immutable receipt under `licensing/notifications/sent/`. Pending envelopes are
retried before later scans, including the daylight-saving guard execution. A
run with no new, revised, removed, or reappearing record sends no email.

Use `npm run licensing:prepare-job` to create a bounded image context with only
collector code and locked dependencies. Build that context in ACR, then deploy
its immutable digest with
`npm run licensing:deploy-job -- --image=<digest>`. Use `--manual` for initial
verification before enabling the schedule. `az containerapp job start` runs a
manual execution; for a scheduled definition, supply an execution template with
the `--scheduled` argument removed to run outside the weekly time window.
Run `npm run check:licensing-job` for DST, overlap, failure, restore, and atomic
history checks. The first cloud execution and a fresh-container repeat must
succeed before retiring the former Codex automation.

### Licensing cloud-job release — 2026-09-28

- source commit: `3b3cee1`, branch `codex/licensing-production-20260928`
- web revision: `alamo-platform-prod-web--licensing-cloud-3b3cee1`
- web image: `sha256:68675f708e944a4df062abec537b6ef45475b266539516bdd119ee411fe524ed`
- preceding web image: `sha256:6e266efc866b895fffbdf7f208850ff1bad1279f29ee0ea7b15b5e4d444b5476`
- job: `alamo-platform-licensing-check`
- job image: `alamo-licensing-job@sha256:e8561200eba9d127c02fe3992fc0a86c7957ffc38a1586c0ece71ef1095232f1`
- first successful execution: `alamo-platform-licensing-check-cmak8uj`

The web release overlays only the browser bundle and Licensing validation and
library modules on the preceding runtime. The job image contains collector
code and locked dependencies, no local records or Azure CLI credentials. Both
use the platform's existing managed identity; no RBAC permissions changed.
The first cloud run restored the original evidence archive, checked all four
facilities, published 93 reports, and found zero changes.

Verification: all eight nonbrowser predeployment stages passed, including the
analyst suite and production build. Additional collector checks verify that
partial source failures cannot advance history, unsafe archives are rejected,
leases prevent overlap and release after failure, and the Monday/Wednesday
9 a.m. Pacific
schedule follows daylight-saving time. Production is Healthy/Running at 100%
traffic, matches `/assets/index-B75ElOs8.js`, passes 4/4 public smoke probes,
and returns 401/no-store on anonymous Licensing APIs. Signed-in CUA verification
confirmed 93 reports, four matches for the substantiated-medication/San Pablo
query, and the automatic schedule in Updates. The original release was
Monday-only; the current cadence is recorded in the later schedule release.

To suspend collection, change the job trigger to Manual and stop any active
execution. Keep the current web reader when suspending the schedule. A rollback
to a web version predating `platform_scheduled` requires restoring its compatible
published library from `licensing/versions/` as well; otherwise its older
validator rejects the newly scheduled baseline. Preserve immutable evidence
archives when recovering or rolling back.

The fresh-container repeat `alamo-platform-licensing-check-ihhsma7` also
succeeded with 93 reports and zero changes. Its published run is
`20260929T031120Z-db2eace4`, bundle hash
`f1ad3de99e21936abb84c7cb66dbe95178887d1abd45fc37e21511f33d10613b`,
and evidence hash
`816ab93485375a377a6cf6a2244d3be5439704b82effc9b36a548095629fde62`.
The final evidence blob was read back and its checksum verified. The job was
then changed to Schedule with the Pacific-time guard enabled and provisioning
Succeeded. The old `alamo-licensing-updates` Codex automation was deleted only
after both successful cloud executions and schedule verification. No Mac,
Codex session, or interactive Azure sign-in is required for subsequent checks.

### Licensing email launch hold — 2026-10-06

- source merge: `c29da51` (PR #151)
- job image: `alamo-licensing-job@sha256:556933b3a3c8402248ca30a87cbe0070435a99b381a81add3946d8e7cdc0ff8e`
- preceding job image: `alamo-licensing-job@sha256:cf2cabc0d6bb362977910c0fc820a7f6085e475a525df10b09ffd72eb469c90d`
- ACR build: `cc5v`
- verification execution: `alamo-platform-licensing-check-g5a0sit`

The change-only email path is installed but not launched. The Logic App is
Disabled and the scheduled job has
`LICENSING_ALERT_NOTIFICATIONS_ENABLED=false`. A real Oct 5 Santa Clarita
change remains in the private pending queue; no sent receipt exists. The
verification execution succeeded and reported one paused pending envelope,
proving the scheduled collector can remain healthy without calling the mail
workflow. The existing Office 365 connector also requires reauthorization
before launch. Do not enable either gate or retry the pending alert without
explicit approval to send to Raj and Betty.

### Monday/Wednesday Licensing cadence — 2026-10-06

- source merge: `2ae6a58` (PR #153)
- web revision: `alamo-platform-prod-web--licensing-mon-wed-1006`
- web image: `alamo-platform@sha256:90bfb108e4dc37280d9a1d62a5afed2b5b36440ba7f95e40ae2146bbe58a2049`
- preceding web image: `alamo-platform@sha256:9fa7c3337eccb9da963a87b982c024db69833bb1b828b881b5523d56569f76d8`
- web ACR build: `cc5w`; active assets: `/assets/index-DMBP8I8e.js`
  and `/assets/index-BxRd7BsG.css`
- job image: `alamo-licensing-job@sha256:3209766d83f4b50f66535862a0105778678b4a5611e6244e1c9293843e167b03`
- preceding job image: `alamo-licensing-job@sha256:556933b3a3c8402248ca30a87cbe0070435a99b381a81add3946d8e7cdc0ff8e`
- job ACR build: `cc5x`
- verification execution: `alamo-platform-licensing-check-pmqlf0g`

The scheduled job now triggers at both candidate UTC hours on Monday and
Wednesday, with the worker's America/Los_Angeles guard selecting exactly 9 a.m.
through daylight-saving changes. Its cron is `0 16,17 * * 1,3`. The web and API
release accepts the legacy Monday-only schedule while exposing the new
Monday/Wednesday contract once the next complete check publishes it. The safe
Tuesday verification execution succeeded and reported that it was outside the
Monday/Wednesday window. Email remains launch-gated: the Logic App is Disabled,
the worker flag is `false`, one pending envelope remains queued, and no email
was sent.

### Licensing mobile workspace — 2026-10-06

- source merge: `53f42ce` (PR #155)
- revision: `alamo-platform-prod-web--licensing-mobile-1006`
- image: `alamo-platform@sha256:cc9f7628cff6d0aaf3fa26c7a0d22b3f3b7586cdcd9af2aab493fe8c48dcdd47`
- preceding image: `alamo-platform@sha256:90bfb108e4dc37280d9a1d62a5afed2b5b36440ba7f95e40ae2146bbe58a2049`
- ACR build: `cc5y`
- active assets: `/assets/index-CGaTtB-f.js` and
  `/assets/index-Hj-mupV4.css`

The frontend and Licensing-module overlay preserves the production API,
authentication, private storage, twice-weekly monitor, and paused email gates.
The Licensing phone view now uses a bounded Updates sheet, a compact search
control, readable report cards, larger source text, and full-width source and
download actions. The dedicated browser regression passed at 320, 390, and 430
pixels across list, Updates, reader, and expanded-source states with no
horizontal overflow. The revision is Healthy/Running at 100% traffic, the live
HTML references the expected assets, public smoke passed, and anonymous
Licensing access remains 401 with private/no-store caching.

### Navigation and responsive review release — 2026-09-28

- source: `2a2f9db`, following `8b5461f` and `3610feb` on
  `codex/licensing-production-20260928`
- revision: `alamo-platform-prod-web--responsive-2a2f9db`
- image: `alamo-platform@sha256:69bc343962ec7f02ce6d4e144f05d02c65b4336b9f9a431793b35b15a4cc3d14`
- preceding image: `alamo-platform@sha256:1ac18b97d8616a6dd7477e2e4b100d6b4702c40c73a459175763906d474ab34c`
- active browser asset: `/assets/index-B6wycf3A.js`
- ACR build: `cc3x`

The frontend-only overlay preserves the currently deployed API/runtime and
Licensing cloud job. Both gzip and Brotli siblings were regenerated before the
image build, so compressed index responses reference the new assets. The final
revision is Healthy/Running with 100% traffic. All eight nonbrowser release
stages passed, followed by focused checks for the last tooltip adjustment and a
fresh production build. Public production smoke passes 4/4; anonymous Licensing
library and Updates requests still return 401 with private/no-store caching.

Signed-in CUA verification confirmed the exact asset above, the corrected
320px search selectors and Admissions timing, the account hint beneath the
header, and the shared Analytics/Admissions/Licensing navigation. The broader
review covered ten viewport sizes and the product routes described in
`testing-quality.md`. Licensing reported its then-current Monday 9 a.m. Pacific
schedule; the current cadence is recorded in the later schedule release.
Physical iOS and Safari/WebKit were not available in this browser session.

The release was made from the clean release checkout rather than the shared
main checkout, which contains separate in-progress product work. Do not replace
this immutable runtime with an older image or deploy the shared working tree
without reconciling those changes first.

### Licensing access and Analytics placement — 2026-09-28

- source commit: `920db3f`, branch `codex/licensing-production-20260928`
- revision: `alamo-platform-prod-web--licensing-access-920db3f`
- image: `alamo-platform@sha256:a907d6af426d8e7b5a7e4306fb4ea50f6aadeae5e469e68d221a9786c54462b5`
- base image: `alamo-platform@sha256:69bc343962ec7f02ce6d4e144f05d02c65b4336b9f9a431793b35b15a4cc3d14`
- ACR build: `cc3y`; active asset: `/assets/index-CxQlospQ.js`

Licensing now lives at `/analytics/licensing`, alongside Reports and Ask a
question. Only Betty Dominici and Raj Thandi's tenant-local Entra object IDs
qualify. The shared browser/server policy is `shared/licensing-access.mjs`.
All three Licensing API routes require a verified delegated identity and the
explicit allowlist; denied authenticated requests return generic 404 responses.
The top-level and community-profile links were removed. Legacy `/licensing`
links preserve their query string when redirecting to the protected new route.

The approved IDs were verified against the existing Entra directory; no account,
role, consent, or tenant permission was created or expanded. The scheduled
collector and its managed identity remain unchanged. The bounded release
overlay patches only the Licensing API handlers and modules plus the browser
bundle, preserving the established runtime. Do not roll back to a pre-access
API image: it would restore access for every authenticated Platform user.

Verification: 8/8 nonbrowser release stages and 4/4 production smoke probes
passed. Signed-token tests exercise the actual API authentication/handlers,
reject nonmembers and misleading names/email claims, and let both approved IDs
reach the report loader. These same tests passed against the overlaid production
container with networking disabled. Local CUA fixtures verified both permitted
identities, a denied identity with zero Licensing requests, and 320/390/768/1440px
navigation. These fixtures did not sign in as Betty or Raj. Production CUA under
Eric confirmed the exact asset, no Licensing navigation, and redirects from both
old and new direct URLs to Analytics. The revision is Healthy/Running at 100%
traffic; all anonymous Licensing APIs return 401/private-no-store.

### Admissions weekly briefing release — 2026-09-28

- integrated source: `a7b5249` on `main` through PRs #59 and #60
- revision: `alamo-platform-prod-web--admissions-briefing-0928`
- image: `alamo-platform@sha256:84e4fb881f354714f8fe1cc36d6a9db8c48fcdb2df9b31f849c047f196f9a5ef`
- base and rollback image: `alamo-platform@sha256:a907d6af426d8e7b5a7e4306fb4ea50f6aadeae5e469e68d221a9786c54462b5`
- ACR build: `cc40`; active assets: `/assets/index-CfNa8vME.js` and
  `/assets/index-DbM4zKqw.css`

Admissions replaces Trends with Briefing and opens there by default. The
briefing presents current census by community, referral origin over 7 and 14
days, census trend, upcoming assessments this week, and planned move-ins this
week. Existing Board and Census workflows remain available. Mobile navigation
uses the same compact category pattern as Communities.

The release overlay started from the active Licensing-access image and replaces
only the built browser assets and the two reviewed Admissions aggregation
modules. It therefore preserves the restricted Licensing route and its runtime.
The current Pipeline producer contract is version 3.0 and does not yet publish
the optional `briefing` slice. Census is live; the four dependent briefing
sections identify themselves as `source_upgrade_required` rather than displaying
invented zeros. Upgrade the producer contract before treating those sections as
complete operational reporting.

Verification: all nonbrowser, analyst, regression, stress, fuzz, browser,
mobile, guided-render, journey, and performance checks passed before release;
the final reconciled source also passed typecheck, Admissions access/dashboard,
Licensing, browser-Admissions, and production build checks. Azure reports the
revision Healthy/Running at 100% traffic. Production serves the expected assets,
`/healthz` is healthy, and the public smoke suite passes 4/4. Authenticated
production smoke and guided-question scripts were not executed because the
release checkout has no saved production browser storage state; their local and
predeployment equivalents passed. Roll back to the immutable base digest above
if an authenticated production issue is found.

#### Compressed-shell correction

The first Admissions briefing overlay updated the uncompressed browser build
but inherited older precompressed `index.html.gz` and `index.html.br` files from
its base image. Production correctly advertised no-cache for HTML, but browsers
that requested gzip or Brotli still received the older asset references and
continued to show Trends. The command-line smoke probe requested the identity
representation and therefore did not expose the mismatch.

The corrected release regenerated every compressed HTML, JavaScript, CSS, JSON,
and SVG sibling before building. Revision
`alamo-platform-prod-web--admissions-cachefix-0928` runs image
`alamo-platform@sha256:45991a8f5c3db93f8410694985b39e0e497d2a14e7d1cd39122db043d2a7adcf`
from ACR build `cc41`; the preceding image
`sha256:84e4fb881f354714f8fe1cc36d6a9db8c48fcdb2df9b31f849c047f196f9a5ef`
is its rollback point. The correction is Healthy/Running at 100% traffic.
Identity and gzip responses both reference `/assets/index-CfNa8vME.js` and
`/assets/index-DbM4zKqw.css`. A signed-in Chrome verification on the clean
`/admissions` URL confirmed that Briefing is selected and Trends is absent.
Future overlay releases must regenerate and replace the precompressed browser
representations, not only their source files.

### Owner workspace and Licensing access — 2026-09-29

Eric Wilson's existing tenant-local Entra object ID now joins Betty Dominici
and Raj Thandi on the explicit Licensing allowlist. The same verified owner ID
already protects the private Knowledge and Acquisition APIs; the shared browser
navigation now exposes Outreach only to that identity. No role, tenant
assignment, service principal, or access for any other account is expanded.

The release is prepared with `scripts/prepare-licensing-release.mjs` on the
exact preceding production digest. It replaces the current browser bundle and
only the shared Licensing/owner access modules plus the owner access server
adapter. Anonymous requests and authenticated nonmembers continue to receive
the existing private failure behavior.

Source PR `#65` merged as `9e12b431b2258bde23c8dd9a83eea7b3fcfaf385`.
ACR build `cc42` produced immutable image
`alamo-platform@sha256:62e5da15dbd8c0321ecfa0385b856c8a1ca3ee23ffec103da65d45dffab40e30`
from rollback digest
`sha256:45991a8f5c3db93f8410694985b39e0e497d2a14e7d1cd39122db043d2a7adcf`.
Revision `alamo-platform-prod-web--owner-access-0929` is Healthy/Running at
100% traffic. `/healthz` returned 200, the public production smoke suite passed
4/4, and identity plus gzip HTML both referenced
`/assets/index-CNv--yTM.js`. Anonymous Licensing remained 401. A signed-in
Chrome verification under Eric Wilson's production account confirmed both the
Outreach header destination and a working Licensing archive.

### David and Angela Platform access — 2026-09-29

David (`david@aaahealthservices.com`) and Angela
(`angela@aaahealthservices.com`) were invited into the production Entra tenant
as enabled guest users with the Platform login URL as their invitation return
path. Their tenant-local object IDs are
`d238e1f3-fb9d-40bc-a946-59540560bfb1` and
`530b3414-ff80-4df1-92dc-24bf400c2de1`, respectively.

Both identities are assigned the enabled `Alamo.Admissions.Supervisor` app role
on the `Alamo-Health-Data-Platform` enterprise application. This role permits
Admissions and the broader operating workspace; it does not add either user to
the owner-only Outreach or Licensing allowlists. The change is live Entra
configuration and does not require a Container App image revision. Both guest
objects remain `PendingAcceptance` until each user accepts Microsoft's emailed
invitation. Production remained Healthy/Running at 100% traffic and
`/healthz` returned 200 after the assignments.

### Admissions single-page briefing and Pipeline 3.1 — 2026-09-29

Admissions is now one continuous management page. The former Briefing/Census
surface navigation and standalone Census panel are removed. The executive
update leads into the collapsible **This week at a glance** deck, followed by
the existing Board/List. Census remains a governed briefing input rather than a
separate destination; the mobile board still uses its three pipeline-category
tabs.

Platform consumer:

- source PR: `#68`; merge commit: `64ce8dd5d868f78c41b08af157c5a01f35fbbc8e`
- ACR build: `cc43`
- image: `alamo-platform@sha256:38f1d8b5e06ea9a28fa3aaa1ec47bfc0579f5b85320df7b162a88828668ecae3`
- active revision: `alamo-platform-prod-web--admissions-single-0929`
- rollback image: `alamo-platform@sha256:62e5da15dbd8c0321ecfa0385b856c8a1ca3ee23ffec103da65d45dffab40e30`
- active browser asset: `/assets/index-EkLkOWwE.js`

Pipeline producer:

- source PR: `#221`; merge commit: `2ad828692b803f6418bf141ede772287b44453c`
- deployment workflow: `36584921689`
- image: `pipeline-app:2ad828692b803f6418bf141ede772287b44453c`
- active revision: `pipeline-prod-web--2ad828692b-r36584921689-1`
- rollback image: `pipeline-app:1024053bd132fae0373bf141ede772287b44453c`
- contract version: `3.1`

The producer's required CI rerun passed every browser, operational, Postgres,
verification, and immutable-image job before the full Azure lane ran. Both
Container App revisions are Healthy/Running at 100% traffic. The direct
server-to-server contract reports complete coverage for recent referrals,
assessments, move-ins, and weekly trend. A non-PHI verification counted 27
recent-referral rows, zero remaining assessments this week, two planned
move-ins, and 12 weekly trend points. Production `/healthz`, Pipeline liveness
and readiness, identity/gzip asset delivery, local desktop/mobile Admissions
browser regression, and Eric Wilson's signed-in production page all passed.
The signed-in page shows live 7-day and 14-day referral totals and the complete
16-page briefing deck without the former source-upgrade notice.

### Admissions assessment schedule correction — 2026-09-29

The CEO briefing no longer displays the low-value Weekly trend panel. Referral
origins use the full briefing width, while Upcoming assessments and Move-ins
remain the two priority schedules. The Pipeline producer now reads appointment
start time and duration from the canonical assessment schedule used by Pipeline
Home; it no longer mistakes the clinical assessment date for the appointment.

Platform consumer:

- source PR: `#73`; merge commit: `f483fbe446bac30cb6089ebdf8822f8f769be014`
- ACR build: `cc47`
- image: `alamo-platform@sha256:41bca5d43cdc2d22ee700b201a176f7bf91ad9028a6ec0f9aecdcae74a2e4252`
- active revision: `alamo-platform-prod-web--admissions-assessments-0929`
- rollback image: `alamo-platform@sha256:0409a19a29e91b992672e4a975d44495586a3f6e54dc6b9a7bc4eb41b4e5e26f`
- active browser asset: `/assets/index-Eh2hLDQT.js`

Pipeline producer:

- source PR: `#225`; merge commit: `fa3eb2db203a3f02be554c09793e843d0c05a8bb`
- deployment workflow: `36625173723`
- image: `pipeline-app:fa3eb2db203a3f02be554c09793e843d0c05a8bb`
- active revision: `pipeline-prod-web--fa3eb2db20-r36625173723-1`
- contract version: `3.1`

Both revisions are Healthy/Running at 100% traffic. Non-PHI contract
verification reports complete assessment coverage, two remaining appointments
this week, and two planned move-ins. The live-feed desktop/mobile Admissions
browser regression passed without horizontal overflow, the production bundle
omits Weekly trend, identity and gzip HTML reference the same active asset, and
the public production smoke suite passed 4/4.

### Workforce owner-only overview — 2026-09-30

Adds `/workforce` (Briefing and Hiring board) fed by the separate Alamo Workforce
pilot, visible only to the platform owner (nav entry hidden, page redirects, and
`/api/platform/workforce-dashboard` answers 404 to other accounts). The Workforce
pilot holds placeholder data only.

Production's `api/platform.js` and `server/platform-data.mjs` differ from `main`
(main carries unreleased acquisition-operator routes and a community-label
change). `Dockerfile.workforce-release` therefore overlays production's exact
files from the base digest plus only the Workforce route, loader, and
`server/workforce-summary.mjs`; the bundle is built from PR `#75` with
production's public Entra settings and regenerated `.gz`/`.br` siblings.

- source PR: `#75`
- ACR build: `cc4b`
- image: `alamo-platform@sha256:6c9a07b0aa1d0788c6a9d827863fec339f13746934fe6f91176652d5c28ecf85` (tag `workforce-owner-20260930`)
- active revision: `alamo-platform-prod-web--workforce-owner-0930`
- rollback image: `alamo-platform@sha256:41bca5d43cdc2d22ee700b201a176f7bf91ad9028a6ec0f9aecdcae74a2e4252`
- active browser asset: `/assets/index-BBNkATW7.js` (identity, gzip, and Brotli)
- new settings: `WORKFORCE_SUMMARY_URL`, `WORKFORCE_SUMMARY_TOKEN` (secret `workforce-summary-token`)

The revision is Healthy/Running at 100% traffic. `/`, `/home`, `/admissions`,
and `/workforce` return 200; platform APIs still reject anonymous callers; the
server log shows a clean start. Not included: the unpushed
`codex/admissions-county-outreach` branch, which was not released.

### Outreach rename — 2026-09-30

The owner-only national market and acquisition workspace is now named
**Outreach** throughout the live product. `/outreach` is the canonical route.
The retired `/fiftystate` URL redirects to Outreach and preserves query strings
and hashes so saved links continue to work. The underlying state research,
acquisition data, API boundary, and owner allowlist are unchanged.

- source PR: `#81`; merge commit: `7a696cb901be95dd966f8e482bfb541c9c26672b`
- ACR build: `cc4h`
- image: `alamo-platform@sha256:05713cac42d4e6e28fa5484c8ad82f759d3a36bb73fc4c61c3883784a8a29778`
- active revision: `alamo-platform-prod-web--outreach-rename-0930`
- rollback image: `alamo-platform@sha256:41f5c9eca19c21256a6c3360be8b7833d47a414a54747546ed8eab2c7c0c677f`
- active browser asset: `/assets/index-CYXljkcc.js` (identity, gzip, and Brotli)

The revision is Healthy/Running at 100% traffic and the public production smoke
suite passes 4/4. A signed-in Chrome verification confirmed the Outreach
navigation destination, workspace heading, canonical URL, and legacy redirect.
Desktop and 390px local browser checks passed without horizontal overflow.

### Mobile platform polish — 2026-09-30

The signed-in phone experience now uses a full-height primary menu with
touch-sized destinations. The Communities landing page distributes its five
rows across the available viewport instead of leaving a dead lower half.
Admissions keeps the same governed content while presenting a denser phone
brief: census cards omit unavailable activity lines, county outreach opens as
two summary-first disclosures, and empty or incomplete weekly schedules no
longer reserve desktop-height panels. Workforce empty action lists follow the
same compact phone treatment. Desktop layouts and data contracts are unchanged.

- source PR: `#83`; merge commit: `be63f3cd9ac754bc9127724aefa1a04eb03e0b40`
- ACR build: `cc4j`
- image: `alamo-platform@sha256:ea53b038166663980d50967515913ea4141db9590c106c1e292477c3db5001fa` (tag `mobile-polish-be63f3c`)
- active revision: `alamo-platform-prod-web--mobile-polish-0930`
- rollback image: `alamo-platform@sha256:05713cac42d4e6e28fa5484c8ad82f759d3a36bb73fc4c61c3883784a8a29778`
- active browser asset: `/assets/index-DspIFtyv.js` (identity, gzip, and Brotli)

The revision is Healthy/Running at 100% traffic and the public production smoke
suite passes 4/4. Local phone QA passed at 390 and 320 pixels for Communities,
the community profile, resident search/profile, Analytics, governed questions,
Admissions, and Outreach. Signed-in production verification at 390 by 844
pixels measured zero horizontal overflow, a 60-to-844-pixel full-height menu,
64-pixel menu rows, a 784-pixel Communities workspace, and two collapsed
county disclosures that both retain their verified detail. The broad analyst
suite passed its source, registry, live-decision, intent, module, and transition
stages before a transient Azure identity network error interrupted the unrelated
long context-fuzz stage; the focused mobile, Admissions, Workforce, type, docs,
and production-build gates all passed.

### Analytics controls and governed questions polish — 2026-09-30

Analytics now labels the cross-community report simply `Overview` in both the
report picker and compiled document while retaining the stable `overview` API
identifier. Report, period, community, and audience controls use labeled,
compact fields with explicit chevrons and 44-to-48-pixel phone targets. The
governed question library uses a quieter editorial list, consistent mobile
inputs, clear execution states, and preserved pagination instead of stacked
card borders. The production frontend normalizes the Overview label across the
current API response so this presentation change does not require a backend
contract or data-service rollout.

- source PRs: `#85`, merge commit `41e3ad5e2947d6868f0587d0ac4fa60150c0976c`; `#86`, merge commit `1dd29c1305ba108b89f5e66f726635b193f13dfe`
- ACR builds: `cc4k`, `cc4m`
- image: `alamo-platform@sha256:c5ab27d612310ed062d54904b581453e57620f613275eb3820e68125a41f952e` (tag `overview-display-0930-1dd29c1`)
- active revision: `alamo-platform-prod-web--overview-label-0930`
- rollback image: `alamo-platform@sha256:ea53b038166663980d50967515913ea4141db9590c106c1e292477c3db5001fa`
- active browser asset: `/assets/index-DJ673HV6.js` (identity, gzip, and Brotli)

The revision is Healthy/Running at 100% traffic. TypeScript, documentation,
report contracts, the production build, all five full reports, mobile answer
flow, cross-device Analytics carousel, and 62 desktop/compact guided-question
controls with four keyboard journeys passed. Signed-in production verification
at 390 by 844 pixels confirmed `Overview` in both locations, the labeled latest
period control, a 48-pixel minimum question-control height, and zero horizontal
overflow. The browser viewport was reset after verification.

### Unlisted owner analyst route — 2026-10-01

Adds `/chat` as an unlisted conversational entry to the governed analyst
workspace. It is absent from shared navigation and waits for the signed-in
Entra account claims before applying the same verified owner allowlist used by
Workforce and Outreach. Other authenticated identities are redirected to Home;
knowing the URL is not the access boundary. The ordinary Analytics question
library remains unchanged.

The release also advances the service-worker cache generation and makes every
navigation request bypass the HTTP cache. Installed, mobile, and long-lived
browser sessions therefore discover the current hashed bundle after a release
instead of continuing to execute an older application shell. A follow-up gives
`/chat` and `/chat/` a dedicated server entry document with `Cache-Control:
no-store`, preventing an already-open pre-chat shell from routing the owner back
to Home before the current application bundle loads.

- source PRs: `#88` through `#99`; final merge commit: `4b2eb453cf02bf30d52ff4ec5e610f7cb2e23bc1`
- ACR build: `cc4y`
- image: `alamo-platform@sha256:7ecd9deebc12419ac03ad83d421d42389e381727a8601f35c74101a76e4dfc11` (tag `chat-dedicated-entry-1001`)
- active revision: `alamo-platform-prod-web--chat-dedicated-1001`
- rollback image: `alamo-platform@sha256:53d87a68b0d41c89c249d87a37bcf31a66ffbb63e812d3a2efb315185147e52d`
- active browser asset: `/assets/index-ombYQBwC.js`

The revision is Healthy/Running at 100% traffic and the public production smoke
suite passes 4/4. The full predeployment platform readiness run passed 17/17
stages, including 124 guided-answer renders across four viewports, accessibility,
keyboard, interaction, context, mission, fuzz, performance, type, documentation,
retention, and build gates. Focused owner-route, authentication-redirect,
platform-knowledge, desktop-readiness, chat-flow, and production-build checks
also pass.

The dedicated-entry follow-up was additionally verified in Eric Wilson's
existing signed-in Chrome tab: navigating from the stale Home shell to `/chat`
loaded the current hashed bundle, retained the `/chat` URL, and rendered the
owner-only Alamo Analyst prompt instead of redirecting to Home.

### Admissions county-outreach removal — 2026-10-01

The County outreach panel and its mobile disclosures have been removed from
the Admissions briefing. Admissions retains its executive update, census by
community, upcoming assessments, move-ins, and referral-origin dashboard. The
responsive browser regression now requires County outreach to remain absent on
desktop and mobile.

`/admissions`, `/admissions/`, `/chat`, and `/chat/` use dedicated no-store
entry documents so a long-lived signed-in browser cannot continue rendering a
pre-release shell after the browser bundle changes.

- source PRs: `#101`, `#102`; final merge commit: `25e3d4dec698de296fbc7bd72caeb941441eb796`
- ACR build: `cc51`
- image: `alamo-platform@sha256:44c08e19e74e41085f718570ab2d85b14113b85db87a47d928b888fd86736608` (tag `admissions-clean-fresh-1001`)
- active revision: `alamo-platform-prod-web--admissions-fresh-1001`
- rollback image: `alamo-platform@sha256:7ecd9deebc12419ac03ad83d421d42389e381727a8601f35c74101a76e4dfc11`
- active browser asset: `/assets/index-BvG4h9iY.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. The Admissions dashboard, access contract, code-health,
type, build, and responsive desktop/mobile browser checks pass. Signed-in
production verification loaded the active bundle, rendered both priority
schedules, and found zero County outreach headings or panels.

### Admissions briefing answer structure — 2026-10-01

The Admissions analyst answer is now a compact operational brief instead of a
long repeated paragraph. It opens with active and accepted counts, groups
scheduled accepted clients by date and destination, groups accepted clients
awaiting dates by destination, and closes with stage and workload rows. The
one-time typing treatment remains, while repeated destination phrases and
per-client `admission date not scheduled` language are removed.

- source PRs: `#104`, `#105`; final merge commit: `1d26171c8540127d8401a6cac4b2f289bf224ebf`
- ACR build: `cc53`
- image: `alamo-platform@sha256:2a6efee1864bfc90a37265b7135f4e663036b8260de62f2bbadccf0ed8dc4deb` (tag `admissions-briefing-answer-v2-1001`)
- active revision: `alamo-platform-prod-web--admissions-answer-v2-1001`
- rollback image: `alamo-platform@sha256:44c08e19e74e41085f718570ab2d85b14113b85db87a47d928b888fd86736608`
- active browser asset: `/assets/index-CF-5ZmKH.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression pass. Signed-in production
verification confirmed the concise lead, four scheduled groups, three
date-pending groups, two pipeline rows, and none of the retired repetitive
phrases.

### Admissions referral-source redesign — 2026-10-01

The Admissions briefing now treats referral origin as an operating flow rather
than a ranked leaderboard. Duplicate source organizations are consolidated,
the current seven days are compared with the previous seven, and each source
shows the communities receiving its referrals. Rankings, client-county labels,
and the redundant 14-day total have been removed. Referrals without a recorded
source are excluded from the source list and disclosed in a separate
data-quality footnote.

- source PR: `#107`; merge commit: `3197b5e0936ce7299c4a6088a066faad056ff793`
- ACR build: `cc54`
- image: `alamo-platform@sha256:fcc13d164c91f0e5085a819918d4d20864da8c7a6d3e0a82802651012913cfe8` (tag `admissions-referral-sources-1001`)
- active revision: `alamo-platform-prod-web--admissions-sources-1001`
- rollback image: `alamo-platform@sha256:2a6efee1864bfc90a37265b7135f4e663036b8260de62f2bbadccf0ed8dc4deb`
- active browser asset: `/assets/index-DMqDBptW.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression pass. Signed-in production
verification confirmed five active sources and seven referrals in the current
week, rendered eight grouped source rows on the first of three pages, excluded
unattributed pseudo-sources, and surfaced two current and six prior-week
unattributed referrals in the footnote.

### Compact Admissions executive briefing — 2026-10-01

The Admissions analyst update now uses the available page width instead of
stacking every section into one tall response. Its label and executive summary
share a compact header row on desktop, followed by scheduled admissions,
accepted clients awaiting dates, and pipeline context in three horizontal
columns. Mobile retains the same content in a tight stacked layout.

- source PR: `#109`; merge commit: `5236740444c0085f6a480aa3e82387ea00488e74`
- ACR build: `cc55`
- image: `alamo-platform@sha256:d7d5362579f044ae3a336a3abb8b95b330d5aad1e73ef0c0987bfbc4804fd2e2` (tag `admissions-compact-1001`)
- active revision: `alamo-platform-prod-web--admissions-compact-1001`
- rollback image: `alamo-platform@sha256:fcc13d164c91f0e5085a819918d4d20864da8c7a6d3e0a82802651012913cfe8`
- active browser asset: `/assets/index-DZlivcoP.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression all pass without mobile horizontal
overflow.

### Admissions community census simplification — 2026-10-01

The Admissions briefing no longer renders the Referral sources section. The
community census area now follows the Analytics row treatment: one concise row
per governed community with current census, upcoming admits this week, and new
referrals assigned to that community during the last seven days. The occupancy
bars and card grid were removed, while unassigned referral activity remains an
explicit footnote and missing event coverage remains a dash rather than zero.

- source PR: `#111`; merge commit: `674ad580e02d11f5f2942a711949b727ee6a1376`
- ACR build: `cc56`
- image: `alamo-platform@sha256:e37697566144bbad27d677a4a5002f590ca9f8efa4976bf55a9b95e2062a799b` (tag `admissions-community-census-1001`)
- active revision: `alamo-platform-prod-web--admissions-census-1001`
- rollback image: `alamo-platform@sha256:d7d5362579f044ae3a336a3abb8b95b330d5aad1e73ef0c0987bfbc4804fd2e2`
- active browser asset: `/assets/index-CRNhwUWD.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression pass. Desktop and mobile verification
confirmed five governed community rows, all three requested measures, no
Referral sources UI, and no horizontal overflow.

### Stale-shell recovery and Admissions briefing correction — 2026-10-02

The shared header no longer exposes Outreach on desktop or mobile; its
owner-only direct route remains available. The Admissions analyst update is a
single concise summary followed by three horizontal bullets for scheduled
admits, accepted clients awaiting dates, and pipeline status.

The service-worker cache advances to `alamo-static-v6`. When the new worker
replaces an older Alamo cache, it claims existing windows and navigates them to
their current URLs. This prevents an already-open platform or installed-app
window from remaining indefinitely on an older client shell after deployment.
Navigation HTML and `sw.js` remain served with no-store/no-cache policies.

- source PR: `#113`; merge commit: `44d255018dac50b05b97bc6e8cfa86a786f23c9f`
- ACR build: `cc57`
- image: `alamo-platform@sha256:2c1f28a4dd34be9e33cb24f7a4008407edafd330b6e8cae717862e6bc45a5cf6` (tag `platform-shell-refresh-1002`)
- active revision: `alamo-platform-prod-web--shell-refresh-1002`
- rollback image: `alamo-platform@sha256:e37697566144bbad27d677a4a5002f590ca9f8efa4976bf55a9b95e2062a799b`
- active browser asset: `/assets/index-BsetnkgM.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, desktop-readiness,
platform-knowledge, documentation, build, and responsive Admissions browser
checks pass. The exact signed-in Chrome tab that had displayed the older shell
was reloaded and verified against the active asset: Outreach, County outreach,
and referral sources were absent; Community census rendered five rows; and all
three concise analyst bullets shared one horizontal row.

### Admissions community snapshot clarification — 2026-10-02

The Admissions briefing now moves directly from the analyst update into the
community operating data. The redundant Weekly operating brief title and date
strip are removed, Community census is renamed Community snapshot, and its
description now identifies the three measures shown by community. The analyst
lead is also easier to scan: active, accepted, scheduled, and date-pending
counts appear as four concise facts, while every accepted client remains tied
to a destination community in the detail bullets.

- source PR: `#115`; merge commit: `608f386d914c154c1be929558fc3e3f409ae47a2`
- ACR build: `cc58`
- image: `alamo-platform@sha256:ea6cb6b934c7c9f1e677781b19ae80e030e3376a0bf6a10ab20eafc4ee051a69` (tag `admissions-snapshot-1002`)
- active revision: `alamo-platform-prod-web--admissions-snapshot-1002`
- rollback image: `alamo-platform@sha256:2c1f28a4dd34be9e33cb24f7a4008407edafd330b6e8cae717862e6bc45a5cf6`
- active browser asset: `/assets/index-FezJ1hoL.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression pass. Signed-in production
verification confirmed the new heading and concise analyst copy, the removed
weekly framing, five governed community rows, and no Outreach navigation.

### Structured Admissions executive briefing — 2026-10-02

The Admissions analyst panel no longer compresses scheduled clients,
date-pending clients, and pipeline context into three paragraph-length bullets.
Scheduled move-ins now render as dated rows, accepted clients awaiting dates
have a separate readable list, and pipeline stage counts and community load
occupy their own section. The four-number executive lead remains at the top.

- source PR: `#117`; merge commit: `68a177f38a20ba112371e82e34f4abfb6a813053`
- ACR build: `cc59`
- image: `alamo-platform@sha256:f16e3ccd11af40ccc44fbceb40ae89dc4d65b6c04ea963ae7ccf5e264a0f67a0` (tag `admissions-briefing-layout-1002`)
- active revision: `alamo-platform-prod-web--admissions-layout-1002`
- rollback image: `alamo-platform@sha256:ea6cb6b934c7c9f1e677781b19ae80e030e3376a0bf6a10ab20eafc4ee051a69`
- active browser asset: `/assets/index-Cbci_OP4.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, production build, and the responsive
Admissions browser regression pass. Signed-in production verification
confirmed five scheduled rows, three date-pending rows, two pipeline rows,
the Community snapshot heading, and the absence of the retired weekly title.

### Conversational Admissions briefing and drill-downs — 2026-10-02

The Admissions analyst lead now speaks as a short operating narrative instead
of restating the dashboard in labeled columns. The detailed evidence below is
organized into a combined Admissions movement timeline, an accepted-client
scheduling queue, expandable community rows, and a collapsed action-only
attention queue. Community and client rows open the existing management chart
without duplicating the Pipeline board.

- source PRs: `#119`, `#120`; merge commits: `a9e2d12ec6cddb64efb70047c14800a5ba80cc1c`, `f5ec62572d7edd81b065a06b00eb39888ad64c27`
- ACR build: `cc5b`
- image: `alamo-platform@sha256:6ebdeb79917737eface8f2d5fea84cc00c994c076fdbf0b37e76dc2fadc7cb33` (tag `admissions-drilldown-compact-1002`)
- active revision: `alamo-platform-prod-web--admissions-compact-drill-1002`
- rollback image: `alamo-platform@sha256:8af1e3c8a8826a9dcefffef53ae74ff29fae2c487572e092171d7828341cda0b`
- active browser asset: `/assets/index-B8FKlbJZ.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression pass. Signed-in production
verification confirmed five scheduled movement rows, five accepted clients
awaiting dates, five expandable community rows, a collapsed attention queue,
and successful management-chart opening from a community drill-down.

### Readable conversational Admissions update — 2026-10-02

The Admissions analyst update now renders each movement as its own short line
instead of joining client groups with semicolons. Client names retain the
strong reading hierarchy, destination community names use a consistent bold
Alamo-green treatment, and workload and stage context are split into plain
sentences. The release wrapper is also repeatable against a production image
that already contains the dedicated `/chat` and `/admissions` entry patch.

- source PRs: `#122`, `#123`; merge commits: `159db0167a8065095c832d821babccebbd0783f5`, `34146e851136d8527bfa5be3a8b6c07d7abab836`
- ACR build: `cc5d`
- image: `alamo-platform@sha256:af126b3ffa343c76d4f4fbd9b373927a470ad8e68ed11560de71254cafe59c7e` (tag `admissions-readable-chat-1002`)
- active revision: `alamo-platform-prod-web--admissions-readable-1002`
- rollback image: `alamo-platform@sha256:6ebdeb79917737eface8f2d5fea84cc00c994c076fdbf0b37e76dc2fadc7cb33`
- active browser asset: `/assets/index-DVGG8n2l.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression pass. Signed-in production
verification confirmed seven concise answer lines, zero semicolons, bold
client names, five bold green community references, and the active release
asset.

### Admissions response header removal — 2026-10-02

The decorative analyst avatar and `Admissions analyst` role label have been
removed from the Admissions briefing. The response now starts directly with
the governed summary, preserving its one-time typing treatment and the
line-by-line details beneath it.

- source PR: `#125`; merge commit: `607a691862b4b55906aac8e1f5f8973678f92a07`
- ACR build: `cc5e`
- image: `alamo-platform@sha256:d60363b738d94b056a71e65ed41d3a7c6fa085a97b07892802dc39e07899469c` (tag `admissions-no-analyst-label-1002`)
- active revision: `alamo-platform-prod-web--admissions-no-label-1002`
- rollback image: `alamo-platform@sha256:af126b3ffa343c76d4f4fbd9b373927a470ad8e68ed11560de71254cafe59c7e`
- active browser asset: `/assets/index-CFFuXwmo.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression pass. Signed-in production
verification confirmed the summary begins the panel and both retired header
elements are absent.

### Date-aware Admissions briefing — 2026-10-02

Forward-looking Admissions surfaces now use the current Los Angeles calendar
date. Past planned dates are excluded from the analyst schedule, Admissions
movement list, community upcoming-admit counts, and community activity
drill-downs. Same-day records read as `Today`; accepted records that still
carry a past planned date are reported separately as requiring move-in outcome
confirmation.

- source PR: `#127`; merge commit: `76bc64b409b74ece8f0a2c4a967a376faee68f57`
- ACR build: `cc5f`
- image: `alamo-platform@sha256:f2f747f38910a126a27e1b69d906db008b3519ab1a97d520add5c0a84ded7a32` (tag `admissions-date-aware-1002`)
- active revision: `alamo-platform-prod-web--admissions-date-aware-1002`
- rollback image: `alamo-platform@sha256:d60363b738d94b056a71e65ed41d3a7c6fa085a97b07892802dc39e07899469c`
- active browser asset: `/assets/index-DvvW6n9g.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. The responsive Admissions browser regression,
admissions-dashboard contract check, TypeScript, code-health, and production
build all pass. Signed-in production verification on October 2 confirmed only
October 2 and later dates in the forward schedule, two current calendar rows,
three past-dated accepted records in the explicit confirmation line, and zero
October 1 rows in the movement list.

### Natural-language Admissions briefing — 2026-10-02

The Admissions briefing now reads as four concise paragraphs instead of a
generated checklist. Same-day move-ins share one grammatical sentence, the
next scheduled movement and later calendar activity are summarized together,
accepted-client follow-up is consolidated, and workload and pipeline context
appear in one closing paragraph. Repetitive `Also` openings have been removed.

- source PR: `#129`; merge commit: `ad59ee20e807a9531318fc50cab277c6dc892492`
- ACR build: `cc5g`
- image: `alamo-platform@sha256:5f1a6a28cc4a0bd9c67c9fafe6e4ef2ce41cde673ee610e2357974b870e896de` (tag `admissions-prose-1002`)
- active revision: `alamo-platform-prod-web--admissions-prose-1002`
- rollback image: `alamo-platform@sha256:f2f747f38910a126a27e1b69d906db008b3519ab1a97d520add5c0a84ded7a32`
- active browser asset: `/assets/index-Be3GIeKZ.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. TypeScript, code-health, production build, and the
responsive Admissions browser regression pass. Signed-in production
verification confirmed the four-paragraph briefing, consolidated current and
future movement sentences, current date handling, and no use of `Also`.

### Automatic stale-client recovery — 2026-10-04

An already-open signed-in Admissions tab was observed still rendering the old
briefing even though Azure was running the newer image. Reloading that exact
tab immediately adopted the current bundle, proving that the deployment was
healthy but the long-lived SPA client had not rechecked the release entry
point. Azure revision health alone was therefore insufficient verification.

The shared browser runtime now compares its loaded content-hashed JavaScript
entry point with the current no-store production entry document at startup,
on focus, visibility, and reconnect events, and once per minute while visible.
It reloads the current URL once when those paths differ. The service-worker
cache generation advances from v6 to v7, and the behavior remains independent
of service-worker availability.

- source PR: `#131`; merge commit: `f667ee836aff8dbbe0743d231ac7791ef84e09de`
- ACR build: `cc5h`
- image: `alamo-platform@sha256:f1053d5a693c9fdd7284c20709db67cc6bc2b9777238d655e43876adf50713d5` (tag `stale-client-refresh-1004`)
- active revision: `alamo-platform-prod-web--stale-refresh-1004`
- rollback image: `alamo-platform@sha256:5f1a6a28cc4a0bd9c67c9fafe6e4ef2ce41cde673ee610e2357974b870e896de`
- active browser asset: `/assets/index-DcWGrpE5.js`

The revision is Healthy/Running at 100% traffic and the public production
smoke suite passes 4/4. Identity, gzip, and Brotli production HTML all point to
the same active browser asset, `/sw.js` serves cache generation v7, and a
controlled browser test confirmed that a simulated newer entry bundle causes
the current client URL to reload automatically. Desktop readiness, TypeScript,
code health, the Admissions dashboard contract, documentation, production
build, and compression reconciliation checks pass.

### Admissions executive dashboard scale — 2026-10-04

The Admissions briefing now reads as an executive dashboard rather than one
long operating report. The briefing prose, movement detail, community metrics,
and management-chart drilldowns remain intact, while the operating content is
split into large in-place Movement, Communities, and Attention views. Type,
spacing, event rows, census measures, and phone touch targets are enlarged so
each view has one clear focal point on desktop and mobile.

- source PR: `#133`; merge commit: `b8262dd4af9b46fb93b9331108ae6cfaf1af7a21`
- ACR build: `cc5j`
- image: `alamo-platform@sha256:c20f762a6300f148e194c17e2afd007965109b8e947c29d70035363e4cb1e050` (tag `admissions-dashboard-scale-1004`)
- active revision: `alamo-platform-prod-web--admissions-scale-1004`
- rollback image: `alamo-platform@sha256:f1053d5a693c9fdd7284c20709db67cc6bc2b9777238d655e43876adf50713d5`
- active browser asset: `/assets/index-BQhaYp01.js`

The revision is Healthy/Running at 100% traffic. The production browser asset
matches the reviewed local build byte-for-byte through identity, gzip, and
Brotli delivery; the anonymous API health probe remains fail-closed with 401.
TypeScript, code health, the Admissions dashboard contract, production build,
and responsive browser regression all pass. The browser regression now covers
dashboard view switching, community drilldowns, minimum type scale, and
phone-width horizontal overflow.

### Admissions dashboard color system — 2026-10-04

The enlarged Admissions dashboard now uses restrained color to identify its
operating views without adding solid brand-green panels. Movement uses soft
blue, Communities uses pale sage, and Attention retains warm amber. The page
canvas is a warm neutral; the analyst update uses a subtle multi-tone wash;
community activity measures use quiet blue and sand treatments. All colors are
secondary to the existing type hierarchy and governed content.

- source PR: `#135`; merge commit: `66bbd241fabb4dfefdd302e0fe9c7f932c0a9dd0`
- ACR build: `cc5k`
- image: `alamo-platform@sha256:e74af55f1404e75a10fedd0d1e27d7bc2fee12750ac76af6742ec60d879d7864` (tag `admissions-dashboard-color-1004`)
- active revision: `alamo-platform-prod-web--admissions-color-1004`
- rollback image: `alamo-platform@sha256:c20f762a6300f148e194c17e2afd007965109b8e947c29d70035363e4cb1e050`
- active browser asset: `/assets/index-CtEBLCrX.js`

The revision is Healthy/Running at 100% traffic. Production identity, gzip,
and Brotli responses reconcile byte-for-byte with the reviewed local build,
and the anonymous API health probe remains fail-closed with 401. TypeScript,
code health, the Admissions dashboard contract, production build, and desktop
and phone browser regression all pass.

### Admissions movement coordination view — 2026-10-04

The Admissions Movement view now explains what management should coordinate
instead of rendering a plain event list. It leads with a current operating
takeaway, adds a textured seven-day activity lane, preserves exact scheduled
assessment and move-in drilldowns, and keeps accepted clients without dates in
a separate scheduling queue. A clear calendar, a missing Pipeline board, and
missing schedule coverage now render as distinct states; unavailable coverage
is never presented as zero activity.

- source PR: `#137`; merge commit: `9ef94e34bbd28debd5b8b2082666ed71268855ff`
- ACR build: `cc5m`
- image: `alamo-platform@sha256:bd7bc3a1307e910caf9180bee34a4283d5976d65a0b5a790e0ce808f0b3e9bdc` (tag `admissions-movement-1004`)
- active revision: `alamo-platform-prod-web--admissions-movement-1004`
- rollback image: `alamo-platform@sha256:e74af55f1404e75a10fedd0d1e27d7bc2fee12750ac76af6742ec60d879d7864`
- active browser asset: `/assets/index-O9DL_NSF.js`

The revision is Healthy/Running at 100% traffic. Production identity, gzip,
and Brotli responses reconcile byte-for-byte with the reviewed local build,
and the anonymous API health probe remains fail-closed with 401. TypeScript,
code health, the Admissions dashboard contract, production build, desktop and
phone visual QA, and responsive browser regression all pass.

### Admissions component texture system — 2026-10-04

Movement, Communities, and Attention now retain the same executive typography
and layout system while using distinct visual materials. Movement uses a blue
planning-board edge, calendar dots, and blueprint motifs. Communities uses an
organic sage edge, circular forms, and a dotted operational drilldown.
Attention uses a warm amber edge and quiet diagonal paper texture. These are
restrained orientation cues, not solid brand-color panels.

- source PR: `#139`; merge commit: `e3ba356c2c6b09f27dda996cc4d738b8cda58982`
- ACR build: `cc5n`
- image: `alamo-platform@sha256:491914f11cf57f1e5d7263e5a750a6d2b81632132438905335b32ef707dbbe79` (tag `admissions-texture-1004`)
- active revision: `alamo-platform-prod-web--admissions-texture-1004`
- rollback image: `alamo-platform@sha256:bd7bc3a1307e910caf9180bee34a4283d5976d65a0b5a790e0ce808f0b3e9bdc`
- active browser asset: `/assets/index-CMjZqqyL.js`

The revision is Healthy/Running at 100% traffic. Production identity, gzip,
and Brotli responses reconcile byte-for-byte with the reviewed local build,
and the anonymous API health probe remains fail-closed with 401. TypeScript,
code health, the Admissions dashboard contract, production build, desktop and
phone visual QA, and responsive browser regression all pass.

### Grounded Admissions schedule and open fields — 2026-10-04

The abstract Movement view is replaced by a literal Schedule with separate
lanes for upcoming assessments, planned move-ins, and accepted clients that do
not yet have a date. The Schedule view is omitted when it has no actual work,
so an empty decorative component does not displace the Community snapshot.
The editorial Attention view is replaced by Open fields, which states only
unresolved record fields already present in Pipeline and preserves Pipeline
order. It does not calculate or display an inferred priority score.

- source PR: `#141`; merge commit: `56895afb5ec97f76cbb99f15289cfedf693cd7ee`
- ACR build: `cc5p`
- image: `alamo-platform@sha256:dfa3deb18404d8acc6a2d52f77eb34dd32e86f4e7619636b3dc02f1f1c30e841` (tag `admissions-schedule-grounding-1004`)
- active revision: `alamo-platform-prod-web--admissions-grounding-1004`
- rollback image: `alamo-platform@sha256:491914f11cf57f1e5d7263e5a750a6d2b81632132438905335b32ef707dbbe79`
- active browser assets: `/assets/index-lUhAbQEM.js` and `/assets/index-DES-ycMx.css`

The revision is Healthy/Running at 100% traffic. Production identity, gzip,
and Brotli responses reconcile byte-for-byte with the reviewed local build,
and the anonymous API health probe remains fail-closed with 401 and `no-store`.
TypeScript, documentation, code health, the Admissions dashboard contract,
production build, desktop and phone visual QA, and responsive browser
regression all pass. The broader analyst suite reaches the repository's
pre-existing `check:unused` package-metadata warning and stops there.

### Admissions Briefing default and deep-link refresh — 2026-10-04

`/admissions` now opens on Briefing without a query string. Pipeline remains
available through the explicit, reload-safe `?view=pipeline` URL. The frontend
build also refreshes the physical `/admissions/index.html` and
`/chat/index.html` route entries so a direct deep link cannot retain an older
browser bundle from a previous overlay.

- source PRs: `#143` and `#144`; merge commits: `ae2ad5b98b8931bb4780ec2e5a917fb7c839b8fc` and `99c2657a47806e47e4681aa1e91a1d26fd1b83c7`
- ACR build: `cc5r`
- image: `alamo-platform@sha256:bb99f444ce0025f71a08f9895d9ff52df92b9cde8dfd153a1312df050c7d8b9f` (tag `briefing-route-refresh-1004`)
- active revision: `alamo-platform-prod-web--briefing-route-1004`
- rollback image: `alamo-platform@sha256:dfa3deb18404d8acc6a2d52f77eb34dd32e86f4e7619636b3dc02f1f1c30e841`
- active browser assets: `/assets/index-BvasIC3Z.js` and `/assets/index-DES-ycMx.css`
- superseded intermediate image: `alamo-platform@sha256:c701319930edc7df7492756a056d6d5181206a3eccb15ade48036bf01c64063d`; do not use it for rollback because its direct nested route entries are stale

The final revision is Healthy/Running at 100% traffic. Direct requests to `/`,
`/admissions`, and `/chat` all identify the same active JavaScript and CSS.
Production identity, gzip, and Brotli responses reconcile byte-for-byte with
the reviewed local build, and the anonymous API health probe remains
fail-closed with 401 and `no-store`. TypeScript, source syntax, documentation,
code health, Admissions access and dashboard contracts, production build, and
responsive Admissions browser regression all pass.

### Admissions move-in schedule reconciliation — 2026-10-04

The Admissions executive update, Schedule move-in lane, Community snapshot
counts, and Community drilldowns now use one canonical accepted-client move-in
schedule. The current Pipeline board determines which accepted clients have a
current or future planned admission; covered briefing rows can enrich those
records with readiness details but cannot remove a move-in named in the
executive update. When the Pipeline board is unavailable, the page falls back
only to a covered briefing slice rather than implying complete data.

- source PR: `#146`; merge commit: `38c04690cdfaa3ba754532d006c099eb69ae82d5`
- ACR build: `cc5s`
- image: `alamo-platform@sha256:31b1ac20f887ede11d8505c09f7bb2d6924e426777d96209901b44d594f40f70` (tag `admissions-schedule-reconcile-1004`)
- active revision: `alamo-platform-prod-web--schedule-reconcile-1004`
- rollback image: `alamo-platform@sha256:bb99f444ce0025f71a08f9895d9ff52df92b9cde8dfd153a1312df050c7d8b9f`
- active browser assets: `/assets/index-DRAFD-5n.js` and `/assets/index-DES-ycMx.css`

The revision is Healthy/Running at 100% traffic. Direct requests to `/`,
`/admissions`, and `/chat` identify the same active JavaScript and CSS.
Production identity, gzip, and Brotli responses reconcile byte-for-byte with
the reviewed build, and the anonymous API health probe remains fail-closed
with 401 and `no-store`. TypeScript, source syntax, documentation, code health,
the Admissions dashboard contract, production build, and responsive
Admissions browser regression pass. A dedicated regression also proves that a
future accepted Pipeline move-in remains present across the executive update
and detailed dashboard even when the week-bounded briefing slice omits it.
