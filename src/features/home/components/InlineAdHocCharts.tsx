import {
  chartPalette,
  formatChartNumber
} from "../adHocVisualModel";

export interface InlineChartRow {
  name: string;
  value: number;
}

export function InlineLineChart({
  rows,
  valueLabel
}: {
  rows: InlineChartRow[];
  valueLabel?: string;
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  const min = Math.min(...rows.map((row) => row.value), 0);
  const range = Math.max(max - min, 1);
  const points = rows.map((row, index) => {
    const x = rows.length <= 1 ? 50 : 8 + (index / (rows.length - 1)) * 84;
    const y = 88 - ((row.value - min) / range) * 72;
    return { ...row, x, y };
  });
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="px-3 pb-4 pt-5 sm:px-5">
      <div data-module-chart="inline-line-chart" className="border border-[#d9d9d9] bg-white p-4">
        <svg viewBox="0 0 100 100" className="h-[230px] w-full overflow-visible" role="img" aria-label="Line chart">
          <line x1="8" y1="88" x2="94" y2="88" stroke="#d9d9d9" strokeWidth="0.8" />
          <line x1="8" y1="16" x2="8" y2="88" stroke="#d9d9d9" strokeWidth="0.8" />
          <polyline fill="none" points={polyline} stroke="#0f8b73" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
          {points.map((point) => (
            <circle key={`${point.name}-${point.value}`} cx={point.x} cy={point.y} r="2.4" fill="#ffffff" stroke="#0f8b73" strokeWidth="1.4" />
          ))}
        </svg>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {rows.slice(-3).map((row) => (
            <div key={`${row.name}-${row.value}`} data-module-row="inline-line-chart" className="border-t border-[#d9d9d9] bg-white px-0 py-2">
              <div className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">{row.name}</div>
              <div className="mt-0.5 text-[17px] font-semibold tabular-nums text-[#111111]">
                {formatChartNumber(row.value, valueLabel)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function InlineDonutChart({ rows }: { rows: InlineChartRow[] }) {
  const total = rows.reduce((sum, row) => sum + Math.max(row.value, 0), 0) || 1;

  return (
    <div className="p-5">
      <div data-module-chart="inline-donut-chart" className="border border-[#d9d9d9] bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#595959]">Composition</div>
            <div className="mt-1 text-[26px] font-semibold tabular-nums tracking-[-0.04em] text-[#111111]">
              {total.toLocaleString()}
            </div>
          </div>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#595959]">
            Total
          </div>
        </div>
        <div className="mt-4 flex h-3 overflow-hidden bg-[#d9d9d9]">
          {rows.map((row, index) => (
            <span
              key={`${row.name}-segment`}
              className="h-full"
              style={{
                width: `${(Math.max(row.value, 0) / total) * 100}%`,
                backgroundColor: chartPalette[index % chartPalette.length]
              }}
            />
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {rows.map((row, index) => {
            const share = Math.round((Math.max(row.value, 0) / total) * 100);
            return (
              <div key={row.name} data-module-row="inline-donut-chart" className="flex items-center justify-between gap-4 border-t border-[#d9d9d9] bg-white px-0 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: chartPalette[index % chartPalette.length] }} />
                  <span className="truncate text-[13px] font-semibold text-[#111111]">{row.name}</span>
                </div>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[#111111]">
                  {row.value.toLocaleString()} · {share}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
