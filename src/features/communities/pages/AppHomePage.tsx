import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  FileText,
  Users
} from "lucide-react";

interface TileProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  subtitle: string;
  tone: string;
  borderTone?: string;
  cardTone?: string;
  onClick: () => void;
  hovered: boolean;
}

function NavTile({
  icon: Icon,
  label,
  subtitle,
  tone,
  borderTone,
  cardTone,
  onClick,
  hovered
}: TileProps) {
  return (
    <button
      onClick={onClick}
      className={`group flex h-[112px] w-full items-center rounded-[20px] border p-6 text-left shadow-[0_10px_24px_-20px_rgba(15,23,42,0.16),0_2px_6px_-4px_rgba(15,23,42,0.1)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.22),0_4px_10px_-6px_rgba(15,23,42,0.12)] ${
        borderTone || "border-slate-200 hover:border-slate-300"
      } ${cardTone || "bg-white"}`}
    >
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`flex h-10 w-10 items-center justify-center rounded-[11px] ${tone}`}>
            <Icon className="h-[17px] w-[17px]" />
          </div>

          <div className="min-w-0">
            <h2 className="text-[1.03rem] font-semibold leading-[1.1] tracking-[-0.025em] text-slate-900">
              {label}
            </h2>
            <p className="mt-1 text-[0.79rem] leading-[1.25] text-slate-500">
              {subtitle}
            </p>
          </div>
        </div>

        <ArrowRight
          className={`h-5 w-5 flex-shrink-0 text-slate-300 transition-all duration-200 ${
            hovered ? "translate-x-1 text-slate-500" : ""
          }`}
        />
      </div>
    </button>
  );
}

function CommunitiesTile({
  onClick,
  hovered
}: {
  onClick: () => void;
  hovered: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="group w-full rounded-[20px] border border-[#b8cae2] bg-[linear-gradient(180deg,#f2f7fd_0%,#e4eef9_100%)] p-7 text-left shadow-[0_12px_28px_-20px_rgba(15,23,42,0.12),0_3px_8px_-5px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#9fb8d8] hover:shadow-[0_18px_42px_-24px_rgba(15,23,42,0.18),0_6px_12px_-8px_rgba(15,23,42,0.1)]"
    >
      <div className="flex items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[11px] bg-[#6f8fb8] text-white">
            <BarChart3 className="h-[19px] w-[19px]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[1.42rem] font-semibold leading-[1.05] tracking-[-0.03em] text-slate-900">
              Communities
            </h2>
            <p className="mt-1 max-w-[35rem] text-[0.86rem] leading-[1.32] text-slate-700">
              Census, occupancy, incidents, and operational performance
            </p>
          </div>
        </div>

        <ArrowRight
          className={`mt-1 h-5 w-5 flex-shrink-0 text-slate-400 transition-all duration-200 ${
            hovered ? "translate-x-1 text-slate-700" : ""
          }`}
        />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3.5">
        {[
          { label: "Residents", value: "563" },
          { label: "Occupancy", value: "94%" },
          { label: "Incidents", value: "12" }
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-[13px] border border-blue-100 bg-white/88 px-4.5 py-3.5"
          >
            <div className="text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-slate-400">
              {stat.label}
            </div>
            <div className="mt-1.5 text-[1.36rem] font-semibold leading-none tracking-[-0.03em] text-slate-900">
              {stat.value}
            </div>
          </div>
        ))}
      </div>
    </button>
  );
}

function CommonPlaceTile({
  onClick,
  hovered
}: {
  onClick: () => void;
  hovered: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="group w-full rounded-[20px] border border-[#cec2dd] bg-[linear-gradient(180deg,#fcfaff_0%,#f2edf8_100%)] p-7 text-left shadow-[0_10px_24px_-20px_rgba(15,23,42,0.12),0_2px_6px_-4px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#b9a9cf] hover:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18),0_4px_10px_-6px_rgba(15,23,42,0.1)]"
    >
      <div className="flex items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[11px] bg-[#8e7aa9] text-white">
            <BookOpen className="h-[19px] w-[19px]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[1.42rem] font-semibold leading-[1.05] tracking-[-0.03em] text-slate-900">
              CommonPlace
            </h2>
            <p className="mt-1 max-w-[35rem] text-[0.86rem] leading-[1.32] text-slate-600">
              Policies, program knowledge, playbooks, and operational reference materials
            </p>
          </div>
        </div>

        <ArrowRight
          className={`mt-1 h-5 w-5 flex-shrink-0 text-slate-300 transition-all duration-200 ${
            hovered ? "translate-x-1 text-slate-500" : ""
          }`}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2.5">
        {["Playbooks", "Policies", "Templates", "Training"].map((item) => (
          <span
            key={item}
            className="rounded-full border border-violet-200 bg-white/88 px-3 py-1.5 text-[0.67rem] font-semibold uppercase tracking-[0.08em] text-[#6e5b87]"
          >
            {item}
          </span>
        ))}
      </div>
    </button>
  );
}

