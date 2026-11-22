import type { AgentConversation } from "../../../../shared/everyagent-conversations.mjs";
import { FormattedMessageText } from "../../home/components/FormattedMessageText";

export default function AllyAnswerCanvas({ chat, selectedTurnId }: { chat: AgentConversation | null; selectedTurnId?: string | null }) {
  const turn = chat?.turns.find(item => item.id === selectedTurnId && item.answer) ?? [...(chat?.turns ?? [])].reverse().find(item => item.answer);
  if (!turn?.answer) return <section className="ally-answer-canvas ally-answer-canvas--start" aria-label="Ally canvas">
    <p className="ally-canvas-empty">Answers and visualizations appear here.</p>
  </section>;

  const sourceIds = new Set(turn.answer.paragraphs.flatMap(paragraph => paragraph.sourceIds));
  const sources = (turn.evidence ?? []).filter(item => sourceIds.has(item.id));
  return <article className="ally-answer-canvas" aria-label="Expanded Ally answer">
    <div className="ally-canvas-prose">
      {turn.answer.paragraphs.map((paragraph, index) => <section className={index === 0 ? "ally-canvas-lead" : undefined} key={`${turn.id}-${index}`}><FormattedMessageText text={paragraph.text} /></section>)}
      {sources.length > 0 && <details className="ally-canvas-sources" aria-label="Sources used"><summary>Sources used</summary><ul>{sources.map(source => <li key={source.id}>{source.links[0] ? <a href={source.links[0].href} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title}</li>)}</ul></details>}
    </div>
  </article>;
}
