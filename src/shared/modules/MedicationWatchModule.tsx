export interface MedicationWatchItem {
  id: string;
  resident: string;
  community?: string | null;
  unit?: string | null;
  signal: string;
  compliance?: string | null;
  notGiven30?: number | null;
  refusals30?: number | null;
  prn30?: number | null;
  activeMeds?: number | null;
  lastMar?: string | null;
}

interface MedicationWatchModuleProps {
  items: MedicationWatchItem[];
  onSelect?: (item: MedicationWatchItem) => void;
  emptyLabel?: string;
}

function formatCount(value?: number | null) {
  return Number.isFinite(value ?? NaN) ? Number(value).toLocaleString() : "—";
}

export function MedicationWatchModule({
  items,
  onSelect,
  emptyLabel = "No resident MAR watch records match this selection."
}: MedicationWatchModuleProps) {
  if (!items.length) {
    return (
      <div className="border-y border-[#d9d9d9] bg-white px-5 py-8 text-center text-[14px] text-[#595959]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((item, index) => {
        const content = <>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#595959]">
                Watch item {index + 1}
              </div>
              <div className="mt-1 truncate text-[17px] font-semibold tracking-[-0.03em] text-[#111111]">
                {item.resident}
              </div>
              <div className="mt-0.5 truncate text-[12px] text-[#595959]">
                {[item.community, item.unit ? `Unit ${item.unit}` : null].filter(Boolean).join(" · ") || "Current resident"}
              </div>
            </div>
            <div className="shrink-0 border border-[#d9d9d9] bg-white px-3 py-1 text-[12px] font-semibold text-[#0f8b73]">
              {item.compliance || "MAR"}
            </div>
          </div>

          <div className="mt-3 border-l-2 border-[#0f8b73] bg-[#f7fbf9] px-3 py-2 text-[13px] font-semibold leading-5 text-[#111111]">
            {item.signal}
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {[
              ["Not given", formatCount(item.notGiven30)],
              ["Refusals", formatCount(item.refusals30)],
              ["PRN", formatCount(item.prn30)],
              ["Meds", formatCount(item.activeMeds)]
            ].map(([label, value]) => (
              <div key={label} className="border-t border-[#d9d9d9] bg-white px-0 py-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#595959]">{label}</div>
                <div className="mt-0.5 text-[15px] font-semibold tabular-nums text-[#111111]">{value}</div>
              </div>
            ))}
          </div>

          {item.lastMar ? (
            <div className="mt-3 text-[12px] leading-5 text-[#595959]">Last MAR record: {item.lastMar}</div>
          ) : null}
        </>;
        const className = "border-t border-[#111111] bg-white py-4 text-left transition-colors hover:bg-[#fafafa]";
        return onSelect ? (
          <button key={item.id} type="button" data-module-row="medication-watch" aria-label={`Open ${item.resident} resident profile`} onClick={() => onSelect(item)} className={className}>
            {content}
          </button>
        ) : (
          <div key={item.id} data-module-row="medication-watch" className={className}>{content}</div>
        );
      })}
    </div>
  );
}
