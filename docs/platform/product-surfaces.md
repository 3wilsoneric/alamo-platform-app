# Product Surfaces

- purpose: document the current user-facing platform routes and modules
- status: authoritative current-state reference
- owners: product, frontend
- updated: 2026-08-02
- tags: product, routes, workspace, modules, ui
- labels: platform-handbook, current-state
- related files:
  - [alamo-platform-app/src/app/App.tsx](/Users/eric/CareEngineMain/alamo-platform-app/src/app/App.tsx)
  - [alamo-platform-app/src/features/home/pages/WorkspaceHomePage.tsx](/Users/eric/CareEngineMain/alamo-platform-app/src/features/home/pages/WorkspaceHomePage.tsx)
  - [alamo-platform-app/shared/platform-module-registry.mjs](/Users/eric/CareEngineMain/alamo-platform-app/shared/platform-module-registry.mjs)

## Product Model

The current product is not primarily a sidebar app. It begins with a
California community map:

- the user starts at `/home`
- five facility markers are projected from maintained city longitude/latitude coordinates;
  permanent leader lines keep the nearby Bay Area locations independently readable and clickable
- selecting a marker opens a compact modal with the comprehensive community profile
- each profile combines census, incidents, medication performance, diagnosis mix,
  and resident context
- each profile's Incidents tab opens with the same high, medium, and low triage
  used by the Incident Center, scoped to that community and switchable between
  its latest two loaded incident days; monthly categories and exact reports
  continue beneath it
- census, incidents, the resident roster, individual resident profiles, and
  Resident Search stay inside the selected community modal
- the modal uses one-level Back navigation so users can return from a resident
  profile to the roster and then to the community overview without losing place
- Resident Search opens already scoped to the selected community
- the black **Ask a question** control scrolls to the vertical analyst directly beneath the map
- **Analytics** opens the mounted governed report library without replacing the
  California workspace
- the California map always remains above the analyst thread, including `/questions` deep links

The URL-only `/data-architecture` route is a print-ready platform explainer. It
maps live operational inputs, integrating referral and enhanced-profile lanes,
the governed Databricks-to-snapshot pipeline, deterministic question/report
execution, current data depth, and the evidence still required for deeper
outcome reporting. It is intentionally absent from primary navigation while it
is reviewed.

The analyst remains a vertical chat/module workspace:

- the user scrolls beneath the map or opens `/questions`
- the user chooses a vetted question and its selectors
- deterministic AH Analyst tools calculate and validate each answer
- deterministic modules appear in the thread
- users can still deep-link to route surfaces when useful

## Home Workspace

Live file:

- [WorkspaceHomePage.tsx](/Users/eric/CareEngineMain/alamo-platform-app/src/features/home/pages/WorkspaceHomePage.tsx)

Current responsibilities:

- guided question picker and selectors
- vertical question, answer, and module timeline
- AH Analyst request/response rendering
- conversation and analysis orchestration
- product-surface module mounting
- background conversation persistence without a visible history menu
- copy/rerun question controls
- analysis session persistence
- persistent emerald Alamo Health wordmark that always returns home
- a bounded answer ladder: a completed answer may expose up to two registered
  next questions, and each answer appends beneath the prior turn
- a governed one-page brief action beneath eligible completed answers; audience
  and emphasis choices stay inline, and the artifact can be downloaded,
  printed to PDF, or emailed to the signed-in user when delivery is connected

Ad hoc visual rendering lives in `components/AdHocVisualModule.tsx`; the page
owns workspace orchestration. Code-health budgets prevent the page and renderer
from silently growing back into one component.

## On-Rails Drilldown

Answers can continue into a deeper analysis without reopening free text. The
supported ladder is intentionally small:

- overview or topline
- category, trend, rate, or resident-driver breakdown
- exact governed rows or resident profile

Only tool actions carrying an exact registered question-route ID are shown in
the normal answer flow. Clicking one preserves the current community, period,
category, and resident frame, runs the registered tool contract, and adds the
new question and answer to the same vertical thread. Unregistered tool prompts
remain hidden.

## One-Page Brief Flow

The reporting flow stays inside the vertical thread:

1. Run a saved question and receive its validated answer and module.
2. Open **Create one-page brief** beneath that answer.
3. Choose executive, operations, community-leader, or clinical audience.
4. Choose balanced overview, changes, risks, or actions.
5. Create, download, print/save PDF, or email to the signed-in user.

The report action is absent for stale, not-loaded, rejected, free-form,
schema-invalid, or contract-invalid results. Email is absent when the server
delivery webhook is not configured.

## Module Registry

The module registry lives in:

- [platform-module-registry.mjs](/Users/eric/CareEngineMain/alamo-platform-app/shared/platform-module-registry.mjs)

`/resident-search` is an internal canvas identity, not a standalone React route.
The home workspace intercepts it and mounts the resident-search module in the thread.

