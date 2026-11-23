import { authenticatedWorkflowFetch } from './platform-transport'
import type { AuthoringClient } from './authoring-types'

export class AuthoringRequestError extends Error {
  constructor(public code: string, message: string) { super(message) }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await authenticatedWorkflowFetch(`/api/platform/workflow/v1/drafts${path}`, {
      ...init, cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(path === '/prepare' || (typeof init?.body === 'string' && JSON.parse(init.body).action === 'converse') ? 55000 : 20000),
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
  uploadRecordingChunk: chunk => request('/recordings',{method:'POST',body:JSON.stringify({action:'chunk',...chunk})}),
  commitRecording: manifest => request('/recordings',{method:'POST',body:JSON.stringify({action:'commit',manifest})}),
  recording: id => request(`/recordings?id=${encodeURIComponent(id)}`),
  recordingPart: (id,part) => request(`/recordings?id=${encodeURIComponent(id)}&part=${part}`),
  uploadVisualCapture: value => request('/visuals',{method:'POST',body:JSON.stringify(value)}),
  visual: id => request(`/visuals?id=${encodeURIComponent(id)}`),
  uploadFile: (filename, base64) => request('/files', { method: 'POST', body: JSON.stringify({ filename, base64 }) }),
  selectFile: (id,from,to) => request('/file-selection',{method:'POST',body:JSON.stringify({id,from,to})}),
  originalFile: id => request(`/files?id=${encodeURIComponent(id)}`),
  prepare: (source, method) => request('/prepare', { method: 'POST', body: JSON.stringify({ source, method }) }),
  list: () => request(''),
  get: id => request(`/${encodeURIComponent(id)}`),
  revision: (id, revision) => request(`/${encodeURIComponent(id)}?revision=${revision}`),
  mutate: (id, mutation) => request(`/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(mutation) }),
}
