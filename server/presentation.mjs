import { readFile } from "node:fs/promises";
import { createHttpError } from "./http-errors.mjs";
import { isProductionLikeRuntime } from "./runtime-environment.mjs";

const ERIC_OBJECT_ID = "f73371d5-d2b4-48b4-a32b-1edc7c88869f";
const PRESENTATION_TENANT_ID = "d72d9036-cff8-4f5f-a6fa-d698f621d420";
const CONTENT_ROOT = new URL("./presentations/alamo-data-strategy/", import.meta.url);
const normalize = (value) => String(value ?? "").trim().toLowerCase();
const plainText = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#160;/g, " ").trim();

// This permission is independent of owner/admin roles and never grants access
// to another Platform workspace. Andrew stays denied until explicitly configured.
export function hasPresentationAccess(authContext, options = {}) {
  const isLoopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(options.remoteAddress);
  if (!isProductionLikeRuntime() && isLoopback && authContext?.authenticated === false && authContext?.mode === "explicit-development-bypass") return true;
  if (authContext?.authenticated !== true || authContext?.mode !== "entra-delegated") return false;
  const claims = authContext.claims ?? {};
  if (normalize(claims.tid) !== PRESENTATION_TENANT_ID) return false;
  const oid = normalize(claims.oid);
  if (oid === ERIC_OBJECT_ID) return true;
  const andrewId = normalize(options.andrewObjectId ?? process.env.PLATFORM_PRESENTATION_ANDREW_OBJECT_ID);
  if (andrewId) return oid === andrewId;
  const andrewEmail = normalize(options.andrewEmail ?? process.env.PLATFORM_PRESENTATION_ANDREW_EMAIL);
  return Boolean(andrewEmail && [claims.preferred_username, claims.email, claims.upn].map(normalize).includes(andrewEmail));
}

function assertPresentationAccess(authContext, options) {
  if (!hasPresentationAccess(authContext, options)) throw createHttpError(404, "not_found", "Not found.");
}

let contentPromise;
async function loadContent() {
  const manifest = JSON.parse(await readFile(new URL("deck.json", CONTENT_ROOT), "utf8"));
  const fontFiles = JSON.parse(await readFile(new URL("fonts.json", CONTENT_ROOT), "utf8"));
  const assets = new Set();
  const slides = await Promise.all(manifest.order.map(async (id) => {
    if (!/^[a-z0-9-]+$/.test(id)) throw new Error("Invalid presentation slide.");
    const source = await readFile(new URL(`slides/${id}.html`, CONTENT_ROOT), "utf8");
    if (/<(?:script|iframe|object|embed|form)\b|\son[a-z]+\s*=|javascript:|url\(/i.test(source)) throw new Error("Unsupported active presentation content.");
    const notes = [...source.matchAll(/<aside\b[^>]*>([\s\S]*?)<\/aside>/gi)].map((match) => plainText(match[1] ?? "")).join("\n");
    const html = source.replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, "").replace(/src="\.\.\/images\/([a-z0-9-]+\.png)"/g, (_match, name) => {
      assets.add(`images/${name}`);
      return `src="__ASSET:images/${name}__"`;
    });
    const title = plainText(source.match(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/i)?.[1] ?? id);
    return { id, title, html, notes };
  }));
  const fonts = fontFiles.map((font) => {
    if (!/^fonts\/[a-z0-9-]+\.(ttf|woff2)$/.test(font.file)) throw new Error("Invalid presentation font.");
    assets.add(font.file);
    return { asset: font.file, css: font.css };
  });
  return { title: manifest.title, width: 1920, height: 1080, slides, fonts, assets: [...assets] };
}

function content() {
  contentPromise ??= loadContent().catch((error) => { contentPromise = undefined; throw error; });
  return contentPromise;
}

export async function getPresentation(authContext, options = {}) {
  assertPresentationAccess(authContext, options);
  return content();
}

export async function getPresentationAsset(requestUrl, authContext, options = {}) {
  assertPresentationAccess(authContext, options);
  const name = requestUrl.searchParams.get("name");
  const deck = await content();
  if (!deck.assets.includes(name)) throw createHttpError(404, "not_found", "Not found.");
  const bytes = await readFile(new URL(name, CONTENT_ROOT));
  const mediaType = name.endsWith(".png") ? "image/png" : name.endsWith(".woff2") ? "font/woff2" : "font/ttf";
  return { name, dataUrl: `data:${mediaType};base64,${bytes.toString("base64")}` };
}
