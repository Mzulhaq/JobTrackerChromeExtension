import {
  getJobs,
  getSettings,
  saveSettings,
  addJob,
  updateJob,
  deleteJob,
  deleteJobs,
  moveJobs,
  exportData,
  importData,
  jobsToCsv,
  getStats,
  sortJobs,
  filterJobs,
  JT_KANBAN_COLUMNS,
} from "../shared/storage.js";
import { columnLabel, formatDate } from "../shared/job-model.js";
import { consumeHighlightJobId } from "../shared/messaging.js";
import { JT_BOARD_COLUMN_WIDTH } from "../shared/constants-module.js";
import {
  applySettingsToForm,
  bindSettingsPanel,
} from "../shared/settings-ui.js";
import "../shared/description-format-core.js";

const { descriptionToDisplayHtml } = globalThis.JTDescriptionFormat;

const kanbanEl = document.getElementById("kanban");
const jobListEl = document.getElementById("job-list");
const statsBar = document.getElementById("stats-bar");
const searchInput = document.getElementById("search-input");
const sortSelect = document.getElementById("sort-select");
const jobDetailEl = document.getElementById("job-detail");
const detailBody = document.getElementById("detail-body");
const detailStatus = document.getElementById("detail-status");
const detailUrl = document.getElementById("detail-url");
const jobDialog = document.getElementById("job-dialog");
const jobForm = document.getElementById("job-form");
const formColumn = document.getElementById("form-column");
const boardBulkBar = document.getElementById("board-bulk-bar");
const bulkCountEl = document.getElementById("bulk-count");
const bulkMoveColumn = document.getElementById("bulk-move-column");
const bulkMoveBtn = document.getElementById("bulk-move-btn");
const bulkDeleteBtn = document.getElementById("bulk-delete-btn");
const bulkClearBtn = document.getElementById("bulk-clear-btn");
const settingsForm = document.getElementById("settings-form");
const headerToolbar = document.getElementById("header-toolbar");

let jobsCache = [];
let appSettings = { confirmBeforeDelete: true, darkMode: false, boardColumnWidths: {} };
let columnWidths = {};
let editingJobId = null;
let selectedJobId = null;
let selectedJobIds = new Set();
let lastBoardSelectId = null;
let dragJobId = null;
let activeTab = "board";
let searchQuery = "";
let columnResizeDrag = null;

async function init() {
  closeDetail();

  populateColumnSelects();
  appSettings = await getSettings();
  document.documentElement.dataset.theme = appSettings.darkMode ? "dark" : "light";
  columnWidths = normalizeColumnWidths(appSettings);
  applySettingsToForm(settingsForm, appSettings);
  bindSettingsPanel({
    form: settingsForm,
    savedMsg: document.getElementById("settings-saved-msg"),
    onThemeChange: (settings) => {
      appSettings = { ...appSettings, ...settings };
      document.documentElement.dataset.theme = appSettings.darkMode ? "dark" : "light";
    },
    onSettingsSaved: async (settings) => {
      appSettings = { ...appSettings, ...settings };
      columnWidths = normalizeColumnWidths(appSettings);
      await refresh();
    },
  });

  bindEvents();
  syncHeaderForTab(activeTab);
  await refresh();
  await focusHighlightedJob();

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "local") return;
    if (changes.jt_settings) {
      appSettings = { ...appSettings, ...changes.jt_settings.newValue };
      applySettingsToForm(settingsForm, appSettings);
      if (changes.jt_settings.newValue?.darkMode !== undefined) {
        document.documentElement.dataset.theme = appSettings.darkMode ? "dark" : "light";
      }
      if (changes.jt_settings.newValue?.boardColumnWidths !== undefined ||
          changes.jt_settings.newValue?.boardColumnWidth !== undefined) {
        columnWidths = normalizeColumnWidths(appSettings);
        if (activeTab === "board") renderKanban();
      }
    }
    if (changes.jt_jobs || changes.jt_settings) {
      await refresh();
    }
    if (changes.jt_highlight_job) {
      await focusHighlightedJob();
    }
  });
}

function showInitError(err) {
  console.error("[Job Tracker]", err);
  const app = document.querySelector(".app");
  if (!app || document.getElementById("init-error")) return;
  const el = document.createElement("div");
  el.id = "init-error";
  el.className = "init-error";
  el.textContent =
    "Job Tracker failed to load. Reload the extension at chrome://extensions, then reopen this panel.";
  app.prepend(el);
}

