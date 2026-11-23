import type { TeachingStart } from './teaching-types.js'
import type { ConversationTurn, ConversationInput, SourceAttachment } from './conversation-types.js'
import type {CaptureVisual} from './visual-types.js'
import type { MaintenanceAssessment, MaintenanceProposal } from './maintenance-types.js'
import type { SopFlow } from './flow-types.js'
export type ProcessCitation = { questionId?: string; original?: { digest: string; section: number; attachmentId?: string; kind?: 'source' | 'capture' }; nodeId: string; snapshotId: string; fingerprint: string; pointer: string; draftId?: string; revision?: number; publicationId?: string }
export type ProcessStep = { id: string; action: string; role: string; system: string; expectedResult: string; evidenceReference: string }
export type ProcessConnection = { id: string; nodeId: string; title: string; type: string; targetFingerprint: string; predicate: string; status: string; grounding: string; freshness: string }
export type ProcessRecord = {
  primarySources?: { kind: 'source' | 'capture'; title: string; description?: string; digest: string; pointer: string }[];
  attachments?: { id: string; title: string; digest: string; addedRevision: number; pointer: string; kinds: ('source' | 'capture')[] }[];
  visuals?:Record<string,CaptureVisual>;
  id: string; title: string; description: string; kind: string; status: string; grounding: string; origin: string; fingerprint: string;
  revision: number | null; source: ProcessCitation; trigger: string; ownerRole: string; audience: string; prerequisites: string;
  handoff: string; exceptions: string; completionCriteria: string; applicability: string; steps: ProcessStep[]; flow: SopFlow; flowOrigin: 'explicit' | 'sequence';
  connections: ProcessConnection[]; gaps: string[]; automationRequests: { name: string; intent: string; inputs: string[]; steps: { instruction: string; system: string; expectedResult: string }[]; stopConditions: string[] }[]
}
export type ProcessIssue = { reportedSource?: { citation: ProcessCitation; status: string; contentRevision: number; title: string }; proposal?: MaintenanceProposal; freshness?: 'current' | 'source_changed'; resolution?: { publicationId: string; fingerprint: string; contentHash: string }; id: string; processId: string; kind: string; title: string; detail: string; evidenceHash: string; status: 'open' | 'dismissed' | 'cleared' | 'resolved'; createdAt: string; updatedAt: string; history: { at: string; actor: { id: string; name: string }; decision: string; note: string; evidenceHash: string }[] }
export type PracticeAttempt = { visuals?:Record<string,CaptureVisual>; publicationId?: string; documentId?: string; contentRevision?: number; id: string; processId: string; sourceFingerprint: string; sourceStatus: string; title: string; steps: ProcessStep[]; status: 'active' | 'practice_complete' | 'practice_stopped'; observations: Record<string, { note: string; at: string }>; actor: { id: string; name: string }; startedAt: string; updatedAt: string; freshness?: 'current' | 'source_changed'; flow?: SopFlow; cursor?: { stepId: string | null; visit: number }; visits?: { id: string; stepId: string; pathId: string; note: string; handoffNote: string | null; at: string }[] }
export type ChangeImpact = {
  publications: { id: string; processId: string; title: string; status: string; contentRevision: number; truncated: boolean; findings: { code: string; reason: string; path: { nodeId: string; title: string; sourceStatus: string; available: boolean; publicationId?: string | null; expectedFingerprint: string | null; currentFingerprint: string | null; predicate: string | null; relationshipStatus: string | null }[] }[] }[];
  connections: { id: string; from: string; to: string; sourceTitle: string; targetTitle: string; sourceAvailable: boolean; targetAvailable: boolean; predicate: string; status: string; freshness: string }[];
  learning: { id: string; kind: string; processId: string; publicationId: string | null; title: string; reason: string; at: string }[];
  limits: { publications: number; connections: number; learning: number; traversal: { depth: number; documents: number; connections: number; findings: number } }; truncated: boolean;
}
export type ProcessWorkspace = { requests: Pick<ProcessRequest, 'id' | 'message' | 'processId' | 'originProcessId' | 'conversationId' | 'status' | 'steps' | 'planHash' | 'targets'>[]; conversationAvailable: boolean; schemaVersion: 1; revision: number; snapshotId: string; sourceStateFingerprint: string; processes: ProcessRecord[]; issues: ProcessIssue[]; attempts: PracticeAttempt[]; changeImpact: ChangeImpact; permissions: string[]; mode: string }
export type ProcessEvidence = { id: string; title: string; field: string; excerpt: string; location: string; start: number; end: number; status: string; grounding: string; structure?: { block: string; stepNumber?: number; fromStep?: string | null; toStep?: string | null; terminal?: string | null }; citation: ProcessCitation; via: { id: string; predicate: string; status: string; grounding: string }[] }
export type ProcessSource = { title: string; status: string; excerpt: string; citation: ProcessCitation; format?: 'text' | 'record'; value?: unknown }
export type InspectedSource = ProcessSource & { selection?: ProcessEvidence; quote?: string }
export type AnswerSourceMode = 'current' | 'working' | 'published'
export type ProcessAnswer = { sourceContext?: { id: string; title: string }; question: string; answer: string; scope: string; sourceMode: AnswerSourceMode; sourceStateFingerprint: string; method: 'source-excerpts' | 'model-assisted'; contextFingerprint: string; evidence: ProcessEvidence[]; missing: string[]; excluded: { nodeId: string; title: string; reason: string }[]; claims: { text: string; kind: 'supported' | 'conflict'; citations: { evidenceId: string; quote: string }[] }[] }
export type ProcessCommand = { id: string; expectedRevision: number; conversation?: { message: string; processId?: string } } & (
  { action: 'assess_changes'; assessment: MaintenanceAssessment } |
  { action: 'acknowledge'; publicationId: string; sourceFingerprint: string; statement: string } |
  { action: 'start_publication_practice'; publicationId: string; sourceFingerprint: string } |
  { action: 'start_practice'; processId: string; sourceFingerprint: string } |
  { action: 'observe_step'; attemptId: string; stepId: string; note: string; transitionId?: string; handoffNote?: string } |
  { action: 'feedback'; processId: string; sourceFingerprint: string; note: string } |
  { action: 'decide_issue'; issueId: string; evidenceHash: string; decision: 'dismiss' | 'reopen' | 'resolve'; note: string } |
  { action: 'reconcile' }
)
export type ProcessPlanInput = { message: string; expectedRevision: number; sourceStateFingerprint: string; processId?: string | undefined; sourceFingerprint?: string | undefined; attemptId?: string | undefined; issueId?: string | undefined; issueFingerprint?: string | undefined; history?: string[] }
export type ProcessCommandPlan = ProcessCommand extends infer C ? C extends ProcessCommand ? Omit<C, 'id'> : never : never
export type ProcessPlan = { kind: 'changes' } | { kind: 'ask' } | { kind: 'clarify'; message: string } | { kind: 'select_process'; processId: string } | { kind: 'author'; draftId?: string; revision?: number } | { kind: 'export'; processId: string; sourceFingerprint: string } | { kind: 'command'; command: ProcessCommandPlan }

