export interface AlamoFacility {
  readonly facilityId: string;
  readonly communityName: string;
  readonly shortName: string;
  readonly operatingSiteName: string;
  readonly code: string;
  readonly city: string;
  readonly state: string;
  readonly licensedCapacity: number;
  readonly operatingLimit: number;
  readonly capacityAsOf: string;
  readonly aliases: readonly string[];
}

export const ALAMO_FACILITIES: readonly AlamoFacility[];
export const FACILITY_NAME_BY_ID: Map<string, string>;
export function normalizeKnownCommunityNames<T>(value: T): T;
export function normalizeKnownCommunityNamesDeep<T>(value: T): T;