init().catch(showInitError);

async function focusHighlightedJob() {
  const id = await consumeHighlightJobId();
  if (!id) return;
  setTab("board");
  const job = jobsCache.find((j) => j.id === id);
  if (job) highlightCard(id);
}

function populateColumnSelects() {
  const html = JT_KANBAN_COLUMNS.map(
    (c) => `<option value="${c.id}">${c.label}</option>`
  ).join("");
  formColumn.innerHTML = html;
  detailStatus.innerHTML = html;
  if (bulkMoveColumn) bulkMoveColumn.innerHTML = html;
}

function clampBoardColumnWidth(n) {
  const { min, max, default: d } = JT_BOARD_COLUMN_WIDTH;
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return d;
  return Math.min(max, Math.max(min, v));
}

function normalizeColumnWidths(settings) {
  const out = {};
  for (const col of JT_KANBAN_COLUMNS) {
    out[col.id] = JT_BOARD_COLUMN_WIDTH.default;
  }
  if (settings?.boardColumnWidths && typeof settings.boardColumnWidths === "object") {
    for (const col of JT_KANBAN_COLUMNS) {
      if (settings.boardColumnWidths[col.id] != null) {
        out[col.id] = clampBoardColumnWidth(settings.boardColumnWidths[col.id]);
      }
    }
  } else if (settings?.boardColumnWidth != null) {
    const legacy = clampBoardColumnWidth(settings.boardColumnWidth);
    for (const col of JT_KANBAN_COLUMNS) out[col.id] = legacy;
  }
  return out;
}

function getColumnWidth(columnId) {
  return columnWidths[columnId] ?? JT_BOARD_COLUMN_WIDTH.default;
}

function applyColumnWidth(columnEl, columnId) {
  const w = getColumnWidth(columnId);
  columnEl.style.width = `${w}px`;
  columnEl.style.flexBasis = `${w}px`;
}

function setupColumnResize(handle, columnEl, columnId) {
  handle.setAttribute("aria-valuemin", String(JT_BOARD_COLUMN_WIDTH.min));
  handle.setAttribute("aria-valuemax", String(JT_BOARD_COLUMN_WIDTH.max));
  handle.setAttribute("aria-valuenow", String(getColumnWidth(columnId)));

  handle.addEventListener("keydown", async (e) => {
    const step = JT_BOARD_COLUMN_WIDTH.step;
    let next = null;
    if (e.key === "ArrowRight") next = getColumnWidth(columnId) + step;
    if (e.key === "ArrowLeft") next = getColumnWidth(columnId) - step;
    if (next == null) return;
    e.preventDefault();
    columnWidths[columnId] = clampBoardColumnWidth(next);
    applyColumnWidth(columnEl, columnId);
    handle.setAttribute("aria-valuenow", String(columnWidths[columnId]));
    await saveSettings({ boardColumnWidths: { ...columnWidths } });
  });
}

