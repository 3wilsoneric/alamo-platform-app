import { useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

interface WorkforcePageProps {
  searchTerm?: string;
}

const departments = [
  "all",
  "Clinical",
  "Operations",
  "Administration",
  "Finance",
  "IT",
  "Facilities",
  "Executive"
];

const summaryLabels = ["Visible staff", "Alerts", "Coverage gaps", "Open reviews"];
const placeholderRows = Array.from({ length: 8 }, (_, index) => ({
  id: index + 1,
  label: `Workforce record ${index + 1}`
}));

export default function WorkforcePage({ searchTerm = "" }: WorkforcePageProps) {
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [page, setPage] = useState(1);

  return (
    <div>
      <div className="mx-auto max-w-[1320px] px-6 py-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="rounded-[22px] border border-black/80 bg-white p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)]">
              <h3 className="mb-3 text-[15px] font-semibold text-gray-900">Departments</h3>
              <div className="space-y-2">
                {departments.map((department) => (
                  <button
                    key={department}
                    onClick={() => {
                      setSelectedDepartment(department);
                      setPage(1);
                    }}
                    className={`flex w-full items-center justify-between rounded-[16px] border px-3 py-2.5 text-left transition-colors ${
                      selectedDepartment === department
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-[13px] font-medium text-gray-800">
                      {department === "all" ? "All Departments" : department}
                    </span>
                    <span className="text-[12px] text-gray-400">—</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-[22px] border border-black/80 bg-white p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)]">
              <h3 className="mb-3 text-[15px] font-semibold text-gray-900">Visible Summary</h3>
              <div className="grid grid-cols-2 gap-3">
                {summaryLabels.map((label) => (
                  <div key={label} className="rounded-[16px] border border-gray-200 bg-gray-50 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                      {label}
                    </div>
                    <div className="mt-1 text-[1.35rem] font-semibold tracking-[-0.03em] text-gray-300">
                      —
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[22px] border border-black/80 bg-white p-4 shadow-[0_12px_32px_-24px_rgba(15,23,42,0.22)]">
              <h3 className="mb-3 text-[15px] font-semibold text-gray-900">Connection State</h3>
              <div className="rounded-[16px] border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-[12px] leading-5 text-slate-500">
                Workforce headcount, coverage, credential, and alert data will appear here after
                HR and scheduling system integration.
              </div>
            </section>
          </aside>

          <main className="min-w-0">
            <section className="rounded-[22px] border border-black/80 bg-white shadow-[0_12px_32px_-24px_rgba(15,23,42,0.25)]">
              <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-[15px] font-semibold text-gray-900">
                    {selectedDepartment === "all" ? "Workforce Directory" : selectedDepartment}
                  </h3>
                  <p className="mt-1 text-[12px] text-gray-500">
                    {searchTerm
                      ? `Filtered by search: "${searchTerm}"`
                      : "This table is a placeholder shell until workforce feeds are connected."}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search people or roles..."
                      className="rounded-full border border-gray-300 py-2 pl-9 pr-4 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <select
                    value={selectedDepartment}
                    onChange={(event) => {
                      setSelectedDepartment(event.target.value);
                      setPage(1);
                    }}
                    className="rounded-full border border-gray-300 px-4 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {departments.map((department) => (
                      <option key={department} value={department}>
                        {department === "all" ? "All Departments" : department}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      {["Record", "Role", "Level", "Department", "Status", "Hours", "PTO", "Score"].map(
                        (header) => (
                          <th
                            key={header}
                            className="px-4 py-2.5 text-left text-[12px] font-semibold text-gray-700"
                          >
                            {header}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {placeholderRows.map((row) => (
                      <tr key={row.id} className="border-b border-gray-100">
                        <td className="px-4 py-3 text-[13px] font-medium text-gray-900">{row.label}</td>
                        <td className="px-4 py-3 text-[13px] text-gray-400">—</td>
                        <td className="px-4 py-3 text-[13px] text-gray-400">—</td>
                        <td className="px-4 py-3 text-[13px] text-gray-400">—</td>
                        <td className="px-4 py-3 text-[13px] text-gray-400">—</td>
                        <td className="px-4 py-3 text-[13px] text-gray-400">—</td>
                        <td className="px-4 py-3 text-[13px] text-gray-400">—</td>
                        <td className="px-4 py-3 text-[13px] text-gray-400">—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
                <div className="text-[12px] text-gray-500">Page {page} of 1</div>
                <div className="flex items-center gap-2">
                  <button
                    disabled
                    className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-400"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Previous
                  </button>
                  <button
                    disabled
                    className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-400"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
