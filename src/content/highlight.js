/**
 * Highlight-to-capture: after text selection, show a mini toolbar to add the job.
 */
const HighlightCapture = (() => {
  let toolbar = null;
  let enabled = false;

  function removeToolbar() {
    if (toolbar) {
      toolbar.remove();
      toolbar = null;
    }
  }

  function createToolbar(rect, onAdd, onDismiss) {
    removeToolbar();
    toolbar = document.createElement("div");
    toolbar.className = "jt-highlight-toolbar";
    toolbar.innerHTML = `
      <span class="jt-highlight-label">Add to Job Tracker?</span>
      <button type="button" class="jt-btn jt-btn-primary" data-action="add">Add job</button>
      <button type="button" class="jt-btn jt-btn-ghost" data-action="dismiss">×</button>
    `;
    document.body.appendChild(toolbar);

    const top = Math.min(rect.bottom + 8, window.innerHeight - 48);
    const left = Math.min(rect.left, window.innerWidth - toolbar.offsetWidth - 8);
    toolbar.style.top = `${Math.max(8, top)}px`;
    toolbar.style.left = `${Math.max(8, left)}px`;

    toolbar.querySelector('[data-action="add"]').addEventListener("click", (e) => {
      e.stopPropagation();
      onAdd();
      removeToolbar();
    });
    toolbar.querySelector('[data-action="dismiss"]').addEventListener("click", (e) => {
      e.stopPropagation();
      onDismiss();
      removeToolbar();
    });
  }

  function init(options) {
    const { onCapture, getEnabled } = options;

    document.addEventListener("mouseup", (e) => {
      if (!getEnabled()) return;
      if (toolbar?.contains(e.target)) return;

      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString()?.trim();
        if (!text || text.length < 3) {
          removeToolbar();
          return;
        }
        if (e.target.closest?.(".jt-fab, .jt-preview, .jt-highlight-toolbar, .jt-toast")) {
          return;
        }

        const range = sel.rangeCount ? sel.getRangeAt(0) : null;
        if (!range) return;
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        createToolbar(
          rect,
          () => onCapture(text),
          () => sel.removeAllRanges()
        );
      }, 10);
    });

    document.addEventListener("mousedown", (e) => {
      if (!toolbar) return;
      if (!toolbar.contains(e.target)) removeToolbar();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") removeToolbar();
    });
  }

  function setEnabled(value) {
    enabled = value;
    if (!value) removeToolbar();
  }

  return { init, setEnabled, removeToolbar };
})();

if (typeof globalThis !== "undefined") {
  globalThis.HighlightCapture = HighlightCapture;
}
