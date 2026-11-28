export interface CapacityRecord {
  readonly facility: string;
  readonly effectiveFrom: string;
  readonly operatingLimit: number;
  readonly licensedCapacity: number;
}

export const COMMUNITY_CAPACITY_HISTORY: readonly CapacityRecord[];
export function capacityOn(facility: string | number, date: string, history?: readonly CapacityRecord[]): CapacityRecord | null;
export function currentCapacity(facility: string | number, history?: readonly CapacityRecord[]): CapacityRecord | null;
export function firstCapacityDate(facility: string | number, history?: readonly CapacityRecord[]): string | null;
