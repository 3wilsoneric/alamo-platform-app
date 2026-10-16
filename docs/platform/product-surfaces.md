# Product Surfaces

- purpose: document the current user-facing platform routes and modules
- status: authoritative current-state reference
- owners: product, frontend
- updated: 2026-10-12
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
Betty Dominici, Raj Thandi, and Eric Wilson also see EveryAgent in that row. No
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
overview links directly to full-page MARs and Incidents workspaces instead of
repeating those destinations as header tabs. Existing `?view=mars` and
`?view=incidents` links still open the corresponding workspace. The searchable,
paginated incident register lives in
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
Reports also has **New LIC 624**, which creates a native draft and opens that
same editor without a file upload. Native drafts can be saved incomplete,
reopened, filtered by Drafts, and marked reviewed after the required checks.
They are labeled Created in app and have no Original-file action. Native entry
does not generate an official PDF, file the report, or create an incident.
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
category, recorded incident type, occurred-year, derived-priority, and inclusive date filters, and returns 25 records per page with
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

The main Platform's `/incidents/history` route opens the same governed register
across the five Alamo communities, reachable from the recent Incident Center.
It adds a community filter and shows community on each record. The ordinary
Platform API permits portfolio scope; the Executive Director endpoint never
accepts `all` and still resolves facility access from the signed-in role. Both
routes support newest/oldest, type, category, and derived-priority sorting.
Derived priority is provisional operational grouping, not source severity:
High means recorded sentinel event or emergency-services notification, Medium
means recorded injury, Low requires all three explicit No values, and Unknown
catches missing/ambiguous flags. A connected live source is labeled complete
only for that source; a bounded published-snapshot fallback is clearly partial.
Neither view includes LIC 624 upload counts.

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

## Private Presentation

`/presentation` displays the supplied 16-slide Alamo Data Strategy deck in a
full-window 16:9 desktop viewer. The presentation shortcut is temporarily removed
from both the main and Executive Director headers; authorized users can still
open the direct `/presentation` link. An explicitly authorized presentation account can
enter `/presentation` even if its normal workspace is otherwise zone-restricted;
the slide and route APIs retain their separate server-side access checks. The
phone menu has no shortcut.
The viewer's full-screen control requests browser full screen; browsers without
that API retain the full-window viewer. Arrow keys, space, swipe, previous/next, and the slide picker
navigate. F toggles full screen, S toggles speaker notes, and Close returns to
the originating Platform page. Slide hashes support direct links. Screenshot
slides for the Community dashboard, admissions file, Pipeline assessment, and
Workforce have an **Open** link in the viewer controls. It opens the live route
in a separate tab without replacing the deck; the destination still enforces
its own existing access rules. The admissions screenshot opens the Community
dashboard, where its client notification can be selected, rather than claiming
a deep link to an already-open client file.

The deck, images, and self-hosted fonts are private server files, excluded from
Git because the source repository is public. Import the private package locally
and ship it only inside the authenticated Azure registry image. Every request
to `/api/platform/presentation`, `/access`, or `/asset` first uses the existing
Entra API authentication boundary. Content requests additionally require Eric's
pinned tenant object ID or Andrew's explicitly configured identity via
`PLATFORM_PRESENTATION_ANDREW_OBJECT_ID` (preferred) or
`PLATFORM_PRESENTATION_ANDREW_EMAIL`. An object ID disables the email fallback.
Without Andrew's configuration, only Eric is authorized. Admin roles and service
principals do not grant access. Nonmembers receive generic 404 responses and all
responses are private/no-store. Explicit development bypass is local-only and
cannot authorize production or Vercel preview requests.

The viewer loads assets into memory after authorization and isolates each slide
in a script-free sandbox. Notes are hidden by default. Preserve the original
deck and font licenses under `server/presentations/alamo-data-strategy`; do not
move these assets into `public`, `src`, or `dist`. Vercel includes this private
directory in the API function bundle. An Azure release must include the new
server module and private asset directory alongside the frontend/API updates,
and configure Andrew before enabling his access. Run `npm run check:presentation`
to verify permission boundaries; `npm run check:presentation:release` also
requires and validates the private package before it can be released.

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
- medication profile, compliance, current orders, resident watchlists, and exact MAR exception/PRN detail
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

`/analytics/agent` is the EveryAgent work surface, also reachable through
`/everyagent` and a shared-header entry for its three pilot users. It opens on
an assistant introduction and a readable personal briefing. A green orb and
compact skill links establish one general EveryAgent; findings and their original
sources lead the page. Monitoring controls sit behind “Manage my skills,” with
review actions and persisted check history retained. Each user can pause their own monitoring
and narrow Licensing community scope. Shared collection continues independently.
Eric also receives a read-only Admissions watch skill over the protected Pipeline
summary. Sources that are unavailable or not connected are labeled explicitly.
The workspace has no prompt-first intake and displays that email delivery is off.

