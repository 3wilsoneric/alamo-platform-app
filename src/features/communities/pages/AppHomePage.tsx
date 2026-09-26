import { useEffect, useMemo, useState } from "react";
import {
  PLATFORM_DATA_REFRESH_EVENT,
  fetchCommunitiesDashboard,
  fetchHomeDashboard,
  fetchAnalyticsSummary,
  type HomeDashboardResponse,
  type LiveCommunityResidentRecord,
  type LiveCommunitiesDashboardResponse,
  type ReportsSummaryResponse
} from "../../../shared/api/platformData";
import {
  ResidentDrilldownModal,
  type ResidentDrilldownIncident
} from "../../../shared/ui/ResidentDrilldownModal";
import {
  SeriesDrilldownModal
} from "../../../shared/ui/SeriesDrilldownModal";
import { surfaceInPlatformCanvas } from "../../../shared/canvas/canvasEvents";
import { getCommunitiesDashboardDataThroughLabel } from "../../../shared/dataFreshness";
import { CensusMovementModule } from "../../../shared/modules/CensusMovementModule";
import { MedicationComplianceModule } from "../../../shared/modules/MedicationComplianceModule";
import { DiagnosisMixModule } from "../../../shared/modules/DiagnosisMixModule";
import { getTopCounts } from "../../../shared/data/counts";
import { formatMonthLabel as formatSharedMonthLabel } from "../../../../shared/period-utils.mjs";
import {
  DiagnosisDrilldownModal,
  IncidentCategoryDrilldownModal,
  MedicationComplianceDrilldownModal
} from "../components/AppHomeDrilldowns";
import { getLatestCommunityCensusRows } from "../appHomeCensusModel";
import { getIncidentMonthCommunityBreakdown } from "../appHomeIncidentModel";
import {
  DashboardSummarySlider,
  MiniTrend,
  SliderDataCard,
  SliderRows
} from "../components/AppHomeSummarySlider";

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

const formatMonthLabel = (value?: string) => formatSharedMonthLabel(value, { fallback: "—", month: "long" });

function openCommunityProfile(facilityId: string, communityName: string) {
  surfaceInPlatformCanvas({ route: `/communities/${facilityId}`, sourceLabel: communityName, introText: null });
}

