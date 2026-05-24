/**
 * In-page panel showing auto-detected job fields before saving.
 */
const PreviewPanel = (() => {
  let panel = null;
  let activeCleanup = null;

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
  }

  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement("div");
    panel.className = "jt-preview";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Detected job details");
    panel.innerHTML = `
      <div class="jt-preview-backdrop" data-action="close"></div>
      <div class="jt-preview-card">
        <header class="jt-preview-header">
          <img class="jt-preview-logo" src="" alt="" width="28" height="28" />
          <div>
            <h2 class="jt-preview-title">Detected job</h2>
            <p class="jt-preview-sub">Review and edit before adding to your board</p>
          </div>
          <button type="button" class="jt-preview-close" data-action="close" aria-label="Close">×</button>
        </header>
        <div class="jt-preview-body">
          <label class="jt-field">
            <span>Company</span>
            <input type="text" name="company" placeholder="Company name" />
          </label>
          <label class="jt-field">
            <span>Job title</span>
            <input type="text" name="title" placeholder="Job title" />
          </label>
          <label class="jt-field">
            <span>Location / workplace</span>
            <input type="text" name="location" placeholder="City, state · Remote / Hybrid / On-site" />
          </label>
          <label class="jt-field">
            <span>About the role</span>
            <textarea name="description" rows="14" wrap="soft" placeholder="Role summary and responsibilities…"></textarea>
          </label>
          <div class="jt-preview-extra">
            <label class="jt-field jt-field-inline">
              <span>Pay</span>
              <input type="text" name="pay" placeholder="Optional" />
            </label>
            <label class="jt-field jt-field-inline">
              <span>Employment type</span>
              <input type="text" name="roleType" placeholder="Full-time, etc." />
            </label>
          </div>
          <p class="jt-preview-warn hidden" data-warn></p>
        </div>
        <footer class="jt-preview-footer">
          <button type="button" class="jt-btn jt-btn-ghost" data-action="close">Cancel</button>
          <button type="button" class="jt-btn jt-btn-primary" data-action="save">Add to board</button>
        </footer>
      </div>
    `;
    document.body.appendChild(panel);

    const logo = panel.querySelector(".jt-preview-logo");
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      logo.src = chrome.runtime.getURL("icons/icon48.png");
      logo.alt = "Job Tracker";
    }

    return panel;
  }

  function readForm(panelEl) {
    const f = panelEl.querySelector(".jt-preview-body");
    return {
      company: f.querySelector('[name="company"]').value.trim(),
      title: f.querySelector('[name="title"]').value.trim(),
      location: f.querySelector('[name="location"]').value.trim(),
      description: f.querySelector('[name="description"]').value.trim(),
      pay: f.querySelector('[name="pay"]').value.trim(),
      roleType: f.querySelector('[name="roleType"]').value.trim(),
      url: location.href.split("?")[0],
    };
  }

  function fillForm(panelEl, job) {
    const f = panelEl.querySelector(".jt-preview-body");
    f.querySelector('[name="company"]').value = job.company || "";
    f.querySelector('[name="title"]').value = job.title || "";
    f.querySelector('[name="location"]').value = job.location || "";
    f.querySelector('[name="description"]').value = job.description || "";
    f.querySelector('[name="pay"]').value = job.pay || "";
    f.querySelector('[name="roleType"]').value = job.roleType || "";
    const warn = panelEl.querySelector("[data-warn]");
    if (!job.title && !job.company) {
      warn.textContent =
        "We could not detect much on this page. Fill in the fields or use highlight mode in Settings.";
      warn.classList.remove("hidden");
    } else {
      warn.classList.add("hidden");
    }
  }

  function open(job) {
    const el = ensurePanel();
    if (activeCleanup) {
      activeCleanup();
      activeCleanup = null;
    }
    fillForm(el, job);
    el.classList.add("jt-preview-open");
    document.body.classList.add("jt-preview-active");

    return new Promise((resolve) => {
      let settled = false;

      const done = (result) => {
        if (settled) return;
        settled = true;
        el.classList.remove("jt-preview-open");
        document.body.classList.remove("jt-preview-active");
        cleanup();
        activeCleanup = null;
        resolve(result);
      };

      function onClick(e) {
        const action = e.target.closest?.("[data-action]")?.dataset?.action;
        if (!action) return;
        e.preventDefault();
        e.stopPropagation();
        if (action === "close") done(null);
        if (action === "save") done(readForm(el));
      }

      function onKey(e) {
        if (e.key === "Escape") done(null);
      }

      function cleanup() {
        el.removeEventListener("click", onClick);
        document.removeEventListener("keydown", onKey);
      }

      activeCleanup = cleanup;
      el.addEventListener("click", onClick);
      document.addEventListener("keydown", onKey);
      el.querySelector('[name="title"]')?.focus();
    });
  }

  return { open };
})();

if (typeof globalThis !== "undefined") {
  globalThis.PreviewPanel = PreviewPanel;
}
