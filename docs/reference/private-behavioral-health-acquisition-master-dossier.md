# Private Behavioral-Health Acquisition Intelligence — Master Dossier

- purpose: single owner-facing source for the non-California private adult behavioral-health residential acquisition program
- status: canonical owner dossier; current evidence snapshot with explicit verification boundaries
- owners: owner, acquisition analyst, corporate development, clinical operations, data platform
- updated: 2026-09-09
- tags: acquisition, fifty-states, behavioral-health, residential, parent-company, capacity, pivot, regulation, verification
- labels: canonical-owner-dossier, owner-only, california-excluded, no-phi
- supporting modules:
  - [Private Behavioral-Health Parent Company Program](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/acquisition-parent-company-program.md)
  - [Private Behavioral Health Operator Filtering Universe](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/private-behavioral-health-operator-filtering-universe.md)
  - [Adult Behavioral-Health Residential Pivot and Acquisition Thesis](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/adult-behavioral-health-residential-pivot-acquisition-thesis.md)

**As of:** September 9, 2026\
**Access:** Owner-only inside the protected Fifty States acquisition workspace\
**Geography:** United States excluding California\
**Primary object:** Operating parent company, with brands, legal entities, facilities, programs, licenses, capacity claims, states, sources, and contradictions linked beneath it\
**Primary target:** Private adult, 24-hour, non-hospital residential behavioral-health operators treating serious or high-acuity primary mental illness, including hospital-diversion and step-down populations\
**Adjacent target:** Mature adult SUD/co-occurring or lower-acuity residential operators with real operating platforms and a defensible, separately diligenced conversion path

## How to use this dossier

This is the one document to read for the full project context, current numbers, company universe, state strategy, acquisition-versus-pivot logic, verification standard, and next work. The three supporting modules remain because they are useful implementation and research workpapers; they do not supersede this owner-facing synthesis.

Read every number with its label:

- **Discovery** means a record or algorithmic organization proposal exists. It is useful for coverage, not proof.
- **Screening** means enough public signal exists to place a company in a working range or fit bucket. It is not a certified company total.
- **Evidence-backed parent** means cited evidence supports the brand/facility-to-parent relationship.
- **Regulator-verified capacity** means a current state license or equivalent regulator record publishes the capacity for the specific facility and service.
- **Operator-reported capacity** means a current first-party source reports a maximum or bed count, but a regulator has not yet confirmed it.
- **Validated target** means the current datastore's strict identity, private ownership, target fit, capacity, contradiction, and transparent value-input gates all pass. It does **not** mean the company is for sale, fully diligenced, or worth the modeled amount.

The system deliberately keeps exact licensed capacity, reported capacity, published lower bounds, and screening ranges separate. It also keeps core adult primary-MH beds separate from adjacent SUD/co-occurring, hospital, youth, eating-disorder, IDD, outpatient, and housing capacity.

## Executive answer

The market is not twelve companies. The current non-California source universe contains **18,742 facility records** grouped into **8,516 proposed organizations**. From that universe, **1,745 organizations** enter the broad consideration set, **1,067** show mature-scale characteristics, **764** carry a facility-level target signal, and **310** carry a core primary-mental-health signal. Within the mature pool, **60** currently show a likely adult primary-MH or adjacent high-acuity/SUD service signal.

Those are discovery and screening counts. At the stricter end, **47 operating-parent relationships** have current cited support, **22** have high-confidence private ownership, and only **2** currently clear every automated validated-target gate: **Southern Live Oak Wellness** and **Kelly-Norton Programs**. Their verified capacity slices are 62 and 32 beds respectively. They are clinically relevant but subscale, which illustrates the central market problem: the cleanest exact-fit operators are often small, while the mature 100–1,000+ bed companies usually mix core beds with SUD, hospitals, youth, eating disorders, IDD, outpatient, or community services.

The current regulator evidence ledger contains **29 current state rows beneath 13 operating parents**, plus one Vermont directory row whose explicit license status and licensed capacity remain unknown. Twenty-seven of the state rows publish capacity. They total **888 current licensed beds**, split into **414 core adult residential mental-health beds** and **474 adjacent high-acuity SUD/stabilization beds**. A separate **130 operator-reported beds or slots** is not included in the 888.

The recommended strategy is a three-lane program:

1. **Acquire core** adult primary-MH residential or subacute operators for reliable clinical and operating scale.
2. **Acquire adjacent and change mix** when adult SUD/co-occurring or lower-acuity MH assets bring usable sites, 24/7 operations, workforce, payer experience, and referral infrastructure—and when the exact new license, physical-plant work, staffing, payer path, and convertible beds are known.
3. **Acquire a scarce site or approval** only when the location, zoning position, certificate, hospital relationship, or building is demonstrably reusable and difficult to reproduce.

Valuation is intentionally secondary. The supplied workbook formula has been implemented as a transparent screening model, but occupancy, rate, margin, and multiple remain assumptions. No estimated capacity range should be turned into a whole-company value.

## 1. Acquisition mandate and boundaries

### In scope

- Private or plausibly acquirable operating parents.
- Adult primary psychiatric residential treatment.
- Adult crisis residential, subacute, intensive residential treatment, and hospital diversion/step-down models that fit within non-hospital licensing.
- Adult residential SUD/co-occurring platforms as a separate adjacent or pivot lane.
- Mature regional or national operating companies, while preserving small high-fit operators as bolt-on candidates and clinical archetypes.
- Current physical operating states only; telehealth reach and referral territories do not count as a state footprint.
- Existing capacity, documented lower bounds, and realistic convertible capacity as separate measures.

### Out of scope or separately bucketed

- California facilities and beds.
- Youth/adolescent-only platforms.
- Eating-disorder-only platforms.
- IDD, foster care, supportive living, sober living, and housing without the target treatment license.
- Outpatient/OTP-only companies.
- Acute psychiatric hospitals as direct residential comparables; hospitals remain a separate market-entry and referral cohort.
- Proposed, announced, dormant, historical, or hypothetically convertible beds as current capacity.
- PHI or patient-level data.
- A claim that any company is available for sale.
- Whole-company valuation until the relevant capacity, operating performance, debt/cash, leases, real estate, and transaction perimeter are verified.

### The target is a hierarchy, not a flat name

```text
Operating parent
├── sponsor / beneficial owner
├── canonical legal entities
│   ├── operating companies
│   └── property companies
├── brands
├── physical facilities
│   ├── programs / service lines
│   └── licenses / approvals
└── capacity and other claims
    ├── current regulator-verified
    ├── current operator-reported
    ├── historical or announced
    └── estimated screening range
```

Beds may be summed to a parent only after the facility, legal operator, license, service, population, status, and non-overlap are resolved. A brand name or common website is not sufficient by itself.

## 2. Current funnel and what the counts mean

| Layer | Current count | Evidence meaning | Proper use |
| --- | ---: | --- | --- |
| Non-California facility records | 18,742 | Indexed source rows | National discovery coverage |
| Proposed organizations | 8,516 | Deterministic entity proposals; unresolved duplicates and fragments may remain | Searchable parent-candidate universe |
| Broad consideration set | 1,745 | Union of mature-scale proposals and smaller proposals with qualifying facility signals | Cursory company screen |
| Mature-scale proposals | 1,067 | Observable scale/state-breadth signal, not verified age or revenue | Default owner screen |
| Facility-signal organizations | 764 | At least one qualifying facility signal | Fit discovery |
| Core primary-MH signals | 310 | Directory-level primary-MH signal | Core research candidates; not verified beds |
| Mature likely adult primary-MH | 39 | Mature-screen lane | Highest-priority service-fit review |
| Mature adjacent high-acuity/SUD | 21 | Mature-screen lane | Pivot-platform review |
| Mature private-likelihood, fit unresolved | 239 | Private-company signal; service mix unresolved | Parent and service classification |
| Mature market context | 768 | Mature but no current target-service signal | Context or later re-entry |
| Algorithmic screen | 500 | Ranked working screen | Fast owner filtering |
| Algorithmic research queue | 100 | Ranked working queue | Input to owner cohort selection, not authority to research every company |
| Evidence-backed operating-parent relationships | 47 | Current cited parent relationship | Parent-level display |
| High-confidence private ownership | 22 | Current evidence supports private ownership | Acquisition eligibility screen |
| Strict validated targets | 2 | Every current deterministic gate passes | Diligence-ready identity/capacity slice, not a transaction conclusion |

