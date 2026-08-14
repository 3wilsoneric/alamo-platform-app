import { Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatDisplayDate } from "../../../shared/display-date.mjs";
import { fetchDataExplorer } from "../api/platformData";
import type { DataExplorerResponse } from "../types/platformSnapshot";
import { surfaceInPlatformCanvas } from "../canvas/canvasEvents";

type ResidentRow = DataExplorerResponse["rows"][number];

interface ResidentSearchModuleProps {
  facilityId?: string | null;
  embedded?: boolean;
  compact?: boolean;
  initialResidentId?: string | null;
  initialQuery?: string | null;
  onOpenIncidentHistory?: (residentId: string, residentName: string) => void;
}

function displayValue(value: unknown) {
  if (value == null || value === "") return "—";
  return String(value);
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatNumber(value: unknown) {
  const number = numberValue(value);
  return number == null ? displayValue(value) : new Intl.NumberFormat("en-US").format(number);
}

function formatDays(value: unknown) {
  const number = numberValue(value);
  return number == null ? displayValue(value) : `${formatNumber(number)} days`;
}

function formatDateValue(value: unknown) {
  return formatDisplayDate(value);
}

function formatPercent(value: unknown) {
  const number = numberValue(value);
  return number == null ? displayValue(value) : `${number.toFixed(1)}%`;
}

function residentKey(row: ResidentRow, index = 0) {
  return String(row.id ?? `${row.community_name ?? "community"}-${row.resident_name ?? "resident"}-${index}`);
}

function residentName(row?: ResidentRow | null) {
  return displayValue(row?.resident_name);
}

function normalize(value: unknown) {
  return String(value ?? "").toLowerCase().trim();
}

function rowMatchesQuery(row: ResidentRow, query: string) {
  const text = normalize(query);
  if (!text) return true;
  return [
    row.resident_name,
    row.id,
    row.community_name,
    row.unit,
    row.primary_diagnosis,
    row.care_level,
    row.payor,
    row.physician,
    row.diet,
    row.last_incident_category
  ].some((value) => normalize(value).includes(text));
}

function uniqueSorted(values: unknown[]) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function ProfileFact({
  label,
  value,
  wide = false,
  compact = false,
  onClick
}: {
  label: string;
  value: unknown;
  wide?: boolean;
  compact?: boolean;
  onClick?: () => void;
}) {
  const className = `border-t border-[#d9d9d9] px-0 text-left ${compact ? "py-2" : "py-3"} ${wide ? "sm:col-span-2 xl:col-span-3" : ""}`;
  const content = (
    <>
      <div className={`${compact ? "text-[10px]" : "text-[11px]"} font-bold uppercase tracking-[0.12em] text-[#737373]`}>{label}</div>
      <div className={`${compact ? "mt-0.5 text-[14px] leading-5" : "mt-1 text-[15px] leading-6"} min-h-[20px] font-semibold text-[#111111]`}>{displayValue(value)}</div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        data-module-content-control="true"
        data-resident-incident-drilldown={label}
        onClick={onClick}
        className={`${className} group hover:bg-[#f7fbf9]`}
      >
        {content}
        <span className="mt-1 block text-[10px] font-semibold text-[#0f8b73] opacity-0 transition-opacity group-hover:opacity-100">
          View incident history →
        </span>
      </button>
    );
  }

  return (
    <div className={className}>{content}</div>
  );
}

function selectedResidentFacts(resident: ResidentRow) {
  const lastIncident = [
    resident.last_incident_category,
    formatDateValue(resident.last_incident_date)
  ].filter((value) => value && value !== "—").join(" · ") || "—";

  const medicationSummaryAvailable = [
    resident.active_medication_count,
    resident.mar_compliance_pct_30d,
    resident.mar_not_given_30d,
    resident.mar_refusals_30d,
    resident.last_mar_recorded_date
  ].some((value) => value != null && value !== "");
  const medicationFacts: Array<[string, unknown, boolean?]> = medicationSummaryAvailable
    ? [
        ["Active medications", formatNumber(resident.active_medication_count)],
        ["Active psychotropics", formatNumber(resident.active_psychotropic_count)],
        ["Active narcotics", formatNumber(resident.active_narcotic_count)],
        ["Active PRNs", formatNumber(resident.active_prn_count)],
        ["MAR compliance, 30 days", formatPercent(resident.mar_compliance_pct_30d)],
        ["Scheduled, 30 days", formatNumber(resident.mar_scheduled_30d)],
        ["Given, 30 days", formatNumber(resident.mar_given_30d)],
        ["Not given, 30 days", formatNumber(resident.mar_not_given_30d)],
        ["Refusals, 7 days", formatNumber(resident.mar_refusals_7d)],
        ["Refusals, 30 days", formatNumber(resident.mar_refusals_30d)],
        ["Refusals, 90 days", formatNumber(resident.mar_refusals_90d)],
        ["PRN given, 30 days", formatNumber(resident.mar_prn_given_30d)],
        ["PRN follow-up, 30 days", formatNumber(resident.mar_prn_followup_30d)],
        ["Last MAR record", formatDateValue(resident.last_mar_recorded_date)]
      ]
    : [["Medication summary", "Not published in this resident directory", true]];

  return [
    ["Resident #", resident.id],
    ["Community", resident.community_name],
    ["Unit", resident.unit],
    ["Age", resident.age],
    ["LOS", formatDays(resident.los_days)],
    ["Admitted", formatDateValue(resident.admit_date)],
    ["Diagnosis", resident.primary_diagnosis, true],
    ["Care level", resident.care_level],
    ["Payor", resident.payor],
    ["Physician", resident.physician],
    ["Diet", resident.diet],
    ["Incidents", formatNumber(resident.incident_count_all_time)],
    ["30 days", formatNumber(resident.incident_count_30d)],
    ["90 days", formatNumber(resident.incident_count_90d)],
    ["180 days", formatNumber(resident.incident_count_180d)],
    ["Last incident", lastIncident, true],
    ["Last note", formatDateValue(resident.last_note_date)],
    ["Days since note", formatNumber(resident.days_since_last_note)],
    ...medicationFacts
  ] as Array<[string, unknown, boolean?]>;
}

