import fiveStateBuyerSprintJson from "./research/fiveStateBuyerSprint.json";

export type BuyerOpportunityStatus =
  | "active"
  | "scheduled_status_to_verify"
  | "closed_or_pending"
  | "closed"
  | "recent_precedent"
  | "not_publicly_located";

interface RawLeader {
  name: string;
  title: string;
}

type RawPopulation = number | Record<string, number>;

interface RawProcurement {
  name?: string;
  identifier?: string;
  status?: BuyerOpportunityStatus;
  open_date?: string;
  close_date?: string;
  released?: string;
  issued?: string;
  questions_due?: string;
  proposal_due?: string;
  due?: string;
  closed?: string;
  window?: string;
  planned_release?: string;
  planned_award?: string;
  anticipated_contract_start?: string;
  service_period?: string;
  contract_term?: string;
  portal?: string;
  proposal_model?: string;
  annual_allocation?: number;
  estimated_incremental_cost?: number;
  estimated_capital_and_equipment?: number;
  new_funding?: number;
  minimum_volume_guaranteed?: boolean;
  capacity?: number;
  award_count?: number;
  planned_new_homes?: string;
  eligibility_note?: string;
  plan_statement?: string;
}

interface RawFundingProcurement {
  recent_rfp_status: BuyerOpportunityStatus;
  recent_rfp_deadline?: string;
  capital_available_2025?: number;
  preservation_awards?: number;
  desired_programs?: string[];
  note?: string;
}

interface RawPrecedent {
  provider: string;
  service: string;
  contract_end?: string;
  contract_total_after_amendment?: number;
  added_amount?: number;
  active_clients?: number;
  typical_placement?: string;
  referral_examples?: string[];
}

interface RawRate {
  level: string;
  monthly_per_client: number;
}

interface RawEconomicsBenchmark {
  start_up?: number;
  ramp_up?: number;
  annual_gross?: number;
  assumed_medicaid?: number;
  net_deficit?: number;
  services?: number;
  note?: string;
}

interface RawPriorityTarget {
  rank: number;
  county_or_region: string;
  population_2025: RawPopulation;
  buyer?: string;
  buyers?: string[];
  buyer_role?: string;
  buyer_logic?: string;
  leadership?: RawLeader[];
  demand?: string | string[];
  procurement?: RawProcurement | RawProcurement[];
  procurement_and_funding?: RawFundingProcurement;
  recent_precedent?: RawPrecedent;
  published_monthly_rates?: RawRate[];
  fact_economics_benchmark?: RawEconomicsBenchmark;
  alamo_pitch: string;
  barriers: string[];
}

interface RawBuyer {
  organization: string;
  leader?: RawLeader;
  leadership?: RawLeader[];
  role?: string;
}

interface RawFirstOutreach {
  organization: string;
  entry_point: string;
  lead_problem: string;
  offer: string;
}

interface RawStateBuyerResearch {
  state_demand?: string[] | { fact: string; confidence: string };
  state_buyer?: RawBuyer;
  state_buyers?: RawBuyer[];
  priority_targets: RawPriorityTarget[];
  first_outreach: RawFirstOutreach;
  economics?: {
    public_per_diem_or_rate: number | null;
    reason: string;
  };
}

interface RawStrategicTarget {
  rank: number;
  target: string;
  reason: string;
}

interface RawLiveOpportunity {
  target: string;
  opportunity: string;
  status: BuyerOpportunityStatus;
  deadline?: string;
  window?: string;
  fit: string;
}

interface FiveStateBuyerSprint {
  dataset: string;
  verified_as_of: string;
  scope: string[];
  research_rules: {
    status_labels: BuyerOpportunityStatus[];
  };
  executive_conclusion: {
    strategic_outreach_rank: RawStrategicTarget[];
    live_opportunity_watch: RawLiveOpportunity[];
  };
  states: Record<string, RawStateBuyerResearch>;
  cross_cutting_gaps: string[];
  recommended_next_actions: Array<{ priority: number; action: string }>;
  sources: Record<string, string | string[]>;
}

export interface BuyerOpportunity {
  name: string;
  identifier?: string;
  status: BuyerOpportunityStatus;
  timing?: string;
  fit?: string;
  facts: string[];
}

export interface BuyerTarget {
  rank: number;
  portfolioPriorityRank?: number;
  region: string;
  population: string;
  buyers: string[];
  buyerRole?: string;
  leaders: RawLeader[];
  demand: string[];
  opportunities: BuyerOpportunity[];
  economics: string[];
  pitch: string;
  barriers: string[];
}

export interface StateBuyerResearchDossier {
  stateName: string;
  asOf: string;
  stateDemand: string[];
  stateBuyers: RawBuyer[];
  targets: BuyerTarget[];
  firstOutreach: RawFirstOutreach;
  stateEconomics?: string;
  sources: string[];
}

const buyerSprint = fiveStateBuyerSprintJson as unknown as FiveStateBuyerSprint;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0
});
const count = new Intl.NumberFormat("en-US");

