import {
  prepareMultiSeriesData,
  type MultiSeriesDataRow
} from "../charts/multiSeriesData";

export type PeriodHeatmapRow = MultiSeriesDataRow;

interface PeriodHeatmapModuleProps {
  series: string[];
  rows: PeriodHeatmapRow[];
  valueLabel?: string;
  emptyLabel?: string;
}

function heatColor(value: number, maximum: number) {
  const intensity = maximum > 0 ? Math.max(0, Math.min(value / maximum, 1)) : 0;
  const alpha = 0.1 + intensity * 0.72;
  return `rgba(15, 139, 115, ${alpha.toFixed(3)})`;
}

export function PeriodHeatmapModule({
  series,
  rows,
  valueLabel = "Value",
  emptyLabel = "Heatmap periods are not available for this selection."
}: PeriodHeatmapModuleProps) {
  const { populatedRows, populatedSeries } = prepareMultiSeriesData(series, rows);

  if (!populatedSeries.length || !populatedRows.length) {
    return <div className="border-y border-[#d9d9d9] bg-white px-5 py-8 text-center text-[14px] text-[#595959]">{emptyLabel}</div>;
  }

  const maximum = Math.max(...populatedRows.flatMap((row) => populatedSeries.map((name) => row.values[name] ?? 0)), 1);

  return (
    <div data-module-chart="period-heatmap" className="overflow-x-auto border-y border-[#111111] bg-white [scrollbar-width:thin]">
      <table className="min-w-[720px] border-collapse text-left text-[12px]">
        <thead>
          <tr className="bg-white text-[11px] uppercase tracking-[0.08em] text-[#595959]">
            <th className="sticky left-0 z-20 bg-white px-3 py-3 font-bold">Period</th>
            {populatedSeries.map((name) => <th key={name} className="min-w-[120px] px-3 py-3 text-center font-semibold">{name}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#d9d9d9]">
          {populatedRows.map((row) => (
            <tr key={row.id} data-module-row="period-heatmap">
              <th className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-3 font-semibold text-[#111111]">{row.period}</th>
              {populatedSeries.map((name) => {
                const value = row.values[name];
                const displayValue = value ?? 0;
                const strong = displayValue / maximum >= 0.58;
                return (
                  <td key={name} className="p-1.5 text-center">
                    <div
                      className={`px-2 py-3 font-semibold tabular-nums ${strong ? "text-white" : "text-[#111111]"}`}
                      style={{ backgroundColor: heatColor(displayValue, maximum) }}
                      title={`${row.period} · ${name}: ${value == null ? "not available" : value.toLocaleString()} ${valueLabel.toLowerCase()}`}
                    >
                      {value == null ? "—" : value.toLocaleString()}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-end gap-2 border-t border-[#d9d9d9] bg-white px-3 py-2 text-[11px] uppercase tracking-[0.08em] text-[#595959]">
        <span>Lower</span><span className="h-2 w-16 bg-[linear-gradient(90deg,rgba(15,139,115,.1),rgba(15,139,115,.82))]" /><span>Higher {valueLabel.toLowerCase()}</span>
      </div>
    </div>
  );
}
