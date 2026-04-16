import { Building2, ClipboardList, House } from "lucide-react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/mobile/summary", label: "Summary", icon: House },
  { to: "/mobile/incidents", label: "Incidents", icon: ClipboardList },
  { to: "/mobile/facilities", label: "Facilities", icon: Building2 }
];

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-md -translate-x-1/2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
      <div className="flex w-full items-center justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex min-w-[88px] flex-col items-center gap-1 rounded-2xl px-3 py-2 text-xs font-semibold transition-colors ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-500 hover:text-slate-800"
                }`
              }
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
