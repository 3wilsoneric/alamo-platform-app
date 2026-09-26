import { readFile, writeFile } from "node:fs/promises";

const indexPath = "/app/dist/index.html";
const marker = "<!-- alamo-iphone-polish-v1 -->";
const html = await readFile(indexPath, "utf8");

if (!html.includes('<link rel="manifest"') || !html.includes('<link rel="apple-touch-icon"')) {
  throw new Error("The running Azure image is missing its Home Screen manifest or icon.");
}
if (!html.includes("<head>")) throw new Error("The Azure app index has no head element.");

if (!html.includes(marker)) {
  const additions = [
    marker,
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
    '<link rel="stylesheet" href="/iphone-polish.css?v=1" />'
  ].join("\n    ");
  await writeFile(indexPath, html.replace("<head>", `<head>\n    ${additions}`), "utf8");
}
