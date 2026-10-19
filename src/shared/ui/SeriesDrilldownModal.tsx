import { ArrowRight, X } from "lucide-react";

export interface DrilldownSeriesPoint {
  id?: string;
  label: string;
  value: number;
  tone?: "primary" | "danger" | "neutral";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function toneStyles(tone?: "primary" | "danger" | "neutral") {
  if (tone === "danger") {
    return {
      border: "rgba(180,35,24,0.24)",
      background: "rgba(255,241,240,0.82)",
      fill: "#d92d20",
      text: "#b42318"
    };
  }

  if (tone === "neutral") {
    return {
      border: "#ddd4c8",
      background: "rgba(255,253,250,0.78)",
      fill: "#c5b9a8",
      text: "#4f4539"
    };
  }

  return {
    border: "rgba(15,139,115,0.28)",
    background: "#effaf5",
    fill: "#0f8b73",
    text: "#0c705f"
  };
}

function SeriesBlock({
  title,
  points,
  onSelectPoint
}: {
  title: string;
  points: DrilldownSeriesPoint[];
  onSelectPoint?: (point: DrilldownSeriesPoint) => void;
}) {
  if (!points.length) {
    return (
      <div className="border border-[#d9d9d9] bg-white px-4 py-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#595959]">{title}</div>
        <div className="mt-4 border border-dashed border-[#d9d9d9] bg-white px-4 py-8 text-center text-[13px] text-[#595959]">
          No trend data is available for this view.
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const minValue = Math.min(...points.map((point) => point.value), maxValue);
  const latestPoint = points.at(-1);
  if (!latestPoint) return null;
  const previousPoint = points[points.length - 2] ?? null;
  const averageValue = Math.round(points.reduce((sum, point) => sum + point.value, 0) / points.length);
  const deltaValue = previousPoint ? latestPoint.value - previousPoint.value : null;
  const tone = toneStyles(latestPoint.tone);
  const chartWidth = 560;
  const chartHeight = 180;
  const leftPad = 42;
  const rightPad = 18;
  const topPad = 18;
  const bottomPad = 34;
  const valueRange = Math.max(maxValue - minValue, 1);
  const yAxisTicks = [maxValue, Math.round((maxValue + minValue) / 2), minValue];
  const xLabelIndexes = new Set(
    [0, Math.floor((points.length - 1) / 2), points.length - 1].filter((index) => index >= 0)
  );

  const plottedPoints = points.map((point, index) => {
    const x =
      leftPad +
      ((chartWidth - leftPad - rightPad) * (points.length === 1 ? 0.5 : index / (points.length - 1)));
    const normalized = (point.value - minValue) / valueRange;
    const y = chartHeight - bottomPad - normalized * (chartHeight - topPad - bottomPad);
    return { ...point, x, y };
  });

  const linePath = plottedPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const firstPlottedPoint = plottedPoints[0];
  const lastPlottedPoint = plottedPoints.at(-1);
  if (!firstPlottedPoint || !lastPlottedPoint) return null;
  const areaPath = `${linePath} L ${lastPlottedPoint.x.toFixed(2)} ${(chartHeight - bottomPad).toFixed(2)} L ${firstPlottedPoint.x.toFixed(2)} ${(chartHeight - bottomPad).toFixed(2)} Z`;

  return (
    <div className="border border-[#d9d9d9] bg-white px-4 py-3.5">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#595959]">{title}</div>
      <div className="mt-3 border-t border-[#111111] bg-white pt-3.5">
        <div className="grid gap-2.5 sm:grid-cols-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7c664c]">Latest</div>
            <div className="mt-1 text-[22px] font-semibold tracking-[-0.04em]" style={{ color: tone.text }}>
              {formatNumber(latestPoint.value)}
            </div>
            <div className="mt-1 text-[11px] text-[#736657]">{latestPoint.label}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7c664c]">Average</div>
            <div className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-[#2d261d]">
              {formatNumber(averageValue)}
            </div>
            <div className="mt-1 text-[11px] text-[#736657]">{points.length} periods</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7c664c]">Move</div>
            <div className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-[#2d261d]">
              {deltaValue == null ? "—" : `${deltaValue > 0 ? "+" : ""}${formatNumber(deltaValue)}`}
            </div>
            <div className="mt-1 text-[11px] text-[#736657]">
              {previousPoint ? `vs ${previousPoint.label}` : "No prior point"}
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden border border-[#d9d9d9] bg-white px-2 py-2">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-[190px] w-full">
            <defs>
              <linearGradient id={`area-${title.replace(/\s+/g, "-").toLowerCase()}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={tone.fill} stopOpacity="0.3" />
                <stop offset="100%" stopColor={tone.fill} stopOpacity="0.03" />
              </linearGradient>
            </defs>

            {yAxisTicks.map((tickValue, step) => {
              const normalized = (tickValue - minValue) / valueRange;
              const y = chartHeight - bottomPad - normalized * (chartHeight - topPad - bottomPad);
              return (
                <g key={`${title}-tick-${step}`}>
                  <line
                    x1={leftPad}
                    x2={chartWidth - rightPad}
                    y1={y}
                    y2={y}
                    stroke="#d9d9d9"
                    strokeDasharray="4 6"
                  />
                  <text
                    x={leftPad - 10}
                    y={y + 4}
                    textAnchor="end"
                    fill="#595959"
                    fontSize="11"
                    fontWeight="600"
                  >
                    {formatNumber(tickValue)}
                  </text>
                </g>
              );
            })}

            <path d={areaPath} fill={`url(#area-${title.replace(/\s+/g, "-").toLowerCase()})`} />
            <path d={linePath} fill="none" stroke={tone.fill} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

            {plottedPoints.map((point, index) => {
              const isLatest = index === plottedPoints.length - 1;
              return (
                <g key={`${title}-${point.label}-dot`}>
                  <circle cx={point.x} cy={point.y} r={isLatest ? 5 : 4} fill={tone.fill} />
                  <circle cx={point.x} cy={point.y} r={isLatest ? 9 : 0} fill={tone.fill} opacity={isLatest ? 0.15 : 0} />
                  <text
                    x={point.x}
                    y={chartHeight - 8}
                    textAnchor={index === 0 ? "start" : index === plottedPoints.length - 1 ? "end" : "middle"}
                    fill="#595959"
                    fontSize="11"
                    fontWeight="600"
                    letterSpacing="0.08em"
                  >
                    {xLabelIndexes.has(index) ? point.label : ""}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        {onSelectPoint ? (
          <div className="mt-3 divide-y divide-[#d9d9d9] border-y border-[#d9d9d9]">
            {points.map((point) => (
              <button
                key={point.id ?? point.label}
                type="button"
                onClick={() => onSelectPoint(point)}
                className="flex w-full items-center justify-between gap-4 bg-white px-1 py-2.5 text-left transition-colors hover:bg-[#f5f4ef]"
                data-series-drilldown-point={point.id ?? point.label}
              >
                <span className="text-[13px] font-semibold text-[#111111]">{point.label}</span>
                <span className="inline-flex items-center gap-2 text-[13px] font-semibold tabular-nums text-[#0f8b73]">
                  {formatNumber(point.value)}
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SeriesDrilldownModal({
  open,
  title,
  subtitle,
  primaryTitle,
  primarySeries,
  secondaryTitle,
  secondarySeries,
  onSelectPrimary,
  onSelectSecondary,
  onClose,
  onOpenRoute,
  openLabel = "Open page"
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  primaryTitle: string;
  primarySeries: DrilldownSeriesPoint[];
  secondaryTitle?: string;
  secondarySeries?: DrilldownSeriesPoint[];
  onSelectPrimary?: (point: DrilldownSeriesPoint) => void;
  onSelectSecondary?: (point: DrilldownSeriesPoint) => void;
  onClose: () => void;
  onOpenRoute?: () => void;
  openLabel?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-3 py-5 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close drilldown" className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 flex max-h-[min(720px,calc(100vh-40px))] w-full max-w-[980px] flex-col overflow-hidden border border-[#111111] bg-white">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#111111] px-5 py-4 sm:px-6">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">
              Drilldown
            </div>
            <div className="mt-1 font-serif text-[24px] font-semibold leading-tight tracking-[-0.03em] text-[#111111]">{title}</div>
            {subtitle ? <div className="mt-1 max-w-[620px] text-[13px] leading-5 text-[#595959]">{subtitle}</div> : null}
          </div>
          <div className="flex items-center gap-2">
            {onOpenRoute ? (
              <button
                type="button"
                onClick={onOpenRoute}
                className="inline-flex h-9 items-center gap-1.5 border border-[#d9d9d9] bg-white px-3 text-[12px] font-semibold text-[#333333] transition-colors hover:border-[#0f8b73] hover:text-[#0f8b73]"
              >
                {openLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-[#d9d9d9] bg-white text-[#595959] transition-colors hover:border-[#0f8b73] hover:text-[#0f8b73]"
              aria-label="Close drilldown"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className={`grid gap-3 ${secondarySeries?.length ? "xl:grid-cols-2" : ""}`}>
            <SeriesBlock
              title={primaryTitle}
              points={primarySeries}
              {...(onSelectPrimary ? { onSelectPoint: onSelectPrimary } : {})}
            />
            {secondaryTitle && secondarySeries?.length ? (
              <SeriesBlock
                title={secondaryTitle}
                points={secondarySeries}
                {...(onSelectSecondary ? { onSelectPoint: onSelectSecondary } : {})}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
