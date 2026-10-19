import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getMondayCensusEmailSubject,
  renderMondayCensusEmail
} from "../shared/monday-census-email.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(root, "scripts/fixtures/monday-census-email.sanitized.json");
const outputDir = path.join(root, "generated/monday-census-email-prototype");
const outputPath = path.join(outputDir, "monday-census-email.html");
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const html = renderMondayCensusEmail(fixture);

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, html, "utf8");

console.log(`Subject: ${getMondayCensusEmailSubject(fixture)}`);
console.log(`Prototype: ${outputPath}`);
