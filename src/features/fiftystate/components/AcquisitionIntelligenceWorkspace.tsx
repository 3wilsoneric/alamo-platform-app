import { ChevronDown, ChevronLeft, ChevronRight, Download, ExternalLink, Search } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { downloadTextFile } from "../../../shared/files/browserDownload";
import type { AcquisitionOverview } from "../data/acquisitionIntelligenceApi";
import {
  fetchAcquisitionOperatorExport,
  fetchAcquisitionOperators,
  freezeAcquisitionResearchCohort,
  selectUnreviewedAcquisitionOperatorPage,
  setAcquisitionOperatorDecision,
  type AcquisitionOperatorCapacityEvidence,
  type AcquisitionOperatorConfidence,
  type AcquisitionOperatorFacilityScaleBand,
  type AcquisitionOperatorFit,
  type AcquisitionOperatorMaturity,
  type AcquisitionOperatorOwnerDecision,
  type AcquisitionOperatorPrivateLikelihood,
  type AcquisitionOperatorResult,
  type AcquisitionOperatorScreeningCapacityBand,
  type AcquisitionOperatorSearchResponse,
  type AcquisitionOperatorSelectionBucket,
  type AcquisitionOperatorSort,
  type AcquisitionOperatorStage
} from "../data/acquisitionOperatorApi";

const PAGE_SIZE = 50;

function formatCount(value: number | null | undefined) {
  return value == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function AcquisitionScreeningLaneButton({
  label,
  count,
  description,
  isActive,
  onClick
}: {
  label: string;
  count: number | undefined;
  description: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onClick}
      className={`border-t border-[#d9d9d9] px-3 py-3 text-left sm:border-r xl:last:border-r-0 ${isActive ? "bg-[#e8f5f1]" : "hover:bg-[#f5f4ef]"}`}
    >
      <span className="block text-[9px] font-bold uppercase tracking-[0.08em] text-[#595959]">{label}</span>
      <span className="mt-1 block font-serif text-[25px] font-semibold">{formatCount(count)}</span>
      <span className="mt-1 block text-[9px] leading-4 text-[#737373]">{description}</span>
    </button>
  );
}

// Keep the detailed facility workflow in the production dependency graph while
// leaving it unmounted. The owner can restore this surface after the broad
// company screen has narrowed the universe to a deliberate research cohort.
function loadDeferredAcquisitionResearchSurfaces() {
  return Promise.all([
    import("./AcquisitionResearchWorkflow"),
    import("./NationalFacilityDiscovery")
  ]);
}

void loadDeferredAcquisitionResearchSurfaces;

