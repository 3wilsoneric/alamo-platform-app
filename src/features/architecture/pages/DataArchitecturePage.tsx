import type { LucideIcon } from "lucide-react";
import {
  ArrowDown,
  BadgeCheck,
  BookOpenCheck,
  Braces,
  Building2,
  ChartNoAxesCombined,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  Database,
  FileChartColumn,
  GitBranch,
  Layers3,
  LockKeyhole,
  Network,
  Printer,
  ScanSearch,
  Server,
  ShieldCheck,
  UserRoundSearch,
} from "lucide-react";

type Status = "live" | "integrating" | "needed";

interface SourceLane {
  status: Status;
  kicker: string;
  title: string;
  description: string;
  items: string[];
  note: string;
  icon: LucideIcon;
}

interface PipelineStep {
  number: string;
  verb: string;
  title: string;
  description: string;
  detail: string;
  icon: LucideIcon;
}

interface EtlPhase {
  letter: string;
  title: string;
  subtitle: string;
  description: string;
  actions: string[];
  output: string;
  icon: LucideIcon;
}

const STATUS_STYLES: Record<Status, { label: string; dot: string; badge: string; rule: string }> = {
  live: {
    label: "Live",
    dot: "bg-[#0f8b73]",
    badge: "border-[#0f8b73]/35 bg-[#effaf5] text-[#0b705f]",
    rule: "border-t-[#0f8b73]",
  },
  integrating: {
    label: "Integrating",
    dot: "bg-[#c77b16]",
    badge: "border-[#c77b16]/35 bg-[#fff7e8] text-[#8f570d]",
    rule: "border-t-[#c77b16]",
  },
  needed: {
    label: "Needed",
    dot: "bg-[#a04436]",
    badge: "border-[#a04436]/35 bg-[#fff2ef] text-[#8f382c]",
    rule: "border-t-[#a04436]",
  },
};

const SOURCE_LANES: SourceLane[] = [
  {
    status: "live",
    kicker: "Operational systems",
    title: "ElderMark + MAR",
    description:
      "The current operating record: residents, census, incidents, assessments, services, notes, payors, medication orders, and administrations.",
    items: [
      "Resident, unit, census, incident, diagnosis",
      "Assessment, service plan, notes, payer",
      "Medication orders, passes, refusals, PRN",
    ],
    note: "Date-partitioned ingestion is the governed starting point.",
    icon: Building2,
  },
  {
    status: "integrating",
    kicker: "Growth + intake",
    title: "Referral and intake tooling",
    description:
      "A future governed referral lane should connect inquiry and prospect activity to placement, admission, and conversion outcomes.",
    items: [
      "Referral source, date, owner, status",
      "Eligibility, placement decision, disposition",
      "Conversion, time-to-admit, lost-referral reason",
    ],
    note: "Inquiry and Prospect land in Silver today; referral KPIs are not yet published.",
    icon: GitBranch,
  },
  {
    status: "integrating",
    kicker: "Richer clinical context",
    title: "Enhanced client profiles",
    description:
      "New profile feeds can extend the current roster with assessments, care needs, history, and external outcomes once identity and provenance are governed.",
    items: [
      "Assessment history and repeated scores",
      "Prior utilization and care transitions",
      "Profile provenance, freshness, consent",
    ],
    note: "Assessment detail already has a live path when ElderMark supplies rows.",
    icon: UserRoundSearch,
  },
];

const PIPELINE_STEPS: PipelineStep[] = [
  {
    number: "01",
    verb: "Land",
    title: "Raw partitions",
    description: "Azure / Databricks",
    detail: "Immutable source extracts organized by business-date partition.",
    icon: Database,
  },
  {
    number: "02",
    verb: "Clean",
    title: "Silver tables",
    description: "Normalized records",
    detail: "Dates, identifiers, community names, history, and resident countability.",
    icon: Layers3,
  },
  {
    number: "03",
    verb: "Govern",
    title: "Gold views",
    description: "Defined metrics",
    detail: "Census, incidents, active roster, medications, and documentation.",
    icon: ShieldCheck,
  },
  {
    number: "04",
    verb: "Prepare",
    title: "Analyst views",
    description: "v_tool_* context",
    detail: "Repeatable joins, rollups, drilldowns, profiles, and assessment slices.",
    icon: Network,
  },
  {
    number: "05",
    verb: "Prove",
    title: "QA gates",
    description: "Publish blocker",
    detail: "Reconciliation, coverage, countability, freshness, and schema contracts.",
    icon: ClipboardCheck,
  },
  {
    number: "06",
    verb: "Publish",
    title: "Azure snapshot",
    description: "latest.json + dated",
    detail: "A fast, app-ready evidence package with a governed as-of date.",
    icon: Cloud,
  },
  {
    number: "07",
    verb: "Serve",
    title: "Vercel APIs",
    description: "Entra protected",
    detail: "Node endpoints read the snapshot; incidents may try live Databricks first.",
    icon: Server,
  },
  {
    number: "08",
    verb: "Use",
    title: "React platform",
    description: "Decisions + workflow",
    detail: "Community profiles, questions, incidents, reports, and data exploration.",
    icon: Braces,
  },
];