The 1,745-company consideration set is the union of 1,063 non-excluded mature-scale proposals and 682 non-mature proposals with qualifying facility signals. Eighty-two mature proposals also have facility signals; the union removes that overlap. The mature-scale breakdown is 224 platform-scale, 843 regional-scale, 1,517 established-local, and 5,932 single-site or unresolved proposals across the full 8,516-organization universe. Company maturity remains a screening inference until separately verified.

## 3. Verified capacity ledger

### 3.1 Current regulator-verified beds

| Operating parent | State | Current regulator rows with capacity | Core adult primary-MH beds | Adjacent high-acuity SUD/stabilization beds | Evidence status and scope |
| --- | :---: | ---: | ---: | ---: | --- |
| Odyssey Behavioral Healthcare / Lifeskills | FL | 3 | 100 | — | Current AHCA slice: Orlando 16, Deerfield Beach 50, Fort Lauderdale 34 |
| Newport Healthcare / Newport Institute | MN | 2 | 12 | — | Current adult licenses only; youth portfolio excluded |
| AMFM Healthcare / Lakeside Health Solutions | MN | 4 | 24 | — | Current Minnesota slice; Virginia capacity is separately reported |
| Thrive Behavioral Network | MN | 6 | 72 | — | Five adult IRTS programs and one adult residential-crisis program |
| Kelly-Norton Programs | MN | 2 | 32 | — | Oasis 16 and Bill Kelly House 16 |
| SB Holdings / Sylvia Brafman network | GA | 1 | 50 | — | Current Georgia Mental Health Center license; proposed 70-bed facility excluded |
| Southern Live Oak Wellness | GA | 2 | 62 | — | Dunwoody Behavioral Health Center 54 and Southern Live Oak Wellness Academy 8 |
| Advanced Recovery Systems | GA | 2 | 62 | — | Recovery Village South Atlanta and Promises Atlanta current core slice |
| Haven Health Management | MA | 1 | — | 32 | Current BSAS adjacent slice |
| Banyan Treatment Centers | MA | 1 | — | 34 | Current BSAS adjacent slice |
| Boca Recovery Center | MA | 1 | — | 64 | Current BSAS adjacent slice |
| Recovery Centers of America | MA | 2 | — | 344 | Current BSAS adjacent slice |
| **Total** |  | **27** | **414** | **474** | **888 current licensed beds; partial portfolios, not national parent totals** |

Two additional current Tennessee licensed-site rows verify BrightQuest Nashville adult supportive residential facilities at 805 and 807 Horner Avenue under Constellation Behavioral Health, but the public registry does not publish license numbers or licensed beds. They make the current state-row count 29 but contribute zero to the 888-bed sum.

### 3.2 Current operator-reported capacity kept separate

| Operating parent / program | State | Reported capacity | Basis | Why not in the licensed total |
| --- | :---: | ---: | --- | --- |
| AMFM Healthcare | VA | 56 | Seven current first-party location pages reporting eight beds each | State license confirms the service and locations but does not publish beds |
| Constellation / BrightQuest Nashville | TN | 12 | Six-resident maximum per home crosswalked to two current state addresses | Operator-reported slots, not state-published licensed capacity |
| Discovery Behavioral Health / Annapolis | MD | 40 | October 2025 first-party expansion announcement | Current reported campus count; regulator capacity not yet reconciled |
| Spruce Mountain Inn | VT | 22 | Current first-party program maximum | State directory does not publish explicit license status or capacity |
| **Total** |  | **130** |  | **Separate from the 888 regulator-verified beds** |

### 3.3 Strict validated targets today

| Rank | Operating parent | State | Verified core beds | Why it clears the current gate | Important limitation |
| ---: | --- | :---: | ---: | --- | --- |
| 1 | Southern Live Oak Wellness | GA | 62 | High-confidence parent/legal identity, private founder-owned status, adult primary-MH fit, current licensed capacity, and no stored contradiction | Partial portfolio; sub-100; valuation operating inputs remain assumptions |
| 2 | Kelly-Norton Programs | MN | 32 | High-confidence parent/legal identity, private for-profit status, adult IRTS fit, two current licenses, and no stored contradiction | Small Minnesota public/mixed-payer model; ultimate shareholders not asserted |

The word “validated” is narrower than “ideal acquisition.” Southern Live Oak is strategically closer to the desired model; Kelly-Norton is a high-quality clinical analog and possible bolt-on but is not a 100+ bed platform. Conversely, much larger companies remain in screening because their relevant beds, ownership, or mixed-service perimeter is not yet fully proven.

## 4. Strategic bed bands and market shape

| Relevant non-California bed band | Strategic interpretation | Typical role |
| ---: | --- | --- |
| Under 25 | Clinical archetype or individual small home | Program analog, tuck-in, clinical-team acquisition |
| 25–49 | Meaningful facility or several small homes | Local bolt-on or contained conversion pilot |
| 50–99 | Subscale parent but potentially valuable when fit is unusually strong | Regional foothold or high-fit exception |
| 100–249 | Preferred first material target band | Regional platform with manageable segmentation |
| 250–499 | Substantial platform, usually with mixed services or payers | Multi-state platform or major adjacent acquisition |
| 500–999 | Large diversified platform; relevant beds rarely equal total beds | Selective platform acquisition, carve-out, partnership |
| 1,000+ | Usually hospital-heavy, national, or highly diversified | Corporate-scale deal; poor proxy for usable target beds |

The cleanest direct and near-core analogs currently visible are Odyssey/Lifeskills, AMFM, Southern Live Oak, the Georgia primary-MH slice of Advanced Recovery Systems, SB Holdings, Discovery's adult Annapolis slice, Thrive Behavioral Network, Kelly-Norton, and Spruce Mountain Inn. The mature adjacent source pool includes Recovery Centers of America, EOSIS, Advanced Recovery Systems, Gain/WhiteSands, Boca, Northpoint, Bradford, Banyan, Avenues, and Meadows. Signature, SUN, Oceans, Perimeter, PAM Health, and Summit's hospital segment belong in a separate acute-psychiatric cohort.

For every parent, maintain four different capacity views:

1. current core adult primary-MH beds;
2. current adjacent adult SUD/co-occurring or lower-acuity beds;
3. hospital, youth, ED, IDD, outpatient, recovery-housing, and other non-core capacity;
4. realistically convertible beds, always less than or equal to adjacent capacity and supported by facility-specific license, physical-plant, workforce, payer, and referral evidence.

## 5. State environment and market-entry logic

