# Personnel Overview and Alamo Workforce Application Boundary

- purpose: define the Alamo `/personnel` overview and its boundary with the separate Alamo Workforce application
- status: current implementation and deployment contract
- owners: product, engineering, HR operations
- updated: 2026-10-19
- tags: workforce, hr, hiring, recruiting, integration
- labels: application-boundary, current-state, deployment

Personnel is not released in Alamo Platform. Both `/personnel` and the legacy
`/workforce` URL redirect to `/home` for every account, including the owner and
presentation users. Shared and Executive Director navigation omit Personnel.
The authenticated `/api/platform/workforce-dashboard` route returns 404 for
everyone before reading the HR feed. A future release must explicitly reopen
the route, navigation, and API together after verifying the live source; the
fictional demo is not a production exception. The separate Alamo Workforce application
owns staff records, credential tracking, open roles, applicants, and the
spreadsheet or Paylocity data that feeds them.

## Personnel overview

The dormant live `/api/platform/workforce-dashboard` feed remains owner-only through
`assertPlatformKnowledgeOwner`. A separate build-flagged fictional demo can be
opened only after the Personnel release gate is deliberately removed; the
current release gate blocks it for all accounts. The demo never calls the live
Workforce API and cannot link into the Workforce app. This does not grant
Andrew any live HR or other owner-workspace access.
The page follows the Admissions board pattern: every element says what
to do next and links to the place to do it.

- two surfaces, like Admissions: **Briefing** (default) and **Hiring board**
  (`/personnel?view=board`)
- the briefing opens with a three-sentence update typed out once per session
  (open seats and who is in offer and clearance, the longest-waiting role with
  no candidates, and scheduling blocks plus credentials expiring soon), then
  three action lists: credentials expiring in the next 30 days (grouped by
  community, credential, and date), roles with candidates in offer and
  clearance, and roles with no candidates, each linking into the Workforce app
- community and role filters on the hiring board
- a hiring board of open roles in three action columns: Needs candidates,
  Interviewing (Phase 2), and Ready to hire (Phase 3 offer and clearance). Each
  card shows one square per candidate shaded by phase, a dashed square for each
  opening without a candidate, the next action, and a link to that role in the
  Workforce app
- staffing by community: a seat map (available, can't be scheduled, on leave,
  open seat) with a link to the community's credential gaps or open roles

The page shows no headline statistics or trend lines. It carries counts and job
titles only, never staff or applicant names, emails, or employee numbers. It
does not iframe the Workforce app.

The dormant component contains a clearly labeled fictional Workforce fixture,
but the current release gate blocks the route even when
`VITE_WORKFORCE_DEMO=true`. The fixture has no links into Workforce.

## Workforce summary contract

Workforce owns HR data. Alamo reads one aggregate summary from it on the
server, never from the browser and never through Workforce's user APIs.

- configuration: `WORKFORCE_SUMMARY_URL` (for example
  `https://<workforce-host>/api/platform/workforce-overview`) and
  `WORKFORCE_SUMMARY_TOKEN` (a Bearer shared secret). When either is unset the
  dormant Personnel page would show the source as not connected after release.
- Workforce side: the token's SHA-256 is set as
  `Workforce__PlatformFeed__TokenSha256`; the token grants the summary and
  nothing else. Workforce also accepts an Entra app-only token holding
  `Alamo.Workforce.PlatformReader`. The producer contract is
  `docs/ALAMO_WORKFORCE_FEED.md` in the Workforce repository.
- response: `schemaVersion` 1, `overview.asOf`, `portfolio`, `communities[]`,
  `roles[]`, `openPositions[]` (each with a relative `path` such as
  `/hiring?position=<id>`, which Alamo joins to the summary origin only when it
  matches that exact shape), `phaseNames`, and `upcomingExpirations[]`
  (community, credential label, expiry date, people count, and whether it
  blocks scheduling; counts only, treated as empty when an older producer
  omits it). Communities use the short
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
