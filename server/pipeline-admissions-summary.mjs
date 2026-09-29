// Reads the protected referral summary that the Pipeline application publishes
// for the authenticated Alamo Platform. Contract: docs/platform/admissions-zone.md
// ("Referral summary contract"). Pipeline owns the referral data; Alamo
// displays the client and workflow fields needed for this board and never
// calls Pipeline's internal APIs.

const REQUEST_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 5 * 60_000;
const FAILURE_RETRY_MS = 60_000;

/** @type {{ value: any, expiresAt: number, promise: Promise<any> | null }} */
let cache = { value: null, expiresAt: 0, promise: null };

function getConfig() {
  const url = process.env.PIPELINE_ADMISSIONS_SUMMARY_URL?.trim();
  const token = process.env.PIPELINE_ADMISSIONS_SUMMARY_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

function count(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function text(value, maximumLength = 120) {
  return typeof value === "string" && value.trim() && value.length <= maximumLength ? value.trim() : null;
}

function counts(source, fields) {
  if (!source || typeof source !== "object") return null;
  const result = {};
  for (const [field, sourceField] of Object.entries(fields)) {
    const value = count(source[sourceField]);
    if (value == null) return null;
    result[field] = value;
  }
  return result;
}

const MONTH_FIELDS = { received: "received", accepted: "accepted", declined: "declined", admitted: "admitted" };
const BOARD_COLUMNS = new Set(["received", "in_progress", "decision"]);
const MAX_CARDS = 300;
const MAX_STATUSES = 12;
const MAX_RECENT_REFERRALS = 500;
const MAX_WEEKLY_SCHEDULE = 100;
const MAX_WEEKLY_TREND = 12;
// A relative Pipeline location: query string only, no scheme, host, or path traversal.
const PIPELINE_PATH = /^\/\?[A-Za-z0-9_\-.=&%]{1,400}$/;

function flag(value) {
  return typeof value === "boolean" ? value : null;
}

function isoCalendarDate(value) {
  const normalized = text(value, 10);
  return normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized) && Number.isFinite(Date.parse(`${normalized}T00:00:00.000Z`))
    ? normalized
    : null;
}

function isoTimestamp(value) {
  const normalized = text(value, 40);
  return normalized && Number.isFinite(Date.parse(normalized)) ? normalized : null;
}

function pipelineUrl(value, pipelineOrigin) {
  return typeof value === "string" && PIPELINE_PATH.test(value) ? `${pipelineOrigin}${value}` : null;
}

function nullableText(value, maximumLength) {
  return value == null || value === "" ? null : text(value, maximumLength);
}

function textArray(value, maximumItems, maximumLength) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  const normalized = value.map((item) => text(item, maximumLength));
  return normalized.some((item) => !item) ? null : normalized;
}

function normalizeManagementProfile(profile) {
  if (profile === undefined) {
    return {
      dateOfBirth: null,
      referralSource: null,
      referringCounty: null,
      payer: null,
      responsiblePerson: null,
      conservedStatus: null,
      documentStatus: null,
      assessmentStatus: null,
      assessmentSigned: false,
      assessmentDate: null,
      openRequirements: 0,
      blockingRequirements: 0,
      overview: [],
      supportSnapshot: [],
      medications: [],
      medicationSource: null
    };
  }
  if (!profile || typeof profile !== "object") return null;
  const overview = textArray(profile.overview, 4, 320);
  const medications = textArray(profile.medications, 16, 160);
  const support = Array.isArray(profile.support_snapshot) && profile.support_snapshot.length <= 8
    ? profile.support_snapshot.map((item) => ({ label: text(item?.label, 80), value: text(item?.value, 320) }))
    : null;
  const signed = flag(profile.assessment_signed);
  const openRequirements = count(profile.open_requirements);
  const blockingRequirements = count(profile.blocking_requirements);
  const medicationSource = profile.medication_source == null
    ? null
    : (["signed_assessment", "referral"].includes(profile.medication_source) ? profile.medication_source : undefined);
  if (
    !overview || !medications || !support || support.some((item) => !item.label || !item.value) ||
    signed == null || openRequirements == null || blockingRequirements == null ||
    medicationSource === undefined || blockingRequirements > openRequirements
  ) {
    return null;
  }
  return {
    dateOfBirth: nullableText(profile.date_of_birth, 40),
    referralSource: nullableText(profile.referral_source, 160),
    referringCounty: nullableText(profile.referring_county, 120),
    payer: nullableText(profile.payer, 160),
    responsiblePerson: nullableText(profile.responsible_person, 160),
    conservedStatus: nullableText(profile.conserved_status, 80),
    documentStatus: nullableText(profile.document_status, 80),
    assessmentStatus: nullableText(profile.assessment_status, 80),
    assessmentSigned: signed,
    assessmentDate: nullableText(profile.assessment_date, 40),
    openRequirements,
    blockingRequirements,
    overview,
    supportSnapshot: support,
    medications,
    medicationSource
  };
}

