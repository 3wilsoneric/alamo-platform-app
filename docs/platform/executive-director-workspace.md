# Executive Director Workspace

- purpose: define the facility-scoped Executive Director dashboard and licensing-report intake workflow
- status: active implementation plan and security contract
- owners: product, operations, engineering, compliance
- updated: 2026-10-17
- tags: executive-director, licensing, intake, ocr, role-access, azure
- labels: platform-handbook, implementation-plan, security-boundary
- related files:
  - [App.tsx](../../src/app/App.tsx)
  - [ProtectedAppShell.tsx](../../src/shared/layout/ProtectedAppShell.tsx)
  - [executive-director-access.mjs](../../shared/executive-director-access.mjs)
  - [executive-director-api.mjs](../../server/executive-director-api.mjs)

## Product decision

Executive Directors receive a separate, deliberately small community context app. It opens on the
facility dashboard at `/executive/dashboard`, with **Licensing** at
`/executive/licensing`. It is not another item in the general Platform navigation. An
Executive Director identity is assigned to one or more communities by Entra
application role, lands directly in this workspace, and cannot use general
Platform APIs or routes.

The dashboard carries the selected community's governed census, incidents,
medication performance, and facility-filtered Admissions activity. Licensing
intake remains the primary workflow: the user uploads the original
scan, sees that it was received, and follows its processing state. The source
document is retained privately and its SHA-256 checksum is recorded. Uploading
does not publish the report, populate the existing Licensing library, or mark
anything filed.

The dashboard is a repeat-use operating surface, not an introductory report.
Its header is limited to the community, reporting period, and refresh time.
Current census and administrations given are the first overview components;
client incident triage follows below them, without a separate KPI strip.
Impending admissions arrive through the New client notification. Each area
opens its facility-scoped detail workspace when the user needs history or
record detail. The Alamo logo remains unchanged; domain accents distinguish
the underlying records, while referral badges remain reserved for meaningful
client status.

Dashboard drill-downs stay facility-scoped and open in one switchable workspace.
They expose the underlying governed records directly without repeating a KPI
strip: census periods, client-first incident history, medication
administration totals, or impending admissions. The incident dashboard card
shows linked clients with recent recorded signals, not a category leaderboard.
The incident workspace starts with a searchable client list ordered by the
latest record's provisional derived priority and date. Selecting a client
opens their exact-ID history; All incidents remains a secondary searchable
register. Unlinked records remain in All incidents instead of merging people
by name. Live client summaries use the authorized facility source; when only a
published snapshot is available, the UI explicitly labels coverage partial.
These recorded signals are not an open-task queue or clinical severity grade.
The executive admissions view
does not reproduce the referral board or assessment workflow: it shows only
clients accepted or otherwise moving toward admission, their scheduled or
missing admission date, readiness, and a concise profile. Each client continues
into the existing meet-the-client management chart.

## Access model

The browser and API use the same facility role mapping:

| Community | Facility ID | Entra application role |
| --- | --- | --- |
| San Pablo | 337 | `Alamo.ExecutiveDirector.SanPablo` |
| Victoria's House | 342 | `Alamo.ExecutiveDirector.VictoriasHouse` |
| JC Wallace House | 343 | `Alamo.ExecutiveDirector.JCWallace` |
| Turlock | 344 | `Alamo.ExecutiveDirector.Turlock` |
| Santa Clarita | 345 | `Alamo.ExecutiveDirector.SantaClarita` |

The API derives allowed facilities from token claims. A facility identifier
sent by the browser is never accepted as authority. The verified Platform
owner may open the route for product review, but this does not weaken the
Executive Director role boundary.

The incident register's year, type, category, date, and derived-priority
filters run server-side against that authorized facility. Its provisional
priority is not an official severity grade: High requires a recorded sentinel
event or emergency-services notification, Medium a recorded injury, Low three
explicit No values, and Unknown covers missing flags. The portfolio-wide
`/incidents/history` route and API remain unavailable to Executive Director-only
identities. Live history is complete for the connected incident source; if it
fails, the published snapshot is shown as partial with separate available and
aggregate counts. LIC 624 uploads are not incident records until separately
reviewed and linked in a future workflow.

## Native reports

**New LIC 624** in Reports opens the existing digital form without uploading a
file. It creates a facility-scoped draft with only the known community name and
city/state filled in. Staff enter the report, save incomplete drafts, reopen
them from Reports (including the Drafts filter), and mark reviewed only after
the existing required-field checks pass. The folder, five-section editor,
navigation, dirty-change guards, and review controls remain the same.

