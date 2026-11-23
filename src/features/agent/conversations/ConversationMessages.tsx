import type { AgentConversation } from "../../../../shared/everyagent-conversations.mjs";
import { FormattedMessageText } from "../../home/components/FormattedMessageText";
import { ArrowUpRight } from "lucide-react";

export default function ConversationMessages({ chat, pendingSend, onCancel, compact = false, selectedTurnId, onSelectTurn }: { chat: AgentConversation; pendingSend?: { requestId: string; text: string } | null; onCancel: (id: string) => void; compact?: boolean; selectedTurnId?: string | null; onSelectTurn?: (id: string) => void }) {
  return <div className="agent-conversation-messages" aria-label="Messages" aria-live="polite">
    {chat.turns.map(turn => <section key={turn.id} className="agent-conversation-turn">
      <div className="agent-conversation-user"><span className="sr-only">You: </span>{turn.text}</div>
      {turn.status === "working" && <div role="status" className="agent-conversation-progress">Reading sources and preparing an answer…<button type="button" onClick={() => onCancel(turn.id)}>Stop</button></div>}
      {turn.status !== "working" && turn.status !== "complete" && <p role="status">{turn.status === "canceled" ? "Stopped." : turn.status === "interrupted" ? "This answer was interrupted. Your message is saved; send again when ready." : "The answer could not be verified. Your message is saved; send again when ready."}</p>}
      {turn.answer && compact && selectedTurnId !== turn.id && <div className="agent-conversation-answer-summary" aria-label="Ally answer preview"><button type="button" onClick={() => onSelectTurn?.(turn.id)}>View answer <ArrowUpRight size={15} aria-hidden="true" /></button></div>}
      {turn.answer && !compact && <div className="agent-conversation-answer" aria-label="Ally answer">
        {turn.answer.paragraphs.map((paragraph, index) => <div key={index}>
          <FormattedMessageText text={paragraph.text} />
          {paragraph.sourceIds.length > 0 && <p className="agent-conversation-citations">{paragraph.sourceIds.map(id => {
            const source = turn.evidence?.find(item => item.id === id);
            const link = source?.links[0];
            return link ? <a key={id} href={link.href} target="_blank" rel="noopener noreferrer">{source.title}</a> : <span key={id}>{source?.title}</span>;
          })}</p>}
        </div>)}
      </div>}
    </section>)}
    {pendingSend && !chat.turns.some(turn => turn.id === pendingSend.requestId) && <section className="agent-conversation-turn">
      <div className="agent-conversation-user"><span className="sr-only">You: </span>{pendingSend.text}</div>
      <div role="status" className="agent-conversation-progress">Reading sources and preparing an answer…<button type="button" onClick={() => onCancel(pendingSend.requestId)}>Stop</button></div>
    </section>}
    {!chat.turns.length && !pendingSend && <p className="agent-conversation-empty">No messages yet.</p>}
  </div>;
}
