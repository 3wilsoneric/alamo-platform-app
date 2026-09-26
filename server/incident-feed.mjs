import { getIncidentStream } from "./platform-data.mjs";

export function isLiveIncidentFeedRequest(requestUrl) {
  try {
    const url = requestUrl instanceof URL ? requestUrl : new URL(requestUrl ?? "", "http://localhost");
    return ["1", "true", "yes"].includes((url.searchParams.get("live") ?? "").toLowerCase());
  } catch {
    return false;
  }
}

export async function getIncidentFeedResponse({ live = false } = {}) {
  if (!live) {
    try {
      return {
        incidents: await getIncidentStream(),
        source: "snapshot-preferred"
      };
    } catch {
      return {
        incidents: await getIncidentStream({ preferSnapshot: false }),
        source: "live-fallback",
        warning: "The published incident snapshot was unavailable, so this response used the live incident feed."
      };
    }
  }

  try {
    return {
      incidents: await getIncidentStream({ preferSnapshot: false }),
      source: "live-databricks"
    };
  } catch {
    return {
      incidents: await getIncidentStream(),
      source: "snapshot-fallback",
      warning: "The live incident feed was unavailable, so this response used the latest published snapshot."
    };
  }
}
