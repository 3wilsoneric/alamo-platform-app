# Admissions and Pipeline Application Boundary

- purpose: define the Alamo Admissions overview and the full Pipeline referral-workflow boundary
- status: current implementation and deployment contract
- owners: product, engineering, admissions platform
- updated: 2026-09-26
- tags: admissions, pipeline, routing, authentication, integration
- labels: application-boundary, current-state, deployment

Admissions and Pipeline are deliberately separate product surfaces.

## Alamo Admissions overview

`/admissions` is an Alamo-native working overview. It reads
`GET /api/platform/admissions-dashboard` (`server/admissions-dashboard.mjs`) and
opens directly on a compact workflow board. A single segmented control switches
between Board, Census, and Trends without stacking three dashboards on one page.
There is no repeated page title, explanatory subtitle, or KPI strip.

- **Board** — the current governed referral update: Referral received, In
  progress, and Decision columns holding one card per referral. The columns use
  calm green, blue, and warm decision surfaces. Cards show client name,
  destination community, referral number, owner, next step, days open, and
  attention flags. A single live executive paragraph above the board answers
  the CEO-level question: how many referrals are active, where they sit in the
  process, which communities carry the most activity, and what needs immediate
  follow-up. Selecting a client opens an Alamo-native progress update with
  workflow stage, current status, next required action, assignment, timing,
  planned admission, priority, and review flags. Filters: community, "needs
  attention", and status. A List toggle shows the same governed slice.
- **Census** — one compact portfolio row followed by the five communities,
  combining census, occupancy, month-to-date admissions, discharges, net
  movement, and each community's board count.
- **Trends** — referrals to move-ins by month (Pipeline referrals and
  acceptances beside census admissions), weekly admissions and discharges,
  without a separate headline-stat section.

Census and flow come from the governed snapshot tables
`community_operating_summary`, `resident_flow_weekly_by_community`, and
`resident_flow_monthly_by_community`. Census data is counts only: the flow tables also carry resident names, and
the builder never copies them. The referral board receives the client name from
Pipeline; referral documents, extracted fields, and assessment details are not
copied into this overview.

## Referral summary contract

Pipeline owns referral data. Alamo reads one aggregate summary from it on the
server, never from the browser and never through Pipeline's internal APIs.

- configuration: `PIPELINE_ADMISSIONS_SUMMARY_URL` and
  `PIPELINE_ADMISSIONS_SUMMARY_TOKEN` (a Bearer shared secret). When either is
  unset the dashboard shows the panel as not connected.
- Pipeline endpoint: `GET /api/integrations/platform/admissions-summary`,
  gated in Pipeline's proxy and route by `PIPELINE_PLATFORM_SUMMARY_SECRET`
  (separate from its worker secret). Pipeline documents the producer side in
  `docs/operations/PLATFORM_ADMISSIONS_SUMMARY.md`.
- response: `board` (`total`, `cards_truncated`, `columns[]` with per-status
  counts, and up to 300 `cards[]`: `referral_id`, `client_name`, `column`, `status`,
  `next_action`, `community`, `owner`, `priority`, `days_open`,
  `days_since_update`, `planned_admission_date`, `flags`, and a relative
  `pipeline_path`), `metrics`, `upcoming_admissions`, and `history`
  (`month_outcomes`, six `monthly[]` rows, `decision_timing`). Client name is
  included as part of the authenticated Platform's existing PHI workflow. DOB,
  contact details, referral sources, notes, and documents are not copied into
  the Platform summary.
- `pipeline_path` must be a query-only relative path; Alamo joins it to the
  configured Pipeline origin and drops the whole summary if any row fails the
  contract.
- Pipeline community labels are matched to facilities through
  `shared/community-names.mjs` aliases; unmatched labels (such as
  "Unassigned") show as "No community" on the board and in its filter.

`server/pipeline-admissions-summary.mjs` keeps only these fields, caches a good
response for five minutes, and falls back to an "unavailable" state after a
five-second timeout or a contract mismatch, so census and flow still render.

## Full Pipeline application

`https://alamo-pipeline.com` owns the transactional referral workflow in its
established Azure production environment:

- referral intake and worklists
- source document upload and storage
- OCR and document extraction
- packet review and evidence
- assessments and placement decisions
- client-profile workflow and collaboration

The Alamo overview does not link or iframe these transactional surfaces. Its
analyst review remains self-contained and depends only on the bounded summary
contract, not Pipeline's internal browser APIs.

## Routing

The `/admissions` route remains available for direct review, but its primary
Alamo navigation item is temporarily disabled until the overview is finished.
The implementation and access boundary remain in place so navigation can be
restored without rebuilding the surface. The `/pipeline` path receives a
temporary edge redirect to the canonical Pipeline hostname, so the full
application owns its authentication redirects and browser origin.

## Authentication

Both applications use the same Entra tenant and browser application pattern.
Every signed-in Alamo Platform user can open the Admissions overview, including
the client name on each referral card, under the same authenticated PHI boundary
as resident and incident views. The Admissions roles still control the
assessor-only workspace boundary. Pipeline independently validates its own
session and roles before exposing referral or document data.

## Verification

Run:

```bash
npm run check:admissions-access
npm run check:admissions-dashboard
npm run check:browser-admissions
```
