# Admissions and Pipeline Application Boundary

- purpose: define the Alamo Admissions overview and the full Pipeline referral-workflow boundary
- status: current implementation and deployment contract
- owners: product, engineering, admissions platform
- updated: 2026-08-14
- tags: admissions, pipeline, routing, authentication, integration
- labels: application-boundary, current-state, deployment

Admissions and Pipeline are deliberately separate product surfaces.

## Alamo Admissions overview

`/admissions` is an Alamo-native aggregate overview. It uses the same governed
home-dashboard contract as the rest of Alamo and shows:

- portfolio census
- census movement
- community count and resident-profile coverage
- community census, location, change, and data-through period
- snapshot freshness or last-known-good warnings

The overview does not copy referral documents, extracted fields, assessment
details, or other unnecessary PHI into Alamo.

## Full Pipeline application

`https://alamo-pipeline.com` owns the transactional referral workflow in its
established Azure production environment:

- referral intake and worklists
- source document upload and storage
- OCR and document extraction
- packet review and evidence
- assessments and placement decisions
- client-profile workflow and collaboration

The Alamo overview links to these surfaces as a separate first-party
application. It does not iframe Pipeline or make the Alamo frontend depend on
Pipeline's internal APIs.

## Routing

The `/admissions` route remains available for direct review, but its primary
Alamo navigation item is temporarily disabled until the overview is finished.
The implementation and access boundary remain in place so navigation can be
restored without rebuilding the surface. The `/pipeline` path receives a
temporary edge redirect to the canonical Pipeline hostname, so the full
application owns its authentication redirects and browser origin.

## Authentication

Both applications use the same Entra tenant and browser application pattern.
Alamo controls visibility of its Admissions overview through the maintained
Admissions roles. Pipeline independently validates its own session and roles
before exposing referral or document data.

## Verification

Run:

```bash
npm run check:admissions-access
npm run check:browser-admissions
```
