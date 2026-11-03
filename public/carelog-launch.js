// Keep the Platform MSAL session in this top-level page. Carelog's existing
// same-origin bridge requests a token from the iframe only after it loads.
(() => {
  const frame = document.getElementById("app-screen");
  const turn = document.getElementById("turn");
  const status = document.getElementById("status");
  const isPhone = () => window.matchMedia("(any-pointer: coarse)").matches && Math.min(window.screen.width, window.screen.height) <= 600;
  let bridgeReady = false;
  let opened = false;

  function update() {
    const sideways = window.innerWidth > window.innerHeight;
    const waiting = isPhone() && !sideways;
    turn.hidden = !waiting;
    if (!waiting && bridgeReady && !opened) {
      opened = true;
      frame.src = "/poc/app/now?platform=1";
    }
  }

  const bridge = document.createElement("script");
  bridge.type = "module";
  bridge.src = "/poc/app/platform-session.js";
  bridge.addEventListener("load", () => { bridgeReady = true; update(); });
  bridge.addEventListener("error", () => { status.textContent = "Carelog sign-in could not load. Reload this page."; });
  document.head.append(bridge);
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", update);
  update();
})();
