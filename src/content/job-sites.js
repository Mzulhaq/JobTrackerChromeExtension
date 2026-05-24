/**
 * Detect job listing / application pages (overlay only shows on these).
 */
const JobSiteDetector = (() => {
  const URL_PATTERNS = [
    /linkedin\.com\/jobs/i,
    /linkedin\.com\/jobs\/search-results/i,
    /linkedin\.com\/job\/view/i,
    /glassdoor\.[a-z.]+\/(Job|job-listing)/i,
    /glassdoor\.[a-z.]+\/partner\/jobListing/i,
    /indeed\.com\/(viewjob|rc\/clk|pagead\/clk)/i,
    /indeed\.com\/jobs/i,
    /lever\.co\/[^/]+\/[^/]+/i,
    /boards\.greenhouse\.io\//i,
    /jobs\.ashbyhq\.com\//i,
    /myworkdayjobs\.com\//i,
    /apply\.workable\.com\//i,
    /jobs\.smartrecruiters\.com\//i,
    /careers\.[^/]+\//i,
    /\/careers\/[^/]+/i,
    /\/jobs\/[^/]+/i,
    /\/job\/[^/]+/i,
    /ziprecruiter\.com\/jobs/i,
    /monster\.com\/job-openings/i,
    /simplyhired\.com\/job\//i,
    /builtin\.com\/job\//i,
    /wellfound\.com\/jobs/i,
    /otta\.com\/jobs/i,
  ];

  const HOST_JOB_HINTS = [
    "linkedin.com",
    "glassdoor.",
    "indeed.",
    "lever.co",
    "greenhouse.io",
    "ashbyhq.com",
    "myworkdayjobs.com",
    "smartrecruiters.com",
    "workable.com",
  ];

  function hasJobPostingSchema() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const raw = script.textContent || "";
        if (/JobPosting/i.test(raw)) return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  }

  function linkedInJobContext() {
    const href = location.href;
    if (!href.includes("linkedin.com")) return false;
    const path = location.pathname || "";
    if (path.includes("/jobs") || path.includes("search-results")) return true;
    if (href.includes("currentJobId=")) return true;
    if (globalThis.LinkedInScraper?.isJobsPage?.()) return true;
    return false;
  }

  function isJobSite() {
    const href = location.href;
    if (URL_PATTERNS.some((re) => re.test(href))) return true;
    if (linkedInJobContext()) return true;
    if (HOST_JOB_HINTS.some((h) => location.hostname.includes(h)) && hasJobPostingSchema()) {
      return true;
    }
    if (hasJobPostingSchema() && /\/(job|jobs|career|careers|apply|position)/i.test(href)) {
      return true;
    }
    return false;
  }

  return { isJobSite, linkedInJobContext };
})();

if (typeof globalThis !== "undefined") {
  globalThis.JobSiteDetector = JobSiteDetector;
}
