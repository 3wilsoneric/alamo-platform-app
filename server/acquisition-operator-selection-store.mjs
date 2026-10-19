import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAzureAcquisitionOperatorSelectionPersistence,
  shouldUseAzureAcquisitionStorage
} from "./acquisition-azure-storage.mjs";
import {
  acquisitionWebsiteDomain,
  normalizeAcquisitionOrganizationName
} from "../shared/acquisition-operator-resolution.mjs";

export const ACQUISITION_OPERATOR_SELECTION_STORE_VERSION = 1;

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultStoreRoot = path.resolve(
  process.env.ACQUISITION_INTELLIGENCE_ROOT || path.join(repositoryRoot, "generated/acquisition-intelligence")
);
const defaultStorePath = path.join(defaultStoreRoot, "research/operator-selections-v1.json");
const MAX_STORE_BYTES = 10_000_000;
const STATUSES = new Set(["selected", "hold", "excluded"]);
const COHORT_STATUSES = new Set(["frozen"]);
const RESEARCH_JOB_STATUSES = new Set(["pending", "in_progress", "completed", "blocked"]);
const RESEARCH_JOB_KINDS = new Set([
  "parent_legal_identity",
  "private_ownership",
  "adult_high_acuity_fit",
  "portfolio_location_inventory",
  "state_license_capacity",
  "valuation_inputs"
]);
const RESEARCH_RESULT_OUTCOMES = new Set(["evidence_found", "no_evidence_found", "needs_human_review"]);
const RESEARCH_RESULT_CONFIDENCE = new Set(["unverified", "low", "medium", "high"]);

function nowIso() {
  return new Date().toISOString();
}

function emptyState() {
  const timestamp = nowIso();
  return {
    version: ACQUISITION_OPERATOR_SELECTION_STORE_VERSION,
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    decisions: [],
    cohorts: [],
    jobs: []
  };
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredText(value, label, maximum = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new Error(`${label} is invalid.`);
  }
  return value.trim();
}

function optionalText(value, label, maximum = 2_000) {
  if (value == null || value === "") return "";
  if (typeof value !== "string" || value.length > maximum) throw new Error(`${label} is invalid.`);
  return value.trim();
}

function timestamp(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`${label} is invalid.`);
  return value;
}

function requiredInteger(value, label, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function nullableNumber(value, label) {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} is invalid.`);
  return value;
}

function requiredTextList(value, label, maximum = 200) {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} is invalid.`);
  return value.map((entry, index) => requiredText(entry, `${label}[${index}]`, 500));
}

function requiredTextRecord(value, label) {
  if (!isObject(value)) throw new Error(`${label} is invalid.`);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, requiredText(entry, `${label}.${key}`, 120)]));
}

function fallbackIdentityKeys(snapshot) {
  const domain = acquisitionWebsiteDomain(snapshot.rootDomain);
  const name = normalizeAcquisitionOrganizationName(snapshot.proposedName);
  return [...new Set([
    ...(domain ? [`domain:${domain}`] : []),
    ...(name ? [`name:${name}`] : [])
  ])];
}

function parseDecision(value, index) {
  if (!isObject(value) || !isObject(value.snapshot)) throw new Error(`decisions[${index}] is invalid.`);
  const status = requiredText(value.status, `decisions[${index}].status`, 20);
  if (!STATUSES.has(status)) throw new Error(`decisions[${index}].status is invalid.`);
  return {
    operatorId: requiredText(value.operatorId, `decisions[${index}].operatorId`, 120),
    status,
    notes: optionalText(value.notes, `decisions[${index}].notes`),
    snapshot: {
      proposedName: requiredText(value.snapshot.proposedName, `decisions[${index}].snapshot.proposedName`),
      rootDomain: optionalText(value.snapshot.rootDomain, `decisions[${index}].snapshot.rootDomain`, 500) || null,
      selectionBucket: requiredText(value.snapshot.selectionBucket, `decisions[${index}].snapshot.selectionBucket`, 80),
      maturityTier: requiredText(value.snapshot.maturityTier, `decisions[${index}].snapshot.maturityTier`, 80),
      identityKeys: Array.isArray(value.snapshot.identityKeys)
        ? value.snapshot.identityKeys.map((entry, keyIndex) => requiredText(entry, `decisions[${index}].snapshot.identityKeys[${keyIndex}]`, 500))
        : fallbackIdentityKeys(value.snapshot),
      targetRank: value.snapshot.targetRank === null
        ? null
        : Number.isInteger(value.snapshot.targetRank) && value.snapshot.targetRank > 0
          ? value.snapshot.targetRank
          : (() => { throw new Error(`decisions[${index}].snapshot.targetRank is invalid.`); })()
    },
    createdAt: timestamp(value.createdAt, `decisions[${index}].createdAt`),
    updatedAt: timestamp(value.updatedAt, `decisions[${index}].updatedAt`),
    updatedBy: requiredText(value.updatedBy, `decisions[${index}].updatedBy`)
  };
}

