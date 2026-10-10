import { useEffect, useMemo, useState } from "react";
import { ALAMO_FACILITIES } from "../../../../shared/community-names.mjs";
import { formatMonthLabel } from "../../../../shared/period-utils.mjs";
import { surfaceInPlatformCanvas } from "../../../shared/canvas/canvasEvents";
import {
  fetchAnalyticsSummary,
  fetchCommunitiesDashboard,
  fetchCommunitySnapshot,
  readCachedAnalyticsSummary,
  readCachedCommunitiesDashboard,
  type CommunitySnapshotResponse,
  type LiveCommunitiesDashboardResponse,
  type ReportsSummaryResponse
} from "../../../shared/api/platformData";
import { DiagnosisMixModule } from "../../../shared/modules/DiagnosisMixModule";
import { IncidentCategoriesModule } from "../../../shared/modules/IncidentCategoriesModule";
import { MedicationComplianceModule } from "../../../shared/modules/MedicationComplianceModule";
import { ResidentRosterModule } from "../../../shared/modules/ResidentRosterModule";
import { CensusTrendModule, type CensusTrendPoint } from "../../../shared/modules/CensusTrendModule";
import { IncidentDetailListModule } from "../../../shared/modules/IncidentDetailListModule";
import IncidentCenterPage from "../../incidents/pages/IncidentCenterPage";
import {
  IncidentReportModal,
  incidentListItemFromCommunityRecord,
  incidentReportFromCommunityRecord
} from "../../../shared/incidents/IncidentReportModal";
import type { CommunityIncidentDetailRecord } from "../../../shared/types/platformSnapshot";
import { isAbortError } from "../communityPageModel";

export type CommunityDashboardFocus =
  | "detail"
  | "census"
  | "incidents"
  | "medications"
  | "residents";
export interface CommunitySurfaceDestination {
  route: string;
  sourceLabel: string;
  introText: string | null;
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-US").format(value) : "—";
}

