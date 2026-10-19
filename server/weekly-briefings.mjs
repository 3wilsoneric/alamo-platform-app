import { getCertifiedQuestionRouteById } from "../shared/certified-analyst-questions.mjs";
import { readPlatformSnapshot } from "./platform-snapshot.mjs";
import { runCopilotTool } from "./copilot-tools.mjs";
import { createGovernedReport, deliverGovernedReport } from "./governed-reporting.mjs";
import { createHttpError } from "./http-errors.mjs";

const PORTFOLIO_PLANS = Object.freeze([
  Object.freeze({
    id: "executive",
    label: "Executive weekly briefing",
    audience: "executive",
    emphasis: "changes",
    recipientEnv: "WEEKLY_BRIEFING_EXECUTIVE_RECIPIENTS",
    questions: Object.freeze([
      Object.freeze({ routeId: "operating-snapshot:0" }),
      Object.freeze({ routeId: "community-comparison:0" }),
      Object.freeze({ routeId: "incident-current-snapshot:0" }),
      Object.freeze({ routeId: "medication-compliance:0" })
    ])
  }),
  Object.freeze({
    id: "operations",
    label: "Operations weekly briefing",
    audience: "operations",
    emphasis: "actions",
    recipientEnv: "WEEKLY_BRIEFING_OPERATIONS_RECIPIENTS",
    questions: Object.freeze([
      Object.freeze({ routeId: "census-movement:0" }),
      Object.freeze({ routeId: "incident-rate:0" }),
      Object.freeze({ routeId: "incident-current-snapshot:0" }),
      Object.freeze({ routeId: "medication-compliance:0" })
    ])
  }),
  Object.freeze({
    id: "clinical",
    label: "Clinical weekly briefing",
    audience: "clinical",
    emphasis: "risks",
    recipientEnv: "WEEKLY_BRIEFING_CLINICAL_RECIPIENTS",
    questions: Object.freeze([
      Object.freeze({ routeId: "medication-compliance:0" }),
      Object.freeze({ routeId: "diagnosis-mix:0" }),
      Object.freeze({ routeId: "incident-current-snapshot:0" })
    ])
  })
]);
const COMMUNITY_PLAN_QUESTIONS = Object.freeze([
  Object.freeze({ routeId: "community-month-status:0" }),
  Object.freeze({ routeId: "incident-category-breakdown:0" }),
  Object.freeze({ routeId: "medication-compliance-history:0" })
]);

function splitCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function monthLabel(monthBucket) {
  if (!/^\d{4}-\d{2}$/.test(String(monthBucket ?? ""))) return "the latest month";
  const [year, month] = monthBucket.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function priorMonth(monthBucket) {
  if (!/^\d{4}-\d{2}$/.test(String(monthBucket ?? ""))) return null;
  const [year, month] = monthBucket.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function latestMonth(rows) {
  return [...new Set((rows ?? []).map((row) => row?.month_bucket).filter((value) => /^\d{4}-\d{2}$/.test(String(value))))]
    .sort()
    .at(-1) ?? null;
}

function currentWeekBucket(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

function getWeeklySnapshotContext(snapshot) {
  const communities = snapshot?.communities ?? snapshot ?? {};
  const reportsSummary = snapshot?.reportsSummary ?? {};
  const facilities = (communities.facilities ?? [])
    .map((facility) => ({
      facilityId: String(facility.facility_id ?? "").trim(),
      communityName: String(facility.community_name ?? facility.facility_name ?? "").trim()
    }))
    .filter((facility) => facility.facilityId && facility.communityName);
  const currentMonth = latestMonth([
    ...(communities.census ?? []),
    ...(communities.incidents ?? []),
    ...(reportsSummary.medicationCompliance ?? [])
  ]);
  if (!facilities.length || !currentMonth) {
    throw createHttpError(
      503,
      "weekly_briefing_data_unavailable",
      "Weekly briefings cannot run until the approved snapshot contains facilities and current monthly data."
    );
  }
  return {
    facilities,
    currentMonth,
    priorMonth: priorMonth(currentMonth) ?? currentMonth,
    currentMonthLabel: monthLabel(currentMonth),
    priorMonthLabel: monthLabel(priorMonth(currentMonth) ?? currentMonth),
    weekBucket: currentWeekBucket()
  };
}

function compileRegisteredQuestion(routeId, variables = {}) {
  const route = getCertifiedQuestionRouteById(routeId);
  if (!route) {
    throw createHttpError(500, "weekly_briefing_route_missing", `Weekly briefing route ${routeId} is not registered.`);
  }
  const prompt = route.runPrompt.replace(/\{([a-zA-Z0-9_-]+)\}/g, (_match, variableId) => {
    const value = variables[variableId];
    if (!value) {
      throw createHttpError(
        500,
        "weekly_briefing_variable_missing",
        `Weekly briefing route ${routeId} is missing ${variableId}.`
      );
    }
    return value;
  });
  return { route, prompt };
}

async function runVerifiedQuestion(question, variables, ownerKey) {
  const { route, prompt } = compileRegisteredQuestion(question.routeId, variables);
  const result = await runCopilotTool({
    content: prompt,
    certifiedQuestionRouteId: route.id,
    sessionOwnerKey: ownerKey
  });
  return {
    ...result,
    question: prompt,
    routeId: route.id
  };
}

function parseCommunityRecipientMap() {
  const raw = process.env.WEEKLY_BRIEFING_COMMUNITY_RECIPIENTS_JSON?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([, recipients]) => typeof recipients === "string" || Array.isArray(recipients))
        .map(([key, recipients]) => [
          key,
          Array.isArray(recipients) ? recipients.map(String).filter(Boolean) : splitCsv(recipients)
        ])
    );
  } catch {
    throw createHttpError(
      500,
      "weekly_briefing_recipient_config_invalid",
      "WEEKLY_BRIEFING_COMMUNITY_RECIPIENTS_JSON must be a JSON object keyed by facility ID or community name."
    );
  }
}

