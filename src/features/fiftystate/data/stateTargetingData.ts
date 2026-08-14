import type { EffectivenessAudienceId } from "../../../../shared/effectiveness-evidence.mjs";

export type GovernanceCode = "C" | "R" | "S" | "M" | "H";

export type OpportunityPathCode = "A" | "B" | "C" | "D" | "E";

export interface StateTargetingRecord {
  stateName: string;
  stateCode: string;
  governanceBucket: string;
  governanceCodes: GovernanceCode[];
  primaryGovernanceCode: GovernanceCode;
  governanceLabel: string;
  stateAuthority: string;
  primaryTarget: string;
  targetUniverse: string;
  decisionConcentration: string;
  targetTitles: string[];
  researchPitch: string;
  opportunityPaths: OpportunityPathCode[];
  relevanceTags: string[];
  recommendedAudience: EffectivenessAudienceId;
  audienceScores: Record<EffectivenessAudienceId, number>;
}

export const GOVERNANCE_OPTIONS: Record<
  GovernanceCode,
  { label: string; shortLabel: string; description: string; color: string }
> = {
  C: {
    label: "County/local-government led",
    shortLabel: "County-led",
    description: "Start with the county behavioral-health department, local authority, or board.",
    color: "#0f8b73"
  },
  R: {
    label: "Regional public-authority led",
    shortLabel: "Regional-led",
    description: "Start with the regional authority, district, CSB, LMHA, or equivalent.",
    color: "#d78b45"
  },
  S: {
    label: "State-led",
    shortLabel: "State-led",
    description: "Start with the state behavioral-health or human-services agency.",
    color: "#2f6f86"
  },
  M: {
    label: "Managed-care led",
    shortLabel: "Managed care",
    description: "Start with Medicaid MCOs, regional plans, CCOs, or specialty plans.",
    color: "#b85c4d"
  },
  H: {
    label: "Hybrid",
    shortLabel: "Hybrid",
    description: "Planning, funding, or contracting power is meaningfully shared.",
    color: "#57534e"
  }
};

export const OPPORTUNITY_PATHS: Record<
  OpportunityPathCode,
  { label: string; description: string; reportFamilies: string }
> = {
  A: {
    label: "Direct local-government",
    description: "Pitch the county, local board, or public authority directly.",
    reportFamilies: "Cost and diversion, contract neutrality, placements, capacity, and board-ready outcomes."
  },
  B: {
    label: "Regional public-system",
    description: "Pitch a finite set of regional authorities.",
    reportFamilies: "Regional capacity, referral networks, demand, gaps, crisis diversion, and comparative outcomes."
  },
  C: {
    label: "Concentrated state",
    description: "Pitch the state department first.",
    reportFamilies: "Statewide capacity, contract performance, regional equity, legislative reporting, and cost avoidance."
  },
  D: {
    label: "Managed care",
    description: "Pitch both the government purchaser and contracted plans.",
    reportFamilies: "Total cost of care, utilization, network adequacy, avoidable hospitalization, outcomes, and forecasting."
  },
  E: {
    label: "Provider-network first",
    description: "Use regional CMHCs or designated agencies as the practical route to evidence and early participation.",
    reportFamilies: "Community performance, stabilization, incident trends, medication use, demand, and state-contract outcomes."
  }
};

const OPPORTUNITY_STATES: Record<OpportunityPathCode, readonly string[]> = {
  A: ["California", "Ohio", "Wisconsin", "New York", "Pennsylvania", "Michigan", "Minnesota", "Utah", "Maryland"],
  B: ["Texas", "Virginia", "Nebraska", "Iowa", "Louisiana", "Florida", "Colorado", "North Carolina"],
  C: ["Connecticut", "Rhode Island", "Delaware", "Oklahoma", "South Carolina", "Alabama", "Arkansas", "Wyoming", "Montana", "Hawaii", "Idaho", "Maine"],
  D: ["Arizona", "Oregon", "Washington", "Tennessee", "North Carolina", "Florida", "New Mexico", "Kansas", "Pennsylvania", "Colorado"],
  E: ["Kentucky", "New Hampshire", "Vermont", "Indiana", "Missouri", "Mississippi", "West Virginia", "Alaska", "North Dakota", "South Dakota"]
};