function onColumnResizePointerDown(e) {
  const handle = e.target.closest(".column-resize-handle");
  if (!handle || e.button !== 0) return;

  const columnEl = handle.closest(".column");
  const columnId = columnEl?.dataset.columnId;
  if (!columnId) return;

  e.preventDefault();
  e.stopPropagation();

  const startX = e.clientX;
  const startW = columnEl.getBoundingClientRect().width;

  columnResizeDrag = { columnEl, columnId, handle, startX, startW };
  columnEl.classList.add("is-resizing");
  handle.classList.add("is-dragging");
  kanbanEl.classList.add("is-resizing-columns");

  const onMove = (ev) => {
    if (!columnResizeDrag) return;
    const n = clampBoardColumnWidth(columnResizeDrag.startW + (ev.clientX - startX));
    columnWidths[columnId] = n;
    applyColumnWidth(columnEl, columnId);
    handle.setAttribute("aria-valuenow", String(n));
  };

  const onEnd = async (ev) => {
    if (!columnResizeDrag) return;
    columnEl.classList.remove("is-resizing");
    handle.classList.remove("is-dragging");
    kanbanEl.classList.remove("is-resizing-columns");
    if (ev?.pointerId != null) {
      try {
        handle.releasePointerCapture(ev.pointerId);
      } catch {
        /* already released */
      }
    }
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onEnd);
    document.removeEventListener("pointercancel", onEnd);
    columnResizeDrag = null;
    appSettings = { ...appSettings, boardColumnWidths: { ...columnWidths } };
    await saveSettings({ boardColumnWidths: { ...columnWidths } });
  };

  handle.setPointerCapture(e.pointerId);
  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onEnd);
  document.addEventListener("pointercancel", onEnd);
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
  });

  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value;
    render();
  });

  sortSelect.addEventListener("change", () => render());

  document.getElementById("btn-add").addEventListener("click", () => openEditDialog(null, "saved"));
  document.getElementById("btn-export").addEventListener("click", exportJobs);
  document.getElementById("import-file").addEventListener("change", importJobs);

  kanbanEl.addEventListener("click", onKanbanClick);
  kanbanEl.addEventListener("keydown", onKanbanKeydown);
  kanbanEl.addEventListener("change", onKanbanChange);
  kanbanEl.addEventListener("pointerdown", onColumnResizePointerDown);

  bulkMoveBtn?.addEventListener("click", bulkMoveSelected);
  bulkDeleteBtn?.addEventListener("click", bulkDeleteSelected);
  bulkClearBtn?.addEventListener("click", clearBoardSelection);

  document.getElementById("detail-back").addEventListener("click", closeDetail);
  document.getElementById("detail-edit").addEventListener("click", () => {
    const job = jobsCache.find((j) => j.id === selectedJobId);
    if (job) openEditDialog(job);
  });
  document.getElementById("detail-delete").addEventListener("click", deleteSelectedJob);
  detailStatus.addEventListener("change", async () => {
    if (!selectedJobId) return;
    await updateJob(selectedJobId, { columnId: detailStatus.value });
    await refresh();
    showDetail(selectedJobId);
  });

  document.getElementById("btn-cancel").addEventListener("click", () => jobDialog.close());
  jobForm.addEventListener("submit", onJobFormSubmit);
  document.getElementById("btn-delete").addEventListener("click", onDeleteJob);
}

function onKanbanClick(e) {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();

  const action = btn.dataset.action;

  if (action === "add-column") {
    openEditDialog(null, btn.dataset.column);
    return;
  }

  const card = btn.closest(".card");
  const jobId = card?.dataset.jobId;
  if (!jobId) return;

  if (action === "view") showDetail(jobId);
  if (action === "edit") {
    const job = jobsCache.find((j) => j.id === jobId);
    if (job) openEditDialog(job);
  }
  if (action === "move") moveJob(jobId, btn.dataset.column);
  if (action === "delete") deleteJobById(jobId);
}

function onKanbanChange(e) {
  const input = e.target.closest(".card-select-input");
  if (!input) return;
  const card = input.closest(".card");
  if (!card) return;
  setJobSelected(card.dataset.jobId, input.checked, e);
}

function onKanbanKeydown(e) {
  const card = e.target.closest(".card");
  if (!card || e.target !== card) return;
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    showDetail(card.dataset.jobId);
  }
}

function syncHeaderForTab(tab) {
  const showJobsUi = tab === "board" || tab === "jobs";
  if (headerToolbar) headerToolbar.hidden = !showJobsUi;
  if (statsBar) statsBar.hidden = tab === "settings";
}

function setTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab").forEach((el) => {
    const on = el.dataset.tab === tab;
    el.classList.toggle("active", on);
    el.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.getElementById("view-board").hidden = tab !== "board";
  document.getElementById("view-board").classList.toggle("active", tab === "board");
  document.getElementById("view-jobs").hidden = tab !== "jobs";
  document.getElementById("view-jobs").classList.toggle("active", tab === "jobs");
  document.getElementById("view-settings").hidden = tab !== "settings";
  document.getElementById("view-settings").classList.toggle("active", tab === "settings");
  syncHeaderForTab(tab);
  if (tab !== "board") clearBoardSelection();
  closeDetail();
  render();
}

function getVisibleBoardJobIds() {
  const ids = [];
  for (const col of JT_KANBAN_COLUMNS) {
    for (const job of getFilteredJobs().filter((j) => j.columnId === col.id)) {
      ids.push(job.id);
    }
  }
  return ids;
}

