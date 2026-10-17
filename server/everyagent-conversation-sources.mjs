import { allowedAssignment, freshAssignment, grantFor } from "./everyagent-access.mjs";
import { validateEveryAgentWorkflowResult } from "./everyagent-workflow-validation.mjs";
import { portableEveryAgentEvidence } from "../shared/everyagent-links.mjs";
import { createHttpError } from "./http-error-contract.mjs";

const denied = () => createHttpError(403, "conversation_source_unavailable", "This chat's source access could not be verified. Its messages are hidden.");

export function createConversationSources({ workStore, source }) {
  async function authorize(chat) {
    const { value } = await workStore.read();
    const assignments = chat.scope.map(scope => {
      const skill = grantFor(chat.userId).find(item => item.id === scope.skillId);
      if (!skill) throw denied();
      const current = value.assignments.find(a => a.userId === chat.userId && a.skillId === scope.skillId) ?? freshAssignment(chat.userId, skill);
      if (!allowedAssignment(current) || !scope.communityIds.every(id => current.communityIds.includes(id))) throw denied();
      return { ...current, communityIds: scope.communityIds };
    });
    try { await Promise.all(assignments.map(assignment => source.authorize(assignment))); } catch { throw denied(); }
    if ((await workStore.read()).value.revision !== value.revision) throw denied();
    return assignments;
  }
  async function collect(chat) {
    const assignments = await authorize(chat);
    const results = await Promise.all(assignments.map(async assignment => {
      try {
        const result = validateEveryAgentWorkflowResult(await source.adapters[assignment.skillId](assignment), assignment);
        if (!result.sourceGrant) throw new Error("Missing source grant.");
        await source.authorize(assignment, result.sourceGrant);
        return { assignment, result };
      } catch { return { assignment, result: { connection: "unavailable", sourceCheckedAt: null, entries: [] } }; }
    }));
    const evidence = [];
    const receipts = [];
    for (const { assignment, result } of results) {
      if (result.sourceGrant) receipts.push({ assignment, grant: result.sourceGrant });
      const matching = chat.resourceIds?.length ? result.entries.filter(entry => entry.evidence.some(item => chat.resourceIds.includes(item.id))) : result.entries;
      const entries = matching.slice(0, 20);
      evidence.push({ id: `s${evidence.length + 1}`, skillId: assignment.skillId, title: `${assignment.skillId} availability`,
        text: `${result.connection}; ${entries.length} of ${matching.length} matching published entries included.${chat.workId ? ` Limited to the linked work's ${chat.resourceIds?.length ? "source references" : "skill and community scope"}; missing matches do not imply the record was deleted.` : ""} This is a bounded summary, not a complete record search.`,
        observedAt: result.sourceCheckedAt, links: [] });
      for (const entry of entries) evidence.push({ id: `s${evidence.length + 1}`, skillId: assignment.skillId, title: entry.title,
        text: entry.summary, observedAt: result.sourceCheckedAt,
        links: entry.evidence.slice(0, 4).map(item => portableEveryAgentEvidence(item, entry.fingerprint)) });
    }
    if (Buffer.byteLength(JSON.stringify(evidence)) > 64_000) throw new Error("The source context is too large.");
    await authorize(chat);
    return { evidence, receipts };
  }
  async function recheck(chat, receipts) {
    await authorize(chat);
    await Promise.all(receipts.map(({ assignment, grant }) => source.authorize(assignment, grant)));
  }
  return { authorize, collect, recheck };
}
