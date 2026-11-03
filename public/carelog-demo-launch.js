(() => {
  // The opener allows the new same-origin tab to inherit the existing MSAL
  // session. Drop it immediately; the presenter never needs opener access.
  if (window.opener) window.opener = null;
  const turn = document.getElementById("turn");
  const phone = () => window.matchMedia("(any-pointer: coarse)").matches && Math.min(window.screen.width, window.screen.height) <= 600;
  function openWhenReady() {
    if (phone() && window.innerHeight > window.innerWidth) {
      turn.hidden = false;
      return;
    }
    window.location.replace("/poc?platform=1&view=surface");
  }
  window.addEventListener("resize", openWhenReady);
  window.addEventListener("orientationchange", openWhenReady);
  openWhenReady();
})();
