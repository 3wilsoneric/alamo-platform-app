import { requireApiUser } from "./api-auth.mjs";
import { getApiError, getRequestUrl } from "./http-errors.mjs";
import { applyProtectedApiHeaders } from "./http-response.mjs";

function rejectUnsupportedMethod(req, res) {
  if (req.method === "GET") return false;
  res.status(405).json({ error: "Method not allowed." });
  return true;
}

export async function handleProtectedGet(req, res, loader, options = {}) {
  applyProtectedApiHeaders(res);
  if (rejectUnsupportedMethod(req, res)) return;

  try {
    await requireApiUser(req);
    res.status(200).json(await loader(req));
  } catch (error) {
    const response = getApiError(error, options.fallbackMessage);
    res.status(response.statusCode).json(response.body);
  }
}

export async function handleProtectedGetRoutes(req, res, routes, options = {}) {
  applyProtectedApiHeaders(res);
  if (rejectUnsupportedMethod(req, res)) return;

  try {
    const requestUrl = getRequestUrl(req);
    const authContext = await requireApiUser(req);
    const loader = Object.hasOwn(routes, requestUrl.pathname)
      ? routes[requestUrl.pathname]
      : null;

    if (typeof loader !== "function") {
      res.status(404).json({ error: "Not found." });
      return;
    }

    res.status(200).json(await loader({ req, requestUrl, authContext }));
  } catch (error) {
    const response = getApiError(error, options.fallbackMessage);
    res.status(response.statusCode).json(response.body);
  }
}

export async function handleProtectedPost(req, res, loader, options = {}) {
  applyProtectedApiHeaders(res);
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    const authContext = await requireApiUser(req);
    res.status(200).json(await loader({ req, authContext }));
  } catch (error) {
    const response = getApiError(error, options.fallbackMessage);
    res.status(response.statusCode).json(response.body);
  }
}
