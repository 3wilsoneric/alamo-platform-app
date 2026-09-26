const LOGIN_PATH = "/login";

export function getSameOriginLoginRedirectUri(origin) {
  const parsed = new URL(String(origin ?? "").trim());
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("The platform origin is not valid for Microsoft sign-in.");
  }
  return `${parsed.origin}${LOGIN_PATH}`;
}

function getAuthenticationErrorText(error) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    return ["message", "errorMessage", "error_description", "errorDescription"]
      .map((key) => (key in error ? String(error[key] ?? "").trim() : ""))
      .filter(Boolean)
      .join(" ");
  }
  return String(error ?? "");
}

export function getAuthenticationErrorMessage(error) {
  const message = getAuthenticationErrorText(error);
  const code = String(
    error && typeof error === "object" && "errorCode" in error
      ? error.errorCode
      : ""
  ).toLowerCase();

  if (/aadsts500011|invalidresourceserviceprincipalnotfound|resource principal.*not found/i.test(`${code} ${message}`)) {
    return "Microsoft cannot find the Alamo Platform API in this Entra tenant. In the app registration, expose the api://<client-id>/access_as_user delegated scope and grant consent, then try again.";
  }
  if (/aadsts50011|redirect_uri_mismatch|redirect uri/i.test(`${code} ${message}`)) {
    return "Microsoft rejected the sign-in return address. Add the exact address shown below to the Entra app registration, then try again.";
  }
  if (/aadsts65001|consent_required/i.test(`${code} ${message}`)) {
    return "The Alamo Platform API permission exists but has not been approved. Grant administrator consent for the access_as_user delegated permission, then try again.";
  }
  if (/aadsts650053|aadsts70011|invalid_scope|scope/i.test(`${code} ${message}`)) {
    return "Microsoft rejected the platform API permission. Confirm that the Entra app exposes the delegated access_as_user scope, then try again.";
  }
  if (/user_cancelled|user canceled|cancelled/i.test(`${code} ${message}`)) {
    return "Microsoft sign-in was canceled. You can try again when you are ready.";
  }
  if (/network|temporarily_unavailable|timeout/i.test(`${code} ${message}`)) {
    return "Microsoft sign-in could not be reached. Check the connection and try again.";
  }
  return "Microsoft sign-in could not be completed. Try again once. If it still fails, an administrator should check the Entra app registration.";
}

export function getAuthenticationErrorCode(error) {
  const fields = [];
  if (error && typeof error === "object") {
    for (const key of ["errorCode", "subError", "message"]) {
      if (key in error) fields.push(String(error[key] ?? ""));
    }
  } else {
    fields.push(String(error ?? ""));
  }

  const text = fields.join(" ");
  const aadCode = text.match(/AADSTS\d+/i)?.[0];
  if (aadCode) return aadCode.toUpperCase();

  const libraryCode = fields
    .slice(0, 2)
    .map((value) => value.trim())
    .find((value) => /^[a-z][a-z0-9_-]{2,80}$/i.test(value));
  return libraryCode || null;
}
