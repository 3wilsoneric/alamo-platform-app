import { useMemo, useState } from "react";
import {
  ArrowRight,
  Clock3,
  Home,
  PencilLine,
  Search
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

interface DemoAction {
  label: string;
  route: string;
}

interface DemoThreadMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  note?: string;
  actions?: DemoAction[];
}

interface SavedConversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: DemoThreadMessage[];
}

interface PaneHandoff {
  fromPage?: string;
  pageLabel?: string;
  messages?: DemoThreadMessage[];
}

const suggestedPrompts = [
  "What changed across facilities since yesterday?",
  "Which communities need attention today?",
  "Show incident trends for Riverside",
  "Help me find the right workforce report"
];

const CONVERSATIONS_STORAGE_KEY = "alamo-ask-helper-conversations";
const ACTIVE_CONVERSATION_STORAGE_KEY = "alamo-ask-helper-active-conversation";
const COMPOSER_STORAGE_KEY = "alamo-ask-helper-composer";
const LEGACY_THREAD_STORAGE_KEY = "alamo-ask-helper-demo-thread";
const PANE_HANDOFF_STORAGE_KEY = "alamo-ask-helper-pane-handoff";

function createDemoResponse(question: string, index: number): DemoThreadMessage {
  return {
    id: `assistant-${index}`,
    role: "assistant",
    text:
      "Ask Helper is currently running in interface mode. Once the Azure-backed query and copilot layer are connected, this response will be grounded in live platform data instead of placeholder behavior.",
    note: "No demo analytics are being shown here.",
    actions: [
      { label: "Open Incident Center", route: "/incidents" },
      { label: "View Communities", route: "/communities" },
      { label: "Go to Workforce", route: "/workforce" }
    ]
  };
}

function getConversationTitle(question: string) {
  const trimmed = question.trim();
  if (!trimmed) return "Untitled chat";
  return trimmed.length > 42 ? `${trimmed.slice(0, 42)}...` : trimmed;
}

