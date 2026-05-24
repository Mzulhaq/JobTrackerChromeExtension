/**
 * Re-run detection when SPAs swap job content (e.g. LinkedIn jobs list + detail pane).
 */
const SpaWatcher = (() => {
  let observer = null;
  let callback = null;
  let lastFingerprint = "";

  function fingerprint() {
    const parts = [location.href];

    if (location.hostname.includes("linkedin.com")) {
      const jobId =
        globalThis.LinkedInScraper?.currentJobId?.() ||
        new URL(location.href).searchParams.get("currentJobId") ||
        "";
      parts.push(jobId);

      const root = globalThis.LinkedInScraper?.findDetailRoot?.();
      if (root) {
        const h1 = [...root.querySelectorAll("h1")].find((h) => h.textContent?.trim());
        parts.push(h1?.textContent?.trim() || "");
        parts.push(
          root.querySelector('a[href*="/company/"]')?.textContent?.trim() || ""
        );
      } else {
        parts.push(document.querySelector("main h1")?.textContent?.trim() || "");
      }
      return parts.join("|");
    }

    parts.push(
      document.querySelector(".job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title")?.textContent?.trim() || ""
    );
    parts.push(
      document.querySelector(".job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name")?.textContent?.trim() || ""
    );
    return parts.join("|");
  }

  function tick() {
    const fp = fingerprint();
    if (fp !== lastFingerprint) {
      lastFingerprint = fp;
      callback?.();
    }
  }

  function debounce(fn, ms) {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  const debouncedTick = debounce(tick, 300);

  function start(onChange) {
    callback = onChange;
    lastFingerprint = "";
    tick();

    if (observer) observer.disconnect();
    observer = new MutationObserver(debouncedTick);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.addEventListener("popstate", debouncedTick);

    const wrapHistory = (method) => {
      const orig = history[method];
      if (!orig) return;
      history[method] = function (...args) {
        const ret = orig.apply(this, args);
        debouncedTick();
        return ret;
      };
    };
    wrapHistory("pushState");
    wrapHistory("replaceState");
  }

  function stop() {
    observer?.disconnect();
    observer = null;
    callback = null;
  }

  return { start, stop, tick };
})();

if (typeof globalThis !== "undefined") {
  globalThis.SpaWatcher = SpaWatcher;
}
