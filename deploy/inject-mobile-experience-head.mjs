import { readFile, writeFile } from "node:fs/promises";

const indexPath = "/app/dist/index.html";
const marker = "<!-- alamo-mobile-experience-v11 -->";
let html = await readFile(indexPath, "utf8");

if (!html.includes("<!-- alamo-iphone-polish-v1 -->") || !html.includes("</head>")) {
  throw new Error("The expected Azure iPhone release HTML is missing.");
}

html = html
  .replace(/\s*<!-- alamo-mobile-experience-v\d+ -->/g, "")
  .replace(/\s*<link rel="stylesheet" href="\/mobile-app-experience\.css\?v=\d+"\s*\/>/g, "")
  .replace(/\s*<script defer src="\/mobile-app-experience\.js\?v=\d+"><\/script>/g, "")
  .replace(/\s*<link rel="icon" href="\/pwa\/alamo-favicon-32-v1\.png"[^>]*\/>/g, "")
  .replace(/href="\/favicon\.svg[^\"]*" type="image\/svg\+xml"/g, 'href="/pwa/alamo-favicon-32-v2.png" type="image/png" sizes="32x32"')
  .replace(/href="\/favicon\.ico[^\"]*"/g, 'href="/pwa/alamo-favicon-32-v2.png" type="image/png"')
  .replace(/href="\/pwa\/alamo-apple-touch-icon-180-v1\.png"/g, 'href="/pwa/alamo-apple-touch-icon-180-v2.png"')
  .replace(/href="\/manifest\.json[^\"]*"/g, 'href="/manifest.json?v=ah-brand-v2"')
  .replace(/(<meta name="application-name" content=")[^"]*("\s*\/?>)/g, "$1Alamo Health Management$2");

const additions = [
  marker,
  '<link rel="stylesheet" href="/mobile-app-experience.css?v=13" />',
  '<script defer src="/mobile-app-experience.js?v=13"></script>'
].join("\n    ");
html = html.replace("</head>", `    ${additions}\n  </head>`);

await writeFile(indexPath, html, "utf8");
