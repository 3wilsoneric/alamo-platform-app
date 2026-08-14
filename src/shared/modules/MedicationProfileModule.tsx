export interface MedicationProfileItem {
  id: string;
  label: string;
  value: string;
  detail?: string | null;
}

interface MedicationProfileModuleProps {
  items: MedicationProfileItem[];
  onSelect?: (item: MedicationProfileItem) => void;
  emptyLabel?: string;
}

const priorityLabels = new Set(["compliance", "not given", "refusals", "below 90%"]);
const sectionLabels = [
  {
    title: "Administration totals",
    labels: new Set(["scheduled", "given"])
  },
  {
    title: "Resident coverage",
    labels: new Set(["resident summaries", "active medications", "prn given, 30d"])
  },
  {
    title: "Exception mix",
    labels: new Set(["medication exceptions", "refusal detail", "late administrations", "held medications", "prn detail"])
  }
] as const;

function isUnavailableItem(item: MedicationProfileItem) {
  const value = item.value.trim();
  const detail = String(item.detail ?? "");
  return value === "—" || /\b(?:not loaded|not available|unavailable|no monthly)\b/i.test(detail);
}

function toneFor(label: string) {
  const normalized = label.toLowerCase();
  if (normalized === "compliance") return "border-[#0f8b73] text-[#0f6f5d]";
  if (["not given", "refusals", "below 90%"].includes(normalized)) return "border-[#d88946] text-[#8b5619]";
  return "border-[#d9d9d9] text-[#111111]";
}

export function MedicationProfileModule({
  items,
  onSelect,
  emptyLabel = "Medication profile data is not available for this selection."
}: MedicationProfileModuleProps) {
  const availableItems = items.filter((item) => !isUnavailableItem(item));

  if (!availableItems.length) {
    return (
      <div className="border-y border-[#d9d9d9] bg-white px-5 py-8 text-center text-[14px] text-[#595959]">
        {emptyLabel}
      </div>
    );
  }

  const priorityItems = availableItems.filter((item) => priorityLabels.has(item.label.toLowerCase()));
  const supportingItems = availableItems.filter((item) => !priorityLabels.has(item.label.toLowerCase()));
  const sections = sectionLabels
    .map((section) => ({
      title: section.title,
      items: supportingItems.filter((item) => section.labels.has(item.label.toLowerCase()))
    }))
    .filter((section) => section.items.length);

  function renderItem(item: MedicationProfileItem, priority = false) {
    const content = (
      <>
        <div className={`${priority ? "text-[11px]" : "text-[10px]"} font-bold uppercase tracking-[0.12em] text-[#595959]`}>{item.label}</div>
        <div className={`${priority ? "mt-1 text-[30px] tracking-[-0.06em]" : "mt-1 text-[18px] tracking-[-0.035em]"} truncate font-semibold tabular-nums`}>{item.value}</div>
        {item.detail ? <div className={`${priority ? "mt-1" : "mt-0.5"} line-clamp-2 text-[12px] leading-5 text-[#595959]`}>{item.detail}</div> : null}
      </>
    );
    const className = priority
      ? `border-t bg-white px-0 py-4 text-left ${toneFor(item.label)}`
      : "border-t border-[#d9d9d9] bg-white px-0 py-3 text-left text-[#111111]";

    return onSelect ? (
      <button key={item.id} type="button" data-module-row="medication-profile" onClick={() => onSelect(item)} className={`${className} w-full transition-colors hover:bg-[#fafafa]`}>
        {content}
      </button>
    ) : (
      <div key={item.id} data-module-row="medication-profile" className={className}>{content}</div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(priorityItems.length ? priorityItems : availableItems.slice(0, 4)).map((item) => renderItem(item, true))}
      </div>

      {sections.map((section) => (
        <section key={section.title} className="border-t border-[#111111] bg-white pt-4">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#595959]">{section.title}</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {section.items.map((item) => renderItem(item))}
          </div>
        </section>
      ))}
    </div>
  );
}
