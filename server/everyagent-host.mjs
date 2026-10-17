import { createServer } from "node:http";
import { EVERYAGENT_API_PATH } from "../shared/everyagent-client.mjs";
import { createEveryAgentRequestHandler } from "./everyagent-http.mjs";
import { AGENT_CONVERSATIONS_PATH } from "../shared/everyagent-conversations.mjs";
import { createEveryAgentWeb } from "./everyagent-web.mjs";

export function createEveryAgentHttpServer({ authorize, service, conversations = /** @type {any} */ (null), webRoot = "", origins = /** @type {string[]} */ ([]) }) {
  if (!origins.every(origin => {
    try { const url = new URL(origin); return url.protocol === "https:" && url.origin === origin && !url.hostname.includes("*"); } catch { return false; }
  })) throw new Error("Agent browser origins must be exact HTTPS origins.");
  const allowedOrigins = new Set(origins);
  const handler = createEveryAgentRequestHandler({ authorize, service, conversations });
  const web = createEveryAgentWeb(webRoot, origins);
  return createServer({ maxHeaderSize: 16_384, requestTimeout: 15_000, headersTimeout: 10_000 }, (req, response) => {
    const res = {
      setHeader: (name, value) => response.setHeader(name, value),
      getHeader: name => response.getHeader(name),
      status(code) { response.statusCode = code; return res; },
      json(value) { response.setHeader("Content-Type", "application/json; charset=utf-8"); response.end(JSON.stringify(value)); }
    };
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Vary", "Origin, Authorization");
    async function api() {
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.has(origin)) { res.status(403).json({ error: "Origin is not allowed." }); return; }
      if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
      if (req.method === "OPTIONS") {
        if (!origin || ![EVERYAGENT_API_PATH, AGENT_CONVERSATIONS_PATH].includes(String(req.url).split("?", 1)[0] ?? "")) { res.status(404).json({ error: "Not found." }); return; }
        response.setHeader("Access-Control-Allow-Methods", "GET, POST");
        response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
        response.writeHead(204); response.end(); return;
      }
      if (req.method === "GET" && req.url === "/healthz") { res.status(200).json({ ok: true }); return; }
      await handler(req, res);
    }
    // Public build assets precede API CORS. Module-script requests may carry
    // Origin even on the same host; no transcript is served through this path.
    void web(req, response).then(handled => handled ? undefined : api()).catch(() => {
      if (!response.headersSent) res.status(503).json({ error: "AlamoAgent is temporarily unavailable." });
      else response.destroy();
    });
  });
}
