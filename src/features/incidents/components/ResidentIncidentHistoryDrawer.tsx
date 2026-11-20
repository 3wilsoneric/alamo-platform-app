import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { displayIncidentLabel } from "../../../../shared/incident-display-labels.mjs";
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
    <div className="incident-resident-fact" data-field={label}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function ResidentIncidentHistoryDrawer({
  incident,
  incidents,
  priorityConfig,
  onClose
}: ResidentIncidentHistoryDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!incident || !dialog) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      requestAnimationFrame(() => {
        if (returnFocus?.isConnected && !document.querySelector("dialog[open]")) returnFocus.focus();
      });
    };
  }, [incident?.id]);
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
    <dialog ref={dialogRef} className="incident-history-dialog" onCancel={onClose}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      aria-label={`${incident.client_name || "Unknown resident"} incident history`}>
      <div className="incident-history-sheet">
        <div className="incident-history-sheet__header">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="incident-history-sheet__eyebrow">
                Resident incident history
              </div>
              <h2 className="incident-history-sheet__name">
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
              autoFocus
              className="grid h-11 w-11 shrink-0 place-items-center border border-[#d9d9d9] bg-white text-[#595959] transition-colors hover:border-[#0f8b73] hover:text-[#0f8b73]"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="incident-history-sheet__body">
          <div className="incident-history-sheet__summary">
            <dl className="incident-resident-facts">
              <ResidentDetailRow label="Unit" value={incident.unit_number || "—"} />
              <ResidentDetailRow label="Age" value={incident.age != null ? String(incident.age) : "—"} />
              <ResidentDetailRow label="Care Level" value={incident.care_level || "—"} />
              <ResidentDetailRow label="Physician" value={incident.physician || "—"} />
              <ResidentDetailRow label="Diagnosis" value={incident.primary_diagnosis || "—"} />
            </dl>

            <dl className="incident-history-priorities">
              <div className="incident-history-total"><dt>History</dt><dd>{history.length} incident{history.length === 1 ? "" : "s"}</dd></div>
              {(["HIGH", "MEDIUM", "LOW"] as const).map((priority) => {
                const presentation = priorityConfig[priority];
                return (
                  <div
                    key={priority}
                    className="incident-history-priorities__item"
                    style={{ color: presentation.color }}
                  >
                    <dt>{priority}</dt>
                    <dd>{priorityCounts[priority]}</dd>
                  </div>
                );
              })}
            </dl>
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
                          {displayIncidentLabel(item.incident_type || "General incident")}
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
    </dialog>
  );
}
