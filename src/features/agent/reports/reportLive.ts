// Pure helpers for live report state: poll backoff, immutable-version caching,
// and the Server-Sent Events wire format. Type-only imports keep this module
// loadable by `node --test` (scripts/check-executive-ally-live.mjs).
import type { ExecutiveReport, ReportSummary } from './reportClient';

const RUNNING = ['queued', 'planning', 'reading', 'analyzing'];
const running = (status: string) => RUNNING.includes(status);

/** Delay before the next report poll. Healthy: 2.5 s while running, 30 s for
 * saved content (revocation recheck). After transient failures back off
 * 5 s → 10 s (running) or 5 → 10 → 20 → 30 s (saved); success resets. */
export function nextPollDelay(isRunning: boolean, failures: number): number {
  if (failures <= 0) return isRunning ? 2_500 : 30_000;
  return Math.min(2_500 * 2 ** Math.min(failures, 8), isRunning ? 10_000 : 30_000);
}

// ---------------------------------------------------------------------------
// History: completed versions are immutable, so each is fetched once.

export type VersionEntry = { version: number; status: string };
export type HistoryResult = { version: number; ok: true; value: ExecutiveReport } | { version: number; ok: false; transient: boolean };

/** Versions that need a GET: uncached or still running ones, or every one
 * when revalidating access (tab regained focus or the user pressed Retry). */
export function versionsToFetch(versions: VersionEntry[], cached: ReadonlySet<number>, revalidate: boolean): number[] {
  return versions.filter(v => revalidate || running(v.status) || !cached.has(v.version)).map(v => v.version);
}

/** Applies fetch results to the cache in place. A transient failure keeps the
 * last good copy; an access failure removes it, because the account may no
 * longer read that version's sources. Returns whether anything is missing. */
export function applyHistoryResults(cache: Map<number, ExecutiveReport>, results: HistoryResult[]): { unavailable: boolean } {
  let unavailable = false;
  for (const result of results) {
    if (result.ok) {
      if (running(result.value.status)) cache.delete(result.version);
      else cache.set(result.version, result.value);
    } else if (result.transient) {
      if (!cache.has(result.version)) unavailable = true;
    } else {
      cache.delete(result.version);
      unavailable = true;
    }
  }
  return { unavailable };
}

/** A previously displayed latest answer that is now history can seed the cache
 * without a GET, but only once it finished. */
export const cacheableAnswer = (value: ExecutiveReport) => !running(value.status);

// ---------------------------------------------------------------------------
// Server-Sent Events (text/event-stream) parsing, per the WHATWG spec subset
// Ally uses: data/event/id fields, comments, CR/LF/CRLF line endings.

export type SseMessage = { event: string; data: string; id: string | null };

export function createSseParser() {
  let buffer = '', data: string[] = [], event = '', id: string | null = null, pendingCr = false;
  function line(text: string, out: SseMessage[]) {
    if (text === '') {
      if (data.length) out.push({ event: event || 'message', data: data.join('\n'), id });
      data = []; event = '';
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
    else if (field === 'event') event = value;
    else if (field === 'id' && !value.includes('\0')) id = value;
  }
  return {
    push(chunk: string): SseMessage[] {
      const out: SseMessage[] = [];
      if (pendingCr && chunk.startsWith('\n')) chunk = chunk.slice(1);
      pendingCr = false;
      buffer += chunk;
      let match: RegExpExecArray | null;
      const breaks = /\r\n|\r|\n/g;
      let start = 0;
      while ((match = breaks.exec(buffer))) {
        // A trailing lone CR may be the first half of a CRLF split across chunks.
        if (match[0] === '\r' && match.index === buffer.length - 1) pendingCr = true;
        line(buffer.slice(start, match.index), out);
        start = match.index + match[0].length;
      }
      buffer = buffer.slice(start);
      if (buffer.length > 1_000_000) throw new Error('Event stream line too long.');
      return out;
    }
  };
}

export const REPORT_EVENT_TYPES = ['plan', 'step.started', 'step.finished', 'status', 'done'] as const;
export type ReportEventType = typeof REPORT_EVENT_TYPES[number];
export type LiveStep = { id: string; title: string; status: string };
export type ReportEvent = {
  seq: number;
  type: ReportEventType;
  report: Partial<ReportSummary> | null;
  step: LiveStep | null;
  steps: LiveStep[];
};

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max = 300) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

function step(value: unknown, fallbackStatus: string): LiveStep | null {
  if (!record(value)) return null;
  const id = text(value.id ?? value.sourceId, 200), title = text(value.title ?? value.label);
  return id && title ? { id, title, status: text(value.status, 40) ?? fallbackStatus } : null;
}

/** Only fields the UI may merge into the displayed report; anything else in
 * the event is ignored so a newer engine cannot overwrite unrelated state. */
