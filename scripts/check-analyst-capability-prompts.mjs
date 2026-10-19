import {
  applyAnalysisPatch,
  createExecutionPlan,
  deriveAnalysisPatch
} from "../shared/analysis-session-state.mjs";
import {
  ANALYST_CAPABILITY_REGISTRY,
  ANALYST_EXECUTION_MODES,
  getAnswerFormatContractById,
  isDeterministicOnlyCapability,
  shouldEscalateCapabilityToClaude
} from "../shared/analyst-capability-registry.mjs";
import { matchCertifiedQuestion } from "../shared/certified-analyst-questions.mjs";

const facilities = [
  { facility_id: "337", community_name: "A & A Health Services San Pablo", alias: "San Pablo" },
  { facility_id: "342", community_name: "Victoria's House", alias: "Victoria's House" },
  { facility_id: "343", community_name: "JC Wallace House", alias: "JC Wallace House" },
  { facility_id: "344", community_name: "AHS Turlock OP LLC", alias: "Turlock" },
  { facility_id: "345", community_name: "Santa Clarita", alias: "Santa Clarita" }
];

const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
const categories = [
  "AWOL/Elopement",
  "Medication Refusal",
  "Medical Emergency",
  "Substance Use",
  "Aggressive Behavior",
  "Fall"
];
const residents = [
  { resident_name: "Shannon Romero" },
  { resident_name: "Tuesday Woo" },
  { resident_name: "Audrey West" }
];
const frameOptions = {
  facilities,
  residents,
  availableMonths: months,
  categories
};

function assert(condition, message, context = null) {
  if (condition) return;
  console.error(`FAILED: ${message}`);
  if (context) console.error(JSON.stringify(context, null, 2));
  process.exit(1);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function promptVariants(example) {
  return unique([
    example,
    `${example}?`,
    `please ${example}`,
    `can you ${example}`,
    `${example} please`,
    `quickly ${example}`,
    `i need ${example}`
  ]);
}

function renderPromptVariables(prompt) {
  return String(prompt ?? "")
    .replace(/\{community\}/g, "San Pablo")
    .replace(/\{resident\}/g, "Shannon Romero")
    .replace(/\{incidentCategory\}/g, "AWOL/Elopement")
    .replace(/\{month\}/g, "May 2026")
    .replace(/\{startMonth\}/g, "May 2026")
    .replace(/\{endMonth\}/g, "June 2026")
    .replace(/\{medicationDetail\}/g, "medication refusal detail");
}

let generatedPrompts = 0;
let deterministicFamilies = 0;
let synthesisOptionalFamilies = 0;
let agenticFamilies = 0;

for (const capability of ANALYST_CAPABILITY_REGISTRY) {
  const contract = getAnswerFormatContractById(capability.answerFormat);
  assert(contract.id === capability.answerFormat, "capability answer format must resolve to a concrete contract", capability);
  assert(
    contract.tools.includes(capability.preferredTool) || contract.id === "generic",
    "capability answer format contract does not list the preferred tool",
    { capability, contract }
  );

  if (capability.executionMode === ANALYST_EXECUTION_MODES.deterministicOnly) deterministicFamilies += 1;
  if (capability.executionMode === ANALYST_EXECUTION_MODES.verifiedSynthesisOptional) synthesisOptionalFamilies += 1;
  if (capability.executionMode === ANALYST_EXECUTION_MODES.agenticSynthesis) agenticFamilies += 1;

  for (const prompt of capability.examples.map(renderPromptVariables).flatMap(promptVariants)) {
    const match = matchCertifiedQuestion(prompt, frameOptions);
    assert(match?.id === capability.id, "registry-generated prompt matched the wrong certified capability", {
      prompt,
      expectedId: capability.id,
      actualId: match?.id
    });

    const frame = applyAnalysisPatch(null, deriveAnalysisPatch(prompt, frameOptions));
    const plan = createExecutionPlan(frame, capability.preferredTool, { preferFallback: true });
    assert(plan.tool === capability.preferredTool, "registry-generated prompt did not route through the capability tool", {
      prompt,
      capability,
      frame,
      plan
    });

    if (isDeterministicOnlyCapability(capability)) {
      assert(
        !shouldEscalateCapabilityToClaude(capability, { content: prompt }),
        "deterministic capability escalated to Claude for its own prompt",
        { prompt, capability }
      );
      assert(
        !shouldEscalateCapabilityToClaude(capability, { content: `why ${prompt}` }),
        "deterministic capability escalated to Claude after synthesis wording",
        { prompt, capability }
      );
    }

    generatedPrompts += 1;
  }
}

assert(generatedPrompts >= 1000, "generated capability prompt suite is too small", { generatedPrompts });
assert(deterministicFamilies >= 20, "deterministic coverage is too low", { deterministicFamilies });
assert(synthesisOptionalFamilies >= 4, "verified synthesis coverage is too low", { synthesisOptionalFamilies });
assert(agenticFamilies >= 1, "agentic synthesis coverage is missing", { agenticFamilies });

console.log(
  `analyst capability prompt checks passed (${generatedPrompts} generated prompts; ` +
  `${deterministicFamilies} deterministic families, ` +
  `${synthesisOptionalFamilies} synthesis-optional families, ` +
  `${agenticFamilies} agentic families)`
);
