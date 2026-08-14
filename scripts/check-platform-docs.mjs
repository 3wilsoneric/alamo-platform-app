import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");

const targets = [
  path.join(appRoot, "AGENTS.md"),
  path.join(appRoot, "README.md"),
  path.join(appRoot, "docs")
];

function walkMarkdown(target) {
  if (!existsSync(target)) return [];
  const stat = statSync(target);
  if (stat.isFile()) return target.endsWith(".md") ? [target] : [];
  return readdirSync(target)
    .flatMap((entry) => walkMarkdown(path.join(target, entry)))
    .sort();
}

function parseLinks(markdown) {
  const links = [];
  const pattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(pattern)) {
    links.push(match[1]);
  }
  return links;
}

function normalizeLocalLink(link, sourceFile) {
  const clean = link.split("#")[0];
  if (!clean || /^(https?:|mailto:|#)/i.test(clean)) return null;
  if (clean.startsWith("/")) return clean;
  return path.resolve(path.dirname(sourceFile), clean);
}

const files = targets.flatMap(walkMarkdown);
const failures = [];

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  if (!/^# .+/m.test(raw)) {
    failures.push(`${file}: missing top-level heading`);
  }
  const shouldRequireMetadata =
    file.startsWith(path.join(appRoot, "docs")) ||
    file === path.join(appRoot, "README.md");
  if (shouldRequireMetadata) {
    for (const required of ["purpose:", "status:", "owners:", "updated:", "tags:", "labels:"]) {
      if (!raw.includes(required)) {
        failures.push(`${file}: missing metadata field ${required}`);
      }
    }
  }
  for (const link of parseLinks(raw)) {
    const local = normalizeLocalLink(link, file);
    if (local && (!existsSync(local) || statSync(local).isDirectory())) {
      failures.push(`${file}: broken or non-file local link -> ${link}`);
    }
  }
}

if (failures.length) {
  console.error("Platform docs check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Platform docs check passed for ${files.length} markdown files.`);
