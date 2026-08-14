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
  staff_name: string | null;
  email_body: string | null;
  assistance_given: string | null;
  notifications: Array<{ recipient: string; status: string }>;
  flags: string[];
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
  rows: Array<Record<string, string | number | boolean | null>>;
}
