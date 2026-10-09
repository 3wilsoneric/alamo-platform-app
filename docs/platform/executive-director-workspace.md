# Executive Director Workspace

- purpose: define the facility-scoped Executive Director dashboard and licensing-report intake workflow
- status: active implementation plan and security contract
- owners: product, operations, engineering, compliance
- updated: 2026-10-09
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
Current census, impending admissions, incidents, and medication performance are
integrated into four operating components without a separate KPI or stat strip.
Each area opens the larger facility-scoped detail workspace when the user needs
history or record detail. Components use one darker Alamo-green surface system;
semantic referral badges remain reserved for meaningful client status.

Dashboard drill-downs stay facility-scoped and open in one switchable workspace.
They expose the underlying governed records directly without repeating a KPI
strip: census periods, monthly incident volume and categories, medication
administration totals, or impending admissions. The executive admissions view
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

## Workflow

1. **Receive:** accept a single PDF, JPG, or PNG up to 20 MB.
2. **Preserve:** validate the signature, calculate a checksum, store the exact
   source in the private Azure container, and write an audit manifest.
3. **Extract:** strip fillable LIC 624 PDF fields into the versioned logical
   record. Image-only PDFs, JPGs, and PNGs move to the OCR-required queue.
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
PDFs reach `needs_review`; image-only documents stop at `ocr_required` until
the server-side OCR adapter is connected.

## Current implementation slice

- facility-scoped Entra role contract
- forced Executive Director dashboard landing route and minimal Community/Licensing header
- community dashboard with governed census, incidents, medication performance,
  and facility-filtered referral, assessment, and move-in activity
- private scanned-report upload with type, size, signature, checksum, identity,
  facility, and timestamp metadata
- direct LIC 624 AcroForm extraction into a private structured draft
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
- Fillable PDFs still extract to review; scans remain explicitly
  `ocr_required`. No automatic filing, incident creation, mail, or cloud
  provisioning is part of this milestone.

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
Database provisioning, OCR, incoming mail, and outbound notifications remain off.

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

Connect the server-side OCR adapter to the existing logical LIC 624 schema.
Azure Document Intelligence remains the candidate already identified below,
not an activated Platform integration. Read-only setup verification found the
existing `alamo-docreader` service in `alamo-data-rg`; Platform has no configured
OCR endpoint or processing permission yet. Preserve raw extraction separately from the reviewed
draft, with source page references and field-level confidence. Unreadable or
missing values stay unfilled. Treat document text as untrusted data, never as
instructions. Validate file/page/resource limits and isolate document parsing.

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

Build and test locally first. No production import, mailbox permission,
external OCR submission, cloud provisioning, or deployment follows merely from
the local implementation. Agree the data-handling/retention and operator rules,
approve the configured services, run a small controlled pilot, then import in
restartable batches with received/reviewed/failed reconciliation.

Duplicate protection requires every server writer to use the receipt-aware
implementation. Reconcile any older duplicate/orphaned submissions during the
index migration; adoption of a canonical indexed report does not itself clean
up historical extra copies. Crash-left temporary objects also need an explicit
retention/reconciliation policy before the backfill.

## Remaining operator definitions

Before OCR and final filing are implemented, collect representative scanned
LIC 624 reports and answer these questions:

- Which fields are required on every report?
- Which report types or agencies use different layouts?
- Which values determine destination folder or queue?
- Which fields may be accepted automatically, and which always require review?
- Who can approve, correct, reject, and finalize a draft?
- What retention, deletion, and notification rules apply to original scans and
  extracted records?

Those answers finish the confidence rules, sorting behavior, and filing
contract. Azure Document Intelligence is the likely server-side OCR
service for image-only reports, but service selection follows the sample-scan
evaluation rather than preceding it.

## Guardrails

- no browser-side storage of report files
- no public blob access or client-provided blob path
- no extraction output presented as final without human confirmation
- no automatic addition to the existing Licensing library
- no cross-community query or upload based only on a request parameter
- no cross-community cards or schedules in the Executive Director dashboard response
- no email or notification until recipients and triggers are explicitly approved
