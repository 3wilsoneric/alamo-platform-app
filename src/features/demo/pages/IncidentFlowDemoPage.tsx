import {
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Mail,
  Send,
  ShieldAlert,
  Smartphone,
  Sparkles
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const steps = [
  {
    key: "email",
    title: "Email caught",
    eyebrow: "Step 1",
    summary: "Incoming incident email lands in the incident center intake.",
    accent: "blue"
  },
  {
    key: "parsed",
    title: "Reasoning + parse",
    eyebrow: "Step 2",
    summary: "Key facts, severity, and routing recommendation are extracted.",
    accent: "violet"
  },
  {
    key: "pushed",
    title: "Push notification",
    eyebrow: "Step 3",
    summary: "The evening manager gets a mobile alert with the right context.",
    accent: "amber"
  },
  {
    key: "reviewed",
    title: "Incident review",
    eyebrow: "Step 4",
    summary: "Manager expands the card, reads the report, and marks it reviewed.",
    accent: "emerald"
  }
] as const;

const emailBody = `Subject: Urgent Incident Report - San Pablo Evening Shift

Resident R. M. escalated during evening medication pass at approximately 8:41 PM. Staff attempted verbal de-escalation, but resident struck the unit door repeatedly and required supervisor response. Seclusion review initiated per protocol. Family has not yet been notified. Please review for overnight follow-up and leadership visibility.`;

const parsedFacts = [
  { label: "Facility", value: "San Pablo" },
  { label: "Client", value: "R. M." },
  { label: "Type", value: "Behavioral escalation" },
  { label: "Severity", value: "High" },
  { label: "Occurred", value: "8:41 PM" },
  { label: "Next action", value: "Notify evening manager" }
];

const accentClasses = {
  blue: {
    railActive: "border-blue-600",
    railDone: "border-blue-300",
    eyebrow: "text-blue-700",
    icon: "bg-blue-100 text-blue-700",
    softPanel: "border-blue-200 bg-blue-50/70",
    softBadge: "text-blue-700",
    hero: "border-blue-200 bg-gradient-to-br from-blue-50 to-white"
  },
  violet: {
    railActive: "border-violet-600",
    railDone: "border-violet-300",
    eyebrow: "text-violet-700",
    icon: "bg-violet-100 text-violet-700",
    softPanel: "border-violet-200 bg-violet-50/70",
    softBadge: "text-violet-700",
    hero: "border-violet-200 bg-gradient-to-br from-violet-50 to-white"
  },
  amber: {
    railActive: "border-amber-500",
    railDone: "border-amber-300",
    eyebrow: "text-amber-700",
    icon: "bg-amber-100 text-amber-700",
    softPanel: "border-amber-200 bg-amber-50/70",
    softBadge: "text-amber-700",
    hero: "border-amber-200 bg-gradient-to-br from-amber-50 to-white"
  },
  emerald: {
    railActive: "border-emerald-600",
    railDone: "border-emerald-300",
    eyebrow: "text-emerald-700",
    icon: "bg-emerald-100 text-emerald-700",
    softPanel: "border-emerald-200 bg-emerald-50/70",
    softBadge: "text-emerald-700",
    hero: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
  }
} as const;

export default function IncidentFlowDemoPage() {
  const [phoneExpanded, setPhoneExpanded] = useState(false);
  const [activeStep, setActiveStep] = useState<(typeof steps)[number]["key"]>("email");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const updateActiveStep = () => {
      const container = scrollContainerRef.current;

      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const targetY = containerRect.top + containerRect.height * 0.35;

      let closestStep = steps[0].key;
      let closestDistance = Number.POSITIVE_INFINITY;

      steps.forEach((step) => {
        const element = sectionRefs.current[step.key];
        if (!element) return;

        const rect = element.getBoundingClientRect();
        const distance = Math.abs(rect.top - targetY);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestStep = step.key;
        }
      });

      setActiveStep(closestStep);
    };

    updateActiveStep();

    const container = scrollContainerRef.current;
    container?.addEventListener("scroll", updateActiveStep, { passive: true });
    window.addEventListener("resize", updateActiveStep);

    return () => {
      container?.removeEventListener("scroll", updateActiveStep);
      window.removeEventListener("resize", updateActiveStep);
    };
  }, []);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#dbeafe,transparent_28%),linear-gradient(180deg,#f8fafc_0%,#f3f6fb_100%)] px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-[1460px]">
        <div className="grid gap-14 lg:grid-cols-[230px_minmax(0,940px)] lg:justify-center">
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">
              Incident email to mobile review
            </h1>

            <div className="relative mt-6">
              <div className="absolute left-[15px] top-3 h-[calc(100%-24px)] w-px bg-slate-200" />
              <div className="space-y-5">
                {steps.map((step, index) => {
                  const accent = accentClasses[step.accent];
                  const isActive = activeStep === step.key;
                  const isPassed =
                    steps.findIndex((item) => item.key === activeStep) > index;

                  return (
                    <div key={step.key} className="relative flex w-full items-start gap-4 text-left">
                      <div
                        className={`relative z-10 mt-1 h-8 w-8 rounded-full border-4 bg-white ${
                          isActive
                            ? accent.railActive
                            : isPassed
                              ? accent.railDone
                              : "border-slate-300"
                        }`}
                      />
                      <div>
                        <div
                          className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                            isActive ? accent.eyebrow : "text-slate-500"
                          }`}
                        >
                          {step.eyebrow}
                        </div>
                        <div
                          className={`mt-1 text-sm font-bold ${
                            isActive ? "text-slate-950" : "text-slate-700"
                          }`}
                        >
                          {step.title}
                        </div>
                        <div
                          className={`mt-1 text-sm leading-6 ${
                            isActive ? "text-slate-600" : "text-slate-500"
                          }`}
                        >
                          {step.summary}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="mt-6 text-sm leading-6 text-slate-600">
              Scroll down through the flow, then use the phone mock to open the incident card and
              review the report.
            </p>
          </aside>

          <section
            ref={(element) => {
              scrollContainerRef.current = element;
            }}
            className="space-y-8 lg:h-[calc(100vh-96px)] lg:snap-y lg:snap-mandatory lg:overflow-y-auto lg:pr-2"
          >
            <article
              ref={(element) => {
                sectionRefs.current.email = element;
              }}
              className="min-h-[86vh] snap-start snap-always rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accentClasses.blue.icon}`}>
                  <Mail size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Step 1
                  </p>
                  <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
                    Email catch
                  </h2>
                </div>
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-6">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Why it matters
                  </div>
                  <div className="mt-3 space-y-3 text-sm leading-7 text-slate-700">
                    <p>
                      The email arrives in plain language from the facility, which is realistic for
                      how evening incidents are actually reported.
                    </p>
                    <p>
                      This is the raw handoff point before any parsing or downstream routing happens.
                    </p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center gap-2 border-b border-slate-200 bg-[#f3f2f1] px-5 py-3">
                    <div className="h-3 w-3 rounded-full bg-[#c8c6c4]" />
                    <div className="h-3 w-3 rounded-full bg-[#c8c6c4]" />
                    <div className="h-3 w-3 rounded-full bg-[#c8c6c4]" />
                    <div className="ml-3 text-sm font-semibold text-slate-700">Outlook</div>
                  </div>
                  <div className="p-6">
                    <div className="rounded-2xl border border-slate-200 bg-[#f8fafc] p-4">
                      <div className="grid gap-2 text-sm md:grid-cols-[72px_1fr]">
                        <div className="font-semibold text-slate-500">From</div>
                        <div className="text-slate-900">unitlead@sanpablo.org</div>
                        <div className="font-semibold text-slate-500">To</div>
                        <div className="text-slate-900">incidents@alamohm.com</div>
                        <div className="font-semibold text-slate-500">Subject</div>
                        <div className="font-semibold text-slate-900">
                          Urgent Incident Report - San Pablo Evening Shift
                        </div>
                        <div className="font-semibold text-slate-500">Time</div>
                        <div className="text-slate-900">8:44 PM</div>
                      </div>
                    </div>
                    <pre className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                      {emailBody}
                    </pre>
                  </div>
                </div>
              </div>
            </article>

            <article
              ref={(element) => {
                sectionRefs.current.parsed = element;
              }}
              className="min-h-[86vh] snap-start snap-always rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accentClasses.violet.icon}`}>
                  <Sparkles size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Step 2
                  </p>
                  <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
                    Reasoning and structured parse
                  </h2>
                </div>
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-6">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Model reasoning
                  </div>
                  <div className="mt-3 space-y-3 text-sm leading-7 text-slate-700">
                    <p>
                      The model detects active escalation, supervisor response, and seclusion review,
                      which together raise priority.
                    </p>
                    <p>
                      It extracts the incident type, facility, resident, time, and unresolved family
                      notification from the email body.
                    </p>
                    <p>
                      It recommends leadership visibility now and mobile follow-up for the evening
                      manager.
                    </p>
                  </div>
                </div>

                <div className={`rounded-[24px] border p-6 ${accentClasses.violet.softPanel}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className={`text-xs font-semibold uppercase tracking-[0.16em] ${accentClasses.violet.softBadge}`}>
                      Parsed output
                    </div>
                    <div className={`rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] ${accentClasses.violet.softBadge}`}>
                      Ready
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {parsedFacts.map((fact) => (
                      <div key={fact.label} className="rounded-2xl bg-white p-4 shadow-sm">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          {fact.label}
                        </div>
                        <div className="mt-2 text-sm font-bold text-slate-900">{fact.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>

            <article
              ref={(element) => {
                sectionRefs.current.pushed = element;
              }}
              className="min-h-[86vh] snap-start snap-always rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accentClasses.amber.icon}`}>
                  <Send size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Step 3
                  </p>
                  <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
                    Push notification to the manager
                  </h2>
                </div>
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-6">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Notification logic
                  </div>
                  <div className="mt-3 space-y-3 text-sm leading-7 text-slate-700">
                    <p>
                      High-priority incidents create a mobile push so the manager can review from
                      home without logging into a full desktop dashboard.
                    </p>
                    <p>
                      The message is short, urgent, and tied directly to the review experience that
                      opens on the phone.
                    </p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="rounded-[22px] border border-slate-200 bg-[#f3f6fb] p-4">
                    <div className="mx-auto w-full max-w-[360px] rounded-[26px] border border-amber-200 bg-white px-4 py-4 shadow-[0_8px_24px_rgba(245,158,11,0.14)]">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                        <span>NOW</span>
                        <span>Notification Center</span>
                      </div>
                      <div className="mt-3 flex items-start gap-4">
                        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accentClasses.amber.icon}`}>
                          <BellRing size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-bold text-slate-900">Alamo Platform</div>
                            <div className="text-xs font-medium text-slate-400">9:01 PM</div>
                          </div>
                          <div className="mt-1 text-sm font-semibold text-slate-800">
                            High-priority incident requires review
                          </div>
                          <div className="mt-1 text-sm leading-6 text-slate-600">
                            San Pablo behavioral escalation. Open the mobile incident review now.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </article>

            <article
              ref={(element) => {
                sectionRefs.current.reviewed = element;
              }}
              className="min-h-[86vh] snap-start snap-always rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_10px_30px_rgba(15,23,42,0.05)]"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${accentClasses.emerald.icon}`}>
                  <Smartphone size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Step 4
                  </p>
                  <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
                    Mobile incident review
                  </h2>
                </div>
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-6">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Evening manager context
                  </div>
                  <div className="mt-3 space-y-3 text-sm leading-7 text-slate-700">
                    <p>
                      This screen is built for someone at home in the evening who needs a 24-hour
                      snapshot stream, not a dense desktop incident center.
                    </p>
                    <p>
                      They expand the rectangle, read the full report, and mark the incident reviewed.
                    </p>
                  </div>
                </div>

                <div className="flex justify-center">
                  <div className="relative w-full max-w-[330px] rounded-[48px] border-[10px] border-[#1f2937] bg-[#1f2937] p-1.5 shadow-[0_26px_80px_rgba(15,23,42,0.24)]">
                    <div className="pointer-events-none absolute left-1/2 top-2.5 z-20 h-6 w-32 -translate-x-1/2 rounded-full bg-[#111827]" />
                    <div className="overflow-hidden rounded-[38px] bg-[#f5f7fb] ring-1 ring-white/10">
                      <div className="flex items-center justify-between border-b border-slate-200/70 px-5 pb-3 pt-4">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
                            Mobile
                          </div>
                          <div className="mt-1 text-lg font-bold tracking-tight text-slate-900">
                            Incident Snapshot
                          </div>
                        </div>
                        <div className="text-xs font-semibold text-slate-500">9:02 PM</div>
                      </div>

                      <div className="space-y-4 px-4 py-4">
                        <div className={`rounded-[20px] border p-4 ${accentClasses.emerald.hero}`}>
                          <div className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${accentClasses.emerald.softBadge}`}>
                            Last 24 Hours
                          </div>
                          <div className="mt-2 text-base font-bold leading-6 text-slate-900">
                            2 high-priority incidents need review
                          </div>
                          <div className="mt-2 text-sm leading-6 text-slate-600">
                            Open the newest card first. Family notification is still pending.
                          </div>
                        </div>

                        <div className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                San Pablo · Behavioral
                              </div>
                              <div className="mt-2 text-base font-bold text-slate-900">R. M.</div>
                              <div className="mt-2 text-sm leading-6 text-slate-700">
                                Escalation required seclusion review and supervisor follow-up.
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <div className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-red-700">
                                High
                              </div>
                              {phoneExpanded ? (
                                <button
                                  onClick={() => setPhoneExpanded(false)}
                                  className="text-slate-500"
                                >
                                  <ChevronUp size={18} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => setPhoneExpanded(true)}
                                  className="text-slate-500"
                                >
                                  <ChevronDown size={18} />
                                </button>
                              )}
                            </div>
                          </div>

                        <div className="mt-4 flex items-center justify-between text-xs font-medium text-slate-500">
                          <span>8:41 PM</span>
                          <span>INC-2041</span>
                        </div>

                          {phoneExpanded && (
                            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                              <div className="rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                                Resident escalated during evening medication pass. Staff attempted verbal
                                de-escalation and supervisor responded. Seclusion review initiated per
                                protocol. Family notification remains pending.
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                                  <ShieldAlert size={16} className="text-blue-700" />
                                  Evening manager review
                                </div>
                                <button className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                                  Mark reviewed
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="pointer-events-none absolute bottom-1.5 left-1/2 h-1.5 w-24 -translate-x-1/2 rounded-full bg-white/10" />
                  </div>
                </div>
              </div>
            </article>
          </section>
        </div>
      </div>
    </main>
  );
}
