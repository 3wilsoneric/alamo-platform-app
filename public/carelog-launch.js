// Keep the Platform MSAL session in this top-level page. Carelog's existing
// same-origin bridge requests a token from the iframe only after it loads.
(() => {
  // The new same-origin tab has already inherited the Platform MSAL cache.
  // Carelog does not need a live handle to the original Platform tab.
  if (window.opener) window.opener = null;
  const frame = document.getElementById("app-screen");
  const surface = document.getElementById("surface");
  const turn = document.getElementById("turn");
  const status = document.getElementById("status");
  const continueButton = document.getElementById("continue-upright");
  const isPhone = () => new URLSearchParams(window.location.search).get("phone") === "1" ||
    window.matchMedia("(any-pointer: coarse)").matches && Math.min(window.screen.width, window.screen.height) <= 600;
  let bridgeReady = false;
  let opened = false;
  let continueUpright = false;

  function fitPhoneSurface() {
    if (!isPhone()) return;
    // Match Carelog's tested phone presenter: retain its 1098px Surface layout,
    // then fit it to the landscape phone without shrinking its work area.
    const scale = Math.min(1, Math.max(1, surface.clientWidth) / 1098);
    frame.style.width = "1098px";
    frame.style.height = `${Math.max(1, surface.clientHeight) / scale}px`;
    frame.style.transform = `scale(${scale})`;
    const root = frame.contentDocument?.documentElement;
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

  const bridge = document.createElement("script");
  bridge.type = "module";
  bridge.src = "/carelog-platform-session.js?v=phone-bridge-1104";
  bridge.addEventListener("load", () => { bridgeReady = true; update(); });
  bridge.addEventListener("error", () => { status.textContent = "Carelog sign-in could not load. Reload this page."; });
  document.head.append(bridge);
  frame.addEventListener("load", fitPhoneSurface);
  continueButton.addEventListener("click", () => { continueUpright = true; update(); });
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
  window.matchMedia("(orientation: landscape)").addEventListener("change", update);
  window.screen.orientation?.addEventListener?.("change", update);
  window.visualViewport?.addEventListener("resize", update);
  new ResizeObserver(fitPhoneSurface).observe(surface);
  update();
})();
