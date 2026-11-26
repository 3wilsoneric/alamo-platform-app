// Unit checks for Ally's live report client: poll backoff, error
// classification, immutable-version caching and the SSE event parser.
// Runs with `node --test` (Node >= 22.18 strips the TypeScript types).
import assert from 'node:assert/strict';
import test from 'node:test';
import { AgentRequestError, AGENT_ACCESS_MESSAGE, AGENT_UNAVAILABLE_MESSAGE, agentHttpError, agentNetworkError, isTransientAgentError } from '../src/features/agent/conversations/agentErrors.ts';
import { applyHistoryResults, applyLiveEvent, createSseParser, currentStep, formatElapsed, mergeSteps, nextPollDelay, parseReportEvent, readReportEvents, summaryPatch, versionsToFetch } from '../src/features/agent/reports/reportLive.ts';

test('poll backoff: 2.5 s → 5 s → 10 s while running, capped; success resets', () => {
  assert.deepEqual([0, 1, 2, 3, 9].map(f => nextPollDelay(true, f)), [2_500, 5_000, 10_000, 10_000, 10_000]);
  assert.deepEqual([0, 1, 2, 3, 4, 20].map(f => nextPollDelay(false, f)), [30_000, 5_000, 10_000, 20_000, 30_000, 30_000]);
});

test('HTTP and network failures are classified accurately', () => {
  for (const status of [500, 502, 503, 504, 408, 429]) {
    const error = agentHttpError(status);
    assert.equal(error.kind, 'unavailable', String(status));
    assert.equal(error.message, AGENT_UNAVAILABLE_MESSAGE);
    assert(isTransientAgentError(error));
  }
  for (const status of [401, 403]) {
    const error = agentHttpError(status, 'source_forbidden');
    assert.equal(error.kind, 'access');
    assert.equal(error.message, AGENT_ACCESS_MESSAGE);
    assert(!isTransientAgentError(error));
  }
  const missing = agentHttpError(404, 'report_not_found');
  assert.equal(missing.kind, 'access');
  assert.equal(missing.message, 'This report is not available to your account.');
  assert.equal(agentHttpError(409, 'report_changed').kind, 'rejected');
  assert.equal(agentHttpError(503, 'conversation_source_temporarily_unavailable').kind, 'unavailable', 'a specific code keeps its wording and transient kind');
  assert(isTransientAgentError(agentNetworkError()));
  assert(!isTransientAgentError(new Error('boom')));
  assert(!isTransientAgentError(new AgentRequestError('x', 'signin')));
});

const report = (version, status = 'ready') => ({ id: 'r', ownerId: 'o', selectedVersion: version, version, status });

test('history fetches each completed version once and revalidates on demand', () => {
  const versions = [{ version: 1, status: 'ready' }, { version: 2, status: 'partial' }, { version: 3, status: 'reading' }];
  assert.deepEqual(versionsToFetch(versions, new Set(), false), [1, 2, 3]);
  assert.deepEqual(versionsToFetch(versions, new Set([1, 2, 3]), false), [3], 'only the running version is re-polled');
  assert.deepEqual(versionsToFetch(versions, new Set([1, 2]), true), [1, 2, 3], 'revalidation rechecks access for every version');
});

test('history keeps the last good copy through transient failures and drops denied versions', () => {
  const cache = new Map();
  assert.deepEqual(applyHistoryResults(cache, [{ version: 1, ok: true, value: report(1) }, { version: 2, ok: true, value: report(2) }]), { unavailable: false });
  assert.equal(cache.size, 2);
  assert.deepEqual(applyHistoryResults(cache, [{ version: 1, ok: false, transient: true }]), { unavailable: false }, 'transient failure with a cached copy is invisible');
  assert(cache.has(1));
  assert.deepEqual(applyHistoryResults(cache, [{ version: 3, ok: false, transient: true }]), { unavailable: true }, 'nothing cached to show');
  assert.deepEqual(applyHistoryResults(cache, [{ version: 2, ok: false, transient: false }]), { unavailable: true });
  assert(!cache.has(2), 'an access denial removes the cached answer');
  applyHistoryResults(cache, [{ version: 4, ok: true, value: report(4, 'analyzing') }]);
  assert(!cache.has(4), 'running versions are never cached');
});

test('SSE parser handles chunk boundaries, CRLF, comments, multi-line data and ids', () => {
  const parser = createSseParser();
  assert.deepEqual(parser.push(': keep-alive\n\nid: 1\nevent: plan\nda'), []);
  assert.deepEqual(parser.push('ta: {"a":\ndata: 1}\n\n'), [{ event: 'plan', data: '{"a":\n1}', id: '1' }]);
  assert.deepEqual(parser.push('data: x\r'), []);
  assert.deepEqual(parser.push('\n\r\n'), [{ event: 'message', data: 'x', id: '1' }], 'a CRLF split across chunks is one line break');
  assert.deepEqual(parser.push('data\n\ndata:no-space\r\r'), [{ event: 'message', data: '', id: '1' }, { event: 'message', data: 'no-space', id: '1' }]);
  assert.deepEqual(parser.push('event: x\n\n'), [], 'an event without data is not dispatched');
});