Native records have `origin: native` and `draft` status, no uploaded original,
no extraction result, and no fabricated file/checksum. The private creation
record is immutable; draft saves and confirmations use the existing versioned
review audit. A retried creation ID recovers the same report, including after
an interrupted manifest/catalog write, without replacing later edits. Local
review writes serialize per report; Azure writes retain ETag concurrency checks.
Changing a reviewed native report returns it to Draft until reviewed again.

Native entry and review deployed on October 13 as
`alamo-platform-prod-web--lic624-native-1013`. This does not add official-PDF
generation, incident creation/linking, automatic filing, OCR, or mail intake.

October 13 verification passed the native persistence/API checks and a browser
walkthrough against the real local API using disposable synthetic records:
creation, retry after a lost response, draft save, reload/reopen, canceled
replacement of unsaved work, confirmation, and 1440/390/320px layouts. Existing
upload/review browser checks also passed at 320–1440px and 200%-equivalent zoom.
Documentation, both TypeScript checks, the full analyst suite using the
maintained local snapshot, and the production build passed. All 27 predeployment
stages passed, followed by healthy production and 4/4 smoke probes. A signed-in
live check created a blank San Pablo report, saved revision 1 to Azure, reloaded,
filtered Drafts, and reopened the saved form. Review confirmation remained
disabled for the incomplete report. The blank draft is available for the demo.
The formal automated signed-in suite still requires a saved Playwright session.

## Upload workflow

1. **Receive:** accept a single PDF, JPG, or PNG up to 20 MB.
2. **Preserve:** validate the signature, calculate a checksum, store the exact
   source in the private Azure container, and write an audit manifest.
3. **Extract:** strip fillable LIC 624 PDF fields into the versioned logical
   record. Send flattened PDFs, JPGs, and PNGs through Azure Document
   Intelligence layout/key-value OCR, then map recognized values into the same
   review record. A scan that cannot be read remains visibly `ocr_required`.
4. **Review:** open a digital LIC 624 immediately after fillable-PDF extraction,
   or reopen it from the queue. The reviewer checks every section, edits the
   structured draft, saves versioned changes, and may confirm only when the
   required-field check passes. The uploaded original remains unchanged.
5. **Sort:** classify the approved draft using the agreed report type, date,
   control number, community, findings, plan-of-correction, and follow-up rules.
6. **File:** an authorized person confirms the record before it enters the
   maintained Licensing library or triggers downstream work.

The LIC 624 Rev. 4/99 form is now mapped into facility, people involved,
incident, treatment/follow-up, approval, and notification sections. Fillable
PDFs and successfully read scans reach `needs_review`. OCR never confirms or
files a report. Failed scans retain their original and can be retried or
transcribed manually with an explicit non-OCR method.

The LIC 624 is a state-defined form, not a Platform incident taxonomy. Its
field names, incident-type choices, extracted values, and uploaded original
must remain verbatim before and during intake. The Platform may show a separate
friendly incident data label *after* intake (for example, “Passed on meds” for
an incident source category of “Medication Refusal” or “Difficult interaction”
for “Aggressive Behavior”), but that label is presentation-only. Keep the raw
category, LIC 624 selection, source document, and review audit available for
provenance and filing. Do not infer a new incident category from free-text LIC
624 narratives, and do not count an uploaded LIC 624 as an incident until the
separate record-linking workflow exists.

## Current implementation slice

- facility-scoped Entra role contract
- forced Executive Director dashboard landing route and minimal Community/Licensing header
- community dashboard with governed census, incidents, medication performance,
  and facility-filtered referral, assessment, and move-in activity
- private scanned-report upload with type, size, signature, checksum, identity,
  facility, and timestamp metadata
- direct LIC 624 AcroForm extraction and managed-identity Azure Document
  Intelligence scan extraction into private structured drafts
- Pipeline-style digital LIC 624 review with editable facility, people,
  incident, treatment, notification, supervisor, and signature sections
- explicit edited-field cues, missing-required-field checks, draft saving,
  optimistic concurrency protection, and human confirmation
