import { createHttpError } from "./http-errors.mjs";
import { getNationalDiscoverySummary } from "./acquisition-intelligence-store.mjs";
import {
  ACQUISITION_VALUATION_FORMULAS,
  ACQUISITION_VALUATION_MODEL_VERSION,
  ACQUISITION_VALUATION_SEGMENTS,
  AcquisitionValuationValidationError,
  calculateAcquisitionValuationModel,
  findAcquisitionValuationSegment,
  validateAcquisitionValuationInput
} from "../shared/acquisition-valuation.mjs";

export const ACQUISITION_INTELLIGENCE_VERSION = "1.0";
export { ACQUISITION_VALUATION_MODEL_VERSION };

const SEGMENTS = ACQUISITION_VALUATION_SEGMENTS;

const LEADS = Object.freeze([
  {
    id: "PV001",
    name: "Telecare Corporation",
    stateCodes: ["CA", "OR", "WA", "AZ", "NE"],
    stateFootprintConfidence: "medium",
    relevance: "Complex-needs, crisis, residential, and longer-term recovery programs",
    researchPriority: "very_high",
    nextEvidenceTask: "Enumerate programs by state, identify each facility and campus, match state licenses, and capture licensed beds."
  },
  {
    id: "PV002",
    name: "Crestwood Behavioral Health",
    stateCodes: ["CA"],
    stateFootprintConfidence: "high",
    relevance: "MHRC, PHF, adult recovery, and crisis residential programs",
    researchPriority: "very_high",
    nextEvidenceTask: "Enumerate programs and campuses, match DHCS and CDSS license records, and capture licensed beds."
  },
  {
    id: "PV003",
    name: "Pyramid Healthcare",
    stateCodes: ["PA", "NJ", "NC", "MD", "GA", "CT", "VA", "WV"],
    stateFootprintConfidence: "high",
    relevance: "Adult residential and SUD programs with selected dual-diagnosis signals",
    researchPriority: "high",
    nextEvidenceTask: "Enumerate facilities, tag adult residential programs, and obtain state licenses and bed counts."
  },
  {
    id: "PV004",
    name: "RHA Health Services",
    stateCodes: ["NC", "GA", "NJ", "PA", "TN"],
    stateFootprintConfidence: "high",
    relevance: "Mixed behavioral-health, disability, crisis, and residential services",
    researchPriority: "high",
    nextEvidenceTask: "Separate adult behavioral-health residential programs from I/DD and match state facilities and licenses."
  },
  {
    id: "PV005",
    name: "SUN Behavioral Health",
    stateCodes: ["DE", "KY", "OH", "TX"],
    stateFootprintConfidence: "low",
    relevance: "Hospital-heavy platform; only discrete adult residential or subacute assets are in scope",
    researchPriority: "medium",
    nextEvidenceTask: "Confirm ownership, current states, facility types, licensed beds, and separable residential service lines."
  },
  {
    id: "PV006",
    name: "Discovery Behavioral Health",
    stateCodes: ["CA", "CT", "FL", "IL", "KS", "MD", "OR", "TX", "VA", "WA"],
    stateFootprintConfidence: "medium",
    relevance: "Mixed mental-health, SUD, eating-disorder, and youth and adult service lines",
    researchPriority: "high",
    nextEvidenceTask: "Extract the brand and facility list, remove youth-only and eating-disorder-only sites, and match state licenses."
  },
  {
    id: "PV007",
    name: "All Points North",
    stateCodes: ["CO", "TX", "CA"],
    stateFootprintConfidence: "low",
    relevance: "Mental-health and SUD residential programs",
    researchPriority: "medium",
    nextEvidenceTask: "Confirm the current facility list, adult-only status, ownership, licenses, and beds."
  },
  {
    id: "PV008",
    name: "Recovery Centers of America",
    stateCodes: ["DE", "FL", "IL", "IN", "MD", "MA", "NJ", "PA", "SC", "VA"],
    stateFootprintConfidence: "low",
    relevance: "SUD-primary; retain only assets with verified adult psychiatric capability",
    researchPriority: "medium",
    nextEvidenceTask: "Confirm ownership, facility list, states, licensed beds, and psychiatric capability."
  },
  {
    id: "PV009",
    name: "Banyan Treatment Centers",
    stateCodes: ["AK", "CA", "CO", "DE", "FL", "IL", "MA", "PA", "TX"],
    stateFootprintConfidence: "low",
    relevance: "SUD and mental-health residential programs",
    researchPriority: "medium",
    nextEvidenceTask: "Confirm state footprint, facility types, ownership, licenses, and beds."
  },
  {
    id: "PV010",
    name: "Advanced Recovery Systems and The Recovery Village",
    stateCodes: ["CO", "FL", "GA", "IN", "MD", "MA", "MO", "NJ", "OH", "OR", "PA", "WA"],
    stateFootprintConfidence: "high",
    relevance: "SUD and mental-health residential programs",
    researchPriority: "high",
    nextEvidenceTask: "Enumerate facilities and legal entities, match licenses, distinguish adult from youth programs, and capture beds."
  },
  {
    id: "PV011",
    name: "Promises Behavioral Health",
    stateCodes: ["TN", "PA", "TX", "MA", "GA"],
    stateFootprintConfidence: "low",
    relevance: "Mental-health and SUD residential programs",
    researchPriority: "high",
    nextEvidenceTask: "Confirm current ownership, locations, operations, licenses, and beds."
  },
  {
    id: "PV012",
    name: "Odyssey Behavioral Healthcare",
    stateCodes: ["AZ", "CA", "CO", "FL", "NC", "TN", "VA"],
    stateFootprintConfidence: "low",
    relevance: "Specialty mental-health, SUD, and eating-disorder residential programs",
    researchPriority: "high",
    nextEvidenceTask: "Map brands to facilities, exclude out-of-scope sites, and validate licenses and beds."
  },
  {
    id: "PV013",
    name: "Meadows Behavioral Healthcare",
    stateCodes: ["AZ", "CA", "TX"],
    stateFootprintConfidence: "low",
    relevance: "Trauma, mental-health, and SUD residential programs",
    researchPriority: "medium",
    nextEvidenceTask: "Confirm current locations, ownership, licensing, capacity, and adult SMI and public-payer fit."
  },
  {
    id: "PV014",
    name: "Newport Healthcare",
    stateCodes: ["CA", "CT", "GA", "MD", "MN", "UT", "VA", "WA", "WI"],
    stateFootprintConfidence: "low",
    relevance: "Youth and young-adult weighted; not in scope until adult facilities are verified",
    researchPriority: "low",
    candidateDisposition: "hold",
    nextEvidenceTask: "Identify adult programs and exclude every youth-only facility."
  },
  {
    id: "PV015",
    name: "Sandstone Care",
    stateCodes: ["CO", "MD", "VA"],
    stateFootprintConfidence: "low",
    relevance: "Youth and young-adult weighted; not in scope until adult facilities are verified",
    researchPriority: "low",
    candidateDisposition: "hold",
    nextEvidenceTask: "Identify adult-only residential programs and verify licenses and beds."
  }
].map((lead) => Object.freeze({
  ...lead,
  stateCodes: Object.freeze([...lead.stateCodes]),
  candidateDisposition: lead.candidateDisposition ?? "review",
  verificationStatus: "discovery_only"
})));

