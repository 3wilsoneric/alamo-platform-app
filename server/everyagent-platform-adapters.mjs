import { createEveryAgentAdapters } from "./everyagent-adapters.mjs";
import { getLicensingLibrary, getLicensingUpdates } from "./licensing-library.mjs";
import { getPipelineAdmissionsSummary } from "./pipeline-admissions-summary.mjs";

// Only the Platform composition layer imports its source implementations.
// The agent API and workflow core receive adapters through their contracts.
export function createEveryAgentPlatformAdapters() {
  return createEveryAgentAdapters({ licensing: getLicensingLibrary, updates: getLicensingUpdates, pipeline: getPipelineAdmissionsSummary });
}
