import { Link } from "react-router-dom";
import { PlatformUserIdentity } from "../../../shared/auth/PlatformUserIdentity";
import { PlatformWordmark } from "../../../shared/branding/PlatformWordmark";

export function ExecutiveDirectorHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[#dfe3e0] bg-white/95 pt-[var(--platform-safe-top)] backdrop-blur print:hidden">
      <nav
        aria-label="Executive Director workspace"
        className="mx-auto flex h-[var(--platform-header-bar-height)] max-w-[1480px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
      >
        <Link to="/executive/licensing" aria-label="Licensing home" className="flex min-h-11 min-w-0 items-center">
          <PlatformWordmark compact />
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/executive/licensing" aria-current="page" className="hidden min-h-10 items-center rounded-xl border border-[#b8d8ca] bg-[#eef7f2] px-4 text-[14px] font-semibold text-[#086c57] sm:inline-flex">
            Licensing
          </Link>
          <PlatformUserIdentity nameSide="bottom" />
        </div>
      </nav>
    </header>
  );
}
