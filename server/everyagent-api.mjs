import { createEveryAgentService } from "./everyagent-service.mjs";
import { requireApiUser } from "./api-auth.mjs";
import { readJsonRequestBody } from "./http-body.mjs";
import { applyProtectedApiHeaders } from "./http-response.mjs";
import { getApiError } from "./http-errors.mjs";

let service;
function runtime() { return service ??= createEveryAgentService(); }

// All replicas share a durable lease. Work resumes on the next tick after a
// restart; the scheduler never depends on an open browser or a user's token.
if (process.env.EVERYAGENT_WORKER_ENABLED === "true" && process.env.EVERYAGENT_WORKER_MODE !== "durable") {
  const check = () => { void Promise.resolve().then(() => runtime().tick()).catch(() => console.warn("EveryAgent check could not complete; next tick will retry.")); };
  setTimeout(check, 5_000).unref();
  setInterval(check, 60_000).unref();
}

export async function handleEveryAgentRequest(req, res) {
  applyProtectedApiHeaders(res);
  try {
    const auth = await requireApiUser(req);
    const pathname = String(req.url ?? "").split("?", 1)[0];
    if (pathname !== "/api/platform/everyagent") { res.status(404).json({ error: "Not found." }); return; }
    if (req.method === "GET") { res.status(200).json(await runtime().overview(auth)); return; }
    if (req.method === "POST") { res.status(200).json(await runtime().command(auth, await readJsonRequestBody(req, 4096))); return; }
    res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    const result = getApiError(error, "EveryAgent is temporarily unavailable. Try again later.");
    res.status(result.statusCode).json(result.body);
  }
}
