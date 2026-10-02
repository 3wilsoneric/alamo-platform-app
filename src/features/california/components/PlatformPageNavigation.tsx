import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { PlatformWordmark } from "../../../shared/branding/PlatformWordmark";
import { PlatformUserIdentity } from "../../../shared/auth/PlatformUserIdentity";
import { usePlatformOwnerAccess } from "../../../shared/auth/platformOwnerAccess";

const PLATFORM_PAGES = [
  { id: "home", label: "Communities", href: "/home" },
  { id: "analytics", label: "Analytics", href: "/analytics" },
  { id: "admissions", label: "Admissions", href: "/admissions" },
  { id: "workforce", label: "Workforce", href: "/workforce", ownerOnly: true }
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
  const canViewOwnerWorkspace = usePlatformOwnerAccess();
  const pages = restricted ? PLATFORM_PAGES.filter((page) => page.id === "admissions") : PLATFORM_PAGES.filter((page) => !page.ownerOnly || canViewOwnerWorkspace);

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
    <header ref={headerRef} data-platform-header="true" className="sticky top-0 z-40 h-[var(--platform-header-height)] border-b border-[#e0e7e3] bg-white print:hidden">
      <nav aria-label="Platform pages" data-platform-page-navigation="true" data-platform-page-current={active} className="flex h-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link to={restricted ? "/admissions" : "/home"} aria-label={restricted ? "Admissions home" : "Back to California map"} aria-current={active === "home" ? "page" : undefined} data-platform-page-target="home" data-platform-page-side="left" data-california-carousel-back="true" className="flex min-h-11 min-w-0 items-center">
          <PlatformWordmark compact />
        </Link>
        <div className="hidden h-full items-center gap-1 md:flex" data-platform-primary-links="true">
          {pages.filter((page) => page.id !== "home").map((page) => (
            <Link key={page.id} to={page.href} aria-current={active === page.id ? "page" : undefined} data-platform-page-target={page.id} data-platform-page-side="right" data-california-hero-action={page.id} data-platform-page-active={active === page.id ? page.id : undefined} className={`inline-flex h-full items-center border-b-2 px-4 text-[14px] font-semibold transition-colors ${active === page.id ? "border-[#0f8b73] text-[#096a58]" : "border-transparent text-[#4b6059] hover:border-[#bfd1cb] hover:text-[#096a58]"}`}>
              {page.label}
            </Link>
          ))}
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
          <div className="border-t border-[#dce5e0]">
            {pages.map((page) => (
              <Link
                key={page.id}
                to={page.href}
                onClick={() => setMenuOpen(false)}
                aria-current={active === page.id ? "page" : undefined}
                className={`flex min-h-16 items-center justify-between border-b border-[#dce5e0] px-3 text-[18px] font-medium tracking-[-0.025em] transition-colors ${active === page.id ? "bg-[#eef5f1] text-[#096a58]" : "text-[#315b54] hover:bg-[#f7faf8] hover:text-[#096a58]"}`}
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
