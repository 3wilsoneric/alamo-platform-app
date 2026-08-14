export type FullReportId =
  | "overview"
  | "community"
  | "effectiveness"
  | "census"
  | "incidents"
  | "medications"
  | "residents";

export interface FullReportMetric {
  label: string;
  value: string;
  detail?: string;
}

export interface FullReportTableBlock {
  type: "table";
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string | number>>;
}

export interface FullReportBarListBlock {
  type: "bar_list";
  items: Array<{ label: string; value: number; displayValue?: string }>;
}

export interface FullReportTrendBlock {
  type: "trend";
  items: Array<{ label: string; value: string }>;
}

export interface FullReportLineChartBlock {
  type: "line_chart";
  label?: string;
  items: Array<{ label: string; value: number; displayValue?: string }>;
}

export interface FullReportParagraphBlock {
  type: "paragraph";
  text: string;
}

export interface FullReportCalloutBlock {
  type: "callout";
  text: string;
}

export interface FullReportMetricGridBlock {
  type: "metric_grid";
  items: FullReportMetric[];
}

export interface FullReportBulletsBlock {
  type: "bullets";
  items: string[];
}

export type FullReportBlock =
  | FullReportTableBlock
  | FullReportBarListBlock
  | FullReportLineChartBlock
  | FullReportTrendBlock
  | FullReportParagraphBlock
  | FullReportCalloutBlock
  | FullReportMetricGridBlock
  | FullReportBulletsBlock;

export interface FullReportDocument {
  version: "governed-full-report-v1";
  id: string;
  reportId: FullReportId;
  title: string;
  summary: string;
  scope: {
    kind: "portfolio" | "community";
    label: string;
    facilityId?: string;
  };
  period: {
    value: string | null;
    label: string;
  };
  generatedAt: string;
  generatedAtLabel: string;
  dataThrough: string;
  freshness: {
    status: "current" | "stale";
    generatedAt: string;
    warning?: string;
    ageHours?: number;
  };
  metrics: FullReportMetric[];
  sections: Array<{
    id: string;
    title: string;
    intro?: string;
    blocks: FullReportBlock[];
  }>;
  evidence: {
    compiledAt: string;
    sources: Array<{
      slice: string;
      rowCount: number;
      detail?: string;
    }>;
  };
}

export interface FullReportPackage {
  report: FullReportDocument;
  html: string;
  filename: string;
  availablePeriods: string[];
}

export interface FullReportRequest {
  reportId: FullReportId;
  facilityId?: string;
  period?: string;
  audience?: string;
}

export interface FullReportDefinition {
  id: FullReportId;
  title: string;
  cadence: string;
  audience: string;
  scope: "portfolio" | "community";
  showInAnalyticsNav: boolean;
  description: string;
  audienceOptions?: Array<{ id: string; label: string }>;
}

export interface FullReportDefinitionsResponse {
  version: "governed-full-report-v1";
  reports: FullReportDefinition[];
}
