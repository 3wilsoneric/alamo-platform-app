import type {
  CopilotAdHocModuleSpec,
  CopilotToolVisual
} from "../../shared/api/copilotChat";
import type { CensusMovementItem } from "../../shared/modules/CensusMovementModule";
import type { ComparisonBarsRow } from "../../shared/modules/ComparisonBarsModule";
import type { IncidentDetailListItem } from "../../shared/modules/IncidentDetailListModule";
import type { MedicationComplianceItem } from "../../shared/modules/MedicationComplianceModule";
import type { MedicationExceptionDetailItem } from "../../shared/modules/MedicationExceptionDetailModule";
import type { MedicationProfileItem } from "../../shared/modules/MedicationProfileModule";
import type { MedicationWatchItem } from "../../shared/modules/MedicationWatchModule";
import type { MultiSeriesTrendRow } from "../../shared/modules/MultiSeriesTrendModule";
export {
  formatChartNumber,
  getChartNumber,
  getPositiveChartWidth
} from "../../../shared/visual-number-utils.mjs";
import {
  getChartNumber,
  parseChartNumber
} from "../../../shared/visual-number-utils.mjs";

export const LARGE_DATASHEET_ROW_THRESHOLD = 25;
export const LARGE_DATASHEET_PREVIEW_ROWS = 5;
export const LARGE_DATASHEET_FULL_RENDER_LIMIT = 500;
export const LARGE_DATASHEET_RENDER_CHUNK = 250;

export const chartPalette = ["#0f8b73", "#111111", "#d88946", "#bd5c54", "#5f5f5f", "#55a5b8", "#a68a62", "#78916c"];

function getVisualEyebrow(type: CopilotToolVisual["type"]) {
  if (type === "line_chart") return "Trend";
  if (type === "multi_line_chart") return "Trend comparison";
  if (type === "heatmap") return "Heatmap";
  if (type === "donut_chart") return "Composition";
  if (type === "comparison_chart") return "Comparison";
  if (type === "profile_card") return "Profile";
  if (type === "summary_card") return "Summary";
  if (type === "ranked_list") return "Ranking";
  if (type === "bar_chart") return "Breakdown";
  if (type === "table") return "Detail";
  return "Analysis";
}

export function getModuleDisplayLabel(moduleSpec: CopilotAdHocModuleSpec | undefined, visualType: CopilotToolVisual["type"]) {
  if (!moduleSpec) return getVisualEyebrow(visualType);
  if (moduleSpec.templateId === "trend-line") return "Trend";
  if (moduleSpec.templateId === "multi-series-line") return "Trend comparison";
  if (moduleSpec.templateId === "period-heatmap") return "Heatmap";
  if (moduleSpec.templateId === "composition-donut") return "Composition";
  if (moduleSpec.templateId === "comparison-bars") return "Comparison";
  if (moduleSpec.templateId === "ranked-bars") return "Ranking";
  if (moduleSpec.templateId === "data-table") return "Detail";
  if (moduleSpec.templateId === "resident-profile") return "Profile";
  if (moduleSpec.templateId === "topline-summary") return "Summary";
  return "Analysis";
}

export function isDiagnosticVisual(visual: CopilotToolVisual, moduleSpec?: CopilotAdHocModuleSpec) {
  const title = `${visual.title} ${visual.subtitle ?? ""}`.toLowerCase();
  return moduleSpec?.moduleId === "data-availability" ||
    title.includes("freshness") ||
    title.includes("recovery") ||
    title.includes("availability");
}

function getReadableCell(value: string | number | null | undefined) {
  const text = String(value ?? "").trim();
  return text && text !== "null" && text !== "undefined" ? text : "—";
}

function getProfileRows(visual: CopilotToolVisual) {
  return visual.rows.filter((row) => row.meta !== "recent_incident" && row.meta !== "category");
}

export function getProfileValue(visual: CopilotToolVisual, names: string[]) {
  const normalizeProfileLabel = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const normalizedNames = names.map(normalizeProfileLabel);
  const row = getProfileRows(visual).find((item) => {
    const label = normalizeProfileLabel(String(item.cells?.[0] ?? item.label ?? ""));
    return normalizedNames.some((name) => label === name || label.startsWith(`${name} `));
  });
  return getReadableCell(row?.cells?.[1] ?? row?.value ?? null);
}

