import { authenticatedWorkflowFetch } from './platform-transport'
import type { KnowledgeEvidence, KnowledgeGraph, KnowledgeImpact, ProposeKnowledge } from './knowledge-types'

async function request<T>(suffix: string, init?: RequestInit): Promise<T> {
  let response
  try { response = await authenticatedWorkflowFetch(`/api/platform/workflow/v1/knowledge${suffix}`, { ...init, cache: 'no-store', signal: AbortSignal.timeout(20000), headers: { 'Content-Type': 'application/json' } }) }
  catch { throw new Error('Could not reach knowledge storage. Keep your text and retry; reload to check whether a timed-out save succeeded.') }
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) throw new Error(result?.error?.message ?? 'Knowledge could not be loaded or saved.')
  return result
}
export const knowledgeClient = {
  graph: () => request<KnowledgeGraph>(''),
  evidence: (input: { snapshotId?: string; nodeId?: string; edgeId?: string; proposalId?: string; side?: 'source' | 'target' }) => request<KnowledgeEvidence>('/evidence', { method: 'POST', body: JSON.stringify(input) }),
  impact: (baseline: string) => request<KnowledgeImpact>(`/impact?baseline=${encodeURIComponent(baseline)}`),
  propose: (id: string, input: ProposeKnowledge) => request(`/proposals/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(input) }),
  withdraw: (id: string, expectedRevision: number) => request(`/proposals/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ action: 'withdraw', expectedRevision }) }),
  decide: (id: string, expectedRevision: number, action: 'approve' | 'reject', note: string) => request(`/proposals/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ action, expectedRevision, note }) }),
}
const relationshipLabels: Record<string, string> = { for_role: 'For role', documents_workflow: 'Documents workflow', uses_application: 'Uses application',
  governed_by: 'Governed by', teaches: 'Teaches', related_to: 'Related to', performs: 'Performs', hands_off_to: 'Hands off to', references_skill: 'References skill design',
  needs_knowledge: 'Needs knowledge', has_guidance: 'Has guidance', has_step: 'Has step' }
export const relationshipLabel = (value: string) => relationshipLabels[value] ?? value.replaceAll('_', ' ')
