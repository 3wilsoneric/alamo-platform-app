import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Search, X } from "lucide-react";
import type { LicensingLibrary, LicensingReport } from "../../../../shared/licensing-contracts.mjs";
import { fetchLicensingLibrary, fetchLicensingReport } from "../licensingApi";
import LicensingReportReader, { licensingDate } from "../components/LicensingReportReader";
import LicensingUpdates from "../components/LicensingUpdates";
import AnalyticsSectionNavigation from "../../california/components/AnalyticsSectionNavigation";
import { useLicensingAccess } from "../../../shared/auth/licensingAccess";

export default function LicensingPage() {
  const canViewLicensing = useLicensingAccess();
  return canViewLicensing ? <LicensingWorkspace /> : <Navigate to="/analytics" replace />;
}

function LicensingWorkspace() {
  const navigate = useNavigate();
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

  return <>
    <AnalyticsSectionNavigation active="licensing" onNavigate={(section) => navigate(section === "reports" ? "/analytics" : `/analytics/${section}`)} />
    <section aria-label="Licensing reports" data-licensing-page="true" className="min-w-0 w-full px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 text-[#263e34] sm:px-6 lg:px-8">
    <header className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-[#dce6df] bg-[#f6f9f7] px-3 py-2 sm:mb-4 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
      <Link to={selectedCommunity ? `/home/community/${selectedCommunity.facilityId}` : "/home"} className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full px-1 text-[13px] font-medium text-[#45675a] hover:underline sm:text-sm"><ArrowLeft size={16} className="shrink-0" aria-hidden="true" /> <span className="truncate">{selectedCommunity ? selectedCommunity.name : "Communities"}</span></Link>
      <LicensingUpdates onSelect={(id) => setParams({ report: id })} />
    </header>
    <form data-licensing-search="true" className="mb-4 grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1 rounded-2xl border border-[#c9d8ca] bg-white p-1.5 pl-3 shadow-[0_5px_18px_rgba(38,74,58,0.06)] sm:gap-2 sm:rounded-xl sm:pl-4" onSubmit={(event) => {
      event.preventDefault(); const next = new URLSearchParams(); if (community) next.set("community", community);
      const question = String(new FormData(event.currentTarget).get("q") ?? "").trim(); if (question) next.set("q", question); setParams(next);
    }}><Search size={18} className="shrink-0 text-[#668075]" aria-hidden="true" /><input key={q} name="q" aria-label="Search licensing reports" maxLength={200} defaultValue={q} placeholder="Search reports" className="min-h-12 min-w-0 bg-transparent px-1 text-base outline-none placeholder:text-[#7d8c85] sm:min-h-14 sm:text-sm" /><button type="submit" className="min-h-11 rounded-full bg-[#e2efe9] px-3 text-[13px] font-semibold text-[#21644e] sm:px-4 sm:text-sm">Search</button>{q ? <button type="button" aria-label="Clear search" onClick={() => setParams(community ? { community } : {})} className="grid min-h-11 min-w-11 place-items-center rounded-full text-[#567168] hover:bg-[#edf3ef]"><X size={16} /></button> : <span aria-hidden="true" className="w-0" />}</form>
    {error ? <div role="alert" className="py-8"><p>{error}</p><button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-4 min-h-11 underline">Try again</button><Link to="/analytics/licensing" className="ml-5 underline">All reports</Link></div>
      : !library ? <p role="status" className="py-12 text-sm">Loading reports…</p> : <>
        <div data-licensing-workspace="true" className="grid min-w-0 items-start overflow-hidden rounded-[20px] border border-[#d5e1d8] bg-white shadow-[0_8px_24px_rgba(38,74,58,0.05)] lg:grid-cols-[320px_minmax(0,1fr)] lg:rounded-xl">
          <aside aria-label="Browse reports" className={`${selectedParam ? "hidden lg:block" : "block"} min-w-0 lg:max-h-[76vh] lg:overflow-y-auto lg:border-r lg:border-[#d5e1d8]`}>
            <div className="border-b border-[#e2eae5] bg-[#f6f9f7] px-4 py-4 sm:px-5"><p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#718078]">{q ? "Search results" : "Report library"}</p><p className="mt-1.5 text-[14px] leading-5 text-[#4c6659]"><strong className="font-semibold text-[#244c3e]">{library.reports.length}</strong> {q ? `matches for “${q}”` : "recent reports"}{selectedCommunity ? ` · ${selectedCommunity.name}` : ""}</p></div>
            <ul aria-label="Licensing reports" className="divide-y divide-[#e2eae5]">{library.reports.map((r) => <li key={r.id}><button type="button" onClick={() => selectReport(r.id)} aria-pressed={r.id === selectedId} className={`w-full border-l-[4px] px-4 py-4 text-left transition-colors sm:px-5 ${r.id === selectedId ? "border-[#288164] bg-[#edf6f1]" : "border-transparent bg-white hover:bg-[#f7f9f7]"}`}>
              <span className="flex items-center justify-between gap-3"><span className="min-w-0 truncate text-[15px] font-semibold text-[#244c3e]">{library.communities.find((c) => c.facilityId === r.facilityId)?.name}</span><span className="shrink-0 rounded-full bg-[#edf3ef] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-[#63756b]">{r.reportType}</span></span>
              <span className="mt-1.5 block text-[12px] text-[#6c7c70]">{licensingDate(r.reportDate)}</span>
              <span className="mt-2 block text-[15px] leading-6 text-[#45604b]">{r.analysis?.headline ?? r.reportType}</span>
            </button></li>)}</ul>
            {!library.reports.length && <p className="px-5 py-10 text-[15px] leading-7 text-[#52675d]">No matching reports. Try a community name, topic, finding, or year.</p>}
          </aside>
          <div key={selectedId ?? "empty"} className={`${selectedParam ? "block" : "hidden lg:block"} min-w-0 bg-[#fdfefd] lg:max-h-[76vh] lg:overflow-y-auto`} aria-label="Report reader" aria-busy={Boolean(selectedId && !shownReport && !reportError)}>
            {reportError?.id === selectedId ? <div role="alert" className="p-7"><p>{reportError.message}</p><button type="button" className="mt-4 min-h-11 underline" onClick={() => setAttempt((n) => n + 1)}>Retry report</button><button type="button" className="ml-5 min-h-11 underline" onClick={() => selectReport(null)}>Back to reports</button></div>
              : shownReport ? <LicensingReportReader report={shownReport} community={library.communities.find((c) => c.facilityId === shownReport.facilityId)?.name ?? ""} onBack={() => selectReport(null)} />
              : <p role="status" className="p-7 text-sm text-[#617568]">{selectedId ? "Loading report…" : "Select a report to read."}</p>}
          </div>
        </div>
        <p className="mt-4 px-1 text-[12px] leading-5 text-[#758176]">State records archived {licensingDate(library.collectedAt)}. Open Updates for the latest check.</p>
      </>}
  </section></>;
}
