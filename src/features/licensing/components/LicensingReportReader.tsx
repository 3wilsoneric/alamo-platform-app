import { useMemo, useRef } from "react";
import { Download, ExternalLink } from "lucide-react";
import type { LicensingReport } from "../../../../shared/licensing-contracts.mjs";
import { analyzeLicensingReport } from "../../../../shared/licensing-analysis.mjs";
import type { LicensingEvidence } from "../../../../shared/licensing-analysis.mjs";
import { licensingReadingPages } from "../../../../shared/licensing-reading-view.mjs";

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
  "Not stated": "An explicit complaint finding was not captured in the archived text. Read the report below and check the state source for the determination.",
  "Not applicable": ""
};

function EvidenceList({ items, limit = 3, onSource }: {
  items: LicensingEvidence[]; limit?: number; onSource: (page?: number | null) => void;
}) {
  function rows(evidence: LicensingEvidence[]) {
    return <ul className="space-y-3">{evidence.map((item, index) => <li key={`${item.page}-${index}`} className="border-l-2 border-[#dbe6e1] pl-4">
      <p>{item.text}</p>
      <button type="button" onClick={() => onSource(item.page)} className="min-h-11 text-[12px] font-medium text-[#287261] underline underline-offset-4">{item.page ? `Source · page ${item.page}` : "Source text"}</button>
    </li>)}</ul>;
  }
  return <>{rows(items.slice(0, limit))}{items.length > limit && <details className="mt-3">
    <summary className="cursor-pointer py-3 text-sm font-semibold text-[#287261]">Read {items.length - limit} more {items.length - limit === 1 ? "excerpt" : "excerpts"}</summary>
    {rows(items.slice(limit))}
  </details>}</>;
}