| Priority | State | Relevant model | Transaction / conversion reality | Recommended role |
| --- | --- | --- | --- | --- |
| Tier 1 | Pennsylvania | Adult LTSR and RTFA psychiatric residential pathways | License attaches to legal entity, site, service, and capacity and is nontransferable; a stock transfer that leaves the corporation intact is not a CHOW under the general rule. New entity, name, location, or profit-status change voids the certificate. For-profit RTFA also requires national accreditation and county support; payer enrollment is separate.[^2][^11][^19][^20] | Build the first acquire-and-expand continuity playbook; verify entity form and program-specific approvals |
| Tier 1 | Georgia | Adult Residential Mental Health Program: adults 18+, 24/7, short-term subacute psychiatric alternative to or step-down from hospitalization | New statewide license requirement effective July 1, 2025. Permit is site-specific and not transferable; CHOW requires advance application/approval. Local zoning, fire/building, hospital-referral agreements, and the Georgia CON/letter-of-determination question remain facility-specific.[^3][^22] | Best clean clinical product definition; acquire a current ARMHP or a highly adjacent platform with conversion milestones |
| Tier 2 | Tennessee | Adult Mental Health Residential Treatment Program with 24-hour intensive, coordinated, structured services | Published process supports category, capacity, location, renovation, and occupancy changes; CHOW/location changes require a new license. The pathway is visible but not obviously scarce.[^4][^23] | Operating-company and bolt-on market; pay for site, team, payer, and referrals rather than a generic license |
| Tier 2 | Florida | Five AHCA adult RTF levels plus a separate public crisis/short-term residential framework | AHCA requires site control, zoning, fire/sanitation approvals, program description, and approved CHOW for 51%+ transfer. The highest-acuity SRT model sits in the public crisis framework, so “residential” does not establish a commercial primary-MH pathway.[^5][^24] | Target-rich adult SUD/co-occurring company market; conditional pivot market only after exact license and payer proof |
| Tier 3 | Connecticut | For-profit BH facility approval under Certificate of Need | Establishment and for-profit transfer can require CON, creating scarcity and closing risk.[^6][^25] | Acquire an existing approval when the service scope survives the deal |
| Tier 3 | Massachusetts | DoN plus facility licensure and plan review | DoN can attach to substantial expenditure/service changes, original licensure, ownership transfer, and site changes; beds/services/location/renovations need approval.[^6][^13] | Existing-approval acquisition; material pivot is a new regulatory project |
| Tier 3 | Washington | Private psychiatric hospital license, CON, and construction review | CHOW is processed like an initial license; service, bed, or building changes require amended license and CON determination.[^6][^12] | Approval or strategic-campus acquisition, not assumed SUD-to-MH conversion |
| Tier 4 | North Carolina | Multiple 24-hour categories; adult non-hospital psychiatric pathway remains unclear; psychiatric-hospital beds follow need/CON | Service category, capacity, location, and ownership changes require approval; 24-hour residential applicants need zoning and LME/MCO need review, though private-pay facilities need no LME/MCO reimbursement contract.[^7][^26] | Use only after regulator confirms the exact adult category, or pursue a licensed hospital thesis separately |
| Tier 4 | Minnesota | Adult IRTS/RCS, generally five to 15 beds, 24/7, hospital diversion/step-down | Clinically aligned but provider-specific prospective cost-based public rates; license does not guarantee MHCP certification or rate.[^8] | Clinical analog and small bolt-on market, not the primary commercial 50–150-bed platform thesis |

### Federal and local constraints that affect every state

- Federal parity applies to intermediate/residential benefit classifications and nonquantitative treatment limitations, but it does not guarantee network admission, a rate, authorized days, or collections. The portions newly added by the 2024 final rule remain under a federal non-enforcement posture pending litigation plus 18 months, while the statute and prior rule remain operative.[^15][^16]
- Adult Medicaid generally faces the IMD exclusion for institutions over 16 beds whose primary purpose is treatment of mental disease, subject to age exceptions and state-specific Section 1115 or managed-care in-lieu-of-service authority. A commercial platform should not assume Medicaid flexibility from a superficial site split.[^17][^18]
- Zoning may create value, but Fair Housing protections do not erase neutral safety, occupancy, and land-use rules, especially for larger institutional facilities. Verify by-right use, conditional use, nonconforming rights, reasonable accommodation, and institutional occupancy separately.[^27]
- Hospital referral agreements are useful operating assets but not guaranteed volume. Value them through lawful agreements and historical admissions; review Anti-Kickback implications for federally reimbursable referrals.[^14]

## 6. Acquisition versus pivot thesis

| Strategy | What is purchased | Evidence required at screening | Principal risk | Role |
| --- | --- | --- | --- | --- |
| Acquire core | Existing adult primary-MH residential/subacute operation | Current adult license, beds, clinical scope, payer/referral evidence, sites | Scarce exact-fit targets may be small or expensive | First platform and highest strategic priority |
| Acquire adjacent and change mix | Adult SUD/co-occurring or lower-acuity MH platform plus potentially convertible beds | Current residential footprint, co-occurring depth, usable plant, state pathway, realistic conversion range | License, plant, staff, payer, referral, and ramp all must converge | Main source of larger mature-company choices |
| Acquire site/entitlement | Real estate, zoning, certificate/approval, or dormant authorized capacity | Exact approval scope, site control, life-safety readiness, survivability through transaction | Startup risk without current census/team/revenue | Opportunistic entry into scarce markets |

The best adjacent source is generally an adult SUD residential operator with verified co-occurring capability, followed by a lower-acuity adult mental-health residential operator. Such companies may already have 24-hour staffing, medication workflows, utilization management, residential real estate, licensed clinicians, and referral infrastructure. SAMHSA supports integrated co-occurring treatment, but that establishes adjacency—not authority or clinical readiness to treat primary psychosis, serious mental illness, or post-hospital patients.[^1]

A credible conversion must clear seven systems at once:

| System | Potential carryover | Fresh proof required |
| --- | --- | --- |
| License | Legal entity, compliance history, site records | Authority for adult primary psychiatric residential care, capacity, admissions criteria |
| Physical plant | Bedrooms, kitchen, common space, some life safety | Observation, controlled access, medication room, nursing station, self-harm mitigation, clinical/privacy space |
| Workforce | Counselors, technicians, nurses, utilization review | Psychiatric direction, psychiatric nursing, qualified MH staff, case management, crisis competence |
| Clinical operations | 24/7 scheduling, medications, residential milieu | Suicide/self-harm, psychosis, aggression, elopement, stabilization, involuntary transfer, hospital transfer |
| Payer | Revenue cycle and some relationships | Level-of-care contract, credentialing, rate, authorization, medical necessity, claims testing |
| Referrals | Brand, call center, community contacts | Hospital discharge, psychiatry and crisis relationships, verified conversion to authorized admissions |
| Economics | Existing census and EBITDA | Net collected rate, authorized days, staff cost, denial leakage, ramp, contribution margin |

The first material acquisition should normally be a functioning core platform or a hybrid with a bounded adjacent conversion. A pure pivot as the first deal compounds a new state, license, clinical model, payer product, and operating team in one transaction.

## 7. Forty-company consideration pool

**Capacity signal is a screen, not a certified company-wide total unless explicitly labeled exact.** Core fit: A = adult residential MH/crisis/subacute; B = mixed MH/co-occurring/SUD residential; C = SUD residential primary; D = hospital/youth/ED/IDD/outpatient-heavy or other adjacent.

### Evidence-backed 100+ capacity signal — 16 parents

