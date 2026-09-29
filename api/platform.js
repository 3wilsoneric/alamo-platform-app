import {
  getAdmissionsDashboardData,
  getAnalystQaStatus,
  getPlatformBootstrap,
  getPlatformHealth,
  getPlatformSnapshotHealth,
  getPlatformSnapshotMetadata
} from "../server/platform-data.mjs";
import { getAnalystTraceTelemetry } from "../server/tools/turn-trace.mjs";
import {
  handleProtectedGetRoutes,
  handleProtectedPost
} from "../server/protected-get-handler.mjs";
import {
  getPlatformKnowledgeOverview,
  getPlatformKnowledgeRecordResponse,
  getPlatformKnowledgeSearchResponse
} from "../server/platform-knowledge-api.mjs";
import { assertPlatformKnowledgeOwner } from "../server/platform-knowledge-access.mjs";
import {
  calculateAcquisitionValuation,
  getAcquisitionIntelligenceOverviewResponse,
  validateAcquisitionValuationRequest
} from "../server/acquisition-intelligence.mjs";
import { searchNationalFacilityDiscovery } from "../server/acquisition-intelligence-store.mjs";
import { searchAcquisitionOperatorUniverse } from "../server/acquisition-operator-store.mjs";
import { getAcquisitionOperatorExportResponse } from "../server/acquisition-operator-export.mjs";
import {
  mutateAcquisitionOperatorBulkDecision,
  mutateAcquisitionOperatorDecision,
  validateAcquisitionOperatorBulkDecisionRequest,
  validateAcquisitionOperatorDecisionRequest
} from "../server/acquisition-operator-selections.mjs";
import {
  freezeSelectedAcquisitionOperatorCohort,
  getAcquisitionOperatorCohortResponse,
  validateAcquisitionOperatorCohortRequest
} from "../server/acquisition-operator-cohorts.mjs";
import {
  mutateAcquisitionOperatorResearchJob,
  validateAcquisitionOperatorResearchJobRequest
} from "../server/acquisition-operator-research-jobs.mjs";
import {
  getAcquisitionResearchResponse,
  mutateAcquisitionResearch,
  validateAcquisitionResearchRequest
} from "../server/acquisition-research.mjs";
import { readValidatedJsonRequest } from "../server/http-body.mjs";
import {
  handlePipelineClinicalApiRequest,
  PIPELINE_CLINICAL_API_PREFIX
} from "../server/pipeline-clinical-api.mjs";

import { getLicensingLibrary, getLicensingReport, getLicensingUpdates } from "../server/licensing-library.mjs";
import { assertLicensingAccess } from "../server/licensing-access.mjs";

const PLATFORM_GET_ROUTES = Object.freeze({
  "/api/platform/licensing": ({ requestUrl, authContext }) => {
    assertLicensingAccess(authContext);
    return getLicensingLibrary(requestUrl);
  },
  "/api/platform/licensing/report": ({ requestUrl, authContext }) => {
    assertLicensingAccess(authContext);
    return getLicensingReport(requestUrl);
  },
  "/api/platform/licensing/updates": ({ authContext }) => {
    assertLicensingAccess(authContext);
    return getLicensingUpdates();
  },
  "/api/platform/admissions-dashboard": () => getAdmissionsDashboardData(),
  "/api/platform/bootstrap": () => getPlatformBootstrap(),
  "/api/platform/health": () => getPlatformHealth(),
  "/api/platform/analyst-qa": () => getAnalystQaStatus(),
  "/api/platform/analyst-traces": () => getAnalystTraceTelemetry(),
  "/api/platform/knowledge": ({ authContext }) => {
    assertPlatformKnowledgeOwner(authContext);
    return getPlatformKnowledgeOverview();
  },
  "/api/platform/knowledge/search": ({ requestUrl, authContext }) => {
    assertPlatformKnowledgeOwner(authContext);
    return getPlatformKnowledgeSearchResponse(requestUrl);
  },
  "/api/platform/knowledge/record": ({ requestUrl, authContext }) => {
    assertPlatformKnowledgeOwner(authContext);
    return getPlatformKnowledgeRecordResponse(requestUrl);
  },
  "/api/platform/acquisition": async ({ authContext }) => {
    assertPlatformKnowledgeOwner(authContext);
    return getAcquisitionIntelligenceOverviewResponse();
  },
  "/api/platform/acquisition/search": async ({ requestUrl, authContext }) => {
    assertPlatformKnowledgeOwner(authContext);
    return searchNationalFacilityDiscovery(requestUrl);
  },
  "/api/platform/acquisition/operators": async ({ requestUrl, authContext }) => {
    assertPlatformKnowledgeOwner(authContext);
    return searchAcquisitionOperatorUniverse(requestUrl);
  },
  "/api/platform/acquisition/operators/export": async ({ requestUrl, authContext }) => {
    assertPlatformKnowledgeOwner(authContext);
    return getAcquisitionOperatorExportResponse(requestUrl);
  },
  "/api/platform/acquisition/operator-cohort": async ({ requestUrl, authContext }) => {
    assertPlatformKnowledgeOwner(authContext);
    return getAcquisitionOperatorCohortResponse(requestUrl);
  },
  "/api/platform/acquisition/research": async ({ requestUrl, authContext }) => {
    assertPlatformKnowledgeOwner(authContext);
    return getAcquisitionResearchResponse(requestUrl, authContext);
  },
  "/api/platform/snapshot-health": () => getPlatformSnapshotHealth(),
  "/api/platform/snapshot-metadata": () => getPlatformSnapshotMetadata()
});