function setJobSelected(jobId, selected, e = null) {
  if (!jobId) return;
  if (e?.shiftKey && lastBoardSelectId) {
    const order = getVisibleBoardJobIds();
    const a = order.indexOf(lastBoardSelectId);
    const b = order.indexOf(jobId);
    if (a >= 0 && b >= 0) {
      const [start, end] = a < b ? [a, b] : [b, a];
      for (let i = start; i <= end; i++) selectedJobIds.add(order[i]);
    } else {
      if (selected) selectedJobIds.add(jobId);
      else selectedJobIds.delete(jobId);
    }
  } else if (selected) {
    selectedJobIds.add(jobId);
  } else {
    selectedJobIds.delete(jobId);
  }
  lastBoardSelectId = jobId;
  syncBulkBar();
  updateSelectionUI();
}

function toggleJobSelected(jobId, e) {
  setJobSelected(jobId, !selectedJobIds.has(jobId), e);
}

function clearBoardSelection() {
  selectedJobIds.clear();
  lastBoardSelectId = null;
  syncBulkBar();
  updateSelectionUI();
}

function syncBulkBar() {
  const n = selectedJobIds.size;
  if (boardBulkBar) boardBulkBar.classList.toggle("hidden", n === 0);
  if (bulkCountEl) {
    bulkCountEl.textContent = `${n} job${n === 1 ? "" : "s"} selected`;
  }
}

function updateSelectionUI() {
  kanbanEl.querySelectorAll(".card").forEach((card) => {
    const on = selectedJobIds.has(card.dataset.jobId);
    card.classList.toggle("card-multi-selected", on);
    const input = card.querySelector(".card-select-input");
    if (input) input.checked = on;
  });
}

async function bulkMoveSelected() {
  const ids = [...selectedJobIds];
  if (!ids.length || !bulkMoveColumn) return;
  const columnId = bulkMoveColumn.value;
  const moved = await moveJobs(ids, columnId);
  clearBoardSelection();
  await refresh();
  showToast(moved ? `Moved ${moved} to ${columnLabel(columnId)}` : "No changes");
}

async function bulkDeleteSelected() {
  const ids = [...selectedJobIds];
  if (!ids.length) return;
  const label =
    ids.length === 1
      ? jobsCache.find((j) => j.id === ids[0])?.title
      : `${ids.length} jobs`;
  if (appSettings.confirmBeforeDelete) {
    if (!confirm(`Delete ${label || "selected jobs"} permanently?`)) return;
  }
  if (selectedJobId && ids.includes(selectedJobId)) closeDetail();
  await deleteJobs(ids);
  clearBoardSelection();
  await refresh();
  showToast(`Deleted ${ids.length} job${ids.length === 1 ? "" : "s"}`);
}

function highlightCard(jobId) {
  requestAnimationFrame(() => {
    const card = kanbanEl.querySelector(`.card[data-job-id="${jobId}"]`);
    if (!card) return;
    card.classList.add("card-highlight");
    card.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    setTimeout(() => card.classList.remove("card-highlight"), 2600);
  });
}

async function refresh() {
  jobsCache = await getJobs();
  const validIds = new Set(jobsCache.map((j) => j.id));
  for (const id of selectedJobIds) {
    if (!validIds.has(id)) selectedJobIds.delete(id);
  }
  renderStats();
  render();
  if (selectedJobId && jobsCache.some((j) => j.id === selectedJobId)) {
    showDetail(selectedJobId);
  } else if (selectedJobId) {
    closeDetail();
  }
}

function getFilteredJobs() {
  return filterJobs(jobsCache, searchQuery);
}

function renderStats() {
  const { total, byColumn } = getStats(jobsCache);
  const parts = [`<strong>${total}</strong> job${total === 1 ? "" : "s"}`];
  if (byColumn.saved) parts.push(`${byColumn.saved} saved`);
  if (byColumn.applied) parts.push(`${byColumn.applied} applied`);
  if (byColumn.interview) parts.push(`${byColumn.interview} interviewing`);
  statsBar.innerHTML = parts.join(" · ");
}

function render() {
  if (activeTab === "board") renderKanban();
  else if (activeTab === "jobs") renderJobList();
}

function nextColumn(columnId) {
  const i = JT_KANBAN_COLUMNS.findIndex((c) => c.id === columnId);
  if (i < 0 || i >= JT_KANBAN_COLUMNS.length - 1) return null;
  return JT_KANBAN_COLUMNS[i + 1];
}

