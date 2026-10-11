# Product Surfaces

- purpose: document the current user-facing platform routes and modules
- status: authoritative current-state reference
- owners: product, frontend
- updated: 2026-10-10
- tags: product, routes, workspace, modules, ui
- labels: platform-handbook, current-state
- related files:
  - [alamo-platform-app/src/app/App.tsx](/Users/eric/CareEngineMain/alamo-platform-app/src/app/App.tsx)
  - [alamo-platform-app/src/features/home/pages/WorkspaceHomePage.tsx](/Users/eric/CareEngineMain/alamo-platform-app/src/features/home/pages/WorkspaceHomePage.tsx)
  - [alamo-platform-app/shared/platform-module-registry.mjs](/Users/eric/CareEngineMain/alamo-platform-app/shared/platform-module-registry.mjs)

## Shared navigation and responsive layout

Every authenticated route shares one header with the Alamo home anchor and
Analytics and Admissions destinations. Below 768px, Menu exposes
those links plus Communities; Escape, outside click, and navigation close it.
Admissions-only identities retain their existing access boundary. The shared
header includes the installed-app top safe area in its measured height, and the
full-page phone menu begins below that complete header rather than beneath the
browser status area.

Analytics keeps Reports and Ask a question in a separate row below the header.
Betty Dominici, Raj Thandi, and Eric Wilson also see Licensing in that row. No
other account, including a platform administrator, receives Licensing access.
The owner-only Outreach workspace remains available by its direct route but is
absent from shared desktop and mobile navigation; the workspace and its APIs
remain hidden from every other account.
The same verified owner identity can open the unlisted `/chat` route. That
route is intentionally absent from desktop and mobile navigation and redirects
every other signed-in identity to `/home`; the owner claim, not knowledge of
the URL, is the access boundary.
The report catalog becomes a selector below 1024px, preserving a full-width
reader on portrait tablets. Phone home is a five-community list; census and
analysis live in the profiles. Phone Admissions keeps Briefing and Pipeline as
the stable page-level choices, with a separate three-category Pipeline control
and a compact dashboard-section control inside Briefing. Chart geometry follows the available width, and two-column community
tables no longer force horizontal scrolling. Larger comparison tables retain
bounded horizontal scrolling.

## Product Model

The current public Azure product is not primarily a sidebar app. It begins
with the California community map on desktop and a stacked community selector
on phones:

- the user starts at `/home`
- five facility markers are projected from maintained city longitude/latitude coordinates;
  permanent leader lines keep the nearby Bay Area locations independently readable and clickable
- a desktop community index beside the map exposes the same governed current census
  and comparable-period change without requiring hover; its rows highlight the
  corresponding marker and open the same profile. The phone community list
  also shows current census, with unavailable data labeled rather than
  substituted with zero
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
  between governed documents and the vertical analyst. The report library is a
  compact index beside a single paper reader; census, incident, and medication
  reports carry blue, rust, and plum document accents without turning metrics
  into decorative folders
- legacy `/questions` links redirect to the analyst at `/analytics/questions`

## Small-Screen Product Decision

The public Azure mobile home prioritizes three jobs: **find and open a
community**, **read governed analysis**, and **ask a governed question**. Phone
widths replace the California map with one vertically stacked row per
community. Each row exposes the short community name and city,
uses a large touch-sized target, and opens the same governed profile as the desktop
map marker. The profile becomes a full-screen phone workspace with a compact
Overview, Census, Incidents, Medications, and Residents picker. Its census
trend favors the line and summary values over individual point controls, and
the standalone Resident Search shortcut is omitted. Desktop retains the
California map and modal behavior.

The phone home places the community rows beneath a single Communities heading.
Rows scroll on short screens rather than compressing their labels. The Menu
control shares the header with the official Alamo Health Management logo.
The shared mark is also used by login,
loading, error, and non-California platform headers. Community names and
profile facts use the shared sans-serif treatment. The installed-app, Home
Screen, and browser icons use the
head-and-tree portion of that same approved mark; the old generic AH monogram
is not part of the active icon set. The same horizontal home mark keeps zoomed
and tablet-width layouts clear.

