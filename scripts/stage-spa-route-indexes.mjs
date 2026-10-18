#!/usr/bin/env node
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const distRoot = path.resolve(process.cwd(), "dist");
const sourceIndex = path.join(distRoot, "index.html");
const routeDirectories = ["admissions", "chat"];

await Promise.all(routeDirectories.map(async (route) => {
  const routeDirectory = path.join(distRoot, route);
  await mkdir(routeDirectory, { recursive: true });
  await copyFile(sourceIndex, path.join(routeDirectory, "index.html"));
}));

console.log(`staged SPA entry document for ${routeDirectories.join(", ")}`);
