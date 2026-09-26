export type CanvasModuleId = "communities" | "communityDetail" | "residentSearch" | "incidents" | "dataExplorer" | "glossary" | "command";
export type PlatformModuleKind = "surface" | "analysis";

export interface PlatformModuleDefinition {
  id: string;
  kind: PlatformModuleKind;
  family: string;
  title: string;
  eyebrow: string;
  description: string;
  aliases: string[];
  scopes: string[];
  data: string[];
  capabilities: string[];
  canvasId?: CanvasModuleId;
  icon?: "building" | "siren" | "report" | "pill" | "chart" | "spark";
  focus?: string;
  route?: string;
  tool?: string;
  visualType?: string;
}

export const platformModuleRegistry: readonly PlatformModuleDefinition[];
export function getPlatformModule(id: string): PlatformModuleDefinition | null;
export function getPlatformModuleByTool(tool: string): PlatformModuleDefinition | null;
export function getPlatformModuleByCanvasId(canvasId: CanvasModuleId, focus?: string | null): PlatformModuleDefinition | null;
export function buildPlatformModuleRoute(moduleOrId: string | PlatformModuleDefinition, options?: { facilityId?: string | null }): string | null;
export function getPlatformModuleForRoute(route?: string | null): PlatformModuleDefinition | null;
export function resolvePlatformModuleRequest(content: string, options?: { kind?: PlatformModuleKind | null }): PlatformModuleDefinition | null;
export function getPlatformModuleManifest(): Array<Record<string, unknown>>;
export function getRelevantPlatformModules(content: string, limit?: number): Array<Record<string, unknown>>;
