import type { ProcessCitation } from './process-types.js'
export type MaintenanceSource = { processId: string; title: string; fingerprint: string; status: string; version: string; source: ProcessCitation; publications: { id: string; status: string; fingerprint: string; contentHash: string }[] }
export type MaintenanceEvidence = { field: string; stepId: string | null; quote: string; start: number }
export type MaintenanceProposal = { schemaVersion: 1; assessmentId: string; source: MaintenanceSource; signalIds: string[]; title: string; changes: { instruction: string; evidence: MaintenanceEvidence }[] }
export type MaintenanceAssessment = { schemaVersion: 1; streamId: string; signalIds: string[]; processId: string; sourceVersion: string; reason: string } & (
  { outcome: 'no_change' } | { outcome: 'propose_revision'; proposal: { title: string; changes: { instruction: string; evidence: MaintenanceEvidence }[] } }
)
