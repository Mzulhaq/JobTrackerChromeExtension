# Privacy Policy — Job Tracker

**Last updated:** June 3, 2026

**Developer:** Mzulhaq (solo developer)

**Contact:** Use the support email or link you provide on the Chrome Web Store listing for this extension.

## Summary

Job Tracker stores your job applications **only on your device**. It does **not** run analytics, ads, or accounts. It does **not** sell or share your data with third parties.

## What data the extension handles

When you use Job Tracker, it may store locally (in `chrome.storage.local` on your computer):

- Job fields you save or scrape: title, company, location, pay, employment type, description, notes, posting URL, pipeline status, timestamps
- Extension settings: theme, overlay behavior, highlight mode, delete confirmations, column widths

This data stays in your browser profile until you delete it, uninstall the extension, or clear extension storage.

## What the extension does on websites

On pages you visit, the extension can:

- Show a small overlay and highlight tools **on job-related pages** (when enabled)
- Read visible page content **only when you start a capture** (logo button or highlight mode) to fill the review form
- On LinkedIn job pages, optionally request **public** job posting HTML from LinkedIn’s guest job API (no LinkedIn login is sent by the extension)

The extension does **not** read passwords, payment data, or form fields you type into application forms unless you explicitly capture visible job text.

## Network requests

The only routine network request is to LinkedIn’s public guest endpoint when you capture a LinkedIn job and the in-page scrape needs a fallback:

`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{jobId}`

No other servers receive your job list or settings.

## Permissions (why they exist)

| Permission | Why |
|------------|-----|
| `storage` | Save jobs and settings on your device |
| `activeTab` | Interact with the tab you are using when capturing |
| `scripting` | Inject capture helpers when needed |
| `tabs` | Open or focus the board side panel / tab |
| `<all_urls>` (host) | Let you capture jobs from any job site you visit |

## Export and import

You can export a JSON backup or CSV from the extension. Those files are created **on your machine**; you control where they are saved. Import only reads a file **you** choose.

## Data deletion

- Delete individual jobs in the board or list
- **Settings → Your data → Delete all jobs**
- Uninstall the extension or remove its data in `chrome://extensions` → Job Tracker → Details → Clear data

## Children

Job Tracker is not directed at children under 13 and does not knowingly collect personal information from children.

## Changes

If this policy changes, the “Last updated” date above will change. Material changes will be reflected in the Chrome Web Store listing notes when published.

## Your rights

Because data is stored locally in your browser, you already control access, export, and deletion via the extension and Chrome’s extension data controls.
