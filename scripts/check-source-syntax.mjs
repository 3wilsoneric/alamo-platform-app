import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const javascriptRoots = ["api", "server", "shared", "scripts"];
const jsonFiles = [
  "knip.json",
  "package-lock.json",
  "package.json",
  "tsconfig.json",
  "vercel.json"
];

async function collectFiles(directory, predicate) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolutePath, predicate));
    else if (predicate(absolutePath)) files.push(absolutePath);
  }
  return files;
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${label} failed${detail ? `:\n${detail}` : "."}`);
  }
}

const javascriptFiles = (await Promise.all(
  javascriptRoots.map((directory) => collectFiles(
    path.join(root, directory),
    (file) => /\.(?:js|mjs)$/.test(file)
  ))
)).flat().sort();

for (const file of javascriptFiles) {
  run(process.execPath, ["--check", file], path.relative(root, file));
}

const notebookFiles = (await collectFiles(
  path.join(root, "databricks", "notebooks"),
  (file) => file.endsWith(".py")
)).sort();
run(
  process.env.PYTHON ?? "python3",
  [
    "-c",
    "from pathlib import Path; import sys; [compile(Path(file).read_text(), file, 'exec') for file in sys.argv[1:]]",
    ...notebookFiles
  ],
  "Databricks notebook syntax"
);

const workflowFiles = (await collectFiles(
  path.join(root, "databricks", "workflows"),
  (file) => file.endsWith(".json")
)).sort();
for (const file of [...jsonFiles.map((file) => path.join(root, file)), ...workflowFiles]) {
  JSON.parse(await readFile(file, "utf8"));
}

console.log(
  `source syntax checks passed (${javascriptFiles.length} JavaScript modules, ` +
    `${notebookFiles.length} Python notebooks, ${jsonFiles.length + workflowFiles.length} JSON files)`
);