export default function AppHomePage() {
  const [dashboard, setDashboard] = useState<HomeDashboardResponse | null>(null);
  const [communitiesDashboard, setCommunitiesDashboard] = useState<LiveCommunitiesDashboardResponse | null>(null);
  const [reportsSummary, setReportsSummary] = useState<ReportsSummaryResponse | null>(null);
  const [overviewUnavailable, setOverviewUnavailable] = useState(false);
  const [communityDetailUnavailable, setCommunityDetailUnavailable] = useState(false);
  const [medicationSummaryUnavailable, setMedicationSummaryUnavailable] = useState(false);
  const [selectedIncidentMonthLabel, setSelectedIncidentMonthLabel] = useState<string | null>(null);
  const [selectedComplianceFacilityId, setSelectedComplianceFacilityId] = useState<string | null>(null);
  const [selectedIncidentCategory, setSelectedIncidentCategory] = useState<string | null>(null);
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<string | null>(null);
  const [selectedResident, setSelectedResident] = useState<LiveCommunityResidentRecord | null>(null);

  useEffect(() => {
    let active = true;
    let requestController: AbortController | null = null;
    let analyticsTimer: number | null = null;

    const loadDashboard = () => {
      requestController?.abort();
      if (analyticsTimer !== null) window.clearTimeout(analyticsTimer);
      const controller = new AbortController();
      requestController = controller;

      const isCurrentRequest = () => active && !controller.signal.aborted;
      fetchHomeDashboard(controller.signal).then((value) => {
        if (!isCurrentRequest()) return;
        setDashboard(value);
        setOverviewUnavailable(false);
      }).catch((reason) => {
        if (!isCurrentRequest()) return;
        console.warn("Dashboard data is unavailable.", reason);
        setOverviewUnavailable(true);
      });

      fetchCommunitiesDashboard(controller.signal).then((value) => {
        if (!isCurrentRequest()) return;
        setCommunitiesDashboard(value);
        setCommunityDetailUnavailable(false);
      }).catch((reason) => {
        if (!isCurrentRequest()) return;
        console.warn("Communities dashboard data is unavailable.", reason);
        setCommunityDetailUnavailable(true);
      });

      analyticsTimer = window.setTimeout(() => {
        analyticsTimer = null;
        if (!isCurrentRequest()) return;
        fetchAnalyticsSummary(controller.signal).then((value) => {
          if (!isCurrentRequest()) return;
          setReportsSummary(value);
          setMedicationSummaryUnavailable(false);
        }).catch((reason) => {
          if (!isCurrentRequest()) return;
          console.warn("Medication summary data is unavailable.", reason);
          setMedicationSummaryUnavailable(true);
        });
      }, 900);
    };

    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") {
        loadDashboard();
      }
    };

    loadDashboard();
    window.addEventListener("focus", loadDashboard);
    window.addEventListener(PLATFORM_DATA_REFRESH_EVENT, loadDashboard);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      active = false;
      requestController?.abort();
      if (analyticsTimer !== null) window.clearTimeout(analyticsTimer);
      window.removeEventListener("focus", loadDashboard);
      window.removeEventListener(PLATFORM_DATA_REFRESH_EVENT, loadDashboard);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, []);

  const incidentSeries = useMemo(
    () =>
      dashboard
        ? dashboard.incidentTrend.map((point) => ({
            label: formatMonthLabel(point.month_bucket),
            value: point.incidentCount,
            month_bucket: point.month_bucket
          }))
        : [],
    [dashboard]
  );

  const portfolioDiagnosisMix = useMemo(
    () =>
      getTopCounts(communitiesDashboard?.residents ?? [], (resident) => resident.primary_diagnosis, 5),
    [communitiesDashboard]
  );

  const medicationWatch = useMemo(() => {
    if (!reportsSummary) {
      return {
        complianceLeaders: [] as Array<{ facilityId: string; facilityName: string; compliancePct: number }>
      };
    }

    const latestComplianceMonth = [...new Set(reportsSummary.medicationCompliance.map((row) => row.month_bucket))]
      .sort()
      .at(-1);

    const complianceLeaders = reportsSummary.medicationCompliance
      .filter((row) => row.month_bucket === latestComplianceMonth)
      .sort((left, right) => left.compliance_pct - right.compliance_pct)
      .slice(0, 5)
      .map((row) => ({
        facilityId: row.facility_id,
        facilityName: row.facility_name,
        compliancePct: row.compliance_pct
      }));

    return {
      complianceLeaders
    };
  }, [reportsSummary]);

  const communityMovers = useMemo(() => {
    if (!communitiesDashboard) return [];

    const latestCensusMonth = [...new Set(communitiesDashboard.census.map((row) => row.month_bucket))]
      .sort()
      .at(-1);
    const priorCensusMonth = [...new Set(communitiesDashboard.census.map((row) => row.month_bucket))]
      .sort()
      .at(-2);
    const latestIncidentMonth = [...new Set(communitiesDashboard.incidents.map((row) => row.month_bucket))]
      .sort()
      .at(-1);
    const priorIncidentMonth = [...new Set(communitiesDashboard.incidents.map((row) => row.month_bucket))]
      .sort()
      .at(-2);

    const facilityNames = new Map(
      communitiesDashboard.facilities.map((facility) => [facility.facility_id, facility.community_name])
    );

    const censusCurrent = new Map<string, number>();
    const censusPrior = new Map<string, number>();
    const incidentCurrent = new Map<string, number>();
    const incidentPrior = new Map<string, number>();

    communitiesDashboard.census.forEach((row) => {
      if (row.month_bucket === latestCensusMonth) censusCurrent.set(row.facility_id, row.census);
      if (row.month_bucket === priorCensusMonth) censusPrior.set(row.facility_id, row.census);
    });

    communitiesDashboard.incidents.forEach((row) => {
      if (row.month_bucket === latestIncidentMonth) {
        incidentCurrent.set(row.facility_id, (incidentCurrent.get(row.facility_id) ?? 0) + row.incident_count);
      }
      if (row.month_bucket === priorIncidentMonth) {
        incidentPrior.set(row.facility_id, (incidentPrior.get(row.facility_id) ?? 0) + row.incident_count);
      }
    });

    return communitiesDashboard.facilities
      .map((facility) => ({
        id: facility.facility_id,
        title: facility.community_name,
        censusDelta: (censusCurrent.get(facility.facility_id) ?? 0) - (censusPrior.get(facility.facility_id) ?? 0),
        currentCensus: censusCurrent.get(facility.facility_id) ?? 0,
        incidentDelta:
          (incidentCurrent.get(facility.facility_id) ?? 0) - (incidentPrior.get(facility.facility_id) ?? 0),
        currentResidents: facility.total_residents,
        currentIncidents: incidentCurrent.get(facility.facility_id) ?? 0,
        facilityName: facilityNames.get(facility.facility_id) ?? "Unknown Community"
      }))
      .sort((left, right) => Math.abs(right.censusDelta) - Math.abs(left.censusDelta))
      .slice(0, 5);
  }, [communitiesDashboard]);

  const latestCommunityCensusRows = useMemo(() => {
    return getLatestCommunityCensusRows(communitiesDashboard)
      .map((row) => ({
        id: row.facilityId,
        title: row.communityName,
        ...(row.monthBucket ? { meta: formatMonthLabel(row.monthBucket) } : {}),
        value: formatNumber(row.census),
        tone: "blue" as const,
        actionLabel: "View profile",
        onClick: () => openCommunityProfile(row.facilityId, row.communityName)
      }));
  }, [communitiesDashboard]);

  const latestIncidentMonth = useMemo(
    () =>
      [...new Set((communitiesDashboard?.incidents ?? []).map((row) => row.month_bucket))]
      .sort()
      .at(-1) ?? null,
    [communitiesDashboard]
  );

  const latestIncidentCategoryRows = useMemo(() => {
    if (!communitiesDashboard) return [];

    const categoryCounts = new Map<string, number>();

    communitiesDashboard.incidents
      .filter((row) => row.month_bucket === latestIncidentMonth)
      .forEach((row) => {
        const category = row.category || "Uncategorized";
        categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + row.incident_count);
      });

    return [...categoryCounts.entries()]
      .map(([category, count]) => ({
        id: category,
        title: category,
        ...(latestIncidentMonth ? { meta: formatMonthLabel(latestIncidentMonth) } : {}),
        value: formatNumber(count),
        tone: "red" as const,
        onClick: () => setSelectedIncidentCategory(category)
      }))
      .sort((left, right) => Number(right.value.replace(/,/g, "")) - Number(left.value.replace(/,/g, "")));
  }, [communitiesDashboard, latestIncidentMonth]);

  const selectedIncidentMonthBucket = useMemo(
    () => incidentSeries.find((point) => point.label === selectedIncidentMonthLabel)?.month_bucket ?? null,
    [incidentSeries, selectedIncidentMonthLabel]
  );

  const selectedIncidentMonthBreakdown = useMemo(() => {
    return getIncidentMonthCommunityBreakdown(
      communitiesDashboard,
      selectedIncidentMonthBucket
    );
  }, [communitiesDashboard, selectedIncidentMonthBucket]);

  const selectedIncidentCategoryRows = useMemo(() => {
    if (!communitiesDashboard || !selectedIncidentCategory || !latestIncidentMonth) return [];

    return (communitiesDashboard.incidentDetails ?? [])
      .filter((incident) => incident.month_bucket === latestIncidentMonth)
      .filter((incident) => {
        const category = incident.category || "Uncategorized";
        return category === selectedIncidentCategory || incident.incident_type === selectedIncidentCategory;
      })
      .sort((left, right) => {
        const leftDate = left.incident_date ?? left.received_at ?? "";
        const rightDate = right.incident_date ?? right.received_at ?? "";
        return rightDate.localeCompare(leftDate);
      });
  }, [communitiesDashboard, latestIncidentMonth, selectedIncidentCategory]);

  const selectedDiagnosisResidents = useMemo(() => {
    if (!communitiesDashboard || !selectedDiagnosis) return [];

    return communitiesDashboard.residents
      .filter((resident) => resident.primary_diagnosis === selectedDiagnosis)
      .sort((left, right) => right.los_days - left.los_days);
  }, [communitiesDashboard, selectedDiagnosis]);

  const residentIncidentHistory = useMemo<ResidentDrilldownIncident[]>(() => {
    const detailRows = communitiesDashboard?.incidentDetails ?? [];
    return detailRows.map((incident) => ({
      id: incident.id,
      facility_id: incident.facility_id,
      facility_name: incident.facility_name,
      resident_id: incident.resident_id,
      client_name: incident.client_name,
      incident_date: incident.incident_date,
      received_at: incident.received_at,
      incident_type: incident.incident_type,
      location: incident.location,
      email_body: incident.email_body,
      assistance_given: incident.assistance_given
    }));
  }, [communitiesDashboard]);

  const residentLookup = useMemo(
    () =>
      new Map((communitiesDashboard?.residents ?? []).map((resident) => [resident.res_number, resident])),
    [communitiesDashboard]
  );

  const complianceDrilldown = useMemo(() => {
    if (!reportsSummary || !selectedComplianceFacilityId) return null;

    const series = reportsSummary.medicationCompliance
      .filter((row) => row.facility_id === selectedComplianceFacilityId)
      .sort((left, right) => left.month_bucket.localeCompare(right.month_bucket))
      .slice(-6);

    if (!series.length) return null;

    const latestRow = series.at(-1) ?? null;

    return {
      facilityName: latestRow?.facility_name ?? "Unknown Community",
      latestMonthLabel: latestRow ? formatMonthLabel(latestRow.month_bucket) : "—",
      latestRow,
      series: series.map((row) => ({
        monthLabel: formatMonthLabel(row.month_bucket),
        compliancePct: row.compliance_pct,
        totalScheduled: row.total_scheduled,
        notGiven: row.not_given
      }))
    };
  }, [reportsSummary, selectedComplianceFacilityId]);

  const dashboardSummarySlides = useMemo(() => {
    if (!dashboard) return [];

    const latestMonthIncidents = incidentSeries.at(-1)?.value ?? dashboard.portfolio.currentIncidents;
    const priorMonthIncidents = incidentSeries.at(-2)?.value ?? 0;
    const incidentDelta = latestMonthIncidents - priorMonthIncidents;
    const largestCommunity = latestCommunityCensusRows[0];
    const latestMonthlyCensus = latestCommunityCensusRows.reduce(
      (total, row) => total + Number(row.value.replace(/,/g, "")),
      0
    );
    const censusPeriodLabel = dashboard.operational.currentWeeklyCensus === null
      ? "monthly"
      : "weekly";
    const censusTotal = dashboard.operational.currentWeeklyCensus ?? latestMonthlyCensus;

    return [
      {
        navLabel: "Census",
        title: censusTotal > 0
          ? `${formatNumber(censusTotal)} latest ${censusPeriodLabel} census across ${formatNumber(dashboard.portfolio.communityCount)} communities.`
          : `Census detail across ${formatNumber(dashboard.portfolio.communityCount)} communities.`,
        body: largestCommunity
          ? `${largestCommunity.title} is the largest current census line at ${largestCommunity.value}. Select any community below to open its complete profile.`
          : "The live active roster is available. Community census rows will appear once the census feed returns the latest month.",
        content: (
          <div className="grid gap-3 lg:grid-cols-2">
            <SliderDataCard title={`Latest ${censusPeriodLabel} census by community`}>
              <SliderRows
                rows={latestCommunityCensusRows}
                emptyLabel="Latest census rows are not available yet."
              />
            </SliderDataCard>
            <SliderDataCard title="Community movement">
              <CensusMovementModule
                items={communityMovers.map((item) => ({
                  id: item.id,
                  label: item.title,
                  current: item.currentCensus,
                  delta: item.censusDelta
                }))}
                actionLabel="View profile"
                onSelect={(item) => openCommunityProfile(item.id, item.label)}
                emptyLabel="Community movement rows are not available yet."
              />
            </SliderDataCard>
          </div>
        )
      },
      {
        navLabel: "Incidents",
        title: `${formatNumber(dashboard.portfolio.currentIncidents)} incidents in ${dashboard.reporting_month ? formatMonthLabel(dashboard.reporting_month) : "the latest reporting month"}.`,
        body: priorMonthIncidents
          ? `${incidentDelta > 0 ? "+" : ""}${formatNumber(incidentDelta)} versus the previous trend point. Click a month to open the portfolio incident drilldown.`
          : "Incident trend rows are loaded; a prior-month comparison is not available in this snapshot.",
        content: (
          <div className="grid gap-3 lg:grid-cols-2">
            <SliderDataCard title="Incident volume">
              <MiniTrend
                items={incidentSeries}
                activeLabel={selectedIncidentMonthLabel}
                onSelect={setSelectedIncidentMonthLabel}
              />
            </SliderDataCard>
            <SliderDataCard title="Top incident categories">
              <SliderRows
                rows={latestIncidentCategoryRows}
                emptyLabel="Incident category rows are not available yet."
              />
            </SliderDataCard>
          </div>
        )
      },
      {
        navLabel: "Operations",
        title: `${formatPercent(dashboard.reporting.averageCompliance)} medication compliance across the latest reporting set.`,
        body: `${formatNumber(dashboard.reporting.refusalSignalCount)} refusal signals are in the reporting feed. Medication and diagnosis rows open the detail we have today.`,
        content: (
          <div className="grid gap-3 lg:grid-cols-2">
            <SliderDataCard title="Lowest medication compliance">
              <MedicationComplianceModule
                items={medicationWatch.complianceLeaders.map((item) => ({
                  id: item.facilityId,
                  label: item.facilityName,
                  compliancePct: item.compliancePct
                }))}
                onSelect={(item) => setSelectedComplianceFacilityId(item.id)}
                emptyLabel="Medication compliance rows are not available yet."
              />
            </SliderDataCard>
            <SliderDataCard title="Diagnosis mix">
              <DiagnosisMixModule
                items={portfolioDiagnosisMix.map(([label, count]) => ({ label, count }))}
                onSelect={(item) => setSelectedDiagnosis(item.label)}
                emptyLabel="Diagnosis mix rows are not available yet."
              />
            </SliderDataCard>
          </div>
        )
      }
    ];
  }, [
    communityMovers,
    dashboard,
    incidentSeries,
    latestCommunityCensusRows,
    latestIncidentCategoryRows,
    medicationWatch,
    portfolioDiagnosisMix,
    selectedIncidentMonthLabel
  ]);

  const dataThroughLabel = useMemo(
    () => getCommunitiesDashboardDataThroughLabel(dashboard, communitiesDashboard, reportsSummary),
    [dashboard, communitiesDashboard, reportsSummary]
  );

  if (!dashboard) {
    return (
      <div className="flex min-h-[calc(100vh-132px)] items-center justify-center px-6 text-center">
        {overviewUnavailable ? (
          <div className="max-w-md border-y border-[#d8d0c3] py-8">
            <h1 className="font-serif text-[28px] leading-tight text-[#17130f]">Communities could not be loaded.</h1>
            <p className="mt-3 text-[14px] leading-6 text-[#736657]">
              The published data is temporarily unavailable. Try the request again.
            </p>
            <button
              type="button"
              onClick={() => {
                setOverviewUnavailable(false);
                window.dispatchEvent(new Event(PLATFORM_DATA_REFRESH_EVENT));
              }}
              className="mt-5 border border-[#0f8b73] px-4 py-2 text-[12px] font-semibold text-[#0f6f5d] transition-colors hover:bg-[#eef8f5]"
            >
              Try again
            </button>
          </div>
        ) : (
          <p className="text-[14px] leading-7 text-[#736657]">Loading communities…</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1520px] pb-8">
      <div className="rounded-[34px] border border-[#d8d0c3] bg-[linear-gradient(180deg,#fffdfa_0%,#f5efe6_100%)] px-4 py-4 shadow-[0_30px_80px_-54px_rgba(91,74,54,0.36)] sm:px-5 sm:py-5">
        <div className="mb-4 border-b border-[#ddd4c8] px-1 pb-4">
          <div className="h-[3px] w-12 bg-[#0f8b73]" />
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <h1 className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#7c664c]">
              Communities Overview
            </h1>
            {dataThroughLabel ? (
              <span className="text-[11px] uppercase tracking-[0.12em] text-[#8b7b68]">
                {dataThroughLabel}
              </span>
            ) : null}
          </div>
        </div>

        {dashboard.snapshot_status?.warning ? (
          <div className="mb-4 rounded-[18px] border border-[#ead7a8] bg-[#fff7df] px-4 py-3 text-[13px] leading-6 text-[#7c5a16]">
            {dashboard.snapshot_status.warning}
          </div>
        ) : null}

        {overviewUnavailable || communityDetailUnavailable || medicationSummaryUnavailable ? (
          <div className="mb-4 rounded-[18px] border border-[#ead7a8] bg-[#fff7df] px-4 py-3 text-[13px] leading-6 text-[#7c5a16]" role="status">
            {overviewUnavailable
              ? "The overview could not be refreshed, so the previously loaded overview remains on screen. "
              : ""}
            {communityDetailUnavailable
              ? "Community detail could not be refreshed. "
              : ""}
            {medicationSummaryUnavailable
              ? "Medication detail could not be refreshed."
              : ""}
          </div>
        ) : null}

        <DashboardSummarySlider slides={dashboardSummarySlides} />
      </div>

      <SeriesDrilldownModal
        open={Boolean(selectedIncidentMonthLabel)}
        title={selectedIncidentMonthLabel ? `Portfolio Incident Trend · ${selectedIncidentMonthLabel}` : "Portfolio Incident Trend"}
        subtitle="This view uses the real incident trend points already loaded in the communities overview and the matching community breakdown for the selected month."
        primaryTitle="Portfolio incident trend"
        primarySeries={incidentSeries.map((point) => ({
          label: point.label,
          value: point.value,
          tone: point.label === selectedIncidentMonthLabel ? "danger" : "neutral"
        }))}
        {...(selectedIncidentMonthBreakdown.length ? { secondaryTitle: "Community breakdown for selected month" } : {})}
        secondarySeries={selectedIncidentMonthBreakdown}
        onSelectSecondary={(point) => {
          if (!point.id || !selectedIncidentMonthBucket) return;
          setSelectedIncidentMonthLabel(null);
          surfaceInPlatformCanvas({
            route: `/communities/${encodeURIComponent(point.id)}?focus=incidents&month=${encodeURIComponent(selectedIncidentMonthBucket)}`,
            sourceLabel: "Incident trend",
            introText: `Opening ${point.label} incident reports for ${formatMonthLabel(selectedIncidentMonthBucket)}.`
          });
        }}
        onClose={() => setSelectedIncidentMonthLabel(null)}
        onOpenRoute={() =>
          surfaceInPlatformCanvas({
            route: "/incidents",
            sourceLabel: "Incident trend",
            introText: "Opening the incident center in this thread."
          })
        }
        openLabel="Open incident center"
      />
      <DiagnosisDrilldownModal
        diagnosis={selectedDiagnosis}
        residents={selectedDiagnosisResidents}
        onClose={() => setSelectedDiagnosis(null)}
        onSelectResident={(resident) => {
          setSelectedDiagnosis(null);
          setSelectedResident(resident);
        }}
      />
      <MedicationComplianceDrilldownModal
        open={Boolean(complianceDrilldown)}
        facilityName={complianceDrilldown?.facilityName ?? ""}
        latestMonthLabel={complianceDrilldown?.latestMonthLabel ?? "—"}
        latestRow={complianceDrilldown?.latestRow ?? null}
        series={complianceDrilldown?.series ?? []}
        onClose={() => setSelectedComplianceFacilityId(null)}
      />
      <IncidentCategoryDrilldownModal
        category={selectedIncidentCategory}
        monthLabel={latestIncidentMonth ? formatMonthLabel(latestIncidentMonth) : "the latest incident month"}
        rows={selectedIncidentCategoryRows}
        residentLookup={residentLookup}
        onClose={() => setSelectedIncidentCategory(null)}
        onSelectResident={(resident) => {
          setSelectedIncidentCategory(null);
          setSelectedResident(resident);
        }}
      />
      <ResidentDrilldownModal
        resident={selectedResident}
        incidents={residentIncidentHistory}
        onClose={() => setSelectedResident(null)}
      />
    </div>
  );
}
