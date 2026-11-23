import { authenticatedWorkflowFetch } from './platform-transport'
import type { KnowledgeGraph } from './knowledge-types'
import type { AnswerSourceMode, ProcessAnswer, ProcessCitation, ProcessCommand, ProcessWorkspace, ProcessPlan, ProcessPlanInput, ProcessRequestInput, ProcessHistory, ProcessQuestion, ProcessRequestResult, ProcessRequest, ProcessSource } from './process-types'
import type { LearningWorkspace, LearningDetail } from './learning-types'
import type { SourceDiscussion, SourceSelection, SourceSelectionInput } from './process-types'
export class ProcessRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message) }
}
export function processRequestRejected(error: unknown): boolean {
  // Auth/source-access failures can follow an earlier committed request. Preserve
  // its identity until history is accessible again; only validation/conflict clears it.
  return error instanceof ProcessRequestError && [400, 409, 413, 422].includes(error.status) && !!error.code
}
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await authenticatedWorkflowFetch(`/api/platform/workflow/v1/processes${path}`, { method: body ? 'POST' : 'GET', ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(25000) })
  const value = await response.json().catch(() => null)
  if (!response.ok || !value) throw new ProcessRequestError(value?.error?.message ?? 'Could not reach the process workspace. Your text is retained; refresh to check whether it saved.', response.status, typeof value?.error?.code === 'string' ? value.error.code : undefined)
  return value
}
export const processClient = {
  graph: () => request<KnowledgeGraph>('/graph'),
  workspace: () => request<ProcessWorkspace>(''),
  history: (processId = '', before = '', conversationId = '') => request<ProcessHistory>(`/conversation?${new URLSearchParams({ ...(processId ? { process: processId } : {}), ...(before ? { before } : {}), ...(conversationId ? { conversation: conversationId } : {}) })}`),
  selectSource: (input: SourceSelectionInput) => request<SourceSelection>('/conversation/source-selection', input),
  sourceDiscussion: (id: string) => request<SourceDiscussion>(`/conversation/source?${new URLSearchParams({ id })}`),
  askSaved: (input: ProcessQuestion) => request<ProcessAnswer>('/ask', input),
  request: (value: ProcessRequestInput) => request<ProcessRequestResult>('/requests', value),
  savedRequest: (id: string) => request<ProcessRequest>(`/requests?${new URLSearchParams({ id })}`),
  advanceRequest: (id: string, stop = false, confirmPlanHash?: string) => request<{ kind: 'request'; request: ProcessRequest }>('/requests/advance', { id, ...(stop ? { stop: true } : {}), ...(confirmPlanHash ? { confirmPlanHash } : {}) }),
  plan: (input: ProcessPlanInput) => request<ProcessPlan>('/plan', input),
  learning: () => request<LearningWorkspace>('/learning'),
  material: (id: string, fingerprint: string) => request<LearningDetail>(`/learning/material?${new URLSearchParams({ id, fingerprint })}`),
  ask: (question: string, processId?: string, sourceFingerprint?: string, history: string[] = [], mode: 'auto' | 'sources' = 'auto', sourceMode: AnswerSourceMode = 'current') => request<ProcessAnswer>('/ask', { question, history, mode, sourceMode, ...(processId ? { processId, sourceFingerprint } : {}) }),
  evidence: (citation: ProcessCitation) => request<ProcessSource>('/evidence', citation),
  command: (command: ProcessCommand) => request<ProcessWorkspace & { receipt: { resultId: string | null } }>('/commands', command),
  snapshot: (id: string, fingerprint: string) => request<unknown>(`/snapshot?${new URLSearchParams({ id, fingerprint })}`),
}

export function parseProcessQuestion(input: string) {
  let question = input.trim(), mode: 'auto' | 'sources' = 'auto', sourceMode: AnswerSourceMode = 'current'
  for (let i = 0; i < 3; i++) {
    const prefix = /^(sources only|working draft|published only|current sources):\s*/i.exec(question)
    if (!prefix) break
    const name = prefix[1]!.toLowerCase()
    if (name === 'sources only') mode = 'sources'
    else sourceMode = name === 'working draft' ? 'working' : name === 'published only' ? 'published' : 'current'
    question = question.slice(prefix[0].length)
  }
  return { question, mode, sourceMode }
}
