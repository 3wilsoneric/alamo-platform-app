export interface LiveCommunityResidentRecord {
  res_number: string;
  first_name: string;
  last_name: string;
  age: number;
  admit_date: string | null;
  los_days: number;
  facility_id: string;
  facility_name: string;
  unit_number: string | null;
  care_level: string | null;
  payor: string | null;
  primary_diagnosis: string | null;
  physician: string | null;
  diet: string | null;
}

export interface LiveCommunityIncidentRecord {
  facility_id: string;
  category: string;
  incident_date: string | null;
  month_bucket: string;
  incident_count: number;
  period: string;
}

export interface LiveCommunityCensusRecord {
  facility_id: string;
  census: number;
  month_bucket: string;
}

export interface CommunityIncidentDetailRecord {
  id: string;
  facility_id: string;
  facility_name: string;
  resident_id: string;
  client_name: string;
  unit_number: string | null;
  incident_date: string | null;
  received_at: string | null;
  month_bucket: string;
  category: string;
  incident_type: string;
  location: string;
  injury_occurred: boolean;
  police_called: boolean;
  sentinel_event: boolean;
  previous_history: boolean;
  staff_name?: string | null;
  email_body: string | null;
  assistance_given: string | null;
  notifications?: Array<{ recipient: string; status: string }>;
  flags?: string[];
}

export interface LiveCommunitiesDashboardResponse {
  generated_at: string;
  as_of_date?: string;
  facilities: Array<{
    facility_id: string;
    community_name: string;
    community_code: string;
    city: string;
    state: string;
    total_residents: number;
  }>;
  residents: LiveCommunityResidentRecord[];
  incidents: LiveCommunityIncidentRecord[];
  incidentDetails?: CommunityIncidentDetailRecord[];
  census: LiveCommunityCensusRecord[];
}

export interface LiveIncidentRecord {
  id: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  stage: string;
  facility_id: string;
  facility_name: string;
  resident_id?: string;
  client_name: string;
  unit_number?: string | null;
  age?: number | null;
  care_level?: string | null;
  primary_diagnosis?: string | null;
  physician?: string | null;
  staff_name?: string | null;
  sender?: string | null;
  incident_type: string;
  location?: string;
  incident_date?: string | null;
  triage_score?: string | number;
  injury_occurred?: boolean;
  police_called?: boolean;
  email_body?: string | null;
  assistance_given?: string | null;
  notifications?: Array<{ recipient: string; status: string }>;
  flags?: string[];
  received_at: string;
}

export interface IncidentFeedResponse {
  incidents: LiveIncidentRecord[];
  source?: string;
  warning?: string | null;
}

export interface ReportsSummaryResponse {
  census: Array<{
    facility_id: string;
    census: number;
    month_bucket: string;
  }>;
  medicationCompliance: Array<{
    facility_id: string;
    facility_name: string;
    month_bucket: string;
    total_scheduled: number;
    given: number;
    not_given: number;
    compliance_pct: number;
  }>;
  refusalByMedication: Array<{
    facility_id: string;
    medication: string;
    total_scheduled: number;
    refusals: number;
    refusal_pct: number;
  }>;
  documentationGaps: Array<{
    resident_id: string;
    resident_name: string;
    facility_id: string;
    facility_name: string;
    last_note_date: string | null;
    days_since_last_note: number;
  }>;
}

export interface AdmissionsFlowTotals {
  admissions: number;
  discharges: number;
  net: number;
}

export interface AdmissionsFlowPoint extends AdmissionsFlowTotals {
  period: string;
  partial?: boolean;
}

export interface AdmissionsCommunityRow {
  facilityId: string;
  communityName: string;
  shortName: string;
  census: number | null;
  censusChange: number | null;
  operatingLimit: number | null;
  occupancyPct: number | null;
  monthToDate: AdmissionsFlowTotals;
  lastMonth: AdmissionsFlowTotals;
  recentWeeks: AdmissionsFlowTotals;
  referrals: AdmissionsCommunityReferrals | null;
}

export interface AdmissionsCommunityReferrals {
  onBoard: number;
  inDecision: number;
  needsAttention: number;
}

export interface AdmissionsReferralMonth {
  month: string;
  received: number;
  accepted: number;
  declined: number;
  admitted: number;
}

export type AdmissionsBoardColumnKey = "received" | "in_progress" | "decision";

