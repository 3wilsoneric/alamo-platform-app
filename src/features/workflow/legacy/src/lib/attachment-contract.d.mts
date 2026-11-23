import type { SourceAttachment, RetainedAttachment } from './conversation-types'
import type { DraftRevision } from './authoring-types'
export function validateAttachment(value: unknown): SourceAttachment
export function conversationAttachments(document: Partial<DraftRevision>): RetainedAttachment[]
export function assertAttachmentCapture(document: Partial<DraftRevision> | null | undefined, attachment: SourceAttachment): void
