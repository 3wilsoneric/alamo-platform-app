import type { FullReportDocument } from "../../../shared/types/fullReport";

export default function ReportHeading({ report }: { report: FullReportDocument }) {
  // Keep period and freshness distinct; the latest-period label already contains
  // the data-through date, so printing it twice adds no information.
  const isCommunity = report.reportId === "community";
  const periodIncludesDate = report.period.label.includes(report.dataThrough);
  return (
    <header data-report-compact-header="true" data-community-heading={isCommunity || undefined} className="report-heading">
      <h1 id="full-report-title">{isCommunity ? report.scope.label : report.title}</h1>
      <div className="report-heading__context">
        <p>
          {report.period.label}
          {!periodIncludesDate ? <> · Data through {report.dataThrough}</> : null}
        </p>
        <p className="report-heading__updated">Updated {report.generatedAtLabel}</p>
      </div>
    </header>
  );
}