const RAW_STATE_TARGETING_ROWS = [
  {
    "stateName": "Alabama",
    "stateCode": "AL",
    "governanceBucket": "S/H",
    "stateAuthority": "Department of Mental Health",
    "primaryTarget": "State-certified and contracted community mental-health centers",
    "targetUniverse": "1 state plus CMHC network",
    "decisionConcentration": "State controls certification, appropriations and much contracting",
    "targetTitles": [
      "Commissioner",
      "Associate Commissioner",
      "CMHC Executive Director",
      "CFO"
    ],
    "researchPitch": "Catchment demand, state contract value, hospitalization and stabilization"
  },
  {
    "stateName": "Alaska",
    "stateCode": "AK",
    "governanceBucket": "S/H",
    "stateAuthority": "Department of Health, Division of Behavioral Health",
    "primaryTarget": "Tribal health organizations, regional nonprofits and state grantees",
    "targetUniverse": "1 state plus major tribal/regional systems",
    "decisionConcentration": "State grants and Medicaid coexist with a major tribally operated behavioral-health infrastructure",
    "targetTitles": [
      "Division Director",
      "Tribal Health Executive",
      "Medicaid Director",
      "Regional Provider CEO"
    ],
    "researchPitch": "Remote access, travel avoidance, crisis capacity and culturally specific outcomes"
  },
  {
    "stateName": "Arizona",
    "stateCode": "AZ",
    "governanceBucket": "M/R/H",
    "stateAuthority": "Arizona Health Care Cost Containment System",
    "primaryTarget": "AHCCCS managed-care plans, including regional and specialty arrangements",
    "targetUniverse": "Several contracted health plans operating by population and geography",
    "decisionConcentration": "AHCCCS and contracted plans control most Medicaid behavioral-health purchasing; counties remain important for justice, crisis and local appropriations",
    "targetTitles": [
      "Health Plan CEO/VP Behavioral Health",
      "AHCCCS Deputy Director",
      "County Health Director"
    ],
    "researchPitch": "Medicaid utilization, crisis and justice diversion, network adequacy and outcomes"
  },
  {
    "stateName": "Arkansas",
    "stateCode": "AR",
    "governanceBucket": "S/M",
    "stateAuthority": "Department of Human Services",
    "primaryTarget": "State-contracted providers and Medicaid managed entities",
    "targetUniverse": "State plus provider and managed-care network",
    "decisionConcentration": "State retains strong program control with managed Medicaid components",
    "targetTitles": [
      "Behavioral Health Services Director",
      "Medicaid Director",
      "Plan Executive",
      "Provider CEO"
    ],
    "researchPitch": "Statewide utilization, contract outcomes, capacity and cost"
  },
  {
    "stateName": "California",
    "stateCode": "CA",
    "governanceBucket": "C",
    "stateAuthority": "Department of Health Care Services",
    "primaryTarget": "58 county behavioral-health departments or plans",
    "targetUniverse": "58 counties",
    "decisionConcentration": "Counties plan systems and contract substantial specialty mental-health, SUD, crisis and residential services; state controls Medicaid policy and major funding rules",
    "targetTitles": [
      "County Behavioral Health Director",
      "HHS Agency Director",
      "CFO",
      "Contracts Director",
      "Board Supervisor"
    ],
    "researchPitch": "Cost and diversion, contract neutrality, capacity, acuity, stabilization and outcomes"
  },
  {
    "stateName": "Colorado",
    "stateCode": "CO",
    "governanceBucket": "R/M/H",
    "stateAuthority": "Behavioral Health Administration; Department of Health Care Policy and Financing",
    "primaryTarget": "Behavioral Health Administrative Service Organizations and Medicaid regional organizations",
    "targetUniverse": "Multiple BHASO regions and Medicaid regional entities",
    "decisionConcentration": "BHASOs manage regional safety-net networks; Medicaid regional organizations contract with covered providers",
    "targetTitles": [
      "BHASO CEO",
      "BHA Commissioner",
      "Regional Organization VP",
      "HCPF Behavioral Health Director"
    ],
    "researchPitch": "Regional gaps, network adequacy, crisis utilization, capacity and outcomes"
  },
  {
    "stateName": "Connecticut",
    "stateCode": "CT",
    "governanceBucket": "S",
    "stateAuthority": "Department of Mental Health and Addiction Services",
    "primaryTarget": "State-operated and state-contracted provider network",
    "targetUniverse": "1 primary state buyer",
    "decisionConcentration": "State agency plans and contracts adult behavioral-health services",
    "targetTitles": [
      "Commissioner",
      "Deputy Commissioner",
      "CFO",
      "Director of Planning",
      "Medical Director"
    ],
    "researchPitch": "Statewide capacity, stabilization, utilization and contract performance"
  },
  {
    "stateName": "Delaware",
    "stateCode": "DE",
    "governanceBucket": "S",
    "stateAuthority": "Division of Substance Abuse and Mental Health",
    "primaryTarget": "State-operated and contracted providers",
    "targetUniverse": "1 primary state buyer",
    "decisionConcentration": "State planning and procurement",
    "targetTitles": [
      "Division Director",
      "Contract Administrator",
      "Medicaid Director",
      "CFO"
    ],
    "researchPitch": "Statewide census, utilization, outcomes and cost neutrality"
  },
  {
    "stateName": "Florida",
    "stateCode": "FL",
    "governanceBucket": "R/M",
    "stateAuthority": "Department of Children and Families; Florida Medicaid",
    "primaryTarget": "Regional behavioral-health Managing Entities; Medicaid managed-care plans",
    "targetUniverse": "Seven Managing Entities plus Medicaid plans",
    "decisionConcentration": "Managing Entities administer much of the state-funded safety net; Medicaid plans purchase covered care",
    "targetTitles": [
      "Managing Entity CEO",
      "DCF Regional Director",
      "Medicaid Plan VP Behavioral Health"
    ],
    "researchPitch": "Regional network capacity, cost, outcomes, homelessness and jail diversion"
  },
  {
    "stateName": "Georgia",
    "stateCode": "GA",
    "governanceBucket": "S/R",
    "stateAuthority": "Department of Behavioral Health and Developmental Disabilities",
    "primaryTarget": "DBHDD regional field offices and contracted community providers",
    "targetUniverse": "Six state regions plus provider network",
    "decisionConcentration": "State controls funding and contracts; regions coordinate local service systems",
    "targetTitles": [
      "DBHDD Commissioner",
      "Regional Coordinator",
      "Provider CEO",
      "Contract Director"
    ],
    "researchPitch": "Regional capacity, crisis demand, utilization and contract outcomes"
  },
  {
    "stateName": "Hawaii",
    "stateCode": "HI",
    "governanceBucket": "S",
    "stateAuthority": "Department of Health, Adult Mental Health Division and Child and Adolescent Mental Health Division",
    "primaryTarget": "State branches and contracted island providers",
    "targetUniverse": "1 state system with island-level delivery",
    "decisionConcentration": "Centralized state planning and contracting",
    "targetTitles": [
      "Division Administrator",
      "Branch Chief",
      "Medicaid Director",
      "Provider CEO"
    ],
    "researchPitch": "Island access, placement travel, capacity, stabilization and outcomes"
  },
  {
    "stateName": "Idaho",
    "stateCode": "ID",
    "governanceBucket": "S/H",
    "stateAuthority": "Department of Health and Welfare, Division of Behavioral Health; Idaho Medicaid",
    "primaryTarget": "State behavioral-health system, Medicaid contractors, Regional Behavioral Health Boards as planning/advisory bodies",
    "targetUniverse": "1 main state system; seven regional boards; seven public-health districts have separate public-health functions",
    "decisionConcentration": "DHW, not the public-health districts, is the principal behavioral-health funding and contracting target; regional boards identify needs and coordinate priorities",
    "targetTitles": [
      "Division Administrator",
      "Medicaid Administrator",
      "Regional Behavioral Health Board Chair",
      "Contracting Officer"
    ],
    "researchPitch": "Rural capacity, crisis demand, state hospitalization, utilization and regional gaps"
  },
  {
    "stateName": "Illinois",
    "stateCode": "IL",
    "governanceBucket": "S/H",
    "stateAuthority": "Department of Human Services, Division of Mental Health; Medicaid",
    "primaryTarget": "State-contracted providers, counties in selected areas, Medicaid MCOs",
    "targetUniverse": "State plus large provider/MCO network",
    "decisionConcentration": "State dominates grant and program contracting; local authority is inconsistent",
    "targetTitles": [
      "Division Director",
      "Medicaid Chief",
      "Provider CEO",
      "County Health Director"
    ],
    "researchPitch": "State contract outcomes, regional access, hospital utilization and housing"
  },
  {
    "stateName": "Indiana",
    "stateCode": "IN",
    "governanceBucket": "S/H",
    "stateAuthority": "Division of Mental Health and Addiction",
    "primaryTarget": "State-designated community mental health centers and Medicaid plans",
    "targetUniverse": "State plus regional CMHC network",
    "decisionConcentration": "State designates and funds CMHC safety-net functions; Medicaid purchasing is increasingly managed",
    "targetTitles": [
      "Division Director",
      "CMHC CEO",
      "Medicaid Plan VP",
      "CFO"
    ],
    "researchPitch": "Catchment demand, crisis access, outcomes and contract value"
  },
  {
    "stateName": "Iowa",
    "stateCode": "IA",
    "governanceBucket": "R/S",
    "stateAuthority": "Iowa Health and Human Services",
    "primaryTarget": "Seven Behavioral Health Districts administered through district administrative-service organizations",
    "targetUniverse": "Seven districts",
    "decisionConcentration": "State sets the system plan and distributes resources through seven regional districts",
    "targetTitles": [
      "District Administrator",
      "Iowa HHS Behavioral Health Director",
      "Board or Advisory Council leadership"
    ],
    "researchPitch": "District demand, service gaps, referral patterns and capacity"
  },
  {
    "stateName": "Kansas",
    "stateCode": "KS",
    "governanceBucket": "S/M/H",
    "stateAuthority": "Department for Aging and Disability Services; Kansas Medicaid",
    "primaryTarget": "Community mental health centers and Medicaid managed-care plans",
    "targetUniverse": "State plus CMHC catchments and MCOs",
    "decisionConcentration": "State funds safety-net programs; CMHCs organize local care; MCOs purchase Medicaid services",
    "targetTitles": [
      "KDADS Commissioner",
      "CMHC CEO",
      "MCO VP Behavioral Health",
      "County Commissioner"
    ],
    "researchPitch": "Rural demand, network adequacy, crisis outcomes and cost"
  },
  {
    "stateName": "Kentucky",
    "stateCode": "KY",
    "governanceBucket": "S/R/H",
    "stateAuthority": "Cabinet for Health and Family Services",
    "primaryTarget": "Regional community mental health centers and Medicaid MCOs",
    "targetUniverse": "14 regional CMHCs plus MCOs",
    "decisionConcentration": "Regional CMHCs anchor the safety net; state and MCOs control major funding",
    "targetTitles": [
      "CMHC CEO",
      "Cabinet Commissioner",
      "MCO VP Behavioral Health"
    ],
    "researchPitch": "Regional outcomes, crisis diversion, demand and Medicaid economics"
  },
  {
    "stateName": "Louisiana",
    "stateCode": "LA",
    "governanceBucket": "R/M/H",
    "stateAuthority": "Louisiana Department of Health",
    "primaryTarget": "Local Governing Entities and Medicaid managed-care plans",
    "targetUniverse": "Ten LGEs plus Medicaid plans",
    "decisionConcentration": "LGEs organize publicly supported local behavioral-health and developmental-disability systems; MCOs purchase Medicaid care",
    "targetTitles": [
      "LGE Executive Director",
      "Board Chair",
      "Medicaid Plan VP",
      "LDH Assistant Secretary"
    ],
    "researchPitch": "Regional demand, capacity, justice diversion and Medicaid utilization"
  },
  {
    "stateName": "Maine",
    "stateCode": "ME",
    "governanceBucket": "S/H",
    "stateAuthority": "Department of Health and Human Services",
    "primaryTarget": "State-contracted community providers; county jail and local crisis partners",
    "targetUniverse": "1 state plus provider network",
    "decisionConcentration": "State controls most safety-net funding; local entities influence justice and crisis demand",
    "targetTitles": [
      "Behavioral Health Director",
      "Medicaid Director",
      "Contract Director",
      "County Administrator"
    ],
    "researchPitch": "Rural capacity, out-of-area placements, crisis and jail diversion"
  },
  {
    "stateName": "Maryland",
    "stateCode": "MD",
    "governanceBucket": "H/R",
    "stateAuthority": "Behavioral Health Administration; Maryland Medicaid",
    "primaryTarget": "Local behavioral-health authorities and core service agencies",
    "targetUniverse": "24 county/Baltimore City jurisdictions, sometimes administered regionally",
    "decisionConcentration": "State supplies policy and funding; local authorities plan and coordinate services",
    "targetTitles": [
      "Local Behavioral Health Director",
      "County Health Officer",
      "BHA Deputy Director"
    ],
    "researchPitch": "Local needs, referral flow, capacity, overdose and crisis outcomes"
  },
  {
    "stateName": "Massachusetts",
    "stateCode": "MA",
    "governanceBucket": "S/H",
    "stateAuthority": "Department of Mental Health; MassHealth",
    "primaryTarget": "State-funded service areas, managed-care entities and providers",
    "targetUniverse": "1 state plus regional/provider network",
    "decisionConcentration": "State controls specialty mental health; Medicaid plans control covered utilization",
    "targetTitles": [
      "Commissioner",
      "Area Director",
      "MassHealth Behavioral Health Director",
      "CFO"
    ],
    "researchPitch": "Statewide bed capacity, discharge bottlenecks and cost avoidance"
  },
  {
    "stateName": "Michigan",
    "stateCode": "MI",
    "governanceBucket": "C/R/H",
    "stateAuthority": "Department of Health and Human Services",
    "primaryTarget": "Community Mental Health Services Programs and regional PIHPs",
    "targetUniverse": "Roughly 46 CMH programs and 10 regional PIHPs under the longstanding structure",
    "decisionConcentration": "CMHs organize local services; PIHPs manage specialty Medicaid funding; state sets overall policy",
    "targetTitles": [
      "CMH CEO",
      "PIHP CEO",
      "County Commissioner",
      "MDHHS Behavioral Health Director"
    ],
    "researchPitch": "Medicaid utilization, local outcomes, cost, capacity and county accountability"
  },
  {
    "stateName": "Minnesota",
    "stateCode": "MN",
    "governanceBucket": "C/H",
    "stateAuthority": "Department of Human Services",
    "primaryTarget": "County and tribal human-services agencies; Medicaid plans",
    "targetUniverse": "87 counties plus tribal entities and joint arrangements",
    "decisionConcentration": "Counties administer many local services while the state and plans control major funding streams",
    "targetTitles": [
      "County Human Services Director",
      "Community Services Director",
      "DHS Behavioral Health Director"
    ],
    "researchPitch": "County variation, housing stability, crisis utilization and capacity"
  },
  {
    "stateName": "Mississippi",
    "stateCode": "MS",
    "governanceBucket": "S/R/H",
    "stateAuthority": "Department of Mental Health",
    "primaryTarget": "Regional community mental-health commissions and centers",
    "targetUniverse": "Approximately 14 regional CMHC structures",
    "decisionConcentration": "State certification and funding combined with regional public or nonprofit governance",
    "targetTitles": [
      "Regional Executive Director",
      "Commission Chair",
      "State Director"
    ],
    "researchPitch": "Regional access, crisis and hospital diversion, contract and outcome comparisons"
  },
  {
    "stateName": "Missouri",
    "stateCode": "MO",
    "governanceBucket": "S/H",
    "stateAuthority": "Department of Mental Health",
    "primaryTarget": "Administrative agents, community mental-health centers and contracted providers",
    "targetUniverse": "State plus regional/provider network",
    "decisionConcentration": "State department directs funding; designated local organizations coordinate access",
    "targetTitles": [
      "Department Director",
      "Division Director",
      "Administrative Agent CEO",
      "CFO"
    ],
    "researchPitch": "Regional access, crisis and hospital diversion, outcomes and contract performance"
  },
  {
    "stateName": "Montana",
    "stateCode": "MT",
    "governanceBucket": "S/H",
    "stateAuthority": "Department of Public Health and Human Services",
    "primaryTarget": "State-contracted regional and community providers; Medicaid plans where applicable",
    "targetUniverse": "1 state plus provider network",
    "decisionConcentration": "State-directed funding and provider contracting",
    "targetTitles": [
      "Behavioral Health and Developmental Disabilities Division Administrator",
      "Medicaid Director",
      "Provider CEO"
    ],
    "researchPitch": "Frontier access, travel burden, capacity and stabilization"
  },
  {
    "stateName": "Nebraska",
    "stateCode": "NE",
    "governanceBucket": "R",
    "stateAuthority": "Division of Behavioral Health",
    "primaryTarget": "Six Regional Behavioral Health Authorities",
    "targetUniverse": "Six regions",
    "decisionConcentration": "Regional authorities plan, fund and contract portions of the community safety net",
    "targetTitles": [
      "Regional Administrator",
      "Regional Board Chair",
      "State Division Director",
      "CFO"
    ],
    "researchPitch": "Regional capacity, demand, outcomes and justice diversion"
  },
  {
    "stateName": "Nevada",
    "stateCode": "NV",
    "governanceBucket": "S/H",
    "stateAuthority": "Department of Health and Human Services, behavioral-health division",
    "primaryTarget": "State regional services, Clark and Washoe county initiatives, Medicaid plans",
    "targetUniverse": "1 main state system plus major-county and plan targets",
    "decisionConcentration": "State dominates specialty services; large counties influence crisis, homelessness and justice programs",
    "targetTitles": [
      "Division Administrator",
      "County Human Services Director",
      "Medicaid Plan VP",
      "County Manager"
    ],
    "researchPitch": "Urban-versus-rural capacity, crisis demand, homelessness and detention diversion"
  },
  {
    "stateName": "New Hampshire",
    "stateCode": "NH",
    "governanceBucket": "S/H",
    "stateAuthority": "Department of Health and Human Services",
    "primaryTarget": "Designated community mental health centers",
    "targetUniverse": "State plus approximately 10 regional CMHC catchments",
    "decisionConcentration": "State sets policy and funding; designated agencies operate regional systems",
    "targetTitles": [
      "Commissioner",
      "Bureau Chief",
      "CMHC CEO",
      "Quality Director"
    ],
    "researchPitch": "Regional demand, crisis utilization, stabilization and unmet capacity"
  },
  {
    "stateName": "New Jersey",
    "stateCode": "NJ",
    "governanceBucket": "S/H",
    "stateAuthority": "Department of Human Services, Division of Mental Health and Addiction Services",
    "primaryTarget": "County mental-health administrators and contracted providers",
    "targetUniverse": "1 state plus 21 county planning structures",
    "decisionConcentration": "State contracts many services; counties participate in local planning and needs assessment",
    "targetTitles": [
      "Division Director",
      "County Mental Health Administrator",
      "Contract Director"
    ],
    "researchPitch": "County needs, state contract performance, housing and hospital diversion"
  },
  {
    "stateName": "New Mexico",
    "stateCode": "NM",
    "governanceBucket": "S/M/H",
    "stateAuthority": "Health Care Authority, Behavioral Health Services Division",
    "primaryTarget": "Medicaid managed-care organizations and regional/provider collaboratives",
    "targetUniverse": "1 state plus MCO/provider network",
    "decisionConcentration": "State sets strategy and grants; Medicaid plans control covered network purchasing",
    "targetTitles": [
      "Behavioral Health Services Director",
      "Medicaid Director",
      "MCO VP Behavioral Health",
      "County Manager"
    ],
    "researchPitch": "Rural/tribal access, network adequacy, utilization and justice diversion"
  },
  {
    "stateName": "New York",
    "stateCode": "NY",
    "governanceBucket": "C/H",
    "stateAuthority": "Office of Mental Health; Office of Addiction Services and Supports",
    "primaryTarget": "County or city local governmental units and mental-health departments",
    "targetUniverse": "Approximately 57 county units plus New York City",
    "decisionConcentration": "Counties conduct local planning; state licenses, funds and oversees major programs",
    "targetTitles": [
      "County Mental Health Director",
      "Commissioner",
      "Deputy County Executive",
      "OMH Regional Director"
    ],
    "researchPitch": "County scorecards, out-of-county placements, capacity and outcomes"
  },
  {
    "stateName": "North Carolina",
    "stateCode": "NC",
    "governanceBucket": "M/R",
    "stateAuthority": "Department of Health and Human Services; NC Medicaid",
    "primaryTarget": "LME/MCO-operated Behavioral Health and I/DD Tailored Plans",
    "targetUniverse": "Four Tailored Plan organizations as of the current model",
    "decisionConcentration": "Tailored Plans manage specialized Medicaid and certain state-funded services; state retains oversight",
    "targetTitles": [
      "Tailored Plan CEO",
      "Chief Population Health Officer",
      "Network Director",
      "NC Medicaid Deputy Secretary"
    ],
    "researchPitch": "Network adequacy, utilization, outcomes, capacity and cost"
  },
  {
    "stateName": "North Dakota",
    "stateCode": "ND",
    "governanceBucket": "S/R",
    "stateAuthority": "Department of Health and Human Services",
    "primaryTarget": "State human-service regions and local human-service zones",
    "targetUniverse": "Eight human-service regions; zones perform broader human services",
    "decisionConcentration": "State and regional offices dominate specialty behavioral-health planning",
    "targetTitles": [
      "Regional Director",
      "Behavioral Health Division Director",
      "Medicaid Director"
    ],
    "researchPitch": "Frontier access, regional utilization, crisis travel and capacity"
  },
  {
    "stateName": "Ohio",
    "stateCode": "OH",
    "governanceBucket": "C",
    "stateAuthority": "Department of Mental Health and Addiction Services",
    "primaryTarget": "County or multi-county ADAMH boards",
    "targetUniverse": "Approximately 50 boards",
    "decisionConcentration": "ADAMH boards assess needs, levy or allocate local resources and contract with provider networks",
    "targetTitles": [
      "Executive Director",
      "Board Chair",
      "Director of Programs",
      "County Commissioner"
    ],
    "researchPitch": "Levy value, contract performance, diversion, unmet demand and outcomes"
  },
  {
    "stateName": "Oklahoma",
    "stateCode": "OK",
    "governanceBucket": "S",
    "stateAuthority": "Department of Mental Health and Substance Abuse Services",
    "primaryTarget": "State-operated and state-contracted provider system",
    "targetUniverse": "1 principal state buyer plus provider network",
    "decisionConcentration": "Strong centralized state system",
    "targetTitles": [
      "Commissioner",
      "Deputy Commissioner",
      "CFO",
      "Provider CEO"
    ],
    "researchPitch": "Statewide outcomes, crisis capacity, contract value and diversion"
  },
  {
    "stateName": "Oregon",
    "stateCode": "OR",
    "governanceBucket": "M/H",
    "stateAuthority": "Oregon Health Authority",
    "primaryTarget": "Coordinated Care Organizations, counties and community mental-health programs",
    "targetUniverse": "Approximately a dozen-plus CCOs plus 36 counties/local programs",
    "decisionConcentration": "CCOs purchase Medicaid care; counties and community programs retain safety-net, crisis and civil-commitment responsibilities",
    "targetTitles": [
      "CCO Chief Medical Officer",
      "VP Behavioral Health",
      "County Behavioral Health Director",
      "OHA Director"
    ],
    "researchPitch": "Population cost, utilization, network adequacy, capacity and crisis outcomes"
  },
  {
    "stateName": "Pennsylvania",
    "stateCode": "PA",
    "governanceBucket": "C/H",
    "stateAuthority": "Department of Human Services, Office of Mental Health and Substance Abuse Services",
    "primaryTarget": "County or multi-county MH/ID programs; behavioral-health managed-care organizations",
    "targetUniverse": "67 counties organized individually or jointly",
    "decisionConcentration": "Counties plan the public system; Medicaid behavioral-health plans manage covered services",
    "targetTitles": [
      "County Administrator",
      "MH/ID Director",
      "HealthChoices Executive",
      "Commissioner"
    ],
    "researchPitch": "County cost, Medicaid utilization, placement patterns and diversion"
  },
  {
    "stateName": "Rhode Island",
    "stateCode": "RI",
    "governanceBucket": "S",
    "stateAuthority": "Department of Behavioral Healthcare, Developmental Disabilities and Hospitals",
    "primaryTarget": "State-contracted provider network",
    "targetUniverse": "1 primary state buyer",
    "decisionConcentration": "Highly centralized state planning and contracting",
    "targetTitles": [
      "Director",
      "Medicaid Director",
      "Behavioral Healthcare Administrator",
      "CFO"
    ],
    "researchPitch": "Statewide outcomes, contract value and capacity planning"
  },
  {
    "stateName": "South Carolina",
    "stateCode": "SC",
    "governanceBucket": "S",
    "stateAuthority": "Department of Mental Health; Department of Health and Human Services",
    "primaryTarget": "State mental-health centers and contracted providers",
    "targetUniverse": "1 state system plus local centers",
    "decisionConcentration": "State department operates a statewide community mental-health structure",
    "targetTitles": [
      "State Director",
      "Center Director",
      "Medicaid Behavioral Health Director",
      "CFO"
    ],
    "researchPitch": "Center comparisons, statewide demand, hospitalization and stabilization"
  },
  {
    "stateName": "South Dakota",
    "stateCode": "SD",
    "governanceBucket": "S",
    "stateAuthority": "Department of Social Services",
    "primaryTarget": "State-contracted community mental-health and SUD providers",
    "targetUniverse": "1 state plus provider catchments",
    "decisionConcentration": "Central state funding and designation",
    "targetTitles": [
      "Division Director",
      "Provider Executive Director",
      "Medicaid Director"
    ],
    "researchPitch": "Rural access, utilization, outcomes and workforce capacity"
  },
  {
    "stateName": "Tennessee",
    "stateCode": "TN",
    "governanceBucket": "M/S",
    "stateAuthority": "Department of Mental Health and Substance Abuse Services; TennCare",
    "primaryTarget": "TennCare managed-care organizations and state-contracted providers",
    "targetUniverse": "Three major TennCare MCO service structures plus state network",
    "decisionConcentration": "MCOs purchase most Medicaid services; state department funds safety-net and grant programs",
    "targetTitles": [
      "TennCare Plan VP Behavioral Health",
      "Commissioner",
      "Network Director",
      "Quality VP"
    ],
    "researchPitch": "Medicaid utilization, network performance, outcomes and cost"
  },
  {
    "stateName": "Texas",
    "stateCode": "TX",
    "governanceBucket": "R/H",
    "stateAuthority": "Health and Human Services Commission",
    "primaryTarget": "Local Mental Health Authorities and Local Behavioral Health Authorities",
    "targetUniverse": "Approximately 39 LMHA/LBHA organizations",
    "decisionConcentration": "LMHAs/LBHAs conduct local planning, access, crisis and safety-net functions; state and Medicaid plans control broader funding",
    "targetTitles": [
      "LMHA CEO",
      "Chief Clinical Officer",
      "HHSC Associate Commissioner",
      "County Judge"
    ],
    "researchPitch": "Regional capacity, jail diversion, crisis use, demand and county value"
  },
  {
    "stateName": "Utah",
    "stateCode": "UT",
    "governanceBucket": "C/H",
    "stateAuthority": "Department of Health and Human Services",
    "primaryTarget": "County-designated Local Mental Health and Substance Abuse Authorities",
    "targetUniverse": "County or multi-county local authorities covering all 29 counties",
    "decisionConcentration": "Local authorities plan and contract the public safety net under state oversight; Medicaid plans also matter",
    "targetTitles": [
      "Local Authority Director",
      "County Commissioner",
      "State Behavioral Health Director",
      "Medicaid Plan VP"
    ],
    "researchPitch": "County cost, capacity, diversion, contract performance and regional gaps"
  },
  {
    "stateName": "Vermont",
    "stateCode": "VT",
    "governanceBucket": "S/H",
    "stateAuthority": "Department of Mental Health",
    "primaryTarget": "Designated and specialized service agencies",
    "targetUniverse": "State plus designated agencies",
    "decisionConcentration": "State allocates funding; designated agencies organize local service delivery",
    "targetTitles": [
      "Commissioner",
      "Agency Executive Director",
      "Quality Director",
      "CFO"
    ],
    "researchPitch": "Geographic access, regional demand, outcomes and cost benchmarking"
  },
  {
    "stateName": "Virginia",
    "stateCode": "VA",
    "governanceBucket": "R/H",
    "stateAuthority": "Department of Behavioral Health and Developmental Services",
    "primaryTarget": "Community Services Boards and behavioral-health authorities",
    "targetUniverse": "Approximately 40 CSBs/BHAs",
    "decisionConcentration": "CSBs are central local planners, access points and public providers; state controls appropriations and oversight",
    "targetTitles": [
      "CSB Executive Director",
      "Board Chair",
      "CFO",
      "Quality Director",
      "DBHDS Commissioner"
    ],
    "researchPitch": "Regional demand, crisis diversion, state-hospital avoidance and outcomes"
  },
  {
    "stateName": "Washington",
    "stateCode": "WA",
    "governanceBucket": "S/M/R",
    "stateAuthority": "Health Care Authority; Department of Social and Health Services",
    "primaryTarget": "Medicaid managed-care organizations and regional Behavioral Health Administrative Services Organizations",
    "targetUniverse": "Multiple MCOs and regional BH-ASOs",
    "decisionConcentration": "MCOs purchase covered care; BH-ASOs administer certain crisis and non-Medicaid services; state controls policy and contracts",
    "targetTitles": [
      "HCA Behavioral Health Director",
      "BH-ASO Executive",
      "MCO VP",
      "County Human Services Director"
    ],
    "researchPitch": "Regional crisis, non-Medicaid demand, network adequacy and outcomes"
  },
  {
    "stateName": "West Virginia",
    "stateCode": "WV",
    "governanceBucket": "S/H",
    "stateAuthority": "Department of Human Services, behavioral-health bureau",
    "primaryTarget": "Comprehensive behavioral-health centers and regional providers",
    "targetUniverse": "State plus regional provider network",
    "decisionConcentration": "State funding with geographically organized provider delivery",
    "targetTitles": [
      "Bureau Commissioner",
      "Provider CEO",
      "Medicaid Director",
      "Grants Director"
    ],
    "researchPitch": "Rural access, crisis capacity, hospital diversion and population acuity"
  },
  {
    "stateName": "Wisconsin",
    "stateCode": "WI",
    "governanceBucket": "C",
    "stateAuthority": "Department of Health Services",
    "primaryTarget": "County human-services or community-services departments",
    "targetUniverse": "72 counties, with some multi-county arrangements",
    "decisionConcentration": "Counties have major responsibility for community mental-health and crisis systems",
    "targetTitles": [
      "County Human Services Director",
      "Behavioral Health Manager",
      "County Administrator",
      "Board Committee Chair"
    ],
    "researchPitch": "County cost, crisis use, placements, capacity and outcomes"
  },
  {
    "stateName": "Wyoming",
    "stateCode": "WY",
    "governanceBucket": "S",
    "stateAuthority": "Department of Health, Behavioral Health Division",
    "primaryTarget": "State-funded community providers and state facilities",
    "targetUniverse": "1 principal state buyer",
    "decisionConcentration": "Central state grants, contracts and planning",
    "targetTitles": [
      "Division Administrator",
      "Deputy Director",
      "Medicaid Administrator",
      "Provider CEO"
    ],
    "researchPitch": "Geographic access, crisis capacity, hospital avoidance and workforce"
  }
] as const;

