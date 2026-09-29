import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, X } from "lucide-react";
import type { LicensingLibrary, LicensingReport } from "../../../../shared/licensing-contracts.mjs";
import { fetchLicensingLibrary, fetchLicensingReport } from "../licensingApi";
import LicensingReportReader, { licensingDate } from "../components/LicensingReportReader";
import LicensingUpdates from "../components/LicensingUpdates";

export default function LicensingPage() {
  const [params, setParams] = useSearchParams();
  const community = params.get("community") ?? "";
  const q = params.get("q") ?? "";
  const selectedParam = params.get("report");
  const query = new URLSearchParams({ community, q }).toString();
  const [attempt, setAttempt] = useState(0);
  const [libraryState, setLibrary] = useState<{ query: string; data: LicensingLibrary } | null>(null);
  const [libraryError, setLibraryError] = useState<{ query: string; message: string } | null>(null);
  const [report, setReport] = useState<LicensingReport | null>(null);
  const [reportError, setReportError] = useState<{ id: string; message: string } | null>(null);
  const library = libraryState?.query === query ? libraryState.data : null;
  const error = libraryError?.query === query ? libraryError.message : null;
  const selectedId = selectedParam ?? library?.reports[0]?.id ?? null;
  const selectedCommunity = library?.communities.find((c) => c.facilityId === community);
  const shownReport = report?.id === selectedId ? report : null;

  useEffect(() => {
    const controller = new AbortController();
    setLibraryError(null);
    void fetchLicensingLibrary(query, controller.signal).then((data) => {
      if (!controller.signal.aborted) setLibrary({ query, data });
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setLibraryError({ query, message: failure instanceof Error ? failure.message : "Unable to load reports." });
    });
    return () => controller.abort();
  }, [query, attempt]);

  useEffect(() => {
    const controller = new AbortController();
    setReport(null); setReportError(null);
    if (selectedId) void fetchLicensingReport(selectedId, controller.signal).then((data) => {
      if (!controller.signal.aborted) setReport(data);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setReportError({ id: selectedId, message: failure instanceof Error ? failure.message : "Unable to read this report." });
    });
    return () => controller.abort();
  }, [selectedId, attempt]);

  function selectReport(id: string | null) {
    setParams(() => {
      const next = new URLSearchParams();
      if (community) next.set("community", community);
      if (q) next.set("q", q);
      if (id) next.set("report", id);
      return next;
    });
  }

  return <section aria-label="Licensing reports" data-licensing-page="true" className="min-w-0 w-full pb-6 text-[#263e34]">
    <header className="mb-2 flex items-center justify-between gap-4">
      <Link to={selectedCommunity ? `/home/community/${selectedCommunity.facilityId}` : "/home"} className="inline-flex min-h-11 items-center gap-2 text-sm text-[#527065] hover:underline"><ArrowLeft size={15} aria-hidden="true" /> {selectedCommunity ? selectedCommunity.name : "Communities"}</Link>
      <LicensingUpdates onSelect={(id) => setParams({ report: id })} />
    </header>
    <form className="mb-4 flex items-center gap-3 rounded-lg border border-[#c9d8ca] bg-[#f7f9f5] px-4" onSubmit={(event) => {
      event.preventDefault(); const next = new URLSearchParams(); if (community) next.set("community", community);
      const question = String(new FormData(event.currentTarget).get("q") ?? "").trim(); if (question) next.set("q", question); setParams(next);
    }}><Search size={18} className="shrink-0 text-[#6d8571]" aria-hidden="true" /><input key={q} name="q" aria-label="Search licensing reports" maxLength={200} defaultValue={q} placeholder="Search reports — e.g. medication at San Pablo" className="min-h-14 min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm" /><button type="submit" className="min-h-11 text-sm font-medium text-[#315d40]">Search</button>{q && <button type="button" aria-label="Clear search" onClick={() => setParams(community ? { community } : {})} className="min-h-11"><X size={16} /></button>}</form>
    {error ? <div role="alert" className="py-8"><p>{error}</p><button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-4 min-h-11 underline">Try again</button><Link to="/licensing" className="ml-5 underline">All reports</Link></div>
      : !library ? <p role="status" className="py-12 text-sm">Loading reports…</p> : <>
        <div className="grid min-w-0 items-start overflow-hidden rounded-lg border border-[#d5e1d8] lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside aria-label="Browse reports" className={`${selectedParam ? "hidden lg:block" : "block"} min-w-0 lg:max-h-[76vh] lg:overflow-y-auto lg:border-r lg:border-[#d5e1d8]`}>
            <p className="px-5 py-4 text-xs text-[#6a7f6c]">{q ? `Matches for “${q}”` : "Recent reports"}{selectedCommunity ? ` · ${selectedCommunity.name}` : ""}</p>
            <ul aria-label="Licensing reports" className="divide-y divide-[#e2eae5]">{library.reports.map((r) => <li key={r.id}><button type="button" onClick={() => selectReport(r.id)} aria-pressed={r.id === selectedId} className={`w-full border-l-[3px] px-5 py-4 text-left ${r.id === selectedId ? "border-[#297253] bg-[#eef5f0]" : "border-transparent bg-white hover:bg-[#f7f9f7]"}`}>
              <span className="block text-sm font-semibold">{library.communities.find((c) => c.facilityId === r.facilityId)?.name}</span>
              <span className="mt-1 block text-xs text-[#6c7c70]">{licensingDate(r.reportDate)}</span>
              <span className="mt-2 block text-sm leading-6 text-[#45604b]">{r.analysis?.headline ?? r.reportType}</span>
            </button></li>)}</ul>
            {!library.reports.length && <p className="px-5 py-8 text-sm leading-7">No matching reports. Try a community name, topic, finding, or year.</p>}
          </aside>
          <div key={selectedId ?? "empty"} className={`${selectedParam ? "block" : "hidden lg:block"} min-w-0 bg-[#fdfefd] lg:max-h-[76vh] lg:overflow-y-auto`} aria-label="Report reader" aria-busy={Boolean(selectedId && !shownReport && !reportError)}>
            {reportError?.id === selectedId ? <div role="alert" className="p-7"><p>{reportError.message}</p><button type="button" className="mt-4 min-h-11 underline" onClick={() => setAttempt((n) => n + 1)}>Retry report</button><button type="button" className="ml-5 min-h-11 underline" onClick={() => selectReport(null)}>Back to reports</button></div>
              : shownReport ? <LicensingReportReader report={shownReport} community={library.communities.find((c) => c.facilityId === shownReport.facilityId)?.name ?? ""} onBack={() => selectReport(null)} />
              : <p role="status" className="p-7 text-sm text-[#617568]">{selectedId ? "Loading report…" : "Select a report to read."}</p>}
          </div>
        </div>
        <p className="mt-4 text-xs leading-6 text-[#758176]">State records archived {licensingDate(library.collectedAt)}. Open Updates for the latest check.</p>
      </>}
  </section>;
}