export function getDiagnosticRows(visual: CopilotToolVisual) {
  return visual.rows.map((row, index) => {
    const cells = row.cells?.length ? row.cells : [row.label, row.value, row.meta ?? ""];
    return {
      id: `${row.label}-${index}`,
      label: getReadableCell(cells[0] ?? row.label),
      value: getReadableCell(cells[1] ?? row.value),
      detail: getReadableCell(cells[2] ?? row.meta)
    };
  });
}

export function getIncidentDetailModuleRows(visual: CopilotToolVisual): IncidentDetailListItem[] {
  const columns = (visual.columns ?? []).map((column) => column.toLowerCase());
  const getCell = (cells: Array<string | number | null>, names: string[]) => {
    const index = columns.findIndex((column) => names.some((name) => column.includes(name)));
    return index >= 0 ? String(cells[index] ?? "") : "";
  };

  return visual.rows.map((row, index) => {
    const cells = row.cells?.length ? row.cells : [row.label, row.value];
    return {
      id: `${getCell(cells, ["date"])}-${getCell(cells, ["resident"])}-${index}`,
      date: getCell(cells, ["date"]) || "Date not listed",
      community: getCell(cells, ["community", "facility"]) || null,
      resident: getCell(cells, ["resident", "client"]) || row.label || "Unknown resident",
      unit: getCell(cells, ["unit"]) || null,
      category: getCell(cells, ["category"]) || null,
      incidentType: getCell(cells, ["incident type", "type"]) || null,
      description: getCell(cells, ["description", "detail", "narrative"]) || null
    };
  });
}

function normalizeColumnName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function columnMatchesName(column: string, name: string) {
  const normalizedColumn = normalizeColumnName(column);
  const normalizedName = normalizeColumnName(name);
  if (!normalizedColumn || !normalizedName) return false;
  return normalizedColumn === normalizedName ||
    normalizedColumn.startsWith(`${normalizedName} `) ||
    normalizedColumn.startsWith(`${normalizedName}s `) ||
    normalizedColumn.endsWith(` ${normalizedName}`) ||
    normalizedColumn.endsWith(` ${normalizedName}s`) ||
    normalizedColumn.includes(` ${normalizedName} `) ||
    normalizedColumn.includes(` ${normalizedName}s `);
}

function getVisualCell(visual: CopilotToolVisual, cells: Array<string | number | null>, names: string[]) {
  const columns = (visual.columns ?? []).map((column) => column.toLowerCase());
  const index = columns.findIndex((column) => names.some((name) => columnMatchesName(column, name)));
  return index >= 0 ? cells[index] : null;
}

export function getCensusMovementModuleItems(visual: CopilotToolVisual): CensusMovementItem[] {
  return visual.rows.map((row, index) => ({
    id: `${row.label}-${index}`,
    label: row.label,
    current: parseChartNumber(row.meta?.match(/census\s+([\d,]+)/i)?.[1]),
    delta: parseChartNumber(row.value)
  }));
}

export function getMedicationComplianceModuleItems(visual: CopilotToolVisual): MedicationComplianceItem[] {
  return visual.rows.map((row, index) => {
    const cells = row.cells?.length ? row.cells : [row.label, row.value];
    return {
      id: `${row.label}-${index}`,
      label: String(getVisualCell(visual, cells, ["community", "facility"]) ?? row.label),
      compliancePct: parseChartNumber(getVisualCell(visual, cells, ["compliance"]) ?? row.value),
      scheduled: parseChartNumber(getVisualCell(visual, cells, ["scheduled"])) || null,
      given: parseChartNumber(getVisualCell(visual, cells, ["given"])) || null,
      notGiven: parseChartNumber(getVisualCell(visual, cells, ["not given"])) || null,
      period: String(getVisualCell(visual, cells, ["month", "period"]) ?? "") || null
    };
  });
}

export function getMedicationProfileModuleItems(visual: CopilotToolVisual): MedicationProfileItem[] {
  return visual.rows.map((row, index) => {
    const cells = row.cells?.length ? row.cells : [row.label, row.value, row.meta ?? ""];
    return {
      id: `${String(cells[0] ?? row.label)}-${index}`,
      label: String(cells[0] ?? row.label),
      value: getReadableCell(cells[1] ?? row.value),
      detail: getReadableCell(cells[2] ?? row.meta)
    };
  });
}

