# Private Behavioral Health Operator Filtering Universe

- purpose: parent-level screening universe for filtering private adult behavioral-health operators before license-level research
- status: working research screen; capacity estimates are not certified totals
- owners: owner, acquisition analyst, data platform
- updated: 2026-09-09
- tags: acquisition, fifty-states, behavioral-health, parent-company, operator-screen, capacity, states
- labels: working-research, owner-only, california-excluded, no-valuation

**As of:** September 9, 2026\
**Scope:** Parent-company view of private or potentially acquirable U.S. behavioral-health operators, excluding California\
**Purpose:** A broad screening universe to filter from thousands of facilities to a manageable operator list before high-confidence license and capacity research

This file intentionally contains **no enterprise-value, valuation, or EV-floor field**. It is a research screen, not a valuation output.

## How to read the screen

- **Operating states** means known physical operations, not telehealth coverage or referral reach. California locations are omitted.
- **Capacity signal** is a screening estimate or a documented lower bound. It is not yet a certified company-wide licensed-bed total unless explicitly labeled exact.
- **Core fit** measures relevance to the adult, private, higher-acuity residential behavioral-health thesis:
  - **A:** Strong adult residential mental-health, crisis, IRTS, subacute, or comparable non-hospital fit.
  - **B:** Mixed adult mental-health, co-occurring, and substance-use residential fit.
  - **C:** Residential substance-use treatment is the primary fit.
  - **D:** Acute hospital, youth, eating-disorder, IDD, outpatient-heavy, or otherwise adjacent to the core thesis.
- **Payer signal** is directional. `Commercial` favors private insurance or private pay; `Public` favors Medicaid or public reimbursement; `Mixed` spans both.
- **Ownership confidence** answers whether the operating facilities have been resolved to the listed parent—not whether the business is definitely available for acquisition.
- **Maturity** is a practical screen for operating history, multi-site infrastructure, and corporate scale.

## Recommended filter fields for the Platform

The eventual datastore should make these fields independently filterable:

| Field | Suggested values |
| --- | --- |
| `screen_status` | Evidence-backed, Probable 100+, Hold, Exclude |
| `operating_states` | Multi-select state abbreviations; California never included |
| `capacity_band` | Under 100, 100–249, 250–499, 500–999, 1,000+, Unknown |
| `capacity_basis` | Exact current total, Published lower bound, Regulator-verified slice, Company claim, Footprint estimate |
| `core_fit` | A, B, C, D |
| `care_setting` | Adult residential MH, Crisis/IRTS/subacute, SUD residential/detox, Acute psychiatric hospital, Outpatient/OTP, Supported living/IDD |
| `population` | Adult, Mixed ages, Youth/adolescent, Geriatric, Specialty |
| `clinical_mix` | Mental health, SUD, Co-occurring, Eating disorder, IDD/autism |
| `payer_signal` | Commercial, Public/Medicaid, Mixed, Unknown |
| `ownership_confidence` | High, Medium, Low, Nonprofit/eligibility issue |
| `maturity` | National platform, Mature regional, Emerging multi-site, Local/single-state |
| `geographic_shape` | National, Multi-region, Regional cluster, Single-state |
| `contamination_risk` | Low, Medium, High—share of footprint outside the target thesis |
| `next_verification` | State-license bed sum, Parent/legal entity, Current-site reconciliation, Payer mix, Adult/core segmentation |

## Consideration pool — 40 parent companies

### Evidence-backed capacity threshold — 16 parents

These companies have direct public evidence of at least 100 beds or treatment positions somewhere in the current or recently reported footprint. A published lower bound is not the same as a current company-wide total.

