import { readFileSync, writeFileSync } from "node:fs";

const serverPath = "/app/server/app-server.mjs";
const source = readFileSync(serverPath, "utf8");

const staticEntryNeedle = `  const requestedFile = resolveStaticPath(pathname);`;
const staticEntryReplacement = `  const dedicatedEntry = pathname === "/chat" || pathname === "/chat/"
    ? "chat"
    : pathname === "/admissions" || pathname === "/admissions/"
      ? "admissions"
      : null;
  if (dedicatedEntry) {
    await sendStaticFile(req, res, path.join(DIST_ROOT, dedicatedEntry, "index.html"), "no-store");
    return;
  }

  const requestedFile = resolveStaticPath(pathname);`;

const cachePolicyNeedle = `      : pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=86400";`;
const cachePolicyReplacement = `      : pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : path.extname(requestedFile).toLowerCase() === ".html"
          ? "no-store"
          : "public, max-age=86400";`;

const hasDedicatedEntry = source.includes(staticEntryReplacement);
const hasHtmlNoStorePolicy = source.includes(cachePolicyReplacement);

if (!hasDedicatedEntry && !source.includes(staticEntryNeedle)) {
  throw new Error("Production app server no longer exposes the expected static-entry boundary.");
}
if (!hasHtmlNoStorePolicy && !source.includes(cachePolicyNeedle)) {
  throw new Error("Production app server no longer exposes the expected static cache policy.");
}

const patched = source
  .replace(hasDedicatedEntry ? staticEntryReplacement : staticEntryNeedle, staticEntryReplacement)
  .replace(hasHtmlNoStorePolicy ? cachePolicyReplacement : cachePolicyNeedle, cachePolicyReplacement);

writeFileSync(serverPath, patched);
