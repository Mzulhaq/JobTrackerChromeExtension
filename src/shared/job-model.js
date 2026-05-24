import { JT_KANBAN_COLUMNS } from "./constants-module.js";

export const JOB_SCHEMA_VERSION = 1;

export function normalizeJob(raw) {
  const now = Date.now();
  return {
    id: raw.id || crypto.randomUUID(),
    columnId: JT_KANBAN_COLUMNS.some((c) => c.id === raw.columnId) ? raw.columnId : "saved",
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
    statusChangedAt: raw.statusChangedAt || raw.createdAt || now,
    title: String(raw.title || "").trim(),
    company: String(raw.company || "").trim(),
    location: String(raw.location || "").trim(),
    pay: String(raw.pay || "").trim(),
    roleType: String(raw.roleType || "").trim(),
    description: String(raw.description || "").trim(),
    url: String(raw.url || "").trim(),
    source: String(raw.source || "manual").trim(),
    notes: String(raw.notes || "").trim(),
  };
}

export function jobFromScrape(data, columnId = "saved") {
  return normalizeJob({ ...data, columnId, source: data.source || "scrape" });
}

export function findDuplicate(jobs, candidate) {
  const url = (candidate.url || "").split("?")[0].replace(/\/$/, "");
  const key = `${(candidate.title || "").toLowerCase()}|${(candidate.company || "").toLowerCase()}`;

  return jobs.find((j) => {
    if (url && j.url) {
      const ju = j.url.split("?")[0].replace(/\/$/, "");
      if (ju === url) return true;
    }
    const jk = `${(j.title || "").toLowerCase()}|${(j.company || "").toLowerCase()}`;
    return key.length > 3 && jk === key;
  });
}

export function getStats(jobs) {
  const byColumn = {};
  for (const col of JT_KANBAN_COLUMNS) {
    byColumn[col.id] = 0;
  }
  for (const job of jobs) {
    if (byColumn[job.columnId] !== undefined) byColumn[job.columnId]++;
    else byColumn.saved++;
  }
  return { total: jobs.length, byColumn };
}

export function sortJobs(jobs, sortBy = "updated") {
  const list = [...jobs];
  list.sort((a, b) => {
    if (sortBy === "title") return (a.title || "").localeCompare(b.title || "");
    if (sortBy === "company") return (a.company || "").localeCompare(b.company || "");
    if (sortBy === "created") return (b.createdAt || 0) - (a.createdAt || 0);
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  return list;
}

export function filterJobs(jobs, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return jobs;
  return jobs.filter((j) => {
    const blob = [j.title, j.company, j.location, j.pay, j.roleType, j.notes, j.description]
      .join(" ")
      .toLowerCase();
    return blob.includes(q);
  });
}

export function columnLabel(columnId) {
  return JT_KANBAN_COLUMNS.find((c) => c.id === columnId)?.label || columnId;
}

export function formatDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
