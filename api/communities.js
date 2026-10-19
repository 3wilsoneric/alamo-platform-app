import {
  getCommunitiesDashboardData,
  getCommunitySnapshotData
} from "../server/platform-data.mjs";
import { projectCommunityCensusSnapshot } from "../server/community-snapshot-projections.mjs";
import { createHttpError } from "../server/http-errors.mjs";
import { handleProtectedGetRoutes } from "../server/protected-get-handler.mjs";

const COMMUNITY_GET_ROUTES = Object.freeze({
  "/api/communities/dashboard": () => getCommunitiesDashboardData(),
  "/api/communities/snapshot": ({ requestUrl }) => {
    const facilityId = requestUrl.searchParams.get("facilityId")?.trim();
    if (!facilityId) {
      throw createHttpError(400, "facility_id_required", "Missing facilityId.");
    }
    return requestUrl.searchParams.get("view") === "census"
      ? getCommunitySnapshotData(facilityId).then(projectCommunityCensusSnapshot)
      : getCommunitySnapshotData(facilityId);
  }
});

export default async function handler(req, res) {
  await handleProtectedGetRoutes(req, res, COMMUNITY_GET_ROUTES);
}