It has two kinds of modules:

- `surface`: mounts an existing product surface in the chat canvas
- `analysis`: runs a deterministic tool and renders a purpose-built visual

Current product surfaces include:

- Communities Overview
- Community Detail
- Resident Search
- Community Census
- Community Incidents
- Community Residents
- Incident Center
- Data Explorer
- Glossary
- Command Center

Current analytical module families include:

- operating snapshot
- census trend, movement, drop history, and community time series
- incident breakdown, detail list, category comparison, rate, and rate change
- resident profile, resident incident history, resident search, and watch summary
- diagnosis mix, demographics, length of stay
- medication profile, compliance, refusals, current orders, resident watchlists, and exact exception/PRN detail
- documentation gaps
- community and period comparison

## Communities

Routes:

- `/communities`
- `/communities/:facilityId`

Primary data:

- current resident roster
- occupancy/community census
- monthly census history
- incident categories and detail
- diagnosis and resident mix
- medication summary, current order detail, PRN outcomes, and exception drilldowns where loaded

Important UX rule:

- facility IDs may exist in code and data joins, but user-facing UI/docs should
  show community names unless a technical diagnostic explicitly needs the ID.

## Incident Center

Route:

- `/incidents`

Data behavior:

- active feed calls `/api/incidents`
- endpoint prefers live Databricks and disables cache
- snapshot fallback is only a fallback

Expected behavior:

- the same triage surface is reused inside community profiles with strict
  facility scoping
- latest and previous loaded incident-day controls keep the last two available
  daily reviews one click away
- click incident -> event detail expands
- click resident/client name -> resident profile/drilldown
- current data questions should expose latest loaded incident date, today's row
  count, snapshot generated time, and whether upstream feed data is late

## Data Explorer

Route:

- `/explorer/:kind`
- This is an internal/direct route. The primary workspace suppresses Data Explorer CTAs until the product deliberately re-enables them.

Current kinds:

- `incidents`
- `census`
- `residents`

Expected behavior:

- remain available only through the direct/internal route while primary workspace CTAs are disabled
- search and filter the governed row set full-screen
- preview the exact filtered rows before exporting
- export the filtered result to CSV or Excel-compatible `.xls`
- stay out of the California home entrypoint unless product explicitly decides
  it should become a first-class route

## Command Center

Route:

- `/command-center`

Current purpose:

- warehouse/catalog health
- snapshot freshness and payload diagnostics
- analyst QA pass/warn/fail summary
- MAR analyst-context readiness as a platform data feed status
- intent compiler workbench

Command Center is a platform operations surface, not a general dashboard.

## Secondary Routes

Current secondary surfaces:

- `/glossary`: platform definitions
- `/fiftystate`: market-research atlas that opens on the 15 states with verified
  demand research and preserves all 50 through an explicit national view. The
  map is a navigation surface, not a synthetic heat score. Every state profile combines
  a consistently defined state-operated psychiatric-bed baseline with the
  maintained governance, buyer, target-role, opportunity-path, and
  audience-specific effectiveness layers. The 15 default states also
  expose source-linked legal/involuntary-care, state-hospital-pressure,
  placement-bottleneck, and step-down-visibility research. Other states are
  explicitly labeled as national-baseline profiles until the same sourced
  research pass is complete. California, Washington, Oregon, Texas, and New
  York add a second verified buyer layer covering 14 county or regional targets,
  named public buyers and leaders, public procurement status, published
  economics where available, barriers, and a concrete first outreach move. The
  buyer layer is verified through 2 August 2026 and preserves active, scheduled,
  closed, precedent-only, and not-publicly-located opportunities as different
  statuses. The state dossier uses one concise decision flow: market summary,
  supporting demand evidence, buyer targets where researched, recommended entry,
  Alamo evidence requirements, sources, and limitations. Demand relevance,
  buyer fit, opportunity status, and Alamo evidence requirements remain separate
  rather than collapsing into one market score.
- `/analytics`: the primary Analytics workspace, with seven governed long-form
  report families, portfolio/community scope, loaded-period selection,
  audience tailoring for effectiveness evidence, an in-app reader, and
  print-ready artifact output
- `/reports`: compatibility route for previously shared links; new navigation
  uses `/analytics`

Analytics opens with the live Portfolio overview, then offers distinct
community, effectiveness, census-and-flow, incident, medication, and
resident-population reports from the published snapshot. The effectiveness
report changes its decision frame for county, state, managed-care, provider,
and executive audiences without changing the underlying governed calculations.
A community report keeps census, admissions and discharges, resident profile,
incident detail, medication execution, diagnoses, capacity, and resident watch
items together. Every report shows its actual snapshot update time and displays
a visible warning when the published data is stale. Evidence row counts remain
available behind a disclosure so provenance does not crowd the reading surface.

Unknown and retired paths resolve through the application catch-all to `/home`; no retired page aliases ship as product routes.