const OPERATOR_SCREENING_PROFILES = Object.freeze({
  PV001: {
    segmentId: "crisis_subacute_step_down",
    reportedScale: "100+ programs · 5 current states",
    reportedSiteCount: 100,
    estimatedBeds: { low: 1500, high: 3000, confidence: "medium", sourceType: "estimated", basis: "Workbook screening range checked against the current company program footprint; a licensed-bed rollup is still pending." },
    workbookIndicativeValue: { low: 150, high: 450 },
    sources: [{ label: "Telecare annual reports and current footprint", url: "https://www.telecarecorp.com/annual-reports/", asOf: "2026-09-08" }]
  },
  PV002: {
    segmentId: "long_term_psychiatric_rehabilitation",
    reportedScale: "31 California campuses",
    reportedSiteCount: 31,
    estimatedBeds: { low: 1200, high: 2500, confidence: "medium", sourceType: "estimated", basis: "Workbook screening range checked against Crestwood's current campus count; state-by-state licensed-bed aggregation remains pending." },
    workbookIndicativeValue: { low: 150, high: 400 },
    sources: [{ label: "Crestwood locations", url: "https://www.crestwoodbehavioralhealth.com/locations", asOf: "2026-09-08" }]
  },
  PV003: {
    segmentId: "selected_sud_residential",
    reportedScale: "80+ facilities · 7 schools · 8 states",
    reportedSiteCount: 80,
    estimatedBeds: { low: 1500, high: 3500, confidence: "medium", sourceType: "estimated", basis: "Workbook screening range checked against the company-reported family footprint; not every facility is residential." },
    workbookIndicativeValue: { low: 250, high: 600 },
    sources: [{ label: "Pyramid Healthcare company overview", url: "https://www.pyramidhc.com/about/", asOf: "2026-09-08" }]
  },
  PV004: {
    segmentId: "crisis_subacute_step_down",
    reportedScale: "5-state mixed-services network",
    reportedSiteCount: null,
    estimatedBeds: { low: 2000, high: 5000, confidence: "low", sourceType: "estimated", basis: "Workbook screening range; the public footprint mixes behavioral health, I/DD, crisis, residential, and administrative locations." },
    workbookIndicativeValue: { low: 350, high: 800 },
    sources: [{ label: "RHA service locations", url: "https://rhahealthservices.org/rha-locations/", asOf: "2026-09-08" }]
  },
  PV005: {
    segmentId: "psychiatric_hospital_platform",
    reportedScale: "4 psychiatric hospitals",
    reportedSiteCount: 4,
    estimatedBeds: { low: 579, high: 579, confidence: "high", sourceType: "reported", basis: "Company-reported hospital capacity: 144 + 90 + 148 + 197 beds. These are hospital beds, not community-residential beds." },
    workbookIndicativeValue: { low: 200, high: 600 },
    sources: [{ label: "SUN Behavioral facilities", url: "https://sunbehavioral.com/facilities/", asOf: "2026-09-08" }]
  },
  PV006: {
    segmentId: "specialty_commercial_residential",
    reportedScale: "160+ locations · 10+ brands",
    reportedSiteCount: 160,
    estimatedBeds: { low: 1500, high: 3500, confidence: "low", sourceType: "estimated", basis: "Workbook screening range checked against the company-reported national location count; the footprint includes eating-disorder and outpatient programs." },
    workbookIndicativeValue: { low: 500, high: 1200 },
    sources: [{ label: "Discovery Behavioral Health program overview", url: "https://discoverybehavioralhealth.com/wp-content/uploads/2025/01/DBH-All-Programs-ED-MH-and-Substance-Use.pdf", asOf: "2026-09-08" }]
  },
  PV007: {
    segmentId: "specialty_commercial_residential",
    reportedScale: "5 locations · 2 residential campuses",
    reportedSiteCount: 5,
    estimatedBeds: { low: 100, high: 200, confidence: "low", sourceType: "estimated", basis: "Current-site estimate based on two identified residential campuses; exact licensed capacity is not published in the company overview." },
    workbookIndicativeValue: { low: 100, high: 300 },
    sources: [{ label: "All Points North company overview", url: "https://apn.com/about/", asOf: "2026-09-08" }]
  },
  PV008: {
    segmentId: "selected_sud_residential",
    reportedScale: "15 inpatient and outpatient locations",
    reportedSiteCount: 15,
    estimatedBeds: { low: 900, high: 1600, confidence: "low", sourceType: "estimated", basis: "Current screening estimate informed by the reported 15-location continuum and the supplied operator workbook; licensed-bed totals remain pending." },
    workbookIndicativeValue: { low: 400, high: 900 },
    sources: [{ label: "Recovery Centers of America overview", url: "https://recoverycentersofamerica.com/about-us/", asOf: "2026-09-08" }]
  },
  PV009: {
    segmentId: "selected_sud_residential",
    reportedScale: "17 treatment centers",
    reportedSiteCount: 17,
    estimatedBeds: { low: 500, high: 1000, confidence: "low", sourceType: "estimated", basis: "Current screening estimate checked against the 17-center company footprint; inpatient and outpatient capacity are not equivalent." },
    workbookIndicativeValue: { low: 150, high: 400 },
    sources: [{ label: "Banyan treatment-center directory", url: "https://www.banyantreatmentcenter.com/facilities/", asOf: "2026-09-08" }]
  },
  PV010: {
    segmentId: "selected_sud_residential",
    reportedScale: "20+ listed treatment centers",
    reportedSiteCount: 20,
    estimatedBeds: { low: 1000, high: 2500, confidence: "medium", sourceType: "estimated", basis: "Workbook screening range checked against the current company center directory; outpatient-only centers remain in the public footprint." },
    workbookIndicativeValue: { low: 300, high: 800 },
    sources: [{ label: "Advanced Recovery Systems locations", url: "https://www.advancedrecoverysystems.com/", asOf: "2026-09-08" }]
  },
  PV011: {
    segmentId: "selected_sud_residential",
    reportedScale: "7 prominently listed treatment centers",
    reportedSiteCount: 7,
    estimatedBeds: { low: 300, high: 700, confidence: "low", sourceType: "estimated", basis: "Updated screening estimate based on the current public center list; ownership overlap and exact licensed capacity require validation." },
    workbookIndicativeValue: { low: 100, high: 300 },
    sources: [{ label: "Promises Behavioral Health centers", url: "https://www.promises.com/", asOf: "2026-09-08" }]
  },
  PV012: {
    segmentId: "specialty_commercial_residential",
    reportedScale: "20+ listed network programs",
    reportedSiteCount: 20,
    estimatedBeds: { low: 500, high: 1500, confidence: "low", sourceType: "estimated", basis: "Workbook screening range checked against the current psychiatric, eating-disorder, and outpatient network list." },
    workbookIndicativeValue: { low: 150, high: 450 },
    sources: [{ label: "Odyssey treatment networks", url: "https://odysseybehavioralhealth.com/", asOf: "2026-09-08" }]
  },
  PV013: {
    segmentId: "specialty_commercial_residential",
    reportedScale: "7 prominently listed network programs",
    reportedSiteCount: 7,
    estimatedBeds: { low: 300, high: 1000, confidence: "low", sourceType: "estimated", basis: "Workbook screening range checked against the current program-family list; outpatient capacity is excluded from the bed interpretation." },
    workbookIndicativeValue: { low: 150, high: 450 },
    sources: [{ label: "Meadows Behavioral Healthcare locations", url: "https://www.themeadows.com/locations/", asOf: "2026-09-08" }]
  },
  PV014: {
    segmentId: "youth_specialty_residential",
    reportedScale: "9-state residential and outpatient network",
    reportedSiteCount: null,
    estimatedBeds: { low: 1000, high: 3000, confidence: "low", sourceType: "estimated", basis: "Workbook screening range; the current company footprint is youth and young-adult weighted and remains outside the core adult target screen." },
    workbookIndicativeValue: { low: 800, high: 1800 },
    sources: [{ label: "Newport Healthcare location FAQ", url: "https://www.newporthealthcare.com/about-us/faq/", asOf: "2026-09-08" }]
  },
  PV015: {
    segmentId: "youth_specialty_residential",
    reportedScale: "15+ listed service locations · limited residential",
    reportedSiteCount: 15,
    estimatedBeds: { low: 100, high: 250, confidence: "low", sourceType: "estimated", basis: "Updated current-footprint estimate; most listed services are outpatient and the platform remains youth and young-adult weighted." },
    workbookIndicativeValue: { low: 75, high: 250 },
    sources: [{ label: "Sandstone Care locations", url: "https://www.sandstonecare.com/locations/", asOf: "2026-09-08" }]
  }
});