export function summaryPatch(value: unknown): Partial<ReportSummary> | null {
  if (!record(value)) return null;
  const patch: Partial<ReportSummary> = {};
  const status = text(value.status, 40), updatedAt = text(value.updatedAt, 40);
  if (status) patch.status = status;
  if (updatedAt) patch.updatedAt = updatedAt;
  for (const key of ['revision', 'version', 'completedSources', 'totalSources'] as const) {
    const n = value[key];
    if (typeof n === 'number' && Number.isSafeInteger(n) && n >= 0) patch[key] = n;
  }
  for (const key of ['id', 'ownerId'] as const) { const v = text(value[key], 200); if (v) patch[key] = v; }
  return Object.keys(patch).length ? patch : null;
}

/** Validates one event payload. Unknown types and malformed JSON return null
 * (skipped), so the engine can add event types without breaking old clients. */
export function parseReportEvent(message: SseMessage): ReportEvent | null {
  let value: unknown;
  try { value = JSON.parse(message.data); } catch { return null; }
  if (!record(value)) return null;
  const seq = typeof value.seq === 'number' ? value.seq : message.id && /^\d+$/.test(message.id) ? Number(message.id) : NaN;
  const type = (typeof value.type === 'string' ? value.type : message.event) as ReportEventType;
  if (!Number.isSafeInteger(seq) || seq < 0 || !REPORT_EVENT_TYPES.includes(type)) return null;
  const plan = record(value.plan) && Array.isArray(value.plan.steps) ? value.plan.steps : Array.isArray(value.steps) ? value.steps : [];
  return {
    seq, type,
    report: summaryPatch(value.report),
    step: step(value.step, type === 'step.started' ? 'running' : type === 'step.finished' ? 'verified' : 'pending'),
    steps: plan.slice(0, 50).flatMap((item: unknown) => step(item, 'pending') ?? [])
  };
}

/** Folds one event into the live step list shown during a run. */
export function applyLiveEvent(steps: LiveStep[], event: ReportEvent): LiveStep[] {
  let next = steps;
  if (event.type === 'plan' && event.steps.length) {
    next = event.steps.map(planned => steps.find(s => s.id === planned.id) ?? planned);
  }
  if (event.step) {
    const update = event.step;
    next = next.some(s => s.id === update.id) ? next.map(s => s.id === update.id ? update : s) : [...next, update];
  }
  return next;
}

const finishedStep = (status: string) => !['pending', 'queued', 'running', 'reading', 'started'].includes(status);

/** Combines saved source progress (finished reads) with live step events. */
export function mergeSteps(saved: LiveStep[], live: LiveStep[]): LiveStep[] {
  const merged = [...saved];
  for (const item of live) {
    const index = merged.findIndex(s => s.id === item.id);
    if (index < 0) merged.push(item);
    else if (!finishedStep(merged[index]!.status)) merged[index] = item;
  }
  return merged;
}

/** The step to name in the progress line: the one running now, else the most
 * recently finished one. */
export function currentStep(steps: LiveStep[]): LiveStep | null {
  return [...steps].reverse().find(s => !finishedStep(s.status) && s.status !== 'pending') ?? [...steps].reverse().find(s => finishedStep(s.status)) ?? null;
}

export const countFinished = (steps: LiveStep[]) => steps.filter(s => finishedStep(s.status)).length;

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Reads a text/event-stream body, delivering events with increasing seq
 * (duplicates from a resumed stream are skipped). Resolves when the stream
 * ends; `done` is true once a done event or a terminal status arrived. Aborts
 * via `idleMs` when the server goes silent (servers should send keep-alive
 * comments more often than that). */
export async function readReportEvents(response: Response, after: number, onEvent: (event: ReportEvent) => void, signal: AbortSignal, idleMs = 45_000): Promise<{ lastSeq: number; done: boolean }> {
  if (!response.body) throw new Error('Event stream has no body.');
  const reader = response.body.getReader(), decoder = new TextDecoder(), parser = createSseParser();
  let lastSeq = after, done = false, idle: ReturnType<typeof setTimeout> | undefined;
  const stop = () => { void reader.cancel().catch(() => undefined); };
  const arm = () => { clearTimeout(idle); idle = setTimeout(stop, idleMs); };
  signal.addEventListener('abort', stop, { once: true });
  try {
    arm();
    while (!done) {
      const chunk = await reader.read();
      if (chunk.done) break;
      arm();
      for (const message of parser.push(decoder.decode(chunk.value, { stream: true }))) {
        const event = parseReportEvent(message);
        if (!event || event.seq <= lastSeq) continue;
        lastSeq = event.seq;
        onEvent(event);
        if (event.type === 'done' || (event.report?.status && !running(event.report.status))) { done = true; break; }
      }
    }
  } finally {
    clearTimeout(idle);
    signal.removeEventListener('abort', stop);
    if (done) stop();
  }
  return { lastSeq, done };
}
