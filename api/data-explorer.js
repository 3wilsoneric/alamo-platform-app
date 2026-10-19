import { getDataExplorerData } from "../server/platform-data.mjs";
import { getRequestUrl } from "../server/http-errors.mjs";
import { handleProtectedGet } from "../server/protected-get-handler.mjs";

export default async function handler(req, res) {
  await handleProtectedGet(
    req,
    res,
    (request) => {
      const requestUrl = getRequestUrl(request);
      return getDataExplorerData(requestUrl.searchParams.get("kind") ?? "incidents", {
        residentClientId: requestUrl.searchParams.get("clientId") ?? ""
      });
    },
    { fallbackMessage: "Data explorer request failed." }
  );
}
