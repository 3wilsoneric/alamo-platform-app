# Private Behavioral-Health Parent Company Program

- purpose: define the long-running discovery, resolution, and validation program for private adult high-acuity behavioral-health residential operators
- status: active program and acceptance contract
- owners: owner, acquisition analyst, engineering, data platform
- updated: 2026-09-09
- tags: acquisition, fifty-states, parent-company, behavioral-health, residential, entity-resolution
- labels: platform-handbook, active-program, owner-only
- related files:
  - [integration-platform.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/integration-platform.md)
  - [architecture.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/architecture.md)
  - [testing-quality.md](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/testing-quality.md)

## Outcome

Build a defensible United States company universe for private adult
high-acuity behavioral-health residential operators, excluding California.
The primary row is the operating parent company. Facilities, brands, legal
operators, licenses, beds, sponsors, and evidence remain linked beneath it.

The program is a funnel, not a one-time list. Broad screening is deliberately
cheap; authoritative research begins only after owner selection:

1. preserve the national source universe
2. resolve facility records into proposed organizations
3. bucket every proposal by observable scale, fit signal, and private-company likelihood
4. use the buckets to choose a mature-company consideration set
5. freeze an owner-selected research list of approximately 50–100 companies
6. validate approximately 20 high-confidence acquisition candidates

The owner-facing workspace defaults to the 1,067-proposal mature-scale pool and
keeps all 8,516 proposals accessible through scale, service-signal, geography,
screening-capacity, and decision filters. Its first job is selection, not proof. Research, Hold,
and Pass decisions persist without launching research, and an entire visible
page can be added without overwriting prior decisions. Parent/ownership
readiness views and company evidence details remain available behind deliberate
controls so preliminary evidence does not dominate the fast screen. Only a
frozen owner-selected cohort of 50–100 companies authorizes the later research
queue; deep ownership, license, capacity, and valuation work is bounded to that
cohort.

As of the 2026-09-09 local build, the non-California source contains 18,742
indexed facility records, 8,516 organization proposals, and 1,745 broad
consideration candidates. The consideration set is the union of 1,063
non-excluded mature-scale proposals and 682 non-mature proposals with a
qualifying facility-level discovery signal. Eighty-two of the mature proposals
also carry a facility signal, so the full universe contains 764 facility-signal
organizations without double counting the overlap. Of those, 310 carry core
primary-mental-health signals. The datastore also maintains a
500-company screen and a 100-company algorithmic research queue. The broad
universe contains 224 platform-scale signals, 843 regional-scale signals, 1,517
established-local signals, and 5,932 single-site or unresolved proposals. The
combined mature-scale pool therefore contains 1,067 proposals before fit or ownership
verification. Its owner-facing service lanes form a complete partition: 39 have
a likely adult primary-mental-health signal, 21 have an adjacent high-acuity or
SUD signal, 239 are plausibly private mature companies whose service fit still
needs resolution, and 768 remain market context. The first two lanes therefore
contain 60 mature-scale target-service signals. One hundred five established-local
proposals and 316 smaller proposals also carry target signals. These are
screening buckets, not verified claims about company age, revenue, ownership,
or acquisition eligibility. Forty-seven operating-parent
relationships have current cited support, twenty-two have high-confidence private
ownership, and two currently clear the validated-target identity, ownership,
fit, capacity, contradiction, and transparent-value gates. Their operating
valuation inputs remain assumptions, not verified company financials. These are discovery counts, not verified company,
facility, or bed totals.

