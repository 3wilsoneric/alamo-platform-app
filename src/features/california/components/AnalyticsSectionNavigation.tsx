export type AnalyticsSection = "reports" | "questions";

export default function AnalyticsSectionNavigation({
  active,
  onNavigate
}: {
  active: AnalyticsSection;
  onNavigate: (section: AnalyticsSection) => void;
}) {
  return (
    <nav
      aria-label="Analytics sections"
      data-analytics-section-navigation="true"
      data-analytics-section-current={active}
      className="pointer-events-none absolute right-3 top-[64px] z-40 flex items-center justify-end sm:right-[150px] sm:top-5"
    >
      <p className="sr-only">
        Analytics workspace view
      </p>
      <div
        role="group"
        aria-label="Analytics view"
        className="pointer-events-auto flex items-center gap-1.5"
      >
        <SectionButton
          active={active === "reports"}
          label="Reports"
          onClick={() => onNavigate("reports")}
        />
        <SectionButton
          active={active === "questions"}
          label="Ask a question"
          onClick={() => onNavigate("questions")}
        />
      </div>
    </nav>
  );
}

function SectionButton({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-current={active ? "page" : undefined}
      data-analytics-section-target={label === "Reports" ? "reports" : "questions"}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center justify-center whitespace-nowrap border px-3 text-[12px] font-medium transition-[background-color,border-color,color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] sm:min-h-9 sm:px-3.5 sm:text-[13px] ${
        active
          ? "border-[#9fbdb4] bg-[#edf4f1] text-[#174f42]"
          : "border-transparent bg-transparent text-[#5b6762] hover:text-[#0b6f5e]"
      }`}
    >
      <span>{label}</span>
    </button>
  );
}
