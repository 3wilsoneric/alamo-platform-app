import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// A fixed deployment directory, never a request-selected root. No API request
// falls through to SPA HTML; only the root and emitted assets are served.
export function createEveryAgentWeb(root, origins = []) {
  if (!root) return async () => false;
  const directory = path.resolve(root);
  return async (req, res) => {
    const pathname = String(req.url ?? "").split("?", 1)[0] ?? "";
    if (!["GET", "HEAD"].includes(req.method) || !(pathname === "/" || /^\/(?:assets\/[a-zA-Z0-9_-]+\.(?:js|css)|brand\/everyagent-alamo-v1\.webp)$/.test(pathname))) return false;
    try {
      const file = path.join(directory, pathname === "/" ? "index.html" : pathname);
      if ((await stat(file)).size > 5 * 1024 * 1024) throw new Error("Oversized browser asset.");
      const body = await readFile(file);
      const extension = path.extname(file);
      res.setHeader("Content-Type", ({ ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".webp": "image/webp" })[extension]);
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Frame-Options", "DENY");
      res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self' https://login.microsoftonline.com ${origins.join(" ")}; frame-src https://login.microsoftonline.com; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'`);
      res.setHeader("Cache-Control", extension === ".html" ? "no-store" : "public, max-age=3600");
      res.statusCode = 200; res.end(req.method === "HEAD" ? undefined : body); return true;
    } catch { res.statusCode = 404; res.end(); return true; }
  };
}