The first license-evidence slices add twenty-nine current regulator rows beneath thirteen
operating parents plus one Vermont regulator-directory row whose explicit
license status and capacity remain unknown. Twenty-seven current rows publish capacity
and two verify current sites while leaving licensed beds unknown. Five Massachusetts BSAS rows verify 474 adjacent high-acuity
SUD/stabilization beds: 32 for Haven Health Management, 34 for Banyan Treatment
Centers, 64 for Boca Recovery Center, and 344 for Recovery Centers of America.
Three Florida AHCA rows verify 100 core adult residential mental-health beds for
Odyssey Behavioral Healthcare's Lifeskills platform: 16 in Orlando, 50 in
Deerfield Beach, and 34 in Fort Lauderdale. Minnesota DHS adds six current core
licenses: 12 beds across Newport Institute's Monticello and Buffalo programs,
and 24 beds across A Mission for Michael's Arcola, Dellwood, Homestead, and
Otchipwe programs. A second Minnesota slice verifies 72 core beds for Thrive
Behavioral Network across five adult IRTS programs and one adult residential
crisis program. Minnesota also verifies 32 core beds across Kelly-Norton
Programs' Oasis and Bill Kelly House IRTS programs. Georgia HFRD verifies 50
core beds at SB Holdings' Georgia Mental Health Center and 62 core beds across
Southern Live Oak Wellness' Dunwoody Behavioral Health Center and Southern
Live Oak Wellness Academy. It also verifies a 62-bed core slice for Advanced
Recovery Systems across The Recovery Village South Atlanta and Promises Atlanta.
The total is therefore 888 current licensed beds: 414 core
and 474 adjacent. Neither subtotal is represented as a complete national
company portfolio. Tennessee's current daily licensed-site registry adds two
BrightQuest Nashville Adult Supportive Residential Facility rows at 805 and
807 Horner Avenue under Constellation Behavioral Health; the registry does not
publish license numbers or licensed beds for those rows, so neither contributes
to the 888-bed total.

Eleven first-party capacity observations cover seven Virginia AMFM locations,
two BrightQuest Nashville homes, Spruce Mountain Inn, and Discovery Behavioral
Health's four-residence Annapolis campus. Each AMFM location page
reports eight beds, producing 56 operator-reported beds. Those 56 are not added
to the 888 licensed-bed total and remain medium-confidence capacity evidence
until a regulator or equally authoritative capacity source confirms them.
BrightQuest reports a six-resident maximum per home; crosswalking that statement
to Tennessee's two current residential addresses produces a separate
medium-confidence 12-slot observation, not a licensed-bed claim. Discovery's
October 2025 announcement reports that the current adult Annapolis residential
campus expanded to 40 beds; those beds remain medium-confidence reported capacity.
Total operator-reported capacity in the current evidence slices is 130 after adding
Spruce Mountain Inn's first-party 22-resident program maximum. Vermont's
directory does not publish licensed capacity, so those 22 remain separate from
licensed beds.

The workbook valuation formula is now attached to the evidence-backed parent
index rather than only to the original 15-company seed screen. Eleven parents
currently have a calculable known-capacity slice: Newport Healthcare has 12
verified core beds, AMFM Healthcare has 24 verified core beds plus 56
non-overlapping operator-reported core beds, and Odyssey Behavioral Healthcare
has 100 verified core beds. Constellation Behavioral Health has 12
operator-reported BrightQuest Nashville slots crosswalked to two current state
residential listings. Thrive Behavioral Network adds 72 verified core beds
across its current Minnesota IRTS and residential-crisis licenses. Spruce
Mountain Inn adds its separate 22-resident operator-reported program maximum.
Kelly-Norton Programs adds 32 current Minnesota IRTS beds, SB Holdings adds 50
current Georgia adult residential mental-health beds, and Southern Live Oak
Wellness adds 62 current Georgia adult residential mental-health beds. Advanced
Recovery Systems adds a separate 62-bed current Georgia adult residential
mental-health slice. Discovery Behavioral Health adds the separate 40-bed
operator-reported Annapolis adult mental-health campus. The model values 544
evidenced core beds in total.
Each result is explicitly a partial-capacity estimate, never a whole-company
valuation. Adjacent SUD beds, California capacity, and reported capacity that
overlaps a licensed address are excluded from the valued-bed total.

Newport Academy, Newport Institute, PrairieCare, and Center for Families now
resolve to one Newport Healthcare operating-parent row using Newport
Healthcare's current first-party network disclosure. The child and adolescent
brands remain linked for company scale and lineage, but they do not contribute
adult core beds or value. Only the current 12-bed Newport Institute Minnesota
license slice is valued while the remaining adult-eligible Newport and
PrairieCare portfolio is reconciled.

The mature funnel also applies four current parent corrections before owner
screening. Mission Connection is linked beneath AMFM Healthcare as outpatient
context and cannot inflate AMFM's residential capacity. Eating Recovery Center
and Pathlight Mood & Anxiety Center resolve to one private-equity-backed ERC
Pathlight row under Eating Recovery Center, LLC. Monte Nido, Clementine,
Oliver-Pyatt Centers, Rosewood, and Walden resolve to Monte Nido & Affiliates
under Monte Nido Holdings, LLC and remain an adjacent eating-disorder platform,
not a core adult SMI target. NUWAY, Cochran Recovery Services, The Gables,
Arrigoni Housing Support, and the NUWAY Mental Health Clinic resolve to nonprofit
NUWAY Alliance and are excluded from the private acquisition ranks while
remaining visible as market context.