function ResidentProfileCard({
  resident,
  compact = false,
  onOpenIncidentHistory
}: {
  resident: ResidentRow | null;
  compact?: boolean;
  onOpenIncidentHistory?: (residentId: string, residentName: string) => void;
}) {
  if (!resident) {
    return (
      <div className="flex min-h-[320px] items-center justify-center border border-dashed border-[#d9d9d9] bg-white px-5 text-center text-[14px] font-medium text-[#595959]">
        Search or pick a resident to see the profile.
      </div>
    );
  }

  return (
    <div data-module-row="resident-profile-card" className={`border-y border-[#111111] bg-white ${compact ? "p-3.5" : "p-5"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`grid shrink-0 place-items-center border border-[#d9d9d9] bg-[#f7fbf9] text-[#0f8b73] ${compact ? "h-9 w-9" : "h-11 w-11"}`}>
            <UserRound className="h-5 w-5 stroke-[2]" />
          </div>
          <div className="min-w-0">
            <div className={`truncate font-semibold tracking-[-0.05em] text-[#111111] ${compact ? "text-[23px]" : "text-[27px]"}`}>
              {residentName(resident)}
            </div>
            <div className="mt-1 text-[14px] font-medium leading-6 text-[#595959]">
              {displayValue(resident.community_name)} · Unit {displayValue(resident.unit)}
            </div>
          </div>
        </div>
        <div className="border border-[#d9d9d9] bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#595959]">
          #{displayValue(resident.id)}
        </div>
      </div>

      <div className={`${compact ? "mt-3 gap-x-3 gap-y-0" : "mt-4 gap-2"} grid sm:grid-cols-2 xl:grid-cols-3`}>
        {selectedResidentFacts(resident).map(([label, value, wide]) => (
          <ProfileFact
            key={label}
            label={label}
            value={value}
            compact={compact}
            {...(wide !== undefined ? { wide } : {})}
            {...([
              "Incidents",
              "30 days",
              "90 days",
              "180 days",
              "Last incident"
            ].includes(label) && onOpenIncidentHistory
              ? {
                  onClick: () => onOpenIncidentHistory(
                    String(resident.id ?? ""),
                    residentName(resident)
                  )
                }
              : {})}
          />
        ))}
      </div>
    </div>
  );
}

export default function ResidentSearchModule({
  facilityId,
  embedded = false,
  compact = false,
  initialResidentId,
  initialQuery,
  onOpenIncidentHistory
}: ResidentSearchModuleProps) {
  const [payload, setPayload] = useState<DataExplorerResponse | null>(null);
  const [query, setQuery] = useState(initialQuery ?? "");
  const [community, setCommunity] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialResidentId ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQuery(initialQuery ?? "");
    setSelectedId(initialResidentId ?? null);
  }, [initialQuery, initialResidentId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchDataExplorer("residents", controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setPayload(data);
        const scopedCommunity = data.rows.find((row) => String(row.facility_id ?? "") === String(facilityId ?? ""))?.community_name;
        setCommunity(scopedCommunity ? String(scopedCommunity) : "all");
        setLoading(false);
      })
      .catch((nextError) => {
        if (controller.signal.aborted) return;
        console.warn("Resident search data failed to load.", nextError);
        setError("Resident search failed to load. Refresh the module and try again.");
        setLoading(false);
      });

    return () => controller.abort();
  }, [facilityId]);

  const communityOptions = useMemo(
    () => uniqueSorted(payload?.rows.map((row) => row.community_name) ?? []),
    [payload?.rows]
  );

  const filteredRows = useMemo(() => {
    const rows = payload?.rows ?? [];
    return rows
      .filter((row) => community === "all" || row.community_name === community || row.facility_id === community)
      .filter((row) => rowMatchesQuery(row, query));
  }, [community, payload?.rows, query]);

  const selectedResident = useMemo(() => {
    if (!filteredRows.length) return null;
    return filteredRows.find((row, index) => residentKey(row, index) === selectedId) ?? filteredRows[0];
  }, [filteredRows, selectedId]);

  const visibleRows = filteredRows.slice(0, 72);
  const selectedKey = selectedResident ? residentKey(selectedResident) : null;

  const selectResident = (row: ResidentRow, index = 0) => {
    setSelectedId(residentKey(row, index));
    setQuery(String(row.resident_name ?? ""));
  };
  const openIncidentHistory = (nextResidentId: string, name: string) => {
    if (onOpenIncidentHistory) {
      onOpenIncidentHistory(nextResidentId, name);
      return;
    }
    const selectedFacilityId = String(selectedResident?.facility_id ?? facilityId ?? "");
    if (!selectedFacilityId || !nextResidentId) return;
    surfaceInPlatformCanvas({
      route: `/communities/${selectedFacilityId}?focus=incidents&resident=${encodeURIComponent(nextResidentId)}`,
      sourceLabel: name,
      introText: null
    });
  };

  return (
    <section
      data-resident-search-module="true"
      className={`w-full bg-white ${
        embedded
          ? "p-0 sm:p-0"
          : "border border-[#d9d9d9] p-4 sm:p-5"
      }`}
    >
      <div className={`grid ${compact ? "gap-2 lg:grid-cols-[minmax(260px,1fr)_230px_auto]" : "gap-3 pr-20 sm:pr-24 lg:grid-cols-[minmax(280px,1fr)_300px_auto]"}`}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737373]" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedId(null);
            }}
            placeholder="Search resident, unit, diagnosis, physician, or #"
            className={`${compact ? "h-11" : "h-[52px]"} w-full border border-[#bdbdbd] bg-white pl-11 pr-4 text-[15px] font-medium text-[#111111] outline-none transition-colors placeholder:text-[#8a8a8a] focus:border-[#0f8b73]`}
            aria-label="Search residents"
          />
        </div>

        <select
          value={community}
          onChange={(event) => {
            setCommunity(event.target.value);
            setSelectedId(null);
          }}
          className={`${compact ? "h-11" : "h-[52px]"} border border-[#bdbdbd] bg-white px-4 text-[14px] font-semibold text-[#111111] outline-none focus:border-[#0f8b73]`}
          aria-label="Filter resident search by community"
        >
          <option value="all">All communities</option>
          {communityOptions.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        <div className={`flex items-center justify-center border border-[#d9d9d9] bg-[#fafafa] px-4 text-[13px] font-semibold text-[#595959] lg:min-w-[140px] ${compact ? "h-11" : "h-[52px]"}`}>
          {loading
            ? "Loading..."
            : `${filteredRows.length.toLocaleString()} ${filteredRows.length === 1 ? "resident" : "residents"}`}
        </div>
      </div>

      <div className={`${compact ? "mt-2 gap-2 xl:grid-cols-[minmax(250px,0.62fr)_minmax(430px,1.38fr)]" : "mt-3 gap-3 xl:grid-cols-[minmax(270px,0.68fr)_minmax(460px,1.32fr)]"} grid`}>
        <div className="overflow-hidden border-y border-[#d9d9d9] bg-white">
          <div className={`${compact ? "max-h-[300px] p-1.5 sm:max-h-[360px] xl:max-h-[480px]" : "max-h-[560px] p-2"} overflow-y-auto [scrollbar-width:thin]`}>
            {loading ? (
              <div className="px-4 py-8 text-center text-[13px] font-medium text-[#736657]">Loading residents...</div>
            ) : error ? (
              <div className="px-4 py-8 text-center text-[13px] font-medium text-[#a04436]">{error}</div>
            ) : !visibleRows.length ? (
              <div className="px-4 py-8 text-center text-[13px] font-medium text-[#736657]">No residents match this search.</div>
            ) : null}

            {visibleRows.map((row, index) => {
              const key = residentKey(row, index);
              const isSelected = selectedKey === key || (!selectedId && index === 0);
              return (
                <button
                  key={key}
                  type="button"
                  data-module-content-control="true"
                  onClick={() => selectResident(row, index)}
                className={`block w-full border-b border-[#eeeeee] px-3 text-left transition-colors last:border-b-0 ${compact ? "py-2" : "py-3"} ${
                    isSelected
                      ? "bg-[#f7fbf9]"
                      : "bg-white hover:bg-[#fafafa]"
                  }`}
                >
                  <div className="truncate text-[15px] font-semibold text-[#111111]">{residentName(row)}</div>
                  <div className="mt-0.5 truncate text-[13px] leading-5 text-[#595959]">
                    {displayValue(row.community_name)} · Unit {displayValue(row.unit)}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-[#737373]">
                    {displayValue(row.primary_diagnosis)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center border border-[#d9d9d9] bg-white px-5 text-[14px] font-medium text-[#595959]">
            Loading profile...
          </div>
        ) : error ? (
          <div className="flex min-h-[320px] items-center justify-center border border-[#d9d9d9] bg-white px-5 text-center text-[14px] font-medium text-[#a04436]">
            {error}
          </div>
        ) : (
          <ResidentProfileCard
            resident={selectedResident ?? null}
            compact={compact}
            onOpenIncidentHistory={openIncidentHistory}
          />
        )}
      </div>
    </section>
  );
}