test('report events are validated and unknown shapes are skipped', () => {
  const message = (value, extra = {}) => ({ event: 'message', id: null, data: JSON.stringify(value), ...extra });
  const event = parseReportEvent(message({ seq: 4, type: 'step.started', step: { id: 's1', title: 'Census by community' }, report: { status: 'reading', completedSources: 1, totalSources: 3, artifact: { evil: true } } }));
  assert.equal(event.seq, 4);
  assert.deepEqual(event.step, { id: 's1', title: 'Census by community', status: 'running' });
  assert.deepEqual(event.report, { status: 'reading', completedSources: 1, totalSources: 3 }, 'only summary fields can be merged');
  assert.equal(parseReportEvent(message({ seq: 5, type: 'telemetry' })), null);
  assert.equal(parseReportEvent({ event: 'message', id: null, data: '{oops' }), null);
  assert.equal(parseReportEvent(message({ type: 'status' })), null, 'seq is required');
  assert.equal(parseReportEvent(message({ type: 'status' }, { id: '7' })).seq, 7, 'seq may come from the SSE id');
  assert.equal(summaryPatch({ completedSources: -1, revision: 1.5 }), null);
});

test('live steps fold plan and step events; progress names the current step', () => {
  const plan = parseReportEvent({ event: 'plan', id: '1', data: JSON.stringify({ seq: 1, type: 'plan', plan: { steps: [{ id: 'a', title: 'Census' }, { id: 'b', title: 'Incidents' }] } }) });
  let steps = applyLiveEvent([], plan);
  assert.deepEqual(steps.map(s => s.status), ['pending', 'pending']);
  steps = applyLiveEvent(steps, parseReportEvent({ event: 'message', id: null, data: JSON.stringify({ seq: 2, type: 'step.finished', step: { id: 'a', title: 'Census' } }) }));
  steps = applyLiveEvent(steps, parseReportEvent({ event: 'message', id: null, data: JSON.stringify({ seq: 3, type: 'step.started', step: { id: 'b', title: 'Incidents' } }) }));
  assert.equal(currentStep(steps).title, 'Incidents');
  const merged = mergeSteps([{ id: 'a', title: 'Census', status: 'verified' }], steps);
  assert.deepEqual(merged.map(s => [s.id, s.status]), [['a', 'verified'], ['b', 'running']]);
  assert.equal(currentStep([{ id: 'a', title: 'Census', status: 'verified' }]).title, 'Census', 'falls back to the last finished read');
  assert.equal(formatElapsed(65_000), '1:05');
  assert.equal(formatElapsed(3_725_000), '1:02:05');
  assert.equal(formatElapsed(-5), '0:00');
});

const streamResponse = (chunks, { close = true } = {}) => new Response(new ReadableStream({
  start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); if (close) controller.close(); }
}), { headers: { 'content-type': 'text/event-stream' } });
const frame = value => `data: ${JSON.stringify(value)}\n\n`;

test('event stream reader skips replayed seqs and stops at done', async () => {
  const seen = [];
  const result = await readReportEvents(streamResponse([frame({ seq: 2, type: 'status' }), frame({ seq: 3, type: 'status', report: { status: 'reading' } }), frame({ seq: 4, type: 'done' }), frame({ seq: 5, type: 'status' })]), 2, e => seen.push(e.seq), new AbortController().signal);
  assert.deepEqual(seen, [3, 4]);
  assert.deepEqual(result, { lastSeq: 4, done: true });
});

test('event stream reader reports a clean close without done for resume', async () => {
  const result = await readReportEvents(streamResponse([frame({ seq: 1, type: 'plan' })]), 0, () => {}, new AbortController().signal);
  assert.deepEqual(result, { lastSeq: 1, done: false });
  const terminal = await readReportEvents(streamResponse([frame({ seq: 9, type: 'status', report: { status: 'cancelled' } })], { close: false }), 0, () => {}, new AbortController().signal);
  assert.equal(terminal.done, true, 'a terminal status ends the stream');
});

test('event stream reader gives up on an idle stream and honours abort', async () => {
  const idle = await readReportEvents(streamResponse([frame({ seq: 1, type: 'plan' })], { close: false }), 0, () => {}, new AbortController().signal, 30);
  assert.deepEqual(idle, { lastSeq: 1, done: false });
  const controller = new AbortController();
  const pending = readReportEvents(streamResponse([], { close: false }), 0, () => {}, controller.signal, 10_000);
  controller.abort();
  assert.equal((await pending).done, false);
});
