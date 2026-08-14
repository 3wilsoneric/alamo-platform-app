import {
  getAnalystQaStatus,
  getPlatformBootstrap,
  getPlatformHealth,
  getPlatformSnapshotHealth,
  getPlatformSnapshotMetadata
} from "../server/platform-data.mjs";
import { getAnalystTraceTelemetry } from "../server/tools/turn-trace.mjs";
import { handleProtectedGetRoutes } from "../server/protected-get-handler.mjs";
import {
  handlePipelineClinicalApiRequest,
  PIPELINE_CLINICAL_API_PREFIX
} from "../server/pipeline-clinical-api.mjs";

const PLATFORM_GET_ROUTES = Object.freeze({
  "/api/platform/bootstrap": () => getPlatformBootstrap(),
  "/api/platform/health": () => getPlatformHealth(),
  "/api/platform/analyst-qa": () => getAnalystQaStatus(),
  "/api/platform/analyst-traces": () => getAnalystTraceTelemetry(),
  "/api/platform/snapshot-health": () => getPlatformSnapshotHealth(),
  "/api/platform/snapshot-metadata": () => getPlatformSnapshotMetadata()
});

export default async function handler(req, res) {
  if ((String(req.url ?? "").split("?", 1)[0] ?? "").startsWith(PIPELINE_CLINICAL_API_PREFIX)) {
    await handlePipelineClinicalApiRequest(req, res);
    return;
  }
  await handleProtectedGetRoutes(req, res, PLATFORM_GET_ROUTES);
}
