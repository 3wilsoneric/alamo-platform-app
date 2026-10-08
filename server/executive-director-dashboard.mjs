function numeric(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function latestByPeriod(rows, field) {
  return [...(rows ?? [])]
    .filter((row) => typeof row?.[field] === "string" && row[field])
    .sort((left, right) => left[field].localeCompare(right[field]))
    .at(-1) ?? null;
}

function scopeAdmissions(admissions, facilityId) {
  if (!admissions) {
    return {
      status: "unavailable",
      generatedAt: null,
      asOfDate: null,
      community: null,
      cards: [],
      recentReferrals: [],
      upcomingAssessments: [],
      plannedMoveIns: []
    };
  }

  const community = admissions.communities?.find((row) => row.facilityId === facilityId) ?? null;
  const briefingCommunity = admissions.briefing?.communities?.find(
    (row) => row.facilityId === facilityId
  ) ?? null;
  const pipeline = admissions.referral_pipeline;
  const connected = pipeline?.status === "connected";
  const briefingReady = connected && pipeline.briefing?.status === "ready";

  return {
    status: connected ? "connected" : pipeline?.status ?? "unavailable",
    generatedAt: connected ? pipeline.generatedAt : admissions.generated_at ?? null,
    asOfDate: admissions.as_of_date ?? null,
    community: community
      ? {
          census: numeric(community.census),
          censusChange: numeric(community.censusChange),
          operatingLimit: numeric(community.operatingLimit),
          occupancyPct: numeric(community.occupancyPct),
          monthToDate: community.monthToDate,
          lastMonth: community.lastMonth,
          recentWeeks: community.recentWeeks,
          activeReferrals: community.referrals?.onBoard ?? null,
          inDecision: community.referrals?.inDecision ?? null,
          needsAttention: community.referrals?.needsAttention ?? null,
          newReferrals7d: briefingCommunity?.newReferrals7d ?? null,
          newReferrals14d: briefingCommunity?.newReferrals14d ?? null,
          assessmentsThisWeek: briefingCommunity?.assessmentsThisWeek ?? null,
          plannedMoveInsThisWeek: briefingCommunity?.plannedMoveInsThisWeek ?? null,
          completedMoveInsThisWeek: briefingCommunity?.completedMoveInsThisWeek ?? null
        }
      : null,
    cards: connected
      ? pipeline.board.cards.filter((card) => card.facilityId === facilityId)
      : [],
    recentReferrals: briefingReady
      ? pipeline.briefing.recentReferrals.filter((row) => row.facilityId === facilityId)
      : [],
    upcomingAssessments: briefingReady
      ? pipeline.briefing.upcomingAssessments.filter((row) => row.facilityId === facilityId)
      : [],
    plannedMoveIns: briefingReady
      ? pipeline.briefing.plannedMoveIns.filter((row) => row.facilityId === facilityId)
      : []
  };
}

export function buildExecutiveDirectorCommunityDashboard({
  facilityId,
  communitySnapshot,
  reportsSummary,
  admissionsDashboard
}) {
  const census = (communitySnapshot?.census ?? [])
    .filter((row) => row.facility_id === facilityId)
    .map((row) => ({ month: row.month_bucket, census: numeric(row.census) }))
    .filter((row) => /^\d{4}-\d{2}$/.test(row.month) && row.census != null)
    .sort((left, right) => left.month.localeCompare(right.month));
  const medicationRows = (reportsSummary?.medicationCompliance ?? [])
    .filter((row) => row.facility_id === facilityId);
  const latestMedication = latestByPeriod(medicationRows, "month_bucket");
  const admissions = scopeAdmissions(admissionsDashboard, facilityId);

  return {
    version: "executive-director-community-dashboard-v1",
    status: communitySnapshot ? "ready" : "unavailable",
    generatedAt: communitySnapshot?.generated_at ?? null,
    reportingMonth: communitySnapshot?.reporting_month ?? null,
    summary: communitySnapshot
      ? {
          residents: numeric(communitySnapshot.summary?.residents),
          currentIncidents: numeric(communitySnapshot.summary?.currentIncidents),
          priorIncidents: numeric(communitySnapshot.summary?.priorIncidents),
          averageAge: numeric(communitySnapshot.summary?.averageAge),
          averageLengthOfStay: numeric(communitySnapshot.summary?.averageLengthOfStay)
        }
      : null,
    census,
    incidentTrend: (communitySnapshot?.incidentTrend ?? [])
      .map((row) => ({ month: row.month_bucket, count: numeric(row.incidentCount) }))
      .filter((row) => /^\d{4}-\d{2}$/.test(row.month) && row.count != null),
    topIncidentCategories: (communitySnapshot?.topIncidentCategories ?? [])
      .map((row) => ({ label: String(row.label ?? "Unknown"), count: numeric(row.count) }))
      .filter((row) => row.count != null),
    medication: latestMedication
      ? {
          month: latestMedication.month_bucket,
          compliancePct: numeric(latestMedication.compliance_pct),
          scheduled: numeric(latestMedication.total_scheduled),
          given: numeric(latestMedication.given),
          notGiven: numeric(latestMedication.not_given)
        }
      : null,
    admissions
  };
}
