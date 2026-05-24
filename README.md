# Job Tracker Chrome Extension

Capture job postings from any website and track them on a **kanban board** in Chrome’s side panel.

## Features

- **Scrape & capture** — Logo button, highlight mode, LinkedIn guest API fallback
- **Kanban board** — Saved → Applied → Interview → Offer → Rejected
- **All jobs view** — Search, sort, full job detail with description & notes
- **Local storage** — Data stays on your device (`chrome.storage.local`)
- **Export / import** — JSON backup + CSV spreadsheet export
- **Duplicate detection** — Won’t add the same posting twice

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this folder

## Workflow

1. On a job site, click the **logo** (bottom-right) → review → **Add to board**
2. Open the extension **side panel** (toolbar icon)
3. **Board** — drag cards between pipeline columns
4. **All jobs** — click a job for full details, edit, change status
5. **Export** — download JSON + CSV from the side panel

## Storage

| Field | Description |
|--------|-------------|
| title, company, location, pay, roleType | From scrape or manual entry |
| description | Full “about the role” text |
| notes | Your own reminders |
| columnId | Pipeline stage |
| url | Link back to posting |
| createdAt / updatedAt / statusChangedAt | Timestamps |

Settings → **Your data** for backup, import, or delete all jobs.

## Project structure

```
src/
  content/     # Scrape, overlay, preview on web pages
  sidepanel/   # Board, list, job detail, edit dialog
  options/     # Settings & data management
  shared/      # Storage, job model, constants
  background.js
```