function residentNoun(value: number) {
  return value === 1 ? "resident" : "residents";
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function CommunityMedicationCompliance({
  facilityId,
  facilityName,
  label,
  row,
  loading = false,
  showUnavailable = true
}: {
  facilityId: string;
  facilityName: string;
  label?: string;
  row: ReportsSummaryResponse["medicationCompliance"][number] | null;
  loading?: boolean;
  showUnavailable?: boolean;
}) {
  if (!row) {
    if (loading) {
      return (
        <div data-community-medication-loading="true" role="status" className="flex items-center gap-2 border-y border-[#d9d9d9] py-6 text-[14px] text-[#595959]">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#68214e]/20 border-t-[#68214e]" aria-hidden="true" />
          Loading medication performance...
        </div>
      );
    }
    return showUnavailable ? (
      <div className="border-y border-[#d9d9d9] py-6 text-[14px] text-[#595959]">
        Medication performance is not available for this community.
      </div>
    ) : null;
  }

  return (
    <MedicationComplianceModule
      accentColor="#68214e"
      items={[{
        id: `${facilityId}-${row.month_bucket}`,
        label: label ?? facilityName,
        compliancePct: row.compliance_pct,
        scheduled: row.total_scheduled,
        given: row.given,
        notGiven: row.not_given,
        period: formatMonthLabel(row.month_bucket, { month: "long" })
      }]}
    />
  );
}

function SectionHeading({ eyebrow, title, detail }: { eyebrow: string; title: string; detail?: string | null }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-[#d9d9d9] pb-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">{eyebrow}</div>
        <h2 className="mt-1 font-serif text-[28px] font-semibold leading-tight tracking-[-0.035em] text-[#111111]">
          {title}
        </h2>
      </div>
      {detail ? <div className="text-[12px] font-medium text-[#595959]">{detail}</div> : null}
    </header>
  );
}

function LoadingState() {
  return (
    <div role="status" className="flex min-h-[300px] items-center justify-center border-y border-[#d9d9d9] px-6 text-[14px] text-[#595959]">
      Loading community data…
    </div>
  );
}

function UnavailableState() {
  return (
    <div role="status" className="border-y border-[#d9d9d9] px-5 py-6 text-[14px] leading-6 text-[#595959]">
      This community view is temporarily unavailable. The Communities Overview remains available above.
    </div>
  );
}

export default function CommunityDashboardSurface({
  facilityId,
  focus,
  category,
  month,
  residentId,
  onOpenSurface,
  hideHeading = false,
  compact = false
}: {
  facilityId: string;
  focus: CommunityDashboardFocus;
  category?: string | null;
  month?: string | null;
  residentId?: string | null;
  onOpenSurface?: (destination: CommunitySurfaceDestination) => void;
  hideHeading?: boolean;
  compact?: boolean;
}) {
  const [dashboard, setDashboard] = useState<LiveCommunitiesDashboardResponse | null>(readCachedCommunitiesDashboard);
  const [communitySnapshot, setCommunitySnapshot] = useState<CommunitySnapshotResponse | null>(null);
  const [reportsSummary, setReportsSummary] = useState<ReportsSummaryResponse | null>(readCachedAnalyticsSummary);
  const [unavailable, setUnavailable] = useState(false);
  const [reportsSummaryUnavailable, setReportsSummaryUnavailable] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<CommunityIncidentDetailRecord | null>(null);
  const showIncidentReports = Boolean(category || month || residentId);

  useEffect(() => {
    setSelectedIncident(null);
  }, [category, facilityId, month, residentId]);

  useEffect(() => {
    const controller = new AbortController();
    const cachedDashboard = readCachedCommunitiesDashboard();
    if (cachedDashboard?.facilities.some((facility) => String(facility.facility_id) === String(facilityId))) {
      setDashboard(cachedDashboard);
    }
    const cachedReportsSummary = readCachedAnalyticsSummary();
    if (cachedReportsSummary) setReportsSummary(cachedReportsSummary);
    setUnavailable(false);
    setReportsSummaryUnavailable(false);
    setCommunitySnapshot(null);

    fetchCommunitiesDashboard(controller.signal)
      .then((payload) => {
        const hasFacility = payload.facilities.some(
          (facility) => String(facility.facility_id) === String(facilityId)
        );
        if (!hasFacility) throw new Error(`Community ${facilityId} is not present in the dashboard.`);
        setDashboard(payload);
      })
      .catch((error) => {
        if (isAbortError(error)) return;
        console.warn("Focused community data is unavailable.", error);
        setUnavailable(true);
      });

    fetchAnalyticsSummary(controller.signal)
      .then(setReportsSummary)
      .catch((error) => {
        if (isAbortError(error)) return;
        console.warn("Community medication context is unavailable.", error);
        setReportsSummaryUnavailable(true);
      });

    return () => controller.abort();
  }, [facilityId]);

  useEffect(() => {
    if (!showIncidentReports) {
      setCommunitySnapshot(null);
      return;
    }

    const controller = new AbortController();
    fetchCommunitySnapshot(facilityId, controller.signal)
      .then(setCommunitySnapshot)
      .catch((error) => {
        if (isAbortError(error)) return;
        console.warn("Focused community incident detail is unavailable.", error);
      });

    return () => controller.abort();
  }, [facilityId, showIncidentReports]);

  const model = useMemo(() => {
    if (!dashboard) return null;

    const facility = dashboard.facilities.find(
      (row) => String(row.facility_id) === String(facilityId)
    );
    if (!facility) return null;

    const censusRows = dashboard.census
      .filter((row) => String(row.facility_id) === String(facilityId) && /^\d{4}-\d{2}$/.test(row.month_bucket))
      .sort((left, right) => left.month_bucket.localeCompare(right.month_bucket));
    const residents = dashboard.residents
      .filter((row) => String(row.facility_id) === String(facilityId))
      .sort((left, right) => (right.los_days ?? 0) - (left.los_days ?? 0));
    const selectedResidentId = residentId?.trim() || null;
    const governedIncidentDetails = communitySnapshot?.incidentDetails?.length
      ? communitySnapshot.incidentDetails
      : dashboard.incidentDetails ?? [];
    const facilityIncidentDetails = governedIncidentDetails
      .filter((row) => String(row.facility_id) === String(facilityId));
    const residentIncidentDetails = selectedResidentId
      ? facilityIncidentDetails.filter((row) => String(row.resident_id) === selectedResidentId)
      : facilityIncidentDetails;
    const selectedResidentRecord = residents.find(
      (resident) => String(resident.res_number) === selectedResidentId
    );
    const residentName = selectedResidentRecord
      ? [selectedResidentRecord.first_name, selectedResidentRecord.last_name].filter(Boolean).join(" ")
      : residentIncidentDetails.find((row) => row.client_name)?.client_name ?? null;
    const incidentRows = dashboard.incidents
      .filter((row) => String(row.facility_id) === String(facilityId) && /^\d{4}-\d{2}$/.test(row.month_bucket));
    const incidentMonths = [...new Set(
      (selectedResidentId ? residentIncidentDetails : incidentRows)
        .map((row) => row.month_bucket)
        .filter((value) => /^\d{4}-\d{2}$/.test(value))
    )].sort();
    const latestIncidentMonth = incidentMonths.at(-1) ?? null;
    const selectedIncidentMonth = month && incidentMonths.includes(month)
      ? month
      : latestIncidentMonth;
    const selectedCategory = category?.trim() || null;
    const scopedIncidentRows = selectedCategory
      ? incidentRows.filter((row) => row.category?.toLowerCase() === selectedCategory.toLowerCase())
      : incidentRows;
    const latestIncidentRows = selectedIncidentMonth
      ? incidentRows.filter((row) => row.month_bucket === selectedIncidentMonth)
      : [];
    const incidentTotals = incidentMonths.map((monthValue) => ({
      month: monthValue,
      count: selectedResidentId
        ? residentIncidentDetails
            .filter((row) => row.month_bucket === monthValue)
            .filter((row) => !selectedCategory || [row.category, row.incident_type]
              .some((value) => value?.toLowerCase() === selectedCategory.toLowerCase()))
            .length
        : scopedIncidentRows
            .filter((row) => row.month_bucket === monthValue)
            .reduce((total, row) => total + Number(row.incident_count || 0), 0)
    }));
    const incidentDetails = residentIncidentDetails
      .filter((row) => !selectedIncidentMonth || row.month_bucket === selectedIncidentMonth)
      .filter((row) => {
        if (!selectedCategory) return true;
        return [row.category, row.incident_type]
          .some((value) => value?.toLowerCase() === selectedCategory.toLowerCase());
      })
      .sort((left, right) => {
        const leftDate = left.incident_date ?? left.received_at ?? "";
        const rightDate = right.incident_date ?? right.received_at ?? "";
        return rightDate.localeCompare(leftDate);
      });
    const latestIncidentTotal = selectedResidentId
      ? incidentDetails.length
      : latestIncidentRows
          .filter((row) => !selectedCategory || row.category?.toLowerCase() === selectedCategory.toLowerCase())
          .reduce((total, row) => total + Number(row.incident_count || 0), 0);
    const censusPoints: CensusTrendPoint[] = censusRows.map((row) => ({
      id: row.month_bucket,
      label: formatMonthLabel(row.month_bucket, { fallback: row.month_bucket, month: "long" }),
      value: Number(row.census)
    }));
    const categoriesByName = new Map<string, number>();
    if (selectedResidentId) {
      residentIncidentDetails
        .filter((row) => row.month_bucket === selectedIncidentMonth)
        .forEach((row) => {
          const label = row.category || row.incident_type || "Other";
          categoriesByName.set(label, (categoriesByName.get(label) ?? 0) + 1);
        });
    } else {
      latestIncidentRows.forEach((row) => {
        const label = row.category || "Other";
        categoriesByName.set(label, (categoriesByName.get(label) ?? 0) + Number(row.incident_count || 0));
      });
    }
    const categoryItems = [...categoriesByName.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count);
    const residentItems = residents.map((resident) => ({
      id: resident.res_number,
      name: [resident.first_name, resident.last_name].filter(Boolean).join(" ") || `Resident ${resident.res_number}`,
      community: facility.community_name,
      unit: resident.unit_number,
      age: resident.age,
      losDays: resident.los_days,
      diagnosis: resident.primary_diagnosis,
      admitDate: resident.admit_date
    }));
    const diagnosisCounts = new Map<string, number>();
    residents.forEach((resident) => {
      const diagnosis = resident.primary_diagnosis?.trim();
      if (!diagnosis) return;
      diagnosisCounts.set(diagnosis, (diagnosisCounts.get(diagnosis) ?? 0) + 1);
    });
    const diagnosisItems = [...diagnosisCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count);
    const complianceRows = (reportsSummary?.medicationCompliance ?? [])
      .filter((row) => String(row.facility_id) === String(facilityId))
      .sort((left, right) => left.month_bucket.localeCompare(right.month_bucket));
    const latestCompliance = complianceRows.at(-1) ?? null;
    const topRefusals = (reportsSummary?.refusalByMedication ?? [])
      .filter((row) => String(row.facility_id) === String(facilityId))
      .sort((left, right) => Number(right.refusals || 0) - Number(left.refusals || 0))
      .slice(0, 5);
    const documentationGapCount = (reportsSummary?.documentationGaps ?? [])
      .filter((row) => String(row.facility_id) === String(facilityId))
      .length;

    return {
      facility,
      censusPoints,
      latestCensus: censusRows.at(-1) ?? null,
      residents,
      residentItems,
      categoryItems,
      diagnosisItems,
      incidentTotals,
      latestIncidentMonth,
      selectedIncidentMonth,
      latestIncidentTotal,
      incidentDetails,
      incidentDetailItems: incidentDetails.map(incidentListItemFromCommunityRecord),
      selectedCategory,
      selectedResidentId,
      selectedResidentName: residentName,
      latestCompliance,
      topRefusals,
      documentationGapCount,
      averageAge: average(residents.map((resident) => Number(resident.age)).filter(Number.isFinite)),
      averageLos: average(residents.map((resident) => Number(resident.los_days)).filter(Number.isFinite))
    };
  }, [category, communitySnapshot, dashboard, facilityId, month, reportsSummary, residentId]);

  const fallbackName = ALAMO_FACILITIES.find((facility) => facility.facilityId === facilityId)?.communityName ?? "Community";
  const facilityName = model?.facility.community_name ?? fallbackName;
  const latestIncidentLabel = model?.selectedIncidentMonth
    ? formatMonthLabel(model.selectedIncidentMonth, { fallback: model.selectedIncidentMonth, month: "long" })
    : null;
  const priorCensusPoint = model?.censusPoints.at(-2);
  const censusChange = model?.latestCensus && priorCensusPoint
    ? Number(model.latestCensus.census) - priorCensusPoint.value
    : null;
  const showRecentIncidentTriage = !category && !month && !residentId;
  const openCommunitySurface = (
    nextFocus: "census" | "incidents" | "medications" | "residents" | "search",
    selection?: { category?: string; month?: string; residentId?: string; query?: string }
  ) => {
    const params = new URLSearchParams({ focus: nextFocus });
    if (selection?.category) params.set("category", selection.category);
    if (selection?.month) params.set("month", selection.month);
    if (selection?.residentId) params.set("resident", selection.residentId);
    if (selection?.query) params.set("query", selection.query);
    const destination = {
      route: `/communities/${facilityId}?${params.toString()}`,
      sourceLabel: facilityName,
      introText: null
    };
    if (onOpenSurface) {
      onOpenSurface(destination);
      return;
    }
    surfaceInPlatformCanvas(destination);
  };

  return (
    <section
      data-community-dashboard-surface={focus}
      className={`min-w-0 max-w-full border-[#111111] bg-white text-[#111111] ${
        compact ? "py-1 sm:py-2" : "py-5 sm:py-6"
      } ${
        hideHeading ? "border-b" : "border-y"
      }`}
    >
      {!hideHeading ? (
        focus === "incidents" ? (
          <SectionHeading eyebrow="Incidents" title={facilityName} detail={latestIncidentLabel ? `Through ${latestIncidentLabel}` : null} />
        ) : focus === "medications" ? (
          <SectionHeading eyebrow="Medications" title={facilityName} detail={model?.latestCompliance ? `Through ${formatMonthLabel(model.latestCompliance.month_bucket, { month: "long" })}` : null} />
        ) : focus === "residents" ? (
          <SectionHeading eyebrow="Residents" title={facilityName} detail={model ? `${formatNumber(model.residents.length)} current ${residentNoun(model.residents.length)}` : null} />
        ) : (
          <SectionHeading eyebrow="Community overview" title={facilityName} detail={model?.latestCensus ? `Through ${formatMonthLabel(model.latestCensus.month_bucket, { month: "long" })}` : null} />
        )
      ) : null}

      {!dashboard && !unavailable ? <LoadingState /> : unavailable || !model ? <UnavailableState /> : null}

      {model && focus === "census" ? (
        <div className={compact ? "space-y-4" : "space-y-8"}>
          <div>
            <h3 className={`${compact ? "mb-2 text-[20px]" : "mb-3 text-[24px]"} font-serif font-semibold tracking-[-0.03em]`}>
              Census trend
            </h3>
            <CensusTrendModule points={model.censusPoints} height={compact ? 220 : 300} accentColor="#174f81" />
          </div>
          <div className="overflow-x-auto border-y border-[#111111]">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="border-b border-[#111111] text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">
                <tr><th className="px-0 py-2.5">Month</th><th className="px-4 py-2.5">Census</th></tr>
              </thead>
              <tbody className="divide-y divide-[#d9d9d9]">
                {model.censusPoints.slice(-12).reverse().map((point) => (
                  <tr key={point.id}>
                    <td className="px-0 py-2.5 font-medium">{point.label}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatNumber(point.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {model && focus === "incidents" ? (
        <div className={`min-w-0 ${compact ? "space-y-4" : "space-y-8"}`}>
          {showRecentIncidentTriage ? (
            <div data-community-incident-triage="true">
              <IncidentCenterPage
                embedded
                facilityId={facilityId}
                facilityName={facilityName}
                onOpenResident={(incident) => {
                  if (incident.resident_id) {
                    openCommunitySurface("search", { residentId: incident.resident_id });
                  }
                }}
              />
            </div>
          ) : null}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">
              Historical analysis
            </div>
            <h3 className={`${compact ? "mt-1 text-[20px]" : "mt-1 text-[24px]"} font-serif font-semibold tracking-[-0.03em]`}>Incident volume</h3>
            <p className={`${compact ? "mt-1 text-[13px]" : "mt-2 text-[15px]"} leading-6 text-[#333333]`}>
              {latestIncidentLabel
                ? `${model.selectedResidentName ? `${model.selectedResidentName} had` : `${facilityName} recorded`} ${formatNumber(model.latestIncidentTotal)}${model.selectedCategory ? ` ${model.selectedCategory}` : ""} incidents in ${latestIncidentLabel}.`
                : `No monthly incident totals are loaded for ${facilityName}.`}
            </p>
          </div>
          <div>
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#595959]">Latest categories</div>
            <IncidentCategoriesModule
              accentColor="#923621"
              items={model.categoryItems}
              limit={10}
              activeCategory={model.selectedCategory}
              onSelect={(nextCategory) => openCommunitySurface("incidents", {
                category: nextCategory,
                ...(model.selectedIncidentMonth ? { month: model.selectedIncidentMonth } : {}),
                ...(model.selectedResidentId ? { residentId: model.selectedResidentId } : {})
              })}
            />
          </div>
          <div>
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#595959]">Monthly totals</div>
            <div className="overflow-x-auto border-y border-[#111111]">
              <table className="w-full min-w-[520px] border-collapse text-left text-[13px]">
                <thead className="border-b border-[#111111] text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">
                  <tr><th className="px-0 py-3">Month</th><th className="px-4 py-3">Incidents</th></tr>
                </thead>
                <tbody className="divide-y divide-[#d9d9d9]">
                  {model.incidentTotals.slice(-12).reverse().map((row) => (
                    <tr key={row.month}>
                      <td colSpan={2} className="p-0">
                        <button
                          type="button"
                          data-incident-month-drilldown={row.month}
                          onClick={() => openCommunitySurface("incidents", {
                            month: row.month,
                            ...(model.selectedCategory ? { category: model.selectedCategory } : {}),
                            ...(model.selectedResidentId ? { residentId: model.selectedResidentId } : {})
                          })}
                          className={`grid w-full grid-cols-[1fr_auto] px-0 py-3 text-left hover:bg-[#f7fbf9] ${
                            row.month === model.selectedIncidentMonth ? "bg-[#f7fbf9]" : "bg-white"
                          }`}
                        >
                          <span className="font-medium">{formatMonthLabel(row.month, { month: "long" })}</span>
                          <span className="px-4 tabular-nums">{formatNumber(row.count)} →</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {showIncidentReports ? (
            <div data-incident-report-list="true">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">Exact records</div>
                  <h3 className={`${compact ? "mt-1 text-[20px]" : "mt-1 text-[24px]"} font-serif font-semibold tracking-[-0.03em]`}>
                    {model.selectedCategory ? `${model.selectedCategory} incident reports` : "Incident reports"}
                  </h3>
                  <p className="mt-1 text-[13px] leading-5 text-[#595959]">
                    {formatNumber(model.incidentDetails.length)} loaded record{model.incidentDetails.length === 1 ? "" : "s"} for {latestIncidentLabel ?? "this selection"}.
                  </p>
                </div>
                {model.selectedCategory ? (
                  <button
                    type="button"
                    onClick={() => openCommunitySurface("incidents", {
                      ...(model.selectedIncidentMonth ? { month: model.selectedIncidentMonth } : {}),
                      ...(model.selectedResidentId ? { residentId: model.selectedResidentId } : {})
                    })}
                    className="border border-[#d9d9d9] bg-white px-3 py-2 text-[12px] font-semibold text-[#595959] hover:border-[#111111] hover:text-[#111111]"
                  >
                    Show all categories
                  </button>
                ) : null}
              </div>
              <IncidentDetailListModule
                rows={model.incidentDetailItems}
                onSelect={(row) => {
                  setSelectedIncident(model.incidentDetails.find((incident) => incident.id === row.id) ?? null);
                }}
                onSelectResident={(row) => {
                  if (row.residentId) openCommunitySurface("search", { residentId: row.residentId });
                }}
                emptyLabel="The aggregate total is loaded, but exact incident reports are not available for this selection."
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {model && focus === "residents" ? (
        <div>
          <h3 className={`${compact ? "mb-2 text-[20px]" : "mb-3 text-[24px]"} font-serif font-semibold tracking-[-0.03em]`}>Resident roster</h3>
          <ResidentRosterModule
            residents={model.residentItems}
            onSelect={(resident) => openCommunitySurface("search", { residentId: resident.id })}
          />
        </div>
      ) : null}

      {model && focus === "medications" ? (
        <div className={compact ? "space-y-4" : "space-y-8"}>
          <p className={`${compact ? "text-[15px] leading-6" : "text-[20px] leading-8"} max-w-[920px] font-serif text-[#333333]`}>
            {model.latestCompliance
              ? `${facilityName}'s medication compliance was ${model.latestCompliance.compliance_pct.toFixed(1)}% in ${formatMonthLabel(model.latestCompliance.month_bucket, { month: "long" })}.`
              : reportsSummaryUnavailable
                ? `Medication performance is not available for ${facilityName}.`
                : `Loading medication performance for ${facilityName}.`}
          </p>
          <CommunityMedicationCompliance
            facilityId={facilityId}
            facilityName={facilityName}
            row={model.latestCompliance}
            loading={!reportsSummary && !reportsSummaryUnavailable}
            showUnavailable={false}
          />
          <div>
            <h3 className={`${compact ? "mb-2 text-[20px]" : "mb-3 text-[24px]"} font-serif font-semibold tracking-[-0.03em]`}>
              Most refused medications
            </h3>
            {model.topRefusals.length ? (
              <div className="overflow-x-auto border-y border-[#111111]">
                <table className="w-full border-collapse text-left text-[13px]">
                  <thead className="border-b border-[#111111] text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">
                    <tr>
                      <th className="px-0 py-2.5">Medication</th>
                      <th className="px-4 py-2.5 text-right">Refusals</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#d9d9d9]">
                    {model.topRefusals.map((row) => (
                      <tr key={row.medication}>
                        <td className="px-0 py-2.5 font-medium">{row.medication}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(row.refusals)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : !reportsSummary && !reportsSummaryUnavailable ? (
              <div role="status" className="border-y border-[#d9d9d9] py-6 text-[14px] text-[#595959]">
                Loading medication detail...
              </div>
            ) : (
              <div className="border-y border-[#d9d9d9] py-6 text-[14px] text-[#595959]">
                No medication refusal rows are available for this community.
              </div>
            )}
          </div>
          {model.documentationGapCount ? (
            <p className="border-l-2 border-[#0f8b73] pl-4 text-[13px] leading-6 text-[#595959]">
              {formatNumber(model.documentationGapCount)} {residentNoun(model.documentationGapCount)} {model.documentationGapCount === 1 ? "appears" : "appear"} in the current documentation-gap feed.
            </p>
          ) : null}
        </div>
      ) : null}

      {model && focus === "detail" ? (
        <div className={compact ? "space-y-5" : "space-y-8"}>
          <div data-community-domain-section="census">
            <div className="community-overview-section-heading">
              <div>
                <h3>Census <strong className="community-overview-census-count">{model.latestCensus ? formatNumber(model.latestCensus.census) : "—"}</strong><small>residents</small></h3>
                <p className="community-overview-census-period">
                  {model.latestCensus ? formatMonthLabel(model.latestCensus.month_bucket, { month: "long" }) : "No census period"}
                  {censusChange !== null && priorCensusPoint ? ` · ${censusChange > 0 ? "+" : ""}${formatNumber(censusChange)} vs ${priorCensusPoint.label}` : ""}
                </p>
              </div>
              <button type="button" data-community-kpi-drilldown="census" onClick={() => openCommunitySurface("census")}>View census <span aria-hidden="true">→</span></button>
            </div>
            <CensusTrendModule points={model.censusPoints.slice(-12)} height={compact ? 220 : 300} showSummary={false} accentColor="#174f81" />
          </div>
          <div className={`grid min-w-0 lg:grid-cols-2 ${compact ? "gap-6" : "gap-8"}`}>
            <div data-community-domain-section="incidents" className="min-w-0">
              <div className="community-overview-section-heading">
                <h3>Incidents <span>{latestIncidentLabel ? `${formatNumber(model.latestIncidentTotal)} · ${latestIncidentLabel}` : ""}</span></h3>
                <button type="button" data-community-kpi-drilldown="incidents" onClick={() => openCommunitySurface("incidents")}>View incidents <span aria-hidden="true">→</span></button>
              </div>
              <IncidentCategoriesModule
                accentColor="#923621"
                items={model.categoryItems}
                limit={8}
                onSelect={(nextCategory) => openCommunitySurface("incidents", { category: nextCategory })}
              />
            </div>
            <div data-community-domain-section="medications" className="min-w-0">
              <div className="community-overview-section-heading">
                <h3>Medication administration</h3>
                <button type="button" data-community-kpi-drilldown="medications" onClick={() => openCommunitySurface("medications")}>View medications <span aria-hidden="true">→</span></button>
              </div>
              <CommunityMedicationCompliance
                facilityId={facilityId}
                facilityName={facilityName}
                label="Completion"
                row={model.latestCompliance}
                loading={!reportsSummary && !reportsSummaryUnavailable}
              />
              {model.topRefusals.length ? (
                <div className="mt-4">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">Most refused medications</div>
                  <ul className="mt-2 divide-y divide-[#d9d9d9] border-y border-[#d9d9d9]">
                    {model.topRefusals.map((row) => (
                      <li key={row.medication} className="flex items-center justify-between gap-4 py-2.5 text-[13px]">
                        <span className="min-w-0 truncate font-medium">{row.medication}</span>
                        <span className="shrink-0 tabular-nums text-[#595959]">{formatNumber(row.refusals)} refusals</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {model.documentationGapCount ? (
                <p className="mt-3 text-[12px] leading-5 text-[#595959]">
                  {formatNumber(model.documentationGapCount)} {residentNoun(model.documentationGapCount)} {model.documentationGapCount === 1 ? "appears" : "appear"} in the current documentation-gap feed.
                </p>
              ) : null}
            </div>
          </div>
          <div>
            <h3 className={`${compact ? "mb-2 text-[20px]" : "mb-3 text-[24px]"} font-serif font-semibold tracking-[-0.03em]`}>Diagnosis mix</h3>
            <DiagnosisMixModule
              items={model.diagnosisItems}
              limit={8}
              onSelect={(item) => openCommunitySurface("search", { query: item.label })}
            />
          </div>
          <div>
            <div className="community-overview-section-heading">
              <h3>Longest-stay residents</h3>
              <button type="button" data-community-kpi-drilldown="residents" onClick={() => openCommunitySurface("residents")}>View residents <span aria-hidden="true">→</span></button>
            </div>
            <ResidentRosterModule
              residents={model.residentItems.slice(0, 10)}
              onSelect={(resident) => openCommunitySurface("search", { residentId: resident.id })}
            />
          </div>
        </div>
      ) : null}

      <IncidentReportModal
        incident={selectedIncident ? incidentReportFromCommunityRecord(selectedIncident) : null}
        onClose={() => setSelectedIncident(null)}
        onSelectResident={(incident) => {
          setSelectedIncident(null);
          if (incident.residentId) openCommunitySurface("search", { residentId: incident.residentId });
        }}
      />
    </section>
  );
}