function ReportsFeatureTile({
  onClick,
  hovered
}: {
  onClick: () => void;
  hovered: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="group w-full rounded-[20px] border border-[#bed1e2] bg-[linear-gradient(180deg,#fafcff_0%,#ecf3f9_100%)] p-7 text-left shadow-[0_10px_24px_-20px_rgba(15,23,42,0.12),0_2px_6px_-4px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#a7bfd5] hover:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.18),0_4px_10px_-6px_rgba(15,23,42,0.1)]"
    >
      <div className="flex items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[11px] bg-[#7a93ae] text-white">
            <FileText className="h-[19px] w-[19px]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[1.42rem] font-semibold leading-[1.05] tracking-[-0.03em] text-slate-900">
              Reports
            </h2>
            <p className="mt-1 max-w-[35rem] text-[0.86rem] leading-[1.32] text-slate-600">
              Exports, trend views, outcome reporting, and saved operational analysis
            </p>
          </div>
        </div>

        <ArrowRight
          className={`mt-1 h-5 w-5 flex-shrink-0 text-slate-300 transition-all duration-200 ${
            hovered ? "translate-x-1 text-slate-500" : ""
          }`}
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2.5">
        {["Census", "Outcomes", "Staffing", "Exports"].map((item) => (
          <span
            key={item}
            className="rounded-full border border-slate-200 bg-white/88 px-3 py-1.5 text-[0.67rem] font-semibold uppercase tracking-[0.08em] text-[#58728f]"
          >
            {item}
          </span>
        ))}
      </div>
    </button>
  );
}

export default function AppHomePage() {
  const navigate = useNavigate();
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  return (
    <>
      <div className="px-6 pt-8">
        <div className="mx-auto max-w-[1125px]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
            <div className="min-w-0 flex-1 space-y-5">
              <div
                onMouseEnter={() => setHoveredCard("communities")}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <CommunitiesTile
                  onClick={() => navigate("/communities")}
                  hovered={hoveredCard === "communities"}
                />
              </div>

              <div
                onMouseEnter={() => setHoveredCard("reports")}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <ReportsFeatureTile
                  onClick={() => navigate("/reports")}
                  hovered={hoveredCard === "reports"}
                />
              </div>
            </div>

            <div className="flex w-full flex-col gap-5 lg:w-[322px]">
              <div
                onMouseEnter={() => setHoveredCard("commonplace")}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <NavTile
                  icon={BookOpen}
                  label="CommonPlace"
                  subtitle="Knowledge hub and playbooks"
                  tone="bg-[#8e7aa9] text-white"
                  borderTone="border-[#cec2dd] hover:border-[#b9a9cf]"
                  cardTone="bg-[linear-gradient(180deg,#fcfaff_0%,#f2edf8_100%)]"
                  onClick={() => {
                    window.open(
                      "https://atlas-knowledge-hub.vercel.app/demo",
                      "_blank",
                      "noopener,noreferrer"
                    );
                  }}
                  hovered={hoveredCard === "commonplace"}
                />
              </div>

              <div
                onMouseEnter={() => setHoveredCard("workforce")}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <NavTile
                  icon={Users}
                  label="Workforce"
                  subtitle="Coverage and staffing"
                  tone="bg-[#729181] text-white"
                  borderTone="border-[#c3d3c8] hover:border-[#aebfb4]"
                  cardTone="bg-[linear-gradient(180deg,#fbfdfb_0%,#edf4ee_100%)]"
                  onClick={() => navigate("/workforce")}
                  hovered={hoveredCard === "workforce"}
                />
              </div>

              <div
                onMouseEnter={() => setHoveredCard("incidents")}
                onMouseLeave={() => setHoveredCard(null)}
              >
                <NavTile
                  icon={AlertTriangle}
                  label="Incident Center"
                  subtitle="Escalations and event review"
                  tone="bg-[#b18386] text-white"
                  borderTone="border-[#e1c5c7] hover:border-[#d0afb2]"
                  cardTone="bg-[linear-gradient(180deg,#fffafa_0%,#f7ecec_100%)]"
                  onClick={() => navigate("/incidents")}
                  hovered={hoveredCard === "incidents"}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
