import { fetchWithApiAuth, readBoundedResponseText } from '../../../../../shared/api/authenticatedFetch'

export function authenticatedWorkflowFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetchWithApiAuth(input, init, { consume: async response => new Response(await readBoundedResponseText(response), { status: response.status, headers: response.headers }) })
}
export type WorkflowSession = { mode: 'platform-owner-pilot'; storage: string; actor: { id: string; name: string }; permissions: string[] }
export async function workflowSession(): Promise<WorkflowSession> {
  const response = await authenticatedWorkflowFetch('/api/platform/workflow/v1/session', { cache: 'no-store' })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error?.message ?? 'Workflow is unavailable.')
  return data
}