function normalizeBriefingReferral(row, pipelineOrigin) {
  const referralId = count(row?.referral_id);
  const clientName = text(row?.client_name, 160);
  const receivedAt = isoTimestamp(row?.received_at);
  const community = text(row?.community, 80);
  const status = text(row?.status, 80);
  const path = pipelineUrl(row?.pipeline_path, pipelineOrigin);
  if (referralId == null || !clientName || !receivedAt || !community || !status || !path) return null;
  return {
    referralId,
    clientName,
    receivedAt,
    sourceName: nullableText(row?.source_name, 160),
    sourceCategory: nullableText(row?.source_category, 80),
    referringCounty: nullableText(row?.referring_county, 120),
    community,
    facilityId: null,
    owner: text(row?.owner, 80) ?? "Unassigned",
    status,
    pipelineUrl: path
  };
}

function normalizeBriefingAssessment(row, pipelineOrigin) {
  const referralId = count(row?.referral_id);
  const clientName = text(row?.client_name, 160);
  const scheduledAt = isoTimestamp(row?.scheduled_at);
  const community = text(row?.community, 80);
  const status = text(row?.status, 80);
  const path = pipelineUrl(row?.pipeline_path, pipelineOrigin);
  if (referralId == null || !clientName || !scheduledAt || !community || !status || !path) return null;
  return {
    referralId,
    clientName,
    scheduledAt,
    community,
    facilityId: null,
    owner: text(row?.owner, 80) ?? "Unassigned",
    status,
    pipelineUrl: path
  };
}

function normalizeBriefingMoveIn(row, pipelineOrigin) {
  const referralId = count(row?.referral_id);
  const clientName = text(row?.client_name, 160);
  const plannedAt = isoTimestamp(row?.planned_at);
  const community = text(row?.community, 80);
  const status = text(row?.status, 80);
  const readiness = ["ready", "watch", "blocked", "unknown"].includes(row?.readiness)
    ? row.readiness
    : null;
  const path = pipelineUrl(row?.pipeline_path, pipelineOrigin);
  if (referralId == null || !clientName || !plannedAt || !community || !status || !readiness || !path) return null;
  return {
    referralId,
    clientName,
    plannedAt,
    community,
    facilityId: null,
    owner: text(row?.owner, 80) ?? "Unassigned",
    status,
    readiness,
    pipelineUrl: path
  };
}

