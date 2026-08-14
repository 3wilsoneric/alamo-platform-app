import {
  ArrowLeft,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Search,
  UserRound
} from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { fetchDataExplorer } from "../../../shared/api/platformData";
import { downloadTextFile } from "../../../shared/files/browserDownload";
import type { DataExplorerKind, DataExplorerResponse } from "../../../shared/types/platformSnapshot";
import { formatDisplayDate, parseDisplayDate } from "../../../../shared/display-date.mjs";
import { formatMonthLabel } from "../../../../shared/period-utils.mjs";
import { toCsvCell, toSpreadsheetText } from "../../../../shared/csv.mjs";

const VALID_KINDS = new Set<DataExplorerKind>(["incidents", "census", "residents"]);
const PAGE_SIZE = 100;

type ExplorerRow = DataExplorerResponse["rows"][number];

function normalizeKind(value: string | undefined): DataExplorerKind {
  return VALID_KINDS.has(value as DataExplorerKind) ? value as DataExplorerKind : "incidents";
}

function displayValue(value: unknown) {
  if (value == null || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function rowValue(row: ExplorerRow, key: string) {
  return displayValue(row[key]);
}

function rowKey(row: ExplorerRow, index: number) {
  return String(row.id ?? `${row.community_name ?? "row"}-${row.month_bucket ?? ""}-${row.incident_date ?? ""}-${index}`);
}

function rowsToCsv(columns: DataExplorerResponse["columns"], rows: DataExplorerResponse["rows"]) {
  return [
    columns.map((column) => toCsvCell(column.label)).join(","),
    ...rows.map((row) => columns.map((column) => toCsvCell(row[column.key])).join(","))
  ].join("\n");
}

function rowsToExcelHtml(columns: DataExplorerResponse["columns"], rows: DataExplorerResponse["rows"], title: string) {
  const escapeHtml = (value: unknown) => {
    const displayText = displayValue(value);
    const safeText = typeof value === "string" ? toSpreadsheetText(value) : displayText;
    return String(safeText)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  };
  return [
    "<html><head><meta charset=\"utf-8\" /></head><body>",
    `<table><caption>${escapeHtml(title)}</caption><thead><tr>`,
    ...columns.map((column) => `<th>${escapeHtml(column.label)}</th>`),
    "</tr></thead><tbody>",
    ...rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join("")}</tr>`),
    "</tbody></table></body></html>"
  ].join("");
}

function makeFileSlug(parts: Array<string | null | undefined>) {
  return parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "data-explorer";
}

function formatNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-US").format(number) : displayValue(value);
}

function uniqueSorted(values: unknown[]) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function topCounts(rows: ExplorerRow[], key: string, limit = 5) {
  const counts = rows.reduce((acc, row) => {
    const value = String(row[key] ?? "").trim();
    if (!value) return acc;
    acc.set(value, (acc.get(value) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit);
}

function titleCaseKind(kind: DataExplorerKind) {
  if (kind === "residents") return "resident";
  return kind;
}

const formatMonthBucket = (value: unknown) => formatMonthLabel(String(value ?? ""), { fallback: "-" });

function getExplorerDataThroughLabel(payload: DataExplorerResponse | null) {
  const latestMonth = payload?.filters.months.slice().sort().at(-1);
  return latestMonth ? `Data through ${formatMonthLabel(latestMonth, { fallback: "the latest reporting month" })}` : "";
}

function getExplorerSummaryCards(kind: DataExplorerKind, rows: ExplorerRow[], loadedRows: number) {
  const communities = new Set(rows.map((row) => String(row.community_name ?? "").trim()).filter(Boolean));
  const months = uniqueSorted(rows.map((row) => row.month_bucket));

  if (kind === "incidents") {
    const residents = new Set(rows.map((row) => String(row.resident_name ?? row.client_name ?? "").trim()).filter(Boolean));
    const categories = new Set(rows.map((row) => String(row.category ?? "").trim()).filter(Boolean));
    const latestDate = rows
      .map((row) => String(row.incident_date ?? row.received_at ?? "").trim())
      .filter(Boolean)
      .map((value) => ({ timestamp: parseDisplayDate(value)?.getTime() ?? Number.NaN, value }))
      .filter((item) => Number.isFinite(item.timestamp))
      .sort((left, right) => left.timestamp - right.timestamp)
      .at(-1)?.value;

    return [
      { label: "Records", value: rows.length.toLocaleString(), detail: `${loadedRows.toLocaleString()} loaded` },
      { label: "Residents", value: residents.size.toLocaleString(), detail: "matched names" },
      { label: "Categories", value: categories.size.toLocaleString(), detail: `${communities.size.toLocaleString()} communities` },
      { label: "Latest date", value: latestDate ? formatDisplayDate(latestDate, { fallback: "-" }) : "-", detail: months.at(-1) ? formatMonthBucket(months.at(-1)) : "No period" }
    ];
  }

  if (kind === "residents") {
    const averageLos = rows.length
      ? rows.reduce((total, row) => total + Number(row.los_days || 0), 0) / rows.length
      : 0;
    const diagnoses = new Set(rows.map((row) => String(row.primary_diagnosis ?? "").trim()).filter(Boolean));

    return [
      { label: "Residents", value: rows.length.toLocaleString(), detail: `${loadedRows.toLocaleString()} loaded` },
      { label: "Communities", value: communities.size.toLocaleString(), detail: "current roster" },
      { label: "Avg LOS", value: rows.length ? `${Math.round(averageLos).toLocaleString()} days` : "-", detail: "filtered residents" },
      { label: "Diagnoses", value: diagnoses.size.toLocaleString(), detail: "shown in results" }
    ];
  }

  const latestMonth = months.at(-1);
  const latestRows = latestMonth ? rows.filter((row) => row.month_bucket === latestMonth) : [];
  const latestTotal = latestRows.reduce((total, row) => total + Number(row.census || 0), 0);

  return [
    { label: "Records", value: rows.length.toLocaleString(), detail: `${loadedRows.toLocaleString()} loaded` },
    { label: "Communities", value: communities.size.toLocaleString(), detail: "filtered data" },
    { label: "Periods", value: months.length.toLocaleString(), detail: months.length ? `${formatMonthBucket(months.at(0))} to ${formatMonthBucket(months.at(-1))}` : "No period" },
    { label: "Latest total", value: latestMonth ? latestTotal.toLocaleString() : "-", detail: latestMonth ? formatMonthBucket(latestMonth) : "No latest month" }
  ];
}

function matchesSelected(value: unknown, selected: string) {
  return selected === "all" || String(value ?? "") === selected;
}

function getPromptUrl(prompt: string) {
  return `/questions?prompt=${encodeURIComponent(prompt)}`;
}

function FacetChip({
  active,
  count,
  label,
  onClick
}: {
  active: boolean;
  count?: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition-colors ${
        active
          ? "border-[#0f8b73] bg-[#eef8f5] text-[#0f6f5d]"
          : "border-[#ddd4c8] bg-white/76 text-[#6f6253] hover:bg-[#f7efe3]"
      }`}
    >
      <span>{label}</span>
      {count != null ? <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px]">{count.toLocaleString()}</span> : null}
    </button>
  );
}

