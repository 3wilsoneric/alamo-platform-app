export type EffectivenessAudienceId =
  | "county"
  | "state"
  | "managed-care"
  | "provider"
  | "executive";

export interface EffectivenessAudience {
  id: EffectivenessAudienceId;
  label: string;
  shortLabel: string;
  decision: string;
  leadEvidence: readonly string[];
}

export interface EffectivenessEvidenceDefinition {
  label: string;
  available: string;
  claim: string;
}

export const EFFECTIVENESS_AUDIENCES: readonly EffectivenessAudience[];
export const EFFECTIVENESS_EVIDENCE: Readonly<Record<string, EffectivenessEvidenceDefinition>>;
export const EFFECTIVENESS_DATA_GAPS: readonly string[];

export function getEffectivenessAudience(value?: string | null): EffectivenessAudience;
export function getEffectivenessEvidencePlan(value?: string | null): {
  audience: EffectivenessAudience;
  evidence: Array<EffectivenessEvidenceDefinition & { id: string }>;
  gaps: string[];
};
