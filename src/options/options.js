import { getSettings } from "../shared/storage.js";
import {
  applySettingsToForm,
  bindSettingsPanel,
} from "../shared/settings-ui.js";

const form = document.getElementById("settings-form");
const savedMsg = document.getElementById("saved-msg");

async function init() {
  const settings = await getSettings();
  document.documentElement.dataset.theme = settings.darkMode ? "dark" : "light";
  applySettingsToForm(form, settings);

  bindSettingsPanel({
    form,
    savedMsg,
    onThemeChange: (s) => {
      document.documentElement.dataset.theme = s.darkMode ? "dark" : "light";
    },
  });
}

init();
