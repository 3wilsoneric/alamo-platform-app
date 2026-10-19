import { useEffect, useMemo, useState } from "react";
import {
  fetchCommunitiesDashboard,
  fetchCommunityCensusSnapshot,
  type CommunitySnapshotResponse,
  type LiveCommunitiesDashboardResponse
} from "../../../shared/api/platformData";
import { CensusTrendModule, type CensusTrendPoint } from "../../../shared/modules/CensusTrendModule";
import { formatMonthLabel } from "../../../../shared/period-utils.mjs";
import { ALAMO_FACILITIES } from "../../../../shared/community-names.mjs";
import { isAbortError } from "../communityPageModel";

type CommunityCensusSnapshot = Pick<CommunitySnapshotResponse, "facility" | "census">;

function projectDashboardCensus(
  dashboard: LiveCommunitiesDashboardResponse,
  facilityId: string
): CommunityCensusSnapshot | null {
  const facility = dashboard.facilities.find(
    (row) => String(row.facility_id) === String(facilityId)
  );
  if (!facility) return null;

  return {
    facility,
    census: dashboard.census.filter(
      (row) => String(row.facility_id) === String(facilityId)
    )
  };
}

async function loadCommunityCensus(facilityId: string, signal: AbortSignal) {
  try {
    return await fetchCommunityCensusSnapshot(facilityId, signal);
  } catch (snapshotError) {
    if (isAbortError(snapshotError)) throw snapshotError;

    // The dashboard is already loaded for the Communities surface and carries the
    // same governed monthly census rows. Keep the focused view usable if its
    // smaller projection is temporarily unavailable or from an older deployment.
    const dashboard = await fetchCommunitiesDashboard(signal);
    const fallback = projectDashboardCensus(dashboard, facilityId);
    if (fallback) return fallback;
    throw snapshotError;
  }
}

export default function CommunityCensusSurface({ facilityId }: { facilityId: string }) {
  const [snapshot, setSnapshot] = useState<CommunityCensusSnapshot | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setSnapshot(null);
    setUnavailable(false);

    loadCommunityCensus(facilityId, controller.signal)
      .then((payload) => setSnapshot(payload))
      .catch((error) => {
        if (isAbortError(error)) return;
        console.warn("Community census data is unavailable.", error);
        setUnavailable(true);
      });

    return () => controller.abort();
  }, [facilityId]);

  const facilityName = useMemo(() => (
    snapshot?.facility?.community_name ??
    ALAMO_FACILITIES.find((facility) => facility.facilityId === facilityId)?.communityName ??
    "Community"
  ), [snapshot, facilityId]);

  const points = useMemo<CensusTrendPoint[]>(() => {
    const byMonth = new Map<string, CensusTrendPoint>();
    for (const row of snapshot?.census ?? []) {
      const monthBucket = String(row?.month_bucket ?? "").trim();
      const census = Number(row?.census);
      if (
        String(row?.facility_id) !== String(facilityId) ||
        !/^\d{4}-\d{2}$/.test(monthBucket) ||
        !Number.isFinite(census)
      ) {
        continue;
      }
      byMonth.set(monthBucket, {
        id: monthBucket,
        label: formatMonthLabel(monthBucket, { fallback: monthBucket, month: "long" }),
        value: census
      });
    }
    return [...byMonth.values()].sort((left, right) => left.id.localeCompare(right.id));
  }, [snapshot, facilityId]);

  const latestPoint = points.at(-1) ?? null;

  return (
    <section data-community-census-surface="true" className="border-y border-[#111111] bg-white py-5 text-[#111111] sm:py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-[#d9d9d9] px-1 pb-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0f8b73]">Census</div>
          <h2 className="mt-1 font-serif text-[28px] font-semibold leading-tight tracking-[-0.035em]">
            {facilityName}
          </h2>
        </div>
        {latestPoint ? (
          <div className="text-[12px] font-medium text-[#595959]">Through {latestPoint.label}</div>
        ) : null}
      </header>

      {!snapshot && !unavailable ? (
        <div role="status" className="flex min-h-[300px] items-center justify-center px-6 text-[14px] text-[#595959]">
          Loading census history…
        </div>
      ) : unavailable ? (
        <div role="status" className="border-y border-[#d9d9d9] px-5 py-6 text-[14px] leading-6 text-[#595959]">
          Census history is temporarily unavailable. The Communities Overview remains available above.
        </div>
      ) : (
        <CensusTrendModule
          points={points}
          height={320}
          emptyLabel={`No monthly census history is loaded for ${facilityName}.`}
        />
      )}
    </section>
  );
}
