import assert from "node:assert/strict";

import { buildHomeDashboard } from "../server/home-dashboard.mjs";

const facilities = [
  {
    facility_id: "337",
    community_name: "San Pablo",
    community_code: "SP",
    city: "San Pablo",
    state: "CA"
  },
  {
    facility_id: "345",
    community_name: "Santa Clarita",
    community_code: "SC",
    city: "Santa Clarita",
    state: "CA"
  }
];

const communities = {
  generated_at: "2026-07-29T18:00:00.000Z",
  as_of_date: "2026-07-22",
  facilities,
  residents: [],
  incidents: []
};

function buildWithWeeklyRows(rows, episodes = []) {
  return buildHomeDashboard(communities, {
    toolContext: {
      censusWeeklyByCommunity: rows,
      residentEpisodeHistory: episodes
    }
  });
}

const exactPartialWeek = buildWithWeeklyRows([
  {
    Facility: "337",
    week_start: "2026-07-13",
    week_end: "2026-07-19",
    census: 141
  },
  {
    Facility: "337",
    week_start: "2026-07-20",
    census_date: "2026-07-22",
    prior_census_date: "2026-07-15",
    census: 148,
    census_7d_prior: 143,
    census_change_7d: 5
  },
  {
    Facility: "345",
    week_start: "2026-07-13",
    week_end: "2026-07-19",
    census: 116
  },
  {
    Facility: "345",
    week_start: "2026-07-20",
    census_date: "2026-07-22",
    prior_census_date: "2026-07-15",
    census: 120,
    census_7d_prior: 117,
    census_change_7d: 3
  }
]);

assert.equal(
  exactPartialWeek.operational.asOf,
  "2026-07-22T00:00:00.000Z",
  "weekly analysis must use the governed source date rather than the later publish time"
);
assert.equal(exactPartialWeek.operational.currentWeeklyCensus, 268);
assert.equal(exactPartialWeek.operational.priorWeeklyCensus, 260);
assert.equal(exactPartialWeek.operational.censusChange7d, 8);
assert.equal(exactPartialWeek.operational.latestCensusWeek, "2026-07-22");

const legacyCompleteWeeks = buildWithWeeklyRows([
  {
    Facility: "337",
    week_start: "2026-07-06",
    week_end: "2026-07-13",
    census: 140
  },
  {
    Facility: "337",
    week_start: "2026-07-13",
    week_end: "2026-07-20",
    census: 144
  },
  {
    Facility: "345",
    week_start: "2026-07-06",
    week_end: "2026-07-13",
    census: 114
  },
  {
    Facility: "345",
    week_start: "2026-07-13",
    week_end: "2026-07-20",
    census: 118
  }
]);

assert.equal(
  legacyCompleteWeeks.operational.censusChange7d,
  8,
  "legacy snapshots may fall back only when observation dates are exactly seven days apart"
);

const irregularLegacyUpload = buildWithWeeklyRows([
  {
    Facility: "337",
    week_start: "2026-07-13",
    week_end: "2026-07-19",
    census: 141
  },
  {
    Facility: "337",
    week_start: "2026-07-20",
    week_end: "2026-07-22",
    census: 148
  },
  {
    Facility: "345",
    week_start: "2026-07-13",
    week_end: "2026-07-19",
    census: 116
  },
  {
    Facility: "345",
    week_start: "2026-07-20",
    week_end: "2026-07-22",
    census: 120
  }
]);

assert.equal(
  irregularLegacyUpload.operational.censusChange7d,
  null,
  "a three-day partial-week interval must never be labeled as a seven-day change"
);
assert.equal(irregularLegacyUpload.operational.priorWeeklyCensus, null);

function episodeRows(facilityId, priorCount, currentAdds) {
  return [
    ...Array.from({ length: priorCount }, (_, index) => ({
      facility_id: facilityId,
      resident_id: `${facilityId}-prior-${index}`,
      admit_date: "2026-01-01",
      discharge_date: null
    })),
    ...Array.from({ length: currentAdds }, (_, index) => ({
      facility_id: facilityId,
      resident_id: `${facilityId}-current-${index}`,
      admit_date: "2026-07-20",
      discharge_date: null
    }))
  ];
}

const irregularLegacyWithEpisodes = buildWithWeeklyRows(
  [
    {
      Facility: "337",
      week_start: "2026-07-13",
      week_end: "2026-07-19",
      census: 141
    },
    {
      Facility: "337",
      week_start: "2026-07-20",
      week_end: "2026-07-22",
      census: 148
    },
    {
      Facility: "345",
      week_start: "2026-07-13",
      week_end: "2026-07-19",
      census: 116
    },
    {
      Facility: "345",
      week_start: "2026-07-20",
      week_end: "2026-07-22",
      census: 120
    }
  ],
  [...episodeRows("337", 143, 5), ...episodeRows("345", 117, 3)]
);

assert.equal(
  irregularLegacyWithEpisodes.operational.priorWeeklyCensus,
  260,
  "legacy snapshots must reconstruct the exact seven-day-prior census from resident episodes"
);
assert.equal(irregularLegacyWithEpisodes.operational.censusChange7d, 8);
assert.equal(
  irregularLegacyWithEpisodes.communities[0].priorWeeklyCensus,
  143
);

const invalidPublishedMath = buildWithWeeklyRows([
  {
    Facility: "337",
    week_start: "2026-07-20",
    census_date: "2026-07-22",
    prior_census_date: "2026-07-16",
    census: 148,
    census_7d_prior: 143,
    census_change_7d: 5
  },
  {
    Facility: "345",
    week_start: "2026-07-20",
    census_date: "2026-07-22",
    prior_census_date: "2026-07-16",
    census: 120,
    census_7d_prior: 117,
    census_change_7d: 3
  }
]);

assert.equal(
  invalidPublishedMath.operational.censusChange7d,
  null,
  "published comparisons with a non-seven-day interval must be rejected"
);

console.log("Weekly analysis checks passed.");
