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
  accentColor?: string;
}

export function MedicationComplianceModule({
  items,
  variant = "light",
  onSelect,
  emptyLabel = "Medication administration data is not available for this selection.",
  accentColor
}: MedicationComplianceModuleProps) {
  const dark = variant === "dark";
  if (!items.length) {
    return (
      <div className={`border-y border-[#d9d9d9] bg-white px-5 py-8 text-center text-[14px] ${dark ? "text-white/52" : "text-[#595959]"}`}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-0 border-y border-[#d9d9d9]">
      {items.map((item) => {
        const content = (
          <>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className={`truncate text-[14px] font-semibold ${dark ? "text-white" : "text-[#111111]"}`}>{item.label}</div>
                <div className={`mt-0.5 text-[12px] ${dark ? "text-white/52" : "text-[#595959]"}`}>
                  {[item.period, "Administrations given"].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className={`shrink-0 text-[20px] font-semibold tabular-nums ${dark ? "text-white" : "text-[#0f6f5d]"}`} style={accentColor ? { color: accentColor } : undefined}>
                {item.given == null ? "—" : item.given.toLocaleString()}
              </div>
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
