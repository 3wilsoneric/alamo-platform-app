import type { DraftActor } from './authoring-types.js'
import type { IntakeSource, IntakeSelection } from './intake-types.js'
import type { WorkflowCapture } from './capture-types.js'
export type TeachingStart = { title: string; source?: IntakeSource; selection?: IntakeSelection; capture?: WorkflowCapture }
export type TeachingAnswer = { id: string; target: string; value: string }
export type TeachingQuestion = { target: string; question: string; limit: number }
export type TeachingSession = { schemaVersion: 1; startDigest: string; answers: (TeachingAnswer & { question: string; actor: DraftActor; at: string })[] }
