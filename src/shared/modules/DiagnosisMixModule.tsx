export interface DiagnosisMixItem {
  label: string;
  count: number;
}

interface DiagnosisMixModuleProps {
  items: DiagnosisMixItem[];
  variant?: "light" | "dark";
  limit?: number;
  onSelect?: (item: DiagnosisMixItem) => void;
  emptyLabel?: string;
}

const palette = ["#0f8b73", "#111111", "#d88946", "#bd5c54", "#595959", "#55a5b8", "#a68a62", "#78916c"];

function getPaletteColor(index: number) {
  return palette[index % palette.length] ?? "#0f8b73";
}

export function DiagnosisMixModule({
  items,
  variant = "light",
  limit = 8,
  onSelect,
  emptyLabel = "Diagnosis data is not available for this selection."
}: DiagnosisMixModuleProps) {
  const dark = variant === "dark";
  const rows = items
    .map((item) => ({
      ...item,
      count: Number.isFinite(item.count) ? item.count : 0
    }))
    .filter((item) => item.count > 0)
    .slice(0, limit);
  const total = rows.reduce((sum, item) => sum + item.count, 0);
  let accumulatedShare = 0;
  const segments = rows.map((item, index) => {
    const start = accumulatedShare;
    accumulatedShare += (item.count / Math.max(total, 1)) * 100;
    return `${getPaletteColor(index)} ${start}% ${accumulatedShare}%`;
  });

  if (!rows.length) {
    return (
      <div className={`border-y border-[#d9d9d9] bg-white px-5 py-8 text-center text-[14px] ${dark ? "text-white/52" : "text-[#595959]"}`}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 max-w-full items-start gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <div
        data-module-chart="diagnosis-mix"
        className="relative mx-auto h-[190px] w-[190px] rounded-full"
        style={{ background: `conic-gradient(${segments.join(", ")})` }}
        role="img"
        aria-label={`Diagnosis mix for ${total.toLocaleString()} shown residents`}
      >
        <div className={`absolute inset-[31px] rounded-full ${dark ? "bg-[#151b27]" : "bg-white"}`} />
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <div className={`text-[26px] font-semibold tabular-nums ${dark ? "text-white" : "text-[#111111]"}`}>{total.toLocaleString()}</div>
          <div className={`mt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] ${dark ? "text-white/62" : "text-[#595959]"}`}>residents</div>
        </div>
      </div>
      <div className="min-w-0">
        {rows.map((item, index) => {
          const row = (
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0" style={{ backgroundColor: getPaletteColor(index) }} />
                <span className={`min-w-0 break-words text-[13px] font-semibold leading-5 ${dark ? "text-white/76" : "text-[#111111]"}`}>{item.label}</span>
              </div>
              <span className={`shrink-0 pt-0.5 text-[13px] font-semibold tabular-nums ${dark ? "text-white/66" : "text-[#595959]"}`}>{item.count.toLocaleString()}</span>
            </div>
          );
          return onSelect ? (
            <button key={item.label} type="button" data-module-row="diagnosis-mix" data-module-row-label={item.label} onClick={() => onSelect(item)} className={`w-full border-t border-[#d9d9d9] px-0 py-3 text-left transition-colors first:border-t-0 ${dark ? "hover:bg-white/[0.055]" : "hover:bg-[#fafafa]"}`}>
              {row}
            </button>
          ) : <div key={item.label} data-module-row="diagnosis-mix" data-module-row-label={item.label} className="border-t border-[#d9d9d9] px-0 py-3 first:border-t-0">{row}</div>;
        })}
      </div>
    </div>
  );
}
