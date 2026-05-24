/**
 * Loading overlay while scraping / detecting job details.
 */
const LoadingUI = (() => {
  let root = null;

  function show(message = "Detecting job details…") {
    hide(true);
    root = document.createElement("div");
    root.className = "jt-loading";
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.innerHTML = `
      <div class="jt-loading-backdrop"></div>
      <div class="jt-loading-card">
        <div class="jt-loading-spinner" aria-hidden="true"></div>
        <p class="jt-loading-text"></p>
      </div>
    `;
    document.body.appendChild(root);
    root.querySelector(".jt-loading-text").textContent = message;
    requestAnimationFrame(() => root?.classList.add("jt-loading-visible"));
  }

  function update(message) {
    if (!root) return show(message);
    root.querySelector(".jt-loading-text").textContent = message;
  }

  /** @param {boolean} [immediate] */
  function hide(immediate) {
    if (!root) return;
    root.classList.remove("jt-loading-visible");
    if (immediate) {
      root.remove();
      root = null;
      return;
    }
    const el = root;
    root = null;
    setTimeout(() => el.remove(), 200);
  }

  return { show, update, hide };
})();

if (typeof globalThis !== "undefined") {
  globalThis.LoadingUI = LoadingUI;
}
