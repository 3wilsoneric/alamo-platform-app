import { ALAMO_FACILITIES } from "../../../../shared/community-names.mjs";
import { ChevronDown } from "lucide-react";
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
        const visibleReports = definitionValue.reports
          .filter((report) => report.showInAnalyticsNav)
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
      <div className="grid min-w-0 gap-6 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)] xl:gap-8">
        <aside aria-label="Analytics" className="min-w-0">
          <p className="text-[11px] leading-4 text-[#595959]">
            Choose an analysis to review.
          </p>
          <label className="mt-2 block lg:hidden" htmlFor="mobile-report-choice">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.13em] text-[#67736f]">
              Report
            </span>
            <span className="relative block">
              <select
                id="mobile-report-choice"
                data-mobile-report-choice="true"
                aria-label="Choose a report"
                value={selectedReportId}
                onChange={(event) => selectReport(event.currentTarget.value as FullReportId)}
                className="min-h-12 w-full appearance-none rounded-lg border border-[#bfd1cb] bg-[#eef4f1] px-3 pr-10 font-sans text-base font-semibold text-[#315b54] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]"
              >
                {reportDefinitions.map((report) => (
                  <option key={report.id} value={report.id}>{report.title}</option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#315b54]" />
            </span>
          </label>
          <div
            ref={reportLibraryRef}
            data-analytics-report-library="true"
            className="mt-3 hidden border-y border-[#111111] py-2 lg:block lg:overflow-visible lg:border-b-0 lg:py-0"
          >
            {reportDefinitions.map((report) => {
              const selected = report.id === selectedReportId;
              return (
                <button
                  type="button"
                  key={report.id}
                  onClick={() => selectReport(report.id)}
                  aria-pressed={selected}
                  data-analytics-report-option={report.id}
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
            <div data-report-filters="true" className="mt-4 grid gap-3 sm:flex sm:flex-wrap sm:items-end">
              {supportsCommunityScope ? (
                <label data-report-filter-field="community" className="block min-w-0 sm:min-w-[230px]">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.13em] text-[#67736f]">Community</span>
                  <span className="relative block">
                    <select
                      aria-label="Report community"
                      value={selectedFacilityId}
                      onChange={(event) => {
                        setSelectedFacilityId(event.target.value);
                        setSelectedPeriod("");
                        setPeriodOptions([]);
                      }}
                      className="min-h-11 w-full min-w-0 appearance-none rounded-lg border border-[#c7d3ce] bg-[#f7faf8] px-3 pr-9 text-base font-semibold text-[#243b36] outline-none transition-colors focus:border-[#0f8b73] sm:text-sm"
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
              ) : null}
              {supportsPeriod ? (
                <label data-report-filter-field="period" className="block min-w-0 sm:min-w-[190px]">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.13em] text-[#67736f]">Period</span>
                  <span className="relative block">
                    <select
                      aria-label="Report period"
                      value={selectedPeriod}
                      onChange={(event) => setSelectedPeriod(event.target.value)}
                      className="min-h-11 w-full min-w-0 appearance-none rounded-lg border border-[#c7d3ce] bg-[#f7faf8] px-3 pr-9 text-base font-semibold text-[#243b36] outline-none transition-colors focus:border-[#0f8b73] sm:text-sm"
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
              ) : null}
              {audienceOptions.length ? (
                <label data-report-filter-field="audience" className="block min-w-0 sm:min-w-[230px]">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.13em] text-[#67736f]">Audience</span>
                  <span className="relative block">
                    <select
                      aria-label="Report audience"
                      value={selectedAudience || audienceOptions[0]?.id || ""}
                      onChange={(event) => setSelectedAudience(event.target.value)}
                      className="min-h-11 w-full min-w-0 appearance-none rounded-lg border border-[#c7d3ce] bg-[#f7faf8] px-3 pr-9 text-base font-semibold text-[#243b36] outline-none transition-colors focus:border-[#0f8b73] sm:text-sm"
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
            <FullReportReader report={reportPackage.report} />
          ) : null}
        </main>
      </div>
    </div>
  );
}
