import { ArrowUp, ChevronDown, MessageSquarePlus, Search, X } from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCurrentUserProfile } from "../../../shared/auth/appUserProfile";
import {
  PLATFORM_CANVAS_SURFACE_EVENT,
  type PlatformCanvasSurfaceDetail
} from "../../../shared/canvas/canvasEvents";
import {
  resetCopilotAnalysisSession,
  runCopilotTool,
  type CopilotChatMessage,
  type AnalysisFrame
} from "../../../shared/api/copilotChat";
import { getPlatformModuleForRoute } from "../../../../shared/platform-module-registry.mjs";
import type { CanvasModuleId } from "../../../../shared/platform-module-registry.mjs";
import { recordModuleTelemetry } from "../../../shared/analytics/moduleTelemetry";
import { downloadTextFile } from "../../../shared/files/browserDownload";
import { openSafeExternalUrl } from "../../../shared/navigation/safeExternalNavigation";
import { preloadWorkspaceSurface } from "../../../shared/performance/workspacePreload";
import AppErrorBoundary from "../../../shared/ui/AppErrorBoundary";
import {
  createStoredChatId,
  deriveStoredChatTitle,
  getTimelineMessages,
  sanitizeTimelineForHistory,
  upsertStoredChatThread,
  type ChatTimelineItem,
  type ModuleContext,
  type StoredChatThread
} from "../chatHistory";
import {
  clearLatestGeneratedModuleFromTimeline,
  formatInterpretation,
  getCertifiedQuestionCatalog,
  getModuleForRoute,
  getVisibleMessageActions,
  isModuleRefinementPrompt,
  parseRouteContext,
  recordModuleSpecs,
  searchCertifiedQuestionCatalog,
  shouldRenderChatVisual
} from "../workspaceHomeUtils";
import {
  clearStoredAnalysisSession,
  createAnalysisSessionId,
  createFreshAnalysisSession,
  persistAnalysisSession
} from "../analysisSessionStorage";
import {
  copyTextToClipboard,
  createFallbackMessage,
  formatToolTrace,
  isRequestAbortError,
} from "../chatRuntime";
import {
  createToolResultMessage,
  getModuleMeta
} from "../workspaceModuleModel";
import { MessageActionStrip, UserMessageControls } from "../components/ChatMessageControls";
import { AdHocVisualModule } from "../components/AdHocVisualModule";
import {
  CertifiedQuestionGuide,
  type CertifiedQuestionRunRequest
} from "../components/CertifiedQuestionGuide";
import { FormattedMessageText } from "../components/FormattedMessageText";
import { PlatformModuleRenderer } from "../components/PlatformModuleRenderer";
import { useChatSnapController } from "../hooks/useChatSnapController";
import { useChatRequestLifecycle } from "../hooks/useChatRequestLifecycle";
type ModuleKey = CanvasModuleId;
const CHAT_SNAP_TOP_OFFSET = 84;

