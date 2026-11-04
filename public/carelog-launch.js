// The signed-in Platform tab can provide its existing delegated token through
// a one-to-one MessagePort. The standalone bridge remains a direct-link fallback.
(() => {
  const frame = document.getElementById("app-screen");
  const surface = document.getElementById("surface");
  const turn = document.getElementById("turn");
  const status = document.getElementById("status");
  const loading = document.getElementById("loading");
  const continueButton = document.getElementById("continue-upright");
  const isPhone = () => new URLSearchParams(window.location.search).get("phone") === "1" ||
    window.matchMedia("(any-pointer: coarse)").matches && Math.min(window.screen.width, window.screen.height) <= 600;
  let bridgeReady = false;
  let opened = false;
  let continueUpright = false;
  let usingLocalBridge = false;
  let handoff = null;
  try {
    const raw = sessionStorage.getItem("carelog-platform-handoff-v1");
    sessionStorage.removeItem("carelog-platform-handoff-v1");
    const value = raw ? JSON.parse(raw) : null;
    if (typeof value?.token === "string" && value.token && Number.isFinite(value.expires)
      && value.expires > Date.now() + 30_000) handoff = value;
  } catch { /* Direct links can use the local bridge. */ }
  if (handoff) document.documentElement.setAttribute("data-carelog-handoff", "ready");

  function fitPhoneSurface() {
    if (!isPhone()) return;
    // Match Carelog's tested phone presenter: retain its 1098px Surface layout,
    // then fit it to the landscape phone without shrinking its work area.
    const availableWidth = surface.clientWidth || window.visualViewport?.width || window.innerWidth;
    const availableHeight = surface.clientHeight || window.visualViewport?.height || window.innerHeight;
    const scale = Math.min(1, Math.max(200, availableWidth) / 1098);
    frame.style.width = "1098px";
    frame.style.height = `${Math.max(1, availableHeight) / scale}px`;
    frame.style.transform = `scale(${scale})`;
    let root;
    try { root = frame.contentDocument?.documentElement; } catch { return; }
    if (!root || frame.getAttribute("src") === "about:blank") return;
    root.setAttribute("data-presented", "");
    root.setAttribute("data-phone-surface", "");
    root.style.setProperty("--p-presentation-scale", String(scale));
    if (!root.querySelector("#carelog-phone-viewport")) {
      const stylesheet = frame.contentDocument.createElement("link");
      stylesheet.id = "carelog-phone-viewport";
      stylesheet.rel = "stylesheet";
      stylesheet.href = "/carelog-phone.css?v=phone-surface-1103";
      frame.contentDocument.head.append(stylesheet);
    }
  }

  function update() {
    const phone = isPhone();
    document.documentElement.toggleAttribute("data-phone", phone);
    document.documentElement.toggleAttribute("data-continue-upright", continueUpright);
    const sideways = window.matchMedia("(orientation: landscape)").matches || window.innerWidth > window.innerHeight;
    const waiting = phone && !sideways && !continueUpright;
    turn.hidden = !waiting;
    // Load the app beneath the turn prompt. Rotation only reveals an already
    // running surface, so a delayed or missing iOS resize cannot strand users.
    if (bridgeReady && !opened) {
      opened = true;
      frame.src = "/poc/app/now?platform=1&presented=1";
    }
    fitPhoneSurface();
  }

  function loadLocalBridge() {
    if (usingLocalBridge || bridgeReady) return;
    usingLocalBridge = true;
    if (window.opener) window.opener = null;
    const bridge = document.createElement("script");
    bridge.type = "module";
    bridge.src = "/carelog-platform-session.js?v=phone-bridge-1104";
    bridge.addEventListener("load", () => { bridgeReady = true; update(); });
    bridge.addEventListener("error", () => { status.textContent = "Carelog could not open. Return to Platform and try the Carelog icon again."; });
    document.head.append(bridge);
  }

  function connectToPlatformTab() {
    let opener;
    try { if (window.opener?.location.origin === location.origin) opener = window.opener; } catch { /* A direct link has no trusted Platform opener. */ }
    const channel = opener && typeof MessageChannel === "function" ? new MessageChannel() : null;
    const pending = new Set();
    let connected = false;
    window.addEventListener("message", (event) => {
      if (usingLocalBridge || event.origin !== location.origin || event.source !== frame.contentWindow
        || event.data?.type !== "poc-platform-token-request" || typeof event.data.requestId !== "string"
        || !event.data.requestId || event.data.requestId.length > 64) return;
      if (handoff?.expires > Date.now() + 30_000) {
        frame.contentWindow?.postMessage({ type: "poc-platform-token", requestId: event.data.requestId,
          token: handoff.token, expires: handoff.expires }, location.origin);
      } else if (connected && channel) {
        pending.add(event.data.requestId);
        channel.port1.postMessage({ type: "carelog-platform-token-request", requestId: event.data.requestId });
      }
    });
    if (handoff) { bridgeReady = true; update(); }
    if (!channel || !opener) { if (!handoff) loadLocalBridge(); return; }
    const fallback = window.setTimeout(() => {
      if (connected) return;
      window.opener = null;
      if (!handoff) loadLocalBridge();
    }, 3500);
    channel.port1.onmessage = ({ data }) => {
      if (usingLocalBridge) return;
      if (data?.type === "carelog-platform-ready") {
        connected = true;
        window.clearTimeout(fallback);
        window.opener = null;
        bridgeReady = true;
        update();
        return;
      }
      if (data?.type === "carelog-platform-unavailable") {
        window.clearTimeout(fallback);
        if (!handoff) loadLocalBridge();
        return;
      }
      if (data?.type !== "carelog-platform-token" || !pending.has(data.requestId)) return;
      pending.delete(data.requestId);
      frame.contentWindow?.postMessage({ type: "poc-platform-token", requestId: data.requestId,
        ...(data.token && data.expires ? { token: data.token, expires: data.expires } : { error: data.error || "platform_no_session" }) }, location.origin);
    };
    channel.port1.start();
    try { opener.postMessage({ type: "carelog-platform-connect" }, location.origin, [channel.port2]); }
    catch { window.clearTimeout(fallback); if (!handoff) loadLocalBridge(); }
  }

  frame.addEventListener("load", () => {
    fitPhoneSurface();
    let body;
    try { body = frame.contentDocument?.body; } catch { return; }
    if (!body) return;
    const reveal = () => {
      if (!body.innerText?.trim()) return;
      loading.hidden = true;
      observer.disconnect();
    };
    const observer = new MutationObserver(reveal);
    observer.observe(body, { childList: true, subtree: true, characterData: true });
    reveal();
  });
  continueButton.addEventListener("click", () => { continueUpright = true; update(); });
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
  window.matchMedia("(orientation: landscape)").addEventListener("change", update);
  window.screen.orientation?.addEventListener?.("change", update);
  window.visualViewport?.addEventListener("resize", update);
  new ResizeObserver(fitPhoneSurface).observe(surface);
  window.setTimeout(() => {
    if (!loading.hidden) loading.textContent = "Carelog is taking longer than expected. Close this tab and open it again from Platform.";
  }, 12_000);
  connectToPlatformTab();
  update();
})();
