export interface MedicationExceptionDetailItem {
  id: string;
  date: string;
  community?: string | null;
  resident: string;
  medication: string;
  route?: string | null;
  outcome?: string | null;
  reason?: string | null;
  scheduled?: string | null;
  prnResult?: string | null;
}

interface MedicationExceptionDetailModuleProps {
  rows: MedicationExceptionDetailItem[];
  onSelect?: (item: MedicationExceptionDetailItem) => void;
  emptyLabel?: string;
}

export function MedicationExceptionDetailModule({
  rows,
  onSelect,
  emptyLabel = "No MAR exception records match this selection."
}: MedicationExceptionDetailModuleProps) {
  if (!rows.length) {
    return (
      <div className="border-y border-dashed border-[#d9d9d9] bg-white px-5 py-8 text-center text-[14px] leading-6 text-[#595959]">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#d9d9d9] border-y border-[#111111] bg-white">
      {rows.map((row) => {
        const content = <>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#595959]">{row.date}</div>
            {row.scheduled ? <div className="mt-1 text-[11px] text-[#595959]">Scheduled {row.scheduled}</div> : null}
          </div>

          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-[#111111]">{row.resident}</div>
            <div className="mt-0.5 truncate text-[12px] text-[#595959]">{row.community || "Community not listed"}</div>
          </div>

          <div className="min-w-0">
            <div className="line-clamp-2 text-[13px] font-semibold leading-5 text-[#111111]">{row.medication}</div>
            {[row.route, row.outcome].filter(Boolean).length ? <div className="mt-0.5 text-[12px] text-[#595959]">{[row.route, row.outcome].filter(Boolean).join(" · ")}</div> : null}
          </div>

          <div className="border-l-2 border-[#0f8b73] bg-[#f7fbf9] px-3 py-2 text-[13px] leading-5 text-[#333333]">
            <div>{row.reason || "No reason or note listed."}</div>
            {row.prnResult ? <div className="mt-2 border-t border-[#d9d9d9] pt-2 text-[12px]"><span className="font-semibold">PRN result:</span> {row.prnResult}</div> : null}
          </div>
        </>;
        const className = "grid w-full gap-3 bg-white px-0 py-3 text-left transition-colors hover:bg-[#fafafa] md:grid-cols-[118px_minmax(180px,0.85fr)_minmax(220px,1fr)_minmax(220px,1.15fr)] md:items-start";
        return onSelect ? (
          <button key={row.id} type="button" data-module-row="medication-exception" aria-label={`Open ${row.resident} resident profile`} onClick={() => onSelect(row)} className={className}>
            {content}
          </button>
        ) : (
          <div key={row.id} data-module-row="medication-exception" className={className}>{content}</div>
        );
      })}
    </div>
  );
}