function formatMillions(value: number | null | undefined) {
  if (value == null) return "—";
  if (value >= 1_000) return `$${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}B`;
  if (value < 10) return `$${value.toFixed(1)}M`;
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value)}M`;
}

function formatBedRange(record: AcquisitionOperatorResult) {
  const { low, base, high } = record.screeningCapacity.range;
  if (base === null) return { range: "—", detail: "not estimable" };
  if (high === null) return { range: `≥${formatCount(low)}`, detail: `floor ${formatCount(base)}` };
  return { range: `${formatCount(low)}–${formatCount(high)}`, detail: `base ${formatCount(base)}` };
}

function display(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "Unverified";
}

function confidenceTone(value: string | null | undefined) {
  if (value === "high") return "text-[#0f6f5d]";
  if (value === "medium") return "text-[#9a5b0a]";
  if (value === "excluded" || value === "not_applicable") return "text-[#737373]";
  return "text-[#a43f32]";
}

function screeningIdentityLabel(record: AcquisitionOperatorResult) {
  if (record.parentIdentity?.confidence.relationship === "high") return "Evidence-backed operating parent";
  if (record.resolution.basis === "shared_website_domain") return "Shared-domain company proposal";
  return "Directory-name company proposal";
}

function fastScreenStrengths(record: AcquisitionOperatorResult) {
  const locationLabel = record.screeningProfile.facilityScale === 1 ? "location" : "locations";
  const stateLabel = record.screeningProfile.stateBreadth === 1 ? "state" : "states";
  const strengths = [
    `${formatCount(record.screeningProfile.facilityScale)} observable ${locationLabel} across ${formatCount(record.screeningProfile.stateBreadth)} ${stateLabel}.`,
    `${formatCount(record.facilityCounts.candidates)} facilities carry candidate signals: ${formatCount(record.facilityCounts.coreSignal)} core and ${formatCount(record.facilityCounts.adjacentSignal)} adjacent.`,
    screeningIdentityLabel(record)
  ];
  if (record.screeningProfile.privateLikelihood === "verified_private") strengths.push("Current evidence supports private ownership.");
  if (record.licenseEvidence.bedTotals.verifiedCoreTarget !== null) {
    strengths.push(`${formatCount(record.licenseEvidence.bedTotals.verifiedCoreTarget)} current core beds are regulator-verified in the known portfolio slice.`);
  }
  return strengths;
}

function fastScreenRisks(record: AcquisitionOperatorResult) {
  const risks = [];
  if (record.parentIdentity?.confidence.relationship !== "high") {
    risks.push("Operating parent is unresolved; this row may still represent a brand or facility cluster.");
  }
  if (!record.parentIdentity || record.parentIdentity.confidence.ownership !== "high") {
    risks.push("Current controlling ownership is not yet verified.");
  }
  if (!record.parentIdentity || record.parentIdentity.confidence.targetFit !== "high") {
    risks.push(record.scope.fitCategory === "context_or_unresolved"
      ? "Adult high-acuity residential mental-health fit is unresolved."
      : "Directory service signals still require first-party or regulator confirmation.");
  }
  if (record.licenseEvidence.bedTotals.verifiedCoreTarget === null) {
    risks.push("No current regulator-verified core bed count is attached.");
  } else if (record.licenseEvidence.portfolioCoverage !== "complete_reconciled_portfolio") {
    risks.push("Verified beds cover a known slice; complete non-California portfolio reconciliation remains open.");
  }
  if (!record.parentIdentity || record.parentIdentity.confidence.valuation !== "high") {
    risks.push("Operating valuation inputs are assumptions rather than high-confidence company financials.");
  }
  for (const caution of record.scope.cautions) risks.push(`${display(caution)}.`);
  return [...new Set(risks)];
}

function sourceRows(record: AcquisitionOperatorResult) {
  const rows = [
    ...(record.parentIdentity?.sources.map((source) => ({ ...source, evidenceType: "Parent" })) ?? []),
    ...record.licenseEvidence.licenses.map((license) => ({
      id: license.source.id,
      title: `${license.programName} · ${license.license.number ? `license ${license.license.number}` : "current registry listing"}`,
      url: license.source.url,
      asOf: license.source.asOf,
      sourceType: license.source.sourceType,
      evidenceType: "License"
    })),
    ...record.licenseEvidence.reportedCapacity.map((capacity) => ({
      id: capacity.source.id,
      title: `${capacity.programName} · ${formatCount(capacity.capacity.reportedBeds)} reported beds`,
      url: capacity.source.url,
      asOf: capacity.source.asOf,
      sourceType: capacity.source.sourceType,
      evidenceType: "Capacity"
    }))
  ];
  return [...new Map(rows.map((row) => [`${row.id}:${row.title}`, row])).values()];
}

export default function AcquisitionIntelligenceWorkspace({
  overview,
  states
}: {
  overview: AcquisitionOverview;
  states: string[];
}) {
  const [stage, setStage] = useState<AcquisitionOperatorStage>("all");
  const [selectionBucket, setSelectionBucket] = useState<AcquisitionOperatorSelectionBucket>("all");
  const [maturity, setMaturity] = useState<AcquisitionOperatorMaturity>("mature_scale_signal");
  const [privateLikelihood, setPrivateLikelihood] = useState<AcquisitionOperatorPrivateLikelihood>("all");
  const [screeningCapacityBand, setScreeningCapacityBand] = useState<AcquisitionOperatorScreeningCapacityBand>("all");
  const [facilityScaleBand, setFacilityScaleBand] = useState<AcquisitionOperatorFacilityScaleBand>("all");
  const [fit, setFit] = useState<AcquisitionOperatorFit>("all");
  const [ownerDecision, setOwnerDecision] = useState<AcquisitionOperatorOwnerDecision>("all");
  const [queryDraft, setQueryDraft] = useState("");
  const [query, setQuery] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [relationshipConfidence, setRelationshipConfidence] = useState<AcquisitionOperatorConfidence>("all");
  const [capacityEvidence, setCapacityEvidence] = useState<AcquisitionOperatorCapacityEvidence>("all");
  const [sortMode, setSortMode] = useState<AcquisitionOperatorSort>("maturity");
  const [page, setPage] = useState(0);
  const [response, setResponse] = useState<AcquisitionOperatorSearchResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decisionSavingId, setDecisionSavingId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [freezingCohort, setFreezingCohort] = useState(false);
  const [cohortError, setCohortError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchAcquisitionOperators({
        stage,
        q: query,
        state: stateCode,
        selectionBucket,
        maturity,
        privateLikelihood,
        screeningCapacityBand,
        facilityScaleBand,
        fit,
        ownerDecision,
        relationshipConfidence,
        capacityEvidence,
        sort: sortMode,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE
      }, signal);
      setResponse(next);
      setSelectedId((current) => current && next?.results.some((record) => record.id === current)
        ? current
        : null);
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setResponse(null);
      setSelectedId(null);
      setError(requestError instanceof Error
        ? `The parent-company universe could not be loaded: ${requestError.message}`
        : "The parent-company universe could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [capacityEvidence, facilityScaleBand, fit, maturity, ownerDecision, page, privateLikelihood, query, relationshipConfidence, screeningCapacityBand, selectionBucket, sortMode, stage, stateCode]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const operators = response?.results ?? [];
  const selected = operators.find((record) => record.id === selectedId) ?? null;
  const totalPages = Math.max(1, Math.ceil((response?.matched ?? 0) / PAGE_SIZE));
  const counts = response?.counts ?? {};
  const latestCohort = response?.cohorts[0] ?? null;
  const selectedIdentityIssues = [
    ...(response?.selectionIntegrity.orphaned ?? []),
    ...(response?.selectionIntegrity.conflicts ?? [])
  ].filter((issue) => issue.status === "selected").length;
  const canFreezeCohort = (counts.ownerSelected ?? 0) >= 50 &&
    (counts.ownerSelected ?? 0) <= 100 && selectedIdentityIssues === 0;
  const remainingResearchSlots = Math.max(0, 100 - Number(counts.ownerSelected ?? 0));
  const unreviewedEligiblePage = operators.filter((record) =>
    !record.screeningDecision &&
    !["excluded_public_company", "excluded_out_of_scope"].includes(record.acquisitionEligibility)
  );
  const bulkSelectableCount = Math.min(unreviewedEligiblePage.length, remainingResearchSlots);

  function submit(event: FormEvent) {
    event.preventDefault();
    setBulkMessage(null);
    setExportMessage(null);
    setExportError(null);
    setPage(0);
    setQuery(queryDraft.trim());
  }

  function changeFilter(action: () => void) {
    setBulkMessage(null);
    setExportMessage(null);
    setExportError(null);
    setPage(0);
    action();
  }

  function startTriageLane(nextStage: AcquisitionOperatorStage, nextMaturity: AcquisitionOperatorMaturity) {
    setBulkMessage(null);
    setExportMessage(null);
    setExportError(null);
    setPage(0);
    setStage(nextStage);
    setSelectionBucket("all");
    setMaturity(nextMaturity);
    setPrivateLikelihood("all");
    setScreeningCapacityBand("all");
    setFacilityScaleBand("all");
    setFit("all");
    setOwnerDecision("undecided");
    setQueryDraft("");
    setQuery("");
    setStateCode("");
    setRelationshipConfidence("all");
    setCapacityEvidence("all");
    setSortMode("maturity");
  }

  function startSuggested100Triage() {
    startTriageLane("research_100_queue", "all");
    setSortMode("rank");
  }

  function startScreen500Triage() {
    startTriageLane("screen_500", "all");
    setSortMode("rank");
  }

  function startMatureTriage() {
    startTriageLane("all", "mature_scale_signal");
  }

  function openScreeningCapacityLane(nextBand: AcquisitionOperatorScreeningCapacityBand) {
    startTriageLane("target_candidates", "all");
    setOwnerDecision("all");
    setScreeningCapacityBand(nextBand);
    setSortMode(nextBand === "not_estimable" ? "maturity" : "screening_capacity");
  }

  function openMatureServiceLane(
    nextBucket: AcquisitionOperatorSelectionBucket,
    nextFit: AcquisitionOperatorFit = "all"
  ) {
    startTriageLane("all", "mature_scale_signal");
    setSelectionBucket(nextBucket);
    setFit(nextFit);
    setOwnerDecision("all");
  }

  function openMatureTargetReadiness(
    nextRelationshipConfidence: AcquisitionOperatorConfidence,
    nextPrivateLikelihood: AcquisitionOperatorPrivateLikelihood = "all"
  ) {
    startTriageLane("all", "mature_scale_signal");
    setSelectionBucket("mature_target_signal");
    setFit("all");
    setOwnerDecision("all");
    setRelationshipConfidence(nextRelationshipConfidence);
    setPrivateLikelihood(nextPrivateLikelihood);
  }

  async function saveQuickDecision(record: AcquisitionOperatorResult, status: "selected" | "hold" | "excluded") {
    setDecisionSavingId(record.id);
    setDecisionError(null);
    try {
      await setAcquisitionOperatorDecision(record.id, status, record.screeningDecision?.notes ?? "");
      await load();
    } catch (requestError) {
      setDecisionError(requestError instanceof Error
        ? requestError.message
        : "The company screening decision could not be saved.");
    } finally {
      setDecisionSavingId(null);
    }
  }

  async function addUnreviewedPageToResearchList() {
    if (!response || bulkSelectableCount < 1 || operators.length < 1) return;
    setBulkSaving(true);
    setBulkMessage(null);
    setDecisionError(null);
    try {
      const result = await selectUnreviewedAcquisitionOperatorPage(
        operators.map((record) => record.id),
        response.selectionRevision
      );
      const skipped = [
        result.skippedAlreadyReviewed ? `${result.skippedAlreadyReviewed} already reviewed` : "",
        result.skippedIneligible ? `${result.skippedIneligible} ineligible` : "",
        result.skippedResearchListLimit ? `${result.skippedResearchListLimit} beyond the 100-company limit` : ""
      ].filter(Boolean);
      setBulkMessage(
        `${result.selected ? `Added ${result.selected} companies` : "No companies added"}. ` +
        `Research list: ${result.ownerSelected} of 100.${skipped.length ? ` Skipped ${skipped.join(", ")}.` : ""}`
      );
      await load();
    } catch (requestError) {
      setDecisionError(requestError instanceof Error
        ? requestError.message
        : "The page could not be added to the research list.");
    } finally {
      setBulkSaving(false);
    }
  }

  async function exportFilteredCompanies() {
    if (!response?.available || response.matched < 1) return;
    setExporting(true);
    setExportMessage(null);
    setExportError(null);
    try {
      const artifact = await fetchAcquisitionOperatorExport({
        stage,
        q: query,
        state: stateCode,
        selectionBucket,
        maturity,
        privateLikelihood,
        screeningCapacityBand,
        facilityScaleBand,
        fit,
        ownerDecision,
        relationshipConfidence,
        capacityEvidence,
        sort: sortMode
      });
      downloadTextFile(artifact.filename, artifact.content, artifact.mimeType);
      setExportMessage(
        `Downloaded ${formatCount(artifact.rowCount)} company rows` +
        (artifact.truncated ? ` from ${formatCount(artifact.matched)} matches; refine the filters to export another slice.` : ".")
      );
    } catch (requestError) {
      setExportError(requestError instanceof Error
        ? requestError.message
        : "The filtered company export could not be created.");
    } finally {
      setExporting(false);
    }
  }

  async function freezeResearchCohort() {
    if (!canFreezeCohort) return;
    setFreezingCohort(true);
    setCohortError(null);
    try {
      await freezeAcquisitionResearchCohort("", crypto.randomUUID());
      await load();
    } catch (requestError) {
      setCohortError(requestError instanceof Error ? requestError.message : "The research cohort could not be frozen.");
    } finally {
      setFreezingCohort(false);
    }
  }

  return (
    <div data-acquisition-workspace="true" data-acquisition-operator-screen="true" className="py-5">
      <section aria-labelledby="acquisition-status-heading" className="border-b border-[#b3b3b3] pb-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0f8b73]">Owner workspace</p>
            <h2 id="acquisition-status-heading" className="mt-1 font-serif text-[28px] font-semibold tracking-[-0.035em]">
              Private operator screen
            </h2>
            <p className="mt-2 max-w-[800px] text-[13px] leading-5 text-[#595959]">
              Start with thousands of rough company proposals, filter for mature-looking operators, and choose the 50–100 names worth researching. Parent, ownership, beds, and value are later diligence—not prerequisites for this first screen.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-right sm:grid-cols-5">
            {[
              ["Company proposals", counts.organizationProposals],
              ["Mature-scale pool", counts.matureScaleSignals],
              ["Screening set", counts.screen500],
              ["My research list", counts.ownerSelected],
              ["Validated targets", counts.validatedFinalTargets]
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10px] font-semibold text-[#737373]">{label}</dt>
                <dd className="font-serif text-[24px] font-semibold">{formatCount(value as number | undefined)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="mt-4 border-l-2 border-[#0f8b73] pl-3 text-[11px] leading-5 text-[#595959]">
          “Mature” is a screening signal based on observable facility scale and state breadth—not verified company age, revenue, ownership, or bed count. California remains excluded.
        </p>
        <p className="mt-2 border-l-2 border-[#17324d] pl-3 text-[11px] leading-5 text-[#595959]">
          Current phase: bucket and choose. Selecting Research only saves a company to your list; it does not launch agents or promote unverified claims. Deep verification begins after you freeze a 50–100 company cohort.
        </p>
      </section>

      <section aria-label="Company selection progress" className="grid border-b border-[#b3b3b3] sm:grid-cols-2 xl:grid-cols-4">
        <div className="border-b border-[#d9d9d9] px-3 py-3 sm:border-r xl:border-b-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#737373]">Owner research cohort</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="font-serif text-[20px] font-semibold">{formatCount(counts.ownerSelected)} <span className="font-sans text-[10px] font-semibold text-[#737373]">of 50–100</span></p>
            <button type="button" disabled={!canFreezeCohort || freezingCohort} onClick={() => { void freezeResearchCohort(); }} className="h-7 border border-[#111111] px-2.5 text-[9px] font-bold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-35">{freezingCohort ? "Freezing" : "Freeze cohort"}</button>
          </div>
          <p className="mt-1 text-[9px] text-[#737373]">{latestCohort ? `${latestCohort.name} · ${formatCount(latestCohort.memberCount)} companies · frozen ${latestCohort.createdAt.slice(0, 10)}` : "No research cohort frozen yet."}</p>
          {latestCohort ? <p className="mt-1 text-[9px] leading-4 text-[#595959]">High confidence: parent {latestCohort.readiness.parentRelationshipHigh} · ownership {latestCohort.readiness.privateOwnershipHigh} · fit {latestCohort.readiness.targetFitHigh} · capacity {latestCohort.readiness.capacityHigh} · all gates {latestCohort.readiness.allEvidenceGatesHigh}</p> : null}
          {latestCohort ? <p className="mt-1 text-[9px] leading-4 text-[#595959]">Research jobs: {latestCohort.researchQueue.pending} pending · {latestCohort.researchQueue.inProgress} active · {latestCohort.researchQueue.completed} completed · {latestCohort.researchQueue.blocked} blocked</p> : null}
        </div>
        <div className="border-b border-[#d9d9d9] px-3 py-3 xl:border-b-0 xl:border-r">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#737373]">Optional suggested 100</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="font-serif text-[20px] font-semibold">{formatCount(counts.ownerResearch100Reviewed)} <span className="font-sans text-[10px] font-semibold text-[#737373]">reviewed · {formatCount(counts.ownerResearch100Remaining)} left</span></p>
            <button type="button" onClick={startSuggested100Triage} className="h-7 border border-[#0f8b73] px-2.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#0f6f5d] hover:bg-[#e8f5f1]">Review 100</button>
          </div>
        </div>
        <div className="border-b border-[#d9d9d9] px-3 py-3 sm:border-b-0 sm:border-r">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#737373]">Screen 500 review</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="font-serif text-[20px] font-semibold">{formatCount(counts.ownerScreen500Reviewed)} <span className="font-sans text-[10px] font-semibold text-[#737373]">reviewed · {formatCount(counts.ownerScreen500Remaining)} left</span></p>
            <button type="button" onClick={startScreen500Triage} className="h-7 border border-[#0f8b73] px-2.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#0f6f5d] hover:bg-[#e8f5f1]">Review 500</button>
          </div>
        </div>
        <div className="px-3 py-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#737373]">Mature universe review</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="font-serif text-[20px] font-semibold">{formatCount(counts.ownerMatureReviewed)} <span className="font-sans text-[10px] font-semibold text-[#737373]">reviewed · {formatCount(counts.ownerMatureRemaining)} left</span></p>
            <button type="button" onClick={startMatureTriage} className="h-7 border border-[#0f8b73] px-2.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#0f6f5d] hover:bg-[#e8f5f1]">Review mature</button>
          </div>
        </div>
      </section>

      {(response?.selectionIntegrity.orphaned.length || response?.selectionIntegrity.conflicts.length) ? (
        <aside className="border-b border-[#b3b3b3] border-l-2 border-l-[#a43f32] bg-[#fff8f5] px-3 py-3" aria-label="Selection identity review">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#a43f32]">Selection identity review</p>
          <p className="mt-1 text-[11px] leading-5 text-[#595959]">
            {formatCount(counts.ownerOrphanedSelections)} saved selections have no current exact identity match and {formatCount(counts.ownerSelectionConflicts)} match more than one current company. They remain preserved and are not silently reassigned.
          </p>
          <p className="mt-1 text-[10px] text-[#737373]">
            {[...(response?.selectionIntegrity.orphaned ?? []), ...(response?.selectionIntegrity.conflicts ?? [])]
              .slice(0, 5)
              .map((issue) => issue.proposedName)
              .join(" · ")}
          </p>
        </aside>
      ) : null}

      <section aria-label="Company scale buckets" className="grid border-b border-[#b3b3b3] py-4 sm:grid-cols-2 xl:grid-cols-5">
        {([
          ["mature_scale_signal", "Mature-scale pool", counts.matureScaleSignals],
          ["platform_scale_signal", "Platform scale", counts.platformScaleSignals],
          ["regional_scale_signal", "Regional scale", counts.regionalScaleSignals],
          ["established_local_signal", "Established local", counts.establishedLocalSignals],
          ["single_site_or_unresolved", "Single-site / unresolved", counts.singleSiteOrUnresolved]
        ] as const).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            aria-pressed={maturity === value}
            onClick={() => changeFilter(() => { setStage("all"); setSelectionBucket("all"); setMaturity(value); })}
            className={`border-b border-[#d9d9d9] px-3 py-3 text-left last:border-b-0 sm:border-r xl:border-b-0 ${maturity === value ? "bg-[#e8f5f1]" : "hover:bg-[#f5f4ef]"}`}
          >
            <span className="block text-[9px] font-bold uppercase tracking-[0.08em] text-[#595959]">{label}</span>
            <span className="mt-1 block font-serif text-[25px] font-semibold">{formatCount(count as number | undefined)}</span>
          </button>
        ))}
      </section>

      <section data-acquisition-capacity-lanes="true" aria-labelledby="capacity-lanes-heading" className="border-b border-[#b3b3b3] py-4">
        <div className="px-3 pb-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#0f8b73]">Consideration-pool bed proxy</p>
          <h3 id="capacity-lanes-heading" className="mt-1 font-serif text-[20px] font-semibold">Bucket {formatCount(counts.targetCandidateOrganizations)} companies by the base observable-site scenario</h3>
          <p className="mt-1 max-w-[920px] text-[10px] leading-4 text-[#737373]">Each company also carries a low–high range. These are low-confidence candidate-site proxies—not market counts, verified capacity, or whole-company bed totals—and they do not create valuations.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {([
            ["300_plus", "Base proxy ≥300", counts.considerationScreeningCapacity300Plus, `${formatCount(counts.considerationScreeningCapacityLowerBoundAtLeast300)} lower bound · ${formatCount(counts.considerationScreeningCapacityRangeReaches300)} upper range`],
            ["150_299", "Base proxy 150–299", counts.considerationScreeningCapacity150To299, "Inspect each low–high range"],
            ["75_149", "Base proxy 75–149", counts.considerationScreeningCapacity75To149, "Inspect each low–high range"],
            ["25_74", "Base proxy 25–74", counts.considerationScreeningCapacity25To74, "Inspect each low–high range"],
            ["under_25", "Base proxy under 25", counts.considerationScreeningCapacityUnder25, "Inspect each low–high range"],
            ["not_estimable", "Not estimable", counts.considerationOrganizationsWithoutScreeningCapacity, "Scale or fit needs resolution"]
          ] as const).map(([value, label, count, description]) => {
            const isActive = stage === "target_candidates" && maturity === "all" && screeningCapacityBand === value;
            return (
              <AcquisitionScreeningLaneButton
                key={value}
                label={label}
                count={count}
                description={description}
                isActive={isActive}
                onClick={() => openScreeningCapacityLane(value)}
              />
            );
          })}
        </div>
      </section>

      <section data-acquisition-mature-service-lanes="true" aria-labelledby="mature-service-lanes-heading" className="border-b border-[#b3b3b3] py-4">
        <div className="px-3 pb-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#0f8b73]">Mature-company service lanes</p>
          <h3 id="mature-service-lanes-heading" className="mt-1 font-serif text-[20px] font-semibold">Choose the kind of company before choosing the company</h3>
          <p className="mt-1 max-w-[900px] text-[10px] leading-4 text-[#737373]">Use the full mature pool or one of four non-overlapping service lanes. The four lanes partition all {formatCount(counts.matureScaleSignals)} mature-scale proposals. “Likely” means directory or cited screening evidence, not completed license or bed diligence.</p>
        </div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-5">
          {([
            ["all", "all", "All mature", counts.matureScaleSignals, "Full scale-first screening pool"],
            ["mature_target_signal", "core_signal", "Likely adult MH", counts.matureCoreTargetSignals, "Best current primary mental-health signal"],
            ["mature_target_signal", "adjacent_signal", "Adjacent / SUD", counts.matureAdjacentTargetSignals, "High-acuity but not primary adult MH"],
            ["mature_needs_fit_review", "all", "Fit to resolve", counts.matureNeedsFitReview, "Mature and plausibly private; service fit open"],
            ["market_context", "all", "Market context", counts.matureMarketContext, "No current target signal or ownership excluded"]
          ] as const).map(([bucketValue, fitValue, label, count, description]) => {
            const isActive = stage === "all" && maturity === "mature_scale_signal" &&
              selectionBucket === bucketValue && fit === fitValue;
            return (
              <AcquisitionScreeningLaneButton
                key={`${bucketValue}:${fitValue}`}
                label={label}
                count={count}
                description={description}
                isActive={isActive}
                onClick={() => openMatureServiceLane(bucketValue, fitValue)}
              />
            );
          })}
        </div>
      </section>

      <details data-acquisition-deferred-readiness="true" className="border-b border-[#b3b3b3]">
        <summary className="cursor-pointer list-none px-3 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-[#17324d] hover:bg-[#f5f4ef]">
          Later diligence lenses · parent and ownership readiness
        </summary>
        <section data-acquisition-mature-readiness-lanes="true" aria-labelledby="mature-readiness-lanes-heading" className="border-t border-[#d9d9d9] py-4">
          <div className="px-3 pb-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#17324d]">Mature target readiness</p>
            <h3 id="mature-readiness-lanes-heading" className="mt-1 font-serif text-[20px] font-semibold">Evidence already available for later research</h3>
            <p className="mt-1 max-w-[900px] text-[10px] leading-4 text-[#737373]">These optional views overlap by design. Parent proof and private ownership are evidence gates; neither is inferred from facility count or a directory's for-profit field.</p>
          </div>
          <div className="grid sm:grid-cols-2 xl:grid-cols-4">
            {([
              ["all", "all", "All target-service", counts.matureTargetSignals, "39 core and 21 adjacent mature signals"],
              ["high", "all", "Evidenced parent", counts.matureTargetParentEvidenced, "Current cited operating-parent relationship"],
              ["not_high", "all", "Parent to resolve", counts.matureTargetParentToResolve, "Brand or domain cluster still needs parent proof"],
              ["all", "verified_private", "Verified private", counts.matureTargetVerifiedPrivate, "Current ownership evidence clears the private gate"]
            ] as const).map(([confidenceValue, privateValue, label, count, description]) => {
              const isActive = stage === "all" && maturity === "mature_scale_signal" &&
                selectionBucket === "mature_target_signal" && fit === "all" &&
                relationshipConfidence === confidenceValue && privateLikelihood === privateValue;
              return (
                <button
                  key={`${confidenceValue}:${privateValue}`}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => openMatureTargetReadiness(confidenceValue, privateValue)}
                  className={`border-t border-[#d9d9d9] px-3 py-3 text-left sm:border-r xl:last:border-r-0 ${isActive ? "bg-[#eef3f7]" : "hover:bg-[#f5f4ef]"}`}
                >
                  <span className="block text-[9px] font-bold uppercase tracking-[0.08em] text-[#595959]">{label}</span>
                  <span className="mt-1 block font-serif text-[25px] font-semibold">{formatCount(count as number | undefined)}</span>
                  <span className="mt-1 block text-[9px] leading-4 text-[#737373]">{description}</span>
                </button>
              );
            })}
          </div>
        </section>
      </details>

      <section className="py-5" aria-labelledby="operator-list-heading">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-[#111111] pb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#595959]">Company-level funnel</p>
            <h3 id="operator-list-heading" className="mt-1 font-serif text-[23px] font-semibold tracking-[-0.03em]">Choose companies</h3>
            <p className="mt-1 text-[10px] leading-4 text-[#737373]">Research, Hold, or Pass from the list. Open a company only when you want to inspect the evidence already attached.</p>
          </div>
          <p className="text-[11px] font-semibold text-[#737373]">
            {loading ? "Refreshing" : `${formatCount(response?.matched)} matches · page ${page + 1} of ${totalPages}`}
          </p>
        </div>

        <form onSubmit={submit} className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <label className="relative">
            <span className="sr-only">Research funnel</span>
            <select value={stage} onChange={(event) => changeFilter(() => setStage(event.target.value as AcquisitionOperatorStage))} className="h-10 w-full appearance-none border border-[#b3b3b3] bg-white px-3 pr-7 text-[12px] font-semibold">
              <option value="validated_targets">Validated targets · {formatCount(counts.validatedFinalTargets)}</option>
              <option value="research_100_queue">Suggested first-pass 100</option>
              <option value="screen_500">Screen 500</option>
              <option value="target_candidates">{formatCount(counts.targetCandidateOrganizations)} consideration candidates</option>
              <option value="all">All {formatCount(counts.organizationProposals)} proposals</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4" />
          </label>
          <label className="relative">
            <span className="sr-only">Company bucket</span>
            <select value={selectionBucket} onChange={(event) => changeFilter(() => setSelectionBucket(event.target.value as AcquisitionOperatorSelectionBucket))} className="h-10 w-full appearance-none border border-[#b3b3b3] bg-white px-3 pr-7 text-[12px] font-semibold">
              <option value="all">All screening buckets</option>
              <option value="mature_target_signal">Mature target signals</option>
              <option value="established_target_signal">Established targets</option>
              <option value="smaller_target_signal">Smaller targets</option>
              <option value="mature_needs_fit_review">Mature · fit review</option>
              <option value="market_context">Market context</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4" />
          </label>
          <label className="relative">
            <span className="sr-only">Maturity signal</span>
            <select aria-label="Maturity signal" value={maturity} onChange={(event) => changeFilter(() => setMaturity(event.target.value as AcquisitionOperatorMaturity))} className="h-10 w-full appearance-none border border-[#b3b3b3] bg-white px-3 pr-7 text-[12px] font-semibold">
              <option value="mature_scale_signal">Mature scale · {formatCount(counts.matureScaleSignals)}</option>
              <option value="platform_scale_signal">Platform scale · {formatCount(counts.platformScaleSignals)}</option>
              <option value="regional_scale_signal">Regional scale · {formatCount(counts.regionalScaleSignals)}</option>
              <option value="established_local_signal">Established local · {formatCount(counts.establishedLocalSignals)}</option>
              <option value="single_site_or_unresolved">Single-site / unresolved · {formatCount(counts.singleSiteOrUnresolved)}</option>
              <option value="all">All scale signals · {formatCount(counts.organizationProposals)}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4" />
          </label>
          <label className="relative">
            <span className="sr-only">Acquisition fit</span>
            <select value={fit} onChange={(event) => changeFilter(() => setFit(event.target.value as AcquisitionOperatorFit))} className="h-10 w-full appearance-none border border-[#b3b3b3] bg-white px-3 pr-7 text-[12px] font-semibold">
              <option value="all">Any acquisition fit</option>
              <option value="core_signal">Core mental-health signal</option>
              <option value="adjacent_signal">Adjacent high-acuity signal</option>
              <option value="context_or_unresolved">Fit unresolved / context</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4" />
          </label>
          <label className="relative">
            <span className="sr-only">Observable location range</span>
            <select aria-label="Observable location range" value={facilityScaleBand} onChange={(event) => changeFilter(() => setFacilityScaleBand(event.target.value as AcquisitionOperatorFacilityScaleBand))} className="h-10 w-full appearance-none border border-[#b3b3b3] bg-white px-3 pr-7 text-[12px] font-semibold">
              <option value="all">Any observable footprint</option>
              <option value="one_location">1 observable location</option>
              <option value="two_three_locations">2–3 observable locations</option>
              <option value="four_nine_locations">4–9 observable locations</option>
              <option value="ten_twenty_four_locations">10–24 observable locations</option>
              <option value="twenty_five_plus_locations">25+ observable locations</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4" />
          </label>
          <label className="relative">
            <span className="sr-only">Screening bed proxy</span>
            <select aria-label="Screening bed proxy" value={screeningCapacityBand} onChange={(event) => changeFilter(() => setScreeningCapacityBand(event.target.value as AcquisitionOperatorScreeningCapacityBand))} className="h-10 w-full appearance-none border border-[#b3b3b3] bg-white px-3 pr-7 text-[12px] font-semibold">
              <option value="all">Any screening bed proxy</option>
              <option value="estimable">Has a screening range</option>
              <option value="300_plus">Base proxy ≥300 beds</option>
              <option value="150_299">Base proxy 150–299 beds</option>
              <option value="75_149">Base proxy 75–149 beds</option>
              <option value="25_74">Base proxy 25–74 beds</option>
              <option value="under_25">Base proxy under 25 beds</option>
              <option value="not_estimable">Bed proxy not estimable</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4" />
          </label>
          <label className="flex h-10 items-center gap-2 border border-[#b3b3b3] px-3 focus-within:border-[#0f8b73] md:col-span-2">
            <Search className="h-4 w-4 text-[#0f8b73]" />
            <span className="sr-only">Search parent companies</span>
            <input value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="Parent, sponsor, legal entity, license, city" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" />
          </label>
          <label className="relative">
            <span className="sr-only">State</span>
            <select value={stateCode} onChange={(event) => changeFilter(() => setStateCode(event.target.value))} className="h-10 w-full appearance-none border border-[#b3b3b3] bg-white px-3 pr-7 text-[12px] font-semibold">
              <option value="">Any state</option>
              {states.filter((code) => code !== "CA").map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4" />
          </label>
          <label className="relative">
            <span className="sr-only">Private-company likelihood</span>
            <select value={privateLikelihood} onChange={(event) => changeFilter(() => setPrivateLikelihood(event.target.value as AcquisitionOperatorPrivateLikelihood))} className="h-10 w-full appearance-none border border-[#b3b3b3] bg-white px-3 pr-7 text-[12px] font-semibold">
              <option value="all">Any private signal</option>
              <option value="verified_private">Verified private</option>
              <option value="supported_private">Supported private</option>
              <option value="directory_private_signal">Directory private signal</option>
              <option value="unverified">Ownership unresolved</option>
              <option value="excluded">Excluded ownership</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4" />
          </label>
          <label className="relative">
            <span className="sr-only">Parent confidence</span>
            <select value={relationshipConfidence} onChange={(event) => changeFilter(() => setRelationshipConfidence(event.target.value as AcquisitionOperatorConfidence))} className="h-10 w-full appearance-none border border-[#b3b3b3] bg-white px-3 pr-7 text-[12px] font-semibold">
              <option value="all">Any parent proof</option>
              <option value="high">High parent proof</option>
              <option value="not_high">Needs parent proof</option>
              <option value="medium">Medium parent proof</option>
              <option value="low">Low parent proof</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4" />
          </label>
          <label className="relative">
            <span className="sr-only">Owner decision</span>
            <select aria-label="Owner decision" value={ownerDecision} onChange={(event) => changeFilter(() => setOwnerDecision(event.target.value as AcquisitionOperatorOwnerDecision))} className="h-10 w-full appearance-none border border-[#b3b3b3] bg-white px-3 pr-7 text-[12px] font-semibold">
              <option value="all">Any owner decision</option>
              <option value="selected">My research list · {formatCount(counts.ownerSelected)}</option>
              <option value="hold">Hold · {formatCount(counts.ownerHeld)}</option>
              <option value="excluded">Passed · {formatCount(counts.ownerExcluded)}</option>
              <option value="undecided">Not reviewed</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4" />
          </label>
          <label className="relative">
            <span className="sr-only">Capacity evidence</span>
            <select value={capacityEvidence} onChange={(event) => changeFilter(() => setCapacityEvidence(event.target.value as AcquisitionOperatorCapacityEvidence))} className="h-10 w-full appearance-none border border-[#b3b3b3] bg-white px-3 pr-7 text-[12px] font-semibold">
              <option value="all">Any capacity</option>
              <option value="verified_core">Verified core beds</option>
              <option value="reported">Reported beds</option>
              <option value="unverified">Capacity unresolved</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4" />
          </label>
          <button type="submit" disabled={loading} className="h-10 bg-[#111111] px-4 text-[12px] font-semibold text-white hover:bg-[#0f8b73] disabled:opacity-60">
            Search
          </button>
        </form>

        {response?.available ? (
          <section data-acquisition-shortlist-composition="true" aria-label="Current view composition" className="mt-3 border-y border-[#d9d9d9] bg-[#f5f4ef]">
            <p className="border-b border-[#d9d9d9] px-3 py-2 text-[9px] font-bold uppercase tracking-[0.12em] text-[#595959]">Current view composition · {formatCount(response.matchedBreakdown.total)} proposals</p>
            <dl className="grid sm:grid-cols-2 xl:grid-cols-5">
              <div className="border-b border-[#d9d9d9] px-3 py-3 sm:border-r xl:border-b-0">
                <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#737373]">Scale signal</dt>
                <dd className="mt-1 text-[11px]"><b>{formatCount(response.matchedBreakdown.platformScaleSignals)}</b> platform · <b>{formatCount(response.matchedBreakdown.regionalScaleSignals)}</b> regional</dd>
                <dd className="mt-1 text-[9px] text-[#737373]"><b>{formatCount(response.matchedBreakdown.establishedLocalSignals)}</b> established · <b>{formatCount(response.matchedBreakdown.singleSiteOrUnresolved)}</b> smaller/open</dd>
              </div>
              <div className="border-b border-[#d9d9d9] px-3 py-3 xl:border-b-0 xl:border-r">
                <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#737373]">Operating parent</dt>
                <dd className="mt-1 text-[11px]"><b>{formatCount(response.matchedBreakdown.evidenceBackedParents)}</b> evidenced · <b>{formatCount(response.matchedBreakdown.unresolvedParentProposals)}</b> unresolved</dd>
              </div>
              <div className="border-b border-[#d9d9d9] px-3 py-3 sm:border-r xl:border-b-0">
                <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#737373]">Service fit</dt>
                <dd className="mt-1 text-[11px]"><b>{formatCount(response.matchedBreakdown.coreFitSignals)}</b> core · <b>{formatCount(response.matchedBreakdown.adjacentFitSignals)}</b> adjacent · <b>{formatCount(response.matchedBreakdown.unresolvedFit)}</b> open</dd>
              </div>
              <div className="border-b border-[#d9d9d9] px-3 py-3 xl:border-b-0 xl:border-r">
                <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#737373]">Private ownership</dt>
                <dd className="mt-1 text-[11px]"><b>{formatCount(response.matchedBreakdown.verifiedPrivate)}</b> verified · <b>{formatCount(response.matchedBreakdown.ownershipPending)}</b> pending · <b>{formatCount(response.matchedBreakdown.excludedOwnership)}</b> excluded</dd>
              </div>
              <div className="px-3 py-3">
                <dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#737373]">Screening capacity</dt>
                <dd className="mt-1 text-[11px]"><b>{formatCount(response.matchedBreakdown.screeningCapacityAvailable)}</b> peer ranges · <b>{formatCount(response.matchedBreakdown.screeningCapacityNotEstimable)}</b> not estimable</dd>
                <dd className="mt-1 text-[9px] text-[#737373]"><b>{formatCount(response.matchedBreakdown.withVerifiedCoreBeds)}</b> verified core · <b>{formatCount(response.matchedBreakdown.withKnownCapacityValuation)}</b> valued slices</dd>
              </div>
            </dl>
          </section>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] leading-4 text-[#737373]">
              Showing {operators.length} of {formatCount(response?.matched)} · {response?.persistence === "azure_blob" ? "private Azure index" : "local private datastore"}
            </p>
            <p className="mt-0.5 text-[9px] leading-4 text-[#737373]">
              Page add selects only unreviewed, eligible rows; prior Research, Hold, and Pass decisions are preserved.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-acquisition-company-export="true"
              disabled={exporting || bulkSaving || Boolean(decisionSavingId) || loading || !response?.available || response.matched < 1}
              onClick={() => { void exportFilteredCompanies(); }}
              className="inline-flex h-8 items-center gap-1.5 border border-[#17324d] px-3 text-[10px] font-bold text-[#17324d] hover:bg-[#eef3f7] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Preparing export" : `Export ${Math.min(response?.matched ?? 0, 500)} companies`}
            </button>
            <button
              type="button"
              data-acquisition-bulk-selection="true"
              disabled={bulkSaving || exporting || loading || Boolean(decisionSavingId) || bulkSelectableCount < 1}
              onClick={() => { void addUnreviewedPageToResearchList(); }}
              className="h-8 border border-[#0f8b73] px-3 text-[10px] font-bold text-[#0f6f5d] hover:bg-[#e8f5f1] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {bulkSaving
                ? "Adding page"
                : remainingResearchSlots < 1
                  ? "Research list full"
                  : bulkSelectableCount < 1
                    ? "Page already reviewed"
                    : `Add unreviewed page · ${bulkSelectableCount}`}
            </button>
            <label className="relative min-w-[145px]">
            <span className="sr-only">Sort companies</span>
            <select aria-label="Sort companies" value={sortMode} onChange={(event) => changeFilter(() => setSortMode(event.target.value as AcquisitionOperatorSort))} className="h-8 w-full appearance-none border border-[#d9d9d9] bg-white px-2 pr-7 text-[10px] font-semibold">
              <option value="rank">Funnel rank</option>
              <option value="maturity">Maturity signal</option>
              <option value="score">Screening score</option>
              <option value="screening_capacity">Base screening-bed proxy</option>
              <option value="beds">Known core beds</option>
              <option value="value">Known-slice value</option>
              <option value="company">Company name</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2 h-3.5 w-3.5" />
            </label>
          </div>
        </div>

        {error ? <p role="alert" className="mt-3 text-[12px] font-semibold text-[#a43f32]">{error}</p> : null}
        {decisionError ? <p role="alert" className="mt-3 text-[12px] font-semibold text-[#a43f32]">{decisionError}</p> : null}
        {exportError ? <p role="alert" className="mt-3 text-[12px] font-semibold text-[#a43f32]">{exportError}</p> : null}
        {exportMessage ? <p role="status" className="mt-3 border-l-2 border-[#17324d] pl-3 text-[11px] font-semibold leading-5 text-[#17324d]">{exportMessage}</p> : null}
        {bulkMessage ? <p role="status" className="mt-3 border-l-2 border-[#0f8b73] pl-3 text-[11px] font-semibold leading-5 text-[#0f6f5d]">{bulkMessage}</p> : null}
        {cohortError ? <p role="alert" className="mt-3 text-[12px] font-semibold text-[#a43f32]">{cohortError}</p> : null}
        {!error && response && !response.available ? <p className="mt-4 text-[12px] text-[#737373]">The persistent operator index has not been published yet.</p> : null}

        <div className="mt-3 border-t border-[#b3b3b3] md:hidden">
          {operators.map((record) => (
            <article key={record.id} className={`border-b border-[#d9d9d9] px-2 py-4 ${selected?.id === record.id ? "bg-[#e8f5f1]" : "bg-white"}`}>
              <button type="button" onClick={() => setSelectedId(record.id)} className="block w-full text-left">
                <span className="flex items-start justify-between gap-3"><span className="font-serif text-[16px] font-semibold">{record.proposedName}</span><span className="text-[10px] font-bold text-[#0f8b73]">{record.validatedTargetRank ? `V#${record.validatedTargetRank}` : `#${formatCount(record.targetRank)}`}</span></span>
                <span className="mt-1 block text-[10px] text-[#595959]">{record.candidateStateCodes.join(" · ") || "State unresolved"} · {formatCount(record.facilityCounts.candidates)} candidate facilities</span>
                <span className="mt-1 block text-[9px] font-semibold text-[#737373]">{screeningIdentityLabel(record)}</span>
                <span className="mt-3 grid grid-cols-3 gap-3 text-[9px]"><span>Maturity<br /><b>{display(record.screeningProfile.maturityTier)}</b></span><span>Bed proxy<br /><b>{formatBedRange(record).range}</b><small className="block font-normal text-[#737373]">{formatBedRange(record).detail}</small></span><span>Parent proof<br /><b>{display(record.resolution.confidence)}</b></span></span>
              </button>
              <QuickDecisionControls record={record} saving={decisionSavingId === record.id} onDecision={saveQuickDecision} className="mt-3" />
            </article>
          ))}
        </div>

        <div className="mt-3 hidden overflow-x-auto border-y border-[#b3b3b3] md:block">
          <table className="w-full min-w-[1320px] border-collapse text-[11px]">
            <thead className="bg-[#17324d] text-white">
              <tr><th className="px-3 py-2.5 text-right">Rank</th><th className="px-3 py-2.5 text-left">Company proposal</th><th className="px-3 py-2.5 text-left">Screening bucket</th><th className="px-3 py-2.5 text-left">States / facilities</th><th className="px-3 py-2.5 text-right">Maturity</th><th className="px-3 py-2.5 text-right">Observed-site range</th><th className="px-3 py-2.5 text-right">Core beds</th><th className="px-3 py-2.5 text-right">Known-slice EV</th><th className="px-3 py-2.5 text-right">Parent proof</th><th className="px-3 py-2.5 text-left">Decision</th></tr>
            </thead>
            <tbody>
              {operators.map((record) => (
                <tr key={record.id} className={`border-b border-[#d9d9d9] ${selected?.id === record.id ? "bg-[#e8f5f1]" : "hover:bg-[#f5f4ef]"}`}>
                  <td className="px-3 py-3 text-right align-top font-semibold">{record.validatedTargetRank ? <><span className="text-[#0f6f5d]">V#{record.validatedTargetRank}</span><span className="mt-1 block text-[9px] font-normal text-[#737373]">screen #{record.targetRank}</span></> : record.targetRank ? `#${record.targetRank}` : "—"}</td>
                  <td className="px-3 py-3 align-top"><button type="button" onClick={() => setSelectedId(record.id)} className="text-left font-serif text-[15px] font-semibold leading-5 hover:text-[#0f8b73]">{record.proposedName}</button><p className="mt-1 text-[9px] font-bold uppercase tracking-[0.08em] text-[#737373]">{screeningIdentityLabel(record)}</p><p className="mt-0.5 text-[9px] text-[#737373]">{display(record.scope.targetClassification)}</p></td>
                  <td className="max-w-[180px] px-3 py-3 align-top font-semibold text-[#595959]">{display(record.screeningProfile.selectionBucket)}<p className="mt-1 text-[9px] font-normal">{display(record.screeningProfile.privateLikelihood)}</p></td>
                  <td className="max-w-[220px] px-3 py-3 align-top text-[#595959]">{record.candidateStateCodes.join(" · ") || "—"}<p className="mt-1 text-[9px]">{formatCount(record.facilityCounts.candidates)} candidate · {formatCount(record.facilityCounts.total)} total</p></td>
                  <td className="px-3 py-3 text-right align-top font-semibold">{record.screeningProfile.maturityScore}<p className="mt-1 text-[9px] font-normal text-[#737373]">{display(record.screeningProfile.maturityTier)}</p></td>
                  <td className="px-3 py-3 text-right align-top font-semibold">{formatBedRange(record).range}<p className="mt-1 text-[9px] font-normal text-[#737373]">{formatBedRange(record).detail}</p></td>
                  <td className="px-3 py-3 text-right align-top font-semibold">{formatCount(record.licenseEvidence.bedTotals.verifiedCoreTarget)}</td>
                  <td className="px-3 py-3 text-right align-top"><p className="font-semibold">{formatMillions(record.valuationEvidence?.valuation.outputs.base.enterpriseValueMillions)}</p>{record.valuationEvidence ? <p className="mt-1 text-[9px] text-[#737373]">partial capacity</p> : null}</td>
                  <td className={`px-3 py-3 text-right align-top font-semibold capitalize ${confidenceTone(record.resolution.confidence)}`}>{display(record.resolution.confidence)}</td>
                  <td className="px-3 py-2 align-top"><QuickDecisionControls record={record} saving={decisionSavingId === record.id} onDecision={saveQuickDecision} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!operators.length && !loading && !error ? <p className="border-b border-[#d9d9d9] py-6 text-[12px] text-[#737373]">No parent companies match these filters.</p> : null}
        <div className="mt-3 flex items-center justify-end gap-2">
          <button type="button" disabled={page === 0 || loading} onClick={() => { setBulkMessage(null); setExportMessage(null); setPage((value) => Math.max(0, value - 1)); }} className="inline-flex h-8 items-center gap-1 border border-[#b3b3b3] px-2.5 text-[10px] font-semibold disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /> Previous</button>
          <button type="button" disabled={page + 1 >= totalPages || loading} onClick={() => { setBulkMessage(null); setExportMessage(null); setPage((value) => value + 1); }} className="inline-flex h-8 items-center gap-1 border border-[#b3b3b3] px-2.5 text-[10px] font-semibold disabled:opacity-40">Next <ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </section>

      {selected ? <OperatorEvidenceDetail record={selected} formulas={overview.formulas} onClose={() => setSelectedId(null)} onDecisionSaved={() => load()} /> : null}
    </div>
  );
}

function QuickDecisionControls({
  record,
  saving,
  onDecision,
  className = ""
}: {
  record: AcquisitionOperatorResult;
  saving: boolean;
  onDecision: (record: AcquisitionOperatorResult, status: "selected" | "hold" | "excluded") => Promise<void>;
  className?: string;
}) {
  return (
    <div data-acquisition-quick-decision="true" role="group" aria-label={`Screen ${record.proposedName}`} className={`flex flex-wrap gap-1 ${className}`}>
      {([
        ["selected", "Research"],
        ["hold", "Hold"],
        ["excluded", "Pass"]
      ] as const).map(([status, label]) => (
        <button
          key={status}
          type="button"
          aria-pressed={record.screeningDecision?.status === status}
          disabled={saving}
          onClick={() => { void onDecision(record, status); }}
          className={`h-7 border px-2 text-[9px] font-semibold disabled:opacity-50 ${record.screeningDecision?.status === status ? "border-[#0f8b73] bg-[#0f8b73] text-white" : "border-[#b3b3b3] bg-white hover:border-[#0f8b73]"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function OperatorEvidenceDetail({
  record,
  formulas,
  onClose,
  onDecisionSaved
}: {
  record: AcquisitionOperatorResult;
  formulas: AcquisitionOverview["formulas"];
  onClose: () => void;
  onDecisionSaved: () => Promise<void>;
}) {
  const parent = record.parentIdentity;
  const valuation = record.valuationEvidence;
  const sources = sourceRows(record);
  const [savingDecision, setSavingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const confidenceRows = [
    ["Parent", parent?.confidence.relationship ?? record.resolution.confidence],
    ["Legal entity", parent?.confidence.legalIdentity],
    ["Private ownership", parent?.confidence.ownership],
    ["Target fit", parent?.confidence.targetFit],
    ["Portfolio capacity", parent?.confidence.capacity],
    ["Operating valuation", parent?.confidence.valuation]
  ];

  async function saveDecision(status: "selected" | "hold" | "excluded" | "undecided") {
    setSavingDecision(true);
    setDecisionError(null);
    try {
      await setAcquisitionOperatorDecision(record.id, status, record.screeningDecision?.notes ?? "");
      await onDecisionSaved();
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "The company screening decision could not be saved.");
    } finally {
      setSavingDecision(false);
    }
  }

  return (
    <section className="border-t-2 border-[#111111] pt-5" aria-labelledby="operator-evidence-heading">
      <div data-acquisition-selection-controls="true" className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#d9d9d9] pb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">Company detail</p>
          <p className="mt-1 text-[11px] text-[#737373]">Evidence is shown for context; deep verification waits for the frozen 50–100 company cohort.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ["selected", "Research"],
            ["hold", "Hold"],
            ["excluded", "Pass"]
          ] as const).map(([status, label]) => (
            <button
              key={status}
              type="button"
              disabled={savingDecision}
              onClick={() => saveDecision(status)}
              className={`h-9 border px-4 text-[11px] font-semibold disabled:opacity-50 ${record.screeningDecision?.status === status ? "border-[#0f8b73] bg-[#0f8b73] text-white" : "border-[#b3b3b3] bg-white hover:border-[#0f8b73]"}`}
            >
              {label}
            </button>
          ))}
          {record.screeningDecision ? <button type="button" disabled={savingDecision} onClick={() => saveDecision("undecided")} className="h-9 px-2 text-[10px] font-semibold text-[#737373] hover:text-[#111111] disabled:opacity-50">Clear</button> : null}
          <button type="button" onClick={onClose} className="h-9 border border-[#b3b3b3] px-3 text-[10px] font-semibold text-[#595959] hover:border-[#111111] hover:text-[#111111]">Close detail</button>
        </div>
        {decisionError ? <p role="alert" className="w-full text-[11px] font-semibold text-[#a43f32]">{decisionError}</p> : null}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0f8b73]">Company screening record</p>
          <h3 id="operator-evidence-heading" className="mt-1 font-serif text-[27px] font-semibold">{record.proposedName}</h3>
          <p className="mt-2 text-[12px] leading-5 text-[#595959]">{parent?.notes || "This company remains a directory-derived proposal until authoritative parent evidence is attached."}</p>
          <dl className="mt-4 grid border-y border-[#d9d9d9] sm:grid-cols-4">
            <div className="border-b border-[#d9d9d9] px-3 py-3 sm:border-b-0 sm:border-r"><dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#737373]">Canonical legal name</dt><dd className="mt-1 text-[12px] font-semibold">{parent?.canonicalLegalName ?? "Unresolved"}</dd></div>
            <div className="border-b border-[#d9d9d9] px-3 py-3 sm:border-b-0 sm:border-r"><dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#737373]">Sponsor / owner</dt><dd className="mt-1 text-[12px] font-semibold">{parent?.sponsorName ?? display(parent?.ownershipType)}</dd></div>
            <div className="border-b border-[#d9d9d9] px-3 py-3 sm:border-b-0 sm:border-r"><dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#737373]">Maturity signal</dt><dd className="mt-1 text-[12px] font-semibold">{display(record.screeningProfile.maturityTier)} · {record.screeningProfile.maturityScore}</dd></div>
            <div className="px-3 py-3"><dt className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#737373]">Funnel position</dt><dd className="mt-1 text-[12px] font-semibold">{record.validatedTargetRank ? `Validated #${record.validatedTargetRank} · screen #${record.targetRank}` : record.targetRank ? `#${record.targetRank} · ${display(record.funnelStage)}` : display(record.screeningProfile.selectionBucket)}</dd></div>
          </dl>

          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">Confidence gates</p>
              <div className="mt-2 border-t border-[#d9d9d9]">
                {confidenceRows.map(([label, value]) => <div key={label} className="flex items-center justify-between border-b border-[#d9d9d9] py-2 text-[11px]"><span>{label}</span><span className={`font-bold capitalize ${confidenceTone(value)}`}>{display(value)}</span></div>)}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">Research list</p>
              <ul className="mt-2 border-t border-[#d9d9d9] text-[11px] leading-5">
                {(record.research.gaps.length ? record.research.gaps : ["no_open_gate_recorded"]).map((gap) => <li key={gap} className="border-b border-[#d9d9d9] py-2">• {display(gap)}</li>)}
              </ul>
            </div>
          </div>

          <div data-acquisition-fast-screen="true" className="mt-5 grid gap-5 border-t border-[#b3b3b3] pt-4 xl:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#0f6f5d]">Why shortlisted</p>
              <ul className="mt-2 text-[11px] leading-5 text-[#595959]">
                {fastScreenStrengths(record).map((reason) => <li key={reason}>• {reason}</li>)}
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#a43f32]">Needs proof before deep research</p>
              <ul className="mt-2 text-[11px] leading-5 text-[#595959]">
                {fastScreenRisks(record).map((risk) => <li key={risk}>• {risk}</li>)}
              </ul>
            </div>
          </div>
        </div>

        <div className="border-l-2 border-[#0f8b73] pl-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">Screening capacity proxy</p>
          <dl className="mt-2 grid grid-cols-3 border-y border-[#d9d9d9]">
            {[
              ["Low", record.screeningCapacity.range.low],
              ["Base", record.screeningCapacity.range.base],
              ["High", record.screeningCapacity.range.high]
            ].map(([label, value], index) => <div key={label} className={`px-3 py-3 ${index < 2 ? "border-r border-[#d9d9d9]" : ""}`}><dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#737373]">{label}</dt><dd className="mt-1 font-serif text-[21px] font-semibold">{formatCount(value as number | undefined | null)}</dd></div>)}
          </dl>
          <p className="mt-2 text-[10px] leading-4 text-[#737373]">{formatCount(record.screeningCapacity.candidateSites.total)} observable candidate sites · {display(record.screeningCapacity.bucket)} · low-confidence screening range, not a verified or whole-company bed count.</p>
          <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">Verified capacity evidence</p>
          <dl className="mt-2 grid grid-cols-2 border-y border-[#d9d9d9]">
            {[
              ["Current core licenses", record.licenseEvidence.bedTotals.verifiedCoreTarget],
              ["Adjacent licensed beds", record.licenseEvidence.bedTotals.verifiedAdjacentHighAcuitySud],
              ["Operator-reported beds", record.licenseEvidence.bedTotals.reportedByOperator],
              ["Beds in value slice", valuation?.capacity.valuedBeds]
            ].map(([label, value], index) => <div key={label} className={`px-3 py-3 ${index < 2 ? "border-b border-[#d9d9d9]" : ""} ${index % 2 === 0 ? "border-r border-[#d9d9d9]" : ""}`}><dt className="text-[9px] font-bold uppercase tracking-[0.08em] text-[#737373]">{label}</dt><dd className="mt-1 font-serif text-[21px] font-semibold">{formatCount(value as number | undefined | null)}</dd></div>)}
          </dl>
          <p className="mt-3 text-[10px] leading-4 text-[#737373]">{display(record.licenseEvidence.portfolioCoverage)} · last verified {record.licenseEvidence.lastVerifiedAt ?? "not yet"}</p>
        </div>
      </div>

      {valuation ? (
        <div className="mt-6 border-t border-[#b3b3b3] pt-4">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#0f8b73]">Workbook-formula estimate</p><h4 className="mt-1 font-serif text-[22px] font-semibold">Known-capacity slice only</h4></div><p className="text-[10px] font-semibold text-[#a43f32]">Not a whole-company valuation</p></div>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[700px] border-y border-[#d9d9d9] text-[11px]"><thead><tr className="bg-[#f5f4ef]"><th className="px-3 py-2 text-left">Case</th><th className="px-3 py-2 text-right">Beds</th><th className="px-3 py-2 text-right">Occupancy</th><th className="px-3 py-2 text-right">Net rev / day</th><th className="px-3 py-2 text-right">Revenue</th><th className="px-3 py-2 text-right">EBITDA</th><th className="px-3 py-2 text-right">EV</th></tr></thead><tbody>{(["low", "base", "high"] as const).map((caseName) => { const row = valuation.valuation.outputs[caseName]; return <tr key={caseName} className="border-t border-[#d9d9d9]"><td className="px-3 py-2 font-semibold capitalize">{caseName}</td><td className="px-3 py-2 text-right">{formatCount(row.beds)}</td><td className="px-3 py-2 text-right">{Math.round(row.occupancy * 100)}%</td><td className="px-3 py-2 text-right">${formatCount(row.netRevenuePerOccupiedBedDay)}</td><td className="px-3 py-2 text-right">{formatMillions(row.revenueMillions)}</td><td className="px-3 py-2 text-right">{formatMillions(row.ebitdaMillions)}</td><td className="px-3 py-2 text-right font-semibold">{formatMillions(row.enterpriseValueMillions)}</td></tr>; })}</tbody></table></div>
          <p className="mt-3 text-[10px] leading-4 text-[#737373]">{valuation.valuation.segment.label} · {formulas.revenue}; {formulas.ebitda}; {formulas.enterpriseValue}.</p>
          <ul className="mt-2 text-[10px] leading-4 text-[#737373]">{valuation.limitations.map((limitation) => <li key={limitation}>• {limitation}</li>)}</ul>
        </div>
      ) : (
        <p className="mt-6 border-t border-[#d9d9d9] pt-4 text-[11px] text-[#737373]">No value is shown until a configured model segment has current core-bed evidence. Unverified or adjacent capacity is not converted into enterprise value.</p>
      )}

      {parent?.contradictions.length ? <div className="mt-5 border-l-2 border-[#a43f32] pl-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#a43f32]">Open contradiction</p>{parent.contradictions.map((item) => <p key={item.id} className="mt-1 text-[11px] leading-5 text-[#595959]">{item.description}</p>)}</div> : null}

      {sources.length ? <div className="mt-6 border-t border-[#b3b3b3] pt-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">Evidence sources</p><div className="mt-2 grid gap-x-6 lg:grid-cols-2">{sources.map((source) => <a key={`${source.id}:${source.title}`} href={source.url} target="_blank" rel="noreferrer" className="flex items-start justify-between gap-3 border-t border-[#d9d9d9] py-2 text-[11px] hover:text-[#0f6f5d]"><span><b>{source.evidenceType}</b> · {source.title}<small className="mt-0.5 block text-[9px] text-[#737373]">{display(source.sourceType)} · {source.asOf}</small></span><ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" /></a>)}</div></div> : null}
    </section>
  );
}
