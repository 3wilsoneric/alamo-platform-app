import { createEveryAgentAuthorizer } from "./everyagent-auth.mjs";
import { createEveryAgentHttpServer } from "./everyagent-host.mjs";
import { createEveryAgentService } from "./everyagent-service.mjs";
import { createEveryAgentSourceRuntime } from "./everyagent-source-runtime.mjs";
import { createConversationService } from "./everyagent-conversations.mjs";

// The public API owns no scheduler or source implementation. It rechecks source
// grants over HTTP before exposing the existing persisted work projection.
if (process.env.NODE_ENV !== "production") throw new Error("The agent service requires production mode and durable storage.");
const split = value => String(value ?? "").split(",").map(item => item.trim()).filter(Boolean);
const authorize = createEveryAgentAuthorizer({ tenantId: process.env.ALAMOAGENT_ENTRA_TENANT_ID,
  audience: process.env.ALAMOAGENT_ENTRA_API_AUDIENCE, clientIds: split(process.env.ALAMOAGENT_ENTRA_CLIENT_IDS),
  scope: process.env.ALAMOAGENT_ENTRA_SCOPE || "access_as_user" });
const source = createEveryAgentSourceRuntime();
const chatClients = split(process.env.ALAMOAGENT_CHAT_CLIENT_IDS);
if (chatClients.some(id => !split(process.env.ALAMOAGENT_ENTRA_CLIENT_IDS).includes(id))) throw new Error("Chat clients must be registered agent API clients.");
const conversations = chatClients.length ? createConversationService({ source, clientIds: chatClients }) : null;
const server = createEveryAgentHttpServer({ authorize, service: createEveryAgentService({ sourceAccess: source.authorize, portableLinks: true }),
  conversations, webRoot: process.env.ALAMOAGENT_WEB_ROOT ?? "", origins: split(process.env.ALAMOAGENT_BROWSER_ORIGINS) });
const port = Number(process.env.PORT || 8080);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("Choose a valid service port.");
server.listen(port, "0.0.0.0", () => console.log("AlamoAgent API is listening."));
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => {
  server.close();
  setTimeout(() => server.closeAllConnections(), 5000).unref();
});
