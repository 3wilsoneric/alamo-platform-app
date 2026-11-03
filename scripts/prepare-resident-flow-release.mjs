#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { brotliCompressSync, gzipSync } from "node:zlib";

const baseImage = process.env.RESIDENT_FLOW_BASE_IMAGE;
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(baseImage ?? "")) throw Error("Set RESIDENT_FLOW_BASE_IMAGE to the current production digest.");
const liveImage = execFileSync("az", ["containerapp", "show", "-n", "alamo-platform-prod-web", "-g", "alamo-data-rg", "--query", "properties.template.containers[0].image", "-o", "tsv"], { encoding: "utf8" }).trim();
if (liveImage !== baseImage) throw Error("Production image changed. Rebase the overlay.");
const output = path.join(process.cwd(), "generated", "resident-flow-release", "context");
const overlay = path.join(output, "overlay");
await rm(output, { recursive: true, force: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fromImage = (relative) => execFileSync("docker", ["run", "--rm", "--platform", "linux/amd64", "--entrypoint", "cat", baseImage, `/app/${relative}`], { maxBuffer: 32 * 1024 * 1024 });
const fromLive = (relative) => execFileSync("curl", ["-fsSL", `https://www.alamoplatform.com/${relative.replace(/^dist\//, "")}`], { maxBuffer: 32 * 1024 * 1024 });
function replaceOnce(value, before, after) {
  if (value.split(before).length !== 2) throw Error(`Expected one patch location for ${before.slice(0, 80)}`);
  return value.replace(before, after);
}
async function writeCompressed(relative, bytes) {
  const target = path.join(overlay, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await Promise.all([writeFile(target, bytes), writeFile(`${target}.gz`, gzipSync(bytes)), writeFile(`${target}.br`, brotliCompressSync(bytes))]);
}

const originalIndex = fromImage("dist/index.html");
if (hash(originalIndex) !== hash(fromLive("dist/index.html"))) throw Error("The live entry does not match the pinned image.");
const oldJs = originalIndex.toString().match(/\/assets\/(index-[\w-]+\.js)/)?.[1];
const firstRelease = oldJs === "index-licensing-viewers-7cd809f68bba.js";
const followupRelease = /^index-resident-flow-[a-f0-9]{12}\.js$/.test(oldJs ?? "");
if (!firstRelease && !followupRelease) throw Error("Unexpected serving browser bundle.");
const oldBundle = fromImage(`dist/assets/${oldJs}`);
if (hash(oldBundle) !== hash(fromLive(`dist/assets/${oldJs}`))) throw Error("The live JavaScript does not match the pinned image.");

const sourceComponent = await readFile("src/features/admissions/components/ResidentFlowReport.tsx", "utf8");
let component = sourceComponent
  .replace(/^import .*?;\n/gm, "")
  .replace("export default function ResidentFlowReport()", "function ResidentFlowReport()")
  .replace(/fetchWithApiAuth\("\/api\/platform\/resident-flow-report", \{ signal: controller.signal \}, \{[\s\S]*?\}\)\.then\(setReport\)/, 'to("/api/platform/resident-flow-report", controller.signal).then(setReport)')
  .replace(/\buseEffect\b/g, "V.useEffect")
  .replace(/\buseState\b/g, "V.useState");
if (component.includes("fetchWithApiAuth") || !component.includes('to("/api/platform/resident-flow-report"')) throw Error("Could not adapt the source component.");
const compiled = ts.transpileModule(component, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: "V.createElement", module: ts.ModuleKind.None } });
if (compiled.diagnostics?.length) throw Error(`Component transpile diagnostics: ${compiled.diagnostics.length}`);
let bundle = oldBundle.toString("utf8");
if (firstRelease) {
  bundle = replaceOnce(bundle, "function z_(){", `${compiled.outputText}\nfunction z_(){`);
  bundle = replaceOnce(bundle, ":(0,H.jsx)(I_,{pipeline:u,onOpenCard:l}),c&&u?", ":(0,H.jsx)(I_,{pipeline:u,onOpenCard:l}),(0,H.jsx)(ResidentFlowReport,{}),c&&u?");
} else {
  const componentStart = bundle.indexOf("const number = (value)");
  const componentEnd = bundle.indexOf("function z_(){", componentStart);
  if (componentStart < 0 || componentEnd < 0 || bundle.indexOf("const number = (value)", componentStart + 1) !== -1) throw Error("Existing resident-flow component boundary changed.");
  bundle = bundle.slice(0, componentStart) + compiled.outputText + "\n" + bundle.slice(componentEnd);
}
const newJs = `index-resident-flow-${hash(bundle).slice(0, 12)}.js`;
await writeCompressed(`dist/assets/${newJs}`, Buffer.from(bundle));

for (const relative of ["dist/index.html", "dist/admissions/index.html"]) {
  const original = fromImage(relative).toString("utf8");
  const replaced = replaceOnce(original, `/assets/${oldJs}`, `/assets/${newJs}`);
  const withCss = replaced.includes('href="/resident-flow-report.css"') ? replaced : replaceOnce(replaced, "</head>", '  <link rel="stylesheet" href="/resident-flow-report.css" />\n  </head>');
  await writeCompressed(relative, Buffer.from(withCss));
}
await writeCompressed("dist/resident-flow-report.css", await readFile("src/features/admissions/components/resident-flow-report.css"));

const oldApi = fromImage("api/platform.js").toString("utf8");
let api = oldApi;
if (firstRelease) {
  api = replaceOnce(api, 'import { assertLicensingAccess } from "../server/licensing-access.mjs";', 'import { assertLicensingAccess } from "../server/licensing-access.mjs";\nimport { getResidentFlowReport } from "../server/resident-flow-report.mjs";');
  api = replaceOnce(api, 'const PLATFORM_GET_ROUTES = Object.freeze({', 'const PLATFORM_GET_ROUTES = Object.freeze({\n  "/api/platform/resident-flow-report": () => getResidentFlowReport(),');
} else if (!api.includes('"/api/platform/resident-flow-report": () => getResidentFlowReport()')) throw Error("Existing resident-flow API route is missing.");
await mkdir(path.join(overlay, "api"), { recursive: true });
await mkdir(path.join(overlay, "server"), { recursive: true });
await writeFile(path.join(overlay, "api/platform.js"), api);
await writeFile(path.join(overlay, "server/resident-flow-report.mjs"), await readFile("server/resident-flow-report.mjs"));
await writeFile(path.join(output, "Dockerfile"), `FROM ${baseImage}\nCOPY --chown=node:node overlay/dist /app/dist\nCOPY --chown=node:node overlay/api/platform.js /app/api/platform.js\nCOPY --chown=node:node overlay/server/resident-flow-report.mjs /app/server/resident-flow-report.mjs\n`);
console.log(JSON.stringify({ baseImage, oldJs, newJs, output, bundleSha256: hash(bundle) }));
