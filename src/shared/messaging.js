/**
 * Safe extension messaging with timeout (prevents infinite loading spinners).
 */
export async function sendMessage(payload, timeoutMs = 6000) {
  try {
    return await Promise.race([
      chrome.runtime.sendMessage(payload),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Message timeout")), timeoutMs)
      ),
    ]);
  } catch {
    return null;
  }
}

export async function highlightJobInPanel(jobId) {
  if (!jobId) return;
  await chrome.storage.local.set({ jt_highlight_job: jobId });
}

export async function consumeHighlightJobId() {
  const { jt_highlight_job: id } = await chrome.storage.local.get("jt_highlight_job");
  if (id) await chrome.storage.local.remove("jt_highlight_job");
  return id || null;
}