| # | Parent | Non-CA physical states | Capacity signal | Fit | Setting / population | Payer | Ownership | Main unresolved question |
| ---: | --- | --- | --- | :---: | --- | --- | --- | --- |
| 1 | Pyramid Healthcare | CT, GA, MA, MD, NJ, NC, PA, VA, WV | 1,000+ historical company claim; ≥312 currently published at two VA facilities | B | Adult/mixed residential MH/SUD plus outpatient, schools, autism, ED | Mixed | High | Current adult residential-only licensed total |
| 2 | Signature Healthcare Services | AZ, MA, NV, TX | 1,307 exact currently listed hospital beds | D | Acute psychiatric hospitals; mixed ages | Mixed | High | Separate adult residential from hospital beds |
| 3 | SUN Behavioral Health | DE, KY, OH, TX; community services also GA, LA, NC, SC, VA | 579 exact hospital beds | D | Acute inpatient/outpatient psychiatry; mixed ages | Mixed | High | Keep outside the residential rank unless a separable asset exists |
| 4 | EOSIS | MN | ≥518 published residential beds, conservatively deduplicated | B/C | Adult high/low-intensity SUD and co-occurring | Mixed/Public | High | Licensed vs staffed capacity and co-located duplicates |
| 5 | Recovery Centers of America | DE, FL, IL, IN, MD, MA, NJ, PA, SC, VA | ≥344 regulator-verified MA beds; total higher | B/C | Adult SUD/detox/co-occurring/outpatient | Mixed | High | Licensed capacity in other inpatient states |
| 6 | Landmark Recovery | AR, CO, KY, OH | ≥267 currently published beds | C | Adult SUD/detox/residential; some Medicaid orientation | Mixed/Public | High | Full current campus list and payer segmentation |
| 7 | Perimeter Healthcare | AR, LA, MO, TN, TX | ≥232 historical beds at two TX hospitals; broader total unresolved | D | Hospitals/RTC; heavily child/adolescent | Mixed | High | Adult-eligible current licensed beds |
| 8 | Oceans Healthcare | LA, MS, TX | ≥230 published beds across a partial slice | D | Acute adult/geriatric psychiatry | Mixed | High | Footprint after Haven Behavioral Healthcare acquisition |
| 9 | Gain Holdings Group / WhiteSands | FL | >180 published beds across two major campuses | C | Adult SUD/detox/residential/PHP/outpatient, co-occurring | Commercial/Mixed | Medium | Parent/legal rollup and licensed capacity |
| 10 | Malvern Treatment Centers | PA | ≥159 at one Philadelphia facility, plus other programs | C | Adult detox/inpatient/residential SUD | Mixed | High | Sum Malvern, Willow Grove, and Philadelphia beds |
| 11 | Advanced Recovery Systems | CO, FL, GA, IN, MA, MD, MO, NJ, OH, PA, TN, TX, WA; one announced state unresolved | ≥152 verified before 2026 Promises acquisition; materially higher now | B/C | Adult SUD/co-occurring/MH residential | Mixed | High | Rebuild combined 24-facility capacity by segment |
| 12 | Boca Recovery Center | FL, IN, MA, NJ | ≥126 published across three facilities; total higher | B/C | Adult detox/residential SUD/co-occurring | Commercial/Mixed | High | Remaining inpatient sites and licenses |
| 13 | Northpoint Recovery | CO, ID, NE, WA | ≥108 published across two campuses; total higher | B/C | Adult inpatient SUD/co-occurring plus teen/outpatient | Commercial/Mixed | High | Adult inpatient vs adolescent/outpatient capacity |
| 14 | Summit BHC | AZ, CO, GA, IA, IN, KS, LA, MO, NC, NH, NM, PA, SC, TN, TX, VA, WI, WV | ≥104 at one facility; ~39 facilities overall | B/D | Adult residential SUD/MH plus hospitals/mixed ages | Mixed | High | Adult non-hospital beds by license |
| 15 | Odyssey Behavioral Healthcare | AL, FL, IN, MI, OH, PA, TN, VA; outpatient states under review | 600 company-reported network beds in 2023; 100 verified adult MH beds in FL | A/B | Adult psych residential, SUD, ED, outpatient | Commercial/Mixed | High | Current parent-wide segment and bed sum |
| 16 | Seafield Center | NY | 100-bed published inpatient program | C | Adult inpatient SUD, recovery housing, outpatient | Mixed | Medium / eligibility unresolved | Nonprofit structure and acquisition eligibility |