function renderKanban() {
  const filtered = getFilteredJobs();
  let hint = document.getElementById("board-empty-hint");
  if (jobsCache.length === 0) {
    if (!hint) {
      hint = document.createElement("p");
      hint.id = "board-empty-hint";
      hint.className = "board-empty-hint";
      hint.textContent =
        "Your kanban board is below. Save a job from any job page (click the logo), then drag cards between columns as you apply.";
      kanbanEl.closest(".board-scroll")?.insertBefore(hint, kanbanEl.closest(".board-kanban-wrap"));
    }
  } else {
    hint?.remove();
  }

  kanbanEl.innerHTML = "";

  for (const col of JT_KANBAN_COLUMNS) {
    const columnJobs = filtered.filter((j) => j.columnId === col.id);
    const column = document.createElement("section");
    column.className = "column";
    column.dataset.columnId = col.id;
    applyColumnWidth(column, col.id);
    column.setAttribute("aria-label", `${col.label} column`);
    column.innerHTML = `
      <div class="column-header">
        <span>${col.label}</span>
        <div class="column-header-actions">
          <button type="button" class="column-add" data-action="add-column" data-column="${col.id}" aria-label="Add job to ${col.label}" title="Add job">+</button>
          <span class="column-count" aria-label="${columnJobs.length} jobs">${columnJobs.length}</span>
        </div>
      </div>
      <div class="column-cards jt-scroll-y" data-drop-zone="${col.id}"></div>
      <div
        class="column-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize ${col.label} column"
        tabindex="0"
      ></div>
    `;
    setupColumnResize(column.querySelector(".column-resize-handle"), column, col.id);
    const cardsEl = column.querySelector(".column-cards");
    setupDropZone(cardsEl, col.id);

    if (columnJobs.length === 0) {
      cardsEl.innerHTML = `<div class="empty-column">Drop jobs here or click +</div>`;
    } else {
      for (const job of columnJobs) {
        cardsEl.appendChild(createCard(job));
      }
    }
    kanbanEl.appendChild(column);
  }
  syncBulkBar();
  updateSelectionUI();
}

function renderJobList() {
  const filtered = sortJobs(getFilteredJobs(), sortSelect.value);
  jobListEl.innerHTML = "";

  if (filtered.length === 0) {
    jobListEl.innerHTML = `<li class="list-empty">No jobs match your search.</li>`;
    return;
  }

  for (const job of filtered) {
    const li = document.createElement("li");
    li.className = "list-item";
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute(
      "aria-label",
      `${job.title || "Untitled"} at ${job.company || "unknown company"}, ${columnLabel(job.columnId)}`
    );
    if (job.id === selectedJobId) li.classList.add("selected");
    li.innerHTML = `
      <div class="list-item-main">
        <div class="list-title">${escapeHtml(job.title || "Untitled")}</div>
        <div class="list-sub">${escapeHtml(job.company || "—")}</div>
      </div>
      <span class="list-badge">${escapeHtml(columnLabel(job.columnId))}</span>
    `;
    li.addEventListener("click", () => showDetail(job.id));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        showDetail(job.id);
      }
    });
    jobListEl.appendChild(li);
  }
}

