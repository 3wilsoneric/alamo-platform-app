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
  const homePage = PLATFORM_PAGES[0]!;
  const workspacePages = PLATFORM_PAGES.slice(1);

  return (
    <nav
      aria-label="Platform pages"
      data-platform-page-navigation="true"
      data-platform-page-current={active}
      className="pointer-events-none absolute inset-x-3 top-2 z-40 flex items-start justify-between sm:inset-x-6 sm:top-4"
    >
      <div className="min-w-0 shrink">
        {active === "home" ? (
          <div aria-current="page" data-platform-page-active="home" className="pointer-events-auto flex min-h-11 items-center sm:min-h-10">
            <PlatformWordmark compact />
          </div>
        ) : (
          <button
            type="button"
            aria-label="Back to California map"
            data-platform-page-target={homePage.id}
            data-platform-page-side="left"
            data-california-hero-action={homePage.id}
            data-california-carousel-back="true"
            onClick={() => onNavigate("home")}
            className="pointer-events-auto flex min-h-11 max-w-full items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0f8b73] sm:min-h-10"
          >
            <PlatformWordmark compact />
          </button>
        )}
      </div>

      <div className="pointer-events-auto flex shrink-0 items-center gap-1.5" data-platform-primary-links="true">
        {workspacePages.map((page) => (
          <PageLink
            key={page.id}
            page={page}
            active={active === page.id}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </nav>
  );
}

function PageLink({
  page,
  active,
  onNavigate
}: {
  page: (typeof PLATFORM_PAGES)[number];
  active: boolean;
  onNavigate: (page: Exclude<PlatformPage, "admissions">) => void;
}) {
  const destination = page.id;
  const className = `inline-flex min-h-11 items-center justify-center whitespace-nowrap border px-2.5 font-sans text-[12px] font-medium tracking-[-0.02em] backdrop-blur-sm transition-[background-color,border-color,color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f8b73] sm:min-h-10 sm:px-3.5 sm:text-[14px] ${
    active
      ? "border-[#9fbdb4] bg-[#edf4f1] text-[#174f42]"
      : "border-transparent bg-white/90 text-[#315b54] hover:text-[#0f8b73]"
  }`;

  if (destination === "admissions") {
    return (
      <a
        href={page.href}
        aria-current={active ? "page" : undefined}
        data-platform-page-target={page.id}
        data-platform-page-side="right"
        data-platform-page-active={active ? page.id : undefined}
        data-california-hero-action="admissions"
        className={className}
      >
        {page.label}
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-label={page.label}
      aria-current={active ? "page" : undefined}
      data-platform-page-target={page.id}
      data-platform-page-side="right"
      data-platform-page-active={active ? page.id : undefined}
      data-california-hero-action={page.id}
      onClick={() => onNavigate(destination)}
      className={className}
    >
      {page.label}
    </button>
  );
}
