import { useState } from "react";
import type { IncidentDetailListItem } from "../../../shared/modules/IncidentDetailListModule";
import { IncidentDetailListModule } from "../../../shared/modules/IncidentDetailListModule";
import {
  IncidentReportModal,
  incidentReportFromListItem
} from "../../../shared/incidents/IncidentReportModal";

export function AdHocIncidentDetailModule({
  rows,
  onSelectResident
}: {
  rows: IncidentDetailListItem[];
  onSelectResident?: (row: IncidentDetailListItem) => void;
}) {
  const [selectedIncident, setSelectedIncident] = useState<IncidentDetailListItem | null>(null);

  return (
    <>
      <IncidentDetailListModule
        rows={rows}
        onSelect={setSelectedIncident}
        {...(onSelectResident ? { onSelectResident } : {})}
      />
      <IncidentReportModal
        incident={selectedIncident ? incidentReportFromListItem(selectedIncident) : null}
        onClose={() => setSelectedIncident(null)}
        {...(onSelectResident
          ? {
              onSelectResident: () => {
                const row = selectedIncident;
                setSelectedIncident(null);
                if (row) onSelectResident(row);
              }
            }
          : {})}
      />
    </>
  );
}
