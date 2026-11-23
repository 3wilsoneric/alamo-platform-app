import type { RetainedAttachment } from './conversation-types.js'
import type {CaptureEvidence} from './capture-types.js'
import type { ProcessCitation, ProcessRecord, PracticeAttempt, ChangeImpact } from './process-types.js'
import type { StructuredSop } from './sop-types.js'
export type LearningMaterial = {
  id: string; documentId: string; title: string; kind: string; audience: string; contentRevision: number; publicationRevision: number;
  contentHash: string; publishedAt: string; fingerprint: string; status: 'current' | 'superseded' | 'retracted' | 'needs_review'; reason: string;
  roles: { id: string; title: string; status: string; sourceStatus: string }[]; source: ProcessCitation
}
export type LearningAcknowledgement = {
  id: string; publicationId: string; documentId: string; title: string; sourceFingerprint: string; contentHash: string;
  contentRevision: number; publicationRevision: number; actor: { id: string; name: string }; at: string; statement: string; freshness: string
}
export type LearningWorkspace = {
  changeImpact: ChangeImpact;
  conversationAvailable: boolean; sourceStateFingerprint: string;
  schemaVersion: 1; revision: number; mode: string; permissions: string[]; actor: { id: string; name: string };
  roles: { id: string; title: string; status: string }[]; materials: LearningMaterial[]; acknowledgements: LearningAcknowledgement[];
  attempts: PracticeAttempt[]; references: { id: string; title: string; status: string; roleIds: string[]; source: ProcessCitation }[]
}
export type LearningDetail = LearningMaterial & { attachments?: RetainedAttachment[]; capture?:CaptureEvidence; content: { title: string; body: string; purpose: string; sop?: StructuredSop }; process: ProcessRecord }
