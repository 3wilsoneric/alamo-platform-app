import type { EveryAgentSkill } from "./everyagent-catalog.mjs";
export const EVERYAGENT_VERSION: number;
export type EveryAgentCommand = { action: "review"; workId: string } | { action: "cancel_run"; runId: string } | { action: "retry_run"; runId: string } | {
  action: "configure"; skillId: string; paused: boolean; communityIds: string[]; expectedVersion: number;
};
export function validateEveryAgentCommand(value: unknown): EveryAgentCommand;
export interface EveryAgentEvidence {
  id: string; kind: string; label: string; href: string; observedAt: string | null;
}
export interface EveryAgentWork {
  runId?: string;
  sourceFingerprint?: string; sourceCheckedAt?: string | null;
  id: string; skillId: string; title: string; summary: string; status: "needs_review" | "completed";
  createdAt: string; reviewedAt: string | null; communityIds: string[];
  evidence: EveryAgentEvidence[]; relationships: { from: string; relation: string; to: string }[];
}
export interface EveryAgentResponsibility {
  skillId: string; version: number; paused: boolean; communityIds: string[];
  lastChecked: string | null; sourceCheckedAt: string | null; nextCheck: string | null;
  connection: "connected" | "unavailable" | "not_connected" | "not_checked";
  issue: string | null;
}
export interface EveryAgentOverview {
  tasks?: EveryAgentTask[];
  version: number; emailEnabled: false; workerEnabled: boolean;
  skills: EveryAgentSkill[]; responsibilities: EveryAgentResponsibility[]; work: EveryAgentWork[];
  runs: { id: string; skillId: string; startedAt: string; finishedAt: string; status: string }[];
  working: boolean;
}
export interface EveryAgentTask {
  id: string; skillId: string; assignmentVersion: number; skillVersion: number; workflowVersion: number;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  phase: "queued" | "collect" | "validate" | "publish" | "completed" | "failed" | "canceled";
  attempts: number; createdAt: string; updatedAt: string; finishedAt: string | null;
  issue: string | null; previousRunId: string | null;
}