function opportunityPathsForState(stateName: string): OpportunityPathCode[] {
  return (Object.entries(OPPORTUNITY_STATES) as [OpportunityPathCode, readonly string[]][])
    .filter(([, stateNames]) => stateNames.includes(stateName))
    .map(([code]) => code);
}

function relevanceTagsForState(record: {
  primaryTarget: string;
  decisionConcentration: string;
  researchPitch: string;
}): string[] {
  const source = [
    record.primaryTarget,
    record.decisionConcentration,
    record.researchPitch
  ].join(" ").toLowerCase();

  const tags = [
    ["Residential placement", /residential|placement|bed capacity|out-of-area/],
    ["Crisis systems", /crisis|stabilization|hospital diversion|hospitalization/],
    ["Justice diversion", /justice|jail|detention|diversion/],
    ["Managed care", /managed care|medicaid|mco|cco|health plan/],
    ["Rural access", /rural|frontier|remote|travel burden|geographic access/],
    ["Contract performance", /contract|procurement|grant/]
  ] as const;

  return tags.filter(([, pattern]) => pattern.test(source)).map(([label]) => label);
}

function normalizeGovernanceCodes(value: string): GovernanceCode[] {
  return value.split("/").filter((code): code is GovernanceCode => code in GOVERNANCE_OPTIONS);
}

