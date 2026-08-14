import { ChevronDown, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  EFFECTIVENESS_AUDIENCES,
  type EffectivenessAudienceId
} from "../../../../shared/effectiveness-evidence.mjs";
import StateDetailModal from "../components/StateDetailModal";
import StateTargetingMap from "../components/StateTargetingMap";
import {
  BUYER_RESEARCH_STATE_COUNT,
  getStateBuyerResearch,
  hasStateBuyerResearch
} from "../data/stateBuyerResearchData";
import {
  formatStateResearchDate,
  getStateResearchDossier,
  hasVerifiedDemandResearch,
  STATE_RESEARCH_AS_OF,
  VERIFIED_DEMAND_STATE_COUNT
} from "../data/stateResearchData";
import {
  GOVERNANCE_OPTIONS,
  STATE_TARGETING_RECORDS,
  getStateAudienceScore,
  type GovernanceCode,
  type StateTargetingRecord
} from "../data/stateTargetingData";

type AtlasScope = "priority" | "all";
type SortMode =
  | "state-name"
  | "bed-scarcity"
  | "verified-demand"
  | "buyer-research"
  | EffectivenessAudienceId;

const governanceCodes = Object.keys(GOVERNANCE_OPTIONS) as GovernanceCode[];
const audienceSortOptions = EFFECTIVENESS_AUDIENCES.filter(
  (audience) => audience.id !== "executive"
);

function searchableText(record: StateTargetingRecord) {
  const research = getStateResearchDossier(record);
  const buyerResearch = getStateBuyerResearch(record.stateName);
  return [
    record.stateName,
    record.stateCode,
    record.governanceLabel,
    record.stateAuthority,
    record.primaryTarget,
    record.targetUniverse,
    record.decisionConcentration,
    record.targetTitles.join(" "),
    record.researchPitch,
    record.relevanceTags.join(" "),
    research.demandRationale ?? "",
    research.evidence.map((item) => item.text).join(" "),
    ...(buyerResearch?.targets.flatMap((target) => [
      target.region,
      target.buyers.join(" "),
      target.leaders.map((leader) => `${leader.name} ${leader.title}`).join(" "),
      target.demand.join(" "),
      target.opportunities
        .map((opportunity) => `${opportunity.name} ${opportunity.identifier ?? ""} ${opportunity.status}`)
        .join(" "),
      target.pitch
    ]) ?? [])
  ]
    .join(" ")
    .toLowerCase();
}

function sortRecords(records: StateTargetingRecord[], sortMode: SortMode) {
  return records.sort((left, right) => {
    if (sortMode === "state-name") return left.stateName.localeCompare(right.stateName);
    if (sortMode === "bed-scarcity") {
      return (
        getStateResearchDossier(left).bedSupply.rate -
          getStateResearchDossier(right).bedSupply.rate ||
        left.stateName.localeCompare(right.stateName)
      );
    }
    if (sortMode === "verified-demand") {
      return (
        (getStateResearchDossier(left).demandRank ?? Number.MAX_SAFE_INTEGER) -
          (getStateResearchDossier(right).demandRank ?? Number.MAX_SAFE_INTEGER) ||
        left.stateName.localeCompare(right.stateName)
      );
    }
    if (sortMode === "buyer-research") {
      return (
        Number(hasStateBuyerResearch(right.stateName)) -
          Number(hasStateBuyerResearch(left.stateName)) ||
        (getStateBuyerResearch(left.stateName)?.targets[0]?.portfolioPriorityRank ??
          Number.MAX_SAFE_INTEGER) -
          (getStateBuyerResearch(right.stateName)?.targets[0]?.portfolioPriorityRank ??
            Number.MAX_SAFE_INTEGER) ||
        left.stateName.localeCompare(right.stateName)
      );
    }
    return (
      getStateAudienceScore(right, sortMode) - getStateAudienceScore(left, sortMode) ||
      left.stateName.localeCompare(right.stateName)
    );
  });
}