The next mature-platform correction resolves sixty-three additional organization
proposals into four parent decisions. BHG-prefixed records now consolidate beneath
Behavioral Health Group, a Vistria-backed platform with 139 observable locations
across twenty states; current first-party and sponsor evidence identifies the
business as outpatient opioid-use-disorder treatment, so it remains visible as
market context but leaves the residential mental-health funnel. Sagent Behavioral
Health and the former Nystrom clusters resolve to one Nautic-backed row with fifty
observable directory locations across four states. RHA, Salisbury Behavioral
Health, and PAHrtners Deaf Services resolve to one Blue Wolf-backed RHA Health
Services row with eight observable directory locations across North Carolina and
Pennsylvania. The legacy Meadows domains and current Meadows brand records resolve
to one Kohlberg-backed Meadows Behavioral Healthcare row with eleven observable
directory locations across six non-California states. Sagent, RHA, and Meadows stay
in the mature research pool, but their large outpatient, IDD, SUD, eating-disorder,
and other adjacent service lines cannot become core beds or value without state-
license reconciliation. These are source-universe observations, not complete
current portfolio counts.

A further owner-funnel cleanup consolidates forty proposal fragments without
changing the source facility universe. Ninety-four Pinnacle records now roll up
to Pinnacle Treatment Centers, Inc.; Linden's current portfolio verifies the
private sponsor, while the SUD-primary platform remains adjacent rather than core.
Fourteen AdCare, Desert Hope, Greenhouse, Oxford, Recovery First, and River Oaks
records roll up to American Addiction Centers; the current first-party site
verifies the brand family and for-profit status, while beneficial ownership remains
open. Seventeen Embark records resolve to one mixed youth and young-adult parent;
only a future licensed non-California young-adult residential slice can qualify as
core. Emerald Coast Behavioral Hospital and a matched UHS-domain record resolve
to publicly traded Universal Health Services and leave the private acquisition
funnel. Company maturity and service fit remain separate dimensions in each case.

The next screening correction turns four misleading brand rows into four usable
company choices. Fifteen Sandstone directory records resolve to Sandstone Care,
LLC under The Vistria Group; its verified young-adult mental-health residential
offering preserves a mixed core-and-adjacent signal, but no capacity is yet
counted. Northpoint Recovery and Imagine by Northpoint consolidate into seventeen
records beneath Northpoint Recovery Holdings, LLC; its current adult inpatient
programs remain SUD-primary and the complete current sponsor table stays open.
Bradford, Lakeview Health, Parkdale, Cornerstone, and Stepping Stone records
consolidate into nineteen records beneath Bradford Health Services, LLC and its
current Lee Equity governance. Sunrise Detox and Evolve Recovery records
consolidate into sixteen records beneath Mayfair-backed Praesum Healthcare
Services, LLC. Bradford and Praesum are mature SUD-primary adjacent platforms,
not verified adult primary-mental-health residential targets. The record counts
describe the source universe after entity resolution; Bradford reports more than
28 current facilities, Praesum reports more than 30 centers, and Northpoint
reports 17 centers, so source records must never be presented as complete current
location counts.

The first core-license review also establishes important non-capacity facts.
Virginia lists A Mission for Michael under an active adult mental-health
residential group-home service license with seven locations, but publishes no
bed total; AMFM's current pages provide the separate 56-bed reported total.
Minnesota verifies 24 additional AMFM core beds under Lakeside Health Solutions
LLC. Nebraska lists Center for Psychiatric Rehabilitation as active and
owned by Integrated Behavioral Health Services, but also publishes no bed
total; the company's current founder/CEO/Owner disclosure clears its private-
ownership gate, while a 2021 state roster's 16-bed figure remains historical
context rather than a current bed count. BrightQuest's current legal notice and
About page resolve the brand to Constellation Behavioral Health, and NMS
Capital's current portfolio plus its acquisition announcement clear the sponsor
and private-ownership gates. Tennessee verifies the two Nashville residential
addresses, but licensed capacity remains open. Maryland lists five Ijomah & Associates residential-crisis sites with
displayed expiration dates of July 30, 2026; renewal status remains an open
contradiction and those sites are not counted as currently licensed capacity.
Discovery Behavioral Health's June 2026 announcement of planned HPS-majority
ownership is also stored as an open contradiction because the transaction was
conditioned on regulatory approval and a closing notice has not been located.
Pyramid Healthcare now consolidates the legacy pyramidhc.com,
pyramid-healthcare.com, and pyramidhealthcarepa.com clusters into one
evidence-backed operating parent. Current first-party material reports more
than 80 locations, but its sponsor remains medium-confidence and no bed total is
valued until primary adult mental-health capacity is separated from the larger
SUD, eating-disorder, autism, school, outpatient, and youth portfolio.
Thrive Behavioral Network's current site resolves its 23-program operating
portfolio, while Minnesota DHS verifies six active core licenses totaling 72
beds under Thrive Behavioral Network II LLC and III LLC. A first-party owner
disclosure, the federal directory's private-for-profit classification, and
Minnesota business-registry records identifying the same owner as current
manager of both active domestic LLCs clear the private owner-operated gate.
The ultimate umbrella legal parent remains unresolved. Minnesota also publishes
2026 licensing-action links for Gull
Harbour, Willow Haven, and Milestones; those remain open transaction-diligence
items even though all three licenses are active.

