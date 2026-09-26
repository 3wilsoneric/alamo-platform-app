function textValue(value) {
  return value == null ? "" : String(value).trim();
}

function optionalWholeNumber(value) {
  const parsed =
    typeof value === "bigint"
      ? Number(value)
      : typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
          ? Number(value)
          : Number.NaN;
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function isoDateValue(value) {
  const text = textValue(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed)
    ? new Date(parsed).toISOString().slice(0, 10)
    : null;
}

function shiftIsoDate(value, days) {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}

function weeklyCensusRows(reportsSummary) {
  return (
    reportsSummary?.toolContext?.censusWeeklyByCommunity ??
    reportsSummary?.toolContext?.tables?.census_weekly_by_community ??
    reportsSummary?.censusWeeklyByCommunity ??
    []
  );
}

function monthlyCensusRows(communities) {
  return communities?.census ?? [];
}

function residentEpisodeRows(reportsSummary) {
  return (
    reportsSummary?.toolContext?.residentEpisodeHistory ??
    reportsSummary?.toolContext?.tables?.resident_episode_history ??
    reportsSummary?.residentEpisodeHistory ??
    []
  );
}

function censusFromEpisodes(rows, censusDate) {
  if (!rows.length) return null;

  const activeResidents = new Set();
  for (const row of rows) {
    const residentId = textValue(
      row.resident_id ?? row.residentId ?? row.Res_Number
    );
    const admitDate = isoDateValue(row.admit_date ?? row.admitDate);
    const dischargeDate = isoDateValue(
      row.discharge_date ?? row.dischargeDate
    );
    if (
      !residentId ||
      !admitDate ||
      admitDate > censusDate ||
      (dischargeDate && dischargeDate <= censusDate)
    ) {
      continue;
    }
    activeResidents.add(residentId);
  }

  return activeResidents.size;
}

function resolvePriorCensus(current, rows, episodes) {
  if (!current) return null;
  const expectedPriorDate = shiftIsoDate(current.censusDate, -7);
  if (!expectedPriorDate) return null;

  const hasPublishedComparison =
    current.priorCensusDate !== null ||
    current.census7dPrior !== null ||
    current.censusChange7d !== null;
  if (hasPublishedComparison) {
    const publishedComparisonIsValid =
      current.priorCensusDate === expectedPriorDate &&
      current.census7dPrior !== null &&
      current.censusChange7d !== null &&
      current.census - current.census7dPrior === current.censusChange7d;
    if (publishedComparisonIsValid) {
      return {
        priorDate: expectedPriorDate,
        priorCensus: current.census7dPrior,
        change: current.censusChange7d
      };
    }
  }

  const exactPriorRow = rows.find(
    (row) => row.censusDate === expectedPriorDate
  );
  if (exactPriorRow) {
    return {
      priorDate: expectedPriorDate,
      priorCensus: exactPriorRow.census,
      change: current.census - exactPriorRow.census
    };
  }

  const priorCensus = censusFromEpisodes(episodes, expectedPriorDate);
  return priorCensus === null
    ? null
    : {
        priorDate: expectedPriorDate,
        priorCensus,
        change: current.census - priorCensus
      };
}

function buildOperationalSignals(asOfValue, reportsSummary, facilities) {
  const parsedAsOf = Date.parse(asOfValue);
  const asOf = new Date(
    Number.isFinite(parsedAsOf) ? parsedAsOf : Date.now()
  ).toISOString();
  const asOfDate = asOf.slice(0, 10);
  const censusByFacility = new Map();
  const episodesByFacility = new Map();

  for (const row of weeklyCensusRows(reportsSummary)) {
    const facilityId = textValue(row.facility_id ?? row.Facility);
    const weekStart = textValue(row.week_start ?? row.weekStart);
    const censusDate = isoDateValue(
      row.census_date ?? row.censusDate ?? row.week_end ?? row.weekEnd
    );
    const census = optionalWholeNumber(row.census);
    if (
      !facilityId ||
      !weekStart ||
      !censusDate ||
      censusDate > asOfDate ||
      census === null
    ) {
      continue;
    }
    const rows = censusByFacility.get(facilityId) ?? [];
    rows.push({
      weekStart,
      censusDate,
      priorCensusDate: isoDateValue(
        row.prior_census_date ?? row.priorCensusDate
      ),
      census,
      census7dPrior: optionalWholeNumber(
        row.census_7d_prior ?? row.census7dPrior
      ),
      censusChange7d: optionalWholeNumber(
        row.census_change_7d ?? row.censusChange7d
      )
    });
    censusByFacility.set(facilityId, rows);
  }

  for (const row of residentEpisodeRows(reportsSummary)) {
    const facilityId = textValue(
      row.facility_id ?? row.facilityId ?? row.Facility
    );
    if (!facilityId) continue;
    const rows = episodesByFacility.get(facilityId) ?? [];
    rows.push(row);
    episodesByFacility.set(facilityId, rows);
  }

  const communities = facilities.map((facility) => {
    const facilityId = textValue(facility.facility_id);
    const rows = [
      ...new Map(
        (censusByFacility.get(facilityId) ?? []).map((row) => [
          row.censusDate,
          row
        ])
      ).values()
    ].sort((left, right) => left.censusDate.localeCompare(right.censusDate));
    const current = rows.at(-1) ?? null;
    const comparison = resolvePriorCensus(
      current,
      rows,
      episodesByFacility.get(facilityId) ?? []
    );

    return {
      facility_id: facilityId,
      latestCensusWeek: current?.censusDate ?? null,
      priorCensusWeek: comparison?.priorDate ?? null,
      currentWeeklyCensus: current?.census ?? null,
      priorWeeklyCensus: comparison?.priorCensus ?? null,
      censusChange7d: comparison?.change ?? null
    };
  });

  const latestWeeks = new Set(
    communities.map((community) => community.latestCensusWeek).filter(Boolean)
  );
  const priorWeeks = new Set(
    communities.map((community) => community.priorCensusWeek).filter(Boolean)
  );
  const periodsAlign =
    communities.length === facilities.length &&
    latestWeeks.size === 1 &&
    priorWeeks.size === 1;
  const completeAlignedCensus =
    periodsAlign &&
    communities.every(
      (community) =>
        community.currentWeeklyCensus !== null &&
        community.priorWeeklyCensus !== null
    );
  const currentWeeklyCensus = completeAlignedCensus
    ? communities.reduce(
        (sum, community) => sum + community.currentWeeklyCensus,
        0
      )
    : null;
  const priorWeeklyCensus = completeAlignedCensus
    ? communities.reduce(
        (sum, community) => sum + community.priorWeeklyCensus,
        0
      )
    : null;

  return {
    asOf,
    latestCensusWeek: periodsAlign ? [...latestWeeks][0] : null,
    currentWeeklyCensus,
    priorWeeklyCensus,
    censusChange7d:
      currentWeeklyCensus !== null && priorWeeklyCensus !== null
        ? currentWeeklyCensus - priorWeeklyCensus
        : null,
    communities
  };
}

function buildMonthlyCensusSignals(asOfValue, communities, facilities) {
  const parsedAsOf = Date.parse(asOfValue);
  const asOf = new Date(
    Number.isFinite(parsedAsOf) ? parsedAsOf : Date.now()
  ).toISOString();
  const asOfMonth = asOf.slice(0, 7);
  const rowsByFacility = new Map();

  for (const row of monthlyCensusRows(communities)) {
    const facilityId = textValue(row.facility_id ?? row.Facility);
    const month = textValue(row.month_bucket ?? row.monthBucket).slice(0, 7);
    const census = optionalWholeNumber(row.census);
    if (
      !facilityId ||
      !/^\d{4}-\d{2}$/.test(month) ||
      month > asOfMonth ||
      census === null
    ) {
      continue;
    }
    const rows = rowsByFacility.get(facilityId) ?? new Map();
    rows.set(month, census);
    rowsByFacility.set(facilityId, rows);
  }

  const facilityIds = facilities.map((facility) => textValue(facility.facility_id));
  const commonMonths = facilityIds.length
    ? [...(rowsByFacility.get(facilityIds[0])?.keys() ?? [])]
        .filter((month) => facilityIds.every((facilityId) => rowsByFacility.get(facilityId)?.has(month)))
        .sort()
    : [];
  const currentPeriod = commonMonths.at(-1) ?? null;
  const priorPeriod = commonMonths.at(-2) ?? null;

  const communitySignals = facilities.map((facility) => {
    const facilityId = textValue(facility.facility_id);
    const rows = rowsByFacility.get(facilityId);
    const currentCensus = currentPeriod ? rows?.get(currentPeriod) ?? null : null;
    const priorCensus = priorPeriod ? rows?.get(priorPeriod) ?? null : null;
    return {
      facility_id: facilityId,
      currentCensus,
      priorCensus,
      censusChange:
        currentCensus !== null && priorCensus !== null
          ? currentCensus - priorCensus
          : null
    };
  });
  const complete =
    currentPeriod !== null &&
    priorPeriod !== null &&
    communitySignals.every(
      (community) => community.currentCensus !== null && community.priorCensus !== null
    );
  const currentCensus = complete
    ? communitySignals.reduce((sum, community) => sum + community.currentCensus, 0)
    : null;
  const priorCensus = complete
    ? communitySignals.reduce((sum, community) => sum + community.priorCensus, 0)
    : null;

  return {
    asOf,
    currentPeriod: complete ? currentPeriod : null,
    priorPeriod: complete ? priorPeriod : null,
    currentCensus,
    priorCensus,
    censusChange:
      currentCensus !== null && priorCensus !== null
        ? currentCensus - priorCensus
        : null,
    communities: communitySignals
  };
}

export function buildHomeDashboard(communities, reportsSummary) {
  const facilities = communities.facilities ?? [];
  const residents = communities.residents ?? [];
  const incidents = communities.incidents ?? [];
  const monthBuckets = [
    ...new Set(
      incidents.map((incident) => incident.month_bucket).filter(Boolean)
    )
  ].sort();
  const latestMonth = monthBuckets.at(-1) ?? null;
  const generatedAt = communities.generated_at ?? new Date().toISOString();
  const operational = buildOperationalSignals(
    communities.as_of_date ?? generatedAt,
    reportsSummary,
    facilities
  );
  const monthlyOperational = buildMonthlyCensusSignals(
    communities.as_of_date ?? generatedAt,
    communities,
    facilities
  );
  const hasCompleteWeeklyCensus = operational.currentWeeklyCensus !== null;
  const censusCadence = hasCompleteWeeklyCensus
    ? "weekly"
    : monthlyOperational.currentCensus !== null
      ? "monthly"
      : null;
  const preferredCensus = hasCompleteWeeklyCensus
    ? {
        currentPeriod: operational.latestCensusWeek,
        priorPeriod: operational.communities[0]?.priorCensusWeek ?? null,
        currentCensus: operational.currentWeeklyCensus,
        priorCensus: operational.priorWeeklyCensus,
        censusChange: operational.censusChange7d,
        communities: operational.communities.map((community) => ({
          facility_id: community.facility_id,
          currentCensus: community.currentWeeklyCensus,
          priorCensus: community.priorWeeklyCensus,
          censusChange: community.censusChange7d
        }))
      }
    : monthlyOperational;
  const operationalByFacility = new Map(
    operational.communities.map((community) => [
      community.facility_id,
      community
    ])
  );
  const preferredCensusByFacility = new Map(
    preferredCensus.communities.map((community) => [
      community.facility_id,
      community
    ])
  );
  const currentIncidents = incidents
    .filter((incident) => incident.month_bucket === latestMonth)
    .reduce((sum, incident) => sum + incident.incident_count, 0);
  const residentCount = residents.length;
  const averageAge =
    residentCount > 0
      ? residents.reduce((sum, resident) => sum + (resident.age ?? 0), 0) /
        residentCount
      : 0;
  const averageLengthOfStay =
    residentCount > 0
      ? residents.reduce(
          (sum, resident) => sum + (resident.los_days ?? 0),
          0
        ) / residentCount
      : 0;
  const incidentTrend = monthBuckets.slice(-6).map((monthBucket) => ({
    month_bucket: monthBucket,
    incidentCount: incidents
      .filter((incident) => incident.month_bucket === monthBucket)
      .reduce((sum, incident) => sum + incident.incident_count, 0)
  }));
  const communitiesSummary = facilities
    .map((facility) => {
      const facilityResidents = residents.filter(
        (resident) => resident.facility_id === facility.facility_id
      );
      const facilityCurrentIncidents = incidents
        .filter(
          (incident) =>
            incident.facility_id === facility.facility_id &&
            incident.month_bucket === latestMonth
        )
        .reduce((sum, incident) => sum + incident.incident_count, 0);
      const facilityOperations = operationalByFacility.get(
        facility.facility_id
      );
      const facilityCensus = preferredCensusByFacility.get(facility.facility_id);

      return {
        facility_id: facility.facility_id,
        community_name: facility.community_name,
        community_code: facility.community_code,
        city: facility.city,
        state: facility.state,
        total_residents: facility.total_residents,
        currentIncidents: facilityCurrentIncidents,
        currentWeeklyCensus: facilityOperations?.currentWeeklyCensus ?? null,
        priorWeeklyCensus: facilityOperations?.priorWeeklyCensus ?? null,
        censusChange7d: facilityOperations?.censusChange7d ?? null,
        latestCensusWeek: facilityOperations?.latestCensusWeek ?? null,
        censusCadence,
        currentCensusPeriod: preferredCensus.currentPeriod,
        priorCensusPeriod: preferredCensus.priorPeriod,
        currentCensus: facilityCensus?.currentCensus ?? null,
        priorCensus: facilityCensus?.priorCensus ?? null,
        censusChange: facilityCensus?.censusChange ?? null,
        averageAge:
          facilityResidents.length > 0
            ? facilityResidents.reduce(
                (sum, resident) => sum + (resident.age ?? 0),
                0
              ) / facilityResidents.length
            : 0,
        averageLengthOfStay:
          facilityResidents.length > 0
            ? facilityResidents.reduce(
                (sum, resident) => sum + (resident.los_days ?? 0),
                0
              ) / facilityResidents.length
            : 0,
        residentSharePct:
          preferredCensus.currentCensus &&
          facilityCensus?.currentCensus !== null &&
          facilityCensus?.currentCensus !== undefined
            ? (facilityCensus.currentCensus /
                preferredCensus.currentCensus) *
              100
            : 0
      };
    })
    .sort(
      (left, right) =>
        Number(right.currentCensus ?? -1) -
        Number(left.currentCensus ?? -1)
    );
  const compliance = reportsSummary?.medicationCompliance ?? [];
  const complianceMonths = [
    ...new Set(compliance.map((row) => row.month_bucket).filter(Boolean))
  ].sort();
  const latestComplianceMonth = complianceMonths.at(-1) ?? null;
  const currentCompliance = compliance.filter(
    (row) => row.month_bucket === latestComplianceMonth
  );
  const largestCommunity = communitiesSummary[0] ?? null;

  return {
    generated_at: generatedAt,
    reporting_month: latestMonth,
    portfolio: {
      communityCount: facilities.length,
      residentCount,
      currentIncidents,
      averageAge,
      averageLengthOfStay
    },
    operational: {
      asOf: operational.asOf,
      latestCensusWeek: operational.latestCensusWeek,
      currentWeeklyCensus: operational.currentWeeklyCensus,
      priorWeeklyCensus: operational.priorWeeklyCensus,
      censusChange7d: operational.censusChange7d,
      censusCadence,
      currentCensusPeriod: preferredCensus.currentPeriod,
      priorCensusPeriod: preferredCensus.priorPeriod,
      currentCensus: preferredCensus.currentCensus,
      priorCensus: preferredCensus.priorCensus,
      censusChange: preferredCensus.censusChange
    },
    incidentTrend,
    communities: communitiesSummary.slice(0, 5),
    reporting: {
      latestMonth: latestComplianceMonth,
      averageCompliance:
        currentCompliance.length > 0
          ? currentCompliance.reduce(
              (sum, row) => sum + row.compliance_pct,
              0
            ) / currentCompliance.length
          : 0,
      documentationGapCount: reportsSummary?.documentationGaps?.length ?? 0,
      refusalSignalCount:
        reportsSummary?.refusalByMedication?.filter((row) => row.refusals > 0)
          .length ?? 0
    },
    watch: {
      largestCommunityName: largestCommunity?.community_name ?? null,
      largestCommunityResidents: largestCommunity?.currentCensus ?? 0
    }
  };
}
