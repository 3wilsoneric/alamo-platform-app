export interface MetricGrainDefinition {
  id: string;
  label: string;
  valueLabel: string;
  definition: string;
  promptNoun: string;
  aliases: readonly string[];
}

export function getMetricGrainDefinition(metricGrain: string | null | undefined): MetricGrainDefinition | null;
export function inferIncidentCountGrain(content: unknown): "distinct_residents" | "incident_events" | null;
export function getMetricGrainDefinitionForResult(result?: unknown): MetricGrainDefinition | null;
