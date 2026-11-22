import { ArrowUp, BookOpen, MessageSquareText } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";

const EXAMPLE_PROMPTS = [
  "Show the current portfolio operating snapshot.",
  "Which communities need attention right now?",
  "Show the current incident snapshot."
];

export function ConversationalPrompt({
  onSubmit,
  onOpenLibrary,
  sending,
  compact = false,
  agent = false,
  draft: controlledDraft,
  onDraftChange
}: {
  onSubmit: (prompt: string) => void;
  onOpenLibrary: () => void;
  sending: boolean;
  compact?: boolean;
  agent?: boolean;
  draft?: string;
  onDraftChange?: (value: string) => void;
}) {
  const [localDraft, setLocalDraft] = useState("");
  const draft = controlledDraft ?? localDraft;
  const setDraft = onDraftChange ?? setLocalDraft;
  const prompt = draft.trim();

  const submitPrompt = () => {
    if (!prompt || sending) return;
    onSubmit(prompt);
    setDraft("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitPrompt();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submitPrompt();
  };

  if (compact) {
    return (
      <div
        data-conversational-prompt="compact"
        className="sticky bottom-0 z-20 mt-6 border-t border-[#dbe5e1] bg-white/95 px-0 pb-[calc(10px+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:px-5"
      >
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-[980px] items-end gap-2 rounded-2xl border border-[#aebfba] bg-white p-2 shadow-[0_10px_32px_rgba(15,55,45,0.08)] focus-within:border-[#0f8b73]">
          <label className="sr-only" htmlFor="analyst-follow-up">{agent ? "Ask Ally" : "Ask a follow-up"}</label>
          <textarea
            id="analyst-follow-up"
            data-conversational-input="true"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            maxLength={agent ? 4000 : undefined}
            autoFocus={agent}
            placeholder={agent ? "Ask Ally…" : "Ask a follow-up"}
            className="max-h-36 min-h-11 min-w-0 flex-1 resize-y bg-transparent px-2 py-2.5 text-[16px] leading-6 text-[#111111] outline-none placeholder:text-[#7a8581]"
          />
          <button
            type="submit"
            disabled={!prompt || sending}
            aria-label="Send question"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0b315b] text-white transition-colors hover:bg-[#0f8b73] disabled:cursor-not-allowed disabled:bg-[#d9dfdc] disabled:text-[#7b8581]"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
        </form>
        {!agent && <div className="mx-auto mt-2 flex max-w-[980px] items-center justify-between gap-3 px-1">
          <p className="text-[10px] leading-4 text-[#6c7773]">Answers use governed platform data.</p>
          <button
            type="button"
            onClick={onOpenLibrary}
            aria-label="Open questions"
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 text-[11px] font-semibold text-[#0b6f5e] hover:text-[#111111]"
          >
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            Browse questions
          </button>
        </div>}
      </div>
    );
  }

  return (
    <section
      data-conversational-prompt="hero"
      className="mx-auto flex min-h-[min(520px,calc(100dvh-190px))] w-full max-w-[1040px] flex-col justify-center px-1 py-8 sm:px-8 sm:py-12"
    >
      <div className="mx-auto w-full max-w-[900px] text-center">
        <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#0f8b73]">
          <MessageSquareText className="h-4 w-4" aria-hidden="true" />
          Alamo Analyst
        </div>
        <h1 className="mt-3 font-serif text-[clamp(36px,5vw,60px)] leading-[1.02] tracking-[-0.04em] text-[#102b26]">
          What do you need to know?
        </h1>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mx-auto mt-8 flex w-full max-w-[900px] items-end gap-2 rounded-[26px] border border-[#9fb3ad] bg-white p-2.5 shadow-[0_20px_60px_rgba(15,55,45,0.12)] transition-shadow focus-within:border-[#0f8b73] focus-within:shadow-[0_24px_70px_rgba(15,139,115,0.14)] sm:p-3"
      >
        <label className="sr-only" htmlFor="analyst-question">Ask Alamo Analyst</label>
        <textarea
          id="analyst-question"
          data-conversational-input="true"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          autoFocus
          placeholder="Ask what is happening across the platform"
          className="max-h-48 min-h-[64px] min-w-0 flex-1 resize-y bg-transparent px-3 py-3 text-[16px] leading-6 text-[#111111] outline-none placeholder:text-[#7a8581] sm:min-h-[72px] sm:px-4 sm:text-[17px]"
        />
        <button
          type="submit"
          disabled={!prompt || sending}
          aria-label="Send question"
          className="mb-1 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0b315b] text-white shadow-sm transition-colors hover:bg-[#0f8b73] disabled:cursor-not-allowed disabled:bg-[#d9dfdc] disabled:text-[#7b8581] sm:h-14 sm:w-14"
        >
          <ArrowUp className="h-5 w-5" aria-hidden="true" />
        </button>
      </form>

      <div className="mx-auto mt-5 w-full max-w-[900px]">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#687570]">Try asking</p>
        <div className="mt-2 grid border-y border-[#dbe5e1] sm:grid-cols-3 sm:divide-x sm:divide-[#dbe5e1]">
          {EXAMPLE_PROMPTS.map((example) => (
            <button
              key={example}
              type="button"
              disabled={sending}
              onClick={() => onSubmit(example)}
              className="min-h-12 border-b border-[#dbe5e1] px-3 py-3 text-left text-[12px] font-medium leading-5 text-[#42524d] transition-colors hover:bg-[#f3f8f6] hover:text-[#0b6f5e] disabled:cursor-not-allowed disabled:opacity-50 last:border-b-0 sm:min-h-[72px] sm:border-b-0 sm:px-4 sm:text-[13px]"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
