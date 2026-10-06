import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import {
  BadgeCheck,
  BookOpenCheck,
  Braces,
  Building2,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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

type Status = "live" | "bounded" | "notConnected";
type ArchitectureChapter = "inputs" | "pipeline" | "delivery" | "intelligence" | "depth";

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

interface Capability {
  status: Status;
  title: string;
  source: string;
  available: string;
  boundary: string;
}

const ARCHITECTURE_CHAPTERS: Array<{ id: ArchitectureChapter; label: string }> = [
  { id: "inputs", label: "What feeds it" },
  { id: "pipeline", label: "How truth is made" },
  { id: "delivery", label: "How it reaches the app" },
  { id: "intelligence", label: "How answers are produced" },
  { id: "depth", label: "What is available now" },
];

const STATUS_STYLES: Record<Status, { label: string; dot: string; badge: string; rule: string }> = {
  live: {
    label: "Live",
    dot: "bg-[#0f8b73]",
    badge: "border-[#0f8b73]/35 bg-[#effaf5] text-[#0b705f]",
    rule: "border-t-[#0f8b73]",
  },
  bounded: {
    label: "Live · bounded",
    dot: "bg-[#b8741a]",
    badge: "border-[#b8741a]/35 bg-[#fff8e9] text-[#85520d]",
    rule: "border-t-[#b8741a]",
  },
  notConnected: {
    label: "Not connected",
    dot: "bg-[#8b8074]",
    badge: "border-[#8b8074]/35 bg-[#f4f1ed] text-[#655d55]",
    rule: "border-t-[#8b8074]",
  },
};

const SOURCE_LANES: SourceLane[] = [
  {
    status: "live",
    kicker: "Resident + clinical operations",
    title: "ElderMark",
    description:
      "The governed operating record for residents, census, incidents, diagnoses, services, documentation, assessments, and payer context.",
    items: [
      "Current roster, community, unit, census, and flow",
      "Incidents, diagnoses, length of stay, and demographics",
      "Services, notes, assessments, documentation, and payer slices",
    ],
    note: "A supported slice is shown only when its manifest confirms loaded rows and coverage.",
    icon: Building2,
  },
  {
    status: "live",
    kicker: "Medication operations",
    title: "MAR / eMAR",
    description:
      "Medication orders and administration records are transformed into compliance, exception, refusal, held, pending, duplicate, and PRN evidence.",
    items: [
      "Current orders and medication profiles",
      "Administrations, outcomes, and compliance",
      "Bounded exception and PRN detail windows",
    ],
    note: "Medication questions use the loaded MAR period; unavailable detail is never converted to zero.",
    icon: ClipboardCheck,
  },
  {
    status: "bounded",
    kicker: "Admissions workflow",
    title: "Pipeline",
    description:
      "A live server-to-server summary supplies the Admissions board, briefing, client identity, stage, decisions, and covered schedules.",
    items: [
      "Referral board and current workflow state",
      "Planned move-ins and assessments when coverage is present",
      "Bounded signed-assessment management context",
    ],
    note: "Raw notes, contacts, uploaded documents, OCR evidence, and unsigned narrative remain in Pipeline.",
    icon: GitBranch,
  },
  {
    status: "bounded",
    kicker: "Enhanced client context",
    title: "Client database",
    description:
      "A QA-approved Azure dataset extends client history on demand and links to current residents only through governed canonical identity.",
    items: [
      "Searchable client directory and complete client detail",
      "Current resident and episode-history joins by canonical ID",
      "Approved document metadata and derived client facts",
    ],
    note: "The dataset is not copied into the general bootstrap, and the application does not infer matches from names.",
    icon: UserRoundSearch,
  },
  {
    status: "bounded",
    kicker: "Specialized intelligence",
    title: "Licensing + acquisition",
    description:
      "Licensing monitoring and owner-only acquisition research use separate governed stores and APIs inside the Alamo identity boundary.",
    items: [
      "Monday and Wednesday licensing checks",
      "Evidence, freshness, review state, and source lineage",
      "Owner-restricted research and deterministic screening",
    ],
    note: "These records do not enter the general resident snapshot or broaden ordinary user access.",
    icon: ScanSearch,
  },
  {
    status: "notConnected",
    kicker: "Future source contracts",
    title: "Finance, messaging + outcomes",
    description:
      "NetSuite, Outlook or Teams workflows, and external hospital, claims, or outcome feeds are not current Platform data sources.",
    items: [
      "General ledger, revenue, labor, and budget actuals",
      "Message-driven incident or security workflow",
      "Hospital, emergency-department, claims, and external outcomes",
    ],
    note: "No Platform answer should imply these sources are present until an explicit contract is implemented and governed.",
    icon: Database,
  },
];

const PIPELINE_STEPS: PipelineStep[] = [
  {
    number: "01",
    verb: "Land",
    title: "Raw partitions",
    description: "Azure + Databricks",
    detail: "Preserve source fields and lineage in a recoverable business-date partition.",
    icon: Database,
  },
  {
    number: "02",
    verb: "Normalize",
    title: "Silver tables",
    description: "Stable business records",
    detail: "Standardize dates, identifiers, communities, history, and resident countability.",
    icon: Layers3,
  },
  {
    number: "03",
    verb: "Define",
    title: "Gold + tool views",
    description: "Governed meaning",
    detail: "Build census, incidents, residents, medication, documentation, service, and assessment measures.",
    icon: Network,
  },
  {
    number: "04",
    verb: "Prove",
    title: "QA gates",
    description: "Publication blocker",
    detail: "Reconcile totals, coverage, countability, freshness, and schemas before release.",
    icon: ShieldCheck,
  },
  {
    number: "05",
    verb: "Publish",
    title: "Azure snapshot",
    description: "Versioned evidence",
    detail: "Write latest and dated packages with one governed as-of date and manifest.",
    icon: Cloud,
  },
  {
    number: "06",
    verb: "Serve",
    title: "Protected Platform",
    description: "Azure Container Apps",
    detail: "Entra-protected Node APIs validate and project evidence into the React application.",
    icon: Server,
  },
];

const CAPABILITIES: Capability[] = [
  {
    status: "live",
    title: "Portfolio + community operations",
    source: "Governed snapshot",
    available: "Current residents, census, flow, diagnoses, demographics, length of stay, community comparisons, and resident profiles.",
    boundary: "Visible periods and current state come from the snapshot manifest and governed as-of date.",
  },
  {
    status: "live",
    title: "Incidents",
    source: "Gold views + snapshot",
    available: "Incident detail, categories, rates, current triage, community views, history, and exact supporting records.",
    boundary: "Live Databricks may be attempted for the operational feed; the snapshot fallback is labeled when used.",
  },
  {
    status: "live",
    title: "Medication operations",
    source: "MAR gold views + snapshot",
    available: "Orders, administrations, compliance, refusals, held and pending outcomes, duplicates, exceptions, and PRN detail.",
    boundary: "Each answer is restricted to the loaded medication period and supported row grain.",
  },
  {
    status: "bounded",
    title: "Clinical context",
    source: "Optional governed slices",
    available: "Services, assessment summaries, notes summaries, documentation status, payer context, and unit placement when source rows are loaded.",
    boundary: "A supported schema is not proof that rows exist; missing coverage is reported as unavailable, not zero.",
  },
  {
    status: "bounded",
    title: "Admissions + client history",
    source: "Pipeline + client database",
    available: "Referral workflow, decisions, schedules with source coverage, management profiles, client directory, and episode history.",
    boundary: "These feeds use narrow contracts and do not expose raw Pipeline documents or bulk client data in the browser.",
  },
  {
    status: "bounded",
    title: "Licensing + acquisition research",
    source: "Specialized stores",
    available: "Licensing baselines and changes, public-source research, evidence, review state, and screening calculations.",
    boundary: "Access is separately restricted, and discovery or estimates are never presented as verified facts.",
  },
];

const OUTCOME_GAPS = [
  "NetSuite financial, revenue, labor, and budget actuals",
  "Historical licensed capacity and staffed capacity by effective date",
  "Complete referral-to-admission-to-discharge episode continuity",
  "Consistent referral-source and payer continuity across systems",
  "Hospital, emergency-department, claims, and external outcome feeds",
  "Repeated standardized assessments with complete longitudinal coverage",
];

function StatusBadge({ status }: { status: Status }) {
  const style = STATUS_STYLES[status];

  return (
    <span className={`inline-flex items-center gap-2 border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${style.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {style.label}
    </span>
  );
}

function SourceCard({ lane }: { lane: SourceLane }) {
  const Icon = lane.icon;
  const style = STATUS_STYLES[lane.status];

  return (
    <article className={`flex h-full flex-col border border-[#cfc8bd] border-t-4 bg-white p-5 ${style.rule}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#686158]">{lane.kicker}</p>
          <h3 className="mt-2 text-[25px] font-semibold leading-[1.04] text-[#17130f]">{lane.title}</h3>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center border border-[#cfc8bd] bg-[#f8f5ef]">
          <Icon className="h-5 w-5 text-[#315b54]" aria-hidden="true" />
        </span>
      </div>
      <div className="mt-4"><StatusBadge status={lane.status} /></div>
      <p className="mt-4 text-[14px] leading-6 text-[#4d4841]">{lane.description}</p>
      <div className="mt-4 border-t border-[#ddd6cd] pt-3">
        {lane.items.map((item) => (
          <p key={item} className="flex gap-2 py-1 text-[13px] leading-5 text-[#28231e]">
            <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} aria-hidden="true" />
            {item}
          </p>
        ))}
      </div>
      <p className="mt-auto border-t border-[#ddd6cd] pt-4 text-[12px] font-semibold leading-5 text-[#676057]">{lane.note}</p>
    </article>
  );
}

function PipelineCard({ step }: { step: PipelineStep }) {
  const Icon = step.icon;

  return (
    <article className="relative min-h-[205px] border border-[#bdb5aa] bg-white p-5">
      <div className="flex items-center justify-between gap-3 border-b border-[#ded8cf] pb-3">
        <span className="text-[11px] font-bold tracking-[0.18em] text-[#0f8b73]">{step.number} / {step.verb}</span>
        <Icon className="h-4 w-4 text-[#315b54]" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-[23px] font-semibold leading-none text-[#17130f]">{step.title}</h3>
      <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.13em] text-[#6b645b]">{step.description}</p>
      <p className="mt-4 text-[13px] leading-5 text-[#4d4841]">{step.detail}</p>
      <span aria-hidden="true" className="absolute -bottom-1 left-5 h-2 w-10 bg-[#0f8b73]" />
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
    <article className="border border-[#c9c1b6] bg-white p-5">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center bg-[#173b34] text-[#fffdf8]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0f8b73]">{eyebrow}</p>
          <h3 className="mt-0.5 text-[16px] font-bold tracking-[-0.02em] text-[#17130f]">{title}</h3>
        </div>
      </div>
      <p className="mt-4 text-[13px] leading-6 text-[#5a544c]">{text}</p>
    </article>
  );
}

function CapabilityCard({ capability }: { capability: Capability }) {
  const style = STATUS_STYLES[capability.status];

  return (
    <article className={`border border-[#c9c1b6] border-t-4 bg-white p-5 ${style.rule}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6b645b]">{capability.source}</p>
          <h3 className="mt-2 text-[22px] font-semibold leading-tight text-[#17130f]">{capability.title}</h3>
        </div>
        <StatusBadge status={capability.status} />
      </div>
      <p className="mt-4 text-[13px] leading-6 text-[#3f3933]">{capability.available}</p>
      <p className="mt-4 border-t border-[#ddd6cd] pt-3 text-[12px] leading-5 text-[#6a635a]">{capability.boundary}</p>
    </article>
  );
}

function ArchitectureChapterNavigation({
  active,
  onChange,
  position,
}: {
  active: ArchitectureChapter;
  onChange: (chapter: ArchitectureChapter) => void;
  position: "top" | "bottom";
}) {
  const index = Math.max(0, ARCHITECTURE_CHAPTERS.findIndex((chapter) => chapter.id === active));
  const previous = ARCHITECTURE_CHAPTERS[index - 1];
  const next = ARCHITECTURE_CHAPTERS[index + 1];

  return (
    <nav
      aria-label={position === "top" ? "Data architecture chapters" : "Continue through data architecture"}
      className={`${position === "top" ? "sticky top-[var(--platform-header-height)] z-30" : ""} border-b border-[#bdb5aa] bg-white px-4 py-3 print:hidden md:hidden`}
    >
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => previous && onChange(previous.id)}
          disabled={!previous}
          className="inline-flex min-h-11 min-w-11 items-center justify-center border border-[#bdb5aa] text-[#315b54] disabled:opacity-30"
          aria-label="Previous architecture chapter"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <label className="min-w-0 flex-1">
          <span className="sr-only">Architecture chapter</span>
          <select
            value={active}
            onChange={(event) => onChange(event.target.value as ArchitectureChapter)}
            className="h-11 w-full border border-[#bdb5aa] bg-white px-3 text-[16px] font-semibold text-[#17130f]"
          >
            {ARCHITECTURE_CHAPTERS.map((chapter, chapterIndex) => (
              <option key={chapter.id} value={chapter.id}>
                {chapterIndex + 1} / {ARCHITECTURE_CHAPTERS.length} · {chapter.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => next && onChange(next.id)}
          disabled={!next}
          className="inline-flex min-h-11 min-w-11 items-center justify-center border border-[#bdb5aa] text-[#315b54] disabled:opacity-30"
          aria-label="Next architecture chapter"
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

export default function DataArchitecturePage() {
  const initialHash = typeof window === "undefined" ? "" : window.location.hash.slice(1);
  const [activeChapter, setActiveChapter] = useState<ArchitectureChapter>(
    ARCHITECTURE_CHAPTERS.some((chapter) => chapter.id === initialHash)
      ? initialHash as ArchitectureChapter
      : "inputs",
  );
  const changeChapter = (chapter: ArchitectureChapter) => {
    setActiveChapter(chapter);
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#${chapter}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const chapterClass = (chapter: ArchitectureChapter, classes: string) =>
    `${activeChapter === chapter ? "block" : "hidden md:block print:block"} ${classes}`;

  return (
    <div
      data-data-architecture="true"
      data-architecture-version="2026-10-06"
      className="mx-auto w-full max-w-[1432px] pb-12 text-[#17130f] print:max-w-none print:p-0"
    >
      <header
        className="relative overflow-hidden border-y-2 border-[#17130f] bg-[#f3efe7] px-5 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-11"
        style={{
          backgroundImage:
            "linear-gradient(rgba(49,91,84,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(49,91,84,0.07) 1px, transparent 1px), radial-gradient(circle at 86% 20%, rgba(15,139,115,0.14), transparent 34%)",
          backgroundSize: "32px 32px, 32px 32px, auto",
        }}
      >
        <div className="relative z-10 grid gap-6 lg:grid-cols-[1fr_340px] lg:items-end lg:gap-8">
          <div className="max-w-[900px]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="bg-[#173b34] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.19em] text-[#fffdf8]">Alamo Platform</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5b554d]">Current production architecture · 6 October 2026</span>
            </div>
            <h1 className="mt-4 max-w-[850px] text-[38px] font-semibold leading-[0.96] tracking-[-0.05em] sm:mt-6 sm:text-[58px] lg:text-[68px]">
              How the platform knows what it knows.
            </h1>
            <p className="mt-4 max-w-[800px] text-[16px] leading-7 text-[#454038] sm:mt-6 sm:text-[18px]">
              What is connected today, how each source becomes trusted evidence, where the application runs, and what the Platform cannot claim yet.
            </p>
          </div>

          <div className="border border-[#bdb5aa] bg-white/80 p-4 backdrop-blur-sm sm:p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#5b554d]">Read the status literally</p>
            <div className="mt-4 flex flex-wrap gap-2" aria-label="Architecture status legend">
              <StatusBadge status="live" />
              <StatusBadge status="bounded" />
              <StatusBadge status="notConnected" />
            </div>
            <p className="mt-4 text-[12px] leading-5 text-[#5a544c]">
              Live means connected in production. Bounded means available only through a narrow contract or restricted store. Not connected means the Platform must not answer from it.
            </p>
            <button
              type="button"
              onClick={() => window.print()}
              className="mt-5 hidden min-h-11 items-center gap-2 border border-[#17130f] bg-white px-4 text-[11px] font-bold uppercase tracking-[0.14em] hover:bg-[#17130f] hover:text-[#fffdf8] print:hidden sm:inline-flex"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print / save PDF
            </button>
          </div>
        </div>
      </header>

      <ArchitectureChapterNavigation active={activeChapter} onChange={changeChapter} position="top" />

      <section
        data-architecture-chapter="inputs"
        className={chapterClass("inputs", "border-b border-[#bdb5aa] px-5 py-9 sm:px-8 lg:px-12 lg:py-12")}
      >
        <div className="grid gap-6 lg:grid-cols-[0.48fr_1.52fr]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0f8b73]">1 / What feeds it</p>
            <h2 className="mt-3 text-[34px] font-semibold leading-[0.98] sm:text-[43px]">Connected does not mean unrestricted.</h2>
            <p className="mt-5 max-w-[440px] text-[14px] leading-7 text-[#595249]">
              The Platform has a governed operating-data spine plus several narrower integrations. Each source keeps its own coverage, freshness, privacy, and access boundary.
            </p>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            {SOURCE_LANES.map((lane) => <SourceCard key={lane.title} lane={lane} />)}
          </div>
        </div>
      </section>

      <section
        data-architecture-chapter="pipeline"
        className={chapterClass("pipeline", "border-y-2 border-[#17130f] bg-[#f5f3ee] px-5 py-9 sm:px-8 lg:px-12 lg:py-12")}
      >
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0f8b73]">2 / How truth is made</p>
            <h2 className="mt-3 text-[34px] font-semibold leading-none sm:text-[43px]">The governed operating-data spine</h2>
          </div>
          <p className="max-w-[610px] text-[13px] leading-6 text-[#595249] lg:text-right">
            ElderMark and MAR follow the full Databricks publication path. Pipeline, the client database, Licensing, and acquisition research join later through explicit contracts; they are not quietly mixed into the core snapshot.
          </p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PIPELINE_STEPS.map((step) => <PipelineCard key={step.number} step={step} />)}
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <FlowNode icon={GitBranch} eyebrow="Bounded integration" title="Pipeline summary" text="The server requests one versioned Admissions summary, validates it, caches the last good response briefly, and labels unavailable or incomplete coverage." />
          <FlowNode icon={UserRoundSearch} eyebrow="On-demand extension" title="Client database" text="The snapshot carries a protected pointer. The server validates the separate Azure object and returns only the directory or selected client detail required for the workflow." />
          <FlowNode icon={ScanSearch} eyebrow="Restricted stores" title="Licensing + research" text="Scheduled monitoring and owner-only research keep their own evidence, review state, and access rules behind the same authenticated Platform API boundary." />
        </div>

        <div className="mt-8 grid gap-5 bg-[#17130f] p-5 text-[#fffdf8] sm:p-7 lg:grid-cols-[0.55fr_1.45fr] lg:items-center">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center border border-[#625b53]"><LockKeyhole className="h-5 w-5" aria-hidden="true" /></span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#75d4bd]">Publication rule</p>
              <h3 className="mt-2 text-[28px] font-semibold leading-none">No silent substitution.</h3>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {["Failed QA blocks a new snapshot.", "Missing source coverage stays unavailable, not zero.", "A stale or fallback response is labeled at the surface."].map((item) => (
              <p key={item} className="flex gap-2 border border-[#4d4741] p-4 text-[12px] leading-5 text-[#e0d9d0]">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#75d4bd]" aria-hidden="true" />{item}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section
        data-architecture-chapter="delivery"
        className={chapterClass("delivery", "border-y border-[#bdb5aa] px-5 py-9 sm:px-8 lg:px-12 lg:py-12")}
      >
        <div className="grid gap-8 xl:grid-cols-[0.86fr_1.14fr]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0f8b73]">3 / How it reaches the app</p>
            <h2 className="mt-3 text-[34px] font-semibold leading-[0.98] sm:text-[43px]">Azure in production. One protected application boundary.</h2>
            <p className="mt-5 max-w-[600px] text-[14px] leading-7 text-[#595249]">
              The public Platform is a React application and Node API running in Azure Container Apps. Microsoft Entra authenticates the user before any protected route or API contract is dispatched.
            </p>
            <div className="mt-6 border border-[#c9c1b6] bg-[#f8f5ef] p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#5c554d]">Every source keeps its own clock</p>
              <p className="mt-3 text-[13px] leading-6 text-[#49433c]">
                The core snapshot has a governed as-of date. Pipeline has a reporting window. The client database has a baseline and version. Licensing evidence has a checked date. The UI must show the relevant clock instead of pretending everything refreshed together.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FlowNode icon={Cloud} eyebrow="Primary evidence" title="Azure Blob snapshot" text="A small versioned package carries the approved operating evidence and manifest needed by communities, analytics, explorers, reports, and the analyst." />
            <FlowNode icon={Server} eyebrow="Production runtime" title="Azure Container Apps" text="The Node API reads and validates source contracts; the React application receives only the projections needed for the signed-in experience." />
            <FlowNode icon={LockKeyhole} eyebrow="Identity + privacy" title="Microsoft Entra" text="Delegated user tokens protect every production API. Owner-only knowledge, acquisition, and selected Licensing routes add a second authorization boundary." />
            <FlowNode icon={ShieldCheck} eyebrow="Resilience" title="Last-known-good data" text="Temporary network or upstream failure can preserve validated in-session data, but the application marks it stale and refreshes after reconnection." />
          </div>
        </div>

        <aside className="mt-8 border-l-4 border-[#0f8b73] bg-[#effaf5] p-5 sm:p-7">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0b705f]">Why the split matters</p>
          <p className="mt-3 max-w-[1050px] text-[24px] font-semibold leading-tight tracking-[-0.025em] text-[#173b34]">
            Heavy calculation happens before the screen loads; narrow live integrations remain narrow; the browser never becomes the source database.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {["Fast response without recalculating the warehouse", "Traceable evidence tied to a business date", "Explicit failure and freshness states", "No source-system secrets in the browser"].map((item) => (
              <p key={item} className="flex gap-3 text-[12px] leading-5 text-[#315b54]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0f8b73]" aria-hidden="true" />{item}</p>
            ))}
          </div>
        </aside>
      </section>

      <section
        data-architecture-chapter="intelligence"
        className={chapterClass("intelligence", "bg-[#f3efe7] px-5 py-9 sm:px-8 lg:px-12 lg:py-12")}
      >
        <div className="grid gap-8 lg:grid-cols-[0.54fr_1.46fr]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0f8b73]">4 / How answers are produced</p>
            <h2 className="mt-3 text-[34px] font-semibold leading-[0.98] sm:text-[43px]">Calculate first. Explain second.</h2>
            <p className="mt-5 max-w-[470px] text-[14px] leading-7 text-[#595249]">
              Registered questions and deterministic tools select rows, periods, scopes, calculations, and truth state. Narrative and visualization are built only after that result is validated.
            </p>
            <div className="mt-6 border border-[#c9c1b6] bg-white p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8f382c]">Language-model boundary</p>
              <p className="mt-3 text-[13px] leading-6 text-[#595249]">The model may summarize verified evidence. It does not choose source rows, calculate hidden replacement figures, change the period, or turn missing data into an answer.</p>
            </div>
          </div>

          <div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <FlowNode icon={BookOpenCheck} eyebrow="1 / Ask" title="Registered question" text="Known scope, period, selectors, and expected answer shape." />
              <FlowNode icon={GitBranch} eyebrow="2 / Route" title="Intent compiler" text="Maps the request to one certified capability and explicit analysis frame." />
              <FlowNode icon={ChartNoAxesCombined} eyebrow="3 / Calculate" title="Domain tool" text="Computes counts, rates, trends, comparisons, and exact supporting rows." />
              <FlowNode icon={ShieldCheck} eyebrow="4 / Validate" title="Result contract" text="Checks source, period, evidence, schema, truth state, and output safety." />
              <FlowNode icon={Braces} eyebrow="5 / Render" title="Answer + module" text="The explanation, chart, table, or report uses the frozen result." />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <article className="border-t-4 border-[#173b34] bg-white p-5">
                <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.17em] text-[#5c554d]"><ChartNoAxesCombined className="h-4 w-4 text-[#0f8b73]" aria-hidden="true" />Interactive decisions</p>
                <h3 className="mt-3 text-[23px] font-semibold leading-none">Questions, modules, and drilldowns</h3>
                <p className="mt-3 text-[13px] leading-6 text-[#595249]">Each continuation preserves the selected community, resident, period, category, and evidence boundary.</p>
              </article>
              <article className="border-t-4 border-[#173b34] bg-white p-5">
                <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.17em] text-[#5c554d]"><FileChartColumn className="h-4 w-4 text-[#0f8b73]" aria-hidden="true" />Governed artifacts</p>
                <h3 className="mt-3 text-[23px] font-semibold leading-none">Reports and one-page briefs</h3>
                <p className="mt-3 text-[13px] leading-6 text-[#595249]">Compilers freeze the same validated evidence into traceable documents; generation does not create a second data truth.</p>
              </article>
            </div>

            <div className="mt-4 border border-[#c9c1b6] bg-[#fffdf8] p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#0f8b73]">Truth states are part of the answer</p>
              <p className="mt-3 text-[14px] leading-6 text-[#49433c]"><strong>Valid records</strong>, <strong>verified zero</strong>, <strong>not loaded</strong>, <strong>stale</strong>, and <strong>rejected</strong> are different outcomes. The Platform is designed to keep them different.</p>
            </div>
          </div>
        </div>
      </section>

      <section
        data-architecture-chapter="depth"
        className={chapterClass("depth", "border-y-2 border-[#17130f] px-5 py-9 sm:px-8 lg:px-12 lg:py-12")}
      >
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#0f8b73]">5 / What is available now</p>
            <h2 className="mt-3 text-[34px] font-semibold leading-none sm:text-[43px]">Capabilities, with the boundary attached</h2>
          </div>
          <p className="max-w-[560px] text-[13px] leading-6 text-[#595249] lg:text-right">Coverage dates and row counts belong to the live manifest, not this explanatory page. Cross-domain comparisons use only the periods where every required slice overlaps.</p>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {CAPABILITIES.map((capability) => <CapabilityCard key={capability.title} capability={capability} />)}
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
          <article className="bg-[#173b34] p-6 text-[#fffdf8] sm:p-7">
            <Cloud className="h-6 w-6 text-[#75d4bd]" aria-hidden="true" />
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#bfe3d9]">Coverage rule</p>
            <h3 className="mt-3 text-[29px] font-semibold leading-tight">Current depth is read, not hard-coded.</h3>
            <p className="mt-4 text-[13px] leading-6 text-[#d9e6e2]">The manifest states which slices are loaded, their row grain, their earliest and latest periods, and their freshness. Screens and analyst answers must use that evidence at run time.</p>
          </article>

          <aside className="border border-[#c9c1b6] bg-[#fff8f4] p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <StatusBadge status="notConnected" />
                <h3 className="mt-4 text-[30px] font-semibold leading-[1.02]">What still requires a governed source contract</h3>
              </div>
              <Database className="h-6 w-6 shrink-0 text-[#8b8074]" aria-hidden="true" />
            </div>
            <div className="mt-6 grid gap-x-7 border-y border-[#d9c8c2] sm:grid-cols-2">
              {OUTCOME_GAPS.map((gap, index) => (
                <div key={gap} className="grid grid-cols-[34px_1fr] gap-3 border-b border-[#eadbd5] py-3 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0">
                  <span className="text-[10px] font-bold tracking-[0.16em] text-[#8f382c]">{String(index + 1).padStart(2, "0")}</span>
                  <p className="text-[13px] font-semibold leading-5 text-[#3e302c]">{gap}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[12px] leading-5 text-[#76584f]">Adding a table or API is not enough. Identity, lineage, freshness, row grain, validation, access, and failure behavior must be explicit before the Platform treats a source as evidence.</p>
          </aside>
        </div>
      </section>

      <ArchitectureChapterNavigation active={activeChapter} onChange={changeChapter} position="bottom" />

      <footer className="flex flex-col gap-5 bg-[#173b34] px-5 py-7 text-[#fffdf8] sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-12">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#c9e8df]">Architecture principle</p>
          <p className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.03em]">Know the source. Prove the result. Show the boundary.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-[0.14em]">
          <Database className="h-4 w-4" aria-hidden="true" /> Govern
          <span className="h-px w-6 bg-[#8ccfc0]" />
          <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Prove
          <span className="h-px w-6 bg-[#8ccfc0]" />
          <FileChartColumn className="h-4 w-4" aria-hidden="true" /> Use
        </div>
      </footer>
    </div>
  );
}
