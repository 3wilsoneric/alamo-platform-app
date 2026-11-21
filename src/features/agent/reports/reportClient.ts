import type { AgentTransport } from '../conversations/agentTransport';

export type ReportScope = { communityIds: string[]; from: string; through: string };
export type ReportSummary = { id: string; ownerId: string; title: string; status: string; revision: number; version: number; updatedAt: string; completedSources: number; totalSources: number };
export type ReportDataset = { title: string; shape: string; columns: Array<{key: string; label: string; type: string}>; rows: Array<Record<string, string | number | boolean | null>> };
export type ReportSection = { id: string; title: string; observedAt: string; status: string; coverage?: string; period: string; grain: string; note: string; answer: string | null; dataset?: ReportDataset };
export type ExecutiveReport = ReportSummary & { selectedVersion: number; canEdit: boolean; readers: string[]; scope: ReportScope; objective: string; error: string | null;
  sourceProgress: Array<{id: string; title: string; status: string}>; versions: Array<{version: number; createdAt: string; status: string}>;
  artifact: null | { title: string; generatedAt: string; coverage: string; findings: Array<{text: string; sourceIds: string[]}>; sections: ReportSection[]; gaps: string[] };
  view: null | { blocks: Array<{id: string; componentId: string; datasetId: string; sourceIds: string[]}> } };
export const reportRunning = (status: string) => ['queued', 'reading', 'analyzing'].includes(status);
export const reportStatus = (status: string) => ({ queued: 'Queued', reading: 'Reading sources', analyzing: 'Preparing findings', ready: 'Ready', partial: 'Partial coverage', paused: 'Paused', failed: 'Interrupted', cancelled: 'Stopped' })[status] ?? status;
export function createReportClient(transport: AgentTransport) {
  const endpoint = '/api/agent/v1/reports';
  const post = (operation: string, input: unknown, signal?: AbortSignal) => transport.requestJson<ReportSummary>(endpoint, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({operation, input}), ...(signal ? {signal} : {}) });
  return {
    list: (signal?: AbortSignal) => transport.requestJson<{reports: ReportSummary[]}>(endpoint, signal ? {signal} : {}),
    get: (report: Pick<ReportSummary, 'id' | 'ownerId'>, version?: number, signal?: AbortSignal) => transport.requestJson<ExecutiveReport>(`${endpoint}?${new URLSearchParams({id: report.id, ownerId: report.ownerId, ...(version ? {version: String(version)} : {})})}`, signal ? {signal} : {}),
    create: (objective: string, scope: ReportScope, requestId: string, signal?: AbortSignal) => post('create', {objective, scope, requestId}, signal),
    command: (report: ReportSummary, action: string, extra: Record<string, unknown> = {}, signal?: AbortSignal) => post('command', {ownerId: report.ownerId, id: report.id, revision: report.revision, action, ...extra}, signal)
  };
}
