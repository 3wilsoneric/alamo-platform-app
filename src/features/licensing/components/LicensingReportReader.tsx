import { useMemo } from "react";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";
import type { LicensingReport } from "../../../../shared/licensing-contracts.mjs";
import { licensingTextForDisplay } from "../../../../shared/licensing-contracts.mjs";
import { analyzeLicensingReport } from "../../../../shared/licensing-analysis.mjs";

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
  "Not stated": "An explicit complaint finding was not captured in the archived text. Open the original record below for the complete determination.",
  "Not applicable": ""
};

export default function LicensingReportReader({ report, community, onBack }: {
  report: LicensingReport; community: string; onBack: () => void;
}) {
  const insights = useMemo(() => analyzeLicensingReport(report), [report]);
  const { summary } = insights;
  const summarySentences: string[] = [];
  const outcomeSummary = outcomeMeaning[summary.outcome];
  if (outcomeSummary) summarySentences.push(outcomeSummary);
  if (summary.topics.length) summarySentences.push(`It covers ${summary.topics.join(", ").toLowerCase()}.`);
  if (summary.citationCount) {
    summarySentences.push(`The source contains ${summary.citationCount} cited ${summary.citationCount === 1 ? "deficiency" : "deficiencies"}${summary.correctionsCount ? ` and ${summary.correctionsCount} documented correction ${summary.correctionsCount === 1 ? "plan" : "plans"}` : ""}.`);
  } else if (summary.noDeficiencies) {
    summarySentences.push("No deficiencies were cited.");
  }
  if (insights.findings[0]?.text && !summarySentences.some((sentence) => sentence.includes(insights.findings[0]!.text))) {
    summarySentences.push(insights.findings[0].text);
  }
  if (!summarySentences.length) summarySentences.push("Open the original state record below for the complete report.");
  const summaryText = summarySentences.join(" ");

  function originalTextUrl() {
    return URL.createObjectURL(new Blob([licensingTextForDisplay(report.text)], { type: "text/plain;charset=utf-8" }));
  }

  function openText() {
    const url = originalTextUrl();
    const anchor = document.createElement("a");
    anchor.href = url; anchor.target = "_blank"; anchor.rel = "noopener noreferrer";
    anchor.click(); globalThis.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function downloadText() {
    const url = originalTextUrl();
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `CCLD-${report.licenseNumber}-${report.reportDate}-${report.id.slice(-8)}.txt`;
    anchor.click(); globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <article data-licensing-reader={report.id} className="min-w-0 bg-white font-sans text-[#111111]">
    <button type="button" onClick={onBack} className="mb-4 inline-flex min-h-11 items-center gap-2 text-[13px] font-medium text-[#333333] hover:text-[#0f8b73] lg:hidden"><ArrowLeft size={16} /> Back to reports</button>
    <header className="max-w-[900px]">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0f8b73]">{community} · {report.reportType}</p>
      <h2 className="mt-2 break-words !font-sans text-[30px] font-bold leading-[1.08] tracking-[-0.045em] sm:text-[36px]">{report.reportType} report</h2>
      <p className="mt-2 text-[12px] leading-5 text-[#6a6f6c]">{licensingDate(report.reportDate)} · License {report.licenseNumber}{report.controlNumber ? ` · Complaint ${report.controlNumber}` : ""}</p>
    </header>
    <section className="mt-6 max-w-[900px] rounded-xl bg-[#f6f8f7] px-5 py-5 sm:px-6">
      <h3 className="!font-sans text-[16px] font-semibold text-[#202321]">Summary</h3>
      <p className="mt-2 text-[14px] leading-7 text-[#3b403d] sm:text-[15px]">{summaryText}</p>
    </section>
    <div className="mt-6 flex max-w-[900px] flex-col gap-2 sm:flex-row sm:flex-wrap">
      <a href={report.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0f8b73] px-4 text-[13px] font-semibold text-white">Open state record <ExternalLink size={14} /></a>
      <button type="button" onClick={openText} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#cdd6d1] bg-white px-4 text-[13px] font-semibold text-[#315b54]">Open original text <ExternalLink size={14} /></button>
      <button type="button" onClick={downloadText} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#cdd6d1] bg-white px-4 text-[13px] font-semibold text-[#315b54]"><Download size={14} /> Download original text</button>
    </div>
    <p className="mt-5 text-[10px] leading-5 text-[#737373]">Archived {licensingDate(report.retrievedAt)} from the California state licensing record.</p>
  </article>;
}
