import { ArrowRight } from "lucide-react";

export interface CensusMovementItem {
  id: string;
  label: string;
  current: number;
  delta: number;
}

interface CensusMovementModuleProps {
  items: CensusMovementItem[];
  variant?: "light" | "dark";
  onSelect?: (item: CensusMovementItem) => void;
  actionLabel?: string;
  emptyLabel?: string;
}

export function CensusMovementModule({
  items,
  variant = "light",
  onSelect,
  actionLabel,
  emptyLabel = "Census movement data is not available for this selection."
}: CensusMovementModuleProps) {
  const dark = variant === "dark";
  const safeItems = items.map((item) => ({
    ...item,
    current: Number.isFinite(item.current) ? item.current : 0,
    delta: Number.isFinite(item.delta) ? item.delta : 0
  }));
  const maxMagnitude = Math.max(...safeItems.map((item) => Math.abs(item.delta)), 1);

  if (!safeItems.length) {
    return (
      <div className={`border-y border-[#d9d9d9] bg-white px-5 py-8 text-center text-[14px] ${dark ? "text-white/52" : "text-[#595959]"}`}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-0 border-y border-[#d9d9d9]">
      {safeItems.map((item) => {
        const positive = item.delta > 0;
        const negative = item.delta < 0;
        const content = (
          <>
            <div className="flex min-w-0 items-center justify-between gap-4">
              <div className="min-w-0">
                <div className={`text-[14px] font-semibold leading-5 ${dark ? "text-white" : "text-[#111111]"}`}>{item.label}</div>
                <div className={`mt-0.5 text-[12px] ${dark ? "text-white/52" : "text-[#595959]"}`}>Current census {item.current.toLocaleString()}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className={`text-[20px] font-semibold tabular-nums ${positive ? "text-[#0f8b73]" : negative ? "text-[#bd5c54]" : dark ? "text-white/58" : "text-[#595959]"}`}>
                  {positive ? "+" : ""}{item.delta.toLocaleString()}
                </div>
                {onSelect && actionLabel ? (
                  <div className={`mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${dark ? "text-white/58" : "text-[#736657]"}`}>
                    {actionLabel}
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
                  </div>
                ) : null}
              </div>
            </div>
            <div className={`mt-2 h-1.5 overflow-hidden ${dark ? "bg-white/[0.08]" : "bg-[#d9d9d9]"}`}>
              <div
                className={`h-full ${positive ? "bg-[#0f8b73]" : negative ? "bg-[#bd5c54]" : "bg-[#595959]"}`}
                style={{
                  width: item.delta === 0
                    ? "0%"
                    : `${Math.min(Math.max((Math.abs(item.delta) / maxMagnitude) * 100, 6), 100)}%`
                }}
              />
            </div>
          </>
        );

        return onSelect ? (
          <button
            key={item.id}
            type="button"
            data-module-row="census-movement"
            data-module-row-id={item.id}
            data-module-row-label={item.label}
            aria-label={`${item.label}: current census ${item.current.toLocaleString()}, movement ${positive ? "+" : ""}${item.delta.toLocaleString()}. ${actionLabel ?? "Open"}`}
            onClick={() => onSelect(item)}
            className={`min-w-0 w-full border-b border-[#d9d9d9] px-0 py-3 text-left transition-colors last:border-b-0 ${dark ? "bg-white/[0.035] hover:bg-white/[0.065]" : "bg-white hover:bg-[#fafafa]"}`}
          >
            {content}
          </button>
        ) : (
          <div key={item.id} data-module-row="census-movement" data-module-row-id={item.id} data-module-row-label={item.label} className={`border-b border-[#d9d9d9] px-0 py-3 last:border-b-0 ${dark ? "bg-white/[0.035]" : "bg-white"}`}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