| # | Parent company | Known non-CA operating states | Capacity signal | Core fit | Setting and population | Payer signal | Ownership confidence | Maturity | Main filter question |
| ---: | --- | --- | --- | :---: | --- | --- | --- | --- | --- |
| 1 | Pyramid Healthcare | CT, GA, MA, MD, NJ, NC, PA, VA, WV | **1,000+** historical company claim; at least 312 currently published in two VA facilities | B | Adult/mixed residential MH and SUD, outpatient, schools, autism, eating-disorder services | Mixed | High | National platform | Rebuild a current adult residential-only bed total and remove non-core programs. |
| 2 | Signature Healthcare Services | AZ, MA, NV, TX | **1,307 exact currently listed beds** across non-CA hospitals | D | Acute psychiatric hospitals; mixed adult, adolescent, and geriatric populations | Mixed | High | National hospital platform | Separate the limited adult residential component from hospital beds. |
| 3 | SUN Behavioral Health | DE, KY, OH, TX; community services also reported in GA, LA, NC, SC, VA | **579 exact hospital beds** | D | Acute inpatient psychiatric hospitals and outpatient programs; mixed ages | Mixed | High | Multi-state hospital platform | Decide whether acute psychiatric hospitals belong in the target screen. |
| 4 | EOSIS | MN | **At least 518 published residential beds**, conservatively deduplicated | B/C | Adult high- and low-intensity residential SUD and co-occurring treatment | Mixed/Public | High | Mature single-state platform | Validate duplicate/co-located programs and licensed rather than staffed capacity. |
| 5 | Recovery Centers of America | DE, FL, IL, IN, MD, MA, NJ, PA, SC, VA | **At least 344 regulator-verified beds in MA alone**; company total is higher | B/C | Adult inpatient/residential SUD, detox, co-occurring, and outpatient; DE and VA appear outpatient-only | Mixed | High | National platform | Sum licensed capacity across the remaining inpatient states. |
| 6 | Landmark Recovery | AR, CO, KY, OH | **At least 267 currently published beds** | C | Adult SUD detox and residential treatment; some Medicaid-oriented programs | Mixed/Public | High | Mature regional platform | Confirm every current campus and split commercial from Medicaid capacity. |
| 7 | Perimeter Healthcare | AR, LA, MO, TN, TX | **At least 232 historically documented beds** in two TX hospitals; broader total unresolved | D | Psychiatric hospitals and residential treatment; footprint is heavily child/adolescent | Mixed | High | Regional hospital platform | Isolate adult-eligible beds and verify current licenses. |
| 8 | Oceans Healthcare | LA, MS, TX | **At least 230 published beds** across a partial facility slice | D | Acute inpatient and outpatient psychiatry, primarily adult and geriatric | Mixed | High | Mature regional hospital platform | Reconcile the expanded footprint after the Haven Behavioral Healthcare acquisition. |
| 9 | Gain Holdings Group | FL | **More than 180 published beds** across two major campuses | C | Adult SUD detox, residential, PHP, and outpatient; co-occurring capability | Commercial/Mixed | Medium | Mature single-state platform | Confirm the full parent/legal-entity rollup and licensed capacities. |
| 10 | Malvern Treatment Centers | PA | **At least 159 beds at one Philadelphia facility**, plus other programs | C | Adult detox, inpatient, and residential SUD treatment | Mixed | High | Mature single-state operator | Sum active beds across Malvern, Willow Grove, and Philadelphia. |
| 11 | Advanced Recovery Systems | CO, FL, GA, IN, MA, MD, MO, NJ, OH, PA, TN, TX, WA; one announced state unresolved | **At least 152 verified beds before the 2026 Promises acquisition**; actual total materially higher | B/C | Adult SUD, co-occurring, and mental-health residential treatment | Mixed | High | National platform | Rebuild the combined 24-facility capacity after acquiring Promises Behavioral Health. |
| 12 | Boca Recovery Center | FL, IN, MA, NJ | **At least 126 published beds** across three facilities; total is higher | B/C | Adult detox, residential SUD, and co-occurring treatment | Commercial/Mixed | High | Mature regional operator | Add the remaining inpatient sites and verify licenses. |
| 13 | Northpoint Recovery | CO, ID, NE, WA | **At least 108 published beds** across two campuses; total is higher | B/C | Adult inpatient SUD and co-occurring treatment, with separate teen/outpatient programs | Commercial/Mixed | High | Mature regional platform | Separate adult inpatient capacity from adolescent and outpatient programs. |
| 14 | Summit BHC | AZ, CO, GA, IA, IN, KS, LA, MO, NC, NH, NM, PA, SC, TN, TX, VA, WI, WV | **At least 104 beds at one facility**; approximately 39 facilities overall | B/D | Adult residential SUD/MH plus acute psychiatric hospitals and mixed-age programs | Mixed | High | National platform | Segment adult non-hospital residential beds from hospital and youth capacity. |
| 15 | Odyssey Behavioral Healthcare | AL, FL, IN, MI, OH, PA, TN, VA; additional outpatient states under review | **600 company-reported beds across the network in 2023; 100 regulator-verified adult MH beds in FL** | A/B | Adult psychiatric residential, SUD, eating-disorder, and outpatient services | Commercial/Mixed | High | National specialty platform | Produce a current parent-wide bed sum by clinical segment. |
| 16 | Seafield Center | NY | **100-bed published inpatient program** | C | Adult inpatient SUD plus recovery housing and outpatient services | Mixed | Medium | Mature single-state operator | Resolve nonprofit structure and acquisition eligibility before advancing. |

