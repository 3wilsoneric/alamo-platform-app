import http from "node:http";
import {
  getCommunitySnapshotData,
  getAnalystQaStatus,
  getCommunitiesDashboardData,
  getDataExplorerData,
  getHomeDashboardData,
  getPlatformBootstrap,
  getPlatformHealth,
  getPlatformSnapshotHealth,
  getPlatformSnapshotMetadata,
  getReportsSummaryData
} from "./platform-data.mjs";
import { projectCommunityCensusSnapshot } from "./community-snapshot-projections.mjs";
import { createHttpError, getApiError, getRequestUrl } from "./http-errors.mjs";
import { getDatabricksOAuthConfig, queryDatabricksOAuth } from "./databricks.mjs";
import { getClaudeCopilotHealth, sendClaudeCopilotMessage } from "./claude-copilot.mjs";
import { compileCopilotIntent, resetAnalysisSession, runCopilotTool } from "./copilot-tools.mjs";
import {
  validateClaudeMessageRequest,
  validateCopilotIntentRequest,
  validateCopilotToolRequest,
  validateFullReportRequest,
  validateGovernedReportRequest,
  validateSessionResetRequest
} from "./http-request-schema.mjs";
import { getAnalystTraceTelemetry } from "./tools/turn-trace.mjs";
import { getApiSessionOwnerKey, requireApiUser } from "./api-auth.mjs";
import { readValidatedJsonRequest } from "./http-body.mjs";
import { appendResponseVaryHeader, applyProtectedApiHeaders } from "./http-response.mjs";
import { getIncidentFeedResponse, isLiveIncidentFeedRequest } from "./incident-feed.mjs";
import {
  createGovernedReport,
  deliverGovernedReport,
  getGovernedReportDeliveryStatus,
  getSignedInUserEmail
} from "./governed-reporting.mjs";
import { getWeeklyBriefingPlanSummary, runWeeklyBriefings } from "./weekly-briefings.mjs";
import { createFullReport, getFullReportDefinitions } from "./full-reporting.mjs";
import {
  handlePipelineClinicalApiRequest,
  isPipelineClinicalPath
} from "./pipeline-clinical-api.mjs";

const PORT = Number(process.env.API_PORT || process.env.PORT || 3002);
const LOOPBACK_DEV_ORIGIN = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

function getAllowedDevApiOrigins() {
  const configured = String(process.env.DEV_API_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured);
}

function isAllowedDevApiOrigin(origin) {
  const configured = getAllowedDevApiOrigins();
  return configured.size ? configured.has(origin) : LOOPBACK_DEV_ORIGIN.test(origin);
}

function applyDevCors(req, res) {
  const origin = String(req.headers.origin ?? "").trim();
  if (!origin) return true;
  if (!isAllowedDevApiOrigin(origin)) return false;

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  appendResponseVaryHeader(res, "Origin");
  return true;
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json"
  });
  res.end(JSON.stringify(body));
}

function sendApiError(res, error) {
  const response = getApiError(error);
  sendJson(res, response.statusCode, response.body);
}

function createVercelResponseAdapter(res) {
  return {
    statusCode: 200,
    getHeader: (name) => res.getHeader(name),
    setHeader: (name, value) => res.setHeader(name, value),
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      sendJson(res, this.statusCode, body);
    }
  };
}

