function numeric(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function recordedBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === 1) return true;
  if (value === 0) return false;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "no", "n", "0"].includes(normalized)) return false;
  return null;
}

function latestByPeriod(rows, field) {
  return [...(rows ?? [])]
    .filter((row) => typeof row?.[field] === "string" && row[field])
    .sort((left, right) => left[field].localeCompare(right[field]))
    .at(-1) ?? null;
}

function toolRows(reportsSummary, propertyName, tableName) {
  const direct = reportsSummary?.toolContext?.[propertyName];
  if (Array.isArray(direct) && direct.length) return direct;
  const table = reportsSummary?.toolContext?.tables?.[tableName];
  return Array.isArray(table) ? table : [];
}

function scopeToolRows(rows, facilityId) {
  return (rows ?? []).filter((row) => String(row?.facility_id ?? row?.Facility ?? "") === String(facilityId));
}

function text(value) {
  const normalized = value == null ? "" : String(value).trim();
  return normalized || null;
}

function medicationExceptionKind(row) {
  if (row?.is_refusal) return "Refused";
  if (row?.is_on_hold || /\bhold|held\b/i.test(String(row?.outcome_category ?? row?.administration_outcome ?? ""))) return "Held";
  if (row?.is_over_60_minutes_late || Number(row?.minutes_late ?? 0) > 60) return "Late";
  if (row?.is_prn) return "PRN";
  return text(row?.outcome_category ?? row?.administration_outcome) ?? "Not given";
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
  const medicationExceptionRows = scopeToolRows(
    toolRows(reportsSummary, "marExceptionDetails", "mar_exception_detail_90d"),
    facilityId
  );
  const medicationResidentRows = scopeToolRows(
    toolRows(reportsSummary, "marResidentSummary", "mar_resident_summary"),
    facilityId
  );
  const residentEpisodeRows = scopeToolRows(
    toolRows(reportsSummary, "residentEpisodeHistory", "resident_episode_history"),
    facilityId
  );
  const admissions = scopeAdmissions(admissionsDashboard, facilityId);
  const medicationExceptions = medicationExceptionRows
    .map((row, index) => ({
      id: text(row.administration_id ?? row.id) ?? `medication-exception-${index + 1}`,
      residentId: text(row.resident_id),
      residentName: text(row.resident_name) ?? text(row.resident_id) ?? "Resident",
      medication: text(row.medication_name ?? row.medication) ?? "Medication not recorded",
      dosage: text(row.dosage),
      date: text(row.administration_date ?? row.scheduled_date ?? row.recorded_date),
      outcome: medicationExceptionKind(row),
      reason: text(row.not_given_reason ?? row.missed_or_held_reason ?? row.administration_note),
      noteRecorded: Boolean(text(row.administration_note))
    }))
    .sort((left, right) => String(right.date ?? "").localeCompare(String(left.date ?? "")))
    .slice(0, 50);
  const exceptionCounts = new Map();
  medicationExceptions.forEach((row) => {
    const key = row.residentId ?? row.residentName;
    const current = exceptionCounts.get(key) ?? { residentId: row.residentId, residentName: row.residentName, exceptions: 0 };
    current.exceptions += 1;
    exceptionCounts.set(key, current);
  });
  if (!exceptionCounts.size) {
    medicationResidentRows.forEach((row) => {
      const exceptions = numeric(row.refusals_30d ?? row.mar_refusals_30d ?? row.not_given_30d) ?? 0;
      if (exceptions <= 0) return;
      const residentId = text(row.resident_id);
      exceptionCounts.set(residentId ?? text(row.resident_name) ?? "Resident", {
        residentId,
        residentName: text(row.resident_name) ?? residentId ?? "Resident",
        exceptions
      });
    });
  }
  const residentMovements = residentEpisodeRows
    .flatMap((row, index) => {
      const base = {
        id: text(row.episode_id) ?? `resident-episode-${index + 1}`,
        residentId: text(row.resident_id),
        residentName: text(row.resident_name) ?? text(row.resident_id) ?? "Resident"
      };
      return [
        text(row.admit_date) ? { ...base, id: `${base.id}-admit`, date: text(row.admit_date), action: "Move-in", type: "Admission", destination: null, note: null } : null,
        text(row.discharge_date) ? { ...base, id: `${base.id}-discharge`, date: text(row.discharge_date), action: "Move-out", type: "Discharge", destination: text(row.discharge_destination), note: text(row.discharge_reason) } : null
      ].filter(Boolean);
    })
    .sort((left, right) => String(right.date ?? "").localeCompare(String(left.date ?? "")))
    .slice(0, 20);
  const incidentTrend = (communitySnapshot?.incidentTrend ?? [])
    .map((row) => ({ month: row.month_bucket, count: numeric(row.incidentCount) }))
    .filter((row) => /^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) && row.count != null)
    .sort((left, right) => left.month.localeCompare(right.month));
  const incidentDetails = (communitySnapshot?.incidentDetails ?? [])
    .filter((row) => String(row?.facility_id ?? "") === String(facilityId))
    .map((row) => ({
      id: text(row.id) ?? "incident",
      residentId: text(row.resident_id),
      residentName: text(row.client_name) ?? text(row.resident_id) ?? "Resident",
      date: text(row.incident_date) ?? text(row.received_at),
      category: text(row.category ?? row.incident_type) ?? "General",
      location: text(row.location),
      injuryOccurred: recordedBoolean(row.injury_occurred),
      policeCalled: recordedBoolean(row.police_called),
      response: text(row.assistance_given ?? row.email_body)
    }))
    .sort((left, right) => String(right.date ?? "").localeCompare(String(left.date ?? "")));
  const categoryPeriods = new Map(incidentTrend.map((point) => [point.month, {
    month: point.month, counts: new Map(), recordCount: 0, totalCount: point.count
  }]));
  for (const row of incidentDetails) {
    const date = /^(\d{4})-(0[1-9]|1[0-2])-(\d{2})(?:T|\s|$)/.exec(row.date ?? "");
    if (!date) continue;
    const day = Number(date[3]);
    if (day < 1 || day > new Date(Date.UTC(Number(date[1]), Number(date[2]), 0)).getUTCDate()) continue;
    const month = `${date[1]}-${date[2]}`;
    const period = categoryPeriods.get(month) ?? { month, counts: new Map(), recordCount: 0, totalCount: null };
    period.counts.set(row.category, (period.counts.get(row.category) ?? 0) + 1);
    period.recordCount += 1;
    categoryPeriods.set(month, period);
  }
  const incidentCategoryPeriods = [...categoryPeriods.values()]
    .sort((left, right) => left.month.localeCompare(right.month))
    .map((period) => ({
      month: period.month,
      categories: [...period.counts].map(([label, count]) => ({ label, count })).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label)),
      recordCount: period.recordCount,
      totalCount: period.totalCount,
      complete: period.totalCount != null && period.recordCount === period.totalCount
    }));
  const latestIncidentMonth = incidentTrend.at(-1)?.month ?? communitySnapshot?.reporting_month ?? null;

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
    incidentTrend,
    incidentCategoryPeriods,
    topIncidentCategories: incidentCategoryPeriods.find((period) => period.month === latestIncidentMonth)?.categories ?? [],
    incidentDetails: incidentDetails.slice(0, 50),
    residentMovements,
    medicationHistory: medicationRows
      .map((row) => ({
        month: row.month_bucket,
        compliancePct: numeric(row.compliance_pct),
        scheduled: numeric(row.total_scheduled),
        given: numeric(row.given),
        notGiven: numeric(row.not_given)
      }))
      .filter((row) => /^\d{4}-\d{2}$/.test(row.month) && row.compliancePct != null)
      .sort((left, right) => left.month.localeCompare(right.month)),
    medication: latestMedication
      ? {
          month: latestMedication.month_bucket,
          compliancePct: numeric(latestMedication.compliance_pct),
          scheduled: numeric(latestMedication.total_scheduled),
          given: numeric(latestMedication.given),
          notGiven: numeric(latestMedication.not_given)
        }
      : null,
    medicationExceptions,
    medicationWatch: [...exceptionCounts.values()]
      .sort((left, right) => right.exceptions - left.exceptions)
      .slice(0, 10),
    admissions
  };
}
