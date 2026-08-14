import { useState } from "react";
import type { HomeDashboardResponse } from "../../../shared/types/platformSnapshot";
import { CALIFORNIA_NEIGHBOR_PATHS } from "../data/californiaNeighborPaths";
import { CALIFORNIA_PATH } from "../data/californiaPath";
import type { CaliforniaCommunity } from "../data/californiaCommunities";

interface CaliforniaCommunityMapProps {
  communities: CaliforniaCommunity[];
  dashboard: HomeDashboardResponse | null;
  dashboardUnavailable?: boolean;
  selectedFacilityId: string | null;
  onSelectCommunity: (facilityId: string) => void;
}

const CALIFORNIA_VIEW_BOX = {
  x: 258,
  y: 156,
  width: 210,
  height: 244
};

function formatSignedChange(value: number | null) {
  if (value === null) return "Unavailable";
  if (value > 0) return `+${value.toLocaleString()}`;
  return value.toLocaleString();
}

function censusChangeColor(value: number | null) {
  if (value === null || value === 0) return "#595959";
  return value > 0 ? "#08705d" : "#b34b40";
}

export default function CaliforniaCommunityMap({
  communities,
  dashboard,
  dashboardUnavailable = false,
  selectedFacilityId,
  onSelectCommunity
}: CaliforniaCommunityMapProps) {
  const [hoveredFacilityId, setHoveredFacilityId] = useState<string | null>(null);
  const dashboardByFacility = new Map(
    (dashboard?.communities ?? []).map((community) => [
      String(community.facility_id),
      community
    ])
  );

  return (
    <div
      data-california-map
      className="relative max-w-full translate-x-8 shrink-0 sm:-translate-x-[29%]"
      style={{
        aspectRatio: `${CALIFORNIA_VIEW_BOX.width} / ${CALIFORNIA_VIEW_BOX.height}`,
        width: "min(44vw, 880px, calc((100dvh - 48px) * 0.68))"
      }}
    >
      <svg
        viewBox={`${CALIFORNIA_VIEW_BOX.x} ${CALIFORNIA_VIEW_BOX.y} ${CALIFORNIA_VIEW_BOX.width} ${CALIFORNIA_VIEW_BOX.height}`}
        role="img"
        aria-labelledby="california-map-title california-map-description"
        className="absolute inset-0 h-full w-full overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        <title id="california-map-title">Alamo Health communities in California</title>
        <desc id="california-map-description">
          Select one of five community markers to open its operating profile.
          Hover over a marker to see the governed weekly census and change from
          the prior week.
        </desc>
        <defs>
          <linearGradient id="california-paper-face" x1="12%" y1="0%" x2="88%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="52%" stopColor="#f7f9f8" />
            <stop offset="100%" stopColor="#e9efed" />
          </linearGradient>
          <linearGradient id="california-edge-face" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e5ebe9" />
            <stop offset="100%" stopColor="#aebbb7" />
          </linearGradient>
          <filter
            id="california-neighbor-soft-focus"
            x="-18%"
            y="-18%"
            width="136%"
            height="142%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.65" result="soft" />
            <feDropShadow
              in="soft"
              dx="0.9"
              dy="2"
              stdDeviation="2.1"
              floodColor="#55615d"
              floodOpacity="0.19"
            />
          </filter>
          <filter
            id="california-object-shadow"
            x="-12%"
            y="-10%"
            width="128%"
            height="132%"
            colorInterpolationFilters="sRGB"
          >
            <feDropShadow
              dx="1.2"
              dy="4"
              stdDeviation="3.2"
              floodColor="#55635f"
              floodOpacity="0.24"
            />
          </filter>
        </defs>

        <g
          data-california-neighbor-context="true"
          filter="url(#california-neighbor-soft-focus)"
          opacity="0.92"
          pointerEvents="none"
        >
          {CALIFORNIA_NEIGHBOR_PATHS.map((state) => (
            <path
              key={state.id}
              data-california-neighbor-state={state.id}
              d={state.path}
              fill="#ecefed"
              stroke="#b5bfbb"
              strokeWidth="1.1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
        <path
          d={CALIFORNIA_PATH}
          fill="#9ba9a5"
          stroke="#7f8e89"
          strokeWidth="1.15"
          transform="translate(4.4 5.4)"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        <path
          d={CALIFORNIA_PATH}
          fill="url(#california-edge-face)"
          stroke="#a0ada9"
          strokeWidth="1"
          transform="translate(2.35 2.9)"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        <path
          data-california-state-face="true"
          d={CALIFORNIA_PATH}
          fill="url(#california-paper-face)"
          stroke="#879590"
          strokeWidth="2.1"
          vectorEffect="non-scaling-stroke"
          filter="url(#california-object-shadow)"
          pointerEvents="none"
        />
        <path
          d={CALIFORNIA_PATH}
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.05"
          strokeOpacity="0.72"
          transform="translate(-0.45 -0.55)"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />

        {communities.map((community) => {
          const isSelected = community.facilityId === selectedFacilityId;
          const isHovered = community.facilityId === hoveredFacilityId;
          const isActive = isHovered || isSelected;
          const metrics = dashboardByFacility.get(community.facilityId);
          const currentCensus = metrics?.currentWeeklyCensus ?? null;
          const censusChangeValue = metrics?.censusChange7d ?? null;
          const censusChange = formatSignedChange(censusChangeValue);
          const changeColor = censusChangeColor(censusChangeValue);
          const metricSummary =
            currentCensus === null
              ? dashboard
                ? "Governed weekly census is unavailable."
                : dashboardUnavailable
                  ? "Community metrics could not be loaded."
                  : "Loading governed weekly census."
              : `${currentCensus.toLocaleString()} latest weekly census and ${censusChange} versus the prior week.`;
          const markerY = community.mapY + (community.markerOffsetY ?? 0);
          const lineEndX =
            community.labelAnchor === "start"
              ? community.labelX - 4
              : community.labelX + 4;
          const leaderPoints = `${community.mapX},${markerY} ${community.elbowX},${community.elbowY} ${lineEndX},${community.elbowY}`;
          const labelHitWidth = Math.max(27, community.shortName.length * 5.35);
          const labelHitX =
            community.labelAnchor === "start"
              ? community.labelX - 4
              : community.labelX - labelHitWidth - 4;

          return (
            <g
              key={community.facilityId}
              role="button"
              tabIndex={0}
              aria-label={`Open ${community.communityName} profile. ${metricSummary}`}
              aria-pressed={isSelected}
              data-california-community-marker={community.facilityId}
              data-california-node-census={currentCensus ?? ""}
              data-california-node-census-change-7d={censusChangeValue ?? ""}
              className="group cursor-pointer focus:outline-none"
              onClick={() => onSelectCommunity(community.facilityId)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onSelectCommunity(community.facilityId);
              }}
              onMouseEnter={() => setHoveredFacilityId(community.facilityId)}
              onMouseLeave={() => setHoveredFacilityId(null)}
              onFocus={() => setHoveredFacilityId(community.facilityId)}
              onBlur={() => setHoveredFacilityId(null)}
            >
              <title>{`${community.communityName}: ${metricSummary}`}</title>
              <rect
                x={labelHitX}
                y={community.labelY - 9}
                width={labelHitWidth + 8}
                height={isActive ? 36 : 18}
                fill="#ffffff"
                fillOpacity="0.001"
                pointerEvents="all"
              />
              <polyline
                points={leaderPoints}
                fill="none"
                stroke="#ffffff"
                strokeOpacity="0.001"
                strokeWidth="10"
                pointerEvents="stroke"
              />
              <polyline
                points={leaderPoints}
                fill="none"
                stroke={isActive ? changeColor : "#6e7774"}
                strokeWidth={isActive ? 1.8 : 1.15}
                vectorEffect="non-scaling-stroke"
                className="transition-all duration-150"
                pointerEvents="none"
              />
              <circle
                data-california-community-dot={community.facilityId}
                cx={community.mapX}
                cy={markerY}
                r={isActive ? 4.5 : 3.5}
                fill={isSelected ? "#111111" : "#0f8b73"}
                stroke="#ffffff"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                className="transition-all duration-150 [filter:drop-shadow(0_1px_1px_rgba(15,74,63,0.24))]"
              />
              <circle
                cx={community.mapX}
                cy={markerY}
                r="7.25"
                fill="transparent"
                stroke={isActive ? changeColor : "transparent"}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                data-california-community-tooltip={community.facilityId}
                x={community.labelX}
                y={community.labelY}
                textAnchor={community.labelAnchor}
                dominantBaseline="middle"
                fill={isActive ? changeColor : "#111111"}
                fontFamily="var(--ap-sans)"
                fontWeight={isActive ? 700 : 600}
                letterSpacing="-0.2"
                className="select-none text-[7.3px] transition-all duration-150 sm:text-[9.7px]"
              >
                {community.shortName}
              </text>
              {isActive ? (
                <>
                  <text
                    data-california-community-metrics={community.facilityId}
                    x={community.labelX}
                    y={community.labelY + 9}
                    textAnchor={community.labelAnchor}
                    dominantBaseline="middle"
                    fill="#595959"
                    fontFamily="var(--ap-sans)"
                    fontWeight="600"
                    className="pointer-events-none select-none text-[4.2px] sm:text-[5.9px]"
                  >
                    {currentCensus === null
                      ? dashboard || dashboardUnavailable
                        ? "Weekly census unavailable"
                        : "Loading weekly census"
                      : `${currentCensus.toLocaleString()} latest weekly census`}
                  </text>
                  <text
                    data-california-community-census-metrics={community.facilityId}
                    x={community.labelX}
                    y={community.labelY + 17}
                    textAnchor={community.labelAnchor}
                    dominantBaseline="middle"
                    fill="#595959"
                    fontFamily="var(--ap-sans)"
                    fontWeight="600"
                    className="pointer-events-none select-none text-[4px] sm:text-[5.35px]"
                  >
                    {censusChangeValue === null
                      ? dashboard || dashboardUnavailable
                        ? "Prior week unavailable"
                        : "Loading prior week"
                      : `${censusChange} vs prior week`}
                  </text>
                </>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
