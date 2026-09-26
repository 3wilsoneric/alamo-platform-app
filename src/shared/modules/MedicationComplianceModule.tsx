export interface MedicationComplianceItem {
  id: string;
  label: string;
  compliancePct: number;
  scheduled?: number | null;
  given?: number | null;
  notGiven?: number | null;
  period?: string | null;
}

interface MedicationComplianceModuleProps {
  items: MedicationComplianceItem[];
  variant?: "light" | "dark";
  onSelect?: (item: MedicationComplianceItem) => void;
  emptyLabel?: string;
}

export function MedicationComplianceModule({
  items,
  variant = "light",
  onSelect,
  emptyLabel = "Medication compliance data is not available for this selection."
}: MedicationComplianceModuleProps) {
  const dark = variant === "dark";
  const safeItems = items.map((item) => ({
    ...item,
    compliancePct: Number.isFinite(item.compliancePct) ? item.compliancePct : 0,
    hasCompliancePct: Number.isFinite(item.compliancePct)
  }));

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
        const safePct = item.hasCompliancePct ? Math.max(0, Math.min(item.compliancePct, 100)) : null;
        const content = (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className={`truncate text-[14px] font-semibold ${dark ? "text-white" : "text-[#111111]"}`}>{item.label}</div>
                <div className={`mt-0.5 text-[12px] ${dark ? "text-white/52" : "text-[#595959]"}`}>
                  {[item.period, item.scheduled != null ? `${item.scheduled.toLocaleString()} scheduled` : null, item.notGiven != null ? `${item.notGiven.toLocaleString()} not given` : null].filter(Boolean).join(" · ") || "Medication administration summary"}
                </div>
              </div>
              <div className={`shrink-0 text-[18px] font-semibold tabular-nums ${safePct == null ? dark ? "text-white/42" : "text-[#736657]" : safePct >= 95 ? "text-[#0f8b73]" : safePct >= 90 ? dark ? "text-[#f0c674]" : "text-[#9a6a20]" : "text-[#bd5c54]"}`}>
                {safePct == null ? "—" : `${safePct.toFixed(1)}%`}
              </div>
            </div>
            <div className={`mt-2 h-1.5 overflow-hidden ${dark ? "bg-white/[0.08]" : "bg-[#d9d9d9]"}`}>
              <div className="h-full bg-[#0f8b73]" style={{ width: `${safePct ?? 0}%` }} />
            </div>
          </>
        );

        return onSelect ? (
          <button key={item.id} type="button" data-module-row="medication-compliance" data-module-row-id={item.id} data-module-row-label={item.label} onClick={() => onSelect(item)} className={`w-full border-b border-[#d9d9d9] px-0 py-3 text-left transition-colors last:border-b-0 ${dark ? "bg-white/[0.035] hover:bg-white/[0.065]" : "bg-white hover:bg-[#fafafa]"}`}>
            {content}
          </button>
        ) : (
          <div key={item.id} data-module-row="medication-compliance" data-module-row-id={item.id} data-module-row-label={item.label} className={`border-b border-[#d9d9d9] px-0 py-3 last:border-b-0 ${dark ? "bg-white/[0.035]" : "bg-white"}`}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
