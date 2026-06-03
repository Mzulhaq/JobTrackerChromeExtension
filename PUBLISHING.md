# Publishing Job Tracker to the Chrome Web Store

Use this checklist so the listing is accurate and the extension cannot surprise you or users.

## Before you zip

1. **Reload and smoke-test** unpacked at `chrome://extensions`
   - Save a job from a job site
   - Board, All jobs, Settings tabs work
   - Export JSON, import merge/replace
   - Delete one job and “delete all” (on a test profile if possible)

2. **Version** — bump `version` in `manifest.json` for each store upload (e.g. `1.8.3`).

3. **Create the zip** (no `.git`, no junk):

```bash
cd /Users/mzulhaq/Projects/JobTrackerChromeExtension
zip -r job-tracker.zip . \
  -x "*.git*" -x ".DS_Store" -x "*.log" -x "node_modules/*" \
  -x "job-tracker.zip" -x "PUBLISHING.md"
```

Upload `job-tracker.zip` in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Store listing (copy-friendly)

**Category:** Productivity

**Short description:** Save job postings from any site to a private kanban board in your browser.

**Detailed description (adjust as you like):**

Job Tracker helps you organize your job search without sending your data to a cloud service.

- Capture jobs from LinkedIn, Greenhouse, and other sites with one click
- Kanban pipeline: Saved → Applied → Interview → Offer → Rejected
- Search and edit full descriptions and notes
- Export JSON backup and CSV spreadsheet
- All data stored locally in Chrome on your device

**Single purpose:** Job application tracking and capture from job posting pages.

**Privacy policy URL:** Host `PRIVACY.md` on GitHub (raw or Pages) or your site, e.g.  
`https://github.com/Mzulhaq/JobTrackerChromeExtension/blob/main/PRIVACY.md`  
The dashboard requires a **public HTTPS** URL — GitHub’s `blob` link works; for a cleaner URL use GitHub Pages or paste the policy into a gist/site.

## Permission justifications (dashboard form)

Use plain language matching what the extension actually does:

- **storage** — Save jobs and settings locally on the device.
- **activeTab** — Read the current tab when the user clicks capture on a job page.
- **scripting** — Run capture UI on the active job page when the user requests it.
- **tabs** — Open or focus the board side panel or fallback tab.
- **Host permission &lt;all_urls&gt;** — Users visit many different job boards; the extension only activates capture UI on job-related pages and only reads page content when the user starts a save.

**Data usage certification:** No data sold to third parties; no unrelated purposes; no remote code; local storage only (plus optional LinkedIn guest API fetch for LinkedIn captures).

## Host permission review

`<all_urls>` triggers extra review. Your listing must state:

- Content scripts load broadly but **overlay/highlight only on job sites**
- Scraping runs **only on user action**
- No background scraping of banking, email, etc.

## Assets you need

| Asset | Size |
|--------|------|
| Icon | 128×128 (you have `icons/icon128.png`) |
| Screenshots | At least 1, 1280×800 or 640×400 recommended |
| Small promo tile | Optional 440×280 |

Capture screenshots of the side panel board and the in-page “Detected job” preview.

## Review timeline

First submission often takes **a few days to 2+ weeks**, especially with broad host access. Respond quickly if Google asks for a demo video or clarification.

## After approval

- Pin the store link in README
- Watch **Reviews** and **Crash reports** in the dashboard
- For updates: bump version, new zip, submit — users get auto-updates

## Safety guarantees in this project

| Topic | Status |
|--------|--------|
| Remote code / eval | Not used |
| Analytics / ads | None |
| Account / login | None |
| Cloud sync | None |
| User data sale | None |
| XSS in board UI | User text escaped; descriptions use safe HTML formatter |
| Import bomb | Size and job count limits in `storage.js` |
| Dangerous links | Job URLs limited to `http:` / `https:` |
| Background messages | Handlers only accept messages from this extension |

## Optional before first publish

- [ ] Host `PRIVACY.md` at a stable HTTPS URL
- [ ] Support email on the listing (Gmail alias is fine)
- [ ] Test on a fresh Chrome profile with only this extension
