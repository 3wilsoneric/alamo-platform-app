import path from "node:path";
import { createEveryAgentPersistence } from "./everyagent-persistence.mjs";

export function createConversationStore(persistence = createEveryAgentPersistence({
  localPath: path.resolve("generated/everyagent/conversations-v1.json"), blobPath: "everyagent/conversations-v1.json"
})) {
  async function read() {
    const snapshot = await persistence.read();
    const value = snapshot.value ?? { version: 1, revision: 0, conversations: [] };
    if (value.version !== 1 || !Number.isSafeInteger(value.revision) || !Array.isArray(value.conversations) || value.conversations.length > 50) throw new Error("Conversation state is unavailable.");
    return { value, version: snapshot.version };
  }
  async function update(mutate) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const { value, version } = await read();
      if (mutate(value) === false) return value;
      value.revision++;
      if (value.conversations.length > 50 || value.conversations.some(chat => chat.turns.length > 40)) throw new Error("Conversation capacity reached.");
      try { await persistence.write(value, version); return value; }
      catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EVERYAGENT_CONFLICT" || attempt === 5) throw error;
      }
    }
    throw new Error("Conversation could not be saved.");
  }
  return { read, update };
}