export default function WorkspaceHomePage({
  embedded = false,
  sectionId,
  initialQuestionsOpen = false,
  openQuestionsRequest = 0
}: {
  embedded?: boolean;
  sectionId?: string;
  initialQuestionsOpen?: boolean;
  openQuestionsRequest?: number;
}) {
  const [homeSearchParams, setHomeSearchParams] = useSearchParams();
  const { account } = useCurrentUserProfile();
  const [chatOpen, setChatOpen] = useState(initialQuestionsOpen);
  const [questionGuideOpen, setQuestionGuideOpen] = useState(initialQuestionsOpen);
  const [questionGuideSearch, setQuestionGuideSearch] = useState("");
  const [questionGuideCategory, setQuestionGuideCategory] = useState("All");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [initialAnalysisSession] = useState(createFreshAnalysisSession);
  const [analysisSessionId, setAnalysisSessionId] = useState(initialAnalysisSession.sessionId);
  const [analysisFrame, setAnalysisFrame] = useState<AnalysisFrame | null>(initialAnalysisSession.frame);
  const [timelineItems, setTimelineItems] = useState<ChatTimelineItem[]>([]);
  const [chatHistoryId, setChatHistoryId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [copiedInputId, setCopiedInputId] = useState<string | null>(null);
  const [showFloatingTop, setShowFloatingTop] = useState(false);
  const chatPanelRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const moduleScrollLockUntilRef = useRef(0);
  const consumedPromptParamRef = useRef<string | null>(null);
  const activeAccountIdRef = useRef(account?.homeAccountId ?? "local");
  const certifiedQuestionCatalog = useMemo(() => getCertifiedQuestionCatalog(), []);
  const certifiedQuestionCategoryCounts = useMemo(
    () => certifiedQuestionCatalog.reduce<Record<string, number>>((counts, item) => {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
      return counts;
    }, {}),
    [certifiedQuestionCatalog]
  );
  const certifiedQuestionCategories = useMemo(
    () => Array.from(new Set(certifiedQuestionCatalog.map((item) => item.category))),
    [certifiedQuestionCatalog]
  );
  const certifiedQuestionGuideResults = useMemo(() => {
    const baseResults = searchCertifiedQuestionCatalog(questionGuideSearch, certifiedQuestionCatalog.length)
      .filter((item) => questionGuideCategory === "All" || item.category === questionGuideCategory);
    return baseResults;
  }, [certifiedQuestionCatalog.length, questionGuideCategory, questionGuideSearch]);
  const { claimUserScrollControl, preserveScrollIfUserControlled, queueChatItemSnap } = useChatSnapController(
    chatOpen,
    timelineItems.length,
    moduleScrollLockUntilRef,
    CHAT_SNAP_TOP_OFFSET
  );
  const {
    beginChatRequest,
    cancelActiveChatRequest,
    clearInboundPromptTimer,
    finishChatRequest,
    isActiveChatRequest,
    markRequestSending,
    queueTransientTimeout,
    scheduleInboundPrompt,
    sending,
    slowRequest
  } = useChatRequestLifecycle();
  useEffect(() => {
    if (questionGuideCategory !== "All" && !certifiedQuestionCategoryCounts[questionGuideCategory]) {
      setQuestionGuideCategory("All");
    }
  }, [certifiedQuestionCategoryCounts, questionGuideCategory]);

  const appendModuleToChat = useCallback((module: ModuleKey, sourceLabel?: string | null, introText?: string | null, context?: ModuleContext) => {
    const stamp = Date.now();
    const localId = createStoredChatId();
    const moduleItemId = `module-${module}-${localId}`;
    setQuestionGuideOpen(false);
    setQuestionGuideSearch("");
    setChatOpen(true);
    setTimelineItems((current) => {
      const localIntro: ChatTimelineItem[] = introText
        ? [
            {
              id: `message-local-surface-${localId}`,
              type: "message",
              message: {
                id: `local-surface-${localId}`,
                role: "assistant",
                text: introText,
                status: "complete",
                createdAt: stamp
              }
            }
          ]
        : [];

      return [
        ...current,
        ...localIntro,
        {
          id: moduleItemId,
          type: "module",
          module,
          sourceLabel: sourceLabel ?? null,
          ...(context ? { context } : {})
        }
      ];
    });
    queueChatItemSnap(moduleItemId, "smooth", { force: true });
  }, [queueChatItemSnap]);
  const openRouteOrModule = useCallback((
    route?: string | null,
    sourceLabel?: string | null,
    introText?: string | null
  ) => {
    if (/^\/explorer\/[^/?]+/.test(String(route ?? ""))) {
      return;
    }

    const module = getModuleForRoute(route);
    if (module) {
      appendModuleToChat(module, sourceLabel, introText, parseRouteContext(route));
      return;
    }

    if (route) {
      window.location.assign(route);
    }
  }, [appendModuleToChat]);

  const openSupportingSurface = useCallback((route?: string | null, sourceLabel?: string | null) => {
    const stamp = Date.now();
    const localId = createStoredChatId();
    openRouteOrModule(route, sourceLabel);

    if (!sending || !getModuleForRoute(route)) return;

    const processMessage: CopilotChatMessage = {
      id: `supporting-surface-${localId}`,
      role: "assistant",
      text: "Opened the supporting surface. I’m keeping the analysis running and will drop the answer below.",
      status: "complete",
      createdAt: stamp,
      meta: {
        assistantLabel: "Process",
        transient: true,
        variant: "process"
      }
    };

    setTimelineItems((current) => [
      ...current,
      {
        id: `message-${processMessage.id}`,
        type: "message",
        message: processMessage
      }
    ]);
  }, [openRouteOrModule, sending]);

  const openChatPanel = () => {
    preloadWorkspaceSurface("/communities");
    preloadWorkspaceSurface("/incidents");
    preloadWorkspaceSurface("/resident-search");
    setChatOpen(true);
  };

  const openQuestionGuideInThread = () => {
    setQuestionGuideOpen(true);
    queueChatItemSnap("question-guide", "smooth", { force: true });
  };

  const handleExternalQuestionRequest = useEffectEvent(() => {
    openChatPanel();
    openQuestionGuideInThread();
  });

  useEffect(() => {
    if (!openQuestionsRequest) return;
    handleExternalQuestionRequest();
  }, [openQuestionsRequest]);

  const copyUserInput = async (messageId: string, text: string) => {
    try {
      await copyTextToClipboard(text);
      setCopiedInputId(messageId);
      queueTransientTimeout(() => {
        setCopiedInputId((current) => (current === messageId ? null : current));
      }, 1600);
    } catch (error) {
      console.warn("Could not copy chat input.", error);
      setChatError("Could not copy that input. You can still highlight and copy it manually.");
    }
  };
  const startNewChat = () => {
    clearInboundPromptTimer();
    cancelActiveChatRequest();
    const previousSessionId = analysisSessionId;
    const freshSession = createFreshAnalysisSession();
    clearStoredAnalysisSession();
    setThreadId(null);
    setAnalysisSessionId(freshSession.sessionId);
    setAnalysisFrame(freshSession.frame);
    setTimelineItems([]);
    setChatHistoryId(null);
    setChatOpen(true);
    setQuestionGuideOpen(true);
    setQuestionGuideSearch("");
    setChatError(null);
    queueChatItemSnap("question-guide", "smooth", { force: true });
    void resetCopilotAnalysisSession(previousSessionId).catch((error) => {
      console.warn("Could not reset server analysis session.", error);
    });
  };

  const runToolPrompt = async (
    content: string,
    options: { resetAnalysisContext?: boolean; certifiedQuestionRouteId?: string } = {}
  ) => {
    if (!content || sending) return;
    const request = beginChatRequest();
    if (!request) return;
    setQuestionGuideOpen(false);
    setQuestionGuideSearch("");
    const { requestId, signal } = request;
    const requestSessionId = options.resetAnalysisContext ? createAnalysisSessionId() : analysisSessionId;
    const requestAnalysisFrame = options.resetAnalysisContext ? null : analysisFrame;
    if (options.resetAnalysisContext) {
      const previousSessionId = analysisSessionId;
      clearStoredAnalysisSession();
      setThreadId(null);
      setAnalysisSessionId(requestSessionId);
      setAnalysisFrame(null);
      void resetCopilotAnalysisSession(previousSessionId).catch((error) => {
        console.warn("Could not reset server analysis session before guided question.", error);
      });
    }

    const optimisticMessage: CopilotChatMessage = {
      id: `local-tool-${createStoredChatId()}`,
      role: "user",
      text: content,
      status: "complete",
      createdAt: Date.now(),
      ...(options.certifiedQuestionRouteId
        ? { meta: { certifiedQuestionRouteId: options.certifiedQuestionRouteId } }
        : {})
    };

    setChatOpen(true);
    setChatError(null);
    markRequestSending();
    recordModuleTelemetry({ action: "requested", moduleId: null, templateId: null, family: requestAnalysisFrame?.metric ?? null, scope: requestAnalysisFrame?.communityName ? "community" : "portfolio" });
    setTimelineItems((current) => [
      ...current,
      {
        id: `message-${optimisticMessage.id}`,
        type: "message",
        message: optimisticMessage
      }
    ]);
    queueChatItemSnap(`message-${optimisticMessage.id}`, "auto", { force: true });

    try {
      const toolResult = await runCopilotTool({
        content,
        sessionId: requestSessionId,
        analysisFrame: requestAnalysisFrame,
        ...(options.certifiedQuestionRouteId ? { certifiedQuestionRouteId: options.certifiedQuestionRouteId } : {})
      }, { signal });
      if (!isActiveChatRequest(requestId)) return;
      if (toolResult.analysisFrame) setAnalysisFrame(toolResult.analysisFrame);

      if (toolResult.handled && toolResult.tool === "surface_module") {
        const route = toolResult.actions?.find((action) => action.kind === "route" && action.route)?.route;
        const definition = getPlatformModuleForRoute(route);
        openRouteOrModule(route, definition?.title ?? "Platform module", toolResult.text);
        return;
      }

      const toolMessage = createToolResultMessage(toolResult);
      const replacesExistingModule = Boolean(
        requestAnalysisFrame &&
        isModuleRefinementPrompt(content) &&
        (toolResult.moduleSpec || toolResult.moduleSpecs?.length || toolResult.visual)
      );
      recordModuleSpecs(
        replacesExistingModule ? "refined" : "surfaced",
        toolResult.moduleSpecs?.length ? toolResult.moduleSpecs : [toolResult.moduleSpec]
      );

      setTimelineItems((current) => [
        ...(replacesExistingModule ? clearLatestGeneratedModuleFromTimeline(current) : current),
        {
          id: `message-${toolMessage.id}`,
          type: "message",
          message: toolMessage
        }
      ]);
      preserveScrollIfUserControlled();
    } catch (error) {
      if (isRequestAbortError(error)) return;
      if (!isActiveChatRequest(requestId)) return;
      console.error("Structured analysis request failed.", error);
      const fallbackMessage = createFallbackMessage(content, error, "Analysis fallback");
      setTimelineItems((current) => [
        ...current,
        {
          id: `message-${fallbackMessage.id}`,
          type: "message",
          message: fallbackMessage
        }
      ]);
      preserveScrollIfUserControlled();
    } finally {
      finishChatRequest(requestId);
    }
  };

  const runInboundPrompt = useEffectEvent((inboundPrompt: string) => {
    void runToolPrompt(inboundPrompt);
  });

  useEffect(() => {
    const inboundPrompt = homeSearchParams.get("prompt") || homeSearchParams.get("ask");
    const trimmedInboundPrompt = inboundPrompt?.trim();
    if (!trimmedInboundPrompt || consumedPromptParamRef.current === trimmedInboundPrompt) return;

    consumedPromptParamRef.current = trimmedInboundPrompt;
    const nextParams = new URLSearchParams(homeSearchParams);
    nextParams.delete("prompt");
    nextParams.delete("ask");
    setHomeSearchParams(nextParams, { replace: true });
    setChatOpen(true);

    scheduleInboundPrompt(() => {
      runInboundPrompt(trimmedInboundPrompt);
    }, 120);
  }, [homeSearchParams, setHomeSearchParams]);

  useEffect(() => {
    persistAnalysisSession(analysisSessionId, analysisFrame);
  }, [analysisFrame, analysisSessionId]);

  useEffect(() => {
    const nextAccountId = account?.homeAccountId ?? "local";
    if (activeAccountIdRef.current !== nextAccountId) {
      clearInboundPromptTimer();
      cancelActiveChatRequest();
      const freshSession = createFreshAnalysisSession();
      clearStoredAnalysisSession();
      setThreadId(null);
      setAnalysisSessionId(freshSession.sessionId);
      setAnalysisFrame(freshSession.frame);
      setTimelineItems([]);
      setChatHistoryId(null);
      setChatOpen(false);
      setQuestionGuideOpen(false);
      setChatError(null);
      activeAccountIdRef.current = nextAccountId;
    }
  }, [account?.homeAccountId, cancelActiveChatRequest, clearInboundPromptTimer]);

  useEffect(() => {
    if (!timelineItems.length) return;

    const persistTimer = window.setTimeout(() => {
      const sanitizedTimeline = sanitizeTimelineForHistory(timelineItems);
      const sanitizedMessages = getTimelineMessages(sanitizedTimeline).slice(-40);

      if (!sanitizedMessages.length && !sanitizedTimeline.length) return;

      const nextChatHistoryId = chatHistoryId ?? createStoredChatId();
      if (!chatHistoryId) setChatHistoryId(nextChatHistoryId);

      const thread: StoredChatThread = {
        id: nextChatHistoryId,
        title: deriveStoredChatTitle(
          sanitizedMessages,
          sanitizedTimeline,
          (module, context) => getModuleMeta(module, context).title
        ),
        updatedAt: Date.now(),
        threadId,
        analysisSessionId,
        analysisFrame,
        messages: sanitizedMessages,
        timelineItems: sanitizedTimeline
      };

      upsertStoredChatThread(account?.homeAccountId, thread);
    }, 250);

    return () => window.clearTimeout(persistTimer);
  }, [
    account?.homeAccountId,
    analysisFrame,
    analysisSessionId,
    chatHistoryId,
    threadId,
    timelineItems
  ]);

  useEffect(() => {
    if (!chatOpen) {
      setShowFloatingTop(false);
      return;
    }

    const updateFloatingTopState = () => {
      const chatTop = chatPanelRef.current?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
      setShowFloatingTop(chatTop < -220);
    };

    updateFloatingTopState();
    window.addEventListener("scroll", updateFloatingTopState, { passive: true });
    window.addEventListener("resize", updateFloatingTopState);
    return () => {
      window.removeEventListener("scroll", updateFloatingTopState);
      window.removeEventListener("resize", updateFloatingTopState);
      setShowFloatingTop(false);
    };
  }, [chatOpen]);

  useEffect(() => {
    const handleSurfaceRequest = (event: Event) => {
      const detail = (event as CustomEvent<PlatformCanvasSurfaceDetail>).detail;
      openRouteOrModule(detail.route, detail.sourceLabel, detail.introText);
    };

    window.addEventListener(PLATFORM_CANVAS_SURFACE_EVENT, handleSurfaceRequest);
    return () => {
      window.removeEventListener(PLATFORM_CANVAS_SURFACE_EVENT, handleSurfaceRequest);
    };
  }, [openRouteOrModule]);

  const runCertifiedQuestionPrompt = ({ prompt: nextPrompt, routeId }: CertifiedQuestionRunRequest) => {
    if (!nextPrompt.trim() || !routeId || sending) return;
    openChatPanel();
    void runToolPrompt(nextPrompt, {
      resetAnalysisContext: true,
      certifiedQuestionRouteId: routeId
    });
  };

  const questionGuide = (
    <CertifiedQuestionGuide
      categories={certifiedQuestionCategories}
      categoryCounts={certifiedQuestionCategoryCounts}
      category={questionGuideCategory}
      query={questionGuideSearch}
      results={certifiedQuestionGuideResults}
      onCategoryChange={setQuestionGuideCategory}
      onQueryChange={setQuestionGuideSearch}
      onClose={() => setQuestionGuideOpen(false)}
      onRun={runCertifiedQuestionPrompt}
    />
  );

  return (
    <section
      id={sectionId}
      data-embedded-question-workspace={embedded ? "true" : undefined}
      className={`bg-white pb-16 text-[#111111] ${
        embedded
          ? "min-h-[100dvh] scroll-mt-[72px]"
          : "min-h-[calc(100vh-112px)] pt-3 sm:pt-4"
      }`}
    >
      <section className="mx-auto w-full max-w-[1760px] px-3 sm:px-5 lg:px-7">
        {!chatOpen ? (
          <div
            className={`mx-auto max-w-[760px] text-center ${
              embedded ? "mt-[clamp(10vh,17vh,20vh)]" : "mt-[clamp(20vh,31vh,38vh)]"
            }`}
          >
            <h2 className="text-[22px] font-semibold tracking-[-0.035em] text-[#111111]">
              Choose a question
            </h2>
            <button
              type="button"
              onClick={() => {
                openChatPanel();
                openQuestionGuideInThread();
              }}
              aria-expanded={questionGuideOpen}
              data-dark-action="true"
              className="mx-auto mt-4 flex items-center gap-2 bg-[#111111] px-5 py-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#0f8b73]"
            >
              Open questions
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {chatOpen ? (
          <div
            ref={chatPanelRef}
            data-chat-workspace-panel="true"
            className={`mx-auto mb-12 w-full max-w-none scroll-mt-6 animate-[fadeIn_180ms_ease-out] ${
              embedded ? "mt-0" : "mt-4"
            }`}
          >
            {!embedded ? (
              <div className="flex items-center justify-end gap-2 px-1 pb-2 pr-14 pt-1 sm:gap-3 sm:pr-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (questionGuideOpen) {
                        setQuestionGuideOpen(false);
                      } else {
                        openQuestionGuideInThread();
                      }
                    }}
                    aria-expanded={questionGuideOpen}
                    aria-label={questionGuideOpen ? "Hide questions" : "Open questions"}
                    title={questionGuideOpen ? "Hide questions" : "Questions"}
                    className={`inline-flex h-8 w-8 items-center justify-center text-[12px] font-semibold transition-colors sm:h-auto sm:w-auto sm:gap-1.5 sm:border sm:px-3 sm:py-1.5 ${
                      questionGuideOpen
                        ? "border-[#0f8b73] bg-[#f7fbf9] text-[#0f8b73]"
                        : "border-[#d9d9d9] bg-white text-[#595959] hover:border-[#111111] hover:text-[#111111]"
                    }`}
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{questionGuideOpen ? "Hide questions" : "Questions"}</span>
                    <ChevronDown className={`hidden h-3.5 w-3.5 transition-transform sm:block ${questionGuideOpen ? "rotate-180" : ""}`} />
                  </button>
                  <button
                    type="button"
                    onClick={startNewChat}
                    aria-label="Start a new chat"
                    title="New chat"
                    className="inline-flex h-8 w-8 items-center justify-center text-[12px] font-semibold text-[#595959] transition-colors hover:text-[#111111] sm:h-auto sm:w-auto sm:gap-1.5 sm:border sm:border-[#d9d9d9] sm:bg-white sm:px-3 sm:py-1.5 sm:hover:border-[#111111]"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">New chat</span>
                  </button>
                </div>
              </div>
            ) : null}

            <div
              ref={messageListRef}
              className={`min-h-[320px] px-1 pb-[44vh] ${
                embedded ? "mt-0 pt-0" : "mt-2 pt-2"
              }`}
            >
              {timelineItems.length ? (
                <div className="space-y-4">
                  {timelineItems.map((item) => {
                    if (item.type === "module") {
                      return (
                        <div
                          key={item.id}
                          data-chat-item-id={item.id}
                          className="relative mr-auto w-full scroll-mt-[88px] bg-white p-0"
                        >
                          <div
                            data-chat-snap-anchor-id={item.id}
                            className="absolute right-3 top-3 z-10"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                recordModuleTelemetry({ action: "dismissed", moduleId: item.module, templateId: null, family: null, scope: item.context?.facilityId ? "community" : "portfolio" });
                                setTimelineItems((current) => current.filter((entry) => entry.id !== item.id));
                              }}
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center border border-[#d9d9d9] bg-white text-[#595959] transition-colors hover:border-[#111111] hover:text-[#111111]"
                              aria-label="Remove surfaced module"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div data-chat-module-content-id={item.id} className="scroll-mt-24">
                            <PlatformModuleRenderer
                              module={item.module}
                              {...(item.context ? { context: item.context } : {})}
                            />
                          </div>
                        </div>
                      );
                    }

                    const message = item.message;
                    const interpretationText = formatInterpretation(message.meta?.interpretation);
                    const isProcessMessage = message.meta?.variant === "process";
                    const isSuggestionMessage = message.meta?.variant === "suggestion";
                    const renderableModuleSpecs = message.meta?.moduleSpecs?.filter((spec) => (
                      shouldRenderChatVisual(spec.visual, spec)
                    )) ?? [];
                    const renderableModuleSpec = message.meta?.moduleSpec && shouldRenderChatVisual(
                      message.meta.moduleSpec.visual,
                      message.meta.moduleSpec
                    )
                      ? message.meta.moduleSpec
                      : undefined;
                    const renderableVisual = shouldRenderChatVisual(
                      message.meta?.visual,
                      message.meta?.moduleSpec ?? message.meta?.moduleSpecs?.[0]
                    )
                      ? message.meta?.visual
                      : undefined;
                    const hasGeneratedModule = Boolean(
                      renderableModuleSpecs.length || renderableModuleSpec || renderableVisual
                    );
                    const canRemoveMessage = message.role === "assistant" && Boolean(message.meta?.moduleSpecs?.length || message.meta?.moduleSpec || message.meta?.visual || message.meta?.actions?.length);
                    const visibleActions = getVisibleMessageActions(
                      message.meta?.actions,
                      isSuggestionMessage,
                      message.meta?.toolTrace?.tool === "surface_module"
                    );
                    return (
                      <div
                        key={item.id}
                        data-chat-item-id={item.id}
                        data-chat-role={message.role}
                        data-chat-snap-anchor-id={message.role === "user" || isProcessMessage ? item.id : undefined}
                        className="group relative w-full scroll-mt-[88px]"
                      >
                        <div
                          data-chat-message-content={message.role === "user" ? "user" : isProcessMessage ? "process" : isSuggestionMessage ? "suggestion" : "assistant"}
                          className={`relative px-0 py-3 text-[14px] leading-6 sm:px-5 ${
                          message.role === "user"
                            ? "ml-auto max-w-[86%] border border-[#111111] bg-white text-[#111111] sm:max-w-[62%]"
                            : isProcessMessage
                              ? "mr-auto max-w-[72%] bg-transparent px-1 py-1 text-[12px] leading-5 text-[#737373]"
                            : isSuggestionMessage
                              ? "mr-auto max-w-[86%] border-l-2 border-[#0f8b73] bg-[#f7fbf9] text-[#333333] sm:max-w-[68%]"
                            : "mr-auto w-full max-w-none bg-white text-[#333333]"
                        }`}
                        >
                        {canRemoveMessage ? (
                          <button
                            type="button"
                            onClick={() => {
                              recordModuleSpecs("dismissed", message.meta?.moduleSpecs?.length ? message.meta.moduleSpecs : [message.meta?.moduleSpec]);
                              setTimelineItems((current) => current.filter((entry) => entry.id !== item.id));
                            }}
                            className="absolute -right-2 -top-2 inline-flex h-7 w-7 items-center justify-center border border-[#d9d9d9] bg-white text-[#595959] opacity-0 transition-opacity hover:text-[#111111] group-hover:opacity-100"
                            aria-label="Remove chat result"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        {message.role === "assistant" && !isProcessMessage ? (
                          <span data-chat-snap-anchor-id={item.id} className="sr-only">
                            {message.meta?.assistantLabel ?? "AH Analyst"}
                          </span>
                        ) : null}
                        {interpretationText ? (
                          <div className="mb-3 inline-flex border border-[#d9d9d9] bg-[#fafafa] px-3 py-1 text-[12px] leading-5 text-[#595959]">
                            Interpreted {interpretationText}.
                          </div>
                        ) : null}
                        {isProcessMessage && message.meta?.toolTrace ? (
                          <div className="mb-1 inline-flex border border-[#d9d9d9] bg-white px-3 py-1 text-[11px] font-medium normal-case tracking-normal text-[#737373]">
                            {formatToolTrace(message.meta.toolTrace)}
                          </div>
                        ) : null}
                        <FormattedMessageText text={message.text} />
                        {message.role === "user" ? (
                          <UserMessageControls
                            messageId={message.id}
                            text={message.text}
                            copied={copiedInputId === message.id}
                            sending={sending}
                            onCopy={(messageId, text) => void copyUserInput(messageId, text)}
                            onRerun={(text) => void runToolPrompt(text, {
                              ...(message.meta?.certifiedQuestionRouteId
                                ? { certifiedQuestionRouteId: message.meta.certifiedQuestionRouteId }
                                : {})
                            })}
                          />
                        ) : null}
                        <MessageActionStrip
                          actions={visibleActions}
                          messageId={message.id}
                          onAction={(action) => {
                            if (action.kind === "download" || (action.kind === "tool" && /export/i.test(action.label))) {
                              recordModuleSpecs("exported", message.meta?.moduleSpecs?.length ? message.meta.moduleSpecs : [message.meta?.moduleSpec]);
                            }
                            if (action.kind === "route" && action.route) {
                              if (isSuggestionMessage) {
                                openSupportingSurface(action.route, action.label);
                              } else {
                                openRouteOrModule(action.route, action.label);
                              }
                            } else if (action.url) {
                              if (!openSafeExternalUrl(action.url)) {
                                setChatError("That destination could not be opened safely.");
                              }
                            } else if (action.kind === "download" && action.filename && action.content != null) {
                              downloadTextFile(action.filename, action.content, action.mimeType ?? "text/plain");
                            } else if (action.kind === "tool" && action.prompt) {
                              void runToolPrompt(action.prompt, {
                                ...(action.certifiedQuestionRouteId
                                  ? { certifiedQuestionRouteId: action.certifiedQuestionRouteId }
                                  : {})
                              });
                            }
                          }}
                        />
                        </div>
                        {hasGeneratedModule ? (
                          <div className="mt-5 w-full">
                            {renderableModuleSpecs.length ? (
                              <div className="space-y-5">
                                {renderableModuleSpecs.map((moduleSpec) => (
                                  <AppErrorBoundary
                                    key={moduleSpec.id}
                                    label="Answer module"
                                    resetKey={`${message.id}:${moduleSpec.id}`}
                                    compact
                                  >
                                    <AdHocVisualModule
                                      visual={moduleSpec.visual}
                                      moduleSpec={moduleSpec}
                                      onRunPrompt={(nextPrompt) => void runToolPrompt(nextPrompt)}
                                      onInteract={claimUserScrollControl}
                                    />
                                  </AppErrorBoundary>
                                ))}
                              </div>
                            ) : renderableModuleSpec ? (
                              <AppErrorBoundary
                                label="Answer module"
                                resetKey={`${message.id}:${renderableModuleSpec.id}`}
                                compact
                              >
                                <AdHocVisualModule
                                  visual={renderableModuleSpec.visual}
                                  moduleSpec={renderableModuleSpec}
                                  onRunPrompt={(nextPrompt) => void runToolPrompt(nextPrompt)}
                                  onInteract={claimUserScrollControl}
                                />
                              </AppErrorBoundary>
                            ) : renderableVisual ? (
                              <AppErrorBoundary label="Answer module" resetKey={`${message.id}:visual`} compact>
                                <AdHocVisualModule visual={renderableVisual} onInteract={claimUserScrollControl} />
                              </AppErrorBoundary>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {sending ? (
                    <div className="mr-auto inline-flex items-center gap-2 border border-[#d9d9d9] bg-white px-3 py-2 text-[12px] font-medium text-[#595959]">
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-[#0f8b73]/20 border-t-[#0f8b73] animate-spin" />
                      <span>{slowRequest ? "Still working through the data..." : "Thinking through the data..."}</span>
                      {slowRequest ? (
                        <button
                          type="button"
                          onClick={cancelActiveChatRequest}
                          className="ml-1 border border-[#d9d9d9] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#595959] transition-colors hover:border-[#111111] hover:text-[#111111]"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {questionGuideOpen ? (
                    <div data-chat-snap-anchor-id="question-guide" className="scroll-mt-[88px]">
                      {questionGuide}
                    </div>
                  ) : null}
                  {!sending && !questionGuideOpen ? (
                    <div className="flex justify-center pt-5">
                      <button
                        type="button"
                        onClick={() => openQuestionGuideInThread()}
                        data-dark-action="true"
                        className="inline-flex items-center gap-2 bg-[#111111] px-4 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#0f8b73]"
                      >
                        Choose another question
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                  <div className="h-1" />
                  <div aria-hidden="true" className="h-[38vh] min-h-[300px] max-h-[440px]" />
                </div>
              ) : (
                questionGuideOpen ? (
                  <div data-chat-snap-anchor-id="question-guide" className="scroll-mt-[88px] space-y-4">
                    {questionGuide}
                    <div className="h-1" />
                  </div>
                ) : (
                  <div className="flex h-full min-h-[120px] items-center justify-center px-5 text-center">
                    <div>
                      <div className="text-[18px] font-semibold tracking-[-0.035em] text-[#111111]">
                        No answer yet.
                      </div>
                      <p className="mx-auto mt-2 max-w-[420px] text-[13px] leading-5 text-[#595959]">
                        Open the question menu, then choose the answer you want to run.
                      </p>
                      <button
                        type="button"
                        onClick={() => openQuestionGuideInThread()}
                        data-dark-action="true"
                        className="mt-4 inline-flex items-center gap-2 bg-[#111111] px-4 py-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#0f8b73]"
                      >
                        Open questions
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="h-1" />
                  </div>
                )
              )}
            </div>

            {chatError ? (
              <div className="mt-3 border-l-2 border-[#d88946] bg-[#fff7ed] px-4 py-3 text-[13px] leading-6 text-[#7c5a16]">
                {chatError}
              </div>
            ) : null}
            {!embedded && showFloatingTop ? (
              <button
                type="button"
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="fixed right-5 bottom-[116px] z-50 hidden h-11 w-11 items-center justify-center border border-[#d9d9d9] bg-white text-[#595959] backdrop-blur-md transition-colors hover:border-[#111111] hover:text-[#111111] sm:inline-flex"
                aria-label="Back to top"
              >
                <ArrowUp className="h-5 w-5" />
              </button>
            ) : null}

          </div>
        ) : null}
      </section>
    </section>
  );
}
