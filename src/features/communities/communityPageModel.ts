import type {
  CommunityIncidentDetailRecord,
  LiveCommunitiesDashboardResponse,
  LiveIncidentRecord
} from "../../shared/api/platformData";
import {
  isMissingResidentName,
  mapIncidentsWithResidentMatch
} from "../../shared/data/residentIncidentMatching";
import { parseDisplayDate } from "../../../shared/display-date.mjs";

function getMonthBucket(value?: string | null) {
  const date = parseDisplayDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function incidentStreamToDetail(incident: LiveIncidentRecord): CommunityIncidentDetailRecord {
  const flags = incident.flags ?? [];

  return {
    id: incident.id,
    facility_id: incident.facility_id,
    facility_name: incident.facility_name,
    resident_id: incident.resident_id ?? "",
    client_name: incident.client_name,
    unit_number: incident.unit_number ?? null,
    incident_date: incident.incident_date ?? null,
    received_at: incident.received_at,
    month_bucket: getMonthBucket(incident.incident_date ?? incident.received_at),
    category: incident.incident_type || "General",
    incident_type: incident.incident_type || "—",
    location: incident.location ?? "",
    injury_occurred: Boolean(incident.injury_occurred),
    police_called: Boolean(incident.police_called),
    sentinel_event: flags.includes("sentinel"),
    previous_history: flags.includes("history"),
    staff_name: incident.staff_name ?? incident.sender ?? null,
    email_body: incident.email_body ?? null,
    assistance_given: incident.assistance_given ?? null,
    notifications: incident.notifications ?? [],
    flags
  };
}

export function enrichIncidentDetailsWithResidents(
  incidents: CommunityIncidentDetailRecord[],
  residents: LiveCommunitiesDashboardResponse["residents"]
) {
  return mapIncidentsWithResidentMatch(incidents, residents, (incident, resident, residentName) => ({
    ...incident,
    resident_id: incident.resident_id || resident.res_number,
    client_name: isMissingResidentName(incident.client_name) && residentName ? residentName : incident.client_name,
    unit_number: incident.unit_number ?? resident.unit_number
  }));
}
