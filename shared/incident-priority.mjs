/** Provisional operational sorting, not a clinical or licensing severity grade. */
export function deriveIncidentPriority({ sentinelEvent, emergencyServicesNotified, injuryOccurred }) {
  if (sentinelEvent === true || emergencyServicesNotified === true) return "high";
  if (injuryOccurred === true) return "medium";
  if (sentinelEvent === false && emergencyServicesNotified === false && injuryOccurred === false) return "low";
  return "unknown";
}