function parseCohortMember(value, index) {
  const label = `cohort.members[${index}]`;
  if (!isObject(value) || !isObject(value.screening) || !isObject(value.facilityCounts) ||
      !isObject(value.confidence) || !isObject(value.capacity)) throw new Error(`${label} is invalid.`);
  const stateCodes = requiredTextList(value.stateCodes, `${label}.stateCodes`, 60);
  if (stateCodes.includes("CA")) throw new Error(`${label}.stateCodes contains excluded California geography.`);
  return {
    operatorId: requiredText(value.operatorId, `${label}.operatorId`, 120),
    proposedName: requiredText(value.proposedName, `${label}.proposedName`),
    rootDomain: optionalText(value.rootDomain, `${label}.rootDomain`, 500) || null,
    identityKeys: requiredTextList(value.identityKeys, `${label}.identityKeys`, 100),
    parentCompanyId: optionalText(value.parentCompanyId, `${label}.parentCompanyId`, 120) || null,
    canonicalLegalName: optionalText(value.canonicalLegalName, `${label}.canonicalLegalName`, 500) || null,
    sponsorName: optionalText(value.sponsorName, `${label}.sponsorName`, 500) || null,
    acquisitionEligibility: requiredText(value.acquisitionEligibility, `${label}.acquisitionEligibility`, 80),
    targetRank: value.targetRank === null ? null : requiredInteger(value.targetRank, `${label}.targetRank`, { minimum: 1 }),
    funnelStage: requiredText(value.funnelStage, `${label}.funnelStage`, 80),
    screening: {
      maturityTier: requiredText(value.screening.maturityTier, `${label}.screening.maturityTier`, 80),
      maturityScore: requiredInteger(value.screening.maturityScore, `${label}.screening.maturityScore`, { maximum: 100 }),
      selectionBucket: requiredText(value.screening.selectionBucket, `${label}.screening.selectionBucket`, 80),
      privateLikelihood: requiredText(value.screening.privateLikelihood, `${label}.screening.privateLikelihood`, 80),
      fitCategory: requiredText(value.screening.fitCategory, `${label}.screening.fitCategory`, 80),
      screeningScore: requiredInteger(value.screening.screeningScore, `${label}.screening.screeningScore`, { maximum: 100 })
    },
    facilityCounts: Object.fromEntries(Object.entries(value.facilityCounts).map(([key, entry]) => [
      key,
      requiredInteger(entry, `${label}.facilityCounts.${key}`)
    ])),
    stateCodes,
    confidence: requiredTextRecord(value.confidence, `${label}.confidence`),
    capacity: {
      verifiedCoreBeds: nullableNumber(value.capacity.verifiedCoreBeds, `${label}.capacity.verifiedCoreBeds`),
      reportedBeds: nullableNumber(value.capacity.reportedBeds, `${label}.capacity.reportedBeds`),
      valuedBeds: nullableNumber(value.capacity.valuedBeds, `${label}.capacity.valuedBeds`),
      baseEnterpriseValueMillions: nullableNumber(value.capacity.baseEnterpriseValueMillions, `${label}.capacity.baseEnterpriseValueMillions`)
    },
    evidenceIds: requiredTextList(value.evidenceIds, `${label}.evidenceIds`, 500),
    researchGaps: requiredTextList(value.researchGaps, `${label}.researchGaps`, 50),
    decisionUpdatedAt: timestamp(value.decisionUpdatedAt, `${label}.decisionUpdatedAt`)
  };
}

function parseResearchJob(value, index) {
  const label = `jobs[${index}]`;
  if (!isObject(value)) throw new Error(`${label} is invalid.`);
  const kind = requiredText(value.kind, `${label}.kind`, 80);
  const status = requiredText(value.status, `${label}.status`, 30);
  if (!RESEARCH_JOB_KINDS.has(kind)) throw new Error(`${label}.kind is invalid.`);
  if (!RESEARCH_JOB_STATUSES.has(status)) throw new Error(`${label}.status is invalid.`);
  const stateCode = optionalText(value.stateCode, `${label}.stateCode`, 2) || null;
  if (stateCode && (!/^[A-Z]{2}$/.test(stateCode) || stateCode === "CA")) throw new Error(`${label}.stateCode is invalid.`);
  const claim = value.claim == null ? null : (() => {
    if (!isObject(value.claim)) throw new Error(`${label}.claim is invalid.`);
    return {
      workerId: requiredText(value.claim.workerId, `${label}.claim.workerId`, 200),
      leaseTokenHash: requiredText(value.claim.leaseTokenHash, `${label}.claim.leaseTokenHash`, 128),
      leasedAt: timestamp(value.claim.leasedAt, `${label}.claim.leasedAt`),
      leaseExpiresAt: timestamp(value.claim.leaseExpiresAt, `${label}.claim.leaseExpiresAt`)
    };
  })();
  const result = value.result == null ? null : parseResearchJobResult(value.result, `${label}.result`);
  return {
    id: requiredText(value.id, `${label}.id`, 120),
    cohortId: requiredText(value.cohortId, `${label}.cohortId`, 120),
    operatorId: requiredText(value.operatorId, `${label}.operatorId`, 120),
    companyName: requiredText(value.companyName, `${label}.companyName`),
    kind,
    phase: requiredInteger(value.phase, `${label}.phase`, { minimum: 1, maximum: 3 }),
    priority: requiredInteger(value.priority, `${label}.priority`, { minimum: 1, maximum: 3 }),
    stateCode,
    status,
    reason: requiredText(value.reason, `${label}.reason`, 1_000),
    requiredEvidence: requiredTextList(value.requiredEvidence, `${label}.requiredEvidence`, 20),
    dependsOnJobIds: requiredTextList(value.dependsOnJobIds, `${label}.dependsOnJobIds`, 100),
    attemptCount: requiredInteger(value.attemptCount ?? 0, `${label}.attemptCount`, { maximum: 100 }),
    claim,
    result,
    notes: optionalText(value.notes, `${label}.notes`, 2_000),
    createdAt: timestamp(value.createdAt, `${label}.createdAt`),
    updatedAt: timestamp(value.updatedAt, `${label}.updatedAt`)
  };
}

