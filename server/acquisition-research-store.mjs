import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAzureAcquisitionResearchPersistence,
  shouldUseAzureAcquisitionStorage
} from "./acquisition-azure-storage.mjs";

export const ACQUISITION_RESEARCH_STORE_VERSION = 1;

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultStoreRoot = path.resolve(
  process.env.ACQUISITION_INTELLIGENCE_ROOT || path.join(repositoryRoot, "generated/acquisition-intelligence")
);
const defaultStorePath = path.join(defaultStoreRoot, "research/store-v1.json");
const MAX_STORE_BYTES = 20_000_000;
const CASE_STATUSES = new Set(["new", "researching", "blocked", "ready_for_review", "verified", "excluded"]);
const PRIORITIES = new Set(["normal", "high", "urgent"]);
const SCOPE_STATUSES = new Set(["pending", "confirmed", "excluded"]);
const OWNERSHIP_STATUSES = new Set(["unresolved", "proposed", "verified"]);
const LICENSE_STATUSES = new Set(["pending", "matched", "not_found", "not_required"]);
const EVIDENCE_KINDS = new Set([
  "ownership",
  "license",
  "capacity",
  "adult_population",
  "residential_setting",
  "private_for_profit",
  "other"
]);

function nowIso() {
  return new Date().toISOString();
}

