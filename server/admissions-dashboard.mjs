import { ALAMO_FACILITIES, normalizeKnownCommunityNames } from "../shared/community-names.mjs";
import { buildVerifiedClientCountyRows } from "./admissions-county-crosswalk.mjs";

// Leadership view of admissions. Census and resident-flow data stay aggregate:
// the flow tables also carry admitted/discharged resident names, which are
// never copied into this payload. The separately authenticated Pipeline feed
// supplies the bounded PHI shown in the referral board and management chart.

const WEEKLY_POINTS = 12;
const MONTHLY_POINTS = 6;
const RECENT_WEEKS = 4;
const DAY_MS = 86_400_000;
const FACILITY_BY_ID = new Map(ALAMO_FACILITIES.map((facility) => [facility.facilityId, facility]));
const COUNTY_OUTREACH_FACILITY_IDS = Object.freeze(["337", "345"]);

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
  const activeCards = cards.filter((card) => card.status.trim().toLowerCase() !== "declined");
  return {
    onBoard: activeCards.length,
    inDecision: activeCards.filter((card) => card.column === "decision").length,
    needsAttention: activeCards.filter((card) => Object.values(card.flags).some(Boolean)).length
  };
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mondayFor(value) {
  const date = new Date(`${value}T00:00:00.000Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function inDateWindow(value, start, end) {
  const date = isoDate(value);
  return Boolean(date && date >= start && date <= end);
}

function pipelineBriefingStatus(pipeline) {
  if (pipeline.status === "not_connected") return "not_connected";
  if (pipeline.status === "unavailable") return "unavailable";
  return pipeline.briefing.status === "ready" ? "ready" : "source_upgrade_required";
}

function countyName(value) {
  const cleaned = textValue(value).replace(/\s+county$/i, "").trim();
  if (!cleaned) return null;
  return cleaned === cleaned.toUpperCase()
    ? cleaned.toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase())
    : cleaned;
}

function summarizeCountyRows(asOfDate, community, sourceRows, source) {
  const sourceAsOfDates = [...new Set(sourceRows.map((row) => isoDate(row.as_of_date)).filter(Boolean))];
  const rowAsOfDate = sourceAsOfDates.length === 1 ? sourceAsOfDates[0] : null;
  const baselineDates = [...new Set(sourceRows.map((row) => isoDate(row.source_as_of_date)).filter(Boolean))];
  const countyCounts = new Map();
  let countyNotRecorded = 0;
  for (const row of sourceRows) {
    const residents = numberValue(row.resident_count);
    const name = countyName(row.client_county);
    if (!name) countyNotRecorded += residents;
    else {
      const key = name.toLowerCase();
      const current = countyCounts.get(key) ?? { county: name, residents: 0 };
      current.residents += residents;
      countyCounts.set(key, current);
    }
  }
  const counties = [...countyCounts.values()]
    .sort((left, right) => right.residents - left.residents || left.county.localeCompare(right.county));
  const knownCountyResidents = counties.reduce((total, row) => total + row.residents, 0);
  const publishedTotal = knownCountyResidents + countyNotRecorded;
  const census = community?.census ?? null;
  const status = !sourceRows.length
    ? "source_not_published"
    : census == null || rowAsOfDate !== asOfDate || publishedTotal !== census
      ? "reconciliation_failed"
      : "ready";
  return {
    source: status === "ready" ? source : null,
    sourceAsOfDate: status === "ready" && baselineDates.length === 1 ? baselineDates[0] : null,
    status,
    census,
    knownCountyResidents: status === "ready" ? knownCountyResidents : null,
    countyNotRecorded: status === "ready" ? countyNotRecorded : null,
    coveragePct: status === "ready" && census
      ? Math.round((knownCountyResidents / census) * 1000) / 10
      : null,
    counties: status === "ready"
      ? counties.map((row) => ({
        ...row,
        sharePct: knownCountyResidents
          ? Math.round((row.residents / knownCountyResidents) * 1000) / 10
          : 0
      }))
      : []
  };
}

function buildCountyOutreach(asOfDate, communities, publishedCountyRows, verifiedClientCountyRows) {
  const outreachCommunities = COUNTY_OUTREACH_FACILITY_IDS.map((id) => {
    const facility = FACILITY_BY_ID.get(id);
    const community = communities.find((row) => row.facilityId === id);
    const direct = summarizeCountyRows(
      asOfDate,
      community,
      publishedCountyRows.filter((row) => facilityId(row) === id),
      "admission_record"
    );
    const fallback = summarizeCountyRows(
      asOfDate,
      community,
      verifiedClientCountyRows.filter((row) => facilityId(row) === id),
      "verified_client_database"
    );
    const summary = direct.status === "ready" && direct.knownCountyResidents > 0
      ? direct
      : fallback.status === "ready" && fallback.knownCountyResidents > 0
        ? fallback
        : direct.status !== "source_not_published"
          ? direct
          : fallback;
    return {
      facilityId: id,
      communityName: facility?.communityName ?? community?.communityName ?? "Community",
      shortName: facility?.shortName ?? community?.shortName ?? "Community",
      ...summary
    };
  });
  const usableSources = [...new Set(outreachCommunities
    .filter((community) => community.status === "ready" && (community.knownCountyResidents ?? 0) > 0)
    .map((community) => community.source))];
  const source = usableSources.length === 1
    ? usableSources[0]
    : usableSources.length > 1
      ? "mixed"
      : null;
  const sourceDates = [...new Set(outreachCommunities
    .map((community) => community.sourceAsOfDate)
    .filter(Boolean))];
  return {
    asOfDate,
    source,
    sourceAsOfDate: sourceDates.length === 1 ? sourceDates[0] : null,
    communities: outreachCommunities
  };
}

function buildWeeklyBriefing({ asOfDate, census, communities, weeklyRows, publishedCountyRows, verifiedClientCountyRows, referralPipeline }) {
  const sourceStatus = pipelineBriefingStatus(referralPipeline);
  const source = referralPipeline.status === "connected" && referralPipeline.briefing.status === "ready"
    ? referralPipeline.briefing
    : null;
  const reportingDate = source?.windowEnd ?? asOfDate;
  const weekStart = mondayFor(reportingDate);
  const weekEnd = shiftDate(weekStart, 6);
  const last7Start = shiftDate(reportingDate, -6);
  const last14Start = shiftDate(reportingDate, -13);
  const previous7End = shiftDate(reportingDate, -7);
  const currentWeekRows = weeklyRows.filter((row) => textValue(row.week_start) === weekStart);
  const completedMoveInsCovered = currentWeekRows.length > 0;
  const coverage = {
    recentReferrals: source?.coverage.recentReferrals === true,
    assessments: source?.coverage.assessments === true,
    moveIns: source?.coverage.moveIns === true,
    weeklyTrend: source?.coverage.weeklyTrend === true,
    completedMoveIns: completedMoveInsCovered
  };
  const recentReferrals = coverage.recentReferrals
    ? source.recentReferrals
      .filter((row) => inDateWindow(row.receivedAt, last14Start, reportingDate))
      .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt) || left.clientName.localeCompare(right.clientName))
    : [];
  const last7Referrals = recentReferrals.filter((row) => inDateWindow(row.receivedAt, last7Start, reportingDate));
  const upcomingAssessments = coverage.assessments
    ? source.upcomingAssessments
      .filter((row) => inDateWindow(row.scheduledAt, reportingDate, weekEnd) && !/cancel|complete/i.test(row.status))
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt) || left.clientName.localeCompare(right.clientName))
    : [];
  const plannedMoveIns = coverage.moveIns
    ? source.plannedMoveIns
      .filter((row) => inDateWindow(row.plannedAt, weekStart, weekEnd) && !/cancel|denied/i.test(row.status))
      .sort((left, right) => left.plannedAt.localeCompare(right.plannedAt) || left.clientName.localeCompare(right.clientName))
    : [];
  const briefingCommunities = communities.map((community) => {
    const facilityReferrals = recentReferrals.filter((row) => row.facilityId === community.facilityId);
    return {
      facilityId: community.facilityId,
      communityName: community.communityName,
      shortName: community.shortName,
      census: community.census,
      operatingLimit: community.operatingLimit,
      occupancyPct: community.occupancyPct,
      newReferrals7d: coverage.recentReferrals
        ? facilityReferrals.filter((row) => inDateWindow(row.receivedAt, last7Start, reportingDate)).length
        : null,
      newReferrals14d: coverage.recentReferrals ? facilityReferrals.length : null,
      assessmentsThisWeek: coverage.assessments
        ? upcomingAssessments.filter((row) => row.facilityId === community.facilityId).length
        : null,
      plannedMoveInsThisWeek: coverage.moveIns
        ? plannedMoveIns.filter((row) => row.facilityId === community.facilityId).length
        : null,
      completedMoveInsThisWeek: completedMoveInsCovered
        ? flowTotals(currentWeekRows.filter((row) => facilityId(row) === community.facilityId)).admissions
        : null
    };
  });
  const originMap = new Map();
  for (const referral of recentReferrals) {
    const sourceName = referral.sourceName ?? referral.sourceCategory ?? "Origin not recorded";
    const key = [sourceName, referral.sourceCategory ?? "", referral.referringCounty ?? ""].join("|").toLowerCase();
    const current = originMap.get(key) ?? {
      key,
      sourceName,
      sourceCategory: referral.sourceCategory,
      referringCounty: referral.referringCounty,
      last7Days: 0,
      previous7Days: 0,
      total14Days: 0,
      communities: new Set()
    };
    current.total14Days += 1;
    if (inDateWindow(referral.receivedAt, last7Start, reportingDate)) current.last7Days += 1;
    if (inDateWindow(referral.receivedAt, last14Start, previous7End)) current.previous7Days += 1;
    current.communities.add(referral.facilityId ? referral.community : "No community assigned");
    originMap.set(key, current);
  }
  const origins = [...originMap.values()]
    .map((row) => ({ ...row, communities: [...row.communities].sort() }))
    .sort((left, right) => right.total14Days - left.total14Days || left.sourceName.localeCompare(right.sourceName));
  const trend = coverage.weeklyTrend
    ? source.weeklyTrend
      .slice(-12)
      .map((point) => {
        const matchingFlow = weeklyRows.filter((row) => textValue(row.week_start) === point.weekStart);
        return {
          weekStart: point.weekStart,
          received: point.received,
          accepted: point.accepted,
          completedMoveIns: matchingFlow.length ? flowTotals(matchingFlow).admissions : null
        };
      })
    : [];
  const communityRowsWithUnassigned = [...briefingCommunities];
  const unassignedReferrals = recentReferrals.filter((row) => !row.facilityId);
  const unassignedAssessments = upcomingAssessments.filter((row) => !row.facilityId);
  const unassignedMoveIns = plannedMoveIns.filter((row) => !row.facilityId);
  if (unassignedReferrals.length || unassignedAssessments.length || unassignedMoveIns.length) {
    communityRowsWithUnassigned.push({
      facilityId: "unassigned",
      communityName: "No community assigned",
      shortName: "Unassigned",
      census: null,
      operatingLimit: null,
      occupancyPct: null,
      newReferrals7d: coverage.recentReferrals
        ? unassignedReferrals.filter((row) => inDateWindow(row.receivedAt, last7Start, reportingDate)).length
        : null,
      newReferrals14d: coverage.recentReferrals ? unassignedReferrals.length : null,
      assessmentsThisWeek: coverage.assessments ? unassignedAssessments.length : null,
      plannedMoveInsThisWeek: coverage.moveIns ? unassignedMoveIns.length : null,
      completedMoveInsThisWeek: null
    });
  }
  return {
    sourceStatus,
    asOfDate,
    pipelineAsOfDate: source?.windowEnd ?? null,
    weekStart,
    weekEnd,
    coverage,
    totals: {
      census,
      newReferrals7d: coverage.recentReferrals ? last7Referrals.length : null,
      newReferrals14d: coverage.recentReferrals ? recentReferrals.length : null,
      assessmentsThisWeek: coverage.assessments ? upcomingAssessments.length : null,
      plannedMoveInsThisWeek: coverage.moveIns ? plannedMoveIns.length : null,
      completedMoveInsThisWeek: completedMoveInsCovered ? flowTotals(currentWeekRows).admissions : null
    },
    communities: communityRowsWithUnassigned,
    countyOutreach: buildCountyOutreach(asOfDate, communities, publishedCountyRows, verifiedClientCountyRows),
    origins,
    recentReferrals,
    upcomingAssessments,
    plannedMoveIns,
    trend
  };
}

/**
 * @param {any} snapshot
 * @param {{ referralPipeline?: any, clientDatabase?: any }} [options]
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
  const publishedCountyRows = table(snapshot, "current_resident_county_by_community");
  const verifiedClientCountyRows = buildVerifiedClientCountyRows(
    table(snapshot, "resident_profile"),
    options.clientDatabase ?? null,
    asOfDate
  );

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
      },
      briefing: pipeline.briefing.status === "ready"
        ? {
          ...pipeline.briefing,
          recentReferrals: pipeline.briefing.recentReferrals.map((row) => ({ ...row, facilityId: facilityIdForPipelineCommunity(row.community) })),
          upcomingAssessments: pipeline.briefing.upcomingAssessments.map((row) => ({ ...row, facilityId: facilityIdForPipelineCommunity(row.community) })),
          plannedMoveIns: pipeline.briefing.plannedMoveIns.map((row) => ({ ...row, facilityId: facilityIdForPipelineCommunity(row.community) }))
        }
        : pipeline.briefing
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

  const briefing = buildWeeklyBriefing({
    asOfDate,
    census,
    communities,
    weeklyRows,
    publishedCountyRows,
    verifiedClientCountyRows,
    referralPipeline
  });

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
    referral_pipeline: referralPipeline,
    briefing
  };
}
