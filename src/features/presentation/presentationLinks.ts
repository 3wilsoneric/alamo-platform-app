// Slide images are inert, so live destinations live in the viewer chrome.
// Keep this allowlist limited to real routes; it does not confer route access.
export const presentationLinks: Record<string, { href: string; label: string }> = {
  platform: { href: "/home", label: "Open Alamo Platform" },
  "platform-community": { href: "/executive/dashboard", label: "Open Community dashboard" },
  "platform-assessment": { href: "https://alamo-pipeline.com/?view=referrals", label: "Open Pipeline referrals" },
};
