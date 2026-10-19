import {
  readJsonStorage,
  writeJsonStorage
} from "../storage/browserStorage";

export type ModuleTelemetryAction =
  | "requested"
  | "surfaced"
  | "refined"
  | "pinned"
  | "refreshed"
  | "dismissed"
  | "exported";

export interface ModuleTelemetryEvent {
  id: string;
  action: ModuleTelemetryAction;
  moduleId: string | null;
  templateId: string | null;
  family: string | null;
  scope: string | null;
  createdAt: number;
}

const STORAGE_KEY = "alamo-platform:module-telemetry:v1";
const MAX_EVENTS = 500;
const ACTIONS = new Set<ModuleTelemetryAction>([
  "requested",
  "surfaced",
  "refined",
  "pinned",
  "refreshed",
  "dismissed",
  "exported"
]);

function boundedNullableString(value: unknown, maximumLength: number) {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > maximumLength) return null;
  const text = value.trim();
  return text || null;
}

function sanitizeTelemetryEvent(value: unknown): ModuleTelemetryEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (
    typeof event.id !== "string" ||
    !event.id.trim() ||
    event.id.length > 512 ||
    !ACTIONS.has(event.action as ModuleTelemetryAction) ||
    typeof event.createdAt !== "number" ||
    !Number.isFinite(event.createdAt) ||
    event.createdAt < 0 ||
    event.createdAt > Date.now() + 5 * 60_000
  ) {
    return null;
  }
  return {
    id: event.id,
    action: event.action as ModuleTelemetryAction,
    moduleId: boundedNullableString(event.moduleId, 512),
    templateId: boundedNullableString(event.templateId, 512),
    family: boundedNullableString(event.family, 240),
    scope: boundedNullableString(event.scope, 240),
    createdAt: event.createdAt
  };
}

function createEventId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `module-event-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readModuleTelemetry(): ModuleTelemetryEvent[] {
  if (typeof window === "undefined") return [];
  const value = readJsonStorage<unknown>(STORAGE_KEY, {
    fallback: [],
    label: "module telemetry"
  });
  return Array.isArray(value)
    ? value.map(sanitizeTelemetryEvent).filter((event): event is ModuleTelemetryEvent => Boolean(event)).slice(-MAX_EVENTS)
    : [];
}

export function recordModuleTelemetry(event: Omit<ModuleTelemetryEvent, "id" | "createdAt">) {
  if (typeof window === "undefined") return;
  const nextEvent: ModuleTelemetryEvent = {
    ...event,
    id: createEventId(),
    createdAt: Date.now()
  };

  let nextEvents = [...readModuleTelemetry(), nextEvent].slice(-MAX_EVENTS);
  if (writeJsonStorage(STORAGE_KEY, nextEvents, { label: "module telemetry" })) return;
  nextEvents = nextEvents.slice(-100);
  writeJsonStorage(STORAGE_KEY, nextEvents, { label: "module telemetry fallback" });
}
