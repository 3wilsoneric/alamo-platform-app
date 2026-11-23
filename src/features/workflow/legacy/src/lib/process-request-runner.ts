import { processClient } from './process-client'
import type { AuthoringClient } from './authoring-types'
import type { ProcessRequest } from './process-types'

export function downloadProcessSnapshot(snapshot: unknown, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Reuses server-retained operations and receipts after any uncertain response. */
export async function runSavedProcessRequest(client: AuthoringClient, id: string, stop = false, confirmPlanHash?: string) {
  let request: ProcessRequest | undefined
  for (let count = 0; count < 10; count++) {
    request = (await processClient.advanceRequest(id, stop, confirmPlanHash)).request
    if (request.status !== 'running') break
    const operation = request.steps.find(step => step.status === 'ready')?.operation
    if (operation?.kind === 'author') await client.mutate(operation.draftId, operation.input)
    else if (operation?.kind === 'ask') await processClient.askSaved(operation.input)
    else if (operation?.kind === 'command') await processClient.command(operation.input)
  }
  if (request?.status === 'running') throw new Error('The remaining steps are saved. Type “continue” to resume.')
  if (request?.status === 'needs_review') throw new Error(request.reason)
  if (request?.status === 'complete') for (const step of request.steps) if (step.operation?.kind === 'export') downloadProcessSnapshot(step.operation.snapshot, `proforma-process-${step.id}.json`)
  return request
}
