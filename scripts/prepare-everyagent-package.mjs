import path from "node:path";
import { prepareAgentPackage } from "@alamo/agent-runtime/packaging";

// Compatibility command: source/dependency ownership belongs to AlamoAgent.
// Platform may attach its existing optional browser bundle after engine build.
export async function prepareEveryAgentPackage(kind) {
  await prepareAgentPackage(kind, { destination: path.resolve(`generated/everyagent-${kind}`),
    ...(kind === "service" ? { webRoot: path.resolve("generated/everyagent-web") } : {}) });
}
