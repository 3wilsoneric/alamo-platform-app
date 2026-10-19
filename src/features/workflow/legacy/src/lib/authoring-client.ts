import { authenticatedWorkflowFetch } from './platform-transport'
import type { AuthoringClient } from './authoring-types'

export class AuthoringRequestError extends Error {
  constructor(public code: string, message: string) { super(message) }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await authenticatedWorkflowFetch(`/api/platform/workflow/v1/drafts${path}`, {
      ...init, cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    })
  } catch {
    throw new AuthoringRequestError('network_error', 'Could not reach the server. Keep your text here and retry; if a save timed out, load the latest revision to check whether it was saved.')
  }
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) throw new AuthoringRequestError(result?.error?.code ?? 'request_failed', result?.error?.message ?? 'The server could not load or save the draft.')
  return result
}

export const authoringClient: AuthoringClient = {
  list: () => request(''),
  get: id => request(`/${encodeURIComponent(id)}`),
  revision: (id, revision) => request(`/${encodeURIComponent(id)}?revision=${revision}`),
  mutate: (id, mutation) => request(`/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(mutation) }),
}
