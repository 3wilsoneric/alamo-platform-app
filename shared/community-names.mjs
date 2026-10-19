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
    licensedCapacity: 225,
    operatingLimit: 175,
    capacityAsOf: "2026-07-30",
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
    licensedCapacity: 46,
    operatingLimit: 46,
    capacityAsOf: "2026-07-30",
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
    licensedCapacity: 150,
    operatingLimit: 150,
    capacityAsOf: "2026-07-30",
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
    licensedCapacity: 84,
    operatingLimit: 84,
    capacityAsOf: "2026-07-30",
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
    licensedCapacity: 150,
    operatingLimit: 150,
    capacityAsOf: "2026-07-30",
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
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeKnownCommunityNamesDeep(entry)])
    );
  }
  return value;
}
