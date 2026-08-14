export interface ResidentRosterItem {
  id: string;
  name: string;
  community?: string | null;
  unit?: string | null;
  age?: number | null;
  losDays?: number | null;
  diagnosis?: string | null;
  admitDate?: string | null;
}

interface ResidentRosterModuleProps {
  residents: ResidentRosterItem[];
  variant?: "light" | "dark";
  onSelect?: (resident: ResidentRosterItem) => void;
  emptyLabel?: string;
}

export function ResidentRosterModule({
  residents,
  variant = "light",
  onSelect,
  emptyLabel = "No residents matched this selection."
}: ResidentRosterModuleProps) {
  const dark = variant === "dark";

  if (!residents.length) {
    return (
      <div className={`border-y border-[#d9d9d9] bg-white px-5 py-8 text-center text-[14px] ${dark ? "text-white/52" : "text-[#595959]"}`}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#d9d9d9] overflow-hidden border-y border-[#111111] bg-white">
      {residents.map((resident) => {
        const content = (
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(180px,1.2fr)_minmax(160px,1fr)_auto] sm:items-center sm:gap-5">
            <div className="min-w-0">
              <div className={`truncate text-[14px] font-semibold ${dark ? "text-white" : "text-[#111111]"}`}>{resident.name}</div>
              <div className={`mt-1 truncate text-[12px] ${dark ? "text-white/52" : "text-[#595959]"}`}>
                {[resident.community, resident.unit ? `Unit ${resident.unit}` : null].filter(Boolean).join(" · ") || "Community and unit not listed"}
              </div>
            </div>
            <div className={`min-w-0 truncate text-[13px] ${dark ? "text-white/66" : "text-[#333333]"}`}>
              {resident.diagnosis || "Diagnosis not listed"}
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] tabular-nums sm:justify-end">
              {resident.age != null ? <span className={dark ? "text-white/58" : "text-[#595959]"}>Age {resident.age}</span> : null}
              {resident.losDays != null ? <span className={`font-semibold ${dark ? "text-white/78" : "text-[#111111]"}`}>{resident.losDays.toLocaleString()} LOS days</span> : null}
            </div>
          </div>
        );

        return onSelect ? (
          <button
            key={resident.id}
            type="button"
            data-module-row="resident-roster"
            data-module-row-id={resident.id}
            onClick={() => onSelect(resident)}
            className={`w-full px-0 py-3.5 text-left transition-colors ${dark ? "bg-white/[0.025] hover:bg-white/[0.06]" : "bg-white hover:bg-[#fafafa]"}`}
          >
            {content}
          </button>
        ) : (
          <div key={resident.id} data-module-row="resident-roster" data-module-row-id={resident.id} className={`px-0 py-3.5 ${dark ? "bg-white/[0.025]" : "bg-white"}`}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