export interface AdmissionsManagementProfile {
  dateOfBirth: string | null;
  referralSource: string | null;
  referringCounty: string | null;
  payer: string | null;
  responsiblePerson: string | null;
  conservedStatus: string | null;
  documentStatus: string | null;
  assessmentStatus: string | null;
  assessmentSigned: boolean;
  assessmentDate: string | null;
  openRequirements: number;
  blockingRequirements: number;
  overview: string[];
  supportSnapshot: Array<{ label: string; value: string }>;
  medications: string[];
  medicationSource: "signed_assessment" | "referral" | null;
}

export interface AdmissionsBoardCard {
  referralId: number;
  clientName: string;
  column: AdmissionsBoardColumnKey;
  status: string;
  nextAction: string;
  community: string;
  facilityId: string | null;
  owner: string;
  priority: string;
  daysOpen: number | null;
  daysSinceUpdate: number;
  plannedAdmissionDate: string | null;
  flags: { stale: boolean; unassigned: boolean; moveInOverdue: boolean };
  managementProfile: AdmissionsManagementProfile;
  pipelineUrl: string;
}

export interface AdmissionsPipelineBriefingReferral {
  referralId: number;
  clientName: string;
  receivedAt: string;
  sourceName: string | null;
  sourceCategory: string | null;
  referringCounty: string | null;
  community: string;
  facilityId: string | null;
  owner: string;
  status: string;
  pipelineUrl: string;
}

export interface AdmissionsPipelineBriefingAssessment {
  referralId: number;
  clientName: string;
  scheduledAt: string;
  community: string;
  facilityId: string | null;
  owner: string;
  status: string;
  pipelineUrl: string;
}

export interface AdmissionsPipelineBriefingMoveIn {
  referralId: number;
  clientName: string;
  plannedAt: string;
  community: string;
  facilityId: string | null;
  owner: string;
  status: string;
  readiness: "ready" | "watch" | "blocked" | "unknown";
  pipelineUrl: string;
}

export type AdmissionsPipelineBriefing =
  | { status: "not_supported" }
  | {
      status: "ready";
      timezone: "America/Los_Angeles";
      windowEnd: string;
      coverage: {
        recentReferrals: boolean;
        assessments: boolean;
        moveIns: boolean;
        weeklyTrend: boolean;
      };
      recentReferrals: AdmissionsPipelineBriefingReferral[];
      upcomingAssessments: AdmissionsPipelineBriefingAssessment[];
      plannedMoveIns: AdmissionsPipelineBriefingMoveIn[];
      weeklyTrend: Array<{ weekStart: string; received: number; accepted: number }>;
    };

export type AdmissionsReferralPipeline =
  | { status: "not_connected" | "unavailable" }
  | {
      status: "connected";
      generatedAt: string;
      board: {
        total: number;
        truncated: boolean;
        columns: Array<{ key: AdmissionsBoardColumnKey; label: string; count: number; statuses: Array<{ status: string; count: number }> }>;
        cards: AdmissionsBoardCard[];
      };
      metrics: { onBoard: number; activeReferrals: number; stale: number; unassigned: number; awaitingAdmission: number };
      upcomingAdmissions: { next7Days: number; next30Days: number; pastPlannedDate: number; noPlannedDate: number };
      briefing: AdmissionsPipelineBriefing;
      history: {
        coverageStartMonth: string | null;
        monthOutcomes: AdmissionsReferralMonth;
        monthly: AdmissionsReferralMonth[];
        decisionTiming: { windowDays: number; medianDaysToDecision: number | null; decisionsCounted: number };
      };
    };

export interface AdmissionsBriefingCommunityRow {
  facilityId: string;
  communityName: string;
  shortName: string;
  census: number | null;
  operatingLimit: number | null;
  occupancyPct: number | null;
  newReferrals7d: number | null;
  newReferrals14d: number | null;
  assessmentsThisWeek: number | null;
  plannedMoveInsThisWeek: number | null;
  completedMoveInsThisWeek: number | null;
}

export interface AdmissionsBriefingOriginRow {
  key: string;
  sourceName: string;
  sourceCategory: string | null;
  referringCounty: string | null;
  last7Days: number;
  previous7Days: number;
  total14Days: number;
  communities: string[];
}

