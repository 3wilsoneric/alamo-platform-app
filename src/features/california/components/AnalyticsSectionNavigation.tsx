import { useLicensingAccess } from "../../../shared/auth/licensingAccess";

export type AnalyticsSection = "reports" | "questions" | "licensing";

export default function AnalyticsSectionNavigation({
  active,
  onNavigate
}: {
  active: AnalyticsSection;
  onNavigate: (section: AnalyticsSection) => void;
}) {
  const canViewLicensing = useLicensingAccess();
  return (
    <nav
      aria-label="Analytics sections"
      data-analytics-section-navigation="true"
      data-analytics-section-current={active}
      className="shrink-0 border-b border-[#d3d9d5] bg-white px-4 sm:px-6 lg:px-8"
    >
      <p className="sr-only">
        Analytics workspace view
      </p>
      <div
        role="group"
        aria-label="Analytics view"
        className="mx-auto flex w-full max-w-[1500px] items-stretch gap-5 overflow-x-auto sm:gap-8"
      >
        <SectionButton
          section="reports"
          active={active === "reports"}
          label="Reports"
          onClick={() => onNavigate("reports")}
        />
        <SectionButton
          section="questions"
          active={active === "questions"}
          label="Ask a question"
          onClick={() => onNavigate("questions")}
        />
        {canViewLicensing ? <SectionButton
          section="licensing"
          active={active === "licensing"}
          label="Licensing"
          onClick={() => onNavigate("licensing")}
        /> : null}
      </div>
    </nav>
  );
}

function SectionButton({
  section,
  active,
  label,
  onClick
}: {
  section: AnalyticsSection;
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-current={active ? "page" : undefined}
      data-analytics-section-target={section}
      onClick={onClick}
      className={`inline-flex min-h-12 shrink-0 items-center justify-center border-b-[3px] px-1 text-[14px] font-semibold transition-[border-color,color] sm:min-h-12 sm:text-[15px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] ${
        active
          ? "border-[#087d64] text-[#086c57]"
          : "border-transparent text-[#56636b] hover:border-[#b7c8c1] hover:text-[#143d35]"
      }`}
    >
      <span>{label}</span>
    </button>
  );
}
