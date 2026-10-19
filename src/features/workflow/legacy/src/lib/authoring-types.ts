import type { CaptureEvidence, WorkflowCapture } from './capture-types'
import type { StructuredSop } from './sop-types'

export type DraftContent = {
  title: string
  kind: 'procedure' | 'policy' | 'tutorial'
  audience: string
  purpose: string
  sourceReference: string
  body: string
  sop?: StructuredSop
}

export type DraftAction = 'save' | 'submit' | 'reopen' | 'approve' | 'reject' | 'publish' | 'retract' | 'import_capture'
export type DraftState = 'draft' | 'in_review' | 'approved' | 'published'
export type DraftActor = { id: string; name: string }

export type DraftRevision = {
  schemaVersion: 1
  id: string
  revision: number
  state: DraftState
  content: DraftContent
  action: DraftAction
  createdAt: string
  updatedAt: string
  createdBy: DraftActor
  updatedBy: DraftActor
  contentRevision?: number
  contentHash?: string
  capture?: CaptureEvidence
  approval?: { actor: DraftActor; at: string; note: string } | null
}

export type DraftHistory = Pick<DraftRevision, 'revision' | 'state' | 'action' | 'updatedAt' | 'updatedBy'>
export type DraftDetail = { document: DraftRevision; history: DraftHistory[] }
export type DraftSummary = Pick<DraftRevision, 'id' | 'revision' | 'state' | 'updatedAt'> & {
  title: string
  kind: DraftContent['kind']
  audience: string
}
export type DraftList = { mode: 'platform-owner-pilot'; documents: DraftSummary[] }
export type DraftMutation = { action: Exclude<DraftAction, 'import_capture'>; expectedRevision: number; content?: DraftContent; note?: string; proposalIds?: string[] }
  | { action: 'import_capture'; expectedRevision: 0; capture: WorkflowCapture }

export interface AuthoringClient {
  list(): Promise<DraftList>
  get(id: string): Promise<DraftDetail>
  revision(id: string, revision: number): Promise<DraftRevision>
  mutate(id: string, mutation: DraftMutation): Promise<DraftDetail>
}