function createCard(job) {
  const next = nextColumn(job.columnId);
  const card = document.createElement("article");
  card.className = "card";
  card.draggable = true;
  card.tabIndex = 0;
  card.dataset.jobId = job.id;
  card.setAttribute(
    "aria-label",
    `${job.title || "Untitled"} at ${job.company || "unknown company"}, ${columnLabel(job.columnId)}`
  );
  if (job.id === selectedJobId) card.classList.add("selected");
  if (selectedJobIds.has(job.id)) card.classList.add("card-multi-selected");

  card.innerHTML = `
    <label class="card-select">
      <input type="checkbox" class="card-select-input" aria-label="Select ${escapeAttr(job.title || "job")}" />
    </label>
    <div class="card-body">
      <div class="card-title">${escapeHtml(job.title || "Untitled")}</div>
      <div class="card-company">${escapeHtml(job.company || "—")}</div>
      <div class="card-tags">
        ${job.pay ? `<span class="tag">${escapeHtml(job.pay)}</span>` : ""}
        ${job.roleType ? `<span class="tag">${escapeHtml(job.roleType)}</span>` : ""}
        ${job.location ? `<span class="tag tag-loc">${escapeHtml(truncate(job.location, 40))}</span>` : ""}
      </div>
      <div class="card-meta">Updated ${escapeHtml(formatDate(job.updatedAt))}</div>
    </div>
    <div class="card-actions" role="group" aria-label="Job actions">
      <button type="button" class="card-btn" data-action="view" aria-label="View ${escapeAttr(job.title || "job")}">View</button>
      <button type="button" class="card-btn" data-action="edit" aria-label="Edit ${escapeAttr(job.title || "job")}">Edit</button>
      ${
        next
          ? `<button type="button" class="card-btn card-btn-move" data-action="move" data-column="${next.id}" aria-label="Move to ${next.label}">→ ${escapeHtml(next.label)}</button>`
          : ""
      }
      <button type="button" class="card-btn card-btn-danger" data-action="delete" aria-label="Delete ${escapeAttr(job.title || "job")}">Delete</button>
    </div>
  `;

  card.querySelector(".card-select")?.addEventListener("click", (e) => e.stopPropagation());

  card.querySelector(".card-body")?.addEventListener("click", (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      toggleJobSelected(job.id, e);
      return;
    }
    showDetail(job.id);
  });

  card.addEventListener("dragstart", (e) => {
    if (e.target.closest(".card-actions") || e.target.closest(".card-select")) {
      e.preventDefault();
      return;
    }
    let ids = [job.id];
    if (selectedJobIds.has(job.id) && selectedJobIds.size > 1) {
      ids = [...selectedJobIds];
    }
    dragJobId = job.id;
    card.classList.add("dragging");
    kanbanEl.querySelectorAll(".card").forEach((c) => {
      if (ids.includes(c.dataset.jobId)) c.classList.add("dragging");
    });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-jt-job-ids", JSON.stringify(ids));
    e.dataTransfer.setData("text/plain", job.id);
  });
  card.addEventListener("dragend", () => {
    kanbanEl.querySelectorAll(".card.dragging").forEach((c) => c.classList.remove("dragging"));
    dragJobId = null;
  });

  const selectInput = card.querySelector(".card-select-input");
  if (selectInput) selectInput.checked = selectedJobIds.has(job.id);

  return card;
}

function setupDropZone(el, columnId) {
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    el.classList.add("drag-over");
  });
  el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
  el.addEventListener("drop", async (e) => {
    e.preventDefault();
    el.classList.remove("drag-over");
    let ids = [];
    try {
      const raw = e.dataTransfer.getData("application/x-jt-job-ids");
      if (raw) ids = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    if (!ids.length) {
      const single = e.dataTransfer.getData("text/plain") || dragJobId;
      if (single) ids = [single];
    }
    if (!ids.length) return;
    const moved = await moveJobs(ids, columnId);
    clearBoardSelection();
    await refresh();
    showToast(
      moved
        ? `Moved ${moved} job${moved === 1 ? "" : "s"} to ${columnLabel(columnId)}`
        : "No changes"
    );
  });
}

async function moveJob(jobId, columnId) {
  await updateJob(jobId, { columnId });
  await refresh();
  showToast(`Moved to ${columnLabel(columnId)}`);
}

function showDetail(jobId) {
  const job = jobsCache.find((j) => j.id === jobId);
  if (!job) return;

  selectedJobId = jobId;
  jobDetailEl.classList.remove("hidden");

  detailStatus.value = job.columnId;
  if (job.url) {
    detailUrl.href = job.url;
    detailUrl.classList.remove("hidden");
  } else {
    detailUrl.classList.add("hidden");
  }

  detailBody.innerHTML = `
    <h2 class="detail-title">${escapeHtml(job.title || "Untitled")}</h2>
    <p class="detail-company">${escapeHtml(job.company || "—")}</p>
    <dl class="detail-fields">
      ${fieldRow("Status", columnLabel(job.columnId))}
      ${fieldRow("Location", job.location)}
      ${fieldRow("Pay", job.pay)}
      ${fieldRow("Type", job.roleType)}
      ${fieldRow("Added", formatDate(job.createdAt))}
      ${fieldRow("Updated", formatDate(job.updatedAt))}
    </dl>
    ${job.description ? `<section class="detail-section"><h3>About the role</h3><div class="detail-description desc-formatted">${descriptionToDisplayHtml(job.description)}</div></section>` : ""}
    ${job.notes ? `<section class="detail-section"><h3>Notes</h3><div class="detail-notes desc-formatted">${descriptionToDisplayHtml(job.notes)}</div></section>` : ""}
  `;

  render();
  jobDetailEl.querySelector("#detail-back")?.focus();
}

