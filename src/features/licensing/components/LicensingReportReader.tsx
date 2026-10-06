import { useMemo } from "react";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";
import type { LicensingReport } from "../../../../shared/licensing-contracts.mjs";
import { licensingTextForDisplay } from "../../../../shared/licensing-contracts.mjs";
import { analyzeLicensingReport, type LicensingEvidence } from "../../../../shared/licensing-analysis.mjs";

export function licensingDate(value: string) {
  return new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "America/Los_Angeles"
  });
}

const outcomeMeaning: Record<string, string> = {
  Substantiated: "The state found enough evidence to support one or more allegations.",
  Unsubstantiated: "The state did not find enough evidence to prove the allegations. This does not mean they were determined to be false.",
  Unfounded: "The state recorded an unfounded finding. Read its explanation below.",
  Inconclusive: "The report uses the state's earlier term for insufficient evidence.",
  "Mixed findings": "This document contains different findings. Read the allegations and finding excerpts together; a single finding does not apply to every allegation.",
  Pending: "The report records a pending finding.",
  "Not stated": "An explicit complaint finding could not be extracted. Review the narrative.",
  "Not applicable": ""
};

function Evidence({ item }: { item: LicensingEvidence }) {
  return <div className="min-w-0 border-l-[3px] border-[#9bb8a9] pl-3 sm:pl-4">
    <p className="whitespace-pre-line break-words text-[15px] leading-7 text-[#354d41]">{item.text}</p>
    <p className="mt-2 text-[11px] leading-5 text-[#738277]">State report · {item.page ? `page ${item.page}` : "page not identified"}</p>
  </div>;
}

