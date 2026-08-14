import { useEffect, useState } from "react";
import type { CopilotAdHocModuleSpec, CopilotToolVisual } from "../../../shared/api/copilotChat";
import { CensusTrendModule, type CensusTrendPoint } from "../../../shared/modules/CensusTrendModule";
import { IncidentCategoriesModule } from "../../../shared/modules/IncidentCategoriesModule";
import { CensusMovementModule } from "../../../shared/modules/CensusMovementModule";
import { MedicationComplianceModule } from "../../../shared/modules/MedicationComplianceModule";
import { MedicationExceptionDetailModule } from "../../../shared/modules/MedicationExceptionDetailModule";
import { MedicationProfileModule } from "../../../shared/modules/MedicationProfileModule";
import { MedicationWatchModule } from "../../../shared/modules/MedicationWatchModule";
import { DiagnosisMixModule } from "../../../shared/modules/DiagnosisMixModule";
import { ComparisonBarsModule } from "../../../shared/modules/ComparisonBarsModule";
import { KpiStripModule } from "../../../shared/modules/KpiStripModule";
import { EvidenceTableModule } from "../../../shared/modules/EvidenceTableModule";
import { MultiSeriesTrendModule } from "../../../shared/modules/MultiSeriesTrendModule";
import { PeriodHeatmapModule } from "../../../shared/modules/PeriodHeatmapModule";
import { useStableInteractionAnchor } from "../../../shared/hooks/useStableInteractionAnchor";
import { AdHocIncidentDetailModule } from "./AdHocIncidentDetailModule";
import { InlineDonutChart, InlineLineChart } from "./InlineAdHocCharts";
import {
  LARGE_DATASHEET_FULL_RENDER_LIMIT,
  LARGE_DATASHEET_PREVIEW_ROWS,
  LARGE_DATASHEET_RENDER_CHUNK,
  LARGE_DATASHEET_ROW_THRESHOLD,
  formatChartNumber,
  getChartNumber,
  getCensusMovementModuleItems,
  getComparisonHeaders,
  getComparisonRows,
  getDiagnosticRows,
  getIncidentDetailModuleRows,
  getMedicationExceptionDetailModuleRows,
  getMatrixModuleRows,
  getMedicationComplianceModuleItems,
  getMedicationProfileModuleItems,
  getMedicationWatchModuleItems,
  getModuleDisplayLabel,
  getPositiveChartWidth,
  getProfileValue,
  isDiagnosticVisual
} from "../adHocVisualModel";

const GENERIC_HEADER_VALUE_LABELS = new Set([
  "datasets",
  "entries",
  "incident detail",
  "medication profile",
  "modules",
  "profile",
  "records",
  "rows",
  "topline"
]);

function getHeaderValueLabel(valueLabel: string | undefined, displayLabel: string) {
  const normalized = valueLabel?.trim().toLowerCase();
  if (!normalized || normalized === displayLabel.trim().toLowerCase()) return null;
  return GENERIC_HEADER_VALUE_LABELS.has(normalized) ? null : valueLabel;
}

