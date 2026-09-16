import { createHttpError } from "./http-errors.mjs";
import { acquisitionOperatorSelectionStore } from "./acquisition-operator-selection-store.mjs";

export const ACQUISITION_OPERATOR_RESEARCH_JOB_VERSION = "1.0";

const JOB_KINDS = new Set([
  "parent_legal_identity",
  "private_ownership",
  "adult_high_acuity_fit",
  "portfolio_location_inventory",
  "state_license_capacity",
  "valuation_inputs"
]);

function invalid(message) {
  return createHttpError(400, "acquisition_operator_research_job_invalid", message);
}

function boundedText(value, label, maximum, { required = true } = {}) {
  const normalized = String(value ?? "").trim();
  if ((required && !normalized) || normalized.length > maximum) throw invalid(`${label} is invalid.`);
  return normalized;
}

function actorFromAuth(authContext) {
  const claims = authContext?.claims ?? {};
  return String(claims.preferred_username ?? claims.email ?? claims.upn ?? claims.oid ?? "owner")
    .trim()
    .slice(0, 500) || "owner";
}

export function validateAcquisitionOperatorResearchJobRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("Request must be a JSON object.");
  const action = boundedText(value.action, "action", 30).toLowerCase();
  if (action === "claim_next") {
    const cohortId = boundedText(value.cohortId, "cohortId", 120);
    const workerId = boundedText(value.workerId, "workerId", 200);
    const kinds = value.kinds == null ? [] : value.kinds;
    if (!Array.isArray(kinds) || kinds.length > JOB_KINDS.size ||
        !kinds.every((kind) => typeof kind === "string" && JOB_KINDS.has(kind))) {
      throw invalid("kinds is invalid.");
    }
    const leaseSeconds = value.leaseSeconds == null ? 900 : Number(value.leaseSeconds);
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 60 || leaseSeconds > 3_600) throw invalid("leaseSeconds is invalid.");
    return { action, cohortId, workerId, kinds: [...new Set(kinds)], leaseSeconds };
  }
  if (["complete", "block", "release"].includes(action)) {
    const jobId = boundedText(value.jobId, "jobId", 120);
    const leaseToken = boundedText(value.leaseToken, "leaseToken", 200);
    const notes = boundedText(value.notes, "notes", 2_000, { required: action === "block" });
    if (action === "complete" && (!value.result || typeof value.result !== "object" || Array.isArray(value.result))) {
      throw invalid("result is required for completed jobs.");
    }
    return { action, jobId, leaseToken, notes, result: action === "complete" ? value.result : null };
  }
  throw invalid("action is not supported.");
}

export function publicAcquisitionOperatorResearchJob(job) {
  return {
    ...job,
    claim: job.claim ? {
      workerId: job.claim.workerId,
      leasedAt: job.claim.leasedAt,
      leaseExpiresAt: job.claim.leaseExpiresAt
    } : null
  };
}

export async function mutateAcquisitionOperatorResearchJob(input, authContext) {
  try {
    if (input.action === "claim_next") {
      const result = await acquisitionOperatorSelectionStore.claimNextResearchJob(input);
      return {
        version: ACQUISITION_OPERATOR_RESEARCH_JOB_VERSION,
        ok: true,
        persistence: acquisitionOperatorSelectionStore.persistence,
        revision: result.state.revision,
        job: result.value ? publicAcquisitionOperatorResearchJob(result.value) : null,
        leaseToken: result.leaseToken
      };
    }
    const result = await acquisitionOperatorSelectionStore.settleResearchJob(input, actorFromAuth(authContext));
    return {
      version: ACQUISITION_OPERATOR_RESEARCH_JOB_VERSION,
      ok: true,
      persistence: acquisitionOperatorSelectionStore.persistence,
      revision: result.state.revision,
      job: publicAcquisitionOperatorResearchJob(result.value),
      leaseToken: null
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error &&
        error.code === "ACQUISITION_RESEARCH_JOB_LEASE_INVALID") {
      throw createHttpError(409, "acquisition_operator_research_job_lease_invalid", "Research job lease is invalid or expired.");
    }
    throw invalid(error instanceof Error ? error.message : "Research job update failed.");
  }
}