export default function LicensingReportReader({ report, community }: {
  report: LicensingReport; community: string;
}) {
  const insights = useMemo(() => analyzeLicensingReport(report), [report]);
  const { summary } = insights;
  const readingPages = useMemo(() => licensingReadingPages(insights.narratives), [insights]);
  const sourceRef = useRef<HTMLElement>(null);

  function openSource(page?: number | null) {
    if (!sourceRef.current) return;
    const target = sourceRef.current.querySelector<HTMLElement>(`[data-source-page="${page}"]`) ?? sourceRef.current;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start", behavior: "auto" });
  }

  function downloadText() {
    const url = URL.createObjectURL(new Blob([report.text], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `CCLD-${report.licenseNumber}-${report.reportDate}-${report.id.slice(-8)}.txt`;
    anchor.click(); globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <article data-licensing-reader={report.id} className="min-w-0 bg-white font-sans text-[#111111]">
    <header className="max-w-[900px]">
      <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#0f8b73]">{community} · {report.reportType}</p>
      <h2 className="mt-2 break-words !font-sans text-[30px] font-bold leading-[1.08] tracking-[-0.045em] sm:text-[36px]">{report.reportType} report</h2>
      <p className="mt-3 break-words text-[14px] leading-6 text-[#606962]">{licensingDate(report.reportDate)} · License {report.licenseNumber}{report.controlNumber ? ` · Complaint ${report.controlNumber}` : ""}</p>
    </header>
    <section aria-label="Report summary" className="mt-6 max-w-[900px] rounded-xl border border-[#dce7e1] bg-[#f5f8f6] p-5 sm:p-6">
      <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#467060]">Summary</p>
      <h3 className="mt-2 !font-sans text-[23px] font-semibold leading-tight tracking-[-0.025em] text-[#202e27]">{summary.headline}</h3>
      {outcomeMeaning[summary.outcome] && <p className="mt-3 text-base leading-7 text-[#3b493f]">{outcomeMeaning[summary.outcome]}</p>}
      {summary.topics.length > 0 && <p className="mt-3 text-[14px] leading-6 text-[#53665a]"><strong className="font-semibold">Topics:</strong> {summary.topics.join(" · ")}</p>}
      <p className="mt-4 border-t border-[#dce7e1] pt-4 text-[15px] leading-6 text-[#3b493f]">{summary.citationCount
        ? `${summary.citationCount} cited ${summary.citationCount === 1 ? "deficiency" : "deficiencies"} · ${summary.correctionsCount} documented correction ${summary.correctionsCount === 1 ? "plan" : "plans"}`
        : summary.noDeficiencies ? "The report states that no deficiencies were cited." : "No citation details were extracted. Check the original for the complete record."}</p>
      {summary.reviewNeeded && <p className="mt-2 text-sm leading-6 text-[#735b33]">Some details could not be reliably separated from the state form. Review the original alongside this brief.</p>}
    </section>
    <div className="mt-5 flex max-w-[900px] flex-col gap-2 sm:flex-row sm:flex-wrap">
      <button type="button" onClick={() => openSource()} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#cdd6d1] px-4 text-[13px] font-semibold text-[#315b54]">Read report text</button>
      <a href={report.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0f8b73] px-4 text-[13px] font-semibold text-white">Open original on state site <ExternalLink size={14} /></a>
      <button type="button" onClick={downloadText} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#cdd6d1] bg-white px-4 text-[13px] font-semibold text-[#315b54]"><Download size={14} /> Download original text</button>
    </div>
    <p className="mt-2 max-w-[900px] text-[12px] leading-5 text-[#68716b]">The state link opens the facility’s report list. Select the {report.reportType.toLowerCase()} report dated {licensingDate(report.reportDate)}{report.controlNumber ? `, complaint ${report.controlNumber}` : ""}.</p>
    <div className="licensing-brief-sections mt-7 max-w-[900px] space-y-7 text-base leading-7 text-[#37463e]">
      {insights.allegations.length > 0 && <section aria-label="Reported concerns">
        <h3>Reported concerns</h3>
        <p className="mb-3 text-sm text-[#68716b]">Allegations recorded in the report; the state’s findings appear below.</p>
        <EvidenceList items={insights.allegations} onSource={openSource} />
      </section>}
      {(insights.findings.length > 0 || insights.narratives.length > 0) && <section aria-label="State findings">
        <h3>{insights.findings.length ? "What the state found" : "Visit notes"}</h3>
        <EvidenceList items={insights.findings.length ? insights.findings : insights.narratives} limit={3} onSource={openSource} />
      </section>}
      {insights.citations.length > 0 && <section aria-label="Deficiencies and correction plans">
        <h3>Deficiencies & correction plans</h3>
        <p className="mb-4 text-sm leading-6 text-[#68716b]">Plans and due dates are from this report. They do not establish whether a correction is currently complete.</p>
        <div className="space-y-4">{insights.citations.map((citation, index) => <article key={index} className="rounded-lg border border-[#dce2dd] p-4 sm:p-5">
          <h4 className="!font-sans text-base font-semibold text-[#263c30]">{citation.type} · Section {citation.regulation}</h4>
          {citation.disposition && <p className="mt-1 text-sm font-semibold text-[#735b33]">{citation.disposition}</p>}
          <dl className="mt-4 space-y-4">
            <div><dt className="text-sm font-semibold text-[#526259]">Cited deficiency</dt><dd className="mt-1">{citation.description || "The deficiency could not be separated reliably. Read the source excerpt below."}</dd></div>
            <div><dt className="text-sm font-semibold text-[#526259]">Plan of correction</dt><dd className="mt-1">{citation.correction || "A correction plan was not extracted. Check the original."}</dd></div>
            {citation.dueDate && <div><dt className="text-sm font-semibold text-[#526259]">Due date recorded in this report</dt><dd>{licensingDate(citation.dueDate)}</dd></div>}
          </dl>
          <details className="mt-3"><summary className="cursor-pointer py-3 text-sm font-semibold text-[#287261]">Source excerpt{citation.page ? ` · page ${citation.page}` : ""}</summary><p className="whitespace-pre-wrap text-sm leading-6">{citation.excerpt}</p></details>
        </article>)}</div>
      </section>}
      {insights.followUps.length > 0 && <section aria-label="Follow-up recorded"><h3>Follow-up recorded</h3><EvidenceList items={insights.followUps} onSource={openSource} /></section>}
    </div>
    <section ref={sourceRef} tabIndex={-1} aria-label="Report text" className="licensing-report-document mt-8 scroll-mt-32" data-licensing-source-text="true">
      <header className="licensing-report-document__header">
        <h3>Report text</h3>
        <p>The state’s narrative, formatted for reading. Form headers, signatures, and standard notices are available in the original.</p>
      </header>
      <div className="licensing-report-document__body">
        {readingPages.length ? readingPages.map(({ page, blocks }) => <section key={page ?? "unpaged"} data-source-page={page ?? "unpaged"} tabIndex={-1} className="licensing-report-page scroll-mt-32" aria-label={page ? `Narrative from page ${page}` : "Report narrative"}>
          <h4>{page ? `Page ${page}` : "Report narrative"}</h4>
          <div className="licensing-report-prose">{blocks.map((block, index) => block.kind === "heading"
            ? <h5 key={index}>{block.text}</h5>
            : block.kind === "list-item" ? <ul key={index}><li>{block.text}</li></ul>
              : <p key={index}>{block.text}</p>)}</div>
        </section>) : <p>The narrative could not be separated reliably from this form. Open the state source or download the original text to read the report.</p>}
      </div>
      <footer className="licensing-report-document__footer">Archived {licensingDate(report.retrievedAt)} · <button type="button" onClick={downloadText}>Download complete original text</button></footer>
    </section>
  </article>;
}