export function getMedicationWatchModuleItems(visual: CopilotToolVisual): MedicationWatchItem[] {
  return visual.rows.map((row, index) => {
    const cells = row.cells?.length ? row.cells : [row.label, row.value];
    return {
      id: `${String(getVisualCell(visual, cells, ["resident"]) ?? row.label)}-${index}`,
      resident: String(getVisualCell(visual, cells, ["resident"]) ?? row.label),
      community: String(getVisualCell(visual, cells, ["community", "facility"]) ?? "") || null,
      unit: String(getVisualCell(visual, cells, ["unit"]) ?? "") || null,
      signal: String(getVisualCell(visual, cells, ["signal"]) ?? row.meta ?? "MAR summary loaded"),
      compliance: String(getVisualCell(visual, cells, ["compliance"]) ?? "") || null,
      notGiven30: getChartNumber(getVisualCell(visual, cells, ["not given"])),
      refusals30: getChartNumber(getVisualCell(visual, cells, ["refusal"])),
      prn30: getChartNumber(getVisualCell(visual, cells, ["prn"])),
      activeMeds: getChartNumber(getVisualCell(visual, cells, ["active meds", "meds"])),
      lastMar: String(getVisualCell(visual, cells, ["last mar"]) ?? "") || null
    };
  });
}

export function getMedicationExceptionDetailModuleRows(visual: CopilotToolVisual): MedicationExceptionDetailItem[] {
  return visual.rows
    .filter((row) => !["not_loaded", "verified_zero"].includes(String(row.meta ?? "")))
    .map((row, index) => {
    const cells = row.cells?.length ? row.cells : [row.label, row.value];
    return {
      id: `${String(getVisualCell(visual, cells, ["date"]) ?? "")}-${String(getVisualCell(visual, cells, ["resident"]) ?? row.label)}-${index}`,
      date: String(getVisualCell(visual, cells, ["date"]) ?? "Date not listed"),
      community: String(getVisualCell(visual, cells, ["community", "facility"]) ?? "") || null,
      resident: String(getVisualCell(visual, cells, ["resident", "client"]) ?? row.label ?? "Resident"),
      medication: String(getVisualCell(visual, cells, ["medication", "med"]) ?? "Medication not listed"),
      route: String(getVisualCell(visual, cells, ["route"]) ?? "") || null,
      outcome: String(getVisualCell(visual, cells, ["outcome"]) ?? "") || null,
      reason: String(getVisualCell(visual, cells, ["reason", "note"]) ?? "") || null,
      scheduled: String(getVisualCell(visual, cells, ["scheduled"]) ?? "") || null,
      prnResult: String(getVisualCell(visual, cells, ["prn result"]) ?? "") || null
    };
  });
}

export function getMatrixModuleRows(visual: CopilotToolVisual): MultiSeriesTrendRow[] {
  const series = (visual.columns ?? []).slice(1);
  return visual.rows.map((row, index) => {
    const cells = row.cells?.length ? row.cells : [row.label, row.value];
    return {
      id: `${row.label}-${index}`,
      period: String(cells[0] ?? row.label),
      values: Object.fromEntries(series.map((name, seriesIndex) => [name, parseChartNumber(cells[seriesIndex + 1])]))
    };
  });
}

export function getComparisonHeaders(visual: CopilotToolVisual) {
  return (visual.columns ?? []).slice(1).filter((header) => !/change|delta|%/i.test(header));
}

export function getComparisonRows(visual: CopilotToolVisual, comparisonHeaders: string[]): ComparisonBarsRow[] {
  const deltaColumnIndex = (visual.columns ?? []).findIndex((header) => /change|delta/i.test(header));
  return visual.rows.map((row, rowIndex) => {
    const cells = row.cells?.length ? row.cells : [row.label, row.value];
    const values = Object.fromEntries(comparisonHeaders.map((header) => {
      const columnIndex = (visual.columns ?? []).indexOf(header);
      return [header, parseChartNumber(cells[columnIndex])];
    }));
    return {
      id: `${row.label}-${rowIndex}`,
      label: String(cells[0] ?? row.label),
      values,
      delta: deltaColumnIndex >= 0 ? parseChartNumber(cells[deltaColumnIndex]) : null
    };
  });
}
