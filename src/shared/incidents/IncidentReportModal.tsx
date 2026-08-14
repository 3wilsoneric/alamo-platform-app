import { X } from "lucide-react";
import { formatDisplayDate } from "../../../shared/display-date.mjs";
import type {
  CommunityIncidentDetailRecord
} from "../types/platformSnapshot";
import type {
  IncidentDetailListItem
} from "../modules/IncidentDetailListModule";

export interface IncidentReportRecord {
  id: string;
  date: string;
  receivedAt?: string | null;
  community?: string | null;
  resident: string;
  residentId?: string | null;
  unit?: string | null;
  category?: string | null;
  incidentType?: string | null;
  location?: string | null;
  staff?: string | null;
  narrative?: string | null;
  assistance?: string | null;
  injuryOccurred?: boolean;
  policeCalled?: boolean;
  sentinelEvent?: boolean;
  previousHistory?: boolean;
  notifications?: Array<{ recipient: string; status: string }>;
  flags?: string[];
}

function displayValue(value: string | number | null | undefined) {
  const text = String(value ?? "").trim();
  return text || "—";
}

function formatDate(value: string | null | undefined) {
  return formatDisplayDate(value, { fallback: displayValue(value) });
}

export function incidentReportFromCommunityRecord(
  incident: CommunityIncidentDetailRecord
): IncidentReportRecord {
  return {
    id: incident.id,
    date: formatDate(incident.incident_date),
    receivedAt: incident.received_at,
    community: incident.facility_name,
    resident: incident.client_name || "Unknown resident",
    residentId: incident.resident_id,
    unit: incident.unit_number,
    category: incident.category,
    incidentType: incident.incident_type,
    location: incident.location,
    staff: incident.staff_name,
    narrative: incident.email_body,
    assistance: incident.assistance_given,
    injuryOccurred: incident.injury_occurred,
    policeCalled: incident.police_called,
    sentinelEvent: incident.sentinel_event,
    previousHistory: incident.previous_history,
    notifications: incident.notifications,
    flags: incident.flags
  };
}

export function incidentListItemFromCommunityRecord(
  incident: CommunityIncidentDetailRecord
): IncidentDetailListItem {
  return {
    id: incident.id,
    date: formatDate(incident.incident_date),
    community: incident.facility_name,
    resident: incident.client_name || "Unknown resident",
    residentId: incident.resident_id,
    unit: incident.unit_number,
    category: incident.category,
    incidentType: incident.incident_type,
    location: incident.location,
    description: incident.email_body || incident.assistance_given || incident.location,
    flagCount: [
      incident.injury_occurred,
      incident.police_called,
      incident.sentinel_event,
      incident.previous_history
    ].filter(Boolean).length + incident.flags.length
  };
}

export function incidentReportFromListItem(
  incident: IncidentDetailListItem
): IncidentReportRecord {
  return {
    id: incident.id,
    date: incident.date,
    community: incident.community ?? null,
    resident: incident.resident,
    residentId: incident.residentId ?? null,
    unit: incident.unit ?? null,
    category: incident.category ?? null,
    incidentType: incident.incidentType ?? null,
    location: incident.location ?? null,
    narrative: incident.description ?? null
  };
}

function ReportFact({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="border-t border-[#d9d9d9] py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#737373]">{label}</div>
      <div className="mt-1 text-[14px] font-semibold leading-5 text-[#111111]">{displayValue(value)}</div>
    </div>
  );
}

function NarrativeSection({ title, value }: { title: string; value: string | null | undefined }) {
  if (!value?.trim()) return null;
  return (
    <section className="border-t border-[#d9d9d9] py-4">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#595959]">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap font-serif text-[16px] leading-7 text-[#333333]">{value}</p>
    </section>
  );
}

export function IncidentReportModal({
  incident,
  onClose,
  onSelectResident
}: {
  incident: IncidentReportRecord | null;
  onClose: () => void;
  onSelectResident?: (incident: IncidentReportRecord) => void;
}) {
  if (!incident) return null;

  const signals = [
    incident.injuryOccurred ? "Injury occurred" : null,
    incident.policeCalled ? "Police called" : null,
    incident.sentinelEvent ? "Sentinel event" : null,
    incident.previousHistory ? "Previous history" : null,
    ...(incident.flags ?? [])
  ].filter((value): value is string => Boolean(value));

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#111111]/68 p-0 backdrop-blur-[6px] sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Incident ${incident.id} report`}
      data-incident-report-modal={incident.id}
    >
      <button type="button" className="absolute inset-0" aria-label="Close incident report" onClick={onClose} />
      <article className="relative z-10 flex max-h-[94dvh] w-full max-w-[920px] flex-col overflow-hidden border-t-[3px] border-[#0f8b73] bg-white shadow-[0_24px_90px_rgba(0,0,0,0.42)] sm:max-h-[88dvh] sm:border sm:border-t-[3px]">
        <header className="flex items-start justify-between gap-4 border-b border-[#111111] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">
              Incident report · #{incident.id}
            </div>
            {onSelectResident && incident.residentId ? (
              <button
                type="button"
                onClick={() => onSelectResident(incident)}
                className="mt-1 truncate text-left font-serif text-[26px] font-semibold leading-tight tracking-[-0.035em] text-[#111111] hover:text-[#0f8b73]"
              >
                {incident.resident}
              </button>
            ) : (
              <h2 className="mt-1 truncate font-serif text-[26px] font-semibold leading-tight tracking-[-0.035em] text-[#111111]">
                {incident.resident}
              </h2>
            )}
            <p className="mt-1 text-[13px] leading-5 text-[#595959]">
              {[incident.community, incident.unit ? `Unit ${incident.unit}` : null, incident.date].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close incident report"
            className="grid h-10 w-10 shrink-0 place-items-center border border-[#d9d9d9] bg-white text-[#595959] hover:border-[#111111] hover:text-[#111111]"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 sm:px-6">
          <div className="grid gap-x-5 sm:grid-cols-2 lg:grid-cols-4">
            <ReportFact label="Category" value={incident.category || "Incident"} />
            <ReportFact label="Type" value={incident.incidentType} />
            <ReportFact label="Location" value={incident.location} />
            <ReportFact label="Staff" value={incident.staff} />
          </div>

          {signals.length ? (
            <section className="border-t border-[#d9d9d9] py-4">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#595959]">Incident signals</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {signals.map((signal) => (
                  <span key={signal} className="border border-[#d9d9d9] bg-[#f5f4ef] px-2.5 py-1 text-[11px] font-semibold text-[#333333]">
                    {signal}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <NarrativeSection title="Incident narrative" value={incident.narrative} />
          <NarrativeSection title="Assistance given" value={incident.assistance} />

          {incident.notifications?.length ? (
            <section className="border-t border-[#d9d9d9] py-4">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#595959]">Notifications</h3>
              <div className="mt-2 divide-y divide-[#d9d9d9] border-y border-[#d9d9d9]">
                {incident.notifications.map((notification, index) => (
                  <div key={`${notification.recipient}-${index}`} className="flex items-center justify-between gap-4 py-2.5 text-[13px]">
                    <span className="font-medium text-[#111111]">{notification.recipient}</span>
                    <span className="text-[#595959]">{notification.status || "Recorded"}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {!incident.narrative && !incident.assistance && !incident.notifications?.length ? (
            <p className="border-t border-[#d9d9d9] py-5 text-[14px] leading-6 text-[#595959]">
              No additional narrative, assistance, or notification detail was published with this incident.
            </p>
          ) : null}
        </div>
      </article>
    </div>
  );
}