- immutable source extraction plus versioned review audit records
- recent-submission queue with extraction method, populated-field count, and honest processing status
- Azure Blob persistence in production and ignored local persistence for development
- one private facility catalog per community, updated with ETag preconditions so concurrent uploads and reviews do not overwrite one another
- direct catalog-backed submission lookup instead of rescanning every full extraction manifest
- complete facility-level queue counts plus cursor pagination, status filtering, and filename search for queues that grow beyond the recent 25 reports
- authenticated original-file retrieval through the API; no blob URL or storage path is exposed to the browser, and every retrieval rechecks the stored SHA-256 checksum
- automatic catalog creation from existing stored manifests, preserving compatibility with reports uploaded before the catalog existed

The production persistence model is designed for a small group of concurrent
facility users and hundreds to thousands of reports over time. Each source
file remains immutable under its facility/year/submission path. The catalog
contains only bounded queue metadata and storage references; extracted form
content remains in the private per-submission manifest. Review changes still
produce append-only audit records and use the manifest ETag plus the logical
review revision to reject stale edits.

## Scanned imports and incoming reports: implementation plan

Continue the existing Licensing workspace and digital LIC 624. The historical
backfill consists of existing scanned reports, not forms generated from incident
counts. Ongoing uploads and future scan-to-email attachments must converge on
the same intake, review, and original-document contracts. An incident count is
not a confirmed inventory of available LIC 624 documents.

### 1. Safe batch intake — deployed upload/review milestone

#### Five-director operating readiness (October 19)

The October 20 scan-review audit is live as revision
`alamo-platform-prod-web--lic624-audit-1019` (digest
`sha256:41f46c5c9c8f149aedfec48409e95181bb2312aef141aa4a344d4ce320fa0468`).
It fixes a false extracted-field count, retains up to four OCR-recognized
people involved, keeps low-confidence OCR text in private evidence, and sends
fillable PDFs with only unrelated fields through OCR. A partially readable
AcroForm keeps its recognized fields if OCR is unavailable. Synthetic
regressions and the production smoke/access checks passed; the platform-wide
analyst gate still fails on an unrelated older resident-ranking fixture.
Director sign-in is still gated on the deferred Entra app-role assignments.

The immediate target is five Executive Directors uploading ten existing LIC 624
files apiece. A synthetic, network-disabled test now runs 50 distinct fillable
PDFs concurrently through the same local intake persistence path, ten in each
facility. It verifies source bytes, durable catalog counts, retry deduplication,
and cross-facility denial. This is a load/isolation check, not proof that five
people can sign in or that scanned forms are extracted in production.

The 100 user-approved synthetic San Pablo examples remain in private production
storage for demonstrations. Their verified seed identity is recorded in the
catalog as `demo: true`; the Licensing queue defaults to **Live reports**, with
an explicit **Demo reports** view. A real upload cannot become a demo merely by
using a similar filename. The one-time catalog projection update has a private
recoverable backup; immutable originals, manifests, reviews, and receipts are
unchanged. Using the running production app's managed identity, the other four
facilities' empty private catalogs were created and read back as zero reports;
this verifies the current runtime's storage write/read path for those scopes,
without adding synthetic reports to their live queues. Never count demo reports
as operational work.

October 19 OCR/readiness release: Azure Container App revision
`alamo-platform-prod-web--lic624ocr-1019` uses image digest
`sha256:0ebaee1e9621c91ac5335ceb55a9db07f910d9cdd2a77a1eecf0d5a876b2b596`,
overlaid on preceding digest
`sha256:eb5337a19c9ea124a57b9d9b46731dd3dbd04f7dfbf8943bbdf0b497e3f2db8f`.
The existing Document Intelligence resource has a resource-scoped
`Cognitive Services User` assignment for the Platform runtime identity;
`AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT` points to `alamo-docreader`. A live
production-runtime read of a synthetic flattened two-page scan returned
`document_intelligence`, `needs_review`, two pages, 19 recognized fields,
and the expected synthetic facility, resident, narrative, action, and reviewer.
The temporary private QA blob was deleted after verification. The revision was
Healthy with 100% traffic; production smoke passed 4/4, unauthorized report
list/retry probes returned 401, and the live queue showed 0 reports in all
five communities while San Pablo's demo view showed exactly 100. Focused
OCR, batch, Executive Director, browser/mobile, docs, type, and build checks
passed. The platform-wide analyst suite still fails on an unrelated
hard-coded resident-ranking expectation against newer live data. No Entra
Director roles, incoming mailbox, historical import, automatic filing, or
separate transactional database were activated by this release.

