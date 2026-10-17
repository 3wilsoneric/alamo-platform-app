import { EVERYAGENT_API_PATH } from "../shared/everyagent-client.mjs";
import { readJsonRequestBody } from "./http-body.mjs";
import { applyProtectedApiHeaders } from "./http-response.mjs";
import { HttpError } from "./http-error-contract.mjs";
import { AGENT_CONVERSATIONS_PATH } from "../shared/everyagent-conversations.mjs";
import { handleConversationHttp } from "./everyagent-conversation-http.mjs";

// Shared by the Platform compatibility facade and the independent agent host.
// Both inject a verified identity provider; this layer has no auth bypass.
export function createEveryAgentRequestHandler({ authorize, service, conversations = /** @type {any} */ (null), paths = [EVERYAGENT_API_PATH] }) {
  if (typeof authorize !== "function" || !service) throw new Error("Agent identity and service are required.");
  return async (req, res) => {
    applyProtectedApiHeaders(res);
    try {
      const auth = await authorize(req);
      const pathname = String(req.url ?? "").split("?", 1)[0] ?? "";
      if (pathname === AGENT_CONVERSATIONS_PATH) { await handleConversationHttp(req, res, auth, conversations); return; }
      if (!paths.includes(pathname)) { res.status(404).json({ error: "Not found." }); return; }
      if (req.method === "GET") { res.status(200).json(await service.overview(auth)); return; }
      if (req.method === "POST") { res.status(200).json(await service.command(auth, await readJsonRequestBody(req, 4096))); return; }
      res.setHeader("Allow", "GET, POST");
      res.status(405).json({ error: "Method not allowed." });
    } catch (error) {
      const publicError = error instanceof HttpError && Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500 ? error : null;
      const status = publicError?.statusCode ?? 503;
      // Connector/provider errors may contain sensitive context. Never echo
      // them, even when this host runs locally.
      res.status(status).json({ error: publicError?.message ?? "AlamoAgent is temporarily unavailable. Try again later.",
        code: publicError?.code ?? null });
    }
  };
}
