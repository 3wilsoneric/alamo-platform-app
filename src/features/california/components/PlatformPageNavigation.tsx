import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { PlatformWordmark } from "../../../shared/branding/PlatformWordmark";
import { PlatformUserIdentity } from "../../../shared/auth/PlatformUserIdentity";

const PLATFORM_PAGES = [
  { id: "home", label: "Communities", href: "/home" },
  { id: "analytics", label: "Analytics", href: "/analytics" },
  { id: "admissions", label: "Admissions", href: "/admissions" },
  { id: "licensing", label: "Licensing", href: "/licensing" }
];

export default function PlatformPageNavigation({ restricted = false }: { restricted?: boolean }) {
  const { pathname } = useLocation();
  const active = pathname.startsWith("/analytics") || pathname.startsWith("/reports") || pathname === "/questions"
    ? "analytics"
    : pathname.startsWith("/admissions") ? "admissions"
      : pathname.startsWith("/licensing") ? "licensing"
        : pathname === "/" || pathname.startsWith("/home") || pathname.startsWith("/communities") ? "home" : "";
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const pages = restricted ? PLATFORM_PAGES.filter((page) => page.id === "admissions") : PLATFORM_PAGES;

  useEffect(() => { setMenuOpen(false); }, [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
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
          <PlatformUserIdentity className="ml-3" />
        </div>
        <button type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="platform-mobile-menu" onClick={() => setMenuOpen((open) => !open)} className="inline-flex min-h-11 shrink-0 items-center gap-2 px-2 text-sm font-semibold text-[#315b54] md:hidden">
          <span>Menu</span>{menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </nav>
      {menuOpen ? (
        <nav id="platform-mobile-menu" aria-label="Mobile platform pages" className="absolute inset-x-0 top-full border-b border-[#bfd1cb] bg-white px-4 pb-3 md:hidden">
          {pages.map((page) => <Link key={page.id} to={page.href} onClick={() => setMenuOpen(false)} aria-current={active === page.id ? "page" : undefined} className={`flex min-h-12 items-center border-b border-[#edf1ef] px-3 text-base ${active === page.id ? "bg-[#eef5f1] font-semibold text-[#096a58]" : "text-[#315b54]"}`}>{page.label}</Link>)}
          <div className="flex min-h-14 items-center px-3"><PlatformUserIdentity nameSide="right" /></div>
        </nav>
      ) : null}
    </header>
  );
}
