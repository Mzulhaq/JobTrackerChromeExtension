(function () {
  const MSG = globalThis.JT_MESSAGE;
  let settings = {
    persistentOverlay: true,
    highlightMode: true,
    openBoardOnSave: true,
  };
  let detectInFlight = false;

  async function sendExt(payload, timeoutMs = 6000) {
    try {
      return await Promise.race([
        chrome.runtime.sendMessage(payload),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), timeoutMs)
        ),
      ]);
    } catch {
      return null;
    }
  }

  function showToast(message, type = "info") {
    const existing = document.querySelector(".jt-toast");
    existing?.remove();
    const toast = document.createElement("div");
    toast.className = `jt-toast jt-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("jt-toast-visible"));
    setTimeout(() => {
      toast.classList.remove("jt-toast-visible");
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  function clearBusyUi() {
    LoadingUI.hide(true);
    PageOverlay.setLoading?.(false);
    PageOverlay.setBusy?.(false);
  }

  async function loadSettings() {
    try {
      const res = await sendExt({ type: MSG.getSettings });
      if (res?.settings) settings = { ...settings, ...res.settings };
    } catch {
      /* extension context invalidated */
    }
    applySettings();
  }

  function isLinkedInJobsUrl() {
    if (!location.hostname.includes("linkedin.com")) return false;
    const path = location.pathname || "";
    if (path.includes("/jobs") || path.includes("search-results")) return true;
    if (location.search.includes("currentJobId")) return true;
    return false;
  }

  function isJobSitePage() {
    if (isLinkedInJobsUrl()) return true;
    return JobSiteDetector.isJobSite();
  }

  function applySettings() {
    const onJobSite = isJobSitePage();
    if (settings.persistentOverlay && onJobSite) {
      PageOverlay.show(() => openDetectionPreview());
      PageOverlay.refreshVisibility(true);
    } else {
      PageOverlay.hide();
    }
    HighlightCapture.setEnabled(!!settings.highlightMode && onJobSite);
  }

  async function scrapeJob() {
    if (location.hostname.includes("linkedin.com") && globalThis.LinkedInScraper) {
      LoadingUI.update("Fetching job from LinkedIn…");
      return LinkedInScraper.scrape();
    }
    return JobScraper.scrape();
  }

  async function saveJobToBoard(scraped, saved) {
    LoadingUI.show("Saving to your board…");

    const payload = { ...scraped, ...saved, source: saved.source || scraped?.source };
    const res = await sendExt({
      type: MSG.addJob,
      payload,
      columnId: "saved",
      updateIfDuplicate: true,
    });

    clearBusyUi();

    if (!res?.ok || !res.job) {
      showToast(res?.error || "Could not save. Reload the extension and try again.", "error");
      return null;
    }

    if (res.duplicate) {
      showToast(
        res.updated
          ? `Updated existing job: ${res.job.title || res.job.company}`
          : `Already on your board: ${res.job.title || res.job.company}`,
        "info"
      );
    } else {
      showToast(`Added: ${res.job.title || res.job.company}`, "success");
    }

    if (settings.openBoardOnSave !== false) {
      sendExt({ type: MSG.openSidePanel, jobId: res.job.id }, 3000);
    }
    return res.job;
  }

  async function openDetectionPreview(jobOverride) {
    if (detectInFlight && !jobOverride) return;

    detectInFlight = true;
    PageOverlay.setBusy?.(true);
    PageOverlay.setLoading?.(true);
    LoadingUI.show("Detecting job details…");

    try {
      let scraped = jobOverride || null;

      try {
        if (!scraped) scraped = await scrapeJob();
      } catch (err) {
        console.error("[Job Tracker] scrape failed:", err);
        scraped = {
          title: "",
          company: "",
          location: "",
          description: "",
          pay: "",
          roleType: "",
          url: location.href,
        };
        showToast("Auto-detect had trouble — edit the fields below.", "warn");
      }

      clearBusyUi();

      if (
        !jobOverride &&
        location.hostname.includes("linkedin.com") &&
        !scraped?.title &&
        !scraped?.company &&
        !scraped?.description
      ) {
        showToast("Click a job in the list first, then try the logo again.", "warn");
      }

      const saved = await PreviewPanel.open(scraped || {});
      if (!saved) return scraped;

      if (!saved.title && !saved.company) {
        showToast("Add a company or job title to save.", "warn");
        return scraped;
      }

      await saveJobToBoard(scraped, saved);
      return scraped;
    } catch (err) {
      console.error("[Job Tracker] unexpected error:", err);
      clearBusyUi();
      showToast("Something went wrong — try again or use highlight mode.", "error");
      return null;
    } finally {
      detectInFlight = false;
      clearBusyUi();
    }
  }

  async function handleHighlightCapture(selectedText) {
    const job = JobScraper.scrapeFromSelection(selectedText);
    let merged = job;
    try {
      merged = { ...(await scrapeJob()), ...job };
    } catch {
      merged = job;
    }
    if (!merged.title) merged.title = selectedText.slice(0, 120);
    merged.source = "highlight";
    openDetectionPreview(merged);
  }

  function watchPageContext() {
    SpaWatcher.start(() => applySettings());
    window.addEventListener("popstate", () => applySettings());
  }

  HighlightCapture.init({
    getEnabled: () => !!settings.highlightMode && isJobSitePage(),
    onCapture: handleHighlightCapture,
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === MSG.scrapePage) {
      scrapeJob()
        .then((job) => sendResponse({ ok: true, job }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message.type === MSG.openPreview) {
      openDetectionPreview()
        .then((job) => sendResponse({ ok: true, job }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
    if (message.type === MSG.settingsUpdated) {
      settings = { ...settings, ...message.settings };
      applySettings();
      sendResponse({ ok: true });
    }
    return false;
  });

  loadSettings();
  watchPageContext();
})();
