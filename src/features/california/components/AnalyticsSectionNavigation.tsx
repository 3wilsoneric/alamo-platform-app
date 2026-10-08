import { BarChart3, MessageSquareText, ShieldCheck } from "lucide-react";
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
      className="shrink-0 border-b border-[#dedfda] bg-white px-4 sm:px-6 lg:px-8"
    >
      <p className="sr-only">
        Analytics workspace view
      </p>
      <div
        role="group"
        aria-label="Analytics view"
        className="mx-auto my-2 flex w-full max-w-[1432px] items-center gap-1 rounded-xl border border-[#dfe3e0] bg-white p-1 sm:w-fit sm:max-w-none sm:rounded-lg"
      >
        <SectionButton
          section="reports"
          active={active === "reports"}
          icon={<BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Reports"
          onClick={() => onNavigate("reports")}
        />
        <SectionButton
          section="questions"
          active={active === "questions"}
          icon={<MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />}
          label="Ask a question"
          onClick={() => onNavigate("questions")}
        />
        {canViewLicensing ? <SectionButton
          section="licensing"
          active={active === "licensing"}
          icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
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
  icon,
  label,
  onClick
}: {
  section: AnalyticsSection;
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
      data-analytics-section-target={section}
      onClick={onClick}
      className={`inline-flex min-h-11 flex-1 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium transition-[background-color,border-color,color] sm:min-h-9 sm:flex-none sm:gap-2 sm:px-4 sm:text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] ${
        active
          ? "border-[#b8d8ca] bg-[#eaf5ef] text-[#086c57]"
          : "border-transparent text-[#313633] hover:border-[#d7dfda] hover:bg-[#f7f9f8] hover:text-[#086c57]"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