function normalizeBriefing(value, pipelineOrigin) {
  if (value === undefined) return { status: "not_supported" };
  if (!value || typeof value !== "object") return null;
  const recentReferrals = Array.isArray(value.recent_referrals) && value.recent_referrals.length <= MAX_RECENT_REFERRALS
    ? value.recent_referrals.map((row) => normalizeBriefingReferral(row, pipelineOrigin))
    : null;
  const upcomingAssessments = Array.isArray(value.upcoming_assessments) && value.upcoming_assessments.length <= MAX_WEEKLY_SCHEDULE
    ? value.upcoming_assessments.map((row) => normalizeBriefingAssessment(row, pipelineOrigin))
    : null;
  const plannedMoveIns = Array.isArray(value.planned_move_ins) && value.planned_move_ins.length <= MAX_WEEKLY_SCHEDULE
    ? value.planned_move_ins.map((row) => normalizeBriefingMoveIn(row, pipelineOrigin))
    : null;
  const weeklyTrend = Array.isArray(value.weekly_trend) && value.weekly_trend.length <= MAX_WEEKLY_TREND
    ? value.weekly_trend.map((row) => {
      const weekStart = isoCalendarDate(row?.week_start);
      const received = count(row?.received);
      const accepted = count(row?.accepted);
      return weekStart && received != null && accepted != null ? { weekStart, received, accepted } : null;
    })
    : null;
  const coverage = value.coverage;
  const normalizedCoverage = coverage && typeof coverage === "object"
    ? {
      recentReferrals: flag(coverage.recent_referrals_complete),
      assessments: flag(coverage.assessments_complete),
      moveIns: flag(coverage.move_ins_complete),
      weeklyTrend: flag(coverage.weekly_trend_complete)
    }
    : null;
  if (
    value.timezone !== "America/Los_Angeles" ||
    !isoCalendarDate(value.window_end) ||
    !normalizedCoverage ||
    Object.values(normalizedCoverage).some((item) => item == null) ||
    !recentReferrals || recentReferrals.some((item) => !item) ||
    !upcomingAssessments || upcomingAssessments.some((item) => !item) ||
    !plannedMoveIns || plannedMoveIns.some((item) => !item) ||
    !weeklyTrend || weeklyTrend.some((item) => !item)
  ) {
    return null;
  }
  return {
    status: "ready",
    timezone: value.timezone,
    windowEnd: value.window_end,
    coverage: normalizedCoverage,
    recentReferrals,
    upcomingAssessments,
    plannedMoveIns,
    weeklyTrend
  };
}

function normalizeCard(card, pipelineOrigin) {
  const referralId = count(card?.referral_id);
  const clientName = text(card?.client_name, 160);
  const column = BOARD_COLUMNS.has(card?.column) ? card.column : null;
  const status = text(card?.status, 80);
  const nextAction = text(card?.next_action, 160) ?? "";
  const community = text(card?.community, 80);
  const owner = text(card?.owner, 80) ?? "Unassigned";
  const priority = text(card?.priority, 20) ?? "standard";
  const daysOpen = card?.days_open === null ? null : count(card?.days_open);
  const daysSinceUpdate = count(card?.days_since_update);
  const planned = card?.planned_admission_date === null ? null : text(card?.planned_admission_date, 10);
  const flags = {
    stale: flag(card?.flags?.stale),
    unassigned: flag(card?.flags?.unassigned),
    moveInOverdue: flag(card?.flags?.move_in_overdue)
  };
  const managementProfile = normalizeManagementProfile(card?.management_profile);
  const path = typeof card?.pipeline_path === "string" && PIPELINE_PATH.test(card.pipeline_path) ? card.pipeline_path : null;
  if (
    referralId == null || !clientName || !column || !status || !community || daysSinceUpdate == null ||
    (card?.days_open !== null && daysOpen == null) ||
    (card?.planned_admission_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(planned ?? "")) ||
    Object.values(flags).some((value) => value == null) || !managementProfile || !path
  ) {
    return null;
  }
  return {
    referralId,
    clientName,
    column,
    status,
    nextAction,
    community,
    owner,
    priority,
    daysOpen,
    daysSinceUpdate,
    plannedAdmissionDate: planned,
    flags,
    managementProfile,
    pipelineUrl: `${pipelineOrigin}${path}`
  };
}

/**
 * Accept only the documented fields so an upstream change cannot pass
 * unrelated referral detail through to the browser.
 * @param {any} payload
 * @param {string} [pipelineOrigin]
 */
