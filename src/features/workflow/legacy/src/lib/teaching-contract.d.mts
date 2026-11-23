import type { DraftActor, DraftContent, DraftRevision } from './authoring-types.js'
import type { TeachingStart, TeachingAnswer, TeachingQuestion, TeachingSession } from './teaching-types.js'
export function teachingStart(input: unknown): TeachingStart
export function teachingContent(input: TeachingStart, makeId: () => string): DraftContent
export function teachingQuestions(content: DraftContent): TeachingQuestion[]
export function validateTeachingAnswer(input: unknown): TeachingAnswer
export function answerTeaching(content: DraftContent, answer: TeachingAnswer, actor: DraftActor, at: string, makeId: () => string): { content: DraftContent; answer: TeachingSession['answers'][number] }
export function assertTeachingHistory(history: DraftRevision[]): void
