import { createToolRegistry, ToolRegistryError } from "../server/tools/registry.mjs";
import { getRegisteredCopilotTools } from "../server/copilot-tools.mjs";
import { INCIDENT_TOOL_NAMES } from "../server/tools/incidents.mjs";

function assert(condition, message, context = null) {
  if (condition) return;
  console.error(`FAILED: ${message}`);
  if (context) console.error(JSON.stringify(context, null, 2));
  process.exit(1);
}

const registry = createToolRegistry();
registry.register("echo", ({ value }) => ({ handled: true, tool: "echo", text: value }), { domain: "test" });
assert(registry.dispatch("echo", { value: "ok" }).text === "ok", "registered tool did not dispatch");
assert(registry.list()[0]?.meta?.domain === "test", "tool metadata was not retained");

const unknown = registry.dispatch("missing");
assert(unknown.handled === true && unknown.safeRefusal === true, "unknown tool did not fail closed", unknown);
assert(unknown.error?.code === "unknown_tool", "unknown tool did not expose a structured error", unknown);

let duplicateError = null;
try {
  registry.register("echo", () => null);
} catch (error) {
  duplicateError = error;
}
assert(duplicateError instanceof ToolRegistryError, "duplicate registration did not throw ToolRegistryError", duplicateError);
assert(duplicateError?.code === "duplicate_tool_registration", "duplicate registration used the wrong error code", duplicateError);

const registeredTools = getRegisteredCopilotTools();
assert(registeredTools.length >= 30, "copilot registry is missing expected tool families", registeredTools);
assert(new Set(registeredTools.map((entry) => entry.name)).size === registeredTools.length, "copilot registry contains duplicate names", registeredTools);
assert(registeredTools.every((entry) => entry.meta?.domain), "copilot registry contains tools without domain ownership", registeredTools);
assert(registeredTools.every((entry) => entry.meta?.capability?.temporalScope), "copilot registry contains tools without temporal capability metadata", registeredTools);
for (const required of ["community_profile", "community_history", "incident_breakdown", "slice_discovery", "census_trend", "resident_lookup", "medication_profile", "export_csv"]) {
  assert(registeredTools.some((entry) => entry.name === required), `copilot registry is missing ${required}`, registeredTools);
}
const registeredIncidentTools = registeredTools
  .filter((entry) => entry.meta?.domain === "incidents")
  .map((entry) => entry.name)
  .sort();
assert(
  JSON.stringify(registeredIncidentTools) === JSON.stringify([...INCIDENT_TOOL_NAMES].sort()),
  "incident registry ownership does not match the incident domain manifest",
  { registeredIncidentTools, incidentToolNames: INCIDENT_TOOL_NAMES }
);

console.log(`tool registry checks passed (${registeredTools.length} registered tools)`);
