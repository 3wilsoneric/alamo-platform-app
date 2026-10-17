import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { LicensingLibrary, LicensingReport } from "../../../../shared/licensing-contracts.mjs";
import { fetchLicensingLibrary, fetchLicensingReport } from "../licensingApi";
import LicensingReportReader from "../components/LicensingReportReader";
import LicensingUpdates from "../components/LicensingUpdates";
import LicensingSkill from "../components/LicensingSkill";
import LicensingReportModule from "../components/LicensingReportModule";
import { licensingQuestionQuery, licensingQuestions } from "../licensingQuestions";
import { useLicensingUpdates } from "../useLicensingUpdates";
export default function LicensingWorkspace({ agentMode = false }: { agentMode?: boolean }) {
  const [params, setParams] = useSearchParams();
  const community = params.get("community") ?? "";
  const q = params.get("q") ?? "";
  const questionParam = params.get("question") ?? "";
  const question = licensingQuestions.some(item => item.id === questionParam) ? questionParam : q ? "search" : "latest";
  const { feed, failed } = useLicensingUpdates();
  const selectedId = params.get("report");
  const query = licensingQuestionQuery(question, community, q);
  const [attempt, setAttempt] = useState(0);
  const [libraryState, setLibrary] = useState<{ query: string; data: LicensingLibrary } | null>(null);
  const [libraryError, setLibraryError] = useState<{ query: string; message: string } | null>(null);
  const [report, setReport] = useState<LicensingReport | null>(null);
  const [reportError, setReportError] = useState<{ id: string; message: string } | null>(null);
  const library = libraryState?.query === query ? libraryState.data : null;
  const error = libraryError?.query === query ? libraryError.message : null;
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
    globalThis.requestAnimationFrame(() => globalThis.scrollTo({ top: 0, behavior: "auto" }));
  }, [selectedId, question, q, community]);

  function selectReport(id: string | null) {
    setParams(previous => { const next = new URLSearchParams(previous); if (id) next.set("report", id); else next.delete("report"); return next; });
  }

  function ask(nextQuestion: string, scope: string, text?: string) {
    const next = new URLSearchParams({ skill: "licensing" });
    if (scope) next.set("community", scope);
    if (text) next.set("q", text); else next.set("question", nextQuestion);
    setParams(next);
  }

  return <>
    <section aria-label="Licensing reports" data-licensing-page="true" className="mx-auto min-h-[calc(100dvh-var(--platform-header-height)-58px)] min-w-0 w-full max-w-[1100px] bg-white px-4 pb-[calc(3rem+env(safe-area-inset-bottom))] pt-4 font-sans text-[#16283a] sm:px-6 lg:px-8">
      <header className="mb-6 flex min-h-11 items-center justify-between gap-3 border-b border-[#d9d9d9] pb-3">
        {selectedId ? <button type="button" onClick={() => { setParams(previous => { const next = new URLSearchParams(previous); next.delete("report"); next.set("skill", "licensing"); return next; }); }} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-[#287261]"><ArrowLeft size={16} aria-hidden="true" /> Back to reports</button>
          : <p className="text-sm text-[#68716b]">Licensing</p>}
        <LicensingUpdates onSelect={id => setParams({ report: id })} feed={feed} failed={failed} />
      </header>
      {error ? <div role="alert" className="py-8"><p>{error}</p><button type="button" onClick={() => setAttempt(n => n + 1)} className="mt-4 min-h-11 underline">Try again</button><button type="button" className="ml-5 min-h-11 underline" onClick={() => setParams({})}>Back to reports</button></div>
        : !library ? <p role="status" className="py-12 text-sm">Reading state reports…</p> : <div data-licensing-workspace="true" className="min-w-0">
          {selectedId ? <main key={selectedId} aria-label="Report reader" aria-busy={Boolean(!shownReport && !reportError)}>
            {reportError?.id === selectedId ? <div role="alert" className="p-7"><p>{reportError.message}</p><button type="button" className="mt-4 min-h-11 underline" onClick={() => setAttempt(n => n + 1)}>Retry report</button></div>
              : shownReport ? <LicensingReportReader report={shownReport} community={library.communities.find(c => c.facilityId === shownReport.facilityId)?.name ?? ""} />
                : <p role="status" className="p-7 text-sm text-[#617568]">Loading report…</p>}
          </main> : <>
            <LicensingSkill key={`${question}-${q}-${community}`} library={library} community={community} feed={feed} failed={failed} onAsk={ask} agentMode={agentMode} />
            {question && <LicensingReportModule key={`${question}-${q}-${community}`} library={library} question={question} q={q} community={community} onSelect={selectReport} />}
          </>}
        </div>}
    </section>
  </>;
}
