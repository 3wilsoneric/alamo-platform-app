import http from "node:http";
import https from "node:https";
import path from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

const PREFIX = "/poc/app";
const COOKIE = "__Host-careconnector-browser";
const LIVE_ORIGIN = "https://careconnector-prod-web.orangeglacier-5aa5b7c6.westus2.azurecontainerapps.io";
const REQUEST_HEADERS = ["authorization", "accept", "content-type", "content-length", "x-careconnector-browser", "x-careconnector-session", "x-read-ahead", "if-match", "range"];
const RESPONSE_HEADERS = ["content-type", "content-length", "content-disposition", "content-range", "accept-ranges", "retry-after", "www-authenticate", "x-careconnector-access", "x-tablet-copy-age"];
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json", ".webmanifest": "application/manifest+json" };

function secure(res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://login.microsoftonline.com; frame-src 'self' https://login.microsoftonline.com; form-action 'self' https://login.microsoftonline.com; worker-src 'none'");
}

function end(res, status) {
  if (!res.headersSent) res.writeHead(status);
  res.end();
}

// Stream clinical bodies directly. Never buffer, cache, trace, or log them here.
function proxy(req, res, upstream, suffix) {
  /** @type {Record<string, string | string[]>} */
  const headers = {};
  for (const name of REQUEST_HEADERS) {
    const value = req.headers[name];
    if (value !== undefined) headers[name] = value;
  }
  const cookie = req.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE}=`));
  if (cookie) headers.cookie = cookie;
  // Only after validating the public origin; the backend's own same-origin guard remains active.
  if (req.headers.origin) headers.origin = upstream.origin;
  if (req.headers["sec-fetch-site"]) headers["sec-fetch-site"] = "same-origin";
  const transport = upstream.protocol === "https:" ? https : http;
  const target = transport.request(new URL(suffix, upstream), { method: req.method, headers }, (incoming) => {
    for (const name of RESPONSE_HEADERS) {
      const value = incoming.headers[name];
      if (value !== undefined) res.setHeader(name, value);
    }
    const cookies = incoming.headers["set-cookie"]?.filter((item) => item.startsWith(`${COOKIE}=`));
    if (cookies?.length) res.setHeader("Set-Cookie", cookies);
    // Auth APIs are not allowed to redirect a browser to an unreviewed destination.
    if (incoming.headers.location) {
      const location = new URL(incoming.headers.location, upstream);
      if (location.origin !== upstream.origin) { incoming.destroy(); end(res, 502); return; }
      res.setHeader("Location", `${PREFIX}${location.pathname}${location.search}${location.hash}`);
    }
    res.writeHead(incoming.statusCode ?? 502);
    incoming.on("error", () => res.destroy());
    incoming.pipe(res);
  });
  target.setTimeout(120_000, () => target.destroy(new Error("Upstream timeout")));
  target.on("error", () => { if (res.headersSent) res.destroy(); else end(res, 502); });
  req.on("aborted", () => target.destroy());
  req.on("error", () => target.destroy());
  res.on("close", () => { if (!res.writableFinished) target.destroy(); });
  req.pipe(target);
}

async function sendFile(req, res, filename, cacheable = false) {
  const contentType = MIME[path.extname(filename)] ?? "application/octet-stream";
  // Compression is prepared at build time; no clinical response goes through this path.
  for (const encoding of ["br", "gzip"]) {
    if (!(req.headers["accept-encoding"] ?? "").split(",").map((part) => part.trim()).includes(encoding)) continue;
    const compressed = `${filename}.${encoding === "br" ? "br" : "gz"}`;
    try {
      if ((await stat(compressed)).isFile()) { filename = compressed; res.setHeader("Content-Encoding", encoding); break; }
    } catch { /* The original file is available without compression. */ }
  }
  res.setHeader("Vary", "Accept-Encoding");
  let info;
  try { info = await stat(filename); } catch { end(res, 404); return; }
  if (!info.isFile()) { end(res, 404); return; }
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", info.size);
  if (cacheable) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  if (req.method === "HEAD") { end(res, 200); return; }
  const stream = createReadStream(filename);
  stream.on("error", () => { if (res.headersSent) res.destroy(); else end(res, 500); });
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}

/** The optional origins support isolated HTTP fixture tests. Production callers use the fixed defaults. */
export function createPocHandler({ distRoot, upstreamOrigin = LIVE_ORIGIN, publicOrigin = "https://www.alamoplatform.com" }) {
  const root = path.join(distRoot, "poc");
  const upstream = new URL(upstreamOrigin);
  return async function handlePoc(req, res) {
    const rawPath = (req.url ?? "/").split("?")[0] ?? "/";
    if (rawPath !== "/poc" && !rawPath.startsWith("/poc/")) return false;
    secure(res);
    if (publicOrigin === "https://www.alamoplatform.com" && req.headers.host === "alamoplatform.com") {
      res.setHeader("Location", `${publicOrigin}${req.url}`); end(res, 308); return true;
    }
    // Reject ambiguous paths before URL normalization or any upstream request.
    if (/%(?:2e|2f|5c|00)|\\|\.{2}/i.test(rawPath) || [...rawPath].some((character) => character.charCodeAt(0) < 32)) { end(res, 400); return true; }
    const url = new URL(req.url, publicOrigin);
    const pathname = url.pathname;
    const suffix = pathname.slice(PREFIX.length);
    if (pathname.startsWith(`${PREFIX}/`) && /^\/(?:api|auth|health)(?:\/|$)/.test(suffix)) {
      const origin = req.headers.origin;
      const mutation = !["GET", "HEAD"].includes(req.method ?? "");
      if ((origin && origin !== publicOrigin) || (mutation && origin !== publicOrigin) || req.headers["sec-fetch-site"] === "cross-site") {
        end(res, 403); return true;
      }
      if (!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(req.method ?? "")) { end(res, 405); return true; }
      proxy(req, res, upstream, `${suffix}${url.search}`);
      return true;
    }
    if (pathname.startsWith(`${PREFIX}/device/`)) { end(res, 404); return true; }
    if (!["GET", "HEAD"].includes(req.method ?? "")) { end(res, 405); return true; }
    if (pathname === "/poc" || pathname === "/poc/") {
      await sendFile(req, res, path.join(root, "index.html")); return true;
    }
    if (pathname === PREFIX) { res.setHeader("Location", `${PREFIX}/${url.search}`); end(res, 308); return true; }
    if (!pathname.startsWith(`${PREFIX}/`)) { end(res, 404); return true; }
    // Only built assets and known entry documents are files. Other extensionless paths are app history routes.
    const file = suffix.startsWith("/assets/") || suffix.startsWith("/brand/") || ["/redirect.html", "/index.html", "/present.html", "/manifest.webmanifest"].includes(suffix);
    if (file) {
      await sendFile(req, res, path.join(root, "app", suffix), suffix.startsWith("/assets/"));
    } else if (path.extname(suffix)) {
      end(res, 404);
    } else {
      await sendFile(req, res, path.join(root, "app/index.html"));
    }
    return true;
  };
}