The mobile report library and question-category chip grid become compact native
pickers, preserving the report reader and question list width. Client, Incident,
and Census Search use phone-native record cards inside a bounded results viewport
instead of squeezed desktop tables or page-length record dumps. Client Search is
search-first: exports and the automatic profile preview stay out of the primary
flow, secondary filters are disclosed on demand, and summary measures use a
compact two-column grid. Incident Center uses touch-sized High, Medium, and Low
tabs on phones and renders one priority lane at a time; each lane still supports
an explicit Show all/Show fewer control so triage remains scannable. Certified questions reserve the full phone width for prompt text;
required variables use labeled native selectors below the prompt and the run
action spans the card width. All phone form controls render at a non-zooming iOS
font size, and persistent navigation and disclosure actions retain touch-sized
targets. Narrow screens below 360px stack the Data Explorer selectors so their
default labels remain readable. Admissions card facts and data-period details
wrap rather than truncate.

Admissions follows Analytics in primary navigation for every
signed-in Platform identity. Admissions-specific roles may restrict an identity
to that workspace, but they are not an extra entitlement required by a normal
Platform user to see the aggregate overview. Outreach acquisition research,
Command Center, Data Explorer, and other deep tools stay available through
governed routes or analyst drilldowns, but do not occupy the primary phone
header. Phone layouts must still render any direct route safely.

The main Admissions Briefing is a blue-accented dashboard rather than a folder.
Its community drill-down distinguishes a disconnected Pipeline from a real
zero-referral result. The Pipeline board uses neutral stage lanes containing
manila client files; each file shows the source status, destination, next step,
owner, and planned date, then opens a two-column client detail on desktop or
one reading column on phones. The official header remains unchanged.

The URL-only `/data-architecture` route is a print-ready platform explainer. It
maps the current production system in five chapters: live and bounded inputs,
the governed Databricks-to-snapshot spine, Azure Container Apps delivery,
deterministic question and report execution, and capability boundaries. It
distinguishes the core ElderMark/MAR snapshot from the bounded Pipeline and
client-database integrations and the separately restricted Licensing and
research stores. It also names finance, messaging, and external outcome sources
that are not connected, and reads changing coverage from the runtime manifest
rather than hard-coding month counts. It is intentionally absent from primary
navigation while it is reviewed. Phones show one numbered chapter at a time
with previous, next, and native chapter controls; desktop and print retain the
complete document.

`/executive/dashboard` and `/executive/licensing` form the facility-scoped
Executive Director context app. Executive
Director Entra roles are mapped to explicit facility IDs and are redirected to
the community dashboard instead of the general Platform. The dashboard adapts
the main community profile's visual hierarchy while serving a separate,
server-filtered contract: census, incidents, medication performance, and only
that facility's referrals, assessments, move-ins, and pipeline cards. Community
navigation is Overview, MARs, and Incidents; MARs and Incidents open their own
full-page workspaces. The searchable, paginated incident register lives in
Incidents rather than being repeated below the daily overview. New client is a persistent notification list that
opens the client folder from any view. Reading a folder does not dismiss its
notification: eligibility follows the connected Pipeline status until admission
or another terminal outcome. Visible dashboards refresh every minute and on
focus; an unavailable refresh retains the last connected client list with an
explicit stale-data message. Licensing
uses a matching paper-and-register workspace with Reports, Upload report, and
Review form tabs. The facility-scoped report catalog supports filename search,
status filters, and cursor pagination. The existing digital LIC 624 stays
mounted across tab changes to preserve unsaved edits; replacing or closing an
edited form asks for confirmation. Normal Community/brand navigation also
confirms dirty reviews, and pending report actions lock editing and replacement.
Browser reload/close uses `beforeunload`; browser Back is not blocked by the
current BrowserRouter. The long review form has section jumps and a compact
mobile action footer. Month and client tabs support arrow/Home/End navigation,
keep the selected tab visible, and use a single keyboard tab stop. Wide record
tables are named, keyboard-scrollable regions with overflow-only column hints.
Fillable PDFs are
stripped into the versioned LIC 624 draft and move to review. Image-only reports
remain in `ocr_required`; neither route implies that OCR or filing has already
occurred.

The local batch-intake implementation extends that upload view to at most 100
PDF/JPG/PNG files, 20 MB each, sent sequentially with per-file results and a
failed-files-only retry action. One-file uploads retain automatic form review;
batches expose explicit review actions for each extracted report. Exact-byte
duplicates within the same authorized facility reuse the existing report and
review history. A received scan is still Awaiting OCR, not processed or filed.
Pending files are memory-only and require reselection after leaving; confirmed
receipts remain server-side. This does not yet supply background OCR, incoming
email, or the indexed report store required for the historical backfill.

