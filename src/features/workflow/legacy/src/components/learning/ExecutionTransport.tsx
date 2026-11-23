'use client'
import { createContext, useContext } from 'react'
import type { ExecutionTransport } from '@/lib/execution-types'

const localTransport: ExecutionTransport = async <T,>(command: Record<string, unknown> | null, id?: string): Promise<T> => {
  const response = await fetch(`/api/workflow/v1/handoff${id ? `?id=${encodeURIComponent(id)}` : ''}`, {
    method: command ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(120000),
    headers: { 'content-type': 'application/json' }, ...(command ? { body: JSON.stringify(command) } : {}),
  })
  const value = await response.json().catch(() => null)
  if (!response.ok || !value) throw new Error(value?.error?.message ?? 'The macro connection is unavailable. Your message is retained.')
  return value as T
}
export const ExecutionTransportContext = createContext<ExecutionTransport>(localTransport)
export function useExecutionTransport() { return useContext(ExecutionTransportContext) }