function parseResearchJobResult(value, label) {
  if (!isObject(value) || !Array.isArray(value.sources) || !Array.isArray(value.assertions) ||
      !Array.isArray(value.contradictions)) throw new Error(`${label} is invalid.`);
  const outcome = requiredText(value.outcome, `${label}.outcome`, 40);
  if (!RESEARCH_RESULT_OUTCOMES.has(outcome)) throw new Error(`${label}.outcome is invalid.`);
  if (value.sources.length > 25 || value.assertions.length > 50 || value.contradictions.length > 25) {
    throw new Error(`${label} exceeds its bounded result size.`);
  }
  if (value.sources.length === 0) throw new Error(`${label} must cite at least one source.`);
  if (outcome === "evidence_found" && value.assertions.length === 0) {
    throw new Error(`${label} must include at least one evidence-backed assertion.`);
  }
  const sources = value.sources.map((source, index) => {
    const sourceLabel = `${label}.sources[${index}]`;
    if (!isObject(source)) throw new Error(`${sourceLabel} is invalid.`);
    const url = requiredText(source.url, `${sourceLabel}.url`, 2_000);
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`${sourceLabel}.url is invalid.`);
    }
    if (parsedUrl.protocol !== "https:") throw new Error(`${sourceLabel}.url must use HTTPS.`);
    return {
      id: requiredText(source.id, `${sourceLabel}.id`, 120),
      title: requiredText(source.title, `${sourceLabel}.title`, 500),
      url,
      sourceType: requiredText(source.sourceType, `${sourceLabel}.sourceType`, 80),
      observedAt: timestamp(source.observedAt, `${sourceLabel}.observedAt`),
      supports: requiredTextList(source.supports, `${sourceLabel}.supports`, 30)
    };
  });
  if (new Set(sources.map(({ id }) => id)).size !== sources.length) throw new Error(`${label}.sources contains duplicate ids.`);
  const sourceIds = new Set(sources.map(({ id }) => id));
  const assertions = value.assertions.map((assertion, index) => {
    const assertionLabel = `${label}.assertions[${index}]`;
    if (!isObject(assertion)) throw new Error(`${assertionLabel} is invalid.`);
    const confidence = requiredText(assertion.confidence, `${assertionLabel}.confidence`, 20);
    if (!RESEARCH_RESULT_CONFIDENCE.has(confidence)) throw new Error(`${assertionLabel}.confidence is invalid.`);
    const assertionSourceIds = requiredTextList(assertion.sourceIds, `${assertionLabel}.sourceIds`, 25);
    if (assertionSourceIds.length === 0) throw new Error(`${assertionLabel} must cite at least one source.`);
    if (assertionSourceIds.some((sourceId) => !sourceIds.has(sourceId))) throw new Error(`${assertionLabel} cites an unknown source.`);
    const assertionValue = assertion.value;
    if (!["string", "number", "boolean"].includes(typeof assertionValue) && assertionValue !== null) {
      throw new Error(`${assertionLabel}.value is invalid.`);
    }
    return {
      field: requiredText(assertion.field, `${assertionLabel}.field`, 120),
      value: assertionValue,
      confidence,
      sourceIds: assertionSourceIds,
      note: optionalText(assertion.note, `${assertionLabel}.note`, 1_000)
    };
  });
  const contradictions = value.contradictions.map((contradiction, index) => {
    const contradictionLabel = `${label}.contradictions[${index}]`;
    if (!isObject(contradiction)) throw new Error(`${contradictionLabel} is invalid.`);
    const contradictionSourceIds = requiredTextList(contradiction.sourceIds, `${contradictionLabel}.sourceIds`, 25);
    if (contradictionSourceIds.some((sourceId) => !sourceIds.has(sourceId))) throw new Error(`${contradictionLabel} cites an unknown source.`);
    return {
      description: requiredText(contradiction.description, `${contradictionLabel}.description`, 2_000),
      sourceIds: contradictionSourceIds
    };
  });
  return {
    outcome,
    summary: requiredText(value.summary, `${label}.summary`, 4_000),
    sources,
    assertions,
    contradictions,
    submittedAt: timestamp(value.submittedAt, `${label}.submittedAt`),
    submittedBy: requiredText(value.submittedBy, `${label}.submittedBy`, 500),
    promotionStatus: "proposal_pending_deterministic_validation"
  };
}

