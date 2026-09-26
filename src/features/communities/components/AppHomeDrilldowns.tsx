import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type {
  CommunityIncidentDetailRecord,
  LiveCommunityResidentRecord
} from "../../../shared/api/platformData";
import { IncidentDetailListModule } from "../../../shared/modules/IncidentDetailListModule";
import {
  IncidentReportModal,
  incidentListItemFromCommunityRecord,
  incidentReportFromCommunityRecord
} from "../../../shared/incidents/IncidentReportModal";

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function getPercentWidth(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(Math.min(value, 100), 0);
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[#ddd4c8] bg-white/72 px-3 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7c664c]">{label}</div>
      <div className="mt-1.5 text-[20px] font-semibold tracking-[-0.04em] text-[#201a14]">{value}</div>
    </div>
  );
}

function ReportingDrilldownShell({
  eyebrow,
  title,
  subtitle,
  children,
  onClose
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#201a14]/28 px-4 py-6 backdrop-blur-[5px]">
      <button type="button" aria-label="Close drilldown" className="absolute inset-0" onClick={onClose} />
      <div
        className="relative z-10 flex max-h-[min(860px,90vh)] w-full max-w-[1080px] flex-col overflow-hidden border border-[#111111] bg-white shadow-[0_28px_72px_-44px_rgba(0,0,0,0.32)]"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} detail`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#ddd4c8] px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7c664c]">{eyebrow}</div>
            <div className="mt-1 text-[24px] font-semibold tracking-[-0.03em] text-[#201a14]">{title}</div>
            <div className="mt-1 max-w-[72ch] text-[13px] leading-6 text-[#736657]">{subtitle}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drilldown"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-[#d9d9d9] bg-white text-[#595959] transition-colors hover:border-[#0f8b73] hover:text-[#0f8b73]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export function MedicationComplianceDrilldownModal({
  open,
  facilityName,
  latestMonthLabel,
  latestRow,
  series,
  onClose
}: {
  open: boolean;
  facilityName: string;
  latestMonthLabel: string;
  latestRow: {
    total_scheduled: number;
    given: number;
    not_given: number;
    compliance_pct: number;
  } | null;
  series: Array<{ monthLabel: string; compliancePct: number; totalScheduled: number; notGiven: number }>;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <ReportingDrilldownShell
      eyebrow="Medication Watch"
      title={`${facilityName} Compliance Detail`}
      subtitle="This view stays inside medication reporting and uses the real compliance rows already loaded in the reporting snapshot."
      onClose={onClose}
    >
      <div className="grid gap-3 md:grid-cols-4">
        <DetailStat label="Reporting Month" value={latestMonthLabel} />
        <DetailStat label="Compliance" value={latestRow ? formatPercent(latestRow.compliance_pct) : "—"} />
        <DetailStat label="Scheduled" value={latestRow ? formatNumber(latestRow.total_scheduled) : "—"} />
        <DetailStat label="Not Given" value={latestRow ? formatNumber(latestRow.not_given) : "—"} />
      </div>

      <div className="mt-4 rounded-[22px] border border-[#ddd4c8] bg-white/70 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7c664c]">
          Six-month compliance history
        </div>
        <div className="mt-3 space-y-2">
          {series.map((row) => (
            <div key={row.monthLabel} className="rounded-[18px] border border-[#e4dbcf] bg-[#fffdfa] px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7c664c]">
                    {row.monthLabel}
                  </div>
                  <div className="mt-1 text-[18px] font-semibold tracking-[-0.03em] text-[#201a14]">
                    {formatPercent(row.compliancePct)}
                  </div>
                </div>
                <div className="text-right text-[12px] leading-6 text-[#736657]">
                  <div>Scheduled {formatNumber(row.totalScheduled)}</div>
                  <div>Not given {formatNumber(row.notGiven)}</div>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ece5db]">
                <div
                  className="h-full rounded-full bg-[#0f8b73]"
                  style={{ width: `${getPercentWidth(row.compliancePct)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </ReportingDrilldownShell>
  );
}

export function IncidentCategoryDrilldownModal({
  category,
  monthLabel,
  rows,
  residentLookup,
  onClose,
  onSelectResident
}: {
  category: string | null;
  monthLabel: string;
  rows: CommunityIncidentDetailRecord[];
  residentLookup: Map<string, LiveCommunityResidentRecord>;
  onClose: () => void;
  onSelectResident: (resident: LiveCommunityResidentRecord) => void;
}) {
  const [selectedIncident, setSelectedIncident] = useState<CommunityIncidentDetailRecord | null>(null);

  useEffect(() => {
    setSelectedIncident(null);
  }, [category, monthLabel]);

  if (!category) return null;

  return (
    <>
    <ReportingDrilldownShell
      eyebrow="Incident Category"
      title={category}
      subtitle={`${formatNumber(rows.length)} incident${rows.length === 1 ? "" : "s"} in ${monthLabel}. Open an event for its complete loaded report or select a resident to continue to the profile.`}
      onClose={onClose}
    >
      <IncidentDetailListModule
        rows={rows.map(incidentListItemFromCommunityRecord)}
        onSelect={(row) => {
          setSelectedIncident(rows.find((incident) => incident.id === row.id) ?? null);
        }}
        onSelectResident={(row) => {
          const resident = row.residentId ? residentLookup.get(row.residentId) : undefined;
          if (resident) onSelectResident(resident);
        }}
        emptyLabel="The category total exists, but matching incident reports are not loaded for this month."
      />
    </ReportingDrilldownShell>
    <IncidentReportModal
      incident={selectedIncident ? incidentReportFromCommunityRecord(selectedIncident) : null}
      onClose={() => setSelectedIncident(null)}
      onSelectResident={(incident) => {
        const resident = incident.residentId ? residentLookup.get(incident.residentId) : undefined;
        if (resident) {
          setSelectedIncident(null);
          onSelectResident(resident);
        }
      }}
    />
    </>
  );
}

export function DiagnosisDrilldownModal({
  diagnosis,
  residents,
  onClose,
  onSelectResident
}: {
  diagnosis: string | null;
  residents: LiveCommunityResidentRecord[];
  onClose: () => void;
  onSelectResident: (resident: LiveCommunityResidentRecord) => void;
}) {
  if (!diagnosis) return null;

  return (
    <ReportingDrilldownShell
      eyebrow="Diagnosis Drilldown"
      title={diagnosis}
      subtitle={`${formatNumber(residents.length)} resident${residents.length === 1 ? "" : "s"} in the current live roster`}
      onClose={onClose}
    >
      <div className="space-y-2">
        {residents.map((resident) => (
          <button
            key={`${resident.facility_id}-${resident.res_number}`}
            type="button"
            onClick={() => onSelectResident(resident)}
            className="flex w-full items-center justify-between gap-4 rounded-[18px] border border-[#e4dbcf] bg-[#fffdfa] px-4 py-3 text-left transition-colors hover:bg-white"
          >
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-[#201a14]">
                {resident.first_name} {resident.last_name}
              </div>
              <div className="mt-1 text-[12px] text-[#736657]">
                {resident.facility_name} · Unit {resident.unit_number ?? "—"} · LOS {formatNumber(resident.los_days)} days
              </div>
            </div>
            <div className="shrink-0 text-right text-[11px] text-[#8b7b68]">
              Resident {resident.res_number}
            </div>
          </button>
        ))}
      </div>
    </ReportingDrilldownShell>
  );
}
