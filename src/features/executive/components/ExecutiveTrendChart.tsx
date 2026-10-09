import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import "./ExecutiveTrendChart.css";

interface ExecutiveTrendChartProps {
  points: Array<{ id: string; label: string; value: number }>;
  accent: string;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  height?: number;
  referenceLine?: { value: number; label: string } | null;
  unit?: string;
  percentage?: boolean;
  compact?: boolean;
  ariaLabel: string;
}

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

function countScale(values: number[]) {
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(1, ...values);
  const roughStep = (maximum - minimum) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const fraction = roughStep / magnitude;
  const step = Math.max(1, (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * magnitude);
  const lower = Math.floor(minimum / step) * step;
  const upper = Math.ceil(maximum / step) * step;
  return { lower, upper, step };
}

function monthParts(label: string, id: string) {
  const labelYear = label.match(/\b(20\d{2})\b/);
  const idYear = id.match(/^(20\d{2})[-/]/);
  const year = labelYear?.[1] ?? idYear?.[1] ?? "";
  return { month: label.replace(/,?\s*\b20\d{2}\b/, "").trim(), year };
}

export function ExecutiveTrendChart({
  points,
  accent,
  selectedId,
  onSelect,
  height = 240,
  referenceLine = null,
  unit = "",
  percentage = false,
  compact = false,
  ariaLabel
}: ExecutiveTrendChartProps) {
  const chartId = useId().replace(/:/g, "");
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const pointRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const rows = points.filter((point) => Number.isFinite(point.value));
  const requestedId = selectedId ?? localSelectedId;
  const currentId = rows.some((point) => point.id === requestedId) ? requestedId : rows.at(-1)?.id ?? null;
  const reference = referenceLine && Number.isFinite(referenceLine.value) ? referenceLine : null;
  const scaleValues = [...rows.map((point) => point.value), ...(reference ? [reference.value] : [])];
  const scale = percentage
    ? { lower: 0, upper: Math.max(100, Math.ceil(Math.max(0, ...scaleValues) / 25) * 25), step: 25 }
    : countScale(scaleValues);
  const range = scale.upper - scale.lower;
  const y = (value: number) => ((scale.upper - value) / range) * 100;
  const x = (index: number) => rows.length === 1 ? 50 : 4 + (index / (rows.length - 1)) * 92;
  const coordinates = rows.map((row, index) => ({ ...row, x: x(index), y: y(row.value) }));
  const line = coordinates.map((point) => `${point.x},${point.y}`).join(" ");
  const first = coordinates[0];
  const last = coordinates.at(-1);
  const area = first && last ? `${first.x},${y(0)} ${line} ${last.x},${y(0)}` : "";
  const ticks = Array.from({ length: Math.round(range / scale.step) + 1 }, (_, index) => scale.lower + index * scale.step);
  const currentPoint = coordinates.find((point) => point.id === currentId);
  const displayValue = (value: number) => `${numberFormat.format(value)}${percentage ? "%" : ""}`;

  const select = (index: number) => {
    const point = rows[index];
    if (!point) return;
    setLocalSelectedId(point.id);
    onSelect?.(point.id);
  };

  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = Math.min(rows.length - 1, index + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = rows.length - 1;
    else return;
    event.preventDefault();
    pointRefs.current[next]?.focus();
    select(next);
  };

  const chartStyle = { "--executive-chart-accent": accent, "--executive-chart-point-count": Math.max(rows.length, 1), height } as CSSProperties;

  if (!rows.length) {
    return <div className="executive-trend-chart executive-trend-chart--empty" style={chartStyle} role="img" aria-label={`${ariaLabel}: no data available`}>No data available</div>;
  }

  return (
    <div className={`executive-trend-chart${compact ? " executive-trend-chart--compact" : ""}`} style={chartStyle} role="group" aria-label={ariaLabel}>
      <div className="executive-trend-chart__axis" aria-hidden="true">
        {ticks.map((tick) => <span key={tick} style={{ top: `${y(tick)}%` }}>{displayValue(tick)}</span>)}
      </div>
      <div className="executive-trend-chart__plot">
        <svg className="executive-trend-chart__drawing" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id={`${chartId}-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={accent} stopOpacity="0.2" /><stop offset="100%" stopColor={accent} stopOpacity="0.025" /></linearGradient></defs>
          {currentPoint ? <rect x={Math.max(0, currentPoint.x - 3.5)} y="0" width="7" height="100" fill={accent} opacity="0.055" /> : null}
          {coordinates.map((point) => <line key={point.id} x1={point.x} x2={point.x} y1="0" y2="100" className="executive-trend-chart__vertical-grid" vectorEffect="non-scaling-stroke" />)}
          {ticks.map((tick) => <line key={tick} x1="0" x2="100" y1={y(tick)} y2={y(tick)} className="executive-trend-chart__horizontal-grid" vectorEffect="non-scaling-stroke" />)}
          {coordinates.length > 1 ? <polygon points={area} fill={`url(#${chartId}-area)`} /> : null}
          {reference ? <line x1="0" x2="100" y1={y(reference.value)} y2={y(reference.value)} stroke={accent} strokeWidth="1" strokeDasharray="5 4" opacity="0.8" vectorEffect="non-scaling-stroke" /> : null}
          {coordinates.length > 1 ? <polyline points={line} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /> : null}
          {currentPoint ? <line x1={currentPoint.x} x2={currentPoint.x} y1={currentPoint.y} y2="100" stroke={accent} strokeWidth="1" strokeDasharray="3 3" opacity="0.35" vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        {reference ? <span className="executive-trend-chart__reference" style={{ top: `${y(reference.value)}%` }}>{reference.label}</span> : null}
        {coordinates.map((point, index) => {
          const selected = point.id === currentId;
          const { month, year } = monthParts(point.label, point.id);
          const sparse = index === 0 || index === Math.round((rows.length - 1) / 2) || index === rows.length - 1;
          return (
            <div key={point.id}>
              <button
                type="button"
                ref={(element) => { pointRefs.current[index] = element; }}
                className="executive-trend-chart__point"
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                aria-label={`${point.label}${year && !point.label.includes(year) ? ` ${year}` : ""}: ${displayValue(point.value)}${unit ? ` ${unit}` : ""}`}
                aria-pressed={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(index)}
                onKeyDown={(event) => navigate(event, index)}
              ><span className="executive-trend-chart__dot" /><span className="executive-trend-chart__value" data-sparse={sparse}>{displayValue(point.value)}</span></button>
              <span className="executive-trend-chart__month" style={{ left: `${point.x}%` }} data-selected={selected} data-sparse={sparse} aria-hidden="true"><span>{month}</span>{year ? <span>{year}</span> : null}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
