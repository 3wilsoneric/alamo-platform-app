import { createHash, randomUUID } from "node:crypto";
import { everyAgentActor, freshAssignment, grantFor, scopeAllows } from "./everyagent-access.mjs";
import { createEveryAgentStore } from "./everyagent-store.mjs";
import { createConversationStore } from "./everyagent-conversation-store.mjs";
import { createConversationSources } from "./everyagent-conversation-sources.mjs";
import { createConversationModel, validateConversationAnswer } from "./everyagent-conversation-model.mjs";
import { validateConversationCommand } from "../shared/everyagent-conversations.mjs";
import { createHttpError } from "./http-error-contract.mjs";

const hidden = () => createHttpError(404, "not_found", "Not found.");
const changed = () => createHttpError(409, "conversation_changed", "This chat changed. Refresh before sending again.");
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const pending = turn => turn.status === "working";
const project = chat => ({ id: chat.id, version: chat.version, createdAt: chat.createdAt, scope: chat.scope,
  workId: chat.workId, turns: chat.turns.map(({ requestHash: _hash, deadline: _deadline, ...turn }) => turn) });

export function createConversationService({ store = createConversationStore(), workStore = createEveryAgentStore(), source,
  model = createConversationModel(), clientIds = /** @type {string[]} */ ([]), now = () => Date.now() }) {
  const sources = createConversationSources({ workStore, source });
  const allowedClients = new Set(clientIds.map(id => id.toLowerCase()));
  const actor = auth => {
    const userId = everyAgentActor(auth);
    // Transcript-bearing hosts are registered by authenticated client ID, not
    // by Origin, a claimed host name, URL context, or conversation possession.
    if (!allowedClients.has(String(auth.claims.azp ?? "").toLowerCase())) throw hidden();
    return userId;
  };
  const find = (state, userId, id) => {
    const chat = state.conversations.find(item => item.id === id && item.userId === userId);
    if (!chat) throw hidden(); return chat;
  };
  async function expire() {
    await store.update(state => {
      let touched = false;
      for (const chat of state.conversations) for (const turn of chat.turns) if (pending(turn) && turn.deadline <= now()) {
        turn.status = "interrupted"; chat.version++; touched = true;
      }
      return touched;
    });
  }
  async function read(auth, id = /** @type {string | null} */ (null)) {
    const userId = actor(auth);
    await expire();
    const { value } = await store.read();
    if (id) {
      const chat = find(value, userId, id);
      await sources.authorize(chat);
      return project(chat);
    }
    const chats = value.conversations.filter(chat => chat.userId === userId).slice().reverse();
    const access = new Map();
    return { modelAvailable: model.available, conversations: await Promise.all(chats.map(async chat => {
      try {
        const scopeKey = JSON.stringify(chat.scope);
        if (!access.has(scopeKey)) access.set(scopeKey, sources.authorize(chat));
        await access.get(scopeKey);
        return { id: chat.id, title: chat.turns[0]?.text.slice(0, 80) ?? "New chat", createdAt: chat.createdAt, locked: false };
      } catch { return { id: chat.id, title: "Source access unavailable", createdAt: chat.createdAt, locked: true }; }
    })) };
  }
  async function create(auth, input) {
    const userId = actor(auth);
    const { value } = await workStore.read();
    const scope = input.skillIds.map(skillId => {
      const skill = grantFor(userId).find(item => item.id === skillId);
      if (!skill) throw hidden();
      const assignment = value.assignments.find(item => item.userId === userId && item.skillId === skillId) ?? freshAssignment(userId, skill);
      return { skillId, communityIds: [...assignment.communityIds] };
    });
    let resourceIds = [];
    if (input.workId) {
      const work = value.work.find(item => item.id === input.workId && item.userId === userId);
      if (!work || scope.length !== 1 || scope[0].skillId !== work.skillId || !scopeAllows(work, scope[0])) throw hidden();
      scope[0].communityIds = [...work.communityIds];
      // The initial monitoring receipt cites an example source but represents
      // the whole assignment. Reviewed change items retain their record scope.
      if (!(work.status === "completed" && work.reviewedAt === null)) resourceIds = work.evidence.filter(item => ["report", "application"].includes(item.kind)).map(item => item.id);
    }
    const candidate = { id: randomUUID(), userId, requestId: input.requestId, requestHash: digest(input), version: 0,
      scope, resourceIds, workId: input.workId, createdAt: new Date(now()).toISOString(), turns: [] };
    await sources.authorize(candidate);
    const state = await store.update(state => {
      const prior = state.conversations.find(chat => chat.userId === userId && chat.requestId === input.requestId);
      if (prior) { if (prior.requestHash !== candidate.requestHash) throw changed(); return false; }
      if (state.conversations.length >= 50) throw createHttpError(409, "conversation_capacity", "The pilot has reached its saved-chat limit.");
      state.conversations.push(candidate); return true;
    });
    const chat = state.conversations.find(chat => chat.userId === userId && chat.requestId === input.requestId);
    return read(auth, chat.id);
  }
  async function send(auth, input) {
    const userId = actor(auth);
    await expire();
    const chat = find((await store.read()).value, userId, input.conversationId);
    await sources.authorize(chat);
    const requestHash = digest({ text: input.text, conversationId: input.conversationId });
    const prior = chat.turns.find(turn => turn.id === input.requestId);
    if (prior) { if (prior.requestHash !== requestHash) throw changed(); return read(auth, chat.id); }
    if (!model.available) throw createHttpError(503, "conversation_model_unavailable", "Chat answers are not configured yet. Your saved work remains available.");
    const turn = { id: input.requestId, requestHash, text: input.text, status: "working", createdAt: new Date(now()).toISOString(), deadline: now() + 120_000,
      model: model.model, promptVersion: model.promptVersion, modelStartedAt: null, usage: null };
    let claimed = false;
    await store.update(state => {
      claimed = false;
      const current = find(state, userId, chat.id);
      const existing = current.turns.find(item => item.id === turn.id);
      if (existing) { if (existing.requestHash !== requestHash) throw changed(); return false; }
      if (current.version !== input.expectedVersion || current.turns.some(pending)) throw changed();
      const recent = state.conversations.filter(item => item.userId === userId).flatMap(item => item.turns).filter(item => Date.parse(item.createdAt) > now() - 86_400_000);
      if (recent.filter(pending).length >= 2) throw createHttpError(429, "conversation_concurrency", "Two answers are already running. Wait or stop one before continuing.");
      if (recent.length >= 50) throw createHttpError(429, "conversation_budget", "The daily chat limit has been reached. Saved work is still available.");
      if (current.turns.length >= 40) throw createHttpError(409, "conversation_capacity", "Start a new chat to continue.");
      current.turns.push(turn); current.version++; claimed = true; return true;
    });
    if (!claimed) return read(auth, chat.id);
    try {
      const { evidence, receipts } = await sources.collect(chat);
      const starting = await store.update(state => {
        const current = find(state, userId, chat.id);
        const saved = current.turns.find(item => item.id === turn.id);
        if (!saved || !pending(saved) || saved.deadline <= now()) return false;
        saved.modelStartedAt = new Date(now()).toISOString(); current.version++; return true;
      });
      const currentTurn = find(starting, userId, chat.id).turns.find(item => item.id === turn.id);
      if (!currentTurn || !pending(currentTurn) || currentTurn.deadline <= now()) return read(auth, chat.id);
      const history = chat.turns.filter(item => item.status === "complete").slice(-3).map(item => ({ question: item.text,
        answer: item.answer.paragraphs.map(paragraph => paragraph.text).join("\n") })).filter(item => item.question.length + item.answer.length <= 6000);
      const answer = await model.answer({ text: input.text, history, evidence });
      const validated = validateConversationAnswer(answer, evidence);
      await sources.recheck(chat, receipts);
      await store.update(state => {
        const current = find(state, userId, chat.id);
        const saved = current.turns.find(item => item.id === turn.id);
        if (!saved || !pending(saved) || saved.deadline <= now()) return false;
        const cited = new Set(validated.paragraphs.flatMap(item => item.sourceIds));
        Object.assign(saved, { status: "complete", answer: validated, evidence: evidence.filter(item => cited.has(item.id)),
          completedAt: new Date(now()).toISOString(), usage: answer.usage });
        current.version++; return true;
      });
    } catch {
      await store.update(state => {
        const current = find(state, userId, chat.id);
        const saved = current.turns.find(item => item.id === turn.id);
        if (!saved || !pending(saved)) return false;
        saved.status = "failed"; current.version++; return true;
      });
    }
    return read(auth, chat.id);
  }
  async function command(auth, raw) {
    actor(auth);
    let input;
    try { input = validateConversationCommand(raw); } catch { throw createHttpError(400, "conversation_command_invalid", "Choose a valid chat action."); }
    if (input.action === "create") return create(auth, input);
    if (input.action === "send") return send(auth, input);
    const canceledState = await store.update(state => {
      const chat = find(state, actor(auth), input.conversationId);
      const turn = chat.turns.find(item => item.id === input.turnId);
      if (!turn) throw hidden();
      if (!pending(turn)) return false;
      turn.status = "canceled"; chat.version++; return true;
    });
    // Cancellation is available after source revocation without returning any
    // transcript or suggesting that an already charged model call was undone.
    return { canceled: find(canceledState, actor(auth), input.conversationId).turns.find(item => item.id === input.turnId).status === "canceled" };
  }
  return { read, command };
}
