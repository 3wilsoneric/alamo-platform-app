import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Maximize2,
  Minimize2,
  Send,
  X
} from "lucide-react";
import WilsonAvatar from "./WilsonAvatar";

interface WilsonChatbotModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  type: "bot" | "user";
  text: string;
  timestamp: Date;
  id: string;
}

function RenderText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-2">
      {lines.map((line, lineIndex) => {
        if (!line.trim()) return <div key={lineIndex} className="h-0.5" />;

        const isBullet = /^[-*•]\s/.test(line);
        const content = isBullet ? line.replace(/^[-*•]\s/, "") : line;
        const parts: ReactNode[] = [];
        const regex = /(\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^\)]+)\))/g;
        let last = 0;
        let key = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(content)) !== null) {
          if (match.index > last) {
            parts.push(<span key={key++}>{content.slice(last, match.index)}</span>);
          }

          if (match[2]) {
            parts.push(
              <strong key={key++} className="font-semibold text-slate-800">
                {match[2]}
              </strong>
            );
          } else if (match[3]) {
            parts.push(
              <code
                key={key++}
                className="rounded border border-violet-100 bg-violet-50 px-1.5 py-0.5 text-xs font-mono text-violet-700"
              >
                {match[3]}
              </code>
            );
          } else if (match[4] && match[5]) {
            parts.push(
              <a
                key={key++}
                href={match[5]}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 font-medium text-violet-700 underline decoration-violet-300 underline-offset-2 hover:text-violet-900"
              >
                {match[4]}
                <ExternalLink size={11} className="flex-shrink-0 opacity-60" />
              </a>
            );
          }

          last = match.index + match[0].length;
        }

        if (last < content.length) {
          parts.push(<span key={key++}>{content.slice(last)}</span>);
        }

        if (isBullet) {
          return (
            <div key={lineIndex} className="flex items-start gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-400" />
              <p className="text-sm leading-relaxed text-slate-600">{parts}</p>
            </div>
          );
        }

        return (
          <p key={lineIndex} className="text-sm leading-relaxed text-slate-600">
            {parts}
          </p>
        );
      })}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
      title="Copy"
    >
      {copied ? <Check size={12} className="text-violet-500" /> : <Copy size={12} />}
    </button>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start px-1">
      <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex h-4 items-center gap-1.5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="h-1.5 w-1.5 animate-bounce rounded-full"
              style={{ background: "#8FD3BE", animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const SYSTEM_PROMPT = `You are Ask Helper, a warm and sharp data assistant for a behavioral health and ARF organization's internal platform. You help staff and operators understand census, occupancy, outcomes, workforce, incident trends, compliance reporting, and program performance.

Your tone is calm, helpful, and clear. Use **bold** for important concepts, \`code\` for exact fields or values, and bullet points for lists. Include links when helpful.

You do not have live data access. You help users understand what data exists, how to interpret it, what reports to run, and what questions to ask next.`;

export default function WilsonChatbotModal({
  isOpen,
  onClose
}: WilsonChatbotModalProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "0",
      type: "bot",
      timestamp: new Date(),
      text:
        "Hi there — I'm **Ask Helper**.\n\nI can help you navigate **communities**, **reports**, **workforce data**, and **incident patterns** across the platform.\n\nWhat are you looking into today?"
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [apiHistory, setApiHistory] = useState<{ role: "user" | "assistant"; content: string }[]>(
    []
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping, isOpen]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  }, [inputValue]);

  useEffect(() => {
    if (!isOpen) {
      setIsExpanded(false);
    }
  }, [isOpen]);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || isTyping) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      text,
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);

    const newHistory = [...apiHistory, { role: "user" as const, content: text }];
    setApiHistory(newHistory);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: newHistory
        })
      });

      const data = await response.json();
      const reply =
        data.content?.map((block: { type: string; text?: string }) => block.text || "").join("") ||
        "I wasn't able to generate a response — please try again.";

      setApiHistory((prev) => [...prev, { role: "assistant", content: reply }]);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          type: "bot",
          text: reply,
          timestamp: new Date()
        }
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          type: "bot",
          timestamp: new Date(),
          text: "Something went wrong on my end. Please try again in a moment."
        }
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const fmt = (date: Date) =>
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (!isOpen) return null;

  const panelStyle: React.CSSProperties = isExpanded
    ? {
        width: "min(82vw, 1100px)",
        height: "84vh"
      }
    : {
        width: "min(56vw, 760px)",
        height: "78vh"
      };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-6 backdrop-blur-[2px]">
      <div
        className="flex h-full max-h-[84vh] w-full max-w-none flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_32px_80px_-8px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.06)]"
        style={panelStyle}
      >
        <div
          className="flex flex-shrink-0 items-center justify-between border-b border-violet-100 bg-white px-5 py-4"
          style={{
            boxShadow: "inset 0 -1px 0 rgba(139,92,246,0.08)"
          }}
        >
          <div className="flex items-center gap-3.5">
            <WilsonAvatar
              className="h-11 w-11 flex-shrink-0 rounded-[14px] border border-[#E8EEE8] bg-white p-[2px]"
              imageClassName="rounded-[14px] object-cover"
              imageStyle={{ transform: "scale(1.08)" }}
              fallbackSize={24}
            />
            <div>
              <span
                className="block text-[1.02rem] font-bold leading-none text-slate-900"
                style={{ letterSpacing: "-0.01em" }}
              >
                Ask Helper
              </span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                <span className="text-xs tracking-wide text-slate-500">available now</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setIsExpanded((value) => !value)}
              title={isExpanded ? "Restore" : "Expand"}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-violet-50 hover:text-violet-700"
            >
              {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-violet-50 hover:text-violet-700"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto px-5 py-5"
          style={{ background: "linear-gradient(180deg, #FAFAFD 0%, #F5F5FA 100%)" }}
        >
          <div className="space-y-5">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
              >
                {message.type === "bot" ? (
                  <div className="group max-w-[90%] flex-1">
                    <div className="rounded-2xl rounded-tl-sm border bg-white px-5 py-4 shadow-sm" style={{ borderColor: "#E4E4EF" }}>
                      <RenderText text={message.text} />
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 pl-2">
                      <span className="text-xs text-slate-400">{fmt(message.timestamp)}</span>
                      <CopyButton text={message.text} />
                    </div>
                  </div>
                ) : (
                  <div className="max-w-[78%]">
                    <div
                      className="rounded-2xl rounded-tr-sm px-4 py-3"
                      style={{ background: "linear-gradient(135deg, #6D5CE7, #4F46E5)" }}
                    >
                      <p className="text-sm leading-relaxed text-white/90">{message.text}</p>
                    </div>
                    <div className="mt-1.5 flex justify-end pr-1">
                      <span className="text-xs text-slate-400">{fmt(message.timestamp)}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isTyping && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-[#ECECF4] bg-white px-4 pb-4 pt-3">
          <div
            className="flex items-end gap-3 rounded-xl border px-4 py-3 transition-all"
            style={{ background: "#F8F8FC", borderColor: "#E3E3F0" }}
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Helper about communities, reports, workforce, incidents..."
              className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-slate-700 placeholder-slate-400 focus:outline-none"
              style={{ minHeight: "24px", maxHeight: "140px" }}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isTyping}
              aria-label="Send"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl transition-all"
              style={{
                background:
                  inputValue.trim() && !isTyping
                    ? "linear-gradient(135deg, #6D5CE7, #4F46E5)"
                    : "#E8E8F2"
              }}
            >
              <Send
                size={15}
                className={inputValue.trim() && !isTyping ? "text-white" : "text-slate-400"}
              />
            </button>
          </div>
          <p className="mt-2 text-center text-xs tracking-wide text-slate-400">
            For internal use · Do not enter identifiable client information
          </p>
        </div>
      </div>
    </div>
  );
}
