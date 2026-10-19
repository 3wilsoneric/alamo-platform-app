import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { readStorageItem, writeStorageItem } from "../../../shared/storage/browserStorage";

const DISMISSED_DATE_KEY = "alamo:monday-admissions-ribbon-dismissed:v1";
const PACIFIC_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "long",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function mondayDate(now: Date): string | null {
  const parts = Object.fromEntries(PACIFIC_DATE.formatToParts(now).map(({ type, value }) => [type, value]));
  return parts.weekday === "Monday" ? `${parts.year}-${parts.month}-${parts.day}` : null;
}

export default function MondayAdmissionsRibbon() {
  const navigate = useNavigate();
  const [visibleDate, setVisibleDate] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      const date = mondayDate(new Date());
      setVisibleDate(date && readStorageItem(DISMISSED_DATE_KEY) !== date ? date : null);
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  if (!visibleDate) return null;

  return (
    <aside
      data-monday-admissions-ribbon="true"
      aria-label="Monday admissions briefing"
      className="z-10 flex-none border-b border-[#c9dbd1] bg-[#eef5f0] px-3 py-2 text-[#183d31] sm:px-6"
    >
      <div className="mx-auto grid w-full max-w-[1540px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 sm:flex">
        <CalendarDays aria-hidden="true" className="col-start-1 row-start-1 h-5 w-5 shrink-0 text-[#27745a]" />
        <div className="col-start-2 row-start-1 min-w-0 text-[13px] leading-5 sm:flex sm:flex-1 sm:items-baseline sm:gap-2">
          <strong className="block font-semibold sm:inline">Monday census briefing</strong>
          <span className="block text-[#4a6458] sm:inline">This week’s admissions report is ready.</span>
        </div>
        <button
          type="button"
          onClick={() => navigate("/admissions")}
          className="col-start-2 row-start-2 inline-flex min-h-9 shrink-0 items-center justify-self-start gap-1 rounded-md text-[13px] font-semibold text-[#135b45] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#135b45] sm:min-h-11 sm:px-3"
        >
          Open Admissions <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Dismiss Monday admissions briefing"
          onClick={() => {
            writeStorageItem(DISMISSED_DATE_KEY, visibleDate);
            setVisibleDate(null);
          }}
          className="col-start-3 row-start-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#4a6458] hover:bg-[#dcebe1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#135b45]"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}
