import { useEffect, useRef, useState } from "react";
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

export default function ReportsPage({
  embedded = false,
  active = true
}: ReportsPageProps) {
  const [selectedReportId, setSelectedReportId] = useState<FullReportId>("overview");
  const [reportDefinitions, setReportDefinitions] = useState<FullReportDefinition[]>([]);
  const [selectedFacilityId, setSelectedFacilityId] = useState("");
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
  const reportLibraryRef = useRef<HTMLDivElement>(null);

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
        const visibleReports = definitionValue.reports.filter(
          (report) => report.showInAnalyticsNav
        );
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
    const library = reportLibraryRef.current;
    if (!library || library.scrollWidth <= library.clientWidth) return;
    const selectedButton = library.querySelector<HTMLElement>('[aria-pressed="true"]');
    selectedButton?.scrollIntoView({ block: "nearest", inline: "start" });
  }, [reportDefinitions, selectedReportId]);

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
        setReportPackage(value);
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

  return (
    <div
      data-reports-page="true"
      data-analytics-page="true"
      data-reports-embedded={embedded ? "true" : "false"}
      className={`mx-auto min-w-0 w-full max-w-[1432px] bg-white pb-12 text-[#111111] ${
        embedded ? "min-h-full" : ""
      }`}
    >
      <div className="grid min-w-0 gap-6 pt-2 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)] xl:gap-8">
        <aside aria-label="Analytics" className="min-w-0">
          <p className="border-b-2 border-[#111111] pb-2 font-sans text-[26px] font-bold leading-none tracking-[-0.045em]">
            Analytics
          </p>
          <p className="mt-2 text-[11px] leading-4 text-[#595959]">
            Choose an analysis to review.
          </p>
          <div
            ref={reportLibraryRef}
            data-analytics-report-library="true"
            className="mt-3 flex snap-x gap-2 overflow-x-auto border-y border-[#111111] py-2 md:block md:overflow-visible md:border-b-0 md:py-0"
          >
            {reportDefinitions.map((report) => {
              const selected = report.id === selectedReportId;
              return (
                <button
                  type="button"
                  key={report.id}
                  onClick={() => selectReport(report.id)}
                  aria-pressed={selected}
                  className={`grid min-w-[210px] snap-start grid-cols-[3px_minmax(0,1fr)] gap-3 border border-[#d9d9d9] py-3 pr-2 text-left transition-colors md:w-full md:min-w-0 md:border-x-0 md:border-t-0 ${
                    selected ? "bg-[#f5f4ef]" : "hover:bg-[#fafafa]"
                  }`}
                >
                  <span className={selected ? "bg-[#0f8b73]" : "bg-transparent"} aria-hidden="true" />
                  <span>
                    <span className="block font-sans text-[14px] font-bold leading-5 tracking-[-0.025em]">{report.title}</span>
                    <span className="mt-1 block text-[10px] leading-4 text-[#737373]">
                      {report.cadence} | {report.audience}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <main
          className="min-w-0"
          aria-busy={loadingData || loadingReport}
        >
          <div className="mb-5 border-b border-[#d9d9d9] pb-4">
            <p className="max-w-[780px] font-sans text-[13px] leading-5 text-[#3f3f3f]">
              {selectedReport?.description ?? "Loading the governed analytics catalog."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {supportsCommunityScope ? (
                <select
                  aria-label="Report community"
                  value={selectedFacilityId}
                  onChange={(event) => {
                    setSelectedFacilityId(event.target.value);
                    setSelectedPeriod("");
                    setPeriodOptions([]);
                  }}
                  className="min-w-[230px] border border-[#b3b3b3] bg-white px-3 py-2 text-[11px] font-semibold outline-none focus:border-[#0f8b73]"
                >
                  {!requiresCommunityScope ? <option value="">All communities</option> : null}
                  {(dashboard?.communities ?? []).map((community) => (
                    <option key={community.facility_id} value={community.facility_id}>
                      {community.community_name}
                    </option>
                  ))}
                </select>
              ) : null}
              {supportsPeriod ? (
                <select
                  aria-label="Report period"
                  value={selectedPeriod}
                  onChange={(event) => setSelectedPeriod(event.target.value)}
                  className="min-w-[170px] border border-[#b3b3b3] bg-white px-3 py-2 text-[11px] font-semibold outline-none focus:border-[#0f8b73]"
                >
                  <option value="">Latest governed period</option>
                  {periodOptions.map((period) => (
                    <option key={period} value={period}>
                      {formatMonthLabel(period, { fallback: period })}
                    </option>
                  ))}
                </select>
              ) : null}
              {audienceOptions.length ? (
                <select
                  aria-label="Report audience"
                  value={selectedAudience || audienceOptions[0]?.id || ""}
                  onChange={(event) => setSelectedAudience(event.target.value)}
                  className="min-w-[230px] border border-[#b3b3b3] bg-white px-3 py-2 text-[11px] font-semibold outline-none focus:border-[#0f8b73]"
                >
                  {audienceOptions.map((audience) => (
                    <option key={audience.id} value={audience.id}>
                      {audience.label}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </div>

          {loadingData || loadingReport ? (
            <div
              role="status"
              aria-live="polite"
              className="min-h-[220px] border-t-2 border-[#0f8b73] py-16 text-center"
            >
              <span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-[#d9d9d9] border-t-[#0f8b73]" />
              <p className="mt-3 text-[12px] text-[#595959]">Compiling the governed report.</p>
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
            <FullReportReader report={reportPackage.report} />
          ) : null}
        </main>
      </div>
    </div>
  );
}
