import { ArrowLeft, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { LICENSING_COMMUNITIES } from "../../../../shared/licensing-contracts.mjs";
import CommunityDashboardSurface, {
  type CommunityDashboardFocus,
  type CommunitySurfaceDestination
} from "../../communities/components/CommunityDashboardSurface";
import ResidentSearchModule from "../../../shared/modules/ResidentSearchModule";
import type { CaliforniaCommunity } from "../data/californiaCommunities";

type CommunityModalView =
  | {
      key: string;
      kind: "dashboard";
      focus: CommunityDashboardFocus;
      category: string | null;
      month: string | null;
      residentId: string | null;
    }
  | {
      key: string;
      kind: "resident-search";
      residentId: string | null;
      query: string | null;
    };

const overviewView = (): CommunityModalView => ({
  key: "dashboard:detail",
  kind: "dashboard",
  focus: "detail",
  category: null,
  month: null,
  residentId: null
});

function viewFromDestination(destination: CommunitySurfaceDestination): CommunityModalView | null {
  const url = new URL(destination.route, window.location.origin);
  const focus = url.searchParams.get("focus");

  if (focus === "search") {
    const residentId = url.searchParams.get("resident");
    const query = url.searchParams.get("query");
    return {
      key: `resident-search:${residentId ?? ""}:${query ?? ""}`,
      kind: "resident-search",
      residentId,
      query
    };
  }

  if (
    focus === "detail" ||
    focus === "census" ||
    focus === "incidents" ||
    focus === "medications" ||
    focus === "residents"
  ) {
    const category = url.searchParams.get("category");
    const month = url.searchParams.get("month");
    const residentId = url.searchParams.get("resident");
    return {
      key: `dashboard:${focus}:${month ?? ""}:${category ?? ""}:${residentId ?? ""}`,
      kind: "dashboard",
      focus,
      category,
      month,
      residentId
    };
  }

  return null;
}

export default function CaliforniaCommunityModal({
  community,
  onClose
}: {
  community: CaliforniaCommunity | null;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [viewStack, setViewStack] = useState<CommunityModalView[]>([overviewView()]);
  const currentView = viewStack.at(-1) ?? overviewView();
  const canGoBack = viewStack.length > 1;

  useEffect(() => {
    setDismissed(false);
    setViewStack([overviewView()]);
  }, [community?.facilityId]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [currentView.key]);

  useEffect(() => {
    if (!community || dismissed) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismissModal();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [community, dismissed, onClose]);

  if (!community || dismissed || typeof document === "undefined") return null;

  function dismissModal() {
    setDismissed(true);
    onClose();
  }

  const pushView = (view: CommunityModalView) => {
    setViewStack((current) => {
      if (current.at(-1)?.key === view.key) return current;
      return [...current, view];
    });
  };
  const openPrimaryView = (focus: CommunityDashboardFocus) => {
    const nextView: CommunityModalView = {
      key: `dashboard:${focus}:`,
      kind: "dashboard",
      focus,
      category: null,
      month: null,
      residentId: null
    };
    setViewStack(focus === "detail" ? [overviewView()] : [overviewView(), nextView]);
  };
  const openResidentSearch = () => {
    pushView({
      key: "resident-search::",
      kind: "resident-search",
      residentId: null,
      query: null
    });
  };
  const openSurface = (destination: CommunitySurfaceDestination) => {
    const nextView = viewFromDestination(destination);
    if (nextView) pushView(nextView);
  };
  const goBack = () => {
    setViewStack((current) => current.length > 1 ? current.slice(0, -1) : current);
  };
  const title =
    currentView.kind === "resident-search"
      ? "Resident search"
      : currentView.focus === "census"
        ? "Census trend"
        : currentView.focus === "incidents"
          ? currentView.category
            ? `${currentView.category} incidents`
            : "Incidents"
          : currentView.focus === "medications"
            ? "Medications"
          : currentView.focus === "residents"
            ? "Resident roster"
            : community.shortName;
  const eyebrow =
    currentView.kind === "dashboard" && currentView.focus === "detail"
      ? `${community.city}, California`
      : community.shortName;

  return createPortal(
    <div
      data-california-modal-backdrop="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#111111]/72 p-0 backdrop-blur-[7px] sm:items-center sm:p-6 lg:p-10"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) dismissModal();
      }}
    >
      <div
        role="presentation"
        data-california-modal-dismiss="true"
        className="absolute inset-0 cursor-default"
        onClick={dismissModal}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="california-community-dialog-title"
        data-california-community-profile={community.facilityId}
        data-california-modal-view={currentView.kind === "dashboard" ? currentView.focus : currentView.kind}
        className="relative z-10 flex h-dvh w-full max-w-[1344px] flex-col overflow-hidden border-t-[3px] border-t-[#0f8b73] bg-white text-[#111111] shadow-[0_24px_90px_rgba(0,0,0,0.42)] sm:h-[88dvh] sm:rounded-[16px] sm:border sm:border-t-[3px] sm:border-[#b3b3b3] sm:border-t-[#0f8b73]"
      >
        <header className="sticky top-0 z-20 shrink-0 border-b border-[#d9d9d9] bg-white">
          <div className="flex items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-5 sm:py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              {canGoBack ? (
                <button
                  type="button"
                  onClick={goBack}
                  aria-label={`Back to ${viewStack.at(-2)?.kind === "resident-search" ? "resident search" : community.communityName}`}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[#d9d9d9] bg-white text-[#595959] transition-colors hover:border-[#111111] hover:text-[#111111] lg:h-8 lg:w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              ) : null}
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#0f8b73]">
                  {eyebrow}
                </p>
                <div
                  id="california-community-dialog-title"
                  role="heading"
                  aria-level={1}
                  className="mt-0.5 break-words font-sans text-[18px] font-semibold leading-tight tracking-[-0.03em] sm:text-[20px]"
                >
                  {title}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {currentView.kind !== "resident-search" ? (
                <button
                  type="button"
                  onClick={openResidentSearch}
                  aria-label="Resident search"
                  className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-[#bdbdbd] bg-white px-2.5 text-[11px] font-semibold transition-colors hover:border-[#111111] hover:bg-[#f5f4ef] lg:h-8 lg:min-w-0 lg:px-3"
                >
                  <Search className="h-4 w-4" />
                  <span className="hidden sm:inline">Resident search</span>
                </button>
              ) : null}
              <button
                ref={closeButtonRef}
                type="button"
                onClick={dismissModal}
                aria-label={`Close ${community.communityName} profile`}
                className="grid h-11 w-11 place-items-center rounded-lg border border-[#d9d9d9] bg-white text-[#595959] transition-colors hover:border-[#111111] hover:text-[#111111] lg:h-8 lg:w-8"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {currentView.kind === "dashboard" ? (
            <nav
              aria-label={`${community.communityName} profile sections`}
              data-community-modal-navigation="true"
              className="flex overflow-x-auto overscroll-x-contain px-3 sm:px-5"
            >
              {([
                ["detail", "Overview"],
                ["census", "Census"],
                ["incidents", "Incidents"],
                ["medications", "Medications"],
                ["residents", "Residents"]
              ] as const).map(([focus, label]) => {
                const active = currentView.focus === focus;
                return (
                  <button
                    key={focus}
                    type="button"
                    data-community-modal-tab={focus}
                    aria-current={active ? "page" : undefined}
                    onClick={() => openPrimaryView(focus)}
                    className={`min-h-11 shrink-0 border-b-2 px-3 py-2 text-[12px] font-semibold transition-colors lg:min-h-0 lg:px-4 lg:text-[11px] ${
                      active
                        ? "border-[#0f8b73] text-[#111111]"
                        : "border-transparent text-[#737373] hover:border-[#b3b3b3] hover:text-[#111111]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
              {LICENSING_COMMUNITIES.some((c) => c.facilityId === community.facilityId) ? (
                <Link
                  to={`/licensing?community=${community.facilityId}`}
                  className="flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-3 py-2 text-[12px] font-semibold text-[#315b54] hover:border-[#0f8b73] lg:min-h-0 lg:px-4 lg:text-[11px]"
                >
                  Licensing
                </Link>
              ) : null}
            </nav>
          ) : null}
        </header>

        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-[calc(16px+env(safe-area-inset-bottom))] pt-2 sm:px-5 sm:py-3">
          {currentView.kind === "resident-search" ? (
            <ResidentSearchModule
              facilityId={community.facilityId}
              embedded
              compact
              initialResidentId={currentView.residentId}
              initialQuery={currentView.query}
              onOpenIncidentHistory={(residentId) => {
                pushView({
                  key: `dashboard:incidents:::${residentId}`,
                  kind: "dashboard",
                  focus: "incidents",
                  category: null,
                  month: null,
                  residentId
                });
              }}
            />
          ) : (
            <CommunityDashboardSurface
              facilityId={community.facilityId}
              focus={currentView.focus}
              category={currentView.category}
              month={currentView.month}
              residentId={currentView.residentId}
              hideHeading
              compact
              onOpenSurface={openSurface}
            />
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}
