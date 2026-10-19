import { createEveryAgentService } from "./everyagent-service.mjs";
import { requireApiUser } from "./api-auth.mjs";
import { createEveryAgentPlatformAdapters } from "./everyagent-platform-adapters.mjs";
import { createEveryAgentRequestHandler } from "./everyagent-http.mjs";

let service;
function runtime() { return service ??= createEveryAgentService({ adapters: createEveryAgentPlatformAdapters() }); }

// All replicas share a durable lease. Work resumes on the next tick after a
// restart; the scheduler never depends on an open browser or a user's token.
if (process.env.EVERYAGENT_WORKER_ENABLED === "true" && process.env.EVERYAGENT_WORKER_MODE !== "durable") {
  const check = () => { void Promise.resolve().then(() => runtime().tick()).catch(() => console.warn("EveryAgent check could not complete; next tick will retry.")); };
  setTimeout(check, 5_000).unref();
  setInterval(check, 60_000).unref();
}

export async function handleEveryAgentRequest(req, res) {
  return createEveryAgentRequestHandler({ authorize: requireApiUser,
    service: { overview: auth => runtime().overview(auth), command: (auth, input) => runtime().command(auth, input) },
    paths: ["/api/platform/everyagent"] })(req, res);
}
