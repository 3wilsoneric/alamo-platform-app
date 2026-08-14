import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  Search,
  TrendingUp,
  Users,
  X
} from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  PLATFORM_DATA_REFRESH_EVENT,
  fetchCommunitiesDashboard,
  fetchCommunitySnapshot,
  fetchIncidentStream,
  type CommunitySnapshotResponse,
  type LiveIncidentRecord,
  type LiveCommunitiesDashboardResponse
} from "../../../shared/api/platformData";
import {
  ResidentDrilldownModal,
  type ResidentDrilldownIncident
} from "../../../shared/ui/ResidentDrilldownModal";
import { surfaceInPlatformCanvas } from "../../../shared/canvas/canvasEvents";
import { getCommunitySnapshotDataThroughLabel } from "../../../shared/dataFreshness";
import {
  CensusTrendModule,
  type CensusTrendPoint
} from "../../../shared/modules/CensusTrendModule";
import { IncidentCategoriesModule } from "../../../shared/modules/IncidentCategoriesModule";
import { IncidentDetailListModule } from "../../../shared/modules/IncidentDetailListModule";
import { incidentListItemFromCommunityRecord } from "../../../shared/incidents/IncidentReportModal";
import {
  ResidentRosterModule,
  type ResidentRosterItem
} from "../../../shared/modules/ResidentRosterModule";
import { DiagnosisMixModule } from "../../../shared/modules/DiagnosisMixModule";
import { getTopCounts } from "../../../shared/data/counts";
import { getScopedResidentKey } from "../../../shared/data/residentIncidentMatching";
import {
  formatDisplayDate,
  formatDisplayDateTime
} from "../../../../shared/display-date.mjs";
import { formatMonthLabel as formatSharedMonthLabel } from "../../../../shared/period-utils.mjs";
import { ALAMO_FACILITIES } from "../../../../shared/community-names.mjs";
import {
  CommunityDatasheetTable as DatasheetTable,
  CommunityDetailPill as DetailPill,
  CommunityMiniTrend as MiniTrend,
  CommunitySectionCard as SectionCard
} from "../components/CommunityDetailPrimitives";
import {
  enrichIncidentDetailsWithResidents,
  incidentStreamToDetail,
  isAbortError
} from "../communityPageModel";

interface CommunitiesPageProps {
  searchTerm?: string;
  facilityIdOverride?: string;
  focusTargetOverride?: string;
  embedded?: boolean;
  focusOnly?: boolean;
}

const formatMonthLabel = (value: string) => formatSharedMonthLabel(value, { fallback: "—", month: "long" });

function formatFullDate(value: string) {
  return formatDisplayDate(value, { month: "long" });
}

