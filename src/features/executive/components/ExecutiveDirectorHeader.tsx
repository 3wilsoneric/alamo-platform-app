import { Link, NavLink } from "react-router-dom";
import { PlatformUserIdentity } from "../../../shared/auth/PlatformUserIdentity";
import { PlatformWordmark } from "../../../shared/branding/PlatformWordmark";

export function ExecutiveDirectorHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#dfe3e0] bg-white/95 pt-[var(--platform-safe-top)] backdrop-blur print:hidden">
      <nav
        aria-label="Executive Director workspace"
        className="mx-auto flex h-[var(--platform-header-bar-height)] max-w-[1480px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
      >
        <Link to="/executive/dashboard" aria-label="Community dashboard home" className="flex min-h-11 min-w-0 items-center">
          <span className="hidden h-9 w-9 place-items-center max-[359px]:grid">
            <img src="/brand/alamo-head-tree-mark.png" alt="" aria-hidden="true" className="max-h-9 max-w-9 object-contain" />
          </span>
          <span className="max-[359px]:hidden"><PlatformWordmark compact /></span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center rounded-xl border border-[#d9dfdc] bg-[#f8faf9] p-1">
            <ExecutiveNavLink to="/executive/dashboard" label="Community" />
            <ExecutiveNavLink to="/executive/licensing" label="Licensing" />
          </div>
          <PlatformUserIdentity nameSide="bottom" />
        </div>
      </nav>
    </header>
  );
}

function ExecutiveNavLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `inline-flex min-h-9 items-center rounded-lg px-2.5 text-[12px] font-semibold transition-colors sm:px-4 sm:text-[14px] ${isActive ? "bg-white text-[#086c57] shadow-sm" : "text-[#66706b] hover:text-[#242a27]"}`}
    >
      {label}
    </NavLink>
  );
}
