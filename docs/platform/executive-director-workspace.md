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

Executive Directors receive a separate, deliberately small context app named
**Licensing** at `/executive/licensing`. It is not another item in the general Platform navigation. An
Executive Director identity is assigned to one or more communities by Entra
application role, lands directly in this workspace, and cannot use general
Platform APIs or routes.

The first useful job is licensing-report intake. The user uploads the original
scan, sees that it was received, and follows its processing state. The source
document is retained privately and its SHA-256 checksum is recorded. Uploading
does not publish the report, populate the existing Licensing library, or mark
anything filed.

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
4. **Review:** show the scan beside extracted fields, confidence, and required
   corrections. Low-confidence and missing required fields must be explicit.
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
- forced Executive Director landing route and minimal header
- simple community dashboard with governed current-resident context
- private scanned-report upload with type, size, signature, checksum, identity,
  facility, and timestamp metadata
- direct LIC 624 AcroForm extraction into a private structured draft
- recent-submission queue with extraction method, populated-field count, and honest processing status
- Azure Blob persistence in production and ignored local persistence for development

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

Those answers finish the confidence rules, review form, sorting behavior, and
filing contract. Azure Document Intelligence is the likely server-side OCR
service for image-only reports, but service selection follows the sample-scan
evaluation rather than preceding it.

## Guardrails

- no browser-side storage of report files
- no public blob access or client-provided blob path
- no extraction output presented as final without human confirmation
- no automatic addition to the existing Licensing library
- no cross-community query or upload based only on a request parameter
- no email or notification until recipients and triggers are explicitly approved