Primary public references: [Pyramid Healthcare](https://www.pyramidhc.com/about/), [Signature facilities](https://signaturehc.com/healthcare-facilities), [SUN facilities](https://sunbehavioral.com/facilities/), [EOSIS locations](https://eosisrecovery.com/locations/), [Recovery Centers of America](https://recoverycentersofamerica.com/locations/), [Landmark Recovery](https://landmarkrecovery.com/locations/), [Perimeter Healthcare](https://www.perimeterhealthcare.com/), [Oceans Healthcare](https://oceanshealthcare.com/), [WhiteSands locations](https://whitesandstreatment.com/locations/), [Malvern locations](https://www.malverntreatment.com/locations/), [Advanced Recovery Systems](https://www.advancedrecoverysystems.com/centers/), [Boca Recovery Center](https://bocarecoverycenter.com/locations/), [Northpoint Recovery](https://www.northpointrecovery.com/resources/faq/), [Summit BHC](https://summitbhc.com/locations/), [Odyssey Behavioral Healthcare](https://odysseybehavioralhealth.com/), and [Seafield inpatient program](https://www.seafieldcenter.com/inpatient).

### Probable 100+ capacity — 24 parents

These are mature or multi-site operators that likely exceed 100 relevant beds, but the current public record does not yet support a complete, deduplicated licensed-capacity total.

| # | Parent company | Known non-CA operating states | Working capacity band | Core fit | Setting and population | Payer signal | Ownership confidence | Maturity | Main filter question |
| ---: | --- | --- | --- | :---: | --- | --- | --- | --- | --- |
| 17 | Discovery Behavioral Health | CT, FL, IL, KS, MD, NJ, OR, TX, VA, WA; completeness under review | **750–1,500 estimated** | B/D | Adult and youth MH, SUD, and eating-disorder residential/outpatient programs | Commercial/Mixed | High | National platform | Identify adult core beds and remove specialty/youth contamination. |
| 18 | NewVista Behavioral Health | CO, IN, MO, OH | **500–999 estimated** | B/D | Psychiatric hospitals, residential SUD, autism, and mixed-age services | Mixed/Public | High | Mature regional platform | Separate adult residential treatment from hospital and youth programs. |
| 19 | American Addiction Centers | FL, MA, MS, NV, RI, TX | **500–999 estimated** | B/C | Adult SUD detox, residential, and co-occurring programs | Commercial/Mixed | High | National platform | Validate current bed counts after portfolio changes. |
| 20 | Bradford Health Services | AL, FL, IN, MS, NC, TN, TX | **500–999 estimated** | C | Adult SUD detox, residential, and outpatient services | Commercial/Mixed | High | Mature regional platform | Confirm active inpatient/residential capacity at all 28+ facilities. |
| 21 | Haven Health Management | AR, AZ, FL, IN, MA, NJ, OK; two claimed states unresolved | **250–499 estimated** | B/C | Adult MH, SUD, detox, residential, PHP, and outpatient programs | Commercial/Mixed | Medium | Multi-state platform | Resolve the full 23-location parent map and the two missing states. |
| 22 | Praesum Healthcare | FL, GA, MA, NJ, NY, PA | **250–499 estimated** | B/C | Detox, residential SUD, co-occurring, and outpatient treatment | Mixed | High | Mature regional platform | Determine how many of roughly 30 facilities contain licensed beds. |
| 23 | Banyan Treatment Centers | AK, CO, DE, FL, IL, MA, PA, TX | **250–499 estimated** | B/C | Adult MH/SUD detox, residential, PHP, and outpatient treatment | Commercial/Mixed | High | National platform | Sum residential capacity and isolate mental-health-only programs. |
| 24 | Avenues Recovery Center | CO, IN, LA, MD, NH, PA, VA | **250–499 estimated** | B/C | Adult detox, residential SUD, and co-occurring treatment | Mixed | High | Mature regional platform | Confirm licensed beds across the 18-facility footprint. |
| 25 | Pinnacle Treatment Centers | GA, IN, KY, NC, NJ, OH, PA, VA | **250–499 estimated residential beds** | C | Primarily outpatient opioid treatment, with selected detox/residential programs | Public/Mixed | High | National platform | Remove OTP/outpatient sites and count only residential capacity. |
| 26 | BayMark Health Services | Residential footprint known in GA, LA, ME, NH, WV; broader 34-state outpatient network | **250–499 estimated residential beds** | C | Mostly outpatient opioid treatment; selected residential SUD facilities | Public/Mixed | High | National platform | Rebuild the current residential-only state and bed list. |
| 27 | Hickory Recovery Network | IN; AZ and TX operating status to verify | **250–499 estimated** | B/C | Adult psychiatric, detox, residential SUD, and outpatient services | Mixed | Medium | Emerging regional platform | Verify current out-of-state openings and licensed beds. |
| 28 | Addiction Recovery Care | KY | **250–499 estimated**, potentially higher | B/C | Large adult SUD residential and recovery ecosystem with co-occurring services | Public/Mixed | High | Mature single-state platform | Confirm staffed/licensed beds and ownership of affiliated programs. |
| 29 | Maryland Treatment Centers | MD | **100–249 estimated**, potentially higher | B/C | Adult inpatient, detox, long-term residential SUD, and outpatient treatment | Public/Mixed | Medium | Mature single-state platform | Resolve parent ownership, acquisition eligibility, and active beds. |
| 30 | Aliya Health Group | AZ, CO, IL, NV, NJ, OK, WA | **100–249 estimated**, potentially higher | B/C | Adult SUD, co-occurring, detox, residential, and outpatient treatment | Commercial/Mixed | High | Multi-state platform | Reconcile all brands and deduplicate campuses under the parent. |
| 31 | Meadows Behavioral Healthcare | AZ, CO, GA, IL, NV, TX | **100–249 estimated relevant beds** | B | Adult trauma, mental health, SUD, and specialty residential; several states are outpatient-heavy | Commercial | High | National specialty platform | Count only residential sites and identify private-pay concentration. |
| 32 | Guardian Recovery | CO, FL, ME, NH, NJ, TX | **100–249 estimated** | B/C | Adult detox, residential SUD, co-occurring, and outpatient programs | Commercial/Mixed | High | Mature regional platform | Confirm capacity at the residential subset of its 18 locations. |
| 33 | Thrive Healthcare | FL, MA, NJ, NC, TN | **100–249 estimated** | B/C | Adult SUD, mental-health, detox, residential, and outpatient programs | Commercial/Mixed | High | Mature regional platform | Validate the combined parent footprint after acquiring Harmony Health Group. |
| 34 | Recovery Unplugged | FL, NJ, PA, SC, TN, TX, VA/DC metro | **100–249 estimated** | B/C | Adult SUD and co-occurring residential; one residential mental-health program | Commercial/Mixed | High | Mature regional platform | Verify licensed beds and distinguish physical facilities from service areas. |
| 35 | Legacy Healing Center | FL, MA, NJ, OH | **100–249 estimated** | C | Adult SUD detox, residential, PHP, and outpatient treatment | Commercial | High | Mature regional operator | Confirm active inpatient capacity and eliminate marketing-only locations. |
| 36 | JourneyPure | FL, KY, TN | **100–249 estimated** | C | Adult SUD detox, residential, and outpatient treatment | Commercial/Mixed | High | Mature regional operator | Sum active residential beds by license. |
| 37 | Stepworks | KY | **100–249 estimated** | C | Adult SUD residential and outpatient treatment | Mixed | High | Mature single-state operator | Validate capacity across five current treatment locations. |
| 38 | All Points North | CO, TX | **100–249 estimated** | B | Adult mental-health, trauma, SUD, detox, and high-end residential treatment | Commercial | High | Emerging multi-state platform | Verify completion/current capacity of the TX campus and CO bed total. |
| 39 | PAM Health | TX | **100–249 estimated** | D | Two acute behavioral-health hospitals; adult psychiatric care | Mixed | High | National post-acute parent | Decide whether hospital beds should remain in the core acquisition screen. |
| 40 | RHA Health Services | GA, NC, NJ, PA, TN | **100–249 estimated target-fit beds**; total residential footprint is much larger | B/D | Adult behavioral health, crisis, IDD, supported living, and community services | Public/Mixed | High | Mature multi-state platform | Isolate adult high-acuity behavioral-health capacity from IDD/community programs. |

Primary public references: [Discovery Behavioral Health](https://discoverybehavioralhealth.com/), [NewVista](https://newvistahealth.com/about-us/), [American Addiction Centers](https://americanaddictioncenters.org/addresses), [Bradford Health Services](https://bradfordhealth.com/locations/), [Haven Health Management](https://havenhealthmgmt.org/about-us/), [Praesum Healthcare](https://www.praesumhealthcare.com/), [Banyan locations](https://www.banyantreatmentcenter.com/facilities/), [Avenues locations](https://www.avenuesrecovery.com/locations/), [Pinnacle locations](https://pinnacletreatment.com/locations/), [BayMark residential services](https://baymark.com/addiction-treatment/residential-addiction-treatment-services/), [Hickory Recovery Network](https://hickorytreatmentcenters.com/), [Addiction Recovery Care](https://www.arccenters.com/), [Maryland Treatment Centers](https://www.marylandtreatment.org/locations), [Aliya Health Group](https://www.aliyahealthgroup.com/about-us/), [Meadows locations](https://www.themeadows.com/locations/), [Guardian Recovery](https://www.guardianrecovery.com/location-search/), [Harmony/Thrive background](https://www.harmonyrecoverygroup.com/about-us/), [Recovery Unplugged](https://www.recoveryunplugged.com/location/), [Legacy Healing Center](https://www.legacyhealing.com/center-locations/), [JourneyPure](https://journeypure.com/locations/), [Stepworks](https://www.stepworks.com/), [All Points North](https://apn.com/about/), [PAM Health](https://pamhealth.com/find-a-location/), and [RHA Health Services](https://rhahealthservices.org/rha-locations/).

## Hold and exclusion pool — 20 reviewed parents

These companies remain useful research leads, but they should not enter the first adult 100+ bed target set without satisfying the re-entry condition.

| # | Parent company | Known non-CA operating states | Status | Core fit | Why held or excluded | Re-entry condition |
| ---: | --- | --- | --- | :---: | --- | --- |
| 41 | Newport Healthcare | CT, FL, IL, MD, MN, TN, TX, VA, WA; completeness to verify | Hold | D | Likely over 100 beds, but the platform is weighted toward adolescents and young adults. | Produce an adult 25+ residential capacity slice. |
| 42 | Embark Behavioral Health | Multi-state; exact current non-CA list to refresh | Exclude | D | Youth and adolescent treatment is the central thesis. | Re-enter only if a material adult operating segment is identified. |
| 43 | Monte Nido & Affiliates | Multi-state; exact current non-CA list to refresh | Hold | D | Large residential platform, but eating disorders are the primary specialty. | Decide whether eating-disorder platforms belong in scope. |
| 44 | Eating Recovery Center / Pathlight | CO, IL, MD, OH, TX, VA, WA; completeness to verify | Hold | D | Eating-disorder and mood/anxiety specialty platform rather than general high-acuity adult BH. | Decide whether specialty behavioral health belongs in scope. |
| 45 | Beacon Specialized Living | Eight-state footprint; exact current list to refresh | Exclude | D | IDD/adult foster care and supported living contaminate the target definition. | Identify a separately licensed adult psychiatric residential segment. |
| 46 | Thrive Behavioral Network | MN | Hold | A/D | Approximately 72 verified treatment beds; separate from Thrive Healthcare. Much of the broader network is community residential. | Reach 100 verified treatment beds after excluding non-treatment housing. |
| 47 | AMFM Healthcare | MN, VA, WA; current footprint to verify | Hold | A/B | Roughly 80 identifiable non-CA core beds; current total not proven over 100. | Complete a license-level current bed sum. |
| 48 | Sandstone Care | CO, IL, MD, NC, VA | Hold | D | Roughly 72 identifiable residential beds and a youth/young-adult orientation. | Identify 100+ adult-relevant beds. |
| 49 | Mountainside Treatment Center | CT, NY | Hold | C | Approximately 78 identifiable inpatient/residential beds. | Verify expansion to 100+ active licensed beds. |
| 50 | Turnbridge | CT | Hold | D | Approximately 63 historical beds with a youth/young-adult emphasis. | Identify 100+ adult-relevant current beds. |
| 51 | Southern Live Oak Wellness | GA | Hold | A | Strong adult residential mental-health fit, but only 62 verified beds. | Keep as a high-fit sub-100 exception or confirm expansion. |
| 52 | SB Holdings | GA | Hold | A/B | Approximately 50 verified current beds; historical capacity claims require reconciliation. | Verify 100+ active beds and resolve regulatory contradictions. |
| 53 | New Haven Residential Treatment Center | UT | Exclude | D | Approximately 44 beds and adolescent focus. | Re-enter only if an adult segment is acquired or developed. |
| 54 | Kelly-Norton Programs | MN | Hold | A | Approximately 32 IRTS treatment beds; excellent clinical fit but subscale. | Keep as an IRTS exception or confirm 100+ parent capacity. |
| 55 | Constellation Behavioral Health | TN | Hold | A/B | California excluded; only a small non-CA residential footprint is currently supported. | Verify 100+ non-CA adult beds. |
| 56 | Spruce Mountain Inn | VT | Hold | A | Approximately 22 beds; strong adult psychiatric residential fit but subscale. | Keep as a high-fit sub-100 exception. |
| 57 | Zinnia Health | RI; current public locator also lists a CA site, which is excluded | Hold | B/C | The current public footprint does not support the prior 100+ non-CA thesis. | Reconcile possible contractions, unlisted brands, and licensed capacity. |
| 58 | Promises Behavioral Health | Rolled into Advanced Recovery Systems | Exclude as duplicate | B/C | Acquired by Advanced Recovery Systems in 2026; separate listing would double-count the parent. | Research only within the Advanced Recovery Systems rollup. |
| 59 | Complete Healthcare | Multi-state outpatient footprint; exact states to refresh | Exclude | D | Predominantly outpatient; no support yet for 100+ residential beds. | Identify an owned residential platform with licensed capacity. |
| 60 | Porch Light Health | CO and surrounding regional footprint; exact states to refresh | Exclude | D | Clinic/outpatient-heavy opioid-treatment model. | Identify a material residential operating segment. |

## Practical ways to filter the 40-company consideration pool

### Core adult residential screen

Start with:

- `core_fit` is **A or B**.
- `screen_status` is **Evidence-backed** or **Probable 100+**.
- `population` includes **Adult**.
- `care_setting` includes **Adult residential MH**, **Crisis/IRTS/subacute**, or a meaningful **co-occurring residential** component.
- `contamination_risk` is **Low or Medium**.
- `ownership_confidence` is **High or Medium**.

This keeps adult mental-health and co-occurring platforms while pushing acute hospitals, youth, eating-disorder, IDD, and outpatient-heavy systems into adjacent screens.

### Mature-company screen

Add one of the following:

- At least two operating states;
- At least three relevant residential facilities; or
- A documented capacity signal of 250+ beds.

This favors companies with a real regional management layer and avoids spending early research time on single-program operators.

### Commercial-platform screen

Filter for `payer_signal` of **Commercial** or **Mixed**, then prioritize adult residential and co-occurring capacity. This should remain a directional screen until payer mix is sourced from contracts, filings, or management materials.

### High-acuity but non-core adjacent screen

Keep **Signature Healthcare Services, SUN Behavioral Health, Perimeter Healthcare, Oceans Healthcare, PAM Health, and the hospital segment of Summit BHC** in a separate acute-psychiatric cohort. They may be attractive businesses, but their licensing, staffing, reimbursement, and transaction profiles differ from non-hospital adult residential facilities.

### High-fit sub-100 exception screen

Do not lose small but clinically strong operators. Preserve **Southern Live Oak Wellness, Kelly-Norton Programs, and Spruce Mountain Inn** as exceptions even though they do not meet a 100-bed threshold. They can serve as comparables, add-on candidates, or archetypes for the desired care model.

## Recommended next research sequence

1. **Choose 50–100 targets from the broad discovery universe** using parent, state, adult population, setting, maturity, and payer filters—not valuation.
2. **Resolve the legal parent** and all controlled brands/facilities before counting beds.
3. **Match every candidate facility to state license records** and record license number, legal entity, status, care type, and licensed capacity.
4. **Sum capacity at the parent level**, keeping hospital, residential MH, residential SUD, crisis/IRTS, youth, ED, IDD, and outpatient fields separate.
5. **Flag contradictions** between company claims, regulator records, archived pages, directories, and transaction announcements.
6. **Advance roughly 20 companies to high confidence** only after the parent rollup, state footprint, adult/core segmentation, and licensed-bed total are all supported.

## Parent-rollup corrections already applied

- **Promises Behavioral Health** is included under **Advanced Recovery Systems** following the 2026 acquisition.
- **Harmony Health Group** is included under **Thrive Healthcare** and is not confused with Minnesota-based **Thrive Behavioral Network**.
- **Haven Behavioral Healthcare** is included under **Oceans Healthcare**; **Haven Health Management** remains a separate company.
- **Royal Life Centers** and related brands are included under **Aliya Health Group**.
- **Lifeskills South Florida** and related brands are included under **Odyssey Behavioral Healthcare**.
- **WhiteSands Treatment Center** and related Florida operations are included under **Gain Holdings Group**.
- **Broadstep** is treated as part of **RHA Health Services** rather than as a separate parent.

## Data-quality rule

No company should be labeled high confidence until all four statements are true:

1. The parent/legal-entity relationship is documented.
2. The physical operating-state list is current and California has been removed.
3. The adult target-fit facilities are separated from youth, hospital, IDD, eating-disorder, and outpatient-only operations.
4. The bed total is derived from current state licenses or equivalent regulator-grade evidence, with company claims retained only as corroboration.
