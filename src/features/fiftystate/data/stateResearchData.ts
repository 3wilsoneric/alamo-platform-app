import nationalBedSupplyJson from "./research/stateBedSupply.json";
import verifiedDemandStatesJson from "./research/verifiedDemandStates.json";
import type { StateTargetingRecord } from "./stateTargetingData";

export type ResearchConfidence = "confirmed" | "qualitative" | "not_published";

interface ResearchSource {
  id: string;
  url: string;
}

interface ResearchFact {
  confidence: ResearchConfidence;
  source?: string;
  fact?: string | null;
  exists?: string | null;
  reason?: string;
}

interface InvoluntaryTreatmentFact extends ResearchFact {
  mechanism: string;
  volume: string | number | null;
  volume_reason?: string;
  volume_scope?: string;
  volume_year?: number;
  note?: string;
}

interface VerifiedDemandState {
  rank: number;
  state: string;
  abbr: string;
  involuntary_or_conservatorship: InvoluntaryTreatmentFact;
  state_psych_beds_per_100k: {
    value: number;
    year: number;
    confidence: ResearchConfidence;
    source: string;
    fill_note?: string;
  };
  state_hospital_pressure: ResearchFact;
  placement_bottleneck: ResearchFact;
  step_down_registry: ResearchFact;
  why_ranked_here: string;
}

interface VerifiedDemandDataset {
  as_of: string;
  national_context: {
    bed_shortage_prevalence: {
      value: string;
      year: number;
      source: string;
      confidence: ResearchConfidence;
    };
    minimally_adequate_benchmark: {
      value: string;
      source: string;
      confidence: ResearchConfidence;
    };
    note: string;
  };
  confidence_legend: Record<ResearchConfidence, string>;
  sources: ResearchSource[];
  states: VerifiedDemandState[];
}

interface NationalBedState {
  state: string;
  abbr: string;
  rank: number;
  state_psych_beds_per_100k: number;
  gap_vs_50_benchmark: number;
  confidence: ResearchConfidence;
}

interface NationalBedDataset {
  as_of: string;
  metric_definition: string;
  benchmark: {
    value: number;
    label: string;
    note: string;
  };
  source: {
    name: string;
    accessed_via: string;
    url: string;
  };
  states: NationalBedState[];
}

export interface StateResearchEvidence {
  id: "legal" | "hospital-pressure" | "placement" | "registry";
  label: string;
  text: string;
  confidence: ResearchConfidence;
  source?: ResearchSource;
}

export interface StateResearchDossier {
  coverage: "verified-demand" | "national-baseline";
  asOf: string;
  stateCode: string;
  bedSupply: {
    rate: number;
    supplyRank: number;
    comparisonUniverse: number;
    gapToBenchmark: number;
    benchmark: number;
    definition: string;
    source: ResearchSource & { name: string };
  };
  demandRank?: number;
  demandRationale?: string;
  evidence: StateResearchEvidence[];
  sources: ResearchSource[];
  researchBoundary: string;
}

const verifiedDemandDataset =
  verifiedDemandStatesJson as unknown as VerifiedDemandDataset;
const nationalBedDataset = nationalBedSupplyJson as unknown as NationalBedDataset;

const sourceAlias: Record<string, string> = {
  "Beckers-beds (full TAC 2023 table)": "Beckers-beds"
};

const verifiedSources = new Map(
  verifiedDemandDataset.sources.map((source) => [source.id, source])
);
const demandByCode = new Map(
  verifiedDemandDataset.states.map((state) => [state.abbr, state])
);
const bedsByCode = new Map(
  nationalBedDataset.states
    .filter((state) => state.abbr !== "DC")
    .map((state) => [state.abbr, state])
);
const stateSupplyRankByCode = new Map(
  [...bedsByCode.values()].map((state) => [
    state.abbr,
    1 + [...bedsByCode.values()].filter(
      (candidate) =>
        candidate.state_psych_beds_per_100k > state.state_psych_beds_per_100k
    ).length
  ])
);

export function formatStateResearchDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function sourceFor(sourceId: string | undefined) {
  if (!sourceId) return undefined;
  return verifiedSources.get(sourceAlias[sourceId] ?? sourceId);
}

