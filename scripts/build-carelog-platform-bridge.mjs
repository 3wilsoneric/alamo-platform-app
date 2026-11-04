import { build } from "rolldown";

const output = process.argv[2] ?? "public/carelog-platform-session.js";
await build({
  input: "src/carelog/platformSessionBridge.ts",
  output: { file: output, format: "iife", minify: true }
});
console.log(`Built ${output}`);
