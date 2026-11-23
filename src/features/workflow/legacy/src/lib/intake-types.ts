import type { MediaReference } from './media-types.js'
import type { DraftContent } from './authoring-types.js'
import type { SourceFile, FileLocation } from './file-types.js'
export type IntakeSource = { schemaVersion: 1; title: string; reference: string; text: string; file?: SourceFile; media?: MediaReference }
export type IntakeSelection = {
  audience: string; purpose: string; trigger: string; applicability: string; ownerRole: string; prerequisites: string; completionCriteria: string; exceptions: string; handoff: string;
  steps: { action: string; role: string; expectedResult: string; system: string }[]
}
export type IntakeEvidence = { schemaVersion: 1; source: IntakeSource; selection: IntakeSelection; citations: { path: string; quote: string; start: number; location?: FileLocation }[]; digest: string }
export type IntakePrepared = { method: 'ai-extraction' | 'literal'; notice: string; selection: IntakeSelection; content: DraftContent }
export type ConnectionSuggestion = { targetId: string; targetTitle: string; predicate: string; quote: string; quoteStart: number; rationale: string }
