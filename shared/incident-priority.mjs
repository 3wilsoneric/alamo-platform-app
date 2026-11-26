// The single operational incident priority scale (owner-approved). Every
// server path (incident center, Ally incident-summary, live SQL) derives
// priority from this module. Provisional operational sorting, not a clinical or
// licensing severity grade.

export const INCIDENT_PRIORITIES = Object.freeze(["high", "medium", "low", "unknown"]);

/** @param {{ sentinelEvent: boolean | null | undefined, emergencyServicesNotified: boolean | null | undefined, injuryOccurred: boolean | null | undefined }} flags */
export function deriveIncidentPriority({ sentinelEvent, emergencyServicesNotified, injuryOccurred }) {
  if (sentinelEvent === true || emergencyServicesNotified === true) return "high";
  if (injuryOccurred === true) return "medium";
  if (sentinelEvent === false && emergencyServicesNotified === false && injuryOccurred === false) return "low";
  return "unknown";
}

const YES = "('yes', 'true', 'y', '1')", NO = "('no', 'false', 'n', '0')";

/**
 * The same scale as a Databricks SQL CASE expression over string flag columns.
 * Column names are trusted identifiers chosen by server code, never user input.
 * @param {{ sentinelEvent: string, emergencyServicesNotified: string, injuryOccurred: string }} columns
 */
export function incidentPrioritySql({ sentinelEvent, emergencyServicesNotified, injuryOccurred }) {
  for (const column of [sentinelEvent, emergencyServicesNotified, injuryOccurred]) {
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(column)) throw Error("Invalid incident priority column.");
  }
  const flag = (/** @type {string} */ column, /** @type {string} */ values) => `lower(trim(${column})) IN ${values}`;
  return `CASE
      WHEN ${flag(sentinelEvent, YES)} OR ${flag(emergencyServicesNotified, YES)} THEN 'high'
      WHEN ${flag(injuryOccurred, YES)} THEN 'medium'
      WHEN ${flag(sentinelEvent, NO)}
        AND ${flag(emergencyServicesNotified, NO)}
        AND ${flag(injuryOccurred, NO)} THEN 'low'
      ELSE 'unknown'
    END`;
}

/**
 * Legacy incident-center label (HIGH/MEDIUM/LOW). The UI type has no UNKNOWN,
 * so unknown maps to LOW; callers also expose the shared level separately.
 * @param {"high" | "medium" | "low" | "unknown"} priority
 */
export const legacyIncidentPriorityLabel = (priority) => priority === "high" ? "HIGH" : priority === "medium" ? "MEDIUM" : "LOW";
