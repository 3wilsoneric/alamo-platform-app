const DEFAULT_PIPELINE_APP_URL = "https://alamo-pipeline.com";

function isLoopbackHostname(hostname) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
}

export function getPipelineAppUrl(configuredUrl, browserOrigin) {
  const candidate = String(configuredUrl ?? "").trim() || DEFAULT_PIPELINE_APP_URL;
  const parsed = new URL(candidate);

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("The Pipeline application URL must not contain credentials, query parameters, or a fragment.");
  }
  if (parsed.protocol !== "https:") {
    const browser = browserOrigin ? new URL(String(browserOrigin)) : null;
    const localDevelopment =
      parsed.protocol === "http:" &&
      isLoopbackHostname(parsed.hostname) &&
      browser !== null &&
      isLoopbackHostname(browser.hostname);
    if (!localDevelopment) {
      throw new Error("The Pipeline application URL must use HTTPS outside local development.");
    }
  }

  return parsed.origin;
}
