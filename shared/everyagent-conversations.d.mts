import type { EveryAgentEvidence } from "./everyagent-contracts.mjs";
export const AGENT_CONVERSATIONS_PATH: string;
export function conversationId(value: unknown): boolean;
export interface ConversationScope { skillId: string; communityIds: string[] }
export interface ConversationEvidence { id: string; skillId: string; title: string; text: string; observedAt: string | null; links: EveryAgentEvidence[] }
export interface ConversationTurn {
  id: string; text: string; status: "working" | "complete" | "failed" | "interrupted" | "canceled"; createdAt: string;
  answer?: { paragraphs: { text: string; kind: string; sourceIds: string[] }[] };
  evidence?: ConversationEvidence[];
}
export interface AgentConversation { id: string; version: number; createdAt: string; scope: ConversationScope[]; workId: string | null; turns: ConversationTurn[] }
export interface ConversationList { modelAvailable: boolean; conversations: { id: string; title: string; createdAt: string; locked: boolean }[] }
export type ConversationCommand = { action: "create"; requestId: string; skillIds: string[]; workId?: string }
  | { action: "send"; requestId: string; conversationId: string; text: string; expectedVersion: number }
  | { action: "cancel"; conversationId: string; turnId: string };
export function validateConversationCommand(value: unknown): ConversationCommand;
export interface ConversationClient {
  list(signal?: AbortSignal): Promise<ConversationList>;
  read(id: string, signal?: AbortSignal): Promise<AgentConversation>;
  command(input: ConversationCommand): Promise<AgentConversation | { canceled: boolean }>;
}
export function createConversationClient(requestJson: <T>(path: string, init: RequestInit) => Promise<T>): ConversationClient;
