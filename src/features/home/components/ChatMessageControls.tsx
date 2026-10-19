import { ArrowRight, Check, Copy, RotateCcw } from "lucide-react";
import { memo } from "react";
import type { CopilotChatAction } from "../../../shared/api/copilotChat";

export const UserMessageControls = memo(function UserMessageControls({
  messageId,
  text,
  copied,
  sending,
  onCopy,
  onRerun
}: {
  messageId: string;
  text: string;
  copied: boolean;
  sending: boolean;
  onCopy: (messageId: string, text: string) => void;
  onRerun: (text: string) => void;
}) {
  return (
    <div className="mt-2 flex justify-end gap-1">
      <button
        type="button"
        onClick={() => onCopy(messageId, text)}
        className="inline-flex h-7 w-7 items-center justify-center border border-transparent text-[#595959] transition-colors hover:border-[#d9d9d9] hover:bg-white hover:text-[#111111]"
        aria-label={copied ? "Message copied" : "Copy message"}
        title={copied ? "Copied" : "Copy"}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        disabled={sending}
        onClick={() => onRerun(text)}
        className="inline-flex h-7 w-7 items-center justify-center border border-transparent text-[#595959] transition-colors hover:border-[#d9d9d9] hover:bg-white hover:text-[#111111] disabled:cursor-not-allowed disabled:opacity-45"
        aria-label="Rerun message"
        title="Rerun"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
});

export const MessageActionStrip = memo(function MessageActionStrip({
  actions,
  messageId,
  onAction
}: {
  actions: CopilotChatAction[];
  messageId: string;
  onAction: (action: CopilotChatAction, actionIndex: number) => void;
}) {
  if (!actions.length) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {actions.map((action, actionIndex) => (
        <button
          key={`${messageId}-${action.label}`}
          type="button"
          {...(action.certifiedQuestionRouteId
            ? { "data-certified-question-route-id": action.certifiedQuestionRouteId }
            : {})}
          onClick={() => onAction(action, actionIndex)}
          className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
            actionIndex === 0
              ? "border-[#0f8b73] bg-white text-[#0f8b73] hover:bg-[#f7fbf9]"
              : "border-[#d9d9d9] bg-white text-[#595959] hover:border-[#111111] hover:text-[#111111]"
          }`}
        >
          {action.label}
          <ArrowRight className="h-3 w-3" />
        </button>
      ))}
    </div>
  );
});
