import type { LicensingReport } from "./licensing-contracts.mjs";
export interface LicensingEvidence { text: string; page: number | null }
export interface LicensingCitation {
  type: string; regulation: string; description: string; correction: string;
  dueDate: string | null; page: number | null; disposition: string | null; excerpt: string; needsReview: boolean;
}
export interface LicensingAnalysisSummary {
  version: "licensing-analysis-v1"; outcome: string; outcomes: string[]; headline: string; topics: string[];
  citationCount: number; correctionsCount: number; noDeficiencies: boolean; reviewNeeded: boolean; allegationCount: number;
}
export interface LicensingInsights {
  summary: LicensingAnalysisSummary; allegations: LicensingEvidence[]; findings: LicensingEvidence[];
  narratives: LicensingEvidence[]; citations: LicensingCitation[]; followUps: LicensingEvidence[];
}
export const LICENSING_TOPICS: readonly { name: string; pattern: RegExp }[];
export const LICENSING_OUTCOMES: readonly string[];
export function analyzeLicensingReport(report: LicensingReport): LicensingInsights;
