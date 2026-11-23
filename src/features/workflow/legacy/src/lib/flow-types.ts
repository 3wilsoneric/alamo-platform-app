export type FlowHandoff = { role: string; acceptance: string }
export type FlowTransition = {
  id: string
  fromStepId: string
  toStepId: string | null
  terminal: 'complete' | 'stop' | null
  condition: string
  handoff: FlowHandoff | null
}
export type SopFlow = { schemaVersion: 1; entryStepId: string | null; transitions: FlowTransition[] }
