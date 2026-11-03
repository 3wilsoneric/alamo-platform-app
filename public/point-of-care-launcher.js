// Carelog is a separate application. This entry is only a visible shortcut;
// its API enforces the exact Platform viewer identities again.
(() => {
  const viewers = new Set(["betty dominici", "andrew dominici"]);
  const link = "/poc?platform=1&view=desktop";
  const styles = `
    .platform-poc-launcher{position:absolute;left:clamp(18px,2.6vw,42px);top:clamp(20px,3vw,42px);z-index:20;display:flex;align-items:center;gap:16px;width:min(310px,calc(100vw - 36px));min-height:104px;padding:16px 18px;border:1px solid #b8c9c2;border-left:5px solid #087d64;border-radius:10px;background:#fffdf8;color:#183448;text-decoration:none;box-shadow:0 14px 32px rgba(25,45,42,.13),0 2px 5px rgba(25,45,42,.08);transition:transform .16s ease,box-shadow .16s ease}
    .platform-poc-launcher:hover,.platform-poc-launcher:focus-visible{transform:translateY(-2px);box-shadow:0 18px 36px rgba(25,45,42,.18),0 3px 8px rgba(25,45,42,.08);outline:2px solid transparent}
    .platform-poc-launcher:focus-visible{outline:3px solid #087d64;outline-offset:3px}
    .platform-poc-launcher__icon{display:grid;place-items:center;flex:none;width:58px;height:58px;border-radius:15px;background:#087d64;color:#fff}
    .platform-poc-launcher__icon svg{width:34px;height:34px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .platform-poc-launcher__body{display:flex;min-width:0;flex:1;flex-direction:column;gap:3px}
    .platform-poc-launcher__title{font:700 21px/1.1 Arial,Helvetica,sans-serif;letter-spacing:-.035em}
    .platform-poc-launcher__sub{font:500 13px/1.25 Arial,Helvetica,sans-serif;color:#5d6b69}
    .platform-poc-launcher__arrow{flex:none;font:24px/1 Arial,Helvetica,sans-serif;color:#087d64}
    [data-mobile-community-home] .platform-poc-launcher{position:relative;inset:auto;width:100%;max-width:none;min-height:94px;margin:0 auto 18px}
    @media(max-width:480px){[data-mobile-community-home] .platform-poc-launcher{gap:13px;padding:14px}.platform-poc-launcher__icon{width:54px;height:54px}.platform-poc-launcher__title{font-size:20px}}
  `;
  if (!document.getElementById("platform-poc-launcher-style")) {
    const style = document.createElement("style");
    style.id = "platform-poc-launcher-style";
    style.textContent = styles;
    document.head.append(style);
  }

  function card() {
    const anchor = document.createElement("a");
    anchor.className = "platform-poc-launcher";
    anchor.href = link;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.setAttribute("aria-label", "Open Point of Care in a new tab");
    anchor.innerHTML = `<span class="platform-poc-launcher__icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M11 5v9a5 5 0 0 0 10 0V5"/><path d="M8 5h3m10 0h3M16 19v4a5 5 0 0 0 10 0v-3"/><circle cx="26" cy="18" r="2"/></svg></span><span class="platform-poc-launcher__body"><span class="platform-poc-launcher__title">Point of Care</span><span class="platform-poc-launcher__sub">Open Carelog</span></span><span class="platform-poc-launcher__arrow" aria-hidden="true">↗</span>`;
    return anchor;
  }

  function render() {
    const identity = document.querySelector("[data-platform-user-identity]");
    const name = identity?.getAttribute("aria-label")?.replace(/^signed in as\s+/i, "").trim().toLowerCase();
    const allowed = location.pathname === "/home" && viewers.has(name);
    for (const existing of document.querySelectorAll(".platform-poc-launcher")) {
      if (!allowed || !existing.parentElement?.matches("[data-california-home-hero], [data-mobile-community-home] > div")) existing.remove();
    }
    if (!allowed) return;
    for (const parent of document.querySelectorAll("[data-california-home-hero], [data-mobile-community-home] > div")) {
      if (!parent.querySelector(":scope > .platform-poc-launcher")) parent.prepend(card());
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
