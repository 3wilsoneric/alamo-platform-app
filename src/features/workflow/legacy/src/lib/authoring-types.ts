import type { MediaReference, MediaManifest, MediaChunk } from './media-types.js'
import type {StoredVisual} from './visual-types.js'
import type { UploadedSource, OriginalFile } from './file-types.js'
import type { ConversationInput, ProcessConversation, SourceAttachment } from './conversation-types.js'
import type { CaptureEvidence, WorkflowCapture } from './capture-types.js'
import type { StructuredSop } from './sop-types.js'
import type { TeachingStart, TeachingAnswer, TeachingSession } from './teaching-types.js'
import type { IntakeSource, IntakeSelection, IntakeEvidence, IntakePrepared } from './intake-types.js'

export type DraftContent = {
  title: string
  kind: 'procedure' | 'policy' | 'tutorial'
  audience: string
  purpose: string
  sourceReference: string
  body: string
  sop?: StructuredSop
}

export type DraftAction = 'save' | 'submit' | 'reopen' | 'approve' | 'reject' | 'publish' | 'retract' | 'import_capture' | 'import_source' | 'start_teaching' | 'answer_teaching' | 'converse'
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
  intake?: IntakeEvidence
  teaching?: TeachingSession
  conversation?: ProcessConversation
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
export type DraftMutation = { action: Exclude<DraftAction, 'import_capture' | 'import_source' | 'start_teaching' | 'answer_teaching' | 'converse'>; expectedRevision: number; content?: DraftContent; note?: string; proposalIds?: string[] }
  | { action: 'import_capture'; expectedRevision: 0; capture: WorkflowCapture }
  | { action: 'import_source'; expectedRevision: 0; source: IntakeSource; selection: IntakeSelection }
  | { action: 'start_teaching'; expectedRevision: 0; session: TeachingStart }
  | { action: 'converse'; expectedRevision: number; turn: ConversationInput; session?: TeachingStart; attachment?: SourceAttachment }
  | { action: 'answer_teaching'; expectedRevision: number; answer: TeachingAnswer }

export interface AuthoringClient {
  uploadRecordingChunk: (chunk: MediaChunk) => Promise<{ id: string }>;
  commitRecording: (manifest: MediaManifest) => Promise<MediaReference>;
  recording: (id: string) => Promise<MediaManifest>;
  recordingPart: (id: string, part: number) => Promise<MediaChunk>;
  uploadVisualCapture(value:unknown):Promise<WorkflowCapture>
  visual(id:string):Promise<StoredVisual>
  uploadFile(filename: string, base64: string): Promise<UploadedSource>
  selectFile(id: string, from: number, to: number): Promise<UploadedSource>
  originalFile(id: string): Promise<OriginalFile>
  prepare(source: IntakeSource, method: 'auto' | 'literal'): Promise<IntakePrepared>
  list(): Promise<DraftList>
  get(id: string): Promise<DraftDetail>
  revision(id: string, revision: number): Promise<DraftRevision>
  mutate(id: string, mutation: DraftMutation): Promise<DraftDetail>
}
