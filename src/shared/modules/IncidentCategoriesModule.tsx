export interface IncidentCategoryItem {
  label: string;
  count: number;
}

interface IncidentCategoriesModuleProps {
  items: IncidentCategoryItem[];
  variant?: "light" | "dark";
  limit?: number;
  activeCategory?: string | null;
  onSelect?: (category: string) => void;
  emptyLabel?: string;
}

export function IncidentCategoriesModule({
  items,
  variant = "light",
  limit = 8,
  activeCategory = null,
  onSelect,
  emptyLabel = "Incident categories are not available for this selection."
}: IncidentCategoriesModuleProps) {
  const dark = variant === "dark";
  const visibleItems = items
    .map((item) => ({
      ...item,
      count: Number.isFinite(item.count) ? item.count : 0
    }))
    .filter((item) => item.count > 0)
    .slice(0, limit);
  const maxValue = Math.max(...visibleItems.map((item) => item.count), 1);

  if (!visibleItems.length) {
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

  return (
    <div className="space-y-0 border-y border-[#d9d9d9]">
      {visibleItems.map((item) => {
        const selected = activeCategory === item.label;
        const content = (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className={`min-w-0 break-words text-[14px] font-semibold leading-5 ${dark ? "text-white/88" : "text-[#111111]"}`}>
                {item.label}
              </div>
              <div className={`flex shrink-0 items-center gap-2 pt-0.5 text-[15px] font-semibold tabular-nums ${dark ? "text-white" : "text-[#111111]"}`}>
                <span>{item.count.toLocaleString()}</span>
                {onSelect ? (
                  <span aria-hidden="true" className="text-[13px] transition-transform duration-150 group-hover:translate-x-0.5">
                    →
                  </span>
                ) : null}
              </div>
            </div>
            <div className={`mt-2 h-1.5 overflow-hidden ${dark ? "bg-white/[0.07]" : "bg-[#d9d9d9]"}`}>
              <div
                className={`h-full ${dark ? "bg-[#6dd9a2]" : "bg-[#0f8b73]"}`}
                style={{ width: `${Math.min(Math.max((item.count / maxValue) * 100, 5), 100)}%` }}
              />
            </div>
          </>
        );

        const className = `group w-full border-b border-[#d9d9d9] px-0 py-3 text-left transition-colors last:border-b-0 ${
          dark
            ? selected
              ? "bg-[#172037]"
              : "bg-white/[0.035] hover:bg-white/[0.06]"
            : selected
              ? "bg-[#f7fbf9]"
              : "bg-white hover:bg-[#fafafa]"
        }`;

        return onSelect ? (
          <button
            key={item.label}
            type="button"
            data-module-row="incident-category"
            data-incident-category-drilldown={item.label}
            aria-label={`Open ${item.label} incident reports`}
            onClick={() => onSelect(item.label)}
            className={className}
          >
            {content}
          </button>
        ) : (
          <div key={item.label} data-module-row="incident-category" className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