export function AdHocVisualModule({
  visual,
  moduleSpec,
  onRunPrompt,
  onInteract
}: {
  visual: CopilotToolVisual;
  moduleSpec?: CopilotAdHocModuleSpec;
  onRunPrompt?: (prompt: string) => void;
  onInteract?: () => void;
}) {
  const [showFullDatasheet, setShowFullDatasheet] = useState(false);
  const [renderedDatasheetRows, setRenderedDatasheetRows] = useState(LARGE_DATASHEET_RENDER_CHUNK);
  const preserveInteractionAnchor = useStableInteractionAnchor();
  const runDrilldown = onRunPrompt
    ? (prompt: string) => {
        onInteract?.();
        onRunPrompt(prompt);
      }
    : undefined;
  const originalRequest = moduleSpec?.request?.trim() || "";
  const incidentDetailPrompt = (detail: string) =>
    [originalRequest, detail].filter(Boolean).join(". ");
  const numericRows = visual.rows.map((row) => ({
    row,
    value: getChartNumber(row.value)
  }));
  const maxValue = Math.max(...numericRows.map(({ value }) => Math.max(value ?? 0, 0)), 1);
  const isDatasheetModule = visual.type === "table" || moduleSpec?.templateId === "data-table" || moduleSpec?.moduleId === "incident-detail-list";
  const isRestoredHistoryPreview = Boolean(visual.isHistoryPreview);
  const totalDatasheetRows = Math.max(visual.originalRowCount ?? 0, visual.rows.length);
  const isServerCappedPreview = !isRestoredHistoryPreview && Boolean(visual.originalRowCount && visual.originalRowCount > visual.rows.length);
  const shouldPreviewDatasheet = !isRestoredHistoryPreview && isDatasheetModule && totalDatasheetRows > LARGE_DATASHEET_ROW_THRESHOLD;
  const fullDatasheetRowLimit = visual.rows.length <= LARGE_DATASHEET_FULL_RENDER_LIMIT
    ? visual.rows.length
    : renderedDatasheetRows;
  const displayVisualRows = shouldPreviewDatasheet && !showFullDatasheet
    ? visual.rows.slice(0, LARGE_DATASHEET_PREVIEW_ROWS)
    : shouldPreviewDatasheet && showFullDatasheet
    ? visual.rows.slice(0, fullDatasheetRowLimit)
    : visual.rows;
  const hasMoreDatasheetRows = shouldPreviewDatasheet && showFullDatasheet && displayVisualRows.length < visual.rows.length;
  const displayVisual: CopilotToolVisual = displayVisualRows === visual.rows
    ? visual
    : {
        ...visual,
        rows: displayVisualRows
      };
  const primaryRows = visual.rows.filter((row) => !["recent_incident", "category", "current_medication"].includes(String(row.meta ?? "")));
  const categoryRows = visual.rows.filter((row) => row.meta === "category");
  const recentIncidentRows = visual.rows.filter((row) => row.meta === "recent_incident");
  const currentMedicationRows = visual.rows.filter((row) => row.meta === "current_medication");
  const chartRows = numericRows
    .filter((entry): entry is { row: CopilotToolVisual["rows"][number]; value: number } => entry.value != null)
    .map(({ row, value }) => ({
      name: row.label,
      value
  }));
  const comparisonHeaders = getComparisonHeaders(visual);
  const comparisonRows = getComparisonRows(visual, comparisonHeaders);
  // A module name is not enough to select a renderer. Count questions may use
  // the same data source as a chart, but their visual contract is a KPI card.
  const moduleId = moduleSpec?.moduleId ?? "";
  const isIncidentFamily = moduleSpec?.family === "incidents" || moduleId.includes("incident");
  const isCensusTrendRenderer = moduleId === "census-trend" && visual.type === "line_chart";
  const isCensusMovementRenderer = moduleId === "census-movement" && ["bar_chart", "comparison_chart"].includes(visual.type);
  const isIncidentBreakdownRenderer = moduleId === "incident-breakdown" && ["bar_chart", "donut_chart"].includes(visual.type);
  const isIncidentDetailRenderer = moduleId === "incident-detail-list" && visual.type === "table";
  // Community comparisons must retain their full table schema. The compact
  // medication renderer is only valid for a single profile summary.
  const isMedicationProfileRenderer = moduleId === "medication-profile" && visual.type === "summary_card";
  const isMedicationComplianceRenderer = moduleId === "medication-compliance" && ["table", "bar_chart"].includes(visual.type);
  const isMedicationWatchRenderer = moduleId === "medication-watch" && ["table", "ranked_list"].includes(visual.type);
  const isMedicationExceptionRenderer = [
    "medication-exceptions",
    "medication-refusal-detail",
    "medication-late-admins",
    "medication-held-admins",
    "medication-prn-detail"
  ].includes(moduleId) && visual.type === "table";
  const isDiagnosisMixRenderer = moduleId === "diagnosis-mix" && ["bar_chart", "donut_chart"].includes(visual.type);
  const isMultiSeriesTrendRenderer = moduleId === "community-time-series" && visual.type === "multi_line_chart";
  const isPeriodHeatmapRenderer = moduleId === "community-time-series" && visual.type === "heatmap";
  const usesPurposeBuiltModule = [
    isCensusTrendRenderer,
    isCensusMovementRenderer,
    isIncidentBreakdownRenderer,
    isIncidentDetailRenderer,
    isMedicationProfileRenderer,
    isMedicationComplianceRenderer,
    isMedicationWatchRenderer,
    isMedicationExceptionRenderer,
    isDiagnosisMixRenderer,
    isMultiSeriesTrendRenderer,
    isPeriodHeatmapRenderer
  ].some(Boolean);
  const isResidentProfileRenderer = !usesPurposeBuiltModule && visual.type === "profile_card";
  const visualRenderer = isCensusTrendRenderer
    ? "census-trend"
    : isCensusMovementRenderer
      ? "census-movement"
      : isIncidentBreakdownRenderer
        ? "incident-breakdown"
        : isIncidentDetailRenderer
          ? "incident-detail-list"
          : isMedicationProfileRenderer
            ? "medication-profile"
            : isMedicationComplianceRenderer
              ? "medication-compliance"
              : isMedicationWatchRenderer
                ? "medication-watch"
                : isMedicationExceptionRenderer
                  ? "medication-exception-detail"
                  : isDiagnosisMixRenderer
                    ? "diagnosis-mix"
                    : isMultiSeriesTrendRenderer
                      ? "multi-series-trend"
                      : isPeriodHeatmapRenderer
                        ? "period-heatmap"
                        : visual.type;
  const datasheetNoun = isIncidentDetailRenderer ? "incidents" : "records";
  const datasheetPreviewLabel = shouldPreviewDatasheet
    ? showFullDatasheet
      ? `Showing ${displayVisualRows.length.toLocaleString()} of ${totalDatasheetRows.toLocaleString()} ${datasheetNoun}`
      : `Showing ${Math.min(LARGE_DATASHEET_PREVIEW_ROWS, visual.rows.length).toLocaleString()} of ${totalDatasheetRows.toLocaleString()} ${datasheetNoun}`
    : null;
  const displayVisualSubtitle = shouldPreviewDatasheet && visual.subtitle
      ? visual.subtitle.replace(
        /\s*·\s*showing\s+[\d,]+\s+of\s+[\d,]+\s+(?:entries|rows|records)\s*$/i,
        ""
      ).trim()
    : visual.subtitle;
  const restoredHistoryPreviewLabel = isRestoredHistoryPreview && visual.originalRowCount
    ? `Restored preview: ${visual.rows.length.toLocaleString()} of ${visual.originalRowCount.toLocaleString()} records`
    : null;
  const moduleDisplayLabel = getModuleDisplayLabel(moduleSpec, visual.type);
  const headerValueLabel = getHeaderValueLabel(visual.valueLabel, moduleDisplayLabel);
  const incidentDetailRows = isIncidentDetailRenderer
    ? getIncidentDetailModuleRows(displayVisual)
    : [];

  useEffect(() => {
    setShowFullDatasheet(false);
    setRenderedDatasheetRows(LARGE_DATASHEET_RENDER_CHUNK);
  }, [visual.title, visual.subtitle, visual.rows.length]);

  return (
    <div
        data-chat-visual-module-id={moduleSpec?.moduleId ?? visual.type}
        data-chat-visual-module-title={visual.title}
        data-chat-visual-renderer={visualRenderer}
        className={`scroll-mt-[84px] overflow-hidden bg-white ${isResidentProfileRenderer ? "" : "border-t-2 border-[#111111]"}`}
      >
      {!isResidentProfileRenderer ? (
      <div className="border-b border-[#d9d9d9] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 max-w-[860px]">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">
            {moduleDisplayLabel}
          </div>
          <div className="mt-1 text-[20px] font-semibold leading-tight tracking-[-0.035em] text-[#111111] sm:text-[22px]">
            {visual.title}
          </div>
          {displayVisualSubtitle ? (
            <div className="mt-1.5 text-[13px] leading-5 text-[#595959]">{displayVisualSubtitle}</div>
          ) : null}
          {datasheetPreviewLabel ? (
            <div className="mt-2 text-[11px] font-semibold text-[#595959]">
              {datasheetPreviewLabel}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {headerValueLabel ? (
            <div className="px-1 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#595959]">
              {headerValueLabel}
            </div>
          ) : null}
        </div>
        </div>
      </div>
      ) : null}
      {isCensusTrendRenderer ? (
        <div className="p-4">
          <CensusTrendModule
            points={numericRows.flatMap<CensusTrendPoint>(({ row, value }, index) =>
              value == null
                ? []
                : [{
                    id: `${row.label}-${index}`,
                    label: row.label,
                    value
                  }]
            )}
          />
        </div>
      ) : null}

      {isCensusMovementRenderer ? (
        <div className="p-4">
          <CensusMovementModule items={getCensusMovementModuleItems(visual)} />
        </div>
      ) : null}

      {isIncidentBreakdownRenderer ? (
        <div className="p-4">
          <IncidentCategoriesModule
            items={numericRows.map(({ row, value }) => ({
              label: row.label,
              count: value ?? 0
            }))}
            {...(runDrilldown ? {
              onSelect: (category: string) =>
                runDrilldown(incidentDetailPrompt(
                  `Now list every ${category} incident report using the same scope and period`
                ))
            } : {})}
          />
        </div>
      ) : null}

      {isIncidentDetailRenderer ? (
        <AdHocIncidentDetailModule
          key={`${visual.title}:${visual.subtitle ?? ""}:${visual.rows.length}`}
          rows={incidentDetailRows}
          {...(runDrilldown ? {
            onSelectResident: (row) =>
              runDrilldown(`show the resident profile for ${row.residentId || row.resident}`)
          } : {})}
        />
      ) : null}

      {isMedicationProfileRenderer ? (
        <div className="p-4">
          <MedicationProfileModule
            items={getMedicationProfileModuleItems(visual)}
            {...(runDrilldown ? {
              onSelect: (item) => {
                const scope = String(visual.title ?? "Portfolio").replace(/\s+Medication Profile$/i, "").trim() || "Portfolio";
                const label = item.label.toLowerCase();
                if (label === "compliance" || label === "scheduled" || label === "given") {
                  runDrilldown(`show ${scope} medication compliance`);
                } else if (label === "not given") {
                  runDrilldown(`show not-given medication detail for ${scope} from the last 90 days`);
                } else if (label === "refusals" || label === "refusal detail") {
                  runDrilldown(`show medication refusal detail for ${scope} from the last 90 days`);
                } else if (label === "late administrations") {
                  runDrilldown(`show late medication administrations for ${scope} from the last 90 days`);
                } else if (label === "held medications") {
                  runDrilldown(`show held medication detail for ${scope} from the last 90 days`);
                } else if (label === "prn detail") {
                  runDrilldown(`show PRN medication detail for ${scope} from the last 90 days`);
                } else {
                  runDrilldown(`show the resident medication watchlist for ${scope}`);
                }
              }
            } : {})}
          />
        </div>
      ) : null}

      {isMedicationComplianceRenderer ? (
        <div className="p-4">
          <MedicationComplianceModule
            items={getMedicationComplianceModuleItems(visual)}
            {...(runDrilldown ? { onSelect: (item) => runDrilldown(`show ${item.label} medication profile`) } : {})}
          />
        </div>
      ) : null}

      {isMedicationWatchRenderer ? (
        <div className="p-4">
          <MedicationWatchModule
            items={getMedicationWatchModuleItems(visual)}
            {...(runDrilldown ? { onSelect: (item) => runDrilldown(`show ${item.resident} resident profile`) } : {})}
          />
        </div>
      ) : null}

      {isMedicationExceptionRenderer ? (
        <MedicationExceptionDetailModule
          rows={getMedicationExceptionDetailModuleRows(displayVisual)}
          {...(runDrilldown ? { onSelect: (item) => runDrilldown(`show ${item.resident} resident profile`) } : {})}
          {...(/not loaded/i.test(visual.subtitle ?? "")
            ? { emptyLabel: "Resident-level MAR exception rows are not loaded. No resident names, administrations, or reasons can be shown." }
            : {})}
        />
      ) : null}

      {isDiagnosisMixRenderer ? (
        <div className="p-4">
          <DiagnosisMixModule items={numericRows.map(({ row, value }) => ({ label: row.label, count: value ?? 0 }))} />
        </div>
      ) : null}

      {isMultiSeriesTrendRenderer ? (
        <div className="p-5">
          <MultiSeriesTrendModule
            series={(visual.columns ?? []).slice(1)}
            rows={getMatrixModuleRows(visual)}
            {...(visual.valueLabel ? { valueLabel: visual.valueLabel } : {})}
          />
        </div>
      ) : null}

      {isPeriodHeatmapRenderer ? (
        <div className="p-5">
          <PeriodHeatmapModule
            series={(visual.columns ?? []).slice(1)}
            rows={getMatrixModuleRows(visual)}
            {...(visual.valueLabel ? { valueLabel: visual.valueLabel } : {})}
          />
        </div>
      ) : null}

      {isResidentProfileRenderer ? (
        <div>
          <span className="sr-only">{visual.title}</span>
          <div className="border-y border-[#111111] bg-white py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#0f8b73]">Resident profile</div>
                <div className="mt-1 text-[25px] font-semibold tracking-[-0.05em] text-[#111111]">
                  {visual.title.replace(/\s+Resident Profile$/i, "")}
                </div>
                <div className="mt-1 text-[13px] leading-5 text-[#595959]">
                  {[getProfileValue(visual, ["community"]), getProfileValue(visual, ["unit"]) !== "—" ? `Unit ${getProfileValue(visual, ["unit"])}` : null].filter(Boolean).join(" · ") || visual.subtitle || "Current roster profile"}
                </div>
              </div>
              <div className="grid min-w-[300px] grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  ["Age", getProfileValue(visual, ["age"])],
                  ["LOS", getProfileValue(visual, ["los", "length of stay"])],
                  ["Incidents", getProfileValue(visual, ["incident rollup", "incidents"])],
                  ["30d Inc.", getProfileValue(visual, ["incidents 30 days"])],
                  ["Meds", getProfileValue(visual, ["active medications"])],
                  ["MAR 30d", getProfileValue(visual, ["mar compliance 30 days"])]
                ].map(([label, value]) => (
                  <div key={label} className="border-t border-[#d9d9d9] px-0 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">{label}</div>
                    <div className="mt-0.5 truncate text-[16px] font-semibold tabular-nums text-[#111111]">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {primaryRows
              .filter((row) => !["community", "unit", "age", "los"].some((name) => String(row.cells?.[0] ?? row.label).toLowerCase().includes(name)))
              .slice(0, 10)
              .map((row, index) => {
                const cells = row.cells?.length ? row.cells : [row.label, row.value];
              return (
                <div key={`${row.label}-${index}`} className="border-t border-[#d9d9d9] bg-white px-0 py-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">
                    {cells[0] ?? row.label}
                  </div>
                  <div className="mt-1 text-[14px] font-semibold text-[#111111]">
                    {cells[1] ?? "—"}
                  </div>
                </div>
              );
            })}
          </div>
          {categoryRows.length ? (
            <div className="mt-4 border-t border-[#111111] bg-white pt-3.5">
              <div className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">
                Matched incident categories
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {categoryRows.map((row, index) => (
                  <div key={`${row.label}-${index}`} className="flex items-center justify-between border-t border-[#d9d9d9] bg-white px-0 py-1.5">
                    <span className="truncate text-[12px] font-semibold text-[#111111]">{row.label}</span>
                    <span className="ml-3 shrink-0 tabular-nums text-[12px] font-semibold text-[#595959]">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {currentMedicationRows.length ? (
            <div className="mt-4 border-t border-[#111111] bg-white pt-3.5">
              <div className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">
                Current medications
              </div>
              <div className="divide-y divide-[#d9d9d9] border-y border-[#d9d9d9]">
                {currentMedicationRows.map((row, index) => {
                  const cells = row.cells?.length ? row.cells : [row.label];
                  return (
                    <div key={`${row.label}-${index}`} className="grid gap-1 py-2.5 sm:grid-cols-[minmax(180px,1.4fr)_repeat(4,minmax(90px,0.8fr))] sm:gap-3">
                      <div>
                        <div className="text-[13px] font-semibold text-[#111111]">{cells[0] ?? row.label}</div>
                        <div className="mt-0.5 text-[12px] text-[#595959]">{cells[5] ?? "Active"}</div>
                      </div>
                      <div className="text-[12px] text-[#333333]"><span className="sm:hidden">Dose: </span>{cells[1] ?? "—"}</div>
                      <div className="text-[12px] text-[#333333]"><span className="sm:hidden">Route: </span>{cells[2] ?? "—"}</div>
                      <div className="text-[12px] text-[#333333]"><span className="sm:hidden">Schedule: </span>{cells[3] ?? "—"}</div>
                      <div className="text-[12px] text-[#333333]"><span className="sm:hidden">Indication: </span>{cells[4] ?? "—"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-4 border-t border-[#d9d9d9] bg-white pt-3.5 text-[12px] leading-5 text-[#595959]">
              Current medication orders are not available in this snapshot.
            </div>
          )}
          {recentIncidentRows.length ? (
            <div className="mt-4">
                <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">
                Recent incidents
              </div>
              <div className="space-y-2">
                {recentIncidentRows.map((row, index) => {
                  const cells = row.cells?.length ? row.cells : [row.label, row.value, row.meta ?? ""];
                  return (
                    <div key={`${row.label}-${index}`} className="border-t border-[#d9d9d9] bg-white px-0 py-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[13px] font-semibold text-[#111111]">{cells[1] ?? row.label}</div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#595959]">{cells[0] ?? ""}</div>
                      </div>
                      <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#595959]">{cells[2] ?? "No detail listed"}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {!usesPurposeBuiltModule && visual.type === "summary_card" ? (
        <div className="p-4">
          <KpiStripModule
            items={primaryRows.map((row, index) => {
              const cells = row.cells?.length ? row.cells : [row.label, row.value, row.meta ?? ""];
              return {
                id: `${row.label}-${index}`,
                label: String(cells[0] ?? row.label),
                value: String(cells[1] ?? row.value),
                detail: cells[2] ? String(cells[2]) : null
              };
            })}
            {...(isIncidentFamily && runDrilldown
              ? {
                  onSelect: () =>
                    runDrilldown(incidentDetailPrompt(
                      "Now list the exact incident reports behind that total using the same filters"
                    ))
                }
              : {})}
          />
          {categoryRows.length ? (
            <div className="mt-4 border-t border-[#111111] bg-white pt-3.5">
              <div className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">
                Top incident categories
              </div>
              <div className="space-y-2">
                {categoryRows.map((row, index) => {
                  const barWidth = getPositiveChartWidth(row.value, maxValue, 4);
                  return (
                    <div key={`${row.label}-${index}`}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
                        <span className="font-semibold text-[#111111]">{row.label}</span>
                        <span className="tabular-nums text-[#595959]">{row.value}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden bg-[#d9d9d9]">
                        <div className="h-full bg-[#0f8b73]" style={{ width: `${barWidth}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {!usesPurposeBuiltModule && visual.type === "table" && isDiagnosticVisual(visual, moduleSpec) ? (
        <div className="p-4">
          <div className="grid gap-2.5 md:grid-cols-2">
            {getDiagnosticRows(displayVisual).map((row, index) => (
              <div
                key={row.id}
                className={`border-t bg-white px-0 py-3 ${
                  index === 0
                    ? "border-[#0f8b73] md:col-span-2"
                    : "border-[#d9d9d9]"
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">{row.label}</div>
                <div className="mt-1 text-[24px] font-semibold tracking-[-0.04em] text-[#111111]">{row.value}</div>
                {row.detail && row.detail !== "—" ? (
                  <div className="mt-1 text-[12px] leading-5 text-[#595959]">{row.detail}</div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!usesPurposeBuiltModule && visual.type === "table" && !isDiagnosticVisual(visual, moduleSpec) ? (
        <EvidenceTableModule
          columns={visual.columns?.length ? visual.columns : ["Label", "Value"]}
          rows={displayVisual.rows.map((row, index) => ({
            id: `${row.label}-${index}`,
            cells: row.cells?.length ? row.cells : [row.label, row.value]
          }))}
          initialRows={shouldPreviewDatasheet ? displayVisual.rows.length : LARGE_DATASHEET_PREVIEW_ROWS}
          {...(onInteract ? { onExpandedChange: onInteract } : {})}
        />
      ) : null}

      {shouldPreviewDatasheet ? (
        <div className="border-t border-[#d9d9d9] bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {hasMoreDatasheetRows ? (
                <button
                  type="button"
                  onClick={(event) => {
                    onInteract?.();
                    preserveInteractionAnchor(event.currentTarget);
                    setRenderedDatasheetRows((value) => Math.min(value + LARGE_DATASHEET_RENDER_CHUNK, visual.rows.length));
                  }}
                  className="inline-flex items-center justify-center border border-[#d9d9d9] bg-white px-4 py-2 text-[12px] font-semibold text-[#333333] transition-colors hover:border-[#0f8b73] hover:text-[#0f8b73]"
                >
                  Load next {Math.min(LARGE_DATASHEET_RENDER_CHUNK, visual.rows.length - displayVisualRows.length).toLocaleString()}
                </button>
              ) : null}
              <button
                type="button"
                onClick={(event) => {
                  onInteract?.();
                  preserveInteractionAnchor(event.currentTarget);
                  setShowFullDatasheet((value) => !value);
                  setRenderedDatasheetRows(LARGE_DATASHEET_RENDER_CHUNK);
                }}
                data-dark-action="true"
                className="inline-flex items-center justify-center bg-[#111111] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#0f8b73]"
              >
                {showFullDatasheet
                  ? "Collapse preview"
                  : isServerCappedPreview
                  ? `Show ${visual.rows.length.toLocaleString()} ${datasheetNoun}`
                  : visual.rows.length <= LARGE_DATASHEET_FULL_RENDER_LIMIT
                  ? `Show all ${visual.rows.length.toLocaleString()} ${datasheetNoun}`
                  : `Show first ${Math.min(visual.rows.length, LARGE_DATASHEET_RENDER_CHUNK).toLocaleString()} ${datasheetNoun}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {restoredHistoryPreviewLabel ? (
        <div className="border-t border-[#d9d9d9] bg-white px-4 py-3">
          <div className="flex flex-col gap-2 border-l-2 border-[#0f8b73] bg-[#f7fbf9] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0f8b73]">
                Restored chat preview
              </div>
              <div className="mt-1 text-[13px] leading-5 text-[#333333]">
                {restoredHistoryPreviewLabel}. Rerun the analysis to reload the complete record set.
              </div>
            </div>
            {moduleSpec?.request && onRunPrompt ? (
              <button
                type="button"
                onClick={() => onRunPrompt(moduleSpec.request)}
                data-dark-action="true"
                className="inline-flex shrink-0 items-center justify-center bg-[#111111] px-4 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#0f8b73]"
              >
                Rerun full query
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {!usesPurposeBuiltModule && visual.type === "line_chart" ? (
        <InlineLineChart rows={chartRows} {...(visual.valueLabel ? { valueLabel: visual.valueLabel } : {})} />
      ) : null}

      {!usesPurposeBuiltModule && visual.type === "donut_chart" ? (
        <InlineDonutChart rows={chartRows} />
      ) : null}

      {!usesPurposeBuiltModule && visual.type === "comparison_chart" ? (
        <div className="p-4">
          <ComparisonBarsModule
            series={comparisonHeaders}
            rows={comparisonRows}
            {...(visual.valueLabel ? { valueLabel: visual.valueLabel } : {})}
          />
        </div>
      ) : null}

      {!usesPurposeBuiltModule && !["table", "profile_card", "summary_card", "line_chart", "multi_line_chart", "heatmap", "donut_chart", "comparison_chart"].includes(visual.type) ? (
      <div className="space-y-1.5 p-4">
        {visual.rows.length ? (
          <>
            {visual.rows.map((row, index) => {
              const barWidth = getPositiveChartWidth(row.value, maxValue, 4);
              return (
            <div key={`${row.label}-${index}`} className="border-t border-[#d9d9d9] bg-white px-0 py-2.5 transition-colors hover:bg-[#fafafa]">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold text-[#111111]">{row.label}</div>
                  {row.meta ? <div className="mt-0.5 truncate text-[12px] text-[#595959]">{row.meta}</div> : null}
                </div>
                <div className="shrink-0 text-[15px] font-semibold tabular-nums text-[#111111]">
                  {formatChartNumber(row.value, visual.valueLabel)}
                </div>
              </div>
              {visual.type !== "ranked_list" ? (
                <div className="mt-2 h-1.5 overflow-hidden bg-[#d9d9d9]">
                  <div
                    className="h-full bg-[#0f8b73]"
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
              ) : null}
            </div>
              );
            })}
          </>
        ) : (
          <div className="border-y border-[#d9d9d9] bg-white px-4 py-5 text-center text-[13px] text-[#595959]">
            No records matched this visual request.
          </div>
        )}
      </div>
      ) : null}
      </div>
  );
}
