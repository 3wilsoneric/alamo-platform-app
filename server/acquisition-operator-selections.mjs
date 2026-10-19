import { createHttpError } from "./http-errors.mjs";
import {
  getAcquisitionOperatorById,
  resolveAcquisitionOperatorSelections,
  searchAcquisitionOperatorUniverse
} from "./acquisition-operator-store.mjs";
import { acquisitionOperatorSelectionStore } from "./acquisition-operator-selection-store.mjs";

export const ACQUISITION_OPERATOR_SELECTION_VERSION = "1.1";

const VALID_STATUSES = new Set(["selected", "hold", "excluded", "undecided"]);

function invalid(message) {
  return createHttpError(400, "acquisition_operator_selection_invalid", message);
}

function selectionChanged() {
  return createHttpError(
    409,
    "acquisition_operator_selection_revision_changed",
    "Company selections changed before the page was added. Refresh the list and try again."
  );
}

function actorFromAuth(authContext) {
  const claims = authContext?.claims ?? {};
  return String(claims.preferred_username ?? claims.email ?? claims.upn ?? claims.oid ?? "owner")
    .trim()
    .slice(0, 500) || "owner";
}

export function validateAcquisitionOperatorDecisionRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("Request must be a JSON object.");
  const operatorId = String(value.operatorId ?? "").trim();
  const status = String(value.status ?? "").trim().toLowerCase();
  const notes = String(value.notes ?? "").trim();
  if (!operatorId || operatorId.length > 120) throw invalid("operatorId is invalid.");
  if (!VALID_STATUSES.has(status)) throw invalid("status is not supported.");
  if (notes.length > 2_000) throw invalid("notes is too long.");
  return { operatorId, status, notes };
}

export function validateAcquisitionOperatorBulkDecisionRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("Request must be a JSON object.");
  if (value.action !== "select_unreviewed_page") throw invalid("action is not supported.");
  if (!Array.isArray(value.operatorIds) || value.operatorIds.length < 1 || value.operatorIds.length > 50) {
    throw invalid("operatorIds must contain 1 through 50 companies.");
  }
  const operatorIds = value.operatorIds.map((entry) => String(entry ?? "").trim());
  if (operatorIds.some((operatorId) => !operatorId || operatorId.length > 120)) throw invalid("operatorIds contains an invalid company identifier.");
  if (new Set(operatorIds).size !== operatorIds.length) throw invalid("operatorIds cannot contain duplicates.");
  if (!Number.isInteger(value.selectionRevision) || value.selectionRevision < 0) throw invalid("selectionRevision is invalid.");
  const notes = String(value.notes ?? "").trim();
  if (notes.length > 2_000) throw invalid("notes is too long.");
  return {
    action: "select_unreviewed_page",
    operatorIds,
    selectionRevision: value.selectionRevision,
    notes
  };
}

export async function mutateAcquisitionOperatorDecision(input, authContext) {
  const operator = await getAcquisitionOperatorById(input.operatorId);
  if (!operator) throw createHttpError(404, "acquisition_operator_not_found", "The company proposal was not found.");
  try {
    const result = await acquisitionOperatorSelectionStore.setDecision(
      operator,
      { status: input.status, notes: input.notes },
      actorFromAuth(authContext)
    );
    return {
      version: ACQUISITION_OPERATOR_SELECTION_VERSION,
      ok: true,
      persistence: acquisitionOperatorSelectionStore.persistence,
      revision: result.state.revision,
      decision: result.value
    };
  } catch (error) {
    throw invalid(error instanceof Error ? error.message : "The company screening decision could not be saved.");
  }
}

export async function mutateAcquisitionOperatorBulkDecision(input, authContext) {
  const operators = await Promise.all(input.operatorIds.map((operatorId) => getAcquisitionOperatorById(operatorId)));
  if (operators.some((operator) => !operator)) {
    throw createHttpError(404, "acquisition_operator_not_found", "At least one company proposal was not found.");
  }
  const currentSearch = await searchAcquisitionOperatorUniverse(new URL(
    "http://localhost/api/platform/acquisition/operators?stage=all&ownerDecision=selected&limit=1"
  ));
  if (currentSearch.selectionRevision !== input.selectionRevision) throw selectionChanged();
  const state = await acquisitionOperatorSelectionStore.read();
  if (state.revision !== input.selectionRevision) throw selectionChanged();
  const resolvedOperators = operators.filter(Boolean);
  const existingForPage = resolveAcquisitionOperatorSelections(resolvedOperators, state.decisions).decisionsByOperatorId;
  const unreviewed = resolvedOperators.filter((operator) => !existingForPage.has(operator.id));
  const eligible = unreviewed.filter((operator) =>
    !["excluded_public_company", "excluded_out_of_scope"].includes(operator.acquisitionEligibility)
  );
  const availableSlots = Math.max(0, 100 - Number(currentSearch.counts.ownerSelected ?? 0));
  const additions = eligible.slice(0, availableSlots);
  try {
    const result = additions.length
      ? await acquisitionOperatorSelectionStore.selectUndecided(
          additions,
          { selectionRevision: input.selectionRevision, notes: input.notes },
          actorFromAuth(authContext)
        )
      : { state, value: [] };
    return {
      version: ACQUISITION_OPERATOR_SELECTION_VERSION,
      ok: true,
      persistence: acquisitionOperatorSelectionStore.persistence,
      revision: result.state.revision,
      requested: input.operatorIds.length,
      selected: result.value.length,
      skippedAlreadyReviewed: resolvedOperators.length - unreviewed.length,
      skippedIneligible: unreviewed.length - eligible.length,
      skippedResearchListLimit: Math.max(0, eligible.length - additions.length),
      ownerSelected: Number(currentSearch.counts.ownerSelected ?? 0) + result.value.length,
      selectedOperatorIds: result.value.map(({ operatorId }) => operatorId)
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error &&
        error.code === "ACQUISITION_OPERATOR_SELECTION_REVISION_CHANGED") {
      throw selectionChanged();
    }
    throw invalid(error instanceof Error ? error.message : "The page could not be added to the research list.");
  }
}