function researchFact(
  id: StateResearchEvidence["id"],
  label: string,
  fact: ResearchFact | undefined
): StateResearchEvidence | null {
  if (!fact) return null;
  const text = fact.fact ?? fact.exists ?? fact.reason;
  if (!text) return null;
  const source = sourceFor(fact.source);
  return {
    id,
    label,
    text,
    confidence: fact.confidence,
    ...(source ? { source } : {})
  };
}

function legalEvidence(state: VerifiedDemandState): StateResearchEvidence {
  const detail = state.involuntary_or_conservatorship;
  const volume = detail.volume == null
    ? ""
    : ` Reported volume: ${detail.volume}${detail.volume_scope ? ` (${detail.volume_scope})` : ""}${detail.volume_year ? `, ${detail.volume_year}` : ""}.`;
  const note = detail.note ? ` ${detail.note}` : "";
  const source = sourceFor(detail.source);
  return {
    id: "legal",
    label: "Legal and involuntary-care pathway",
    text: `${detail.mechanism}.${volume}${note}`.replace(/\.\./g, "."),
    confidence: detail.confidence,
    ...(source ? { source } : {})
  };
}

export function getStateResearchDossier(
  record: StateTargetingRecord
): StateResearchDossier {
  const bedSupply = bedsByCode.get(record.stateCode);
  if (!bedSupply) {
    throw new Error(`Missing national bed-supply record for ${record.stateCode}.`);
  }

  const demand = demandByCode.get(record.stateCode);
  const evidence = demand
    ? [
        legalEvidence(demand),
        researchFact(
          "hospital-pressure",
          "State-hospital pressure",
          demand.state_hospital_pressure
        ),
        researchFact("placement", "Placement bottleneck", demand.placement_bottleneck),
        researchFact("registry", "Step-down visibility", demand.step_down_registry)
      ].filter((item): item is StateResearchEvidence => item !== null)
    : [];
  const sources = new Map<string, ResearchSource>();
  evidence.forEach((item) => {
    if (item.source) sources.set(item.source.id, item.source);
  });

  return {
    coverage: demand ? "verified-demand" : "national-baseline",
    asOf: demand ? verifiedDemandDataset.as_of : nationalBedDataset.as_of,
    stateCode: record.stateCode,
    bedSupply: {
      rate: bedSupply.state_psych_beds_per_100k,
      supplyRank: stateSupplyRankByCode.get(record.stateCode) ?? bedSupply.rank,
      comparisonUniverse: bedsByCode.size,
      gapToBenchmark: bedSupply.gap_vs_50_benchmark,
      benchmark: nationalBedDataset.benchmark.value,
      definition: nationalBedDataset.metric_definition,
      source: {
        id: "national-state-bed-supply",
        name: nationalBedDataset.source.name,
        url: nationalBedDataset.source.url
      }
    },
    ...(demand ? { demandRank: demand.rank, demandRationale: demand.why_ranked_here } : {}),
    evidence,
    sources: [...sources.values()],
    researchBoundary: demand
      ? "Source-linked demand research is available for this state. The priority order combines legal inflow, placement pressure, bed scarcity, step-down activity, and the availability of defensible public evidence; it is not a revenue forecast."
      : "This state currently has a nationally comparable bed-supply baseline and a mapped buyer route. A source-by-source legal, hospital-pressure, placement, and step-down research pass has not yet been completed, so no composite demand rank is shown."
  };
}

export function hasVerifiedDemandResearch(stateCode: string) {
  return demandByCode.has(stateCode);
}

export const VERIFIED_DEMAND_STATE_COUNT = demandByCode.size;
export const NATIONAL_BED_STATE_COUNT = bedsByCode.size;
export const STATE_RESEARCH_AS_OF = nationalBedDataset.as_of;

if (NATIONAL_BED_STATE_COUNT !== 50) {
  throw new Error(`Expected 50 state bed-supply records, found ${NATIONAL_BED_STATE_COUNT}.`);
}

if (VERIFIED_DEMAND_STATE_COUNT !== 15) {
  throw new Error(
    `Expected 15 verified demand dossiers, found ${VERIFIED_DEMAND_STATE_COUNT}.`
  );
}

verifiedDemandDataset.states.forEach((state) => {
  const baseline = bedsByCode.get(state.abbr);
  if (!baseline) throw new Error(`Missing national baseline for ${state.abbr}.`);
  if (Math.abs(baseline.state_psych_beds_per_100k - state.state_psych_beds_per_100k.value) > 0.01) {
    throw new Error(`Bed-supply research mismatch for ${state.abbr}.`);
  }
});