const globalPriorityByTarget = new Map<string, number>([
  ["California|Los Angeles County", 1],
  ["Washington|King County", 2],
  ["California|Alameda County", 3],
  ["New York|Bronx / New York City", 4],
  ["Washington|Pierce County", 5],
  ["Oregon|Multnomah County", 6],
  ["Texas|Dallas / North Texas", 7]
]);

function formatPopulation(population: RawPopulation) {
  if (typeof population === "number") return `${count.format(population)} people`;
  return Object.entries(population)
    .map(([label, value]) => `${label}: ${count.format(value)}`)
    .join(" · ");
}

function dateText(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(.*)$/);
  if (!match) return value;
  const [, year, month, day, remainder] = match;
  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))));
  return `${formatted}${remainder ?? ""}`;
}

function procurementTiming(procurement: RawProcurement) {
  if (procurement.proposal_due) return `Proposal due ${dateText(procurement.proposal_due)}`;
  if (procurement.due) return `Due ${dateText(procurement.due)}`;
  if (procurement.close_date) return `Closes ${dateText(procurement.close_date)}`;
  if (procurement.window) return procurement.window;
  if (procurement.planned_release || procurement.planned_award) {
    return [
      procurement.planned_release ? `Release ${procurement.planned_release}` : "",
      procurement.planned_award ? `award ${procurement.planned_award}` : ""
    ].filter(Boolean).join(" · ");
  }
  if (procurement.closed) return `Closed ${dateText(procurement.closed)}`;
  return undefined;
}

function procurementFacts(procurement: RawProcurement) {
  return [
    procurement.annual_allocation
      ? `${money.format(procurement.annual_allocation)} annual allocation`
      : null,
    procurement.estimated_incremental_cost
      ? `${money.format(procurement.estimated_incremental_cost)} estimated incremental cost`
      : null,
    procurement.estimated_capital_and_equipment
      ? `${money.format(procurement.estimated_capital_and_equipment)} planned capital and equipment`
      : null,
    procurement.new_funding
      ? `${money.format(procurement.new_funding)} in new funding`
      : null,
    procurement.capacity ? `${count.format(procurement.capacity)}-slot capacity` : null,
    procurement.award_count ? `${procurement.award_count} anticipated award` : null,
    procurement.planned_new_homes ? `${procurement.planned_new_homes} planned new homes` : null,
    procurement.minimum_volume_guaranteed === false ? "No guaranteed referral volume" : null,
    procurement.anticipated_contract_start
      ? `Anticipated start ${dateText(procurement.anticipated_contract_start)}`
      : null,
    procurement.service_period ? `Service period ${procurement.service_period}` : null,
    procurement.contract_term ? `${procurement.contract_term} contract term` : null,
    procurement.portal ? `Procurement portal: ${procurement.portal}` : null,
    procurement.proposal_model ? `Proposal model: ${procurement.proposal_model}` : null,
    procurement.eligibility_note ?? null,
    procurement.plan_statement ?? null
  ].filter((item): item is string => Boolean(item));
}

function procurementList(target: RawPriorityTarget): BuyerOpportunity[] {
  if (target.procurement) {
    const procurements = Array.isArray(target.procurement)
      ? target.procurement
      : [target.procurement];
    return procurements.map((procurement) => {
      const timing = procurementTiming(procurement);
      return {
        name: procurement.name ?? "Residential procurement",
        ...(procurement.identifier ? { identifier: procurement.identifier } : {}),
        status: procurement.status ?? "not_publicly_located",
        ...(timing ? { timing } : {}),
        facts: procurementFacts(procurement)
      };
    });
  }

  if (target.procurement_and_funding) {
    const funding = target.procurement_and_funding;
    return [{
      name: "Mental-health residential capital program",
      status: funding.recent_rfp_status,
      ...(funding.recent_rfp_deadline
        ? { timing: `Closed ${dateText(funding.recent_rfp_deadline)}` }
        : {}),
      facts: [
        funding.capital_available_2025
          ? `${money.format(funding.capital_available_2025)} capital available in 2025`
          : null,
        funding.preservation_awards
          ? `${money.format(funding.preservation_awards)} awarded for preservation`
          : null,
        ...(funding.desired_programs ?? []),
        funding.note ?? null
      ].filter((item): item is string => Boolean(item))
    }];
  }

  if (target.recent_precedent) {
    const precedent = target.recent_precedent;
    return [{
      name: `${precedent.provider} contract precedent`,
      status: "recent_precedent",
      ...(precedent.contract_end
        ? { timing: `Current through ${dateText(precedent.contract_end)}` }
        : {}),
      facts: [
        precedent.service,
        precedent.contract_total_after_amendment
          ? `${money.format(precedent.contract_total_after_amendment)} amended contract total`
          : null,
        precedent.active_clients ? `${precedent.active_clients} active clients` : null,
        precedent.typical_placement ? `Typical placement: ${precedent.typical_placement}` : null,
        ...(precedent.referral_examples ?? [])
      ].filter((item): item is string => Boolean(item))
    }];
  }

  return [{
    name: "No public residential solicitation located",
    status: "not_publicly_located",
    facts: []
  }];
}