Overview and the Incidents workspace also expose an All incidents register.
The register starts with all available history, supports server-side text,
category, and inclusive date filters, and returns 25 records per page with
expandable recorded details. Chart-month and category selections filter the
same register; Reset filters returns to all history. Every request enforces
the signed-in director's facility before reading records. Its dedicated
operational endpoint prefers a single full-history Databricks query (including
undated records), independent of the dashboard's bounded preview. A published
snapshot fallback is always labeled partial, with available records separated
from published aggregate totals; it never claims an all-time total. Live pages
do not silently switch to snapshot records, and changed data requires a page
restart. LIC 624 uploads remain separate documents and are not merged into
incident totals or automatically linked to these records.

`/admissions` is the aggregate Admissions overview inside Alamo. It opens on a
Briefing, with Pipeline as the second page-level view. Briefing keeps the
executive update concise, then exposes Schedule, Community snapshot, and Open
fields only when those sections have useful content. Pipeline preserves the
three-column desktop board and switches to touch-sized Received, In progress,
and Decision categories on phones. Census uses governed portfolio and community
context from the home-dashboard contract; referral, assessment, and move-in
counts remain unavailable when their publishing coverage is false rather than
being converted to zero. Its primary navigation item follows
Analytics for every authenticated Platform identity. The separate Pipeline
application owns referral intake, uploads, OCR, packet evidence, assessments,
decisions, and other transactional workflow. The `/pipeline` path redirects to
that full application.

The analyst remains a vertical chat/module workspace:

- the user opens **Analytics**, then **Ask a question**, or follows an
  `/analytics/questions` deep link
- the verified Platform owner may instead open the unlisted `/chat` prototype,
  which uses the same analyst, question registry, session, and module pipeline
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
- phone triage exposes High, Medium, and Low as 44px tabs and renders one
  priority lane at a time; desktop retains the simultaneous three-lane view
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
On phones, platform health and the QA summary remain visible first, followed by
one selectable detailed diagnostic section at a time. Desktop retains all
detailed sections in one document.

## Secondary Routes

Current secondary surfaces:

- `/glossary`: platform definitions
- `/outreach`: market-research workspace that opens on the 15 states with verified
  demand research and preserves all 50 through an explicit national view. The
  map is a navigation surface on desktop, not a synthetic heat score. On phones,
  the touch-sized state index is the navigation surface and precedes an
  informational, noninteractive map; the index starts with the priority states
  and can expand to the full selected scope. Every state profile combines
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

Analytics opens with the live Overview, then offers distinct
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

`/analytics/licensing` is a read-only library of the four-community CCLD baseline
for Betty Dominici and Raj Thandi. It lives inside Analytics beside Reports and
Ask a question, with no top-level or community-profile navigation item. The
legacy `/licensing` route preserves query parameters when redirecting to the
new route. Other accounts return to Analytics before any Licensing data mounts.

The page presents a short report summary followed by the complete archived
state-report text in the same reader pane. The display removes recognized
numbered form gutters but does not alter the stored evidence; the complete text
remains downloadable, and the state facility record remains linked. There is no
locally archived PDF or facsimile. The summary is derived from the archived
text, and historical deadlines do not imply current overdue work.

The interface has one search box and an Updates notice. Search understands a
small explicit vocabulary of communities, findings, citation/correction terms,
years, and remaining text terms. It retrieves reports; it is not an unrestricted
AI question-answer service. There are no statistics panels or filter menus.
Report selection and search remain addressable in the URL.

The authenticated `/api/platform/licensing`, `/api/platform/licensing/report`,
and `/api/platform/licensing/updates` endpoints independently enforce the same
two tenant-local Entra object IDs before reading any records. Signed-in
nonmembers receive a generic 404; names, email claims, administrator roles, app
tokens, and development bypasses cannot grant access. Anonymous requests remain
401. The endpoints read a validated, atomic library
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

The Azure Container Apps job runs Mondays and Wednesdays at 9 a.m. Pacific and publishes
updates to the live page without this Mac or Codex. After a complete collection
publishes atomically, changes from that run are also queued for email to Raj
Thandi and Betty Dominici. No-change runs do not send mail. The job persists a
private pending envelope and an immutable sent receipt under the Licensing
storage prefix, retries unsent envelopes on a later execution, and never places
report text or resident information in the message. Delivery uses the existing
connected Office 365 Outlook account through the private
`alamo-platform-licensing-alerts` Logic App; its signed callback URL is resolved
from Key Vault and is absent from source and browser code. The page uses a
compact breadcrumb/Updates row above search, without a visible page title or
subtitle. On phones, Updates opens as a bounded modal sheet, report browsing and
reading are separate views, long state text wraps without horizontal overflow,
and source/download actions become full-width tap targets.
