import type { DraftContent, DraftRevision } from './authoring-types.js'
import type { KnowledgeGraph } from './knowledge-types.js'
import type { IntakeSource, IntakeSelection, IntakeEvidence, ConnectionSuggestion } from './intake-types.js'
export const INTAKE_LIMITS: { readonly text: number; readonly steps: number }
export function validateIntakeSource(value: unknown): IntakeSource
export function emptySelection(): IntakeSelection
export function validateIntakeSelection(value: unknown, source: IntakeSource): IntakeSelection
export function selectLiteralSource(source: IntakeSource): IntakeSelection
export function intakeContent(source: IntakeSource, selection: IntakeSelection, makeId: () => string): DraftContent
export function intakeEvidence(source: IntakeSource, selection: IntakeSelection): Omit<IntakeEvidence, 'digest'>
export function intakeQuestions(content: DraftContent): { field: string; question: string }[]
export function suggestKnowledgeConnections(document: DraftRevision, graph: KnowledgeGraph): ConnectionSuggestion[]
