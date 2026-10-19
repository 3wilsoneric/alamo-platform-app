export interface ResidentDirectoryIdentity {
  facility_id?: string | null;
  res_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  unit_number?: string | null;
}

export interface IncidentResidentIdentity {
  facility_id?: string | null;
  resident_id?: string | null;
  client_name?: string | null;
  unit_number?: string | null;
}

function scopedKey(scope?: string | null, value?: string | null) {
  const normalizedScope = scope?.trim();
  const normalizedValue = value?.trim().toLowerCase();
  return normalizedScope && normalizedValue ? `${normalizedScope}:${normalizedValue}` : "";
}

export function getScopedResidentKey(facilityId?: string | null, residentId?: string | null) {
  return scopedKey(facilityId, residentId);
}

export function isMissingResidentName(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  return (
    !normalized ||
    normalized === "unknown client" ||
    normalized === "unknown resident" ||
    /^resident\s+\d+/.test(normalized)
  );
}

export function getResidentDisplayName(resident: ResidentDirectoryIdentity) {
  return [resident.first_name, resident.last_name].filter(Boolean).join(" ").trim();
}

export function getIncidentResidentMatchKey(incident: IncidentResidentIdentity) {
  const residentKey = scopedKey(incident.facility_id, incident.resident_id);
  if (residentKey) return `id:${residentKey}`;

  const name = incident.client_name?.trim().toLowerCase();
  if (isMissingResidentName(name)) return "";
  return `name:${incident.facility_id?.trim() ?? ""}:${name}`;
}

export function incidentsMatchResident(
  left: IncidentResidentIdentity,
  right: IncidentResidentIdentity
) {
  const leftKey = getIncidentResidentMatchKey(left);
  const rightKey = getIncidentResidentMatchKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

export function mapIncidentsWithResidentMatch<
  TIncident extends IncidentResidentIdentity,
  TResident extends ResidentDirectoryIdentity
>(
  incidents: TIncident[],
  residents: TResident[],
  merge: (incident: TIncident, resident: TResident, residentName: string) => TIncident
) {
  const residentByScopedId = new Map<string, TResident>();
  const residentById = new Map<string, TResident>();
  const duplicateResidentIds = new Set<string>();
  const residentByScopedUnit = new Map<string, TResident>();
  const duplicateScopedUnits = new Set<string>();

  residents.forEach((resident) => {
    const scopedId = scopedKey(resident.facility_id, resident.res_number);
    if (scopedId) residentByScopedId.set(scopedId, resident);

    const residentId = resident.res_number?.trim();
    if (residentId) {
      if (residentById.has(residentId)) duplicateResidentIds.add(residentId);
      else residentById.set(residentId, resident);
    }

    const scopedUnit = scopedKey(resident.facility_id, resident.unit_number);
    if (scopedUnit) {
      if (residentByScopedUnit.has(scopedUnit)) duplicateScopedUnits.add(scopedUnit);
      else residentByScopedUnit.set(scopedUnit, resident);
    }
  });

  return incidents.map((incident) => {
    const residentId = incident.resident_id?.trim() ?? "";
    const scopedId = scopedKey(incident.facility_id, incident.resident_id);
    const scopedUnit = scopedKey(incident.facility_id, incident.unit_number);
    const resident =
      residentByScopedId.get(scopedId) ??
      (residentId && !duplicateResidentIds.has(residentId) ? residentById.get(residentId) : undefined) ??
      (scopedUnit && !duplicateScopedUnits.has(scopedUnit)
        ? residentByScopedUnit.get(scopedUnit)
        : undefined);

    return resident ? merge(incident, resident, getResidentDisplayName(resident)) : incident;
  });
}
