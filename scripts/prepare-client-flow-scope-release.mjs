#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { brotliCompressSync, gzipSync } from "node:zlib";

const baseImage = process.env.CLIENT_FLOW_BASE_IMAGE;
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(baseImage ?? "")) throw Error("Set CLIENT_FLOW_BASE_IMAGE to the current production digest.");
const liveImage = execFileSync("az", ["containerapp", "show", "-n", "alamo-platform-prod-web", "-g", "alamo-data-rg", "--query", "properties.template.containers[0].image", "-o", "tsv"], { encoding: "utf8" }).trim();
if (liveImage !== baseImage) throw Error("Production image changed. Rebase the overlay.");
const output = path.join(process.cwd(), "generated", "client-flow-scope-release", "context");
const overlay = path.join(output, "overlay");
await rm(output, { recursive: true, force: true });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fromImage = (relative) => execFileSync("docker", ["run", "--rm", "--platform", "linux/amd64", "--entrypoint", "cat", baseImage, `/app/${relative}`], { maxBuffer: 32 * 1024 * 1024 });
const fromLive = (relative) => execFileSync("curl", ["-fsSL", `https://www.alamoplatform.com/${relative.replace(/^dist\//, "")}`], { maxBuffer: 32 * 1024 * 1024 });
function replaceOnce(value, before, after) {
  if (value.split(before).length !== 2) throw Error(`Expected one patch location for ${before.slice(0, 100)}`);
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
if (!/^index-resident-flow-[a-f0-9]{12}\.js$/.test(oldJs ?? "")) throw Error("Unexpected serving browser bundle.");
const oldBundle = fromImage(`dist/assets/${oldJs}`);
if (hash(oldBundle) !== hash(fromLive(`dist/assets/${oldJs}`))) throw Error("The live JavaScript does not match the pinned image.");

const sourceComponent = await readFile("src/features/admissions/components/ResidentFlowReport.tsx", "utf8");
let component = sourceComponent
  .replace(/^import .*?;\n/gm, "")
  .replace("export default function ResidentFlowReport", "function ResidentFlowReport")
  .replace(/fetchWithApiAuth\(url, \{ signal: controller.signal \}, \{[\s\S]*?\}\)\.then\(setReport\)/, 'to(url, controller.signal).then(setReport)')
  .replace(/\buseEffect\b/g, "V.useEffect")
  .replace(/\buseState\b/g, "V.useState");
if (component.includes("fetchWithApiAuth") || !component.includes("to(url, controller.signal)")) throw Error("Could not adapt the source component.");
const compiled = ts.transpileModule(component, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, jsxFactory: "V.createElement", jsxFragmentFactory: "V.Fragment", module: ts.ModuleKind.None } });
if (compiled.diagnostics?.length) throw Error(`Component transpile diagnostics: ${compiled.diagnostics.length}`);
if (compiled.outputText.includes("React.")) throw Error("Compiled component refers to an unbound React global.");
let bundle = oldBundle.toString("utf8");
const componentStart = bundle.indexOf("const number = (value)");
const componentEnd = bundle.indexOf("function z_(){", componentStart);
if (componentStart < 0 || componentEnd < 0 || bundle.indexOf("const number = (value)", componentStart + 1) !== -1) throw Error("Existing client-flow component boundary changed.");
bundle = bundle.slice(0, componentStart) + compiled.outputText + "\n" + bundle.slice(componentEnd);
bundle = replaceOnce(bundle,
  'e.reportId===`residents`&&e.scope.kind===`portfolio`?(0,H.jsx)(ResidentFlowReport,{}):null',
  'e.reportId===`residents`?(0,H.jsx)(ResidentFlowReport,{facilityId:e.scope.kind===`community`?e.scope.facilityId??null:null}):null'
);
bundle = replaceOnce(bundle, '{id:`medications`,label:`Medications`,path:`/analytics/medications`},', "");
bundle = replaceOnce(bundle, 'id:`medications`,title:`Medication performance report`,cadence:`Monthly`,audience:`Clinical leadership`,scope:`portfolio`,showInAnalyticsNav:!0', 'id:`medications`,title:`Medication performance report`,cadence:`Monthly`,audience:`Clinical leadership`,scope:`portfolio`,showInAnalyticsNav:!1');
const newJs = `index-client-flow-scope-${hash(bundle).slice(0, 12)}.js`;
await writeCompressed(`dist/assets/${newJs}`, Buffer.from(bundle));
for (const relative of ["dist/index.html", "dist/admissions/index.html"]) {
  const original = fromImage(relative).toString("utf8");
  await writeCompressed(relative, Buffer.from(replaceOnce(original, `/assets/${oldJs}`, `/assets/${newJs}`)));
}
await writeCompressed("dist/resident-flow-report.css", await readFile("src/features/admissions/components/resident-flow-report.css"));
let api = fromImage("api/platform.js").toString("utf8");
api = replaceOnce(api, '"/api/platform/resident-flow-report": () => getResidentFlowReport()', '"/api/platform/resident-flow-report": ({ requestUrl }) => getResidentFlowReport(requestUrl.searchParams.get("facilityId"))');
await mkdir(path.join(overlay, "api"), { recursive: true });
await mkdir(path.join(overlay, "server"), { recursive: true });
await writeFile(path.join(overlay, "api/platform.js"), api);
await writeFile(path.join(overlay, "server/resident-flow-report.mjs"), await readFile("server/resident-flow-report.mjs"));
let definitions = fromImage("shared/full-report.mjs").toString("utf8");
definitions = replaceOnce(definitions, 'id: "medications",\n    title: "Medication performance report",\n    cadence: "Monthly",\n    audience: "Clinical leadership",\n    scope: "portfolio",\n    showInAnalyticsNav: true', 'id: "medications",\n    title: "Medication performance report",\n    cadence: "Monthly",\n    audience: "Clinical leadership",\n    scope: "portfolio",\n    showInAnalyticsNav: false');
await mkdir(path.join(overlay, "shared"), { recursive: true });
await writeFile(path.join(overlay, "shared/full-report.mjs"), definitions);
await writeFile(path.join(output, "Dockerfile"), `FROM ${baseImage}\nCOPY --chown=node:node overlay/dist /app/dist\nCOPY --chown=node:node overlay/api/platform.js /app/api/platform.js\nCOPY --chown=node:node overlay/server/resident-flow-report.mjs /app/server/resident-flow-report.mjs\nCOPY --chown=node:node overlay/shared/full-report.mjs /app/shared/full-report.mjs\n`);
console.log(JSON.stringify({ baseImage, oldJs, newJs, output, bundleSha256: hash(bundle) }));
