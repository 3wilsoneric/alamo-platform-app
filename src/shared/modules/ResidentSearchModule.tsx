import { Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatDisplayDate } from "../../../shared/display-date.mjs";
import { fetchDataExplorer, fetchResidentClientProfile } from "../api/platformData";
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
    row.canonical_client_id,
    row.resident_id,
    row.res_number,
    row.client_name_search,
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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function humanizeProfileField(field: string) {
  const acronyms = new Map([
    ["id", "ID"],
    ["json", "JSON"],
    ["dob", "DOB"],
    ["mrn", "MRN"],
    ["adl", "ADL"],
    ["er", "ER"],
    ["ed", "ED"],
    ["si", "SI"],
    ["hi", "HI"],
    ["lai", "LAI"]
  ]);
  return field
    .replace(/^_+/, "")
    .split("_")
    .filter(Boolean)
    .map((part) => acronyms.get(part.toLowerCase()) ?? `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatProfileValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  if (Array.isArray(value)) return value.length ? value.map(formatProfileValue).join(" · ") : "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  const text = String(value).trim();
  if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
    try {
      return formatProfileValue(JSON.parse(text));
    } catch {
      return text;
    }
  }
  return text || "—";
}

const CLIENT_PROFILE_GROUPS = [
  {
    key: "identity",
    label: "Identity and status",
    description: "Canonical identifiers, names, dates, community, and current status.",
    matches: /^(canonical|resident|name|medical_record|date_of_birth|birth|gender|sex|current_status|facility|communities|unit|first_admit|latest_admit|latest_discharge)/i
  },
  {
    key: "history",
    label: "Placement and history",
    description: "Referral, prior setting, placement trajectory, utilization, and episode context.",
    matches: /(placement|referr|prior|admit|discharge|episode|county|source_file|match_confidence|hospital|crisis|awol|trajectory|setting|housing)/i
  },
  {
    key: "clinical",
    label: "Clinical and functional",
    description: "Diagnoses, medications, allergies, assessments, function, behavior, and risk.",
    matches: /(diagnos|medication|meds|allerg|substance|adl|mobility|behavior|risk|cognition|assessment|clinical|diet|physician|care_level)/i
  },
  {
    key: "legal-social",
    label: "Legal, contacts, and support",
    description: "Conservatorship, legal status, family, contacts, preferences, benefits, and goals.",
    matches: /(legal|conserv|hold|court|probation|parole|justice|family|contact|support|benefit|income|goal|language|preference|social)/i
  },
  {
    key: "quality",
    label: "Coverage and provenance",
    description: "Completion status, source coverage, record counts, review flags, and provenance.",
    matches: /.*/
  }
] as const;

function ClientProfileFields({
  profile,
  columns
}: {
  profile: Record<string, unknown>;
  columns: string[];
}) {
  const sourceColumns = columns.length ? columns : Object.keys(profile);
  const groupedFields = CLIENT_PROFILE_GROUPS.map((group) => ({
    ...group,
    fields: sourceColumns.filter((field) => {
      const firstMatch = CLIENT_PROFILE_GROUPS.find((candidate) => candidate.matches.test(field));
      return firstMatch?.key === group.key;
    })
  })).filter((group) => group.fields.length);

  return (
    <div className="mt-5 border-t border-[#111111] pt-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">Canonical client record</div>
          <div className="mt-1 text-[14px] leading-6 text-[#595959]">
            Every published field is shown below in source-column order.
          </div>
        </div>
        <div className="border border-[#b9d8cf] bg-[#f1f8f5] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#0f6f5d]">
          {sourceColumns.length.toLocaleString()} fields
        </div>
      </div>

      <div className="mt-3 divide-y divide-[#d9d9d9] border-y border-[#d9d9d9]">
        {groupedFields.map((group, index) => (
          <details key={group.key} open={index === 0} className="group bg-white">
            <summary className="cursor-pointer list-none px-1 py-3.5 marker:hidden">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[14px] font-bold text-[#111111]">{group.label}</div>
                  <div className="mt-0.5 text-[12px] leading-5 text-[#737373]">{group.description}</div>
                </div>
                <div className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-[#737373]">
                  {group.fields.length} fields
                </div>
              </div>
            </summary>
            <div className="grid gap-x-5 border-t border-[#eeeeee] px-1 pb-4 sm:grid-cols-2 xl:grid-cols-3">
              {group.fields.map((field) => (
                <div key={field} className="min-w-0 border-b border-[#eeeeee] py-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.11em] text-[#737373]">
                    {humanizeProfileField(field)}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-[13px] font-medium leading-5 text-[#222222]">
                    {formatProfileValue(profile[field])}
                  </div>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function EpisodeHistory({ episodes }: { episodes: Array<Record<string, unknown>> }) {
  if (!episodes.length) return null;
  return (
    <div className="mt-5 border-t border-[#111111] pt-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">Resident episode history</div>
      <div className="mt-1 text-[14px] leading-6 text-[#595959]">
        {episodes.length.toLocaleString()} governed episode{episodes.length === 1 ? "" : "s"}, newest first.
      </div>
      <div className="mt-3 space-y-2">
        {episodes.map((episode, index) => {
          const admitDate = episode.admit_date ?? episode.admission_date ?? episode.episode_start_date ?? episode.latest_admit_date;
          const dischargeDate = episode.discharge_date ?? episode.latest_discharge_date ?? episode.episode_end_date;
          const communityName = episode.facility_name ?? episode.community_name ?? episode.facility_canonical ?? episode.facility_id;
          return (
            <details key={`${String(admitDate ?? "episode")}-${index}`} className="border border-[#d9d9d9] bg-[#fafafa] px-3 py-2.5">
              <summary className="cursor-pointer list-none marker:hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] font-semibold text-[#222222]">
                  <span>{formatDateValue(admitDate)} to {formatDateValue(dischargeDate)}</span>
                  <span className="text-[#737373]">{displayValue(communityName)}</span>
                </div>
              </summary>
              <div className="mt-3 grid gap-x-4 border-t border-[#d9d9d9] sm:grid-cols-2 xl:grid-cols-3">
                {Object.entries(episode).map(([field, value]) => (
                  <div key={field} className="border-b border-[#e6e6e6] py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#737373]">{humanizeProfileField(field)}</div>
                    <div className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-5 text-[#222222]">{formatProfileValue(value)}</div>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
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
    ["Resident #", resident.resident_id ?? resident.res_number],
    ["Canonical client ID", resident.canonical_client_id],
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
  profileColumns,
  enhancedProfileAvailable = false,
  profileLoading = false,
  profileError = null,
  compact = false,
  onOpenIncidentHistory
}: {
  resident: ResidentRow | null;
  profileColumns: string[];
  enhancedProfileAvailable?: boolean;
  profileLoading?: boolean;
  profileError?: string | null;
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

  const clientProfile = asRecord(resident.client_profile);
  const episodeHistory = Array.isArray(resident.resident_episode_history)
    ? resident.resident_episode_history.map(asRecord).filter((episode): episode is Record<string, unknown> => Boolean(episode))
    : [];
  const incidentResidentId = String(resident.resident_id ?? resident.res_number ?? "");

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
          {resident.current_resident ? "Current resident" : "Historical client"}
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
            ].includes(label) && onOpenIncidentHistory && incidentResidentId
              ? {
                  onClick: () => onOpenIncidentHistory(
                    incidentResidentId,
                    residentName(resident)
                  )
                }
              : {})}
          />
        ))}
      </div>

      {!enhancedProfileAvailable ? null : profileLoading ? (
        <div className="mt-4 border-l-4 border-[#0f8b73] bg-[#f1f8f5] px-4 py-3 text-[13px] font-medium leading-5 text-[#0f6f5d]">
          Loading the enhanced client record...
        </div>
      ) : profileError ? (
        <div className="mt-4 border-l-4 border-[#a04436] bg-[#fff4f1] px-4 py-3 text-[13px] font-medium leading-5 text-[#7e3027]">
          {profileError}
        </div>
      ) : !clientProfile ? (
        <div className="mt-4 border-l-4 border-[#ba7a20] bg-[#fff8ea] px-4 py-3 text-[13px] font-medium leading-5 text-[#6d4a16]">
          This current resident profile has no canonical client-database match. The governed resident profile remains available without an inferred identity link.
        </div>
      ) : (
        <ClientProfileFields profile={clientProfile} columns={profileColumns} />
      )}
      {enhancedProfileAvailable ? <EpisodeHistory episodes={episodeHistory} /> : null}
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
  const [selectedDetail, setSelectedDetail] = useState<ResidentRow | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

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
    () => uniqueSorted(payload?.rows.flatMap((row) =>
      Array.isArray(row.community_names) && row.community_names.length
        ? row.community_names
        : [row.community_name]
    ) ?? []),
    [payload?.rows]
  );

  const filteredRows = useMemo(() => {
    const rows = payload?.rows ?? [];
    return rows
      .filter((row) =>
        community === "all" ||
        row.community_name === community ||
        row.facility_id === community ||
        (Array.isArray(row.community_names) && row.community_names.includes(community))
      )
      .filter((row) => rowMatchesQuery(row, query));
  }, [community, payload?.rows, query]);

  const selectedResident = useMemo(() => {
    if (!filteredRows.length) return null;
    return filteredRows.find((row, index) =>
      residentKey(row, index) === selectedId || String(row.resident_id ?? row.res_number ?? "") === selectedId
    ) ?? filteredRows[0];
  }, [filteredRows, selectedId]);

  const visibleRows = filteredRows.slice(0, 72);
  const selectedKey = selectedResident ? residentKey(selectedResident) : null;
  const selectedClientId = payload?.client_database && selectedResident
    ? String(selectedResident.id ?? "")
    : "";
  const profileResident = selectedResident && selectedDetail && String(selectedDetail.id) === String(selectedResident.id)
    ? { ...selectedResident, ...selectedDetail }
    : selectedResident;

  useEffect(() => {
    const controller = new AbortController();
    setSelectedDetail(null);
    setProfileError(null);
    if (!selectedClientId) {
      setProfileLoading(false);
      return () => controller.abort();
    }

    setProfileLoading(true);
    fetchResidentClientProfile(selectedClientId, controller.signal)
      .then((detail) => {
        if (controller.signal.aborted) return;
        setSelectedDetail(detail);
        setProfileLoading(false);
      })
      .catch((nextError) => {
        if (controller.signal.aborted) return;
        console.warn("Enhanced client profile failed to load.", nextError);
        setProfileError("The enhanced client record could not be loaded. The directory summary remains available.");
        setProfileLoading(false);
      });

    return () => controller.abort();
  }, [selectedClientId]);

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
      <div className={`grid ${compact ? "gap-2 lg:grid-cols-[minmax(260px,1fr)_230px_auto]" : "gap-3 lg:pr-24 lg:grid-cols-[minmax(280px,1fr)_300px_auto]"}`}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#737373]" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedId(null);
            }}
            placeholder="Search clients"
            className={`${compact ? "h-11" : "h-[52px]"} w-full min-w-0 border border-[#bdbdbd] bg-white pl-11 pr-4 text-[16px] font-medium text-[#111111] outline-none transition-colors placeholder:text-[#8a8a8a] focus:border-[#0f8b73] sm:text-[15px]`}
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
            : `${filteredRows.length.toLocaleString()} ${payload?.client_database ? (filteredRows.length === 1 ? "client" : "clients") : (filteredRows.length === 1 ? "resident" : "residents")}`}
        </div>
      </div>

      <div className={`${compact ? "mt-2 gap-2 xl:grid-cols-[minmax(250px,0.62fr)_minmax(430px,1.38fr)]" : "mt-3 gap-3 xl:grid-cols-[minmax(270px,0.68fr)_minmax(460px,1.32fr)]"} grid`}>
        <div className="overflow-hidden border-y border-[#d9d9d9] bg-white">
          <div className={`${compact ? "max-h-[300px] p-1.5 sm:max-h-[360px] xl:max-h-[480px]" : "max-h-[340px] p-2 sm:max-h-[560px]"} overflow-y-auto [scrollbar-width:thin]`}>
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
                    {displayValue(row.community_name)}{row.unit ? ` · Unit ${displayValue(row.unit)}` : ""}
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
            resident={profileResident ?? null}
            profileColumns={payload?.client_database?.columns ?? []}
            enhancedProfileAvailable={Boolean(payload?.client_database)}
            profileLoading={profileLoading}
            profileError={profileError}
            compact={compact}
            onOpenIncidentHistory={openIncidentHistory}
          />
        )}
      </div>
    </section>
  );
}
