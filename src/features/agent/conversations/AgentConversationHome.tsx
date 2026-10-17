import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import type { AgentConversation, ConversationCommand, ConversationList } from "../../../../shared/everyagent-conversations.mjs";
import type { EveryAgentOverview } from "../../../../shared/everyagent-contracts.mjs";
import { ConversationalPrompt } from "../../home/components/ConversationalPrompt";
import ConversationMessages from "./ConversationMessages";
import type { AgentTransport } from "./agentTransport";
import "./conversations.css";

const skillTitle = (id: string) => id === "licensing" ? "Licensing" : "Admissions";
export default function AgentConversationHome({ transport, conversationId, onNavigate }: {
  transport: AgentTransport; conversationId: string | null; onNavigate: (id: string | null) => void;
}) {
  const [list, setList] = useState<ConversationList | null>(null);
  const [chat, setChat] = useState<AgentConversation | null>(null);
  const [work, setWork] = useState<EveryAgentOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [skills, setSkills] = useState(["licensing", "admissions-watch"]);
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
      const [chats, overview, selected] = await Promise.all([transport.conversations.list(controller.signal), transport.work(controller.signal), conversationId ? transport.conversations.read(conversationId, controller.signal) : null]);
      if (active.current && requested === generation.current) { setList(chats); setWork(overview); setChat(selected); setError(null); }
    } catch {
      if (active.current && requested === generation.current) { setChat(null); setList(null); setWork(null); setError("Couldn’t verify access. Connect or refresh to try again."); }
    } finally { if (refreshing.current === controller) refreshing.current = null; }
  }, [transport, conversationId]);
  useEffect(() => {
    active.current = true; setChat(null); setRetry(null); setCreating(false); void refresh();
    const visibility = () => {
      if (document.visibilityState === "hidden") { ++generation.current; refreshing.current?.abort(); refreshing.current = null; setChat(null); setList(null); setWork(null); }
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
      if ("id" in result && input.action === "create") { setCreating(false); onNavigate(result.id); }
      else await refresh();
    } catch (caught) {
      if (active.current) { setChat(null); setError(caught instanceof Error ? caught.message : "The request could not be completed."); }
    } finally {
      if (!cancel) { inflight.current = false; if (active.current) setBusy(false); }
    }
  }
  const working = chat?.turns.some(turn => turn.status === "working");
  return <section className="agent-conversation-home" aria-label="AlamoAgent chats">
    <header className="agent-conversation-toolbar"><img src="/brand/everyagent-alamo-v1.webp" alt="AlamoAgent" width="32" height="32" />
      <nav aria-label="Chat navigation"><button type="button" aria-pressed={!conversationId} onClick={() => onNavigate(null)}>Updates</button><button type="button" onClick={() => setCreating(value => !value)}><Plus size={16} />New chat</button></nav>
      <button type="button" aria-label="Refresh chats" onClick={() => { void refresh(); }}><RefreshCw size={17} /></button>
    </header>
    {error && <div role="alert" className="agent-conversation-error">{error}<button type="button" onClick={() => { void transport.connect().then(refresh).catch(() => setError("Sign-in could not be completed.")); }}>Connect</button>
      {retry?.action === "send" && <button type="button" onClick={() => { void command({ action: "cancel", conversationId: retry.conversationId, turnId: retry.requestId }); }}>Stop request</button>}
      {retry && <button type="button" disabled={busy} onClick={() => { void command(retry); }}>Retry request</button>}</div>}
    <div className="agent-conversation-layout"><aside aria-label="Saved chats">
      {list?.conversations.map(item => <button type="button" key={item.id} aria-current={item.id === conversationId ? "page" : undefined} disabled={item.locked} onClick={() => onNavigate(item.id)}>{item.title}</button>)}
      {list?.conversations.length === 0 && <p>No saved chats.</p>}
    </aside><main>
      {creating && <form className="agent-conversation-create" onSubmit={event => { event.preventDefault(); void command({ action: "create", requestId: crypto.randomUUID(), skillIds: skills }); }}>
        <fieldset><legend>Sources for this chat</legend>{["licensing", "admissions-watch"].map(id => <label key={id}><input type="checkbox" checked={skills.includes(id)} onChange={event => setSkills(value => event.target.checked ? [...value, id] : value.filter(item => item !== id))} />{skillTitle(id)}</label>)}</fieldset>
        <button type="submit" disabled={busy || !skills.length}>Start chat</button><button type="button" onClick={() => setCreating(false)}>Cancel</button>
      </form>}
      {conversationId ? chat && <>
        <div className="agent-conversation-scope" aria-label="Chat scope">{chat.scope.map(scope => <span key={scope.skillId}>{skillTitle(scope.skillId)}{scope.communityIds.length ? ` · ${scope.communityIds.length} ${scope.communityIds.length === 1 ? "community" : "communities"}` : " · aggregates"}</span>)}</div>
        <ConversationMessages chat={chat} onCancel={turnId => { void command({ action: "cancel", conversationId: chat.id, turnId }); }} />
        {list?.modelAvailable === false && <p role="status">Chat answers are not configured yet. Saved work remains available.</p>}
        <ConversationalPrompt compact agent draft={draft} onDraftChange={setDraft} sending={busy || Boolean(working) || list?.modelAvailable === false} onOpenLibrary={() => {}} onSubmit={text => { void command({ action: "send", conversationId: chat.id, requestId: crypto.randomUUID(), expectedVersion: chat.version, text }); }} />
      </> : <div className="agent-conversation-updates" aria-label="Updates">
        {!work && !error && <p role="status">Loading updates…</p>}
        {work?.work.length === 0 && <p>No updates yet.</p>}
        {work?.work.slice(0, 10).map(item => <article key={item.id}><small>{skillTitle(item.skillId)}</small><h2>{item.title}</h2><p>{item.summary}</p>
          <div>{item.evidence.slice(0, 3).map(source => <a key={source.id} href={source.href} target="_blank" rel="noopener noreferrer">{source.label} ↗</a>)}<button type="button" disabled={busy} onClick={() => { void command({ action: "create", requestId: crypto.randomUUID(), skillIds: [item.skillId], workId: item.id }); }}>Discuss</button></div>
        </article>)}
      </div>}
    </main></div>
  </section>;
}
