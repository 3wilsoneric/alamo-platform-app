export type ExecutionSource = { documentId: string; publicationId: string; fingerprint: string }
export type ExecutionCommand = Record<string, unknown>
export type ExecutionTransport = (<T>(command: ExecutionCommand | null, id?: string) => Promise<T>) & { connect?: () => Promise<void> }
export type MacroRequest = { name: string; intent: string; inputs: string[]; steps: { instruction: string; system: string; expectedResult: string }[]; stopConditions: string[] }
export type StepBinding = { stepIndex: number; stage: 'assessment-answer-quality' | 'assessor-clarification' | 'assessor-handoff' | 'human' }
export type ExecutionConfiguration = {
  id: string; revision: number; proposalHash: string; status: 'pending' | 'approved' | 'rejected'; enabled: boolean; available: boolean;
  source?: ExecutionSource; macro?: MacroRequest; stepBindings?: StepBinding[]; capability?: { phases: string[] };
  history?: { revision: number; status: string; enabled: boolean; at: string }[]
}
export type ExecutionDiscovery = { sourceBindingId: string; source: ExecutionSource; macros: { id: string; request: MacroRequest }[]; configurations: ExecutionConfiguration[] }
export type ExecutionChat = {
  id: string; version: number; processBinding: { executionId: string; source: ExecutionSource };
  turns: { id: string; text: string; status: string; answer?: { paragraphs: { text: string }[] }; draftReview?: { artifactId: string; artifactRevision: string; decision: 'accept' | 'reject' | null } }[]
}
