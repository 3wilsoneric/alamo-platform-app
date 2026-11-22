import { Link } from "react-router-dom";
import type { FullReportId } from "../../../shared/types/fullReport";
import { useLicensingAccess } from "../../../shared/auth/licensingAccess";

export const ANALYTICS_REPORT_TABS: Array<{ id: FullReportId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "census", label: "Census & flow" },
  { id: "incidents", label: "Incidents" },
  { id: "residents", label: "Clients" }
];

export default function AnalyticsReportTabs({ active, onSelectReport }: {
  active: FullReportId | "licensing";
  onSelectReport?: (id: FullReportId) => void;
}) {
  const canViewLicensing = useLicensingAccess();
  return <nav aria-label="Analytics reports" className="analytics-report-tabs">
    <div className="analytics-report-tabs__scroller" data-analytics-report-library="true">
      {ANALYTICS_REPORT_TABS.map(({ id, label }) => onSelectReport ? (
        <button type="button" key={id} data-analytics-report-option={id}
          aria-pressed={active === id} onClick={() => onSelectReport(id)}>{label}</button>
      ) : (
        <Link key={id} to={`/analytics?report=${id}`} data-analytics-report-option={id}>{label}</Link>
      ))}
      {canViewLicensing ? <Link to="/analytics/licensing" data-analytics-report-option="licensing"
        aria-current={active === "licensing" ? "page" : undefined}>Licensing</Link> : null}
    </div>
  </nav>;
}
