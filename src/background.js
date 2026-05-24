import { addJob, getSettings, updateJob } from "./shared/storage.js";
import {
  JT_MESSAGE,
  JT_STORAGE_KEYS,
  JT_DEFAULT_SETTINGS,
} from "./shared/constants-module.js";

const SIDE_PANEL_PATH = "src/sidepanel/sidepanel.html";

/** Side Panel API exists in Chrome 114+; may be missing in older builds or some browsers. */
function hasSidePanelApi() {
  return Boolean(chrome.sidePanel?.setOptions && chrome.sidePanel?.open);
}

chrome.action.onClicked.addListener((tab) => {
  void openTrackerPanel(tab.windowId);
});

chrome.runtime.onInstalled.addListener(async () => {
  await initSidePanel();
  const existing = await chrome.storage.local.get(JT_STORAGE_KEYS.settings);
  if (!existing[JT_STORAGE_KEYS.settings]) {
    await chrome.storage.local.set({
      [JT_STORAGE_KEYS.settings]: JT_DEFAULT_SETTINGS,
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  void initSidePanel();
});

void initSidePanel();

async function initSidePanel() {
  if (!hasSidePanelApi()) {
    console.info(
      "[Job Tracker] Side Panel API unavailable — board will open in a browser tab. Use Chrome 116+ for the side panel."
    );
    return;
  }
  try {
    await chrome.sidePanel.setOptions({
      path: SIDE_PANEL_PATH,
      enabled: true,
    });
    if (chrome.sidePanel.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    }
  } catch (err) {
    console.warn("[Job Tracker] Side panel setup failed:", err);
  }
}

function getBoardPageUrl() {
  return chrome.runtime.getURL(SIDE_PANEL_PATH);
}

async function findExistingBoardTab(preferredWindowId) {
  const tabs = await chrome.tabs.query({ url: getBoardPageUrl() });
  if (!tabs.length) return null;
  if (preferredWindowId != null) {
    const inWindow = tabs.find((t) => t.windowId === preferredWindowId);
    if (inWindow) return inWindow;
  }
  return tabs[0];
}

async function focusBoardTab(tab) {
  if (!tab?.id) return false;
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.tabs.update(tab.id, { active: true });
  return true;
}

async function tryOpenSidePanel(windowId) {
  if (!hasSidePanelApi() || windowId == null) return false;
  try {
    await chrome.sidePanel.setOptions({
      path: SIDE_PANEL_PATH,
      enabled: true,
    });
    await chrome.sidePanel.open({ windowId });
    return true;
  } catch (err) {
    console.warn("[Job Tracker] sidePanel.open failed:", err);
    return false;
  }
}

async function openBoardTab(windowId) {
  const again = await findExistingBoardTab(windowId);
  if (again) {
    await focusBoardTab(again);
    return { ok: true, method: "focus", focused: true };
  }
  const tab = await chrome.tabs.create({ url: getBoardPageUrl(), active: true });
  return { ok: true, method: "tab", tabId: tab.id };
}

async function openTrackerPanel(windowId) {
  const existingTab = await findExistingBoardTab(windowId);
  if (existingTab) {
    await focusBoardTab(existingTab);
    await tryOpenSidePanel(existingTab.windowId);
    return { ok: true, method: "focus", focused: true };
  }

  if (await tryOpenSidePanel(windowId)) {
    return { ok: true, method: "sidePanel" };
  }

  return openBoardTab(windowId);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true;
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case JT_MESSAGE.addJob: {
      const result = await addJob(message.payload, message.columnId || "saved", {
        allowDuplicate: message.allowDuplicate,
      });
      if (result.duplicate && message.updateIfDuplicate) {
        const updated = await updateJob(result.job.id, message.payload);
        return { ok: true, job: updated || result.job, duplicate: true, updated: !!updated };
      }
      return { ok: true, job: result.job, duplicate: result.duplicate };
    }
    case JT_MESSAGE.openSidePanel: {
      if (message.jobId) {
        await chrome.storage.local.set({ jt_highlight_job: message.jobId });
      }
      let windowId = sender.tab?.windowId;
      if (windowId == null) {
        const win = await chrome.windows.getLastFocused({ populate: false });
        windowId = win?.id;
      }
      return openTrackerPanel(windowId);
    }
    case JT_MESSAGE.getSettings: {
      const settings = await getSettings();
      return { ok: true, settings };
    }
    case JT_MESSAGE.fetchLinkedInJob: {
      const jobId = message.jobId;
      if (!jobId) return { ok: false, error: "No job id" };
      const url = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
      const res = await fetch(url, { credentials: "omit" });
      const html = await res.text();
      return { ok: res.ok, html, status: res.status };
    }
    default:
      return { ok: false, error: "Unknown message" };
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.jt_settings) return;
  const settings = changes.jt_settings.newValue;
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, {
        type: JT_MESSAGE.settingsUpdated,
        settings,
      }).catch(() => {});
    }
  });
});