Spruce Mountain Inn is now resolved to Spruce Mountain Inn, Inc. through its
current first-party site, Vermont's therapeutic-care-home directory, and the
Vermont Secretary of State business registry. The operating company, active
domestic-corporation identity, adult residential mental-health fit, and
22-resident program maximum are evidenced. Beneficial ownership remains
unproven, and the state directory publishes neither an explicit license status
nor licensed capacity; the company therefore remains pending private
verification with a partial operator-reported capacity valuation only.

Kelly-Norton Programs is resolved to Kelly-Norton Programs, Inc. Minnesota's
business registry verifies the active operating corporation, and Minnesota DHS
verifies two current 16-bed adult IRTS licenses at Oasis and Bill Kelly House.
The resulting 32-bed core slice has high-confidence parent, ownership, target-fit,
and current licensed-capacity evidence with no open contradiction.

SB Holdings, LLC is resolved as owner and operator of the Sylvia Brafman network.
Georgia HFRD verifies the current 50-bed Georgia Mental Health Center adult
residential mental-health license. A separately announced future 70-bed facility
is excluded until it is open and licensed. A current Florida survey fine remains
an explicit contradiction, so SB Holdings cannot enter the final cohort yet.

Southern Live Oak Wellness, LLC is resolved as the active Georgia operating
holding company for the evidenced Southern Live Oak and Dunwoody slice. Georgia
HFRD verifies current 54-bed and 8-bed adult residential mental-health licenses,
for 62 non-overlapping core beds. Youth and SUD-primary affiliates remain outside
that core total. This parent currently clears the promotion gates with no open
contradiction, while its value remains only a formula-based known-capacity slice.

## Scope Contract

Core candidates must have evidence for all of the following:

- United States location outside California
- private for-profit ownership
- adults or young adults, not youth-only programming
- staffed residential or comparable 24-hour setting
- primary mental-health treatment plus a high-acuity signal such as adult RTC,
  serious mental illness, crisis/subacute care, or psychosis
- an operating parent that can be separated from its sponsor, brands, legal
  operators, and licensed facilities

Adjacent records stay searchable but do not outrank core records:

- SUD-primary residential platforms with dual-diagnosis capability
- eating-disorder-only programs
- sober living, transitional housing, and unstaffed recovery housing
- hospitals without a separable residential asset
- mixed-age programs whose adult service cannot yet be isolated

Public companies, government entities, nonprofits, California facilities, and
youth-only operators remain in lineage or market context but are excluded from
the private target ranking.

## Broad Screening Buckets

The broad layer exists to organize thousands of imperfect company proposals so
the owner can choose where research time should go. It does not require exact
parent ownership, licensed beds, or valuation inputs.

Maturity is an observable scale proxy, not a conclusion about company age or
financial performance:

- `mature_scale_signal`: the combined owner-facing pool of platform-scale and
  regional-scale proposals; this is a search filter, not a stored maturity tier
- `platform_scale_signal`: at least three represented states or at least ten
  observable locations
- `regional_scale_signal`: at least two represented states or at least four
  observable locations
- `established_local_signal`: at least two observable locations
- `single_site_or_unresolved`: one represented facility or insufficient scale
  evidence

Each proposal is also assigned one owner-facing selection bucket:

- mature target signal
- established target signal
- smaller target signal
- mature company needing service-fit review
- market context