Tomorrow's sign-in gate remains explicit: register the five existing
`Alamo.ExecutiveDirector.*` application roles in Microsoft Entra, assign one
appropriate role to each director, refresh their tokens, and verify each account
can upload and review only its assigned facility. The registration currently
has no director roles, so do **not** describe five-person production access as
ready before that check. The Platform owner exception is not a substitute.

Fillable PDFs extract fields for review. Flattened PDFs, JPGs, and PNGs now
use the existing `alamo-docreader` service's prebuilt layout/key-value model
through the Platform managed identity. A flattened two-page synthetic LIC 624
pilot yielded the facility, resident, incident choice, narrative, immediate
action, treatment, and sign-off values in the digital review form. OCR text,
recognized pairs, confidence, and page references stay with the private
source manifest; the unchanged original remains available beside the draft.
Staff must compare every field before confirmation. Failed scans retain
`ocr_required`, allow a guarded OCR retry, and still permit clearly labeled
manual transcription. Mailbox intake, bulk historical import, automatic
filing, and a transactional database remain off.

Deployed October 9: up to 100 selected files, sequential upload, per-file
receipts, failed-file retry, and facility-scoped exact-byte duplicate protection.
The single-file editable form remains the same. On October 9 the user selected
deployment of upload/review only; the database, scanned OCR, and incoming mail
remain deferred and unconnected.

- Extend the existing upload view to accept a bounded batch of files, retain
  per-file results, and retry failed files without re-uploading successful ones.
  Keep one-file review convenient and preserve the existing form and styling.
- Scope exact-byte SHA-256 duplicate detection to the authorized facility.
  Concurrent deliveries reserve one durable receipt and converge on the same
  original submission; retries must not reset a reviewed form or its audit.
- Recover an interrupted source/manifest/catalog write through the receipt.
  Adopt matching legacy submissions without rewriting originals or reviews.
- Keep PDF/JPG/PNG validation and the 20 MB per-file limit. Do not infer that
  identical names mean identical documents, or that different scans of the
  same report are exact duplicates.
- Only server-acknowledged files are durable. Pending browser files remain in
  memory, are not stored in localStorage/IndexedDB, and need reselection after
  leaving the page. This is not an autonomous background OCR queue.
- This October 9 milestone predated OCR activation. No automatic filing,
  incident creation, or incoming mail is included in the later OCR release.

Acceptance: mixed batches, one-file review, exact duplicates, same-file
concurrency, different-community isolation, failed-file retry, interrupted-write
recovery, unchanged reviewed drafts, legacy reports, and 320/390/1440px layouts.

Local verification on October 9 passed synthetic persistence/recovery checks,
fixture-only browser upload/review tests, mobile layouts, TypeScript checks,
documentation checks, and the production build. No real reports were uploaded
and the Azure write path was not exercised. The full platform-wide gate is not
green: current Azure data and the maintained June fixture disagree with
different analyst tests' fixed date expectations, and the June fixture lacks
monthly medication-refusal detail. The unchanged AWOL-since-May Azure analyst
path also returned a safe refusal with no artifact, not just a date-assertion
mismatch. Do not report these as passed checks.

For this release only, the user explicitly authorized a limited deployment on
October 9 using focused upload/review, mobile, access-control, production-build,
and live verification, with rollback if those checks fail. This exception does
not relax later release gates or authorize unrelated analyst runtime changes.
At that release, database provisioning, OCR, incoming mail, and outbound
notifications remained off. The subsequent OCR setup is documented above.

### 2. Durable processing and the large report index

Before the historical import, replace whole-facility catalog rewrites with an
indexed transactional metadata store in the existing Alamo Azure boundary;
Azure-hosted Postgres is the proposed target, subject to the deployment review.
Keep immutable originals and extraction artifacts in private Blob storage.
The current 8 MiB catalog is not the 20,000-report production architecture.

Model source documents, delivery receipts, submissions, processing jobs,
extraction versions, review revisions, and proposed incident links separately.
A delivery is not another incident. Jobs need durable leases, bounded retries,
idempotent completion, abandoned-work recovery, and a visible failed-job queue.
Use an outbox/receipt handoff so storing a file and scheduling its work cannot
silently diverge. Backfill work and new daily arrivals must have separate
concurrency budgets so the historical import does not block current reports.

