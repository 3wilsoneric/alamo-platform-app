import { AGENT_CONVERSATIONS_PATH, conversationId } from "../shared/everyagent-conversations.mjs";
import { readJsonRequestBody } from "./http-body.mjs";
import { createHttpError } from "./http-error-contract.mjs";

// Called only after the shared HTTP handler verifies the agent-targeted token.
export async function handleConversationHttp(req, res, auth, service) {
  const url = new URL(req.url, "https://agent.invalid");
  if (url.pathname !== AGENT_CONVERSATIONS_PATH || !service) throw createHttpError(404, "not_found", "Not found.");
  if (req.method === "GET") {
    const id = url.searchParams.get("id");
    if ([...url.searchParams.keys()].some(key => key !== "id") || url.searchParams.getAll("id").length > 1 || (id !== null && !conversationId(id))) throw createHttpError(400, "conversation_query_invalid", "Choose a valid chat.");
    res.status(200).json(await service.read(auth, id)); return;
  }
  if (req.method === "POST" && !url.search) { res.status(200).json(await service.command(auth, await readJsonRequestBody(req, 32_768))); return; }
  res.setHeader("Allow", "GET, POST");
  throw createHttpError(405, "method_not_allowed", "Method not allowed.");
}
