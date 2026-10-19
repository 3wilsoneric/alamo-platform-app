const ALAMO_AGENT = Object.freeze({ name: "AlamoAgent", mark: "/brand/everyagent-alamo-v1.webp", variant: "alamo" });
const WILSON = Object.freeze({ name: "Wilson", mark: "/brand/wilson-andrew.png", variant: "wilson" });

// Presentation only: matching a personal identity never grants agent or source access.
export function agentBrandingFor(claims) {
  if (claims && typeof claims === "object" &&
      String(claims.tid ?? "").toLowerCase() === "d72d9036-cff8-4f5f-a6fa-d698f621d420" &&
      String(claims.oid ?? "").toLowerCase() === "e9f39185-d751-45c0-bcf5-c24d3565bdd9") return WILSON;
  return ALAMO_AGENT;
}