function formatIncidentDate(value?: string | null) {
  return formatDisplayDateTime(value, { month: "long" });
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDelta(value: number) {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}

export default function CommunitiesPage({
  searchTerm: _searchTerm = "",
  facilityIdOverride,
  focusTargetOverride,
  embedded = false,
  focusOnly = false
}: CommunitiesPageProps) {
  const [snapshot, setSnapshot] = useState<CommunitySnapshotResponse | null>(null);
  const [communitiesDashboard, setCommunitiesDashboard] = useState<LiveCommunitiesDashboardResponse | null>(null);
  const [incidentStream, setIncidentStream] = useState<LiveIncidentRecord[]>([]);
  const [dashboardUnavailable, setDashboardUnavailable] = useState(false);
  const [residentDirectoryUnavailable, setResidentDirectoryUnavailable] = useState(false);
  const [incidentStreamUnavailable, setIncidentStreamUnavailable] = useState(false);
  const [residentSearch, setResidentSearch] = useState("");
  const [residentSearchOpen, setResidentSearchOpen] = useState(false);
  const [selectedResidentKey, setSelectedResidentKey] = useState<string | null>(null);
  const [residentDrilldownId, setResidentDrilldownId] = useState<string | null>(null);
  const [incidentDrilldownMonth, setIncidentDrilldownMonth] = useState<string | null>(null);
  const [incidentCategoryFilter, setIncidentCategoryFilter] = useState("All");
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const { facilityId: routeFacilityId } = useParams<{ facilityId: string }>();
  const [searchParams] = useSearchParams();
  const facilityId = facilityIdOverride ?? routeFacilityId;
  const focusTarget = focusTargetOverride ?? searchParams.get("focus");
  const focusedCanvasMode = embedded && focusOnly && Boolean(focusTarget);
  const residentSearchInline = focusedCanvasMode && focusTarget === "search";
  const residentSearchActive = residentSearchOpen || residentSearchInline;
  const residentSearchHasQuery = residentSearch.trim().length > 0;
  const residentDirectoryLoading = residentSearchActive && !communitiesDashboard && !residentDirectoryUnavailable;
  const [activeFocusTarget, setActiveFocusTarget] = useState<string | null>(null);
  const topSignalsRef = useRef<HTMLDivElement | null>(null);
  const incidentSectionRef = useRef<HTMLDivElement | null>(null);
  const censusSectionRef = useRef<HTMLDivElement | null>(null);
  const residentSectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    let requestController: AbortController | null = null;

    if (!facilityId) {
      setDashboardUnavailable(true);
      return () => {
        active = false;
      };
    }

    // Never leave the prior facility's snapshot visible while a new route loads.
    setSnapshot(null);
    setDashboardUnavailable(false);
    setResidentDirectoryUnavailable(false);
    setIncidentStreamUnavailable(false);

    const loadSnapshot = () => {
      requestController?.abort();
      const controller = new AbortController();
      requestController = controller;

      Promise.allSettled([
        fetchCommunitySnapshot(facilityId, controller.signal),
        fetchCommunitiesDashboard(controller.signal),
        fetchIncidentStream(controller.signal)
      ]).then((results) => {
        if (!active || controller.signal.aborted) return;

        const [snapshotResult, communitiesResult, incidentStreamResult] = results;

        if (snapshotResult.status === "fulfilled") {
          setDashboardUnavailable(false);
          setSnapshot(snapshotResult.value);
        } else if (isAbortError(snapshotResult.reason)) {
          return;
        } else {
          console.warn("Communities live data is unavailable.", snapshotResult.reason);
          setDashboardUnavailable(true);
        }

        if (communitiesResult.status === "fulfilled") {
          setResidentDirectoryUnavailable(false);
          setCommunitiesDashboard(communitiesResult.value);
        } else if (isAbortError(communitiesResult.reason)) {
          return;
        } else {
          console.warn("Community resident directory is unavailable.", communitiesResult.reason);
          setResidentDirectoryUnavailable(true);
        }

        if (incidentStreamResult.status === "fulfilled") {
          setIncidentStreamUnavailable(false);
          setIncidentStream(incidentStreamResult.value);
        } else if (isAbortError(incidentStreamResult.reason)) {
          return;
        } else {
          console.warn("Incident detail fallback is unavailable.", incidentStreamResult.reason);
          setIncidentStreamUnavailable(true);
        }
      });
    };

    const refreshOnVisibility = () => {
      if (document.visibilityState === "visible") {
        loadSnapshot();
      }
    };

    loadSnapshot();
    window.addEventListener("focus", loadSnapshot);
    window.addEventListener(PLATFORM_DATA_REFRESH_EVENT, loadSnapshot);
    document.addEventListener("visibilitychange", refreshOnVisibility);

    return () => {
      active = false;
      requestController?.abort();
      window.removeEventListener("focus", loadSnapshot);
      window.removeEventListener(PLATFORM_DATA_REFRESH_EVENT, loadSnapshot);
      document.removeEventListener("visibilitychange", refreshOnVisibility);
    };
  }, [facilityId]);

  useEffect(() => {
    if (!snapshot || !focusTarget) return;

    const focusMap: Record<string, RefObject<HTMLDivElement | null>> = {
      census: censusSectionRef,
      incidents: incidentSectionRef,
      trend: topSignalsRef,
      residents: residentSectionRef
    };
    const targetRef = focusMap[focusTarget] ?? topSignalsRef;
    const frame = window.requestAnimationFrame(() => {
      targetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveFocusTarget(focusTarget);
    });
    const snapTimer = window.setTimeout(() => {
      targetRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
    }, 680);
    const timer = window.setTimeout(() => setActiveFocusTarget(null), 2200);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(snapTimer);
      window.clearTimeout(timer);
    };
  }, [focusTarget, snapshot]);

  const incidentTrend = useMemo(
    () =>
      (snapshot?.incidentTrend ?? []).map((item) => ({
        label: formatMonthLabel(item.month_bucket),
        value: item.incidentCount,
        month_bucket: item.month_bucket
      })),
    [snapshot]
  );

  const incidentDetailRecords = useMemo(() => {
    const snapshotDetails = snapshot?.incidentDetails ?? [];
    const sourceDetails =
      snapshotDetails.length > 0
        ? snapshotDetails
        : incidentStream
            .filter((incident) => incident.facility_id === facilityId)
            .map(incidentStreamToDetail)
            .filter((incident) => incident.month_bucket);

    return enrichIncidentDetailsWithResidents(sourceDetails, communitiesDashboard?.residents ?? []);
  }, [communitiesDashboard, facilityId, incidentStream, snapshot]);

  const drilldownIncidents = useMemo(
    () => incidentDetailRecords.filter((incident) => incident.month_bucket === incidentDrilldownMonth),
    [incidentDetailRecords, incidentDrilldownMonth]
  );

  const drilldownCategories = useMemo(
    () => ["All", ...getTopCounts(drilldownIncidents, (incident) => incident.category, 20).map(([label]) => label)],
    [drilldownIncidents]
  );

  const filteredDrilldownIncidents = useMemo(
    () =>
      incidentCategoryFilter === "All"
        ? drilldownIncidents
        : drilldownIncidents.filter((incident) => incident.category === incidentCategoryFilter),
    [drilldownIncidents, incidentCategoryFilter]
  );

  const selectedIncident = useMemo(
    () =>
      filteredDrilldownIncidents.find((incident) => incident.id === selectedIncidentId) ??
      filteredDrilldownIncidents[0] ??
      null,
    [filteredDrilldownIncidents, selectedIncidentId]
  );

  const facilityNavItems = useMemo(
    () =>
      communitiesDashboard?.facilities ?? ALAMO_FACILITIES.map((facility) => ({
        facility_id: facility.facilityId,
        community_name: facility.communityName,
        community_code: facility.code,
        city: facility.city,
        state: facility.state,
        total_residents: 0
      })),
    [communitiesDashboard]
  );

  const selectedFacility = useMemo(
    () => facilityNavItems.find((facility) => facility.facility_id === facilityId) ?? null,
    [facilityId, facilityNavItems]
  );

  const residentDirectory = useMemo(() => {
    if (!communitiesDashboard) return [];

    const query = residentSearch.trim().toLowerCase();

    return communitiesDashboard.residents
      .filter((resident) => {
        if (!query) return true;

        const haystack = [
          resident.res_number,
          resident.first_name,
          resident.last_name,
          resident.unit_number,
          resident.care_level,
          resident.payor,
          resident.primary_diagnosis,
          resident.physician,
          resident.diet
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(query);
      })
      .sort((a, b) => {
        const lastNameCompare = a.last_name.localeCompare(b.last_name);
        if (lastNameCompare !== 0) return lastNameCompare;
        return a.first_name.localeCompare(b.first_name);
      });
  }, [communitiesDashboard, residentSearch]);

  const selectedResident = useMemo(
    () =>
      residentDirectory.find((resident) => getScopedResidentKey(resident.facility_id, resident.res_number) === selectedResidentKey) ??
      residentDirectory[0] ??
      null,
    [residentDirectory, selectedResidentKey]
  );

  const residentDrilldownResident = useMemo(() => {
    if (!communitiesDashboard || !facilityId || !residentDrilldownId) return null;

    return (
      communitiesDashboard.residents.find(
        (resident) => resident.facility_id === facilityId && resident.res_number === residentDrilldownId
      ) ?? null
    );
  }, [communitiesDashboard, facilityId, residentDrilldownId]);

  const residentDrilldownIncidents = useMemo<ResidentDrilldownIncident[]>(
    () =>
      incidentDetailRecords.map((incident) => ({
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
      })),
    [incidentDetailRecords]
  );

  const sortedCommunityCensus = useMemo(
    () =>
      (communitiesDashboard?.census ?? [])
        .filter((row) => row.facility_id === facilityId)
        .sort((left, right) => right.month_bucket.localeCompare(left.month_bucket)),
    [communitiesDashboard, facilityId]
  );

  const latestCensusRow = sortedCommunityCensus[0] ?? null;
  const priorCensusRow = sortedCommunityCensus[1] ?? null;
  const censusDelta =
    latestCensusRow && priorCensusRow ? latestCensusRow.census - priorCensusRow.census : null;

  const latestIncidentPoint = incidentTrend.at(-1) ?? null;
  const priorIncidentPoint = incidentTrend.at(-2) ?? null;
  const incidentDelta =
    latestIncidentPoint && priorIncidentPoint ? latestIncidentPoint.value - priorIncidentPoint.value : null;

  const recentIncident = useMemo(
    () =>
      [...incidentDetailRecords].sort((left, right) => {
        const leftDate = left.incident_date ?? left.received_at ?? "";
        const rightDate = right.incident_date ?? right.received_at ?? "";
        return rightDate.localeCompare(leftDate);
      })[0] ?? null,
    [incidentDetailRecords]
  );

  const focusRingClass = (targets: string[]) =>
    activeFocusTarget && targets.includes(activeFocusTarget)
      ? "ring-2 ring-[#8ea2ff] ring-offset-4 ring-offset-[#f5efe6]"
      : "";

  const dataThroughLabel = getCommunitySnapshotDataThroughLabel(snapshot, communitiesDashboard);

  const censusTrendPoints = useMemo<CensusTrendPoint[]>(
    () =>
      [...sortedCommunityCensus]
        .reverse()
        .slice(-12)
        .map((row) => ({
          id: row.month_bucket,
          label: formatMonthLabel(row.month_bucket),
          value: Number(row.census || 0)
        })),
    [sortedCommunityCensus]
  );

  const incidentDetailListRows = useMemo(
    () => filteredDrilldownIncidents.map(incidentListItemFromCommunityRecord),
    [filteredDrilldownIncidents]
  );

  const longestStayRoster = useMemo<ResidentRosterItem[]>(
    () =>
      (snapshot?.longestStayResidents ?? []).map((resident) => ({
        id: resident.res_number,
        name: `${resident.first_name} ${resident.last_name}`.trim(),
        unit: resident.unit_number,
        losDays: resident.los_days,
        admitDate: resident.admit_date
      })),
    [snapshot]
  );

  const communityIncidentRows = useMemo(
    () =>
      (communitiesDashboard?.incidents ?? [])
        .filter((row) => row.facility_id === facilityId)
        .sort((left, right) => {
          const monthCompare = right.month_bucket.localeCompare(left.month_bucket);
          if (monthCompare !== 0) return monthCompare;
          return right.incident_count - left.incident_count;
        })
        .slice(0, 24)
        .map((row) => [
          formatMonthLabel(row.month_bucket),
          row.category || "Uncategorized",
          row.incident_count,
          row.incident_date ? formatFullDate(row.incident_date) : "—"
        ]),
    [communitiesDashboard, facilityId]
  );

  useEffect(() => {
    if (!residentSearchActive) {
      setResidentSearch("");
      setSelectedResidentKey(null);
      return;
    }

    if (!selectedResidentKey && residentDirectory.length > 0) {
      const firstResident = residentDirectory[0];
      setSelectedResidentKey(
        firstResident ? getScopedResidentKey(firstResident.facility_id, firstResident.res_number) : null
      );
      return;
    }

    if (
      selectedResidentKey &&
      !residentDirectory.some((resident) => getScopedResidentKey(resident.facility_id, resident.res_number) === selectedResidentKey)
    ) {
      setSelectedResidentKey(
        residentDirectory[0]
          ? getScopedResidentKey(residentDirectory[0].facility_id, residentDirectory[0].res_number)
          : null
      );
    }
  }, [residentDirectory, residentSearchActive, selectedResidentKey]);

  useEffect(() => {
    if (!incidentDrilldownMonth) {
      setIncidentCategoryFilter("All");
      setSelectedIncidentId(null);
      return;
    }

    if (!drilldownCategories.includes(incidentCategoryFilter)) {
      setIncidentCategoryFilter("All");
    }

    if (
      selectedIncidentId &&
      !filteredDrilldownIncidents.some((incident) => incident.id === selectedIncidentId)
    ) {
      setSelectedIncidentId(filteredDrilldownIncidents[0]?.id ?? null);
    }
  }, [
    drilldownCategories,
    filteredDrilldownIncidents,
    incidentCategoryFilter,
    incidentDrilldownMonth,
    selectedIncidentId
  ]);

  const residentStaySection = (
    <div
      ref={residentSectionRef}
      className={`scroll-mt-24 h-full rounded-[28px] transition-[box-shadow] ${focusRingClass(["residents"])}`}
    >
      <SectionCard title="Longest Stay Residents" icon={<Clock className="h-4 w-4" />}>
        <ResidentRosterModule
          residents={longestStayRoster}
          variant="dark"
          onSelect={(resident) => setResidentDrilldownId(resident.id)}
          emptyLabel="Resident roster rows are not available for this community yet."
        />
      </SectionCard>
    </div>
  );

  const refreshWarnings = [
    dashboardUnavailable ? "the community snapshot" : null,
    residentDirectoryUnavailable ? "resident search" : null,
    incidentStreamUnavailable ? "incident detail" : null
  ].filter((label): label is string => Boolean(label));

  return (
    <div className="relative min-h-[calc(100vh-132px)] overflow-x-hidden pb-1 text-white">
      <div className="mx-auto max-w-[1520px]">
        {focusedCanvasMode && selectedFacility ? (
          <div data-community-focus-header="true" className="mb-4 border-b border-[#111111] px-4 pb-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">
              {focusTarget === "incidents"
                ? "Incidents"
                : focusTarget === "residents"
                  ? "Residents"
                  : focusTarget === "census"
                    ? "Census"
                    : "Community detail"}
            </div>
            <h2 className="mt-1 font-serif text-[26px] font-semibold tracking-[-0.035em] text-[#111111]">
              {selectedFacility.community_name}
            </h2>
          </div>
        ) : null}

        {snapshot?.snapshot_status?.warning ? (
          <div className="mb-4 rounded-[18px] border border-[#ead8ba] bg-[#fff8ea] px-4 py-3 text-[13px] leading-6 text-[#7a5b22] shadow-[0_12px_34px_-28px_rgba(91,74,54,0.42)]">
            {snapshot.snapshot_status.warning}
          </div>
        ) : null}

        {snapshot && refreshWarnings.length > 0 ? (
          <div
            role="status"
            className="mb-4 rounded-[18px] border border-[#ead8ba] bg-[#fff8ea] px-4 py-3 text-[13px] leading-6 text-[#7a5b22] shadow-[0_12px_34px_-28px_rgba(91,74,54,0.42)]"
          >
            Could not refresh {refreshWarnings.join(", ")}. Previously loaded data remains visible where available.
          </div>
        ) : null}

        {!residentSearchInline && !focusedCanvasMode ? <div className="mb-4 flex flex-wrap items-center gap-2 px-1">
          <div className="flex min-w-[250px] flex-1 items-center gap-3 sm:max-w-[360px] sm:flex-none">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
              Community
            </span>
            <label className="relative min-w-0 flex-1">
              <select
                value={facilityId ?? facilityNavItems[0]?.facility_id ?? ""}
                onChange={(event) => {
                  const nextFacilityId = event.target.value;
                  if (embedded) {
                    const nextFacility = facilityNavItems.find((facility) => facility.facility_id === nextFacilityId);
                    surfaceInPlatformCanvas({
                      route: `/communities/${nextFacilityId}`,
                      sourceLabel: nextFacility?.community_name ?? "Community detail",
                      introText: `Opening ${nextFacility?.community_name ?? "the selected community"} in this thread.`
                    });
                    return;
                  }

                  window.location.assign(`/communities/${nextFacilityId}`);
                }}
                className="h-[40px] w-full appearance-none rounded-[14px] border border-white/[0.08] bg-white/[0.03] pr-8 pl-3 text-[14px] font-medium tracking-[-0.015em] text-white outline-none transition-colors hover:border-white/[0.14] focus:border-[#0f8b73]"
              >
                {facilityNavItems.map((facility) => (
                  <option key={facility.facility_id} value={facility.facility_id}>
                    {facility.community_name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-white/42" />
            </label>
          </div>

          <button
            type="button"
            onClick={() => setResidentSearchOpen(true)}
            className="ml-auto inline-flex h-[42px] items-center gap-2 rounded-[16px] border border-white/[0.08] bg-white/[0.04] px-3.5 text-[11px] font-semibold tracking-[-0.01em] text-white/82 shadow-[0_12px_20px_-20px_rgba(0,0,0,0.7)] transition-colors hover:bg-white/[0.07]"
          >
            <Search className="h-4 w-4 text-white/52" />
            Search residents
          </button>
        </div> : null}

        {residentSearchInline ? null : !snapshot ? (
          <div className="flex min-h-[520px] items-center justify-center rounded-[28px] border border-dashed border-white/[0.1] bg-white/[0.02] px-8 text-center text-[14px] leading-7 text-white/46">
            {dashboardUnavailable
              ? "Community snapshot data is unavailable until the Databricks API is running and the live query succeeds."
              : "Loading community snapshot from Databricks..."}
          </div>
        ) : (
          <div className="grid h-full grid-rows-[auto_1fr] gap-2">
            {!focusedCanvasMode ? (
            <div className="px-1 pb-5">
              <div className="mb-3 h-[3px] w-12 bg-[#0f8b73]" />
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">
                  Community Snapshot
                </div>
                {dataThroughLabel ? (
                  <div className="text-[11px] uppercase tracking-[0.12em] text-white/34">
                    {dataThroughLabel}
                  </div>
                ) : null}
              </div>
              <div
                ref={topSignalsRef}
                className={`scroll-mt-24 grid grid-cols-1 gap-3 rounded-[24px] transition-[box-shadow] sm:grid-cols-3 ${focusRingClass([
                  "trend"
                ])}`}
              >
                <button
                  type="button"
                  onClick={() => censusSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="min-w-0 rounded-[20px] bg-white/[0.035] px-4 py-4 text-left transition-colors hover:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/42">
                    <Users className="h-4 w-4 text-sky-400" />
                    Latest Census Movement
                  </div>
                  <div className="mt-3 text-[1.7rem] font-semibold tracking-[-0.045em] text-white">
                    {latestCensusRow ? formatNumber(latestCensusRow.census) : "—"}
                  </div>
                  <div className="mt-1 text-[12px] leading-5 text-white/48">
                    {latestCensusRow ? formatMonthLabel(latestCensusRow.month_bucket) : "No census month loaded"}
                    {censusDelta !== null && priorCensusRow
                      ? ` · ${formatDelta(censusDelta)} vs ${formatMonthLabel(priorCensusRow.month_bucket)}`
                      : ""}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => incidentSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="min-w-0 rounded-[20px] bg-white/[0.035] px-4 py-4 text-left transition-colors hover:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/42">
                    <AlertTriangle className="h-4 w-4 text-rose-400" />
                    Current Incident Read
                  </div>
                  <div className="mt-3 text-[1.7rem] font-semibold tracking-[-0.045em] text-white">
                    {latestIncidentPoint ? formatNumber(latestIncidentPoint.value) : formatNumber(snapshot.summary.currentIncidents)}
                  </div>
                  <div className="mt-1 text-[12px] leading-5 text-white/48">
                    {latestIncidentPoint?.label ?? (snapshot.reporting_month ? formatMonthLabel(snapshot.reporting_month) : "Latest month")}
                    {incidentDelta !== null && priorIncidentPoint
                      ? ` · ${formatDelta(incidentDelta)} vs ${priorIncidentPoint.label}`
                      : ""}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (recentIncident?.month_bucket) {
                      setIncidentDrilldownMonth(recentIncident.month_bucket);
                      setIncidentCategoryFilter("All");
                      setSelectedIncidentId(recentIncident.id);
                    }
                  }}
                  className="min-w-0 rounded-[20px] bg-white/[0.035] px-4 py-4 text-left transition-colors hover:bg-white/[0.06]"
                >
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/42">
                    <Clock className="h-4 w-4 text-amber-400" />
                    Most Recent Incident
                  </div>
                  <div className="mt-3 truncate text-[1.12rem] font-semibold tracking-[-0.035em] text-white">
                    {recentIncident?.client_name || "No incident detail loaded"}
                  </div>
                  <div className="mt-1 text-[12px] leading-5 text-white/48">
                    {recentIncident
                      ? `${recentIncident.incident_type || recentIncident.category || "Incident"} · ${formatIncidentDate(
                          recentIncident.incident_date ?? recentIncident.received_at
                        )}`
                      : "Incident detail is not available for this community."}
                  </div>
                </button>
              </div>

            </div>
            ) : null}

            {(!focusedCanvasMode || focusTarget === "incidents") ? (
            <div className={`grid min-h-0 grid-cols-1 items-start gap-2 ${focusedCanvasMode ? "" : "lg:grid-cols-2"}`}>
              <div
                ref={incidentSectionRef}
                className={`scroll-mt-24 h-full rounded-[28px] transition-[box-shadow] ${focusRingClass(["incidents"])}`}
              >
                <SectionCard
                  title="Incident Volume"
                  icon={<AlertTriangle className="h-4 w-4" />}
                  contentClassName="flex"
                >
                  <MiniTrend
                    items={incidentTrend}
                    activeMonth={incidentDrilldownMonth}
                    onSelect={(monthBucket) => {
                      setIncidentDrilldownMonth(monthBucket);
                      setIncidentCategoryFilter("All");
                      setSelectedIncidentId(null);
                    }}
                  />
                </SectionCard>
              </div>
              {!focusedCanvasMode ? (

              <SectionCard
                title="Top Incident Categories"
                icon={<TrendingUp className="h-4 w-4" />}
                contentClassName="flex"
              >
                <IncidentCategoriesModule
                  variant="dark"
                  items={snapshot.topIncidentCategories}
                  limit={5}
                  onSelect={(category) => {
                    const latestMonth = latestIncidentPoint?.month_bucket ?? snapshot.reporting_month;
                    if (!latestMonth) return;
                    setIncidentDrilldownMonth(latestMonth);
                    setIncidentCategoryFilter(category);
                    setSelectedIncidentId(null);
                  }}
                  emptyLabel="No incident categories are available for the current month yet."
                />
              </SectionCard>
              ) : null}

              {!focusedCanvasMode ? (
              <SectionCard
                title="Resident Diagnosis Mix"
                icon={<Users className="h-4 w-4" />}
              >
                <DiagnosisMixModule
                  variant="dark"
                  items={snapshot.diagnosisMix}
                  emptyLabel="Diagnosis detail has not been populated for this selection yet."
                />
              </SectionCard>
              ) : null}

              {!focusedCanvasMode ? residentStaySection : null}
            </div>
            ) : null}

            {(focusedCanvasMode && focusTarget === "residents") ? residentStaySection : null}

            {(!focusedCanvasMode || focusTarget === "census" || focusTarget === "incidents") ? (
            <div className={`mt-2 grid min-h-0 grid-cols-1 items-start gap-2 ${focusedCanvasMode ? "" : "lg:grid-cols-2"}`}>
              {(!focusedCanvasMode || focusTarget === "census") ? (
              <div
                ref={censusSectionRef}
                className={`scroll-mt-24 h-full rounded-[28px] transition-[box-shadow] ${focusRingClass(["census"])}`}
              >
                <SectionCard title="Census Trend" icon={<Users className="h-4 w-4" />}>
                  <CensusTrendModule
                    points={censusTrendPoints}
                    variant="dark"
                    height={300}
                    emptyLabel="Census rows are not available for this community yet."
                  />
                </SectionCard>
              </div>
              ) : null}

              {(!focusedCanvasMode || focusTarget === "incidents") ? (
              <SectionCard title="Incident Datasheet" icon={<AlertTriangle className="h-4 w-4" />}>
                <DatasheetTable
                  columns={["Month", "Category", "Incidents", "Latest Date"]}
                  rows={communityIncidentRows}
                  emptyLabel="Incident detail is not available for this community yet."
                />
              </SectionCard>
              ) : null}
            </div>
            ) : null}

          </div>
        )}
      </div>

      {incidentDrilldownMonth ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-3 py-5 backdrop-blur-[2px]">
          <button
            type="button"
            aria-label="Close incident detail"
            className="absolute inset-0"
            onClick={() => setIncidentDrilldownMonth(null)}
          />
          <div
            className="relative z-10 flex max-h-[min(820px,90vh)] w-full max-w-[1220px] flex-col overflow-hidden border border-[#111111] bg-white shadow-[0_28px_72px_-44px_rgba(0,0,0,0.32)]"
            role="dialog"
            aria-modal="true"
            aria-label={`${snapshot?.facility.community_name ?? "Community"} incident detail for ${formatMonthLabel(incidentDrilldownMonth)}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#111111] px-5 py-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">
                  Incident Detail
                </div>
                <div className="mt-1 font-serif text-[24px] font-semibold tracking-[-0.03em] text-[#111111]">
                  {snapshot?.facility.community_name ?? "Community"} · {formatMonthLabel(incidentDrilldownMonth)}
                </div>
                <div className="mt-1 text-[13px] text-[#595959]">
                  {formatNumber(drilldownIncidents.length)} incident{drilldownIncidents.length === 1 ? "" : "s"} in this month
                </div>
              </div>

              <div className="flex items-center gap-2">
                {drilldownCategories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => {
                      setIncidentCategoryFilter(category);
                      setSelectedIncidentId(null);
                    }}
                    className={`border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                      incidentCategoryFilter === category
                        ? "border-[#0f8b73] bg-[#f7fbf9] text-[#0f6f5d]"
                        : "border-[#d9d9d9] bg-white text-[#595959] hover:border-[#111111] hover:text-[#111111]"
                    }`}
                  >
                    {category}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setIncidentDrilldownMonth(null)}
                  className="ml-1 inline-flex h-10 w-10 shrink-0 items-center justify-center border border-[#d9d9d9] bg-white text-[#595959] transition-colors hover:border-[#0f8b73] hover:text-[#0f8b73]"
                  aria-label="Close incident detail"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_420px]">
              <div className="min-h-0 overflow-auto border-r border-[#d9d9d9] bg-white">
                <IncidentDetailListModule
                  rows={incidentDetailListRows}
                  variant="light"
                  selectedId={selectedIncident?.id ?? null}
                  onSelect={(row) => setSelectedIncidentId(row.id)}
                  onSelectResident={(row) => {
                    if (row.residentId) setResidentDrilldownId(row.residentId);
                  }}
                  emptyLabel="No incident records match this month and category."
                />
              </div>

              <div className="min-h-0 overflow-auto bg-[#fafafa] p-4">
                {selectedIncident ? (
                  <article className="border border-[#d9d9d9] bg-white px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => selectedIncident.resident_id && setResidentDrilldownId(selectedIncident.resident_id)}
                          className="truncate font-serif text-[20px] font-semibold text-[#111111] transition-colors hover:text-[#0f8b73]"
                        >
                          {selectedIncident.client_name}
                        </button>
                        <div className="mt-1 text-[12px] text-[#595959]">
                          {formatIncidentDate(selectedIncident.incident_date)}
                        </div>
                      </div>
                      <div className="border border-[#d9d9d9] bg-[#fafafa] px-2.5 py-1 text-[10px] font-semibold text-[#595959]">
                        Unit {selectedIncident.unit_number ?? "—"}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedIncident.category ? <DetailPill>{selectedIncident.category}</DetailPill> : null}
                      {selectedIncident.injury_occurred ? <DetailPill>Injury</DetailPill> : null}
                      {selectedIncident.police_called ? <DetailPill>Emergency</DetailPill> : null}
                      {selectedIncident.sentinel_event ? <DetailPill>Sentinel</DetailPill> : null}
                      {selectedIncident.previous_history ? <DetailPill>Prior history</DetailPill> : null}
                    </div>

                    <div className="mt-4 grid gap-2 text-[12px] leading-5 text-[#595959]">
                      <div className="flex items-center justify-between gap-3">
                        <span>Incident type</span>
                        <span className="max-w-[220px] truncate font-medium text-[#111111]">
                          {selectedIncident.incident_type || "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Location</span>
                        <span className="max-w-[220px] truncate font-medium text-[#111111]">
                          {selectedIncident.location || "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Staff</span>
                        <span className="max-w-[220px] truncate font-medium text-[#111111]">
                          {selectedIncident.staff_name || "—"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="border border-[#d9d9d9] bg-white px-3 py-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">
                          What staff saw
                        </div>
                        <div className="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-[#3f3f3f]">
                          {selectedIncident.email_body || "—"}
                        </div>
                      </div>
                      <div className="border border-[#d9d9d9] bg-white px-3 py-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">
                          Assistance given
                        </div>
                        <div className="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-[#3f3f3f]">
                          {selectedIncident.assistance_given || "—"}
                        </div>
                      </div>
                      <div className="border border-[#d9d9d9] bg-white px-3 py-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">
                          Notifications
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedIncident.notifications.length ? (
                            selectedIncident.notifications.map((notification) => (
                              <DetailPill key={`${selectedIncident.id}-${notification.recipient}`}>
                                {notification.recipient}
                              </DetailPill>
                            ))
                          ) : (
                            <span className="text-[12px] text-[#595959]">—</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                ) : (
                  <div className="flex h-full min-h-[260px] items-center justify-center border border-dashed border-[#d9d9d9] bg-white px-6 text-center text-[13px] leading-6 text-[#595959]">
                    Select an incident to view the underlying record.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {residentSearchActive ? (
        <div className={residentSearchInline ? "relative z-10 flex w-full items-start justify-center py-2" : "fixed inset-0 z-50 flex items-center justify-center bg-[#f4efe7]/82 px-4 py-6 backdrop-blur-[6px]"}>
          {!residentSearchInline ? <button
            type="button"
            aria-label="Close resident search"
            className="absolute inset-0"
            onClick={() => setResidentSearchOpen(false)}
          /> : null}
          <div
            className={`relative z-10 flex w-full max-w-[1120px] flex-col overflow-hidden border border-[#111111] bg-white shadow-[0_28px_72px_-44px_rgba(0,0,0,0.32)] ${residentSearchInline ? "min-h-[620px]" : "max-h-[min(760px,88vh)]"}`}
            {...(!residentSearchInline ? { role: "dialog", "aria-modal": true, "aria-label": "Resident search" } : {})}
          >
            <div className="flex items-center justify-between gap-4 border-b border-[#e3dbcf] px-5 py-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8b7b68]">
                  Resident Search
                </div>
                <div className="mt-1 text-[14px] font-semibold text-[#201a14]">Find a resident profile</div>
              </div>
              {!residentSearchInline ? <button
                type="button"
                onClick={() => setResidentSearchOpen(false)}
                className="rounded-[12px] border border-[#ddd4c8] bg-white px-3 py-2 text-[12px] font-semibold text-[#6f6253] transition-colors hover:text-[#201a14]"
              >
                Close
              </button> : null}
            </div>

            <div className="border-b border-[#e3dbcf] px-5 py-4">
              <div className="relative max-w-[420px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8b7b68]" />
                <input
                  type="text"
                  value={residentSearch}
                  onChange={(event) => setResidentSearch(event.target.value)}
                  placeholder="Search name or resident number..."
                  className="h-[46px] w-full rounded-[14px] border border-[#ddd4c8] bg-white pl-10 pr-3 text-[13px] text-[#201a14] outline-none placeholder:text-[#9b8e7b] focus:border-[#8ea2ff]"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden bg-[#f7f2ea] p-5">
              {residentDirectoryLoading ? (
                <div className="flex min-h-[320px] items-center justify-center px-6 text-center text-[14px] leading-6 text-[#8b7b68]">
                  Loading resident directory...
                </div>
              ) : residentDirectory.length === 0 ? (
                <div className="flex min-h-[320px] items-center justify-center px-6 text-center text-[14px] leading-6 text-[#8b7b68]">
                  {residentDirectoryUnavailable
                    ? "Resident profiles are not available from the communities feed yet."
                    : residentSearchHasQuery
                      ? "No resident matched that name or resident number."
                      : "No resident profiles are loaded yet."}
                </div>
              ) : selectedResident ? (
                <div className="grid min-h-0 gap-5 lg:grid-cols-[minmax(260px,0.42fr)_minmax(0,1fr)]">
                  <div className="min-h-0 overflow-hidden rounded-[22px] border border-[#ddd4c8] bg-[#fffdfa]">
                    <div className="flex items-center justify-between gap-3 border-b border-[#eee6da] px-4 py-3">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b7b68]">
                          Resident roster
                        </div>
                        <div className="mt-0.5 text-[12px] text-[#736657]">
                          {residentDirectory.length.toLocaleString()} shown
                          {residentSearch.trim() ? " after search" : ""}
                        </div>
                      </div>
                    </div>
                    <div className="max-h-[520px] overflow-auto p-2 [scrollbar-width:thin]">
                      {residentDirectory.map((resident) => {
                        const residentKey = getScopedResidentKey(resident.facility_id, resident.res_number);
                        const selected = residentKey === getScopedResidentKey(selectedResident.facility_id, selectedResident.res_number);
                        return (
                        <button
                          key={residentKey || `${resident.facility_id}-${resident.res_number}`}
                          type="button"
                          onClick={() => setSelectedResidentKey(residentKey)}
                          className={`mb-1.5 w-full rounded-[16px] border px-3 py-3 text-left transition-colors ${
                            selected
                              ? "border-[#8ea2ff] bg-[#eef3ff] text-[#293866]"
                              : "border-transparent bg-transparent text-[#5f5346] hover:border-[#e8dfd2] hover:bg-[#f8f1e8] hover:text-[#201a14]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-[13px] font-semibold">
                                {resident.first_name} {resident.last_name}
                              </div>
                              <div className="mt-0.5 truncate text-[11px] text-[#8b7b68]">
                                {resident.facility_name} · Unit {resident.unit_number ?? "—"}
                              </div>
                            </div>
                            <div className="shrink-0 rounded-full bg-white/72 px-2 py-1 text-[10px] font-semibold tabular-nums text-[#736657]">
                              {resident.los_days != null ? `${resident.los_days.toLocaleString()}d` : "—"}
                            </div>
                          </div>
                        </button>
                        );
                      })}
                    </div>
                  </div>

                  <article className="rounded-[26px] border border-[#ddd4c8] bg-[#fffdfa] p-6 shadow-[0_22px_36px_-28px_rgba(91,74,54,0.3)]">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e8e0d5] pb-5">
                      <div>
                        <div className="text-[24px] font-semibold tracking-[-0.035em] text-[#201a14]">
                          {selectedResident.first_name} {selectedResident.last_name}
                        </div>
                        <div className="mt-1 text-[12px] text-[#8b7b68]">
                          {selectedResident.facility_name} · Resident {selectedResident.res_number}
                        </div>
                      </div>
                      <div className="rounded-full border border-[#ddd4c8] bg-[#f7f2ea] px-3 py-1.5 text-[11px] font-semibold text-[#6f6253]">
                        Unit {selectedResident.unit_number ?? "—"}
                      </div>
                    </div>

                    <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        ["Age", selectedResident.age != null ? selectedResident.age : "—"],
                        ["Length of stay", selectedResident.los_days != null ? `${formatNumber(selectedResident.los_days)} days` : "—"],
                        ["Admitted", selectedResident.admit_date ? formatFullDate(selectedResident.admit_date) : "—"],
                        ["Care level", selectedResident.care_level || "—"],
                        ["Payor", selectedResident.payor || "—"],
                        ["Primary diagnosis", selectedResident.primary_diagnosis || "—"],
                        ["Physician", selectedResident.physician || "—"],
                        ["Diet", selectedResident.diet || "—"]
                      ].map(([label, value]) => (
                        <div key={String(label)} className="min-w-0">
                          <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b7b68]">{label}</dt>
                          <dd className="mt-1 text-[14px] leading-5 text-[#3e3429]">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-5 border-t border-[#e8e0d5] pt-4 text-[12px] leading-5 text-[#736657]">
                      Current medication orders are not available in this resident directory.
                    </div>
                  </article>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <ResidentDrilldownModal
        resident={residentDrilldownResident}
        incidents={residentDrilldownIncidents}
        onClose={() => setResidentDrilldownId(null)}
      />
    </div>
  );
}
