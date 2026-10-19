import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import type { LicensingLibrary } from "../../../../shared/licensing-contracts.mjs";
import { licensingQuestions } from "../licensingQuestions";
import { licensingDate } from "./LicensingReportReader";

export default function LicensingReportModule({ library, question, q, community, onSelect }: {
  library: LicensingLibrary; question: string; q: string; community: string; onSelect: (id: string) => void;
}) {
  const [limit, setLimit] = useState(8);
  const selected = licensingQuestions.find(item => item.id === question);
  const reports = question === "latest" ? library.reports.slice(0, 8) : library.reports;
  const scope = library.communities.find(item => item.facilityId === community)?.name ?? "All communities";
  const newest = reports[0]?.reportDate;
  const oldest = reports[reports.length - 1]?.reportDate;
  const dates = newest && oldest ? `${licensingDate(oldest)}${newest !== oldest ? ` to ${licensingDate(newest)}` : ""}` : "";
  const citationCount = reports.reduce((sum, item) => sum + (item.analysis?.citationCount ?? 0), 0);
  const correctionCount = reports.reduce((sum, item) => sum + (item.analysis?.correctionsCount ?? 0), 0);
  return <section aria-label="Licensing answer" data-licensing-module="true" className="licensing-answer">
    <header>
      <p className="licensing-answer__eyebrow">Licensing · {scope}</p>
      <h2>{selected?.title ?? "Reports matching your question"}</h2>
      {q && <p className="licensing-answer__question">“{q}”</p>}
      <p className="licensing-answer__summary" role="status">{reports.length
        ? `${reports.length} ${question === "latest" ? "latest " : "matching "}state ${reports.length === 1 ? "report" : "reports"}, dated ${dates}. Open a report for its findings, correction plans, and source text.`
        : "I couldn’t find a matching report in the collected state records. Try another community, topic, finding, or year."}</p>
      {!!reports.length && <p className="licensing-answer__evidence">{citationCount} cited {citationCount === 1 ? "deficiency" : "deficiencies"} · {correctionCount} recorded correction {correctionCount === 1 ? "plan" : "plans"}<span>Counts are from these reports. Historical plans do not establish current completion.</span></p>}
    </header>
    <ul aria-label="Licensing reports" className="licensing-answer__reports">{reports.slice(0, limit).map(report => <li key={report.id}>
      <button type="button" onClick={() => onSelect(report.id)}>
        <span className="licensing-answer__report-context">{library.communities.find(item => item.facilityId === report.facilityId)?.name} · {report.reportType}<span>{licensingDate(report.reportDate)}</span></span>
        <span className="licensing-answer__report-title">{report.analysis?.headline ?? report.title}<ArrowUpRight size={19} aria-hidden="true" /></span>
        {!!report.analysis?.topics.length && <span className="licensing-answer__topics">{report.analysis.topics.join(" · ")}</span>}
        <span className="licensing-answer__open">Read report</span>
      </button>
    </li>)}</ul>
    {limit < reports.length && <button type="button" className="licensing-answer__more" onClick={() => setLimit(limit + 8)}>Show {Math.min(8, reports.length - limit)} more reports</button>}
    <footer>State records archived {licensingDate(library.collectedAt)}. Open Updates for the latest check.</footer>
  </section>;
}