function targetEconomics(target: RawPriorityTarget) {
  const rates = target.published_monthly_rates?.length
    ? [`Published monthly rates: ${target.published_monthly_rates
      .map((rate) => `Level ${rate.level} ${money.format(rate.monthly_per_client)}`)
      .join(" · ")}`]
    : [];
  const benchmark = target.fact_economics_benchmark;
  if (!benchmark) return rates;
  return [
    ...rates,
    [
      benchmark.annual_gross ? `${money.format(benchmark.annual_gross)} annual gross` : null,
      benchmark.assumed_medicaid ? `${money.format(benchmark.assumed_medicaid)} assumed Medicaid` : null,
      benchmark.net_deficit ? `${money.format(benchmark.net_deficit)} net deficit` : null,
      benchmark.services ? `${count.format(benchmark.services)} services` : null
    ].filter(Boolean).join(" · "),
    benchmark.note ?? ""
  ].filter(Boolean);
}

function watchFit(stateName: string, region: string) {
  return buyerSprint.executive_conclusion.live_opportunity_watch.find((item) => {
    if (region.includes("Los Angeles")) return item.target === "Los Angeles County";
    if (region.includes("San Bernardino")) return item.target === "San Bernardino County";
    if (region.includes("Clark")) return item.target === "Clark County, Washington";
    if (stateName === "New York" && region.includes("Bronx")) return item.target === "New York City";
    if (stateName === "New York" && region.includes("Kings")) return item.target === "New York State";
    return false;
  })?.fit;
}

function normalizeState(stateName: string, raw: RawStateBuyerResearch): StateBuyerResearchDossier {
  const stateDemand = Array.isArray(raw.state_demand)
    ? raw.state_demand
    : raw.state_demand?.fact
      ? [raw.state_demand.fact]
      : [];
  const stateBuyers = [
    ...(raw.state_buyer ? [raw.state_buyer] : []),
    ...(raw.state_buyers ?? [])
  ];
  const stateSources = buyerSprint.sources[stateName];

  return {
    stateName,
    asOf: buyerSprint.verified_as_of,
    stateDemand,
    stateBuyers,
    targets: raw.priority_targets.map((target) => {
      const portfolioPriorityRank = globalPriorityByTarget.get(
        `${stateName}|${target.county_or_region}`
      );
      const fit = watchFit(stateName, target.county_or_region);
      return {
        rank: target.rank,
        ...(portfolioPriorityRank != null ? { portfolioPriorityRank } : {}),
        region: target.county_or_region,
        population: formatPopulation(target.population_2025),
        buyers: target.buyer ? [target.buyer] : (target.buyers ?? []),
        ...(target.buyer_role ? { buyerRole: target.buyer_role } : {}),
        leaders: target.leadership ?? [],
        demand: [
          ...(Array.isArray(target.demand)
            ? target.demand
            : target.demand
              ? [target.demand]
              : []),
          ...(target.buyer_logic ? [target.buyer_logic] : [])
        ],
        opportunities: procurementList(target).map((opportunity) => ({
          ...opportunity,
          ...(fit ? { fit } : {})
        })),
        economics: targetEconomics(target),
        pitch: target.alamo_pitch,
        barriers: target.barriers
      };
    }),
    firstOutreach: raw.first_outreach,
    ...(raw.economics?.reason ? { stateEconomics: raw.economics.reason } : {}),
    sources: Array.isArray(stateSources) ? stateSources : []
  };
}

const buyerResearchByState = new Map(
  Object.entries(buyerSprint.states).map(([stateName, raw]) => [
    stateName,
    normalizeState(stateName, raw)
  ])
);

export function getStateBuyerResearch(stateName: string) {
  return buyerResearchByState.get(stateName);
}

export function hasStateBuyerResearch(stateName: string) {
  return buyerResearchByState.has(stateName);
}

export function buyerOpportunityStatusLabel(status: BuyerOpportunityStatus) {
  const labels: Record<BuyerOpportunityStatus, string> = {
    active: "Active",
    scheduled_status_to_verify: "Scheduled, verify status",
    closed_or_pending: "Closed or pending",
    closed: "Closed",
    recent_precedent: "Contract precedent",
    not_publicly_located: "No public posting located"
  };
  return labels[status];
}

export const BUYER_RESEARCH_STATE_COUNT = buyerResearchByState.size;
export const BUYER_RESEARCH_TARGET_COUNT = [...buyerResearchByState.values()].reduce(
  (total, state) => total + state.targets.length,
  0
);

if (BUYER_RESEARCH_STATE_COUNT !== 5) {
  throw new Error(`Expected 5 buyer-research states, found ${BUYER_RESEARCH_STATE_COUNT}.`);
}

if (BUYER_RESEARCH_TARGET_COUNT !== 14) {
  throw new Error(`Expected 14 county or regional buyer targets, found ${BUYER_RESEARCH_TARGET_COUNT}.`);
}

buyerResearchByState.forEach((state) => {
  if (!state.targets.length) throw new Error(`Missing buyer targets for ${state.stateName}.`);
  if (!state.sources.length || state.sources.some((url) => !url.startsWith("https://"))) {
    throw new Error(`Buyer research sources are incomplete for ${state.stateName}.`);
  }
});
