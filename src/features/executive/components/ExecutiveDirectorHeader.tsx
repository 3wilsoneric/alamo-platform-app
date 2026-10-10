import { Link, NavLink } from "react-router-dom";
import { PlatformUserIdentity } from "../../../shared/auth/PlatformUserIdentity";
import { PlatformWordmark } from "../../../shared/branding/PlatformWordmark";
import "../executiveHeader.css";

export function ExecutiveDirectorHeader() {
  return (
    <header data-executive-director-header="true" className="executive-director-header sticky top-0 z-40 border-b border-[#dfe3e0] bg-white/95 pt-[var(--platform-safe-top)] backdrop-blur print:hidden">
      <nav
        aria-label="Executive Director workspace"
        className="executive-director-header__nav"
      >
        <Link to="/executive/dashboard" aria-label="Community dashboard home" className="executive-director-header__brand">
          <PlatformWordmark compact />
        </Link>
        <div className="executive-director-header__links">
          <div className="executive-director-header__sections">
            <ExecutiveNavLink to="/executive/dashboard" label="Community" />
            <ExecutiveNavLink to="/executive/licensing" label="Licensing" />
          </div>
        </div>
        <PlatformUserIdentity nameSide="bottom" className="executive-director-header__identity min-h-11 min-w-11 justify-center" />
      </nav>
    </header>
  );
}

function ExecutiveNavLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `executive-director-header__link ${isActive ? "is-active" : ""}`}
    >
      {label}
    </NavLink>
  );
}
