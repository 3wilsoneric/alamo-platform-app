import type { AnalysisFrame, CopilotChatAction } from "../src/shared/api/copilotChat";

export interface CertifiedAnalystQuestion {
  id: string;
  title: string;
  description: string;
  preferredTool: string;
  answerStyle: string;
  cacheFamily: string;
  displayPrompt?: string;
  runPrompt?: string;
  variables?: Array<{
    id: string;
    label: string;
    placeholder?: string;
    options: Array<string | { label: string; value: string }>;
  }>;
  examples: string[];
  match: (text: string, context?: { analysisFrame?: AnalysisFrame | null }) => boolean;
}

export interface CertifiedAnalystQuestionMatch extends CertifiedAnalystQuestion {
  confidence?: number;
  actions?: CopilotChatAction[];
}

export const CERTIFIED_ANALYST_QUESTIONS: CertifiedAnalystQuestion[];
export interface CertifiedQuestionRoute {
  id: string;
  familyId: string;
  variantIndex: number;
  prompt: string;
  runPrompt: string;
  expectedTool: string;
  question: CertifiedAnalystQuestion;
}
export interface CertifiedQuestionMenuEntry {
  familyId: string;
  variantIndex: number;
  category: string;
}
export interface CertifiedQuestionMenuRoute extends CertifiedQuestionRoute {
  menuCategory: string;
  menuRank: number;
}
export const CERTIFIED_QUESTION_MENU: ReadonlyArray<CertifiedQuestionMenuEntry>;
export function getCertifiedQuestionRoutes(): CertifiedQuestionRoute[];
export function getCertifiedQuestionMenuRoutes(): CertifiedQuestionMenuRoute[];
export function getCertifiedQuestionRouteById(routeId: string | null | undefined): CertifiedQuestionRoute | null;
export function matchCertifiedQuestion(
  content: string,
  context?: Record<string, unknown>
): CertifiedAnalystQuestionMatch | null;
export function buildCertifiedFollowUps(
  result?: Record<string, unknown>,
  frame?: AnalysisFrame | null,
  content?: string
): CopilotChatAction[];
export function makeCertifiedQuestionMeta(
  question: CertifiedAnalystQuestionMatch | null,
  frame?: AnalysisFrame | null
): Record<string, unknown> | null;
export function buildCertifiedCacheRequests(input?: Record<string, unknown>): Array<{
  prompt: string;
  matchedQuestion: CertifiedAnalystQuestionMatch | null;
}>;
