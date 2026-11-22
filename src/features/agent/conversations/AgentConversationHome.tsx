import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { AgentConversation, ConversationCommand, ConversationList } from "../../../../shared/everyagent-conversations.mjs";
import { ConversationalPrompt } from "../../home/components/ConversationalPrompt";
import ConversationMessages from "./ConversationMessages";
import type { AgentTransport } from "./agentTransport";
import "./conversations.css";

const skillTitle = (id: string) => id === "licensing" ? "Licensing" : "Admissions";
export default function AgentConversationHome({ transport, conversationId, onNavigate, onBuildReport }: {
  transport: AgentTransport; conversationId: string | null; onNavigate: (id: string | null) => void; onBuildReport?: () => void;
}) {
  const [list, setList] = useState<ConversationList | null>(null);
  const [chat, setChat] = useState<AgentConversation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState<ConversationCommand | null>(null);
  const [draft, setDraft] = useState("");
  const generation = useRef(0);
  const active = useRef(true);
  const inflight = useRef(false);
  const refreshing = useRef<AbortController | null>(null);
  const lastRefresh = useRef(0);
  const pendingTurn = useRef(false);
  pendingTurn.current = Boolean(chat?.turns.some(turn => turn.status === "working"));
  const refresh = useCallback(async () => {
    if (document.visibilityState === "hidden" || refreshing.current) return;
    const controller = new AbortController();
    refreshing.current = controller; lastRefresh.current = Date.now();
    const requested = ++generation.current;
    try {
      const [chats, selected] = await Promise.all([transport.conversations.list(controller.signal), conversationId ? transport.conversations.read(conversationId, controller.signal) : null]);
      if (active.current && requested === generation.current) { setList(chats); setChat(selected); setError(null); }
    } catch {
      if (active.current && requested === generation.current) { setChat(null); setList(null); setError("Ally could not load your chats. Try again."); }
    } finally { if (refreshing.current === controller) refreshing.current = null; }
  }, [transport, conversationId]);
  useEffect(() => {
    active.current = true; setChat(null); setRetry(null); void refresh();
    const visibility = () => {
      if (document.visibilityState === "hidden") { ++generation.current; refreshing.current?.abort(); refreshing.current = null; setChat(null); setList(null); }
      else void refresh();
    };
    const timer = window.setInterval(() => { if (inflight.current || pendingTurn.current || Date.now() - lastRefresh.current >= 30_000) void refresh(); }, 5000);
    document.addEventListener("visibilitychange", visibility);
    return () => { active.current = false; ++generation.current; refreshing.current?.abort(); refreshing.current = null; window.clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [refresh]);
  async function command(input: ConversationCommand) {
    if (inflight.current && input.action !== "cancel") return;
    const cancel = input.action === "cancel";
    if (!cancel) { inflight.current = true; setBusy(true); setRetry(input); }
    ++generation.current; refreshing.current?.abort(); refreshing.current = null;
    try {
      const result = await transport.conversations.command(input);
      if (!active.current) return;
      setRetry(null); setError(null);
      if ("id" in result && input.action === "create") onNavigate(result.id);
      else await refresh();
    } catch (caught) {
      if (active.current) { if (input.action === "send") setDraft(input.text); setError(caught instanceof Error ? caught.message : "The request could not be completed."); }
    } finally {
      if (!cancel) { inflight.current = false; if (active.current) setBusy(false); }
    }
  }
  async function startWithQuestion(text: string) {
    if (inflight.current) return;
    inflight.current = true; setBusy(true); setError(null);
    let createdId: string | null = null;
    try {
      const created = await transport.conversations.command({ action: "create", requestId: crypto.randomUUID(), skillIds: ["licensing", "admissions-watch"] });
      if (!("id" in created)) throw new Error("Ally could not start a chat.");
      createdId = created.id;
      await transport.conversations.command({ action: "send", requestId: crypto.randomUUID(), conversationId: created.id, expectedVersion: created.version, text });
      if (active.current) { setDraft(""); onNavigate(created.id); }
    } catch (caught) {
      if (active.current) { setDraft(text); if (createdId) onNavigate(createdId); setError(caught instanceof Error ? caught.message : "Ally could not start a chat."); }
    } finally { inflight.current = false; if (active.current) setBusy(false); }
  }
  const working = chat?.turns.some(turn => turn.status === "working");
  return <section className="agent-conversation-home" aria-label="Ally chats">
    <header className="agent-conversation-toolbar">
      <span>Ally chat</span>
      <button type="button" aria-label="Refresh chats" onClick={() => { void refresh(); }}><RefreshCw size={17} /></button>
    </header>
    {error && <div role="alert" className="agent-conversation-error">{error}<button type="button" onClick={() => { void transport.connect().then(refresh).catch(() => setError("Sign-in could not be completed.")); }}>Connect</button>
      {retry?.action === "send" && <button type="button" onClick={() => { void command({ action: "cancel", conversationId: retry.conversationId, turnId: retry.requestId }); }}>Stop request</button>}
      {retry && <button type="button" disabled={busy} onClick={() => { void command(retry); }}>Retry request</button>}</div>}
    <div className="agent-conversation-layout"><details className="agent-conversation-history"><summary>Recent chats</summary><aside aria-label="Saved chats">
      {list?.conversations.map(item => <button type="button" key={item.id} aria-current={item.id === conversationId ? "page" : undefined} disabled={item.locked} onClick={() => onNavigate(item.id)}>{item.title}</button>)}
      {list?.conversations.length === 0 && <p>No saved chats.</p>}
    </aside></details><main>
      {conversationId ? chat && <>
        <div className="agent-conversation-scope" aria-label="Chat scope">{chat.scope.map(scope => <span key={scope.skillId}>{skillTitle(scope.skillId)}{scope.communityIds.length ? ` · ${scope.communityIds.length} ${scope.communityIds.length === 1 ? "community" : "communities"}` : " · aggregates"}</span>)}</div>
        <ConversationMessages chat={chat} onCancel={turnId => { void command({ action: "cancel", conversationId: chat.id, turnId }); }} />
        {list?.modelAvailable === false && <p role="status">Chat answers are not configured yet. Saved work remains available.</p>}
        <ConversationalPrompt compact agent draft={draft} onDraftChange={setDraft} sending={busy || Boolean(working) || list?.modelAvailable === false} onOpenLibrary={() => {}} onSubmit={text => { void command({ action: "send", conversationId: chat.id, requestId: crypto.randomUUID(), expectedVersion: chat.version, text }); }} />
      </> : <div className="agent-conversation-new" aria-label="New chat">
        <h2>What’s next?</h2>
        <div className="agent-conversation-actions"><button type="button" onClick={() => setDraft("What needs attention in admissions today?")}>Review admissions <span aria-hidden="true">→</span></button><button type="button" onClick={() => setDraft("What changed in licensing across our communities?")}>Check licensing <span aria-hidden="true">→</span></button>{onBuildReport && <button type="button" onClick={onBuildReport}>Build a report <span aria-hidden="true">→</span></button>}</div>
        <ConversationalPrompt compact agent draft={draft} onDraftChange={setDraft} sending={busy || list?.modelAvailable === false} onOpenLibrary={() => {}} onSubmit={text => { void startWithQuestion(text); }} />
        {list?.modelAvailable === false && <p role="status">Chat answers are unavailable right now.</p>}
      </div>}
    </main></div>
  </section>;
}
