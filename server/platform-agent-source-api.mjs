import { AGENT_SOURCE_PATH, validateAgentSourceRequest } from "../shared/everyagent-source-contracts.mjs";
import { portableEveryAgentEvidence } from "../shared/everyagent-links.mjs";
import { createPlatformAgentSourceAuthorizer } from "./platform-agent-source-auth.mjs";
import { authorizePlatformAgentSource, readPlatformAgentSourceGrants } from "./platform-agent-source-grants.mjs";
import { createEveryAgentPlatformAdapters } from "./everyagent-platform-adapters.mjs";
import { validateEveryAgentWorkflowResult } from "./everyagent-workflow-validation.mjs";
import { readJsonRequestBody } from "./http-body.mjs";
import { applyProtectedApiHeaders } from "./http-response.mjs";
import { HttpError, createHttpError } from "./http-error-contract.mjs";

export function createPlatformAgentSourceHandler({ authorize, readGrants, adapters, now = () => Date.now() }) {
  return async (req, res) => {
    applyProtectedApiHeaders(res);
    try {
      const identity = await authorize(req);
      if (req.url !== AGENT_SOURCE_PATH) throw createHttpError(404, "not_found", "Not found.");
      if (req.method !== "POST") { res.setHeader("Allow", "POST"); throw createHttpError(405, "method_not_allowed", "Method not allowed."); }
      let input;
      try { input = validateAgentSourceRequest(await readJsonRequestBody(req, 4096)); }
      catch (error) { if (error instanceof HttpError) throw error; throw createHttpError(400, "source_request_invalid", "Choose a valid source operation and scope."); }
      const grant = authorizePlatformAgentSource(identity, input, await readGrants(), now());
      const assignment = { userId: input.subjectId, skillId: input.skillId, communityIds: input.communityIds };
      const result = input.operation === "read" ? validateEveryAgentWorkflowResult(await adapters[input.skillId](assignment), assignment) : null;
      // Recheck the source registry after I/O so a response cannot carry data
      // under a grant revoked or changed while the source was being read.
      const latest = authorizePlatformAgentSource(identity, input, await readGrants(), now());
      if (grant.revision !== latest.revision) throw createHttpError(403, "source_grant_changed", "Source access changed. Retry the assignment.");
      if (result) result.entries = result.entries.map(entry => ({ ...entry,
        evidence: entry.evidence.map(item => portableEveryAgentEvidence(item, entry.fingerprint)) }));
      res.status(200).json({ ...input, grant: latest, result: result ? validateEveryAgentWorkflowResult(result, assignment) : null });
    } catch (error) {
      const publicError = error instanceof HttpError && error.statusCode >= 400 && error.statusCode < 500 ? error : null;
      res.status(publicError?.statusCode ?? 503).json({ error: publicError?.message ?? "The source connector is temporarily unavailable.", code: publicError?.code ?? null });
    }
  };
}

let handler;
export async function handlePlatformAgentSourceRequest(req, res) {
  if (!process.env.PLATFORM_AGENT_SOURCE_AUDIENCE?.trim()) {
    applyProtectedApiHeaders(res); res.status(503).json({ error: "The source connector is not configured." }); return;
  }
  handler ??= createPlatformAgentSourceHandler({ authorize: createPlatformAgentSourceAuthorizer({ audience: process.env.PLATFORM_AGENT_SOURCE_AUDIENCE }),
    readGrants: readPlatformAgentSourceGrants, adapters: createEveryAgentPlatformAdapters() });
  return handler(req, res);
}