export interface AdmissionsCountyOutreachCommunity {
  facilityId: string;
  communityName: string;
  shortName: string;
  source: "verified_client_database" | "admission_record" | null;
  sourceAsOfDate: string | null;
  status: "ready" | "source_not_published" | "reconciliation_failed";
  census: number | null;
  knownCountyResidents: number | null;
  countyNotRecorded: number | null;
  coveragePct: number | null;
  counties: Array<{
    county: string;
    residents: number;
    sharePct: number;
  }>;
}

export interface AdmissionsWeeklyBriefing {
  sourceStatus: "ready" | "source_upgrade_required" | "not_connected" | "unavailable";
  asOfDate: string;
  pipelineAsOfDate: string | null;
  weekStart: string;
  weekEnd: string;
  coverage: {
    recentReferrals: boolean;
    assessments: boolean;
    moveIns: boolean;
    weeklyTrend: boolean;
    completedMoveIns: boolean;
  };
  totals: {
    census: number | null;
    newReferrals7d: number | null;
    newReferrals14d: number | null;
    assessmentsThisWeek: number | null;
    plannedMoveInsThisWeek: number | null;
    completedMoveInsThisWeek: number | null;
  };
  communities: AdmissionsBriefingCommunityRow[];
  countyOutreach: {
    asOfDate: string;
    source: "verified_client_database" | "admission_record" | "mixed" | null;
    sourceAsOfDate: string | null;
    communities: AdmissionsCountyOutreachCommunity[];
  };
  origins: AdmissionsBriefingOriginRow[];
  recentReferrals: AdmissionsPipelineBriefingReferral[];
  upcomingAssessments: AdmissionsPipelineBriefingAssessment[];
  plannedMoveIns: AdmissionsPipelineBriefingMoveIn[];
  trend: Array<{ weekStart: string; received: number; accepted: number; completedMoveIns: number | null }>;
}

export interface AdmissionsDashboardResponse {
  generated_at: string;
  as_of_date: string;
  month: string;
  prior_month: string;
  portfolio: {
    census: number | null;
    censusChange: number | null;
    operatingLimit: number | null;
    occupancyPct: number | null;
    monthToDate: AdmissionsFlowTotals;
    lastMonth: AdmissionsFlowTotals;
    recentWeeks: AdmissionsFlowTotals;
  };
  weekly: AdmissionsFlowPoint[];
  monthly: AdmissionsFlowPoint[];
  communities: AdmissionsCommunityRow[];
  referral_trend: Array<{ month: string; received: number; accepted: number; censusAdmissions: number }>;
  referral_pipeline: AdmissionsReferralPipeline;
  briefing: AdmissionsWeeklyBriefing;
  snapshot_status?: { warning: string | null; stale: boolean } | null;
}

export interface PlatformHealthResponse {
  ok: boolean;
  backend: string;
  catalog: string;
  schema: string;
  warehouseTime: string | null;
  currentCatalog: string | null;
  currentSchema: string | null;
  snapshotDiagnostics?: {
    sizeBytes: number;
    sizeMegabytes: number;
    maxSizeBytes: number;
    maxSizeMegabytes: number;
    oversized: boolean;
    snapshotVersion: string | null;
    snapshotSource: string;
    snapshotRoot: string;
    snapshotContainer: string | null;
    snapshotLatestPath: string;
    incidentDetailRows: number;
    toolContextVersion: number | null;
    toolContextManifestRows: number;
    toolContextTableCount: number;
    toolContextTableNames: string[];
    marMonthlyRows: number;
    marResidentRows: number;
    marExceptionRows: number;
    marReady: boolean;
    incidentMonthlyRows: number;
    medicationComplianceRows: number;
    historicalAggregateReady: boolean;
    censusWeeklyRows: number;
    censusQualityRows: number;
    residentCountabilityRows: number;
    residentFlowMonthlyRows: number;
    latestCensusMonth: string | null;
    censusWeeklyMinWeek: string | null;
    censusWeeklyMaxWeek: string | null;
    residentFlowMonthlyMaxMonth: string | null;
    censusTrustReady: boolean;
    ageHours: number | null;
    maxAgeHours: number;
    stale: boolean;
    generatedAt: string | null;
  } | null;
  analystQa?: AnalystQaStatus;
  qaArtifacts?: Array<{
    key: string;
    label: string;
    available: boolean;
    status: "pass" | "fail" | "warning" | "missing" | "skipped" | "unknown";
    generatedAt: string | null;
    detail: string;
    passed: boolean;
    total: number | null;
    passedCount: number | null;
    failedCount: number | null;
    warningCount: number | null;
    artifactPath: string;
  }>;
  analystDataQa?: {
    status: "pass" | "warning" | "fail";
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    generatedAt: string | null;
    checks: Array<{
      check_id: string;
      domain: string;
      severity: string;
      status: string;
      expected: string;
      actual: string;
      detail: string;
    }>;
  };
}