Private-company likelihood remains separate: verified private, supported
private, directory private signal, unresolved, or excluded. A directory signal
can support screening but can never become high-confidence ownership by itself.

Observable footprint is split into non-overlapping ranges for cheap triage. The
1,745-company consideration pool contains 527 one-location proposals, 231 with
two or three observable locations, 803 with four through nine, 157 with ten
through twenty-four, and 27 with at least twenty-five. Geography is independent:
1,529 appear in one state, 174 in two through four states, and 42 in five or more.
These are counts of represented source records after entity resolution, not
verified current operating locations.

The screen also carries a low-confidence bed proxy for the observable candidate
residential sites. It uses anonymized 2024 N-SUMHSS non-California private
for-profit adult residential records to derive per-site p25/p50/p75 ranges:
8/16/34 beds for the 246-site core mental-health sample, 11/24/45 for the
312-site adjacent sample, and 10/20/44 for the 432-site broader unresolved
residential sample. Organization ranges sum those peer values only across named
candidate sites. A current licensed, operator-reported, or valued-bed figure can
floor the range, but potentially overlapping evidence totals are never added.

The resulting consideration-pool midpoint/base-proxy buckets are: 599 under 25
beds, 121 at 25–74, 30 at 75–149, 11 at 150–299, and 3 at 300 or more. The
300 threshold is also shown as a range test: one company's lower bound is at
least 300, three base cases reach 300, and sixteen upper bounds reach 300.
These are scenario counts, not a claim that the market contains only three
300-bed companies. Another 981 are
not estimable because their apparent company scale comes from non-candidate or
fit-unresolved sites. The proxy is explicitly a partial observable-site range,
not a verified or whole-company bed count, and it cannot create a valuation.
Verified licensed beds, operator-reported capacity, and formula-valued known
capacity remain separate evidence classes.

The six capacity groups are clickable owner-screen lanes, and the API also
supports a combined `estimable` filter. Combining non-excluded consideration
status, mature scale, and an available range produces 82 companies. This is a
useful owner-review lane—not a validated target list—because it is already
inside the intended 50–100 selection range while retaining the separate fit,
parent, ownership, and evidence warnings.

Third-party listing and hosted-site domains do not count as company identity or
scale evidence. Psychology Today, Rainier Rehab, Recovered.org, Rehab.com,
social networks, Wix, WordPress, Google Sites, and comparable hosts are removed
before domain clustering. Their facility records remain in the universe and
fall back to conservative exact-name proposals; unrelated providers can no
longer become an artificial multi-state company merely because they share a
listing website.

## Entity Model

The relationship chain is:

`sponsor → operating parent → legal operator → brand → facility → license`

- Sponsor answers who supplies capital or controls the investment vehicle.
- Operating parent is the company shown in the acquisition list.
- Legal operator is the entity named on a license, NPI, accreditation, or state
  corporate record.
- Brand is the patient-facing trade name or family of programs.
- Facility is a physical program location.
- License is the authoritative state authorization, status, service type, and
  capacity for that facility.

No layer is silently substituted for another. Conflicting evidence is stored
as a contradiction instead of being overwritten.

## Confidence Model

Confidence is dimensional:

- Parent relationship becomes high when a current authoritative source
  explicitly connects a brand, domain, or legal operator to the operating
  parent.
- Legal identity becomes high after the operating entity is reconciled to
  state corporate or licensing records and names/effective dates agree.
- Private ownership becomes high after current ownership is supported by a
  corporate filing, transaction announcement, sponsor portfolio, or equivalent
  authoritative evidence and public/nonprofit status is ruled out.
- Target fit becomes high after adult population, staffed residential setting,
  and high-acuity primary mental-health service are verified.
- Facility count becomes high only after official locations and state licenses
  are reconciled and duplicate directory rows are removed.
- Bed count becomes high only from active licenses or an equally authoritative
  capacity source with an as-of date; website room counts and modeled beds stay
  reported or estimated.
- A verified individual license does not make the parent portfolio complete.
  The parent retains a licensed-capacity gap until every relevant facility is
  reconciled and duplicate programs, campuses, and license grains are removed.
- Valuation is never labeled verified merely because inputs are high confidence.
  It remains a formula-derived estimate unless a disclosed transaction supports
  the value.

An operator enters the final cohort only when parent relationship, legal
identity, private ownership, target fit, facility count, and capacity have all
passed their gates. Open contradictions prevent final approval.

