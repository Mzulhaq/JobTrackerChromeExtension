/**
 * Normalize scraped job description plain text and render readable HTML (XSS-safe).
 */

function normalizeDescriptionPlain(raw) {
  if (!raw) return "";
  let t = String(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Common run-on bullet patterns from innerText without block breaks
  t = t.replace(/\s+[•●◦▪]\s+/g, "\n• ");
  t = t.replace(/\s+(\d+[.)])\s+/g, "\n$1 ");
  t = t.replace(/([.!?])\s+(?=[A-Z][a-z]{2,})/g, "$1\n\n");

  t = t.replace(/[ \t]+\n/g, "\n");
  t = t.replace(/\n[ \t]+/g, "\n");
  t = t.replace(/[ \t]{2,}/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function extractDescriptionFromElement(el) {
  if (!el) return "";
  const clone = el.cloneNode(true);
  clone
    .querySelectorAll("script, style, nav, header, footer, button, svg, [aria-hidden='true']")
    .forEach((n) => n.remove());

  clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  clone.querySelectorAll("li").forEach((li) => {
    const prefix = li.closest("ol") ? `${li.parentElement ? [...li.parentElement.children].indexOf(li) + 1 : 1}. ` : "• ";
    if (!/^\s*[•●◦▪\d]/.test(li.textContent)) {
      li.prepend(prefix);
    }
    li.append("\n");
  });
  clone.querySelectorAll("p, div, h1, h2, h3, h4, h5, h6, tr").forEach((node) => {
    if (node.textContent.trim()) node.append("\n\n");
  });

  return normalizeDescriptionPlain(clone.textContent || clone.innerText || "");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isBulletLine(line) {
  return /^(\s*[-•*●◦▪]\s+|\s*\d+[.)]\s+)/.test(line);
}

function bulletContent(line) {
  return line.replace(/^(\s*[-•*●◦▪]\s+|\s*\d+[.)]\s+)/, "").trim();
}

function isOrderedBullet(line) {
  return /^\s*\d+[.)]\s+/.test(line);
}

function isSectionHeading(line, nextLine) {
  const t = line.trim();
  if (!t || t.length > 90) return false;
  if (/^about the (job|role)$/i.test(t)) return true;
  if (/^(requirements|responsibilities|qualifications|benefits|what you|who you|skills|experience|education|overview|summary|duties|nice to have|must have)/i.test(t)) {
    return true;
  }
  if (/[:：]$/.test(t) && t.length < 70) return true;
  if (t === t.toUpperCase() && /[A-Z]/.test(t) && t.length < 55 && !isBulletLine(t)) return true;
  if (nextLine && isBulletLine(nextLine.trim()) && t.length < 55) return true;
  return false;
}

/** Plain text → safe HTML with paragraphs, headings, and lists. */
function descriptionToDisplayHtml(raw) {
  const text = normalizeDescriptionPlain(raw);
  if (!text) return "";

  const lines = text.split("\n");
  const parts = [];
  let listItems = [];
  let listOrdered = false;
  let paraBuf = [];

  const flushPara = () => {
    if (!paraBuf.length) return;
    const p = paraBuf.join(" ").trim();
    if (p) parts.push(`<p class="desc-para">${escapeHtml(p)}</p>`);
    paraBuf = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    const tag = listOrdered ? "ol" : "ul";
    parts.push(
      `<${tag} class="desc-list">${listItems.map((li) => `<li>${escapeHtml(li)}</li>`).join("")}</${tag}>`
    );
    listItems = [];
    listOrdered = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      flushPara();
      flushList();
      continue;
    }

    if (isBulletLine(trimmed)) {
      flushPara();
      const ordered = isOrderedBullet(trimmed);
      if (listItems.length && listOrdered !== ordered) flushList();
      listOrdered = ordered;
      listItems.push(bulletContent(trimmed));
      continue;
    }

    flushList();

    if (isSectionHeading(trimmed, lines[i + 1])) {
      flushPara();
      parts.push(`<h4 class="desc-heading">${escapeHtml(trimmed.replace(/[:：]$/, ""))}</h4>`);
      continue;
    }

    paraBuf.push(trimmed);
  }

  flushPara();
  flushList();
  return parts.join("");
}

if (typeof globalThis !== "undefined") {
  globalThis.JTDescriptionFormat = {
    normalizeDescriptionPlain,
    extractDescriptionFromElement,
    descriptionToDisplayHtml,
  };
}
