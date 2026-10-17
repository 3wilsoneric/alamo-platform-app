import { ManagedIdentityCredential } from "@azure/identity";
import { createEveryAgentSourceClient } from "./everyagent-source-client.mjs";

// The worker's identity is distinct from the Platform source/grant-store
// identity. Credentials live only here, never in tasks or orchestration inputs.
export function createEveryAgentSourceRuntime() {
  const origin = process.env.ALAMOAGENT_PLATFORM_ORIGIN;
  const scope = process.env.ALAMOAGENT_PLATFORM_SCOPE;
  const clientId = process.env.ALAMOAGENT_CONNECTOR_CLIENT_ID;
  const uuid = "[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}";
  if (!origin || !scope || !new RegExp(`^api://${uuid}/\\.default$`).test(scope) || !clientId || !new RegExp(`^${uuid}$`).test(clientId)) throw new Error("Configure the agent Platform connector origin, resource scope and workload identity.");
  const credential = new ManagedIdentityCredential(clientId);
  return createEveryAgentSourceClient({ origin, getToken: () => credential.getToken(scope, { abortSignal: AbortSignal.timeout(5000) }) });
}
