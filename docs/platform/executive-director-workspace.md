# Executive Director Workspace

- purpose: define the facility-scoped Executive Director dashboard and licensing-report intake workflow
- status: active implementation plan and security contract
- owners: product, operations, engineering, compliance
- updated: 2026-10-08
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

## Next definition session

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