export interface AnalystTraceTelemetryResponse {
  version: "analyst-trace-telemetry-v1";
  generatedAt: string;
  retention: {
    maxRecords: number;
    currentRecords: number;
  };
  summary: {
    totalTurns: number;
    issueTurns: number;
    schemaIssues: number;
    validationIssues: number;
    recoveryTurns: number;
    staleTurns: number;
    notLoadedTurns: number;
    planRejectedTurns: number;
    certifiedTurns: number;
    uncertifiedTurns: number;
    cacheHits: number;
    moduleTurns: number;
    slowTurns: number;
    previewedTurns: number;
    qualityScoredTurns: number;
    averageQualityScore: number;
    lowQualityTurns: number;
    toolsObserved: number;
  };
  tools: Array<{
    tool: string;
    count: number;
    validationIssues: number;
    schemaIssues: number;
    certifiedTurns: number;
    uncertifiedTurns: number;
    cacheHits: number;
    slowTurns: number;
    previewedTurns: number;
    lastSeenAt: string | null;
  }>;
  families: Array<{
    family: string;
    count: number;
    recoveryTurns: number;
    staleTurns: number;
    notLoadedTurns: number;
    planRejectedTurns: number;
    validationIssues: number;
    schemaIssues: number;
    slowTurns: number;
    previewedTurns: number;
  }>;
  decisionFamilies: Array<{
    family: string;
    count: number;
    avgQualityScore: number;
    reviewTurns: number;
    moduleTurns: number;
    recoveryTurns: number;
    artifactTurns: number;
  }>;
  qualityFlags: Array<{
    flag: string;
    count: number;
  }>;
  moduleCoverage: {
    version: "platform-module-coverage-v1";
    totalModules: number;
    surfaceModules: number;
    analysisModules: number;
    observedModuleIds: number;
    observedAnalysisTools: number;
    analysisModulesWithObservedTool: number;
    analysisModulesWithObservedModule: number;
    uncoveredAnalysisModules: Array<{
      id: string;
      title: string;
      tool: string;
      family: string;
      visualType: string | null;
    }>;
    families: Array<{
      family: string;
      total: number;
      surfaces: number;
      analyses: number;
      observedModules: number;
      observedTools: number;
    }>;
  };
  recentIssues: AnalystTraceRecord[];
  recent: AnalystTraceRecord[];
}

export interface AnalystTraceRecord {
  version: string;
  turnId: string;
  stage: string | null;
  promptHash: string | null;
  promptLength: number | null;
  requestedTool: string | null;
  selectedTool: string | null;
  expectedTool: string | null;
  answerFamily: string | null;
  truthState: string | null;
  rowCount: number | string | null;
  plan: {
    tool: string | null;
    canonicalPromptHash: string | null;
    canonicalPromptLength: number | null;
    capability: {
      temporalScope: string | null;
      supportsExplicitPeriods: boolean | null;
      historicalAlternative: string | null;
    } | null;
    decision: {
      family: string | null;
      answerShape: string | null;
      confidence: string | null;
      moduleFamilies: string[];
      riskFlags: string[];
      exactRows: boolean;
      expectsArtifact: boolean;
      expectsModule: boolean;
      shouldComposeSupportingModules: boolean;
    } | null;
    expected: {
      metric: string | null;
      metricGrain: string | null;
      category: string | null;
      mode: string | null;
      periods: string[];
      periodCount: number;
      grouping: string | null;
      fields: string[];
      fieldCount: number;
      export: boolean;
      facilityId: string | null;
      communityName: string | null;
      hasCommunityScope: boolean;
      hasResidentScope: boolean;
      presentation: string | null;
    };
  } | null;
  performance: {
    executionMs: number | null;
    slow: boolean;
  };
  volume: {
    visualRows: number | null;
    originalRows: number | null;
    artifactRows: number | null;
    previewed: boolean;
  } | null;
  cache: {
    used: boolean;
    eligible: boolean | null;
    reason: string | null;
  } | null;
  outcome: {
    safeRefusal: boolean;
    contractViolation: boolean;
    recovery: boolean;
    degraded: boolean;
  } | null;
  validation: {
    valid: boolean | null;
    errors: string[];
  } | null;
  schema: {
    valid: boolean | null;
    errorCount: number;
    warningCount: number;
  } | null;
  quality: {
    version: string | null;
    score: number;
    grade: string | null;
    flags: string[];
    dimensions: Record<string, string | null>;
  } | null;
  module: {
    id: string | null;
    templateId: string | null;
    family: string | null;
    scope: string | null;
    count: number | null;
    ids: string[];
    reasonCodes?: string[];
  } | null;
  observedAt: string;
  updatedAt: string;
}

