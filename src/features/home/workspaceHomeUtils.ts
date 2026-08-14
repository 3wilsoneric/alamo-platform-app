import type {
  CopilotAdHocModuleSpec,
  CopilotChatAction,
  CopilotChatMessage,
  CopilotQueryInterpretation,
  CopilotToolVisual
} from "../../shared/api/copilotChat";
import { recordModuleTelemetry, type ModuleTelemetryAction } from "../../shared/analytics/moduleTelemetry";
import {
  getCertifiedQuestionMenuRoutes,
  matchCertifiedQuestion
} from "../../../shared/certified-analyst-questions.mjs";
import { parseRequestedMonthBuckets } from "../../../shared/period-utils.mjs";
import { understandQuery } from "../../../shared/query-understanding.mjs";
import {
  getPlatformModuleForRoute,
  type CanvasModuleId
} from "../../../shared/platform-module-registry.mjs";
import type {
  ChatTimelineItem,
  ModuleContext
} from "./chatHistory";

type ModuleKey = CanvasModuleId;

export type CertifiedQuestionCatalogItem = {
  id: string;
  familyId: string;
  variantIndex: number;
  menuRank: number;
  title: string;
  description: string;
  category: string;
  prompt: string;
  runPrompt: string;
  examples: string[];
  variables?: CertifiedQuestionVariable[];
};

function getCertifiedQuestionDefaultRank(item: CertifiedQuestionCatalogItem) {
  return item.menuRank;
}

function compareCertifiedQuestions(left: CertifiedQuestionCatalogItem, right: CertifiedQuestionCatalogItem) {
  return getCertifiedQuestionDefaultRank(left) - getCertifiedQuestionDefaultRank(right) ||
    left.title.localeCompare(right.title) ||
    left.prompt.localeCompare(right.prompt);
}

export type CertifiedQuestionVariable = {
  id: string;
  label: string;
  placeholder?: string;
  options: Array<string | { label: string; value: string }>;
};

export function getCertifiedQuestionCatalog(): CertifiedQuestionCatalogItem[] {
  return getCertifiedQuestionMenuRoutes().map((route) => ({
    id: route.id,
    familyId: route.familyId,
    variantIndex: route.variantIndex,
    menuRank: route.menuRank,
    title: route.question.title,
    description: route.question.description,
    category: route.menuCategory,
    prompt: route.prompt,
    runPrompt: route.runPrompt,
    examples: route.question.examples ?? [],
    ...(route.question.variables ? { variables: route.question.variables } : {})
  }));
}

const CERTIFIED_QUESTION_SEARCH_STOP_WORDS = new Set([
  "a", "an", "and", "are", "at", "by", "can", "do", "for", "from", "give", "how", "i", "in", "is",
  "me", "of", "on", "or", "please", "show", "the", "to", "what", "when", "where", "which", "with", "you"
]);

