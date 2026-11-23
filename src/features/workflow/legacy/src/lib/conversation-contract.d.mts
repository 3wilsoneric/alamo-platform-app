import type { DraftContent, DraftRevision } from './authoring-types'
import type { ConversationInput, ConversationPlan } from './conversation-types'
export const CONVERSATION_MESSAGE_LIMIT: 12000
export function validateConversationInput(value: unknown): ConversationInput
export function validateConversationPlan(value: unknown): ConversationPlan
export function applyConversationPlan(content: DraftContent, plan: ConversationPlan, makeId: () => string): { content: DraftContent; plan: ConversationPlan }
export function assertConversationHistory(history: DraftRevision[], fingerprint?: (value: unknown) => string): void
