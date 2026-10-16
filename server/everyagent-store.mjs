import { EVERYAGENT_VERSION } from "../shared/everyagent-contracts.mjs";
import { createEveryAgentPersistence } from "./everyagent-persistence.mjs";

export function createEveryAgentStore(persistence = createEveryAgentPersistence()) {
  async function read() {
    const result = await persistence.read();
    const value = result.value ?? { version: EVERYAGENT_VERSION, revision: 0, assignments: [], work: [], runs: [], lease: null };
    if (value.version !== EVERYAGENT_VERSION || !Number.isSafeInteger(value.revision) ||
        !Array.isArray(value.assignments) || !Array.isArray(value.work) || !Array.isArray(value.runs)) {
      throw new Error("EveryAgent state could not be read.");
    }
    return { value, version: result.version };
  }
  async function update(mutate) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const { value, version } = await read();
      const result = mutate(value);
      if (result === false) return value;
      value.revision++;
      // Keep recent execution history; evidence lives with bounded work items.
      value.runs = value.runs.slice(-300);
      value.work = value.work.filter(item => item.status !== "completed" ||
        Date.parse(item.createdAt) > Date.now() - 90 * 86_400_000);
      if (value.work.length > 2000) throw new Error("EveryAgent review queue is full.");
      try { await persistence.write(value, version); return value; }
      catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EVERYAGENT_CONFLICT" || attempt === 5) throw error;
        await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
      }
    }
    throw new Error("EveryAgent update could not be saved.");
  }
  return { read, update };
}