export interface AnalystQaStatus {
  available: boolean;
  status: "pass" | "warning" | "fail" | "missing" | "unknown";
  generatedAt: string | null;
  businessDate: string | null;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    certifiedCoverage: number;
    cachedHits: number;
  } | null;
  history: Array<{
    generatedAt: string;
    businessDate: string | null;
    status: string;
    total: number;
    passed: number;
    failed: number;
  }>;
  failures: Array<{
    id: string;
    prompt: string;
    expectedTool?: string | null;
    failures: string[];
    failureDetails?: Array<{
      stage: "compiler" | "tool_execution" | "plan_validation" | "formatting";
      reason: string;
    }>;
    expected?: {
      periods?: string[];
      category?: string | null;
      communityName?: string | null;
      facilityId?: string | null;
    } | null;
    actual?: {
      tool?: string | null;
      period?: string | null;
      community?: string | null;
      category?: string | null;
      rowCount?: number;
      valid?: boolean | null;
      validationErrors?: string[];
    } | null;
  }>;
  warning: string | null;
}

export interface SnapshotStatus {
  warning: string | null;
  generated_at: string | null;
  ageHours: number | null;
  maxAgeHours: number;
  stale: boolean;
}

export interface HomeDashboardResponse {
  generated_at: string;
  snapshot_status?: SnapshotStatus;
  reporting_month: string | null;
  portfolio: {
    communityCount: number;
    residentCount: number;
    currentIncidents: number;
    averageAge: number;
    averageLengthOfStay: number;
  };
  operational: {
    asOf: string;
    latestCensusWeek: string | null;
    currentWeeklyCensus: number | null;
    priorWeeklyCensus: number | null;
    censusChange7d: number | null;
    censusCadence: "weekly" | "monthly" | null;
    currentCensusPeriod: string | null;
    priorCensusPeriod: string | null;
    currentCensus: number | null;
    priorCensus: number | null;
    censusChange: number | null;
  };
  incidentTrend: Array<{
    month_bucket: string;
    incidentCount: number;
  }>;
  communities: Array<{
    facility_id: string;
    community_name: string;
    community_code: string;
    city: string;
    state: string;
    total_residents: number;
    currentIncidents: number;
    currentWeeklyCensus: number | null;
    priorWeeklyCensus: number | null;
    censusChange7d: number | null;
    latestCensusWeek: string | null;
    censusCadence: "weekly" | "monthly" | null;
    currentCensusPeriod: string | null;
    priorCensusPeriod: string | null;
    currentCensus: number | null;
    priorCensus: number | null;
    censusChange: number | null;
    averageAge: number;
    averageLengthOfStay: number;
    residentSharePct: number;
  }>;
  reporting: {
    latestMonth: string | null;
    averageCompliance: number;
    documentationGapCount: number;
    refusalSignalCount: number;
  };
  watch: {
    largestCommunityName: string | null;
    largestCommunityResidents: number;
  };
}

export interface CommunitySnapshotResponse {
  generated_at: string;
  snapshot_status?: SnapshotStatus;
  facility: {
    facility_id: string;
    community_name: string;
    community_code: string;
    city: string;
    state: string;
    total_residents: number;
  };
  reporting_month: string | null;
  summary: {
    residents: number;
    currentIncidents: number;
    priorIncidents: number;
    averageAge: number;
    averageLengthOfStay: number;
  };
  incidentTrend: Array<{
    month_bucket: string;
    incidentCount: number;
  }>;
  census: LiveCommunityCensusRecord[];
  topIncidentCategories: Array<{
    label: string;
    count: number;
  }>;
  incidentDetails: CommunityIncidentDetailRecord[];
  diagnosisMix: Array<{
    label: string;
    count: number;
  }>;
  longestStayResidents: Array<{
    res_number: string;
    first_name: string;
    last_name: string;
    unit_number: string | null;
    admit_date: string | null;
    los_days: number | null;
  }>;
}

