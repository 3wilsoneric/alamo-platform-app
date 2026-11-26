// Owner-approved business definitions. Ally data cards, metric definitions and
// catalog text quote these strings so every surface names the same measure.
import { DAILY_CENSUS_BASIS, DAILY_CENSUS_DEFINITION } from "./daily-census.mjs";

export const BUSINESS_DEFINITIONS_VERSION = "business-definitions-2026-11-25";

export const BUSINESS_DEFINITIONS = Object.freeze({
  census: Object.freeze({
    name: "Daily census",
    basis: DAILY_CENSUS_BASIS,
    definition: `${DAILY_CENSUS_DEFINITION} Average daily census is the mean of daily census over every day of the period; month-end census is the daily census on the last day of the month.`
  }),
  admission: Object.freeze({
    name: "Admission",
    definition: "An ElderMark admission episode with an admit date. Pipeline planned arrivals (accepted plans not yet due) and assumed arrivals (due, unconfirmed plans) are never admissions; only Pipeline confirmed admissions correspond to a recorded arrival."
  }),
  completed_stay_los: Object.freeze({
    name: "Completed-stay LOS",
    definition: "Discharge cohort: for stays whose discharge date falls in the period, discharge date minus admit date in days (including admissions before the period)."
  }),
  current_length_of_stay: Object.freeze({
    name: "Current length of stay",
    definition: "Residents in the daily census on the observation date: observation date minus admit date in days. Ongoing stays, not completed stays."
  }),
  medication_compliance: Object.freeze({
    name: "Medication compliance",
    definition: "Given administrations divided by scheduled non-PRN administrations. PRN administrations are reported separately and never enter the compliance numerator or denominator."
  }),
  medication_refusal: Object.freeze({
    name: "Medication refusal",
    definition: "A MAR administration whose not-given reason records a refusal. Incident category \"Medication Refusal\" is a separate incident measure, not a MAR refusal."
  }),
  incident_priority: Object.freeze({
    name: "Incident priority",
    definition: "Single operational scale (shared/incident-priority.mjs): high = sentinel event or emergency-services notification; medium = injury; low = all three recorded as no; otherwise unknown. Not a clinical severity grade."
  }),
  occupancy: Object.freeze({
    name: "Occupancy",
    definition: "Daily census divided by the operating limit in effect on the census date (effective-dated capacity history). Capacity is null before a community's first effective date."
  })
});

/** @param {ReadonlyArray<keyof typeof BUSINESS_DEFINITIONS>} ids */
export const businessDefinitions = (ids) => Object.fromEntries(ids.map((id) => [id, BUSINESS_DEFINITIONS[id]]));
