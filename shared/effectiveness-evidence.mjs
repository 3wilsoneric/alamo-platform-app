export const EFFECTIVENESS_AUDIENCES = Object.freeze([
  Object.freeze({
    id: "county",
    label: "County and local systems",
    shortLabel: "County",
    decision: "Placement capacity, crisis pressure, continuity, and accountable use of local funds",
    leadEvidence: Object.freeze(["capacity", "acuity", "stabilization", "continuity"])
  }),
  Object.freeze({
    id: "state",
    label: "State behavioral health and Medicaid",
    shortLabel: "State",
    decision: "Statewide access, regional equity, contract performance, and system capacity",
    leadEvidence: Object.freeze(["capacity", "acuity", "continuity", "stabilization"])
  }),
  Object.freeze({
    id: "managed-care",
    label: "Managed care and health plans",
    shortLabel: "Managed care",
    decision: "Network adequacy, medication execution, avoidable acute use, and continuity",
    leadEvidence: Object.freeze(["stabilization", "medication", "continuity", "capacity"])
  }),
  Object.freeze({
    id: "provider",
    label: "Provider and hospital networks",
    shortLabel: "Providers",
    decision: "Reliable step-down capacity, clinical complexity, stabilization, and referral continuity",
    leadEvidence: Object.freeze(["acuity", "stabilization", "medication", "continuity"])
  }),
  Object.freeze({
    id: "executive",
    label: "Executive and board stakeholders",
    shortLabel: "Executive",
    decision: "Operating reach, quality signals, capacity utilization, and evidence gaps",
    leadEvidence: Object.freeze(["capacity", "stabilization", "medication", "continuity"])
  })
]);

export const EFFECTIVENESS_EVIDENCE = Object.freeze({
  capacity: Object.freeze({
    label: "Access and capacity",
    available: "Governed census, operating limits, licensed capacity, admissions, and discharges",
    claim: "Shows the number of people served and the capacity available to the referral system."
  }),
  acuity: Object.freeze({
    label: "Population acuity",
    available: "Current diagnoses, age, and length of stay",
    claim: "Describes the complexity and persistence of the population being served."
  }),
  stabilization: Object.freeze({
    label: "Stabilization signals",
    available: "Incident volume, incident concentration, and month-over-month direction",
    claim: "Shows observed operating and safety direction without claiming causation."
  }),
  medication: Object.freeze({
    label: "Medication execution",
    available: "Weighted scheduled-administration completion and refusal concentration",
    claim: "Shows whether medication administration is being executed consistently."
  }),
  continuity: Object.freeze({
    label: "Continuity and movement",
    available: "Admission episodes, discharges, resident flow, and internal return episodes",
    claim: "Shows movement through the program and repeat use inside the Alamo system."
  })
});

export const EFFECTIVENESS_DATA_GAPS = Object.freeze([
  "Prior acute-care, emergency-department, jail, and placement utilization",
  "Complete structured discharge destinations and lower-level-of-care outcomes",
  "External readmissions and recidivism after discharge",
  "Repeated standardized assessment scores",
  "Approved county, hospital, IMD, and jail cost benchmarks"
]);

const AUDIENCE_BY_ID = new Map(
  EFFECTIVENESS_AUDIENCES.map((audience) => [audience.id, audience])
);

export function getEffectivenessAudience(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return AUDIENCE_BY_ID.get(normalized) ?? EFFECTIVENESS_AUDIENCES[0];
}

export function getEffectivenessEvidencePlan(audienceValue) {
  const audience = getEffectivenessAudience(audienceValue);
  return {
    audience,
    evidence: audience.leadEvidence.map((id) => ({
      id,
      ...EFFECTIVENESS_EVIDENCE[id]
    })),
    gaps: [...EFFECTIVENESS_DATA_GAPS]
  };
}
