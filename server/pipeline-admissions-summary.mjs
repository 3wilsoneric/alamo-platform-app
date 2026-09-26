// Reads the PHI-free referral summary that the Pipeline application publishes
// for Alamo leadership. Contract: docs/platform/admissions-zone.md
// ("Referral summary contract"). Pipeline owns the referral data; Alamo only
// displays these aggregate counts and never calls Pipeline's internal APIs.

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
// A relative Pipeline location: query string only, no scheme, host, or path traversal.
const PIPELINE_PATH = /^\/\?[A-Za-z0-9_\-.=&%]{1,400}$/;

function flag(value) {
  return typeof value === "boolean" ? value : null;
}

function normalizeCard(card, pipelineOrigin) {
  const referralId = count(card?.referral_id);
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
  const path = typeof card?.pipeline_path === "string" && PIPELINE_PATH.test(card.pipeline_path) ? card.pipeline_path : null;
  if (
    referralId == null || !column || !status || !community || daysSinceUpdate == null ||
    (card?.days_open !== null && daysOpen == null) ||
    (card?.planned_admission_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(planned ?? "")) ||
    Object.values(flags).some((value) => value == null) || !path
  ) {
    return null;
  }
  return {
    referralId,
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
    pipelineUrl: `${pipelineOrigin}${path}`
  };
}

/**
 * Accept only the documented fields so an upstream change can never pass
 * client identity or other referral detail through to the browser.
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
    !metrics || !monthOutcomes || !month || !upcoming || total == null ||
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
