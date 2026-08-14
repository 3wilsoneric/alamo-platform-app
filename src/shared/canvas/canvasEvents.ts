export const PLATFORM_CANVAS_SURFACE_EVENT = "alamo-platform:surface-in-canvas";

export interface PlatformCanvasSurfaceDetail {
  route?: string | null;
  sourceLabel?: string | null;
  introText?: string | null;
}

export function surfaceInPlatformCanvas(detail: PlatformCanvasSurfaceDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PlatformCanvasSurfaceDetail>(PLATFORM_CANVAS_SURFACE_EVENT, {
      detail
    })
  );
}
