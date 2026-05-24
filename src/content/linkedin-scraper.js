/**
 * LinkedIn jobs — guest API (via background) + lightweight DOM. Never scrapes full document.
 */
const LinkedInScraper = (() => {
  const MSG = globalThis.JT_MESSAGE;

  function t(el) {
    if (!el) return "";
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function safeText(el, max = 16000) {
    if (!el) return "";
    try {
      return (el.innerText || el.textContent || "").trim().slice(0, max);
    } catch {
      return "";
    }
  }

  function extractDescription(el) {
    const fmt = globalThis.JTDescriptionFormat;
    if (fmt?.extractDescriptionFromElement) {
      return fmt.extractDescriptionFromElement(el).slice(0, 16000);
    }
    return safeText(el);
  }

  function currentJobId() {
    try {
      const params = new URL(location.href).searchParams;
      const id = params.get("currentJobId");
      if (id) return id;
    } catch {
      /* ignore */
    }
    const m = location.pathname.match(/\/jobs\/view\/(\d+)/);
    return m ? m[1] : "";
  }

  function getJobListEl() {
    return document.querySelector(
      ".jobs-search-results-list, .scaffold-layout__list, [class*='jobs-search-results-list']"
    );
  }

  function outsideList(el) {
    if (!el) return false;
    const list = getJobListEl();
    return !list?.contains(el);
  }

  function findDetailRoot() {
    const selectors = [
      ".jobs-search__job-details",
      ".jobs-search-results__detail",
      ".scaffold-layout__detail",
      ".jobs-details__main-content",
      ".job-view-layout",
      '[data-view-name="job-search-results-detail"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && outsideList(el)) return el;
    }

    const jobId = currentJobId();
    if (jobId) {
      const hit = document.querySelector(
        `[data-job-id="${jobId}"], [data-occludable-job-id="${jobId}"]`
      );
      if (hit && outsideList(hit)) {
        const root = hit.closest("main, article, [class*='detail'], [class*='job-details']");
        if (root) return root;
      }
    }

    for (const h1 of document.querySelectorAll("main h1, .jobs-details h1, h1.t-24")) {
      if (!outsideList(h1)) continue;
      const root =
        h1.closest(
          "main, article, .jobs-search__job-details, [class*='job-details'], .scaffold-layout__detail"
        ) || h1.parentElement?.parentElement;
      if (root && outsideList(root)) return root;
    }
    return null;
  }

  function expandDescription(root) {
    if (!root) return;
    const btn =
      root.querySelector(
        ".jobs-description__footer-button, button[aria-label*='more'], button[aria-label*='Show more']"
      ) || document.querySelector(".jobs-description__footer-button");
    if (btn && /more/i.test(t(btn))) btn.click();
  }

  function parseGuestHtml(html, jobId) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const pick = (sel) => t(doc.querySelector(sel));
    const descEl =
      doc.querySelector(".show-more-less-html__markup") ||
      doc.querySelector(".jobs-description-content__text") ||
      doc.querySelector(".jobs-box__html-content") ||
      doc.querySelector("[class*='description']");
    const description = descEl ? extractDescription(descEl) : "";

    return {
      title: pick("h1") || pick(".top-card-layout__title") || pick("[class*='title']"),
      company:
        pick('a[href*="/company/"]') ||
        pick(".topcard__org-name-link") ||
        pick("[class*='company']"),
      location: pick(".topcard__flavor--bullet") || pick("[class*='location']"),
      pay: globalThis.JobScraper?.extractSalaryFromText?.(html) || "",
      roleType: "",
      description,
      url: `https://www.linkedin.com/jobs/view/${jobId}/`,
      source: "linkedin-guest-api",
      jobId,
    };
  }

  async function fetchGuestJob(jobId) {
    if (!jobId || !MSG?.fetchLinkedInJob) return null;
    try {
      const res = await chrome.runtime.sendMessage({
        type: MSG.fetchLinkedInJob,
        jobId,
      });
      if (!res?.ok || !res.html) return null;
      const html = res.html;
      if (html.includes("signup") && !html.includes("show-more-less-html")) return null;
      const job = parseGuestHtml(html, jobId);
      if (job.title || job.description?.length > 80) return job;
    } catch {
      /* background fetch failed */
    }
    return null;
  }

  function scrapeDom(root) {
    if (!root) return null;
    expandDescription(root);

    const title =
      t(root.querySelector(".job-details-jobs-unified-top-card__job-title h1")) ||
      t(root.querySelector(".jobs-unified-top-card__job-title")) ||
      t(root.querySelector("h1"));

    const company =
      t(root.querySelector(".job-details-jobs-unified-top-card__company-name a")) ||
      t(root.querySelector(".jobs-unified-top-card__company-name a")) ||
      t(root.querySelector('a[href*="/company/"]'));

    const locParts = [];
    root.querySelectorAll(
      ".job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet, .jobs-unified-top-card__workplace-type"
    ).forEach((el) => {
      const line = t(el);
      if (line && !/\d+\s+days?\s+ago/i.test(line) && !/applicants?/i.test(line)) {
        locParts.push(line);
      }
    });
    const location = [...new Set(locParts)].slice(0, 3).join(" · ");

    const descEl =
      root.querySelector(".show-more-less-html__markup") ||
      root.querySelector(".jobs-description__content") ||
      root.querySelector(".jobs-description-content__text") ||
      root.querySelector("#job-details") ||
      root.querySelector('[class*="jobs-description"]');
    const description = extractDescription(descEl);

    const blob = safeText(root, 8000);
    const pay = globalThis.JobScraper?.extractSalaryFromText?.(blob) || "";
    const typeMatch = blob.match(/(Full-time|Part-time|Contract|Internship)/i);

    return {
      title,
      company,
      location,
      pay,
      roleType: typeMatch ? typeMatch[1] : "",
      description,
      url: buildUrl(currentJobId()),
      source: "linkedin-dom",
      jobId: currentJobId(),
    };
  }

  function scrapeFromListCard(jobId) {
    const card =
      document.querySelector(
        `.jobs-search-results-list__list-item--active, [aria-current="page"][data-job-id], [data-job-id="${jobId}"]`
      ) || document.querySelector(".jobs-search-results-list__list-item--active");
    if (!card) return null;
    return {
      title: t(card.querySelector('[class*="title"] a, a[href*="/jobs/view/"]')),
      company: t(card.querySelector('[class*="subtitle"], [class*="company"]')),
      location: t(card.querySelector('[class*="location"], [class*="metadata"]')),
      pay: "",
      roleType: "",
      description: "",
      source: "linkedin-list",
      jobId,
    };
  }

  function buildUrl(jobId) {
    if (jobId) return `https://www.linkedin.com/jobs/view/${jobId}/`;
    return location.href.split("#")[0];
  }

  function merge(a, b) {
    if (!a) return b;
    if (!b) return a;
    return {
      title: a.title || b.title,
      company: a.company || b.company,
      location: a.location || b.location,
      pay: a.pay || b.pay,
      roleType: a.roleType || b.roleType,
      description:
        (a.description?.length || 0) >= (b.description?.length || 0)
          ? a.description
          : b.description,
      url: a.url || b.url,
      source: a.description?.length >= (b.description?.length || 0) ? a.source : b.source,
      jobId: a.jobId || b.jobId,
    };
  }

  async function scrape() {
    try {
      const jobId = currentJobId();
      let result = {
        title: "",
        company: "",
        location: "",
        pay: "",
        roleType: "",
        description: "",
        url: buildUrl(jobId),
        source: "linkedin",
        jobId,
      };

      if (jobId) {
        const guest = await fetchGuestJob(jobId);
        if (guest) result = merge(result, guest);
      }

      const root = findDetailRoot();
      if (root) {
        const dom = scrapeDom(root);
        if (dom) result = merge(result, dom);
      }

      if (!result.title && jobId) {
        const card = scrapeFromListCard(jobId);
        if (card) result = merge(result, card);
      }

      return result;
    } catch (err) {
      console.error("[Job Tracker] LinkedIn scrape error:", err);
      return {
        title: "",
        company: "",
        location: "",
        pay: "",
        roleType: "",
        description: "",
        url: buildUrl(currentJobId()),
        source: "linkedin-error",
        jobId: currentJobId(),
      };
    }
  }

  function scrapeOnce() {
    return scrape();
  }

  function isJobsPage() {
    if (!location.hostname.includes("linkedin.com")) return false;
    const path = location.pathname || "";
    return path.includes("/jobs") || path.includes("search-results") || !!currentJobId();
  }

  return {
    scrape,
    scrapeOnce,
    findDetailRoot,
    expandDescription,
    isJobsPage,
    currentJobId,
    fetchGuestJob,
  };
})();

if (typeof globalThis !== "undefined") {
  globalThis.LinkedInScraper = LinkedInScraper;
}
