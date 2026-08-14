import { useEffect, useState } from "react";
import { getStateResearchDossier } from "../data/stateResearchData";
import {
  GOVERNANCE_OPTIONS,
  STATE_TARGETING_BY_NAME,
  type StateTargetingRecord
} from "../data/stateTargetingData";

interface StateTargetingMapProps {
  matchingStateNames: ReadonlySet<string>;
  onSelect: (record: StateTargetingRecord) => void;
}

interface TooltipState {
  record: StateTargetingRecord;
  x: number;
  y: number;
}

interface UsaMapLocation {
  id: string;
  name?: string;
  path: string;
}

interface UsaMapDefinition {
  viewBox: string;
  locations: UsaMapLocation[];
}

function tooltipPosition(clientX: number, clientY: number) {
  const width = 260;
  const x = Math.min(Math.max(12, clientX + 16), window.innerWidth - width - 12);
  const y = Math.min(Math.max(12, clientY + 16), window.innerHeight - 132);
  return { x, y };
}

export default function StateTargetingMap({
  matchingStateNames,
  onSelect
}: StateTargetingMapProps) {
  const [usaMap, setUsaMap] = useState<UsaMapDefinition | null>(null);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    let mounted = true;

    void import("@svg-maps/usa")
      .then((module) => {
        if (mounted) {
          setUsaMap(module.default as UsaMapDefinition);
        }
      })
      .catch(() => {
        if (mounted) {
          setMapLoadFailed(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  function showPointerTooltip(
    record: StateTargetingRecord,
    clientX: number,
    clientY: number
  ) {
    setTooltip({ record, ...tooltipPosition(clientX, clientY) });
  }

  if (!usaMap) {
    return (
      <div
        role={mapLoadFailed ? "alert" : "status"}
        className="grid min-h-[360px] place-items-center px-6 text-center text-[14px] text-[#595959]"
      >
        {mapLoadFailed
          ? "The map could not load. Use the state index to open any profile."
          : "Loading the state map..."}
      </div>
    );
  }

  return (
    <div className="relative">
      <svg
        viewBox={usaMap.viewBox}
        role="img"
        aria-labelledby="fifty-state-map-title fifty-state-map-description"
        className="block h-auto w-full overflow-visible"
      >
        <title id="fifty-state-map-title">Behavioral-health market priorities by state</title>
        <desc id="fifty-state-map-description">
          Select a highlighted state to open its capacity baseline, demand research where available,
          buyer route, target roles, recommended evidence case, and sources.
        </desc>
        <g>
          {usaMap.locations.map((location) => {
            if (!location.name) return null;
            const record = STATE_TARGETING_BY_NAME.get(location.name);
            if (!record) return null;

            const matches = matchingStateNames.has(record.stateName);
            const fill = matches
              ? GOVERNANCE_OPTIONS[record.primaryGovernanceCode].color
              : "#ecebea";

            return (
              <path
                key={location.id}
                d={location.path}
                role="button"
                aria-label={`Open ${record.stateName} targeting profile`}
                aria-disabled={!matches}
                tabIndex={matches ? 0 : -1}
                data-state-code={record.stateCode}
                className={`origin-center outline-none transition-[fill,opacity,stroke,filter] duration-150 ${
                  matches
                    ? "cursor-pointer hover:brightness-90 focus:brightness-90"
                    : "pointer-events-none opacity-70"
                }`}
                style={{
                  fill,
                  stroke: "#ffffff",
                  strokeWidth: matches ? 1.5 : 1,
                  vectorEffect: "non-scaling-stroke"
                }}
                onPointerEnter={(event) => {
                  if (matches) {
                    showPointerTooltip(record, event.clientX, event.clientY);
                  }
                }}
                onPointerMove={(event) => {
                  if (matches) {
                    showPointerTooltip(record, event.clientX, event.clientY);
                  }
                }}
                onPointerLeave={() => setTooltip(null)}
                onFocus={(event) => {
                  const bounds = event.currentTarget.getBoundingClientRect();
                  showPointerTooltip(record, bounds.left + bounds.width / 2, bounds.top);
                }}
                onBlur={() => setTooltip(null)}
                onClick={() => {
                  if (matches) {
                    setTooltip(null);
                    onSelect(record);
                  }
                }}
                onKeyDown={(event) => {
                  if (matches && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    setTooltip(null);
                    onSelect(record);
                  }
                }}
              />
            );
          })}
        </g>
      </svg>

      {tooltip ? (
        <MapTooltip tooltip={tooltip} />
      ) : null}
    </div>
  );
}

function MapTooltip({ tooltip }: { tooltip: TooltipState }) {
  const research = getStateResearchDossier(tooltip.record);
  return (
    <div
      role="status"
      className="pointer-events-none fixed z-[80] w-[260px] border border-[#111111] border-t-[3px] border-t-[#0f8b73] bg-white px-4 py-3 text-left shadow-[0_12px_34px_rgba(0,0,0,0.16)]"
      style={{ left: tooltip.x, top: tooltip.y }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-serif text-[20px] font-semibold leading-tight text-[#111111]">
            {tooltip.record.stateName}
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#595959]">
            {research.coverage === "verified-demand" ? `Research priority #${research.demandRank}` : "National baseline"}
          </div>
        </div>
        <span className="text-[12px] font-semibold text-[#595959]">
          {tooltip.record.stateCode}
        </span>
      </div>
      <p className="mt-2 text-[13px] font-semibold text-[#111111]">
        {research.bedSupply.rate.toFixed(1)} state beds per 100k
      </p>
      <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#444444]">
        Start with {tooltip.record.primaryTarget}.
      </p>
    </div>
  );
}
