import { createHttpError } from "./http-errors.mjs";
import { searchAcquisitionOperatorUniverse } from "./acquisition-operator-store.mjs";
import {
  acquisitionOperatorSelectionStore,
  summarizeAcquisitionOperatorCohort
} from "./acquisition-operator-selection-store.mjs";
import { publicAcquisitionOperatorResearchJob } from "./acquisition-operator-research-jobs.mjs";

export const ACQUISITION_OPERATOR_COHORT_VERSION = "1.0";

function invalid(message) {
  return createHttpError(400, "acquisition_operator_cohort_invalid", message);
}

function actorFromAuth(authContext) {
  const claims = authContext?.claims ?? {};
  return String(claims.preferred_username ?? claims.email ?? claims.upn ?? claims.oid ?? "owner")
    .trim()
    .slice(0, 500) || "owner";
}

export function validateAcquisitionOperatorCohortRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("Request must be a JSON object.");
  const action = String(value.action ?? "").trim().toLowerCase();
  const name = String(value.name ?? "").trim();
  const idempotencyKey = String(value.idempotencyKey ?? "").trim();
  if (action !== "freeze_selected") throw invalid("action is not supported.");
  if (name.length > 120) throw invalid("name is too long.");
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(idempotencyKey)) throw invalid("idempotencyKey is invalid.");
  return { action, name, idempotencyKey };
}

function cohortSummary(cohort, jobs = []) {
  return summarizeAcquisitionOperatorCohort(cohort, jobs);
}

export async function getAcquisitionOperatorCohortResponse(requestUrl) {
  const cohortId = String(requestUrl.searchParams.get("id") ?? "").trim();
  if (!cohortId || cohortId.length > 120) throw invalid("id is invalid.");
  const state = await acquisitionOperatorSelectionStore.read();
  const cohort = state.cohorts.find(({ id }) => id === cohortId);
  if (!cohort) throw createHttpError(404, "acquisition_operator_cohort_not_found", "The frozen research cohort was not found.");
  return {
    version: ACQUISITION_OPERATOR_COHORT_VERSION,
    persistence: acquisitionOperatorSelectionStore.persistence,
    revision: state.revision,
    cohort: {
      ...cohortSummary(cohort, state.jobs),
      members: cohort.members,
      jobs: state.jobs
        .filter((job) => job.cohortId === cohort.id)
        .map(publicAcquisitionOperatorResearchJob)
    }
  };
}

export async function freezeSelectedAcquisitionOperatorCohort(input, authContext) {
  const selected = await searchAcquisitionOperatorUniverse(new URL(
    "http://localhost/api/platform/acquisition/operators?stage=all&ownerDecision=selected&sort=rank&limit=100&offset=0"
  ));
  if (!selected.available) throw createHttpError(409, "acquisition_operator_index_unavailable", "The company index is not available.");
  if (selected.matched < 50 || selected.matched > 100) {
    throw createHttpError(
      409,
      "acquisition_operator_cohort_size_invalid",
      `Select 50 through 100 companies before freezing a research cohort; ${selected.matched} are currently selected.`
    );
  }
  const selectedIdentityIssues = [
    ...(selected.selectionIntegrity?.orphaned ?? []),
    ...(selected.selectionIntegrity?.conflicts ?? [])
  ].filter((issue) => issue.status === "selected");
  if (selectedIdentityIssues.length) {
    throw createHttpError(
      409,
      "acquisition_operator_cohort_identity_review_required",
      `${selectedIdentityIssues.length} selected company identities require review before the cohort can be frozen.`
    );
  }
  if (selected.results.length !== selected.matched) {
    throw createHttpError(409, "acquisition_operator_cohort_incomplete", "The selected company list could not be loaded completely.");
  }
  let result;
  try {
    result = await acquisitionOperatorSelectionStore.freezeCohort(selected.results, {
      idempotencyKey: input.idempotencyKey,
      name: input.name,
      selectionRevision: selected.selectionRevision,
      indexVersion: selected.indexVersion,
      indexGeneratedAt: selected.generatedAt
    }, actorFromAuth(authContext));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error &&
        error.code === "ACQUISITION_OPERATOR_SELECTION_REVISION_CHANGED") {
      throw createHttpError(
        409,
        "acquisition_operator_cohort_selection_changed",
        error instanceof Error ? error.message : "Company selections changed before the cohort was frozen."
      );
    }
    throw error;
  }
  return {
    version: ACQUISITION_OPERATOR_COHORT_VERSION,
    ok: true,
    created: result.created,
    persistence: acquisitionOperatorSelectionStore.persistence,
    revision: result.state.revision,
    cohort: cohortSummary(result.value, result.state.jobs)
  };
}
