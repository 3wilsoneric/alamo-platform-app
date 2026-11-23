import type { AuthoringClient, DraftDetail } from '@/lib/authoring-types'
import type { SourceAttachment } from '@/lib/conversation-types'
import type { TeachingStart } from '@/lib/teaching-types'
import { conversationAttachments } from '@/lib/attachment-contract.mjs'

export function discussionAttachment(session?: TeachingStart | null): SourceAttachment | undefined {
  return session ? { title: session.title, ...(session.source ? { source: session.source } : {}), ...(session.capture ? { capture: session.capture } : {}) } : undefined
}
export async function discussionTeachingSession(client: AuthoringClient, attachment: SourceAttachment): Promise<TeachingStart> {
  const prepared = attachment.source ? await client.prepare(attachment.source, 'literal') : null
  return { ...attachment, ...(prepared ? { selection: prepared.selection } : {}) }
}
export function discussionAlreadyRetained(document: DraftDetail['document'] | undefined, attachment: SourceAttachment): boolean {
  if (!document) return false
  const sources = [{ source: document.intake?.source, capture: document.capture?.bundle }, ...conversationAttachments(document)]
  return (['source', 'capture'] as const).every(kind => !attachment[kind] || sources.some(item => JSON.stringify(item[kind]) === JSON.stringify(attachment[kind])))
}