function parseCohort(value, index) {
  const label = `cohorts[${index}]`;
  if (!isObject(value) || !Array.isArray(value.members)) throw new Error(`${label} is invalid.`);
  const status = requiredText(value.status, `${label}.status`, 20);
  if (!COHORT_STATUSES.has(status)) throw new Error(`${label}.status is invalid.`);
  const members = value.members.map(parseCohortMember);
  if (members.length < 50 || members.length > 100) throw new Error(`${label}.members must contain 50 through 100 companies.`);
  if (new Set(members.map(({ operatorId }) => operatorId)).size !== members.length) throw new Error(`${label}.members contains duplicate companies.`);
  if (value.memberCount !== members.length) throw new Error(`${label}.memberCount does not match its members.`);
  return {
    id: requiredText(value.id, `${label}.id`, 120),
    idempotencyKey: requiredText(value.idempotencyKey, `${label}.idempotencyKey`, 120),
    name: requiredText(value.name, `${label}.name`, 120),
    status,
    sourceSelectionRevision: requiredInteger(value.sourceSelectionRevision, `${label}.sourceSelectionRevision`),
    sourceIndexVersion: requiredInteger(value.sourceIndexVersion, `${label}.sourceIndexVersion`, { minimum: 1 }),
    sourceIndexGeneratedAt: timestamp(value.sourceIndexGeneratedAt, `${label}.sourceIndexGeneratedAt`),
    memberCount: requiredInteger(value.memberCount, `${label}.memberCount`, { minimum: 50, maximum: 100 }),
    members,
    createdAt: timestamp(value.createdAt, `${label}.createdAt`),
    createdBy: requiredText(value.createdBy, `${label}.createdBy`)
  };
}

function parseState(value) {
  if (!isObject(value) || value.version !== ACQUISITION_OPERATOR_SELECTION_STORE_VERSION ||
      !Array.isArray(value.decisions)) {
    throw new Error("Acquisition operator selection store is invalid.");
  }
  const decisions = value.decisions.map(parseDecision);
  const cohorts = Array.isArray(value.cohorts) ? value.cohorts.map(parseCohort) : [];
  const jobs = Array.isArray(value.jobs) ? value.jobs.map(parseResearchJob) : [];
  if (new Set(decisions.map(({ operatorId }) => operatorId)).size !== decisions.length) {
    throw new Error("Acquisition operator selection store contains duplicate operators.");
  }
  if (new Set(jobs.map(({ id }) => id)).size !== jobs.length) throw new Error("Acquisition operator selection store contains duplicate research jobs.");
  const cohortMembers = new Map(cohorts.map((cohort) => [cohort.id, new Set(cohort.members.map(({ operatorId }) => operatorId))]));
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  for (const job of jobs) {
    if (!cohortMembers.get(job.cohortId)?.has(job.operatorId)) throw new Error(`Research job ${job.id} is outside its frozen cohort.`);
    for (const dependencyId of job.dependsOnJobIds) {
      const dependency = jobsById.get(dependencyId);
      if (!dependency) throw new Error(`Research job ${job.id} has a missing dependency.`);
      if (dependency.id === job.id || dependency.cohortId !== job.cohortId || dependency.operatorId !== job.operatorId) {
        throw new Error(`Research job ${job.id} has a dependency outside its company cohort.`);
      }
    }
  }
  return {
    version: ACQUISITION_OPERATOR_SELECTION_STORE_VERSION,
    revision: Number.isInteger(value.revision) && value.revision >= 0 ? value.revision : 0,
    createdAt: timestamp(value.createdAt, "store.createdAt"),
    updatedAt: timestamp(value.updatedAt, "store.updatedAt"),
    decisions,
    cohorts,
    jobs
  };
}

async function readLocalState(storePath) {
  try {
    const raw = await readFile(storePath, "utf8");
    if (Buffer.byteLength(raw, "utf8") > MAX_STORE_BYTES) throw new Error("Acquisition operator selection store exceeds its size limit.");
    return parseState(JSON.parse(raw));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return emptyState();
    throw error;
  }
}

