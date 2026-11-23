import type { DraftActor } from './authoring-types.js'
import type { SopFlow } from './flow-types.js'
import type { IntakeSource } from './intake-types.js'
import type { WorkflowCapture } from './capture-types.js'

export type SourceAttachment = { title: string; source?: IntakeSource; capture?: WorkflowCapture }
export type RetainedAttachment = SourceAttachment & { id: string; digest: string; addedRevision: number; actor: DraftActor; at: string; pointer: string }

export type ConversationOrigin = { conversationId: string; questionId?: never } | { questionId: string; conversationId?: never }
export type ConversationInput = { id: string; message: string; origin?: ConversationOrigin }
export type GuideChange = { type: 'set' | 'add_step' | 'remove_step'; target: string; value: string } | { type: 'set_flow'; target: 'sop.flow'; value: SopFlow }
export type AutomationRequest = {
  name: string; intent: string; inputs: string[]
  steps: { instruction: string; system: string; expectedResult: string }[]
  stopConditions: string[]
}
export type ConversationPlan = { reply: string; changes: GuideChange[]; automation: AutomationRequest | null }
export type ConversationTurn = ConversationInput & ConversationPlan & { actor: DraftActor; at: string; baseRevision: number; sourceDigest?: string; attachment?: SourceAttachment; contextNotice?: string }
export type ProcessConversation = { schemaVersion: 1; turns: ConversationTurn[] }
