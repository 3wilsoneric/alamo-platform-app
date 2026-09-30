# Workforce Overview and Alamo Workforce Application Boundary

- purpose: define the Alamo `/workforce` overview and its boundary with the separate Alamo Workforce application
- status: current implementation and deployment contract
- owners: product, engineering, HR operations
- updated: 2026-09-29
- tags: workforce, hr, hiring, recruiting, integration
- labels: application-boundary, current-state, deployment

Workforce follows the same split as Admissions and Pipeline. Alamo Platform owns
an aggregate `/workforce` overview; the separate Alamo Workforce application
owns staff records, credential tracking, open roles, applicants, and the
spreadsheet or Paylocity data that feeds them.

## Alamo Workforce overview

`/workforce` is available to signed-in Alamo workspace users, like Communities
and Analytics. It shows:

- open roles and applicants in the pipeline, with headcount by employment status
- applicants by hiring phase (Phase 1 Screening, Phase 2 Interview, Phase 3 Offer and clearance)
- by community and by role: active, onboarding, and on-leave staff, open roles,
  applicants per phase, and the share of credentials that are current
- each open role: title, community, role, openings, days open, and applicants per phase

The overview carries counts and job titles only. It never receives staff or
applicant names, emails, employee numbers, or record IDs. It links to the
Workforce application for detail work and does not iframe it.

## Workforce summary contract

Workforce owns HR data. Alamo reads one aggregate summary from it on the
server, never from the browser and never through Workforce's user APIs.

- configuration: `WORKFORCE_SUMMARY_URL` (for example
  `https://<workforce-host>/api/platform/workforce-overview`) and
  `WORKFORCE_SUMMARY_TOKEN` (a Bearer shared secret). When either is unset the
  page shows Workforce as not connected.
- Workforce side: the token's SHA-256 is set as
  `Workforce__PlatformFeed__TokenSha256`; the token grants the summary and
  nothing else. Workforce also accepts an Entra app-only token holding
  `Alamo.Workforce.PlatformReader`. The producer contract is
  `docs/ALAMO_WORKFORCE_FEED.md` in the Workforce repository.
- response: `schemaVersion` 1, `overview.asOf`, `portfolio`, `communities[]`,
  `roles[]`, `openPositions[]`, and `phaseNames`. Communities use the short
  names in `shared/community-names.mjs`.
- validation: `server/workforce-summary.mjs` checks every field (integer
  counts, phases summing to applicants, ISO dates, bounded row counts) and
  rejects the whole summary on any violation. Unknown fields are dropped.
- caching: five minutes on success, one minute after a failure. The route
  never throws; failures render as "temporarily unavailable".

## Verification

```bash
npm run check:workforce-dashboard
```
