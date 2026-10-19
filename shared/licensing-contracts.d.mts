export const LICENSING_COMMUNITIES: readonly { facilityId: string; licenseNumber: string; name: string }[];
export interface LicensingCommunity {
  facilityId: string;
  licenseNumber: string;
  name: string;
  licensedName: string;
  licenseStatus: string;
  reportCount: number;
  complaintCount: number;
  sourceUrl: string;
}
export interface LicensingReportSummary {
  analysis?: LicensingAnalysisSummary;
  id: string;
  facilityId: string;
  licenseNumber: string;
  title: string;
  reportType: "Complaint" | "Inspection" | "Other";
  reportDate: string;
  controlNumber: string | null;
  sourceUrl: string;
  textSha256: string;
  retrievedAt: string;
}
export interface LicensingReport extends LicensingReportSummary { text: string }
export interface LicensingLibrary {
  version: "licensing-baseline-v1";
  runId: string;
  collectedAt: string;
  monitoring: "not_scheduled" | "platform_scheduled";
  totalReports: number;
  communities: LicensingCommunity[];
  reports: LicensingReportSummary[];
}
export function validateLicensingLibrary(value: unknown): LicensingLibrary;
export function validateLicensingReport(value: unknown): LicensingReport;
export function licensingTextForDisplay(text: string): string;
export interface LicensingUpdates {
  version: "licensing-updates-v1"; status: "complete" | "failed" | "not_checked";
  lastChecked: string | null; lastSuccessful: string | null;
  schedule?: { owner: "platform"; timezone: "America/Los_Angeles"; cadence: "weekly"; weekday: "Monday"; weekdays: ("Monday" | "Wednesday")[]; hour: 9 };
  alerts: { id: string; community: string; title: string; at: string; reportId: string | null; reportDate: string | null }[];
}
export function validateLicensingUpdates(value: unknown): LicensingUpdates;
import type { LicensingAnalysisSummary } from "./licensing-analysis.mjs";
