import {
  getSettings,
  saveSettings,
  exportData,
  importData,
  clearAllJobs,
  JT_MAX_IMPORT_BYTES,
} from "./storage.js";

export function readSettingsForm(form) {
  return {
    darkMode: form.darkMode.checked,
    persistentOverlay: form.persistentOverlay.checked,
    highlightMode: form.highlightMode.checked,
    confirmBeforeDelete: form.confirmBeforeDelete.checked,
    openBoardOnSave: form.openBoardOnSave.checked,
  };
}

export function applySettingsToForm(form, settings) {
  form.darkMode.checked = settings.darkMode;
  form.persistentOverlay.checked = settings.persistentOverlay;
  form.highlightMode.checked = settings.highlightMode;
  form.confirmBeforeDelete.checked = settings.confirmBeforeDelete !== false;
  form.openBoardOnSave.checked = settings.openBoardOnSave !== false;
}

export function bindSettingsPanel({
  form,
  savedMsg,
  onThemeChange,
  onSettingsSaved,
}) {
  async function persist() {
    const settings = readSettingsForm(form);
    await saveSettings(settings);
    onThemeChange?.(settings);
    onSettingsSaved?.(settings);
    if (savedMsg) {
      savedMsg.hidden = false;
      setTimeout(() => {
        savedMsg.hidden = true;
      }, 2000);
    }
  }

  form.addEventListener("change", () => {
    void persist();
  });

  const exportBtn = form.querySelector("[data-settings-export]");
  exportBtn?.addEventListener("click", async () => {
    const data = await exportData();
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job-tracker-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const importInput = form.querySelector("[data-settings-import]");
  importInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      if (file.size > JT_MAX_IMPORT_BYTES) {
        alert("Backup file is too large (max 8 MB).");
        return;
      }
      const text = await file.text();
      const payload = JSON.parse(text);
      const merge = confirm("Merge with existing jobs? Cancel = replace all.");
      const n = await importData(payload, merge ? "merge" : "replace", { byteLength: file.size });
      alert(merge ? `Merged ${n} new job(s).` : `Restored ${n} job(s).`);
      onSettingsSaved?.(await getSettings());
    } catch (err) {
      alert(err?.message || "Invalid backup file.");
    }
  });

  const clearBtn = form.querySelector("[data-settings-clear]");
  clearBtn?.addEventListener("click", async () => {
    if (!confirm("Delete ALL saved jobs? This cannot be undone.")) return;
    await clearAllJobs();
    alert("All jobs deleted.");
    onSettingsSaved?.(await getSettings());
  });
}
