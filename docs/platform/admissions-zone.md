# Admissions and Pipeline Application Boundary

- purpose: define the Alamo Admissions overview and the full Pipeline referral-workflow boundary
- status: current implementation and deployment contract
- owners: product, engineering, admissions platform
- updated: 2026-09-28
- tags: admissions, pipeline, routing, authentication, integration
- labels: application-boundary, current-state, deployment

Admissions and Pipeline are deliberately separate product surfaces.

## Alamo Admissions overview

`/admissions` is an Alamo-native working overview. It reads
`GET /api/platform/admissions-dashboard` (`server/admissions-dashboard.mjs`) and
opens directly on a weekly leadership briefing. A single quiet tab row switches
between Board, Census, and Briefing, with the briefing occupying the former
Trends position instead of creating a redundant fourth destination.
The page uses the same white canvas as the main Home surface. There is no
repeated page title, explanatory subtitle, or KPI strip.

- **Briefing** — the current CEO-level admissions readout. It shows governed
  census by community; referral origin for the trailing seven days, the prior
  seven days, and the combined 14-day window; a weekly received/accepted/moved-in
  trend; remaining assessments scheduled through Sunday; and planned and
  completed move-ins for the Monday-through-Sunday week. The event lists retain
  client name, community, owner, and workflow status inside the existing
  authenticated PHI boundary. An unmatched Pipeline destination is surfaced as
  `No community assigned`, so portfolio totals reconcile rather than silently
  dropping activity. Every dynamic section carries an explicit source-coverage
  flag. If Pipeline has not published the required event slice, the interface
  says the field is incomplete and renders an em dash; it never turns missing
  coverage into a zero or estimate. The briefing is a page-by-page executive
  deck rather than one long report. Summary, community, source, trend,
  referral-detail, assessment, and move-in pages render one at a time with
  direct page tabs plus Previous/Next controls. Communities and event lists
  split into additional pages at fixed row limits, so complete data remains
  flip-through without nested vertical scroll areas on desktop or mobile.
- **Board** — the current governed referral update: Referral received, In
  progress, and Decision columns holding one card per referral. The columns use
  calm green, blue, and warm decision surfaces. Cards show client name,
  destination community, referral number, owner, next step, and days open. A
  single live analyst response above the board uses two distinct lines and
  selective emphasis to answer the CEO-level question:
  how many referrals are active, where they sit in the process, which
  communities carry the most activity.
  Community workload is stated in natural language without parenthetical
  counts. Selecting a client opens an Alamo-native referral chart in a
  Pipeline-inspired manila folder frame, with the client name on the folder
  tab. Its larger white chart sheet is a management-facing Meet the Client:
  client and placement facts, a signed-assessment management brief, care and
  support context, medication handoff, admission readiness, workflow progress,
  and workflow details. Section headings are a reading hierarchy rather than a
  second navigation layer. The existing status, placement, referral, coverage,
  client, ownership, assessment, document, and requirement rows are the
  drill-down controls: selecting one expands its underlying fields in place and
  collapses the previously open row. Client context remains directly readable
  in the chart, without linking to raw Pipeline notes or documents. Community
  is the only filter:
  pill controls support selecting multiple communities, while All communities
  resets the complete board. A List toggle shows the same governed slice on
  desktop. Below the desktop breakpoint, the three pipeline columns become a
  horizontally scrollable category navigation. Selecting Referral received,
  In progress, or Decision renders only that category's client list; selecting
  a client opens the same management chart. The desktop board and its
  Board/List control are not rendered into the mobile reading path. Community
  pills also stay in one horizontally scrollable row instead of wrapping into
  a tall control block.
- **Census** — one compact portfolio row followed by the five communities,
  combining census, occupancy, month-to-date admissions, discharges, net
  movement, and each community's board count.

Census and flow come from the governed snapshot tables
`community_operating_summary`, `resident_flow_weekly_by_community`, and
`resident_flow_monthly_by_community`. Census data is counts only: the flow tables also carry resident names, and
the builder never copies them. The referral board receives a deliberately
bounded PHI profile from Pipeline for management review. Raw referral notes,
contacts, documents, extraction evidence, and unsigned assessment narrative
are not copied into this overview.

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
  `days_since_update`, `planned_admission_date`, `flags`, a bounded
  `management_profile`, and a relative `pipeline_path`), `metrics`,
  `upcoming_admissions`, and `history` (`month_outcomes`, six `monthly[]` rows,
  `decision_timing`). The management profile includes client name, DOB,
  referral source, county, payer, responsible person, conservatorship,
  assessment/readiness state, and capped medication data. Its narrative and
  support snapshot are populated only from a signed assessment. Contract 3.1's
  `briefing` producer slice carries `timezone`, `window_end`, explicit coverage
  booleans, and bounded event arrays: `recent_referrals`,
  `upcoming_assessments`, `planned_move_ins`, and `weekly_trend`. Referral rows
  carry received timestamp and origin; assessment and move-in rows carry the
  scheduled timestamp; all three carry referral ID, client name, destination
  community, owner, status, and the same bounded relative `pipeline_path`.
  Weekly trend rows carry only week start and received/accepted counts. Raw notes,
  contact details, documents, extraction evidence, and unsigned assessment
  narrative do not cross this contract.
- `pipeline_path` must be a query-only relative path; Alamo joins it to the
  configured Pipeline origin and drops the whole summary if any row fails the
  contract.
- Admissions status badges preserve explicit Pipeline decisions: accepted and
  denied statuses map to their corresponding categories, and `Under review`
  appears only when Pipeline reports that exact status. Every other undecided
  workflow status is shown as `In progress`.
- Pipeline community labels are matched to facilities through
  `shared/community-names.mjs` aliases; unmatched labels (such as
  "Unassigned") show as "No community" on the board and in its filter.

`server/pipeline-admissions-summary.mjs` keeps only these fields with explicit
text and array limits, caches a good response for five minutes, and falls back
to an "unavailable" state after a five-second timeout or a contract mismatch,
so census and flow still render. The `briefing` slice is backward compatible:
an otherwise valid legacy Pipeline response becomes `source_upgrade_required`
for the briefing rather than taking down the board.

The dashboard builder uses `window_end` as the reporting date for Pipeline
events. The trailing-seven window includes that date and the six preceding
calendar dates; the prior-seven window is the seven dates immediately before
it. “This week” always means Monday through Sunday in
`America/Los_Angeles`. Canceled or completed assessments and canceled or denied
planned move-ins are excluded. Completed move-ins remain sourced from the
governed weekly resident-flow table and are null when the current week is not
present.

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

The `/admissions` route is available to signed-in Platform users through the
Admissions item beside Analytics in the primary page navigation. The
`/pipeline` path receives a temporary edge redirect to the canonical Pipeline
hostname, so the full application owns its authentication redirects and
browser origin.

## Authentication

Both applications use the same Entra tenant and browser application pattern.
Every signed-in Alamo Platform user can open the Admissions overview, including
the client name and management chart for each referral, under the same
authenticated PHI boundary as resident and incident views. The Admissions roles still control the
assessor-only workspace boundary. Pipeline independently validates its own
session and roles before exposing referral or document data.

## Verification

Run:

```bash
npm run check:admissions-access
npm run check:admissions-dashboard
npm run check:browser-admissions
```
