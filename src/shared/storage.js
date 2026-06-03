import {
  JT_STORAGE_KEYS,
  JT_DEFAULT_SETTINGS,
  JT_KANBAN_COLUMNS,
} from "./constants-module.js";
import {
  normalizeJob,
  findDuplicate,
  getStats,
  sortJobs,
  filterJobs,
  JOB_SCHEMA_VERSION,
} from "./job-model.js";

/** Guard against malicious or accidental huge imports filling disk quota. */
export const JT_MAX_JOBS = 5000;
export const JT_MAX_IMPORT_BYTES = 8 * 1024 * 1024;

export async function getSettings() {
  const result = await chrome.storage.local.get(JT_STORAGE_KEYS.settings);
  return { ...JT_DEFAULT_SETTINGS, ...result[JT_STORAGE_KEYS.settings] };
}

export async function saveSettings(settings) {
  const current = await getSettings();
  const merged = { ...current, ...settings };
  await chrome.storage.local.set({ [JT_STORAGE_KEYS.settings]: merged });
  return merged;
}

export async function getJobs() {
  const result = await chrome.storage.local.get(JT_STORAGE_KEYS.jobs);
  const raw = result[JT_STORAGE_KEYS.jobs];
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeJob);
}

export async function saveJobs(jobs) {
  const normalized = jobs.map(normalizeJob);
  await chrome.storage.local.set({
    [JT_STORAGE_KEYS.jobs]: normalized,
    jt_meta: { schemaVersion: JOB_SCHEMA_VERSION, updatedAt: Date.now() },
  });
  return normalized;
}

export async function getJobById(jobId) {
  const jobs = await getJobs();
  return jobs.find((j) => j.id === jobId) || null;
}

export async function addJob(jobData, columnId = "saved", options = {}) {
  const jobs = await getJobs();
  if (jobs.length >= JT_MAX_JOBS && !options.allowDuplicate) {
    throw new Error(`Job limit reached (${JT_MAX_JOBS}). Export and delete old jobs to continue.`);
  }
  const candidate = normalizeJob({ ...jobData, columnId });

  if (!options.allowDuplicate) {
    const dup = findDuplicate(jobs, candidate);
    if (dup) return { job: dup, duplicate: true };
  }

  if (jobs.length >= JT_MAX_JOBS) {
    throw new Error(`Job limit reached (${JT_MAX_JOBS}). Export and delete old jobs to continue.`);
  }
  jobs.push(candidate);
  await saveJobs(jobs);
  return { job: candidate, duplicate: false };
}

export async function updateJob(jobId, updates) {
  const jobs = await getJobs();
  const index = jobs.findIndex((j) => j.id === jobId);
  if (index === -1) return null;

  const prev = jobs[index];
  const next = normalizeJob({
    ...prev,
    ...updates,
    id: jobId,
    updatedAt: Date.now(),
  });

  if (updates.columnId && updates.columnId !== prev.columnId) {
    next.statusChangedAt = Date.now();
  }

  jobs[index] = next;
  await saveJobs(jobs);
  return next;
}

export async function deleteJob(jobId) {
  const jobs = await getJobs();
  await saveJobs(jobs.filter((j) => j.id !== jobId));
}

export async function deleteJobs(jobIds) {
  const idSet = new Set(jobIds);
  if (!idSet.size) return 0;
  const jobs = await getJobs();
  const next = jobs.filter((j) => !idSet.has(j.id));
  await saveJobs(next);
  return jobs.length - next.length;
}

export async function moveJobs(jobIds, columnId) {
  const idSet = new Set(jobIds);
  if (!idSet.size) return 0;
  const jobs = await getJobs();
  const now = Date.now();
  let moved = 0;
  for (let i = 0; i < jobs.length; i++) {
    if (!idSet.has(jobs[i].id)) continue;
    const prev = jobs[i];
    if (prev.columnId === columnId) continue;
    jobs[i] = normalizeJob({
      ...prev,
      columnId,
      updatedAt: now,
      statusChangedAt: now,
    });
    moved++;
  }
  if (moved) await saveJobs(jobs);
  return moved;
}

export async function moveJob(jobId, columnId) {
  return updateJob(jobId, { columnId });
}

export async function clearAllJobs() {
  await saveJobs([]);
}

export async function exportData() {
  const jobs = await getJobs();
  const settings = await getSettings();
  return {
    schemaVersion: JOB_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    jobs,
    settings,
  };
}

export async function importData(payload, mode = "merge", options = {}) {
  if (!payload?.jobs || !Array.isArray(payload.jobs)) {
    throw new Error("Invalid backup file");
  }
  if (options.byteLength != null && options.byteLength > JT_MAX_IMPORT_BYTES) {
    throw new Error("Backup file is too large (max 8 MB).");
  }
  const incoming = payload.jobs.map(normalizeJob);
  if (incoming.length > JT_MAX_JOBS) {
    throw new Error(`Backup contains too many jobs (max ${JT_MAX_JOBS}).`);
  }
  if (mode === "replace") {
    await saveJobs(incoming);
    return incoming.length;
  }
  const existing = await getJobs();
  const merged = [...existing];
  let added = 0;
  for (const job of incoming) {
    if (merged.length >= JT_MAX_JOBS) {
      throw new Error(`Import would exceed ${JT_MAX_JOBS} jobs. Merged ${added} before stopping.`);
    }
    if (findDuplicate(merged, job)) continue;
    merged.push(job);
    added++;
  }
  await saveJobs(merged);
  return added;
}

export function jobsToCsv(jobs) {
  const headers = [
    "title",
    "company",
    "location",
    "pay",
    "roleType",
    "status",
    "url",
    "notes",
    "description",
    "source",
    "createdAt",
    "updatedAt",
  ];
  const escape = (v) => {
    const s = String(v ?? "").replace(/"/g, '""');
    return `"${s}"`;
  };
  const rows = jobs.map((j) =>
    [
      j.title,
      j.company,
      j.location,
      j.pay,
      j.roleType,
      JT_KANBAN_COLUMNS.find((c) => c.id === j.columnId)?.label || j.columnId,
      j.url,
      j.notes,
      j.description,
      j.source,
      j.createdAt,
      j.updatedAt,
    ]
      .map(escape)
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

export { getStats, sortJobs, filterJobs, findDuplicate, normalizeJob, JT_KANBAN_COLUMNS };
