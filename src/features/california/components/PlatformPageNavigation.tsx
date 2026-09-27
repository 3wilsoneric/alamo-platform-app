import { ArrowLeft, ArrowRight } from "lucide-react";
import { PlatformWordmark } from "../../../shared/branding/PlatformWordmark";

export type PlatformPage = "home" | "admissions" | "analytics";

const PLATFORM_PAGES: Array<{
  id: PlatformPage;
  label: string;
  href: string;
}> = [
  { id: "home", label: "Home", href: "/home" },
  { id: "analytics", label: "Analytics", href: "/analytics" },
  { id: "admissions", label: "Admissions", href: "/admissions" }
];

export default function PlatformPageNavigation({
  active,
  onNavigate
}: {
  active: PlatformPage;
  onNavigate: (page: Exclude<PlatformPage, "admissions">) => void;
}) {
  const activeIndex = PLATFORM_PAGES.findIndex((page) => page.id === active);
  const previousPages = PLATFORM_PAGES.filter(
    (page) => PLATFORM_PAGES.findIndex((candidate) => candidate.id === page.id) < activeIndex
  );
  const nextPages = PLATFORM_PAGES.filter(
    (page) => PLATFORM_PAGES.findIndex((candidate) => candidate.id === page.id) > activeIndex
  );
  const leftPages = previousPages.filter(
    (page) => !(active === "admissions" && page.id === "analytics")
  );
  const rightPages = [
    ...(active === "admissions" ? previousPages.filter((page) => page.id === "analytics") : []),
    ...nextPages
  ];

  return (
    <nav
      aria-label="Platform pages"
      data-platform-page-navigation="true"
      data-platform-page-current={active}
      className="pointer-events-none absolute inset-x-4 top-2 z-40 flex items-start justify-between sm:inset-x-6 sm:top-5"
    >
      <div className="flex flex-col items-start gap-2 sm:gap-2.5">
        {active === "home" ? (
          <div aria-current="page" data-platform-page-active="home" className="pointer-events-auto flex min-h-11 items-center sm:min-h-0">
            <PlatformWordmark />
          </div>
        ) : null}
        {leftPages.map((page) => (
          <PageLink
            key={page.id}
            page={page}
            side="left"
            onNavigate={onNavigate}
          />
        ))}
      </div>

      <div className="flex flex-col items-end gap-2 sm:gap-2.5">
        {rightPages.map((page) => (
          <PageLink
            key={page.id}
            page={page}
            side="right"
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </nav>
  );
}

function PageLink({
  page,
  side,
  onNavigate
}: {
  page: (typeof PLATFORM_PAGES)[number];
  side: "left" | "right";
  onNavigate: (page: Exclude<PlatformPage, "admissions">) => void;
}) {
  const destination = page.id;
  const isHome = destination === "home";
  const className = "group pointer-events-auto inline-flex min-h-11 items-center gap-2 whitespace-nowrap bg-white/90 font-sans text-[14px] font-bold tracking-[-0.045em] text-[#315b54] backdrop-blur-sm transition-colors hover:text-[#0f8b73] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0f8b73] sm:min-h-7 sm:text-[17px]";
  const content = <>
    {side === "left" ? (
      <ArrowLeft className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:-translate-x-1" />
    ) : null}
    {isHome ? <PlatformWordmark compact /> : <span>{page.label}</span>}
    {side === "right" ? (
      <ArrowRight className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
    ) : null}
  </>;

  if (destination === "admissions") {
    return (
      <a
        href={page.href}
        data-platform-page-target={page.id}
        data-platform-page-side={side}
        data-california-hero-action="admissions"
        className={className}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-label={isHome ? "Back to California map" : page.label}
      data-platform-page-target={page.id}
      data-platform-page-side={side}
      data-california-hero-action={page.id}
      data-california-carousel-back={isHome ? "true" : undefined}
      onClick={() => onNavigate(destination)}
      className={className}
    >
      {content}
    </button>
  );
}
