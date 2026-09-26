export interface IncidentDetailListItem {
  id: string;
  date: string;
  community?: string | null;
  resident: string;
  residentId?: string | null;
  unit?: string | null;
  category?: string | null;
  incidentType?: string | null;
  location?: string | null;
  description?: string | null;
  flagCount?: number;
}

interface IncidentDetailListModuleProps {
  rows: IncidentDetailListItem[];
  variant?: "light" | "dark";
  selectedId?: string | null;
  onSelect?: (row: IncidentDetailListItem) => void;
  onSelectResident?: (row: IncidentDetailListItem) => void;
  emptyLabel?: string;
}

function normalizeLocationLabel(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatResidentLocation(community?: string | null, unit?: string | null) {
  const communityLabel = String(community ?? "").trim();
  const unitLabel = String(unit ?? "").trim();
  const normalizedCommunity = normalizeLocationLabel(communityLabel);
  const normalizedUnit = normalizeLocationLabel(unitLabel);
  const unitLooksLikeCommunity = Boolean(
    normalizedUnit && normalizedCommunity &&
    (normalizedUnit === normalizedCommunity || normalizedUnit.includes("health services") || normalizedUnit.includes("house"))
  );
  const parts = [communityLabel, unitLabel && !unitLooksLikeCommunity ? `Unit ${unitLabel}` : null].filter(Boolean);
  return parts.join(" · ") || "Location not listed";
}

export function IncidentDetailListModule({
  rows,
  variant = "light",
  selectedId = null,
  onSelect,
  onSelectResident,
  emptyLabel = "No incident records match this selection."
}: IncidentDetailListModuleProps) {
  const dark = variant === "dark";

  if (!rows.length) {
    return (
      <div
        className={`flex min-h-[220px] items-center justify-center border-y border-[#d9d9d9] bg-white px-6 text-center text-[14px] leading-6 ${
          dark ? "text-white/52" : "text-[#595959]"
        }`}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className={`max-h-[560px] overflow-auto border-y divide-y [scrollbar-width:thin] ${dark ? "divide-white/[0.06] border-white/[0.1]" : "divide-[#d9d9d9] border-[#111111]"}`}>
      {rows.map((row) => {
        const selected = selectedId === row.id;
        const content = (
          <div className="grid gap-2 md:grid-cols-[116px_minmax(150px,0.9fr)_minmax(160px,0.8fr)_minmax(220px,1.4fr)] md:items-start">
            <div className={`text-[12px] leading-5 ${dark ? "text-white/56" : "text-[#595959]"}`}>{row.date}</div>
            <div className="min-w-0">
              {onSelectResident ? (
                <button
                  type="button"
                  data-module-content-control="true"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectResident(row);
                  }}
                  className={`truncate text-left text-[13px] font-semibold transition-colors ${
                    dark ? "text-white hover:text-[#6dd9a2]" : "text-[#0f6f5d] hover:text-[#111111]"
                  }`}
                >
                  {row.resident}
                </button>
              ) : (
                <div className={`truncate text-[14px] font-semibold ${dark ? "text-white" : "text-[#111111]"}`}>
                  {row.resident}
                </div>
              )}
              <div className={`mt-0.5 truncate text-[12px] ${dark ? "text-white/44" : "text-[#595959]"}`}>
                {formatResidentLocation(row.community, row.unit)}
              </div>
            </div>
            <div className="min-w-0">
              <div className={`truncate text-[13px] font-semibold ${dark ? "text-white/72" : "text-[#111111]"}`}>
                {row.category || row.incidentType || "Incident"}
              </div>
              <div className={`mt-0.5 truncate text-[12px] ${dark ? "text-white/46" : "text-[#595959]"}`}>
                {row.incidentType || row.location || "No subtype listed"}
              </div>
            </div>
            <div className={`text-[13px] leading-5 ${dark ? "text-white/64" : "text-[#333333]"}`}>
              <div className="line-clamp-3">{row.description || row.location || "No description listed."}</div>
              {row.flagCount ? (
                <div className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${dark ? "text-[#f0a1a1]" : "text-[#a04436]"}`}>
                  {row.flagCount} flag{row.flagCount === 1 ? "" : "s"}
                </div>
              ) : null}
            </div>
          </div>
        );

        const className = `relative w-full px-4 py-3 text-left transition-colors ${
          dark
            ? selected
              ? "bg-[#171f2d]"
              : "bg-transparent hover:bg-white/[0.03]"
            : selected
              ? "bg-[#f7fbf9]"
              : "bg-white hover:bg-[#fafafa]"
        }`;

        return (
          <div key={row.id} data-module-row="incident-detail" className={className}>
            {onSelect ? (
              <button
                type="button"
                data-module-content-control="true"
                onClick={() => onSelect(row)}
                className="absolute inset-0 z-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[#0f8b73]"
                aria-label={`Open ${row.resident} incident from ${row.date}`}
              />
            ) : null}
            <div className="pointer-events-none relative z-10 [&_button]:pointer-events-auto">{content}</div>
          </div>
        );
      })}
    </div>
  );
}