const AUDIENCE_ORDER: EffectivenessAudienceId[] = [
  "county",
  "state",
  "managed-care",
  "provider",
  "executive"
];

function audienceScoresForState(record: {
  governanceCodes: GovernanceCode[];
  opportunityPaths: OpportunityPathCode[];
  primaryTarget: string;
  decisionConcentration: string;
  targetTitles: readonly string[];
}): Record<EffectivenessAudienceId, number> {
  const scores: Record<EffectivenessAudienceId, number> = {
    county: 0,
    state: 0,
    "managed-care": 0,
    provider: 0,
    executive: 2
  };
  const governanceWeights: Record<GovernanceCode, Partial<Record<EffectivenessAudienceId, number>>> = {
    C: { county: 6, state: 1 },
    R: { state: 2, provider: 3 },
    S: { state: 6 },
    M: { "managed-care": 6, state: 2 },
    H: { county: 1, state: 1, "managed-care": 1, provider: 2, executive: 1 }
  };
  const pathWeights: Record<OpportunityPathCode, Partial<Record<EffectivenessAudienceId, number>>> = {
    A: { county: 6 },
    B: { state: 3, provider: 3 },
    C: { state: 6 },
    D: { "managed-care": 6, state: 2 },
    E: { provider: 6 }
  };

  record.governanceCodes.forEach((code) => {
    Object.entries(governanceWeights[code]).forEach(([audience, weight]) => {
      scores[audience as EffectivenessAudienceId] += weight ?? 0;
    });
  });
  record.opportunityPaths.forEach((code) => {
    Object.entries(pathWeights[code]).forEach(([audience, weight]) => {
      scores[audience as EffectivenessAudienceId] += weight ?? 0;
    });
  });

  const source = [
    record.primaryTarget,
    record.decisionConcentration,
    ...record.targetTitles
  ].join(" ").toLowerCase();
  if (/county|counties|local authority|local board/.test(source)) scores.county += 3;
  if (/state|commissioner|department/.test(source)) scores.state += 2;
  if (/managed care|medicaid|mco|health plan|cco/.test(source)) scores["managed-care"] += 3;
  if (/provider|hospital|cmhc|community mental-health center|network/.test(source)) scores.provider += 3;

  return scores;
}

