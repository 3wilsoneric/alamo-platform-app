import { Outlet } from "react-router-dom";
import { BellDot } from "lucide-react";
import BottomNav from "../components/BottomNav";

export default function MobileShell() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-[#F7F8F4] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-[#F7F8F4]/95 px-4 pb-3 pt-5 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
              Alamo Platform
            </p>
            <h1 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
              Mobile Operations
            </h1>
          </div>
          <button className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-100 bg-white text-emerald-700 shadow-sm">
            <BellDot size={18} />
          </button>
        </div>
      </header>
      <main className="flex-1 px-4 pb-24 pt-5">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
