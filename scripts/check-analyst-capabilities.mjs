import {
  ANALYST_CAPABILITY_REGISTRY,
  ANALYST_EXECUTION_MODES,
  getAnswerFormatContractById,
  getAnswerFormatContractForTool,
  getAnalystCapability,
  getAnalystCapabilitiesForTool,
  isDeterministicOnlyCapability,
  shouldEscalateCapabilityToClaude,
  summarizeCapabilityModes
} from "../shared/analyst-capability-registry.mjs";
import { CERTIFIED_ANALYST_QUESTIONS } from "../shared/certified-analyst-questions.mjs";
import { getRegisteredCopilotTools } from "../server/copilot-tools.mjs";

function assert(condition, message, context = null) {
  if (condition) return;
  console.error(`FAILED: ${message}`);
  if (context) console.error(JSON.stringify(context, null, 2));
  process.exit(1);
}

const certifiedIds = new Set(CERTIFIED_ANALYST_QUESTIONS.map((question) => question.id));
const capabilityIds = new Set(ANALYST_CAPABILITY_REGISTRY.map((capability) => capability.id));
const registeredTools = new Set(getRegisteredCopilotTools().map((entry) => entry.name));
const executionModes = new Set(Object.values(ANALYST_EXECUTION_MODES));

assert(
  ANALYST_CAPABILITY_REGISTRY.length === CERTIFIED_ANALYST_QUESTIONS.length,
  "capability registry must cover every certified analyst question",
  {
    certifiedCount: CERTIFIED_ANALYST_QUESTIONS.length,
    capabilityCount: ANALYST_CAPABILITY_REGISTRY.length
  }
);

for (const question of CERTIFIED_ANALYST_QUESTIONS) {
  const capability = getAnalystCapability(question.id);
  assert(Boolean(capability), "certified question is missing a capability contract", question);
  assert(capability.preferredTool === question.preferredTool, "capability preferred tool drifted from certified question", { question, capability });
  assert(capability.answerStyle === question.answerStyle, "capability answer style drifted from certified question", { question, capability });
  assert(capability.cacheFamily === question.cacheFamily, "capability cache family drifted from certified question", { question, capability });
}

for (const capability of ANALYST_CAPABILITY_REGISTRY) {
  assert(certifiedIds.has(capability.id), "capability is not backed by a certified question", capability);
  assert(capabilityIds.has(capability.id), "capability id was not indexed", capability);
  assert(registeredTools.has(capability.preferredTool), "capability preferred tool is not registered", capability);
  assert(executionModes.has(capability.executionMode), "capability has an unknown execution mode", capability);
  assert(capability.title && capability.description, "capability needs user-facing title and description", capability);
  assert(capability.examples.length > 0, "capability needs prompt examples for QA generation", capability);
  assert(capability.dataContract?.temporalScope, "capability is missing a tool data contract", capability);
  assert(capability.claudeRole.includes("Claude"), "capability must define Claude's allowed role", capability);
  const answerFormatContract = getAnswerFormatContractById(capability.answerFormat);
  assert(answerFormatContract.id === capability.answerFormat, "capability answer format contract is missing", capability);
  assert(
    answerFormatContract.id === "generic" || answerFormatContract.tools.includes(capability.preferredTool),
    "capability answer format does not cover preferred tool",
    { capability, answerFormatContract }
  );

  if (isDeterministicOnlyCapability(capability)) {
    assert(
      !shouldEscalateCapabilityToClaude(capability, { content: "why is this happening and what should we do" }),
      "deterministic-only capability escalated to Claude",
      capability
    );
  }

  const toolAnswerContract = getAnswerFormatContractForTool(capability.preferredTool);
  if (toolAnswerContract) {
    assert(
      toolAnswerContract.id === capability.answerFormat || capability.answerFormat === "generic",
      "tool answer format mapping drifted from capability answer format",
      { capability, toolAnswerContract }
    );
  }
}

const modeSummary = summarizeCapabilityModes();
assert(
  (modeSummary.deterministic_only ?? 0) >= 20,
  "most certified families should stay deterministic-only",
  modeSummary
);
assert(
  (modeSummary.verified_synthesis_optional ?? 0) >= 4,
  "registry should preserve verified synthesis families",
  modeSummary
);
assert(
  (modeSummary.agentic_synthesis ?? 0) >= 1,
  "registry should include at least one high-leverage agentic synthesis family",
  modeSummary
);

const countCapability = getAnalystCapability("incident-unique-people-count");
assert(countCapability?.executionMode === "deterministic_only", "AWOL people count must remain deterministic-only", countCapability);

const operatingCapability = getAnalystCapability("operating-snapshot");
assert(
  shouldEscalateCapabilityToClaude(operatingCapability, { content: "where are we operationally and what should we look at" }),
  "operating snapshot should be Claude-eligible for high-leverage synthesis",
  operatingCapability
);

for (const tool of registeredTools) {
  const capabilities = getAnalystCapabilitiesForTool(tool);
  if (!capabilities.length) continue;
  assert(
    capabilities.every((capability) => capability.preferredTool === tool),
    "tool-to-capability index returned a mismatched tool",
    { tool, capabilities }
  );
}

console.log(
  `analyst capability checks passed (${ANALYST_CAPABILITY_REGISTRY.length} capabilities; ` +
  `${modeSummary.deterministic_only ?? 0} deterministic, ` +
  `${modeSummary.verified_synthesis_optional ?? 0} synthesis-optional, ` +
  `${modeSummary.agentic_synthesis ?? 0} agentic)`
);
