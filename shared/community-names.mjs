import { currentCapacity, firstCapacityDate } from "./community-capacity.mjs";

// Capacity fields are compatibility projections of the effective-dated history
// in community-capacity.mjs (latest record; capacityAsOf = first effective date).
// Date-specific occupancy must call capacityOn(facility, date) instead.
/** @param {string} facilityId */
function capacityFields(facilityId) {
  const record = currentCapacity(facilityId);
  if (!record) throw Error(`Community ${facilityId} has no capacity history.`);
  return { licensedCapacity: record.licensedCapacity, operatingLimit: record.operatingLimit, capacityAsOf: /** @type {string} */ (firstCapacityDate(facilityId)) };
}

/** @type {ReadonlyArray<readonly [RegExp, string]>} */
const COMMUNITY_NAME_NORMALIZATIONS = [
  [/Victoria's Place/gi, "Victoria's House"],
  [/Victoria Place/gi, "Victoria's House"]
];

export const ALAMO_FACILITIES = Object.freeze([
  Object.freeze({
    facilityId: "337",
    communityName: "A & A Health Services San Pablo",
    shortName: "San Pablo",
    operatingSiteName: "San Pablo",
    code: "SP",
    city: "San Pablo",
    state: "CA",
    ...capacityFields("337"),
    aliases: Object.freeze(["san pablo", "a and a health services san pablo", "a and a"])
  }),
  Object.freeze({
    facilityId: "342",
    communityName: "Victoria's House",
    shortName: "Victoria's House",
    operatingSiteName: "Shotwell",
    code: "VP",
    city: "Modesto",
    state: "CA",
    ...capacityFields("342"),
    aliases: Object.freeze(["victoria's house", "victorias house", "victoria's place", "victorias place", "victoria"])
  }),
  Object.freeze({
    facilityId: "343",
    communityName: "JC Wallace House",
    shortName: "JC Wallace House",
    operatingSiteName: "Grand Terrace",
    code: "JCW",
    city: "Fresno",
    state: "CA",
    ...capacityFields("343"),
    aliases: Object.freeze(["jc wallace house", "jc wallace", "wallace house", "wallace"])
  }),
  Object.freeze({
    facilityId: "344",
    communityName: "AHS Turlock OP LLC",
    shortName: "Turlock",
    operatingSiteName: "Turlock",
    code: "TRK",
    city: "Turlock",
    state: "CA",
    ...capacityFields("344"),
    aliases: Object.freeze(["ahs turlock op llc", "turlock"])
  }),
  Object.freeze({
    facilityId: "345",
    communityName: "Santa Clarita",
    shortName: "Santa Clarita",
    operatingSiteName: "Santa Clarita",
    code: "SC",
    city: "Santa Clarita",
    state: "CA",
    ...capacityFields("345"),
    aliases: Object.freeze(["santa clarita"])
  })
]);

export const FACILITY_NAME_BY_ID = new Map(
  ALAMO_FACILITIES.map((facility) => [facility.facilityId, facility.communityName])
);

export function normalizeKnownCommunityNames(value) {
  if (typeof value !== "string") return value;
  return COMMUNITY_NAME_NORMALIZATIONS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value
  );
}

export function normalizeKnownCommunityNamesDeep(value) {
  if (typeof value === "string") return normalizeKnownCommunityNames(value);
  if (Array.isArray(value)) return value.map(normalizeKnownCommunityNamesDeep);
  // Warehouse timestamp cells are native Dates. Preserve their JSON encoding;
  // enumerating a Date's properties turns a valid timestamp into an empty object.
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeKnownCommunityNamesDeep(entry)])
    );
  }
  return value;
}
