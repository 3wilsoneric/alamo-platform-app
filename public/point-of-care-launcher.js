// Carelog enforces its own Microsoft identity and facility access. This is navigation only.
(() => {
  const viewers = new Set(["betty dominici", "andrew dominici", "eric wilson"]);
  const selector = ".platform-poc-launcher";
  const styles = `
    .platform-poc-launcher{display:none;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:3px 12px 3px 4px;border:1px solid #bfd8ce;border-radius:999px;background:#f5faf7;color:#164b43;text-decoration:none;font:700 13px/1 Arial,Helvetica,sans-serif;white-space:nowrap;transition:background .16s ease,border-color .16s ease}
    .platform-poc-launcher:hover{background:#e8f4ed;border-color:#83b7a5}
    .platform-poc-launcher:focus-visible{outline:3px solid #087d64;outline-offset:3px}
    .platform-poc-launcher__icon{display:grid;place-items:center;flex:none;width:32px;height:32px;border-radius:50%;background:linear-gradient(145deg,#087d64 5%,#23587c 78%);color:#fff}
    .platform-poc-launcher__icon svg{width:21px;height:21px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    @media(min-width:1024px){.platform-poc-launcher{display:inline-flex}}
  `;
  if (!document.getElementById("platform-poc-launcher-style")) {
    const style = document.createElement("style");
    style.id = "platform-poc-launcher-style";
    style.textContent = styles;
    document.head.append(style);
  }

  function render() {
    const identity = document.querySelector("[data-platform-user-identity]");
    const name = identity?.getAttribute("aria-label")?.replace(/^signed in as\s+/i, "").trim().toLowerCase();
    const header = document.querySelector("[data-platform-page-navigation]");
    const links = header?.querySelector("[data-platform-primary-links]");
    const existing = document.querySelector(selector);
    if (!viewers.has(name) || !links) {
      existing?.remove();
      return;
    }
    if (existing?.parentElement === links) return;
    existing?.remove();
    const anchor = document.createElement("a");
    anchor.className = "platform-poc-launcher";
    anchor.href = "/carelog-demo.html";
    anchor.target = "_blank";
    // The new same-origin tab inherits Platform's MSAL session storage. Its
    // redirect page then drops the opener before loading the Surface presenter.
    anchor.rel = "opener";
    anchor.setAttribute("aria-label", "Open Carelog Surface in a new tab");
    anchor.title = "Open Carelog Surface";
    anchor.innerHTML = `<span class="platform-poc-launcher__icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M11 5v9a5 5 0 0 0 10 0V5"/><path d="M8 5h3m10 0h3M16 19v4a5 5 0 0 0 10 0v-3"/><circle cx="26" cy="18" r="2"/></svg></span><span>Carelog</span>`;
    links.insertBefore(anchor, identity);
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
