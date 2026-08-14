import { ArrowLeft, ArrowRight, ExternalLink, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  getEffectivenessEvidencePlan,
  type EffectivenessAudienceId
} from "../../../../shared/effectiveness-evidence.mjs";
import {
  buyerOpportunityStatusLabel,
  getStateBuyerResearch,
  type BuyerOpportunityStatus,
  type BuyerTarget
} from "../data/stateBuyerResearchData";
import {
  formatStateResearchDate,
  getStateResearchDossier,
  type ResearchConfidence
} from "../data/stateResearchData";
import { OPPORTUNITY_PATHS, type StateTargetingRecord } from "../data/stateTargetingData";

interface StateDetailModalProps {
  record: StateTargetingRecord;
  audienceId?: EffectivenessAudienceId;
  onDismiss: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

function confidenceLabel(confidence: ResearchConfidence) {
  if (confidence === "not_published") return "not published";
  return confidence;
}

function statusClassName(status: BuyerOpportunityStatus) {
  if (status === "active") return "bg-[#e8f5f1] text-[#076552]";
  if (status === "scheduled_status_to_verify") return "bg-[#fff7e8] text-[#83520a]";
  return "bg-[#f2f2f2] text-[#595959]";
}

function sourceLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Official source";
  }
}

function BuyerTargetDisclosure({
  target,
  initiallyOpen
}: {
  target: BuyerTarget;
  initiallyOpen: boolean;
}) {
  const leadOpportunity = target.opportunities[0] ?? {
    name: "No public residential solicitation located",
    status: "not_publicly_located" as const,
    facts: []
  };

  return (
    <details open={initiallyOpen} className="group border-t border-[#b3b3b3]">
      <summary className="grid cursor-pointer list-none gap-2 py-4 marker:content-none sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <span className="min-w-0">
          <span className="font-serif text-[20px] font-semibold leading-tight tracking-[-0.02em]">
            {target.region}
          </span>
          <span className="mt-1 block text-[12px] leading-5 text-[#595959]">
            {target.buyers.join(" · ")} · {target.population}
          </span>
        </span>
        <span className="flex items-center gap-2 sm:justify-end">
          <span className={`px-2 py-1 text-[10px] font-semibold ${statusClassName(leadOpportunity.status)}`}>
            {buyerOpportunityStatusLabel(leadOpportunity.status)}
          </span>
          <span
            className="text-[18px] text-[#595959] transition-transform group-open:rotate-45"
            aria-hidden="true"
          >
            +
          </span>
        </span>
      </summary>

      <div className="border-t border-[#e1e1e1] pb-5 pt-4 text-[13px] leading-5 text-[#444444]">
        <p className="max-w-[760px] text-[#222222]">{target.pitch}</p>

        <div className="mt-4 grid gap-x-7 gap-y-4 sm:grid-cols-2">
          <div>
            {target.demand.length ? (
              <div>
                <h4 className="text-[13px] font-semibold text-[#111111]">Why this target</h4>
                <ul className="mt-2 list-disc space-y-1.5 pl-4">
                  {target.demand.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {target.leaders.length ? (
              <p className="mt-4">
                <strong className="font-semibold text-[#111111]">Named leadership:</strong>{" "}
                {target.leaders.map((leader) => `${leader.name}, ${leader.title}`).join(" · ")}
              </p>
            ) : null}
          </div>

          <div>
            <h4 className="text-[13px] font-semibold text-[#111111]">Public opportunity record</h4>
            <div className="mt-2 space-y-3">
              {target.opportunities.map((opportunity) => (
                <div key={`${opportunity.name}-${opportunity.status}`}>
                  <p className="font-semibold text-[#222222]">{opportunity.name}</p>
                  <p className="text-[12px] text-[#595959]">
                    {buyerOpportunityStatusLabel(opportunity.status)}
                    {opportunity.identifier ? ` · ${opportunity.identifier}` : ""}
                    {opportunity.timing ? ` · ${opportunity.timing}` : ""}
                  </p>
                  {opportunity.facts.length ? (
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-[12px] text-[#595959]">
                      {opportunity.facts.map((fact) => (
                        <li key={fact}>{fact}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        {target.economics.length ? (
          <p className="mt-4 text-[12px] text-[#595959]">
            <strong className="font-semibold text-[#333333]">Published economics:</strong>{" "}
            {target.economics.join(" · ")}
          </p>
        ) : null}
        {target.barriers.length ? (
          <p className="mt-2 text-[12px] text-[#595959]">
            <strong className="font-semibold text-[#333333]">Execution checks:</strong>{" "}
            {target.barriers.join(" · ")}
          </p>
        ) : null}
      </div>
    </details>
  );
}

export default function StateDetailModal({
  record,
  audienceId,
  onDismiss,
  onNext,
  onPrevious
}: StateDetailModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onDismiss();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), summary, [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onDismiss]);

  const effectivenessPlan = getEffectivenessEvidencePlan(
    audienceId ?? record.recommendedAudience
  );
  const research = getStateResearchDossier(record);
  const buyerResearch = getStateBuyerResearch(record.stateName);
  const hasVerifiedDemand = research.coverage === "verified-demand";
  const benchmarkGap = Math.abs(research.bedSupply.gapToBenchmark).toFixed(1);
  const benchmarkDirection = research.bedSupply.gapToBenchmark >= 0 ? "above" : "below";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="state-targeting-dialog-title"
        data-state-research-coverage={research.coverage}
        className="max-h-[94vh] w-full overflow-y-auto rounded-t-lg border border-[#111111] border-t-4 border-t-[#0f8b73] bg-white text-[#111111] shadow-[0_28px_90px_rgba(0,0,0,0.28)] sm:max-w-[1060px] sm:rounded-lg"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-5 border-b border-[#d9d9d9] bg-white px-5 py-4 sm:px-8">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-[#0f8b73]">
              {record.stateCode} · {hasVerifiedDemand ? `Research priority #${research.demandRank}` : "National baseline"}
            </p>
            <h2
              id="state-targeting-dialog-title"
              className="mt-1 font-serif text-[31px] font-semibold leading-none tracking-[-0.035em] sm:text-[37px]"
            >
              {record.stateName}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onDismiss}
            aria-label={`Close ${record.stateName} profile`}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#b3b3b3] bg-white text-[#333333] transition-colors hover:border-[#111111] hover:text-[#111111]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_270px]">
          <main className="px-5 py-6 sm:px-8 lg:border-r lg:border-[#d9d9d9]">
            <section aria-labelledby="state-market-summary-heading">
              <h3 id="state-market-summary-heading" className="sr-only">Market summary</h3>
              <p className="max-w-[760px] font-serif text-[19px] leading-[1.48] tracking-[-0.01em] sm:text-[21px]">
                {research.demandRationale ?? `${record.stateName} has a nationally comparable state-hospital bed baseline and a mapped buyer route. A full demand research pass is still needed before treating it as a priority market.`}
              </p>
              <p className="mt-3 max-w-[760px] text-[14px] leading-6 text-[#444444]">
                Start with {record.primaryTarget}. {record.decisionConcentration}.
              </p>

              <dl className="mt-5 grid border-y border-[#b3b3b3] sm:grid-cols-3">
                <div className="py-3.5 sm:border-r sm:border-[#d9d9d9] sm:pr-5">
                  <dt className="text-[11px] font-semibold text-[#595959]">State beds per 100k</dt>
                  <dd className="mt-1 font-serif text-[27px] font-semibold leading-none">
                    {research.bedSupply.rate.toFixed(1)}
                  </dd>
                  <p className="mt-1 text-[11px] text-[#737373]">
                    {benchmarkGap} {benchmarkDirection} the {research.bedSupply.benchmark.toFixed(0)}-bed benchmark
                  </p>
                </div>
                <div className="border-t border-[#d9d9d9] py-3.5 sm:border-r sm:border-t-0 sm:px-5">
                  <dt className="text-[11px] font-semibold text-[#595959]">Demand research</dt>
                  <dd className="mt-1 font-serif text-[27px] font-semibold leading-none">
                    {research.demandRank ? `#${research.demandRank}` : "Baseline"}
                  </dd>
                  <p className="mt-1 text-[11px] text-[#737373]">
                    {hasVerifiedDemand ? "of 15 researched priority states" : "no composite demand rank"}
                  </p>
                </div>
                <div className="border-t border-[#d9d9d9] py-3.5 sm:border-t-0 sm:pl-5">
                  <dt className="text-[11px] font-semibold text-[#595959]">Buyer targets</dt>
                  <dd className="mt-1 font-serif text-[27px] font-semibold leading-none">
                    {buyerResearch?.targets.length ?? "Not mapped"}
                  </dd>
                  <p className="mt-1 text-[11px] text-[#737373]">
                    {buyerResearch ? "county or regional dossiers" : "state route only"}
                  </p>
                </div>
              </dl>
              <p className="mt-2 text-[11px] leading-5 text-[#737373]">
                State-bed supply ranks {research.bedSupply.supplyRank} of {research.bedSupply.comparisonUniverse}, where rank 1 has the highest supply. {research.bedSupply.definition}
              </p>
            </section>

            <section className="mt-7" aria-labelledby="state-evidence-heading">
              <h3 id="state-evidence-heading" className="font-serif text-[23px] font-semibold tracking-[-0.025em]">
                Why it matters
              </h3>
              {hasVerifiedDemand ? (
                <div className="mt-3">
                  {research.evidence.map((item) => (
                    <article key={item.id} className="border-t border-[#d9d9d9] py-3.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h4 className="text-[13px] font-semibold">{item.label}</h4>
                        <span className="text-[11px] text-[#737373]">
                          {confidenceLabel(item.confidence)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[13px] leading-5 text-[#444444]">{item.text}</p>
                      {item.source ? (
                        <a
                          href={item.source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#0f8b73] hover:underline"
                        >
                          {item.source.id} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-3 border-l-[3px] border-[#0f8b73] pl-3 text-[13px] leading-5 text-[#595959]">
                  This state still needs source-by-source research on legal pathways, current hospital pressure, placement bottlenecks, and step-down capacity. The bed baseline alone does not establish market priority.
                </p>
              )}
            </section>

            {buyerResearch ? (
              <section className="mt-7" aria-labelledby="buyer-targets-heading">
                <h3 id="buyer-targets-heading" className="font-serif text-[23px] font-semibold tracking-[-0.025em]">
                  Buyer targets
                </h3>
                <p className="mt-2 text-[13px] leading-5 text-[#595959]">
                  Verified through {formatStateResearchDate(buyerResearch.asOf)}. Active, planned, closed, and unlocated opportunities are kept separate.
                </p>
                {buyerResearch.stateDemand.length ? (
                  <p className="mt-3 text-[13px] leading-5 text-[#333333]">
                    {buyerResearch.stateDemand.join(" ")}
                  </p>
                ) : null}
                <div className="mt-4 border-b border-[#b3b3b3]">
                  {buyerResearch.targets.map((target, index) => (
                    <BuyerTargetDisclosure
                      key={target.region}
                      target={target}
                      initiallyOpen={index === 0}
                    />
                  ))}
                </div>
                {buyerResearch.stateEconomics ? (
                  <p className="mt-3 text-[12px] leading-5 text-[#595959]">
                    {buyerResearch.stateEconomics}
                  </p>
                ) : null}
              </section>
            ) : null}

            <section className="mt-7" aria-labelledby="market-entry-heading">
              <h3 id="market-entry-heading" className="font-serif text-[23px] font-semibold tracking-[-0.025em]">
                How to enter
              </h3>
              <p className="mt-3 text-[14px] leading-6 text-[#333333]">{record.researchPitch}.</p>
              <div className="mt-3 space-y-2 text-[13px] leading-5 text-[#595959]">
                {record.opportunityPaths.map((pathCode) => {
                  const path = OPPORTUNITY_PATHS[pathCode];
                  return (
                    <p key={pathCode}>
                      <strong className="font-semibold text-[#222222]">{path.label}:</strong>{" "}
                      {path.description} {path.reportFamilies}
                    </p>
                  );
                })}
              </div>
            </section>

            <section className="mt-7" aria-labelledby="effectiveness-case-heading">
              <h3 id="effectiveness-case-heading" className="font-serif text-[23px] font-semibold tracking-[-0.025em]">
                What the buyer will need
              </h3>
              <p className="mt-2 text-[13px] leading-5 text-[#595959]">
                For {effectivenessPlan.audience.label.toLowerCase()}, the decision is about {effectivenessPlan.audience.decision.toLowerCase()}.
              </p>
              <ul className="mt-3 grid gap-x-6 sm:grid-cols-2">
                {effectivenessPlan.evidence.map((item) => (
                  <li key={item.id} className="border-t border-[#d9d9d9] py-3 text-[13px] leading-5 text-[#595959]">
                    <strong className="block font-semibold text-[#222222]">{item.label}</strong>
                    {item.claim}
                  </li>
                ))}
              </ul>
            </section>
          </main>

          <aside className="bg-[#f5f4ef] px-5 py-6 sm:px-6">
            {buyerResearch ? (
              <section aria-labelledby="first-move-heading">
                <h3 id="first-move-heading" className="font-serif text-[20px] font-semibold">First move</h3>
                <p className="mt-2 text-[13px] font-semibold leading-5">
                  {buyerResearch.firstOutreach.organization}
                </p>
                <p className="mt-2 text-[12px] leading-5 text-[#595959]">
                  {buyerResearch.firstOutreach.entry_point}
                </p>
                <p className="mt-3 text-[12px] leading-5 text-[#333333]">
                  Lead with {buyerResearch.firstOutreach.lead_problem.toLowerCase()}. Offer {buyerResearch.firstOutreach.offer.toLowerCase()}.
                </p>
              </section>
            ) : (
              <section aria-labelledby="people-to-reach-heading">
                <h3 id="people-to-reach-heading" className="font-serif text-[20px] font-semibold">People to reach</h3>
                <ol className="mt-2 list-decimal space-y-2 pl-4 text-[12px] leading-5 text-[#444444]">
                  {record.targetTitles.map((title) => (
                    <li key={title}>{title}</li>
                  ))}
                </ol>
              </section>
            )}

            <section className="mt-6 border-t border-[#b3b3b3] pt-5" aria-labelledby="sources-heading">
              <h3 id="sources-heading" className="font-serif text-[20px] font-semibold">Sources</h3>
              <a
                href={research.bedSupply.source.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex items-start justify-between gap-2 text-[11px] font-semibold leading-4 text-[#0f8b73] hover:underline"
              >
                National state-bed baseline <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
              </a>
              {research.sources.map((source) => (
                <a
                  key={source.id}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 flex items-start justify-between gap-2 text-[11px] font-semibold leading-4 text-[#0f8b73] hover:underline"
                >
                  {source.id} <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                </a>
              ))}
              {buyerResearch?.sources.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 flex items-start justify-between gap-2 text-[11px] font-semibold leading-4 text-[#0f8b73] hover:underline"
                >
                  {sourceLabel(url)} <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                </a>
              ))}
            </section>

            <section className="mt-6 border-t border-[#b3b3b3] pt-5" aria-labelledby="research-note-heading">
              <h3 id="research-note-heading" className="font-serif text-[20px] font-semibold">Research note</h3>
              <p className="mt-2 text-[12px] leading-5 text-[#595959]">
                Updated {formatStateResearchDate(research.asOf)}. {research.researchBoundary}
              </p>
              <p className="mt-3 text-[12px] leading-5 text-[#595959]">
                Market research establishes need and a route to the buyer. It does not establish reimbursement, comparative cost, procurement timing, or clinical causation.
              </p>
            </section>
          </aside>
        </div>

        <footer className="sticky bottom-0 flex items-center justify-between border-t border-[#d9d9d9] bg-white px-5 py-3.5 sm:px-8">
          <button
            type="button"
            onClick={onPrevious}
            className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#333333] hover:text-[#0f8b73]"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous state
          </button>
          <button
            type="button"
            onClick={onNext}
            className="inline-flex items-center gap-2 text-[12px] font-semibold text-[#333333] hover:text-[#0f8b73]"
          >
            Next state
            <ArrowRight className="h-4 w-4" />
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}
