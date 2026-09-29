# Product Surfaces

- purpose: document the current user-facing platform routes and modules
- status: authoritative current-state reference
- owners: product, frontend
- updated: 2026-09-23
- tags: product, routes, workspace, modules, ui
- labels: platform-handbook, current-state
- related files:
  - [alamo-platform-app/src/app/App.tsx](/Users/eric/CareEngineMain/alamo-platform-app/src/app/App.tsx)
  - [alamo-platform-app/src/features/home/pages/WorkspaceHomePage.tsx](/Users/eric/CareEngineMain/alamo-platform-app/src/features/home/pages/WorkspaceHomePage.tsx)
  - [alamo-platform-app/shared/platform-module-registry.mjs](/Users/eric/CareEngineMain/alamo-platform-app/shared/platform-module-registry.mjs)

## Product Model

The current public Azure product is not primarily a sidebar app. It begins
with the California community map on desktop and a stacked community selector
on phones:

- the user starts at `/home`
- five facility markers are projected from maintained city longitude/latitude coordinates;
  permanent leader lines keep the nearby Bay Area locations independently readable and clickable
- selecting a desktop marker or phone community row opens the comprehensive
  community profile; it is a compact desktop modal and a full-screen phone workspace
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
- **Analytics** opens the mounted governed workspace without replacing the
  California map; its internal **Reports** and **Ask a question** controls switch
  between governed documents and the vertical analyst
- legacy `/questions` links redirect to the analyst at `/analytics/questions`

## Small-Screen Product Decision

The public Azure mobile home prioritizes three jobs: **find and open a
community**, **read governed analysis**, and **ask a governed question**. Phone
widths replace the California map with one vertically stacked row per
community. Each row exposes the maintained community name and current census,
uses a large touch-sized target, and opens the same governed profile as the desktop
map marker. The profile becomes a full-screen phone workspace with a compact
Overview, Census, Incidents, Medications, and Residents picker. Its census
trend favors the line and summary values over individual point controls, and
the standalone Resident Search shortcut is omitted. Desktop retains the
California map and modal behavior.

The phone home shows only the community rows, without an introductory heading,
instructions, or repeated profile subtitles. Its rows expand to fill the
available viewport and scroll on short screens rather than compressing their
labels. The primary Analytics action is larger without crowding the persistent
official Alamo Health Management logo. The shared mark is also used by login,
loading, error, and non-California platform headers. Community names and
resident counts use a lighter medium-weight sans-serif treatment rather than
heavy bold labels. The installed-app, Home Screen, and browser icons use the
head-and-tree portion of that same approved mark; the old generic AH monogram
is not part of the active icon set. Analytics back navigation uses a compact
horizontal mark so zoomed and tablet-width layouts retain clear header spacing.

The mobile report library and question-category chip grid become compact native
pickers, preserving the report reader and question list width. Client, Incident,
and Census Search use phone-native record cards inside a bounded results viewport
instead of squeezed desktop tables or page-length record dumps. Client Search is
search-first: exports and the automatic profile preview stay out of the primary
flow, secondary filters are disclosed on demand, and summary measures use a
compact two-column grid. Incident Center previews up to four records in each
priority lane and exposes an explicit Show all/Show fewer control so triage remains
scannable. Certified questions reserve the full phone width for prompt text;
required variables use labeled native selectors below the prompt and the run
action spans the card width. All phone form controls render at a non-zooming iOS
font size, and persistent navigation and disclosure actions retain touch-sized
targets. The source branch
also contains a separate `MobileCommunityHome` portfolio-pulse design, but that
is not included in the current public Azure image; do not roll it into a mobile
release without a separate product decision.

Admissions appears directly below Analytics in primary navigation for every
signed-in Platform identity. Admissions-specific roles may restrict an identity
to that workspace, but they are not an extra entitlement required by a normal
Platform user to see the aggregate overview. Fifty States acquisition research,
Command Center, Data Explorer, and other deep tools stay available through
governed routes or analyst drilldowns, but do not occupy the primary phone
header. Phone layouts must still render any direct route safely.

The URL-only `/data-architecture` route is a print-ready platform explainer. It
maps live operational inputs, integrating referral and enhanced-profile lanes,
the governed Databricks-to-snapshot pipeline, deterministic question/report
execution, current data depth, and the evidence still required for deeper
outcome reporting. It is intentionally absent from primary navigation while it
is reviewed.