export function normalizePipelineAdmissionsSummary(payload, pipelineOrigin = "https://alamo-pipeline.com") {
  const generatedAt = text(payload?.generated_at, 40);
  const board = payload?.board;
  const columns = Array.isArray(board?.columns) ? board.columns : null;
  const cards = Array.isArray(board?.cards) ? board.cards.slice(0, MAX_CARDS) : null;
  const history = payload?.history;
  const monthly = Array.isArray(history?.monthly) ? history.monthly.slice(-12) : null;
  if (!generatedAt || !columns || columns.length !== BOARD_COLUMNS.size || !cards || !monthly) return null;

  const normalizedColumns = columns.map((column) => {
    const statuses = Array.isArray(column?.statuses) ? column.statuses.slice(0, MAX_STATUSES) : null;
    const normalizedStatuses = statuses?.map((row) => ({ status: text(row?.status, 80), count: count(row?.count) }));
    const key = BOARD_COLUMNS.has(column?.key) ? column.key : null;
    const label = text(column?.label, 60);
    const total = count(column?.count);
    if (!key || !label || total == null || !normalizedStatuses || normalizedStatuses.some((row) => !row.status || row.count == null)) return null;
    return { key, label, count: total, statuses: normalizedStatuses };
  });
  const normalizedCards = cards.map((card) => normalizeCard(card, pipelineOrigin));
  const briefing = normalizeBriefing(payload.briefing, pipelineOrigin);
  const normalizedMonthly = monthly.map((row) => {
    const month = text(row?.month, 7);
    const values = counts(row, MONTH_FIELDS);
    return month && values ? { month, ...values } : null;
  });
  const metrics = counts(payload.metrics, {
    onBoard: "on_board",
    stale: "stale",
    unassigned: "unassigned",
    awaitingAdmission: "awaiting_admission"
  });
  const monthOutcomes = counts(history.month_outcomes, MONTH_FIELDS);
  const month = text(history.month_outcomes?.month, 7);
  const upcoming = counts(payload.upcoming_admissions, {
    next7Days: "next_7_days",
    next30Days: "next_30_days",
    pastPlannedDate: "past_planned_date",
    noPlannedDate: "no_planned_date"
  });
  const timing = history.decision_timing;
  const medianDays = timing?.median_days_to_decision;
  const decisionsCounted = count(timing?.decisions_counted);
  const windowDays = count(timing?.window_days);
  const total = count(board.total);

  if (
    normalizedColumns.some((column) => !column) ||
    normalizedCards.some((card) => !card) ||
    normalizedMonthly.some((row) => !row) ||
    !metrics || !monthOutcomes || !month || !upcoming || !briefing || total == null ||
    decisionsCounted == null || windowDays == null ||
    !(medianDays === null || (typeof medianDays === "number" && Number.isFinite(medianDays) && medianDays >= 0))
  ) {
    return null;
  }

  return {
    status: "connected",
    generatedAt,
    board: {
      total,
      truncated: board.cards_truncated === true || board.cards.length > MAX_CARDS,
      columns: normalizedColumns,
      cards: normalizedCards
    },
    metrics,
    upcomingAdmissions: upcoming,
    briefing,
    history: {
      monthOutcomes: { month, ...monthOutcomes },
      monthly: normalizedMonthly,
      decisionTiming: { windowDays, medianDaysToDecision: medianDays, decisionsCounted }
    }
  };
}

async function fetchSummary(config) {
  const response = await fetch(config.url, {
    headers: { accept: "application/json", authorization: `Bearer ${config.token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Pipeline admissions summary returned ${response.status}`);
  const summary = normalizePipelineAdmissionsSummary(await response.json(), new URL(config.url).origin);
  if (!summary) throw new Error("Pipeline admissions summary did not match the contract");
  return summary;
}

/**
 * Never throws: the Admissions dashboard still renders census and flow when
 * Pipeline is unreachable.
 */
export async function getPipelineAdmissionsSummary() {
  const config = getConfig();
  if (!config) return { status: "not_connected" };
  if (cache.value && cache.expiresAt > Date.now()) return cache.value;
  if (!cache.promise) {
    cache.promise = fetchSummary(config)
      .then((value) => {
        cache = { value, expiresAt: Date.now() + CACHE_TTL_MS, promise: null };
        return value;
      })
      .catch((error) => {
        console.warn("Pipeline admissions summary unavailable:", error instanceof Error ? error.message : error);
        const value = { status: "unavailable" };
        cache = { value, expiresAt: Date.now() + FAILURE_RETRY_MS, promise: null };
        return value;
      });
  }
  return cache.promise;
}
