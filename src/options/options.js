import {
  getSettings,
  saveSettings,
  exportData,
  importData,
  clearAllJobs,
} from "../shared/storage.js";

const form = document.getElementById("settings-form");
const savedMsg = document.getElementById("saved-msg");

async function init() {
  const settings = await getSettings();
  document.documentElement.dataset.theme = settings.darkMode ? "dark" : "light";
  form.darkMode.checked = settings.darkMode;
  form.persistentOverlay.checked = settings.persistentOverlay;
  form.highlightMode.checked = settings.highlightMode;
  form.confirmBeforeDelete.checked = settings.confirmBeforeDelete !== false;
}

form.addEventListener("change", async () => {
  const settings = {
    darkMode: form.darkMode.checked,
    persistentOverlay: form.persistentOverlay.checked,
    highlightMode: form.highlightMode.checked,
    confirmBeforeDelete: form.confirmBeforeDelete.checked,
  };
  await saveSettings(settings);
  document.documentElement.dataset.theme = settings.darkMode ? "dark" : "light";

  savedMsg.hidden = false;
  setTimeout(() => {
    savedMsg.hidden = true;
  }, 2000);
});

document.getElementById("btn-export").addEventListener("click", async () => {
  const data = await exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `job-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("import-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const merge = confirm("Merge with existing jobs? Cancel = replace all.");
    const n = await importData(payload, merge ? "merge" : "replace");
    alert(merge ? `Merged ${n} new job(s).` : `Restored ${n} job(s).`);
  } catch {
    alert("Invalid backup file.");
  }
});

document.getElementById("btn-clear").addEventListener("click", async () => {
  if (!confirm("Delete ALL saved jobs? This cannot be undone.")) return;
  await clearAllJobs();
  alert("All jobs deleted.");
});

init();
