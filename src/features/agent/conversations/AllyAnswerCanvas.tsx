import { ArrowUpRight } from "lucide-react";
import type { AgentConversation } from "../../../../shared/everyagent-conversations.mjs";
import { FormattedMessageText } from "../../home/components/FormattedMessageText";

const prompts = [
  { label: "Admissions", question: "Which accepted clients are still waiting for a move-in date?" },
  { label: "Licensing", question: "What changed in licensing across our communities?" },
];

export default function AllyAnswerCanvas({ chat, onUsePrompt, selectedTurnId, disabled = false }: { chat: AgentConversation | null; onUsePrompt: (prompt: string) => void; selectedTurnId?: string | null; disabled?: boolean }) {
  const turn = chat?.turns.find(item => item.id === selectedTurnId && item.answer) ?? [...(chat?.turns ?? [])].reverse().find(item => item.answer);
  if (!turn?.answer) return <section className="ally-answer-canvas ally-answer-canvas--start" aria-label="Ally canvas">
    <h2>What would you like to know?</h2>
    <div className="ally-canvas-prompts">
      {prompts.map(prompt => <button type="button" key={prompt.label} disabled={disabled} onClick={() => onUsePrompt(prompt.question)}>
        <span>{prompt.label}</span><strong>{prompt.question}</strong><ArrowUpRight size={20} aria-hidden="true" />
      </button>)}
    </div>
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
