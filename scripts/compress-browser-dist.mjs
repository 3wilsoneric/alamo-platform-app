#!/usr/bin/env node

import { brotliCompressSync, gzipSync } from "node:zlib";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const distRoot = path.resolve(process.cwd(), "dist");
const compressibleExtension = /\.(?:html|js|css|json|svg)$/;
let compressedFiles = 0;

await compressDirectory(distRoot);

console.log(`generated gzip and Brotli browser representations for ${compressedFiles} files`);

async function compressDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await compressDirectory(file);
      continue;
    }
    if (!compressibleExtension.test(entry.name)) continue;

    const bytes = await readFile(file);
    await Promise.all([
      writeFile(`${file}.gz`, gzipSync(bytes)),
      writeFile(`${file}.br`, brotliCompressSync(bytes))
    ]);
    compressedFiles += 1;
  }
}
