import { useEffect, useRef, useState } from 'react';
import type { AgentTransport } from '../conversations/agentTransport';
import { AgentRequestError } from '../conversations/agentErrors';
import { reportRunning, type ExecutiveReport } from './reportClient';
import { applyLiveEvent, readReportEvents, type LiveStep, type ReportEvent } from './reportLive';

// Set once the Ally API answers 404/405 or a non-stream body: that deployment
// has no events endpoint, so stay on polling for the rest of the session.
let eventsUnsupported = false;
const MAX_ATTEMPTS = 3;

/** Optional live progress over `GET /api/agent/v1/reports/{id}/events`.
 * `live` is true while a stream is connected, which lets the caller slow its
 * polling; any failure returns to polling (live=false). */
export function useReportEvents(report: ExecutiveReport | null, enabled: boolean, transport: AgentTransport, onEvent: (event: ReportEvent) => void) {
  const [state, setState] = useState<{key: string; live: boolean; steps: LiveStep[]}>({key: '', live: false, steps: []});
  const handler = useRef(onEvent);
  useEffect(() => { handler.current = onEvent; }, [onEvent]);
  const latestRun = Boolean(report && report.selectedVersion === report.version && reportRunning(report.status));
  const key = report ? `${report.ownerId}/${report.id}/${report.version}` : '';
  const ownerId = report?.ownerId, id = report?.id;
  useEffect(() => {
    if (!enabled || !latestRun || !ownerId || !id || eventsUnsupported) return;
    const controller = new AbortController();
    let after = 0;
    void (async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !controller.signal.aborted;) {
        try {
          const query = new URLSearchParams({ownerId, ...(after ? {after: String(after)} : {})});
          const response = await transport.openStream(`/api/agent/v1/reports/${encodeURIComponent(id)}/events?${query}`, controller.signal);
          if (!/^text\/event-stream\b/i.test(response.headers.get('content-type') ?? '')) { eventsUnsupported = true; void response.body?.cancel(); break; }
          setState(current => ({key, live: true, steps: current.key === key ? current.steps : []}));
          const before = after;
          const result = await readReportEvents(response, after, event => {
            after = event.seq;
            setState(current => ({key, live: true, steps: applyLiveEvent(current.key === key ? current.steps : [], event)}));
            handler.current(event);
          }, controller.signal);
          if (result.done) break;
          // Closed without done: resume from the last seq after a short pause.
          // A stream that delivered nothing counts as a failed attempt.
          attempt = result.lastSeq > before ? 0 : attempt + 1;
        } catch (error) {
          if (controller.signal.aborted) return;
          if (error instanceof AgentRequestError && (error.status === 404 || error.status === 405)) { eventsUnsupported = true; break; }
          attempt++;
        }
        if (controller.signal.aborted) return;
        setState(current => current.key === key ? {...current, live: false} : current);
        await new Promise(resolve => { const t = setTimeout(resolve, 1000 * (attempt + 1)); controller.signal.addEventListener('abort', () => { clearTimeout(t); resolve(null); }, {once: true}); });
      }
      if (!controller.signal.aborted) setState(current => current.key === key ? {...current, live: false} : current);
    })();
    return () => { controller.abort(); setState(current => current.key === key ? {...current, live: false} : current); };
  }, [enabled, latestRun, key, ownerId, id, transport]);
  return state.key === key ? {live: state.live, steps: state.steps} : {live: false, steps: [] as LiveStep[]};
}
