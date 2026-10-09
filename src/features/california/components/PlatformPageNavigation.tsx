import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { PlatformWordmark } from "../../../shared/branding/PlatformWordmark";
import { PlatformUserIdentity } from "../../../shared/auth/PlatformUserIdentity";

const PLATFORM_PAGES = [
  { id: "home", label: "Communities", href: "/home" },
  { id: "analytics", label: "Analytics", href: "/analytics" },
  { id: "admissions", label: "Admissions", href: "/admissions" },
  { id: "workforce", label: "Workforce", href: "/workforce" }
];

export default function PlatformPageNavigation({ restricted = false }: { restricted?: boolean }) {
  const { pathname } = useLocation();
  const active = pathname.startsWith("/analytics") || pathname.startsWith("/reports") || pathname === "/questions" || pathname === "/licensing"
    ? "analytics"
    : pathname.startsWith("/admissions") ? "admissions"
      : pathname.startsWith("/workforce") ? "workforce"
      : pathname.startsWith("/outreach") || pathname.startsWith("/fiftystate") ? "outreach"
      : pathname === "/" || pathname.startsWith("/home") || pathname.startsWith("/communities") ? "home" : "";
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const pages = restricted ? PLATFORM_PAGES.filter((page) => page.id === "admissions") : PLATFORM_PAGES;

  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dismiss = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      headerRef.current?.querySelector<HTMLButtonElement>("[aria-controls='platform-mobile-menu']")?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  return (
    <header ref={headerRef} data-platform-header="true" className="sticky top-0 z-40 h-[var(--platform-header-height)] border-b border-[#dedfda] bg-white pt-[var(--platform-safe-top)] print:hidden">
      <nav aria-label="Platform pages" data-platform-page-navigation="true" data-platform-page-current={active} className="flex h-[var(--platform-header-bar-height)] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link to={restricted ? "/admissions" : "/home"} aria-label={restricted ? "Admissions home" : "Back to California map"} aria-current={active === "home" ? "page" : undefined} data-platform-page-target="home" data-platform-page-side="left" data-california-carousel-back="true" className="flex min-h-11 min-w-0 items-center">
          <PlatformWordmark compact />
        </Link>
        <div className="hidden items-center gap-1.5 md:flex" data-platform-primary-links="true">
          <div className="flex h-10 items-center gap-1 rounded-xl border border-[#dfe3e0] bg-white p-1">
          {pages.filter((page) => page.id !== "home").map((page) => (
            <Link key={page.id} to={page.href} aria-current={active === page.id ? "page" : undefined} data-platform-page-target={page.id} data-platform-page-side="right" data-california-hero-action={page.id} data-platform-page-active={active === page.id ? page.id : undefined} className={`inline-flex h-8 items-center rounded-lg border px-3.5 text-[14px] font-medium transition-[background-color,border-color,color] ${active === page.id ? "border-[#b8d8ca] bg-[#eaf5ef] text-[#086c57]" : "border-transparent text-[#282d2a] hover:border-[#d7dfda] hover:bg-[#f7f9f8] hover:text-[#086c57]"}`}>
              {page.label}
            </Link>
          ))}
          </div>
          <PlatformUserIdentity className="ml-3" nameSide="bottom" />
        </div>
        <button type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="platform-mobile-menu" onClick={() => setMenuOpen((open) => !open)} className="inline-flex min-h-11 shrink-0 items-center gap-2 px-2 text-sm font-semibold text-[#315b54] md:hidden">
          <span>Menu</span>{menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </nav>
      {menuOpen ? (
        <nav
          id="platform-mobile-menu"
          aria-label="Mobile platform pages"
          data-platform-mobile-menu="true"
          className="fixed inset-x-0 bottom-0 top-[var(--platform-header-height)] z-50 flex flex-col overflow-y-auto bg-white px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-4 md:hidden"
        >
          <div className="overflow-hidden rounded-2xl border border-[#dfe3e0] bg-white">
            {pages.map((page) => (
              <Link
                key={page.id}
                to={page.href}
                onClick={() => setMenuOpen(false)}
                aria-current={active === page.id ? "page" : undefined}
                className={`flex min-h-16 items-center justify-between border-b border-[#e1e5e2] px-4 text-[18px] font-medium tracking-[-0.025em] transition-colors last:border-b-0 ${active === page.id ? "bg-[#eaf5ef] text-[#086c57]" : "text-[#242a27] hover:bg-[#f7f9f8] hover:text-[#086c57]"}`}
              >
                <span>{page.label}</span>
                {active === page.id ? <span className="h-2 w-2 rounded-full bg-[#0f8b73]" aria-hidden="true" /> : null}
              </Link>
            ))}
          </div>
          <div className="mt-auto flex min-h-16 items-end border-t border-[#edf1ef] px-3 pt-4">
            <PlatformUserIdentity nameSide="right" />
          </div>
        </nav>
      ) : null}
    </header>
  );
}
