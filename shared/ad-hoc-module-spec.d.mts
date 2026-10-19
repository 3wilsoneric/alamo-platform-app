export type AdHocTemplateId = "trend-line" | "multi-series-line" | "period-heatmap" | "composition-donut" | "comparison-bars" | "ranked-bars" | "data-table" | "resident-profile" | "topline-summary" | "simple-bars";
export type ModuleSelectionReasonCode =
  | "direct_answer"
  | "requested_census_context"
  | "requested_incident_context"
  | "requested_medication_context"
  | "requested_documentation_context"
  | "requested_resident_context"
  | "requested_operating_context";

export interface AdHocModuleSpec {
  version: "1.0";
  id: string;
  moduleId: string | null;
  templateId: AdHocTemplateId;
  family: string;
  title: string;
  scope: "portfolio" | "community" | "resident";
  filters: Record<string, string | null>;
  provenance: {
    tool: string | null;
    dataSource: string | null;
    rowCount: number | null;
    visibleRowCount: number | null;
    originalRowCount: number | null;
    artifactRowCount: number | null;
    rowSetId: string | null;
    dataset: string | null;
    engineVersion: string | null;
  };
  selectionReason: {
    code: ModuleSelectionReasonCode;
    label: string;
  };
  interactions: string[];
  visual: import("../src/shared/api/copilotChat").CopilotToolVisual;
  request: string;
}

export const AD_HOC_MODULE_SPEC_VERSION: "1.0";
export const moduleSelectionReasonCodes: readonly ModuleSelectionReasonCode[];
export const visualizationTemplateRegistry: readonly Array<Record<string, unknown>>;
export function validateAdHocModuleSpec(spec: AdHocModuleSpec): { valid: boolean; errors: string[] };
export function planAdHocModule(content: string, toolResult: Record<string, unknown>, options?: { selectionReason?: { code?: ModuleSelectionReasonCode; label?: string } }): AdHocModuleSpec | null;
export function shouldComposeAdHocModules(content: string, options?: { primaryTool?: string | null; result?: object | null; executionPlan?: object | null }): boolean;
export function composeAdHocModules(content: string, toolResults: object[], limit?: number, options?: { primaryTool?: string | null; executionPlan?: object | null }): AdHocModuleSpec[];