`/admissions` is the aggregate Admissions overview inside Alamo. It opens on a
compact three-column referral board and uses one segmented Board, Census, and
Trends control instead of a page title, subtitles, KPI strip, and three stacked
sections. Census and trends use governed portfolio and community context from
the home-dashboard contract. Its primary navigation item appears directly below
Analytics for every authenticated Platform identity. The separate Pipeline
application owns referral intake, uploads, OCR, packet evidence, assessments,
decisions, and other transactional workflow. The `/pipeline` path redirects to
that full application.

The analyst remains a vertical chat/module workspace:

- the user opens **Analytics**, then **Ask a question**, or follows an
  `/analytics/questions` deep link
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
- persistent official Alamo Health Management logo that always returns home
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
  rather than collapsing into one market score. The same route now exposes a
  second **Acquisition intelligence** view only after its owner-protected API
  succeeds. The visible view is a concise operator screen with one private
  company per row, current public footprint, source links, a reported or
  estimated bed range, estimate confidence, and a formula-derived enterprise
  value range. The supplied workbook provides the valuation arithmetic and
  original comparison anchors, not verified ownership or licensed-capacity
  facts. The searchable 50-state facility discovery, durable case workflow,
  evidence history, ownership and license queues, and proposed clusters remain
  implemented behind the same owner-only API boundary but are not rendered in
  the current operator screen. Development uses a local file store; production
  uses the existing private Azure Blob container with optimistic-concurrency
  writes and immutable revisions.
- `/analytics`: the primary Analytics workspace, with internal Reports and Ask
  a question sections, governed long-form report families, portfolio/community
  scope, loaded-period selection, an in-app reader, and the deterministic
  analyst thread
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

## Licensing Reports

`/licensing` is a read-only library of the four-community CCLD baseline. The
California community profile links to it with a community filter for San Pablo,
Santa Clarita, Turlock, and JC Wallace House. Victoria's House has no licensing
link until its license number and source collection are established.

The page presents readable briefs with allegations, state finding excerpts,
cited deficiencies, correction plans, and other recorded follow-up. Each
excerpt retains its source page. Repeated state-form headers, signatures, and
numbered gutters are removed from the clean narrative; the original text stays
available in a disclosure and download. Unclear citation fields are flagged for
source review. Mixed findings remain explicit, and historical deadlines do not
imply current overdue work.

The interface has one search box and an Updates notice. Search understands a
small explicit vocabulary of communities, findings, citation/correction terms,
years, and remaining text terms. It retrieves reports; it is not an unrestricted
AI question-answer service. There are no statistics panels or filter menus.
Report selection and search remain addressable in the URL.

The authenticated `/api/platform/licensing`, `/api/platform/licensing/report`,
and `/api/platform/licensing/updates` endpoints read a validated, atomic library
bundle in private Azure Blob storage in production, using the existing managed
identity. Local development reads `generated/licensing`. Missing, oversized,
or invalid evidence returns an unavailable response; production never falls
back to a local collection. Reports and Updates are published together so an
alert cannot reference an absent report.

`node scripts/check-licensing-updates.mjs --publish` runs the versioned source
collector in `scripts/licensing`, imports a complete four-community collection,
projects the change ledger, archives the original source evidence, and publishes
the library bundle to `alamo-platform-snapshots/licensing/library-v1.json` in
`alamodatalake`. Immutable versions and source archives are retained under the
same private `licensing/` prefix. Publishing uses the existing Azure CLI sign-in
and conditional writes to reject stale/concurrent replacement. Collection
failures retain the last complete reports and publish a failed-check notice.

Baseline records do not generate alerts; new, revised, removed, and reappearing
records do. The page refreshes Updates once per minute. `--refresh-feed-only`
rebuilds the feed without fetching CCLD. Original ledger and evidence remain in
`output/ccld-baseline/data`; restore those from the private evidence archive if
moving the collector to a different machine.

The scheduled Codex task runs Mondays at 9 a.m. Pacific and publishes updates to
the live page. Its trigger still requires this Mac and Codex to be running; it
is not a cloud scheduler. It stays quiet when nothing changed and alerts here
on meaningful changes or failure. The page uses a compact breadcrumb/Updates
row above search, without a visible page title or subtitle.