Company reference set: [Pyramid](https://www.pyramidhc.com/about/), [Signature](https://signaturehc.com/healthcare-facilities), [SUN](https://sunbehavioral.com/facilities/), [EOSIS](https://eosisrecovery.com/locations/), [RCA](https://recoverycentersofamerica.com/locations/), [Landmark](https://landmarkrecovery.com/locations/), [Perimeter](https://www.perimeterhealthcare.com/), [Oceans](https://oceanshealthcare.com/), [WhiteSands](https://whitesandstreatment.com/locations/), [Malvern](https://www.malverntreatment.com/locations/), [ARS](https://www.advancedrecoverysystems.com/centers/), [Boca](https://bocarecoverycenter.com/locations/), [Northpoint](https://www.northpointrecovery.com/resources/faq/), [Summit](https://summitbhc.com/locations/), [Odyssey](https://odysseybehavioralhealth.com/), [Seafield](https://www.seafieldcenter.com/inpatient).

### Probable 100+ capacity — 24 parents

| # | Parent | Non-CA physical states | Working band | Fit | Setting / population | Payer | Ownership | Main unresolved question |
| ---: | --- | --- | --- | :---: | --- | --- | --- | --- |
| 17 | Discovery Behavioral Health | CT, FL, IL, KS, MD, NJ, OR, TX, VA, WA | 750–1,500 | B/D | Adult/youth MH, SUD, ED, residential/outpatient | Commercial/Mixed | High | Adult core beds after specialty/youth removal |
| 18 | NewVista Behavioral Health | CO, IN, MO, OH | 500–999 | B/D | Hospitals, SUD, autism, mixed ages | Mixed/Public | High | Adult residential vs hospital/youth capacity |
| 19 | American Addiction Centers | FL, MA, MS, NV, RI, TX | 500–999 | B/C | Adult SUD/detox/residential/co-occurring | Commercial/Mixed | High | Current licensed beds after portfolio changes |
| 20 | Bradford Health Services | AL, FL, IN, MS, NC, TN, TX | 500–999 | C | Adult SUD/detox/outpatient | Commercial/Mixed | High | Active residential capacity across 28+ facilities |
| 21 | Haven Health Management | AR, AZ, FL, IN, MA, NJ, OK; two claimed states unresolved | 250–499 | B/C | Adult MH/SUD/detox/residential/PHP/outpatient | Commercial/Mixed | Medium | Full 23-location parent map and missing states |
| 22 | Praesum Healthcare | FL, GA, MA, NJ, NY, PA | 250–499 | B/C | Detox/residential SUD/co-occurring/outpatient | Mixed | High | Which of ~30 centers contain licensed beds |
| 23 | Banyan Treatment Centers | AK, CO, DE, FL, IL, MA, PA, TX | 250–499 | B/C | Adult MH/SUD/detox/residential/PHP/outpatient | Commercial/Mixed | High | Licensed beds and mental-health-only programs |
| 24 | Avenues Recovery Center | CO, IN, LA, MD, NH, PA, VA | 250–499 | B/C | Adult detox/residential SUD/co-occurring | Mixed | High | Licensed beds across 18-facility footprint |
| 25 | Pinnacle Treatment Centers | GA, IN, KY, NC, NJ, OH, PA, VA | 250–499 estimated residential | C | Mostly outpatient OTP; selected detox/residential | Public/Mixed | High | Remove outpatient sites and count residential only |
| 26 | BayMark Health Services | Residential known in GA, LA, ME, NH, WV; 34-state outpatient network | 250–499 estimated residential | C | Mostly outpatient OTP; selected residential SUD | Public/Mixed | High | Current residential-only state and bed list |
| 27 | Hickory Recovery Network | IN; AZ and TX to verify | 250–499 | B/C | Adult psych/detox/SUD/outpatient | Mixed | Medium | Out-of-state openings and licensed beds |
| 28 | Addiction Recovery Care | KY | 250–499, possibly higher | B/C | Adult SUD residential/recovery/co-occurring | Public/Mixed | High | Licensed/staffed beds and affiliated ownership |
| 29 | Maryland Treatment Centers | MD | 100–249, possibly higher | B/C | Adult inpatient/detox/long-term SUD/outpatient | Public/Mixed | Medium | Parent, eligibility, active beds |
| 30 | Aliya Health Group | AZ, CO, IL, NV, NJ, OK, WA | 100–249, possibly higher | B/C | Adult SUD/co-occurring/detox/residential/outpatient | Commercial/Mixed | High | Brand/campus deduplication under parent |
| 31 | Meadows Behavioral Healthcare | AZ, CO, GA, IL, NV, TX | 100–249 relevant | B | Adult trauma/MH/SUD/specialty; outpatient-heavy states | Commercial | High | Residential-only capacity and private-pay concentration |
| 32 | Guardian Recovery | CO, FL, ME, NH, NJ, TX | 100–249 | B/C | Adult detox/residential SUD/co-occurring/outpatient | Commercial/Mixed | High | Residential capacity within 18 locations |
| 33 | Thrive Healthcare | FL, MA, NJ, NC, TN | 100–249 | B/C | Adult SUD/MH/detox/residential/outpatient | Commercial/Mixed | High | Combined footprint after Harmony acquisition |
| 34 | Recovery Unplugged | FL, NJ, PA, SC, TN, TX, VA/DC metro | 100–249 | B/C | Adult SUD/co-occurring; one residential MH program | Commercial/Mixed | High | Physical facilities vs service areas; licensed beds |
| 35 | Legacy Healing Center | FL, MA, NJ, OH | 100–249 | C | Adult SUD/detox/residential/PHP/outpatient | Commercial | High | Active inpatient capacity vs marketing locations |
| 36 | JourneyPure | FL, KY, TN | 100–249 | C | Adult SUD/detox/residential/outpatient | Commercial/Mixed | High | Current license-level bed sum |
| 37 | Stepworks | KY | 100–249 | C | Adult SUD residential/outpatient | Mixed | High | Capacity across five current treatment locations |
| 38 | All Points North | CO, TX | 100–249 | B | Adult MH/trauma/SUD/detox/high-end residential | Commercial | High | TX completion/current capacity and CO total |
| 39 | PAM Health | TX | 100–249 | D | Two acute behavioral-health hospitals | Mixed | High | Whether a separable non-hospital thesis exists |
| 40 | RHA Health Services | GA, NC, NJ, PA, TN | 100–249 target-fit; total residential much larger | B/D | Adult BH/crisis/IDD/supportive/community | Public/Mixed | High | Adult high-acuity beds after IDD/community removal |

Company reference set: [Discovery](https://discoverybehavioralhealth.com/), [NewVista](https://newvistahealth.com/about-us/), [AAC](https://americanaddictioncenters.org/addresses), [Bradford](https://bradfordhealth.com/locations/), [Haven](https://havenhealthmgmt.org/about-us/), [Praesum](https://www.praesumhealthcare.com/), [Banyan](https://www.banyantreatmentcenter.com/facilities/), [Avenues](https://www.avenuesrecovery.com/locations/), [Pinnacle](https://pinnacletreatment.com/locations/), [BayMark](https://baymark.com/addiction-treatment/residential-addiction-treatment-services/), [Hickory](https://hickorytreatmentcenters.com/), [ARC](https://www.arccenters.com/), [Maryland Treatment Centers](https://www.marylandtreatment.org/locations), [Aliya](https://www.aliyahealthgroup.com/about-us/), [Meadows](https://www.themeadows.com/locations/), [Guardian](https://www.guardianrecovery.com/location-search/), [Thrive predecessor context](https://www.harmonyrecoverygroup.com/about-us/), [Recovery Unplugged](https://www.recoveryunplugged.com/location/), [Legacy](https://www.legacyhealing.com/center-locations/), [JourneyPure](https://journeypure.com/locations/), [Stepworks](https://www.stepworks.com/), [APN](https://apn.com/about/), [PAM](https://pamhealth.com/find-a-location/), [RHA](https://rhahealthservices.org/rha-locations/).

## 8. Hold and exclusion pool

These reviewed parents remain searchable. A hold does not mean “bad company”; it means the current evidence does not support entry into the first adult 100+ bed target cohort.

| # | Parent | Non-CA states | Status | Fit | Reason | Re-entry condition |
| ---: | --- | --- | --- | :---: | --- | --- |
| 41 | Newport Healthcare | CT, FL, IL, MD, MN, TN, TX, VA, WA | Hold | D | Likely >100 beds but weighted to adolescents/young adults | Produce adult 25+ residential capacity slice |
| 42 | Embark Behavioral Health | Multistate; refresh needed | Exclude | D | Youth/adolescent central thesis | Material adult operating segment |
| 43 | Monte Nido & Affiliates | Multistate; refresh needed | Hold | D | Eating disorders primary | Owner expands specialty scope |
| 44 | ERC / Pathlight | CO, IL, MD, OH, TX, VA, WA | Hold | D | ED and mood/anxiety specialty | Owner expands specialty scope |
| 45 | Beacon Specialized Living | Eight-state footprint | Exclude | D | IDD/foster/supportive living contamination | Separately licensed adult psychiatric segment |
| 46 | Thrive Behavioral Network | MN | Hold | A/D | 72 verified treatment beds; broader community residential | 100 verified treatment beds or retain as exception |
| 47 | AMFM Healthcare | MN, VA, WA | Hold | A/B | ~80 identifiable non-CA core beds; full total unresolved | Complete current license-level bed sum |
| 48 | Sandstone Care | CO, IL, MD, NC, VA | Hold | D | ~72 identifiable residential beds; youth/young-adult focus | 100+ adult-relevant beds |
| 49 | Mountainside | CT, NY | Hold | C | ~78 identifiable inpatient/residential beds | 100+ active licensed beds |
| 50 | Turnbridge | CT | Hold | D | ~63 historical beds; youth/young-adult focus | 100+ adult-relevant current beds |
| 51 | Southern Live Oak Wellness | GA | Hold as 100+ platform; validated exception | A | Excellent fit but 62 verified beds | Keep as high-fit sub-100 target or confirm growth |
| 52 | SB Holdings | GA | Hold | A/B | 50 verified current beds and open regulatory contradiction | Resolve contradiction and prove 100+ active beds |
| 53 | New Haven RTC | UT | Exclude | D | ~44 beds and adolescent focus | Adult segment acquired/developed |
| 54 | Kelly-Norton Programs | MN | Hold as 100+ platform; validated exception | A | 32 verified IRTS beds | Keep as clinical/add-on exception or prove parent scale |
| 55 | Constellation Behavioral Health | TN | Hold | A/B | Only 12 non-CA residential slots currently supported | 100+ non-CA adult beds |
| 56 | Spruce Mountain Inn | VT | Hold | A | 22 reported residents; strong fit, subscale | Keep as high-fit exception |
| 57 | Zinnia Health | RI; CA excluded | Hold | B/C | Current footprint does not support prior 100+ non-CA thesis | Reconcile contraction, brands, licenses |
| 58 | Promises Behavioral Health | Rolled into ARS | Exclude duplicate | B/C | Acquired by Advanced Recovery Systems in 2026 | Research only in ARS rollup |
| 59 | Complete Healthcare | Multistate outpatient | Exclude | D | Predominantly outpatient | Material owned licensed residential platform |
| 60 | Porch Light Health | CO/regional | Exclude | D | Clinic/outpatient-heavy OUD model | Material residential segment |

## 9. Parent-company corrections already applied

- Promises Behavioral Health → Advanced Recovery Systems.
- Harmony Health Group → Thrive Healthcare; never confuse it with Minnesota-based Thrive Behavioral Network.
- Haven Behavioral Healthcare → Oceans Healthcare; Haven Health Management remains separate.
- Royal Life Centers and related brands → Aliya Health Group.
- Lifeskills South Florida and related brands → Odyssey Behavioral Healthcare.
- WhiteSands and related Florida operations → Gain Holdings Group.
- Broadstep → RHA Health Services.
- Newport Academy, Newport Institute, PrairieCare, and Center for Families → Newport Healthcare; youth programs remain excluded from core beds.
- Mission Connection → AMFM Healthcare as outpatient context; it cannot inflate residential capacity.
- Eating Recovery Center and Pathlight → one ERC Pathlight operating parent; adjacent specialty only.
- Monte Nido, Clementine, Oliver-Pyatt, Rosewood, and Walden → Monte Nido & Affiliates; eating-disorder specialty only.
- NUWAY, Cochran, The Gables, Arrigoni, and the NUWAY clinic → nonprofit NUWAY Alliance; excluded from private ranks but retained as context.
- BHG records → Behavioral Health Group, Vistria-backed; 139 observable locations across 20 states, outpatient OUD market context rather than residential target.
- Sagent and Nystrom clusters → Sagent Behavioral Health, Nautic-backed; 50 observable directory locations across four states, with outpatient/adjacent contamination unresolved.
- RHA, Salisbury Behavioral Health, and PAHrtners Deaf Services → Blue Wolf-backed RHA Health Services; target beds require separation from IDD/community services.
- Legacy Meadows domains → Kohlberg-backed Meadows Behavioral Healthcare; 11 observable directory records across six non-CA states, not a complete portfolio count.
- 94 Pinnacle source records → Pinnacle Treatment Centers, Linden-backed; mainly outpatient OUD, selected residential.
- 14 AdCare/AAC brand records → American Addiction Centers.
- 17 Embark records → Embark Behavioral Health; youth/young-adult orientation.
- Emerald Coast Behavioral Hospital and matched UHS domain → publicly traded Universal Health Services; excluded from private acquisition ranks.
- 15 Sandstone records → Vistria-backed Sandstone Care, LLC; mixed youth/young-adult signal.
- Northpoint and Imagine by Northpoint → Northpoint Recovery Holdings; 17 source records, not necessarily the full current portfolio.
- Bradford, Lakeview, Parkdale, Cornerstone, and Stepping Stone → Lee Equity-backed Bradford Health Services.
- Sunrise Detox and Evolve Recovery → Mayfair-backed Praesum Healthcare.

Record counts in the source universe are discovery observations and must never be presented as complete current site counts. This is especially important where a company reports more locations than the federal source currently contains.

## 10. Confidence, verification, and contradiction rules

### Source hierarchy

1. **Current state regulator/license record** for license type, legal operator, status, address, and capacity.
2. **State business registry, SEC filing, accreditation record, current first-party corporate disclosure, or definitive transaction notice** for legal identity, control, sponsor, and current operating relationships.
3. **Current first-party program/facility page** for services, populations, physical sites, and reported capacity.
4. **Credible transaction press, trade publication, or payer material** for ownership changes and market context.
5. **Federal facility directory** for national discovery, ownership classification, and service signals.
6. **Commercial directories, search results, archived pages, job postings, and marketing content** for lead generation only.

### High-confidence company rule

Do not label a company high confidence until all four statements are true:

1. The operating parent and canonical legal entity relationship is documented.
2. Current physical operating states are reconciled and California is removed.
3. Adult target-fit facilities are separated from youth, hospital, IDD, eating-disorder, outpatient, and housing operations.
4. The bed total is derived from current state licenses or equivalent regulator-grade evidence; operator/company claims remain corroboration.

### Claim discipline

- Preserve licensed, staffed, operational, funded, approved, census, maximum, historical, announced, and estimated capacity as different claim types.
- Store source date, retrieval date, URL, supported fields, and evidence grade for each claim.
- Prefer the narrower defensible number over a broad unsupported total.
- Do not silently resolve contradictions. Keep both claims, explain the conflict, and block the affected gate.
- Do not let a high-confidence parent relationship confer high confidence on capacity, payer mix, service fit, or acquisition eligibility.
- Do not let an old directory record override a current regulator record.
- Do not add overlapping operator-reported capacity to a licensed total.
- Do not treat a sponsor or platform's portfolio page as proof that every operating entity is inside the transaction perimeter.

### Important open contradictions and gaps

- SB Holdings has a current Florida survey fine and historical/future capacity claims that are not part of the current 50-bed Georgia license slice.
- Discovery's June 2026 HPS-majority transaction announcement was conditioned on regulatory approval; a closing notice has not yet been located.
- Ijomah & Associates' five Maryland residential-crisis sites show July 30, 2026 expiration dates; renewal status remains unresolved and no capacity is counted.
- Spruce Mountain's program, entity, and 22-resident maximum are evidenced, but beneficial ownership and regulator-published licensed capacity remain open.
- Integrated Behavioral Health Services' Nebraska program is current, but the 16-bed figure is historical because the live source does not publish capacity.
- Tennessee verifies BrightQuest's two addresses but not their licensed capacity.
- Pyramid's >80 current locations and broad 1,000+ historical capacity signal require sponsor verification and service-by-service segmentation.

## 11. Fifty States product and research workflow

The acquisition workspace is an owner-only module within Fifty States. Its local/private acquisition datastore is separate from patient data, deploys inside the same Alamo Platform Azure environment, and remains searchable by parent, brand, state, capacity band, fit, maturity, payer signal, ownership confidence, decision, and research stage.

The governed stages are:

```text
facility discovery
  → proposed organization
  → owner screen / bucket
  → frozen 50–100 company cohort
  → parent and facility research
  → license/capacity verification
  → approximately 20 high-confidence candidates
  → transaction diligence
```

### Owner workflow

1. Start in the 1,067-company mature pool; keep all 8,516 proposals searchable.
2. Filter by physical states, fit A/B, adult population, residential setting, capacity band, payer direction, maturity, and contamination risk.
3. Mark Research, Hold, or Pass without launching expensive research.
4. Preserve high-fit sub-100 exceptions instead of losing them to the capacity threshold.
5. Freeze an owner-selected cohort of roughly 50–100 companies.
6. Research only the frozen cohort deeply: parent, legal entities, sites, licenses, beds, payer/referral evidence, contradictions, and pivotability.
7. Advance approximately 20 to high confidence and begin transaction-specific diligence.

### Analyst and agent model

- **AH Analyst is the overview agent.** It explains the funnel, evidence, gaps, and comparisons in owner language.
- Narrow research workers may propose parent matches, license records, source links, and contradictions.
- Deterministic validators own totals, deduplication, field requirements, California exclusion, evidence grading, and stage transitions.
- The owner approves the research cohort and material target decisions.
- An agent may summarize verified evidence; it may not invent a bed count, close a contradiction in prose, or promote a company merely because it sounds plausible.

### Minimum parent record

| Domain | Required fields |
| --- | --- |
| Identity | Display parent, canonical legal parent, aliases, brands, sponsor/owner, acquisition eligibility |
| Geography | Current physical states, state source date, California exclusion |
| Facilities | Address, legal operator, program/service, population, current status |
| License | Authority, number, category, status, issue/expiry, approved capacity, CHOW/CON/DoN implications |
| Capacity | Verified core, verified adjacent, reported non-overlapping, hospital/youth/other, screening range, convertible range |
| Market fit | Adult/SMI/step-down signal, setting, payer direction, maturity, contamination, comparable cluster |
| Transaction | Site control, zoning/use, accreditation, payer contracts, referral relationships, change-of-control obligations |
| Evidence | Source URL, source type, as-of date, supported fields, confidence, contradictions |
| Workflow | Research/Hold/Pass, selected cohort, stage, analyst notes, next verification action |

## 12. Recommended research priorities

### First mature-company cohort

Prioritize companies that combine meaningful residential scale, adult populations, commercial or mixed payer potential, and manageable service contamination:

- Odyssey Behavioral Healthcare
- Advanced Recovery Systems
- Discovery Behavioral Health, adult slice only
- Recovery Centers of America
- Banyan Treatment Centers
- Boca Recovery Center
- Northpoint Recovery
- Haven Health Management
- Gain Holdings / WhiteSands
- Avenues Recovery Center
- Bradford Health Services
- Meadows Behavioral Healthcare
- Guardian Recovery
- Thrive Healthcare
- Recovery Unplugged
- All Points North
- Pyramid Healthcare, segmented carefully
- Hickory Recovery Network
- Aliya Health Group
- Maryland Treatment Centers

Keep Southern Live Oak, AMFM, Kelly-Norton, Thrive Behavioral Network, Spruce Mountain, and SB Holdings in a separate high-fit sub-100 or exception lane. Keep Signature, SUN, Oceans, Perimeter, PAM, and the hospital segment of Summit in a hospital/approval lane. This is a research order, not a recommendation to buy or a claim that any company is available.

### Per-company verification order

1. Confirm operating parent, legal entity, sponsor/owner, for-profit status, and acquisition eligibility.
2. Reconcile all current physical sites and states; remove closed, announced, telehealth-only, and California locations.
3. Match each facility to the current state license and legal operator.
4. Capture capacity and service at the license level; classify core, adjacent, hospital/youth/other.
5. Check accreditation, enforcement, sanctions, expiration/renewal, and material litigation or consent orders.
6. Verify commercial/public payer participation, level-of-care contracts, authorization behavior, and collected rate where obtainable.
7. Verify hospital/crisis referral relationships using agreements and historical admissions, not anecdotes.
8. For adjacent assets, estimate convertible beds only after the state pathway, zoning/use, building, staffing, and payer gap analysis.
9. Record contradictions and stop target promotion until material conflicts are resolved.
10. Add transaction and valuation work only after the operating perimeter and relevant beds are defensible.

## 13. Valuation boundary

The user-supplied workbook and methods document are preserved as the basis for a future transparent screen.[^28][^29] The implemented arithmetic is:

```text
Revenue = relevant beds × occupancy × 365 × net revenue per occupied bed-day
EBITDA = revenue × normalized EBITDA margin
Illustrative enterprise value = normalized EBITDA × selected multiple
```

Current outputs are assumption-driven and may value only a partial evidenced bed slice. They exclude or may not fully capture debt, cash, lease liabilities, owned real estate, working capital, capex, payer concentration, denial/collection leakage, quality liabilities, taxes, transaction costs, and the exact acquired legal perimeter. Therefore:

- no enterprise-value floor belongs in the owner filter;
- no screening bed range becomes a valuation input;
- adjacent, hospital, youth, and California beds do not enter a core-bed value;
- announced or hypothetical conversion capacity is never current capacity;
- the first task is market mapping and bed verification, not price setting.

## 14. What is established, inferred, and still unknown

### Established with current evidence

- The national non-California source universe and deterministic funnel counts above.
- The 47 current cited parent relationships and 22 current high-confidence private-ownership determinations in the local index.
- The 888-bed regulator-verified partial ledger and its 414 core / 474 adjacent split.
- The 130-bed separate operator-reported ledger.
- Southern Live Oak and Kelly-Norton as the two current strict validated-target rows.
- The parent corrections listed in this dossier.
- The state regulatory frameworks summarized here as of the cited dates.

### Directional or inferred

- The capacity bands for companies labeled “probable 100+.”
- Mature/platform/regional labels derived from observable facility scale and state breadth.
- Payer signals labeled Commercial, Mixed, or Public unless backed by contract-level material.
- Contamination and pivot potential before license-by-license segmentation.
- Company-wide capacity lower bounds based on partial current first-party or state evidence.

### Still unknown for most companies

- Complete current legal-entity and beneficial-ownership perimeter.
- Complete current licensed adult core and adjacent bed totals.
- Staffed/operational beds, census, occupancy, admissions, length of stay, and referral conversion.
- Contracted rates, authorization practices, denial/collection performance, and true payer mix.
- Compliance history across every facility.
- Which licenses, contracts, zoning rights, leases, accreditations, and approvals survive a specific deal structure.
- Realistically convertible beds and the time/capital required.
- Seller interest, transaction perimeter, financial performance, and enterprise value.

## 15. Immediate next steps

1. Use the existing Fifty States filters to select and freeze the first 50–100-company owner cohort.
2. Start with the 20-company mature priority list above plus chosen state or specialty additions.
3. Build license-level facility maps for the highest-priority states: Pennsylvania and Georgia first; Tennessee and Florida second.
4. Complete current parent-wide bed sums for Odyssey, Advanced Recovery Systems, Discovery's adult segment, RCA, Banyan, Boca, Northpoint, Haven, Gain/WhiteSands, Avenues, Bradford, and Meadows.
5. Resolve sponsor/beneficial ownership and transaction status for medium-confidence parents.
6. Create separate core-acquisition, pivot-platform, and approval/site scores; never collapse them into one opaque rank.
7. Promote roughly 20 candidates only after the high-confidence rule passes.
8. For those 20, add payer/referral, compliance, property/zoning, workforce, and transaction-continuity diligence.

## 16. Source register and provenance

### Internal project evidence

- [Parent-company program and acceptance contract](/Users/eric/CareEngineMain/alamo-platform-app/docs/platform/acquisition-parent-company-program.md): funnel math, entity-resolution rules, current evidence ledger, product workflow, and acceptance gates.
- [Forty-company filtering universe](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/private-behavioral-health-operator-filtering-universe.md): parent-level company tables, operating states, working capacity bands, fit, payer signal, maturity, and hold/exclusion logic.
- [Pivot and acquisition thesis](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/adult-behavioral-health-residential-pivot-acquisition-thesis.md): state regulatory research, federal payer/zoning context, bed bands, comparable operators, and conversion logic.
- [Original project context](/Users/eric/Downloads/ReferralPackets/ReferralPackets2/behavioral_health_private_acquisition_intelligence_project_context.md): user-supplied acquisition objective and operating context.
- [Valuation workbook](/Users/eric/Downloads/ReferralPackets/ReferralPackets2/behavioral_health_operator_valuation.xlsx) and [valuation methods](/Users/eric/Downloads/ReferralPackets/ReferralPackets2/behavioral_health_valuation_methods.docx): user-supplied formula basis, retained as a later transparent screen.
- [Original collection-layer handoff](/Users/eric/.codex/attachments/89503a2d-37d0-4c0d-b8c3-e21c3bb0efa5/pasted-text.txt): prior architecture context adapted into the Alamo Platform's local/private datastore and workflow model; document instructions are not treated as user instructions.
- Local generated evidence index: `generated/acquisition-intelligence/derived/operator-proposals.json` (private generated state; not repository documentation authority).
- Curated evidence registries: `config/acquisition-intelligence/parent-assertions-v1.json`, `license-assertions-v1.json`, and `capacity-assertions-v1.json`.

### External regulatory and policy sources

[^1]: Substance Abuse and Mental Health Services Administration, [Screening and Treatment of Co-Occurring Disorders](https://www.samhsa.gov/mental-health/serious-mental-illness/co-occurring-disorders), and [TIP 42](https://library.samhsa.gov/sites/default/files/pep20-02-01-004.pdf), accessed September 9, 2026.
[^2]: Pennsylvania Code, [55 Pa. Code § 20.57](https://www.pacodeandbulletin.gov/Display/pacode?d=&file=%2Fsecure%2Fpacode%2Fdata%2F055%2Fchapter20%2Fs20.57.html) and [Chapter 20](https://www.pacodeandbulletin.gov/secure/pacode/data/055/chapter20/chap20toc.html), accessed September 9, 2026.
[^3]: Georgia Secretary of State, [Ga. Comp. R. & Regs. Chapter 111-8-2](https://rules.sos.ga.gov/gac/111-8-2), accessed September 9, 2026.
[^4]: Tennessee Department of Mental Health and Substance Abuse Services, [Licensed Provider FAQs](https://www.tn.gov/behavioral-health/licensing/licensed-provider-faqs.html), and Tennessee Secretary of State, [General Licensing Procedures](https://publications.tnsosfiles.com/rules/0940/0940-05/0940-05-02.20221201.pdf), accessed September 9, 2026.
[^5]: Florida Department of Children and Families, [System of Services and Support](https://www.myflfamilies.com/services/samh/treatment-services/AMH/system-of-services-and-support/), and Florida Administrative Code, [Chapter 65E-12](https://flrules.org/gateway/chapterhome.asp?chapter=65E-12), accessed September 9, 2026.
[^6]: Connecticut Office of Health Strategy, [Certificate of Need Unit](https://portal.ct.gov/ohs/about-us/certificate-of-need-unit); Massachusetts DPH, [Determination of Need](https://www.mass.gov/determination-of-need-don); Washington DOH, [Private Psychiatric Hospital License](https://doh.wa.gov/licenses-permits-and-certificates/facilities-z/private-psychiatric-hospitals/apply-license), accessed September 9, 2026.
[^7]: North Carolina DHSR, [Mental Health Licensure FAQs](https://info.ncdhhs.gov/dhsr/mhlcs/faq.html) and [Establish a Mental Health, I/DD or Substance Abuse Service](https://info.ncdhhs.gov/dhsr/mhlcs/establish.html), accessed September 9, 2026.
[^8]: Minnesota DHS, [Adult Mental Health Residential Treatment Services](https://mn.gov/dhs/mental-health/adult-services/programs-services/mental-health-residential-treatment-services/), [Residential Adult Mental Health Programs](https://mn.gov/dhs/partners-and-providers/partners-licensing/adult-behavioral-health-residential-facilities/), and [Service Rates](https://mn.gov/dhs/partners-and-providers/policies-procedures/adult-mental-health/service-rates-information/), accessed September 9, 2026.
[^9]: Alamo Platform internal working research, [Private Behavioral Health Operator Filtering Universe](/Users/eric/CareEngineMain/alamo-platform-app/docs/reference/private-behavioral-health-operator-filtering-universe.md), updated September 9, 2026.
[^10]: SAMHSA, [National Guidelines for Behavioral Health Crisis Care](https://store.samhsa.gov/sites/default/files/pep20-08-01-001.pdf), accessed September 9, 2026.
[^11]: Pennsylvania DHS, [Medicaid Provider Enrollment Information](https://www.pa.gov/agencies/dhs/resources/for-providers/provider-enrollment-information/ma-provider-enrollment-information), accessed September 9, 2026.
[^12]: Washington DOH, [Private Psychiatric Hospital License](https://doh.wa.gov/licenses-permits-and-certificates/facilities-z/private-psychiatric-hospitals/apply-license) and [Certificate of Need](https://doh.wa.gov/licenses-permits-and-certificates/facilities-z/certificate-need/applying-certificate-need), accessed September 9, 2026.
[^13]: Massachusetts DPH, [Initial Licensure and Change of Ownership](https://www.mass.gov/how-to/health-care-facility-initial-licensure-and-change-of-ownership) and [Determination of Need](https://www.mass.gov/determination-of-need-don), accessed September 9, 2026.
[^14]: HHS Office of Inspector General, [Safe Harbor Regulations](https://oig.hhs.gov/compliance/safe-harbor-regulations/) and [Federal Anti-Kickback Law and Safe Harbors](https://oig.hhs.gov/fraud/docs/safeharborregulations/safefs.htm), accessed September 9, 2026.
[^15]: U.S. Department of Labor, [ACA Part XVII and Mental Health Parity FAQs](https://www.dol.gov/agencies/ebsa/about-ebsa/our-activities/resource-center/faqs/aca-part-17) and [Mental Health Parity Compliance](https://www.dol.gov/sites/dolgov/files/EBSA/about-ebsa/our-activities/resource-center/publications/mental-health-parity-provisions-information.pdf), accessed September 9, 2026.
[^16]: U.S. Departments of Labor, HHS, and Treasury, [Statement Regarding Enforcement of the 2024 MHPAEA Final Rule](https://www.cms.gov/files/document/statement-regarding-enforcement-final-rule-requirements-related-mhpaea.pdf), May 15, 2025; U.S. Department of Labor, [2025 MHPAEA Report to Congress](https://beta.dol.gov/research-data/surveys-reports-publications/2025-mhpaea-report-congress), accessed September 9, 2026.
[^17]: Centers for Medicare & Medicaid Services, [Services for Individuals in an Institution for Mental Diseases](https://www.medicaid.gov/medicaid/long-term-services-supports/institutional-long-term-care/services-individuals-age-65-or-older-institution-mental-diseases), accessed September 9, 2026.
[^18]: CMS, [SMI Section 1115 Demonstration Opportunity](https://www.medicaid.gov/medicaid/section-1115-demonstrations/serious-mental-illness-section-1115-demonstration-opportunity), [In Lieu of Services and Settings](https://www.medicaid.gov/medicaid/managed-care/guidance/lieu-of-services-and-settings), and [IMD Managed-Care FAQs](https://www.medicaid.gov/sites/default/files/federal-policy-guidance/downloads/faq08172017.pdf), accessed September 9, 2026.
[^19]: Pennsylvania DHS, [OMHSAS New Licensing Application Package](https://www.pa.gov/content/dam/copapwp-pagov/en/dhs/documents/licensing/bhsl-licensing/documents/2025-03-omhsas-license-application-instructions.pdf), updated March 2025.
[^20]: Pennsylvania DHS, [Mental Health Licensing New Provider Information](https://www.pa.gov/agencies/dhs/resources/licensing/mental-health-programs-licensing/mh-licensing-new-providers), accessed September 9, 2026.
[^21]: Cumberland County, Pennsylvania, [Human Services Block Grant Plan 2023–2024](https://www.pa.gov/content/dam/copapwp-pagov/en/dhs/documents/docs/block-grants/documents/cp-23-24/fy-23-24-cumberland-county-human-services-plan.pdf), residential-capacity discussion.
[^22]: Georgia Department of Community Health, [Certificate of Need](https://dch.georgia.gov/divisionsoffices/office-health-planning/certificate-need-con), accessed September 9, 2026.
[^23]: Tennessee Department of Mental Health and Substance Abuse Services, [Licensed Sites and Category Definitions](https://www.tn.gov/behavioral-health/research/fast-facts/licensure.html), accessed September 9, 2026.
[^24]: Florida AHCA, [Residential Treatment Facilities](https://ahca.myflorida.com/health-quality-assurance/bureau-of-health-facility-regulation/hospital-outpatient-services-unit/residential-treatment-facilities.html), accessed September 9, 2026.
[^25]: Connecticut OHS, [How to File a Certificate of Need](https://portal.ct.gov/ohs/programs-and-initiatives/certificate-of-need/con-form-and-fees) and [Statewide Health Care Facilities and Services Plan 2024](https://portal.ct.gov/-/media/ohs/hsp/ohs-statewide-health-care-facilities-and-services-plan-2024.pdf), Chapter 6.
[^26]: North Carolina DHSR, [Establish a Psychiatric or Substance Abuse Hospital](https://info.ncdhhs.gov/dhsr/ahc/flopsych.htm) and [State Medical Facilities Plan](https://info.ncdhhs.gov/dhsr/ncsmfp/index.html), accessed September 9, 2026.
[^27]: U.S. DOJ and HUD, [Joint Statement on Group Homes, Land Use, and the Fair Housing Act](https://www.justice.gov/crt/joint-statement-department-justice-and-department-housing-and-urban-development-0) and [Joint Statement on State and Local Land Use Laws](https://www.justice.gov/usdoj-media/opa/media/865701/dl?inline=), accessed September 9, 2026.
[^28]: User-supplied [behavioral_health_operator_valuation.xlsx](/Users/eric/Downloads/ReferralPackets/ReferralPackets2/behavioral_health_operator_valuation.xlsx), `Assumptions!B6:M11`, reviewed September 9, 2026.
[^29]: User-supplied [behavioral_health_valuation_methods.docx](/Users/eric/Downloads/ReferralPackets/ReferralPackets2/behavioral_health_valuation_methods.docx), reviewed September 9, 2026.

## Final decision rule

Prefer a 75-bed exact-fit adult psychiatric residential operator over a 700-bed diversified company when the larger company's usable adult residential segment cannot be isolated. Prefer the larger company only when the relevant beds, license pathway, physical sites, payer/referral engine, and transaction perimeter can be proven. The objective is not the longest company list or the largest claimed bed total; it is a defensible funnel from thousands of possibilities to 50–100 researched parents and approximately 20 genuinely high-confidence acquisition candidates.
