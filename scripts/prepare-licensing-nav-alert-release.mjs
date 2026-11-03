#!/usr/bin/env node

// Patch only the currently serving browser bundle. The source checkout still
// has other unreleased layout work, so a full frontend rebuild is not safe.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

const baseImage = process.env.LICENSING_NAV_BASE_IMAGE;
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(baseImage ?? "")) {
  throw Error("Set LICENSING_NAV_BASE_IMAGE to the current production image digest.");
}
const currentImage = execFileSync("az", ["containerapp", "show", "-n", "alamo-platform-prod-web", "-g", "alamo-data-rg", "--query", "properties.template.containers[0].image", "-o", "tsv"], { encoding: "utf8" }).trim();
if (currentImage !== baseImage) throw Error("Production image changed; rebase this overlay before building.");
const output = path.join(process.cwd(), "generated", "licensing-nav-alert", "context");
const overlay = path.join(output, "overlay", "dist");
await rm(output, { recursive: true, force: true });
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const fromImage = relative => execFileSync("docker", ["run", "--rm", "--platform", "linux/amd64", "--entrypoint", "cat", baseImage, `/app/${relative}`], { maxBuffer: 32 * 1024 * 1024 });
const fromLive = relative => execFileSync("curl", ["-fsSL", `https://www.alamoplatform.com/${relative.replace(/^dist\//, "")}`], { maxBuffer: 32 * 1024 * 1024 });
function replaceOnce(value, before, after) {
  if (value.split(before).length !== 2) throw Error(`Serving bundle changed near ${before.slice(0, 70)}.`);
  return value.replace(before, after);
}
async function writeCompressed(relative, bytes) {
  const target = path.join(overlay, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await Promise.all([writeFile(target, bytes), writeFile(`${target}.gz`, gzipSync(bytes)), writeFile(`${target}.br`, brotliCompressSync(bytes))]);
}

const index = fromImage("dist/index.html");
if (hash(index) !== hash(fromLive("dist/index.html"))) throw Error("Live entry differs from the pinned production image.");
const oldJs = index.toString("utf8").match(/\/assets\/(index-[\w-]+\.js)/)?.[1];
if (oldJs !== "index-report-layout-31171563f2d8.js") throw Error("The expected serving bundle changed.");
const oldBytes = fromImage(`dist/assets/${oldJs}`);
if (hash(oldBytes) !== hash(fromLive(`dist/assets/${oldJs}`))) throw Error("Live browser bundle differs from the pinned production image.");
let js = oldBytes.toString("utf8");
const navStart = js.indexOf("function as({restricted:e=!1}){");
const navEnd = js.indexOf("function os(", navStart);
if (navStart < 0 || navEnd < 0 || js.indexOf("function as({restricted:e=!1}){", navStart + 1) !== -1) throw Error("Navigation boundary changed.");
let nav = js.slice(navStart, navEnd);
nav = replaceOnce(nav, "c=rs(),l=e?", "c=rs(),licAccount=licensingAccountOid(),l=e?");
const feedEffect = "(0,V.useEffect)(()=>{if(e||!c||!licAccount)return;let controller=new AbortController,busy=!1;let refresh=()=>{if(busy||controller.signal.aborted)return;busy=!0;kh(controller.signal).then(feed=>{if(!controller.signal.aborted)window.dispatchEvent(new CustomEvent(`alamo:licensing-feed`,{detail:{accountId:licAccount,alerts:feed.alerts.map(alert=>({id:alert.id,at:alert.at})),lastSuccessful:feed.lastSuccessful}}))}).catch(()=>{}).finally(()=>{busy=!1})};refresh();let timer=setInterval(refresh,6e4);return()=>{controller.abort();clearInterval(timer)}},[e,c,licAccount]);";
nav = replaceOnce(nav, "}));return(0,V.useEffect)(()=>{o(!1)},[t])", `}));${feedEffect}return(0,V.useEffect)(()=>{o(!1)},[t])`);
const accountHelper = "function licensingAccountOid(){let{accounts:e,instance:t}=i(),n=t.getActiveAccount()??e[0];return n?.idTokenClaims?.oid??null}";
js = js.slice(0, navStart) + accountHelper + nav + js.slice(navEnd);
const newJs = `index-licensing-alert-${hash(js).slice(0, 12)}.js`;
await writeCompressed(`assets/${newJs}`, Buffer.from(js));
for (const relative of ["dist/index.html", "dist/admissions/index.html"]) {
  const original = fromImage(relative).toString("utf8");
  const oldTag = `<script type="module" crossorigin src="/assets/${oldJs}"></script>`;
  const newTag = `<script defer src="/licensing-nav-alert.js"></script>\n    <script type="module" crossorigin src="/assets/${newJs}"></script>`;
  await writeCompressed(relative.replace(/^dist\//, ""), Buffer.from(replaceOnce(original, oldTag, newTag)));
}
await writeCompressed("licensing-nav-alert.js", await readFile(new URL("../public/licensing-nav-alert.js", import.meta.url)));
await writeFile(path.join(output, "Dockerfile"), `FROM ${baseImage}\nCOPY --chown=node:node overlay/dist /app/dist\n`);
console.log(JSON.stringify({ baseImage, oldJs, newJs, output, patchedSha256: hash(js) }));
