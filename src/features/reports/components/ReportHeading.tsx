import type { ReactNode } from "react";
import type { FullReportDocument } from "../../../shared/types/fullReport";

export default function ReportHeading({ report, title, communityAsTitle = false, communityControl, periodControl, otherControls }: {
  report?: FullReportDocument | undefined;
  title?: string;
  communityAsTitle?: boolean;
  communityControl?: ReactNode;
  periodControl?: ReactNode;
  otherControls?: ReactNode;
}) {
  // Keep period and freshness distinct; the latest-period label already contains
  // the data-through date, so printing it twice adds no information.
  const isCommunity = report?.reportId === "community" || communityAsTitle;
  const periodLabel = report?.period.label.replace("Latest governed data through", "Through") ?? "";
  const periodIncludesDate = report && periodLabel.includes(report.dataThrough);
  const interactive = Boolean(communityControl || periodControl || otherControls);
  return (
    <header data-report-compact-header="true" data-report-inline-heading={interactive || undefined} data-community-heading={isCommunity || undefined} className="report-heading">
      <div className="report-heading__row">
        <div className="report-heading__identity">
          <h1 id="full-report-title">{title ?? (isCommunity ? report?.scope.label : report?.reportId === "residents" ? "Clients" : report?.title)}</h1>
          {communityAsTitle && communityControl}
        </div>
        {interactive && <div data-report-filters="true" className="report-heading__controls">
          {!communityAsTitle && communityControl}{periodControl}{otherControls}
        </div>}
      </div>
      {report && <div className="report-heading__context">
        <p>
          {periodControl ? <>Data through {report.dataThrough}</> : <>{periodLabel}{!periodIncludesDate ? <> · Data through {report.dataThrough}</> : null}</>}
        </p>
        <p className="report-heading__updated">Updated {report.generatedAtLabel}</p>
      </div>}
    </header>
  );
}
