export const KNOWLEDGE_CONTRACT_VERSION: "1.0";
export const PLATFORM_KNOWLEDGE_RECORD_KINDS: readonly [
  "state_profile", "demand_evidence", "buyer_target", "opportunity",
  "source", "document", "assertion", "note"
];
export const ASSERTION_STATUSES: readonly ["proposed", "approved", "rejected", "superseded"];
export const CAPACITY_QUALIFIERS: readonly ["licensed", "staffed", "funded", "census", "waitlist"];

export type PlatformKnowledgeRecordKind = typeof PLATFORM_KNOWLEDGE_RECORD_KINDS[number];

export interface PlatformKnowledgeSearchInput {
  query: string;
  state: string | null;
  status: string | null;
  kinds: readonly PlatformKnowledgeRecordKind[];
  limit: number;
}

export interface KnowledgeValidation<T> {
  valid: boolean;
  errors: string[];
  value: T | null;
}

export function normalizePlatformKnowledgeSearchInput(value?: unknown): PlatformKnowledgeSearchInput;
export function validateKnowledgeSourceInput(value: unknown): KnowledgeValidation<Record<string, unknown>>;
export function validateKnowledgeDocumentInput(value: unknown): KnowledgeValidation<Record<string, unknown>>;
export function validateKnowledgeAssertionInput(value: unknown): KnowledgeValidation<Record<string, unknown>>;
export function validateKnowledgeNoteInput(value: unknown): KnowledgeValidation<Record<string, unknown>>;
