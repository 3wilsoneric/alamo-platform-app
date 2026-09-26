import { getApiError, getRequestUrl } from "../server/http-errors.mjs";
import { requireApiUser } from "../server/api-auth.mjs";
import { applyProtectedApiHeaders } from "../server/http-response.mjs";
import { getIncidentFeedResponse, isLiveIncidentFeedRequest } from "../server/incident-feed.mjs";

export default async function handler(req, res) {
  applyProtectedApiHeaders(res);

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  let requestUrl;
  try {
    requestUrl = getRequestUrl(req);
    await requireApiUser(req);
  } catch (error) {
    const response = getApiError(error, "Incident feed authentication failed.");
    res.status(response.statusCode).json(response.body);
    return;
  }

  try {
    res.status(200).json(await getIncidentFeedResponse({
      live: isLiveIncidentFeedRequest(requestUrl)
    }));
  } catch (error) {
    const response = getApiError(error, "Incident feed request failed.");
    res.status(response.statusCode).json(response.body);
  }
}
