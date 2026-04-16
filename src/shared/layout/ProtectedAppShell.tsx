import { ArrowLeft } from "lucide-react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import PlatformHeader from "../navigation/PlatformHeader";
import FloatingUtilityStack from "../navigation/FloatingUtilityStack";

const isAuthenticated = true;

export default function ProtectedAppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAssistantView = location.pathname.startsWith("/assistant");
  const showBackToHelper = Boolean((location.state as { fromAssistant?: boolean } | null)?.fromAssistant);
  const pathSegments = location.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => ({
      segment,
      label: segment
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    }));
  const showBreadcrumbs = pathSegments.length > 0 && location.pathname !== "/home";

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (isAssistantView) {
    return (
      <div className="min-h-screen bg-[#f7f7f3]">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <PlatformHeader />
      <FloatingUtilityStack />
      {showBackToHelper && (
        <button
          onClick={() =>
            navigate("/assistant", {
              state: {
                restoredFromPage: location.pathname
              }
            })
          }
          className="fixed right-5 top-5 z-40 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/94 px-3 py-2 text-xs font-semibold text-slate-600 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.35)] backdrop-blur transition-colors hover:border-slate-300 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Ask Helper
        </button>
      )}
      <div className="mx-auto max-w-7xl px-4 pt-3 pb-6 sm:px-6 lg:pl-20">
        {showBreadcrumbs && (
          <div className="mb-3 flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            <button
              onClick={() => navigate("/home")}
              className="transition-colors hover:text-slate-600"
            >
              Home
            </button>
            {pathSegments.map((item, index) => {
              const targetPath = `/${pathSegments
                .slice(0, index + 1)
                .map((segment) => segment.segment)
                .join("/")}`;
              const isCurrent = index === pathSegments.length - 1;

              return (
                <div key={targetPath} className="flex items-center gap-1.5">
                  <span className="text-slate-300">/</span>
                  {isCurrent ? (
                    <span className="text-slate-600">{item.label}</span>
                  ) : (
                    <button
                      onClick={() => navigate(targetPath)}
                      className="transition-colors hover:text-slate-600"
                    >
                      {item.label}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <Outlet />
      </div>
    </div>
  );
}