async function writeLocalState(storePath, state) {
  const parent = path.dirname(storePath);
  await mkdir(parent, { recursive: true });
  const temporaryPath = path.join(parent, `.operator-selections-${randomUUID()}.tmp`);
  const serialized = `${JSON.stringify(state, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_STORE_BYTES) throw new Error("Acquisition operator selection store exceeds its size limit.");
  await writeFile(temporaryPath, serialized, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, storePath);
  const revisionDirectory = path.join(parent, "operator-selection-revisions");
  await mkdir(revisionDirectory, { recursive: true });
  const revisionPath = path.join(revisionDirectory, `${String(state.revision).padStart(8, "0")}.json`);
  try {
    await writeFile(revisionPath, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "EEXIST")) throw error;
  }
}

function cohortMemberSnapshot(operator) {
  const decision = operator.screeningDecision;
  return {
    operatorId: operator.id,
    proposedName: operator.proposedName,
    rootDomain: operator.rootDomain,
    identityKeys: operator.identityKeys,
    parentCompanyId: operator.parentIdentity?.id ?? operator.resolution?.parentCompanyId ?? null,
    canonicalLegalName: operator.parentIdentity?.canonicalLegalName ?? null,
    sponsorName: operator.parentIdentity?.sponsorName ?? null,
    acquisitionEligibility: operator.acquisitionEligibility,
    targetRank: operator.targetRank,
    funnelStage: operator.funnelStage,
    screening: {
      maturityTier: operator.screeningProfile.maturityTier,
      maturityScore: operator.screeningProfile.maturityScore,
      selectionBucket: operator.screeningProfile.selectionBucket,
      privateLikelihood: operator.screeningProfile.privateLikelihood,
      fitCategory: operator.scope.fitCategory,
      screeningScore: operator.scope.screeningScore
    },
    facilityCounts: operator.facilityCounts,
    stateCodes: operator.stateCodes,
    confidence: {
      relationship: operator.parentIdentity?.confidence?.relationship ?? operator.resolution.confidence,
      legalIdentity: operator.parentIdentity?.confidence?.legalIdentity ?? "unverified",
      ownership: operator.parentIdentity?.confidence?.ownership ?? "unverified",
      targetFit: operator.parentIdentity?.confidence?.targetFit ?? "unverified",
      capacity: operator.parentIdentity?.confidence?.capacity ?? "unverified",
      valuation: operator.parentIdentity?.confidence?.valuation ?? "unverified"
    },
    capacity: {
      verifiedCoreBeds: operator.licenseEvidence.bedTotals.verifiedCoreTarget,
      reportedBeds: operator.licenseEvidence.bedTotals.reportedByOperator,
      valuedBeds: operator.valuationEvidence?.capacity.valuedBeds ?? null,
      baseEnterpriseValueMillions: operator.valuationEvidence?.valuation.outputs.base.enterpriseValueMillions ?? null
    },
    evidenceIds: [...new Set([
      ...(operator.resolution?.evidenceIds ?? []),
      ...(operator.licenseEvidence?.evidenceIds ?? [])
    ])].sort(),
    researchGaps: operator.research.gaps,
    decisionUpdatedAt: decision?.updatedAt ?? nowIso()
  };
}

function researchJobId(cohortId, operatorId, kind, stateCode) {
  return `job-${createHash("sha256")
    .update(`${cohortId}:${operatorId}:${kind}:${stateCode ?? "national"}`)
    .digest("hex")
    .slice(0, 24)}`;
}

function leaseTokenHash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function activeLease(job, leaseToken, at = Date.now()) {
  if (job.status !== "in_progress" || !job.claim || Date.parse(job.claim.leaseExpiresAt) <= at) return false;
  const expected = Buffer.from(job.claim.leaseTokenHash, "hex");
  const actual = Buffer.from(leaseTokenHash(leaseToken), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function generateAcquisitionOperatorResearchJobs(cohort, createdAt = nowIso()) {
  const jobs = [];
  for (const member of cohort.members) {
    /**
     * @param {{
     *   kind: string,
     *   phase: number,
     *   priority: number,
     *   stateCode?: string | null,
     *   reason: string,
     *   requiredEvidence: string[],
     *   dependsOnJobIds?: string[]
     * }} input
     */
    const addJob = ({ kind, phase, priority, stateCode = null, reason, requiredEvidence, dependsOnJobIds = [] }) => {
      const job = parseResearchJob({
        id: researchJobId(cohort.id, member.operatorId, kind, stateCode),
        cohortId: cohort.id,
        operatorId: member.operatorId,
        companyName: member.proposedName,
        kind,
        phase,
        priority,
        stateCode,
        status: "pending",
        reason,
        requiredEvidence,
        dependsOnJobIds,
        attemptCount: 0,
        claim: null,
        result: null,
        notes: "",
        createdAt,
        updatedAt: createdAt
      }, jobs.length);
      jobs.push(job);
      return job;
    };

    const parentJob = member.confidence.relationship !== "high" || member.confidence.legalIdentity !== "high"
      ? addJob({
          kind: "parent_legal_identity",
          phase: 1,
          priority: 1,
          reason: "Operating-parent relationship or canonical legal identity is not high confidence.",
          requiredEvidence: ["current_first_party_parent_source", "state_corporate_or_regulator_legal_entity"]
        })
      : null;
    const ownershipJob = member.confidence.ownership !== "high"
      ? addJob({
          kind: "private_ownership",
          phase: 1,
          priority: 1,
          reason: "Current private ownership is not high confidence.",
          requiredEvidence: ["current_owner_or_sponsor_source", "public_nonprofit_government_exclusion_check"]
        })
      : null;
    const fitJob = member.confidence.targetFit !== "high"
      ? addJob({
          kind: "adult_high_acuity_fit",
          phase: 1,
          priority: 1,
          reason: "Adult primary mental-health residential fit is not high confidence.",
          requiredEvidence: ["adult_population", "staffed_residential_setting", "primary_mental_health_or_smi_acuity"]
        })
      : null;
    const locationJob = addJob({
      kind: "portfolio_location_inventory",
      phase: 1,
      priority: 2,
      reason: "Freeze a current non-California operating-location inventory before license reconciliation.",
      requiredEvidence: ["current_first_party_locations", "closure_divestiture_and_alias_review"],
      dependsOnJobIds: parentJob ? [parentJob.id] : []
    });

    /** @type {Array<{ id: string }>} */
    const licenseJobs = [];
    if (member.confidence.capacity !== "high") {
      const stateCodes = member.stateCodes.length ? member.stateCodes : [null];
      for (const stateCode of stateCodes) {
        licenseJobs.push(addJob({
          kind: "state_license_capacity",
          phase: 2,
          priority: 1,
          stateCode,
          reason: stateCode
            ? `Active ${stateCode} licenses and adult core capacity are not fully reconciled.`
            : "Operating states and active licenses must be established before capacity can be reconciled.",
          requiredEvidence: ["active_state_license", "legal_operator", "license_type_and_status", "licensed_capacity_or_explicitly_unpublished"],
          dependsOnJobIds: [locationJob.id, ...(fitJob ? [fitJob.id] : [])]
        }));
      }
    }
    if (member.confidence.valuation !== "high") {
      addJob({
        kind: "valuation_inputs",
        phase: 3,
        priority: 2,
        reason: "Workbook valuation inputs or portfolio completeness are not high confidence.",
        requiredEvidence: ["reconciled_core_beds", "segment_selection", "occupancy_reimbursement_margin_and_multiple_assumptions"],
        dependsOnJobIds: [
          ...licenseJobs.map(({ id }) => id),
          ...(ownershipJob ? [ownershipJob.id] : [])
        ]
      });
    }
  }
  const jobIds = new Set(jobs.map(({ id }) => id));
  for (const job of jobs) {
    if (job.dependsOnJobIds.some((id) => !jobIds.has(id))) throw new Error(`Research job ${job.id} has an invalid dependency.`);
  }
  return jobs;
}

export function summarizeAcquisitionOperatorCohort(cohort, allJobs = []) {
  const members = cohort.members ?? [];
  const jobs = allJobs.filter((job) => job.cohortId === cohort.id);
  const confidenceHigh = (member, dimension) => member.confidence?.[dimension] === "high";
  return {
    id: cohort.id,
    name: cohort.name,
    status: cohort.status,
    memberCount: cohort.memberCount,
    sourceSelectionRevision: cohort.sourceSelectionRevision,
    sourceIndexVersion: cohort.sourceIndexVersion,
    sourceIndexGeneratedAt: cohort.sourceIndexGeneratedAt,
    createdAt: cohort.createdAt,
    createdBy: cohort.createdBy,
    readiness: {
      parentRelationshipHigh: members.filter((member) => confidenceHigh(member, "relationship")).length,
      legalIdentityHigh: members.filter((member) => confidenceHigh(member, "legalIdentity")).length,
      privateOwnershipHigh: members.filter((member) => confidenceHigh(member, "ownership")).length,
      targetFitHigh: members.filter((member) => confidenceHigh(member, "targetFit")).length,
      capacityHigh: members.filter((member) => confidenceHigh(member, "capacity")).length,
      valuationInputsHigh: members.filter((member) => confidenceHigh(member, "valuation")).length,
      knownCapacityValuations: members.filter((member) => member.capacity?.baseEnterpriseValueMillions !== null).length,
      allEvidenceGatesHigh: members.filter((member) =>
        ["relationship", "legalIdentity", "ownership", "targetFit", "capacity", "valuation"]
          .every((dimension) => confidenceHigh(member, dimension))
      ).length
    },
    evidenceTotals: {
      verifiedCoreBedsInSnapshots: members.reduce((sum, member) => sum + (member.capacity?.verifiedCoreBeds ?? 0), 0),
      operatorReportedBedsInSnapshots: members.reduce((sum, member) => sum + (member.capacity?.reportedBeds ?? 0), 0),
      knownCapacityBaseEnterpriseValueMillions: Number(members.reduce((sum, member) =>
        sum + (member.capacity?.baseEnterpriseValueMillions ?? 0), 0).toFixed(6))
    },
    researchQueue: {
      total: jobs.length,
      pending: jobs.filter(({ status }) => status === "pending").length,
      inProgress: jobs.filter(({ status }) => status === "in_progress").length,
      completed: jobs.filter(({ status }) => status === "completed").length,
      blocked: jobs.filter(({ status }) => status === "blocked").length,
      phase1: jobs.filter(({ phase }) => phase === 1).length,
      phase2: jobs.filter(({ phase }) => phase === 2).length,
      phase3: jobs.filter(({ phase }) => phase === 3).length
    }
  };
}

/**
 * @param {{
 *   storePath?: string,
 *   persistence?: null | {
 *     kind: string,
 *     read: () => Promise<{ value: any | null, version: string | null }>,
 *     write: (value: any, version: string | null) => Promise<void>
 *   }
 * }} [options]
 */
export function createAcquisitionOperatorSelectionStore({ storePath = defaultStorePath, persistence = null } = {}) {
  const resolvedStorePath = path.resolve(storePath);
  let writeQueue = /** @type {Promise<unknown>} */ (Promise.resolve());

  async function loadSnapshot() {
    if (!persistence) return { state: await readLocalState(resolvedStorePath), version: null };
    const snapshot = await persistence.read();
    return { state: snapshot.value === null ? emptyState() : parseState(snapshot.value), version: snapshot.version };
  }

  async function read() {
    return (await loadSnapshot()).state;
  }

  async function setDecision(operator, { status, notes }, actor) {
    const operation = writeQueue.then(async () => {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const { state, version } = await loadSnapshot();
        const existingIndex = state.decisions.findIndex(({ operatorId }) => operatorId === operator.id);
        if (status === "undecided") {
          if (existingIndex < 0) return { state, value: null };
          state.decisions.splice(existingIndex, 1);
        } else {
          if (!STATUSES.has(status)) throw new Error("Operator decision status is invalid.");
          const eventTime = nowIso();
          const decision = parseDecision({
            operatorId: operator.id,
            status,
            notes,
            snapshot: {
              proposedName: operator.proposedName,
              rootDomain: operator.rootDomain,
              selectionBucket: operator.screeningProfile.selectionBucket,
              maturityTier: operator.screeningProfile.maturityTier,
              identityKeys: operator.identityKeys ?? fallbackIdentityKeys(operator),
              targetRank: operator.targetRank
            },
            createdAt: existingIndex >= 0 ? state.decisions[existingIndex].createdAt : eventTime,
            updatedAt: eventTime,
            updatedBy: actor
          }, 0);
          if (existingIndex >= 0) state.decisions[existingIndex] = decision;
          else state.decisions.push(decision);
        }
        state.revision += 1;
        state.updatedAt = nowIso();
        try {
          if (persistence) await persistence.write(state, version);
          else await writeLocalState(resolvedStorePath, state);
          return {
            state,
            value: status === "undecided" ? null : state.decisions.find(({ operatorId }) => operatorId === operator.id)
          };
        } catch (error) {
          const conflict = Boolean(error && typeof error === "object" && "code" in error &&
            error.code === "ACQUISITION_OPERATOR_SELECTION_CONFLICT");
          if (!conflict || attempt === 3) throw error;
        }
      }
      throw new Error("Acquisition operator selection update exceeded its retry limit.");
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  async function selectUndecided(operators, { selectionRevision, notes = "" }, actor) {
    if (!Array.isArray(operators) || operators.length < 1 || operators.length > 50) {
      throw new Error("A bulk page selection must contain 1 through 50 companies.");
    }
    if (new Set(operators.map(({ id }) => id)).size !== operators.length) {
      throw new Error("A bulk page selection cannot contain duplicate companies.");
    }
    requiredInteger(selectionRevision, "selectionRevision");
    const normalizedNotes = optionalText(notes, "notes");
    const operation = writeQueue.then(async () => {
      const { state, version } = await loadSnapshot();
      if (state.revision !== selectionRevision) {
        throw Object.assign(
          new Error("Company selections changed before the page was added to the research list."),
          { code: "ACQUISITION_OPERATOR_SELECTION_REVISION_CHANGED" }
        );
      }
      const existingIds = new Set(state.decisions.map(({ operatorId }) => operatorId));
      const additions = operators.filter(({ id }) => !existingIds.has(id));
      if (!additions.length) return { state, value: [] };
      const eventTime = nowIso();
      const decisions = additions.map((operator, index) => parseDecision({
        operatorId: operator.id,
        status: "selected",
        notes: normalizedNotes,
        snapshot: {
          proposedName: operator.proposedName,
          rootDomain: operator.rootDomain,
          selectionBucket: operator.screeningProfile.selectionBucket,
          maturityTier: operator.screeningProfile.maturityTier,
          identityKeys: operator.identityKeys ?? fallbackIdentityKeys(operator),
          targetRank: operator.targetRank
        },
        createdAt: eventTime,
        updatedAt: eventTime,
        updatedBy: actor
      }, state.decisions.length + index));
      state.decisions.push(...decisions);
      state.revision += 1;
      state.updatedAt = eventTime;
      if (persistence) await persistence.write(state, version);
      else await writeLocalState(resolvedStorePath, state);
      return { state, value: decisions };
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  async function freezeCohort(operators, { idempotencyKey, name, selectionRevision, indexVersion, indexGeneratedAt }, actor) {
    if (!Array.isArray(operators) || operators.length < 50 || operators.length > 100) {
      throw new Error("A research cohort must contain 50 through 100 selected companies.");
    }
    if (new Set(operators.map(({ id }) => id)).size !== operators.length) {
      throw new Error("A research cohort cannot contain duplicate companies.");
    }
    if (operators.some((operator) => operator.screeningDecision?.status !== "selected")) {
      throw new Error("Every research cohort member must have a current selected decision.");
    }
    const normalizedIdempotencyKey = requiredText(idempotencyKey, "idempotencyKey", 120);
    const normalizedName = optionalText(name, "name", 120) || `Research cohort ${nowIso().slice(0, 10)}`;
    const operation = writeQueue.then(async () => {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const { state, version } = await loadSnapshot();
        const existing = state.cohorts.find((cohort) => cohort.idempotencyKey === normalizedIdempotencyKey);
        if (existing) return { state, value: existing, created: false };
        if (state.revision !== selectionRevision) {
          throw Object.assign(
            new Error("Company selections changed before the research cohort was frozen."),
            { code: "ACQUISITION_OPERATOR_SELECTION_REVISION_CHANGED" }
          );
        }
        const eventTime = nowIso();
        const cohort = parseCohort({
          id: `cohort-${randomUUID()}`,
          idempotencyKey: normalizedIdempotencyKey,
          name: normalizedName,
          status: "frozen",
          sourceSelectionRevision: selectionRevision,
          sourceIndexVersion: indexVersion,
          sourceIndexGeneratedAt: indexGeneratedAt,
          memberCount: operators.length,
          members: operators.map(cohortMemberSnapshot),
          createdAt: eventTime,
          createdBy: actor
        }, state.cohorts.length);
        const cohortJobs = generateAcquisitionOperatorResearchJobs(cohort, eventTime);
        state.cohorts.push(cohort);
        state.jobs.push(...cohortJobs);
        state.revision += 1;
        state.updatedAt = eventTime;
        try {
          if (persistence) await persistence.write(state, version);
          else await writeLocalState(resolvedStorePath, state);
          return { state, value: cohort, created: true };
        } catch (error) {
          const conflict = Boolean(error && typeof error === "object" && "code" in error &&
            error.code === "ACQUISITION_OPERATOR_SELECTION_CONFLICT");
          if (!conflict || attempt === 3) throw error;
        }
      }
      throw new Error("Research cohort freeze exceeded its retry limit.");
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  async function claimNextResearchJob({ cohortId, workerId, kinds = [], leaseSeconds = 900 }) {
    const normalizedCohortId = requiredText(cohortId, "cohortId", 120);
    const normalizedWorkerId = requiredText(workerId, "workerId", 200);
    const normalizedKinds = requiredTextList(kinds, "kinds", RESEARCH_JOB_KINDS.size);
    if (normalizedKinds.some((kind) => !RESEARCH_JOB_KINDS.has(kind))) throw new Error("Research job kind is invalid.");
    requiredInteger(leaseSeconds, "leaseSeconds", { minimum: 60, maximum: 3_600 });
    const operation = writeQueue.then(async () => {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const { state, version } = await loadSnapshot();
        if (!state.cohorts.some(({ id }) => id === normalizedCohortId)) throw new Error("Research cohort was not found.");
        const now = Date.now();
        const completedJobIds = new Set(state.jobs.filter(({ status }) => status === "completed").map(({ id }) => id));
        const eligible = state.jobs
          .filter((job) =>
            job.cohortId === normalizedCohortId &&
            (!normalizedKinds.length || normalizedKinds.includes(job.kind)) &&
            job.attemptCount < 100 &&
            (job.status === "pending" || (job.status === "in_progress" && Date.parse(job.claim?.leaseExpiresAt ?? "") <= now)) &&
            job.dependsOnJobIds.every((dependencyId) => completedJobIds.has(dependencyId))
          )
          .sort((left, right) =>
            left.phase - right.phase ||
            left.priority - right.priority ||
            left.companyName.localeCompare(right.companyName) ||
            (left.stateCode ?? "").localeCompare(right.stateCode ?? "") ||
            left.id.localeCompare(right.id)
          );
        const job = eligible[0];
        if (!job) return { state, value: null, leaseToken: null };
        const token = `${randomUUID()}-${randomUUID()}`;
        const leasedAt = new Date(now).toISOString();
        job.status = "in_progress";
        job.attemptCount += 1;
        job.claim = {
          workerId: normalizedWorkerId,
          leaseTokenHash: leaseTokenHash(token),
          leasedAt,
          leaseExpiresAt: new Date(now + leaseSeconds * 1_000).toISOString()
        };
        job.updatedAt = leasedAt;
        state.revision += 1;
        state.updatedAt = leasedAt;
        try {
          if (persistence) await persistence.write(state, version);
          else await writeLocalState(resolvedStorePath, state);
          return { state, value: job, leaseToken: token };
        } catch (error) {
          const conflict = Boolean(error && typeof error === "object" && "code" in error &&
            error.code === "ACQUISITION_OPERATOR_SELECTION_CONFLICT");
          if (!conflict || attempt === 3) throw error;
        }
      }
      throw new Error("Research job claim exceeded its retry limit.");
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  async function settleResearchJob({ jobId, leaseToken, action, result = null, notes = "" }, actor) {
    const normalizedJobId = requiredText(jobId, "jobId", 120);
    const normalizedLeaseToken = requiredText(leaseToken, "leaseToken", 200);
    if (!["complete", "block", "release"].includes(action)) throw new Error("Research job action is invalid.");
    const normalizedNotes = optionalText(notes, "notes", 2_000);
    const operation = writeQueue.then(async () => {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const { state, version } = await loadSnapshot();
        const job = state.jobs.find(({ id }) => id === normalizedJobId);
        if (!job) throw new Error("Research job was not found.");
        const eventTime = nowIso();
        if (!activeLease(job, normalizedLeaseToken, Date.parse(eventTime))) {
          throw Object.assign(new Error("Research job lease is invalid or expired."), { code: "ACQUISITION_RESEARCH_JOB_LEASE_INVALID" });
        }
        if (action === "complete") {
          job.result = parseResearchJobResult({
            ...(isObject(result) ? result : {}),
            submittedAt: eventTime,
            submittedBy: actor
          }, `jobs.${normalizedJobId}.result`);
          job.status = "completed";
          job.notes = normalizedNotes;
        } else if (action === "block") {
          if (!normalizedNotes) throw new Error("Blocked research jobs require notes.");
          job.status = "blocked";
          job.notes = normalizedNotes;
        } else {
          job.status = "pending";
          job.notes = normalizedNotes;
        }
        job.claim = null;
        job.updatedAt = eventTime;
        state.revision += 1;
        state.updatedAt = eventTime;
        try {
          if (persistence) await persistence.write(state, version);
          else await writeLocalState(resolvedStorePath, state);
          return { state, value: job };
        } catch (error) {
          const conflict = Boolean(error && typeof error === "object" && "code" in error &&
            error.code === "ACQUISITION_OPERATOR_SELECTION_CONFLICT");
          if (!conflict || attempt === 3) throw error;
        }
      }
      throw new Error("Research job update exceeded its retry limit.");
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  return {
    read,
    setDecision,
    selectUndecided,
    freezeCohort,
    claimNextResearchJob,
    settleResearchJob,
    persistence: persistence?.kind ?? "local_file_store",
    storePath: persistence ? null : resolvedStorePath
  };
}

export const acquisitionOperatorSelectionStore = createAcquisitionOperatorSelectionStore({
  persistence: shouldUseAzureAcquisitionStorage() ? createAzureAcquisitionOperatorSelectionPersistence() : null
});
