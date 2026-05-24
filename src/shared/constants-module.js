export const JT_STORAGE_KEYS = {
  jobs: "jt_jobs",
  settings: "jt_settings",
};

export const JT_BOARD_COLUMN_WIDTH = { min: 120, max: 320, step: 4, default: 188 };

export const JT_DEFAULT_SETTINGS = {
  darkMode: false,
  persistentOverlay: true,
  highlightMode: true,
  confirmBeforeDelete: true,
  boardColumnWidth: JT_BOARD_COLUMN_WIDTH.default,
};

export const JT_KANBAN_COLUMNS = [
  { id: "saved", label: "Saved" },
  { id: "applied", label: "Applied" },
  { id: "interview", label: "Interview" },
  { id: "offer", label: "Offer" },
  { id: "rejected", label: "Rejected" },
];

export const JT_MESSAGE = {
  scrapePage: "JT_SCRAPE_PAGE",
  scrapeResult: "JT_SCRAPE_RESULT",
  addJob: "JT_ADD_JOB",
  getSettings: "JT_GET_SETTINGS",
  settingsUpdated: "JT_SETTINGS_UPDATED",
  openSidePanel: "JT_OPEN_SIDE_PANEL",
  openPreview: "JT_OPEN_PREVIEW",
  fetchLinkedInJob: "JT_FETCH_LINKEDIN_JOB",
};