export default function FiftyStatePage({ embedded = false }: { embedded?: boolean }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<AtlasScope>("priority");
  const [sortMode, setSortMode] = useState<SortMode>("verified-demand");
  const [selectedRecord, setSelectedRecord] = useState<StateTargetingRecord | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredRecords = useMemo(() => {
    const scopedRecords = STATE_TARGETING_RECORDS.filter(
      (record) => scope === "all" || hasVerifiedDemandResearch(record.stateCode)
    );
    return sortRecords(
      scopedRecords.filter(
        (record) => !normalizedQuery || searchableText(record).includes(normalizedQuery)
      ),
      sortMode
    );
  }, [normalizedQuery, scope, sortMode]);

  const matchingStateNames = useMemo(
    () => new Set(filteredRecords.map((record) => record.stateName)),
    [filteredRecords]
  );

  function navigateSelectedState(direction: -1 | 1) {
    if (!selectedRecord || !filteredRecords.length) return;
    const index = filteredRecords.findIndex(
      (record) => record.stateCode === selectedRecord.stateCode
    );
    const currentIndex = index < 0 ? 0 : index;
    const nextIndex =
      (currentIndex + direction + filteredRecords.length) % filteredRecords.length;
    setSelectedRecord(filteredRecords[nextIndex] ?? null);
  }

  const resultSummary =
    scope === "priority"
      ? `${filteredRecords.length} priority states · ${BUYER_RESEARCH_STATE_COUNT} buyer dossiers`
      : `${filteredRecords.length} national profiles · ${VERIFIED_DEMAND_STATE_COUNT} priority states`;

  return (
    <div
      data-fifty-state-page="true"
      data-fifty-state-embedded={embedded ? "true" : "false"}
      data-atlas-scope={scope}
      className="mx-auto w-full max-w-[1432px] bg-white pb-10 text-[#111111]"
    >
      <header className="border-b-2 border-[#111111] pb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0f8b73]">
          Behavioral-health market atlas
        </p>
        <div className="mt-1 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)] lg:items-end lg:gap-8">
          <h1 className="max-w-[720px] font-serif text-[30px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[36px]">
            Priority states and buyer routes.
          </h1>
          <p className="max-w-[480px] text-[13px] leading-5 text-[#595959] lg:pb-0.5">
            Start with researched demand signals, then open the national baseline only when you need it.
          </p>
        </div>
      </header>

      <section
        aria-label="Search and organize the targeting atlas"
        className="grid gap-2.5 border-b border-[#d9d9d9] py-3 md:grid-cols-[minmax(260px,1fr)_auto_minmax(220px,0.46fr)] md:items-center"
      >
        <label className="flex min-h-10 items-center gap-3 border border-[#b3b3b3] bg-white px-3.5 focus-within:border-[#0f8b73] focus-within:ring-1 focus-within:ring-[#0f8b73]">
          <Search className="h-4 w-4 shrink-0 text-[#0f8b73]" />
          <span className="sr-only">Search states and buyer research</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a state, buyer, region, or leader"
            className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[#111111] outline-none placeholder:text-[#737373]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear state search"
              className="grid h-7 w-7 shrink-0 place-items-center text-[#595959] hover:text-[#111111]"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </label>

        <div
          role="group"
          aria-label="State research scope"
          className="grid grid-cols-2 border border-[#b3b3b3]"
        >
          <button
            type="button"
            aria-pressed={scope === "priority"}
            onClick={() => setScope("priority")}
            className={`h-[38px] px-3.5 text-[12px] font-semibold transition-colors ${
              scope === "priority"
                ? "bg-[#111111] text-white"
                : "bg-white text-[#444444] hover:bg-[#f5f4ef]"
            }`}
          >
            Priority {VERIFIED_DEMAND_STATE_COUNT}
          </button>
          <button
            type="button"
            aria-pressed={scope === "all"}
            onClick={() => setScope("all")}
            className={`h-[38px] border-l border-[#b3b3b3] px-3.5 text-[12px] font-semibold transition-colors ${
              scope === "all"
                ? "bg-[#111111] text-white"
                : "bg-white text-[#444444] hover:bg-[#f5f4ef]"
            }`}
          >
            All 50
          </button>
        </div>

        <label className="relative">
          <span className="sr-only">Sort states</span>
          <select
            aria-label="Sort states"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="h-10 w-full appearance-none border border-[#b3b3b3] bg-white px-3.5 pr-9 text-[13px] font-semibold text-[#222222] outline-none focus:border-[#0f8b73] focus:ring-1 focus:ring-[#0f8b73]"
          >
            <option value="verified-demand">Research priority</option>
            <option value="buyer-research">Buyer research first</option>
            <option value="bed-scarcity">Lowest state-bed supply</option>
            <option value="state-name">State name</option>
            {audienceSortOptions.map((audience) => (
              <option key={audience.id} value={audience.id}>
                Best route for {audience.shortLabel.toLowerCase()}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3.5 top-3 h-4 w-4"
          />
        </label>
      </section>

      <div className="grid gap-6 py-5 xl:grid-cols-[minmax(0,1.78fr)_minmax(310px,0.66fr)] xl:gap-8">
        <section aria-labelledby="atlas-map-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2
                id="atlas-map-heading"
                className="font-serif text-[24px] font-semibold tracking-[-0.035em]"
              >
                Market map
              </h2>
              <p className="mt-1 text-[12px] leading-5 text-[#595959]">
                Select a highlighted state to open its research.
              </p>
            </div>
            <p className="text-right text-[12px] font-semibold text-[#595959]">
              {resultSummary}
            </p>
          </div>

          <div className="mt-3 border-y border-[#d9d9d9] bg-[#fafafa] px-2 py-3 sm:px-4 sm:py-4">
            <StateTargetingMap
              matchingStateNames={matchingStateNames}
              onSelect={setSelectedRecord}
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#d9d9d9] py-3 text-[11px] text-[#595959]">
            <span className="font-semibold text-[#333333]">Color shows the lead purchasing structure:</span>
            {governanceCodes.map((code) => (
              <span key={code} className="inline-flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5"
                  style={{ backgroundColor: GOVERNANCE_OPTIONS[code].color }}
                  aria-hidden="true"
                />
                {GOVERNANCE_OPTIONS[code].shortLabel}
              </span>
            ))}
          </div>
        </section>

        <aside aria-labelledby="state-index-heading" className="xl:border-l xl:border-[#d9d9d9] xl:pl-8">
          <div className="flex items-end justify-between gap-4 border-b-2 border-[#111111] pb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#595959]">
                {scope === "priority" ? "Priority index" : "National index"}
              </p>
              <h2
                id="state-index-heading"
                className="mt-1 font-serif text-[25px] font-semibold tracking-[-0.035em]"
              >
                Open a state
              </h2>
            </div>
            <span className="text-[12px] font-semibold text-[#595959]">
              {filteredRecords.length}
            </span>
          </div>

          {filteredRecords.length ? (
            <div className="max-h-[660px] overflow-y-auto overscroll-contain">
              {filteredRecords.map((record) => {
                const research = getStateResearchDossier(record);
                const buyerTargetCount = getStateBuyerResearch(record.stateName)?.targets.length;
                return (
                  <button
                    type="button"
                    key={record.stateCode}
                    onClick={() => setSelectedRecord(record)}
                    className="group grid w-full grid-cols-[4px_minmax(0,1fr)_auto] gap-3 border-b border-[#d9d9d9] py-3 pr-1 text-left transition-colors hover:bg-[#f5f4ef] focus:bg-[#f5f4ef]"
                  >
                    <span
                      className="h-full min-h-11"
                      style={{
                        backgroundColor: GOVERNANCE_OPTIONS[record.primaryGovernanceCode].color
                      }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block font-serif text-[18px] font-semibold leading-5 text-[#111111]">
                        {record.stateName}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-[12px] leading-4 text-[#595959]">
                        {record.primaryTarget}
                      </span>
                      <span className="mt-1.5 block text-[10px] font-semibold text-[#0f8b73]">
                        {research.demandRank ? `Research priority #${research.demandRank}` : "National baseline"}
                        {buyerTargetCount ? ` · ${buyerTargetCount} buyer targets` : ""}
                      </span>
                    </span>
                    <span className="pt-0.5 text-[11px] font-bold tracking-[0.1em] text-[#777777] group-hover:text-[#0f8b73]">
                      {record.stateCode}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="border-b border-[#d9d9d9] py-10 text-center">
              <p className="font-serif text-[20px] font-semibold">No states match this search.</p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-4 text-[13px] font-semibold text-[#0f8b73] underline underline-offset-4"
              >
                Clear search
              </button>
            </div>
          )}
        </aside>
      </div>

      <details className="border-t border-[#d9d9d9] pt-3 text-[#595959]">
        <summary className="cursor-pointer text-[12px] font-semibold text-[#333333]">
          How to read this atlas
        </summary>
        <p className="mt-2 max-w-[980px] text-[12px] leading-5">
          Research is current through {formatStateResearchDate(STATE_RESEARCH_AS_OF)}. Priority states add source-linked legal, hospital-pressure, placement, and step-down evidence. Five states also include verified buyer targets and opportunity status. Every other state remains available as a national bed-supply baseline and mapped buyer route. Priority order is not a revenue forecast, clinical rating, or legal opinion.
        </p>
      </details>

      {selectedRecord ? (
        <StateDetailModal
          record={selectedRecord}
          audienceId={
            sortMode === "state-name" ||
            sortMode === "bed-scarcity" ||
            sortMode === "verified-demand" ||
            sortMode === "buyer-research"
              ? selectedRecord.recommendedAudience
              : sortMode
          }
          onDismiss={() => setSelectedRecord(null)}
          onPrevious={() => navigateSelectedState(-1)}
          onNext={() => navigateSelectedState(1)}
        />
      ) : null}
    </div>
  );
}