export default async function handler(req, res) {
  const requestPath = String(req.url ?? "").split("?", 1)[0] ?? "";
  if (requestPath.startsWith(PIPELINE_CLINICAL_API_PREFIX)) {
    await handlePipelineClinicalApiRequest(req, res);
    return;
  }

  if (req.method === "POST" && requestPath === "/api/platform/acquisition/valuation") {
    await handleProtectedPost(req, res, async ({ req: protectedRequest, authContext }) => {
      assertPlatformKnowledgeOwner(authContext);
      const body = await readValidatedJsonRequest(protectedRequest, validateAcquisitionValuationRequest);
      return calculateAcquisitionValuation(body);
    }, { fallbackMessage: "Acquisition valuation failed." });
    return;
  }
  if (req.method === "POST" && requestPath === "/api/platform/acquisition/research") {
    await handleProtectedPost(req, res, async ({ req: protectedRequest, authContext }) => {
      assertPlatformKnowledgeOwner(authContext);
      const body = await readValidatedJsonRequest(protectedRequest, validateAcquisitionResearchRequest);
      return mutateAcquisitionResearch(body, authContext);
    }, { fallbackMessage: "Acquisition research update failed." });
    return;
  }
  if (req.method === "POST" && requestPath === "/api/platform/acquisition/operator-decision") {
    await handleProtectedPost(req, res, async ({ req: protectedRequest, authContext }) => {
      assertPlatformKnowledgeOwner(authContext);
      const body = await readValidatedJsonRequest(protectedRequest, validateAcquisitionOperatorDecisionRequest);
      return mutateAcquisitionOperatorDecision(body, authContext);
    }, { fallbackMessage: "Company screening decision failed." });
    return;
  }
  if (req.method === "POST" && requestPath === "/api/platform/acquisition/operator-decisions/bulk") {
    await handleProtectedPost(req, res, async ({ req: protectedRequest, authContext }) => {
      assertPlatformKnowledgeOwner(authContext);
      const body = await readValidatedJsonRequest(protectedRequest, validateAcquisitionOperatorBulkDecisionRequest);
      return mutateAcquisitionOperatorBulkDecision(body, authContext);
    }, { fallbackMessage: "Company page selection failed." });
    return;
  }
  if (req.method === "POST" && requestPath === "/api/platform/acquisition/operator-cohort") {
    await handleProtectedPost(req, res, async ({ req: protectedRequest, authContext }) => {
      assertPlatformKnowledgeOwner(authContext);
      const body = await readValidatedJsonRequest(protectedRequest, validateAcquisitionOperatorCohortRequest);
      return freezeSelectedAcquisitionOperatorCohort(body, authContext);
    }, { fallbackMessage: "Research cohort freeze failed." });
    return;
  }
  if (req.method === "POST" && requestPath === "/api/platform/acquisition/operator-research-job") {
    await handleProtectedPost(req, res, async ({ req: protectedRequest, authContext }) => {
      assertPlatformKnowledgeOwner(authContext);
      const body = await readValidatedJsonRequest(protectedRequest, validateAcquisitionOperatorResearchJobRequest);
      return mutateAcquisitionOperatorResearchJob(body, authContext);
    }, { fallbackMessage: "Research job update failed." });
    return;
  }
  await handleProtectedGetRoutes(req, res, PLATFORM_GET_ROUTES);
}
