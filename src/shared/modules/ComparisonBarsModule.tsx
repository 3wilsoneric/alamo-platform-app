import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

export interface ComparisonBarsRow {
  id: string;
  label: string;
  values: Record<string, number>;
  delta?: number | null;
}

interface ComparisonBarsModuleProps {
  series: string[];
  rows: ComparisonBarsRow[];
  valueLabel?: string;
  emptyLabel?: string;
}

const colors = ["#0f8b73", "#111111", "#d88946", "#bd5c54"];

export function ComparisonBarsModule({
  series,
  rows,
  valueLabel = "Value",
  emptyLabel = "Comparison data is not available for this selection."
}: ComparisonBarsModuleProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const normalizedRows = rows.map((row) => ({
    ...row,
    values: Object.fromEntries(
      series.map((name) => {
        const value = row.values[name];
        return [name, Number.isFinite(value) ? value : 0];
      })
    ),
    delta: row.delta != null && Number.isFinite(row.delta) ? row.delta : null
  }));
  const populatedSeries = series.filter((name) => normalizedRows.some((row) => row.values[name] !== 0));
  const visibleSeries = populatedSeries.length ? populatedSeries : series;
  const visibleRows = normalizedRows;

  if (!visibleSeries.length || !visibleRows.length) {
    return <div className="border-y border-[#d9d9d9] bg-white px-5 py-8 text-center text-[14px] text-[#595959]">{emptyLabel}</div>;
  }

  const maximum = Math.max(
    ...visibleRows.flatMap((row) => visibleSeries.map((name) => Math.abs(row.values[name] ?? 0))),
    1
  );
  const hasDelta = visibleRows.some((row) => row.delta != null);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto [scrollbar-width:thin]">
        <div data-module-chart="comparison-bars" className="min-w-[620px] border border-[#d9d9d9] bg-white p-4">
          <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2">
            {visibleSeries.map((name, index) => (
              <div key={name} className="flex items-center gap-2 text-[12px] font-semibold text-[#333333]">
                <span className="h-2.5 w-2.5" style={{ backgroundColor: colors[index % colors.length] }} />
                <span>{name}</span>
              </div>
            ))}
          </div>
          <div className="divide-y divide-[#d9d9d9] border-y border-[#d9d9d9]">
            {visibleRows.map((row) => (
              <div key={row.id} className="grid grid-cols-[160px_minmax(0,1fr)] gap-4 py-3">
                <div className="self-center truncate text-[12px] font-semibold text-[#111111]" title={row.label}>
                  {row.label}
                </div>
                <div className="space-y-1.5">
                  {visibleSeries.map((name, index) => {
                    const value = row.values[name] ?? 0;
                    const width = Math.max((Math.abs(value) / maximum) * 100, value === 0 ? 0 : 1.5);
                    return (
                      <div key={name} className="grid grid-cols-[minmax(0,1fr)_64px] items-center gap-2">
                        <div className="h-3 bg-[#f2f2f2]" title={`${row.label} · ${name}: ${value.toLocaleString()}`}>
                          <div
                            className="h-full"
                            style={{
                              width: `${width}%`,
                              backgroundColor: colors[index % colors.length]
                            }}
                          />
                        </div>
                        <span className="text-right text-[11px] font-semibold tabular-nums text-[#333333]">
                          {value.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {visibleRows.slice(0, 6).map((row) => (
          <div key={row.id} data-module-row="comparison-bars" className="flex items-center justify-between gap-4 border-t border-[#d9d9d9] bg-white px-0 py-2.5">
            <span className="truncate text-[13px] font-semibold text-[#111111]">{row.label}</span>
            <div className="flex shrink-0 items-center gap-3 text-[12px] tabular-nums text-[#595959]">
              {visibleSeries.slice(0, 2).map((name) => <span key={name}>{row.values[name]?.toLocaleString() ?? "—"}</span>)}
              {row.delta != null ? (
                <span className={`font-semibold ${row.delta > 0 ? "text-[#0f7a65]" : row.delta < 0 ? "text-[#a04436]" : "text-[#595959]"}`}>
                  {row.delta > 0 ? "+" : ""}{row.delta.toLocaleString()} {valueLabel.toLowerCase()}
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-[#d9d9d9] pt-3">
        <button
          type="button"
          onClick={() => setShowEvidence((value) => !value)}
          className="inline-flex items-center gap-2 border border-[#111111] bg-white px-4 py-2 text-[12px] font-semibold text-[#111111] transition-colors hover:border-[#0f8b73] hover:text-[#0f8b73]"
        >
          {showEvidence ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showEvidence ? "Hide exact values" : "Show exact values"}
        </button>

        {showEvidence ? (
          <div className="mt-3 overflow-x-auto border-y border-[#111111] [scrollbar-width:thin]">
            <table className="min-w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="bg-white text-[11px] uppercase tracking-[0.1em] text-[#595959]">
                  <th className="px-3 py-2.5 font-semibold">Category</th>
                  {visibleSeries.map((name) => <th key={name} className="px-3 py-2.5 text-right font-semibold">{name}</th>)}
                  {hasDelta ? <th className="px-3 py-2.5 text-right font-semibold">Change</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d9d9d9]">
                {visibleRows.map((row) => (
                  <tr key={row.id} data-module-row="comparison-bars-evidence" className="bg-white">
                    <td className="max-w-[260px] truncate px-3 py-2.5 font-semibold text-[#111111]">{row.label}</td>
                    {visibleSeries.map((name) => <td key={name} className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[#333333]">{row.values[name]?.toLocaleString() ?? "—"}</td>)}
                    {hasDelta ? (
                      <td className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums ${row.delta && row.delta > 0 ? "text-[#0f7a65]" : row.delta && row.delta < 0 ? "text-[#a04436]" : "text-[#595959]"}`}>
                        {row.delta != null ? `${row.delta > 0 ? "+" : ""}${row.delta.toLocaleString()}` : "—"}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
