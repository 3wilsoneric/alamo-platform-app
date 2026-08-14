import { getDataExplorerData } from "../server/platform-data.mjs";
import { getRequestUrl } from "../server/http-errors.mjs";
import { handleProtectedGet } from "../server/protected-get-handler.mjs";

export default async function handler(req, res) {
  await handleProtectedGet(
    req,
    res,
    (request) => getDataExplorerData(getRequestUrl(request).searchParams.get("kind") ?? "incidents"),
    { fallbackMessage: "Data explorer request failed." }
  );
}
