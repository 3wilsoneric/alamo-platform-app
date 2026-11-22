import { ALAMO_FACILITIES } from "../../../../shared/community-names.mjs";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AnalyticsReportTabs, { ANALYTICS_REPORT_TABS } from "../components/AnalyticsReportTabs";
import ReportHeading from "../components/ReportHeading";
import "../components/platform-design-pass.css";
import FullReportReader from "../components/FullReportReader";
import {
  fetchHomeDashboard,
  type HomeDashboardResponse
} from "../../../shared/api/platformData";
import {
  createFullReport,
  fetchFullReportDefinitions
} from "../../../shared/api/fullReports";
import type {
  FullReportDefinition,
  FullReportId,
  FullReportPackage
} from "../../../shared/types/fullReport";
import { formatMonthLabel } from "../../../../shared/period-utils.mjs";

interface ReportsPageProps {
  embedded?: boolean;
  active?: boolean;
}

function normalizeOverviewTitle<T extends { id?: string; reportId?: string; title: string }>(value: T): T {
  return value.id === "overview" || value.reportId === "overview"
    ? { ...value, title: "Overview" }
    : value;
}

export default function ReportsPage({
  embedded = false,
  active = true
}: ReportsPageProps) {
  const [selectedReportId, setSelectedReportId] = useState<FullReportId>("overview");
  const [searchParams, setSearchParams] = useSearchParams();
  const routeReportId = searchParams.get("report");
  const [reportDefinitions, setReportDefinitions] = useState<FullReportDefinition[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState("");
  const [flowYear, setFlowYear] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [selectedAudience, setSelectedAudience] = useState("");
  const [dashboard, setDashboard] = useState<HomeDashboardResponse | null>(null);
  const [reportPackage, setReportPackage] = useState<FullReportPackage | null>(null);
  const [periodOptions, setPeriodOptions] = useState<string[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState("");
  const [dataRequestVersion, setDataRequestVersion] = useState(0);
  const [reportRequestVersion, setReportRequestVersion] = useState(0);
  const communityFilterRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (ANALYTICS_REPORT_TABS.some(({ id }) => id === routeReportId)) {
      setSelectedReportId(routeReportId as FullReportId);
    } else if (!routeReportId) {
      setSelectedReportId("overview");
    }
  }, [routeReportId]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setLoadingData(true);
    setError("");
    Promise.all([
      fetchHomeDashboard(controller.signal),
      fetchFullReportDefinitions(controller.signal)
    ])
      .then(([dashboardValue, definitionValue]) => {
        const visibleReports = definitionValue.reports
          .filter((report) => ANALYTICS_REPORT_TABS.some(({ id }) => id === report.id))
          .map(normalizeOverviewTitle);
        setDashboard(dashboardValue);
        setReportDefinitions(visibleReports);
        setSelectedReportId((currentReportId) =>
          visibleReports.some((report) => report.id === currentReportId)
            ? currentReportId
            : visibleReports[0]?.id ?? "overview"
        );
      })
      .catch((loadError) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : "Report data could not be loaded.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingData(false);
      });
    return () => controller.abort();
  }, [active, dataRequestVersion]);

  const selectedReport =
    reportDefinitions.find((report) => report.id === selectedReportId) ?? null;
  const supportsCommunityScope = selectedReportId !== "overview";
  const requiresCommunityScope = selectedReportId === "community";
  const supportsPeriod = selectedReportId !== "residents";
  const audienceOptions = selectedReport?.audienceOptions ?? [];

  useEffect(() => {
    if (!active || loadingData || !dashboard || !selectedReport) return;
    if (requiresCommunityScope && !selectedFacilityId) return;
    const controller = new AbortController();
    setLoadingReport(true);
    setError("");
    setReportPackage(null);

    createFullReport(
      {
        reportId: selectedReportId,
        ...(supportsCommunityScope && selectedFacilityId ? { facilityId: selectedFacilityId } : {}),
        ...(selectedPeriod ? { period: selectedPeriod } : {}),
        ...(selectedAudience ? { audience: selectedAudience } : {})
      },
      controller.signal
    )
      .then((value) => {
        setReportPackage({
          ...value,
          report: normalizeOverviewTitle(value.report)
        });
        setPeriodOptions(value.availablePeriods);
      })
      .catch((reportError) => {
        if (!controller.signal.aborted) {
          setError(reportError instanceof Error ? reportError.message : "The report could not be compiled.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingReport(false);
      });
    return () => controller.abort();
  }, [
    active,
    dashboard,
    loadingData,
    requiresCommunityScope,
    selectedFacilityId,
    selectedPeriod,
    selectedReportId,
    selectedReport,
    selectedAudience,
    supportsCommunityScope,
    reportRequestVersion
  ]);

  function selectReport(reportId: FullReportId) {
    if (reportId === selectedReportId) return;
    setSelectedReportId(reportId);
    setSearchParams((previous) => { const next = new URLSearchParams(previous); next.set("report", reportId); return next; }, { replace: true });
    setSelectedPeriod("");
    setPeriodOptions([]);
    const nextDefinition = reportDefinitions.find((report) => report.id === reportId);
    setSelectedAudience(nextDefinition?.audienceOptions?.[0]?.id ?? "");
    if (reportId === "community") {
      setSelectedFacilityId(dashboard?.communities[0]?.facility_id ?? "");
      return;
    }
    setSelectedFacilityId("");
  }

  function retryReport() {
    if (!dashboard) {
      setDataRequestVersion((version) => version + 1);
      return;
    }
    setReportRequestVersion((version) => version + 1);
  }

  const communityControl = supportsCommunityScope ? (
    <label data-report-filter-field="community" className="report-heading__select">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.13em] text-[#67736f]">Community</span>
      <span className="report-heading__select-face">
        <span aria-hidden="true" className="report-heading__select-value">{ALAMO_FACILITIES.find(facility => facility.facilityId === selectedFacilityId)?.shortName ?? "All communities"}</span>
        <select
          ref={communityFilterRef}
          aria-label="Report community"
          value={selectedFacilityId}
          onChange={(event) => {
            setSelectedFacilityId(event.target.value);
            setSelectedPeriod("");
            setPeriodOptions([]);
          }}
          className="report-heading__native-select"
        >
          {!requiresCommunityScope ? <option value="">All communities</option> : null}
          {(dashboard?.communities ?? []).map((community) => (
            <option key={community.facility_id} value={community.facility_id}>
              {ALAMO_FACILITIES.find((item) => item.facilityId === community.facility_id)?.shortName ?? community.community_name}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4f625d]" />
      </span>
    </label>
  ) : null;
  const periodControl = supportsPeriod ? (
    <label data-report-filter-field="period" className="report-heading__select">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.13em] text-[#67736f]">Period</span>
      <span className="report-heading__select-face">
        <span aria-hidden="true" className="report-heading__select-value">{selectedPeriod ? formatMonthLabel(selectedPeriod, { fallback: selectedPeriod }) : reportPackage?.report.period.value ? formatMonthLabel(reportPackage.report.period.value, { fallback: "Latest available period" }) : "Latest available period"}</span>
        <select
          aria-label="Report period"
          value={selectedPeriod}
          onChange={(event) => setSelectedPeriod(event.target.value)}
          className="report-heading__native-select"
        >
          <option value="">Latest available period</option>
          {periodOptions.map((period) => (
            <option key={period} value={period}>
              {formatMonthLabel(period, { fallback: period })}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4f625d]" />
      </span>
    </label>
  ) : null;
  const audienceControl = audienceOptions.length ? (
    <label data-report-filter-field="audience" className="report-heading__select">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.13em] text-[#67736f]">Audience</span>
      <span className="report-heading__select-face">
        <span aria-hidden="true" className="report-heading__select-value">{audienceOptions.find(audience => audience.id === selectedAudience)?.label ?? audienceOptions[0]?.label}</span>
        <select
          aria-label="Report audience"
          value={selectedAudience || audienceOptions[0]?.id || ""}
          onChange={(event) => setSelectedAudience(event.target.value)}
          className="report-heading__native-select"
        >
          {audienceOptions.map((audience) => (
            <option key={audience.id} value={audience.id}>
              {audience.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#4f625d]" />
      </span>
    </label>
  ) : null;

  return (
    <div
      data-reports-page="true"
      data-analytics-page="true"
      data-reports-embedded={embedded ? "true" : "false"}
      className={`mx-auto min-w-0 w-full max-w-[1500px] bg-white pb-12 text-[#16283a] ${
        embedded ? "min-h-full" : ""
      }`}
    >
      <div className="min-w-0">
        <AnalyticsReportTabs active={selectedReportId} onSelectReport={selectReport} />

        <main
          className="min-w-0 pt-4"
          aria-busy={loadingData || loadingReport}
        >
          <ReportHeading
            report={reportPackage?.report}
            title={selectedReportId === "residents" ? "Clients" : selectedReportId === "community" ? ALAMO_FACILITIES.find(facility => facility.facilityId === selectedFacilityId)?.shortName ?? "Community" : selectedReport?.title ?? "Overview"}
            communityAsTitle={requiresCommunityScope}
            communityControl={communityControl}
            periodControl={periodControl}
            otherControls={audienceControl}
          />

          {loadingData || loadingReport ? (
            <div
              role="status"
              aria-live="polite"
              className="min-h-[220px] border-t-2 border-[#0f8b73] py-16 text-center"
            >
              <span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-[#d9d9d9] border-t-[#0f8b73]" />
              <p className="mt-3 text-[12px] text-[#595959]">
                Compiling the governed report.
              </p>
            </div>
          ) : error ? (
            <div role="alert" className="min-h-[220px] border-t-2 border-[#a63d2f] py-8">
              <h2 className="!font-sans text-[25px] font-bold tracking-[-0.035em]">This report could not be compiled.</h2>
              <p className="mt-2 max-w-[680px] text-[13px] leading-5 text-[#595959]">{error}</p>
              <button
                type="button"
                onClick={retryReport}
                className="mt-5 border border-[#111111] bg-[#111111] px-4 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-white hover:text-[#111111] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0f8b73]"
              >
                Try again
              </button>
            </div>
          ) : reportPackage ? (
            <FullReportReader hideHeading flowYear={flowYear} onFlowYearChange={setFlowYear} report={reportPackage.report} onCommunityChange={facilityId => { setSelectedFacilityId(facilityId); communityFilterRef.current?.focus(); }} />
          ) : null}
        </main>
      </div>
    </div>
  );
}