function DetailField({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9a8b78]">{label}</div>
      <div className="mt-1 text-[14px] font-semibold text-[#201a14]">{displayValue(value)}</div>
    </div>
  );
}

function CensusPreview({ rows }: { rows: ExplorerRow[] }) {
  const series = useMemo(() => {
    const byMonth = rows.reduce((acc, row) => {
      const month = String(row.month_bucket ?? "");
      if (!month) return acc;
      acc.set(month, (acc.get(month) ?? 0) + Number(row.census || 0));
      return acc;
    }, new Map<string, number>());
    return [...byMonth.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .slice(-12);
  }, [rows]);
  const max = Math.max(1, ...series.map(([, value]) => value));

  if (!series.length) return null;

  return (
    <div className="rounded-[30px] border border-[#ddd4c8] bg-[#fffdfa]/88 p-5 shadow-[0_24px_62px_-48px_rgba(91,74,54,0.28)]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#9a8b78]">Trend preview</div>
          <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.04em] text-[#201a14]">Monthly census total</h2>
        </div>
        <div className="text-[12px] font-semibold text-[#736657]">Filtered data only</div>
      </div>
      <div className="mt-5 grid gap-2">
        {series.map(([monthLabel, value]) => (
          <div key={monthLabel} className="grid grid-cols-[88px_1fr_70px] items-center gap-3">
            <div className="text-[12px] font-bold text-[#6f6253]">{formatMonthBucket(monthLabel)}</div>
            <div className="h-3 overflow-hidden rounded-full bg-[#ede4d8]">
              <div className="h-full rounded-full bg-[#7f93ff]" style={{ width: `${Math.max(3, (value / max) * 100)}%` }} />
            </div>
            <div className="text-right text-[13px] font-bold tabular-nums text-[#201a14]">{value.toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResidentPreview({
  row,
  onSurfaceProfile
}: {
  row: ExplorerRow | null;
  onSurfaceProfile: (residentName: string) => void;
}) {
  if (!row) {
    return (
      <div className="rounded-[30px] border border-dashed border-[#ddd4c8] bg-[#fffdfa]/62 p-5 text-[14px] font-medium text-[#736657]">
        Select a resident to preview the profile fields here, then surface the full profile back into chat if needed.
      </div>
    );
  }

  const residentName = rowValue(row, "resident_name");

  return (
    <div className="rounded-[30px] border border-[#ddd4c8] bg-[#fffdfa]/88 p-5 shadow-[0_24px_62px_-48px_rgba(91,74,54,0.28)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#eef7ef] text-[#147a4b]">
            <UserRound className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[12px] font-bold uppercase tracking-[0.18em] text-[#9a8b78]">Resident preview</div>
            <h2 className="mt-1 text-[26px] font-semibold tracking-[-0.05em] text-[#201a14]">{residentName}</h2>
            <p className="mt-1 text-[14px] text-[#736657]">{rowValue(row, "community_name")} · Unit {rowValue(row, "unit")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onSurfaceProfile(residentName)}
          data-dark-action="true"
          className="inline-flex items-center justify-center rounded-full bg-[#18110a] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#3b3025]"
        >
          Surface profile in chat
        </button>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DetailField label="Resident #" value={row.id} />
        <DetailField label="Age" value={row.age} />
        <DetailField label="LOS days" value={row.los_days} />
        <DetailField label="Admit date" value={row.admit_date} />
        <DetailField label="Diagnosis" value={row.primary_diagnosis} />
        <DetailField label="Care level" value={row.care_level} />
        <DetailField label="Payor" value={row.payor} />
        <DetailField label="Physician" value={row.physician} />
      </div>
    </div>
  );
}

export default function DataExplorerPage() {
  const { kind: kindParam } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const kind = normalizeKind(kindParam);
  const [payload, setPayload] = useState<DataExplorerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [community, setCommunity] = useState(searchParams.get("community") ?? "all");
  const [month, setMonth] = useState(searchParams.get("period") ?? searchParams.get("month") ?? "all");
  const [category, setCategory] = useState(searchParams.get("category") ?? "all");
  const [diagnosis, setDiagnosis] = useState(searchParams.get("diagnosis") ?? "all");
  const [unit, setUnit] = useState(searchParams.get("unit") ?? "all");
  const [page, setPage] = useState(0);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchDataExplorer(kind, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setPayload(data);
        setLoading(false);
      })
      .catch((nextError) => {
        if (controller.signal.aborted) return;
        console.warn("Data explorer records failed to load.", nextError);
        setError("These records could not be loaded. Refresh the page and try again.");
        setLoading(false);
      });

    return () => controller.abort();
  }, [kind]);

  useEffect(() => {
    setPage(0);
    setExpandedRowId(null);
    const nextParams = new URLSearchParams();
    if (query.trim()) nextParams.set("q", query.trim());
    if (community !== "all") nextParams.set("community", community);
    if (month !== "all") nextParams.set("period", month);
    if (category !== "all") nextParams.set("category", category);
    if (diagnosis !== "all") nextParams.set("diagnosis", diagnosis);
    if (unit !== "all") nextParams.set("unit", unit);
    setSearchParams(nextParams, { replace: true });
  }, [category, community, diagnosis, month, query, setSearchParams, unit]);

  const residentFilterOptions = useMemo(() => ({
    diagnoses: uniqueSorted((payload?.rows ?? []).map((row) => row.primary_diagnosis)),
    units: uniqueSorted((payload?.rows ?? []).map((row) => row.unit))
  }), [payload?.rows]);

  const filteredRows = useMemo(() => {
    if (!payload) return [];
    const normalizedQuery = query.trim().toLowerCase();
    const selectedMonths = month === "all" ? [] : month.split(",").map((value) => value.trim()).filter(Boolean);

    return payload.rows.filter((row) => {
      if (!matchesSelected(row.community_name, community) && !matchesSelected(row.facility_id, community)) return false;
      if (kind === "incidents" && !matchesSelected(row.category, category)) return false;
      if (kind === "residents" && !matchesSelected(row.primary_diagnosis, diagnosis)) return false;
      if (kind === "residents" && !matchesSelected(row.unit, unit)) return false;
      if (selectedMonths.length && !selectedMonths.includes(String(row.month_bucket ?? ""))) return false;
      if (!normalizedQuery) return true;
      return Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery));
    });
  }, [category, community, diagnosis, kind, month, payload, query, unit]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleRows = filteredRows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const expandedRow = filteredRows.find((row, index) => rowKey(row, index) === expandedRowId) ?? null;
  const activeTitle = payload?.title ?? "Data Explorer";
  const activeKindLabel = titleCaseKind(kind);
  const slug = makeFileSlug([
    kind,
    community === "all" ? "portfolio" : community,
    month === "all" ? "all-periods" : month,
    category === "all" ? null : category,
    diagnosis === "all" ? null : diagnosis,
    unit === "all" ? null : unit
  ]);
  const categoryFacets = useMemo(() => topCounts(filteredRows, "category", 6), [filteredRows]);
  const communityFacets = useMemo(() => topCounts(filteredRows, "community_name", 6), [filteredRows]);
  const monthFacets = useMemo(() => topCounts(filteredRows, "month_bucket", 6), [filteredRows]);
  const summaryCards = useMemo(
    () => getExplorerSummaryCards(kind, filteredRows, payload?.row_count ?? 0),
    [filteredRows, kind, payload?.row_count]
  );
  const exportedRowsLabel = `${filteredRows.length.toLocaleString()} filtered ${activeKindLabel} record${filteredRows.length === 1 ? "" : "s"}`;

  const exportCsv = () => {
    if (!payload) return;
    downloadTextFile(`${slug}.csv`, rowsToCsv(payload.columns, filteredRows), "text/csv;charset=utf-8");
  };

  const exportExcel = () => {
    if (!payload) return;
    downloadTextFile(`${slug}.xls`, rowsToExcelHtml(payload.columns, filteredRows, activeTitle), "application/vnd.ms-excel;charset=utf-8");
  };

  const surfacePrompt = (prompt: string) => {
    window.location.assign(getPromptUrl(prompt));
  };

  const toggleRow = (row: ExplorerRow, index: number) => {
    const key = rowKey(row, index);
    setExpandedRowId((current) => current === key ? null : key);
  };

  return (
    <section
      data-explorer-kind={kind}
      data-explorer-status={loading ? "loading" : error ? "error" : "ready"}
      className="mx-auto w-full max-w-[1360px] space-y-4 pb-10 pt-2"
    >
      <div className="rounded-[28px] border border-[#ddd4c8] bg-[#fffdfa]/88 p-4 shadow-[0_24px_62px_-46px_rgba(91,74,54,0.3)] sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (window.history.length > 1) {
                  window.history.back();
                  return;
                }
                window.location.assign("/home");
              }}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-[#ddd4c8] bg-white/78 px-3 text-[11px] font-bold uppercase tracking-[0.13em] text-[#6f6253] transition-colors hover:bg-[#f7efe3]"
              aria-label="Go back"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-[24px] font-semibold tracking-[-0.05em] text-[#201a14] sm:text-[30px]">
                {activeTitle}
              </h1>
              <div className="mt-0.5 truncate text-[12px] font-medium text-[#736657]">
                {filteredRows.length.toLocaleString()} filtered of {(payload?.row_count ?? 0).toLocaleString()} loaded records
                {getExplorerDataThroughLabel(payload) ? ` · ${getExplorerDataThroughLabel(payload)}` : ""}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={exportCsv} disabled={!payload || filteredRows.length === 0} data-dark-action="true" className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#18110a] px-4 text-[11px] font-bold uppercase tracking-[0.13em] text-white transition-colors hover:bg-[#3b3025] disabled:cursor-not-allowed disabled:opacity-35">
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
            <button type="button" onClick={exportExcel} disabled={!payload || filteredRows.length === 0} className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#ddd4c8] bg-white/80 px-4 text-[11px] font-bold uppercase tracking-[0.13em] text-[#3e3429] transition-colors hover:bg-[#f7efe3] disabled:cursor-not-allowed disabled:opacity-35">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Excel
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(280px,1.2fr)_220px_180px_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a8b78]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={kind === "incidents" ? "Search resident, category, description, staff..." : kind === "residents" ? "Search resident, unit, diagnosis, physician..." : "Search communities or months..."}
              aria-label="Search records"
              className="h-[52px] w-full rounded-[18px] border border-[#ddd4c8] bg-white/88 pl-11 pr-4 text-[14px] font-medium text-[#201a14] outline-none transition-colors placeholder:text-[#a79986] focus:border-[#8ea2ff]"
            />
          </label>
          <select value={community} onChange={(event) => setCommunity(event.target.value)} aria-label="Filter by community" className="h-[52px] rounded-[18px] border border-[#ddd4c8] bg-white/88 px-4 text-[13px] font-semibold text-[#3e3429] outline-none focus:border-[#8ea2ff]">
            <option value="all">All communities</option>
            {payload?.filters.communities.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <select value={month} onChange={(event) => setMonth(event.target.value)} aria-label="Filter by month" className="h-[52px] rounded-[18px] border border-[#ddd4c8] bg-white/88 px-4 text-[13px] font-semibold text-[#3e3429] outline-none focus:border-[#8ea2ff]">
            {month.includes(",") ? <option value={month}>Selected months</option> : null}
            <option value="all">All months</option>
            {payload?.filters.months.map((monthOption) => <option key={monthOption} value={monthOption}>{formatMonthBucket(monthOption)}</option>)}
          </select>
          {kind === "incidents" ? (
            <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by incident category" className="h-[52px] rounded-[18px] border border-[#ddd4c8] bg-white/88 px-4 text-[13px] font-semibold text-[#3e3429] outline-none focus:border-[#8ea2ff]">
              <option value="all">All categories</option>
              {payload?.filters.categories.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          ) : kind === "residents" ? (
            <select value={diagnosis} onChange={(event) => setDiagnosis(event.target.value)} aria-label="Filter by diagnosis" className="h-[52px] rounded-[18px] border border-[#ddd4c8] bg-white/88 px-4 text-[13px] font-semibold text-[#3e3429] outline-none focus:border-[#8ea2ff]">
              <option value="all">All diagnoses</option>
              {residentFilterOptions.diagnoses.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          ) : (
            <div />
          )}
        </div>

        {kind === "residents" ? (
          <div className="mt-3 max-w-[220px]">
            <select value={unit} onChange={(event) => setUnit(event.target.value)} aria-label="Filter by unit" className="h-[48px] w-full rounded-[18px] border border-[#ddd4c8] bg-white/88 px-4 text-[13px] font-semibold text-[#3e3429] outline-none focus:border-[#8ea2ff]">
              <option value="all">All units</option>
              {residentFilterOptions.units.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
        ) : null}

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div key={card.label} className="rounded-[18px] bg-[#f7f0e7]/72 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(221,212,200,0.52)]">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9a8b78]">{card.label}</div>
              <div className="mt-1 text-[20px] font-semibold tracking-[-0.04em] text-[#201a14]">{card.value}</div>
              <div className="mt-0.5 truncate text-[12px] font-medium text-[#736657]">{card.detail}</div>
            </div>
          ))}
        </div>
      </div>

      {kind === "incidents" ? (
        <details className="rounded-[24px] border border-[#ddd4c8] bg-[#fffdfa]/78 px-4 py-3 shadow-[0_18px_44px_-42px_rgba(91,74,54,0.22)]">
          <summary className="cursor-pointer list-none text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b7b68] marker:hidden">
            Quick filters
            <span className="ml-2 text-[11px] font-semibold normal-case tracking-normal text-[#736657]">
              top categories, communities, and periods
            </span>
          </summary>
          <div className="mt-3 flex flex-wrap gap-2">
            <FacetChip active={category === "all"} label="All categories" count={filteredRows.length} onClick={() => setCategory("all")} />
            {categoryFacets.map(([name, count]) => <FacetChip key={name} active={category === name} label={name} count={count} onClick={() => setCategory(name)} />)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <FacetChip active={community === "all"} label="All communities" onClick={() => setCommunity("all")} />
            {communityFacets.map(([name, count]) => <FacetChip key={name} active={community === name} label={name} count={count} onClick={() => setCommunity(name)} />)}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <FacetChip active={month === "all"} label="All months" onClick={() => setMonth("all")} />
            {monthFacets.map(([name, count]) => <FacetChip key={name} active={month === name} label={formatMonthBucket(name)} count={count} onClick={() => setMonth(name)} />)}
          </div>
        </details>
      ) : null}

      {kind === "residents" ? (
        <ResidentPreview row={expandedRow ?? visibleRows[0] ?? null} onSurfaceProfile={(residentName) => surfacePrompt(`show ${residentName} resident profile`)} />
      ) : null}

      {kind === "census" ? <CensusPreview rows={filteredRows} /> : null}

      <div className="overflow-hidden rounded-[28px] border border-[#ddd4c8] bg-[#fffdfa]/88 shadow-[0_22px_58px_-46px_rgba(91,74,54,0.26)]">
        <div className="flex flex-col gap-2 border-b border-[#eee6da] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[13px] font-medium text-[#736657]">
            Showing <span className="font-semibold text-[#201a14]">{visibleRows.length.toLocaleString()}</span> of {exportedRowsLabel}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={safePage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="rounded-full border border-[#ddd4c8] bg-white/78 px-3 py-1.5 text-[11px] font-semibold text-[#6f6253] disabled:opacity-35">
              Previous
            </button>
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9a8b78]">
              Page {safePage + 1} / {pageCount}
            </span>
            <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} className="rounded-full border border-[#ddd4c8] bg-white/78 px-3 py-1.5 text-[11px] font-semibold text-[#6f6253] disabled:opacity-35">
              Next
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center text-[14px] font-medium text-[#736657]">Loading governed records...</div>
        ) : error ? (
          <div className="flex min-h-[360px] items-center justify-center px-6 text-center text-[14px] font-medium text-[#a04436]">{error}</div>
        ) : !visibleRows.length ? (
          <div className="flex min-h-[360px] items-center justify-center px-6 text-center text-[14px] font-medium text-[#736657]">No records match the current filters.</div>
        ) : (
          <div className="max-h-[68vh] overflow-auto [scrollbar-width:thin]">
            <table className="min-w-full border-collapse text-left text-[12px]">
              <thead className="sticky top-0 z-20">
                <tr className="bg-[#f5efe6] text-[10px] uppercase tracking-[0.13em] text-[#8b7b68]">
                  <th className="w-10 whitespace-nowrap border-b border-[#ddd4c8] px-3 py-3 font-bold" aria-label="Expand record" />
                  {payload?.columns.map((column, index) => (
                    <th key={column.key} className={`whitespace-nowrap border-b border-[#ddd4c8] px-4 py-3 font-bold ${index === 0 ? "sticky left-0 z-30 bg-[#f5efe6]" : ""} ${column.numeric ? "text-right" : "text-left"}`}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee6da]">
                {visibleRows.map((row, rowIndex) => {
                  const globalRowIndex = safePage * PAGE_SIZE + rowIndex;
                  const key = rowKey(row, globalRowIndex);
                  const expanded = expandedRowId === key;
                  return (
                    <Fragment key={key}>
                      <tr key={key} className={`${rowIndex % 2 ? "bg-[#fffaf3]" : "bg-white"} cursor-pointer transition-colors hover:bg-[#f7efe3]`} onClick={() => toggleRow(row, globalRowIndex)}>
                        <td className="px-3 py-3 align-top">
                          <ChevronDown className={`h-4 w-4 text-[#8b7b68] transition-transform ${expanded ? "rotate-180" : ""}`} />
                        </td>
                        {payload?.columns.map((column, columnIndex) => {
                          const value = rowValue(row, column.key);
                          const long = value.length > 90 || column.key === "description";
                          const isResidentLink = ["resident_name", "client_name"].includes(column.key) && value !== "-";
                          return (
                            <td key={`${key}-${column.key}`} className={`px-4 py-3 align-top ${columnIndex === 0 ? `sticky left-0 z-10 font-semibold text-[#201a14] ${rowIndex % 2 ? "bg-[#fffaf3]" : "bg-white"}` : column.numeric ? "whitespace-nowrap text-right tabular-nums text-[#3e3429]" : long ? "min-w-[360px] max-w-[760px] whitespace-normal leading-6 text-[#5f5346]" : "max-w-[280px] truncate whitespace-nowrap text-[#5f5346]"}`}>
                              {isResidentLink ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    surfacePrompt(`show ${value} resident profile`);
                                  }}
                                  className="font-semibold text-[#2e3f99] underline decoration-[#bcc6ff] underline-offset-4 hover:text-[#1d2b7a]"
                                >
                                  {value}
                                </button>
                              ) : (
                                value
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      {expanded ? (
                        <tr key={`${key}-detail`} className="bg-[#fbf6ee]">
                          <td />
                          <td colSpan={(payload?.columns.length ?? 1)} className="px-4 py-5">
                            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                {kind === "incidents" ? (
                                  <>
                                    <DetailField label="Incident ID" value={row.id} />
                                    <DetailField label="Date" value={row.incident_date} />
                                    <DetailField label="Resident" value={row.resident_name} />
                                    <DetailField label="Category" value={row.category} />
                                    <DetailField label="Location" value={row.location} />
                                    <DetailField label="Staff" value={row.staff_name} />
                                    <DetailField label="Injury" value={row.injury_occurred} />
                                    <DetailField label="Police" value={row.police_called} />
                                    <div className="sm:col-span-2 lg:col-span-4">
                                      <DetailField label="Description" value={row.description} />
                                    </div>
                                  </>
                                ) : kind === "residents" ? (
                                  <>
                                    <DetailField label="Resident #" value={row.id} />
                                    <DetailField label="Community" value={row.community_name} />
                                    <DetailField label="Unit" value={row.unit} />
                                    <DetailField label="Diagnosis" value={row.primary_diagnosis} />
                                    <DetailField label="Last incident" value={[row.last_incident_category, row.last_incident_date].filter(Boolean).join(" · ") || "-"} />
                                    <DetailField label="Care level" value={row.care_level} />
                                    <DetailField label="Payor" value={row.payor} />
                                    <DetailField label="Physician" value={row.physician} />
                                  </>
                                ) : (
                                  <>
                                    <DetailField label="Month" value={row.month_bucket} />
                                    <DetailField label="Community" value={row.community_name} />
                                    <DetailField label="Census" value={formatNumber(row.census)} />
                                  </>
                                )}
                              </div>
                              <div className="flex flex-wrap items-start gap-2 lg:w-[240px] lg:flex-col">
                                {row.resident_name ? (
                                  <button type="button" onClick={() => surfacePrompt(`show ${row.resident_name} resident profile`)} data-dark-action="true" className="rounded-full bg-[#18110a] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white">
                                    Surface profile
                                  </button>
                                ) : null}
                                {kind === "incidents" && row.resident_name ? (
                                  <button type="button" onClick={() => surfacePrompt(`show ${row.resident_name} incident history`)} className="rounded-full border border-[#ddd4c8] bg-white/76 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#3e3429]">
                                    Incident history
                                  </button>
                                ) : null}
                                {kind === "census" && row.community_name ? (
                                  <button type="button" onClick={() => surfacePrompt(`show ${row.community_name} census trend`)} data-dark-action="true" className="rounded-full bg-[#18110a] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white">
                                    Surface trend
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
