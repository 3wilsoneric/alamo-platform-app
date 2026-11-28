// Effective-dated community capacity (owner-approved). Occupancy for a date
// uses the record in effect on that date; before a community's first
// effective date capacity is unknown (null), never back-filled.
//
// Seeded from the single values previously hard-coded in community-names.mjs
// (recorded 2026-07-30). Add a new record with a later effectiveFrom when a
// limit changes; never edit a historical record in place.

/** @typedef {{ facility: string, effectiveFrom: string, operatingLimit: number, licensedCapacity: number }} CapacityRecord */

/** @type {ReadonlyArray<Readonly<CapacityRecord>>} */
export const COMMUNITY_CAPACITY_HISTORY = Object.freeze([
  Object.freeze({ facility: "337", effectiveFrom: "2026-07-30", operatingLimit: 175, licensedCapacity: 225 }),
  Object.freeze({ facility: "342", effectiveFrom: "2026-07-30", operatingLimit: 46, licensedCapacity: 46 }),
  Object.freeze({ facility: "343", effectiveFrom: "2026-07-30", operatingLimit: 150, licensedCapacity: 150 }),
  Object.freeze({ facility: "344", effectiveFrom: "2026-07-30", operatingLimit: 84, licensedCapacity: 84 }),
  Object.freeze({ facility: "345", effectiveFrom: "2026-07-30", operatingLimit: 150, licensedCapacity: 150 })
]);

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Capacity record in effect for a facility on a calendar date, or null before
 * its first effective date (or for an unknown facility / invalid date).
 * @param {string | number} facility @param {string} date @param {ReadonlyArray<Readonly<CapacityRecord>>} [history]
 * @returns {Readonly<CapacityRecord> | null}
 */
export function capacityOn(facility, date, history = COMMUNITY_CAPACITY_HISTORY) {
  const key = String(date ?? "").slice(0, 10);
  if (!DATE.test(key)) return null;
  const id = String(facility);
  /** @type {Readonly<CapacityRecord> | null} */
  let match = null;
  for (const record of history) {
    if (record.facility === id && record.effectiveFrom <= key && (!match || record.effectiveFrom > match.effectiveFrom)) match = record;
  }
  return match;
}

/** Latest record for a facility regardless of date (current reference values). @param {string | number} facility */
export function currentCapacity(facility, history = COMMUNITY_CAPACITY_HISTORY) {
  return capacityOn(facility, "9999-12-31", history);
}

/** First effective date for a facility, or null. @param {string | number} facility */
export function firstCapacityDate(facility, history = COMMUNITY_CAPACITY_HISTORY) {
  const dates = history.filter((record) => record.facility === String(facility)).map((record) => record.effectiveFrom).sort();
  return dates[0] ?? null;
}