export interface PlatformBootstrapResponse {
  generated_at: string;
  snapshot: {
    version: string;
    generated_at: string;
    freshness_checked_at: string;
    as_of_date?: string;
    source?: string;
    stale?: boolean;
    ageHours?: number | null;
    maxAgeHours?: number;
    warning?: string | null;
  };
  health: PlatformHealthResponse;
  communities: LiveCommunitiesDashboardResponse;
  incidents: {
    incidents: LiveIncidentRecord[];
  };
  reportsSummary: ReportsSummaryResponse;
  homeDashboard: HomeDashboardResponse;
}

export type DataExplorerKind = "incidents" | "census" | "residents";

export interface DataExplorerColumn {
  key: string;
  label: string;
  numeric?: boolean;
}

export interface ClientDatabaseMetadata {
  available: true;
  dataset: string;
  version: string | number | null;
  baseline_date: string | null;
  generated_at: string;
  client_count: number;
  field_count: number;
  columns: string[];
  matched_current_profiles: number;
  unmatched_current_profiles: number;
  unmatched_episode_rows: number;
}

export interface DataExplorerRow extends Record<string, unknown> {
  id: string;
  facility_id: string;
  community_name: string;
  client_profile?: Record<string, unknown> | null;
  resident_profile?: Record<string, unknown> | null;
  resident_profiles?: Array<Record<string, unknown>>;
  resident_episode_history?: Array<Record<string, unknown>>;
}

export interface DataExplorerResponse {
  kind: DataExplorerKind;
  title: string;
  description: string;
  generated_at: string;
  snapshot_status?: SnapshotStatus;
  row_count: number;
  columns: DataExplorerColumn[];
  filters: {
    communities: string[];
    months: string[];
    categories: string[];
  };
  client_database?: ClientDatabaseMetadata;
  rows: DataExplorerRow[];
}

export interface WorkforceTotals {
  active: number;
  onboarding: number;
  onLeave: number;
  openRoles: number;
  applicants: number;
  phase1: number;
  phase2: number;
  phase3: number;
  expired: number;
  expiring: number;
  missing: number;
  staffBlockedFromScheduling: number;
  complianceRate: number;
}

export interface WorkforceOpenPosition {
  title: string;
  discipline: string;
  url: string | null;
  community: string;
  roleLabel: string;
  openedOn: string;
  openings: number;
  daysOpen: number;
  phase1: number;
  phase2: number;
  phase3: number;
}

export interface WorkforceExpirationGroup {
  community: string;
  label: string;
  expiresOn: string;
  people: number;
  blocksScheduling: boolean;
}

export type WorkforceSummary =
  | { status: "not_connected" | "unavailable" }
  | {
      status: "connected";
      workforceUrl: string | null;
      asOf: string;
      generatedAt: string;
      phaseNames: [string, string, string];
      portfolio: WorkforceTotals;
      communities: Array<{ community: string; totals: WorkforceTotals }>;
      roles: Array<{ discipline: string; label: string; totals: WorkforceTotals }>;
      openPositions: WorkforceOpenPosition[];
      upcomingExpirations: WorkforceExpirationGroup[];
    };

export interface WorkforceRolePosition {
  title: string;
  community: string;
  openings: number;
  phase1: number;
  phase2: number;
  phase3: number;
}

export interface WorkforceRoleHiring {
  discipline: string;
  label: string;
  openRoles: number;
  applicants: number;
  phase1: number;
  phase2: number;
  phase3: number;
  positions: WorkforceRolePosition[];
}

export type WorkforceRoleOverview =
  | { status: "not_connected" | "unavailable" }
  | {
      status: "connected";
      placeholderData: boolean;
      asOf: string;
      phaseNames: [string, string, string];
      roles: WorkforceRoleHiring[];
      rolesWithoutHiring: string[];
    };

export interface WorkforceRolesResponse {
  generated_at: string;
  workforce: WorkforceRoleOverview;
}

export interface WorkforceDashboardResponse {
  generated_at: string;
  workforce: WorkforceSummary;
}