function fieldRow(label, value) {
  if (!value) return "";
  return `<div class="detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function closeDetail() {
  selectedJobId = null;
  jobDetailEl.classList.add("hidden");
  render();
}

async function confirmDeleteJob(title) {
  if (!appSettings.confirmBeforeDelete) return true;
  return confirm(`Delete "${title || "this job"}" permanently?`);
}

async function deleteJobById(jobId) {
  const job = jobsCache.find((j) => j.id === jobId);
  if (!(await confirmDeleteJob(job?.title))) return;
  await deleteJob(jobId);
  if (selectedJobId === jobId) closeDetail();
  await refresh();
  showToast("Job deleted");
}

async function deleteSelectedJob() {
  if (!selectedJobId) return;
  const job = jobsCache.find((j) => j.id === selectedJobId);
  if (!(await confirmDeleteJob(job?.title))) return;
  await deleteJob(selectedJobId);
  closeDetail();
  await refresh();
  showToast("Job deleted");
}

function openEditDialog(job, defaultColumn) {
  editingJobId = job?.id || null;
  const isNew = !job;
  document.getElementById("dialog-title").textContent = job ? "Edit job" : "Add job";
  document.getElementById("btn-delete").classList.toggle("hidden", !job);
  jobForm.title.value = job?.title || "";
  jobForm.company.value = job?.company || "";
  jobForm.location.value = job?.location || "";
  jobForm.pay.value = job?.pay || "";
  jobForm.roleType.value = job?.roleType || "";
  jobForm.url.value = job?.url || "";
  jobForm.description.value = job?.description || "";
  jobForm.notes.value = job?.notes || "";
  formColumn.value = job?.columnId || defaultColumn || "saved";
  jobDialog.showModal();
  if (isNew) formColumn.focus();
}

async function onJobFormSubmit(e) {
  e.preventDefault();
  const data = {
    title: jobForm.title.value.trim(),
    company: jobForm.company.value.trim(),
    location: jobForm.location.value.trim(),
    pay: jobForm.pay.value.trim(),
    roleType: jobForm.roleType.value.trim(),
    url: jobForm.url.value.trim(),
    description: jobForm.description.value.trim(),
    notes: jobForm.notes.value.trim(),
    columnId: formColumn.value,
  };
  if (editingJobId) {
    await updateJob(editingJobId, data);
    showToast("Job updated");
  } else {
    await addJob(data, data.columnId, { allowDuplicate: true });
    showToast("Job added");
  }
  jobDialog.close();
  editingJobId = null;
  await refresh();
}

async function onDeleteJob() {
  if (!editingJobId) return;
  const job = jobsCache.find((j) => j.id === editingJobId);
  if (!(await confirmDeleteJob(job?.title))) return;
  await deleteJob(editingJobId);
  jobDialog.close();
  editingJobId = null;
  closeDetail();
  await refresh();
  showToast("Job deleted");
}

function showToast(msg) {
  const el = document.getElementById("panel-toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("visible");
  setTimeout(() => el.classList.remove("visible"), 2200);
}

async function exportJobs() {
  const data = await exportData();
  const stamp = new Date().toISOString().slice(0, 10);
  downloadFile(`job-tracker-${stamp}.json`, JSON.stringify(data, null, 2), "application/json");
  downloadFile(`job-tracker-${stamp}.csv`, jobsToCsv(data.jobs), "text/csv");
  showToast("Exported JSON + CSV");
}

function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function importJobs(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const merge = confirm("Merge with existing jobs? Cancel = replace all.");
    const count = await importData(payload, merge ? "merge" : "replace");
    showToast(merge ? `Merged ${count} job(s)` : `Restored ${count} job(s)`);
    await refresh();
  } catch {
    alert("Invalid backup file.");
  }
}

function truncate(str, n) {
  return str.length > n ? str.slice(0, n) + "…" : str;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str).replace(/"/g, "&quot;");
}