const WORKFLOW = Object.freeze([
  {
    id: "national_discovery",
    label: "National facility discovery",
    status: "waiting_for_source",
    description: "Import the current N-SUMHSS public-use facility file and preserve raw field lineage."
  },
  {
    id: "private_residential_screen",
    label: "Private adult residential screen",
    status: "not_started",
    description: "Separate include, review, and exclude cohorts without treating discovery fields as license proof."
  },
  {
    id: "ownership_resolution",
    label: "Ownership resolution",
    status: "seeded",
    description: "Resolve facilities to legal operators and parents; the current operator list is a discovery queue only."
  },
  {
    id: "license_capacity_validation",
    label: "License and capacity validation",
    status: "not_started",
    description: "Match state licenses and capture licensed capacity with source identity and verification dates."
  },
  {
    id: "top_100_discovery",
    label: "Top 100 discovery universe",
    status: "blocked_by_evidence",
    description: "Rank only after private ownership and facility-level evidence meet the inclusion threshold."
  },
  {
    id: "valuation_enrichment",
    label: "Valuation enrichment",
    status: "model_ready",
    description: "Use verified beds and editable operating assumptions for a transparent screening range."
  }
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function invalid(message, details = null) {
  return createHttpError(400, "acquisition_valuation_invalid", message, details);
}

function findSegment(segmentId) {
  return findAcquisitionValuationSegment(segmentId);
}

export function validateAcquisitionValuationRequest(value) {
  try {
    return validateAcquisitionValuationInput(value);
  } catch (error) {
    if (error instanceof AcquisitionValuationValidationError) throw invalid(error.message);
    throw error;
  }
}

export function calculateAcquisitionValuation(input) {
  const normalized = validateAcquisitionValuationRequest(input);
  return calculateAcquisitionValuationModel(normalized);
}

function operatorScreeningLead(lead) {
  const profile = OPERATOR_SCREENING_PROFILES[lead.id];
  if (!profile) throw new Error(`Acquisition screening profile is missing for ${lead.id}.`);
  const segment = findSegment(profile.segmentId);
  if (!segment) throw new Error(`Acquisition segment is missing for ${lead.id}.`);
  const valuation = calculateAcquisitionValuation({
    operatorId: lead.id,
    segmentId: segment.id,
    bedsLow: profile.estimatedBeds.low,
    bedsHigh: profile.estimatedBeds.high,
    assumptions: segment.assumptions
  });
  const lowOutput = valuation.outputs.low;
  const baseOutput = valuation.outputs.base;
  const highOutput = valuation.outputs.high;
  if (!lowOutput || !baseOutput || !highOutput) {
    throw new Error(`Acquisition valuation scenarios are incomplete for ${lead.id}.`);
  }
  return {
    ...lead,
    ...profile,
    segmentLabel: segment.label,
    estimatedEnterpriseValue: {
      low: lowOutput.enterpriseValueMillions,
      base: baseOutput.enterpriseValueMillions,
      high: highOutput.enterpriseValueMillions,
      confidence: profile.estimatedBeds.confidence,
      modelVersion: ACQUISITION_VALUATION_MODEL_VERSION
    }
  };
}

export function getAcquisitionIntelligenceOverview() {
  const leads = LEADS.map(operatorScreeningLead);
  return {
    version: ACQUISITION_INTELLIGENCE_VERSION,
    source: "alamo-private-acquisition-intelligence",
    visibility: "owner_only",
    datasetStatus: "discovery_seed_only",
    scope: {
      ownership: "Private operating companies only",
      population: "Adult residential behavioral health",
      geography: "United States excluding California",
      excluded: ["public companies", "nonprofits", "government providers", "federated networks", "youth-only operators"]
    },
    counts: {
      discoveryLeads: leads.length,
      verifiedFacilities: 0,
      verifiedPrivateOperators: 0,
      rankedOperators: 0
    },
    formulas: clone(ACQUISITION_VALUATION_FORMULAS),
    segments: clone(SEGMENTS),
    workflow: clone(WORKFLOW),
    leads: clone(leads),
    sourceNotes: [
      "Current company websites supply reported footprint figures; the attached workbook supplies the bed-range starting points and valuation formula pattern.",
      "A reported bed count is shown only when the company publishes a directly reconcilable total; every other bed figure is a bounded screening estimate.",
      "Estimated enterprise value is formula-derived from the displayed bed range and segment assumptions, not a purchase-price recommendation."
    ]
  };
}

export async function getAcquisitionIntelligenceOverviewResponse() {
  const overview = getAcquisitionIntelligenceOverview();
  const nationalDiscovery = await getNationalDiscoverySummary();
  if (!nationalDiscovery.available || !nationalDiscovery.publicUse || !nationalDiscovery.directory) {
    return { ...overview, nationalDiscovery };
  }
  const { publicUse, directory } = nationalDiscovery;
  const workflow = overview.workflow.map((stage) => {
    if (stage.id === "national_discovery") {
      return {
        ...stage,
        status: "refreshed",
        description: `${publicUse.rawRecords.toLocaleString()} coded PUF rows and ${directory.counts.total.toLocaleString()} named directory facilities are preserved in separate discovery layers.`
      };
    }
    if (stage.id === "private_residential_screen") {
      return {
        ...stage,
        status: "queue_ready",
        description: `${directory.counts.include.toLocaleString()} include and ${directory.counts.review.toLocaleString()} review records await identity, ownership, and license evidence.`
      };
    }
    if (stage.id === "ownership_resolution") {
      return {
        ...stage,
        status: "queue_ready",
        description: "Persistent facility cases and proposed operator clusters are ready for analyst resolution; proposals remain unverified."
      };
    }
    if (stage.id === "license_capacity_validation") {
      return {
        ...stage,
        status: "manual_workflow_ready",
        description: "Case records can capture license matches, legal entities, licensed beds, source URLs, and cited evidence."
      };
    }
    return stage;
  });
  return { ...overview, workflow, nationalDiscovery };
}
