import { X } from "lucide-react";
import {
  formatIncidentDateTime,
  incidentsShareResident,
  type IncidentPriority,
  type IncidentRecord
} from "../incidentCenterModel";

interface PriorityPresentation {
  color: string;
  bg: string;
  border: string;
}

interface ResidentIncidentHistoryDrawerProps {
  incident: IncidentRecord | null;
  incidents: IncidentRecord[];
  priorityConfig: Record<IncidentPriority, PriorityPresentation>;
  onClose: () => void;
}

function ResidentDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[#d9d9d9] py-3 last:border-b-0">
      <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#595959]">{label}</div>
      <div className="max-w-[65%] text-right text-[13px] font-medium leading-5 text-[#111111]">{value}</div>
    </div>
  );
}

export function ResidentIncidentHistoryDrawer({
  incident,
  incidents,
  priorityConfig,
  onClose
}: ResidentIncidentHistoryDrawerProps) {
  if (!incident) return null;

  const history = incidents
    .filter((candidate) => incidentsShareResident(candidate, incident))
    .sort(
      (left, right) =>
        new Date(right.incident_date || right.received_at).getTime() -
        new Date(left.incident_date || left.received_at).getTime()
    );
  const priorityCounts = history.reduce<Record<IncidentPriority, number>>(
    (counts, item) => {
      counts[item.priority] += 1;
      return counts;
    },
    { HIGH: 0, MEDIUM: 0, LOW: 0 }
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/30 px-3 py-5 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={`${incident.client_name || "Unknown resident"} incident history`}>
      <button
        type="button"
        aria-label="Close resident drilldown"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
      />
      <div className="relative mx-auto flex max-h-[calc(100vh-40px)] w-full max-w-[920px] flex-col overflow-hidden border border-[#111111] bg-white shadow-[0_28px_72px_-44px_rgba(0,0,0,0.32)]">
        <div className="border-b border-[#111111] px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">
                Resident incident history
              </div>
              <h2 className="mt-1.5 truncate font-serif text-[26px] font-semibold tracking-[-0.035em] text-[#111111]">
                {incident.client_name || "Unknown Client"}
              </h2>
              <div className="mt-1 text-[13px] text-[#595959]">
                {incident.facility_name || "Unknown community"} · Resident {incident.resident_id || "—"}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close resident drilldown"
              onClick={onClose}
              className="grid h-10 w-10 shrink-0 place-items-center border border-[#d9d9d9] bg-white text-[#595959] transition-colors hover:border-[#0f8b73] hover:text-[#0f8b73]"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="border-y border-[#d9d9d9] px-1">
              <ResidentDetailRow label="Unit" value={incident.unit_number || "—"} />
              <ResidentDetailRow label="Age" value={incident.age != null ? String(incident.age) : "—"} />
              <ResidentDetailRow label="Care Level" value={incident.care_level || "—"} />
              <ResidentDetailRow label="Diagnosis" value={incident.primary_diagnosis || "—"} />
              <ResidentDetailRow label="Physician" value={incident.physician || "—"} />
              <ResidentDetailRow label="History" value={`${history.length} incident${history.length === 1 ? "" : "s"}`} />
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3">
              {(["HIGH", "MEDIUM", "LOW"] as const).map((priority) => {
                const presentation = priorityConfig[priority];
                return (
                  <div
                    key={priority}
                    className="border px-3 py-2"
                    style={{ borderColor: presentation.border, background: presentation.bg }}
                  >
                    <div
                      className="text-[10px] font-semibold uppercase tracking-[0.1em]"
                      style={{ color: presentation.color }}
                    >
                      {priority}
                    </div>
                    <div
                      className="mt-1 text-[18px] font-semibold leading-none"
                      style={{ color: presentation.color }}
                    >
                      {priorityCounts[priority]}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#111111]">
                Past Incidents
              </h3>
              <div className="text-[12px] text-[#595959]">Newest first</div>
            </div>

            <div className="space-y-2">
              {history.map((item) => {
                const presentation = priorityConfig[item.priority];
                return (
                  <div
                    key={item.id}
                    className="border bg-white p-4"
                    style={{
                      borderColor: item.id === incident.id
                        ? presentation.border
                        : "#d9d9d9"
                    }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]"
                            style={{
                              borderColor: presentation.border,
                              color: presentation.color,
                              background: presentation.bg
                            }}
                          >
                            {item.priority}
                          </span>
                          {item.id === incident.id ? (
                            <span className="border border-[#d9d9d9] bg-[#f7fbf9] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[#0f8b73]">
                              Selected
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1.5 text-[14px] font-semibold text-[#111111]">
                          {item.incident_type || "General incident"}
                        </div>
                        <div className="mt-0.5 text-[12px] text-[#595959]">
                          {formatIncidentDateTime(item.incident_date || item.received_at)} · {item.location || "No location"}
                        </div>
                      </div>
                      <div className="text-right text-[11px] text-[#737373]">#{item.id}</div>
                    </div>

                    {item.email_body ? (
                      <div
                        className="mt-2.5 border-l-2 pl-3 text-[13px] leading-6 text-[#3f3f3f]"
                        style={{ borderColor: presentation.border }}
                      >
                        {item.email_body}
                      </div>
                    ) : null}

                    {item.assistance_given ? (
                      <div className="mt-2.5 border border-[#d9d9d9] bg-[#fafafa] px-3 py-2 text-[13px] leading-6 text-[#3f3f3f]">
                        <span className="font-semibold text-[#111111]">Assistance: </span>
                        {item.assistance_given}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
