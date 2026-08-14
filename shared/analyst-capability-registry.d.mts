export const ANALYST_EXECUTION_MODES: Readonly<{
  deterministicOnly: "deterministic_only";
  verifiedSynthesisOptional: "verified_synthesis_optional";
  agenticSynthesis: "agentic_synthesis";
}>;

export type AnalystExecutionMode =
  | "deterministic_only"
  | "verified_synthesis_optional"
  | "agentic_synthesis";

export interface AnalystCapability {
  id: string;
  title: string;
  description: string;
  preferredTool: string;
  answerStyle: string;
  cacheFamily: string;
  examples: readonly string[];
  executionMode: AnalystExecutionMode;
  claudeRole: string;
  answerFormat: string;
  dataContract: {
    temporalScope: "current_state" | "mixed";
    supportsExplicitPeriods: boolean;
    historicalAlternative: string | null;
  };
}

export interface AnalystAnswerFormatContract {
  id: string;
  tools: readonly string[];
  maxFacts: number;
  requiredSource: boolean;
}

export const ANALYST_CAPABILITY_REGISTRY: readonly AnalystCapability[];

export function getAnalystCapability(id: string): AnalystCapability | null;
export function getAnalystCapabilitiesForTool(tool: string): AnalystCapability[];
export function isDeterministicOnlyCapability(capabilityOrId: AnalystCapability | string): boolean;
export function shouldEscalateCapabilityToClaude(
  capabilityOrId: AnalystCapability | string,
  options?: { content?: string | null }
): boolean;
export function getAnswerFormatContractById(id: string): AnalystAnswerFormatContract;
export function getAnswerFormatContractForTool(tool: string | null | undefined): AnalystAnswerFormatContract | null;
export function summarizeCapabilityModes(): Record<AnalystExecutionMode, number>;
