const platformOrigin = "https://www.alamoplatform.com";

// Resolve old relative evidence through a fixed application registry. Supplied
// page origins, arbitrary redirects and URL credentials never choose a host.
export function resolveEveryAgentLink(href) {
  if (typeof href !== "string" || href.length > 2000 || /[\\\s]/.test(href) || href.startsWith("//")) throw new Error("Invalid agent source link.");
  const url = new URL(href, platformOrigin);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) throw new Error("Invalid agent source link.");
  if (url.origin === platformOrigin) {
    const keys = [...url.searchParams.keys()];
    if (url.pathname === "/admissions" && !url.search) return { application: "platform", href: url.href };
    if (url.pathname !== "/analytics/agent" || url.searchParams.get("skill") !== "licensing" ||
        new Set(keys).size !== keys.length || keys.some(key => !["skill", "community", "report"].includes(key)) ||
        (url.searchParams.has("community") && !/^\d{1,12}$/.test(url.searchParams.get("community") ?? "")) ||
        (url.searchParams.has("report") && !/^\d{9}-[a-f0-9]{32}$/.test(url.searchParams.get("report") ?? ""))) throw new Error("Invalid agent source link.");
    return { application: "platform", href: url.href };
  }
  if (["www.ccld.dss.ca.gov", "ccld.dss.ca.gov"].includes(url.hostname)) return { application: "ccld", href: url.href };
  if (url.hostname === "alamo-pipeline.com" && url.pathname === "/" && !url.search) return { application: "pipeline", href: url.href };
  throw new Error("Invalid agent source link.");
}

export function portableEveryAgentEvidence(evidence, revision = null) {
  const link = resolveEveryAgentLink(evidence.href);
  return { ...evidence, href: link.href, resource: { application: link.application, kind: evidence.kind, id: evidence.id, revision } };
}