export type ProcessRequestContext = { conversationId?: string; attachment?: SourceAttachment; sourceQuestionId?: string }
export type ProcessRequestInput = { id: string; input: ProcessPlanInput; context?: ProcessRequestContext }
export type RequestStepSummary = { id: string; message: string; status: 'pending' | 'ready' | 'complete'; processId: string | null; title: string; sourceTitle?: string }
export type ProcessHistoryTurn = { id: string; kind: 'answer' | 'command' | 'guide' | 'request' | 'unavailable'; at: string; question: string; origin?: true; processFingerprint?: string | undefined; answer?: ProcessAnswer | undefined; message?: string | undefined; guideId?: string; revision?: number; automation?: ConversationTurn['automation']; requestSteps?: RequestStepSummary[] }
export type SourceSelection = { revision: number; active: { id: string; title: string; at: string } | null; unavailable: boolean; sources: { id: string; title: string; at: string }[] }
export type SourceSelectionInput = { id: string; expectedRevision: number; processId?: string | null; conversationId?: string | null; sourceQuestionId: string | null }
export type ProcessHistory = { sourceSelection: SourceSelection; revision: number; sourceStateFingerprint: string; turns: ProcessHistoryTurn[]; hasEarlier: boolean }
export type SourceDiscussion = { id: string; title: string; attachment: SourceAttachment; fingerprint: string; processId: string | null; conversationId: string | null; at: string }
export type ProcessQuestion = { conversationId?: string; attachment?: SourceAttachment; sourceQuestionId?: string; question: string; processId?: string | undefined; sourceFingerprint?: string | undefined; history: string[]; mode: 'auto' | 'sources'; sourceMode: AnswerSourceMode; turnId: string; message: string }

export type ProcessRequest = {
  id: string; message: string; processId: string | null; originProcessId: string | null; conversationId?: string;
  status: 'awaiting_review' | 'running' | 'complete' | 'stopped' | 'needs_review'; reason?: string;
  planHash?: string; targets?: { id: string; processId: string | null; title: string }[];
  steps: { id: string; message: string; status: 'pending' | 'ready' | 'complete'; operation?:
    { kind: 'author'; draftId: string; input: { action: 'converse'; expectedRevision: number; turn: ConversationInput; session?: TeachingStart; attachment?: SourceAttachment } } |
    { kind: 'ask'; input: ProcessQuestion } | { kind: 'command'; input: ProcessCommand } | { kind: 'export'; snapshot: unknown }
  }[]
}
export type ProcessRequestResult = ProcessPlan | { kind: 'request'; request: ProcessRequest }
