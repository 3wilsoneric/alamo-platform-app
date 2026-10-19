export type KnowledgeNode = {
  id: string; type: string; title: string; description: string; origin: 'library' | 'draft';
  status: string; grounding: string; fingerprint: string; draftRevision?: number
}
export type KnowledgeEdge = {
  id: string; from: string; to: string; predicate: string; status: string; origin: 'library' | 'proposal';
  grounding: string; freshness?: 'current' | 'needs_review'; proposalId?: string
}
export type KnowledgeProposal = {
  id: string; revision: number; status: 'proposed' | 'withdrawn' | 'approved' | 'rejected'; predicate: string;
  source: { draftId: string; revision: number; quote: string; quoteStart: number };
  targetId: string; targetTitle: string; rationale: string; createdAt: string;
  freshness: 'current' | 'needs_review'; staleReasons: string[]
}
export type KnowledgeGraph = {
  schemaVersion: 1; mode: 'platform-owner-pilot';
  snapshot: { id: string; capturedAt: string; sources: { id: string; title: string; path: string; digest: string; revision: string }[] };
  nodes: KnowledgeNode[]; edges: KnowledgeEdge[]; proposals: KnowledgeProposal[];
  archives: { id: string; capturedAt: string }[]; predicates: Record<string, string[]>
}
export type KnowledgeEvidence = { title: string; reference: string; pointer: string; excerpt: string; status: string; digest?: string; rationale?: string }
export type KnowledgeImpact = { baseline: string; current: string; changed: { id: string; title: string; change: string }[];
  affected: { id: string; title: string; depth: number }[]; maxDepth: number; notice: string }
export type ProposeKnowledge = { action: 'propose'; expectedRevision: 0; draftId: string; draftRevision: number; targetId: string;
  targetFingerprint: string; snapshotId: string; predicate: string; quote: string; quoteStart: number; rationale: string }
