import type {
  FullReportBlock,
  FullReportDocument,
  FullReportMetric
} from "../../../shared/types/fullReport";

function MetricGrid({ items }: { items: FullReportMetric[] }) {
  return (
    <div className="grid border-y border-[#111111] sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item, index) => {
        const mediumColumn = index % 2;
        const largeColumn = index % 3;
        return (
          <div
            key={`${item.label}-${index}`}
            className={`min-w-0 px-0 py-4 sm:px-4 ${
              index > 0 ? "border-t border-[#d9d9d9]" : ""
            } ${
              index === 1 ? "sm:border-t-0" : ""
            } ${
              mediumColumn > 0 ? "sm:border-l" : "sm:border-l-0"
            } ${
              index < 3 ? "xl:border-t-0" : "xl:border-t"
            } ${
              largeColumn > 0 ? "xl:border-l" : "xl:border-l-0"
            }`}
          >
            <p className="text-[10px] font-bold uppercase leading-4 tracking-[0.13em] text-[#595959]">
              {item.label}
            </p>
            <p className="mt-1.5 font-sans text-[25px] font-bold leading-none tracking-[-0.04em]">
              {item.value}
            </p>
            {item.detail ? (
              <p className="mt-2 text-[11px] leading-[1.45] text-[#666666]">{item.detail}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function LineChart({
  label,
  items
}: {
  label?: string;
  items: Array<{ label: string; value: number; displayValue?: string }>;
}) {
  if (items.length === 0) {
    return (
      <p className="mt-4 border-y border-[#d9d9d9] py-4 font-sans text-[13px] leading-5 text-[#595959]">
        No trend values are available for this period.
      </p>
    );
  }

  const width = 860;
  const height = 280;
  const left = 48;
  const right = 20;
  const top = 28;
  const bottom = 52;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const values = items.map((item) => item.value);
  const rawMinimum = Math.min(...values);
  const rawMaximum = Math.max(...values);
  const padding = Math.max(1, (rawMaximum - rawMinimum) * 0.12);
  const minimum = rawMinimum - padding;
  const maximum = rawMaximum + padding;
  const range = Math.max(1, maximum - minimum);
  const points = items.map((item, index) => ({
    x: left + (index / Math.max(1, items.length - 1)) * chartWidth,
    y: top + ((maximum - item.value) / range) * chartHeight
  }));
  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");

  return (
    <figure className="mt-5 overflow-x-auto border-y border-[#d9d9d9] py-3">
      {label ? (
        <figcaption className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#595959]">
          {label}
        </figcaption>
      ) : null}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label ?? "Report trend"}
        className="mt-2 block min-w-[650px] w-full overflow-visible"
      >
        {[0, 0.5, 1].map((position) => {
          const y = top + position * chartHeight;
          return (
            <line
              key={position}
              x1={left}
              x2={width - right}
              y1={y}
              y2={y}
              stroke="#d9d9d9"
              strokeWidth="1"
            />
          );
        })}
        <path d={path} fill="none" stroke="#0f8b73" strokeWidth="4" />
        {points.map((point, index) => (
          <g key={`${items[index]?.label}-${index}`}>
            <circle
              cx={point.x}
              cy={point.y}
              r="4.5"
              fill="#ffffff"
              stroke="#0f8b73"
              strokeWidth="3"
            />
            <text
              x={point.x}
              y={point.y - 13}
              textAnchor="middle"
              fill="#111111"
              className="text-[11px] font-bold"
            >
              {items[index]?.displayValue ?? items[index]?.value}
            </text>
            <text
              x={point.x}
              y={height - 17}
              textAnchor="middle"
              fill="#595959"
              className="text-[10px]"
            >
              {items[index]?.label}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}

function ReportBlock({ block }: { block: FullReportBlock }) {
  if (block.type === "paragraph") {
    return <p className="mt-4 max-w-[840px] font-sans text-[13px] leading-[1.65] text-[#333333] sm:text-[14px]">{block.text}</p>;
  }
  if (block.type === "callout") {
    return (
      <p className="mt-4 max-w-[920px] border-l-[3px] border-[#0f8b73] bg-[#f7faf9] px-4 py-3 text-[12px] leading-5 text-[#333333]">
        {block.text}
      </p>
    );
  }
  if (block.type === "metric_grid") {
    return <div className="mt-5"><MetricGrid items={block.items} /></div>;
  }
  if (block.type === "bullets") {
    return (
      <ul className="mt-4 space-y-2 pl-5 font-sans text-[13px] leading-[1.65] text-[#333333] sm:text-[14px]">
        {block.items.map((item) => <li key={item} className="list-disc">{item}</li>)}
      </ul>
    );
  }
  if (block.type === "bar_list") {
    const maximum = Math.max(
      1,
      ...block.items.map((item) => (
        Number.isFinite(Number(item.value)) ? Number(item.value) : 0
      ))
    );
    return (
      <div className="mt-4 border-t border-[#d9d9d9]">
        {block.items.map((item) => (
          <div key={item.label} className="border-b border-[#d9d9d9] py-2.5">
            <div className="flex items-baseline justify-between gap-4 text-[12px]">
              <span className="font-semibold">{item.label}</span>
              <span className="font-sans text-[13px] font-bold tabular-nums">
                {item.displayValue ?? item.value}
              </span>
            </div>
            <div className="mt-2 h-1 bg-[#f2f2f2]">
              <span
                className="block h-full bg-[#0f8b73]"
                style={{ width: `${Math.max(2, Math.round((item.value / maximum) * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (block.type === "line_chart") {
    return (
      <LineChart
        {...(block.label ? { label: block.label } : {})}
        items={block.items}
      />
    );
  }
  if (block.type === "trend") {
    return (
      <div className="mt-4 grid border-t border-[#d9d9d9] sm:grid-cols-2 xl:grid-cols-3">
        {block.items.map((item, index) => (
          <div
            key={`${item.label}-${index}`}
            className="flex items-baseline justify-between gap-3 border-b border-[#d9d9d9] px-3 py-2.5 text-[11px]"
          >
            <span className="text-[#595959]">{item.label}</span>
            <strong className="font-sans text-[14px] font-bold tabular-nums">{item.value}</strong>
          </div>
        ))}
      </div>
    );
  }
  if (block.type === "table") {
    return (
      <div
        role="region"
        aria-label="Scrollable report table"
        tabIndex={0}
        className="mt-4 overflow-x-auto overscroll-x-contain focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73]"
      >
        <table className="w-full min-w-[620px] border-collapse text-left text-[12px] leading-5">
          <thead>
            <tr>
              {block.columns.map((column) => (
                <th
                  key={column.key}
                  className="border-b-2 border-[#111111] px-3 py-2.5 text-[10px] font-bold uppercase leading-4 tracking-[0.12em] text-[#4f4f4f] first:pl-0 last:pr-0"
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="transition-colors hover:bg-[#f7faf9]">
                {block.columns.map((column) => (
                  <td key={column.key} className="break-words border-b border-[#d9d9d9] px-3 py-2.5 align-top first:pl-0 last:pr-0">
                    {row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return null;
}

interface FullReportReaderProps {
  report: FullReportDocument;
}

export default function FullReportReader({ report }: FullReportReaderProps) {
  return (
    <article aria-labelledby="full-report-title" data-full-report={report.reportId} className="min-w-0">
      {report.freshness.status === "stale" ? (
        <div role="status" className="mb-4 border-l-[3px] border-[#a63d2f] bg-[#fff7f5] px-4 py-3 text-[11px] leading-5 text-[#59332d]">
          <strong>Data update delayed.</strong>{" "}
          {report.freshness.warning ??
            "This report uses the latest available governed snapshot, which is older than the platform freshness target."}
        </div>
      ) : null}
      <header className="grid items-start gap-5 border-b-2 border-[#111111] pb-5 xl:grid-cols-[minmax(0,8fr)_minmax(220px,3fr)] xl:gap-8">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0f8b73]">
            {report.scope.label}
          </p>
          <h2
            id="full-report-title"
            className="mt-2 max-w-[900px] !font-sans text-[30px] font-bold leading-[1.04] tracking-[-0.055em] sm:text-[37px] xl:text-[42px]"
          >
            {report.title}
          </h2>
          <p className="mt-4 max-w-[850px] font-sans text-[14px] leading-[1.65] text-[#333333] sm:text-[16px]">
            {report.summary}
          </p>
        </div>
        <div className="border-l-[3px] border-[#0f8b73] pl-4 text-[10px] leading-4 text-[#595959] xl:mt-1">
          <p className="font-bold uppercase tracking-[0.12em] text-[#111111]">Coverage</p>
          <p className="mt-1">{report.period.label}</p>
          <p className="mt-3 font-bold uppercase tracking-[0.12em] text-[#111111]">Data through</p>
          <p className="mt-1">{report.dataThrough}</p>
          <p className="mt-3 font-bold uppercase tracking-[0.12em] text-[#111111]">Snapshot updated</p>
          <p className="mt-1">{report.generatedAtLabel}</p>
        </div>
      </header>

      <div className="mt-5">
        <MetricGrid items={report.metrics} />
      </div>

      {report.sections.map((section, sectionIndex) => (
        <section
          key={section.id}
          id={section.id}
          className="mt-7 scroll-mt-20 border-t-2 border-[#111111] pt-4 sm:scroll-mt-24"
        >
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#0f8b73]">
            {String(sectionIndex + 1).padStart(2, "0")}
          </p>
          <h3 className="mt-1 !font-sans text-[23px] font-bold leading-tight tracking-[-0.04em] sm:text-[26px]">
            {section.title}
          </h3>
          {section.intro ? (
            <p className="mt-2 max-w-[860px] font-sans text-[13px] leading-[1.65] text-[#3f3f3f] sm:text-[14px]">
              {section.intro}
            </p>
          ) : null}
          {section.blocks.map((block, index) => (
            <ReportBlock key={`${section.id}-${block.type}-${index}`} block={block} />
          ))}
        </section>
      ))}

      <details className="mt-10 border-t border-[#111111] pt-3 text-[10px] leading-5 text-[#737373]">
        <summary className="cursor-pointer font-semibold text-[#595959]">Evidence used</summary>
        <p className="mt-2">
          {report.evidence.sources
            .map((source) => `${source.slice}: ${source.rowCount.toLocaleString()} rows`)
            .join(" · ")}
        </p>
      </details>
    </article>
  );
}
