import { useEffect, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

import type { WorkforceOpenPosition, WorkforceSummary } from "../../../shared/types/platformSnapshot";
import { readStorageItem, writeStorageItem } from "../../../shared/storage/browserStorage";
import { StaffingMap } from "./StaffingMap";

type ConnectedWorkforce = Extract<WorkforceSummary, { status: "connected" }>;
type Segment = { text: string; strong?: boolean };
type Line = { key: string; segments: Segment[] };

// Same pacing as the Admissions briefing so both updates feel like one assistant.
const TYPE_START_DELAY_MS = 240;
const TYPE_TICK_MS = 45;
const TYPE_CHARS_PER_TICK = 3;
const TYPED_SESSION_KEY = "alamo:workforce-briefing-typed:v1";
const STALE_DAYS = 14;

export default function WorkforceBriefing({ workforce }: { workforce: ConnectedWorkforce }) {
  const candidates = (position: WorkforceOpenPosition) => position.phase1 + position.phase2 + position.phase3;
  const offers = workforce.openPositions
    .filter((position) => position.phase3 > 0)
    .sort((a, b) => b.phase3 - a.phase3 || b.daysOpen - a.daysOpen);
  const empty = workforce.openPositions
    .filter((position) => candidates(position) === 0)
    .sort((a, b) => b.daysOpen - a.daysOpen);
  const credentialsLink = (community: string) =>
    workforce.workforceUrl ? `${workforce.workforceUrl}/credentials?community=${encodeURIComponent(community)}` : null;

  return (
    <div data-workforce-briefing="true">
      <BriefingUpdate lines={buildLines(workforce, offers, empty)} />

      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold tracking-[-0.025em] text-[#202623]">Workforce brief</h2>
          <p className="mt-1 text-[11px] text-[#737b77]">What needs someone’s attention this week</p>
        </div>
        <p className="text-[10px] text-[#7a817d]">Workforce through {formatDate(workforce.asOf)}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <ActionList
          kicker="Next 30 days"
          title="Expiring in 30 days"
          tone="info"
          emptyLabel="No credentials expire in the next 30 days."
          items={workforce.upcomingExpirations.map((group) => ({
            key: `${group.community}|${group.label}|${group.expiresOn}`,
            chip: formatShortDate(group.expiresOn),
            primary: `${group.label} · ${group.community}`,
            secondary: `${group.people} ${group.people === 1 ? "person" : "people"}${group.blocksScheduling ? " · off the schedule if it lapses" : ""}`,
            href: credentialsLink(group.community)
          }))}
        />
        <ActionList
          kicker="Close to hire"
          title="Offers and clearance"
          tone="hire"
          emptyLabel="No candidates are in offer or clearance."
          items={offers.map((position) => ({
            key: `${position.title}|${position.community}|${position.openedOn}`,
            chip: `${position.phase3} ${position.phase3 === 1 ? "offer" : "offers"}`,
            primary: `${position.title} · ${position.community}`,
            secondary: `Finish background, TB, and start date · ${position.openings} ${position.openings === 1 ? "opening" : "openings"}`,
            href: position.url
          }))}
        />
        <ActionList
          kicker="Needs sourcing"
          title="No candidates yet"
          tone="source"
          emptyLabel="Every open role has at least one candidate."
          items={empty.map((position) => ({
            key: `${position.title}|${position.community}|${position.openedOn}`,
            chip: `${position.daysOpen}d open`,
            primary: `${position.title} · ${position.community}`,
            secondary: position.daysOpen >= STALE_DAYS ? "Repost or ask staff for referrals" : "Share the posting",
            href: position.url
          }))}
        />
      </div>

      <StaffingMap rows={workforce.communities} workforceUrl={workforce.workforceUrl} />
    </div>
  );
}

function buildLines(workforce: ConnectedWorkforce, offers: WorkforceOpenPosition[], empty: WorkforceOpenPosition[]): Line[] {
  const { portfolio } = workforce;
  const roles = workforce.openPositions.length;
  const lines: Line[] = [];

  const hiring: Segment[] = [
    { text: plural(portfolio.openRoles, "open seat"), strong: true },
    { text: ` across ${plural(roles, "role")}. ` }
  ];
  if (offers.length) {
    const inClearance = offers.reduce((total, position) => total + position.phase3, 0);
    hiring.push({ text: `${plural(inClearance, "candidate")} in offer and clearance`, strong: true });
    hiring.push({ text: ` for ${nameRoles(offers)}.` });
  } else {
    hiring.push({ text: "Nobody is in offer and clearance yet." });
  }
  lines.push({ key: "hiring", segments: hiring });

  const oldest = empty[0];
  lines.push({
    key: "sourcing",
    segments: oldest
      ? [
          { text: plural(empty.length, "role"), strong: true },
          { text: ` ${empty.length === 1 ? "has" : "have"} no candidates; the longest waiting is ` },
          { text: `${oldest.title} at ${oldest.community}, ${oldest.daysOpen} days`, strong: true },
          { text: "." }
        ]
      : [{ text: "Every open role has at least one candidate." }]
  });

  const blocked = portfolio.staffBlockedFromScheduling;
  const worst = [...workforce.communities].sort((a, b) => b.totals.staffBlockedFromScheduling - a.totals.staffBlockedFromScheduling)[0];
  const expiring = workforce.upcomingExpirations.reduce((total, group) => total + group.people, 0);
  const scheduling: Segment[] = blocked > 0
    ? [
        { text: `${plural(blocked, "person", "people")} can’t be scheduled`, strong: true },
        { text: " because of credential gaps" },
        ...(worst && worst.totals.staffBlockedFromScheduling > 0
          ? [{ text: ", most at " }, { text: worst.community, strong: true }]
          : []),
        { text: ". " }
      ]
    : [{ text: "Everyone is cleared to schedule. " }];
  scheduling.push(expiring > 0
    ? { text: `${plural(expiring, "credential")} ${expiring === 1 ? "expires" : "expire"} in the next 30 days.` }
    : { text: "No credentials expire in the next 30 days." });
  lines.push({ key: "scheduling", segments: scheduling });

  return lines;
}

function BriefingUpdate({ lines }: { lines: Line[] }) {
  const total = lines.reduce((sum, line) => sum + length(line), 0);
  const [animate] = useState(() => readStorageItem(TYPED_SESSION_KEY, { kind: "session", label: "Workforce briefing animation" }) !== "true");
  const [revealed, setRevealed] = useState(animate ? 0 : total);
  const typing = revealed < total;

  useEffect(() => {
    writeStorageItem(TYPED_SESSION_KEY, "true", { kind: "session", label: "Workforce briefing animation" });
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRevealed(Number.MAX_SAFE_INTEGER);
      return;
    }
    let interval: number | undefined;
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        setRevealed((current) => {
          const next = current + TYPE_CHARS_PER_TICK;
          if (next >= total && interval != null) window.clearInterval(interval);
          return next;
        });
      }, TYPE_TICK_MS);
    }, TYPE_START_DELAY_MS);
    return () => {
      window.clearTimeout(start);
      if (interval != null) window.clearInterval(interval);
    };
  }, [animate, total]);

  let offset = 0;
  return (
    <section
      data-workforce-executive-update="true"
      aria-label="Workforce briefing"
      aria-busy={typing}
      className="mb-6 max-w-[1120px] rounded-[16px] bg-[#f4f7f5] px-4 py-4 text-[#46504b] sm:px-5 sm:py-5"
    >
      <div className="flex items-start gap-3.5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#dcebe5] text-[#176d51] sm:h-9 sm:w-9">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-h-8 items-center gap-2">
            <span className="text-[12px] font-semibold text-[#263c35] sm:text-[13px]">Briefing</span>
            <span className="text-[10px] text-[#7a847f]" aria-hidden="true">{typing ? "Composing…" : "Current update"}</span>
          </div>
          <div className="mt-2.5 space-y-2 text-[13px] leading-6 sm:text-[14px] sm:leading-7">
            {lines.map((line) => {
              const lineLength = length(line);
              const visible = Math.max(0, Math.min(lineLength, revealed - offset));
              const streaming = typing && visible > 0 && visible < lineLength;
              offset += lineLength;
              if (visible === 0) return null;
              return (
                <p key={line.key} data-workforce-executive-line={line.key}>
                  {reveal(line.segments, visible)}
                  {streaming ? <span className="ml-0.5 inline-block animate-pulse font-semibold text-[#0f8b73]" aria-hidden="true">▍</span> : null}
                </p>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

const TONES = {
  info: { border: "border-[#d4dcf5]", surface: "bg-[#f0f3fc]", count: "bg-[#365fc7] text-white", chip: "bg-[#e2e8fa] text-[#3159b8]" },
  hire: { border: "border-[#c8dfd3]", surface: "bg-[#edf7f2]", count: "bg-[#197453] text-white", chip: "bg-[#dcefe6] text-[#145b43]" },
  source: { border: "border-[#efd2bd]", surface: "bg-[#fcf3ed]", count: "bg-[#b65318] text-white", chip: "bg-[#fbe6d6] text-[#94420f]" }
} as const;

function ActionList({
  kicker,
  title,
  tone,
  emptyLabel,
  items
}: {
  kicker: string;
  title: string;
  tone: keyof typeof TONES;
  emptyLabel: string;
  items: Array<{ key: string; chip: string; primary: string; secondary: string; href: string | null }>;
}) {
  const treatment = TONES[tone];
  return (
    <section data-workforce-action-list={tone} className={`h-full overflow-hidden rounded-2xl border ${treatment.border} bg-white shadow-[0_2px_8px_rgba(24,63,52,0.04)] sm:min-h-[230px]`}>
      <div className={`flex items-center justify-between gap-4 px-4 py-4 sm:px-5 ${treatment.surface}`}>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6f7974]">{kicker}</p>
          <h3 className="mt-1 text-[17px] font-semibold tracking-[-0.025em] text-[#263c35]">{title}</h3>
        </div>
        <span className={`inline-flex min-w-9 items-center justify-center rounded-full px-2.5 py-1.5 text-[12px] font-semibold tabular-nums ${treatment.count}`}>{items.length}</span>
      </div>
      {items.length ? (
        <ul className="max-h-[420px] space-y-2 overflow-y-auto p-3 sm:p-4">
          {items.map((item) => {
            const body = (
              <>
                <span className={`inline-flex w-fit whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${treatment.chip}`}>{item.chip}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold text-[#263c35]">{item.primary}</span>
                  <span className="mt-1 block text-[9px] leading-4 text-[#7a817d]">{item.secondary}</span>
                </span>
                {item.href ? <ArrowRight className="h-3.5 w-3.5 text-[#0f795f] transition-transform group-hover:translate-x-0.5" aria-hidden="true" /> : <span />}
              </>
            );
            const className = "group grid grid-cols-[84px_minmax(0,1fr)_14px] items-center gap-x-3 rounded-xl border border-[#e6eae8] bg-white p-3";
            return (
              <li key={item.key}>
                {item.href
                  ? <a href={item.href} className={`${className} hover:border-[#bfc9c3] hover:bg-[#fafcfb]`}>{body}</a>
                  : <div className={className}>{body}</div>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex min-h-[104px] items-center justify-center px-5 text-center text-[12px] text-[#69716c] sm:min-h-[150px]">{emptyLabel}</p>
      )}
    </section>
  );
}

function length(line: Line) {
  return line.segments.reduce((total, segment) => total + segment.text.length, 0);
}

function reveal(segments: Segment[], visible: number) {
  let remaining = visible;
  return segments.map((segment, index) => {
    if (remaining <= 0) return null;
    const text = segment.text.slice(0, remaining);
    remaining -= segment.text.length;
    return segment.strong ? <strong key={index} className="font-semibold text-[#183f34]">{text}</strong> : <span key={index}>{text}</span>;
  });
}

function nameRoles(positions: WorkforceOpenPosition[]) {
  const named = positions.slice(0, 2).map((position) => `${position.title} at ${position.community}`);
  const rest = positions.length - named.length;
  return rest > 0 ? `${named.join(", ")}, and ${plural(rest, "more role")}` : named.join(" and ");
}

function plural(count: number, noun: string, pluralNoun = `${noun}s`) {
  return `${count} ${count === 1 ? noun : pluralNoun}`;
}

function formatShortDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