export function getStateAudienceScore(
  record: StateTargetingRecord,
  audience: EffectivenessAudienceId
) {
  return record.audienceScores[audience] ?? 0;
}

export const STATE_TARGETING_RECORDS: StateTargetingRecord[] = RAW_STATE_TARGETING_ROWS.map((record) => {
  const governanceCodes = normalizeGovernanceCodes(record.governanceBucket);
  const primaryGovernanceCode = governanceCodes[0] ?? "H";
  const opportunityPaths = opportunityPathsForState(record.stateName);
  const audienceScores = audienceScoresForState({
    governanceCodes,
    opportunityPaths,
    primaryTarget: record.primaryTarget,
    decisionConcentration: record.decisionConcentration,
    targetTitles: record.targetTitles
  });
  const recommendedAudience = [...AUDIENCE_ORDER]
    .sort((left, right) => audienceScores[right] - audienceScores[left])[0] ?? "executive";

  return {
    ...record,
    targetTitles: [...record.targetTitles],
    governanceCodes,
    primaryGovernanceCode,
    governanceLabel: governanceCodes.map((code) => GOVERNANCE_OPTIONS[code].shortLabel).join(" / "),
    opportunityPaths,
    relevanceTags: relevanceTagsForState(record),
    audienceScores,
    recommendedAudience
  };
});

export const STATE_TARGETING_BY_NAME = new Map(
  STATE_TARGETING_RECORDS.map((record) => [record.stateName, record])
);

if (STATE_TARGETING_RECORDS.length !== 50 || STATE_TARGETING_BY_NAME.size !== 50) {
  throw new Error("The targeting atlas must contain exactly 50 unique states.");
}
