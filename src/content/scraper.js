/**
 * Universal job scraper: site-specific → JSON-LD → Open Graph → heuristics.
 */
const JobScraper = (() => {
  function text(el) {
    if (!el) return "";
    return (el.textContent || "").replace(/\s+/g, " ").trim();
  }

  function attr(el, name) {
    return el?.getAttribute?.(name)?.trim() || "";
  }

  function firstMatch(selectors, root = document) {
    for (const sel of selectors) {
      try {
        const el = root.querySelector(sel);
        const t = text(el);
        if (t) return t;
      } catch {
        /* invalid selector */
      }
    }
    return "";
  }

  function allMatchText(selectors, root = document) {
    const parts = [];
    for (const sel of selectors) {
      try {
        root.querySelectorAll(sel).forEach((el) => {
          const t = text(el);
          if (t && !parts.includes(t)) parts.push(t);
        });
      } catch {
        /* ignore */
      }
    }
    return parts;
  }

  /** LinkedIn jobs search: list on left, detail on right — scope to detail pane only. */
  function linkedInDetailRoot() {
    const paneSelectors = [
      ".jobs-search__job-details",
      ".jobs-search__job-details--container",
      ".jobs-search-results__detail",
      ".scaffold-layout__detail",
      ".jobs-details",
      ".jobs-details__main-content",
      ".job-view-layout",
      "main .jobs-box--fade-in",
      '[data-view-name="job-search-results-detail"]',
    ];
    for (const sel of paneSelectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      if (el.querySelector('[class*="job-title"], [class*="top-card"] h1, h1')) {
        return el;
      }
    }

    const list = document.querySelector(
      ".jobs-search-results-list, .scaffold-layout__list, [class*='jobs-search-results']"
    );
    const titles = document.querySelectorAll(
      ".job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, .jobs-details h1"
    );
    for (const titleEl of titles) {
      if (list?.contains(titleEl)) continue;
      const root = titleEl.closest(
        '[class*="job-details"], [class*="jobs-details"], .scaffold-layout__detail, main'
      );
      if (root) return root;
    }

    return document;
  }

  function combineLocationParts(parts) {
    return [...new Set(parts.map((p) => p.trim()).filter(Boolean))].join(" · ");
  }

  function isLinkedInNoiseSegment(seg) {
    const s = seg.trim();
    if (!s) return true;
    const patterns = [
      /^\d+\s+(second|minute|hour|day|week|month|year)s?\s+ago$/i,
      /^(over\s+)?\d+\+?\s+applicants?$/i,
      /\bapplicants?\b/i,
      /promoted\s+by/i,
      /no response insights/i,
      /easy apply/i,
      /your profile and resume/i,
      /show match details/i,
      /is this information helpful/i,
      /people you can reach/i,
      /meet the hiring team/i,
      /^(save|apply|message|follow)$/i,
      /^beta\b/i,
      /^be an early applicant/i,
      /^\d+\s+connections?\s+work/i,
    ];
    return patterns.some((re) => re.test(s));
  }

  /** Split LinkedIn metadata lines like "United States · 2 days ago · Over 100 applicants". */
  function parseLinkedInMetadataLine(line) {
    if (!line) return [];
    return line
      .split(/\s*[·•|]\s*/)
      .map((s) => s.trim())
      .filter((s) => s && !isLinkedInNoiseSegment(s));
  }

  function isValidPayString(pay) {
    if (!pay || typeof pay !== "string") return false;
    const p = pay.trim();
    if (p.length < 6) return false;
    if (/^(USD|GBP|EUR|CAD|AUD|US\s*\$)$/i.test(p)) return false;
    if (!/\d/.test(p)) return false;
    return true;
  }

  function pickBestSalaryMatch(matches) {
    if (!matches?.length) return "";
    const valid = matches.filter(isValidPayString);
    if (!valid.length) return "";
    return valid.sort((a, b) => b.length - a.length)[0];
  }

  /** Minimum / Maximum Pay Rate blocks (iCIMS, Workday, custom career sites). */
  function extractMinMaxPayFromText(text) {
    if (!text) return "";
    const minRe =
      /Minimum\s+Pay\s+Rate\s*[:\s]*\n?\s*(?:USD\s*)?[$]?\s*([\d,]+(?:\.\d+)?)\s*(?:\/\s*)?(?:Yr\.?|year)?/i;
    const maxRe =
      /Maximum\s+Pay\s+Rate\s*[:\s]*\n?\s*(?:USD\s*)?[$]?\s*([\d,]+(?:\.\d+)?)\s*(?:\/\s*)?(?:Yr\.?|year)?/i;
    const min = text.match(minRe);
    const max = text.match(maxRe);
    if (min && max) {
      return `USD $${min[1]} – USD $${max[1]}/Yr`;
    }
    return "";
  }

  function extractMinMaxPayFromDom() {
    const fromText = extractMinMaxPayFromText(document.body?.innerText || "");
    if (fromText) return fromText;

    const labels = document.querySelectorAll(
      "dt, th, label, strong, span, div, p, h2, h3, h4"
    );
    let minVal = "";
    let maxVal = "";
    for (const el of labels) {
      const label = text(el);
      if (/^minimum\s+pay\s+rate$/i.test(label)) {
        minVal =
          text(el.nextElementSibling) ||
          text(el.parentElement?.querySelector(".value, [class*='pay'], td + td")) ||
          "";
      }
      if (/^maximum\s+pay\s+rate$/i.test(label)) {
        maxVal =
          text(el.nextElementSibling) ||
          text(el.parentElement?.querySelector(".value, [class*='pay'], td + td")) ||
          "";
      }
    }
    if (minVal && maxVal) {
      const minAmt = minVal.match(/([\d,]+(?:\.\d+)?)/)?.[1];
      const maxAmt = maxVal.match(/([\d,]+(?:\.\d+)?)/)?.[1];
      if (minAmt && maxAmt) return `USD $${minAmt} – USD $${maxAmt}/Yr`;
    }
    return "";
  }

  function extractSalaryFromText(text) {
    if (!text) return "";

    const minMax = extractMinMaxPayFromText(text);
    if (minMax) return minMax;

    const patterns = [
      /\bUSD\s*\$[\d,]+(?:\.\d+)?\s*\/\s*Yr\.?\s*[-–—]\s*USD\s*\$[\d,]+(?:\.\d+)?\s*\/\s*Yr\.?/gi,
      /\$[\d,]+(?:\.\d+)?\s*\/\s*Yr\.?\s*[-–—]\s*\$[\d,]+(?:\.\d+)?\s*\/\s*Yr\.?/gi,
      /\$[\d,]+(?:\.\d+)?[Kk]\s*\/\s*(?:yr|year)\s*[-–—]\s*\$[\d,]+(?:\.\d+)?[Kk]\s*\/\s*(?:yr|year)/gi,
      /\$[\d,]+(?:\.\d+)?[Kk]\s*[-–—]\s*\$[\d,]+(?:\.\d+)?[Kk]\s*\/\s*(?:yr|year|hr|hour|mo|month)?/gi,
      /£[\d,]+(?:\.\d+)?[Kk]?\s*[-–—]\s*£[\d,]+(?:\.\d+)?[Kk]?\s*\/\s*(?:yr|year)?/gi,
      /€[\d,]+(?:\.\d+)?[Kk]?\s*[-–—]\s*€[\d,]+(?:\.\d+)?[Kk]?\s*\/\s*(?:yr|year)?/gi,
      /\bUSD\s*\$[\d,]+(?:\.\d+)?\s*\/\s*(?:Yr\.?|year)/gi,
      /\$[\d,]+(?:\.\d+)?[Kk]\s*\/\s*(?:yr|year|hr|hour|mo|month)/gi,
    ];
    const all = [];
    for (const re of patterns) {
      re.lastIndex = 0;
      const m = text.match(re);
      if (m) all.push(...m);
    }
    return pickBestSalaryMatch(all);
  }

  function extractLocationFromDescription(desc) {
    const m = desc.match(
      /(?:^|\n)\s*Location:\s*([^\n]+)/i
    );
    return m ? m[1].trim() : "";
  }

  function extractRoleTypeFromDescription(desc) {
    const m = desc.match(/(?:^|\n)\s*Job Type:\s*([^\n]+)/i);
    return m ? m[1].trim() : "";
  }

  function scrapeLinkedInDescription(root) {
    const skipInParent = (el) =>
      el.closest?.(
        '[class*="hiring-team"], [class*="job-poster"], [class*="people-you"], [class*="similar-jobs"], nav, header, button'
      );

    const headingCandidates = root.querySelectorAll("h2, h3, h4, strong, span, p");
    for (const h of headingCandidates) {
      const label = text(h);
      if (!/^about the job$/i.test(label)) continue;
      let container =
        h.closest(
          '[class*="jobs-description"], [class*="job-details"], section, article, .jobs-box'
        ) || h.parentElement;
      for (let i = 0; i < 5 && container; i++) {
        const blockText = formattedText(container);
        if (blockText.length > 400) {
          return cleanDescriptionText(container, label);
        }
        container = container.parentElement;
      }
      const chunks = [];
      let node = h.parentElement?.nextElementSibling || h.nextElementSibling;
      while (node && chunks.join("").length < 20000) {
        if (!skipInParent(node)) chunks.push(text(node));
        node = node.nextElementSibling;
      }
      if (chunks.join("").length > 100) {
        return cleanDescriptionText(chunks.join("\n\n"), label);
      }
    }

    const selectors = [
      ".jobs-description__content",
      ".jobs-description-content__text",
      ".jobs-box__html-content",
      "#job-details",
      '[class*="jobs-description"]',
    ];
    let best = "";
    for (const sel of selectors) {
      root.querySelectorAll(sel).forEach((el) => {
        if (skipInParent(el)) return;
        const t = cleanDescriptionText(el);
        if (t.length > best.length) best = t;
      });
    }
    return best;
  }

  function cleanDescriptionText(raw, headingLabel) {
    let t;
    if (raw && typeof raw === "object" && raw.nodeType === 1) {
      t = formattedText(raw);
    } else {
      const fmt = globalThis.JTDescriptionFormat;
      t = fmt?.normalizeDescriptionPlain
        ? fmt.normalizeDescriptionPlain(String(raw))
        : String(raw).replace(/\r\n/g, "\n").trim();
    }
    if (headingLabel) {
      t = t.replace(new RegExp(`^${headingLabel}\\s*`, "i"), "");
    }
    return t.trim();
  }

  /** Preserve paragraph breaks from career-site layouts (innerText). */
  function formattedText(el) {
    if (!el) return "";
    const clone = el.cloneNode(true);
    clone
      .querySelectorAll(
        "script, style, nav, header, footer, button, [class*='cookie'], [class*='banner'], [aria-hidden='true']"
      )
      .forEach((n) => n.remove());
    let t = clone.innerText || clone.textContent || "";
    t = t.replace(/\r\n/g, "\n");
    t = t.replace(/[ \t]+\n/g, "\n");
    t = t.replace(/\n[ \t]+/g, "\n");
    t = t.replace(/\n{3,}/g, "\n\n");
    return t.trim();
  }

  function trimDescriptionFooter(desc) {
    if (!desc) return "";
    const markers = [
      /\n\s*Minimum\s+Pay\s+Rate\b/i,
      /\n\s*Maximum\s+Pay\s+Rate\b/i,
      /\n\s*Get future jobs matching this search/i,
      /\n\s*mail_outline\b/i,
      /\n\s*\d{4,6}\s*\n\s*Get future jobs/i,
    ];
    let cut = desc.length;
    for (const re of markers) {
      const idx = desc.search(re);
      if (idx > 150 && idx < cut) cut = idx;
    }
    return desc.slice(0, cut).trim();
  }

  function guessCompanyFromHost() {
    const host = location.hostname.replace(/^www\./, "");
    const known = {
      "careers.rushenterprises.com": "Rush Enterprises",
      "rushenterprises.com": "Rush Enterprises",
    };
    if (known[host]) return known[host];
    const parts = host.split(".");
    if (parts[0] === "careers" && parts.length >= 2) {
      const name = parts[parts.length - 2];
      return name
        .replace(/-/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
    return "";
  }

  function findJobContentRoot() {
    const selectors = [
      "[class*='job-description']",
      "[class*='jobDescription']",
      "[class*='job_description']",
      "#job-description",
      "[id*='jobDescription']",
      ".job-detail",
      ".job-details",
      "article",
      "main",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && formattedText(el).length > 300) return el;
    }
    return document.querySelector("main") || document.body;
  }

  function scrapeGenericDescription(root) {
    const selectors = [
      "[class*='job-description']",
      "[class*='jobDescription']",
      "[class*='description']",
      "#job-description",
      "article",
      "main",
    ];
    let best = "";
    for (const sel of selectors) {
      root.querySelectorAll(sel).forEach((el) => {
        const t = trimDescriptionFooter(formattedText(el));
        if (t.length > best.length) best = t;
      });
    }
    if (!best) best = trimDescriptionFooter(formattedText(root));
    return truncate(best, 16000);
  }

  function scrapeGenericLocation(root) {
    const loc = firstMatch(
      [
        "[class*='location']",
        "[class*='job-location']",
        "[data-testid*='location']",
        ".location",
      ],
      root
    );
    if (loc && !/^\d{4,8}$/.test(loc)) return loc;

    const h1 = root.querySelector("h1");
    if (h1) {
      let sib = h1.nextElementSibling;
      for (let i = 0; i < 4 && sib; i++) {
        const t = text(sib);
        if (/^[A-Za-z][^.\n]{2,60},\s*[A-Za-z][\w\s.]{1,40}$/.test(t)) return t;
        sib = sib.nextElementSibling;
      }
    }
    return "";
  }

  function buildLinkedInLocation(root, locationBullets, workplace) {
    const parts = [];

    for (const bullet of locationBullets) {
      parts.push(...parseLinkedInMetadataLine(bullet));
    }

    if (workplace && !parts.some((p) => p.toLowerCase() === workplace.toLowerCase())) {
      parts.push(workplace);
    }

    const desc = scrapeLinkedInDescription(root);
    const descLoc = extractLocationFromDescription(desc);
    if (descLoc) {
      const descParts = descLoc.split(/\s*[·•|]\s*/).map((s) => s.trim()).filter(Boolean);
      for (const p of descParts) {
        if (!parts.some((x) => x.toLowerCase() === p.toLowerCase())) parts.push(p);
      }
    }

    const geoOnly = parts.filter((p) => {
      if (/^(remote|hybrid|on-?site)$/i.test(p)) return true;
      if (isLinkedInNoiseSegment(p)) return false;
      if (/\d+\s+days?\s+ago/i.test(p)) return false;
      return true;
    });

    const workplaceTypes = geoOnly.filter((p) => /^(remote|hybrid|on-?site)$/i.test(p));
    const places = geoOnly.filter((p) => !/^(remote|hybrid|on-?site)$/i.test(p));

    if (places.length === 0 && workplaceTypes.length === 0 && workplace) {
      workplaceTypes.push(workplace);
    }

    return combineLocationParts([...places.slice(0, 2), ...workplaceTypes]);
  }

  function parseJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          const job = findJobPosting(item);
          if (job) return jobFromSchema(job);
        }
      } catch {
        /* ignore invalid JSON-LD */
      }
    }
    return null;
  }

  function findJobPosting(obj) {
    if (!obj || typeof obj !== "object") return null;
    const type = obj["@type"];
    if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) {
      return obj;
    }
    if (obj["@graph"]) {
      for (const node of obj["@graph"]) {
        const found = findJobPosting(node);
        if (found) return found;
      }
    }
    return null;
  }

  function jobFromSchema(schema) {
    const hiring = schema.hiringOrganization;
    const company =
      typeof hiring === "string"
        ? hiring
        : hiring?.name || hiring?.["@id"] || "";

    let pay = "";
    const base = schema.baseSalary;
    if (base) {
      const val = base.value;
      if (typeof val === "object" && val?.value) {
        pay = `${val.value}${val.unitText ? " " + val.unitText : ""}`;
      } else if (typeof val === "number" || typeof val === "string") {
        pay = String(val);
      }
      if (base.currency) pay = `${pay} ${base.currency}`.trim();
    }
    if (!pay && schema.salary) pay = String(schema.salary);
    if (!isValidPayString(pay)) pay = extractMinMaxPayFromText(String(schema.description || "")) || "";

    return {
      title: schema.title || schema.name || "",
      company,
      location: formatLocation(schema.jobLocation),
      pay: isValidPayString(pay) ? pay : "",
      roleType: schema.employmentType || schema.workHours || "",
      description: truncate(schema.description || "", 2000),
      url: schema.url || location.href,
      source: "json-ld",
    };
  }

  function formatLocation(loc) {
    if (!loc) return "";
    if (typeof loc === "string") return loc;
    const items = Array.isArray(loc) ? loc : [loc];
    const parts = [];
    for (const item of items) {
      if (typeof item === "string") {
        parts.push(item);
        continue;
      }
      const addr = item.address || item;
      if (typeof addr === "string") parts.push(addr);
      else if (addr) {
        parts.push(
          [addr.addressLocality, addr.addressRegion, addr.addressCountry]
            .filter(Boolean)
            .join(", ")
        );
      }
    }
    return parts.filter(Boolean).join(" · ");
  }

  function truncate(str, max) {
    const plain = String(str).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return plain.length > max ? plain.slice(0, max) + "…" : plain;
  }

  function scrapeLinkedIn() {
    if (globalThis.LinkedInScraper) {
      return globalThis.LinkedInScraper.scrape();
    }
    const root = linkedInDetailRoot();
    const description = scrapeLinkedInDescription(root);
    return {
      title: firstMatch(["h1"], root),
      company: firstMatch(['a[href*="/company/"]'], root),
      location: buildLinkedInLocation(root, [], ""),
      pay: extractSalaryFromText(root.innerText || ""),
      roleType: "",
      description: truncate(description, 16000),
      url: location.href,
      source: "linkedin",
      jobId: "",
    };
  }

  function scrapeGlassdoor() {
    return {
      title: firstMatch([
        "[data-test='job-title']",
        ".JobDetails_jobTitle__",
        "h1.heading_Level1",
        "h1",
      ]),
      company: firstMatch([
        "[data-test='employer-name']",
        ".JobDetails_companyName__",
        "h4",
      ]),
      location: firstMatch([
        "[data-test='location']",
        ".JobDetails_location__",
      ]),
      pay: firstMatch([
        "[data-test='detailSalary']",
        ".JobDetails_salaryEstimate__",
      ]),
      roleType: firstMatch([
        "[data-test='job-type']",
        ".JobDetails_employmentType__",
      ]),
      description: firstMatch([
        "[data-test='jobDescriptionContent']",
        ".JobDetails_jobDescription__",
        "#JobDescriptionContainer",
      ]),
      url: location.href.split("?")[0],
      source: "glassdoor",
    };
  }

  function scrapeIndeed() {
    return {
      title: firstMatch([
        ".jobsearch-JobInfoHeader-title",
        "h1.jobsearch-JobInfoHeader-title",
        "h1",
      ]),
      company: firstMatch([
        "[data-company-name='true']",
        ".jobsearch-InlineCompanyRating a",
        "[data-testid='inlineHeader-companyName']",
      ]),
      location: firstMatch([
        "[data-testid='job-location']",
        ".jobsearch-JobInfoHeader-subtitle div",
      ]),
      pay: firstMatch([
        "#salaryInfoAndJobType",
        ".jobsearch-JobMetadataHeader-item",
      ]),
      roleType: firstMatch([".jobsearch-JobMetadataHeader-item"]),
      description: firstMatch(["#jobDescriptionText", ".jobsearch-JobComponent-description"]),
      url: location.href.split("?")[0],
      source: "indeed",
    };
  }

  function scrapeGeneric() {
    const root = findJobContentRoot();
    const ogTitle = attr(document.querySelector('meta[property="og:title"]'), "content");
    const ogDesc = attr(document.querySelector('meta[property="og:description"]'), "content");
    const title =
      firstMatch(
        ["h1", "[class*='job-title']", "[class*='JobTitle']", "[data-testid*='title']"],
        root
      ) || ogTitle;
    const company =
      firstMatch(
        ["[class*='company']", "[class*='employer']", "[data-testid*='company']"],
        root
      ) ||
      guessCompanyFromHost() ||
      guessCompanyFromTitle(ogTitle);
    const pay =
      extractMinMaxPayFromDom() ||
      extractSalaryFromText(document.body?.innerText || "") ||
      "";
    const description = scrapeGenericDescription(root) || ogDesc || "";
    return {
      title,
      company,
      location: scrapeGenericLocation(root),
      pay: isValidPayString(pay) ? pay : "",
      roleType: findEmploymentType(),
      description,
      url: location.href.split("?")[0],
      source: "generic",
    };
  }

  function guessCompanyFromTitle(ogTitle) {
    if (!ogTitle) return "";
    const at = ogTitle.match(/\bat\s+(.+?)(?:\s*[-|]|$)/i);
    if (at) return at[1].trim();
    const pipe = ogTitle.split("|").map((s) => s.trim());
    if (pipe.length >= 2) return pipe[pipe.length - 1];
    return "";
  }

  function findPayInPage() {
    const fromDom = extractMinMaxPayFromDom();
    if (isValidPayString(fromDom)) return fromDom;
    const fromText = extractSalaryFromText(document.body?.innerText || "");
    if (isValidPayString(fromText)) return fromText;
    const elPay = firstMatch(["[class*='salary']", "[class*='compensation']", "[class*='pay-rate']"]);
    if (isValidPayString(elPay)) return elPay;
    return "";
  }

  function findEmploymentType() {
    const body = (document.body?.innerText || "").slice(0, 8000);
    const types = ["Full-time", "Part-time", "Contract", "Internship", "Temporary", "Remote"];
    for (const t of types) {
      if (body.includes(t)) return t;
    }
    return "";
  }

  function mergeJobs(...parts) {
    const out = {
      title: "",
      company: "",
      location: "",
      pay: "",
      roleType: "",
      description: "",
      url: location.href.split("?")[0],
      source: "merged",
    };
    for (const p of parts) {
      if (!p) continue;
      for (const key of Object.keys(out)) {
        if (key === "description") {
          const next = p[key] || "";
          if (next.length > (out.description?.length || 0)) out.description = next;
          continue;
        }
        if (key === "pay" && p[key]) {
          const nextPay = p[key];
          if (!isValidPayString(nextPay)) continue;
          if (!isValidPayString(out.pay) || nextPay.length > out.pay.length) out.pay = nextPay;
          continue;
        }
        if (!out[key] && p[key]) out[key] = p[key];
      }
      if (p.source && p.source !== "merged") out.source = p.source;
    }
    return out;
  }

  function confidence(job) {
    let score = 0;
    if (job.title) score += 3;
    if (job.company) score += 2;
    if (job.location) score += 1;
    if (job.pay) score += 1;
    if (job.description) score += 1;
    return score;
  }

  async function scrape() {
    const host = location.hostname.replace(/^www\./, "");
    let site = null;
    if (host.includes("linkedin.com")) site = await scrapeLinkedIn();
    else if (host.includes("glassdoor.")) site = scrapeGlassdoor();
    else if (host.includes("indeed.")) site = scrapeIndeed();

    const jsonLd = parseJsonLd();
    const generic = host.includes("linkedin.com") ? null : scrapeGeneric();
    const job = mergeJobs(jsonLd, site, generic);
    job.confidence = confidence(job);
    job.scrapedAt = Date.now();
    return job;
  }

  function scrapeFromSelection(selectedText) {
    const lines = selectedText
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const job = {
      title: "",
      company: "",
      location: "",
      pay:
        extractMinMaxPayFromText(selectedText) ||
        extractSalaryFromText(selectedText) ||
        "",
      roleType: "",
      description: "",
      url: location.href.split("?")[0],
      source: "highlight",
    };

    const aboutIdx = lines.findIndex((l) => /^about the job$/i.test(l));
    if (aboutIdx >= 0) {
      job.description = lines.slice(aboutIdx + 1).join("\n").slice(0, 16000);
    } else {
      job.description = selectedText.slice(0, 16000);
    }

    const titleLine = lines.find((l) => /^job title:/i.test(l));
    if (titleLine) job.title = titleLine.replace(/^job title:\s*/i, "").trim();

    const locLine = lines.find((l) => /^location:/i.test(l));
    if (locLine) job.location = locLine.replace(/^location:\s*/i, "").trim();

    const typeLine = lines.find((l) => /^job type:/i.test(l));
    if (typeLine) job.roleType = typeLine.replace(/^job type:\s*/i, "").trim();

    if (!job.title) {
      const titleCandidate = lines.find(
        (l) =>
          l.length < 80 &&
          !isLinkedInNoiseSegment(l) &&
          !/^\$/.test(l) &&
          !/^about /i.test(l) &&
          !/careerus|logo/i.test(l)
      );
      if (titleCandidate && !job.company) {
        const idx = lines.indexOf(titleCandidate);
        if (idx > 0 && lines[idx - 1].length < 60) job.company = lines[idx - 1];
        job.title = titleCandidate;
      }
    }

    for (const line of lines) {
      if (/·/.test(line) && /united states|remote|hybrid/i.test(line)) {
        const parsed = parseLinkedInMetadataLine(line);
        const remote = parsed.find((p) => /^(remote|hybrid|on-?site)$/i.test(p));
        const place = parsed.find((p) => !/^(remote|hybrid|on-?site)$/i.test(p));
        if (!job.location) job.location = combineLocationParts([place, remote].filter(Boolean));
      }
    }

    if (!job.location) {
      const remoteLine = lines.find((l) => /^(remote|hybrid|on-?site)$/i.test(l));
      const geoLine = lines.find((l) => /^[A-Za-z].*United States/i.test(l) && l.includes("·"));
      if (geoLine) job.location = combineLocationParts(parseLinkedInMetadataLine(geoLine));
      else if (remoteLine) job.location = remoteLine;
    }

    if (!job.company) {
      job.company =
        lines.find(
          (l) =>
            l.length < 80 &&
            l !== job.title &&
            !isLinkedInNoiseSegment(l) &&
            !/^\$|^(remote|full-time|easy apply)/i.test(l)
        ) || "";
    }

    if (!job.roleType) {
      const typeMatch = selectedText.match(
        /(Full-time|Part-time|Contract|Internship|Temporary)/i
      );
      if (typeMatch) job.roleType = typeMatch[1];
    }

    if (!job.location && /remote/i.test(selectedText)) {
      job.location = job.location || "Remote";
    }

    if (!isValidPayString(job.pay)) job.pay = "";

    job.confidence = confidence(job);
    return job;
  }

  return {
    scrape,
    scrapeFromSelection,
    confidence,
    extractSalaryFromText,
    extractMinMaxPayFromText,
  };
})();

if (typeof globalThis !== "undefined") {
  globalThis.JobScraper = JobScraper;
}
