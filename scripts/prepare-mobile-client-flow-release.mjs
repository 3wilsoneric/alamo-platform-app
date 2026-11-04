#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { brotliCompressSync, gzipSync } from "node:zlib";

const baseImage = process.env.PLATFORM_MOBILE_BASE_IMAGE;
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(baseImage ?? "")) {
  throw Error("Set PLATFORM_MOBILE_BASE_IMAGE to the current production digest.");
}
const current = execFileSync("az", ["containerapp", "show", "-n", "alamo-platform-prod-web", "-g", "alamo-data-rg", "--query", "properties.template.containers[0].image", "-o", "tsv"], { encoding: "utf8" }).trim();
if (current !== baseImage) throw Error("Production image changed. Rebase the overlay.");

const output = path.join(process.cwd(), "generated", "mobile-client-flow-release", "context");
const overlay = path.join(output, "overlay", "dist");
await rm(output, { recursive: true, force: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fromImage = (relative) => execFileSync("docker", ["run", "--rm", "--platform", "linux/amd64", "--entrypoint", "cat", baseImage, `/app/dist/${relative}`], { maxBuffer: 32 * 1024 * 1024 });
const fromLive = (relative) => execFileSync("curl", ["-fsSL", `https://www.alamoplatform.com/${relative}`], { maxBuffer: 32 * 1024 * 1024 });
function replaceOnce(value, before, after) {
  if (value.split(before).length !== 2) throw Error(`Expected one patch location for ${before.slice(0, 80)}`);
  return value.replace(before, after);
}
async function writeCompressed(relative, bytes) {
  const target = path.join(overlay, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await Promise.all([writeFile(target, bytes), writeFile(`${target}.gz`, gzipSync(bytes)), writeFile(`${target}.br`, brotliCompressSync(bytes))]);
}

const originalIndex = fromImage("index.html");
if (hash(originalIndex) !== hash(fromLive("analytics"))) throw Error("The live Analytics entry does not match the pinned image.");
const oldJs = originalIndex.toString("utf8").match(/\/assets\/(index-[\w-]+\.js)/)?.[1];
if (!/^index-client-flow-scope-[a-f0-9]{12}\.js$/.test(oldJs ?? "")) throw Error("Unexpected serving browser bundle.");
const oldBundle = fromImage(`assets/${oldJs}`);
if (hash(oldBundle) !== hash(fromLive(`assets/${oldJs}`))) throw Error("The live JavaScript does not match the pinned image.");

const sourceComponent = await readFile("src/features/admissions/components/ResidentFlowReport.tsx", "utf8");
const component = sourceComponent
  .replace(/^import .*?;\n/gm, "")
  .replace("export default function ResidentFlowReport", "function ResidentFlowReport")
  .replace(/fetchWithApiAuth\(url, \{ signal: controller.signal \}, \{[\s\S]*?\}\)\.then\(setReport\)/, 'to(url, controller.signal).then(setReport)')
  .replace(/\buseEffect\b/g, "V.useEffect")
  .replace(/\buseState\b/g, "V.useState");
if (component.includes("fetchWithApiAuth") || !component.includes("to(url, controller.signal)")) throw Error("Could not adapt the source component.");
const compiled = ts.transpileModule(component, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: "V.createElement", jsxFragmentFactory: "V.Fragment", module: ts.ModuleKind.None } });
if (compiled.diagnostics?.length || compiled.outputText.includes("React.")) throw Error("Client-flow component could not be compiled for the pinned bundle.");
let bundle = oldBundle.toString("utf8");
const start = bundle.indexOf("const number = (value)");
const end = bundle.indexOf("function z_(){", start);
if (start < 0 || end < 0 || bundle.indexOf("const number = (value)", start + 1) !== -1) throw Error("Client-flow component boundary changed.");
bundle = bundle.slice(0, start) + compiled.outputText + "\n" + bundle.slice(end);
const newJs = `index-mobile-flow-${hash(bundle).slice(0, 12)}.js`;
await writeCompressed(`assets/${newJs}`, Buffer.from(bundle));

const flowCss = await readFile("src/features/admissions/components/resident-flow-report.css");
const mobileCss = await readFile("public/platform-mobile-fixes.css");
await writeCompressed("resident-flow-report.css", flowCss);
await writeCompressed("platform-mobile-fixes.css", mobileCss);
for (const [relative, route] of [["index.html", "analytics"], ["admissions/index.html", "admissions"]]) {
  const original = fromImage(relative);
  if (hash(original) !== hash(fromLive(route))) throw Error(`${route} does not match the pinned image.`);
  let html = replaceOnce(original.toString("utf8"), `/assets/${oldJs}`, `/assets/${newJs}`);
  html = html.replace(/href="\/resident-flow-report\.css(?:\?[^"]*)?"/, `href="/resident-flow-report.css?v=${hash(flowCss).slice(0, 12)}"`);
  if (!html.includes(`resident-flow-report.css?v=${hash(flowCss).slice(0, 12)}`)) throw Error("Client-flow stylesheet link changed.");
  if (html.includes("/platform-mobile-fixes.css")) throw Error("Mobile fix stylesheet already present; rebase the overlay.");
  html = replaceOnce(html, "</head>", `  <link rel="stylesheet" href="/platform-mobile-fixes.css?v=${hash(mobileCss).slice(0, 12)}" />\n  </head>`);
  await writeCompressed(relative, Buffer.from(html));
}
await writeFile(path.join(output, "Dockerfile"), `FROM ${baseImage}\nCOPY --chown=node:node overlay/dist /app/dist\n`);
console.log(JSON.stringify({ baseImage, oldJs, newJs, flowCss: hash(flowCss), mobileCss: hash(mobileCss), output }));
