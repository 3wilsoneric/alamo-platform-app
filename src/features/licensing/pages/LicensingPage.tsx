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

  useEffect(() => {
    if (!globalThis.matchMedia?.("(max-width: 1023px)").matches) return;
    globalThis.requestAnimationFrame(() => globalThis.scrollTo({ top: 0, behavior: "auto" }));
  }, [selectedParam]);

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
    <section aria-label="Licensing reports" data-licensing-page="true" className="mx-auto min-h-[calc(100dvh-var(--platform-header-height)-58px)] min-w-0 w-full max-w-[1500px] bg-white px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-3 font-sans text-[#16283a] sm:px-6 sm:pt-4 lg:px-8">
    <header className="mb-5 flex items-center justify-between gap-3 border-b border-[#d9d9d9] pb-3">
      <Link to={selectedCommunity ? `/home/community/${selectedCommunity.facilityId}` : "/home"} className="inline-flex min-h-11 min-w-0 items-center gap-2 text-[13px] font-medium text-[#333333] hover:text-[#0f8b73] sm:text-sm"><ArrowLeft size={16} className="shrink-0" aria-hidden="true" /> <span className="truncate">{selectedCommunity ? selectedCommunity.name : "Communities"}</span></Link>
      <LicensingUpdates onSelect={(id) => setParams({ report: id })} />
    </header>
    {error ? <div role="alert" className="py-8"><p>{error}</p><button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-4 min-h-11 underline">Try again</button><Link to="/analytics/licensing" className="ml-5 underline">All reports</Link></div>
      : !library ? <p role="status" className="py-12 text-sm">Loading reports…</p> : <>
        <div data-licensing-workspace="true" className="grid min-w-0 items-start gap-5 bg-white lg:grid-cols-[260px_minmax(0,1fr)] xl:gap-8">
          <aside aria-label="Browse reports" className={`${selectedParam ? "hidden lg:block" : "block"} min-w-0`}>
            <form data-licensing-search="true" className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1 rounded-lg border border-[#bfd1cb] bg-[#f7faf8] px-2" onSubmit={(event) => {
              event.preventDefault(); const next = new URLSearchParams(); if (community) next.set("community", community);
              const question = String(new FormData(event.currentTarget).get("q") ?? "").trim(); if (question) next.set("q", question); setParams(next);
            }}><Search size={16} className="shrink-0 text-[#4f625d]" aria-hidden="true" /><input key={q} name="q" aria-label="Search licensing reports" maxLength={200} defaultValue={q} placeholder="Search reports" className="min-h-11 min-w-0 bg-transparent px-1 text-base outline-none placeholder:text-[#737d78] sm:text-sm" /><button type="submit" className="min-h-9 px-2 text-[12px] font-semibold text-[#0b6f5e]">Search</button>{q ? <button type="button" aria-label="Clear search" onClick={() => setParams(community ? { community } : {})} className="grid min-h-9 min-w-9 place-items-center text-[#52645c] hover:text-[#0b6f5e]"><X size={14} /></button> : <span aria-hidden="true" className="w-0" />}</form>
            <div className="mt-3 border-t border-[#b9c8c2]"><div className="border-b border-[#d8dfdc] py-3"><p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#536760]">{q ? "Search results" : "Report library"}</p><p className="mt-1 text-[12px] leading-4 text-[#595959]"><strong className="font-bold text-[#111111]">{library.reports.length}</strong> {q ? `matches for “${q}”` : "recent reports"}{selectedCommunity ? ` · ${selectedCommunity.name}` : ""}</p></div>
            <ul aria-label="Licensing reports">{library.reports.map((r) => <li key={r.id}><button type="button" onClick={() => selectReport(r.id)} aria-pressed={r.id === selectedId} className={`grid w-full grid-cols-[3px_minmax(0,1fr)] gap-3 border-b border-[#d9d9d9] py-3 pr-2 text-left transition-colors ${r.id === selectedId ? "bg-[#f5f4ef]" : "hover:bg-[#fafafa]"}`}>
              <span className={r.id === selectedId ? "bg-[#0f8b73]" : "bg-transparent"} aria-hidden="true" />
              <span><span className="flex items-start justify-between gap-2"><span className="min-w-0 text-[14px] font-bold leading-5 tracking-[-0.025em] text-[#111111]">{library.communities.find((c) => c.facilityId === r.facilityId)?.name}</span><span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.09em] text-[#66736d]">{r.reportType}</span></span>
              <span className="mt-1 block text-[12px] leading-4 text-[#67747a]">{licensingDate(r.reportDate)}</span>
              <span className="mt-1.5 block truncate text-[12px] leading-5 text-[#3f3f3f]">{r.title}</span></span>
            </button></li>)}</ul>
            {!library.reports.length && <p className="border-b border-[#d9d9d9] py-7 text-[13px] leading-6 text-[#595959]">No matching reports. Try a community name, topic, finding, or year.</p>}
            </div>
          </aside>
          <main key={selectedId ?? "empty"} className={`${selectedParam ? "block" : "hidden lg:block"} min-w-0 bg-white`} aria-label="Report reader" aria-busy={Boolean(selectedId && !shownReport && !reportError)}>
            {reportError?.id === selectedId ? <div role="alert" className="p-7"><p>{reportError.message}</p><button type="button" className="mt-4 min-h-11 underline" onClick={() => setAttempt((n) => n + 1)}>Retry report</button><button type="button" className="ml-5 min-h-11 underline" onClick={() => selectReport(null)}>Back to reports</button></div>
              : shownReport ? <LicensingReportReader report={shownReport} community={library.communities.find((c) => c.facilityId === shownReport.facilityId)?.name ?? ""} onBack={() => selectReport(null)} />
              : <p role="status" className="p-7 text-sm text-[#617568]">{selectedId ? "Loading report…" : "Select a report to read."}</p>}
          </main>
        </div>
        <p className="mt-4 px-1 text-[12px] leading-5 text-[#758176]">State records archived {licensingDate(library.collectedAt)}. Open Updates for the latest check.</p>
      </>}
  </section></>;
}
