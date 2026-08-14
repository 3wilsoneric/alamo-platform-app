import type {
  LiveCommunityResidentRecord,
  LiveIncidentRecord
} from "../../shared/api/platformData";
import {
  formatDisplayDate,
  formatDisplayDateTime,
  parseDisplayDate
} from "../../../shared/display-date.mjs";
import { getReportingDateKey } from "../../../shared/reporting-date.mjs";
import {
  incidentsMatchResident,
  isMissingResidentName,
  mapIncidentsWithResidentMatch
} from "../../shared/data/residentIncidentMatching";

export type IncidentPriority = "HIGH" | "MEDIUM" | "LOW";

export interface IncidentRecord {
  id: string;
  priority: IncidentPriority;
  stage?: string;
  facility_id?: string;
  facility_name?: string;
  resident_id?: string;
  client_name?: string;
  unit_number?: string | null;
  age?: number | null;
  care_level?: string | null;
  primary_diagnosis?: string | null;
  physician?: string | null;
  staff_name?: string;
  sender?: string;
  incident_type?: string;
  location?: string;
  incident_date?: string;
  triage_score?: string | number;
  injury_occurred?: boolean;
  police_called?: boolean;
  email_body?: string;
  assistance_given?: string | null;
  notifications?: Array<{ recipient: string; status: string }>;
  flags?: string[];
  received_at: string;
}

export function displayDetailValue(value: string | number | null | undefined) {
  if (value == null) return "—";
  const text = String(value).trim();
  return text || "—";
}

export function matchesIncidentSearch(incident: IncidentRecord, searchTerm: string) {
  if (!searchTerm) return true;
  const query = searchTerm.toLowerCase();
  return [incident.client_name, incident.staff_name, incident.incident_type, incident.id]
    .some((value) => (value ?? "").toLowerCase().includes(query));
}

export function formatIncidentAge(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1_440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1_440)}d ago`;
}

export function formatIncidentDateTime(value?: string | null) {
  return formatDisplayDateTime(value, { month: "long" });
}

export function getIncidentReceivedDateKey(incident: IncidentRecord) {
  const receivedText = String(incident.received_at ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(receivedText)) return receivedText;

  const receivedTimestamp = Date.parse(receivedText);
  if (Number.isFinite(receivedTimestamp)) {
    return getReportingDateKey(receivedTimestamp);
  }

  const receivedAt = parseDisplayDate(receivedText);
  if (receivedAt) {
    const year = receivedAt.getFullYear();
    const month = String(receivedAt.getMonth() + 1).padStart(2, "0");
    const day = String(receivedAt.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  return incident.incident_date?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
}

export function getTodayDateKey() {
  return getReportingDateKey();
}

export function formatIncidentDateKey(value?: string) {
  if (!value) return "No date";
  return formatDisplayDate(value, { fallback: "Date unavailable" });
}

export function daysBetweenDateKeys(left?: string, right?: string) {
  if (!left || !right) return null;
  const leftDate = new Date(`${left}T00:00:00Z`);
  const rightDate = new Date(`${right}T00:00:00Z`);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return null;
  return Math.round((rightDate.getTime() - leftDate.getTime()) / 86_400_000);
}

export function incidentsShareResident(left: IncidentRecord, right: IncidentRecord) {
  return incidentsMatchResident(left, right);
}

export function enrichIncidentsWithResidents(
  incidents: Array<IncidentRecord | LiveIncidentRecord>,
  residents: LiveCommunityResidentRecord[]
) {
  return mapIncidentsWithResidentMatch(
    incidents as IncidentRecord[],
    residents,
    (incident, resident, residentName) => {
      const residentId = incident.resident_id || resident.res_number;
      const facilityName = incident.facility_name || resident.facility_name;
      const clientName = isMissingResidentName(incident.client_name) && residentName
        ? residentName
        : incident.client_name;
      const unitNumber = incident.unit_number ?? resident.unit_number;
      const age = incident.age ?? resident.age;
      const careLevel = incident.care_level ?? resident.care_level;
      const diagnosis = incident.primary_diagnosis ?? resident.primary_diagnosis;
      const physician = incident.physician ?? resident.physician;

      return {
        ...incident,
        ...(residentId !== undefined ? { resident_id: residentId } : {}),
        ...(facilityName !== undefined ? { facility_name: facilityName } : {}),
        ...(clientName !== undefined ? { client_name: clientName } : {}),
        ...(unitNumber !== undefined ? { unit_number: unitNumber } : {}),
        ...(age !== undefined ? { age } : {}),
        ...(careLevel !== undefined ? { care_level: careLevel } : {}),
        ...(diagnosis !== undefined ? { primary_diagnosis: diagnosis } : {}),
        ...(physician !== undefined ? { physician } : {})
      };
    }
  );
}

export function partitionIncidentsByReviewStage(incidents: IncidentRecord[]) {
  return {
    active: incidents.filter((incident) => incident.stage !== "reviewed"),
    acknowledged: incidents.filter((incident) => incident.stage === "reviewed")
  };
}
