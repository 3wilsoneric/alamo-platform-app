import { useCallback, useEffect, useRef, useState } from "react";
import { createStoredChatId } from "../chatHistory";

const DEFAULT_SLOW_REQUEST_THRESHOLD_MS = 8_000;

export function useChatRequestLifecycle(
  slowRequestThresholdMs = DEFAULT_SLOW_REQUEST_THRESHOLD_MS
) {
  const [sending, setSending] = useState(false);
  const [slowRequest, setSlowRequest] = useState(false);
  const activeRequestIdRef = useRef<string | null>(null);
  const activeRequestAbortRef = useRef<AbortController | null>(null);
  const inboundPromptTimerRef = useRef<number | null>(null);
  const transientTimerIdsRef = useRef<Set<number>>(new Set());

  const clearInboundPromptTimer = useCallback(() => {
    if (inboundPromptTimerRef.current === null) return;
    window.clearTimeout(inboundPromptTimerRef.current);
    inboundPromptTimerRef.current = null;
  }, []);

  const beginChatRequest = useCallback(() => {
    if (activeRequestIdRef.current) return null;
    clearInboundPromptTimer();
    const requestId = createStoredChatId();
    const abortController = new AbortController();
    activeRequestIdRef.current = requestId;
    activeRequestAbortRef.current = abortController;
    return { requestId, signal: abortController.signal };
  }, [clearInboundPromptTimer]);

  const markRequestSending = useCallback(() => {
    setSlowRequest(false);
    setSending(true);
  }, []);

  const isActiveChatRequest = useCallback(
    (requestId: string) => activeRequestIdRef.current === requestId,
    []
  );

  const finishChatRequest = useCallback((requestId: string) => {
    if (activeRequestIdRef.current !== requestId) return false;
    activeRequestIdRef.current = null;
    activeRequestAbortRef.current = null;
    setSending(false);
    return true;
  }, []);

  const cancelActiveChatRequest = useCallback(() => {
    activeRequestAbortRef.current?.abort();
    activeRequestIdRef.current = null;
    activeRequestAbortRef.current = null;
    setSlowRequest(false);
    setSending(false);
  }, []);

  const queueTransientTimeout = useCallback((callback: () => void, delay: number) => {
    const timerId = window.setTimeout(() => {
      transientTimerIdsRef.current.delete(timerId);
      callback();
    }, delay);
    transientTimerIdsRef.current.add(timerId);
  }, []);

  const scheduleInboundPrompt = useCallback((callback: () => void, delay: number) => {
    clearInboundPromptTimer();
    inboundPromptTimerRef.current = window.setTimeout(() => {
      inboundPromptTimerRef.current = null;
      callback();
    }, delay);
  }, [clearInboundPromptTimer]);

  useEffect(() => () => {
    clearInboundPromptTimer();
    activeRequestAbortRef.current?.abort();
    activeRequestIdRef.current = null;
    activeRequestAbortRef.current = null;
    transientTimerIdsRef.current.forEach((timerId) => window.clearTimeout(timerId));
    transientTimerIdsRef.current.clear();
  }, [clearInboundPromptTimer]);

  useEffect(() => {
    if (!sending) {
      setSlowRequest(false);
      return;
    }
    const slowTimer = window.setTimeout(
      () => setSlowRequest(true),
      slowRequestThresholdMs
    );
    return () => window.clearTimeout(slowTimer);
  }, [sending, slowRequestThresholdMs]);

  return {
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
  };
}