The queryable `validated_targets` stage is stricter than the broad 100. It
requires eligible private ownership; high-confidence parent relationship,
legal identity, ownership, adult core fit, and capacity; positive current
regulator-verified core beds; a positive known-capacity valuation; no California
exposure; and no open contradiction. It receives a deterministic validated rank
separate from the discovery-screen rank. A validated rank does not convert the
formula result into a whole-company valuation or verified transaction value.

## Build List

- Maintain a versioned, cited parent-assertion registry outside generated data.
- Merge multiple brand domains into one operating-parent rollup without losing
  the underlying facility rows.
- Keep known public parents in market context and out of private rankings.
- Create durable entity, relationship, evidence, contradiction, and observation
  tables in the Alamo Azure data boundary.
- Add state-license adapters with raw captures, source hashes, effective dates,
  status normalization, and licensed-capacity extraction.
- Reconcile facility addresses and legal operators deterministically before
  using fuzzy matching.
- Add evidence-expiry and stale-ownership queues.
- Add saved screen definitions for universe, 500, 100, and final cohort stages.
- Add parent-level bed and valuation rollups that expose reported, estimated,
  and verified quantities separately.
- Keep the broad facility and workflow interfaces implemented but hidden until
  the parent-company product is ready.

## Research List For Every Priority Parent

- Confirm the operating-parent name and canonical legal entity.
- Identify the sponsor or controlling owner separately.
- Establish private, public, nonprofit, or government ownership.
- Enumerate every brand and alternate name.
- Enumerate non-California locations from the company's current site.
- Match every proposed facility to an active state license.
- Capture license number, legal operator, license type, status, effective date,
  expiration date, and licensed capacity.
- Confirm adult eligibility and remove youth-only beds.
- Confirm primary mental-health, SMI, crisis/subacute, and co-occurring services.
- Separate residential treatment from hospital, outpatient, detox-only, sober
  living, and housing records.
- Resolve duplicate directories, campuses, programs, and addresses.
- Record acquisitions, divestitures, closures, and renamed facilities.
- Store sources for every material assertion and log conflicting facts.
- Calculate verified facility and bed totals only after reconciliation.
- Apply workbook valuation formulas to the verified or explicitly bounded inputs.
- Treat every capacity-derived valuation as a known-capacity slice until the
  entire parent portfolio and operating assumptions are reconciled.
- Produce a one-paragraph investment-screen summary with the unresolved risks.

## Research Waves

The algorithmic 100-company queue is a starting suggestion, not a command to
research every ranked name. The owner first filters the broad buckets for
maturity, service fit, geography, and private-company likelihood, then selects
approximately 50–100 companies. California is excluded.

The suggested 500 and 100 preserve the owner's preference for mature platforms
without pretending unresolved fit has been verified. The suggested 100 contains
all 60 mature target-service signals, followed by the 40 highest-ranked mature
companies whose service fit still needs resolution. The 500-company screen is
now entirely mature-scale: 223 platform-scale and 277 regional-scale proposals.
It contains the 60 target-service signals, all 239 mature companies needing fit
resolution, and 201 additional mature market-context proposals. Those 201 are
included for owner choice because scale is the current screen; they remain
explicitly unresolved on service fit and ownership and cannot become validated
targets without evidence.

The owner screen exposes the mature-scale universe as five clickable views: all
1,067 proposals, 39 likely adult mental-health signals, 21 adjacent or SUD
signals, 239 companies needing fit resolution, and 768 market-context companies.
The four substantive lanes are mutually exclusive and sum to the mature-scale
total. Clicking a lane changes only the cheap screening view; it does not create
a research job, mark a company selected, promote evidence confidence, or attach
a verified bed count.

The 60 mature target-service signals have a second, overlapping readiness
screen. Thirty have a current cited operating-parent relationship and 30
remain brand/domain proposals that need parent resolution. Eighteen have
current evidence supporting private ownership; the other 42 retain an
ownership gap. Clickable parent-evidenced, parent-to-resolve, and verified-
private views let the owner choose how much unresolved identity risk to admit
before creating the research list. These counts do not promote directory
ownership or scale signals into evidence.

The owner can add the current filtered page to the research list in one bounded
operation. A page contains at most 50 companies. The operation selects only
eligible rows with no existing owner decision, preserves every prior Research,
Hold, and Pass decision, skips known public or out-of-scope companies, and stops
the active list at 100. It requires the exact selection revision displayed by
the browser and persists all additions in one atomic revision, so a stale page
cannot overwrite newer work. Page selection does not freeze a cohort or create
research jobs; those remain separate explicit actions after the owner trims the
list to the intended 50–100 companies.

