import type { AgentConversation } from "../../../../shared/everyagent-conversations.mjs";
import { FormattedMessageText } from "../../home/components/FormattedMessageText";

export default function ConversationMessages({ chat, onCancel }: { chat: AgentConversation; onCancel: (id: string) => void }) {
  return <div className="agent-conversation-messages" aria-label="Messages" aria-live="polite">
    {chat.turns.map(turn => <section key={turn.id} className="agent-conversation-turn">
      <div className="agent-conversation-user"><span className="sr-only">You: </span>{turn.text}</div>
      {turn.status === "working" && <div role="status" className="agent-conversation-progress">Reading sources and preparing an answer…<button type="button" onClick={() => onCancel(turn.id)}>Stop</button></div>}
      {turn.status !== "working" && turn.status !== "complete" && <p role="status">{turn.status === "canceled" ? "Stopped." : turn.status === "interrupted" ? "This answer was interrupted. Your message is saved; send again when ready." : "The answer could not be verified. Your message is saved; send again when ready."}</p>}
      {turn.answer && <div className="agent-conversation-answer" aria-label="AlamoAgent answer">
        {turn.answer.paragraphs.map((paragraph, index) => <div key={index}>
          <FormattedMessageText text={paragraph.text} />
          {paragraph.sourceIds.length > 0 && <p className="agent-conversation-citations">{paragraph.sourceIds.map(id => {
            const source = turn.evidence?.find(item => item.id === id);
            const link = source?.links[0];
            return link ? <a key={id} href={link.href} target="_blank" rel="noopener noreferrer">{source.title}</a> : <span key={id}>{source?.title}</span>;
          })}</p>}
        </div>)}
        {!!turn.evidence?.length && <details className="agent-conversation-sources"><summary>Sources · {turn.evidence.length}</summary><ul>{turn.evidence.map(item => <li key={item.id}>
          <strong>{item.title}</strong><span>{item.observedAt ? `Source checked ${new Date(item.observedAt).toLocaleString()}` : "Source freshness unavailable"}</span>
          <p>{item.text}</p>{item.links.map(link => <a key={link.id} href={link.href} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>)}
        </li>)}</ul></details>}
      </div>}
    </section>)}
    {!chat.turns.length && <p className="agent-conversation-empty">No messages yet.</p>}
  </div>;
}
