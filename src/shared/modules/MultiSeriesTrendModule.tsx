import {
  prepareMultiSeriesData,
  type MultiSeriesDataRow
} from "../charts/multiSeriesData";

export type MultiSeriesTrendRow = MultiSeriesDataRow;

interface MultiSeriesTrendModuleProps {
  series: string[];
  rows: MultiSeriesTrendRow[];
  valueLabel?: string;
  emptyLabel?: string;
}

const colors = ["#0f8b73", "#111111", "#d88946", "#bd5c54", "#595959", "#55a5b8"];
const chartWidth = 700;
const chartHeight = 290;
const plot = { left: 54, right: 18, top: 18, bottom: 38 };

function getSeriesColor(index: number) {
  return colors[index % colors.length] ?? "#0f8b73";
}

export function MultiSeriesTrendModule({
  series,
  rows,
  valueLabel = "Value",
  emptyLabel = "Trend points are not available for this selection."
}: MultiSeriesTrendModuleProps) {
  const { populatedRows, populatedSeries } = prepareMultiSeriesData(series, rows);

  if (populatedSeries.length < 2 || populatedRows.length < 2) {
    return <div className="border-y border-[#d9d9d9] bg-white px-5 py-8 text-center text-[14px] text-[#595959]">{emptyLabel}</div>;
  }

  const values = populatedRows.flatMap((row) => (
    populatedSeries
      .map((name) => row.values[name])
      .filter((value): value is number => value != null && Number.isFinite(value))
  ));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const rawRange = Math.max(maximum - minimum, 1);
  const padding = Math.max(rawRange * 0.08, 1);
  const chartMinimum = Math.max(0, minimum - padding);
  const chartMaximum = maximum + padding;
  const chartRange = Math.max(chartMaximum - chartMinimum, 1);
  const plotWidth = chartWidth - plot.left - plot.right;
  const plotHeight = chartHeight - plot.top - plot.bottom;
  const xAt = (index: number) => plot.left + (index / Math.max(populatedRows.length - 1, 1)) * plotWidth;
  const yAt = (value: number) => plot.top + (1 - (value - chartMinimum) / chartRange) * plotHeight;
  const axisValues = [chartMaximum, (chartMaximum + chartMinimum) / 2, chartMinimum];
  const labelIndexes = [...new Set([0, Math.floor((populatedRows.length - 1) / 2), populatedRows.length - 1])];

  return (
    <div
      data-module-chart="multi-series-trend"
      className="overflow-x-auto [scrollbar-width:thin]"
      role="img"
      aria-label={`${valueLabel} trend across ${populatedSeries.length} series`}
    >
      <div className="min-w-[700px] border border-[#d9d9d9] bg-white p-4">
        <div className="mb-3 flex flex-wrap gap-x-5 gap-y-2">
          {populatedSeries.map((name, index) => (
            <div key={name} className="flex items-center gap-2 text-[12px] font-semibold text-[#333333]">
              <span className="h-0.5 w-5" style={{ backgroundColor: getSeriesColor(index) }} />
              <span>{name}</span>
            </div>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-[290px] w-full"
          aria-hidden="true"
        >
          {axisValues.map((value, index) => {
            const y = plot.top + (index / 2) * plotHeight;
            return (
              <g key={`${value}-${index}`}>
                <line
                  x1={plot.left}
                  x2={chartWidth - plot.right}
                  y1={y}
                  y2={y}
                  stroke="#d9d9d9"
                  strokeDasharray="3 5"
                  vectorEffect="non-scaling-stroke"
                />
                <text x={plot.left - 8} y={y + 4} textAnchor="end" fill="#595959" fontSize="11">
                  {Math.round(value).toLocaleString()}
                </text>
              </g>
            );
          })}
          {populatedSeries.map((name, seriesIndex) => {
            const points = populatedRows.flatMap((row, rowIndex) => {
              const value = row.values[name];
              return value == null || !Number.isFinite(value)
                ? []
                : [{ value, rowIndex, x: xAt(rowIndex), y: yAt(value), period: row.period }];
            });
            return (
              <g key={name}>
                {points.length > 1 ? (
                  <polyline
                    points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                    fill="none"
                    stroke={getSeriesColor(seriesIndex)}
                    strokeWidth="2.5"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
                {points.map((point) => (
                  <circle
                    key={`${name}-${point.period}`}
                    cx={point.x}
                    cy={point.y}
                    r="3.5"
                    fill="#ffffff"
                    stroke={getSeriesColor(seriesIndex)}
                    strokeWidth="2"
                    tabIndex={0}
                    aria-label={`${name}, ${point.period}: ${point.value.toLocaleString()} ${valueLabel.toLowerCase()}`}
                  >
                    <title>{`${name} · ${point.period}: ${point.value.toLocaleString()} ${valueLabel.toLowerCase()}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
          {labelIndexes.map((index) => {
            const row = populatedRows[index];
            if (!row) return null;
            const x = xAt(index);
            return (
              <text
                key={`${row.period}-${index}`}
                x={x}
                y={chartHeight - 10}
                textAnchor={index === 0 ? "start" : index === populatedRows.length - 1 ? "end" : "middle"}
                fill="#595959"
                fontSize="11"
              >
                {row.period}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