The exact filtered company view can also be downloaded as an owner-only CSV.
Exports use the same datastore filters and global sort as the screen, contain
one row per company proposal, and are capped at 500 rows. Columns expose the
company identity status, scale signal, observable-location band, states,
service, private-likelihood and screening-bed buckets, confidence dimensions,
peer-derived low/base/high screening capacity, known licensed and reported capacity, bounded
low/base/high valuation outputs, owner decision, and remaining research gaps.
They do not expose the hidden facility workflow or represent unresolved values
as verified. When a filtered view exceeds 500 companies, the artifact says it
is truncated so the owner can refine the filters and export another slice.

Wave 1 performs a light parent/name and current-location sanity check on the
owner-selected list. Wave 2 performs full ownership, license, bed, and
valuation research only on the survivors. Wave 3 validates approximately 20
companies end to end. A recurring refresh later rechecks sources and sends
changed evidence back through review.

Once the owner has selected 50 through 100 companies, the live list can be
frozen into an immutable research cohort. The freeze is rejected outside that
range, when selected identities have unresolved merge conflicts, or when the
selection revision changes during the operation. Each cohort member snapshots
its parent identity, screening profile, states, facility counts, confidence
dimensions, capacity evidence, evidence IDs, research gaps, and current
known-capacity value. Idempotency keys prevent a retried request from creating
duplicate cohorts. Local and Azure persistence both retain revision archives.

## Analyst And Agent Harness

AH Analyst is the overview agent. It reports funnel counts, research queues,
confidence gaps, contradictions, and next-best work without inventing parent or
capacity facts. Specialized research workers may gather narrow evidence for
ownership, licensing, services, capacity, and valuation, but they return
proposals with citations. Deterministic validators own entity merges, scope
gates, arithmetic, and promotion between funnel stages. Human approval owns the
final high-confidence decision.

The harness needs:

- bounded research jobs with one parent or one state source per job
- source allowlists and preference for first-party, regulator, accreditor, SEC,
  and state corporate records
- structured outputs validated before persistence
- idempotent ingestion and content-addressed source captures
- evidence-to-assertion links and effective dates
- contradiction detection and mandatory review
- retry, timeout, rate-limit, and source-change handling
- evaluation fixtures for false merges, missed aliases, public-company leakage,
  California leakage, duplicate beds, and stale ownership
- a complete audit trail from source capture through analyst approval
- persistent owner selection decisions so the 50–100 company research list is
  stable across sessions and refreshes

## Next Engineering Sequence

1. Use the full-universe scale, fit, and private-likelihood buckets to assemble
   a mature-company consideration set with the owner.
2. Persist the owner's include, hold, and exclude decisions and freeze an
   approximately 50–100 company research list.
3. Perform light parent/name and current-footprint sanity checks on that list;
   do not exhaustively resolve the remaining thousands.
4. Reconcile ownership, licenses, and beds for the selected survivors,
   preserving operator-reported capacity separately and retaining unknowns
   when a regulator does not publish capacity.
5. Apply workbook valuation formulas only to verified or explicitly bounded
   inputs, then validate approximately 20 companies end to end.
6. Materialize the entity graph, evidence ledger, and owner decisions in the
   Azure production datastore when the revised workflow is approved for release.

The owner-only parent screen now pages through the full proposal universe and
supports the screening buckets, maturity scale, service fit, private-company
likelihood, 500-company and 100-company funnel stages, state search, parent
confidence, capacity evidence, evidence sources, confidence gaps, and the
known-capacity valuation output. It opens on the combined platform- and
regional-scale pool so the owner can screen the broad mature-company universe
before choosing 50–100 names. The detailed facility research workflow stays
implemented but hidden from the primary company view.

Every filtered view now carries its own complete-view quality breakdown before
pagination: platform, regional, established, and smaller scale signals;
evidence-backed versus unresolved parent rows; core versus adjacent or
unresolved fit; verified-private versus ownership-pending records; and the
number with regulator-verified core beds or a known-capacity valuation slice.
The selected row also separates “why shortlisted” from “needs proof,” so a
scale signal cannot be mistaken for a verified parent, ownership claim, bed
count, or whole-company value.

