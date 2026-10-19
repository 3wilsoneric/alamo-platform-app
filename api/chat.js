import { getClaudeCopilotHealth, sendClaudeCopilotMessage } from "../server/claude-copilot.mjs";
import { compileCopilotIntent, resetAnalysisSession, runCopilotTool } from "../server/copilot-tools.mjs";
import {
  validateClaudeMessageRequest,
  validateCopilotIntentRequest,
  validateCopilotToolRequest,
  validateSessionResetRequest
} from "../server/http-request-schema.mjs";
import { getApiSessionOwnerKey, requireApiUser } from "../server/api-auth.mjs";
import { getApiError, getRequestUrl } from "../server/http-errors.mjs";
import { readValidatedJsonRequest } from "../server/http-body.mjs";
import { applyProtectedApiHeaders } from "../server/http-response.mjs";

function sendApiError(res, error) {
  const response = getApiError(error, "Chat request failed.");
  res.status(response.statusCode).json(response.body);
}

export default async function handler(req, res) {
  applyProtectedApiHeaders(res);

  try {
    const pathname = getRequestUrl(req).pathname;
    const authContext = await requireApiUser(req);
    const sessionOwnerKey = getApiSessionOwnerKey(authContext);

    if (req.method === "GET" && pathname === "/api/chat/claude/health") {
      res.status(200).json(getClaudeCopilotHealth());
      return;
    }

    if (req.method === "POST" && pathname === "/api/chat/claude/message") {
      const body = await readValidatedJsonRequest(req, validateClaudeMessageRequest);
      res.status(200).json(await sendClaudeCopilotMessage({ ...body, sessionOwnerKey }));
      return;
    }

    if (req.method === "POST" && pathname === "/api/chat/tools") {
      const body = await readValidatedJsonRequest(req, validateCopilotToolRequest);
      res.status(200).json(await runCopilotTool({ ...body, sessionOwnerKey }));
      return;
    }

    if (req.method === "POST" && pathname === "/api/chat/intent") {
      const body = await readValidatedJsonRequest(req, validateCopilotIntentRequest);
      res.status(200).json(await compileCopilotIntent({ ...body, sessionOwnerKey }));
      return;
    }

    if (req.method === "POST" && pathname === "/api/chat/session/reset") {
      const body = await readValidatedJsonRequest(req, validateSessionResetRequest);
      res.status(200).json(resetAnalysisSession(body.sessionId, sessionOwnerKey));
      return;
    }

    res.status(404).json({ error: "Not found." });
  } catch (error) {
    sendApiError(res, error);
  }
}
