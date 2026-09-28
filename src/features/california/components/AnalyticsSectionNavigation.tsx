import { BarChart3, MessageSquareText } from "lucide-react";

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
      className="pointer-events-none absolute inset-x-3 top-[60px] z-40 flex items-center justify-end border-b border-[#d9d9d9] pb-2 sm:inset-x-6 sm:top-[64px] lg:inset-x-auto lg:right-[224px] lg:top-2 lg:border-b-0 lg:pb-0"
    >
      <p className="sr-only">
        Analytics workspace view
      </p>
      <div
        role="group"
        aria-label="Analytics view"
        className="pointer-events-auto flex w-full items-center gap-1 border border-[#bfd1cb] bg-[#eef4f1] p-1 shadow-[0_2px_8px_rgba(49,91,84,0.08)] lg:w-auto"
      >
        <SectionButton
          active={active === "reports"}
          icon={<BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Reports"
          onClick={() => onNavigate("reports")}
        />
        <SectionButton
          active={active === "questions"}
          icon={<MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Ask a question"
          onClick={() => onNavigate("questions")}
        />
      </div>
    </nav>
  );
}

function SectionButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: React.ReactNode;
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
      className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 border px-3.5 text-[12px] font-bold transition-[background-color,border-color,color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] sm:min-h-9 sm:flex-none ${
        active
          ? "border-[#0f8b73] bg-white text-[#0b6f5e] shadow-[0_1px_4px_rgba(15,139,115,0.12)]"
          : "border-transparent text-[#40534e] hover:border-[#c6d8d2] hover:bg-white hover:text-[#0b6f5e]"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