function emptyState() {
  const timestamp = nowIso();
  return {
    version: ACQUISITION_RESEARCH_STORE_VERSION,
    initialized: false,
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    cases: [],
    evidence: []
  };
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertString(value, label, { nullable = false, maximum = 5_000 } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || value.length > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function assertOptionalUrl(value, label) {
  if (value === null || value === "") return null;
  const normalized = String(assertString(value, label, { maximum: 2_000 })).trim();
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`);
  }
  if (parsed.protocol !== "https:") throw new Error(`${label} must use HTTPS.`);
  return parsed.toString();
}

function assertTimestamp(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`${label} is invalid.`);
  return value;
}

function assertEnum(value, allowed, label) {
  if (typeof value !== "string" || !allowed.has(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function assertBeds(value, label) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value <= 0 || value > 100_000) throw new Error(`${label} is invalid.`);
  return value;
}

function parseCase(value, index) {
  if (!isObject(value) || !isObject(value.scope) || !isObject(value.ownership) || !isObject(value.license)) {
    throw new Error(`cases[${index}] is invalid.`);
  }
  return {
    id: assertString(value.id, `cases[${index}].id`, { maximum: 120 }),
    facilityId: assertString(value.facilityId, `cases[${index}].facilityId`, { maximum: 120 }),
    discoveryDisposition: assertEnum(value.discoveryDisposition, new Set(["include", "review"]), `cases[${index}].discoveryDisposition`),
    evidencePriorityScore: Number.isInteger(value.evidencePriorityScore) ? value.evidencePriorityScore : 0,
    status: assertEnum(value.status, CASE_STATUSES, `cases[${index}].status`),
    priority: assertEnum(value.priority, PRIORITIES, `cases[${index}].priority`),
    assignee: assertString(value.assignee, `cases[${index}].assignee`, { nullable: true, maximum: 200 }),
    notes: assertString(value.notes, `cases[${index}].notes`, { maximum: 5_000 }),
    scope: {
      adult: assertEnum(value.scope.adult, SCOPE_STATUSES, `cases[${index}].scope.adult`),
      residential: assertEnum(value.scope.residential, SCOPE_STATUSES, `cases[${index}].scope.residential`),
      privateForProfit: assertEnum(
        value.scope.privateForProfit,
        SCOPE_STATUSES,
        `cases[${index}].scope.privateForProfit`
      )
    },
    ownership: {
      status: assertEnum(value.ownership.status, OWNERSHIP_STATUSES, `cases[${index}].ownership.status`),
      operatorName: assertString(value.ownership.operatorName, `cases[${index}].ownership.operatorName`, {
        nullable: true,
        maximum: 500
      }),
      parentName: assertString(value.ownership.parentName, `cases[${index}].ownership.parentName`, {
        nullable: true,
        maximum: 500
      }),
      sourceUrl: assertOptionalUrl(value.ownership.sourceUrl, `cases[${index}].ownership.sourceUrl`),
      verifiedAt: assertTimestamp(value.ownership.verifiedAt, `cases[${index}].ownership.verifiedAt`, { nullable: true })
    },
    license: {
      status: assertEnum(value.license.status, LICENSE_STATUSES, `cases[${index}].license.status`),
      legalEntity: assertString(value.license.legalEntity, `cases[${index}].license.legalEntity`, {
        nullable: true,
        maximum: 500
      }),
      licenseNumber: assertString(value.license.licenseNumber, `cases[${index}].license.licenseNumber`, {
        nullable: true,
        maximum: 200
      }),
      licensedBeds: assertBeds(value.license.licensedBeds, `cases[${index}].license.licensedBeds`),
      sourceUrl: assertOptionalUrl(value.license.sourceUrl, `cases[${index}].license.sourceUrl`),
      verifiedAt: assertTimestamp(value.license.verifiedAt, `cases[${index}].license.verifiedAt`, { nullable: true })
    },
    createdAt: assertTimestamp(value.createdAt, `cases[${index}].createdAt`),
    updatedAt: assertTimestamp(value.updatedAt, `cases[${index}].updatedAt`),
    updatedBy: assertString(value.updatedBy, `cases[${index}].updatedBy`, { maximum: 500 })
  };
}

function parseEvidence(value, index) {
  if (!isObject(value)) throw new Error(`evidence[${index}] is invalid.`);
  return {
    id: assertString(value.id, `evidence[${index}].id`, { maximum: 120 }),
    caseId: assertString(value.caseId, `evidence[${index}].caseId`, { maximum: 120 }),
    kind: assertEnum(value.kind, EVIDENCE_KINDS, `evidence[${index}].kind`),
    title: assertString(value.title, `evidence[${index}].title`, { maximum: 300 }),
    url: assertOptionalUrl(value.url, `evidence[${index}].url`),
    note: assertString(value.note, `evidence[${index}].note`, { maximum: 2_000 }),
    observedAt: assertString(value.observedAt, `evidence[${index}].observedAt`, { nullable: true, maximum: 10 }),
    createdAt: assertTimestamp(value.createdAt, `evidence[${index}].createdAt`),
    createdBy: assertString(value.createdBy, `evidence[${index}].createdBy`, { maximum: 500 })
  };
}

function parseState(value) {
  if (!isObject(value) || value.version !== ACQUISITION_RESEARCH_STORE_VERSION) {
    throw new Error("Acquisition research store has an unsupported version.");
  }
  if (!Array.isArray(value.cases) || !Array.isArray(value.evidence)) {
    throw new Error("Acquisition research store collections are invalid.");
  }
  return {
    version: ACQUISITION_RESEARCH_STORE_VERSION,
    initialized: true,
    revision: Number.isInteger(value.revision) && value.revision >= 0 ? value.revision : 0,
    createdAt: assertTimestamp(value.createdAt, "store.createdAt"),
    updatedAt: assertTimestamp(value.updatedAt, "store.updatedAt"),
    cases: value.cases.map(parseCase),
    evidence: value.evidence.map(parseEvidence)
  };
}

async function readLocalState(storePath) {
  try {
    const raw = await readFile(storePath, "utf8");
    if (Buffer.byteLength(raw, "utf8") > MAX_STORE_BYTES) throw new Error("Acquisition research store exceeds its size limit.");
    return parseState(JSON.parse(raw));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return emptyState();
    throw error;
  }
}

async function writeLocalState(storePath, state) {
  const parent = path.dirname(storePath);
  await mkdir(parent, { recursive: true });
  const temporaryPath = path.join(parent, `.store-v1-${randomUUID()}.tmp`);
  const serialized = `${JSON.stringify(state, null, 2)}\n`;
  if (Buffer.byteLength(serialized, "utf8") > MAX_STORE_BYTES) throw new Error("Acquisition research store exceeds its size limit.");
  await writeFile(temporaryPath, serialized, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, storePath);
}

function defaultCase(facility, actor) {
  const timestamp = nowIso();
  return {
    id: `case-${facility.id}`,
    facilityId: facility.id,
    discoveryDisposition: facility.disposition,
    evidencePriorityScore: facility.evidencePriorityScore,
    status: "new",
    priority: facility.evidencePriorityScore >= 65 ? "high" : "normal",
    assignee: null,
    notes: "",
    scope: { adult: "pending", residential: "pending", privateForProfit: "pending" },
    ownership: { status: "unresolved", operatorName: null, parentName: null, sourceUrl: null, verifiedAt: null },
    license: {
      status: "pending",
      legalEntity: null,
      licenseNumber: null,
      licensedBeds: null,
      sourceUrl: null,
      verifiedAt: null
    },
    createdAt: timestamp,
    updatedAt: timestamp,
    updatedBy: actor
  };
}

function canMarkVerified(record, evidence) {
  const requiredEvidenceKinds = new Set([
    "ownership",
    "license",
    "capacity",
    "adult_population",
    "residential_setting",
    "private_for_profit"
  ]);
  const recordedKinds = new Set(evidence.filter((item) => item.caseId === record.id).map((item) => item.kind));
  return Object.values(record.scope).every((status) => status === "confirmed") &&
    record.ownership.status === "verified" &&
    record.license.status === "matched" &&
    Number.isInteger(record.license.licensedBeds) &&
    record.license.licensedBeds > 0 &&
    [...requiredEvidenceKinds].every((kind) => recordedKinds.has(kind));
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
export function createAcquisitionResearchStore({ storePath = defaultStorePath, persistence = null } = {}) {
  const resolvedStorePath = path.resolve(storePath);
  let writeQueue = /** @type {Promise<unknown>} */ (Promise.resolve());

  async function loadSnapshot() {
    if (!persistence) {
      return { state: await readLocalState(resolvedStorePath), version: null };
    }
    const snapshot = await persistence.read();
    return {
      state: snapshot.value === null ? emptyState() : parseState(snapshot.value),
      version: snapshot.version
    };
  }

  async function persistSnapshot(state, version) {
    if (persistence) {
      await persistence.write(state, version);
      return;
    }
    await writeLocalState(resolvedStorePath, state);
  }

  async function read() {
    return (await loadSnapshot()).state;
  }

  async function mutate(mutator) {
    const operation = writeQueue.then(async () => {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const { state, version } = await loadSnapshot();
        const result = await mutator(state);
        if (!result.changed) return { state, value: result.value };
        state.initialized = true;
        state.revision += 1;
        state.updatedAt = nowIso();
        try {
          await persistSnapshot(state, version);
          return { state, value: result.value };
        } catch (error) {
          const conflict = Boolean(error && typeof error === "object" && "code" in error &&
            error.code === "ACQUISITION_RESEARCH_CONFLICT");
          if (!conflict || attempt === 3) throw error;
        }
      }
      throw new Error("Acquisition research update exceeded its retry limit.");
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  async function synchronizeFacilities(facilities, actor = "owner") {
    return mutate((state) => {
      const byFacilityId = new Map(state.cases.map((record) => [record.facilityId, record]));
      let created = 0;
      let updated = 0;
      for (const facility of facilities) {
        const existing = byFacilityId.get(facility.id);
        if (!existing) {
          state.cases.push(defaultCase(facility, actor));
          created += 1;
          continue;
        }
        if (
          existing.discoveryDisposition !== facility.disposition ||
          existing.evidencePriorityScore !== facility.evidencePriorityScore
        ) {
          existing.discoveryDisposition = facility.disposition;
          existing.evidencePriorityScore = facility.evidencePriorityScore;
          existing.updatedAt = nowIso();
          existing.updatedBy = actor;
          updated += 1;
        }
      }
      return { changed: created > 0 || updated > 0, value: { created, updated } };
    });
  }

  async function updateCase(facilityId, patch, actor = "owner") {
    return mutate((state) => {
      const record = state.cases.find((item) => item.facilityId === facilityId);
      if (!record) throw new Error("Acquisition research case was not found.");
      const candidate = parseCase({
        ...record,
        ...patch,
        id: record.id,
        facilityId: record.facilityId,
        discoveryDisposition: record.discoveryDisposition,
        evidencePriorityScore: record.evidencePriorityScore,
        scope: { ...record.scope, ...patch.scope },
        ownership: { ...record.ownership, ...patch.ownership },
        license: { ...record.license, ...patch.license },
        createdAt: record.createdAt,
        updatedAt: nowIso(),
        updatedBy: actor
      }, 0);
      if (candidate.status === "verified" && !canMarkVerified(candidate, state.evidence)) {
        throw new Error("A verified case requires confirmed scope, verified ownership, a matched license, licensed beds, and evidence for every required field.");
      }
      Object.assign(record, candidate);
      return { changed: true, value: { ...record } };
    });
  }

  async function addEvidence(facilityId, input, actor = "owner") {
    return mutate((state) => {
      const record = state.cases.find((item) => item.facilityId === facilityId);
      if (!record) throw new Error("Acquisition research case was not found.");
      const timestamp = nowIso();
      const evidence = parseEvidence({
        id: randomUUID(),
        caseId: record.id,
        kind: input.kind,
        title: input.title,
        url: input.url,
        note: input.note,
        observedAt: input.observedAt,
        createdAt: timestamp,
        createdBy: actor
      }, 0);
      state.evidence.push(evidence);
      record.updatedAt = timestamp;
      record.updatedBy = actor;
      return { changed: true, value: { ...evidence } };
    });
  }

  return {
    read,
    synchronizeFacilities,
    updateCase,
    addEvidence,
    persistence: persistence?.kind ?? "local_file_store",
    storePath: persistence ? null : resolvedStorePath
  };
}

export const acquisitionResearchStore = createAcquisitionResearchStore({
  persistence: shouldUseAzureAcquisitionStorage() ? createAzureAcquisitionResearchPersistence() : null
});
