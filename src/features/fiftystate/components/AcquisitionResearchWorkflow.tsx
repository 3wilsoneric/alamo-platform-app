import { ChevronDown, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  fetchAcquisitionResearch,
  type AcquisitionResearchQueue,
  type AcquisitionResearchResponse
} from "../data/acquisitionResearchApi";
import AcquisitionResearchCaseEditor from "./AcquisitionResearchCaseEditor";

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function displayStatus(value: string) {
  return value.replaceAll("_", " ");
}

export default function AcquisitionResearchWorkflow({ states }: { states: string[] }) {
  const [queue, setQueue] = useState<AcquisitionResearchQueue>("priority");
  const [query, setQuery] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [response, setResponse] = useState<AcquisitionResearchResponse | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchAcquisitionResearch({ queue, q: query, state: stateCode }, signal);
      setResponse(next);
      setSelectedFacilityId((current) =>
        current && next.cases.some((record) => record.facilityId === current)
          ? current
          : next.cases[0]?.facilityId ?? null
      );
    } catch (requestError) {
      if (requestError instanceof DOMException && requestError.name === "AbortError") return;
      setResponse(null);
      setSelectedFacilityId(null);
      setError("The persistent research workflow could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [queue, query, stateCode]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const selectedCase = useMemo(
    () => response?.cases.find((record) => record.facilityId === selectedFacilityId) ?? null,
    [response, selectedFacilityId]
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    void load();
  }

  return (
    <section data-acquisition-research-workflow="true" className="border-b border-[#b3b3b3] py-5" aria-labelledby="research-workflow-heading">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0f8b73]">Persistent company brain</p>
          <h2 id="research-workflow-heading" className="mt-1 font-serif text-[23px] font-semibold tracking-[-0.03em]">
            Facility research workflow
          </h2>
          <p className="mt-2 max-w-[780px] text-[12px] leading-5 text-[#595959]">
            Every include and review facility has a durable case. Analyst decisions and evidence live separately from refreshed discovery data.
          </p>
        </div>
        {response ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-right sm:grid-cols-4">
            {[
              ["Active cases", response.summary.activeCases],
              ["Ownership pending", response.summary.ownershipPending],
              ["License pending", response.summary.licensePending],
              ["Evidence", response.summary.evidenceRecords]
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10px] font-semibold text-[#737373]">{label}</dt>
                <dd className="font-serif text-[22px] font-semibold">{formatCount(value as number)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      <form onSubmit={submit} className="mt-4 grid gap-2 md:grid-cols-[165px_minmax(220px,1fr)_100px_auto]">
        <label className="relative">
          <span className="sr-only">Research queue</span>
          <select value={queue} onChange={(event) => setQueue(event.target.value as AcquisitionResearchQueue)} className="h-10 w-full appearance-none border border-[#b3b3b3] bg-white px-3 pr-8 text-[12px] font-semibold">
            <option value="priority">Top 25 evidence priority</option>
            <option value="ownership">Ownership unresolved</option>
            <option value="license">License match</option>
            <option value="scope">Scope confirmation</option>
            <option value="capacity">Capacity verification</option>
            <option value="review">Ready for review</option>
            <option value="all">All cases</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4" />
        </label>
        <label className="flex h-10 items-center gap-2 border border-[#b3b3b3] px-3 focus-within:border-[#0f8b73]">
          <Search className="h-4 w-4 text-[#0f8b73]" />
          <span className="sr-only">Search research cases</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Facility, operator, legal entity, or note" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none" />
        </label>
        <label className="relative">
          <span className="sr-only">Research case state</span>
          <select value={stateCode} onChange={(event) => setStateCode(event.target.value)} className="h-10 w-full appearance-none border border-[#b3b3b3] bg-white px-3 pr-7 text-[12px] font-semibold">
            <option value="">All states</option>
            {states.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4" />
        </label>
        <button type="submit" disabled={loading} className="h-10 bg-[#111111] px-4 text-[12px] font-semibold text-white hover:bg-[#0f8b73] disabled:opacity-60">
          {loading ? "Loading" : "Search"}
        </button>
      </form>

      {error ? <p role="alert" className="mt-3 text-[12px] font-semibold text-[#a43f32]">{error}</p> : null}
      {response ? (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-[#737373]">
            <p>{formatCount(response.matched)} cases in this queue · showing {response.cases.length}</p>
            <p>Revision {response.summary.revision} · {response.persistence === "azure_blob" ? "Azure persistence" : "local file persistence"}</p>
          </div>
          <div className="mt-2 grid gap-5 border-t border-[#b3b3b3] pt-3 lg:grid-cols-[minmax(245px,0.68fr)_minmax(0,1.55fr)]">
            <div className="max-h-[920px] overflow-y-auto border-t border-[#d9d9d9]">
              {response.cases.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  aria-pressed={record.facilityId === selectedFacilityId}
                  onClick={() => setSelectedFacilityId(record.facilityId)}
                  className={`w-full border-b border-[#d9d9d9] px-2 py-3 text-left ${record.facilityId === selectedFacilityId ? "bg-[#e8f5f1]" : "hover:bg-[#f5f4ef]"}`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-serif text-[15px] font-semibold leading-5">{record.facility.name}</span>
                    <span className="text-[10px] font-bold text-[#0f8b73]">{record.evidencePriorityScore}</span>
                  </span>
                  <span className="mt-1 block text-[10px] font-semibold text-[#595959]">
                    {record.facility.address.city} · {record.facility.address.stateCode} · {displayStatus(record.status)}
                  </span>
                  <span className="mt-1 block text-[10px] text-[#737373]">
                    Owner {displayStatus(record.ownership.status)} · license {displayStatus(record.license.status)} · {record.evidence.length} evidence
                  </span>
                </button>
              ))}
              {!response.cases.length ? <p className="px-2 py-5 text-[12px] text-[#737373]">No cases match this queue and filter.</p> : null}
            </div>
            {selectedCase ? <AcquisitionResearchCaseEditor record={selectedCase} onChanged={() => load()} /> : (
              <p className="text-[12px] text-[#737373]">Select a research case to edit its evidence and workflow state.</p>
            )}
          </div>

          <details className="mt-5 border-t border-[#d9d9d9] pt-3">
            <summary className="cursor-pointer text-[12px] font-semibold text-[#333333]">
              Proposed operator clusters · {formatCount(response.summary.proposedOperatorClusters)}
            </summary>
            <p className="mt-2 max-w-[780px] text-[11px] leading-5 text-[#737373]">Shared domains and normalized facility names suggest research groupings only. They do not establish legal ownership or a parent company.</p>
            <div className="mt-2 grid gap-x-6 border-t border-[#d9d9d9] md:grid-cols-2 xl:grid-cols-3">
              {response.operatorProposals.map((proposal) => (
                <article key={proposal.id} className="border-b border-[#d9d9d9] py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-serif text-[15px] font-semibold">{proposal.label}</p>
                    <span className="text-[10px] font-bold text-[#0f8b73]">{proposal.facilityCount}</span>
                  </div>
                  <p className="mt-1 text-[10px] font-semibold text-[#9a5b0a]">Proposed · {displayStatus(proposal.basis)} · {proposal.confidence} confidence</p>
                  <p className="mt-1 text-[10px] text-[#737373]">{proposal.stateCodes.join(" · ")}</p>
                </article>
              ))}
            </div>
          </details>
          <p className="mt-3 text-[10px] leading-4 text-[#737373]">{response.verificationBoundary}</p>
        </>
      ) : null}
    </section>
  );
}
