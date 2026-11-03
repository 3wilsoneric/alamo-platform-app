// Keep the Platform MSAL session in this top-level page. Carelog's existing
// same-origin bridge requests a token from the iframe only after it loads.
(() => {
  const frame = document.getElementById("app-screen");
  const surface = document.getElementById("surface");
  const turn = document.getElementById("turn");
  const status = document.getElementById("status");
  const isPhone = () => new URLSearchParams(window.location.search).get("phone") === "1" ||
    window.matchMedia("(any-pointer: coarse)").matches && Math.min(window.screen.width, window.screen.height) <= 600;
  let bridgeReady = false;
  let opened = false;

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
    const sideways = window.innerWidth > window.innerHeight;
    const waiting = isPhone() && !sideways;
    turn.hidden = !waiting;
    if (!waiting && bridgeReady && !opened) {
      opened = true;
      frame.src = "/poc/app/now?platform=1&presented=1";
    }
    fitPhoneSurface();
  }

  const bridge = document.createElement("script");
  bridge.type = "module";
  bridge.src = "/poc/app/platform-session.js";
  bridge.addEventListener("load", () => { bridgeReady = true; update(); });
  bridge.addEventListener("error", () => { status.textContent = "Carelog sign-in could not load. Reload this page."; });
  document.head.append(bridge);
  frame.addEventListener("load", fitPhoneSurface);
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
  window.visualViewport?.addEventListener("resize", update);
  update();
})();