const server = http.createServer(async (req, res) => {
  applyProtectedApiHeaders(res);

  if (!req.url) {
    sendJson(res, 400, { error: "Missing request URL." });
    return;
  }

  let requestUrl;
  try {
    requestUrl = getRequestUrl(req, `http://localhost:${PORT}`);
  } catch (error) {
    sendApiError(res, error);
    return;
  }

  if (!applyDevCors(req, res)) {
    sendJson(res, 403, { error: "Origin not allowed." });
    return;
  }

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (isPipelineClinicalPath(requestUrl.pathname)) {
    await handlePipelineClinicalApiRequest(req, createVercelResponseAdapter(res));
    return;
  }

  let authContext;
  let sessionOwnerKey;
  try {
    authContext = await requireApiUser(req);
    sessionOwnerKey = getApiSessionOwnerKey(authContext);
  } catch (error) {
    sendApiError(res, error);
    return;
  }

  if (
    req.method === "GET" &&
    requestUrl.pathname === "/api/chat/claude/health"
  ) {
    sendJson(res, 200, getClaudeCopilotHealth());
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/chat/claude/message") {
    try {
      const body = await readValidatedJsonRequest(req, validateClaudeMessageRequest);
      sendJson(res, 200, await sendClaudeCopilotMessage({ ...body, sessionOwnerKey }));
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/chat/tools") {
    try {
      const body = await readValidatedJsonRequest(req, validateCopilotToolRequest);
      sendJson(res, 200, await runCopilotTool({ ...body, sessionOwnerKey }));
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/chat/intent") {
    try {
      const body = await readValidatedJsonRequest(req, validateCopilotIntentRequest);
      sendJson(res, 200, await compileCopilotIntent({ ...body, sessionOwnerKey }));
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/chat/session/reset") {
    try {
      const body = await readValidatedJsonRequest(req, validateSessionResetRequest);
      sendJson(res, 200, resetAnalysisSession(body?.sessionId, sessionOwnerKey));
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/reports/status") {
    sendJson(res, 200, {
      ...getGovernedReportDeliveryStatus(),
      weekly: getWeeklyBriefingPlanSummary()
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/reports/full/definitions") {
    sendJson(res, 200, getFullReportDefinitions());
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/reports/full/create") {
    try {
      const body = await readValidatedJsonRequest(req, validateFullReportRequest);
      sendJson(res, 200, await createFullReport(body));
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/reports/create") {
    try {
      const body = await readValidatedJsonRequest(req, validateGovernedReportRequest);
      sendJson(res, 200, await createGovernedReport(body));
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/reports/email") {
    try {
      const body = await readValidatedJsonRequest(req, validateGovernedReportRequest);
      const recipient = getSignedInUserEmail(authContext);
      if (!recipient) {
        throw createHttpError(
          422,
          "report_email_identity_missing",
          "Your Microsoft sign-in does not include an email address for delivery."
        );
      }
      const reportPackage = await createGovernedReport(body);
      sendJson(res, 200, await deliverGovernedReport({ reportPackage, recipients: [recipient] }));
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/reports/weekly/preview") {
    try {
      sendJson(res, 200, await runWeeklyBriefings({ deliver: false }));
    } catch (error) {
      sendApiError(res, error);
    }
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  try {
    if (requestUrl.pathname === "/api/platform/health") {
      sendJson(res, 200, await getPlatformHealth());
      return;
    }

    if (requestUrl.pathname === "/api/platform/analyst-qa") {
      sendJson(res, 200, await getAnalystQaStatus());
      return;
    }

    if (requestUrl.pathname === "/api/platform/analyst-traces") {
      sendJson(res, 200, getAnalystTraceTelemetry());
      return;
    }

    if (requestUrl.pathname === "/api/debug/databricks") {
      const config = getDatabricksOAuthConfig();
      const rows = await queryDatabricksOAuth("SELECT current_user() AS current_user");
      const firstRow = rows[0] ?? {};

      sendJson(res, 200, {
        ok: true,
        authType: "databricks-oauth",
        host: config.host,
        path: config.path,
        warehouseId: config.path.split("/").pop() ?? null,
        currentUser: firstRow.current_user ?? firstRow.CURRENT_USER ?? null,
        rowCount: rows.length
      });
      return;
    }

    if (requestUrl.pathname === "/api/platform/bootstrap") {
      sendJson(res, 200, await getPlatformBootstrap());
      return;
    }

    if (requestUrl.pathname === "/api/platform/snapshot-metadata") {
      sendJson(res, 200, await getPlatformSnapshotMetadata());
      return;
    }

    if (requestUrl.pathname === "/api/platform/snapshot-health") {
      sendJson(res, 200, await getPlatformSnapshotHealth());
      return;
    }

    if (requestUrl.pathname === "/api/data-explorer") {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      sendJson(res, 200, await getDataExplorerData(requestUrl.searchParams.get("kind") ?? "incidents"));
      return;
    }

    if (requestUrl.pathname === "/api/home-dashboard") {
      sendJson(res, 200, await getHomeDashboardData());
      return;
    }

    if (requestUrl.pathname === "/api/communities/dashboard") {
      sendJson(res, 200, await getCommunitiesDashboardData());
      return;
    }

    if (requestUrl.pathname === "/api/communities/snapshot") {
      const facilityId = requestUrl.searchParams.get("facilityId");

      if (!facilityId) {
        sendJson(res, 400, { error: "Missing facilityId." });
        return;
      }

      sendJson(res, 200, requestUrl.searchParams.get("view") === "census"
        ? projectCommunityCensusSnapshot(await getCommunitySnapshotData(facilityId))
        : await getCommunitySnapshotData(facilityId));
      return;
    }

    if (requestUrl.pathname === "/api/incidents") {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      sendJson(res, 200, await getIncidentFeedResponse({
        live: isLiveIncidentFeedRequest(req.url)
      }));
      return;
    }

    if (requestUrl.pathname === "/api/analytics-summary") {
      sendJson(res, 200, await getReportsSummaryData({ includeAnalystHistory: false }));
      return;
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    sendApiError(res, error);
  }
});

server.listen(PORT, () => {
  console.log(`Databricks API server listening on http://localhost:${PORT}`);
});

server.on("error", (error) => {
  console.error("Databricks API server failed to start:", error);
  process.exit(1);
});
