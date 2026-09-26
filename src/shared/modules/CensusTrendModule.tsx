import { useState } from "react";

export interface CensusTrendPoint {
  id: string;
  label: string;
  value: number;
}

interface CensusTrendModuleProps {
  points: CensusTrendPoint[];
  variant?: "light" | "dark";
  height?: number;
  emptyLabel?: string;
}

export function CensusTrendModule({
  points,
  variant = "light",
  height = 300,
  emptyLabel = "Census trend data is not available for this selection."
}: CensusTrendModuleProps) {
  const dark = variant === "dark";
  const [activePoint, setActivePoint] = useState<string | null>(null);
  const chartRows = points
    .filter((point) => Number.isFinite(point.value))
    .map((point) => ({
      name: point.label,
      value: point.value
    }));

  if (!chartRows.length) {
    return (
      <div
        className={`flex min-h-[260px] items-center justify-center border-y border-[#d9d9d9] bg-white px-6 text-center text-[14px] leading-6 ${
          dark ? "text-white/52" : "text-[#595959]"
        }`}
      >
        {emptyLabel}
      </div>
    );
  }

  const latest = chartRows.at(-1);
  const prior = chartRows.at(-2);
  const delta = latest && prior ? latest.value - prior.value : null;
  const values = chartRows.map((row) => row.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, 1);
  const padding = Math.max(Math.round(range * 0.12), 1);
  const chartMinimum = Math.max(0, minimum - padding);
  const chartMaximum = maximum + padding;
  const chartRange = Math.max(chartMaximum - chartMinimum, 1);
  const coordinates = chartRows.map((row, index) => ({
    ...row,
    x: chartRows.length === 1 ? 50 : (index / (chartRows.length - 1)) * 100,
    y: 92 - ((row.value - chartMinimum) / chartRange) * 84
  }));
  const linePoints = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const labelIndexes = [...new Set([
    0,
    Math.floor((chartRows.length - 1) / 2),
    chartRows.length - 1
  ])];

  return (
    <div className="w-full">
      {latest ? (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <div className={`text-[11px] font-bold uppercase tracking-[0.12em] ${dark ? "text-white/52" : "text-[#595959]"}`}>
              Latest census
            </div>
            <div className={`mt-1 text-[32px] font-semibold tracking-[-0.055em] ${dark ? "text-white" : "text-[#111111]"}`}>
              {latest.value.toLocaleString()}
            </div>
          </div>
          <div className={`text-right text-[13px] leading-5 ${dark ? "text-white/66" : "text-[#595959]"}`}>
            <div>{latest.name}</div>
            {delta !== null ? (
              <div className={delta > 0 ? "text-[#0f8b73]" : delta < 0 ? "text-[#bd5c54]" : ""}>
                {delta > 0 ? "+" : ""}
                {delta.toLocaleString()} vs {prior?.name}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        data-module-chart="census-trend"
        className={`w-full border border-[#d9d9d9] px-3 py-4 ${
          dark ? "bg-white/[0.025]" : "bg-white"
        }`}
        style={{ height }}
      >
        <div className="grid h-full min-h-0 grid-cols-[auto_minmax(0,1fr)] gap-2">
          <div className={`flex flex-col justify-between pb-7 text-right text-[11px] tabular-nums ${dark ? "text-white/62" : "text-[#595959]"}`}>
            <span>{chartMaximum.toLocaleString()}</span>
            <span>{Math.round((chartMaximum + chartMinimum) / 2).toLocaleString()}</span>
            <span>{chartMinimum.toLocaleString()}</span>
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="relative min-h-0 flex-1" aria-label="Monthly census trend">
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full overflow-visible"
                role="img"
                aria-label={`Census from ${chartRows[0]?.name} to ${latest?.name}`}
              >
                {[8, 50, 92].map((y) => (
                  <line
                    key={y}
                    x1="0"
                    x2="100"
                    y1={y}
                    y2={y}
                    stroke={dark ? "rgba(255,255,255,0.14)" : "#d9d9d9"}
                    strokeDasharray="2 2"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {coordinates.length > 1 ? (
                  <polyline
                    points={linePoints}
                    fill="none"
                    stroke={dark ? "#6dd9a2" : "#0f8b73"}
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ) : null}
              </svg>
              {coordinates.map((point, index) => {
                const pointKey = `${point.name}-${index}`;
                const tooltipAlignment = point.x < 18
                  ? "left-0"
                  : point.x > 82
                    ? "right-0"
                    : "left-1/2 -translate-x-1/2";
                return (
                  <button
                    key={pointKey}
                    type="button"
                    data-chart-point="census"
                    aria-label={`${point.name}: ${point.value.toLocaleString()} residents`}
                    title={`${point.name}: ${point.value.toLocaleString()} residents`}
                    onPointerEnter={() => setActivePoint(pointKey)}
                    onPointerLeave={() => setActivePoint(null)}
                    onFocus={() => setActivePoint(pointKey)}
                    onBlur={() => setActivePoint(null)}
                    className={`absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm outline-none transition-transform hover:scale-125 focus-visible:scale-125 ${
                      dark ? "border-[#6dd9a2] bg-[#151b27]" : "border-[#0f8b73] bg-white"
                    }`}
                    style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  >
                    <span
                      data-chart-point-tooltip="census"
                      className={`pointer-events-none absolute bottom-[calc(100%+8px)] min-w-max border border-[#111111] bg-white px-2.5 py-1.5 text-left text-[11px] leading-4 text-[#111111] shadow-[0_8px_24px_rgba(0,0,0,0.12)] ${
                        activePoint === pointKey ? "block" : "hidden"
                      } ${tooltipAlignment}`}
                    >
                      <span className="block font-semibold">{point.value.toLocaleString()} residents</span>
                      <span className="block text-[#595959]">{point.name}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className={`relative mt-2 h-5 text-[11px] ${dark ? "text-white/62" : "text-[#595959]"}`}>
              {labelIndexes.map((index) => {
                const point = coordinates[index];
                if (!point) return null;
                const alignment = index === 0
                  ? "translate-x-0 text-left"
                  : index === chartRows.length - 1
                    ? "-translate-x-full text-right"
                    : "-translate-x-1/2 text-center";
                return (
                  <span
                    key={`${point.name}-${index}`}
                    className={`absolute top-0 whitespace-nowrap ${alignment}`}
                    style={{ left: `${point.x}%` }}
                  >
                    {point.name}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
