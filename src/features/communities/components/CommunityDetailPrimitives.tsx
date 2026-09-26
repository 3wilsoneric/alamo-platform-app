import type { ReactNode } from "react";

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function comparisonRatio(value: number, maxValue: number) {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return 0;
  return Math.max(value / maxValue, 0.08);
}

export function CommunitySectionCard({
  title,
  icon,
  children,
  contentClassName = ""
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <section className="flex h-full flex-col border-y border-[#d9d9d9] bg-white px-4 py-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-serif text-[20px] font-semibold tracking-[-0.03em] text-[#111111]">{title}</h3>
        <div className="grid h-9 w-9 shrink-0 place-items-center border border-[#d9d9d9] bg-[#f7fbf9] text-[#0f8b73]">
          {icon}
        </div>
      </div>
      <div className={`min-h-0 flex-1 ${contentClassName}`.trim()}>{children}</div>
    </section>
  );
}

export function CommunityMiniTrend({
  items,
  activeMonth,
  onSelect
}: {
  items: Array<{ label: string; value: number; month_bucket: string }>;
  activeMonth?: string | null;
  onSelect?: (monthBucket: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center border border-dashed border-[#d9d9d9] bg-white px-6 text-center text-[13px] leading-6 text-[#595959]">
        Incident trend data has not been loaded yet.
      </div>
    );
  }

  const displayItems = items.slice(-5);
  const maxValue = Math.max(...displayItems.map((item) => item.value), 1);

  return (
    <div className="flex h-full min-h-[300px] w-full flex-col px-1 py-2">
      <div className="grid flex-1 grid-rows-5 gap-3">
        {displayItems.map((item, index) => {
          const isLatest = index === displayItems.length - 1;
          const ratio = comparisonRatio(item.value, maxValue);

          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onSelect?.(item.month_bucket)}
              className={`grid min-h-[52px] w-full grid-cols-[88px_minmax(0,1fr)_58px] items-center gap-3 border-l-2 px-3 text-left ${
                item.month_bucket === activeMonth
                  ? "border-[#0f8b73] bg-[#f7fbf9]"
                  : isLatest
                    ? "border-[#111111] bg-[#fafafa]"
                    : "border-transparent bg-white"
              } transition-colors hover:bg-[#f7fbf9]`}
            >
              <div className="truncate text-[12px] font-semibold text-[#595959]">{item.label}</div>
              <div className="min-w-0">
                <div className="h-2 overflow-hidden bg-[#e7e7e7]">
                  <div
                    className={`h-full ${isLatest ? "bg-[#0f8b73]" : "bg-[#737373]"}`}
                    style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                  />
                </div>
              </div>
              <div className="text-right text-[15px] font-semibold text-[#111111]">
                {formatNumber(item.value)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CommunityDetailPill({ children }: { children: ReactNode }) {
  return (
    <span className="border border-[#d9d9d9] bg-[#fafafa] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#595959]">
      {children}
    </span>
  );
}

export function CommunityDatasheetTable({
  columns,
  rows,
  emptyLabel
}: {
  columns: string[];
  rows: Array<Array<string | number>>;
  emptyLabel: string;
}) {
  if (!rows.length) {
    return (
      <div className="flex min-h-[180px] items-center justify-center border border-dashed border-[#d9d9d9] bg-white px-6 text-center text-[13px] leading-6 text-[#595959]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="max-h-[360px] overflow-auto border-y border-[#111111] bg-white">
      <table className="min-w-full border-collapse text-left text-[12px] text-[#3f3f3f]">
        <thead className="sticky top-0 z-10 bg-[#fafafa] text-[10px] font-bold uppercase tracking-[0.14em] text-[#595959]">
          <tr>
            {columns.map((column) => (
              <th key={column} className="border-b border-[#111111] px-3 py-2.5">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row.join("-")}`} className="odd:bg-white even:bg-[#fafafa]">
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`} className="border-b border-[#e7e7e7] px-3 py-2.5">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
