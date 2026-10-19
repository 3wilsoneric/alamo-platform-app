import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useStableInteractionAnchor } from "../hooks/useStableInteractionAnchor";

export interface EvidenceTableRow {
  id: string;
  cells: Array<string | number | null>;
}

interface EvidenceTableModuleProps {
  columns: string[];
  rows: EvidenceTableRow[];
  initialRows?: number;
  emptyLabel?: string;
  onExpandedChange?: (expanded: boolean) => void;
}

function isNumeric(value: string) {
  return /^[-+]?\$?[\d,]+(?:\.\d+)?%?$/.test(value.trim());
}

export function EvidenceTableModule({
  columns,
  rows,
  initialRows = 8,
  emptyLabel = "No records matched this request.",
  onExpandedChange
}: EvidenceTableModuleProps) {
  const [expanded, setExpanded] = useState(false);
  const preserveInteractionAnchor = useStableInteractionAnchor();
  const visibleRows = expanded ? rows : rows.slice(0, initialRows);
  const canExpand = rows.length > initialRows;
  if (!rows.length) {
    return <div className="border-y border-[#d9d9d9] bg-white px-5 py-8 text-center text-[14px] text-[#595959]">{emptyLabel}</div>;
  }

  return (
    <div className="border-y border-[#111111] bg-white">
      <div className="max-h-[560px] overflow-auto [scrollbar-width:thin]">
        <table className="min-w-full border-collapse text-left text-[13px]">
          <thead className="sticky top-0 z-20">
            <tr className="border-b border-[#111111] bg-white text-[11px] uppercase tracking-[0.1em] text-[#595959]">
              {columns.map((column, index) => (
                <th key={`${column}-${index}`} className={`whitespace-nowrap px-4 py-3 font-bold ${index === 0 ? "sticky left-0 z-30 bg-white" : ""} ${/count|total|incidents|census|change|delta|rate|days|age|los|%/i.test(column) ? "text-right" : "text-left"}`}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d9d9d9]">
            {visibleRows.map((row) => (
              <tr key={row.id} data-module-row="evidence-table" className="bg-white">
                {row.cells.map((cell, cellIndex) => {
                  const display = String(cell ?? "—");
                  return (
                    <td key={`${row.id}-${cellIndex}`} className={`px-4 py-3 ${cellIndex === 0 ? "sticky left-0 z-10 bg-white font-semibold text-[#111111]" : isNumeric(display) ? "whitespace-nowrap text-right tabular-nums text-[#111111]" : display.length > 80 ? "min-w-[320px] max-w-[580px] whitespace-normal leading-6 text-[#333333]" : "max-w-[300px] truncate whitespace-nowrap text-[#333333]"}`}>
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canExpand ? (
        <div className="flex justify-center border-t border-[#d9d9d9] bg-white px-4 py-3">
          <button
            type="button"
            onClick={(event) => {
              const nextExpanded = !expanded;
              preserveInteractionAnchor(event.currentTarget);
              setExpanded(nextExpanded);
              onExpandedChange?.(nextExpanded);
            }}
            className="inline-flex items-center gap-2 border border-[#111111] bg-white px-4 py-2 text-[12px] font-semibold text-[#111111] transition-colors hover:border-[#0f8b73] hover:text-[#0f8b73]"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? "Show fewer records" : `Show all ${rows.length.toLocaleString()} records`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
