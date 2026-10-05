# Admissions and Pipeline Application Boundary

- purpose: define the Alamo Admissions overview and the full Pipeline referral-workflow boundary
- status: current implementation and deployment contract
- owners: product, engineering, admissions platform
- updated: 2026-10-04
- tags: admissions, pipeline, routing, authentication, integration
- labels: application-boundary, current-state, deployment

Admissions and Pipeline are deliberately separate product surfaces.

## Alamo Admissions overview

`/admissions` is an Alamo-native working overview. It reads
`GET /api/platform/admissions-dashboard` (`server/admissions-dashboard.mjs`) and
opens on **Briefing**. A two-item Admissions navigation displays
**Briefing** before **Pipeline**; `/admissions` is the canonical Briefing URL,
while `?view=pipeline` opens the live referral workspace and survives reload.
The page uses the same white canvas as the
main Home surface. Neither destination uses a repeated product title or KPI
strip.

- **Briefing dashboard** — the current CEO-level admissions readout. A short
  analyst narrative summarizes accepted clients moving toward admission, the
  current workload by stage, and the busiest communities. It types in only on
  its first appearance in a browser session; returning to the page or reloading
  it restores the complete response immediately. Three drill-down pages keep the
  reading path bounded: **Schedule**, **Communities**, and **Open fields**.
  Schedule reconciles upcoming assessments, current and future planned move-ins,
  and accepted clients without a planned date. Communities combines governed
  census with planned admits and recent referrals, then expands in place to show
  the matching Pipeline workload and upcoming activity. Open fields presents a
  bounded Pipeline-ordered queue of source-record omissions; it does not invent
  an editorial risk score. A missing destination never renders as an
  `Unassigned` community card; governed activity without a destination is
  reconciled in a short footnote. Event lists retain client name, community,
  owner, and workflow status inside the existing authenticated PHI boundary.
  Every dynamic section carries explicit source coverage and never converts
  missing data into a zero or estimate. Accepted clients with a current or
  future planned admission date use one shared projection from the live Pipeline
  board across the analyst narrative, Schedule list, community counts, and
  community drilldowns. The bounded briefing event slice enriches those rows
  when it matches, but cannot cause a move-in named in the narrative to disappear
  from the detail below.

### Mobile mode

Admissions uses a dedicated mobile reading path rather than compressing the
desktop board. Briefing controls remain at least 44 CSS pixels high, schedule
metadata wraps instead of truncating, empty schedule lanes collapse to a single
status row, community drill-downs stay inline, and Open fields reveals five
records before an explicit disclosure. Pipeline becomes a three-category tab
view with horizontally scrollable community pills, a six-card preview, compact
two-column card facts, and the same full management chart in a viewport-bounded
modal. The modal locks background scrolling, respects iPhone safe areas, and
provides a 44-pixel close control. Browser checks cover 320, 375, 390, and 430
pixel portrait widths plus a 667-by-375 landscape viewport, horizontal overflow,
touch-target sizing, disclosures, modal bounds, offline recovery, and the live
Pipeline contract.
- **Pipeline** — the live governed referral workspace: Referral received, In
  progress, and Decision columns holding one card per referral. Board is the
  default view, and the adjacent List control always exposes the same governed
  slice without leaving Pipeline. The columns use calm green, blue, and warm
  decision surfaces. Cards show client name, destination community, referral
  number, owner, next step, and days open. Selecting a client opens an
  Alamo-native referral chart in a
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
  resets the complete board. Below the desktop breakpoint, the three pipeline columns become a
  horizontally scrollable category navigation. Selecting Referral received,
  In progress, or Decision renders only that category's client list; selecting
  a client opens the same management chart. The desktop board and its
  Board/List control are not rendered into the mobile reading path. On mobile,
  the Pipeline page leads into the three board categories directly above the
  referral list. Community
  pills also stay in one horizontally scrollable row instead of wrapping into
  a tall control block.

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
  `upcoming_assessments`, `planned_move_ins`, and `weekly_trend`. The dashboard
  presents the two forward schedules; referral-origin events and the raw weekly
  trend remain contract data but are not displayed in the CEO briefing.
  Referral rows
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
