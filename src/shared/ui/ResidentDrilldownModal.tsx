import { X } from "lucide-react";
import {
  formatDisplayDate,
  formatDisplayDateTime
} from "../../../shared/display-date.mjs";

export interface ResidentDrilldownResident {
  res_number: string;
  first_name: string;
  last_name: string;
  age?: number | null;
  admit_date?: string | null;
  los_days?: number | null;
  facility_id?: string;
  facility_name?: string;
  unit_number?: string | null;
  care_level?: string | null;
  payor?: string | null;
  primary_diagnosis?: string | null;
  physician?: string | null;
  diet?: string | null;
}

export interface ResidentDrilldownIncident {
  id: string;
  facility_id?: string;
  facility_name?: string;
  resident_id?: string;
  client_name?: string;
  incident_date?: string | null;
  received_at?: string | null;
  incident_type?: string;
  location?: string;
  priority?: "HIGH" | "MEDIUM" | "LOW";
  email_body?: string | null;
  assistance_given?: string | null;
}

function formatDate(value?: string | null) {
  return formatDisplayDate(value, { month: "long" });
}

function formatDateTime(value?: string | null) {
  return formatDisplayDateTime(value, { month: "long" });
}

function buildResidentKey(resident: ResidentDrilldownResident) {
  return `${resident.facility_id ?? ""}:${resident.res_number}`;
}

function buildIncidentKey(incident: ResidentDrilldownIncident) {
  const residentId = incident.resident_id?.trim();
  if (residentId) {
    return `${incident.facility_id ?? ""}:${residentId}`;
  }
  return "";
}

function getPriorityColors(priority?: "HIGH" | "MEDIUM" | "LOW") {
  if (priority === "HIGH") {
    return {
      border: "#d9a39b",
      background: "#fff7f5",
      color: "#8f2f24"
    };
  }

  if (priority === "MEDIUM") {
    return {
      border: "#d8bd91",
      background: "#fffaf1",
      color: "#7a5318"
    };
  }

  return {
    border: "#d9d9d9",
    background: "#f5f4ef",
    color: "#595959"
  };
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#d9d9d9] py-3 last:border-b-0">
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#595959]">{label}</div>
      <div className="max-w-[65%] text-right text-[13px] font-medium leading-5 text-[#111111]">{value}</div>
    </div>
  );
}

export function ResidentDrilldownModal({
  resident,
  incidents,
  onClose
}: {
  resident: ResidentDrilldownResident | null;
  incidents: ResidentDrilldownIncident[];
  onClose: () => void;
}) {
  if (!resident) return null;

  const residentKey = buildResidentKey(resident);
  const fallbackName = `${resident.first_name} ${resident.last_name}`.trim().toLowerCase();
  const history = incidents
    .filter((incident) => {
      const incidentKey = buildIncidentKey(incident);
      if (residentKey && incidentKey) {
        return residentKey === incidentKey;
      }

      const incidentName = incident.client_name?.trim().toLowerCase();
      return Boolean(
        fallbackName &&
          incidentName &&
          fallbackName === incidentName &&
          (incident.facility_id ?? "") === (resident.facility_id ?? "")
      );
    })
    .sort(
      (left, right) =>
        new Date(right.incident_date || right.received_at || 0).getTime() -
        new Date(left.incident_date || left.received_at || 0).getTime()
    );

  return (
    <div className="fixed inset-0 z-50 bg-black/30 px-3 py-5 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={`${resident.first_name} ${resident.last_name} resident detail`}>
      <button type="button" aria-label="Close resident drilldown" className="absolute inset-0" onClick={onClose} />
      <div className="relative mx-auto flex max-h-[calc(100vh-40px)] w-full max-w-[920px] flex-col overflow-hidden border border-[#111111] bg-white">
        <div className="border-b border-[#111111] px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">
                Resident profile
              </div>
              <h2 className="mt-1.5 truncate font-serif text-[26px] font-semibold tracking-[-0.035em] text-[#111111]">
                {resident.first_name} {resident.last_name}
              </h2>
              <div className="mt-1 text-[13px] text-[#595959]">
                {resident.facility_name || "Unknown community"} · Resident {resident.res_number}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-10 w-10 shrink-0 place-items-center border border-[#d9d9d9] bg-white text-[#595959] transition-colors hover:border-[#0f8b73] hover:text-[#0f8b73]"
              aria-label="Close resident profile"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="border-y border-[#d9d9d9] px-1">
              <DetailRow label="Unit" value={resident.unit_number || "—"} />
              <DetailRow label="Age" value={resident.age != null ? String(resident.age) : "—"} />
              <DetailRow label="LOS" value={resident.los_days != null ? `${resident.los_days} days` : "—"} />
              <DetailRow label="Admit Date" value={formatDate(resident.admit_date)} />
            </div>
            <div className="border-y border-[#d9d9d9] px-1">
              <DetailRow label="Care Level" value={resident.care_level || "—"} />
              <DetailRow label="Payor" value={resident.payor || "—"} />
              <DetailRow label="Diagnosis" value={resident.primary_diagnosis || "—"} />
              <DetailRow label="Physician" value={resident.physician || "—"} />
              <DetailRow label="Diet" value={resident.diet || "—"} />
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#111111]">
                Incident History
              </h3>
              <div className="text-[12px] text-[#595959]">
                {history.length} incident{history.length === 1 ? "" : "s"}
              </div>
            </div>

            {history.length === 0 ? (
              <div className="border border-dashed border-[#d9d9d9] bg-white px-4 py-7 text-center text-[13px] text-[#595959]">
                No incident history is available for this resident in the current feed.
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((incident) => {
                  const tone = getPriorityColors(incident.priority);

                  return (
                    <div
                      key={incident.id}
                      className="border bg-white p-4"
                      style={{ borderColor: tone.border }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div
                            className="inline-flex border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                            style={{
                              borderColor: tone.border,
                              background: tone.background,
                              color: tone.color
                            }}
                          >
                            {incident.priority || "Incident"}
                          </div>
                          <div className="mt-1.5 text-[14px] font-semibold text-[#111111]">
                            {incident.incident_type || "General incident"}
                          </div>
                          <div className="mt-0.5 text-[12px] text-[#595959]">
                            {formatDateTime(incident.incident_date || incident.received_at)} · {incident.location || "No location"}
                          </div>
                        </div>
                        <div className="text-right text-[11px] text-[#737373]">#{incident.id}</div>
                      </div>

                      {incident.email_body ? (
                        <div className="mt-3 border-l-2 pl-3 text-[13px] leading-6 text-[#333333]" style={{ borderColor: tone.border }}>
                          {incident.email_body}
                        </div>
                      ) : null}

                      {incident.assistance_given ? (
                        <div className="mt-3 border-t border-[#d9d9d9] pt-3 text-[13px] leading-6 text-[#333333]">
                          <span className="font-semibold text-[#111111]">Assistance: </span>
                          {incident.assistance_given}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
