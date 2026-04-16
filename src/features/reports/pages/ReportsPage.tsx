import { useState } from "react";
import { Download } from "lucide-react";

interface ReportsPageProps {
  searchTerm?: string;
}

const reports = [
  { value: "census-trends", label: "Census Trends" },
  { value: "referral-sources", label: "Referral Sources" },
  { value: "length-of-stay", label: "Length of Stay Analysis" },
  { value: "incident-trends", label: "Incident Trends" },
  { value: "staff-training", label: "Staff Training & Compliance" }
];

const statLabels = [
  "Primary Metric",
  "Period Change",
  "Source View",
  "Export Status"
];

function ChartPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-[280px] flex-col justify-between rounded-[18px] border border-dashed border-slate-300 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)] p-5">
      <div className="relative h-[150px]">
        <div className="absolute inset-x-0 bottom-0 h-px bg-slate-300" />
        <svg viewBox="0 0 280 140" className="h-full w-full">
          <path
            d="M10 108 C40 92, 52 94, 80 78 S130 46, 162 56 S214 88, 270 34"
            fill="none"
            stroke="rgba(100,116,139,0.55)"
            strokeWidth="4"
            strokeLinecap="round"
          />
          {[10, 80, 162, 270].map((x, index) => (
            <circle key={index} cx={x} cy={index === 0 ? 108 : index === 1 ? 78 : index === 2 ? 56 : 34} r="4.5" fill="rgba(100,116,139,0.7)" />
          ))}
        </svg>
      </div>
      <div className="space-y-1 text-center">
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          This chart area
        </div>
        <div className="text-[13px] leading-6 text-slate-500">
          {label} will populate after connected report data is available.
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage({ searchTerm = "" }: ReportsPageProps) {
  const [selectedReport, setSelectedReport] = useState("census-trends");
  const [selectedTimeframe] = useState("configured timeframe");

  return (
    <div>
      <div className="mx-auto max-w-[1320px] px-6 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-[1.55rem] font-semibold tracking-[-0.04em] text-gray-900">
              Reports
            </h1>
            <select
              value={selectedReport}
              onChange={(event) => setSelectedReport(event.target.value)}
              className="rounded-full border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {reports.map((report) => (
                <option key={report.value} value={report.value}>
                  {report.label}
                </option>
              ))}
            </select>
          </div>
          <button className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50">
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>

        {(searchTerm || true) && (
          <div className="mb-3 text-[13px] text-gray-500">
            {searchTerm
              ? `Filtered by search: "${searchTerm}"`
              : "Report shells are in place. Values, trend lines, and tables will resolve from Azure views and marts."}
          </div>
        )}

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {statLabels.map((label) => (
            <div
              key={label}
              className="rounded-[20px] border border-black/80 bg-white p-4 shadow-[0_10px_26px_-24px_rgba(15,23,42,0.25)]"
            >
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                {label}
              </div>
              <div className="text-[1.55rem] font-semibold tracking-[-0.04em] text-gray-300">—</div>
            </div>
          ))}
        </div>

        <div className="mb-4 rounded-[22px] border border-black/80 bg-white p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)]">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
            Timeframe: {selectedTimeframe}
          </div>
          <h3 className="mb-3 text-[15px] font-semibold text-gray-900">Trend Analysis</h3>
          <ChartPlaceholder label="Trend analysis" />
        </div>

        <div className="mb-4 rounded-[22px] border border-black/80 bg-white p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)]">
          <h3 className="mb-2 text-[15px] font-semibold text-gray-900">Summary</h3>
          <p className="text-[13px] leading-6 text-gray-700">
            Narrative summaries will be generated from connected report datasets and saved
            report definitions once the Azure reporting layer is live.
          </p>
        </div>

        <div className="rounded-[22px] border border-black/80 bg-white shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)]">
          <div className="border-b border-gray-200 px-4 py-3">
            <h3 className="text-[15px] font-semibold text-gray-900">Detail View</h3>
          </div>
          <div className="flex h-[280px] items-center justify-center px-4 text-center text-[13px] leading-6 text-slate-500">
            The detailed report table will populate from Azure-backed report views for the
            selected report and timeframe.
          </div>
        </div>
      </div>
    </div>
  );
}