Migrate existing catalog metadata without moving original files or rewriting
review history. Validate counts and source checksums, retain a rollback path,
and switch reads only after reconciliation. Load-test at least 25,000 synthetic
reports, including a heavily skewed single-community collection, multi-user
writes, pagination/search, worker restarts, duplicate delivery, and recovery.

### 3. Scanned extraction and reviewed incident matching

Pilot representative scans before a full backfill: typed and handwritten
forms, rotated/low-quality pages, attachments, and PDFs containing several
reports. Preserve page order and page-to-report provenance; uncertain document
boundaries require review rather than silently merging or splitting incidents.

The server-side OCR adapter now maps the existing `alamo-docreader` prebuilt
layout/key-value result into the LIC 624 schema. Its managed identity has the
resource-scoped Cognitive Services User role. Preserve recognized text and
pair-level confidence/page references in the private manifest, separate from
the versioned human review. Unreadable or missing values stay unfilled; text
is untrusted data, never instructions. The synthetic two-page pilot is not a
validation of handwriting, poor scans, multipacket PDFs, or historical volume.

Match only within the verified community, using resident identity and incident
date/details as evidence. Present ambiguous and unmatched reports for review;
names or date alone must not silently establish identity. Confirmed links
attach a document to an existing incident without incrementing incident totals.
Never overwrite the source incident from OCR. An unmatched report does not
automatically create a clinical incident or become officially filed.

Acceptance: staff-reviewed pilot accuracy, clear correction workflow, immutable
evidence, duplicate-rescan review, and no source-record changes. Measure page
volume, processing time, and cost during the pilot before approving the backfill.

### 4. Receive incoming scans through the same intake

Add a dedicated receiving mailbox or approved existing mailbox only after its
address, ownership, allowed senders, and access scope are confirmed. Restrict
the connector to that mailbox; receiving scans does not require send access.
Reuse the intake receipt with message/attachment provenance and replay-safe
processing. Store progress server-side and reconcile missed deliveries.

Validate attachments and quarantine unsupported, suspicious, or ambiguously
assigned reports. Recipient routing can suggest a community, but untrusted
sender/subject/OCR text cannot authorize cross-community access. Retain the
original message/attachment identifiers without exposing mailbox credentials
or private storage paths in the browser. Acknowledgment emails and recipient
notifications remain separately approved work.

The interim address chosen in the setup conversation is a personal Outlook
account. The user approved the required mailbox-wide delegated read scope, but
Microsoft sign-in/consent and connector activation remain pending and outside
the selected upload/review release. Personal Outlook does not support Exchange
Application RBAC or folder-scoped OAuth consent: processing only a dedicated
intake folder must be enforced by the connector. A separate consumer-capable
registration is required; do not broaden the enterprise Platform app's
`AzureADMyOrg` sign-in boundary or request send/write/delete mail permissions.

The existing CCLD monitor and its paused outbound Raj/Betty alert workflow are
separate; do not repurpose or activate them for incoming LIC 624 attachments.

### Rollout boundaries

The approved limited upload/review deployment did not authorize a historical
import, incoming mailbox, or database provisioning. The later explicit OCR
request authorizes activating the existing Document Intelligence service for
new uploads only. Agree the remaining retention and operator rules, run a
representative real-scan pilot, then import history in restartable batches
with received/reviewed/failed reconciliation.

Duplicate protection requires every server writer to use the receipt-aware
implementation. Reconcile any older duplicate/orphaned submissions during the
index migration; adoption of a canonical indexed report does not itself clean
up historical extra copies. Crash-left temporary objects also need an explicit
retention/reconciliation policy before the backfill.

## Remaining operator definitions

Before broader OCR backfill and final filing are implemented, collect representative scanned
LIC 624 reports and answer these questions:

- Which fields are required on every report?
- Which report types or agencies use different layouts?
- Which values determine destination folder or queue?
- Which fields may be accepted automatically, and which always require review?
- Who can approve, correct, reject, and finalize a draft?
- What retention, deletion, and notification rules apply to original scans and
  extracted records?

Those answers finish the confidence rules, sorting behavior, and filing
contract. The current Azure Document Intelligence adapter does not waive the
real-scan accuracy pilot or make historical import production-ready.

## Guardrails

- no browser-side storage of report files
- no public blob access or client-provided blob path
- no extraction output presented as final without human confirmation
- no automatic addition to the existing Licensing library
- no cross-community query or upload based only on a request parameter
- no cross-community cards or schedules in the Executive Director dashboard response
- no email or notification until recipients and triggers are explicitly approved