function formatUpdatedAt(iso: string) {
  const diffMinutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} hr ago`;
  if (diffMinutes < 2880) return "yesterday";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });
}

function loadStoredConversations() {
  if (typeof window === "undefined") return [];

  window.localStorage.removeItem(LEGACY_THREAD_STORAGE_KEY);

  const raw = window.localStorage.getItem(CONVERSATIONS_STORAGE_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as SavedConversation[];
  } catch {
    window.localStorage.removeItem(CONVERSATIONS_STORAGE_KEY);
    return [];
  }
}

function loadPaneHandoff() {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(PANE_HANDOFF_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PaneHandoff;
  } catch {
    window.localStorage.removeItem(PANE_HANDOFF_STORAGE_KEY);
    return null;
  }
}

function loadActiveConversationId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY);
}

function loadComposer() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(COMPOSER_STORAGE_KEY) || "";
}

function getSalutation() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 16) return "Good afternoon.";
  return "Good evening.";
}

function formatRouteLabel(pathname: string) {
  const segment = pathname.split("/").filter(Boolean).pop();
  if (!segment) return "Ask Helper";
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function loadInitialAssistantState() {
  const savedConversations = loadStoredConversations();
  const paneHandoff = loadPaneHandoff();

  if (!paneHandoff?.messages?.length) {
    const savedActiveId = loadActiveConversationId();
    const activeConversationId =
      savedActiveId &&
      savedConversations.some((conversation) => conversation.id === savedActiveId)
        ? savedActiveId
        : savedConversations[0]?.id || null;

    return {
      conversations: savedConversations,
      activeConversationId
    };
  }

  const nextConversation: SavedConversation = {
    id: `conversation-${Date.now()}`,
    title: getConversationTitle(
      paneHandoff.messages.find((message) => message.role === "user")?.text ||
        `Ask Helper from ${paneHandoff.pageLabel || "page"}`
    ),
    updatedAt: new Date().toISOString(),
    messages: paneHandoff.messages
  };

  const nextConversations = [nextConversation, ...savedConversations];

  if (typeof window !== "undefined") {
    window.localStorage.removeItem(PANE_HANDOFF_STORAGE_KEY);
    window.localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(nextConversations));
    window.localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, nextConversation.id);
  }

  return {
    conversations: nextConversations,
    activeConversationId: nextConversation.id
  };
}

export default function AskHelperWorkspacePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const salutation = getSalutation();
  const [initialAssistantState] = useState(loadInitialAssistantState);
  const [conversationSearch, setConversationSearch] = useState("");
  const [composerValue, setComposerValue] = useState(loadComposer);
  const [conversations, setConversations] = useState<SavedConversation[]>(
    initialAssistantState.conversations
  );
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialAssistantState.activeConversationId
  );
  const restoredFromPage = (location.state as { fromPagePane?: string; restoredFromPage?: string } | null)
    ?.fromPagePane ||
    (location.state as { fromPagePane?: string; restoredFromPage?: string } | null)?.restoredFromPage;
  const restoredFromLabel = restoredFromPage ? formatRouteLabel(restoredFromPage) : null;

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) || null;
  const threadMessages = activeConversation?.messages || [];

  const filteredConversations = useMemo(() => {
    if (!conversationSearch.trim()) return conversations;
    const query = conversationSearch.toLowerCase();
    return conversations.filter((conversation) =>
      conversation.title.toLowerCase().includes(query)
    );
  }, [conversationSearch, conversations]);

  const persistConversations = (nextConversations: SavedConversation[], nextActiveId: string | null) => {
    setConversations(nextConversations);
    setActiveConversationId(nextActiveId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(nextConversations));
      if (nextActiveId) {
        window.localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, nextActiveId);
      } else {
        window.localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
      }
    }
  };

  const showDemoReply = () => {
    const text = composerValue.trim() || suggestedPrompts[1];
    const now = new Date().toISOString();

    const nextUserMessage: DemoThreadMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text
    };

    const nextAssistantMessage = createDemoResponse(text, threadMessages.length + 1);

    let nextConversations: SavedConversation[];
    let nextActiveId = activeConversationId;

    if (activeConversation) {
      nextConversations = conversations.map((conversation) =>
        conversation.id === activeConversation.id
          ? {
              ...conversation,
              updatedAt: now,
              messages: [...conversation.messages, nextUserMessage, nextAssistantMessage]
            }
          : conversation
      );
    } else {
      nextActiveId = `conversation-${Date.now()}`;
      nextConversations = [
        {
          id: nextActiveId,
          title: getConversationTitle(text),
          updatedAt: now,
          messages: [nextUserMessage, nextAssistantMessage]
        },
        ...conversations
      ];
    }

    nextConversations = [...nextConversations].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    persistConversations(nextConversations, nextActiveId);
    setComposerValue("");
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(COMPOSER_STORAGE_KEY, "");
    }
  };

  const openSuggestedRoute = (route: string) => {
    navigate(route, {
      state: {
        fromAssistant: true,
        assistantReturnTo: "/assistant",
        restoredFromPage: location.pathname
      }
    });
  };

  const startNewChat = () => {
    setComposerValue("");
    setActiveConversationId(null);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(COMPOSER_STORAGE_KEY, "");
      window.localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
    }
  };

  const openConversation = (conversationId: string) => {
    setActiveConversationId(conversationId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, conversationId);
    }
  };

  return (
    <div className="h-screen bg-[#f7f7f3] text-slate-900">
      <div className="flex h-full">
        <aside className="hidden h-full w-[292px] shrink-0 border-r border-[#e8e5dc] bg-[#fbfaf6] xl:flex xl:flex-col">
          <div className="border-b border-[#ece7db] px-5 py-5">
            <button
              onClick={startNewChat}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#d8d2c5] bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 shadow-[0_10px_18px_-16px_rgba(15,23,42,0.2)] transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              <PencilLine className="h-4 w-4" />
              New chat
            </button>
          </div>

          <div className="px-4 py-4">
            <div className="flex items-center gap-2 rounded-2xl border border-[#e7e2d7] bg-white px-3 py-2.5 text-sm text-slate-500">
              <Search className="h-4 w-4" />
              <input
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                placeholder="Search conversations"
                className="w-full bg-transparent text-[13px] text-slate-600 outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            <div className="mb-3 px-2 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Chats
            </div>

            {filteredConversations.length === 0 ? (
              <div className="px-2 text-[13px] text-slate-400">No saved conversations yet.</div>
            ) : (
              <div className="space-y-1.5">
                {filteredConversations.map((conversation) => {
                  const selected = conversation.id === activeConversationId;

                  return (
                    <button
                      key={conversation.id}
                      onClick={() => openConversation(conversation.id)}
                      className={`w-full rounded-2xl px-3 py-3 text-left transition-colors ${
                        selected
                          ? "bg-white text-slate-900 shadow-[0_12px_30px_-22px_rgba(15,23,42,0.18)]"
                          : "text-slate-600 hover:bg-white/80 hover:text-slate-900"
                      }`}
                    >
                      <div className="truncate text-sm font-semibold">{conversation.title}</div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                        <Clock3 className="h-3 w-3" />
                        {formatUpdatedAt(conversation.updatedAt)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="border-b border-[#e8e5dc] bg-[#fbfaf6] px-6 py-3">
              <div className="mx-auto flex w-full max-w-[860px] items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  <button
                    onClick={() => navigate("/home")}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 transition-colors hover:bg-sky-200 hover:text-sky-800"
                    title="Back to home"
                    aria-label="Back to home"
                  >
                    <Home className="h-3.5 w-3.5" />
                  </button>
                  <span>/</span>
                  <span className="text-slate-600">Ask Helper</span>
                  {restoredFromLabel && (
                    <>
                      <span>/</span>
                      <span className="text-slate-500">{restoredFromLabel}</span>
                    </>
                  )}
                </div>
                <div />
              </div>
            </div>
            <div
              className={`flex min-h-0 flex-1 overflow-y-auto px-6 ${
                threadMessages.length ? "items-start justify-center" : "items-center justify-center"
              }`}
            >
              <div
                className={`w-full max-w-[860px] ${
                  threadMessages.length ? "flex min-h-full flex-col justify-between py-6" : "py-8"
                }`}
              >
                {!threadMessages.length && (
                  <div className="mx-auto max-w-[700px] text-center">
                    <h1 className="text-[2.35rem] font-semibold tracking-[-0.06em] text-slate-950">
                      {salutation} What do you want to know?
                    </h1>
                    <p className="mx-auto mt-3 max-w-[600px] text-[1rem] leading-7 text-slate-500">
                      Ask about incidents, workforce, facilities, reporting, or the best place to
                      go next in the platform.
                    </p>
                  </div>
                )}

                {threadMessages.length > 0 && (
                  <div className="mx-auto mb-4 w-full max-w-[760px] space-y-4">
                    {threadMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[640px] rounded-[26px] px-5 py-4 ${
                            message.role === "user"
                              ? "border border-[#dfe7ef] bg-[#f5f8fb] text-slate-700 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.14)]"
                              : "border border-[#e6e1d6] bg-white text-slate-700 shadow-[0_24px_64px_-56px_rgba(15,23,42,0.22)]"
                          }`}
                        >
                          <p className="text-[0.98rem] leading-7">{message.text}</p>

                          {message.note && (
                            <p className="mt-3 text-[13px] leading-6 text-slate-400">{message.note}</p>
                          )}

                          {message.actions && (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {message.actions.map((action) => (
                                <button
                                  key={action.label}
                                  onClick={() => openSuggestedRoute(action.route)}
                                  className="inline-flex items-center gap-2 rounded-full border border-[#d9e9fb] bg-[#eef6ff] px-3 py-1.5 text-[13px] font-medium text-sky-800 transition-colors hover:border-sky-300 hover:bg-sky-100"
                                >
                                  {action.label}
                                  <ArrowRight className="h-3.5 w-3.5" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  className={`mx-auto max-w-[760px] rounded-[28px] border border-[#e6e1d6] bg-white p-3.5 shadow-[0_24px_64px_-56px_rgba(15,23,42,0.22)] ${
                    threadMessages.length ? "mt-auto w-full" : "mt-7"
                  }`}
                >
                  <textarea
                    value={composerValue}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setComposerValue(nextValue);
                      if (typeof window !== "undefined") {
                        window.sessionStorage.setItem(COMPOSER_STORAGE_KEY, nextValue);
                      }
                    }}
                    rows={threadMessages.length ? 2 : 4}
                    placeholder="Ask Helper anything about the platform..."
                    className={`w-full resize-none border-0 bg-transparent px-3 py-2 text-[1rem] leading-7 text-slate-700 outline-none placeholder:text-slate-400 ${
                      threadMessages.length ? "min-h-[72px]" : "min-h-[118px]"
                    }`}
                  />

                  <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 px-2 pt-3">
                    {!threadMessages.length && (
                      <div className="flex flex-wrap gap-2">
                        {suggestedPrompts.map((prompt) => (
                          <button
                            key={prompt}
                            onClick={() => {
                              setComposerValue(prompt);
                              if (typeof window !== "undefined") {
                                window.sessionStorage.setItem(COMPOSER_STORAGE_KEY, prompt);
                              }
                            }}
                            className="rounded-full border border-[#e6e1d6] bg-[#f8f6f0] px-3 py-1.5 text-[13px] font-medium text-slate-600 transition-colors hover:border-sky-200 hover:bg-[#eef6ff] hover:text-sky-800"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="text-[13px] text-slate-400">
                        {threadMessages.length
                          ? "Conversation continues and stays saved like a normal chat."
                          : "Start a new saved conversation or reopen a recent one from the sidebar."}
                      </div>
                      <button
                        onClick={showDemoReply}
                        className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

    </div>
  );
}
