/**
 * Logo FAB on job sites — opens detection preview on click.
 */
const PageOverlay = (() => {
  let root = null;
  let onOpen = null;
  let busy = false;

  function ensureRoot() {
    if (root) return root;
    root = document.createElement("div");
    root.className = "jt-fab";
    const iconUrl =
      typeof chrome !== "undefined" && chrome.runtime?.getURL
        ? chrome.runtime.getURL("icons/icon48.png")
        : "";
    root.innerHTML = `
      <button type="button" class="jt-fab-btn" title="Review detected job" aria-label="Job Tracker">
        <span class="jt-fab-spinner" aria-hidden="true"></span>
        <img class="jt-fab-logo" src="${iconUrl}" alt="" width="32" height="32" />
      </button>
    `;
    document.body.appendChild(root);
    root.querySelector(".jt-fab-btn").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (busy || !onOpen) return;
      onOpen();
    });
    return root;
  }

  function setLoading(loading) {
    const btn = root?.querySelector(".jt-fab-btn");
    if (!btn) return;
    btn.classList.toggle("jt-fab-busy", loading);
    btn.disabled = !!loading;
  }

  function setBusy(value) {
    busy = !!value;
    if (!busy) setLoading(false);
  }

  function show(openHandler) {
    onOpen = openHandler;
    const el = ensureRoot();
    el.classList.add("jt-fab-visible");
    setBusy(false);
    setLoading(false);
  }

  function hide() {
    if (!root) return;
    root.classList.remove("jt-fab-visible");
    onOpen = null;
    setBusy(false);
    setLoading(false);
  }

  function destroy() {
    hide();
    root?.remove();
    root = null;
  }

  function refreshVisibility(isJobSite) {
    if (!root) return;
    if (isJobSite) root.classList.add("jt-fab-visible");
    else root.classList.remove("jt-fab-visible");
  }

  return { show, hide, destroy, refreshVisibility, setLoading, setBusy };
})();

if (typeof globalThis !== "undefined") {
  globalThis.PageOverlay = PageOverlay;
}