const ETL_PHASES: EtlPhase[] = [
  {
    letter: "E",
    title: "Extract",
    subtitle: "Bring source records in",
    description:
      "ElderMark, MAR, and future referral/profile systems export a business-date slice into Azure and Databricks without first changing its meaning.",
    actions: [
      "Collect each expected source feed",
      "Preserve original fields and source lineage",
      "Store a dated raw partition for recovery",
    ],
    output: "Output: traceable raw records",
    icon: Database,
  },
  {
    letter: "T",
    title: "Transform",
    subtitle: "Make the records consistent",
    description:
      "Databricks turns source-specific records into stable business data by applying explicit cleanup, history, identity, and metric rules.",
    actions: [
      "Standardize dates, IDs, communities, and names",
      "Resolve duplicates, history, and resident countability",
      "Build governed census, incident, MAR, and profile measures",
    ],
    output: "Output: Silver tables, Gold views, and analyst context",
    icon: Layers3,
  },
  {
    letter: "L",
    title: "Load + publish",
    subtitle: "Deliver approved evidence",
    description:
      "The prepared data is loaded into governed views, tested as one release, and packaged for the application only when the required quality gates pass.",
    actions: [
      "Reconcile totals, coverage, freshness, and schemas",
      "Block publication when a critical check fails",
      "Write versioned Azure snapshots for the APIs",
    ],
    output: "Output: fast, governed application data",
    icon: Cloud,
  },
];

const DEPTH_METRICS = [
  { value: "52", label: "census months", detail: "Holistic monthly history" },
  { value: "32", label: "medication months", detail: "MAR operating context" },
  { value: "7", label: "incident months", detail: "Complete monthly coverage" },
  { value: "Now", label: "resident profiles", detail: "Current governed roster" },
];

const OUTCOME_GAPS = [
  "Historical licensed and staffed capacity",
  "Complete admission and discharge episodes",
  "Referral source and payer continuity",
  "Discharge reason and destination",
  "Prior hospital and emergency-department use",
  "Repeated standardized assessment scores",
];

