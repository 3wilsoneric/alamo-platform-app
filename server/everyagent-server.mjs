import { createEveryAgentAuthorizer } from "./everyagent-auth.mjs";
import { createEveryAgentHttpServer } from "./everyagent-host.mjs";
import { createEveryAgentService } from "./everyagent-service.mjs";

// The public API owns no scheduler and reads no source app directly. Existing
// worker state is retained through the injected production persistence adapter.
if (process.env.NODE_ENV !== "production") throw new Error("The agent service requires production mode and durable storage.");
const split = value => String(value ?? "").split(",").map(item => item.trim()).filter(Boolean);
const authorize = createEveryAgentAuthorizer({ tenantId: process.env.ALAMOAGENT_ENTRA_TENANT_ID,
  audience: process.env.ALAMOAGENT_ENTRA_API_AUDIENCE, clientIds: split(process.env.ALAMOAGENT_ENTRA_CLIENT_IDS),
  scope: process.env.ALAMOAGENT_ENTRA_SCOPE || "access_as_user" });
const server = createEveryAgentHttpServer({ authorize, service: createEveryAgentService(), origins: split(process.env.ALAMOAGENT_BROWSER_ORIGINS) });
const port = Number(process.env.PORT || 8080);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Choose a valid service port.");
server.listen(port, "0.0.0.0", () => console.log("AlamoAgent API is listening."));
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => {
  server.close();
  setTimeout(() => server.closeAllConnections(), 5000).unref();
});
