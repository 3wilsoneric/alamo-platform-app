import { registerEveryAgentFunctions } from "./everyagent-functions.mjs";
import { createEveryAgentWorkflowService } from "./everyagent-workflow-service.mjs";
import { createEveryAgentSourceRuntime } from "./everyagent-source-runtime.mjs";

// A deployed worker must never silently fall back to a machine-local state
// file. The host integration test injects an isolated store through the factory.
if (process.env.NODE_ENV !== "production") throw new Error("The deployed agent worker requires NODE_ENV=production and managed-identity storage.");
const source = createEveryAgentSourceRuntime();
registerEveryAgentFunctions({ service: createEveryAgentWorkflowService({ adapters: source.adapters, sourceAccess: source.authorize }) });