All company sorts execute in the datastore before pagination. Rank, maturity,
fit score, known core beds, known-capacity value, and company name therefore
order the complete filtered universe rather than only the 50 rows already
loaded in the browser.

The owner can enter separate unreviewed triage lanes for the suggested 100, the
screen 500, or the full mature-scale universe. Each lane resets conflicting
filters, hides previously decided names, and uses the relevant funnel rank or
maturity order. Persistent reviewed, selected, and remaining counts are
calculated separately for the 100, 500, and mature pool from the same durable
decision store. Research, hold, and pass actions are available on every company
row. In triage mode, a saved company disappears from the undecided queue and
the next proposal becomes active.

The same list can be assembled a page at a time after applying any bucket,
service, scale, state, ownership-likelihood, or rank filter. Page add is limited
to the 50 visible rows, ignores already reviewed companies, rejects stale
selection revisions, and will add only the remaining slots before the
100-company ceiling. This is a screening accelerator, not evidence promotion:
it neither changes confidence nor starts the agent research queue.

Generated company identifiers may change when a domain proposal is consolidated
into an evidence-backed operating parent. Every decision therefore snapshots
exact parent, group, domain, and normalized-name identity keys. On rebuild, a
decision is reattached only when strong exact keys—or, when no strong key
matches, a unique exact normalized name—identify one current company. Unmatched
and ambiguous decisions stay preserved as owner-visible identity-review items;
conflicts are never resolved with fuzzy matching. Older version-one decisions
derive domain and exact-name keys when read, so the additive identity contract
does not abandon the existing local or Azure selection store.

Cohort freeze also generates a deterministic research queue only for frozen
members. Phase one contains bounded parent/legal-identity, private-ownership,
adult high-acuity fit, and current location-inventory jobs. Phase two creates
one license-and-capacity job per observed non-California state, dependent on
location inventory and any open fit job. Phase three creates the valuation-input
job, dependent on state-capacity and any open ownership work. Jobs already
satisfied by high-confidence frozen evidence are omitted, except that the
current location inventory is always refreshed before state reconciliation.
Job IDs are deterministic within the cohort, retries cannot duplicate them,
and no jobs are created for the thousands of unselected proposals.

The queue is executable through the owner-only
`/api/platform/acquisition/operator-research-job` endpoint. A worker claims the
next dependency-ready job by cohort and optional job kind. The store performs
the claim atomically, issues a single settlement token, persists only its
one-way hash, and expires the lease after a bounded 60–3,600-second interval.
Concurrent workers cannot receive the same live lease; expired work can be
reclaimed with a rotated token and incremented attempt count. A worker may
complete, block with required notes, or release a claimed job.

Completion requires a structured result with an outcome, summary, at least one
HTTPS source, and valid evidence-to-source citations. An `evidence_found`
result also requires at least one cited assertion. Assertions, contradictions,
sources, attempts, and worker identity remain in the revisioned owner store.
Every completed result is labeled
`proposal_pending_deterministic_validation`: it does not edit the parent
registry, license registry, capacity totals, frozen confidence snapshot, target
rank, or valuation. Deterministic validation and owner approval remain separate
promotion steps. Invalid payloads and invalid or expired leases leave the job
unsettled so evidence cannot be silently lost or promoted.

Research, hold, and pass controls write owner decisions to a separate mode-0600
local store in development and an ETag-protected private Azure Blob in
production. Proposal rebuilds and source refreshes do not overwrite those
decisions.

## Release Gates

- California cannot appear in target ranks, target bed totals, or valuation.
- Public-company parents cannot receive a private-target rank.
- A domain or fuzzy name alone cannot create a high-confidence relationship.
- Parent merges retain all original records and evidence.
- Every high-confidence field has a current authoritative source and as-of date.
- Open contradictions block final-cohort promotion.
- Bed totals expose source type and never combine incompatible license grains.
- Formula-derived values expose the exact assumptions and low/base/high output.
- All acquisition routes remain owner-only and return not-found behavior to
  unauthorized users.

## Source Refresh Check

`npm run acquisition:verify-license-sources` downloads a bounded text
extraction of each configured regulator workbook or facility profile and
requires every curated license row to match exactly once. The extraction
service is transport only; the state regulator remains the cited authority. A
missing or changed row fails the check so the assertion can be reviewed before
the next publish.

`npm run acquisition:verify-capacity-sources` applies the same bounded,
exact-fingerprint check to non-regulator capacity observations. These records
remain labeled operator-reported even when every source page still matches.