function StatusBadge({ status }: { status: Status }) {
  const style = STATUS_STYLES[status];

  return (
    <span
      className={`inline-flex items-center gap-2 border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {style.label}
    </span>
  );
}

function SourceCard({ lane }: { lane: SourceLane }) {
  const Icon = lane.icon;
  const statusStyle = STATUS_STYLES[lane.status];

  return (
    <article className={`border border-[#cfc8bd] border-t-4 bg-white p-5 ${statusStyle.rule}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#686158]">
            {lane.kicker}
          </p>
          <h3 className="mt-2 text-[24px] font-semibold leading-[1.04] text-[#17130f]">
            {lane.title}
          </h3>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center border border-[#cfc8bd] bg-[#f8f5ef]">
          <Icon className="h-5 w-5 text-[#315b54]" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-4">
        <StatusBadge status={lane.status} />
      </div>
      <p className="mt-4 text-[13px] leading-6 text-[#4d4841]">{lane.description}</p>
      <div className="mt-4 border-t border-[#ddd6cd] pt-3">
        {lane.items.map((item) => (
          <p key={item} className="flex gap-2 py-1 text-[12px] leading-5 text-[#28231e]">
            <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${statusStyle.dot}`} />
            {item}
          </p>
        ))}
      </div>
      <p className="mt-4 border-l-2 border-[#aaa196] pl-3 text-[11px] font-semibold leading-5 text-[#676057]">
        {lane.note}
      </p>
    </article>
  );
}

function PipelineCard({ step }: { step: PipelineStep }) {
  const Icon = step.icon;

  return (
    <article className="relative min-h-[210px] border border-[#bdb5aa] bg-white p-4">
      <div className="flex items-center justify-between gap-3 border-b border-[#ded8cf] pb-3">
        <span className="text-[11px] font-bold tracking-[0.2em] text-[#0f8b73]">
          {step.number} / {step.verb}
        </span>
        <Icon className="h-4 w-4 text-[#315b54]" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-[22px] font-semibold leading-none text-[#17130f]">{step.title}</h3>
      <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#6b645b]">
        {step.description}
      </p>
      <p className="mt-4 text-[12px] leading-5 text-[#4d4841]">{step.detail}</p>
      <span
        aria-hidden="true"
        className="absolute -bottom-1 left-4 h-2 w-10 bg-[#0f8b73]"
      />
    </article>
  );
}

function EtlPhaseCard({ phase }: { phase: EtlPhase }) {
  const Icon = phase.icon;

  return (
    <article className="grid border border-[#bdb5aa] bg-white sm:grid-cols-[78px_1fr]">
      <div className="flex min-h-20 items-center justify-center bg-[#173b34] text-[#fffdf8] sm:min-h-full">
        <span className="font-serif text-[52px] font-semibold leading-none">{phase.letter}</span>
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0f8b73]">
              {phase.subtitle}
            </p>
            <h3 className="mt-2 text-[25px] font-semibold leading-none text-[#17130f]">
              {phase.title}
            </h3>
          </div>
          <Icon className="h-5 w-5 shrink-0 text-[#315b54]" aria-hidden="true" />
        </div>
        <p className="mt-4 text-[12px] leading-5 text-[#4d4841]">{phase.description}</p>
        <div className="mt-4 border-y border-[#ded8cf] py-2">
          {phase.actions.map((action) => (
            <p key={action} className="flex gap-2 py-1 text-[11px] leading-5 text-[#28231e]">
              <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-[#0f8b73]" />
              {action}
            </p>
          ))}
        </div>
        <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.13em] text-[#676057]">
          {phase.output}
        </p>
      </div>
    </article>
  );
}

function FlowNode({
  icon: Icon,
  eyebrow,
  title,
  text,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="border border-[#c9c1b6] bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center bg-[#17130f] text-[#fffdf8]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#0f8b73]">
            {eyebrow}
          </p>
          <h4 className="mt-0.5 font-sans text-[14px] font-bold tracking-[-0.02em] text-[#17130f]">
            {title}
          </h4>
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-5 text-[#5a544c]">{text}</p>
    </div>
  );
}

function DownConnector({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center py-3 text-[#0f8b73]" aria-hidden="true">
      <span className="mb-1 text-[9px] font-bold uppercase tracking-[0.18em]">{label}</span>
      <span className="h-5 w-px bg-[#0f8b73]" />
      <ArrowDown className="-mt-1 h-4 w-4" />
    </div>
  );
}

export default function DataArchitecturePage() {
  return (
    <div
      data-data-architecture="true"
      className="mx-auto w-full max-w-[1432px] pb-12 text-[#17130f] print:max-w-none print:p-0"
    >
      <header
        className="relative overflow-hidden border-y-2 border-[#17130f] bg-[#f3efe7] px-5 py-8 sm:px-8 lg:px-12 lg:py-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(49,91,84,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(49,91,84,0.08) 1px, transparent 1px), radial-gradient(circle at 86% 20%, rgba(15,139,115,0.16), transparent 34%)",
          backgroundSize: "32px 32px, 32px 32px, auto",
        }}
      >
        <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[850px]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="bg-[#0f8b73] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.21em] text-[#fffdf8]">
                Alamo Platform
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#5b554d]">
                Data architecture / governed decision system
              </span>
            </div>
            <h1 className="mt-6 max-w-[800px] text-[42px] font-semibold leading-[0.95] tracking-[-0.055em] sm:text-[58px] lg:text-[70px]">
              From operational records to trusted action.
            </h1>
            <p className="mt-6 max-w-[760px] text-[15px] leading-7 text-[#454038] sm:text-[17px]">
              A full map of how resident, census, incident, medication, assessment, and
              emerging referral/profile data become governed answers, visualizations, and
              reports.
            </p>
          </div>

          <div className="flex max-w-[380px] flex-col gap-4 lg:items-end">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex w-fit items-center gap-2 border border-[#17130f] bg-white px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.15em] hover:bg-[#17130f] hover:text-[#fffdf8] print:hidden"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print / save PDF
            </button>
            <div className="flex flex-wrap gap-2 lg:justify-end" aria-label="Infographic status legend">
              <StatusBadge status="live" />
              <StatusBadge status="integrating" />
              <StatusBadge status="needed" />
            </div>
            <p className="text-[11px] leading-5 text-[#5a544c] lg:text-right">
              Status describes the governed platform path, not whether a source table merely
              exists.
            </p>
          </div>
        </div>
      </header>

      <div>
        <section className="border-b border-[#bdb5aa] px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
          <div className="grid gap-6 lg:grid-cols-[0.55fr_1.45fr]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.21em] text-[#0f8b73]">
                1 / Inputs
              </p>
              <h2 className="mt-3 text-[34px] font-semibold leading-[0.98] sm:text-[42px]">
                One governed chain. More than one source.
              </h2>
              <p className="mt-5 max-w-[430px] text-[13px] leading-6 text-[#595249]">
                Operational data is live. Referral/intake and enhanced profiles join through
                explicit integration contracts, not a side door into reports.
              </p>
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              {SOURCE_LANES.map((lane) => (
                <SourceCard key={lane.title} lane={lane} />
              ))}
            </div>
          </div>
        </section>

        <DownConnector label="Date-partitioned ingestion" />

        <section className="border-y-2 border-[#17130f] bg-[#f5f3ee] px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.21em] text-[#0f8b73]">
                2 / Governed pipeline
              </p>
              <h2 className="mt-3 text-[34px] font-semibold leading-none sm:text-[42px]">
                The publication spine
              </h2>
            </div>
            <p className="max-w-[570px] text-[12px] leading-6 text-[#595249] lg:text-right">
              Every layer narrows ambiguity. Data is cleaned before it is governed, governed
              before it is analyzed, and proven before the application can serve it.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {PIPELINE_STEPS.map((step) => (
              <PipelineCard key={step.number} step={step} />
            ))}
          </div>

          <div className="mt-10 border-t-2 border-[#17130f] pt-7">
            <div className="grid gap-5 lg:grid-cols-[0.48fr_1.52fr] lg:items-end">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.21em] text-[#0f8b73]">
                  ETL / In broad terms
                </p>
                <h3 className="mt-3 text-[29px] font-semibold leading-none sm:text-[34px]">
                  Take it in. Make it reliable. Deliver it safely.
                </h3>
              </div>
              <p className="max-w-[760px] text-[12px] leading-6 text-[#595249] lg:justify-self-end lg:text-right">
                ETL is the repeatable process that moves operational records into an
                application-ready form. The heavy work runs once for the business-date
                partition in Databricks; the platform then serves the approved result instead
                of recalculating every screen.
              </p>
            </div>

            <div className="mt-6 grid gap-3 xl:grid-cols-3">
              {ETL_PHASES.map((phase) => (
                <EtlPhaseCard key={phase.letter} phase={phase} />
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#17130f] px-5 py-7 text-[#fffdf8] sm:px-8 lg:px-12">
          <div className="grid gap-6 lg:grid-cols-[0.55fr_1.45fr] lg:items-center">
            <div className="flex items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center border border-[#625b53]">
                <LockKeyhole className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#75d4bd]">
                  Hard publication gate
                </p>
                <h2 className="mt-2 text-[28px] font-semibold leading-none text-[#fffdf8]">
                  Bad data does not quietly ship.
                </h2>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="border border-[#4d4741] p-4">
                <p className="flex items-center gap-2 text-[12px] font-bold">
                  <BadgeCheck className="h-4 w-4 text-[#75d4bd]" />
                  Analyst-context QA
                </p>
                <p className="mt-2 text-[11px] leading-5 text-[#d5cec5]">
                  Manifest, slice coverage, resident and incident reconciliation, medication
                  quality, and schema contracts.
                </p>
              </div>
              <div className="border border-[#4d4741] p-4">
                <p className="flex items-center gap-2 text-[12px] font-bold">
                  <BadgeCheck className="h-4 w-4 text-[#75d4bd]" />
                  Census quality audit
                </p>
                <p className="mt-2 text-[11px] leading-5 text-[#d5cec5]">
                  Countability, month-end census, weekly coverage, source partitions, and
                  suspect-resident exclusion.
                </p>
              </div>
            </div>
          </div>
        </section>

        <DownConnector label="Only validated evidence crosses" />

        <section className="border-y border-[#bdb5aa] px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
          <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.21em] text-[#0f8b73]">
                3 / Fast delivery
              </p>
              <h2 className="mt-3 text-[34px] font-semibold leading-none sm:text-[42px]">
                Snapshot first. Live when it matters.
              </h2>
              <p className="mt-5 max-w-[600px] text-[13px] leading-6 text-[#595249]">
                Databricks publishes <strong>latest.json</strong> and a dated copy to Azure
                Blob. The application reads that evidence package instead of waiting for
                warehouse fan-out on every page.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <FlowNode
                  icon={Cloud}
                  eyebrow="Evidence package"
                  title="Azure Blob"
                  text="Governed as-of date, resident profiles, census, incidents, MAR, assessments, and tool context."
                />
                <FlowNode
                  icon={LockKeyhole}
                  eyebrow="Application boundary"
                  title="Entra + Vercel"
                  text="Delegated access tokens protect Node APIs that validate and project snapshot data."
                />
                <FlowNode
                  icon={ScanSearch}
                  eyebrow="Operational exception"
                  title="Incident feed"
                  text="Attempts live Databricks first, then falls back to the governed snapshot with a warning."
                />
              </div>
            </div>

            <aside className="border-l-4 border-[#0f8b73] bg-[#effaf5] p-5 sm:p-7">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0b705f]">
                Why this architecture
              </p>
              <p className="mt-3 font-serif text-[27px] font-semibold leading-[1.08] tracking-[-0.035em] text-[#173b34]">
                Speed is separated from calculation, not from governance.
              </p>
              <div className="mt-6 space-y-4">
                {[
                  "Databricks does the heavy transformation once.",
                  "QA blocks publication when evidence is questionable.",
                  "The app serves a small, versioned contract quickly.",
                  "The snapshot remains traceable to a business date.",
                ].map((item) => (
                  <p key={item} className="flex gap-3 text-[12px] leading-5 text-[#315b54]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0f8b73]" />
                    {item}
                  </p>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section className="bg-[#f3efe7] px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
          <div className="grid gap-8 lg:grid-cols-[0.6fr_1.4fr]">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.21em] text-[#0f8b73]">
                4 / Deterministic intelligence
              </p>
              <h2 className="mt-3 text-[34px] font-semibold leading-[0.98] sm:text-[42px]">
                Calculate first. Explain second.
              </h2>
              <p className="mt-5 max-w-[470px] text-[13px] leading-6 text-[#595249]">
                Registered questions select deterministic tools over governed rows. The
                figures are fixed before narrative or visualization is rendered.
              </p>
              <div className="mt-6 border border-[#c9c1b6] bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-[#a04436]">
                  Claude boundary
                </p>
                <p className="mt-2 text-[12px] leading-5 text-[#595249]">
                  Claude may synthesize bounded evidence. It does not select, calculate, or
                  modify report figures.
                </p>
              </div>
            </div>

            <div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <FlowNode
                  icon={BookOpenCheck}
                  eyebrow="1 / Ask"
                  title="Registered question"
                  text="Known scope, period, selectors, and expected answer shape."
                />
                <FlowNode
                  icon={GitBranch}
                  eyebrow="2 / Route"
                  title="Intent compiler"
                  text="Maps the question to one certified deterministic capability."
                />
                <FlowNode
                  icon={ChartNoAxesCombined}
                  eyebrow="3 / Calculate"
                  title="Domain tool"
                  text="Computes counts, trends, rates, exact rows, and comparisons."
                />
                <FlowNode
                  icon={ShieldCheck}
                  eyebrow="4 / Validate"
                  title="Result contract"
                  text="Checks source, period, evidence, shape, and safety."
                />
                <FlowNode
                  icon={Braces}
                  eyebrow="5 / Render"
                  title="Answer + visual"
                  text="Narrative and purpose-built module use the frozen result."
                />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <article className="border-t-4 border-[#17130f] bg-white p-5">
                  <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#5c554d]">
                    <ChartNoAxesCombined className="h-4 w-4 text-[#0f8b73]" />
                    Questions + surfaces
                  </p>
                  <h3 className="mt-3 text-[23px] font-semibold leading-none">
                    Interactive operating answers
                  </h3>
                  <p className="mt-3 text-[12px] leading-5 text-[#595249]">
                    Census, incidents, residents, medications, documentation, services, and
                    assessment drilldowns share the same governed evidence.
                  </p>
                </article>
                <article className="border-t-4 border-[#17130f] bg-white p-5">
                  <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#5c554d]">
                    <FileChartColumn className="h-4 w-4 text-[#0f8b73]" />
                    /reports
                  </p>
                  <h3 className="mt-3 text-[23px] font-semibold leading-none">
                    Six complete reports
                  </h3>
                  <p className="mt-3 text-[12px] leading-5 text-[#595249]">
                    Deterministic report compilers freeze the same snapshot evidence into
                    complete, traceable documents.
                  </p>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y-2 border-[#17130f] px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
          <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.21em] text-[#0f8b73]">
                    5 / Current depth
                  </p>
                  <h2 className="mt-3 text-[34px] font-semibold leading-none sm:text-[42px]">
                    What the platform can see now
                  </h2>
                </div>
                <p className="max-w-[300px] text-[11px] leading-5 text-[#5a544c] sm:text-right">
                  Cross-domain reports use the seven-month period where every required
                  dataset overlaps.
                </p>
              </div>

              <div className="mt-7 grid border-l border-t border-[#bdb5aa] sm:grid-cols-2 lg:grid-cols-4">
                {DEPTH_METRICS.map((metric) => (
                  <article
                    key={metric.label}
                    className="min-h-[170px] border-b border-r border-[#bdb5aa] p-5"
                  >
                    <p className="font-serif text-[46px] font-semibold leading-none tracking-[-0.06em] text-[#0f8b73]">
                      {metric.value}
                    </p>
                    <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.15em] text-[#27221d]">
                      {metric.label}
                    </p>
                    <p className="mt-3 text-[11px] leading-5 text-[#6a635a]">{metric.detail}</p>
                  </article>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-4 bg-[#17130f] px-5 py-4 text-[#fffdf8]">
                <span className="font-serif text-[31px] font-semibold text-[#75d4bd]">7</span>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.17em]">
                    Shared cross-domain months
                  </p>
                  <p className="mt-1 text-[11px] text-[#cfc8be]">
                    Census + incidents + medication evidence can be compared without mixing
                    incompatible coverage windows.
                  </p>
                </div>
              </div>
            </div>

            <aside className="border border-[#c9c1b6] bg-[#fff7f4] p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <StatusBadge status="needed" />
                  <h2 className="mt-4 text-[31px] font-semibold leading-[1.02]">
                    What deeper outcome reporting still needs
                  </h2>
                </div>
                <Database className="h-6 w-6 shrink-0 text-[#a04436]" aria-hidden="true" />
              </div>
              <div className="mt-6 divide-y divide-[#d9c8c2] border-y border-[#d9c8c2]">
                {OUTCOME_GAPS.map((gap, index) => (
                  <div key={gap} className="grid grid-cols-[34px_1fr] gap-3 py-3">
                    <span className="text-[10px] font-bold tracking-[0.16em] text-[#a04436]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p className="text-[12px] font-semibold leading-5 text-[#3e302c]">{gap}</p>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-[11px] leading-5 text-[#76584f]">
                These additions should enter through the same Raw → Silver → Gold → Tool →
                QA → Snapshot chain. Availability alone is not governance.
              </p>
            </aside>
          </div>
        </section>
      </div>

      <footer className="flex flex-col gap-5 bg-[#0f8b73] px-5 py-7 text-[#fffdf8] sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-12">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#c9e8df]">
            Architecture principle
          </p>
          <p className="mt-2 font-serif text-[27px] font-semibold leading-tight tracking-[-0.035em]">
            One source of evidence. Many useful ways to act.
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.16em]">
          <Database className="h-4 w-4" />
          Govern
          <span className="h-px w-6 bg-[#8ccfc0]" />
          <ShieldCheck className="h-4 w-4" />
          Prove
          <span className="h-px w-6 bg-[#8ccfc0]" />
          <FileChartColumn className="h-4 w-4" />
          Use
        </div>
      </footer>
    </div>
  );
}