export default function LicensingReportReader({ report, community, onBack }: {
  report: LicensingReport; community: string; onBack: () => void;
}) {
  const insights = useMemo(() => analyzeLicensingReport(report), [report]);
  const { summary } = insights;
  const dismissed = insights.citations.filter((citation) => citation.disposition === "Deficiency Dismissed");
  function downloadText() {
    const url = URL.createObjectURL(new Blob([report.text], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `CCLD-${report.licenseNumber}-${report.reportDate}-${report.id.slice(-8)}.txt`;
    anchor.click(); globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <article data-licensing-reader={report.id} className="min-w-0">
    <header className="border-b border-[#dce5e0] bg-[#f8fbf9] px-4 py-4 sm:px-7 sm:py-5">
      <button type="button" onClick={onBack} className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d7e3dc] bg-white px-4 text-[13px] font-medium text-[#45675a] shadow-[0_2px_8px_rgba(38,74,58,0.04)] lg:hidden"><ArrowLeft size={16} /> Back to reports</button>
      <div className="flex flex-col items-start gap-2 text-[12px] text-[#537268] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <p className="flex flex-wrap items-center gap-2 font-semibold uppercase tracking-[0.09em]"><span className="text-[#246d54]">{community}</span><span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#9bb2a7]" /><span>{report.reportType}</span></p>
        <time dateTime={report.reportDate} className="rounded-full bg-[#e8f1ec] px-3 py-1.5 font-medium text-[#48665a]">{licensingDate(report.reportDate)}</time>
      </div>
      <h2 className="mt-4 break-words font-serif text-[25px] leading-[1.16] text-[#203f36] sm:text-[30px]">{summary.headline}</h2>
      {outcomeMeaning[summary.outcome] && <p className="mt-3 text-[15px] leading-6 text-[#607367]">{outcomeMeaning[summary.outcome]}</p>}
      {!!dismissed.length && <p className="mt-3 text-[15px] leading-6 text-[#47664e]">{dismissed.length === insights.citations.length ? "The cited deficiencies are marked dismissed in this report." : "Some cited deficiencies are marked dismissed in this report. See the individual citations below."}</p>}
    </header>
    <div className="min-w-0 space-y-8 px-4 py-6 sm:px-7">
        {summary.reviewNeeded ? <p className="rounded-xl border border-[#d9c8a5] bg-[#fbf8f0] p-4 text-[13px] leading-6">Some fields need a source review. Unclear details are left unclassified rather than assumed.</p> : null}
        {!!insights.allegations.length && <section><h3 className="mb-2 text-[17px] font-semibold text-[#284d40]">What was investigated</h3><p className="mb-4 text-[12px] leading-5 text-[#738277]">Allegations as recorded by the state.</p><div className="space-y-5">{insights.allegations.map((item, i) => <Evidence key={i} item={item} />)}</div></section>}
        <section><h3 className="mb-4 text-[17px] font-semibold text-[#284d40]">What the state found</h3>
          {insights.findings.length ? <div className="space-y-5">{insights.findings.map((item, i) => <Evidence key={i} item={item} />)}</div> : <p className="text-[15px] leading-7 text-[#607367]">{insights.citations.length ? "The cited deficiencies and correction plans are listed below." : "No explicit finding was extracted. Open the clean narrative to read the visit observations."}</p>}
        </section>
        {!!insights.citations.length && <section><h3 className="mb-4 text-[17px] font-semibold text-[#284d40]">Deficiencies & follow-up</h3><div className="space-y-4">{insights.citations.map((citation, i) => <div key={i} className="min-w-0 rounded-2xl border border-[#d6ded5] bg-[#fbfcfb] p-4 shadow-[0_3px_12px_rgba(38,74,58,0.04)] sm:p-5">
          <div className="flex flex-col gap-1.5 text-[12px] leading-5 sm:flex-row sm:flex-wrap sm:justify-between sm:gap-2"><span className="break-words font-semibold text-[#315848]">{citation.type} · § {citation.regulation}</span><span className="text-[#728074]">Source page {citation.page ?? "unknown"}</span></div>
          {citation.disposition && <p className="mt-3 text-[14px] font-semibold text-[#55745b]">State status: {citation.disposition}</p>}
          <p className="mt-3 break-words text-[15px] leading-7">{citation.description || "Practice statement needs review in the source excerpt."}</p>
          <div className="mt-4 border-t border-[#e1e7df] pt-4"><p className="text-[12px] font-semibold leading-5 text-[#52735e]">Plan of correction{citation.dueDate ? ` · Due ${licensingDate(citation.dueDate)}` : ""}</p><p className="mt-2 break-words text-[15px] leading-7">{citation.correction || "Correction text needs review in the source excerpt."}</p></div>
          <details className="mt-3 text-[13px]"><summary className="min-h-11 cursor-pointer py-3 font-medium underline">Check citation excerpt</summary><p className="mt-2 whitespace-pre-line break-words text-[15px] leading-7">{citation.excerpt}</p></details>
        </div>)}</div><p className="mt-3 text-xs leading-6 text-[#728074]">Dates and actions are those recorded at the visit. Current completion status has not been established.</p></section>}
        {!insights.citations.length && !insights.findings.length && !!insights.narratives.length && <Evidence item={insights.narratives[0]!} />}
        {!!insights.followUps.length && <section><h3 className="mb-4 font-medium">Other follow-up recorded</h3><div className="space-y-4">{insights.followUps.map((item, i) => <Evidence key={i} item={item} />)}</div></section>}
      <details className="border-t border-[#dce5e0] pt-3"><summary className="min-h-11 cursor-pointer py-3 text-[15px] font-semibold text-[#315848]">Read the full clean narrative</summary><div className="mt-4 space-y-5">{insights.narratives.map((item, i) => <Evidence key={i} item={item} />)}</div></details>
      <details><summary className="min-h-11 cursor-pointer py-3 text-[13px] text-[#718074]">View original source text</summary><pre className="mt-4 max-w-full whitespace-pre-wrap break-words font-sans text-[14px] leading-7">{licensingTextForDisplay(report.text)}</pre></details>
      <footer className="border-t border-[#dce5e0] pt-5 text-xs leading-6 text-[#718074]">
        <p className="break-words">Facility {report.licenseNumber}{report.controlNumber ? ` · Complaint ${report.controlNumber}` : ""}</p>
        <p>Archived {licensingDate(report.retrievedAt)} · Automated extraction from the state report</p>
        <div className="mt-4 grid gap-2 text-[#315b54] sm:flex sm:flex-wrap sm:gap-x-3"><a href={report.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d3e0d8] bg-white px-4 font-medium">State profile <ExternalLink size={13} /></a><button type="button" onClick={downloadText} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d3e0d8] bg-white px-4 font-medium"><Download size={14} /> Download original text</button></div>
      </footer>
    </div>
  </article>;
}
