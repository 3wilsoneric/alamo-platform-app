import { fetchWithApiAuth, readBoundedJsonResponse } from "../../shared/api/authenticatedFetch";

export interface PresentationDeck {
  title: string;
  width: number;
  height: number;
  slides: Array<{ id: string; title: string; html: string; notes: string }>;
  fonts: Array<{ asset: string; css: string }>;
  assets: string[];
}

export function readPresentationApi<T>(path: string, signal: AbortSignal) {
  return fetchWithApiAuth(`/api/platform/presentation${path}`, { signal, cache: "no-store" }, {
    consume: async (response) => {
      if (!response.ok) throw new Error(response.status === 404 ? "This presentation is not available for your account." : "The presentation could not be loaded. Please try again.");
      return readBoundedJsonResponse<T>(response, 2 * 1024 * 1024);
    }
  });
}

export async function loadPresentation(signal: AbortSignal) {
  const deck = await readPresentationApi<PresentationDeck>("", signal);
  const resources = await Promise.all(deck.assets.map(async (name) => {
    const asset = await readPresentationApi<{ name: string; dataUrl: string }>(`/asset?name=${encodeURIComponent(name)}`, signal);
    return [name, asset.dataUrl] as const;
  }));
  const assets = new Map(resources);
  const fonts = deck.fonts.map((font) => font.css.replace("__FONT_DATA__", assets.get(font.asset) ?? "")).join("\n");
  return {
    ...deck,
    slides: deck.slides.map((slide) => ({ ...slide, document: slideDocument(slide.html, fonts, assets) }))
  };
}

function slideDocument(html: string, fonts: string, assets: Map<string, string>) {
  const content = html.replace(/__ASSET:([^_]+)__/g, (_match, name: string) => assets.get(name) ?? "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>${fonts}
    *{box-sizing:border-box;margin:0;padding:0}html,body{width:1920px;height:1080px;overflow:hidden}body>section{position:relative;width:1920px;height:1080px;overflow:hidden}hr{border:0}table{border-collapse:collapse}aside{display:none}
    /* The supplied fixed-size layouts need small vertical fit corrections in the viewer. */
    #stack{padding-top:96px!important;padding-bottom:96px!important;gap:32px!important}
    #platform{padding-top:80px!important;padding-bottom:80px!important;gap:24px!important}
    #platform>div:nth-child(2)>div>div{padding-block:8px!important}
    #software-as-work{padding-top:80px!important;padding-bottom:80px!important;gap:32px!important}
    #software-as-work>div:nth-child(2)>div:first-child>div{padding-block:20px!important}
    #software-as-work>div:nth-child(2)>div:nth-child(3){padding-block:36px!important}
    #software-as-work>div:nth-child(2)>div:nth-child(5){padding-block:32px!important}
    #everyagent-how{padding-top:84px!important;padding-bottom:84px!important;gap:32px!important}
    #epic-plan{padding-top:72px!important;padding-bottom:56px!important;gap:24px!important}
    #epic-plan>div:nth-child(2)>div>div{padding-block:8px!important}
    </style></head><body>${content}</body></html>`;
}