function scoreCertifiedQuestion(item: CertifiedQuestionCatalogItem, query: string) {
  const rawQuery = query.toLowerCase().trim();
  const normalizedQuery = understandQuery(query).correctedText.toLowerCase().trim();
  if (!normalizedQuery) return 1;

  const referencedVariableIds = new Set(
    Array.from(item.runPrompt.matchAll(/\{([a-zA-Z0-9_-]+)\}/g)).map((match) => match[1])
  );
  const variableText = (item.variables ?? [])
    .filter((variable) => referencedVariableIds.has(variable.id))
    .flatMap((variable) => [
      variable.id,
      variable.label,
      variable.placeholder,
      ...variable.options.map((option) => typeof option === "string" ? option : `${option.label} ${option.value}`)
    ])
    .filter(Boolean)
    .join(" ");
  const haystack = `${item.title} ${item.description} ${item.category} ${item.prompt} ${item.runPrompt} ${item.examples.join(" ")} ${variableText}`.toLowerCase();
  const tokens = normalizedQuery
    .split(/[^a-z0-9']+/)
    .filter((token) => token.length >= 2 && !CERTIFIED_QUESTION_SEARCH_STOP_WORDS.has(token));
  const matchedTokens = tokens.filter((token) => haystack.includes(token));
  const requiredTokenMatches = tokens.length <= 1 ? tokens.length : Math.ceil(tokens.length * 0.67);
  if (matchedTokens.length < requiredTokenMatches) return 0;

  const normalizedSearchText = normalizedQuery.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const requestedVariableIds = new Set<string>();
  for (const variable of item.variables ?? []) {
    const mentionsOption = variable.options.some((option) => {
      const optionValue = typeof option === "string" ? option : `${option.label} ${option.value}`;
      const normalizedOption = optionValue.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      return normalizedOption && normalizedSearchText.includes(normalizedOption);
    });
    if (mentionsOption) requestedVariableIds.add(variable.id);
  }
  const requestedPeriods = parseRequestedMonthBuckets(normalizedQuery);
  if (requestedPeriods.length >= 2) {
    requestedVariableIds.add("startMonth");
    requestedVariableIds.add("endMonth");
    requestedVariableIds.delete("month");
  } else if (requestedPeriods.length === 1 || /\b(this|current|latest|last|prior|previous)\s+month\b/.test(normalizedQuery)) {
    requestedVariableIds.add("month");
    requestedVariableIds.delete("startMonth");
    requestedVariableIds.delete("endMonth");
  }
  const variableAlignmentScore = [...requestedVariableIds].reduce(
    (score, variableId) => score + (referencedVariableIds.has(variableId) ? 12 : -4),
    0
  );

  const tokenScore = matchedTokens.length * 2;
  const promptIdentityBoost = item.prompt.toLowerCase().trim() === rawQuery ? 100 : 0;
  const exactBoost = item.title.toLowerCase().includes(normalizedQuery) ? 4 : 0;
  const exampleBoost = item.examples.some((example) => example.toLowerCase().includes(normalizedQuery)) ? 3 : 0;
  const promptBoost = item.prompt.toLowerCase().includes(normalizedQuery) ? 5 : 0;
  return promptIdentityBoost + tokenScore + exactBoost + exampleBoost + promptBoost + variableAlignmentScore;
}

export function searchCertifiedQuestionCatalog(query: string, limit = 8) {
  const catalog = getCertifiedQuestionCatalog();
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return catalog
    .slice()
    .sort(compareCertifiedQuestions)
    .slice(0, limit);

  const correctedQuery = understandQuery(trimmedQuery).correctedText;
  const directMatch = matchCertifiedQuestion(correctedQuery);
  const scored = catalog
    .map((item) => {
      const lexicalScore = scoreCertifiedQuestion(item, trimmedQuery);
      return {
        item,
        score: lexicalScore > 0
          ? lexicalScore + (item.familyId === directMatch?.id ? 10 : 0)
          : 0
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || compareCertifiedQuestions(left.item, right.item))
    .map((entry) => entry.item);

  return scored.slice(0, limit);
}

export function getVisibleMessageActions(
  actions: CopilotChatAction[] | undefined,
  isSuggestionMessage: boolean,
  isSurfaceCommand = false
) {
  const safeActions = actions ?? [];
  const downloadActions = safeActions.filter((action) => (
    action.kind === "download" && Boolean(action.filename || action.url)
  ));
  const certifiedDrilldowns = safeActions.filter((action) => (
    action.kind === "tool" &&
    Boolean(action.prompt) &&
    Boolean(action.certifiedQuestionRouteId)
  ));
  const stableSurfaceActions = safeActions.filter((action) => {
    if (/\b(data explorer|open full|full .*search)\b/i.test(action.label)) return false;
    if (action.kind === "route") return Boolean(action.route);
    if (action.url) return false;
    return false;
  });

  if (isSuggestionMessage || isSurfaceCommand) return stableSurfaceActions.slice(0, 1);

  // Keep the answer conversational while allowing a short, deterministic
  // analysis ladder. Unregistered tool prompts remain hidden.
  return [...certifiedDrilldowns.slice(0, 2), ...downloadActions.slice(0, 1)].slice(0, 2);
}

export function shouldRenderChatVisual(
  visual: CopilotToolVisual | undefined,
  moduleSpec?: CopilotAdHocModuleSpec
) {
  if (!visual) return false;
  if (visual.type !== "summary_card") return true;
  return moduleSpec?.moduleId === "medication-profile";
}

export function formatInterpretation(interpretation?: CopilotQueryInterpretation) {
  if (!interpretation?.changed || interpretation.requiresConfirmation) return null;
  return interpretation.corrections
    .map((correction) => `“${correction.original}” as “${correction.suggestion}”`)
    .join(", ");
}

export function isModuleRefinementPrompt(content: string) {
  return /\b(now|same|instead|switch|change|only|just|refine|refresh|heatmap|heat map|matrix|line chart|exact rows|show rows|table)\b/i.test(content);
}

function withoutGeneratedModule(message: CopilotChatMessage): CopilotChatMessage {
  if (!message.meta || !(message.meta.moduleSpec || message.meta.moduleSpecs?.length || message.meta.visual)) return message;
  const nextMeta = { ...message.meta };
  delete nextMeta.visual;
  delete nextMeta.moduleSpec;
  delete nextMeta.moduleSpecs;
  return {
    ...message,
    meta: nextMeta
  };
}

export function clearLatestGeneratedModuleFromTimeline(items: ChatTimelineItem[]) {
  let cleared = false;
  return [...items].reverse().map((item) => {
    if (cleared || item.type !== "message" || item.message.role !== "assistant" || !(item.message.meta?.moduleSpec || item.message.meta?.moduleSpecs?.length || item.message.meta?.visual)) return item;
    cleared = true;
    return { ...item, message: withoutGeneratedModule(item.message) };
  }).reverse();
}

export function recordModuleSpecs(action: ModuleTelemetryAction, specs: Array<CopilotAdHocModuleSpec | undefined>) {
  specs.filter((spec): spec is CopilotAdHocModuleSpec => Boolean(spec)).forEach((spec) => {
    recordModuleTelemetry({
      action,
      moduleId: spec.moduleId,
      templateId: spec.templateId,
      family: spec.family,
      scope: spec.scope
    });
  });
}

export function parseRouteContext(route?: string | null): ModuleContext {
  if (!route) return {};

  try {
    const url = new URL(route, window.location.origin);
    const communityMatch = url.pathname.match(/^\/communities\/([^/]+)/);

    return {
      route,
      facilityId: communityMatch?.[1] ?? null,
      focus: url.searchParams.get("focus"),
      category: url.searchParams.get("category"),
      month: url.searchParams.get("month"),
      residentId: url.searchParams.get("resident"),
      query: url.searchParams.get("query")
    };
  } catch {
    const [path, query = ""] = route.split("?");
    const communityMatch = path?.match(/^\/communities\/([^/]+)/);
    const params = new URLSearchParams(query);

    return {
      route,
      facilityId: communityMatch?.[1] ?? null,
      focus: params.get("focus"),
      category: params.get("category"),
      month: params.get("month"),
      residentId: params.get("resident"),
      query: params.get("query")
    };
  }
}

export function getModuleForRoute(route?: string | null): ModuleKey | null {
  if (/^\/explorer\/[^/?]+/.test(String(route ?? ""))) return null;
  return getPlatformModuleForRoute(route)?.canvasId ?? null;
}
