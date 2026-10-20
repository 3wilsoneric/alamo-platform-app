import assert from "node:assert/strict";
import { test } from "node:test";
import http from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPocHandler } from "../server/careconnector-poc.mjs";

test("mounted live CareConnector preserves auth, streaming, and Platform boundaries", async () => {
  const distRoot = await mkdtemp(path.join(os.tmpdir(), "poc-check-"));
  await mkdir(path.join(distRoot, "poc/app/assets"), { recursive: true });
  await writeFile(path.join(distRoot, "poc/index.html"), "<title>Surface presenter</title>");
  await writeFile(path.join(distRoot, "poc/app/index.html"), "<title>CareConnector</title>");
  await writeFile(path.join(distRoot, "poc/app/redirect.html"), "<title>Microsoft bridge</title>");
  await writeFile(path.join(distRoot, "poc/app/assets/app.js"), "// built application");
  const received = [];
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) });
    if (req.url === "/api/changes") {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write("event: change\ndata: invented\n\n");
      const timer = setTimeout(() => res.end("event: complete\n\n"), 150);
      res.on("close", () => clearTimeout(timer));
      return;
    }
    if (req.url === "/auth/browser/enroll") res.setHeader("Set-Cookie", ["__Host-careconnector-browser=invented; Path=/; Secure; HttpOnly; SameSite=Strict", "unrelated-cookie=do-not-forward"]);
    if (req.url === "/api/redirect") { res.writeHead(302, { Location: "https://untrusted.example/" }); res.end(); return; }
    if (req.url === "/api/me") { res.writeHead(401); res.end(); return; }
    res.writeHead(200, { "Content-Type": "application/octet-stream", "Cache-Control": "public, max-age=600" });
    res.end(Buffer.concat(chunks));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamOrigin = `http://127.0.0.1:${upstream.address().port}`;
  let handler;
  const server = http.createServer((req, res) => { void handler(req, res).then((handled) => { if (!handled) res.end("untouched Platform route"); }); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  handler = createPocHandler({ distRoot, upstreamOrigin, publicOrigin: origin });
  const read = (suffix, options) => fetch(`${origin}${suffix}`, options);
  try {
    for (const route of ["/", "/home", "/api/platform/me", "/pocket"]) assert.equal(await (await read(route)).text(), "untouched Platform route");
    for (const route of ["/poc", "/poc/"]) {
      const response = await read(route);
      assert.equal(await response.text(), "<title>Surface presenter</title>");
      assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
      assert.match(response.headers.get("cache-control"), /no-store/);
    }
    assert.equal(await (await read("/poc/app/services")).text(), "<title>CareConnector</title>");
    assert.equal(await (await read("/poc/app/redirect.html")).text(), "<title>Microsoft bridge</title>");
    assert.match((await read("/poc/app/assets/app.js")).headers.get("cache-control"), /immutable/);
    for (const route of ["/poc/missing", "/poc/app/assets/missing.js", "/poc/app/unknown.js", "/poc/app/device/status", "/poc/app/sw.js"]) assert.equal((await read(route)).status, 404);
    assert.equal((await read("/poc/app/", { method: "HEAD" })).status, 200);
    assert.equal((await read("/poc/app/api/me")).status, 401, "No auth bypass or SPA fallback for APIs");
    const before = received.length;
    for (const headers of [{}, { Origin: "https://other.example" }, { Origin: "null" }, { Origin: "https://sibling.alamoplatform.com" }, { Origin: origin, "Sec-Fetch-Site": "cross-site" }]) {
      assert.equal((await read("/poc/app/auth/browser/unlock", { method: "POST", headers, body: "invented-pin" })).status, 403);
    }
    assert.equal(received.length, before, "Rejected cross-origin traffic never reaches CareConnector");
    const payload = Buffer.from("--fixture\r\nContent-Disposition: form-data; name=\"file\"\r\n\r\ninvented bytes\u0000\u00ff\r\n--fixture--\r\n");
    const result = await read("/poc/app/auth/browser/enroll", { method: "POST", headers: {
      Origin: origin, "Sec-Fetch-Site": "same-origin", Authorization: "Bearer invented",
      "X-CareConnector-Browser": "1", "X-CareConnector-Session": "invented-pin-session", "X-Read-Ahead": "1",
      Cookie: "platform-secret=never-forward; __Host-careconnector-browser=invented; msal=never-forward",
      "X-Forwarded-Host": "attacker.invalid", "X-Dev-Persona": "administrator",
      "Content-Type": "multipart/form-data; boundary=fixture",
    }, body: payload });
    assert.equal(result.status, 200);
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), payload);
    assert.equal(result.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(result.headers.getSetCookie(), ["__Host-careconnector-browser=invented; Path=/; Secure; HttpOnly; SameSite=Strict"]);
    const last = received.at(-1);
    assert.equal(last.url, "/auth/browser/enroll");
    assert.equal(last.headers.origin, upstreamOrigin);
    assert.equal(last.headers.cookie, "__Host-careconnector-browser=invented");
    assert.equal(last.headers.authorization, "Bearer invented");
    assert.equal(last.headers["x-careconnector-session"], "invented-pin-session");
    assert.equal(last.headers["x-read-ahead"], "1");
    assert.equal(last.headers["x-dev-persona"], undefined);
    assert.equal(last.headers["x-forwarded-host"], undefined);
    assert.equal((await read("/poc/app/api/redirect", { redirect: "manual" })).status, 502);
    const stream = (await read("/poc/app/api/changes")).body.getReader();
    const first = await stream.read();
    assert.match(new TextDecoder().decode(first.value), /data: invented/);
    assert.equal(first.done, false, "SSE arrives before upstream closes");
    await stream.cancel();
    // Raw requests preserve traversal attempts that fetch would normalize away.
    for (const suffix of ["/poc/app/api/%2f%2fevil.example/", "/poc/app/../secret", "/poc/app/%5csecret", "/poc/app/%00"]) {
      const status = await new Promise((resolve, reject) => {
        const request = http.get(`${origin}${suffix}`, (response) => { response.resume(); resolve(response.statusCode); });
        request.on("error", reject);
      });
      assert.ok([400, 404].includes(status));
    }
  } finally {
    server.closeAllConnections(); upstream.closeAllConnections();
    await Promise.all([new Promise((resolve) => server.close(resolve)), new Promise((resolve) => upstream.close(resolve))]);
    await rm(distRoot, { recursive: true, force: true });
  }
});
