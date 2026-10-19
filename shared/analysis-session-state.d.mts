export interface AnalysisFrame {
  version: "1.0";
  revision: number;
  metric: string | null;
  metricGrain: string | null;
  category: string | null;
  mode: string | null;
  periods: string[];
  grouping: string | null;
  fields: string[];
  export: boolean;
  facilityId: string | null;
  communityName: string | null;
  residentName: string | null;
  calculation: string | null;
  presentation: string | null;
  sourcePrompt: string | null;
}

export interface AnalysisExecutionPlan {
  version: "1.0";
  tool: string | null;
  canonicalPrompt: string;
  expected: Omit<AnalysisFrame, "version" | "revision" | "sourcePrompt">;
}

export function createEmptyAnalysisFrame(): AnalysisFrame;
export function isAnalysisFrame(value: unknown): value is AnalysisFrame;
export function sanitizeAnalysisFrame(value: unknown): AnalysisFrame | null;
export function hasMeaningfulAnalysisFrame(value: unknown): value is AnalysisFrame;
export function deriveAnalysisPatch(content: string, options?: Record<string, unknown>): { patch: Partial<AnalysisFrame>; inherit: boolean; referential: boolean };
export function applyAnalysisPatch(previousFrame: AnalysisFrame | null | undefined, derived: ReturnType<typeof deriveAnalysisPatch>): AnalysisFrame;
export function analysisFrameToPrompt(frame: AnalysisFrame): string;
export function createExecutionPlan(frame: AnalysisFrame, fallbackTool?: string | null, options?: { preferFallback?: boolean }): AnalysisExecutionPlan;
export function validateResultAgainstPlan(plan: AnalysisExecutionPlan, result: unknown): { valid: boolean; errors: string[] };