For the same pilot accounts, a persistent green EveryAgent launcher is embedded
in the authenticated Platform shell. It opens a keyboard-accessible dialog with
an introduction, the current page name, up to two recent findings (unreviewed
work first), skill links, and the full briefing. “Ask a question” opens the
existing question workspace; this release does not add conversational planning
or read arbitrary page content. The greeting uses the signed-in profile when
available. A dismissible first introduction is scoped to that account’s browser
session; no report or work content is stored there. One account-keyed provider
shares polling and mutation state across the page and companion, retains results
on failures, and stops polling while the document is hidden. Restricted admissions,
executive-only accounts, executive pages, and presentation mode do not mount the
companion. The feature is currently embedded in Platform; Pipeline remains a
connected skill rather than a second host for this UI.

Licensing remains a read-only library of the four-community CCLD baseline for
Betty Dominici, Raj Thandi, and Eric. `?skill=licensing` opens its existing rich
module. The legacy `/licensing` and `/analytics/licensing` routes preserve query
parameters and add the Licensing skill when redirecting. Other accounts return
to Analytics before any Licensing or EveryAgent data mounts.

The Licensing skill opens with a green EveryAgent work summary and an explicit
“Active skill: Licensing” label. The latest report module appears immediately. It shows the real last-check status, archived report
count, community count, and automatic check schedule. Failed or unavailable
checks are labeled; the UI never animates a fictitious scan. A secondary
Explore reports control provides community selection and evidence views for
latest reports (up to eight), substantiated complaint findings, cited
deficiencies, recorded correction plans, or the full library. A community
selection scopes the query. The module reports its date range and historical
evidence counts, then drills into an individual report. Back preserves the
question and scope; report links remain directly addressable. It uses the
existing authenticated library and deterministic question filters, not a new
LLM runtime.

The individual reader opens with a formatted brief: the state finding, topics, reported
concerns, finding excerpts, and cited deficiencies with their correction plans.
Source references jump to their narrative page. Report text is an always-open
reading view with page markers, explicit source headings, bullets, and spaced
paragraphs capped at sentence boundaries. Repeated form headers, signature
fields, standard notices, and continuation instructions are omitted from that
reading view; the complete original remains available by download. Citation
excerpts remain available through disclosures. Missing extraction is
labeled, mixed complaint findings stay distinct, and historical correction
deadlines do not imply current overdue work. Report-list entries show the
finding headline and topics instead of a truncated generic form title.

The original-source action links to the stable state facility record and names
the report date and complaint number to locate in its report list. The state's
per-report API uses a changing inventory index, so that URL is not persisted as
a stable document link. There is no locally archived PDF or facsimile. Display
formatting removes recognized numbered form gutters; the original-text download
preserves the stored text byte for byte. Briefs derive only from that evidence.

The secondary exploration panel also offers a report-finding box and an Updates notice. Search understands a
small explicit vocabulary of communities, findings, citation/correction terms,
years, and remaining text terms. It retrieves reports; it is not an unrestricted
AI question-answer service. It does not infer current compliance from archived findings. Question, community,
report selection, and search remain addressable in the URL.

The authenticated `/api/platform/licensing`, `/api/platform/licensing/report`,
and `/api/platform/licensing/updates` endpoints independently enforce the same
three tenant-local Entra object IDs before reading any records. Signed-in
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
Each collection rechecks the official facility profile and complete report
inventory. If a report's source ID and every inventory field are unchanged, the
collector may reuse its archived HTML and text only after verifying both
artifact hashes, the text hash, and the record fingerprint. It preserves the
original report-body retrieval time. A short probe audits one unchanged body
per facility when the state endpoint responds; it does not assume one response
means every report body is reachable. The audit is marked sampled or deferred
accordingly. A new or changed report must be retrieved and parsed live, or
the scan fails without replacing the last complete library.

Baseline records do not generate alerts; new, revised, removed, and reappearing
records do. The page refreshes Updates once per minute. `--refresh-feed-only`
rebuilds the feed without fetching CCLD. Original ledger and evidence remain in
`output/ccld-baseline/data`; restore those from the private evidence archive if
moving the collector to a different machine.

The Azure Container Apps job runs Mondays and Wednesdays at 9 a.m. Pacific and publishes
updates to the live page without this Mac or Codex. **Email delivery is paused
at the user’s request.** The job notification flag is false and the alert Logic
App is Disabled. Do not enable either without a new explicit user instruction.
After a complete collection publishes atomically, changes may still be queued
for later review; the prepared recipients remain Raj Thandi and Betty Dominici. Messages name the community and change, include the
report date when present, and link directly to its brief and original-source
actions. Facility-level changes link to Licensing Updates. No-change runs do
not send mail. Delivery requires an explicit activation timestamp; older queued
notices remain archived and are skipped. The job persists a
private pending envelope and an immutable sent receipt under the Licensing
storage prefix, retries unsent envelopes on a later execution, and never places
report text or resident information in the message. Delivery uses the existing
connected Office 365 Outlook account through the private
`alamo-platform-licensing-alerts` Logic App; its signed callback URL is resolved
from Key Vault and is absent from source and browser code. The page uses a compact context/Updates row above the green agent entry. On phones, Updates opens as a bounded modal sheet, answer modules and
report reading are separate views, long state text wraps without horizontal overflow,
and source/download actions become full-width tap targets.
