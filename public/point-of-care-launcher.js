// Carelog owns its own access checks. This is a Platform navigation shortcut only.
(() => {
  const viewers = new Set(["betty dominici", "andrew dominici", "eric wilson"]);
  const desktopLink = "/carelog-demo.html";
  const phoneLink = "/carelog.html?phone=1";
  const popupBrokerUrl = "/carelog-popup-token.js?v=phone-handoff-1104";
  const phonePopups = new Set();
  let preparedToken = null;
  let preparingToken = null;
  let lastPrepareAttempt = 0;
  function prepareToken() {
    if (preparedToken?.expires > Date.now() + 60_000 || preparingToken || Date.now() - lastPrepareAttempt < 30_000) return;
    lastPrepareAttempt = Date.now();
    preparingToken = import(popupBrokerUrl).then(({ acquireExistingPlatformToken }) => acquireExistingPlatformToken())
      .then((token) => {
        if (token?.token && token.expires > Date.now() + 60_000) {
          preparedToken = token;
          document.querySelectorAll(".platform-poc-launcher").forEach((link) => { link.dataset.platformTokenReady = "true"; });
        }
      }).catch(() => { preparedToken = null; }).finally(() => { preparingToken = null; });
  }
  window.addEventListener("message", async (event) => {
    if (event.origin !== location.origin || !phonePopups.has(event.source)
      || event.data?.type !== "carelog-platform-connect" || event.ports.length !== 1) return;
    const port = event.ports[0];
    phonePopups.delete(event.source);
    try {
      const { acquireExistingPlatformToken } = await import(popupBrokerUrl);
      port.onmessage = async ({ data }) => {
        if (data?.type !== "carelog-platform-token-request" || typeof data.requestId !== "string"
          || !data.requestId || data.requestId.length > 64) return;
        try {
          port.postMessage({ type: "carelog-platform-token", requestId: data.requestId,
            ...await acquireExistingPlatformToken() });
        } catch {
          port.postMessage({ type: "carelog-platform-token", requestId: data.requestId,
            error: "platform_no_session" });
        }
      };
      port.start();
      port.postMessage({ type: "carelog-platform-ready" });
    } catch {
      port.postMessage({ type: "carelog-platform-unavailable" });
    }
  });
  const selector = ".platform-poc-launcher";
  const styles = `
    .platform-poc-launcher{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-width:44px;min-height:44px;padding:4px 10px 4px 5px;border:1px solid #c6d8d1;border-radius:999px;background:#f5faf7;color:#164b43;text-decoration:none;font:700 13px/1 Arial,Helvetica,sans-serif;white-space:nowrap;box-shadow:0 2px 7px rgba(19,68,55,.08);transition:background .16s ease,transform .16s ease,box-shadow .16s ease}
    .platform-poc-launcher:hover{background:#e4f3ea;transform:translateY(-1px);box-shadow:0 5px 12px rgba(19,68,55,.15)}
    .platform-poc-launcher:focus-visible{outline:3px solid #087d64;outline-offset:3px}
    .platform-poc-launcher__icon{display:grid;place-items:center;flex:none;width:35px;height:35px;border-radius:50%;background:linear-gradient(145deg,#087d64 5%,#23587c 78%);color:#fff}
    .platform-poc-launcher__icon svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .platform-poc-launcher__label{padding-right:3px}
    [data-platform-primary-links]>.platform-poc-launcher{margin-left:7px}
    [data-platform-page-navigation]>.platform-poc-launcher{display:none}
    @media(max-width:1023px){[data-platform-page-navigation]>.platform-poc-launcher{display:inline-flex;margin-left:auto;margin-right:3px;padding:4px;border-radius:50%}.platform-poc-launcher__label{display:none}}
  `;
  if (!document.getElementById("platform-poc-launcher-style")) {
    const style = document.createElement("style");
    style.id = "platform-poc-launcher-style";
    style.textContent = styles;
    document.head.append(style);
  }

  function launcher(surface) {
    const anchor = document.createElement("a");
    anchor.className = "platform-poc-launcher";
    anchor.href = surface === "mobile" ? phoneLink : desktopLink;
    anchor.target = "_blank";
    // The new same-origin page inherits this tab's MSAL session, then drops
    // its opener before navigating to the Carelog presenter.
    anchor.rel = "opener";
    anchor.setAttribute("data-platform-poc-surface", surface);
    anchor.setAttribute("aria-label", "Open Carelog Point of Care");
    anchor.title = "Open Carelog Point of Care";
    anchor.innerHTML = `<span class="platform-poc-launcher__icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M11 5v9a5 5 0 0 0 10 0V5"/><path d="M8 5h3m10 0h3M16 19v4a5 5 0 0 0 10 0v-3"/><circle cx="26" cy="18" r="2"/></svg></span><span class="platform-poc-launcher__label">Carelog</span>`;
    if (surface === "mobile") anchor.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const popup = window.open("about:blank", "_blank");
      if (popup) {
        phonePopups.add(popup);
        try {
          if (preparedToken?.expires > Date.now() + 60_000) {
            popup.sessionStorage.setItem("carelog-platform-handoff-v1", JSON.stringify(preparedToken));
          }
        } catch { /* The live MessagePort handoff remains available. */ }
        popup.location.replace(anchor.href);
      }
      else window.location.assign(anchor.href);
    });
    return anchor;
  }

  function render() {
    const identity = document.querySelector("[data-platform-user-identity]");
    const name = identity?.getAttribute("aria-label")?.replace(/^signed in as\s+/i, "").trim().toLowerCase();
    const allowed = viewers.has(name);
    const header = document.querySelector("[data-platform-page-navigation]");
    const desktop = header?.querySelector("[data-platform-primary-links]");
    for (const existing of document.querySelectorAll(selector)) {
      const parent = existing.parentElement;
      if (!allowed || (parent !== header && parent !== desktop)) existing.remove();
    }
    if (!allowed || !header) return;
    prepareToken();
    if (desktop && !desktop.querySelector(":scope > .platform-poc-launcher")) {
      desktop.insertBefore(launcher("desktop"), desktop.lastElementChild);
    }
    if (!header.querySelector(":scope > .platform-poc-launcher")) {
      const menu = header.querySelector("[aria-controls='platform-mobile-menu']");
      header.insertBefore(launcher("mobile"), menu);
    }
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; render(); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-label"] });
  render();
})();
