import type { ReactNode } from "react";
import type { CanvasModuleId } from "../../../../shared/platform-module-registry.mjs";
import { getPlatformModuleByCanvasId } from "../../../../shared/platform-module-registry.mjs";
import type { ModuleContext } from "../chatHistory";
import AppErrorBoundary from "../../../shared/ui/AppErrorBoundary";
import CommunitiesModule from "../../communities/pages/AppHomePage";
import CommunityDetailModule from "../../communities/pages/CommunitiesPage";
import IncidentCenterModule from "../../incidents/pages/IncidentCenterPage";
import GlossaryModule from "../../glossary/pages/GlossaryPage";
import CommandCenterModule from "../../command-center/pages/CommandCenterPage";
import DataExplorerModule from "../../explorer/pages/DataExplorerPage";
import ResidentSearchModule from "../../../shared/modules/ResidentSearchModule";
import CommunityCensusSurface from "../../communities/components/CommunityCensusSurface";
import CommunityDashboardSurface from "../../communities/components/CommunityDashboardSurface";

type ModuleKey = CanvasModuleId;

function getModuleTitle(module: ModuleKey, context?: ModuleContext) {
  const definition = getPlatformModuleByCanvasId(
    module,
    context?.focus ?? (module === "residentSearch" ? "search" : null)
  );
  return definition?.title ?? "Platform module";
}

export function PlatformModuleRenderer({ module, context }: { module: ModuleKey; context?: ModuleContext }) {
  const communityDetail = context?.facilityId
    ? context.focus === "census" || context.focus === "trend"
      ? <CommunityCensusSurface facilityId={context.facilityId} />
      : context.focus === "incidents" || context.focus === "residents"
        ? (
          <CommunityDashboardSurface
            facilityId={context.facilityId}
            focus={context.focus}
            category={context.category ?? null}
            month={context.month ?? null}
            residentId={context.residentId ?? null}
          />
        )
        : <CommunityDashboardSurface facilityId={context.facilityId} focus="detail" />
    : <CommunityDetailModule embedded />;
  const modules: Record<ModuleKey, ReactNode> = {
    communities: <CommunitiesModule />,
    communityDetail,
    residentSearch: (
      <ResidentSearchModule
        embedded
        facilityId={context?.facilityId ?? null}
        initialResidentId={context?.residentId ?? null}
        initialQuery={context?.query ?? null}
      />
    ),
    incidents: <IncidentCenterModule embedded />,
    dataExplorer: <DataExplorerModule />,
    glossary: <GlossaryModule />,
    command: <CommandCenterModule embedded />
  };

  return (
    <AppErrorBoundary label={getModuleTitle(module, context)} resetKey={`${module}:${context?.route ?? ""}:${context?.focus ?? ""}`} compact>
      <div
        className="pt-14"
        data-platform-module={module}
        data-platform-facility-id={context?.facilityId ?? ""}
        data-platform-focus={context?.focus ?? ""}
        data-platform-category={context?.category ?? ""}
        data-platform-month={context?.month ?? ""}
        data-platform-resident-id={context?.residentId ?? ""}
        data-platform-query={context?.query ?? ""}
      >
        {modules[module]}
      </div>
    </AppErrorBoundary>
  );
}
