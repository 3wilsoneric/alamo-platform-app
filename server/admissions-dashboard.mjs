import { ALAMO_FACILITIES, normalizeKnownCommunityNames } from "../shared/community-names.mjs";

// Leadership view of admissions. Everything here is an aggregate count: the
// flow tables also carry admitted/discharged resident names, which are never
// copied into this payload.

const WEEKLY_POINTS = 12;
const MONTHLY_POINTS = 6;
const RECENT_WEEKS = 4;
const DAY_MS = 86_400_000;
const FACILITY_BY_ID = new Map(ALAMO_FACILITIES.map((facility) => [facility.facilityId, facility]));

function textValue(value) {
  return value == null ? "" : String(value).trim();
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDate(value) {
  const text = textValue(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(`${text}T00:00:00.000Z`)) ? text : null;
}

function table(snapshot, name) {
  const value = snapshot?.reportsSummary?.toolContext?.tables?.[name];
  return Array.isArray(value) ? value : [];
}

function facilityId(row) {
  return textValue(row.facility_id ?? row.Facility);
}

function priorMonth(month) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthIndex - 2, 1));
  return date.toISOString().slice(0, 7);
}

function flowTotals(rows) {
  const admissions = rows.reduce((total, row) => total + numberValue(row.admissions), 0);
  const discharges = rows.reduce((total, row) => total + numberValue(row.discharges), 0);
  return { admissions, discharges, net: admissions - discharges };
}

function seriesBy(rows, key, limit) {
  const periods = [...new Set(rows.map((row) => textValue(row[key])).filter(Boolean))].sort().slice(-limit);
  return periods.map((period) => ({
    period,
    ...flowTotals(rows.filter((row) => textValue(row[key]) === period))
  }));
}

// Pipeline names destination communities with short labels ("JC Wallace");
// match them against each facility's known aliases.
function facilityIdForPipelineCommunity(name) {
  const normalized = textValue(name).toLowerCase();
  return ALAMO_FACILITIES.find((facility) =>
    facility.shortName.toLowerCase() === normalized || facility.aliases.includes(normalized))?.facilityId ?? null;
}

function boardCountsFor(cards) {
  return {
    onBoard: cards.length,
    inDecision: cards.filter((card) => card.column === "decision").length,
    needsAttention: cards.filter((card) => Object.values(card.flags).some(Boolean)).length
  };
}

/**
 * @param {any} snapshot
 * @param {{ referralPipeline?: any }} [options]
 */
export function buildAdmissionsDashboard(snapshot, options = {}) {
  const generatedAt = textValue(snapshot?.snapshot?.generated_at ?? snapshot?.generated_at);
  const asOfDate = isoDate(snapshot?.snapshot?.as_of_date ?? generatedAt) ?? new Date().toISOString().slice(0, 10);
  const asOfMonth = asOfDate.slice(0, 7);
  const lastMonth = priorMonth(asOfMonth);
  const asOfMs = Date.parse(`${asOfDate}T00:00:00.000Z`);

  const operatingRows = table(snapshot, "community_operating_summary");
  const weeklyRows = table(snapshot, "resident_flow_weekly_by_community")
    .filter((row) => (isoDate(row.week_start) ?? "9999") <= asOfDate);
  const monthlyRows = table(snapshot, "resident_flow_monthly_by_community")
    .filter((row) => textValue(row.month_bucket) && textValue(row.month_bucket) <= asOfMonth);

  const weekly = seriesBy(weeklyRows, "week_start", WEEKLY_POINTS).map((point) => ({
    ...point,
    // The week containing the as-of date is still being recorded.
    partial: Date.parse(`${point.period}T00:00:00.000Z`) + 7 * DAY_MS > asOfMs
  }));
  const recentWeekKeys = new Set(weekly.slice(-RECENT_WEEKS).map((point) => point.period));

  const pipeline = options.referralPipeline ?? { status: "not_connected" };
  const connected = pipeline.status === "connected";
  const referralPipeline = connected
    ? {
      ...pipeline,
      board: {
        ...pipeline.board,
        cards: pipeline.board.cards.map((card) => ({ ...card, facilityId: facilityIdForPipelineCommunity(card.community) }))
      }
    }
    : pipeline;
  const boardCards = connected ? referralPipeline.board.cards : [];

  const communityIds = [...new Set([
    ...operatingRows.map(facilityId),
    ...monthlyRows.map(facilityId)
  ].filter(Boolean))];

  const communities = communityIds.map((id) => {
    const facility = FACILITY_BY_ID.get(id);
    const operating = operatingRows.find((row) => facilityId(row) === id);
    const ownMonthly = monthlyRows.filter((row) => facilityId(row) === id);
    const name = facility?.communityName
      ?? normalizeKnownCommunityNames(textValue(operating?.facility_name ?? ownMonthly[0]?.facility_name));
    const census = operating ? numberValue(operating.census) : null;
    const operatingLimit = facility?.operatingLimit ?? null;
    return {
      facilityId: id,
      communityName: name || "Community",
      shortName: facility?.shortName ?? (name || "Community"),
      census,
      censusChange: operating ? numberValue(operating.census_delta) : null,
      operatingLimit,
      occupancyPct: census != null && operatingLimit ? Math.round((census / operatingLimit) * 1000) / 10 : null,
      monthToDate: flowTotals(ownMonthly.filter((row) => textValue(row.month_bucket) === asOfMonth)),
      lastMonth: flowTotals(ownMonthly.filter((row) => textValue(row.month_bucket) === lastMonth)),
      recentWeeks: flowTotals(weeklyRows.filter((row) => facilityId(row) === id && recentWeekKeys.has(textValue(row.week_start)))),
      referrals: connected ? boardCountsFor(boardCards.filter((card) => card.facilityId === id)) : null
    };
  }).sort((left, right) => (right.census ?? -1) - (left.census ?? -1));

  const censusValues = communities.map((community) => community.census).filter((value) => value != null);
  const census = censusValues.length ? censusValues.reduce((total, value) => total + value, 0) : null;
  const operatingLimit = communities.reduce((total, community) => total + (community.operatingLimit ?? 0), 0);

  return {
    generated_at: generatedAt || new Date().toISOString(),
    as_of_date: asOfDate,
    month: asOfMonth,
    prior_month: lastMonth,
    portfolio: {
      census,
      censusChange: operatingRows.length ? operatingRows.reduce((total, row) => total + numberValue(row.census_delta), 0) : null,
      operatingLimit: operatingLimit || null,
      occupancyPct: census != null && operatingLimit ? Math.round((census / operatingLimit) * 1000) / 10 : null,
      monthToDate: flowTotals(monthlyRows.filter((row) => textValue(row.month_bucket) === asOfMonth)),
      lastMonth: flowTotals(monthlyRows.filter((row) => textValue(row.month_bucket) === lastMonth)),
      recentWeeks: flowTotals(weeklyRows.filter((row) => recentWeekKeys.has(textValue(row.week_start))))
    },
    weekly,
    monthly: seriesBy(monthlyRows, "month_bucket", MONTHLY_POINTS),
    communities,
    // Referral volume from Pipeline beside actual census admissions, so
    // leadership sees referral-to-move-in conversion in one series.
    referral_trend: connected
      ? referralPipeline.history.monthly.map((row) => ({
        month: row.month,
        received: row.received,
        accepted: row.accepted,
        censusAdmissions: flowTotals(monthlyRows.filter((flow) => textValue(flow.month_bucket) === row.month)).admissions
      }))
      : [],
    referral_pipeline: referralPipeline
  };
}
