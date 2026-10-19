export type GovernedReportAudience = "executive" | "operations" | "community" | "clinical";
export type GovernedReportEmphasis = "overview" | "changes" | "risks" | "actions";

export interface GovernedReportChoice {
  id: string;
  label: string;
  description?: string;
}

export interface GovernedReportSource {
  handled?: boolean;
  safeRefusal?: boolean;
  contractViolation?: string | null;
  routeId?: string;
  certifiedQuestionRouteId?: string;
  question?: string;
  answer?: string;
  text?: string;
  tool?: string;
  truthState?: string;
  scope?: string;
  period?: string;
  cached?: boolean;
  visual?: unknown;
  trace?: Record<string, unknown>;
  runtimeSchema?: { valid?: boolean };
  turnTrace?: {
    truthState?: string | null;
    selectedTool?: string | null;
    rowCount?: number | null;
    validation?: { valid?: boolean | null };
  };
  certifiedQuestion?: { routeId?: string; title?: string };
  guidedContract?: { valid?: boolean; routeId?: string };
  analysisFrame?: {
    sourcePrompt?: string | null;
    communityName?: string | null;
    residentName?: string | null;
    periods?: string[];
  } | null;
  provenance?: { rowCount?: number | null };
}

export interface GovernedOnePageReport {
  version: "governed-one-page-v1";
  reportId: string;
  title: string;
  subtitle: string;
  audience: GovernedReportAudience;
  emphasis: GovernedReportEmphasis;
  emphasisLabel: string;
  generatedAt: string;
  sourceQuestions: string[];
  sourceRouteIds: string[];
  scope: string;
  period: string;
  summary: string;
  keyPoints: string[];
  metrics: Array<{ label: string; value: string }>;
  closing: string;
  sourceNote: string;
  sources: Array<{
    routeId: string;
    question: string;
    tool: string;
    scope: string;
    period: string;
    rowCount: number | null;
    truthState: string;
  }>;
}

export const GOVERNED_REPORT_VERSION: "governed-one-page-v1";
export const GOVERNED_REPORT_AUDIENCES: readonly GovernedReportChoice[];
export const GOVERNED_REPORT_EMPHASES: readonly GovernedReportChoice[];

export function normalizeGovernedReportOptions(options?: {
  audience?: string;
  emphasis?: string;
}): {
  audience: GovernedReportAudience;
  emphasis: GovernedReportEmphasis;
};

export function validateGovernedReportSource(source: unknown): {
  valid: boolean;
  errors: string[];
  normalized?: Record<string, unknown> | null;
};

export function validateGovernedReportSources(sources: unknown): {
  valid: boolean;
  errors: string[];
  sources: Array<Record<string, unknown>>;
};

export function buildGovernedOnePageReport(input: {
  sources: GovernedReportSource[];
  options?: { audience?: string; emphasis?: string };
  narrative?: { summary?: string; keyPoints?: string[]; closing?: string } | null;
  generatedAt?: string;
}): GovernedOnePageReport;

export function renderGovernedReportHtml(report: GovernedOnePageReport): string;
export function getGovernedReportFilename(report: GovernedOnePageReport, extension?: string): string;
