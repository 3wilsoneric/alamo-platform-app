export interface GuidedQuestionContract {
  allowedTruthStates: string[];
  allowedVisualTypes: string[];
  requiredColumns: string[];
  requiredAnswerTerms: string[][];
  requiresVisual: boolean;
  requiresArtifact: boolean;
  requiresArtifactWhenValid?: boolean;
  maxActions: number;
  maxModules: number;
}

export const GUIDED_QUESTION_CONTRACTS: Readonly<Record<string, GuidedQuestionContract>>;
export function getGuidedQuestionContract(questionId: string | null | undefined): GuidedQuestionContract | null;
export function validateGuidedQuestionResult(input: {
  contract?: GuidedQuestionContract | null;
  questionId?: string | null;
  route?: { id?: string; familyId: string; expectedTool: string } | null;
  content?: string;
  result?: Record<string, unknown> | null;
}): { valid: boolean; failures: string[] };