function getCommunityRecipients(facility, recipientMap) {
  return recipientMap[facility.facilityId] ??
    recipientMap[facility.communityName] ??
    recipientMap[facility.communityName.toLowerCase()] ??
    [];
}

function buildCommunityPlans(context) {
  const recipientMap = parseCommunityRecipientMap();
  return context.facilities.map((facility) => ({
    id: `community-${facility.facilityId}`,
    label: `${facility.communityName} weekly briefing`,
    audience: "community",
    emphasis: "actions",
    recipients: getCommunityRecipients(facility, recipientMap),
    variables: {
      community: facility.communityName,
      month: context.currentMonthLabel,
      startMonth: context.priorMonthLabel,
      endMonth: context.currentMonthLabel
    },
    questions: COMMUNITY_PLAN_QUESTIONS
  }));
}

function buildClinicalVariables(context) {
  return {
    startMonth: context.priorMonthLabel,
    endMonth: context.currentMonthLabel,
    month: context.currentMonthLabel
  };
}

async function runPlan(plan, context, { deliver }) {
  const recipients = plan.recipients ?? splitCsv(process.env[plan.recipientEnv]);
  if (deliver && !recipients.length) {
    return {
      id: plan.id,
      label: plan.label,
      status: "skipped",
      reason: "No recipients configured."
    };
  }

  const variables = {
    month: context.currentMonthLabel,
    startMonth: context.priorMonthLabel,
    endMonth: context.currentMonthLabel,
    ...(plan.id === "clinical" ? buildClinicalVariables(context) : {}),
    ...(plan.variables ?? {})
  };
  const sources = [];
  for (const question of plan.questions) {
    sources.push(await runVerifiedQuestion(
      question,
      variables,
      `weekly-briefing:${plan.id}`
    ));
  }

  const reportPackage = await createGovernedReport({
    sources,
    options: {
      audience: plan.audience,
      emphasis: plan.emphasis
    }
  });
  if (deliver) {
    await deliverGovernedReport({
      reportPackage,
      recipients,
      idempotencyKey: `weekly:${context.weekBucket}:${context.currentMonth}:${plan.id}`
    });
  }

  return {
    id: plan.id,
    label: plan.label,
    status: deliver ? "delivered" : "ready",
    reportId: reportPackage.report.reportId,
    filename: reportPackage.filename,
    sourceCount: sources.length,
    recipientCount: recipients.length,
    narrativeMode: reportPackage.narrativeMode
  };
}

export function getWeeklyBriefingPlanSummary() {
  return {
    version: "weekly-briefing-plans-v1",
    schedule: process.env.WEEKLY_BRIEFING_SCHEDULE_LABEL?.trim() || "Mondays",
    portfolioPlans: PORTFOLIO_PLANS.map((plan) => ({
      id: plan.id,
      label: plan.label,
      audience: plan.audience,
      emphasis: plan.emphasis,
      routeIds: plan.questions.map((question) => question.routeId),
      recipientsConfigured: splitCsv(process.env[plan.recipientEnv]).length
    })),
    communityPlan: {
      audience: "community",
      emphasis: "actions",
      routeIds: COMMUNITY_PLAN_QUESTIONS.map((question) => question.routeId)
    },
    communityDeliveryConfigured: Boolean(process.env.WEEKLY_BRIEFING_COMMUNITY_RECIPIENTS_JSON?.trim())
  };
}

export async function runWeeklyBriefings({ deliver = true } = {}) {
  const snapshot = await readPlatformSnapshot();
  const context = getWeeklySnapshotContext(snapshot);
  const plans = [...PORTFOLIO_PLANS, ...buildCommunityPlans(context)];
  const results = [];
  for (const plan of plans) {
    try {
      results.push(await runPlan(plan, context, { deliver }));
    } catch (error) {
      results.push({
        id: plan.id,
        label: plan.label,
        status: "failed",
        reason: error instanceof Error ? error.message : "The briefing could not be created."
      });
    }
  }
  const failedCount = results.filter((result) => result.status === "failed").length;
  return {
    ok: failedCount === 0,
    version: "weekly-briefing-run-v1",
    generatedAt: new Date().toISOString(),
    dataMonth: context.currentMonth,
    weekBucket: context.weekBucket,
    deliveryRequested: deliver,
    failedCount,
    results
  };
}
