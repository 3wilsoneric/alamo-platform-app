export interface KpiStripItem {
  id: string;
  label: string;
  value: string;
  detail?: string | null;
}

interface KpiStripModuleProps {
  items: KpiStripItem[];
  onSelect?: (item: KpiStripItem) => void;
  emptyLabel?: string;
}

export function KpiStripModule({
  items,
  onSelect,
  emptyLabel = "Summary values are not available for this selection."
}: KpiStripModuleProps) {
  if (!items.length) {
    return <div className="border-y border-[#d9d9d9] bg-white px-5 py-8 text-center text-[14px] text-[#595959]">{emptyLabel}</div>;
  }

  return (
    <div className="grid gap-x-7 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => {
        const content = (
          <>
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#595959]">{item.label}</div>
          <div className="mt-1 truncate text-[30px] font-semibold tracking-[-0.055em] text-[#111111]">{item.value}</div>
          {item.detail ? <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#595959]">{item.detail}</div> : null}
          {onSelect ? <div className="mt-2 text-[11px] font-semibold text-[#0f8b73]">Open detail →</div> : null}
          </>
        );
        const className = "min-w-0 border-t border-[#111111] pt-3 text-left first:border-[#0f8b73]";

        return onSelect ? (
          <button
            key={item.id}
            type="button"
            data-module-content-control="true"
            data-module-row="kpi-strip"
            data-kpi-drilldown={item.id}
            onClick={() => onSelect(item)}
            className={`${className} transition-colors hover:bg-[#f7fbf9]`}
          >
            {content}
          </button>
        ) : (
          <div key={item.id} data-module-row="kpi-strip" className={className}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
