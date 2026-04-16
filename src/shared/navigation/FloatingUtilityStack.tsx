import { Bell, Bot, Expand, Minus, Plus, Send, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const PANE_HANDOFF_STORAGE_KEY = "alamo-ask-helper-pane-handoff";

interface PaneMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
}

function getPageLabel(pathname: string) {
  const segment = pathname.split("/").filter(Boolean).pop() || "page";
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getContextualPrompts(pathname: string) {
  if (pathname.startsWith("/incidents")) {
    return [
      "Summarize the main incident risk on this page",
      "What should I review first here?",
      "Compare this to yesterday's incident pressure"
    ];
  }

  if (pathname.startsWith("/workforce")) {
    return [
      "What staffing issue matters most here?",
      "Summarize the coverage risk on this page",
      "Which team needs attention first?"
    ];
  }

  if (pathname.startsWith("/reports")) {
    return [
      "Which report is most useful from here?",
      "Summarize what this reporting area is for",
      "How should I use this page today?"
    ];
  }

  if (pathname.startsWith("/communities")) {
    return [
      "Summarize what matters most on this page",
      "Which community needs attention first?",
      "What changed in the latest snapshot?"
    ];
  }

  return [
    "Summarize this page for me",
    "What should I focus on here?",
    "Help me understand what matters most"
  ];
}

function createPaneResponse(input: string, pageLabel: string) {
  return `This ${pageLabel} pane is ready for connected questions. Once live data is wired in, Ask Helper will answer from the current page context and the broader platform model rather than placeholder content.`;
}

export default function FloatingUtilityStack() {
  const navigate = useNavigate();
  const location = useLocation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [helperPaneOpen, setHelperPaneOpen] = useState(false);
  const [paneComposer, setPaneComposer] = useState("");
  const [paneMessages, setPaneMessages] = useState<PaneMessage[]>([]);
  const isHome = location.pathname === "/home";
  const showUtilities = isHome || expanded;
  const pageLabel = getPageLabel(location.pathname);
  const contextualPrompts = useMemo(
    () => getContextualPrompts(location.pathname),
    [location.pathname]
  );

  const openAskHelper = () => {
    if (isHome) {
      navigate("/assistant");
      return;
    }

    setNotificationsOpen(false);
    setHelperPaneOpen(true);
    if (paneMessages.length === 0) {
      setPaneMessages([
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: `You're in ${pageLabel}. Ask about this page specifically, or ask broader platform questions and I’ll keep the answer grounded in this context.`
        }
      ]);
    }
  };

  const sendPaneMessage = (seed?: string) => {
    const text = (seed || paneComposer).trim();
    if (!text) return;

    const nextMessages: PaneMessage[] = [
      ...paneMessages,
      { id: `user-${Date.now()}`, role: "user", text },
      {
        id: `assistant-${Date.now() + 1}`,
        role: "assistant",
        text: createPaneResponse(text, pageLabel)
      }
    ];

    setPaneMessages(nextMessages);
    setPaneComposer("");
    setHelperPaneOpen(true);
  };

  return (
    <>
      <div className="fixed left-5 top-1/2 z-40 -translate-y-1/2">
        <div className="relative flex flex-col items-start gap-3">
        {!isHome && (
          <button
            onClick={() => {
              setExpanded((value) => {
                const next = !value;
                if (!next) {
                  setNotificationsOpen(false);
                  setHelperPaneOpen(false);
                }
                return next;
              });
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-[0_14px_30px_-22px_rgba(15,23,42,0.22)] transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            {expanded ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>
        )}

        {showUtilities && (
          <>
            <button
              onClick={openAskHelper}
              className="inline-flex h-10 items-center gap-2 rounded-full border border-sky-200 bg-white px-3.5 text-[13px] font-medium text-slate-700 shadow-[0_14px_30px_-22px_rgba(15,23,42,0.22)] transition-colors hover:bg-sky-50 hover:text-sky-800"
            >
              <Bot className="h-4 w-4 text-sky-700" />
              Ask Helper
            </button>

            {isHome && (
              <div className="relative">
                <button
                  onClick={() => setNotificationsOpen((value) => !value)}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 text-[13px] font-medium text-slate-700 shadow-[0_14px_30px_-22px_rgba(15,23,42,0.22)] transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  <Bell className="h-4 w-4 text-slate-500" />
                  Notifications
                </button>

                {notificationsOpen && (
                  <div className="absolute left-0 top-full mt-2 w-[250px] rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_22px_50px_-28px_rgba(15,23,42,0.28)]">
                    <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Updates
                    </div>
                    <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-[12px] leading-5 text-slate-500">
                      Notification content is intentionally empty until live operational events are connected.
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
        </div>
      </div>

      {!isHome && helperPaneOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-[380px] border-l border-slate-200 bg-white shadow-[-18px_0_40px_-28px_rgba(15,23,42,0.28)]">
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-600">
                  Ask Helper
                </div>
                <div className="mt-1 text-[15px] font-semibold text-slate-900">
                  {pageLabel} context
                </div>
                <div className="mt-1 text-[12px] leading-5 text-slate-500">
                  Ask about this page, or zoom out into broader platform questions.
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.localStorage.setItem(
                        PANE_HANDOFF_STORAGE_KEY,
                        JSON.stringify({
                          fromPage: location.pathname,
                          pageLabel,
                          messages: paneMessages
                        })
                      );
                    }

                    navigate("/assistant", {
                      state: {
                        fromPagePane: location.pathname
                      }
                    });
                  }}
                  title="Open full Ask Helper"
                  aria-label="Open full Ask Helper"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  <Expand className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setHelperPaneOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="border-b border-slate-200 px-5 py-3">
              <div className="flex flex-wrap gap-2">
                {contextualPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendPaneMessage(prompt)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-white hover:text-slate-900"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {paneMessages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[88%] rounded-[16px] px-4 py-3 text-[13px] leading-6 ${
                    message.role === "assistant"
                      ? "border border-slate-200 bg-slate-50 text-slate-700"
                      : "ml-auto border border-sky-200 bg-sky-50 text-slate-900"
                  }`}
                >
                  {message.text}
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 px-5 py-4">
              <div className="rounded-[18px] border border-slate-200 bg-white px-3 py-2 shadow-[0_12px_24px_-20px_rgba(15,23,42,0.2)]">
                <div className="flex items-end gap-3">
                  <textarea
                    value={paneComposer}
                    onChange={(event) => setPaneComposer(event.target.value)}
                    placeholder={`Ask about ${pageLabel.toLowerCase()} or the wider platform...`}
                    rows={2}
                    className="min-h-[44px] flex-1 resize-none bg-transparent text-[13px] leading-5 text-slate-700 outline-none placeholder:text-slate-400"
                  />
                  <button
                    onClick={() => sendPaneMessage()}
                    className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-sky-600 text-white transition-colors hover:bg-sky-700"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
