import { ChevronDown, Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  runAcquisitionValuation,
  searchAcquisitionFacilities,
  type AcquisitionFacilitySearchResponse,
  type AcquisitionNationalDiscoverySummary
} from "../data/acquisitionIntelligenceApi";

// Retain the validated valuation client with the deferred facility workflow.
void runAcquisitionValuation;

type Disposition = "include" | "review" | "exclude" | "all";

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function evidenceLine(values: string[]) {
  return values.length ? values.join("; ") : "Not reported";
}

export default function NationalFacilityDiscovery({
  summary
}: {
  summary: AcquisitionNationalDiscoverySummary;
}) {
  const [query, setQuery] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [disposition, setDisposition] = useState<Disposition>("include");
  const [response, setResponse] = useState<AcquisitionFacilitySearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function runSearch(signal?: AbortSignal) {
    if (!summary.available) return Promise.resolve();
    setLoading(true);
    setError(null);
    return searchAcquisitionFacilities({ q: query, state: stateCode, disposition }, signal)
      .then(setResponse)
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setResponse(null);
        setError("The local discovery index could not be searched.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const controller = new AbortController();
    void runSearch(controller.signal);
    return () => controller.abort();
    // The first search is intentionally tied only to the refreshed datastore identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.available, summary.generatedAt]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void runSearch();
  }

  if (!summary.available) {
    return (
      <section className="border-b border-[#b3b3b3] py-5" aria-labelledby="national-discovery-heading">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#595959]">Local datastore</p>
        <h2 id="national-discovery-heading" className="mt-1 font-serif text-[23px] font-semibold tracking-[-0.03em]">
          National facility discovery
        </h2>
        <p className="mt-2 text-[12px] leading-5 text-[#595959]">
          The local national index has not been refreshed. Run <code className="bg-[#f1f0ea] px-1.5 py-0.5">npm run acquisition:refresh</code> from the Platform app to download and screen the official source layers.
        </p>
      </section>
    );
  }

  const publicUse = summary.publicUse;
  const directory = summary.directory;
  if (!publicUse || !directory) return null;

  return (
    <section data-national-facility-discovery="true" className="border-b border-[#b3b3b3] py-5" aria-labelledby="national-discovery-heading">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0f8b73]">
            {summary.datasetYear} federal discovery backbone
          </p>
          <h2 id="national-discovery-heading" className="mt-1 font-serif text-[23px] font-semibold tracking-[-0.03em]">
            National facility discovery
          </h2>
          <p className="mt-2 max-w-[780px] text-[12px] leading-5 text-[#595959]">
            Search named directory facilities screened into include and review queues. These are discovery records—not verified licenses, owners, beds, or acquisition targets.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-right sm:grid-cols-4">
          {[
            ["PUF records", publicUse.rawRecords],
            ["Named facilities", directory.counts.total],
            ["Include queue", directory.counts.include],
            ["Review queue", directory.counts.review]
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[10px] font-semibold text-[#737373]">{label}</dt>
              <dd className="font-serif text-[22px] font-semibold">{formatCount(value as number)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <form onSubmit={submit} className="mt-4 grid gap-2 md:grid-cols-[minmax(240px,1fr)_100px_130px_auto]">
        <label className="flex h-10 items-center gap-2 border border-[#b3b3b3] px-3 focus-within:border-[#0f8b73]">
          <Search className="h-4 w-4 text-[#0f8b73]" />
          <span className="sr-only">Search national facility discovery</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Facility, city, service, or tag"
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none"
          />
        </label>
        <label className="relative">
          <span className="sr-only">National discovery state</span>
          <select
            value={stateCode}
            onChange={(event) => setStateCode(event.target.value)}
            className="h-10 w-full appearance-none border border-[#b3b3b3] bg-white px-3 pr-7 text-[12px] font-semibold"
          >
            <option value="">All states</option>
            {summary.states.map((code) => <option key={code} value={code}>{code}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4" />
        </label>
        <label className="relative">
          <span className="sr-only">National discovery disposition</span>
          <select
            value={disposition}
            onChange={(event) => setDisposition(event.target.value as Disposition)}
            className="h-10 w-full appearance-none border border-[#b3b3b3] bg-white px-3 pr-7 text-[12px] font-semibold"
          >
            <option value="include">Include queue</option>
            <option value="review">Review queue</option>
            <option value="all">All dispositions</option>
            <option value="exclude">Excluded context</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4" />
        </label>
        <button type="submit" disabled={loading} className="h-10 bg-[#111111] px-4 text-[12px] font-semibold text-white hover:bg-[#0f8b73] disabled:opacity-60">
          {loading ? "Searching" : "Search"}
        </button>
      </form>

      {error ? <p role="alert" className="mt-3 text-[12px] font-semibold text-[#a43f32]">{error}</p> : null}
      {response ? (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-[#595959]">
            {formatCount(response.matched)} matches · showing {response.results.length}
          </p>
          <div className="mt-2 grid max-h-[430px] overflow-y-auto border-t border-[#b3b3b3] lg:grid-cols-2">
            {response.results.map((facility) => (
              <details key={facility.id} className="border-b border-[#d9d9d9] px-3 py-3 lg:odd:border-r">
                <summary className="cursor-pointer list-none">
                  <span className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block font-serif text-[16px] font-semibold leading-5">{facility.name}</span>
                      {facility.secondaryName ? <span className="mt-0.5 block text-[11px] text-[#595959]">{facility.secondaryName}</span> : null}
                    </span>
                    <span className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#0f8b73]">{facility.disposition}</span>
                  </span>
                  <span className="mt-1.5 block text-[11px] leading-4 text-[#595959]">
                    {[facility.address.street1, facility.address.city, facility.address.stateCode, facility.address.zip].filter(Boolean).join(" · ")}
                  </span>
                  <span className="mt-1 block text-[10px] font-semibold text-[#9a5b0a]">
                    Directory discovery only · license pending · owner unresolved
                  </span>
                </summary>
                <dl className="mt-3 space-y-2 border-t border-[#d9d9d9] pt-2 text-[11px] leading-4">
                  <div><dt className="font-semibold">Operation</dt><dd className="text-[#595959]">{evidenceLine(facility.evidence.operation)}</dd></div>
                  <div><dt className="font-semibold">Setting</dt><dd className="text-[#595959]">{evidenceLine(facility.evidence.setting)}</dd></div>
                  <div><dt className="font-semibold">Ages</dt><dd className="text-[#595959]">{evidenceLine(facility.evidence.ages)}</dd></div>
                  <div><dt className="font-semibold">Clinical signals</dt><dd className="text-[#595959]">{evidenceLine([...facility.evidence.typeOfCare, ...facility.evidence.specialPrograms])}</dd></div>
                  <div><dt className="font-semibold">Queue reason</dt><dd className="text-[#595959]">{facility.reasons.join("; ")}</dd></div>
                </dl>
              </details>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-[#737373]">{summary.caveat}</p>
        </div>
      ) : null}
    </section>
  );
}
