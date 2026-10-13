// Slide images are inert, so live destinations live in the viewer chrome.
// Keep this allowlist limited to real routes; it does not confer route access.
export const presentationLinks: Record<string, { href: string; label: string }> = {
  "platform-community": { href: "/executive/dashboard", label: "Open Community dashboard" },
  "platform-admissions": { href: "/executive/dashboard", label: "Open Community admissions" },
  "platform-assessment": { href: "https://alamo-pipeline.com/?view=referrals", label: "Open Pipeline referrals" },
  "platform-workforce": { href: "/workforce", label: "Open Workforce" },
};
